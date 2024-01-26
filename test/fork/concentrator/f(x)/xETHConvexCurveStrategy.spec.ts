/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";

import { ConverterDeployment } from "@/contracts/Converter";
import { mockETHBalance, request_fork } from "@/test/utils";
import {
  ConverterRegistry,
  GeneralTokenConverter,
  IConvexBasicRewards,
  IConvexBooster,
  XETHConvexCurveStrategy,
} from "@/types/index";
import { CONVERTER_ROUTRS, TOKENS, selectDeployments } from "@/utils/index";
import { ZeroAddress } from "ethers";
import { MultisigDeployment } from "@/contracts/Multisig";

const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const DEPLOYER = "0x1111111111111111111111111111111111111111";

interface ITestCase {
  fork: number;
  holder: string;
  name: string;
  token: string;
  rewarder: string;
  amount: bigint;
  rewards: Array<string>;
}

const TestCases: Array<ITestCase> = [
  {
    fork: 18783460,
    holder: "0x310D5C8EE1512D5092ee4377061aE82E48973689",
    name: "MIM/3CRV",
    token: "0x5a6A4D54456819380173272A5E8E9B9904BdF41B",
    rewarder: "0xFd5AbF66b003881b88567EB9Ed9c651F14Dc4771",
    amount: ethers.parseEther("50000"),
    rewards: [TOKENS.CRV.address, TOKENS.SPELL.address, TOKENS.CVX.address],
  },
  {
    fork: 18783460,
    holder: "0xd8c2ee2FEfAc57F8B3cD63bE28D8F89bBBf5a5F2",
    name: "ETH/CNC",
    token: "0xF9835375f6b268743Ea0a54d742Aa156947f8C06",
    rewarder: "0x1A3c8B2F89B1C2593fa46C30ADA0b4E3D0133fF8",
    amount: ethers.parseEther("20"),
    rewards: [TOKENS.CRV.address, TOKENS.CNC.address, TOKENS.CVX.address],
  },
];

const MULTISIG = selectDeployments("mainnet", "Multisig").toObject() as MultisigDeployment;
const CONVERTER = selectDeployments("mainnet", "Converter").toObject() as ConverterDeployment;

describe("xETHConvexCurveStrategy.spec", async () => {
  for (const testcase of TestCases) {
    context(`test with token[${testcase.name}] in rewarder[${testcase.rewarder}]`, async () => {
      let deployer: HardhatEthersSigner;
      let manager: HardhatEthersSigner;
      let holder: HardhatEthersSigner;

      let registry: ConverterRegistry;
      let converter: GeneralTokenConverter;

      let booster: IConvexBooster;
      let strategy: XETHConvexCurveStrategy;
      let rewarder: IConvexBasicRewards;

      beforeEach(async () => {
        request_fork(testcase.fork, [DEPLOYER, testcase.holder, MULTISIG.Management]);
        deployer = await ethers.getSigner(DEPLOYER);
        manager = await ethers.getSigner(MULTISIG.Management);
        holder = await ethers.getSigner(testcase.holder);

        await mockETHBalance(holder.address, ethers.parseEther("10"));
        await mockETHBalance(manager.address, ethers.parseEther("10"));

        booster = await ethers.getContractAt("IConvexBooster", BOOSTER, deployer);
        rewarder = await ethers.getContractAt("IConvexBasicRewards", testcase.rewarder, deployer);
        registry = await ethers.getContractAt("ConverterRegistry", CONVERTER.ConverterRegistry, manager);
        converter = await ethers.getContractAt("GeneralTokenConverter", CONVERTER.GeneralTokenConverter, deployer);

        const xETHConvexCurveStrategy = await ethers.getContractFactory("xETHConvexCurveStrategy", deployer);
        strategy = (await xETHConvexCurveStrategy.deploy()) as XETHConvexCurveStrategy;

        await strategy.initialize(deployer.address, testcase.token, testcase.rewarder);
      });

      it("should initialize correctly", async () => {
        // from ConcentratorStrategyBase
        expect(await strategy.owner()).to.eq(deployer.address);
        expect(await strategy.operator()).to.eq(deployer.address);
        for (let i = 0; i < testcase.rewards.length; ++i) {
          expect(await strategy.rewards(i)).to.eq(testcase.rewards[i]);
          expect(await strategy.isTokenProtected(testcase.rewards[i])).to.eq(true);
        }
        await expect(strategy.rewards(testcase.rewards.length)).to.reverted;
        expect(await strategy.isTokenProtected(testcase.token)).to.eq(true);

        // from ConcentratorConvexCurveStrategy
        expect(await strategy.staker()).to.eq(testcase.rewarder);
        expect(await strategy.pid()).to.eq(await rewarder.pid());
        expect(await strategy.token()).to.eq(testcase.token);

        // from xETHConvexCurveStrategy
        expect(await strategy.name()).to.eq("xETHConvexCurveStrategy");

        // revert
        await expect(strategy.initialize(ZeroAddress, ZeroAddress, ZeroAddress)).to.revertedWith(
          "Initializable: contract is already initialized"
        );
      });

      it("should succeed when deposit", async () => {
        const token = await ethers.getContractAt("MockERC20", testcase.token, holder);
        await token.transfer(strategy.getAddress(), testcase.amount);
        await strategy.deposit(deployer.address, testcase.amount);
        expect(await rewarder.balanceOf(strategy.getAddress())).to.eq(testcase.amount);
      });

      it("should succeed when withdraw", async () => {
        const token = await ethers.getContractAt("MockERC20", testcase.token, holder);
        await token.transfer(strategy.getAddress(), testcase.amount);
        await strategy.deposit(deployer.address, testcase.amount);
        expect(await rewarder.balanceOf(strategy.getAddress())).to.eq(testcase.amount);

        const before = await token.balanceOf(deployer.address);
        await strategy.withdraw(deployer.address, testcase.amount);
        const after = await token.balanceOf(deployer.address);
        expect(after - before).to.eq(testcase.amount);
        expect(await rewarder.balanceOf(strategy.getAddress())).to.eq(0n);
      });

      it(`should succeed when harvest to stETH`, async () => {
        for (const reward of testcase.rewards) {
          const [symbol] = Object.entries(TOKENS).find(([_, x]) => x.address === reward)!;
          if (symbol === "stETH") continue;
          await registry.updateRoute(TOKENS[symbol].address, TOKENS.stETH.address, CONVERTER_ROUTRS[symbol].stETH);
        }

        const token = await ethers.getContractAt("MockERC20", testcase.token, holder);
        await token.transfer(strategy.getAddress(), testcase.amount);
        await strategy.deposit(deployer.address, testcase.amount);
        expect(await rewarder.balanceOf(strategy.getAddress())).to.eq(testcase.amount);

        await booster.earmarkRewards(await strategy.pid());
        const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
        // make sure 7 days passed, then the rewards will not increase anymore.
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
        await network.provider.send("evm_mine");

        const intermediateToken = await ethers.getContractAt("MockERC20", TOKENS.stETH.address, holder);
        const harvested = await strategy.harvest.staticCall(converter.getAddress(), TOKENS.stETH.address);
        expect(harvested).to.gt(0n);

        const before = await intermediateToken.balanceOf(deployer.address);
        await strategy.harvest(converter.getAddress(), TOKENS.stETH.address);
        const after = await intermediateToken.balanceOf(deployer.address);
        expect(after - before).to.closeTo(harvested, 10n);
      });
    });
  }
});

/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers, network } from "hardhat";

import {
  CvxCompounder,
  CvxStakingStrategy,
  ICvxRewardPool,
  MockERC20,
  ConverterRegistry,
  GeneralTokenConverter,
} from "@/types/index";
import { CONVERTER_ROUTRS, DEPLOYED_CONTRACTS, TOKENS } from "@/utils/index";

import { request_fork } from "../../../utils";

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const CVX_REWARD_POOL = "0xCF50b810E57Ac33B91dCF525C6ddd9881B139332";
const HOLDER = "0xf584F8728B874a6a5c7A8d4d387C9aae9172D621";
const FORK_HEIGHT = 18178555;

describe("CvxCompounder.spec", async () => {
  let deployer: HardhatEthersSigner;
  let holder: HardhatEthersSigner;

  let compounder: CvxCompounder;

  let registry: ConverterRegistry;
  let converter: GeneralTokenConverter;

  let strategy: CvxStakingStrategy;
  let staker: ICvxRewardPool;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [DEPLOYER, HOLDER]);
    deployer = await ethers.getSigner(DEPLOYER);
    holder = await ethers.getSigner(HOLDER);

    await deployer.sendTransaction({ to: holder.address, value: ethers.parseEther("10") });

    staker = await ethers.getContractAt("ICvxRewardPool", CVX_REWARD_POOL, deployer);

    const ConverterRegistry = await ethers.getContractFactory("ConverterRegistry", deployer);
    registry = await ConverterRegistry.deploy();

    const GeneralTokenConverter = await ethers.getContractFactory("GeneralTokenConverter", deployer);
    converter = await GeneralTokenConverter.deploy(registry.getAddress());

    const CvxCompounder = await ethers.getContractFactory("CvxCompounder", deployer);
    compounder = await CvxCompounder.deploy(0);

    const CvxStakingStrategy = await ethers.getContractFactory("CvxStakingStrategy", deployer);
    strategy = await CvxStakingStrategy.deploy(await compounder.getAddress(), await staker.getAddress());

    await compounder.initialize(
      "Aladdin CVX",
      "aCVX",
      DEPLOYED_CONTRACTS.Concentrator.PlatformFeeSpliter,
      ZeroAddress,
      converter.getAddress(),
      strategy.getAddress()
    );
    await registry.updateRoute(TOKENS.cvxCRV.address, TOKENS.WETH.address, CONVERTER_ROUTRS.cvxCRV.WETH);
    await registry.updateRoute(TOKENS.WETH.address, TOKENS.CVX.address, CONVERTER_ROUTRS.WETH.CVX);
    await converter.updateSupportedPoolTypes(1023);
  });

  context("harvest", async () => {
    let token: MockERC20;

    beforeEach(async () => {
      token = await ethers.getContractAt("MockERC20", TOKENS.CVX.address, holder);

      const amount = ethers.parseUnits("100000", 18);
      await token.approve(await compounder.getAddress(), amount);
      await compounder.connect(holder).deposit(amount, holder.address);
    });

    it(`should succeed`, async () => {
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      // make sure 7 days passed, then the rewards will not increase anymore.
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      await network.provider.send("evm_mine");

      const harvested = await compounder.harvest.staticCall(deployer.address, 0);
      expect(harvested).to.gt(0n);

      const before = await staker.balanceOf(await strategy.getAddress());
      await compounder.harvest(deployer.address, 0);
      const after = await staker.balanceOf(await strategy.getAddress());
      expect(after - before).to.eq(harvested);
      console.log("harvested:", ethers.formatUnits(harvested, 18));
    });
  });
});

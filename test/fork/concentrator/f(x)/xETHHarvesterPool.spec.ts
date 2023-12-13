/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";

import { ConverterDeployment } from "@/contracts/Converter";
import { mockETHBalance, request_fork } from "@/test/utils";
import {
  ConverterRegistry,
  GeneralTokenConverter,
  HarvesterPoolClaimGateway,
  HarvesterPoolEntryPoint,
  IConvexBasicRewards,
  IConvexBooster,
  XETHCompounder,
  XETHConvexCurveStrategy,
  XETHHarvesterPool,
  XETHHarvesterPoolFactory,
} from "@/types/index";
import { Action, CONVERTER_ROUTRS, PoolTypeV3, TOKENS, encodePoolHintV3, selectDeployments } from "@/utils/index";
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

describe("xETHHarvesterPool.spec", async () => {
  for (const testcase of TestCases) {
    context(`test with token[${testcase.name}] in rewarder[${testcase.rewarder}]`, async () => {
      let deployer: HardhatEthersSigner;
      let manager: HardhatEthersSigner;
      let holder: HardhatEthersSigner;

      let registry: ConverterRegistry;
      let converter: GeneralTokenConverter;

      let booster: IConvexBooster;
      let rewarder: IConvexBasicRewards;
      let compounder: XETHCompounder;
      let strategy: XETHConvexCurveStrategy;
      let pool: XETHHarvesterPool;

      let entryPoint: HarvesterPoolEntryPoint;
      let factory: XETHHarvesterPoolFactory;
      let claimer: HarvesterPoolClaimGateway;

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

        const xETHCompounder = await ethers.getContractFactory("xETHCompounder", deployer);
        compounder = (await xETHCompounder.deploy(0)) as XETHCompounder;

        const ConcentratorPlainStrategy = await ethers.getContractFactory("ConcentratorPlainStrategy", deployer);
        const compounderStrategy = await ConcentratorPlainStrategy.deploy(compounder.getAddress(), TOKENS.xETH.address);
        await compounder.initialize(
          "Aladdin xETH",
          "axETH",
          MULTISIG.Concentrator,
          deployer.address,
          converter.getAddress(),
          compounderStrategy.getAddress()
        );

        const xETHConvexCurveStrategy = await ethers.getContractFactory("xETHConvexCurveStrategy", deployer);
        const strategyTemplate = (await xETHConvexCurveStrategy.deploy()) as XETHConvexCurveStrategy;

        const xETHHarvesterPool = await ethers.getContractFactory("xETHHarvesterPool", deployer);
        const poolImpl = await xETHHarvesterPool.deploy(compounder.getAddress(), 86400 * 7);

        const UpgradeableBeacon = await ethers.getContractFactory("UpgradeableBeacon", deployer);
        const poolBeacon = await UpgradeableBeacon.deploy(poolImpl.getAddress());

        const HarvesterPoolEntryPoint = await ethers.getContractFactory("HarvesterPoolEntryPoint", deployer);
        entryPoint = await HarvesterPoolEntryPoint.deploy();
        await entryPoint.initialize();

        const HarvesterPoolClaimGateway = await ethers.getContractFactory("HarvesterPoolClaimGateway", deployer);
        claimer = await HarvesterPoolClaimGateway.deploy(converter.getAddress());

        const xETHHarvesterPoolFactory = await ethers.getContractFactory("xETHHarvesterPoolFactory", deployer);
        factory = (await xETHHarvesterPoolFactory.deploy(
          compounder.getAddress(),
          poolBeacon.getAddress(),
          entryPoint.getAddress(),
          strategyTemplate.getAddress(),
          claimer.getAddress()
        )) as XETHHarvesterPoolFactory;

        await entryPoint.grantRole(await entryPoint.POOL_FACTORY_ROLE(), factory.getAddress());

        await factory.create(await rewarder.pid());
        pool = (await ethers.getContractAt(
          "xETHHarvesterPool",
          await factory.getPoolByIndex(0),
          deployer
        )) as any as XETHHarvesterPool;

        strategy = (await ethers.getContractAt(
          "xETHConvexCurveStrategy",
          await pool.strategy(),
          deployer
        )) as any as XETHConvexCurveStrategy;
      });

      /*
      it("should initialize correctly", async () => {
        const token = await ethers.getContractAt("MockERC20", testcase.token, deployer);

        // from ConcentratorStrategyBase
        expect(await strategy.pendingOwner()).to.eq(deployer.address);
        await strategy.connect(deployer).acceptOwnership();
        expect(await strategy.operator()).to.eq(await pool.getAddress());
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

        // revert on reinitialize
        await expect(strategy.initialize(ZeroAddress, ZeroAddress, ZeroAddress)).to.revertedWith(
          "Initializable: contract is already initialized"
        );

        // check pool
        // from ConcentratorBaseV2
        expect(await pool.treasury()).to.eq("0x32366846354DB5C08e92b4Ab0D2a510b2a2380C8");
        expect(await pool.harvester()).to.eq("0xfa86aa141e45da5183B42792d99Dede3D26Ec515");
        expect(await pool.converter()).to.eq(await converter.getAddress());
        expect(await pool.getExpenseRatio()).to.eq(100000000n);
        expect(await pool.getHarvesterRatio()).to.eq(20000000n);
        expect(await pool.getWithdrawFeePercentage()).to.eq(0n);

        // from LinearRewardDistributor
        expect(await pool.periodLength()).to.eq(86400n * 7n);
        expect(await pool.rewardData()).to.deep.eq([0n, 0n, 0n, 0n]);
        expect(await pool.rewardToken()).to.eq(await compounder.getAddress());
        expect(await pool.pendingRewards()).to.deep.eq([0n, 0n]);

        // from ERC20Upgradeable
        expect(await pool.name()).to.eq((await token.name()) + " xETH Harvester");
        expect(await pool.symbol()).to.eq((await token.symbol()) + "-xETH-harvester");
        expect(await compounder.decimals()).to.eq(18);
        expect(await compounder.totalSupply()).to.eq(0n);

        // from ConcentratorHarvesterPoolBase
        expect(await pool.totalSupply()).to.eq(0n);
        expect(await pool.strategy()).to.eq(await strategy.getAddress());
        expect(await pool.stakingToken()).to.eq(testcase.token);
        expect(await pool.incentive()).to.eq(0n);
        expect(await pool.withdrawFeeAccumulated()).to.eq(0n);
        expect(await pool.claimer()).to.eq(await claimer.getAddress());
        expect(await pool.isActive()).to.eq(true);

        // revert on reinitialize
        await expect(pool.initialize(ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress)).to.revertedWith(
          "Initializable: contract is already initialized"
        );
      });

      it("should succeed when deposit", async () => {
        const token = await ethers.getContractAt("MockERC20", testcase.token, holder);
        await token.approve(pool.getAddress(), testcase.amount);
        await pool.connect(holder)["deposit(uint256,address)"](testcase.amount, deployer.address);
        expect(await rewarder.balanceOf(strategy.getAddress())).to.eq(testcase.amount);
      });

      it("should succeed when withdraw", async () => {
        const token = await ethers.getContractAt("MockERC20", testcase.token, holder);
        await token.approve(pool.getAddress(), testcase.amount);
        await pool.connect(holder)["deposit(uint256,address)"](testcase.amount, holder.address);
        expect(await rewarder.balanceOf(strategy.getAddress())).to.eq(testcase.amount);

        const before = await token.balanceOf(deployer.address);
        await pool.connect(holder)["withdraw(uint256,address)"](testcase.amount, deployer.address);
        const after = await token.balanceOf(deployer.address);
        expect(after - before).to.eq(testcase.amount);
        expect(await rewarder.balanceOf(strategy.getAddress())).to.eq(0n);
      });

      it("should succeed when harvest to stETH", async () => {
        await pool.updateHarvester(ZeroAddress);

        for (const reward of testcase.rewards) {
          const [symbol] = Object.entries(TOKENS).find(([_, x]) => x.address === reward)!;
          if (symbol === "stETH") continue;
          await registry.updateRoute(TOKENS[symbol].address, TOKENS.stETH.address, CONVERTER_ROUTRS[symbol].stETH);
        }

        const token = await ethers.getContractAt("MockERC20", testcase.token, holder);
        await token.approve(pool.getAddress(), testcase.amount);
        await pool.connect(holder)["deposit(uint256,address)"](testcase.amount, holder.address);
        expect(await rewarder.balanceOf(strategy.getAddress())).to.eq(testcase.amount);

        await booster.earmarkRewards(await strategy.pid());
        const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
        // make sure 7 days passed, then the rewards will not increase anymore.
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
        await network.provider.send("evm_mine");

        const harvested = await pool.connect(deployer).harvest.staticCall(deployer.getAddress(), 0n);
        expect(harvested).to.gt(0n);

        const before = await compounder.balanceOf(deployer.address);
        await pool.connect(deployer).harvest(deployer.getAddress(), 0n);
        const after = await compounder.balanceOf(deployer.address);
        expect(after - before).to.closeTo((harvested * 2n) / 100n, 10n);
      });
      */

      context("claimFor", async () => {
        beforeEach(async () => {
          await pool.updateHarvester(ZeroAddress);
          for (const reward of testcase.rewards) {
            const [symbol] = Object.entries(TOKENS).find(([_, x]) => x.address === reward)!;
            if (symbol === "stETH") continue;
            await registry.updateRoute(TOKENS[symbol].address, TOKENS.stETH.address, CONVERTER_ROUTRS[symbol].stETH);
          }

          const token = await ethers.getContractAt("MockERC20", testcase.token, holder);
          await token.approve(pool.getAddress(), testcase.amount);
          await pool.connect(holder)["deposit(uint256,address)"](testcase.amount, holder.address);
          expect(await rewarder.balanceOf(strategy.getAddress())).to.eq(testcase.amount);

          await booster.earmarkRewards(await strategy.pid());
          const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
          // make sure 7 days passed, then the rewards will not increase anymore.
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await network.provider.send("evm_mine");
          await pool.connect(deployer).harvest(deployer.getAddress(), 1n);

          // make sure 7 days passed, then the rewards will not increase anymore.
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 20]);
          await pool.checkpoint(holder.address);
        });

        it("should succeed to claim as xETH", async () => {
          await registry.updateRoute(await compounder.getAddress(), TOKENS.xETH.address, [
            encodePoolHintV3(await compounder.getAddress(), PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
          ]);
          const claimable = await pool.claimable(holder.address);
          expect(claimable).to.gt(0n);

          const amountOut = await claimer
            .connect(holder)
            .claimRewardsAs.staticCall([await pool.getAddress()], TOKENS.xETH.address, 0);
          await expect(
            claimer.connect(holder).claimRewardsAs([await pool.getAddress()], TOKENS.xETH.address, amountOut + 1n)
          ).to.revertedWithCustomError(claimer, "ErrorInsufficientConvertedAssets");
          const token = await ethers.getContractAt("MockERC20", TOKENS.xETH.address, deployer);
          const before = await token.balanceOf(holder.address);
          await expect(
            claimer.connect(holder).claimRewardsAs([await pool.getAddress()], TOKENS.xETH.address, amountOut)
          )
            .to.emit(pool, "Claim")
            .withArgs(holder.address, await converter.getAddress(), claimable);
          const after = await token.balanceOf(holder.address);
          expect(after - before).to.eq(amountOut);
        });

        it("should succeed to claim as ETH", async () => {
          await registry.updateRoute(await compounder.getAddress(), TOKENS.WETH.address, [
            encodePoolHintV3(await compounder.getAddress(), PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
            encodePoolHintV3(
              "0x053d5be7c653325b58d88b942fb2454f8ffd8673",
              PoolTypeV3.CurveCryptoPool,
              2,
              1,
              0,
              Action.Swap
            ),
          ]);
          const claimable = await pool.claimable(holder.address);
          expect(claimable).to.gt(0n);

          const amountOut = await claimer
            .connect(holder)
            .claimRewardsAs.staticCall([await pool.getAddress()], ZeroAddress, 0);
          expect(amountOut).to.gt(0n);
          await expect(
            claimer.connect(holder).claimRewardsAs([await pool.getAddress()], ZeroAddress, amountOut + 1n)
          ).to.revertedWithCustomError(claimer, "ErrorInsufficientConvertedAssets");
          const before = await ethers.provider.getBalance(holder.address);
          const tx = await claimer.connect(holder).claimRewardsAs([await pool.getAddress()], ZeroAddress, amountOut);
          const receipt = await tx.wait();
          await expect(tx)
            .to.emit(pool, "Claim")
            .withArgs(holder.address, await converter.getAddress(), claimable);
          const after = await ethers.provider.getBalance(holder.address);
          expect(after - before).to.eq(amountOut - receipt!.gasPrice * receipt!.gasUsed);
        });

        it("should succeed to claim as WETH", async () => {
          await registry.updateRoute(await compounder.getAddress(), TOKENS.WETH.address, [
            encodePoolHintV3(await compounder.getAddress(), PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
            encodePoolHintV3(
              "0x053d5be7c653325b58d88b942fb2454f8ffd8673",
              PoolTypeV3.CurveCryptoPool,
              2,
              1,
              0,
              Action.Swap
            ),
          ]);
          const claimable = await pool.claimable(holder.address);
          expect(claimable).to.gt(0n);

          const amountOut = await claimer
            .connect(holder)
            .claimRewardsAs.staticCall([await pool.getAddress()], TOKENS.WETH.address, 0);
          expect(amountOut).to.gt(0n);
          await expect(
            claimer.connect(holder).claimRewardsAs([await pool.getAddress()], TOKENS.WETH.address, amountOut + 1n)
          ).to.revertedWithCustomError(claimer, "ErrorInsufficientConvertedAssets");
          const token = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, deployer);
          const before = await token.balanceOf(holder.address);
          await expect(
            claimer.connect(holder).claimRewardsAs([await pool.getAddress()], TOKENS.WETH.address, amountOut)
          )
            .to.emit(pool, "Claim")
            .withArgs(holder.address, await converter.getAddress(), claimable);
          const after = await token.balanceOf(holder.address);
          expect(after - before).to.eq(amountOut);
        });
      });
    });
  }
});

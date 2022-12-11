/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers, network } from "hardhat";
import { TOKENS, VAULT_CONFIG, ZAP_ROUTES } from "../../scripts/utils";
import { AladdinZap, ManualCompoundingCurveGaugeStrategy, MockERC20, ICurveGauge } from "../../typechain";
import { MockConcentratorGeneralVault } from "../../typechain/contracts/mocks/MockConcentratorGeneralVault";
import { request_fork } from "../utils";

const UNDERLYING: {
  [name: string]: {
    fork: number;
    deployer: string;
    token: string;
    pool: string;
    gauge: string;
    holder: string;
    amount: string;
    rewards: string[];
    intermediates: string[];
  };
} = {
  frxeth: {
    fork: 16124420,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    token: "0xf43211935C781D5ca1a41d2041F397B8A7366C7A",
    pool: "0xa1F8A6807c402E4A15ef4EBa36528A3FED24E577",
    gauge: "0x2932a86df44Fe8D2A706d8e9c5d51c24883423F5",
    holder: "0xadd85e4abbb426e895f35e0a2576e22a9bbb7a57",
    amount: "10",
    rewards: ["CVX", "CRV"],
    intermediates: ["CRV"],
  },
  cvxfxs: {
    fork: 16124420,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    token: "0xF3A43307DcAFa93275993862Aae628fCB50dC768",
    pool: "0xd658A338613198204DCa1143Ac3F01A722b5d94A",
    gauge: "0xab1927160ec7414c6fa71763e2a9f3d107c126dd",
    holder: "0xdc88d12721f9ca1404e9e6e6389ae0abdd54fc6c",
    amount: "1000",
    rewards: ["CVX", "CRV", "FXS"],
    intermediates: ["WETH", "FXS"],
  },
};

describe("ConcentratorGeneralVault.CurveGauge.spec", async () => {
  const run = async (
    name: string,
    intermediate: string,
    config: {
      fork: number;
      deployer: string;
      token: string;
      pool: string;
      gauge: string;
      holder: string;
      amount: string;
      rewards: string[];
    }
  ) => {
    context(`vault[${name}] with intermediate[${intermediate}]`, async () => {
      let deployer: SignerWithAddress;
      let holder: SignerWithAddress;
      let zap: AladdinZap;
      let vault: MockConcentratorGeneralVault;
      let strategy: ManualCompoundingCurveGaugeStrategy;
      let rewardToken: MockERC20;
      let underlyingToken: MockERC20;
      let gauge: ICurveGauge;

      beforeEach(async () => {
        request_fork(config.fork, [config.deployer, config.holder]);
        deployer = await ethers.getSigner(config.deployer);
        holder = await ethers.getSigner(config.holder);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });

        rewardToken = await ethers.getContractAt("MockERC20", TOKENS[intermediate].address, deployer);
        underlyingToken = await ethers.getContractAt("MockERC20", config.token, holder);

        gauge = await ethers.getContractAt("ICurveGauge", config.gauge, deployer);

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        await zap.updatePoolTokens([config.pool], [config.token]);

        for (const [symbol, routes] of Object.entries(VAULT_CONFIG[name].deposit)) {
          await zap.updateRoute(TOKENS[symbol].address, config.token, routes);
        }

        const MockConcentratorGeneralVault = await ethers.getContractFactory("MockConcentratorGeneralVault", deployer);
        vault = await MockConcentratorGeneralVault.deploy();
        await vault.deployed();

        await vault.initialize(rewardToken.address, zap.address, deployer.address);

        const ManualCompoundingCurveGaugeStrategy = await ethers.getContractFactory(
          "ManualCompoundingCurveGaugeStrategy",
          deployer
        );
        strategy = await ManualCompoundingCurveGaugeStrategy.deploy();
        await strategy.deployed();

        await strategy.initialize(
          vault.address,
          config.token,
          config.gauge,
          config.rewards.map((symbol) => TOKENS[symbol].address)
        );
      });

      context("#deposit", async () => {
        const depositAmount = ethers.utils.parseEther(config.amount);

        beforeEach(async () => {
          await vault.addPool(config.token, strategy.address, 0, 0, 0);
        });

        it("should revert, when pool not exist", async () => {
          await expect(vault.deposit(1, deployer.address, 0)).to.revertedWith("Concentrator: pool not exist");
        });

        it("should revert, when pool paused", async () => {
          await vault.pausePoolDeposit(0, true);
          await expect(vault.deposit(0, deployer.address, 0)).to.revertedWith("Concentrator: deposit paused");
        });

        it("should revert, when deposit zero", async () => {
          await expect(vault.deposit(0, deployer.address, 0)).to.revertedWith("Concentrator: deposit zero amount");
        });

        it("should succeed when deposit some to self", async () => {
          await underlyingToken.approve(vault.address, depositAmount);
          const sharesOut = await vault.connect(holder).callStatic.deposit(0, holder.address, depositAmount);
          await expect(vault.connect(holder).deposit(0, holder.address, depositAmount))
            .to.emit(vault, "Deposit")
            .withArgs(0, holder.address, holder.address, depositAmount, sharesOut);
          expect(sharesOut).to.eq(depositAmount);
          expect(await vault.getTotalShare(0)).to.eq(sharesOut);
          expect(await vault.getTotalUnderlying(0)).to.eq(depositAmount);
          expect(await vault.getUserShare(0, holder.address)).to.eq(sharesOut);
          expect(await gauge.balanceOf(strategy.address)).to.eq(depositAmount);
        });

        it("should succeed when deposit some to other", async () => {
          await underlyingToken.approve(vault.address, depositAmount);
          const sharesOut = await vault.connect(holder).callStatic.deposit(0, deployer.address, depositAmount);
          await expect(vault.connect(holder).deposit(0, deployer.address, depositAmount))
            .to.emit(vault, "Deposit")
            .withArgs(0, holder.address, deployer.address, depositAmount, sharesOut);
          expect(sharesOut).to.eq(depositAmount);
          expect(await vault.getTotalShare(0)).to.eq(sharesOut);
          expect(await vault.getTotalUnderlying(0)).to.eq(depositAmount);
          expect(await vault.getUserShare(0, deployer.address)).to.eq(sharesOut);
          expect(await gauge.balanceOf(strategy.address)).to.eq(depositAmount);
        });

        it("should succeed when deposit all to self", async () => {
          const all = await underlyingToken.balanceOf(holder.address);
          await underlyingToken.approve(vault.address, all);
          const sharesOut = await vault.connect(holder).callStatic.deposit(0, holder.address, constants.MaxUint256);
          await expect(vault.connect(holder).deposit(0, holder.address, constants.MaxUint256))
            .to.emit(vault, "Deposit")
            .withArgs(0, holder.address, holder.address, all, sharesOut);
          expect(sharesOut).to.eq(all);
          expect(await vault.getTotalShare(0)).to.eq(sharesOut);
          expect(await vault.getTotalUnderlying(0)).to.eq(all);
          expect(await vault.getUserShare(0, holder.address)).to.eq(sharesOut);
          expect(await gauge.balanceOf(strategy.address)).to.eq(all);
        });

        it("should succeed when deposit all to other", async () => {
          const all = await underlyingToken.balanceOf(holder.address);
          await underlyingToken.approve(vault.address, all);
          const sharesOut = await vault.connect(holder).callStatic.deposit(0, deployer.address, constants.MaxUint256);
          await expect(vault.connect(holder).deposit(0, deployer.address, constants.MaxUint256))
            .to.emit(vault, "Deposit")
            .withArgs(0, holder.address, deployer.address, all, sharesOut);
          expect(sharesOut).to.eq(all);
          expect(await vault.getTotalShare(0)).to.eq(sharesOut);
          expect(await vault.getTotalUnderlying(0)).to.eq(all);
          expect(await vault.getUserShare(0, deployer.address)).to.eq(sharesOut);
          expect(await gauge.balanceOf(strategy.address)).to.eq(all);
        });
      });

      context("#withdraw", async () => {
        const depositAmount = ethers.utils.parseEther(config.amount).div(2);
        const depositShares = depositAmount;
        const totalShares = depositAmount.mul(2);

        beforeEach(async () => {
          await vault.addPool(config.token, strategy.address, 0, 0, 0);
          await underlyingToken.approve(vault.address, depositAmount.mul(2));
          await vault.connect(holder).deposit(0, holder.address, depositAmount);
          await vault.connect(holder).deposit(0, deployer.address, depositAmount);
        });

        it("should revert, when pool not exist", async () => {
          await expect(vault.withdraw(1, 0, deployer.address, deployer.address)).to.revertedWith(
            "Concentrator: pool not exist"
          );
        });

        it("should revert, when withdraw zero", async () => {
          await expect(vault.withdraw(0, 0, deployer.address, deployer.address)).to.revertedWith(
            "Concentrator: withdraw zero share"
          );
        });

        it("should revert, when exceeds allowance", async () => {
          await expect(vault.connect(holder).withdraw(0, 1, deployer.address, deployer.address)).to.revertedWith(
            "Concentrator: withdraw exceeds allowance"
          );
        });

        it("should revert, when pool paused", async () => {
          await vault.pausePoolWithdraw(0, true);
          await expect(vault.withdraw(0, 1, deployer.address, deployer.address)).to.revertedWith(
            "Concentrator: withdraw paused"
          );
        });

        for (const feeRatio of [0, 1e7, 1e8]) {
          it(`should succeed when withdraw some to self and withdraw fee is ${feeRatio}`, async () => {
            await vault.setWithdrawFeeForUser(0, holder.address, feeRatio);

            const withdrawShare = depositAmount.div(10);
            const amountOut = await vault
              .connect(holder)
              .callStatic.withdraw(0, withdrawShare, holder.address, holder.address);
            const before = await underlyingToken.balanceOf(holder.address);
            await expect(vault.connect(holder).withdraw(0, withdrawShare, holder.address, holder.address))
              .to.emit(vault, "Withdraw")
              .withArgs(0, holder.address, holder.address, holder.address, withdrawShare, amountOut);
            const after = await underlyingToken.balanceOf(holder.address);
            expect(after.sub(before)).to.eq(amountOut);
            expect(amountOut).to.eq(withdrawShare.sub(withdrawShare.mul(feeRatio).div(1e9)));
            expect(await vault.getTotalShare(0)).to.eq(totalShares.sub(withdrawShare));
            expect(await vault.getTotalUnderlying(0)).to.eq(depositAmount.mul(2).sub(amountOut));
            expect(await vault.getUserShare(0, holder.address)).to.eq(depositShares.sub(withdrawShare));
            expect(await gauge.balanceOf(strategy.address)).to.eq(depositAmount.mul(2).sub(amountOut));
          });

          it(`should succeed when withdraw some to other and withdraw fee is ${feeRatio}`, async () => {
            await vault.setWithdrawFeeForUser(0, holder.address, feeRatio);

            const withdrawShare = depositAmount.div(10);
            const amountOut = await vault
              .connect(holder)
              .callStatic.withdraw(0, withdrawShare, holder.address, holder.address);
            const before = await underlyingToken.balanceOf(deployer.address);
            await expect(vault.connect(holder).withdraw(0, withdrawShare, deployer.address, holder.address))
              .to.emit(vault, "Withdraw")
              .withArgs(0, holder.address, holder.address, deployer.address, withdrawShare, amountOut);
            const after = await underlyingToken.balanceOf(deployer.address);
            expect(after.sub(before)).to.eq(amountOut);
            expect(amountOut).to.eq(withdrawShare.sub(withdrawShare.mul(feeRatio).div(1e9)));
            expect(await vault.getTotalShare(0)).to.eq(totalShares.sub(withdrawShare));
            expect(await vault.getTotalUnderlying(0)).to.eq(depositAmount.mul(2).sub(amountOut));
            expect(await vault.getUserShare(0, holder.address)).to.eq(depositShares.sub(withdrawShare));
            expect(await gauge.balanceOf(strategy.address)).to.eq(depositAmount.mul(2).sub(amountOut));
          });

          it(`should succeed when withdraw all to self and withdraw fee is ${feeRatio}`, async () => {
            await vault.setWithdrawFeeForUser(0, holder.address, feeRatio);

            const withdrawShare = await vault.getUserShare(0, holder.address);
            const amountOut = await vault
              .connect(holder)
              .callStatic.withdraw(0, constants.MaxUint256, holder.address, holder.address);
            const before = await underlyingToken.balanceOf(holder.address);
            await expect(vault.connect(holder).withdraw(0, constants.MaxUint256, holder.address, holder.address))
              .to.emit(vault, "Withdraw")
              .withArgs(0, holder.address, holder.address, holder.address, withdrawShare, amountOut);
            const after = await underlyingToken.balanceOf(holder.address);
            expect(after.sub(before)).to.eq(amountOut);
            expect(amountOut).to.eq(withdrawShare.sub(withdrawShare.mul(feeRatio).div(1e9)));
            expect(await vault.getTotalShare(0)).to.eq(totalShares.sub(withdrawShare));
            expect(await vault.getTotalUnderlying(0)).to.eq(depositAmount.mul(2).sub(amountOut));
            expect(await vault.getUserShare(0, holder.address)).to.eq(depositShares.sub(withdrawShare));
            expect(await gauge.balanceOf(strategy.address)).to.eq(depositAmount.mul(2).sub(amountOut));
          });

          it(`should succeed when withdraw all to other and withdraw fee is ${feeRatio}`, async () => {
            await vault.setWithdrawFeeForUser(0, holder.address, feeRatio);

            const withdrawShare = await vault.getUserShare(0, holder.address);
            const amountOut = await vault
              .connect(holder)
              .callStatic.withdraw(0, constants.MaxUint256, holder.address, holder.address);
            const before = await underlyingToken.balanceOf(deployer.address);
            await expect(vault.connect(holder).withdraw(0, constants.MaxUint256, deployer.address, holder.address))
              .to.emit(vault, "Withdraw")
              .withArgs(0, holder.address, holder.address, deployer.address, withdrawShare, amountOut);
            const after = await underlyingToken.balanceOf(deployer.address);
            expect(after.sub(before)).to.eq(amountOut);
            expect(amountOut).to.eq(withdrawShare.sub(withdrawShare.mul(feeRatio).div(1e9)));
            expect(await vault.getTotalShare(0)).to.eq(totalShares.sub(withdrawShare));
            expect(await vault.getTotalUnderlying(0)).to.eq(depositAmount.mul(2).sub(amountOut));
            expect(await vault.getUserShare(0, holder.address)).to.eq(depositShares.sub(withdrawShare));
            expect(await gauge.balanceOf(strategy.address)).to.eq(depositAmount.mul(2).sub(amountOut));
          });
        }
      });

      context("harvest", async () => {
        const platform = "0x1000000000000000000000000000000000000001";
        const recipient = "0x1000000000000000000000000000000000000002";
        const depositAmount = ethers.utils.parseEther(config.amount).div(2);
        const totalShares = depositAmount.mul(2);

        beforeEach(async () => {
          await vault.updatePlatform(platform);
          // 20% platform, 10% bounty
          await vault.addPool(config.token, strategy.address, 0, 2e8, 1e8);
          await underlyingToken.approve(vault.address, depositAmount.mul(2));
          await vault.connect(holder).deposit(0, holder.address, depositAmount);
          await vault.connect(holder).deposit(0, deployer.address, depositAmount);

          for (const reward of config.rewards) {
            if (intermediate === reward) continue;
            await zap.updateRoute(
              TOKENS[reward].address,
              TOKENS[intermediate].address,
              ZAP_ROUTES[reward][intermediate]
            );
          }
        });

        it("should succeed, when rewards distribute intermediately", async () => {
          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          const tx = await vault.harvest(0, recipient, 0);
          const harvested_reward = await rewardToken.balanceOf(vault.address); // 70%
          const harvested_bounty = await rewardToken.balanceOf(recipient); // 10%
          const harvested_platform = await rewardToken.balanceOf(platform); // 20%
          expect(harvested_reward).to.gt(constants.Zero);
          expect(harvested_reward).to.closeToBn(harvested_bounty.mul(7), 100);
          expect(harvested_platform).to.closeToBn(harvested_bounty.mul(2), 100);

          await expect(tx)
            .to.emit(vault, "Harvest")
            .withArgs(
              0,
              deployer.address,
              recipient,
              harvested_reward.add(harvested_bounty).add(harvested_platform),
              harvested_platform,
              harvested_bounty
            );

          const precision = BigNumber.from(10).pow(18);
          expect((await vault.poolInfo(0)).reward.accRewardPerShare).to.eq(
            harvested_reward.mul(precision).div(totalShares)
          );
        });

        it("should succeed, when rewards distribute linear in 7 days", async () => {
          await vault.updateRewardPeriod(0, 86400 * 7);

          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          const tx = await vault.harvest(0, recipient, 0);
          const harvested_reward = await rewardToken.balanceOf(vault.address); // 70%
          const harvested_bounty = await rewardToken.balanceOf(recipient); // 10%
          const harvested_platform = await rewardToken.balanceOf(platform); // 20%
          expect(harvested_reward).to.gt(constants.Zero);
          expect(harvested_reward).to.closeToBn(harvested_bounty.mul(7), 100);
          expect(harvested_platform).to.closeToBn(harvested_bounty.mul(2), 100);

          await expect(tx)
            .to.emit(vault, "Harvest")
            .withArgs(
              0,
              deployer.address,
              recipient,
              harvested_reward.add(harvested_bounty).add(harvested_platform),
              harvested_platform,
              harvested_bounty
            );

          const precision = BigNumber.from(10).pow(18);
          expect((await vault.poolInfo(0)).reward.accRewardPerShare).to.eq(constants.Zero);
          expect((await vault.poolInfo(0)).reward.rate).to.eq(harvested_reward.div(86400 * 7));
          expect((await vault.poolInfo(0)).reward.finishAt).to.eq(timestamp + 86400 * 7 * 2);
          expect((await vault.poolInfo(0)).reward.lastUpdate).to.eq(timestamp + 86400 * 7);

          // 3 days passed
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 10]);
          await vault.checkpoint(0, deployer.address);
          expect((await vault.poolInfo(0)).reward.accRewardPerShare).to.eq(
            harvested_reward
              .div(86400 * 7)
              .mul(86400 * 3)
              .mul(precision)
              .div(totalShares)
          );
          expect((await vault.poolInfo(0)).reward.rate).to.eq(harvested_reward.div(86400 * 7));
          expect((await vault.poolInfo(0)).reward.finishAt).to.eq(timestamp + 86400 * 7 * 2);
          expect((await vault.poolInfo(0)).reward.lastUpdate).to.eq(timestamp + 86400 * 10);
        });
      });

      context("#claim", async () => {
        const platform = "0x1000000000000000000000000000000000000001";
        const recipient = "0x1000000000000000000000000000000000000002";
        const depositAmount = ethers.utils.parseEther(config.amount).div(10);

        beforeEach(async () => {
          await vault.updatePlatform(platform);
          // 20% platform, 10% bounty
          await vault.addPool(config.token, strategy.address, 0, 2e8, 1e8);
          await underlyingToken.approve(vault.address, depositAmount.mul(10));
          await vault.connect(holder).deposit(0, holder.address, depositAmount.mul(2)); // 20%
          await vault.connect(holder).deposit(0, deployer.address, depositAmount.mul(5)); // 50%
          await vault.connect(holder).deposit(0, recipient, depositAmount.mul(3)); // 30%

          for (const reward of config.rewards) {
            if (intermediate === reward) continue;
            await zap.updateRoute(
              TOKENS[reward].address,
              TOKENS[intermediate].address,
              ZAP_ROUTES[reward][intermediate]
            );
          }
        });

        it("should succeed, when distribute intermediately", async () => {
          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await vault.harvest(0, recipient, 0);
          const harvested_reward = await rewardToken.balanceOf(vault.address);

          let before = await rewardToken.balanceOf(holder.address);
          await expect(vault.connect(holder).claim(0, holder.address, 0, rewardToken.address)).to.emit(vault, "Claim");
          let after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(2).div(10), 1e6);

          before = await rewardToken.balanceOf(holder.address);
          await expect(vault.connect(deployer).claim(0, holder.address, 0, rewardToken.address)).to.emit(
            vault,
            "Claim"
          );
          after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(5).div(10), 1e6);
        });

        it("should succeed, when distribute linear in 7 days", async () => {
          await vault.updateRewardPeriod(0, 86400 * 7);

          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await vault.harvest(0, recipient, 0);
          const harvested_reward = await rewardToken.balanceOf(vault.address);

          let before = await rewardToken.balanceOf(holder.address);
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * (7 + 3.5)]);
          await expect(vault.connect(holder).claim(0, holder.address, 0, rewardToken.address)).to.emit(vault, "Claim");
          let after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(2).div(10).div(2), 1e6);

          before = await rewardToken.balanceOf(holder.address);
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * (7 + 4)]);
          await expect(vault.connect(deployer).claim(0, holder.address, 0, rewardToken.address)).to.emit(
            vault,
            "Claim"
          );
          after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(5).div(10).mul(4).div(7), 1e6);
        });
      });

      context("#claimMulti", async () => {
        const platform = "0x1000000000000000000000000000000000000001";
        const recipient = "0x1000000000000000000000000000000000000002";
        const depositAmount = ethers.utils.parseEther(config.amount).div(10);

        beforeEach(async () => {
          await vault.updatePlatform(platform);
          // 20% platform, 10% bounty
          await vault.addPool(config.token, strategy.address, 0, 2e8, 1e8);
          await underlyingToken.approve(vault.address, depositAmount.mul(10));
          await vault.connect(holder).deposit(0, holder.address, depositAmount.mul(2)); // 20%
          await vault.connect(holder).deposit(0, deployer.address, depositAmount.mul(5)); // 50%
          await vault.connect(holder).deposit(0, recipient, depositAmount.mul(3)); // 30%

          for (const reward of config.rewards) {
            if (intermediate === reward) continue;
            await zap.updateRoute(
              TOKENS[reward].address,
              TOKENS[intermediate].address,
              ZAP_ROUTES[reward][intermediate]
            );
          }
        });

        it("should succeed, when distribute intermediately", async () => {
          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await vault.harvest(0, recipient, 0);
          const harvested_reward = await rewardToken.balanceOf(vault.address);

          let before = await rewardToken.balanceOf(holder.address);
          await expect(vault.connect(holder).claimMulti([0, 0], holder.address, 0, rewardToken.address)).to.emit(
            vault,
            "Claim"
          );
          let after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(2).div(10), 1e6);

          before = await rewardToken.balanceOf(holder.address);
          await expect(vault.connect(deployer).claimMulti([0], holder.address, 0, rewardToken.address)).to.emit(
            vault,
            "Claim"
          );
          after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(5).div(10), 1e6);
        });

        it("should succeed, when distribute linear in 7 days", async () => {
          await vault.updateRewardPeriod(0, 86400 * 7);

          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await vault.harvest(0, recipient, 0);
          const harvested_reward = await rewardToken.balanceOf(vault.address);

          let before = await rewardToken.balanceOf(holder.address);
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * (7 + 3.5)]);
          await expect(vault.connect(holder).claimMulti([0, 0], holder.address, 0, rewardToken.address)).to.emit(
            vault,
            "Claim"
          );
          let after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(2).div(10).div(2), 1e6);

          before = await rewardToken.balanceOf(holder.address);
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * (7 + 4)]);
          await expect(vault.connect(deployer).claimMulti([0], holder.address, 0, rewardToken.address)).to.emit(
            vault,
            "Claim"
          );
          after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(5).div(10).mul(4).div(7), 1e6);
        });
      });

      context("#claimAll", async () => {
        const platform = "0x1000000000000000000000000000000000000001";
        const recipient = "0x1000000000000000000000000000000000000002";
        const depositAmount = ethers.utils.parseEther(config.amount).div(10);

        beforeEach(async () => {
          await vault.updatePlatform(platform);
          // 20% platform, 10% bounty
          await vault.addPool(config.token, strategy.address, 0, 2e8, 1e8);
          await underlyingToken.approve(vault.address, depositAmount.mul(10));
          await vault.connect(holder).deposit(0, holder.address, depositAmount.mul(2)); // 20%
          await vault.connect(holder).deposit(0, deployer.address, depositAmount.mul(5)); // 50%
          await vault.connect(holder).deposit(0, recipient, depositAmount.mul(3)); // 30%

          for (const reward of config.rewards) {
            if (intermediate === reward) continue;
            await zap.updateRoute(
              TOKENS[reward].address,
              TOKENS[intermediate].address,
              ZAP_ROUTES[reward][intermediate]
            );
          }
        });

        it("should succeed, when distribute intermediately", async () => {
          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await vault.harvest(0, recipient, 0);
          const harvested_reward = await rewardToken.balanceOf(vault.address);

          let before = await rewardToken.balanceOf(holder.address);
          await expect(vault.connect(holder).claimAll(0, holder.address, rewardToken.address)).to.emit(vault, "Claim");
          let after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(2).div(10), 1e6);

          before = await rewardToken.balanceOf(holder.address);
          await expect(vault.connect(deployer).claimAll(0, holder.address, rewardToken.address)).to.emit(
            vault,
            "Claim"
          );
          after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(5).div(10), 1e6);
        });

        it("should succeed, when distribute linear in 7 days", async () => {
          await vault.updateRewardPeriod(0, 86400 * 7);

          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await vault.harvest(0, recipient, 0);
          const harvested_reward = await rewardToken.balanceOf(vault.address);

          let before = await rewardToken.balanceOf(holder.address);
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * (7 + 3.5)]);
          await expect(vault.connect(holder).claimAll(0, holder.address, rewardToken.address)).to.emit(vault, "Claim");
          let after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(2).div(10).div(2), 1e6);

          before = await rewardToken.balanceOf(holder.address);
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * (7 + 4)]);
          await expect(vault.connect(deployer).claimAll(0, holder.address, rewardToken.address)).to.emit(
            vault,
            "Claim"
          );
          after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(5).div(10).mul(4).div(7), 1e6);
        });
      });
    });
  };

  for (const [name, config] of Object.entries(UNDERLYING)) {
    for (const intermediate of config.intermediates) {
      run(name, intermediate, config);
    }
  }
});

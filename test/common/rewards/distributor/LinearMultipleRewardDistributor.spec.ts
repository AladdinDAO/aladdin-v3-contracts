import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MockERC20, MockLinearMultipleRewardDistributor } from "@/types/index";
import { expect } from "chai";
import { MaxUint256, ZeroAddress, ZeroHash, toBigInt } from "ethers";
import { ethers, network } from "hardhat";

describe("LinearMultipleRewardDistributor.spec", async () => {
  context("constructor", async () => {
    it("should revert, when period length is invalid", async () => {
      const [deployer] = await ethers.getSigners();
      const MockLinearMultipleRewardDistributor = await ethers.getContractFactory(
        "MockLinearMultipleRewardDistributor",
        deployer
      );

      await expect(MockLinearMultipleRewardDistributor.deploy(1)).to.revertedWith("invalid period length");
      await expect(MockLinearMultipleRewardDistributor.deploy(86400 - 1)).to.revertedWith("invalid period length");
      await expect(MockLinearMultipleRewardDistributor.deploy(86400 * 28 + 1)).to.revertedWith("invalid period length");
    });

    for (const periodLength of [0, 86400, 86400 * 7, 86400 * 14, 86400 * 28]) {
      it(`should succeed with period[${periodLength}]`, async () => {
        const [deployer] = await ethers.getSigners();
        const MockLinearMultipleRewardDistributor = await ethers.getContractFactory(
          "MockLinearMultipleRewardDistributor",
          deployer
        );
        const distributor = await MockLinearMultipleRewardDistributor.deploy(periodLength);
        expect(await distributor.periodLength()).to.eq(periodLength);
      });
    }
  });

  for (const periodLength of [0, 86400, 86400 * 7, 86400 * 14, 86400 * 28]) {
    let deployer: HardhatEthersSigner;
    let manager: HardhatEthersSigner;
    let holder0: HardhatEthersSigner;
    let holder1: HardhatEthersSigner;
    let holder2: HardhatEthersSigner;

    let token0: MockERC20;
    let token1: MockERC20;
    let token2: MockERC20;
    let distributor: MockLinearMultipleRewardDistributor;

    context(`run with period[${periodLength}]`, async () => {
      beforeEach(async () => {
        [deployer, manager, holder0, holder1, holder2] = await ethers.getSigners();
        const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
        const MockLinearMultipleRewardDistributor = await ethers.getContractFactory(
          "MockLinearMultipleRewardDistributor",
          deployer
        );

        token0 = await MockERC20.deploy("R0", "R0", 18);
        token1 = await MockERC20.deploy("R1", "R1", 18);
        token2 = await MockERC20.deploy("R2", "R2", 18);
        distributor = await MockLinearMultipleRewardDistributor.deploy(periodLength);
        await distributor.initialize();
      });

      context("initialization", async () => {
        it("should initialize correctly", async () => {
          expect(await distributor.periodLength()).to.eq(periodLength);
          expect(await distributor.getActiveRewardTokens()).to.deep.eq([]);
          expect(await distributor.getHistoricalRewardTokens()).to.deep.eq([]);
          expect(await distributor.hasRole(ZeroHash, deployer.address)).to.eq(true);
        });
      });

      context("reward manage", async () => {
        beforeEach(async () => {
          await distributor.grantRole(await distributor.REWARD_MANAGER_ROLE(), manager.address);
        });

        context("#registerRewardToken", async () => {
          it("should revert when non-manager call", async () => {
            const role = await distributor.REWARD_MANAGER_ROLE();
            await expect(distributor.registerRewardToken(await token0.getAddress(), holder0.address)).to.revertedWith(
              "AccessControl: account " + deployer.address.toLowerCase() + " is missing role " + role
            );
          });

          it("should revert, when distributor is zero", async () => {
            await expect(
              distributor.connect(manager).registerRewardToken(await token0.getAddress(), ZeroAddress)
            ).to.revertedWithCustomError(distributor, "RewardDistributorIsZero");
          });

          it("should revert, when duplicated rewards", async () => {
            await expect(distributor.connect(manager).registerRewardToken(await token0.getAddress(), holder0.address))
              .to.emit(distributor, "RegisterRewardToken")
              .withArgs(await token0.getAddress(), holder0.address);
            await expect(
              distributor.connect(manager).registerRewardToken(await token0.getAddress(), holder0.address)
            ).to.revertedWithCustomError(distributor, "DuplicatedRewardToken");
          });

          it("should succeed when add new tokens", async () => {
            await expect(distributor.connect(manager).registerRewardToken(await token0.getAddress(), holder0.address))
              .to.emit(distributor, "RegisterRewardToken")
              .withArgs(await token0.getAddress(), holder0.address);
            expect(await distributor.getActiveRewardTokens()).to.deep.eq([await token0.getAddress()]);
            expect(await distributor.distributors(await token0.getAddress())).to.eq(holder0.address);
            await expect(distributor.connect(manager).registerRewardToken(await token1.getAddress(), holder1.address))
              .to.emit(distributor, "RegisterRewardToken")
              .withArgs(await token1.getAddress(), holder1.address);
            expect(await distributor.distributors(await token1.getAddress())).to.eq(holder1.address);
            expect(await distributor.getActiveRewardTokens()).to.deep.eq([
              await token0.getAddress(),
              await token1.getAddress(),
            ]);
            await expect(distributor.connect(manager).registerRewardToken(await token2.getAddress(), holder2.address))
              .to.emit(distributor, "RegisterRewardToken")
              .withArgs(await token2.getAddress(), holder2.address);
            expect(await distributor.distributors(await token2.getAddress())).to.eq(holder2.address);
            expect(await distributor.getActiveRewardTokens()).to.deep.eq([
              await token0.getAddress(),
              await token1.getAddress(),
              await token2.getAddress(),
            ]);
          });

          it("should succeed when remove token from historical", async () => {
            await expect(distributor.connect(manager).registerRewardToken(await token0.getAddress(), holder0.address))
              .to.emit(distributor, "RegisterRewardToken")
              .withArgs(await token0.getAddress(), holder0.address);
            expect(await distributor.getActiveRewardTokens()).to.deep.eq([await token0.getAddress()]);
            expect(await distributor.distributors(await token0.getAddress())).to.eq(holder0.address);
            await expect(distributor.connect(manager).registerRewardToken(await token1.getAddress(), holder1.address))
              .to.emit(distributor, "RegisterRewardToken")
              .withArgs(await token1.getAddress(), holder1.address);
            expect(await distributor.distributors(await token1.getAddress())).to.eq(holder1.address);
            expect(await distributor.getActiveRewardTokens()).to.deep.eq([
              await token0.getAddress(),
              await token1.getAddress(),
            ]);
            await expect(distributor.connect(manager).registerRewardToken(await token2.getAddress(), holder2.address))
              .to.emit(distributor, "RegisterRewardToken")
              .withArgs(await token2.getAddress(), holder2.address);
            expect(await distributor.distributors(await token2.getAddress())).to.eq(holder2.address);
            expect(await distributor.getActiveRewardTokens()).to.deep.eq([
              await token0.getAddress(),
              await token1.getAddress(),
              await token2.getAddress(),
            ]);

            await expect(distributor.connect(manager).unregisterRewardToken(await token0.getAddress()))
              .to.emit(distributor, "UnregisterRewardToken")
              .withArgs(await token0.getAddress());
            expect(await distributor.getActiveRewardTokens()).to.deep.eq([
              await token2.getAddress(),
              await token1.getAddress(),
            ]);
            expect(await distributor.getHistoricalRewardTokens()).to.deep.eq([await token0.getAddress()]);
            expect(await distributor.distributors(await token0.getAddress())).to.eq(ZeroAddress);
          });
        });

        context("#updateRewardDistributor", async () => {
          beforeEach(async () => {
            await distributor.connect(manager).registerRewardToken(await token0.getAddress(), holder0.address);
          });

          it("should revert when non-manager call", async () => {
            const role = await distributor.REWARD_MANAGER_ROLE();
            await expect(distributor.updateRewardDistributor(ZeroAddress, ZeroAddress)).to.revertedWith(
              "AccessControl: account " + deployer.address.toLowerCase() + " is missing role " + role
            );
          });

          it("should revert, when distributor is zero", async () => {
            await expect(
              distributor.connect(manager).updateRewardDistributor(await token0.getAddress(), ZeroAddress)
            ).to.revertedWithCustomError(distributor, "RewardDistributorIsZero");
          });

          it("should revert, when reward is not active", async () => {
            await expect(
              distributor.connect(manager).updateRewardDistributor(await token1.getAddress(), holder1.address)
            ).to.revertedWithCustomError(distributor, "NotActiveRewardToken");
          });

          it("should succeed", async () => {
            expect(await distributor.distributors(await token0.getAddress())).to.eq(holder0.address);
            await expect(
              distributor.connect(manager).updateRewardDistributor(await token0.getAddress(), holder1.address)
            )
              .to.emit(distributor, "UpdateRewardDistributor")
              .withArgs(await token0.getAddress(), holder0.address, holder1.address);
            expect(await distributor.distributors(await token0.getAddress())).to.eq(holder1.address);
          });
        });

        context("#unregisterRewardToken", async () => {
          beforeEach(async () => {
            await distributor.connect(manager).registerRewardToken(await token0.getAddress(), holder0.address);
            await distributor.connect(manager).registerRewardToken(await token1.getAddress(), holder1.address);
            await distributor.connect(manager).registerRewardToken(await token2.getAddress(), holder2.address);
          });

          it("should revert when non-manager call", async () => {
            const role = await distributor.REWARD_MANAGER_ROLE();
            await expect(distributor.unregisterRewardToken(ZeroAddress)).to.revertedWith(
              "AccessControl: account " + deployer.address.toLowerCase() + " is missing role " + role
            );
          });

          it("should revert, when reward is not active", async () => {
            await distributor.connect(manager).unregisterRewardToken(await token0.getAddress());
            await expect(
              distributor.connect(manager).unregisterRewardToken(await token0.getAddress())
            ).to.revertedWithCustomError(distributor, "NotActiveRewardToken");
          });

          if (periodLength > 0) {
            it("should revert, when reward distribution is not over", async () => {
              await token0.mint(holder0.address, ethers.parseEther("1000"));
              await token0.connect(holder0).approve(await distributor.getAddress(), MaxUint256);
              await distributor.connect(holder0).depositReward(await token0.getAddress(), ethers.parseEther("1000"));
              await expect(
                distributor.connect(manager).unregisterRewardToken(await token0.getAddress())
              ).to.revertedWithCustomError(distributor, "RewardDistributionNotFinished");
            });
          }

          it("should succeed", async () => {
            await expect(distributor.connect(manager).unregisterRewardToken(await token0.getAddress()))
              .to.emit(distributor, "UnregisterRewardToken")
              .withArgs(await token0.getAddress());
            expect(await distributor.distributors(await token0.getAddress())).to.eq(ZeroAddress);
            expect(await distributor.getActiveRewardTokens()).to.deep.eq([
              await token2.getAddress(),
              await token1.getAddress(),
            ]);
            expect(await distributor.getHistoricalRewardTokens()).to.deep.eq([await token0.getAddress()]);

            await expect(distributor.connect(manager).unregisterRewardToken(await token1.getAddress()))
              .to.emit(distributor, "UnregisterRewardToken")
              .withArgs(await token1.getAddress());
            expect(await distributor.distributors(await token1.getAddress())).to.eq(ZeroAddress);
            expect(await distributor.getActiveRewardTokens()).to.deep.eq([await token2.getAddress()]);
            expect(await distributor.getHistoricalRewardTokens()).to.deep.eq([
              await token0.getAddress(),
              await token1.getAddress(),
            ]);

            await expect(distributor.connect(manager).unregisterRewardToken(await token2.getAddress()))
              .to.emit(distributor, "UnregisterRewardToken")
              .withArgs(await token2.getAddress());
            expect(await distributor.distributors(await token2.getAddress())).to.eq(ZeroAddress);
            expect(await distributor.getActiveRewardTokens()).to.deep.eq([]);
            expect(await distributor.getHistoricalRewardTokens()).to.deep.eq([
              await token0.getAddress(),
              await token1.getAddress(),
              await token2.getAddress(),
            ]);
          });
        });
      });

      context("#depositReward", async () => {
        beforeEach(async () => {
          await distributor.grantRole(await distributor.REWARD_MANAGER_ROLE(), manager.address);
          await distributor.connect(manager).registerRewardToken(await token0.getAddress(), holder0.address);
        });

        it("should revert, when token is not active", async () => {
          await expect(distributor.depositReward(await token1.getAddress(), 0)).to.revertedWithCustomError(
            distributor,
            "NotActiveRewardToken"
          );
        });

        it("should revert, when caller is not distributor", async () => {
          await expect(distributor.depositReward(await token0.getAddress(), 0)).to.revertedWithCustomError(
            distributor,
            "NotRewardDistributor"
          );
        });

        it("should succeed", async () => {
          await token0.mint(holder0.address, ethers.parseEther("100000"));
          await token0.connect(holder0).approve(await distributor.getAddress(), MaxUint256);
          const depositAmount0 = ethers.parseEther("1000");
          let tx = distributor.connect(holder0).depositReward(await token0.getAddress(), depositAmount0);
          await expect(tx)
            .to.emit(distributor, "DepositReward")
            .withArgs(await token0.getAddress(), depositAmount0);
          expect(await token0.balanceOf(await distributor.getAddress())).to.eq(depositAmount0);
          if (periodLength === 0) {
            await expect(tx)
              .to.emit(distributor, "AccumulateReward")
              .withArgs(await token0.getAddress(), depositAmount0);
          } else {
            const timestamp0 = (await ethers.provider.getBlock("latest"))!.timestamp;
            const rewardData0 = await distributor.rewardData(await token0.getAddress());
            const expectedRate0 = depositAmount0 / toBigInt(periodLength);
            expect(rewardData0.lastUpdate).to.eq(timestamp0);
            expect(rewardData0.finishAt).to.eq(timestamp0 + periodLength);
            expect(rewardData0.rate).to.eq(expectedRate0);
            expect(await distributor.pendingRewards(await token0.getAddress())).to.deep.eq([
              0n,
              expectedRate0 * toBigInt(periodLength),
            ]);

            // 1/3 period
            await network.provider.send("evm_setNextBlockTimestamp", [timestamp0 + Math.floor(periodLength / 3)]);
            await network.provider.send("evm_mine", []);
            expect(await distributor.pendingRewards(await token0.getAddress())).to.deep.eq([
              expectedRate0 * toBigInt(Math.floor(periodLength / 3)),
              expectedRate0 * toBigInt(periodLength - Math.floor(periodLength / 3)),
            ]);

            // deposit 89% of expectedRate * toBigInt(Math.floor(periodLength / 3)), should be queued
            const depositAmount1 = (expectedRate0 * toBigInt(Math.floor(periodLength / 3)) * 89n) / 100n;
            tx = distributor.connect(holder0).depositReward(await token0.getAddress(), depositAmount1);
            await expect(tx)
              .to.emit(distributor, "DepositReward")
              .withArgs(await token0.getAddress(), depositAmount1);

            const timestamp1 = (await ethers.provider.getBlock("latest"))!.timestamp;
            await expect(tx)
              .to.emit(distributor, "AccumulateReward")
              .withArgs(await token0.getAddress(), expectedRate0 * toBigInt(timestamp1 - timestamp0));
            const rewardData1 = await distributor.rewardData(await token0.getAddress());
            expect(rewardData1.lastUpdate).to.eq(timestamp1);
            expect(rewardData1.finishAt).to.eq(timestamp0 + periodLength);
            expect(rewardData1.rate).to.eq(expectedRate0);
            expect(rewardData1.queued).to.eq(depositAmount1);

            // deposit another 2% expectedRate * toBigInt(Math.floor(periodLength / 3)), should distribute
            const depositAmount2 = (expectedRate0 * toBigInt(Math.floor(periodLength / 3)) * 2n) / 100n;
            tx = distributor.connect(holder0).depositReward(await token0.getAddress(), depositAmount2);
            await expect(tx)
              .to.emit(distributor, "DepositReward")
              .withArgs(await token0.getAddress(), depositAmount2)
              .to.emit(distributor, "AccumulateReward");
            const timestamp2 = (await ethers.provider.getBlock("latest"))!.timestamp;
            const rewardData2 = await distributor.rewardData(await token0.getAddress());
            const expectedRate2 =
              (depositAmount1 + depositAmount2 + expectedRate0 * toBigInt(timestamp0 + periodLength - timestamp2)) /
              toBigInt(periodLength);
            expect(rewardData2.lastUpdate).to.eq(timestamp2);
            expect(rewardData2.finishAt).to.eq(timestamp2 + periodLength);
            expect(rewardData2.rate).to.eq(expectedRate2);
            expect(rewardData2.queued).to.eq(0n);
          }
        });
      });
    });
  }
});

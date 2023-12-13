import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import { expect } from "chai";
import { BigNumberish, MaxUint256, ZeroAddress, toBigInt } from "ethers";
import { ethers, network } from "hardhat";

import { MockConcentratorStrategy, MockConcentratorCompounderBase, MockERC20 } from "@/types/index";

describe("ConcentratorCompounderBase.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  let treasury: HardhatEthersSigner;
  let harvester: HardhatEthersSigner;
  let converter: HardhatEthersSigner;

  let token: MockERC20;
  let strategy: MockConcentratorStrategy;
  let compounder: MockConcentratorCompounderBase;

  for (const periodLength of [0, 100000]) {
    const doHarvest = async (amount: BigNumberish) => {
      await token.mint(deployer.address, amount);
      await token.approve(strategy.getAddress(), amount);
      await strategy.setHarvested(amount);
      await compounder.connect(harvester).harvest(deployer.address, 0);

      if (periodLength > 0) {
        const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + periodLength]);
        await compounder.checkpoint();
      }
    };

    context(`compounder with period[${periodLength}]`, async () => {
      beforeEach(async () => {
        [deployer, signer, other, treasury, harvester, converter] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
        const MockConcentratorStrategy = await ethers.getContractFactory("MockConcentratorStrategy", deployer);
        const MockConcentratorCompounderBase = await ethers.getContractFactory(
          "MockConcentratorCompounderBase",
          deployer
        );

        token = await MockERC20.deploy("X", "Y", 18);
        compounder = await MockConcentratorCompounderBase.deploy(periodLength, token.getAddress());
        strategy = await MockConcentratorStrategy.deploy(
          compounder.getAddress(),
          token.getAddress(),
          token.getAddress()
        );

        await compounder.initialize(
          "XX",
          "YY",
          treasury.address,
          harvester.address,
          converter.address,
          strategy.getAddress()
        );
      });

      context("constructor", async () => {
        it("should initialize correctly", async () => {
          // from ConcentratorBaseV2
          expect(await compounder.treasury()).to.eq(treasury.address);
          expect(await compounder.harvester()).to.eq(harvester.address);
          expect(await compounder.converter()).to.eq(converter.address);
          expect(await compounder.getExpenseRatio()).to.eq(0n);
          expect(await compounder.getHarvesterRatio()).to.eq(0n);
          expect(await compounder.getWithdrawFeePercentage()).to.eq(0n);

          // from LinearRewardDistributor
          expect(await compounder.periodLength()).to.eq(periodLength);
          expect(await compounder.rewardData()).to.deep.eq([0n, 0n, 0n, 0n]);
          expect(await compounder.rewardToken()).to.eq(await token.getAddress());
          expect(await compounder.pendingRewards()).to.deep.eq([0n, 0n]);

          // from ERC20Upgradeable
          expect(await compounder.name()).to.eq("XX");
          expect(await compounder.symbol()).to.eq("YY");
          expect(await compounder.decimals()).to.eq(18);
          expect(await compounder.totalSupply()).to.eq(0n);

          // from ConcentratorCompounderBase
          expect(await compounder.totalAssets()).to.eq(0n);
          expect(await compounder.strategy()).to.eq(await strategy.getAddress());
          expect(await compounder.asset()).to.eq(await token.getAddress());
          expect(await compounder.maxDeposit(ZeroAddress)).to.eq(MaxUint256);
          expect(await compounder.maxMint(ZeroAddress)).to.eq(MaxUint256);
          expect(await compounder.maxRedeem(ZeroAddress)).to.eq(MaxUint256);
          expect(await compounder.maxWithdraw(ZeroAddress)).to.eq(MaxUint256);

          // reinitialize
          await expect(
            compounder.initialize("XX", "YY", treasury.address, harvester.address, converter.address, ZeroAddress)
          ).to.revertedWith("Initializable: contract is already initialized");
        });

        it("should revert, when reinitialize", async () => {
          await expect(compounder.reinitialize()).to.revertedWith("Initializable: contract is not initializing");
        });
      });

      context("#convertToShares", async () => {
        it("should succeed when no supply", async () => {
          for (const assets of [0n, 1n, 1000000000n, ethers.parseEther("12345")]) {
            expect(await compounder.convertToShares(assets)).to.eq(assets);
          }
        });

        it("should succeed when there totalAssets = totalSupply", async () => {
          const amount = ethers.parseEther("1");
          await token.mint(signer.address, amount);
          await token.connect(signer).approve(compounder.getAddress(), amount);
          await compounder.connect(signer).deposit(amount, signer.address);

          for (const assets of [0n, 1n, 1000000000n, ethers.parseEther("12345")]) {
            expect(await compounder.convertToShares(assets)).to.eq(assets);
          }
        });

        it("should succeed when there totalAssets = 1.1 * totalSupply", async () => {
          const amount = ethers.parseEther("1");
          await token.mint(signer.address, amount);
          await token.connect(signer).approve(compounder.getAddress(), amount);
          await compounder.connect(signer).deposit(amount, signer.address);
          await doHarvest(amount / 10n);

          for (const assets of [0n, 1n, 1000000000n, ethers.parseEther("12345")]) {
            expect(await compounder.convertToShares(assets)).to.eq((assets * 10n) / 11n);
          }
        });
      });

      context("#convertToAssets", async () => {
        it("should succeed when no supply", async () => {
          for (const shares of [0n, 1n, 1000000000n, ethers.parseEther("12345")]) {
            expect(await compounder.convertToAssets(shares)).to.eq(shares);
          }
        });

        it("should succeed when there totalAssets = totalSupply", async () => {
          const amount = ethers.parseEther("1");
          await token.mint(signer.address, amount);
          await token.connect(signer).approve(compounder.getAddress(), amount);
          await compounder.connect(signer).deposit(amount, signer.address);

          for (const shares of [0n, 1n, 1000000000n, ethers.parseEther("12345")]) {
            expect(await compounder.convertToAssets(shares)).to.eq(shares);
          }
        });

        it("should succeed when there totalAssets = 1.1 * totalSupply", async () => {
          const amount = ethers.parseEther("1");
          await token.mint(signer.address, amount);
          await token.connect(signer).approve(compounder.getAddress(), amount);
          await compounder.connect(signer).deposit(amount, signer.address);
          await doHarvest(amount / 10n);

          for (const shares of [0n, 1n, 1000000000n, ethers.parseEther("12345")]) {
            expect(await compounder.convertToAssets(shares)).to.eq((shares * 11n) / 10n);
          }
        });
      });

      context("#previewDeposit", async () => {
        it("should succeed when no supply", async () => {
          for (const assets of [0n, 1n, 1000000000n, ethers.parseEther("12345")]) {
            expect(await compounder.previewDeposit(assets)).to.eq(assets);
          }
        });

        it("should succeed when there totalAssets = totalSupply", async () => {
          const amount = ethers.parseEther("1");
          await token.mint(signer.address, amount);
          await token.connect(signer).approve(compounder.getAddress(), amount);
          await compounder.connect(signer).deposit(amount, signer.address);

          for (const assets of [0n, 1n, 1000000000n, ethers.parseEther("12345")]) {
            expect(await compounder.previewDeposit(assets)).to.eq(assets);
          }
        });

        it("should succeed when there totalAssets = 1.1 * totalSupply", async () => {
          const amount = ethers.parseEther("1");
          await token.mint(signer.address, amount);
          await token.connect(signer).approve(compounder.getAddress(), amount);
          await compounder.connect(signer).deposit(amount, signer.address);
          await doHarvest(amount / 10n);

          for (const assets of [0n, 1n, 1000000000n, ethers.parseEther("12345")]) {
            expect(await compounder.previewDeposit(assets)).to.eq((assets * 10n) / 11n);
          }
        });
      });

      context("#previewMint", async () => {
        it("should succeed when no supply", async () => {
          for (const shares of [0n, 1n, 1000000000n, ethers.parseEther("12345")]) {
            expect(await compounder.previewMint(shares)).to.eq(shares);
          }
        });

        it("should succeed when there totalAssets = totalSupply", async () => {
          const amount = ethers.parseEther("1");
          await token.mint(signer.address, amount);
          await token.connect(signer).approve(compounder.getAddress(), amount);
          await compounder.connect(signer).deposit(amount, signer.address);

          for (const shares of [0n, 1n, 1000000000n, ethers.parseEther("12345")]) {
            expect(await compounder.previewMint(shares)).to.eq(shares);
          }
        });

        it("should succeed when there totalAssets = 1.1 * totalSupply", async () => {
          const amount = ethers.parseEther("1");
          await token.mint(signer.address, amount);
          await token.connect(signer).approve(compounder.getAddress(), amount);
          await compounder.connect(signer).deposit(amount, signer.address);
          await doHarvest(amount / 10n);

          for (const shares of [0n, 1n, 1000000000n, ethers.parseEther("12345")]) {
            expect(await compounder.previewMint(shares)).to.eq((shares * 11n) / 10n);
          }
        });
      });

      context("#previewWithdraw", async () => {
        it("should revert when withdraw more than totalAssets", async () => {
          await expect(compounder.previewWithdraw(1)).to.revertedWithCustomError(
            compounder,
            "WithdrawExceedTotalAssets"
          );
        });

        for (const fee of [0n, 1n, 5n, 12345n]) {
          it(`should succeed when withdraw fee is ${fee}`, async () => {
            await compounder.updateWithdrawFeePercentage(fee);

            const amount = ethers.parseEther("1");
            await token.mint(signer.address, amount);
            await token.connect(signer).approve(compounder.getAddress(), amount);
            await compounder.connect(signer).deposit(amount, signer.address);
            await doHarvest(amount / 10n);

            // withdraw all, no fee
            expect(await compounder.previewWithdraw((amount * 11n) / 10n)).to.eq(amount);

            // withdraw part, take fee
            const shares = (amount * 10n) / 11n;
            expect(await compounder.previewWithdraw(amount)).to.eq((shares * 1000000000n) / (1000000000n - fee));
          });
        }
      });

      context("#previewRedeem", async () => {
        it("should revert when withdraw more than totalShares", async () => {
          await expect(compounder.previewRedeem(1)).to.revertedWithCustomError(compounder, "RedeemExceedTotalSupply");
        });

        for (const fee of [0n, 1n, 5n, 12345n]) {
          it(`should succeed when withdraw fee is ${fee}`, async () => {
            await compounder.updateWithdrawFeePercentage(fee);

            const amount = ethers.parseEther("1");
            await token.mint(signer.address, amount);
            await token.connect(signer).approve(compounder.getAddress(), amount);
            await compounder.connect(signer).deposit(amount, signer.address);
            await doHarvest(amount / 10n);

            // withdraw all, no fee
            expect(await compounder.previewRedeem(amount)).to.eq((amount * 11n) / 10n);

            // withdraw part, take fee
            const shares = amount / 2n;
            expect(await compounder.previewRedeem(shares)).to.eq(
              (((shares * 11n) / 10n) * (1000000000n - fee)) / 1000000000n
            );
          });
        }
      });

      context("#deposit", async () => {
        const initialSupply = ethers.parseEther("1");

        beforeEach(async () => {
          await token.mint(deployer.address, initialSupply);
          await token.approve(compounder.getAddress(), initialSupply);
          await compounder.deposit(initialSupply, deployer.address);

          await token.mint(signer.address, ethers.parseEther("123456"));
        });

        it("should revert, when reentrant", async () => {
          await expect(
            compounder.reentrant(
              compounder.getAddress(),
              compounder.interface.encodeFunctionData("deposit", [0, ZeroAddress])
            )
          ).to.revertedWith("ReentrancyGuard: reentrant call");
        });

        it("should revert, when deposit zero amount", async () => {
          await expect(compounder.deposit(0, deployer.address)).to.revertedWithCustomError(
            compounder,
            "DepositZeroAmount"
          );
        });

        context("totalAssets = totalSupply", async () => {
          it("should succeed when deposit to self", async () => {
            const amount = ethers.parseEther("100");
            await token.connect(signer).approve(compounder.getAddress(), amount);
            expect(await compounder.balanceOf(signer.address)).to.eq(0n);
            expect(await compounder.totalSupply()).to.eq(initialSupply);
            expect(await compounder.connect(signer).deposit.staticCall(amount, signer.address)).to.eq(amount);
            await expect(compounder.connect(signer).deposit(amount, signer.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, signer.address, amount, amount);
            expect(await compounder.balanceOf(signer.address)).to.eq(amount);
            expect(await compounder.totalSupply()).to.eq(amount + initialSupply);

            expect(await token.balanceOf(strategy.getAddress())).to.eq(amount + initialSupply);
          });

          it("should succeed when deposit to other", async () => {
            const amount = ethers.parseEther("100");
            await token.connect(signer).approve(compounder.getAddress(), amount);
            expect(await compounder.balanceOf(signer.address)).to.eq(0n);
            expect(await compounder.totalSupply()).to.eq(initialSupply);
            expect(await compounder.connect(signer).deposit.staticCall(amount, other.address)).to.eq(amount);
            await expect(compounder.connect(signer).deposit(amount, other.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, other.address, amount, amount);
            expect(await compounder.balanceOf(other.address)).to.eq(amount);
            expect(await compounder.totalSupply()).to.eq(amount + initialSupply);

            expect(await token.balanceOf(strategy.getAddress())).to.eq(amount + initialSupply);
          });

          it("should succeed when deposit all to self", async () => {
            const amount = await token.balanceOf(signer.address);
            await token.connect(signer).approve(compounder.getAddress(), amount);
            expect(await compounder.balanceOf(signer.address)).to.eq(0n);
            expect(await compounder.totalSupply()).to.eq(initialSupply);
            expect(await compounder.connect(signer).deposit.staticCall(MaxUint256, signer.address)).to.eq(amount);
            await expect(compounder.connect(signer).deposit(MaxUint256, signer.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, signer.address, amount, amount);
            expect(await compounder.balanceOf(signer.address)).to.eq(amount);
            expect(await compounder.totalSupply()).to.eq(amount + initialSupply);

            expect(await token.balanceOf(strategy.getAddress())).to.eq(amount + initialSupply);
          });

          it("should succeed when deposit all to other", async () => {
            const amount = await token.balanceOf(signer.address);
            await token.connect(signer).approve(compounder.getAddress(), amount);
            expect(await compounder.balanceOf(signer.address)).to.eq(0n);
            expect(await compounder.totalSupply()).to.eq(initialSupply);
            expect(await compounder.connect(signer).deposit.staticCall(MaxUint256, other.address)).to.eq(amount);
            await expect(compounder.connect(signer).deposit(MaxUint256, other.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, other.address, amount, amount);
            expect(await compounder.balanceOf(other.address)).to.eq(amount);
            expect(await compounder.totalSupply()).to.eq(amount + initialSupply);

            expect(await token.balanceOf(strategy.getAddress())).to.eq(amount + initialSupply);
          });

          it("should succeed when deposit multiple times", async () => {
            const amount = ethers.parseEther("100");
            await token.connect(signer).approve(compounder.getAddress(), MaxUint256);
            expect(await compounder.balanceOf(signer.address)).to.eq(0n);
            expect(await compounder.totalSupply()).to.eq(initialSupply);

            await expect(compounder.connect(signer).deposit(amount, signer.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, signer.address, amount, amount);

            expect(await compounder.balanceOf(signer.address)).to.eq(amount);
            expect(await compounder.totalSupply()).to.eq(amount + initialSupply);
            expect(await compounder.balanceOf(other.address)).to.eq(0n);

            await expect(compounder.connect(signer).deposit(amount, other.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, other.address, amount, amount);

            expect(await compounder.balanceOf(other.address)).to.eq(amount);
            expect(await compounder.totalSupply()).to.eq(amount * 2n + initialSupply);
          });
        });

        context("totalAssets = 1.1234 * totalSupply", async () => {
          beforeEach(async () => {
            await doHarvest((initialSupply * 1234n) / 10000n);
          });

          it("should succeed when deposit to self", async () => {
            const amount = ethers.parseEther("100");
            const shares = (amount * 10000n) / 11234n;
            await token.connect(signer).approve(compounder.getAddress(), amount);
            expect(await compounder.balanceOf(signer.address)).to.eq(0n);
            expect(await compounder.totalSupply()).to.eq(initialSupply);
            expect(await compounder.connect(signer).deposit.staticCall(amount, signer.address)).to.eq(shares);
            await expect(compounder.connect(signer).deposit(amount, signer.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, signer.address, amount, shares);
            expect(await compounder.balanceOf(signer.address)).to.eq(shares);
            expect(await compounder.totalSupply()).to.eq(shares + initialSupply);

            expect(await token.balanceOf(strategy.getAddress())).to.eq(amount + (initialSupply * 11234n) / 10000n);
          });

          it("should succeed when deposit to other", async () => {
            const amount = ethers.parseEther("100");
            const shares = (amount * 10000n) / 11234n;
            await token.connect(signer).approve(compounder.getAddress(), amount);
            expect(await compounder.balanceOf(signer.address)).to.eq(0n);
            expect(await compounder.totalSupply()).to.eq(initialSupply);
            expect(await compounder.connect(signer).deposit.staticCall(amount, other.address)).to.eq(shares);
            await expect(compounder.connect(signer).deposit(amount, other.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, other.address, amount, shares);
            expect(await compounder.balanceOf(other.address)).to.eq(shares);
            expect(await compounder.totalSupply()).to.eq(shares + initialSupply);

            expect(await token.balanceOf(strategy.getAddress())).to.eq(amount + (initialSupply * 11234n) / 10000n);
          });

          it("should succeed when deposit all to self", async () => {
            const amount = await token.balanceOf(signer.address);
            const shares = (amount * 10000n) / 11234n;
            await token.connect(signer).approve(compounder.getAddress(), amount);
            expect(await compounder.balanceOf(signer.address)).to.eq(0n);
            expect(await compounder.totalSupply()).to.eq(initialSupply);
            expect(await compounder.connect(signer).deposit.staticCall(MaxUint256, signer.address)).to.eq(shares);
            await expect(compounder.connect(signer).deposit(MaxUint256, signer.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, signer.address, amount, shares);
            expect(await compounder.balanceOf(signer.address)).to.eq(shares);
            expect(await compounder.totalSupply()).to.eq(shares + initialSupply);

            expect(await token.balanceOf(strategy.getAddress())).to.eq(amount + (initialSupply * 11234n) / 10000n);
          });

          it("should succeed when deposit all to other", async () => {
            const amount = await token.balanceOf(signer.address);
            const shares = (amount * 10000n) / 11234n;
            await token.connect(signer).approve(compounder.getAddress(), amount);
            expect(await compounder.balanceOf(signer.address)).to.eq(0n);
            expect(await compounder.totalSupply()).to.eq(initialSupply);
            expect(await compounder.connect(signer).deposit.staticCall(MaxUint256, other.address)).to.eq(shares);
            await expect(compounder.connect(signer).deposit(MaxUint256, other.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, other.address, amount, shares);
            expect(await compounder.balanceOf(other.address)).to.eq(shares);
            expect(await compounder.totalSupply()).to.eq(shares + initialSupply);

            expect(await token.balanceOf(strategy.getAddress())).to.eq(amount + (initialSupply * 11234n) / 10000n);
          });

          it("should succeed when deposit multiple times", async () => {
            const amount = ethers.parseEther("100");
            const shares = (amount * 10000n) / 11234n;
            await token.connect(signer).approve(compounder.getAddress(), MaxUint256);
            expect(await compounder.balanceOf(signer.address)).to.eq(0n);
            expect(await compounder.totalSupply()).to.eq(initialSupply);

            await expect(compounder.connect(signer).deposit(amount, signer.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, signer.address, amount, shares);

            expect(await compounder.balanceOf(signer.address)).to.eq(shares);
            expect(await compounder.totalSupply()).to.eq(shares + initialSupply);
            expect(await compounder.balanceOf(other.address)).to.eq(0n);

            await expect(compounder.connect(signer).deposit(amount, other.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, other.address, amount, shares);

            expect(await compounder.balanceOf(other.address)).to.eq(shares);
            expect(await compounder.totalSupply()).to.eq(shares * 2n + initialSupply);
          });
        });
      });

      context("#mint", async () => {
        const initialSupply = ethers.parseEther("1");

        beforeEach(async () => {
          await token.mint(deployer.address, initialSupply);
          await token.approve(compounder.getAddress(), initialSupply);
          await compounder.deposit(initialSupply, deployer.address);

          await token.mint(signer.address, ethers.parseEther("123456"));
        });

        it("should revert, when reentrant", async () => {
          await expect(
            compounder.reentrant(
              compounder.getAddress(),
              compounder.interface.encodeFunctionData("mint", [0, ZeroAddress])
            )
          ).to.revertedWith("ReentrancyGuard: reentrant call");
        });

        it("should revert, when mint zero amount", async () => {
          await expect(compounder.mint(0, deployer.address)).to.revertedWithCustomError(
            compounder,
            "DepositZeroAmount"
          );
        });

        context("totalAssets = totalSupply", async () => {
          it("should succeed when mint to self", async () => {
            const amount = ethers.parseEther("100");
            await token.connect(signer).approve(compounder.getAddress(), amount);
            expect(await compounder.balanceOf(signer.address)).to.eq(0n);
            expect(await compounder.totalSupply()).to.eq(initialSupply);
            expect(await compounder.connect(signer).mint.staticCall(amount, signer.address)).to.eq(amount);
            await expect(compounder.connect(signer).mint(amount, signer.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, signer.address, amount, amount);
            expect(await compounder.balanceOf(signer.address)).to.eq(amount);
            expect(await compounder.totalSupply()).to.eq(amount + initialSupply);

            expect(await token.balanceOf(strategy.getAddress())).to.eq(amount + initialSupply);
          });

          it("should succeed when mint to other", async () => {
            const amount = ethers.parseEther("100");
            await token.connect(signer).approve(compounder.getAddress(), amount);
            expect(await compounder.balanceOf(signer.address)).to.eq(0n);
            expect(await compounder.totalSupply()).to.eq(initialSupply);
            expect(await compounder.connect(signer).mint.staticCall(amount, other.address)).to.eq(amount);
            await expect(compounder.connect(signer).mint(amount, other.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, other.address, amount, amount);
            expect(await compounder.balanceOf(other.address)).to.eq(amount);
            expect(await compounder.totalSupply()).to.eq(amount + initialSupply);

            expect(await token.balanceOf(strategy.getAddress())).to.eq(amount + initialSupply);
          });

          it("should succeed when mint multiple times", async () => {
            const amount = ethers.parseEther("100");
            await token.connect(signer).approve(compounder.getAddress(), MaxUint256);
            expect(await compounder.balanceOf(signer.address)).to.eq(0n);
            expect(await compounder.totalSupply()).to.eq(initialSupply);

            await expect(compounder.connect(signer).mint(amount, signer.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, signer.address, amount, amount);

            expect(await compounder.balanceOf(signer.address)).to.eq(amount);
            expect(await compounder.totalSupply()).to.eq(amount + initialSupply);
            expect(await compounder.balanceOf(other.address)).to.eq(0n);

            await expect(compounder.connect(signer).mint(amount, other.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, other.address, amount, amount);

            expect(await compounder.balanceOf(other.address)).to.eq(amount);
            expect(await compounder.totalSupply()).to.eq(amount * 2n + initialSupply);
          });
        });

        context("totalAssets = 1.1234 * totalSupply", async () => {
          beforeEach(async () => {
            await doHarvest((initialSupply * 1234n) / 10000n);
          });

          it("should succeed when mint to self", async () => {
            const amount = ethers.parseEther("100");
            const shares = (amount * 10000n) / 11234n;
            await token.connect(signer).approve(compounder.getAddress(), amount);
            expect(await compounder.balanceOf(signer.address)).to.eq(0n);
            expect(await compounder.totalSupply()).to.eq(initialSupply);
            expect(await compounder.connect(signer).mint.staticCall(shares, signer.address)).to.eq(amount - 1n);
            await expect(compounder.connect(signer).mint(shares, signer.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, signer.address, amount - 1n, shares - 1n);
            expect(await compounder.balanceOf(signer.address)).to.eq(shares - 1n);
            expect(await compounder.totalSupply()).to.eq(shares - 1n + initialSupply);

            expect(await token.balanceOf(strategy.getAddress())).to.eq(amount - 1n + (initialSupply * 11234n) / 10000n);
          });

          it("should succeed when mint to other", async () => {
            const amount = ethers.parseEther("100");
            const shares = (amount * 10000n) / 11234n;
            await token.connect(signer).approve(compounder.getAddress(), amount);
            expect(await compounder.balanceOf(signer.address)).to.eq(0n);
            expect(await compounder.totalSupply()).to.eq(initialSupply);
            expect(await compounder.connect(signer).mint.staticCall(shares, other.address)).to.eq(amount - 1n);
            await expect(compounder.connect(signer).mint(shares, other.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, other.address, amount - 1n, shares - 1n);
            expect(await compounder.balanceOf(other.address)).to.eq(shares - 1n);
            expect(await compounder.totalSupply()).to.eq(shares - 1n + initialSupply);

            expect(await token.balanceOf(strategy.getAddress())).to.eq(amount - 1n + (initialSupply * 11234n) / 10000n);
          });

          it("should succeed when mint multiple times", async () => {
            const amount = ethers.parseEther("100");
            const shares = (amount * 10000n) / 11234n;
            await token.connect(signer).approve(compounder.getAddress(), MaxUint256);
            expect(await compounder.balanceOf(signer.address)).to.eq(0n);
            expect(await compounder.totalSupply()).to.eq(initialSupply);

            await expect(compounder.connect(signer).mint(shares, signer.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, signer.address, amount - 1n, shares - 1n);
            expect(await compounder.balanceOf(signer.address)).to.eq(shares - 1n);
            expect(await compounder.totalSupply()).to.eq(shares - 1n + initialSupply);
            expect(await compounder.balanceOf(other.address)).to.eq(0n);

            await expect(compounder.connect(signer).mint(shares, other.address))
              .to.emit(compounder, "Deposit")
              .withArgs(signer.address, other.address, amount, shares - 1n);
            expect(await compounder.balanceOf(other.address)).to.eq(shares - 1n);
            expect(await compounder.totalSupply()).to.eq(shares * 2n - 2n + initialSupply);

            expect(await token.balanceOf(strategy.getAddress())).to.eq(
              amount * 2n - 1n + (initialSupply * 11234n) / 10000n
            );
          });
        });
      });

      context("#withdraw", async () => {
        const initialSupply = ethers.parseEther("12345");

        beforeEach(async () => {
          await token.mint(deployer.address, initialSupply);
          await token.approve(compounder.getAddress(), initialSupply);
          await compounder.deposit(initialSupply, deployer.address);

          await token.mint(signer.address, ethers.parseEther("123456"));
        });

        it("should revert, when reentrant", async () => {
          await expect(
            compounder.reentrant(
              compounder.getAddress(),
              compounder.interface.encodeFunctionData("withdraw", [0, ZeroAddress, ZeroAddress])
            )
          ).to.revertedWith("ReentrancyGuard: reentrant call");
        });

        it("should revert, when withdraw exceed totalAssets", async () => {
          await expect(
            compounder.withdraw(initialSupply + 1n, deployer.address, deployer.address)
          ).to.revertedWithCustomError(compounder, "WithdrawExceedTotalAssets");
        });

        it("should revert, when withdraw zero share", async () => {
          await expect(compounder.withdraw(0n, deployer.address, deployer.address)).to.revertedWithCustomError(
            compounder,
            "WithdrawZeroShare"
          );
        });

        for (const withdrawFeePercentage of [0n, 1e7]) {
          context(`with withdraw fee: ${withdrawFeePercentage}`, async () => {
            beforeEach(async () => {
              await compounder.updateWithdrawFeePercentage(withdrawFeePercentage);
            });

            context("totalAssets = totalSupply", async () => {
              it("should succeed when withdraw self to self", async () => {
                const assets = ethers.parseEther("100");
                const assetsWithFee = (assets * 1000000000n) / (1000000000n - toBigInt(withdrawFeePercentage));
                const shares = assetsWithFee;

                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(await compounder.withdraw.staticCall(assets, deployer.address, deployer.address)).to.eq(shares);
                await expect(compounder.withdraw(assets, deployer.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(deployer.address, deployer.address, deployer.address, assets, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(initialSupply - assets);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(initialSupply - assets);
                expect(await token.balanceOf(deployer.address)).to.eq(assets);
              });

              it("should succeed when withdraw self to other", async () => {
                const assets = ethers.parseEther("100");
                const assetsWithFee = (assets * 1000000000n) / (1000000000n - toBigInt(withdrawFeePercentage));
                const shares = assetsWithFee;

                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(await compounder.withdraw.staticCall(assets, other.address, deployer.address)).to.eq(shares);
                await expect(compounder.withdraw(assets, other.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(deployer.address, other.address, deployer.address, assets, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(initialSupply - assets);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(initialSupply - assets);
                expect(await token.balanceOf(other.address)).to.eq(assets);
              });

              it("should succeed when withdraw all self to self", async () => {
                const assets = initialSupply;
                const shares = assets;

                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(await compounder.withdraw.staticCall(MaxUint256, deployer.address, deployer.address)).to.eq(
                  shares
                );
                await expect(compounder.withdraw(MaxUint256, deployer.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(deployer.address, deployer.address, deployer.address, assets, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(initialSupply - assets);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(initialSupply - assets);
                expect(await token.balanceOf(deployer.address)).to.eq(assets);
              });

              it("should succeed when withdraw all self to other", async () => {
                const assets = initialSupply;
                const shares = assets;

                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(await compounder.withdraw.staticCall(MaxUint256, other.address, deployer.address)).to.eq(shares);
                await expect(compounder.withdraw(MaxUint256, other.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(deployer.address, other.address, deployer.address, assets, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(initialSupply - assets);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(initialSupply - assets);
                expect(await token.balanceOf(other.address)).to.eq(assets);
              });

              it("should succeed when withdraw other to other", async () => {
                const assets = ethers.parseEther("100");
                const assetsWithFee = (assets * 1000000000n) / (1000000000n - toBigInt(withdrawFeePercentage));
                const shares = assetsWithFee;

                // revert, no allowance
                await expect(
                  compounder.connect(signer).withdraw(assets, other.address, deployer.address)
                ).to.revertedWith("ERC20: insufficient allowance");

                await compounder.approve(signer.address, MaxUint256);

                // succeed
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(
                  await compounder.connect(signer).withdraw.staticCall(assets, other.address, deployer.address)
                ).to.eq(shares);
                await expect(compounder.connect(signer).withdraw(assets, other.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(signer.address, other.address, deployer.address, assets, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(initialSupply - assets);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(initialSupply - assets);
                expect(await token.balanceOf(other.address)).to.eq(assets);
              });
            });

            context("totalAssets = 1.1234 * totalSupply", async () => {
              const compoundedAssets = (initialSupply * 11234n) / 10000n;

              beforeEach(async () => {
                await doHarvest((initialSupply * 1234n) / 10000n);
                expect(await compounder.totalAssets()).to.eq(compoundedAssets);
              });

              it("should succeed when withdraw self to self", async () => {
                const assets = ethers.parseEther("100");
                const sharesWithoutFee = (assets * initialSupply) / compoundedAssets;
                const shares = (sharesWithoutFee * 1000000000n) / (1000000000n - toBigInt(withdrawFeePercentage));

                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(await compounder.withdraw.staticCall(assets, deployer.address, deployer.address)).to.eq(shares);
                await expect(compounder.withdraw(assets, deployer.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(deployer.address, deployer.address, deployer.address, assets - 1n, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(compoundedAssets - assets + 1n);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(compoundedAssets - assets + 1n);
                expect(await token.balanceOf(deployer.address)).to.eq(assets - 1n);
              });

              it("should succeed when withdraw self to other", async () => {
                const assets = ethers.parseEther("100");
                const sharesWithoutFee = (assets * initialSupply) / compoundedAssets;
                const shares = (sharesWithoutFee * 1000000000n) / (1000000000n - toBigInt(withdrawFeePercentage));

                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(await compounder.withdraw.staticCall(assets, other.address, deployer.address)).to.eq(shares);
                await expect(compounder.withdraw(assets, other.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(deployer.address, other.address, deployer.address, assets - 1n, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(compoundedAssets - assets + 1n);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(compoundedAssets - assets + 1n);
                expect(await token.balanceOf(other.address)).to.eq(assets - 1n);
              });

              it("should succeed when withdraw all self to self", async () => {
                const assets = compoundedAssets;
                const shares = initialSupply;

                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(await compounder.withdraw.staticCall(MaxUint256, deployer.address, deployer.address)).to.eq(
                  shares
                );
                await expect(compounder.withdraw(MaxUint256, deployer.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(deployer.address, deployer.address, deployer.address, assets, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(compoundedAssets - assets);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(compoundedAssets - assets);
                expect(await token.balanceOf(deployer.address)).to.eq(assets);
              });

              it("should succeed when withdraw all self to other", async () => {
                const assets = compoundedAssets;
                const shares = initialSupply;

                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(await compounder.withdraw.staticCall(MaxUint256, other.address, deployer.address)).to.eq(shares);
                await expect(compounder.withdraw(MaxUint256, other.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(deployer.address, other.address, deployer.address, assets, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(compoundedAssets - assets);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(compoundedAssets - assets);
                expect(await token.balanceOf(other.address)).to.eq(assets);
              });

              it("should succeed when withdraw other to other", async () => {
                const assets = ethers.parseEther("100");
                const sharesWithoutFee = (assets * initialSupply) / compoundedAssets;
                const shares = (sharesWithoutFee * 1000000000n) / (1000000000n - toBigInt(withdrawFeePercentage));

                // revert, no allowance
                await expect(
                  compounder.connect(signer).withdraw(assets, other.address, deployer.address)
                ).to.revertedWith("ERC20: insufficient allowance");

                await compounder.approve(signer.address, MaxUint256);

                // succeed
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(
                  await compounder.connect(signer).withdraw.staticCall(assets, other.address, deployer.address)
                ).to.eq(shares);
                await expect(compounder.connect(signer).withdraw(assets, other.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(signer.address, other.address, deployer.address, assets - 1n, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(compoundedAssets - assets + 1n);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(compoundedAssets - assets + 1n);
                expect(await token.balanceOf(other.address)).to.eq(assets - 1n);
              });
            });
          });
        }
      });

      context("#redeem", async () => {
        const initialSupply = ethers.parseEther("12345");

        beforeEach(async () => {
          await token.mint(deployer.address, initialSupply);
          await token.approve(compounder.getAddress(), initialSupply);
          await compounder.deposit(initialSupply, deployer.address);
        });

        it("should revert, when reentrant", async () => {
          await expect(
            compounder.reentrant(
              compounder.getAddress(),
              compounder.interface.encodeFunctionData("redeem", [0, ZeroAddress, ZeroAddress])
            )
          ).to.revertedWith("ReentrancyGuard: reentrant call");
        });

        it("should revert, when redeem zero share", async () => {
          await expect(compounder.redeem(0n, deployer.address, deployer.address)).to.revertedWithCustomError(
            compounder,
            "WithdrawZeroShare"
          );
        });

        for (const withdrawFeePercentage of [0n, 1e7]) {
          context(`with withdraw fee: ${withdrawFeePercentage}`, async () => {
            beforeEach(async () => {
              await compounder.updateWithdrawFeePercentage(withdrawFeePercentage);
            });

            context("totalAssets = totalSupply", async () => {
              it("should succeed when redeem self to self", async () => {
                const shares = ethers.parseEther("100");
                const assetsWithFee = shares;
                const assets = assetsWithFee - (assetsWithFee * toBigInt(withdrawFeePercentage)) / 1000000000n;

                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(await compounder.redeem.staticCall(shares, deployer.address, deployer.address)).to.eq(assets);
                await expect(compounder.redeem(shares, deployer.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(deployer.address, deployer.address, deployer.address, assets, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(initialSupply - assets);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(initialSupply - assets);
                expect(await token.balanceOf(deployer.address)).to.eq(assets);
              });

              it("should succeed when redeem self to other", async () => {
                const shares = ethers.parseEther("100");
                const assetsWithFee = shares;
                const assets = assetsWithFee - (assetsWithFee * toBigInt(withdrawFeePercentage)) / 1000000000n;

                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(await compounder.redeem.staticCall(shares, other.address, deployer.address)).to.eq(assets);
                await expect(compounder.redeem(shares, other.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(deployer.address, other.address, deployer.address, assets, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(initialSupply - assets);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(initialSupply - assets);
                expect(await token.balanceOf(other.address)).to.eq(assets);
              });

              it("should succeed when redeem all self to self", async () => {
                const shares = initialSupply;
                const assets = shares;

                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(await compounder.redeem.staticCall(MaxUint256, deployer.address, deployer.address)).to.eq(
                  assets
                );
                await expect(compounder.redeem(MaxUint256, deployer.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(deployer.address, deployer.address, deployer.address, assets, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(initialSupply - assets);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(initialSupply - assets);
                expect(await token.balanceOf(deployer.address)).to.eq(assets);
              });

              it("should succeed when redeem all self to other", async () => {
                const shares = initialSupply;
                const assets = shares;

                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(await compounder.withdraw.staticCall(MaxUint256, other.address, deployer.address)).to.eq(assets);
                await expect(compounder.withdraw(MaxUint256, other.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(deployer.address, other.address, deployer.address, assets, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(initialSupply - assets);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(initialSupply - assets);
                expect(await token.balanceOf(other.address)).to.eq(assets);
              });

              it("should succeed when redeem other to other", async () => {
                const shares = ethers.parseEther("100");
                const assetsWithFee = shares;
                const assets = assetsWithFee - (assetsWithFee * toBigInt(withdrawFeePercentage)) / 1000000000n;

                // revert, no allowance
                await expect(
                  compounder.connect(signer).withdraw(assets, other.address, deployer.address)
                ).to.revertedWith("ERC20: insufficient allowance");

                await compounder.approve(signer.address, MaxUint256);

                // succeed
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(
                  await compounder.connect(signer).redeem.staticCall(shares, other.address, deployer.address)
                ).to.eq(assets);
                await expect(compounder.connect(signer).redeem(shares, other.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(signer.address, other.address, deployer.address, assets, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(initialSupply - assets);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(initialSupply - assets);
                expect(await token.balanceOf(other.address)).to.eq(assets);
              });
            });

            context("totalAssets = 1.1234 * totalSupply", async () => {
              const compoundedAssets = (initialSupply * 11234n) / 10000n;

              beforeEach(async () => {
                await doHarvest((initialSupply * 1234n) / 10000n);
                expect(await compounder.totalAssets()).to.eq(compoundedAssets);
              });

              it("should succeed when redeem self to self", async () => {
                const shares = ethers.parseEther("100");
                const assetsWithFee = (shares * compoundedAssets) / initialSupply;
                const assets = assetsWithFee - (assetsWithFee * toBigInt(withdrawFeePercentage)) / 1000000000n;

                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(await compounder.redeem.staticCall(shares, deployer.address, deployer.address)).to.eq(assets);
                await expect(compounder.redeem(shares, deployer.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(deployer.address, deployer.address, deployer.address, assets, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(compoundedAssets - assets);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(compoundedAssets - assets);
                expect(await token.balanceOf(deployer.address)).to.eq(assets);
              });

              it("should succeed when redeem self to other", async () => {
                const shares = ethers.parseEther("100");
                const assetsWithFee = (shares * compoundedAssets) / initialSupply;
                const assets = assetsWithFee - (assetsWithFee * toBigInt(withdrawFeePercentage)) / 1000000000n;

                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(await compounder.redeem.staticCall(shares, other.address, deployer.address)).to.eq(assets);
                await expect(compounder.redeem(shares, other.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(deployer.address, other.address, deployer.address, assets, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(compoundedAssets - assets);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(compoundedAssets - assets);
                expect(await token.balanceOf(other.address)).to.eq(assets);
              });

              it("should succeed when redeem all self to self", async () => {
                const shares = initialSupply;
                const assets = compoundedAssets;

                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(await compounder.redeem.staticCall(MaxUint256, deployer.address, deployer.address)).to.eq(
                  assets
                );
                await expect(compounder.redeem(MaxUint256, deployer.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(deployer.address, deployer.address, deployer.address, assets, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(compoundedAssets - assets);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(compoundedAssets - assets);
                expect(await token.balanceOf(deployer.address)).to.eq(assets);
              });

              it("should succeed when redeem all self to other", async () => {
                const shares = initialSupply;
                const assets = compoundedAssets;

                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(await compounder.redeem.staticCall(MaxUint256, other.address, deployer.address)).to.eq(assets);
                await expect(compounder.redeem(MaxUint256, other.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(deployer.address, other.address, deployer.address, assets, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(compoundedAssets - assets);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(compoundedAssets - assets);
                expect(await token.balanceOf(other.address)).to.eq(assets);
              });

              it("should succeed when redeem other to other", async () => {
                const shares = ethers.parseEther("100");
                const assetsWithFee = (shares * compoundedAssets) / initialSupply;
                const assets = assetsWithFee - (assetsWithFee * toBigInt(withdrawFeePercentage)) / 1000000000n;

                // revert, no allowance
                await expect(
                  compounder.connect(signer).redeem(shares, other.address, deployer.address)
                ).to.revertedWith("ERC20: insufficient allowance");

                await compounder.approve(signer.address, shares);

                // succeed
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
                expect(
                  await compounder.connect(signer).redeem.staticCall(shares, other.address, deployer.address)
                ).to.eq(assets);
                await expect(compounder.connect(signer).redeem(shares, other.address, deployer.address))
                  .to.emit(compounder, "Withdraw")
                  .withArgs(signer.address, other.address, deployer.address, assets, shares);
                expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
                expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
                expect(await compounder.totalAssets()).to.eq(compoundedAssets - assets);
                expect(await token.balanceOf(strategy.getAddress())).to.eq(compoundedAssets - assets);
                expect(await token.balanceOf(other.address)).to.eq(assets);
              });
            });
          });
        }
      });

      if (periodLength > 0) {
        context("#checkpoint", async () => {
          it("should revert, when reentrant", async () => {
            await expect(
              compounder.reentrant(compounder.getAddress(), compounder.interface.encodeFunctionData("checkpoint"))
            ).to.revertedWith("ReentrancyGuard: reentrant call");
          });

          it("should succeed", async () => {
            // deposit
            const initialSupply = ethers.parseEther("10001");
            await token.mint(deployer.address, initialSupply);
            await token.approve(compounder.getAddress(), initialSupply);
            await compounder.deposit(initialSupply, deployer.address);

            // harvest
            const harvested = 123456789n;
            await token.mint(deployer.address, harvested);
            await token.approve(strategy.getAddress(), harvested);
            await strategy.setHarvested(harvested);
            await compounder.connect(harvester).harvest(deployer.address, 0);

            expect(await compounder.totalAssets()).to.eq(initialSupply);
            const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
            await network.provider.send("evm_setNextBlockTimestamp", [timestamp + periodLength / 2]);
            await compounder.checkpoint();
            expect(await compounder.totalAssets()).to.eq(
              (harvested / toBigInt(periodLength)) * toBigInt(periodLength / 2) + initialSupply
            );
          });
        });
      }

      context("#depositReward", async () => {
        it("should succeed", async () => {
          const initialSupply = ethers.parseEther("12345");
          await token.mint(deployer.address, initialSupply);
          await token.approve(compounder.getAddress(), initialSupply);
          await compounder.deposit(initialSupply, deployer.address);
          expect(await token.balanceOf(await strategy.getAddress())).to.eq(initialSupply);
          await compounder.grantRole(await compounder.REWARD_DEPOSITOR_ROLE(), deployer.address);
          await token.mint(deployer.address, initialSupply);
          await token.approve(compounder.getAddress(), initialSupply);
          await compounder.depositReward(initialSupply);
          expect(await token.balanceOf(await strategy.getAddress())).to.eq(initialSupply * 2n);
        });
      });

      context("#harvest", async () => {
        const initialSupply = ethers.parseEther("123456");
        const initialAssets = (initialSupply * 11234n) / 10000n;

        beforeEach(async () => {
          await token.mint(deployer.address, initialSupply);
          await token.approve(compounder.getAddress(), initialSupply);
          await compounder.deposit(initialSupply, deployer.address);

          await token.mint(signer.address, ethers.parseEther("123456"));
          await doHarvest((initialSupply * 1234n) / 10000n);
        });

        it("should revert, when reentrant", async () => {
          await expect(
            compounder.reentrant(
              compounder.getAddress(),
              compounder.interface.encodeFunctionData("harvest", [ZeroAddress, 0n])
            )
          ).to.revertedWith("ReentrancyGuard: reentrant call");
        });

        it("should revert, when caller is not harvester", async () => {
          await expect(compounder.harvest(deployer.address, 0n)).to.revertedWithCustomError(
            compounder,
            "CallerIsNotHarvester"
          );
        });

        it("should revert, when insufficient assets", async () => {
          const harvested = 123456789n;
          await token.mint(deployer.address, harvested);
          await token.approve(strategy.getAddress(), harvested);
          await strategy.setHarvested(harvested);
          await expect(
            compounder.connect(harvester).harvest(harvester.address, harvested + 1n)
          ).to.revertedWithCustomError(compounder, "InsufficientHarvestedAssets");
        });

        for (const expenseRatio of [0, 1e6, 1e7, 1e8]) {
          for (const harvesterRatio of [0, 1e6, 1e7]) {
            it(`should succeed when expenseRatio=${expenseRatio} harvesterRatio=${harvesterRatio}`, async () => {
              await compounder.updateExpenseRatio(expenseRatio);
              await compounder.updateHarvesterRatio(harvesterRatio);

              const harvested = ethers.parseEther("1.234567890123456789");
              await token.mint(deployer.address, harvested);
              await token.approve(strategy.getAddress(), harvested);
              await strategy.setHarvested(harvested);

              const performanceFee = (harvested * toBigInt(expenseRatio)) / 1000000000n;
              const harvesterBounty = (harvested * toBigInt(harvesterRatio)) / 1000000000n;
              expect(await compounder.connect(harvester).harvest.staticCall(signer.address, 0)).to.eq(harvested);
              await expect(compounder.connect(harvester).harvest(signer.address, 0))
                .to.emit(compounder, "Harvest")
                .withArgs(harvester.address, signer.address, harvested, performanceFee, harvesterBounty);
              const shareSigner = (harvesterBounty * initialSupply) / initialAssets;
              const shareTreasury = (performanceFee * initialSupply) / initialAssets;
              expect(await compounder.balanceOf(signer.address)).to.eq(shareSigner);
              expect(await compounder.balanceOf(treasury.address)).to.eq(shareTreasury);

              if (periodLength === 0) {
                expect(await compounder.totalAssets()).to.eq(initialAssets + harvested);
              } else {
                expect(await compounder.convertToAssets(shareSigner)).to.closeTo(
                  harvesterBounty,
                  harvesterBounty / 1000000n
                );
                expect(await compounder.convertToAssets(shareTreasury)).to.closeTo(
                  performanceFee,
                  performanceFee / 1000000n
                );
                expect((await compounder.rewardData()).rate).to.eq(
                  (harvested - performanceFee - harvesterBounty) / toBigInt(periodLength)
                );
                expect((await compounder.rewardData()).queued).to.eq(
                  (harvested - performanceFee - harvesterBounty) % toBigInt(periodLength)
                );
              }
            });
          }
        }
      });

      context("#migrateStrategy", async () => {
        it("should revert, when new strategy is zero", async () => {
          await expect(compounder.migrateStrategy(ZeroAddress)).to.revertedWithCustomError(
            compounder,
            "StrategyIsZero"
          );
        });

        it("should succeed migrate all", async () => {
          // deposit
          const initialSupply = ethers.parseEther("10001");
          await token.mint(deployer.address, initialSupply);
          await token.approve(compounder.getAddress(), initialSupply);
          await compounder.deposit(initialSupply, deployer.address);

          // harvest
          const harvested = 123456789n;
          await token.mint(deployer.address, harvested);
          await token.approve(strategy.getAddress(), harvested);
          await strategy.setHarvested(harvested);
          await compounder.connect(harvester).harvest(deployer.address, 0);

          if (periodLength > 0) {
            const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
            await network.provider.send("evm_setNextBlockTimestamp", [timestamp + periodLength / 2]);
            await compounder.checkpoint();
            await network.provider.send("evm_setNextBlockTimestamp", [timestamp + periodLength / 2 + 10]);
            await network.provider.send("evm_mine", []);
            const queued = (await compounder.rewardData()).queued;
            const [distributable, undistributed] = await compounder.pendingRewards();
            expect(queued).to.gt(0n);
            expect(distributable).to.gt(0n);
            expect(undistributed).to.gt(0n);
            expect(await token.balanceOf(strategy.getAddress())).to.eq(
              (await compounder.totalAssets()) + queued + distributable + undistributed
            );
            expect(await token.balanceOf(strategy.getAddress())).to.eq(initialSupply + harvested);
          }

          const MockConcentratorStrategy = await ethers.getContractFactory("MockConcentratorStrategy", deployer);
          const newStrategy = await MockConcentratorStrategy.deploy(
            compounder.getAddress(),
            token.getAddress(),
            token.getAddress()
          );
          await expect(compounder.migrateStrategy(newStrategy.getAddress()))
            .to.emit(compounder, "Migrate")
            .withArgs(await strategy.getAddress(), await newStrategy.getAddress());
          expect(await compounder.strategy()).to.eq(await newStrategy.getAddress());
          expect(await token.balanceOf(newStrategy.getAddress())).to.eq(initialSupply + harvested);
        });
      });
    });
  }
});

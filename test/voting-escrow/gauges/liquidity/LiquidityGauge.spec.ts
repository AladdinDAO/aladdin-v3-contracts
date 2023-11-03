import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  GaugeController,
  GovernanceToken,
  MockLiquidityGauge,
  MockERC20,
  TokenMinter,
  VotingEscrow,
  MockLiquidityManagerImmutable,
} from "@/types/index";
import { ethers, network } from "hardhat";
import { expect } from "chai";
import { ContractTransactionResponse, MaxUint256, ZeroAddress, ZeroHash, toBigInt } from "ethers";

describe("LiquidityGauge.spec", async () => {
  const Week = 86400 * 7;

  let deployer: HardhatEthersSigner;
  let holder0: HardhatEthersSigner;
  let holder1: HardhatEthersSigner;

  let token: MockERC20;
  let gov: GovernanceToken;
  let ve: VotingEscrow;
  let controller: GaugeController;
  let minter: TokenMinter;
  let gauge: MockLiquidityGauge;

  beforeEach(async () => {
    [deployer, holder0, holder1] = await ethers.getSigners();

    const GovernanceToken = await ethers.getContractFactory("GovernanceToken", deployer);
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow", deployer);
    const GaugeController = await ethers.getContractFactory("GaugeController", deployer);
    const TokenMinter = await ethers.getContractFactory("TokenMinter", deployer);

    gov = await GovernanceToken.deploy();
    ve = await VotingEscrow.deploy();
    controller = await GaugeController.deploy();
    minter = await TokenMinter.deploy();

    await gov.initialize(
      ethers.parseEther("1020000"), // initial supply
      ethers.parseEther("98000") / (86400n * 365n), // initial rate, 10%,
      1111111111111111111n, // rate reduction coefficient, 1/0.9 * 1e18,
      deployer.address,
      "Governance Token",
      "GOV"
    );
    await ve.initialize(deployer.address, gov.getAddress(), "Voting Escrow GOV", "veGOV", "1.0");
    await controller.initialize(deployer.address, gov.getAddress(), ve.getAddress());
    await minter.initialize(gov.getAddress(), controller.getAddress());
    await gov.set_minter(minter.getAddress());
    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400]);
    await gov.update_mining_parameters();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    const MockLiquidityGauge = await ethers.getContractFactory("MockLiquidityGauge", deployer);

    token = await MockERC20.deploy("LP Token", "LP", 18);
    gauge = await MockLiquidityGauge.deploy(minter.getAddress());

    await gauge.initialize(token.getAddress());
    await controller["add_type(string,uint256)"]("liquidity", 1);
    await controller["add_gauge(address,int128,uint256)"](gauge.getAddress(), 0, 1);
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      // from LinearMultipleRewardDistributor
      expect(await gauge.periodLength()).to.eq(Week);
      // from ERC20Upgradeable
      expect(await gauge.name()).to.eq("LP Token Gauge");
      expect(await gauge.symbol()).to.eq("LP-gauge");
      expect(await gauge.decimals()).to.eq(18);
      expect(await gauge.totalSupply()).to.eq(0n);

      // from LiquidityGauge
      expect(await gauge.governanceToken()).to.eq(await gov.getAddress());
      expect(await gauge.ve()).to.eq(await ve.getAddress());
      expect(await gauge.minter()).to.eq(await minter.getAddress());
      expect(await gauge.controller()).to.eq(await controller.getAddress());
      expect(await gauge.isActive()).to.eq(true);
      expect(await gauge.stakingToken()).to.eq(await token.getAddress());
      expect(await gauge.workingSupply()).to.eq(0n);
      expect((await gauge.inflationParams()).rate).to.eq(ethers.parseEther("98000") / (86400n * 365n));
      expect((await gauge.inflationParams()).futureEpochTime).to.eq(await gov.future_epoch_time_write.staticCall());
      expect((await gauge.snapshot()).timestamp).to.gt(0n);
      expect((await gauge.snapshot()).integral).to.eq(0n);
      expect(await gauge.manager()).to.eq(ZeroAddress);

      // revert
      await expect(gauge.initialize(token.getAddress())).to.revertedWith(
        "Initializable: contract is already initialized"
      );
    });
  });

  context("auth", async () => {
    context("#updateLiquidityManager", async () => {
      it("should revert, when non-admin call", async () => {
        await expect(gauge.connect(holder0).updateLiquidityManager(ZeroAddress)).to.revertedWith(
          "AccessControl: account " + holder0.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert, when old manager is active", async () => {
        const MockLiquidityManagerImmutable = await ethers.getContractFactory(
          "MockLiquidityManagerImmutable",
          deployer
        );
        const manager = await MockLiquidityManagerImmutable.deploy(gauge.getAddress(), token.getAddress());
        await gauge.updateLiquidityManager(manager.getAddress());

        await expect(gauge.updateLiquidityManager(manager.getAddress())).to.revertedWithCustomError(
          gauge,
          "LiquidityManagerIsActive"
        );
      });

      it("should revert, when new manager is not active", async () => {
        const MockLiquidityManagerImmutable = await ethers.getContractFactory(
          "MockLiquidityManagerImmutable",
          deployer
        );
        const manager = await MockLiquidityManagerImmutable.deploy(gauge.getAddress(), token.getAddress());
        await manager.kill();

        await expect(gauge.updateLiquidityManager(manager.getAddress())).to.revertedWithCustomError(
          gauge,
          "LiquidityManagerIsNotActive"
        );
      });

      it("should succeed", async () => {
        const MockLiquidityManagerImmutable = await ethers.getContractFactory(
          "MockLiquidityManagerImmutable",
          deployer
        );
        const manager1 = await MockLiquidityManagerImmutable.deploy(gauge.getAddress(), token.getAddress());
        const manager2 = await MockLiquidityManagerImmutable.deploy(gauge.getAddress(), token.getAddress());
        const manager3 = await MockLiquidityManagerImmutable.deploy(gauge.getAddress(), token.getAddress());

        // zero to manager1, no balance
        expect(await gauge.manager()).to.eq(ZeroAddress);
        await expect(gauge.updateLiquidityManager(manager1.getAddress()))
          .to.emit(gauge, "UpdateLiquidityManager")
          .withArgs(ZeroAddress, await manager1.getAddress());
        expect(await gauge.manager()).to.eq(await manager1.getAddress());
        // manager1 to manager2, no balance
        await manager1.kill();
        await expect(gauge.updateLiquidityManager(manager2.getAddress()))
          .to.emit(gauge, "UpdateLiquidityManager")
          .withArgs(await manager1.getAddress(), await manager2.getAddress());
        expect(await gauge.manager()).to.eq(await manager2.getAddress());
        // manager2 to manager3, some balance
        const balance = ethers.parseEther("100");
        await token.mint(gauge.getAddress(), balance);
        await manager2.kill();
        expect(await token.balanceOf(gauge.getAddress())).to.eq(balance);
        expect(await token.balanceOf(manager3.getAddress())).to.eq(0n);
        await expect(gauge.updateLiquidityManager(manager3.getAddress()))
          .to.emit(gauge, "UpdateLiquidityManager")
          .withArgs(await manager2.getAddress(), await manager3.getAddress())
          .to.emit(manager3, "Deposit")
          .withArgs(deployer.address, balance, true);
        expect(await gauge.manager()).to.eq(await manager3.getAddress());
        expect(await token.balanceOf(manager3.getAddress())).to.eq(balance);
        expect(await token.balanceOf(gauge.getAddress())).to.eq(0n);
        // manager3 to zero
        await expect(manager3.kill())
          .to.emit(manager3, "Withdraw")
          .withArgs(await gauge.getAddress(), balance);
        expect(await token.balanceOf(gauge.getAddress())).to.eq(balance);
        expect(await token.balanceOf(manager3.getAddress())).to.eq(0n);
        await expect(gauge.updateLiquidityManager(ZeroAddress))
          .to.emit(gauge, "UpdateLiquidityManager")
          .withArgs(await manager3.getAddress(), ZeroAddress);
        expect(await gauge.manager()).to.eq(ZeroAddress);
        expect(await token.balanceOf(gauge.getAddress())).to.eq(balance);
        expect(await token.balanceOf(manager3.getAddress())).to.eq(0n);
      });
    });

    context("#disableGauge", async () => {
      it("should revert, when non-admin call", async () => {
        await expect(gauge.connect(holder0).disableGauge()).to.revertedWith(
          "AccessControl: account " + holder0.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should succeed", async () => {
        expect(await gauge.isActive()).to.eq(true);
        await gauge.disableGauge();
        expect(await gauge.isActive()).to.eq(false);
      });
    });
  });

  context("reentrant", async () => {
    it("should prevent reentrant on deposit", async () => {
      await expect(gauge.reentrantCall(gauge.interface.encodeFunctionData("deposit(uint256)", [0n]))).to.revertedWith(
        "ReentrancyGuard: reentrant call"
      );
      await expect(
        gauge.reentrantCall(gauge.interface.encodeFunctionData("deposit(uint256,address)", [0n, ZeroAddress]))
      ).to.revertedWith("ReentrancyGuard: reentrant call");
      await expect(
        gauge.reentrantCall(
          gauge.interface.encodeFunctionData("deposit(uint256,address,bool)", [0n, ZeroAddress, false])
        )
      ).to.revertedWith("ReentrancyGuard: reentrant call");
    });

    it("should prevent reentrant on withdraw", async () => {
      await expect(gauge.reentrantCall(gauge.interface.encodeFunctionData("withdraw(uint256)", [0n]))).to.revertedWith(
        "ReentrancyGuard: reentrant call"
      );
      await expect(
        gauge.reentrantCall(gauge.interface.encodeFunctionData("withdraw(uint256,address)", [0n, ZeroAddress]))
      ).to.revertedWith("ReentrancyGuard: reentrant call");
    });

    it("should prevent reentrant on user_checkpoint", async () => {
      await expect(
        gauge.reentrantCall(gauge.interface.encodeFunctionData("user_checkpoint", [ZeroAddress]))
      ).to.revertedWith("ReentrancyGuard: reentrant call");
    });

    it("should prevent reentrant on checkpoint", async () => {
      await expect(
        gauge.reentrantCall(gauge.interface.encodeFunctionData("checkpoint", [ZeroAddress]))
      ).to.revertedWith("ReentrancyGuard: reentrant call");
    });

    it("should prevent reentrant on kick", async () => {
      await expect(gauge.reentrantCall(gauge.interface.encodeFunctionData("kick", [ZeroAddress]))).to.revertedWith(
        "ReentrancyGuard: reentrant call"
      );
    });

    it("should prevent reentrant on transfer", async () => {
      await expect(
        gauge.reentrantCall(gauge.interface.encodeFunctionData("transfer", [deployer.address, 0n]))
      ).to.revertedWith("ReentrancyGuard: reentrant call");
    });

    it("should prevent reentrant on transferFrom", async () => {
      await expect(
        gauge.reentrantCall(
          gauge.interface.encodeFunctionData("transferFrom", [deployer.address, deployer.address, 0n])
        )
      ).to.revertedWith("ReentrancyGuard: reentrant call");
    });
  });

  context("#kick", async () => {
    beforeEach(async () => {
      await gov.transfer(holder0.address, ethers.parseEther("100"));
      await gov.transfer(holder1.address, ethers.parseEther("200000"));
      await gov.connect(holder0).approve(ve.getAddress(), MaxUint256);
      await gov.connect(holder1).approve(ve.getAddress(), MaxUint256);
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      await ve.connect(holder0).create_lock(1, timestamp + 365 * 86400);
      await ve.connect(holder1).create_lock(ethers.parseEther("100000"), timestamp + 365 * 86400 * 4);
      await token.mint(holder0.address, ethers.parseEther("100"));
      await token.mint(holder1.address, ethers.parseEther("100"));
      await token.connect(holder0).approve(gauge.getAddress(), MaxUint256);
      await token.connect(holder1).approve(gauge.getAddress(), MaxUint256);
      await gauge.connect(holder0)["deposit(uint256)"](ethers.parseEther("1"));
      await gauge.connect(holder1)["deposit(uint256)"](ethers.parseEther("10"));
    });

    it("should revert, when kick not allowed", async () => {
      await ve.connect(holder0).increase_amount(ethers.parseEther("1"));
      await gauge.connect(holder0)["deposit(uint256)"](ethers.parseEther("1"));
      await expect(gauge.kick(holder0.address)).to.revertedWithCustomError(gauge, "KickNotAllowed");
    });

    it("should revert, when kick not needed", async () => {
      await ve.connect(holder0).increase_amount(ethers.parseEther("1"));
      await expect(gauge.kick(holder0.address)).to.revertedWithCustomError(gauge, "KickNotNeeded");
    });

    it("should succeed", async () => {
      await ve.connect(holder1).increase_amount(ethers.parseEther("1"));
      const us = await gauge.userSnapshot(holder1.address);
      await expect(gauge.kick(holder1.address)).to.emit(gauge, "UpdateLiquidityLimit");
      expect((await gauge.userSnapshot(holder1.address)).checkpoint.timestamp).to.gt(us.checkpoint.timestamp);
    });
  });

  context("without extra rewards", async () => {
    it("should revert, when call checkpoint", async () => {
      await expect(gauge.connect(holder0).checkpoint(holder1.address)).to.revertedWithCustomError(
        gauge,
        "UnauthorizedCaller"
      );
      await expect(gauge.connect(holder0).user_checkpoint(holder1.address)).to.revertedWithCustomError(
        gauge,
        "UnauthorizedCaller"
      );
    });

    it("should revert, when deposit zero amount", async () => {
      await expect(gauge["deposit(uint256)"](0n)).to.revertedWithCustomError(gauge, "DepositZeroAmount");
      await expect(gauge["deposit(uint256,address)"](0n, ZeroAddress)).to.revertedWithCustomError(
        gauge,
        "DepositZeroAmount"
      );
      await expect(gauge["deposit(uint256,address,bool)"](0n, ZeroAddress, false)).to.revertedWithCustomError(
        gauge,
        "DepositZeroAmount"
      );
    });

    it("should revert, when withdraw zero amount", async () => {
      await expect(gauge["withdraw(uint256)"](0n)).to.revertedWithCustomError(gauge, "WithdrawZeroAmount");
      await expect(gauge["withdraw(uint256,address)"](0n, ZeroAddress)).to.revertedWithCustomError(
        gauge,
        "WithdrawZeroAmount"
      );
    });

    const generateTest = async (hasVe: boolean, hasManager: boolean, useManager: boolean, activeManager: boolean) => {
      if (!hasManager && useManager) return;
      if (!hasManager && activeManager) return;
      context(
        `deposit & withdraw & claim hasVe[${hasVe}] hasManager[${hasManager}] useManager[${useManager}] activeManager[${activeManager}]`,
        async () => {
          let manager: MockLiquidityManagerImmutable;
          let rate: bigint;
          let startEmissionTime: number;
          let nextEpochTime: number;

          beforeEach(async () => {
            if (hasVe) {
              await gov.transfer(holder0.address, ethers.parseEther("456"));
              await gov.transfer(holder1.address, ethers.parseEther("123"));
              await gov.connect(holder0).approve(ve.getAddress(), MaxUint256);
              await gov.connect(holder1).approve(ve.getAddress(), MaxUint256);
              const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
              await ve.connect(holder0).create_lock(ethers.parseEther("456"), timestamp + 365 * 86400 * 3);
              await ve.connect(holder1).create_lock(ethers.parseEther("123"), timestamp + 365 * 86400 * 3);
            }

            if (hasManager) {
              const MockLiquidityManagerImmutable = await ethers.getContractFactory(
                "MockLiquidityManagerImmutable",
                deployer
              );
              manager = await MockLiquidityManagerImmutable.deploy(gauge.getAddress(), token.getAddress());
              await gauge.updateLiquidityManager(manager.getAddress());
              if (!activeManager) await manager.kill();
            }
            await token.mint(holder0.address, ethers.parseEther("1000000"));
            await token.mint(holder1.address, ethers.parseEther("1000000"));
            await token.mint(deployer.address, ethers.parseEther("1000000"));
            await token.connect(holder0).approve(gauge.getAddress(), MaxUint256);
            await token.connect(holder1).approve(gauge.getAddress(), MaxUint256);
            await token.connect(deployer).approve(gauge.getAddress(), MaxUint256);

            rate = 3107559614408929n;
            startEmissionTime = Number(await controller.time_weight(gauge.getAddress()));
            nextEpochTime = Number((await gauge.inflationParams()).futureEpochTime);
          });

          const checkSupply = async (
            tx: ContractTransactionResponse,
            account: string,
            prevSupply: bigint,
            prevBalance: bigint,
            prevWorkingSupply: bigint,
            prevWorkingBalance: bigint,
            delta: bigint
          ) => {
            if (hasManager && activeManager) {
              expect(await token.balanceOf(manager.getAddress())).to.eq(prevSupply + delta);
            } else {
              expect(await token.balanceOf(gauge.getAddress())).to.eq(prevSupply + delta);
            }
            expect(await gauge.balanceOf(account)).to.eq(prevBalance + delta);
            const veBalance = await ve["balanceOf(address)"](account);
            const veSupply = await ve["totalSupply()"]();
            const balance = prevBalance + delta;
            let workingBalance = (balance * 4n) / 10n;
            if (veSupply > 0) {
              workingBalance += (((veBalance * (prevSupply + delta)) / veSupply) * 6n) / 10n;
            }
            if (workingBalance > balance) {
              workingBalance = balance;
            }
            expect(await gauge.workingBalanceOf(account)).to.eq(workingBalance);
            expect(await gauge.workingSupply()).to.eq(prevWorkingSupply - prevWorkingBalance + workingBalance);
            if (hasManager && activeManager && delta > 0) {
              await expect(tx).to.emit(manager, "Deposit").withArgs(account, delta, useManager);
            }
            await expect(tx)
              .to.emit(gauge, "UpdateLiquidityLimit")
              .withArgs(
                account,
                balance,
                prevSupply + delta,
                workingBalance,
                prevWorkingSupply - prevWorkingBalance + workingBalance
              );
          };

          const checkSnapshot = async (
            account: string,
            prevTs: number,
            nowTs: number,
            prevIntegral: bigint,
            prevWorkingSupply: bigint,
            prevWorkingBalance: bigint,
            prevUserIntegral: bigint,
            prevPendingGOV: bigint
          ) => {
            for (let t = Math.floor(prevTs / Week) * Week; t < nowTs; t += Week) {
              const tl = Math.max(prevTs, t);
              const tr = Math.min(nowTs, t + Week);
              if (tr <= tl) break;
              // before startEmissionTime, weight is 0
              // after startEmissionTime, weight is 1
              const weight = tr <= startEmissionTime ? 0n : 10n ** 18n;
              if (tl <= nextEpochTime && nextEpochTime < tr) {
                if (prevWorkingSupply > 0n) {
                  prevIntegral += (rate * weight * toBigInt(nextEpochTime - tl)) / prevWorkingSupply;
                }
                rate = 2796803652968036n;
                if (prevWorkingSupply > 0n) {
                  prevIntegral += (rate * weight * toBigInt(tr - nextEpochTime)) / prevWorkingSupply;
                }
              } else {
                if (prevWorkingSupply > 0n) {
                  prevIntegral += (rate * weight * toBigInt(tr - tl)) / prevWorkingSupply;
                }
              }
            }
            expect((await gauge.snapshot()).timestamp).to.eq(nowTs);
            expect((await gauge.snapshot()).integral).to.eq(prevIntegral);
            expect((await gauge.userSnapshot(account)).checkpoint.timestamp).to.eq(nowTs);
            expect((await gauge.userSnapshot(account)).checkpoint.integral).to.eq(prevIntegral);
            expect((await gauge.userSnapshot(account)).rewards.claimed).to.eq(0n);
            expect((await gauge.userSnapshot(account)).rewards.pending).to.eq(
              prevPendingGOV + ((prevIntegral - prevUserIntegral) * prevWorkingBalance) / 10n ** 18n
            );
          };

          it("should succeed", async () => {
            const a0 = ethers.parseEther("123");
            const a1 = ethers.parseEther("321");
            const a2 = ethers.parseEther("345");
            const a3 = ethers.parseEther("456");
            const a4 = ethers.parseEther("1234");
            const a5 = ethers.parseEther("111");
            const a6 = ethers.parseEther("222");
            const a7 = MaxUint256;
            const a8 = MaxUint256;
            const startTime = (await gauge.snapshot()).timestamp;
            expect((await gauge.inflationParams()).rate).to.eq(3107559614408929n);

            // at t0, holder0 deposit 123 to self, holder0 has 123
            const tx0 = hasManager
              ? await gauge.connect(holder0)["deposit(uint256,address,bool)"](a0, holder0.address, useManager)
              : await gauge.connect(holder0)["deposit(uint256)"](a0);
            await tx0.wait();
            await expect(tx0).to.emit(gauge, "Deposit").withArgs(holder0.address, holder0.address, a0);
            const t0 = (await ethers.provider.getBlock("latest"))!.timestamp;
            const ws0 = await gauge.workingSupply();
            // const wb00 = await gauge.workingBalanceOf(holder0.address);
            const wb10 = await gauge.workingBalanceOf(holder1.address);
            const i0 = (await gauge.snapshot()).integral;
            // const us00 = await gauge.userSnapshot(holder0.address);
            const us10 = await gauge.userSnapshot(holder1.address);
            await checkSnapshot(holder0.address, Number(startTime), t0, 0n, 0n, 0n, 0n, 0n);
            await checkSupply(tx0, holder0.address, 0n, 0n, 0n, 0n, a0);
            // at t1 = t0 + 86400 * 3, holder0 deposit 321 to holder1, holder0 has 123, holder1 has 321
            await network.provider.send("evm_setNextBlockTimestamp", [t0 + 86400 * 3]);
            const tx1 = hasManager
              ? await gauge.connect(holder0)["deposit(uint256,address,bool)"](a1, holder1.address, useManager)
              : await gauge.connect(holder0)["deposit(uint256,address)"](a1, holder1.address);
            await tx1.wait();
            await expect(tx1).to.emit(gauge, "Deposit").withArgs(holder0.address, holder1.address, a1);
            const t1 = (await ethers.provider.getBlock("latest"))!.timestamp;
            const ws1 = await gauge.workingSupply();
            const wb01 = await gauge.workingBalanceOf(holder0.address);
            // const wb11 = await gauge.workingBalanceOf(holder1.address);
            const i1 = (await gauge.snapshot()).integral;
            const us01 = await gauge.userSnapshot(holder0.address);
            // const us11 = await gauge.userSnapshot(holder1.address);
            await checkSnapshot(holder1.address, t0, t1, i0, ws0, wb10, us10.checkpoint.integral, us10.rewards.pending);
            await checkSupply(tx1, holder1.address, a0, 0n, ws0, 0n, a1);

            // at t2 = t1 + 86400 * 5, holder1 deposit 345 to holder0, holder0 has 468, holder1 has 321
            await network.provider.send("evm_setNextBlockTimestamp", [t1 + 86400 * 5]);
            const tx2 = hasManager
              ? await gauge.connect(holder1)["deposit(uint256,address,bool)"](a2, holder0.address, useManager)
              : await gauge.connect(holder1)["deposit(uint256,address)"](a2, holder0.address);
            await tx2.wait();
            await expect(tx2).to.emit(gauge, "Deposit").withArgs(holder1.address, holder0.address, a2);
            const t2 = (await ethers.provider.getBlock("latest"))!.timestamp;
            const ws2 = await gauge.workingSupply();
            // const wb02 = await gauge.workingBalanceOf(holder0.address);
            const wb12 = await gauge.workingBalanceOf(holder1.address);
            const i2 = (await gauge.snapshot()).integral;
            // const us02 = await gauge.userSnapshot(holder0.address);
            const us12 = await gauge.userSnapshot(holder1.address);
            await checkSnapshot(holder0.address, t1, t2, i1, ws1, wb01, us01.checkpoint.integral, us01.rewards.pending);
            await checkSupply(tx2, holder0.address, a0 + a1, a0, ws1, wb01, a2);

            // at t3 = t2 + 86400 * 7, holder1 deposit 456 to self, holder0 has 468, holder1 has 777
            await network.provider.send("evm_setNextBlockTimestamp", [t2 + 86400 * 7]);
            const tx3 = hasManager
              ? await gauge.connect(holder1)["deposit(uint256,address,bool)"](a3, holder1.address, useManager)
              : await gauge.connect(holder1)["deposit(uint256,address)"](a3, holder1.address);
            await tx3.wait();
            await expect(tx3).to.emit(gauge, "Deposit").withArgs(holder1.address, holder1.address, a3);
            const t3 = (await ethers.provider.getBlock("latest"))!.timestamp;
            const ws3 = await gauge.workingSupply();
            // const wb03 = await gauge.workingBalanceOf(holder0.address);
            // const wb13 = await gauge.workingBalanceOf(holder1.address);
            const i3 = (await gauge.snapshot()).integral;
            // const us03 = await gauge.userSnapshot(holder0.address);
            // const us13 = await gauge.userSnapshot(holder1.address);
            await checkSnapshot(holder1.address, t2, t3, i2, ws2, wb12, us12.checkpoint.integral, us12.rewards.pending);
            await checkSupply(tx3, holder1.address, a0 + a1 + a2, a1, ws2, wb12, a3);

            // at t4 = t3 + 86400 * 365, deployer deposit 1234 to self
            await network.provider.send("evm_setNextBlockTimestamp", [t3 + 86400 * 365]);
            const tx4 = hasManager
              ? await gauge.connect(deployer)["deposit(uint256,address,bool)"](a4, deployer.address, useManager)
              : await gauge.connect(deployer)["deposit(uint256)"](a4);
            await tx4.wait();
            await expect(tx4).to.emit(gauge, "Deposit").withArgs(deployer.address, deployer.address, a4);
            let t4 = (await ethers.provider.getBlock("latest"))!.timestamp;
            let ws4 = await gauge.workingSupply();
            let wb04 = await gauge.workingBalanceOf(holder0.address);
            // let wb14 = await gauge.workingBalanceOf(holder1.address);
            let i4 = (await gauge.snapshot()).integral;
            await checkSnapshot(deployer.address, t3, t4, i3, ws3, 0n, 0n, 0n);
            await checkSupply(tx4, deployer.address, a0 + a1 + a2 + a3, 0n, ws3, 0n, a4);
            expect((await gauge.inflationParams()).rate).to.eq(2796803652968036n);

            // holder0 checkpoint
            await gauge.connect(holder0).checkpoint(holder0.address);

            // holder1 checkpoint
            await gauge.connect(holder1).checkpoint(holder1.address);

            for (let i = 0; i < 5; ++i) {
              // holder0 mint GOV
              {
                const before = await gov.balanceOf(holder0.address);
                await minter.connect(holder0).mint(gauge.getAddress());
                const after = await gov.balanceOf(holder0.address);
                expect(after).to.gt(before);
              }

              // holder1 mint GOV
              {
                const before = await gov.balanceOf(holder1.address);
                await minter.connect(holder1).mint(gauge.getAddress());
                const after = await gov.balanceOf(holder1.address);
                expect(after).to.gt(before);
              }
            }

            t4 = (await ethers.provider.getBlock("latest"))!.timestamp;
            const us04 = await gauge.userSnapshot(holder0.address);
            // const us14 = await gauge.userSnapshot(holder1.address);
            ws4 = await gauge.workingSupply();
            wb04 = await gauge.workingBalanceOf(holder0.address);
            // wb14 = await gauge.workingBalanceOf(holder1.address);
            i4 = (await gauge.snapshot()).integral;

            // at t5 = t4 + 86400 * 4, holder 0 withdraw 111 to holder 1
            await network.provider.send("evm_setNextBlockTimestamp", [t4 + 86400 * 4]);
            const tx5 = await gauge.connect(holder0)["withdraw(uint256,address)"](a5, holder1.address);
            await tx5.wait();
            await expect(tx5).to.emit(gauge, "Withdraw").withArgs(holder0.address, holder1.address, a5);
            if (hasManager && activeManager) {
              await expect(tx5).to.emit(manager, "Withdraw").withArgs(holder1.address, a5);
            }
            const t5 = (await ethers.provider.getBlock("latest"))!.timestamp;
            // const us05 = await gauge.userSnapshot(holder0.address);
            const us15 = await gauge.userSnapshot(holder1.address);
            const ws5 = await gauge.workingSupply();
            // const wb05 = await gauge.workingBalanceOf(holder0.address);
            const wb15 = await gauge.workingBalanceOf(holder1.address);
            const i5 = (await gauge.snapshot()).integral;
            await checkSnapshot(holder0.address, t4, t5, i4, ws4, wb04, us04.checkpoint.integral, us04.rewards.pending);
            await checkSupply(tx5, holder0.address, a0 + a1 + a2 + a3 + a4, a0 + a2, ws4, wb04, -a5);

            // at t6 = t5 + 86400 * 7, holder 1 withdraw 222 to holder 0
            await network.provider.send("evm_setNextBlockTimestamp", [t5 + 86400 * 7]);
            const tx6 = await gauge.connect(holder1)["withdraw(uint256,address)"](a6, holder0.address);
            await tx6.wait();
            await expect(tx6).to.emit(gauge, "Withdraw").withArgs(holder1.address, holder0.address, a6);
            if (hasManager && activeManager) {
              await expect(tx6).to.emit(manager, "Withdraw").withArgs(holder0.address, a6);
            }
            const t6 = (await ethers.provider.getBlock("latest"))!.timestamp;
            await checkSnapshot(holder1.address, t5, t6, i5, ws5, wb15, us15.checkpoint.integral, us15.rewards.pending);
            await checkSupply(tx6, holder1.address, a0 + a1 + a2 + a3 + a4 - a5, a1 + a3, ws5, wb15, -a6);

            // at t7 = t6 + 86400 * 100, holder 0 withdraw all to holder 0
            await network.provider.send("evm_setNextBlockTimestamp", [t6 + 86400 * 100]);
            const balance0 = await gauge.balanceOf(holder0.address);
            const tx7 = await gauge.connect(holder0)["withdraw(uint256)"](a7);
            await tx7.wait();
            await expect(tx7).to.emit(gauge, "Withdraw").withArgs(holder0.address, holder0.address, balance0);
            if (hasManager && activeManager) {
              await expect(tx7).to.emit(manager, "Withdraw").withArgs(holder0.address, balance0);
            }
            const t7 = (await ethers.provider.getBlock("latest"))!.timestamp;
            expect(await gauge.balanceOf(holder0.address)).to.eq(0n);
            expect(await gauge.workingBalanceOf(holder0.address)).to.eq(0n);

            // at t8 = t7 + 86400 * 300, holder 1 withdraw all to holder 1
            await network.provider.send("evm_setNextBlockTimestamp", [t7 + 86400 * 300]);
            const balance1 = await gauge.balanceOf(holder1.address);
            const tx8 = await gauge.connect(holder1)["withdraw(uint256)"](a8);
            await tx8.wait();
            await expect(tx8).to.emit(gauge, "Withdraw").withArgs(holder1.address, holder1.address, balance1);
            if (hasManager && activeManager) {
              await expect(tx8).to.emit(manager, "Withdraw").withArgs(holder1.address, balance1);
            }
            // const t8 = (await ethers.provider.getBlock("latest"))!.timestamp;
            expect(await gauge.balanceOf(holder0.address)).to.eq(0n);
            expect(await gauge.balanceOf(holder1.address)).to.eq(0n);
            expect(await gauge.workingBalanceOf(holder0.address)).to.eq(0n);
            expect(await gauge.workingBalanceOf(holder1.address)).to.eq(0n);
            expect((await gauge.inflationParams()).rate).to.eq(2517123287671232n);

            for (let i = 0; i < 10; ++i) {
              // holder0 mint GOV
              {
                const before = await gov.balanceOf(holder0.address);
                await minter.connect(holder0).mint(gauge.getAddress());
                const after = await gov.balanceOf(holder0.address);
                if (i === 0) expect(after).to.gt(before);
                else expect(after).to.eq(before);
              }

              // holder1 mint GOV
              {
                const before = await gov.balanceOf(holder1.address);
                await minter.connect(holder1).mint(gauge.getAddress());
                const after = await gov.balanceOf(holder1.address);
                if (i === 0) expect(after).to.gt(before);
                else expect(after).to.eq(before);
              }
            }
            expect(await gov.balanceOf(holder0.address)).to.eq(await gauge.integrate_fraction(holder0.address));
            expect(await gov.balanceOf(holder1.address)).to.eq(await gauge.integrate_fraction(holder1.address));

            // holder0 deposit max
            {
              const balance = await token.balanceOf(holder0.address);
              await expect(gauge.connect(holder0)["deposit(uint256)"](MaxUint256))
                .to.emit(gauge, "Deposit")
                .withArgs(holder0.address, holder0.address, balance);
            }
            // holder1 deposit max
            {
              const balance = await token.balanceOf(holder1.address);
              await expect(gauge.connect(holder1)["deposit(uint256,address)"](MaxUint256, holder0.address))
                .to.emit(gauge, "Deposit")
                .withArgs(holder1.address, holder0.address, balance);
            }

            // transfer should checkpoint
            {
              const us0 = await gauge.userSnapshot(holder0.address);
              const us1 = await gauge.userSnapshot(holder1.address);
              const s = await gauge.snapshot();
              await expect(gauge.connect(holder0).transfer(holder1.address, ethers.parseEther("1"))).to.emit(
                gauge,
                "UpdateLiquidityLimit"
              );
              expect((await gauge.userSnapshot(holder0.address)).checkpoint.timestamp).to.gt(us0.checkpoint.timestamp);
              expect((await gauge.userSnapshot(holder1.address)).checkpoint.timestamp).to.gt(us1.checkpoint.timestamp);
              expect((await gauge.snapshot()).timestamp).to.gt(s.timestamp);

              await expect(gauge.connect(holder0).transfer(holder1.address, 0n)).to.not.emit(
                gauge,
                "UpdateLiquidityLimit"
              );
            }

            // kill gauge
            await gauge.disableGauge();
            {
              const s = await gauge.snapshot();
              const us = await gauge.userSnapshot(holder0.address);
              await gauge.connect(holder0).checkpoint(holder0.address);
              expect((await gauge.snapshot()).integral).to.eq(s.integral);
              expect((await gauge.userSnapshot(holder0.address)).checkpoint.integral).to.eq(us.checkpoint.integral);
            }
            {
              const s = await gauge.snapshot();
              const us = await gauge.userSnapshot(holder1.address);
              await gauge.connect(holder1).checkpoint(holder1.address);
              expect((await gauge.snapshot()).integral).to.eq(s.integral);
              expect((await gauge.userSnapshot(holder1.address)).checkpoint.integral).to.eq(us.checkpoint.integral);
            }
          });
        }
      );
    };

    for (const hasVe of [false, true]) {
      for (const hasManager of [false, true]) {
        for (const useManager of [false, true]) {
          for (const activeManager of [false, true]) {
            generateTest(hasVe, hasManager, useManager, activeManager);
          }
        }
      }
    }
  });

  context("with extra rewards", async () => {
    let rewardToken0: MockERC20;
    let rewardToken1: MockERC20;

    beforeEach(async () => {
      const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
      rewardToken0 = await MockERC20.deploy("Reward Token 0", "RT0", 18);
      rewardToken1 = await MockERC20.deploy("Reward Token 1", "RT1", 18);
      await rewardToken0.mint(deployer.address, ethers.parseEther("1000000"));
      await rewardToken1.mint(deployer.address, ethers.parseEther("1000000"));
      await rewardToken0.approve(gauge.getAddress(), MaxUint256);
      await rewardToken1.approve(gauge.getAddress(), MaxUint256);

      await gauge.grantRole(await gauge.REWARD_MANAGER_ROLE(), deployer.address);
      await gauge.registerRewardToken(rewardToken0.getAddress(), deployer.address);
      await gauge.registerRewardToken(rewardToken1.getAddress(), deployer.address);
      await token.mint(holder0.address, ethers.parseEther("1000000"));
      await token.mint(holder1.address, ethers.parseEther("1000000"));
      await token.connect(holder0).approve(gauge.getAddress(), MaxUint256);
      await token.connect(holder1).approve(gauge.getAddress(), MaxUint256);
    });

    context("#claim without setting rewardReceiver", async () => {
      const BaseRewardAmount = ethers.parseEther("2233");
      const TotalPoolShare = ethers.parseEther("1234");
      const UserPoolShare = ethers.parseEther("456");

      beforeEach(async () => {
        await gauge.connect(holder0)["deposit(uint256)"](UserPoolShare);
        await gauge.connect(holder1)["deposit(uint256)"](TotalPoolShare - UserPoolShare);
        expect(await gauge.balanceOf(holder0.address)).to.eq(UserPoolShare);
        expect(await gauge.totalSupply()).to.eq(TotalPoolShare);

        await gauge.depositReward(rewardToken0.getAddress(), BaseRewardAmount);
        await gauge.depositReward(rewardToken1.getAddress(), BaseRewardAmount * 2n);

        const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + Week]);
        await gauge.connect(holder0).checkpoint(holder0.address);
      });

      it("should revert when claim other to other", async () => {
        await expect(gauge["claim(address,address)"](holder0.address, deployer.address)).to.revertedWithCustomError(
          gauge,
          "ClaimOthersRewardToAnother"
        );
        await expect(gauge["claim(address,address)"](holder0.address, holder0.address)).to.revertedWithCustomError(
          gauge,
          "ClaimOthersRewardToAnother"
        );
      });

      it("should succeed when claim caller", async () => {
        const claimable0 = await gauge.claimable(holder0.address, rewardToken0.getAddress());
        const claimable1 = await gauge.claimable(holder0.address, rewardToken1.getAddress());
        const before0 = await rewardToken0.balanceOf(holder0.address);
        const before1 = await rewardToken1.balanceOf(holder0.address);
        let snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        let snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.gt(0n);
        expect(snapshot0.rewards.claimed).to.eq(0n);
        expect(snapshot1.rewards.pending).to.gt(0n);
        expect(snapshot1.rewards.claimed).to.eq(0n);
        const tx = gauge.connect(holder0)["claim()"]();
        await expect(tx)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken0.getAddress(), holder0.address, claimable0)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken1.getAddress(), holder0.address, claimable1);
        expect(await gauge.claimable(holder0.address, rewardToken0.getAddress())).to.eq(0n);
        expect(await gauge.claimable(holder0.address, rewardToken1.getAddress())).to.eq(0n);
        expect(await rewardToken0.balanceOf(holder0.address)).to.eq(before0 + claimable0);
        expect(await rewardToken1.balanceOf(holder0.address)).to.eq(before1 + claimable1);
        expect(await gauge.claimed(holder0.address, rewardToken0.getAddress())).to.eq(claimable0);
        expect(await gauge.claimed(holder0.address, rewardToken1.getAddress())).to.eq(claimable1);
        snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.eq(0n);
        expect(snapshot0.rewards.claimed).to.eq(claimable0);
        expect(snapshot1.rewards.pending).to.eq(0n);
        expect(snapshot1.rewards.claimed).to.eq(claimable1);
        await expect(gauge.connect(holder0)["claim()"]()).to.not.emit(gauge, "Claim");
      });

      it("should succeed when claim other", async () => {
        const claimable0 = await gauge.claimable(holder0.address, rewardToken0.getAddress());
        const claimable1 = await gauge.claimable(holder0.address, rewardToken1.getAddress());
        const before0 = await rewardToken0.balanceOf(holder0.address);
        const before1 = await rewardToken1.balanceOf(holder0.address);
        let snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        let snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.gt(0n);
        expect(snapshot0.rewards.claimed).to.eq(0n);
        expect(snapshot1.rewards.pending).to.gt(0n);
        expect(snapshot1.rewards.claimed).to.eq(0n);
        const tx = gauge.connect(deployer)["claim(address)"](holder0.address);
        await expect(tx)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken0.getAddress(), holder0.address, claimable0)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken1.getAddress(), holder0.address, claimable1);
        expect(await gauge.claimable(holder0.address, rewardToken0.getAddress())).to.eq(0n);
        expect(await gauge.claimable(holder0.address, rewardToken1.getAddress())).to.eq(0n);
        expect(await rewardToken0.balanceOf(holder0.address)).to.eq(before0 + claimable0);
        expect(await rewardToken1.balanceOf(holder0.address)).to.eq(before1 + claimable1);
        expect(await gauge.claimed(holder0.address, rewardToken0.getAddress())).to.eq(claimable0);
        expect(await gauge.claimed(holder0.address, rewardToken1.getAddress())).to.eq(claimable1);
        snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.eq(0n);
        expect(snapshot0.rewards.claimed).to.eq(claimable0);
        expect(snapshot1.rewards.pending).to.eq(0n);
        expect(snapshot1.rewards.claimed).to.eq(claimable1);
        await expect(gauge.connect(deployer)["claim(address)"](holder0.address)).to.not.emit(gauge, "Claim");
      });

      it("should succeed when claim to other", async () => {
        const claimable0 = await gauge.claimable(holder0.address, rewardToken0.getAddress());
        const claimable1 = await gauge.claimable(holder0.address, rewardToken1.getAddress());
        const before0 = await rewardToken0.balanceOf(holder1.address);
        const before1 = await rewardToken1.balanceOf(holder1.address);
        let snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        let snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.gt(0n);
        expect(snapshot0.rewards.claimed).to.eq(0n);
        expect(snapshot1.rewards.pending).to.gt(0n);
        expect(snapshot1.rewards.claimed).to.eq(0n);
        const tx = gauge.connect(holder0)["claim(address,address)"](holder0.address, holder1.address);
        await expect(tx)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken0.getAddress(), holder1.address, claimable0)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken1.getAddress(), holder1.address, claimable1);
        expect(await gauge.claimable(holder0.address, rewardToken0.getAddress())).to.eq(0n);
        expect(await gauge.claimable(holder0.address, rewardToken1.getAddress())).to.eq(0n);
        expect(await rewardToken0.balanceOf(holder1.address)).to.eq(before0 + claimable0);
        expect(await rewardToken1.balanceOf(holder1.address)).to.eq(before1 + claimable1);
        expect(await gauge.claimed(holder0.address, rewardToken0.getAddress())).to.eq(claimable0);
        expect(await gauge.claimed(holder0.address, rewardToken1.getAddress())).to.eq(claimable1);
        snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.eq(0n);
        expect(snapshot0.rewards.claimed).to.eq(claimable0);
        expect(snapshot1.rewards.pending).to.eq(0n);
        expect(snapshot1.rewards.claimed).to.eq(claimable1);
        await expect(gauge.connect(holder0)["claim(address,address)"](holder0.address, holder1.address)).to.not.emit(
          gauge,
          "Claim"
        );
      });
    });

    context("#claim with setting rewardReceiver", async () => {
      const BaseRewardAmount = ethers.parseEther("2233");
      const TotalPoolShare = ethers.parseEther("1234");
      const UserPoolShare = ethers.parseEther("456");

      beforeEach(async () => {
        await gauge.connect(holder0)["deposit(uint256)"](UserPoolShare);
        await gauge.connect(holder1)["deposit(uint256)"](TotalPoolShare - UserPoolShare);
        expect(await gauge.balanceOf(holder0.address)).to.eq(UserPoolShare);
        expect(await gauge.totalSupply()).to.eq(TotalPoolShare);

        await gauge.depositReward(rewardToken0.getAddress(), BaseRewardAmount);
        await gauge.depositReward(rewardToken1.getAddress(), BaseRewardAmount * 2n);

        const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + Week]);
        await gauge.connect(holder0).checkpoint(holder0.address);
        await gauge.connect(holder0).setRewardReceiver(holder1.address);
      });

      it("should revert when claim other to other", async () => {
        await expect(gauge["claim(address,address)"](holder0.address, deployer.address)).to.revertedWithCustomError(
          gauge,
          "ClaimOthersRewardToAnother"
        );
        await expect(gauge["claim(address,address)"](holder0.address, holder0.address)).to.revertedWithCustomError(
          gauge,
          "ClaimOthersRewardToAnother"
        );
      });

      it("should succeed when claim caller", async () => {
        const claimable0 = await gauge.claimable(holder0.address, rewardToken0.getAddress());
        const claimable1 = await gauge.claimable(holder0.address, rewardToken1.getAddress());
        const before0 = await rewardToken0.balanceOf(holder1.address);
        const before1 = await rewardToken1.balanceOf(holder1.address);
        let snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        let snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.gt(0n);
        expect(snapshot0.rewards.claimed).to.eq(0n);
        expect(snapshot1.rewards.pending).to.gt(0n);
        expect(snapshot1.rewards.claimed).to.eq(0n);
        const tx = gauge.connect(holder0)["claim()"]();
        await expect(tx)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken0.getAddress(), holder1.address, claimable0)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken1.getAddress(), holder1.address, claimable1);
        expect(await gauge.claimable(holder0.address, rewardToken0.getAddress())).to.eq(0n);
        expect(await gauge.claimable(holder0.address, rewardToken1.getAddress())).to.eq(0n);
        expect(await rewardToken0.balanceOf(holder1.address)).to.eq(before0 + claimable0);
        expect(await rewardToken1.balanceOf(holder1.address)).to.eq(before1 + claimable1);
        expect(await gauge.claimed(holder0.address, rewardToken0.getAddress())).to.eq(claimable0);
        expect(await gauge.claimed(holder0.address, rewardToken1.getAddress())).to.eq(claimable1);
        snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.eq(0n);
        expect(snapshot0.rewards.claimed).to.eq(claimable0);
        expect(snapshot1.rewards.pending).to.eq(0n);
        expect(snapshot1.rewards.claimed).to.eq(claimable1);
        await expect(gauge.connect(holder0)["claim()"]()).to.not.emit(gauge, "Claim");
      });

      it("should succeed when claim other", async () => {
        const claimable0 = await gauge.claimable(holder0.address, rewardToken0.getAddress());
        const claimable1 = await gauge.claimable(holder0.address, rewardToken1.getAddress());
        const before0 = await rewardToken0.balanceOf(holder1.address);
        const before1 = await rewardToken1.balanceOf(holder1.address);
        let snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        let snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.gt(0n);
        expect(snapshot0.rewards.claimed).to.eq(0n);
        expect(snapshot1.rewards.pending).to.gt(0n);
        expect(snapshot1.rewards.claimed).to.eq(0n);
        const tx = gauge.connect(deployer)["claim(address)"](holder0.address);
        await expect(tx)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken0.getAddress(), holder1.address, claimable0)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken1.getAddress(), holder1.address, claimable1);
        expect(await gauge.claimable(holder0.address, rewardToken0.getAddress())).to.eq(0n);
        expect(await gauge.claimable(holder0.address, rewardToken1.getAddress())).to.eq(0n);
        expect(await rewardToken0.balanceOf(holder1.address)).to.eq(before0 + claimable0);
        expect(await rewardToken1.balanceOf(holder1.address)).to.eq(before1 + claimable1);
        expect(await gauge.claimed(holder0.address, rewardToken0.getAddress())).to.eq(claimable0);
        expect(await gauge.claimed(holder0.address, rewardToken1.getAddress())).to.eq(claimable1);
        snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.eq(0n);
        expect(snapshot0.rewards.claimed).to.eq(claimable0);
        expect(snapshot1.rewards.pending).to.eq(0n);
        expect(snapshot1.rewards.claimed).to.eq(claimable1);
        await expect(gauge.connect(deployer)["claim(address)"](holder0.address)).to.not.emit(gauge, "Claim");
      });

      it("should succeed when claim to other", async () => {
        const claimable0 = await gauge.claimable(holder0.address, rewardToken0.getAddress());
        const claimable1 = await gauge.claimable(holder0.address, rewardToken1.getAddress());
        const before0 = await rewardToken0.balanceOf(holder1.address);
        const before1 = await rewardToken1.balanceOf(holder1.address);
        let snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        let snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.gt(0n);
        expect(snapshot0.rewards.claimed).to.eq(0n);
        expect(snapshot1.rewards.pending).to.gt(0n);
        expect(snapshot1.rewards.claimed).to.eq(0n);
        const tx = gauge.connect(holder0)["claim(address,address)"](holder0.address, holder1.address);
        await expect(tx)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken0.getAddress(), holder1.address, claimable0)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken1.getAddress(), holder1.address, claimable1);
        expect(await gauge.claimable(holder0.address, rewardToken0.getAddress())).to.eq(0n);
        expect(await gauge.claimable(holder0.address, rewardToken1.getAddress())).to.eq(0n);
        expect(await rewardToken0.balanceOf(holder1.address)).to.eq(before0 + claimable0);
        expect(await rewardToken1.balanceOf(holder1.address)).to.eq(before1 + claimable1);
        expect(await gauge.claimed(holder0.address, rewardToken0.getAddress())).to.eq(claimable0);
        expect(await gauge.claimed(holder0.address, rewardToken1.getAddress())).to.eq(claimable1);
        snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.eq(0n);
        expect(snapshot0.rewards.claimed).to.eq(claimable0);
        expect(snapshot1.rewards.pending).to.eq(0n);
        expect(snapshot1.rewards.claimed).to.eq(claimable1);
        await expect(gauge.connect(holder0)["claim(address,address)"](holder0.address, holder1.address)).to.not.emit(
          gauge,
          "Claim"
        );
      });
    });

    context("#claimHistorical without setting rewardReceiver", async () => {
      const BaseRewardAmount = ethers.parseEther("2233");
      const TotalPoolShare = ethers.parseEther("1234");
      const UserPoolShare = ethers.parseEther("456");

      beforeEach(async () => {
        await gauge.connect(holder0)["deposit(uint256)"](UserPoolShare);
        await gauge.connect(holder1)["deposit(uint256)"](TotalPoolShare - UserPoolShare);
        expect(await gauge.balanceOf(holder0.address)).to.eq(UserPoolShare);
        expect(await gauge.totalSupply()).to.eq(TotalPoolShare);

        await gauge.depositReward(rewardToken0.getAddress(), BaseRewardAmount);
        await gauge.depositReward(rewardToken1.getAddress(), BaseRewardAmount * 2n);

        const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + Week]);
        await gauge.connect(holder0).checkpoint(holder0.address);
        await gauge.unregisterRewardToken(rewardToken0.getAddress());
        await gauge.unregisterRewardToken(rewardToken1.getAddress());
        await gauge.connect(holder0).checkpoint(holder0.address);
      });

      it("should succeed when claim caller", async () => {
        const claimable0 = await gauge.claimable(holder0.address, rewardToken0.getAddress());
        const claimable1 = await gauge.claimable(holder0.address, rewardToken1.getAddress());
        const before0 = await rewardToken0.balanceOf(holder0.address);
        const before1 = await rewardToken1.balanceOf(holder0.address);
        let snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        let snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.gt(0n);
        expect(snapshot0.rewards.claimed).to.eq(0n);
        expect(snapshot1.rewards.pending).to.gt(0n);
        expect(snapshot1.rewards.claimed).to.eq(0n);
        await expect(gauge.connect(holder0)["claim()"]()).to.not.emit(gauge, "Claim");
        const tx = await gauge
          .connect(holder0)
          ["claimHistorical(address[])"]([await rewardToken0.getAddress(), await rewardToken1.getAddress()]);
        await expect(tx)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken0.getAddress(), holder0.address, claimable0)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken1.getAddress(), holder0.address, claimable1);
        expect(await gauge.claimable(holder0.address, rewardToken0.getAddress())).to.eq(0n);
        expect(await gauge.claimable(holder0.address, rewardToken1.getAddress())).to.eq(0n);
        expect(await rewardToken0.balanceOf(holder0.address)).to.eq(before0 + claimable0);
        expect(await rewardToken1.balanceOf(holder0.address)).to.eq(before1 + claimable1);
        expect(await gauge.claimed(holder0.address, rewardToken0.getAddress())).to.eq(claimable0);
        expect(await gauge.claimed(holder0.address, rewardToken1.getAddress())).to.eq(claimable1);
        snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.eq(0n);
        expect(snapshot0.rewards.claimed).to.eq(claimable0);
        expect(snapshot1.rewards.pending).to.eq(0n);
        expect(snapshot1.rewards.claimed).to.eq(claimable1);
        await expect(
          gauge
            .connect(holder0)
            ["claimHistorical(address[])"]([await rewardToken0.getAddress(), await rewardToken1.getAddress()])
        ).to.not.emit(gauge, "Claim");
      });

      it("should succeed when claim other", async () => {
        const claimable0 = await gauge.claimable(holder0.address, rewardToken0.getAddress());
        const claimable1 = await gauge.claimable(holder0.address, rewardToken1.getAddress());
        const before0 = await rewardToken0.balanceOf(holder0.address);
        const before1 = await rewardToken1.balanceOf(holder0.address);
        let snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        let snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.gt(0n);
        expect(snapshot0.rewards.claimed).to.eq(0n);
        expect(snapshot1.rewards.pending).to.gt(0n);
        expect(snapshot1.rewards.claimed).to.eq(0n);
        await expect(gauge.connect(holder0)["claim()"]()).to.not.emit(gauge, "Claim");
        const tx = await gauge
          .connect(deployer)
          ["claimHistorical(address,address[])"](holder0.address, [
            await rewardToken0.getAddress(),
            await rewardToken1.getAddress(),
          ]);
        await expect(tx)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken0.getAddress(), holder0.address, claimable0)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken1.getAddress(), holder0.address, claimable1);
        expect(await gauge.claimable(holder0.address, rewardToken0.getAddress())).to.eq(0n);
        expect(await gauge.claimable(holder0.address, rewardToken1.getAddress())).to.eq(0n);
        expect(await rewardToken0.balanceOf(holder0.address)).to.eq(before0 + claimable0);
        expect(await rewardToken1.balanceOf(holder0.address)).to.eq(before1 + claimable1);
        expect(await gauge.claimed(holder0.address, rewardToken0.getAddress())).to.eq(claimable0);
        expect(await gauge.claimed(holder0.address, rewardToken1.getAddress())).to.eq(claimable1);
        snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.eq(0n);
        expect(snapshot0.rewards.claimed).to.eq(claimable0);
        expect(snapshot1.rewards.pending).to.eq(0n);
        expect(snapshot1.rewards.claimed).to.eq(claimable1);
        await expect(
          gauge["claimHistorical(address,address[])"](holder0.address, [
            await rewardToken0.getAddress(),
            await rewardToken1.getAddress(),
          ])
        ).to.not.emit(gauge, "Claim");
      });
    });

    context("#claimHistorical with setting rewardReceiver", async () => {
      const BaseRewardAmount = ethers.parseEther("2233");
      const TotalPoolShare = ethers.parseEther("1234");
      const UserPoolShare = ethers.parseEther("456");

      beforeEach(async () => {
        await gauge.connect(holder0)["deposit(uint256)"](UserPoolShare);
        await gauge.connect(holder1)["deposit(uint256)"](TotalPoolShare - UserPoolShare);
        expect(await gauge.balanceOf(holder0.address)).to.eq(UserPoolShare);
        expect(await gauge.totalSupply()).to.eq(TotalPoolShare);

        await gauge.depositReward(rewardToken0.getAddress(), BaseRewardAmount);
        await gauge.depositReward(rewardToken1.getAddress(), BaseRewardAmount * 2n);

        const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + Week]);
        await gauge.connect(holder0).checkpoint(holder0.address);
        await gauge.unregisterRewardToken(rewardToken0.getAddress());
        await gauge.unregisterRewardToken(rewardToken1.getAddress());
        await gauge.connect(holder0).checkpoint(holder0.address);
        await gauge.connect(holder0).setRewardReceiver(holder1.address);
      });

      it("should succeed when claim caller", async () => {
        const claimable0 = await gauge.claimable(holder0.address, rewardToken0.getAddress());
        const claimable1 = await gauge.claimable(holder0.address, rewardToken1.getAddress());
        const before0 = await rewardToken0.balanceOf(holder1.address);
        const before1 = await rewardToken1.balanceOf(holder1.address);
        let snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        let snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.gt(0n);
        expect(snapshot0.rewards.claimed).to.eq(0n);
        expect(snapshot1.rewards.pending).to.gt(0n);
        expect(snapshot1.rewards.claimed).to.eq(0n);
        await expect(gauge.connect(holder0)["claim()"]()).to.not.emit(gauge, "Claim");
        const tx = await gauge
          .connect(holder0)
          ["claimHistorical(address[])"]([await rewardToken0.getAddress(), await rewardToken1.getAddress()]);
        await expect(tx)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken0.getAddress(), holder1.address, claimable0)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken1.getAddress(), holder1.address, claimable1);
        expect(await gauge.claimable(holder0.address, rewardToken0.getAddress())).to.eq(0n);
        expect(await gauge.claimable(holder0.address, rewardToken1.getAddress())).to.eq(0n);
        expect(await rewardToken0.balanceOf(holder1.address)).to.eq(before0 + claimable0);
        expect(await rewardToken1.balanceOf(holder1.address)).to.eq(before1 + claimable1);
        expect(await gauge.claimed(holder0.address, rewardToken0.getAddress())).to.eq(claimable0);
        expect(await gauge.claimed(holder0.address, rewardToken1.getAddress())).to.eq(claimable1);
        snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.eq(0n);
        expect(snapshot0.rewards.claimed).to.eq(claimable0);
        expect(snapshot1.rewards.pending).to.eq(0n);
        expect(snapshot1.rewards.claimed).to.eq(claimable1);
        await expect(
          gauge
            .connect(holder0)
            ["claimHistorical(address[])"]([await rewardToken0.getAddress(), await rewardToken1.getAddress()])
        ).to.not.emit(gauge, "Claim");
      });

      it("should succeed when claim other", async () => {
        const claimable0 = await gauge.claimable(holder0.address, rewardToken0.getAddress());
        const claimable1 = await gauge.claimable(holder0.address, rewardToken1.getAddress());
        const before0 = await rewardToken0.balanceOf(holder1.address);
        const before1 = await rewardToken1.balanceOf(holder1.address);
        let snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        let snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.gt(0n);
        expect(snapshot0.rewards.claimed).to.eq(0n);
        expect(snapshot1.rewards.pending).to.gt(0n);
        expect(snapshot1.rewards.claimed).to.eq(0n);
        await expect(gauge.connect(holder0)["claim()"]()).to.not.emit(gauge, "Claim");
        const tx = await gauge["claimHistorical(address,address[])"](holder0.address, [
          await rewardToken0.getAddress(),
          await rewardToken1.getAddress(),
        ]);
        await expect(tx)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken0.getAddress(), holder1.address, claimable0)
          .to.emit(gauge, "Claim")
          .withArgs(holder0.address, await rewardToken1.getAddress(), holder1.address, claimable1);
        expect(await gauge.claimable(holder0.address, rewardToken0.getAddress())).to.eq(0n);
        expect(await gauge.claimable(holder0.address, rewardToken1.getAddress())).to.eq(0n);
        expect(await rewardToken0.balanceOf(holder1.address)).to.eq(before0 + claimable0);
        expect(await rewardToken1.balanceOf(holder1.address)).to.eq(before1 + claimable1);
        expect(await gauge.claimed(holder0.address, rewardToken0.getAddress())).to.eq(claimable0);
        expect(await gauge.claimed(holder0.address, rewardToken1.getAddress())).to.eq(claimable1);
        snapshot0 = await gauge.userRewardSnapshot(holder0.address, rewardToken0.getAddress());
        snapshot1 = await gauge.userRewardSnapshot(holder0.address, rewardToken1.getAddress());
        expect(snapshot0.rewards.pending).to.eq(0n);
        expect(snapshot0.rewards.claimed).to.eq(claimable0);
        expect(snapshot1.rewards.pending).to.eq(0n);
        expect(snapshot1.rewards.claimed).to.eq(claimable1);
        await expect(
          gauge["claimHistorical(address,address[])"](holder0.address, [
            await rewardToken0.getAddress(),
            await rewardToken1.getAddress(),
          ])
        ).to.not.emit(gauge, "Claim");
      });
    });
  });
});

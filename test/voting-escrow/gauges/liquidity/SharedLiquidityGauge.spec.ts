import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  GaugeController,
  GovernanceToken,
  SharedLiquidityGauge,
  MockERC20,
  TokenMinter,
  VotingEscrow,
  MockLiquidityManagerImmutable,
  VotingEscrowProxy,
} from "@/types/index";
import { ethers, network } from "hardhat";
import { expect } from "chai";
import { ContractTransactionResponse, MaxUint256, ZeroAddress, toBigInt } from "ethers";

describe("SharedLiquidityGauge.spec", async () => {
  const Week = 86400 * 7;

  let deployer: HardhatEthersSigner;
  let holder0: HardhatEthersSigner;
  let holder1: HardhatEthersSigner;
  let holder2: HardhatEthersSigner;

  let token: MockERC20;
  let gov: GovernanceToken;
  let ve: VotingEscrow;
  let proxy: VotingEscrowProxy;
  let controller: GaugeController;
  let minter: TokenMinter;
  let gauge: SharedLiquidityGauge;

  beforeEach(async () => {
    [deployer, holder0, holder1, holder2] = await ethers.getSigners();

    const GovernanceToken = await ethers.getContractFactory("GovernanceToken", deployer);
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow", deployer);
    const VotingEscrowBoost = await ethers.getContractFactory("VotingEscrowBoost", deployer);
    const VotingEscrowProxy = await ethers.getContractFactory("VotingEscrowProxy", deployer);
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
    const SharedLiquidityGauge = await ethers.getContractFactory("SharedLiquidityGauge", deployer);

    const boost = await VotingEscrowBoost.deploy(await ve.getAddress());
    proxy = await VotingEscrowProxy.deploy(await boost.getAddress());
    token = await MockERC20.deploy("LP Token", "LP", 18);
    gauge = await SharedLiquidityGauge.deploy(minter.getAddress(), proxy.getAddress());

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

      // from SharedLiquidityGauge
      expect(await gauge.veProxy()).to.eq(await proxy.getAddress());

      // revert
      await expect(gauge.initialize(token.getAddress())).to.revertedWith(
        "Initializable: contract is already initialized"
      );
    });
  });

  context("#toggleVoteSharing", async () => {
    it("should revert, when SelfSharingIsNotAllowed", async () => {
      await expect(gauge.toggleVoteSharing(deployer.address)).to.revertedWithCustomError(
        gauge,
        "SelfSharingIsNotAllowed"
      );
    });

    it("should revert, when CascadedSharingIsNotAllowed", async () => {
      await gauge.toggleVoteSharing(holder0.address);
      await gauge.connect(holder0).acceptSharedVote(deployer.address);
      await expect(gauge.connect(holder0).toggleVoteSharing(deployer.address)).to.revertedWithCustomError(
        gauge,
        "CascadedSharingIsNotAllowed"
      );
    });

    it("should succeed", async () => {
      // check isStakerAllowed and event
      expect(await gauge.isStakerAllowed(deployer.address, holder0.address)).to.eq(false);
      await expect(gauge.toggleVoteSharing(holder0.address))
        .to.emit(gauge, "ShareVote")
        .withArgs(deployer.address, holder0.address);
      expect(await gauge.isStakerAllowed(deployer.address, holder0.address)).to.eq(true);
      await expect(gauge.toggleVoteSharing(holder0.address))
        .to.emit(gauge, "CancelShareVote")
        .withArgs(deployer.address, holder0.address);
      expect(await gauge.isStakerAllowed(deployer.address, holder0.address)).to.eq(false);

      // check _stakerVoteOwner and sharedBalanceOf and numAcceptedStakers
      await token.mint(holder0.address, ethers.parseEther("10000"));
      await token.mint(holder1.address, ethers.parseEther("10000"));
      await token.connect(holder0).approve(gauge.getAddress(), MaxUint256);
      await token.connect(holder1).approve(gauge.getAddress(), MaxUint256);
      await gauge.connect(holder0)["deposit(uint256)"](ethers.parseEther("123"));
      await gauge.connect(holder1)["deposit(uint256)"](ethers.parseEther("456"));

      await gauge.toggleVoteSharing(holder0.address);
      expect(await gauge.isStakerAllowed(deployer.address, holder0.address)).to.eq(true);
      await gauge.toggleVoteSharing(holder1.address);
      expect(await gauge.isStakerAllowed(deployer.address, holder1.address)).to.eq(true);
      await gauge.connect(holder0).acceptSharedVote(deployer.address);
      expect(await gauge.numAcceptedStakers(deployer.address)).to.eq(1n);
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(ethers.parseEther("123"));
      expect(await gauge.getStakerVoteOwner(holder0.address)).to.eq(deployer.address);
      await gauge.connect(holder1).acceptSharedVote(deployer.address);
      expect(await gauge.numAcceptedStakers(deployer.address)).to.eq(2n);
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(ethers.parseEther("579"));
      expect(await gauge.getStakerVoteOwner(holder1.address)).to.eq(deployer.address);

      await expect(gauge.toggleVoteSharing(holder0.address))
        .to.emit(gauge, "AcceptSharedVote")
        .withArgs(holder0.address, deployer.address, ZeroAddress);
      expect(await gauge.isStakerAllowed(deployer.address, holder0.address)).to.eq(false);
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(ethers.parseEther("456"));
      expect(await gauge.numAcceptedStakers(deployer.address)).to.eq(1n);
      expect(await gauge.getStakerVoteOwner(holder0.address)).to.eq(ZeroAddress);
      await expect(gauge.toggleVoteSharing(holder1.address))
        .to.emit(gauge, "AcceptSharedVote")
        .withArgs(holder1.address, deployer.address, ZeroAddress);
      expect(await gauge.isStakerAllowed(deployer.address, holder1.address)).to.eq(false);
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(0n);
      expect(await gauge.numAcceptedStakers(deployer.address)).to.eq(0n);
      expect(await gauge.getStakerVoteOwner(holder1.address)).to.eq(ZeroAddress);
    });
  });

  context("#acceptSharedVote", async () => {
    it("should revert, when VoteShareNotAllowed", async () => {
      await expect(gauge.connect(holder0).acceptSharedVote(deployer.address)).to.revertedWithCustomError(
        gauge,
        "VoteShareNotAllowed"
      );
    });

    it("should revert, when CascadedSharingIsNotAllowed", async () => {
      await gauge.connect(holder0).toggleVoteSharing(holder1.address);
      await gauge.connect(holder1).acceptSharedVote(holder0.address);

      await gauge.toggleVoteSharing(holder0.address);
      await expect(gauge.connect(holder0).acceptSharedVote(deployer.address)).to.revertedWithCustomError(
        gauge,
        "CascadedSharingIsNotAllowed"
      );
    });

    it("should succeed", async () => {
      await token.mint(holder0.address, ethers.parseEther("10000"));
      await token.connect(holder0).approve(gauge.getAddress(), MaxUint256);
      await gauge.connect(holder0)["deposit(uint256)"](ethers.parseEther("123"));

      // accept without previous owner
      await gauge.toggleVoteSharing(holder0.address);
      expect(await gauge.numAcceptedStakers(deployer.address)).to.eq(0n);
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(0n);
      expect(await gauge.getStakerVoteOwner(holder0.address)).to.eq(ZeroAddress);
      await expect(gauge.connect(holder0).acceptSharedVote(deployer.address))
        .to.emit(gauge, "AcceptSharedVote")
        .withArgs(holder0.address, ZeroAddress, deployer.address);
      expect(await gauge.getStakerVoteOwner(holder0.address)).to.eq(deployer.address);
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(ethers.parseEther("123"));
      expect(await gauge.numAcceptedStakers(deployer.address)).to.eq(1n);

      // accept with previous owner
      await gauge.connect(holder1).toggleVoteSharing(holder0.address);
      expect(await gauge.numAcceptedStakers(holder1.address)).to.eq(0n);
      expect(await gauge.sharedBalanceOf(holder1.address)).to.eq(0n);
      await expect(gauge.connect(holder0).acceptSharedVote(holder1.address))
        .to.emit(gauge, "AcceptSharedVote")
        .withArgs(holder0.address, deployer.address, holder1.address);
      expect(await gauge.getStakerVoteOwner(holder0.address)).to.eq(holder1.address);
      expect(await gauge.sharedBalanceOf(holder1.address)).to.eq(ethers.parseEther("123"));
      expect(await gauge.numAcceptedStakers(holder1.address)).to.eq(1n);
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(0n);
      expect(await gauge.numAcceptedStakers(deployer.address)).to.eq(0n);
    });
  });

  context("#rejectSharedVote", async () => {
    it("should revert, when NoAcceptedSharedVote", async () => {
      await expect(gauge.rejectSharedVote()).to.revertedWithCustomError(gauge, "NoAcceptedSharedVote");
    });

    it("should succeed", async () => {
      await token.mint(holder0.address, ethers.parseEther("10000"));
      await token.connect(holder0).approve(gauge.getAddress(), MaxUint256);
      await gauge.connect(holder0)["deposit(uint256)"](ethers.parseEther("123"));

      // accept without previous owner
      await gauge.toggleVoteSharing(holder0.address);
      expect(await gauge.numAcceptedStakers(deployer.address)).to.eq(0n);
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(0n);
      expect(await gauge.getStakerVoteOwner(holder0.address)).to.eq(ZeroAddress);
      await expect(gauge.connect(holder0).acceptSharedVote(deployer.address))
        .to.emit(gauge, "AcceptSharedVote")
        .withArgs(holder0.address, ZeroAddress, deployer.address);
      expect(await gauge.getStakerVoteOwner(holder0.address)).to.eq(deployer.address);
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(ethers.parseEther("123"));
      expect(await gauge.numAcceptedStakers(deployer.address)).to.eq(1n);

      // reject
      await expect(gauge.connect(holder0).rejectSharedVote())
        .to.emit(gauge, "AcceptSharedVote")
        .withArgs(holder0.address, deployer.address, ZeroAddress);
      expect(await gauge.getStakerVoteOwner(holder0.address)).to.eq(ZeroAddress);
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(0n);
      expect(await gauge.numAcceptedStakers(deployer.address)).to.eq(0n);
    });
  });

  context("move share balance", async () => {
    beforeEach(async () => {
      await token.mint(holder0.address, ethers.parseEther("10000"));
      await token.connect(holder0).approve(gauge.getAddress(), MaxUint256);
      await gauge.connect(holder0)["deposit(uint256)"](ethers.parseEther("123"));
      await token.mint(holder1.address, ethers.parseEther("10000"));
      await token.connect(holder1).approve(gauge.getAddress(), MaxUint256);
      await gauge.connect(holder1)["deposit(uint256)"](ethers.parseEther("456"));

      await gauge.toggleVoteSharing(holder0.address);
      await gauge.connect(holder0).acceptSharedVote(deployer.address);
      await gauge.connect(holder2).toggleVoteSharing(holder1.address);
      await gauge.connect(holder1).acceptSharedVote(holder2.address);
    });

    it("should move share balance when transfer", async () => {
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(ethers.parseEther("123"));
      expect(await gauge.sharedBalanceOf(holder2.address)).to.eq(ethers.parseEther("456"));
      await gauge.connect(holder0).transfer(holder1.address, ethers.parseEther("100"));
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(ethers.parseEther("23"));
      expect(await gauge.sharedBalanceOf(holder2.address)).to.eq(ethers.parseEther("556"));
    });

    it("should move share balance when transferFrom", async () => {
      await gauge.connect(holder0).approve(holder1.address, MaxUint256);
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(ethers.parseEther("123"));
      expect(await gauge.sharedBalanceOf(holder2.address)).to.eq(ethers.parseEther("456"));
      await gauge.connect(holder1).transferFrom(holder0.address, holder1.address, ethers.parseEther("100"));
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(ethers.parseEther("23"));
      expect(await gauge.sharedBalanceOf(holder2.address)).to.eq(ethers.parseEther("556"));
    });

    it("should move share balance when deposit", async () => {
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(ethers.parseEther("123"));
      expect(await gauge.sharedBalanceOf(holder2.address)).to.eq(ethers.parseEther("456"));
      await gauge.connect(holder0)["deposit(uint256)"](ethers.parseEther("100"));
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(ethers.parseEther("223"));
      expect(await gauge.sharedBalanceOf(holder2.address)).to.eq(ethers.parseEther("456"));
    });

    it("should move share balance when withdraw", async () => {
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(ethers.parseEther("123"));
      expect(await gauge.sharedBalanceOf(holder2.address)).to.eq(ethers.parseEther("456"));
      await gauge.connect(holder0)["withdraw(uint256)"](ethers.parseEther("100"));
      expect(await gauge.sharedBalanceOf(deployer.address)).to.eq(ethers.parseEther("23"));
      expect(await gauge.sharedBalanceOf(holder2.address)).to.eq(ethers.parseEther("456"));
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
            await gov.approve(ve.getAddress(), MaxUint256);
            const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
            await ve.create_lock(ethers.parseEther("579"), timestamp + 365 * 86400 * 3);

            if (hasVe) {
              await gauge.toggleVoteSharing(holder0.address);
              await gauge.toggleVoteSharing(holder1.address);
              await gauge.connect(holder0).acceptSharedVote(deployer.address);
              await gauge.connect(holder1).acceptSharedVote(deployer.address);
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
            let owner = await gauge.getStakerVoteOwner(account);
            if (owner === ZeroAddress) owner = account;
            const combinedBalance = (await gauge.balanceOf(owner)) + (await gauge.sharedBalanceOf(owner));

            const veBalance = await ve["balanceOf(address)"](owner);
            const veSupply = await ve["totalSupply()"]();
            const balance = prevBalance + delta;
            let workingBalance = (combinedBalance * 4n) / 10n;
            if (veSupply > 0) {
              workingBalance += (((veBalance * (prevSupply + delta)) / veSupply) * 6n) / 10n;
            }
            if (combinedBalance > 0n) {
              workingBalance = (workingBalance * balance) / combinedBalance;
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
});

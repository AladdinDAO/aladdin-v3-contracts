import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MockERC20, VotingEscrow, VotingEscrowBoost } from "@/types/index";
import { expect } from "chai";
import { BigNumberish, MaxUint256, Signature, ZeroAddress, ZeroHash, toBigInt } from "ethers";
import { ethers, network } from "hardhat";

describe("VotingEscrowBoost.spec", async () => {
  const Week = 86400 * 7;

  let deployer: HardhatEthersSigner;
  let holder0: HardhatEthersSigner;
  let holder1: HardhatEthersSigner;

  let token: MockERC20;
  let ve: VotingEscrow;
  let boost: VotingEscrowBoost;

  beforeEach(async () => {
    [deployer, holder0, holder1] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow", deployer);
    const VotingEscrowBoost = await ethers.getContractFactory("VotingEscrowBoost", deployer);

    token = await MockERC20.deploy("X", "X", 18);
    ve = await VotingEscrow.deploy();
    boost = await VotingEscrowBoost.deploy(await ve.getAddress());
    await ve.initialize(deployer.address, await token.getAddress(), "VotingEscrow X", "veX", "1");

    await token.mint(deployer.address, ethers.parseEther("1000000000"));
    await token.mint(holder0.address, ethers.parseEther("1000000000"));
    await token.mint(holder1.address, ethers.parseEther("1000000000"));
    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    await token.approve(await ve.getAddress(), MaxUint256);
    await ve.create_lock(ethers.parseEther("10000"), timestamp + 86400 * 365 * 4);
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      expect(await boost.ve()).to.eq(await ve.getAddress());
      expect(await boost.name()).to.eq("VotingEscrow X Boost");
      expect(await boost.symbol()).to.eq("veXBoost");
      expect(await boost.totalSupply()).to.eq(await ve["totalSupply()"]());
      expect(await boost.balanceOf(deployer.address)).to.eq(await ve["balanceOf(address)"](deployer.address));
      expect(await boost.adjustedVeBalance(deployer.address)).to.eq(await ve["balanceOf(address)"](deployer.address));
      expect(await boost.delegableBalance(deployer.address)).to.eq(await ve["balanceOf(address)"](deployer.address));
      expect(await boost.delegatedBalance(deployer.address)).to.eq(0n);
      expect(await boost.receivedBalance(deployer.address)).to.eq(0n);
    });
  });

  context("#approve", async () => {
    it("should revert, when approve to zero address", async () => {
      await expect(boost.approve(ZeroAddress, 0)).to.revertedWithCustomError(boost, "ApproveToZeroAddress");
    });

    it("should succeed", async () => {
      expect(await boost.allowance(deployer.address, holder0.address)).to.eq(0n);
      await expect(boost.approve(holder0.address, 1n))
        .to.emit(boost, "Approval")
        .withArgs(deployer.address, holder0.address, 1n);
      expect(await boost.allowance(deployer.address, holder0.address)).to.eq(1n);
      await expect(boost.approve(holder0.address, 0n))
        .to.emit(boost, "Approval")
        .withArgs(deployer.address, holder0.address, 0n);
      expect(await boost.allowance(deployer.address, holder0.address)).to.eq(0n);
    });
  });

  context("#increaseAllowance", async () => {
    it("should revert, when approve to zero address", async () => {
      await expect(boost.increaseAllowance(ZeroAddress, 0)).to.revertedWithCustomError(boost, "ApproveToZeroAddress");
    });

    it("should succeed", async () => {
      expect(await boost.allowance(deployer.address, holder0.address)).to.eq(0n);
      await expect(boost.increaseAllowance(holder0.address, 10n))
        .to.emit(boost, "Approval")
        .withArgs(deployer.address, holder0.address, 10n);
      expect(await boost.allowance(deployer.address, holder0.address)).to.eq(10n);
      await expect(boost.increaseAllowance(holder0.address, 12n))
        .to.emit(boost, "Approval")
        .withArgs(deployer.address, holder0.address, 22n);
      expect(await boost.allowance(deployer.address, holder0.address)).to.eq(22n);
    });
  });

  context("#decreaseAllowance", async () => {
    beforeEach(async () => {
      await boost.approve(holder0.address, 1000n);
    });

    it("should revert, when approve to zero address", async () => {
      await expect(boost.decreaseAllowance(ZeroAddress, 0)).to.revertedWithCustomError(boost, "ApproveToZeroAddress");
    });

    it("should revert, when exceed balance", async () => {
      await expect(boost.decreaseAllowance(ZeroAddress, 10001n)).to.revertedWithCustomError(
        boost,
        "DecreasedAllowanceBelowZero"
      );
    });

    it("should succeed", async () => {
      expect(await boost.allowance(deployer.address, holder0.address)).to.eq(1000n);
      await expect(boost.decreaseAllowance(holder0.address, 10n))
        .to.emit(boost, "Approval")
        .withArgs(deployer.address, holder0.address, 990n);
      expect(await boost.allowance(deployer.address, holder0.address)).to.eq(990n);
      await expect(boost.decreaseAllowance(holder0.address, 990n))
        .to.emit(boost, "Approval")
        .withArgs(deployer.address, holder0.address, 0n);
      expect(await boost.allowance(deployer.address, holder0.address)).to.eq(0n);
    });
  });

  context("#permit", async () => {
    const sign = async (signer: HardhatEthersSigner, spender: string, value: bigint, deadline?: BigNumberish) => {
      return Signature.from(
        await signer.signTypedData(
          {
            name: "VotingEscrow Boost",
            version: "1",
            chainId: (await ethers.provider.getNetwork()).chainId,
            verifyingContract: await boost.getAddress(),
          },
          {
            Permit: [
              { name: "owner", type: "address" },
              { name: "spender", type: "address" },
              { name: "value", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          {
            owner: signer.address,
            spender,
            value,
            nonce: await boost.nonces(signer.address),
            deadline: deadline ?? MaxUint256,
          }
        )
      );
    };

    it("should revert, when expired", async () => {
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      await expect(
        boost.permit(deployer.address, deployer.address, 0n, timestamp - 1, 0, ZeroHash, ZeroHash)
      ).to.revertedWithCustomError(boost, "ExpiredDeadline");
    });

    it("should revert, when invalid signature", async () => {
      await expect(
        boost.permit(deployer.address, deployer.address, 0n, MaxUint256, 0, ZeroHash, ZeroHash)
      ).to.revertedWith("ECDSA: invalid signature");
      const signature = await sign(deployer, holder0.address, 100n, MaxUint256);
      await expect(
        boost.permit(holder0.address, holder0.address, 100n, MaxUint256, signature.v, signature.r, signature.s)
      ).to.revertedWithCustomError(boost, "InvalidSignature");
    });

    it("should succeed", async () => {
      expect(await boost.allowance(deployer.address, holder0.address)).to.eq(0n);
      const signature = await sign(deployer, holder0.address, 100n, MaxUint256);
      await expect(
        boost.permit(deployer.address, holder0.address, 100n, MaxUint256, signature.v, signature.r, signature.s)
      )
        .to.emit(boost, "Approval")
        .withArgs(deployer.address, holder0.address, 100n);
      expect(await boost.allowance(deployer.address, holder0.address)).to.eq(100n);
    });
  });

  context("#boost", async () => {
    beforeEach(async () => {
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      await token.connect(holder0).approve(await ve.getAddress(), MaxUint256);
      await ve.connect(holder0).create_lock(ethers.parseEther("123"), timestamp + 86400 * 365 * 4);
      await token.connect(holder1).approve(await ve.getAddress(), MaxUint256);
      await ve.connect(holder1).create_lock(ethers.parseEther("456"), timestamp + 86400 * 365 * 4);
    });

    it("should revert when boost zero", async () => {
      await expect(boost.boost(holder0.address, 0n, MaxUint256)).to.revertedWithCustomError(boost, "BoostZeroAmount");
    });

    it("should revert when smaller than now", async () => {
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 100]);
      await expect(boost.boost(holder0.address, 1n, timestamp + 99)).to.revertedWithCustomError(
        boost,
        "EndTimeSmallerThanCurrentTimestamp"
      );
    });

    it("should revert when not aligned with week", async () => {
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 100]);
      await expect(
        boost.boost(holder0.address, 1n, Math.floor(timestamp / Week) * Week + Week * 2 - 1)
      ).to.revertedWithCustomError(boost, "EndTimeNotAlignedWithWeek");
      await expect(
        boost.boost(holder0.address, 1n, Math.floor(timestamp / Week) * Week + Week * 2 + 1)
      ).to.revertedWithCustomError(boost, "EndTimeNotAlignedWithWeek");
    });

    it("should revert when exceed lockend", async () => {
      await expect(
        boost.boost(holder0.address, 1n, (await ve.locked__end(deployer.address)) + toBigInt(Week))
      ).to.revertedWithCustomError(boost, "EndTimeExceedLockEnd");
    });

    it("should revert when exceed balance", async () => {
      await expect(
        boost.boost(holder0.address, ethers.parseEther("10000") + 1n, await ve.locked__end(deployer.address))
      ).to.revertedWithCustomError(boost, "BoostExceedBalance");
    });

    it("should succeed", async () => {
      const t0 = (await ethers.provider.getBlock("latest"))!.timestamp;
      const s1 = t0 + Week;
      const e1 = Math.floor(t0 / Week) * Week + Week * 52;
      const s2 = t0 + Week * 10;
      const e2 = Math.floor(t0 / Week) * Week + Week * 56;
      const s3 = t0 + Week * 20;
      const e3 = Math.floor(t0 / Week) * Week + Week * 60;

      // boost 100 to holder0 at timestamp s1
      const slope1 = ethers.parseEther("100") / toBigInt(e1 - s1);
      const bias1 = slope1 * toBigInt(e1 - s1);
      await network.provider.send("evm_setNextBlockTimestamp", [s1]);
      await expect(boost.boost(holder0.address, ethers.parseEther("100"), e1))
        .to.emit(boost, "Transfer")
        .withArgs(deployer.address, holder0.address, bias1)
        .to.emit(boost, "Boost")
        .withArgs(deployer.address, holder0.address, bias1, slope1, s1);
      expect((await boost.boosts(deployer.address, 0)).receiver).to.eq(holder0.address);
      expect((await boost.boosts(deployer.address, 0)).startTime).to.eq(s1);
      expect((await boost.boosts(deployer.address, 0)).endTime).to.eq(e1);
      expect((await boost.boosts(deployer.address, 0)).initialAmount).to.eq(bias1);
      expect((await boost.boosts(deployer.address, 0)).cancelAmount).to.eq(0n);
      expect(await boost.boostLength(deployer.address)).to.eq(1n);
      expect((await boost.delegated(deployer.address)).ts).to.eq(s1);
      expect((await boost.delegated(deployer.address)).bias).to.eq(bias1);
      expect((await boost.delegated(deployer.address)).slope).to.eq(slope1);
      expect((await boost.received(holder0.address)).ts).to.eq(s1);
      expect((await boost.received(holder0.address)).bias).to.eq(bias1);
      expect((await boost.received(holder0.address)).slope).to.eq(slope1);
      expect(await boost.delegatedBalance(deployer.address)).to.eq(bias1);
      expect(await boost.receivedBalance(holder0.address)).to.eq(bias1);
      expect(await boost.adjustedVeBalance(holder0.address)).to.eq(
        (await ve["balanceOf(address)"](holder0.address)) + bias1
      );
      expect(await boost.adjustedVeBalance(deployer.address)).to.eq(
        (await ve["balanceOf(address)"](deployer.address)) - bias1
      );

      // boost 200 to holder0 at timestamp s2
      const slope2 = ethers.parseEther("200") / toBigInt(e2 - s2);
      const bias2 = slope2 * toBigInt(e2 - s2);
      await network.provider.send("evm_setNextBlockTimestamp", [s2]);
      await expect(boost.boost(holder0.address, ethers.parseEther("200"), e2))
        .to.emit(boost, "Transfer")
        .withArgs(holder0.address, ZeroAddress, slope1 * toBigInt(s2 - s1))
        .to.emit(boost, "Transfer")
        .withArgs(deployer.address, holder0.address, bias2)
        .to.emit(boost, "Boost")
        .withArgs(deployer.address, holder0.address, bias2, slope2, s2);
      expect(await boost.boostLength(deployer.address)).to.eq(2n);
      expect((await boost.boosts(deployer.address, 1)).receiver).to.eq(holder0.address);
      expect((await boost.boosts(deployer.address, 1)).startTime).to.eq(s2);
      expect((await boost.boosts(deployer.address, 1)).endTime).to.eq(e2);
      expect((await boost.boosts(deployer.address, 1)).initialAmount).to.eq(bias2);
      expect((await boost.boosts(deployer.address, 1)).cancelAmount).to.eq(0n);
      expect((await boost.delegated(deployer.address)).ts).to.eq(s2);
      expect((await boost.delegated(deployer.address)).bias).to.eq(bias1 + bias2 - slope1 * toBigInt(s2 - s1));
      expect((await boost.delegated(deployer.address)).slope).to.eq(slope1 + slope2);
      expect((await boost.received(holder0.address)).ts).to.eq(s2);
      expect((await boost.received(holder0.address)).bias).to.eq(bias1 + bias2 - slope1 * toBigInt(s2 - s1));
      expect((await boost.received(holder0.address)).slope).to.eq(slope1 + slope2);
      expect(await boost.delegatedBalance(deployer.address)).to.eq(bias1 + bias2 - slope1 * toBigInt(s2 - s1));
      expect(await boost.receivedBalance(holder0.address)).to.eq(bias1 + bias2 - slope1 * toBigInt(s2 - s1));
      expect(await boost.adjustedVeBalance(holder0.address)).to.eq(
        (await ve["balanceOf(address)"](holder0.address)) + bias1 + bias2 - slope1 * toBigInt(s2 - s1)
      );
      expect(await boost.adjustedVeBalance(deployer.address)).to.eq(
        (await ve["balanceOf(address)"](deployer.address)) - (bias1 + bias2 - slope1 * toBigInt(s2 - s1))
      );

      // boost 300 to holder0 at timestamp s3
      const slope3 = ethers.parseEther("300") / toBigInt(e3 - s3);
      const bias3 = slope3 * toBigInt(e3 - s3);
      await network.provider.send("evm_setNextBlockTimestamp", [s3]);
      await expect(boost.boost(holder0.address, ethers.parseEther("300"), e3))
        .to.emit(boost, "Transfer")
        .withArgs(holder0.address, ZeroAddress, (slope1 + slope2) * toBigInt(s3 - s2))
        .to.emit(boost, "Transfer")
        .withArgs(deployer.address, holder0.address, bias3)
        .to.emit(boost, "Boost")
        .withArgs(deployer.address, holder0.address, bias3, slope3, s3);
      expect(await boost.boostLength(deployer.address)).to.eq(3n);
      expect((await boost.boosts(deployer.address, 2)).receiver).to.eq(holder0.address);
      expect((await boost.boosts(deployer.address, 2)).startTime).to.eq(s3);
      expect((await boost.boosts(deployer.address, 2)).endTime).to.eq(e3);
      expect((await boost.boosts(deployer.address, 2)).initialAmount).to.eq(bias3);
      expect((await boost.boosts(deployer.address, 2)).cancelAmount).to.eq(0n);
      expect((await boost.delegated(deployer.address)).ts).to.eq(s3);
      expect((await boost.delegated(deployer.address)).bias).to.eq(
        bias1 + bias2 + bias3 - slope1 * toBigInt(s3 - s1) - slope2 * toBigInt(s3 - s2)
      );
      expect((await boost.delegated(deployer.address)).slope).to.eq(slope1 + slope2 + slope3);
      expect((await boost.received(holder0.address)).ts).to.eq(s3);
      expect((await boost.received(holder0.address)).bias).to.eq(
        bias1 + bias2 + bias3 - slope1 * toBigInt(s3 - s1) - slope2 * toBigInt(s3 - s2)
      );
      expect((await boost.received(holder0.address)).slope).to.eq(slope1 + slope2 + slope3);
      expect(await boost.delegatedBalance(deployer.address)).to.eq(
        bias1 + bias2 + bias3 - slope1 * toBigInt(s3 - s1) - slope2 * toBigInt(s3 - s2)
      );
      expect(await boost.receivedBalance(holder0.address)).to.eq(
        bias1 + bias2 + bias3 - slope1 * toBigInt(s3 - s1) - slope2 * toBigInt(s3 - s2)
      );
      expect(await boost.adjustedVeBalance(holder0.address)).to.eq(
        (await ve["balanceOf(address)"](holder0.address)) +
          bias1 +
          bias2 +
          bias3 -
          slope1 * toBigInt(s3 - s1) -
          slope2 * toBigInt(s3 - s2)
      );
      expect(await boost.adjustedVeBalance(deployer.address)).to.eq(
        (await ve["balanceOf(address)"](deployer.address)) -
          (bias1 + bias2 + bias3 - slope1 * toBigInt(s3 - s1) - slope2 * toBigInt(s3 - s2))
      );

      // jump to timestamp e1
      await network.provider.send("evm_setNextBlockTimestamp", [e1]);
      await expect(boost.checkpoint(holder0.address))
        .to.emit(boost, "Transfer")
        .withArgs(holder0.address, ZeroAddress, (slope1 + slope2 + slope3) * toBigInt(e1 - s3));
      expect((await boost.received(holder0.address)).bias).to.eq(
        bias2 + bias3 - slope2 * toBigInt(e1 - s2) - slope3 * toBigInt(e1 - s3)
      );
      expect((await boost.received(holder0.address)).slope).to.eq(slope2 + slope3);
      expect(await boost.delegatedBalance(deployer.address)).to.eq(
        bias2 + bias3 - slope2 * toBigInt(e1 - s2) - slope3 * toBigInt(e1 - s3)
      );
      expect(await boost.receivedBalance(holder0.address)).to.eq(
        bias2 + bias3 - slope2 * toBigInt(e1 - s2) - slope3 * toBigInt(e1 - s3)
      );
      expect(await boost.adjustedVeBalance(holder0.address)).to.eq(
        (await ve["balanceOf(address)"](holder0.address)) +
          (bias2 + bias3 - slope2 * toBigInt(e1 - s2) - slope3 * toBigInt(e1 - s3))
      );
      expect(await boost.adjustedVeBalance(deployer.address)).to.eq(
        (await ve["balanceOf(address)"](deployer.address)) -
          (bias2 + bias3 - slope2 * toBigInt(e1 - s2) - slope3 * toBigInt(e1 - s3))
      );

      // jump to timestamp e2
      await network.provider.send("evm_setNextBlockTimestamp", [e2]);
      await expect(boost.checkpoint(deployer.address)).to.not.emit(boost, "Transfer");
      expect((await boost.delegated(deployer.address)).bias).to.eq(bias3 - slope3 * toBigInt(e2 - s3));
      expect((await boost.delegated(deployer.address)).slope).to.eq(slope3);
      expect(await boost.delegatedBalance(deployer.address)).to.eq(bias3 - slope3 * toBigInt(e2 - s3));
      expect(await boost.receivedBalance(holder0.address)).to.eq(bias3 - slope3 * toBigInt(e2 - s3));
      expect(await boost.adjustedVeBalance(holder0.address)).to.eq(
        (await ve["balanceOf(address)"](holder0.address)) + (bias3 - slope3 * toBigInt(e2 - s3))
      );
      expect(await boost.adjustedVeBalance(deployer.address)).to.eq(
        (await ve["balanceOf(address)"](deployer.address)) - (bias3 - slope3 * toBigInt(e2 - s3))
      );

      // jump to timestamp e3
      await network.provider.send("evm_setNextBlockTimestamp", [e3]);
      await expect(boost.checkpoint(holder0.address))
        .to.emit(boost, "Transfer")
        .withArgs(holder0.address, ZeroAddress, slope2 * toBigInt(e2 - e1) + slope3 * toBigInt(e3 - e1));
      expect((await boost.received(holder0.address)).bias).to.eq(0n);
      expect((await boost.received(holder0.address)).slope).to.eq(0n);
      expect(await boost.delegatedBalance(deployer.address)).to.eq(0n);
      expect(await boost.receivedBalance(holder0.address)).to.eq(0n);
      expect(await boost.adjustedVeBalance(holder0.address)).to.eq(await ve["balanceOf(address)"](holder0.address));
      expect(await boost.adjustedVeBalance(deployer.address)).to.eq(await ve["balanceOf(address)"](deployer.address));
      await expect(boost.checkpoint(deployer.address)).to.not.emit(boost, "Transfer");
      expect((await boost.delegated(holder0.address)).bias).to.eq(0n);
      expect((await boost.delegated(holder0.address)).slope).to.eq(0n);
    });
  });

  context("#boostFrom", async () => {
    beforeEach(async () => {
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      await token.connect(holder0).approve(await ve.getAddress(), MaxUint256);
      await ve.connect(holder0).create_lock(ethers.parseEther("123"), timestamp + 86400 * 365 * 4);
      await token.connect(holder1).approve(await ve.getAddress(), MaxUint256);
      await ve.connect(holder1).create_lock(ethers.parseEther("456"), timestamp + 86400 * 365 * 4);
      await boost.approve(holder0.address, ethers.parseEther("600"));
    });

    it("should revert when exceed allowance", async () => {
      await expect(
        boost.connect(holder1).boostFrom(deployer.address, holder0.address, 1n, MaxUint256)
      ).to.revertedWithCustomError(boost, "InsufficientAllowance");
    });

    it("should revert when boost zero", async () => {
      await expect(
        boost.connect(holder0).boostFrom(deployer.address, holder0.address, 0n, MaxUint256)
      ).to.revertedWithCustomError(boost, "BoostZeroAmount");
    });

    it("should revert when smaller than now", async () => {
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 100]);
      await expect(
        boost.connect(holder0).boostFrom(deployer.address, holder0.address, 1n, timestamp + 99)
      ).to.revertedWithCustomError(boost, "EndTimeSmallerThanCurrentTimestamp");
    });

    it("should revert when not aligned with week", async () => {
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 100]);
      await expect(
        boost
          .connect(holder0)
          .boostFrom(deployer.address, holder0.address, 1n, Math.floor(timestamp / Week) * Week + Week * 2 - 1)
      ).to.revertedWithCustomError(boost, "EndTimeNotAlignedWithWeek");
      await expect(
        boost
          .connect(holder0)
          .boostFrom(deployer.address, holder0.address, 1n, Math.floor(timestamp / Week) * Week + Week * 2 + 1)
      ).to.revertedWithCustomError(boost, "EndTimeNotAlignedWithWeek");
    });

    it("should revert when exceed lockend", async () => {
      await expect(
        boost
          .connect(holder0)
          .boostFrom(deployer.address, holder0.address, 1n, (await ve.locked__end(deployer.address)) + toBigInt(Week))
      ).to.revertedWithCustomError(boost, "EndTimeExceedLockEnd");
    });

    it("should revert when exceed balance", async () => {
      await boost.approve(holder0.address, MaxUint256);
      await expect(
        boost
          .connect(holder0)
          .boostFrom(
            deployer.address,
            holder0.address,
            ethers.parseEther("10000") + 1n,
            await ve.locked__end(deployer.address)
          )
      ).to.revertedWithCustomError(boost, "BoostExceedBalance");
    });

    it("should succeed", async () => {
      const t0 = (await ethers.provider.getBlock("latest"))!.timestamp;
      const s1 = t0 + Week;
      const e1 = Math.floor(t0 / Week) * Week + Week * 52;
      const s2 = t0 + Week * 10;
      const e2 = Math.floor(t0 / Week) * Week + Week * 56;
      const s3 = t0 + Week * 20;
      const e3 = Math.floor(t0 / Week) * Week + Week * 60;

      // boost 100 to holder0 at timestamp s1
      const slope1 = ethers.parseEther("100") / toBigInt(e1 - s1);
      const bias1 = slope1 * toBigInt(e1 - s1);
      await network.provider.send("evm_setNextBlockTimestamp", [s1]);
      await expect(boost.connect(holder0).boostFrom(deployer.address, holder0.address, ethers.parseEther("100"), e1))
        .to.emit(boost, "Approval")
        .withArgs(deployer.address, holder0.address, ethers.parseEther("500"))
        .to.emit(boost, "Transfer")
        .withArgs(deployer.address, holder0.address, bias1)
        .to.emit(boost, "Boost")
        .withArgs(deployer.address, holder0.address, bias1, slope1, s1);
      expect((await boost.boosts(deployer.address, 0)).receiver).to.eq(holder0.address);
      expect((await boost.boosts(deployer.address, 0)).startTime).to.eq(s1);
      expect((await boost.boosts(deployer.address, 0)).endTime).to.eq(e1);
      expect((await boost.boosts(deployer.address, 0)).initialAmount).to.eq(bias1);
      expect((await boost.boosts(deployer.address, 0)).cancelAmount).to.eq(0n);
      expect(await boost.boostLength(deployer.address)).to.eq(1n);
      expect((await boost.delegated(deployer.address)).ts).to.eq(s1);
      expect((await boost.delegated(deployer.address)).bias).to.eq(bias1);
      expect((await boost.delegated(deployer.address)).slope).to.eq(slope1);
      expect((await boost.received(holder0.address)).ts).to.eq(s1);
      expect((await boost.received(holder0.address)).bias).to.eq(bias1);
      expect((await boost.received(holder0.address)).slope).to.eq(slope1);
      expect(await boost.delegatedBalance(deployer.address)).to.eq(bias1);
      expect(await boost.receivedBalance(holder0.address)).to.eq(bias1);
      expect(await boost.adjustedVeBalance(holder0.address)).to.eq(
        (await ve["balanceOf(address)"](holder0.address)) + bias1
      );
      expect(await boost.adjustedVeBalance(deployer.address)).to.eq(
        (await ve["balanceOf(address)"](deployer.address)) - bias1
      );

      // boost 200 to holder0 at timestamp s2
      const slope2 = ethers.parseEther("200") / toBigInt(e2 - s2);
      const bias2 = slope2 * toBigInt(e2 - s2);
      await network.provider.send("evm_setNextBlockTimestamp", [s2]);
      await expect(boost.connect(holder0).boostFrom(deployer.address, holder0.address, ethers.parseEther("200"), e2))
        .to.emit(boost, "Approval")
        .withArgs(deployer.address, holder0.address, ethers.parseEther("300"))
        .to.emit(boost, "Transfer")
        .withArgs(holder0.address, ZeroAddress, slope1 * toBigInt(s2 - s1))
        .to.emit(boost, "Transfer")
        .withArgs(deployer.address, holder0.address, bias2)
        .to.emit(boost, "Boost")
        .withArgs(deployer.address, holder0.address, bias2, slope2, s2);
      expect(await boost.boostLength(deployer.address)).to.eq(2n);
      expect((await boost.boosts(deployer.address, 1)).receiver).to.eq(holder0.address);
      expect((await boost.boosts(deployer.address, 1)).startTime).to.eq(s2);
      expect((await boost.boosts(deployer.address, 1)).endTime).to.eq(e2);
      expect((await boost.boosts(deployer.address, 1)).initialAmount).to.eq(bias2);
      expect((await boost.boosts(deployer.address, 1)).cancelAmount).to.eq(0n);
      expect((await boost.delegated(deployer.address)).ts).to.eq(s2);
      expect((await boost.delegated(deployer.address)).bias).to.eq(bias1 + bias2 - slope1 * toBigInt(s2 - s1));
      expect((await boost.delegated(deployer.address)).slope).to.eq(slope1 + slope2);
      expect((await boost.received(holder0.address)).ts).to.eq(s2);
      expect((await boost.received(holder0.address)).bias).to.eq(bias1 + bias2 - slope1 * toBigInt(s2 - s1));
      expect((await boost.received(holder0.address)).slope).to.eq(slope1 + slope2);
      expect(await boost.delegatedBalance(deployer.address)).to.eq(bias1 + bias2 - slope1 * toBigInt(s2 - s1));
      expect(await boost.receivedBalance(holder0.address)).to.eq(bias1 + bias2 - slope1 * toBigInt(s2 - s1));
      expect(await boost.adjustedVeBalance(holder0.address)).to.eq(
        (await ve["balanceOf(address)"](holder0.address)) + bias1 + bias2 - slope1 * toBigInt(s2 - s1)
      );
      expect(await boost.adjustedVeBalance(deployer.address)).to.eq(
        (await ve["balanceOf(address)"](deployer.address)) - (bias1 + bias2 - slope1 * toBigInt(s2 - s1))
      );

      // boost 300 to holder0 at timestamp s3
      const slope3 = ethers.parseEther("300") / toBigInt(e3 - s3);
      const bias3 = slope3 * toBigInt(e3 - s3);
      await network.provider.send("evm_setNextBlockTimestamp", [s3]);
      await expect(boost.connect(holder0).boostFrom(deployer.address, holder0.address, ethers.parseEther("300"), e3))
        .to.emit(boost, "Approval")
        .withArgs(deployer.address, holder0.address, 0n)
        .to.emit(boost, "Transfer")
        .withArgs(holder0.address, ZeroAddress, (slope1 + slope2) * toBigInt(s3 - s2))
        .to.emit(boost, "Transfer")
        .withArgs(deployer.address, holder0.address, bias3)
        .to.emit(boost, "Boost")
        .withArgs(deployer.address, holder0.address, bias3, slope3, s3);
      expect(await boost.boostLength(deployer.address)).to.eq(3n);
      expect((await boost.boosts(deployer.address, 2)).receiver).to.eq(holder0.address);
      expect((await boost.boosts(deployer.address, 2)).startTime).to.eq(s3);
      expect((await boost.boosts(deployer.address, 2)).endTime).to.eq(e3);
      expect((await boost.boosts(deployer.address, 2)).initialAmount).to.eq(bias3);
      expect((await boost.boosts(deployer.address, 2)).cancelAmount).to.eq(0n);
      expect((await boost.delegated(deployer.address)).ts).to.eq(s3);
      expect((await boost.delegated(deployer.address)).bias).to.eq(
        bias1 + bias2 + bias3 - slope1 * toBigInt(s3 - s1) - slope2 * toBigInt(s3 - s2)
      );
      expect((await boost.delegated(deployer.address)).slope).to.eq(slope1 + slope2 + slope3);
      expect((await boost.received(holder0.address)).ts).to.eq(s3);
      expect((await boost.received(holder0.address)).bias).to.eq(
        bias1 + bias2 + bias3 - slope1 * toBigInt(s3 - s1) - slope2 * toBigInt(s3 - s2)
      );
      expect((await boost.received(holder0.address)).slope).to.eq(slope1 + slope2 + slope3);
      expect(await boost.delegatedBalance(deployer.address)).to.eq(
        bias1 + bias2 + bias3 - slope1 * toBigInt(s3 - s1) - slope2 * toBigInt(s3 - s2)
      );
      expect(await boost.receivedBalance(holder0.address)).to.eq(
        bias1 + bias2 + bias3 - slope1 * toBigInt(s3 - s1) - slope2 * toBigInt(s3 - s2)
      );
      expect(await boost.adjustedVeBalance(holder0.address)).to.eq(
        (await ve["balanceOf(address)"](holder0.address)) +
          bias1 +
          bias2 +
          bias3 -
          slope1 * toBigInt(s3 - s1) -
          slope2 * toBigInt(s3 - s2)
      );
      expect(await boost.adjustedVeBalance(deployer.address)).to.eq(
        (await ve["balanceOf(address)"](deployer.address)) -
          (bias1 + bias2 + bias3 - slope1 * toBigInt(s3 - s1) - slope2 * toBigInt(s3 - s2))
      );

      // jump to timestamp e1
      await network.provider.send("evm_setNextBlockTimestamp", [e1]);
      await expect(boost.checkpoint(holder0.address))
        .to.emit(boost, "Transfer")
        .withArgs(holder0.address, ZeroAddress, (slope1 + slope2 + slope3) * toBigInt(e1 - s3));
      expect((await boost.received(holder0.address)).bias).to.eq(
        bias2 + bias3 - slope2 * toBigInt(e1 - s2) - slope3 * toBigInt(e1 - s3)
      );
      expect((await boost.received(holder0.address)).slope).to.eq(slope2 + slope3);
      expect(await boost.delegatedBalance(deployer.address)).to.eq(
        bias2 + bias3 - slope2 * toBigInt(e1 - s2) - slope3 * toBigInt(e1 - s3)
      );
      expect(await boost.receivedBalance(holder0.address)).to.eq(
        bias2 + bias3 - slope2 * toBigInt(e1 - s2) - slope3 * toBigInt(e1 - s3)
      );
      expect(await boost.adjustedVeBalance(holder0.address)).to.eq(
        (await ve["balanceOf(address)"](holder0.address)) +
          (bias2 + bias3 - slope2 * toBigInt(e1 - s2) - slope3 * toBigInt(e1 - s3))
      );
      expect(await boost.adjustedVeBalance(deployer.address)).to.eq(
        (await ve["balanceOf(address)"](deployer.address)) -
          (bias2 + bias3 - slope2 * toBigInt(e1 - s2) - slope3 * toBigInt(e1 - s3))
      );

      // jump to timestamp e2
      await network.provider.send("evm_setNextBlockTimestamp", [e2]);
      await expect(boost.checkpoint(deployer.address)).to.not.emit(boost, "Transfer");
      expect((await boost.delegated(deployer.address)).bias).to.eq(bias3 - slope3 * toBigInt(e2 - s3));
      expect((await boost.delegated(deployer.address)).slope).to.eq(slope3);
      expect(await boost.delegatedBalance(deployer.address)).to.eq(bias3 - slope3 * toBigInt(e2 - s3));
      expect(await boost.receivedBalance(holder0.address)).to.eq(bias3 - slope3 * toBigInt(e2 - s3));
      expect(await boost.adjustedVeBalance(holder0.address)).to.eq(
        (await ve["balanceOf(address)"](holder0.address)) + (bias3 - slope3 * toBigInt(e2 - s3))
      );
      expect(await boost.adjustedVeBalance(deployer.address)).to.eq(
        (await ve["balanceOf(address)"](deployer.address)) - (bias3 - slope3 * toBigInt(e2 - s3))
      );

      // jump to timestamp e3
      await network.provider.send("evm_setNextBlockTimestamp", [e3]);
      await expect(boost.checkpoint(holder0.address))
        .to.emit(boost, "Transfer")
        .withArgs(holder0.address, ZeroAddress, slope2 * toBigInt(e2 - e1) + slope3 * toBigInt(e3 - e1));
      expect((await boost.received(holder0.address)).bias).to.eq(0n);
      expect((await boost.received(holder0.address)).slope).to.eq(0n);
      expect(await boost.delegatedBalance(deployer.address)).to.eq(0n);
      expect(await boost.receivedBalance(holder0.address)).to.eq(0n);
      expect(await boost.adjustedVeBalance(holder0.address)).to.eq(await ve["balanceOf(address)"](holder0.address));
      expect(await boost.adjustedVeBalance(deployer.address)).to.eq(await ve["balanceOf(address)"](deployer.address));
      await expect(boost.checkpoint(deployer.address)).to.not.emit(boost, "Transfer");
      expect((await boost.delegated(holder0.address)).bias).to.eq(0n);
      expect((await boost.delegated(holder0.address)).slope).to.eq(0n);
    });
  });

  context("#unboost", async () => {
    beforeEach(async () => {
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      await token.connect(holder0).approve(await ve.getAddress(), MaxUint256);
      await ve.connect(holder0).create_lock(ethers.parseEther("123"), timestamp + 86400 * 365 * 4);
      await token.connect(holder1).approve(await ve.getAddress(), MaxUint256);
      await ve.connect(holder1).create_lock(ethers.parseEther("456"), timestamp + 86400 * 365 * 4);
    });

    it("should revert, when index out of bound", async () => {
      await expect(boost.unboost(deployer.address, 1, 0n)).to.revertedWithCustomError(boost, "IndexOutOfBound");
    });

    it("should revert, when call not by receiver", async () => {
      const t0 = (await ethers.provider.getBlock("latest"))!.timestamp;
      const s1 = t0 + Week;
      const e1 = Math.floor(t0 / Week) * Week + Week * 52;

      const slope1 = ethers.parseEther("100") / toBigInt(e1 - s1);
      const bias1 = slope1 * toBigInt(e1 - s1);
      await network.provider.send("evm_setNextBlockTimestamp", [s1]);
      await boost.boost(holder0.address, ethers.parseEther("100"), e1);

      await expect(boost.unboost(deployer.address, 0, bias1)).to.revertedWithCustomError(
        boost,
        "ErrorOnlyCancelByReceiver"
      );
    });

    it("should revert, when unboost exceed balance", async () => {
      const t0 = (await ethers.provider.getBlock("latest"))!.timestamp;
      const s1 = t0 + Week;
      const e1 = Math.floor(t0 / Week) * Week + Week * 52;

      const slope1 = ethers.parseEther("100") / toBigInt(e1 - s1);
      const bias1 = slope1 * toBigInt(e1 - s1);
      await network.provider.send("evm_setNextBlockTimestamp", [s1]);
      await boost.boost(holder0.address, ethers.parseEther("100"), e1);

      await expect(boost.connect(holder0).unboost(deployer.address, 0, bias1 + 1n)).to.revertedWithCustomError(
        boost,
        "CancelBoostExceedBalance"
      );
    });

    it("should revert, when unboost expired", async () => {
      const t0 = (await ethers.provider.getBlock("latest"))!.timestamp;
      const s1 = t0 + Week;
      const e1 = Math.floor(t0 / Week) * Week + Week * 52;

      const slope1 = ethers.parseEther("100") / toBigInt(e1 - s1);
      const bias1 = slope1 * toBigInt(e1 - s1);
      await network.provider.send("evm_setNextBlockTimestamp", [s1]);
      await boost.boost(holder0.address, ethers.parseEther("100"), e1);

      await network.provider.send("evm_setNextBlockTimestamp", [e1]);
      await expect(boost.connect(holder0).unboost(deployer.address, 0, bias1)).to.revertedWithCustomError(
        boost,
        "CancelExpiredBoost"
      );
    });

    it("should succeed", async () => {
      const t0 = (await ethers.provider.getBlock("latest"))!.timestamp;
      const s1 = t0 + Week;
      const e1 = Math.floor(t0 / Week) * Week + Week * 52;
      const s2 = t0 + Week * 10;
      const e2 = Math.floor(t0 / Week) * Week + Week * 56;

      // boost 100 to holder0 at timestamp s1
      const slope1 = ethers.parseEther("100") / toBigInt(e1 - s1);
      const bias1 = slope1 * toBigInt(e1 - s1);
      await network.provider.send("evm_setNextBlockTimestamp", [s1]);
      await boost.boost(holder0.address, ethers.parseEther("100"), e1);

      // boost 200 to holder0 at timestamp s2
      const slope2 = ethers.parseEther("200") / toBigInt(e2 - s2);
      const bias2 = slope2 * toBigInt(e2 - s2);
      await network.provider.send("evm_setNextBlockTimestamp", [s2]);
      await boost.boost(holder0.address, ethers.parseEther("200"), e2);

      const u1 = t0 + Week * 30 + 233;
      // cancel half of boost1
      await network.provider.send("evm_setNextBlockTimestamp", [u1]);
      await expect(boost.connect(holder0).unboost(deployer.address, 0, bias1 / 2n))
        .to.emit(boost, "Transfer")
        .withArgs(holder0.address, ZeroAddress, slope1 * toBigInt(u1 - s2) + slope2 * toBigInt(u1 - s2))
        .to.emit(boost, "Transfer")
        .withArgs(holder0.address, ZeroAddress, (slope1 / 2n) * toBigInt(e1 - u1))
        .to.emit(boost, "Unboost");
      expect((await boost.boosts(deployer.address, 0)).cancelAmount).to.eq(bias1 / 2n);
      expect((await boost.delegated(deployer.address)).ts).to.eq(u1);
      expect((await boost.delegated(deployer.address)).bias).to.eq(
        bias1 / 2n + bias2 - (slope1 / 2n) * toBigInt(u1 - s1) - slope2 * toBigInt(u1 - s2)
      );
      expect((await boost.delegated(deployer.address)).slope).to.eq(slope1 / 2n + slope2);
      expect((await boost.received(holder0.address)).ts).to.eq(u1);
      expect((await boost.received(holder0.address)).bias).to.eq(
        bias1 / 2n + bias2 - (slope1 / 2n) * toBigInt(u1 - s1) - slope2 * toBigInt(u1 - s2)
      );
    });
  });
});

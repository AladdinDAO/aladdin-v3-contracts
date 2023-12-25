import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MockERC20, VotingEscrow, VotingEscrowHelper } from "@/types/index";
import { expect } from "chai";
import { MaxUint256, toBigInt } from "ethers";
import { ethers, network } from "hardhat";
import { randomInt } from "crypto";

const Week = 86400 * 7;

describe("VotingEscrowBoost.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let token: MockERC20;
  let ve: VotingEscrow;
  let helper: VotingEscrowHelper;

  beforeEach(async () => {
    [deployer, signer] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow", deployer);
    const VotingEscrowHelper = await ethers.getContractFactory("VotingEscrowHelper", deployer);

    token = await MockERC20.deploy("X", "X", 18);
    ve = await VotingEscrow.deploy();
    await ve.initialize(deployer.address, await token.getAddress(), "VotingEscrow X", "veX", "1");

    await token.mint(deployer.address, ethers.parseEther("1000000000"));
    await token.mint(signer.address, ethers.parseEther("1000000000"));
    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    await token.approve(await ve.getAddress(), MaxUint256);
    await ve.create_lock(ethers.parseEther("10000"), timestamp + 86400 * 365 * 4);

    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + Week * 2]);
    helper = await VotingEscrowHelper.deploy(await ve.getAddress());
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      expect(await helper.ve()).to.eq(await ve.getAddress());
      expect(await helper.start()).to.eq((await ve.point_history(1)).ts);
    });
  });

  const fetchSupply = async (timestamp: number): Promise<bigint> => {
    const epoch = await ve.epoch();
    let answer = 0n;
    for (let i = 1n; i <= epoch; i += 1n) {
      const point = await ve.point_history(i);
      if (point.ts <= timestamp) {
        answer = point.bias - point.slope * (toBigInt(timestamp) - point.ts);
        if (answer < 0n) answer = 0n;
      } else {
        break;
      }
    }
    return answer;
  };

  const fetchBalance = async (account: string, timestamp: number): Promise<bigint> => {
    const epoch = await ve.user_point_epoch(account);
    let answer = 0n;
    for (let i = 1n; i <= epoch; i += 1n) {
      const point = await ve.user_point_history(account, i);
      if (point.ts <= timestamp) {
        answer = point.bias - point.slope * (toBigInt(timestamp) - point.ts);
        if (answer < 0n) answer = 0n;
      }
    }
    return answer;
  };

  context("#totalSupply", async () => {
    it("should return 0 when timestamp is smaller than start", async () => {
      const start = await helper.start();
      expect(await helper.totalSupply(start)).to.gt(0n);
      expect(await helper.totalSupply(start - 1n)).to.eq(0n);
    });

    for (let checkpointDelta = 1; checkpointDelta <= 4; ++checkpointDelta) {
      it(`should read correct total supply, checkpoint every ${checkpointDelta} weeks`, async () => {
        await token.connect(signer).approve(ve.getAddress(), MaxUint256);
        const startTimestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
        await ve.connect(signer).create_lock(ethers.parseEther("1000"), startTimestamp + Week * 5);
        for (let i = 0; i < 20; ++i) {
          const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
          const delta = Week + randomInt(86400);
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + delta]);
          await ve.connect(signer).increase_amount(ethers.parseEther(((1000 + randomInt(100000)) / 100).toFixed(2)));
          await ve.connect(signer).increase_unlock_time(timestamp + delta + Week * 5);
          if (i % checkpointDelta === 0) {
            await helper.checkpoint(signer.address);
          }
        }
        for (let i = 0; i < 30; ++i) {
          // test random time point
          let timestamp = startTimestamp + Week * i + randomInt(Week);
          let expected = await fetchSupply(timestamp);
          expect(expected).to.eq(await helper.totalSupply(timestamp));
          // test week time point
          timestamp = Math.floor(startTimestamp / Week) * Week + Week * i;
          expected = await fetchSupply(timestamp);
          expect(expected).to.eq(await helper.totalSupply(timestamp));
        }
        expect(await helper.totalSupply(startTimestamp + 86400 * 365 * 4)).to.eq(0n);

        const start = await helper.start();
        expect(await helper.totalSupply(start)).to.gt(0n);
      });
    }
  });

  context("#balanceOf", async () => {
    it("should return 0 when timestamp is smaller than start", async () => {
      const start = await helper.start();
      expect(await helper.balanceOf(deployer.address, start)).to.gt(0n);
      expect(await helper.balanceOf(deployer.address, start - 1n)).to.eq(0n);
    });

    it("should return 0 when holder has no lock", async () => {
      const start = await helper.start();
      expect(await helper.balanceOf(signer.address, start)).to.eq(0n);
      expect(await helper.balanceOf(signer.address, start + 1n)).to.eq(0n);
    });

    for (let checkpointDelta = 1; checkpointDelta <= 4; ++checkpointDelta) {
      it(`should read correct balance, checkpoint every ${checkpointDelta} weeks`, async () => {
        await token.connect(signer).approve(ve.getAddress(), MaxUint256);
        const startTimestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
        await ve.connect(signer).create_lock(ethers.parseEther("1000"), startTimestamp + Week * 5);
        for (let i = 0; i < 20; ++i) {
          const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
          const delta = Week + randomInt(86400);
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + delta]);
          await ve.connect(signer).increase_amount(ethers.parseEther(((1000 + randomInt(100000)) / 100).toFixed(2)));
          await ve.connect(signer).increase_unlock_time(timestamp + delta + Week * 5);
          if (i % checkpointDelta === 0) {
            await helper.checkpoint(signer.address);
          }
        }
        for (let i = 0; i < 30; ++i) {
          // test random time point
          let timestamp = startTimestamp + Week * i + randomInt(Week);
          let expected = await fetchBalance(signer.address, timestamp);
          expect(expected).to.eq(await helper.balanceOf(signer.address, timestamp));
          // test week time point
          timestamp = Math.floor(startTimestamp / Week) * Week + Week * i;
          expected = await fetchBalance(signer.address, timestamp);
          expect(expected).to.eq(await helper.balanceOf(signer.address, timestamp));
        }
        expect(await helper.balanceOf(signer.address, startTimestamp + 86400 * 365 * 4)).to.eq(0n);

        const start = await helper.start();
        expect(await helper.balanceOf(deployer.address, start)).to.gt(0n);
      });
    }
  });
});

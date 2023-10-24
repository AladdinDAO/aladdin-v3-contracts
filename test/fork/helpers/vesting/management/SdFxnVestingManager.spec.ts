/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MaxUint256, ZeroHash, toBigInt } from "ethers";
import { ethers, network } from "hardhat";

import { request_fork } from "@/test/utils";
import { ManageableVesting, SdFxnVestingManager, GovernanceToken, MockERC20 } from "@/types/index";
import { TOKENS } from "@/utils/index";
import { expect } from "chai";

const ForkHeight = 18300000;
const FxnHolder = "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF";
const Deployer = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const SdFxnGauge = "0xbcfE5c47129253C6B8a9A00565B3358b488D42E0";

describe("SdFxnVestingManager.spec", async () => {
  const amount = ethers.parseEther("1000");

  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let token: GovernanceToken;
  let manager: SdFxnVestingManager;
  let vesting: ManageableVesting;
  let staker: MockERC20;
  let timestamp: number;

  beforeEach(async () => {
    request_fork(ForkHeight, [Deployer, FxnHolder]);
    deployer = await ethers.getSigner(Deployer);
    signer = await ethers.getSigner(FxnHolder);
    await deployer.sendTransaction({ to: signer.address, value: ethers.parseEther("10") });

    token = await ethers.getContractAt("GovernanceToken", TOKENS.FXN.address, signer);
    staker = await ethers.getContractAt("MockERC20", SdFxnGauge, signer);

    const SdFxnVestingManager = await ethers.getContractFactory("SdFxnVestingManager", deployer);
    manager = await SdFxnVestingManager.deploy();

    const ManageableVesting = await ethers.getContractFactory("ManageableVesting", deployer);
    vesting = await ManageableVesting.deploy(token.getAddress());

    await vesting.addVestingManager(manager.getAddress());
    await vesting.grantRole(await vesting.VESTING_CREATOR_ROLE(), signer.address);
    await token.approve(await vesting.getAddress(), MaxUint256);
    timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    await vesting.connect(signer).newVesting(deployer.address, amount, timestamp + 1000, timestamp + 1000 + 86400 * 7);

    expect(await manager.originalToken()).to.eq(await token.getAddress());
    expect(await manager.managedToken()).to.eq(await staker.getAddress());
  });

  context("manage", async () => {
    for (const delta of [1000, 86400 * 3, 1000 + 86400 * 7]) {
      it(`should vest all after ${delta} seconds`, async () => {
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + delta]);
        await vesting.manage([0], 1);
        expect(await manager.balanceOf(await vesting.proxy(deployer.address))).to.eq(amount);
        expect(await staker.balanceOf(await vesting.proxy(deployer.address))).to.eq(amount);
      });

      it(`should vest unclaimed after ${delta} seconds`, async () => {
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + delta]);
        await vesting["claim()"]();
        const locked = await vesting.locked(deployer.address);
        if (locked > 0n) {
          await vesting.manage([0], 1);
          expect(await manager.balanceOf(await vesting.proxy(deployer.address))).to.eq(locked);
          expect(await staker.balanceOf(await vesting.proxy(deployer.address))).to.eq(locked);
        }
      });
    }
  });

  context("claim", async () => {
    for (const delta of [1000, 86400 * 3, 1000 + 86400 * 7]) {
      it(`should claim all after ${delta} seconds`, async () => {
        await vesting.manage([0], 1);
        expect(await manager.balanceOf(await vesting.proxy(deployer.address))).to.eq(amount);
        expect(await staker.balanceOf(await vesting.proxy(deployer.address))).to.eq(amount);

        const claimed = (toBigInt(delta - 1000) * amount) / toBigInt(86400 * 7);
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + delta]);
        await vesting["claim(uint32)"](1);
        expect(await manager.balanceOf(await vesting.proxy(deployer.address))).to.eq(amount - claimed);
        expect(await staker.balanceOf(await vesting.proxy(deployer.address))).to.eq(amount - claimed);
        expect(await staker.balanceOf(deployer.address)).to.eq(claimed);
      });
    }
  });

  context("cancel", async () => {
    for (const delta of [1000, 86400 * 3, 1000 + 86400 * 7]) {
      it(`should cancel all after ${delta} seconds`, async () => {
        await vesting.manage([0], 1);
        expect(await manager.balanceOf(await vesting.proxy(deployer.address))).to.eq(amount);
        expect(await staker.balanceOf(await vesting.proxy(deployer.address))).to.eq(amount);
        await vesting.grantRole(ZeroHash, signer.address);

        const vested = (toBigInt(delta - 1000) * amount) / toBigInt(86400 * 7);
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + delta]);
        await vesting.connect(signer).cancel(deployer.address, 0);
        expect(await manager.balanceOf(await vesting.proxy(deployer.address))).to.eq(vested);
        expect(await staker.balanceOf(await vesting.proxy(deployer.address))).to.eq(vested);
        expect(await staker.balanceOf(signer.address)).to.eq(amount - vested);
      });
    }
  });

  context("getReward", async () => {
    it("should succeed when claim through vesting", async () => {
      const sdt = await ethers.getContractAt("MockERC20", TOKENS.SDT.address, signer);
      await vesting.manage([0], 1);
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      const before = await sdt.balanceOf(signer.address);
      await vesting.getReward(1, signer.address);
      const after = await sdt.balanceOf(signer.address);
      expect(after).to.gt(before);
    });

    it("should succeed when claim through staker", async () => {
      const sdt = await ethers.getContractAt("MockERC20", TOKENS.SDT.address, signer);
      const gauge = await ethers.getContractAt("ICurveGauge", SdFxnGauge, signer);
      await vesting.manage([0], 1);
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      const before = await sdt.balanceOf(deployer.address);
      await gauge["claim_rewards(address)"](await vesting.proxy(deployer.address));
      const after = await sdt.balanceOf(deployer.address);
      expect(after).to.gt(before);
    });
  });
});

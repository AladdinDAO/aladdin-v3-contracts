/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { id } from "ethers";
import { ethers } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import { FeeDistributor, FeeDistributorAdmin } from "@/types/index";
import { expect } from "chai";

const ForkHeight = 19680300;
const DEPLOYER = "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF";
const DISTRIBUTOR = "0xd116513EEa4Efe3908212AfBAeFC76cb29245681";

describe("SdFxnVestingManager.spec", async () => {
  let deployer: HardhatEthersSigner;

  let admin: FeeDistributorAdmin;
  let distributor: FeeDistributor;

  beforeEach(async () => {
    request_fork(ForkHeight, [DEPLOYER]);
    deployer = await ethers.getSigner(DEPLOYER);

    await mockETHBalance(deployer.address, ethers.parseEther("10000"));

    const FeeDistributorAdmin = await ethers.getContractFactory("FeeDistributorAdmin", deployer);
    admin = await FeeDistributorAdmin.deploy();

    distributor = await ethers.getContractAt("FeeDistributor", DISTRIBUTOR, deployer);
    await distributor.commit_admin(admin.getAddress());
    await distributor.apply_admin();

    await admin.grantRole(id("FEE_DISTRIBUTOR_ROLE"), DISTRIBUTOR);
    await admin.grantRole(id("CHECKPOINT_ROLE"), deployer.address);
  });

  it("should checkpoint", async () => {
    await expect(distributor.checkpoint_token()).to.reverted;
    const last = await distributor.last_token_time();
    await admin.checkpoint(DISTRIBUTOR);
    expect(await distributor.last_token_time()).to.gt(last);
  });

  it("should transferAdmin", async () => {
    expect(await distributor.admin()).to.eq(await admin.getAddress());
    await admin.transferAdmin(DISTRIBUTOR, deployer.address);
    expect(await distributor.admin()).to.eq(deployer.address);
  });

  it("should toggleAllowCheckpointToken", async () => {
    expect(await distributor.can_checkpoint_token()).to.eq(true);
    await admin.toggleAllowCheckpointToken(DISTRIBUTOR);
    expect(await distributor.can_checkpoint_token()).to.eq(false);
    await admin.toggleAllowCheckpointToken(DISTRIBUTOR);
    expect(await distributor.can_checkpoint_token()).to.eq(true);
  });

  it("should killDistributor", async () => {
    const token = await ethers.getContractAt("MockERC20", await distributor.token(), deployer);
    const balance = await token.balanceOf(DISTRIBUTOR);
    expect(await distributor.is_killed()).to.eq(false);
    const before = await token.balanceOf(DEPLOYER);
    await admin.killDistributor(DISTRIBUTOR);
    const after = await token.balanceOf(DEPLOYER);
    expect(await distributor.is_killed()).to.eq(true);
    expect(await token.balanceOf(DISTRIBUTOR)).to.eq(0);
    expect(after - before).to.eq(balance);
  });

  it("should recoverBalance", async () => {
    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    const token = await MockERC20.deploy("X", "Y", 18);
    await token.mint(DISTRIBUTOR, 10000n);
    await admin.recoverBalance(DISTRIBUTOR, token.getAddress());
    expect(await token.balanceOf(DEPLOYER)).to.eq(10000n);
  });
});

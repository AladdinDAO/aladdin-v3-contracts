import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { MockERC20, MockVestingManager, VestingManagerProxy } from "@/types/index";

describe("VestingManagerProxy.spec", async () => {
  let deployer: HardhatEthersSigner;
  let vesting: HardhatEthersSigner;

  let token: MockERC20;
  let manager: MockVestingManager;
  let proxy: VestingManagerProxy;

  beforeEach(async () => {
    [deployer, vesting] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    token = await MockERC20.deploy("X", "Y", 18);

    const MockVestingManager = await ethers.getContractFactory("MockVestingManager", deployer);
    manager = await MockVestingManager.deploy(token.getAddress(), token.getAddress());

    const VestingManagerProxy = await ethers.getContractFactory("VestingManagerProxy", deployer);
    proxy = await VestingManagerProxy.deploy(vesting.address);
  });

  it("should initialize correctly", async () => {
    expect(await proxy.vesting()).to.eq(await vesting.getAddress());
  });

  context("#execute", async () => {
    it("should revert, when non-vesting call", async () => {
      await expect(proxy.execute(ZeroAddress, "0x")).to.revertedWith("caller is not vesting");
    });

    it("should succeed", async () => {
      const instance = await ethers.getContractAt("MockVestingManager", await proxy.getAddress(), deployer);
      await expect(
        proxy.connect(vesting).execute(manager.getAddress(), manager.interface.encodeFunctionData("doCall"))
      ).to.emit(instance, "Call");
    });

    it("should propagate error up", async () => {
      await expect(
        proxy.connect(vesting).execute(manager.getAddress(), manager.interface.encodeFunctionData("doRevert"))
      ).to.revertedWith("revert");
    });
  });
});

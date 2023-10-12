import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { MockERC20, PlainVestingManager, VestingManagerProxy } from "@/types/index";

describe("PlainVestingManager.spec", async () => {
  let deployer: HardhatEthersSigner;
  let vesting: HardhatEthersSigner;

  let token: MockERC20;
  let manager: PlainVestingManager;
  let proxy: VestingManagerProxy;

  beforeEach(async () => {
    [deployer, vesting] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    token = await MockERC20.deploy("X", "Y", 18);

    const PlainVestingManager = await ethers.getContractFactory("PlainVestingManager", deployer);
    manager = await PlainVestingManager.deploy(token.getAddress());

    const VestingManagerProxy = await ethers.getContractFactory("VestingManagerProxy", deployer);
    proxy = await VestingManagerProxy.deploy(vesting.address);
  });

  it("should initialize correctly", async () => {
    expect(await manager.originalToken()).to.eq(await token.getAddress());
    expect(await manager.managedToken()).to.eq(await token.getAddress());
  });

  context("#balanceOf", async () => {
    it("should should balance correctly", async () => {
      expect(await manager.balanceOf(proxy.getAddress())).to.eq(0n);
      await token.mint(proxy.getAddress(), 1n);
      expect(await manager.balanceOf(proxy.getAddress())).to.eq(1n);
      await token.mint(proxy.getAddress(), 100n);
      expect(await manager.balanceOf(proxy.getAddress())).to.eq(101n);
    });
  });

  context("#manage", async () => {
    it("should not revert", async () => {
      await proxy
        .connect(vesting)
        .execute(manager.getAddress(), manager.interface.encodeFunctionData("manage", [0n, ZeroAddress]));
    });
  });

  context("#withdraw", async () => {
    it("should succeed", async () => {
      await token.mint(proxy.getAddress(), 100n);
      expect(await manager.balanceOf(proxy.getAddress())).to.eq(100n);
      await proxy
        .connect(vesting)
        .execute(manager.getAddress(), manager.interface.encodeFunctionData("withdraw", [100n, deployer.address]));
      expect(await manager.balanceOf(proxy.getAddress())).to.eq(0n);
      expect(await manager.balanceOf(deployer.getAddress())).to.eq(100n);
    });
  });

  context("#getReward", async () => {
    it("should not revert", async () => {
      await proxy
        .connect(vesting)
        .execute(manager.getAddress(), manager.interface.encodeFunctionData("getReward", [ZeroAddress]));
    });
  });
});

import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { MockERC20, MockLiquidityManager } from "@/types/index";

describe("LiquidityManagerBase.spec", async () => {
  let deployer: HardhatEthersSigner;
  let operator: HardhatEthersSigner;

  let token: MockERC20;
  let manager: MockLiquidityManager;

  beforeEach(async () => {
    [deployer, operator] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    const MockLiquidityManager = await ethers.getContractFactory("MockLiquidityManager", deployer);

    token = await MockERC20.deploy("X", "X", 18);
    manager = await MockLiquidityManager.deploy();

    await manager.initialize(operator.address, token.getAddress());
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      expect(await manager.operator()).to.eq(operator.address);
      expect(await manager.token()).to.eq(await token.getAddress());
      expect(await manager.isActive()).to.eq(true);
      expect(await manager.getManagerRatio()).to.eq(0n);
      expect(await manager.getHarvesterRatio()).to.eq(0n);
    });
  });

  context("#deposit", async () => {
    it("should revert, when non-operator call", async () => {
      await expect(manager.deposit(ZeroAddress, 0n, false)).to.revertedWithCustomError(manager, "CallerIsNotOperator");
      await expect(manager.deposit(ZeroAddress, 0n, true)).to.revertedWithCustomError(manager, "CallerIsNotOperator");
    });

    it("should revert, when killed", async () => {
      await manager.kill();
      await expect(manager.connect(operator).deposit(ZeroAddress, 0n, false)).to.revertedWithCustomError(
        manager,
        "AlreadyKilled"
      );
      await expect(manager.connect(operator).deposit(ZeroAddress, 0n, true)).to.revertedWithCustomError(
        manager,
        "AlreadyKilled"
      );
    });

    it("should succeed", async () => {
      await manager.connect(operator).deposit(ZeroAddress, 0n, false);
      await manager.connect(operator).deposit(ZeroAddress, 0n, true);
      await manager.connect(operator).deposit(ZeroAddress, 1n, false);
      await manager.connect(operator).deposit(deployer.address, 1n, false);
    });
  });

  context("#withdraw", async () => {
    beforeEach(async () => {
      await token.mint(manager.getAddress(), ethers.parseEther("1000"));
    });

    it("should revert, when non-operator call", async () => {
      await expect(manager.withdraw(ZeroAddress, 0n)).to.revertedWithCustomError(manager, "CallerIsNotOperator");
      await expect(manager.withdraw(ZeroAddress, 0n)).to.revertedWithCustomError(manager, "CallerIsNotOperator");
    });

    it("should revert, when killed", async () => {
      await manager.kill();
      await expect(manager.connect(operator).withdraw(ZeroAddress, 0n)).to.revertedWithCustomError(
        manager,
        "AlreadyKilled"
      );
      await expect(manager.connect(operator).withdraw(ZeroAddress, 0n)).to.revertedWithCustomError(
        manager,
        "AlreadyKilled"
      );
    });

    it("should succeed", async () => {
      expect(await token.balanceOf(deployer.address)).to.eq(0n);
      await manager.connect(operator).withdraw(deployer.address, ethers.parseEther("1"));
      expect(await token.balanceOf(deployer.address)).to.eq(ethers.parseEther("1"));
    });
  });

  context("#execute", async () => {
    it("should revert, when no owner call", async () => {
      await expect(manager.connect(operator).execute(ZeroAddress, 0, "0x")).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should succeed, when owner call", async () => {
      await manager.execute(ZeroAddress, 0, "0x");
    });
  });

  context("#kill", async () => {
    it("should revert, when no owner call", async () => {
      await expect(manager.connect(operator).kill()).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert, when already killed", async () => {
      await manager.kill();
      await expect(manager.kill()).to.revertedWithCustomError(manager, "AlreadyKilled");
    });

    it("should succeed", async () => {
      await token.mint(manager.getAddress(), ethers.parseEther("100000"));
      expect(await token.balanceOf(deployer.address)).to.eq(0n);
      expect(await manager.isActive()).to.eq(true);
      await manager.kill();
      expect(await manager.isActive()).to.eq(false);
      expect(await token.balanceOf(manager.getAddress())).to.eq(0n);
      expect(await token.balanceOf(operator.address)).to.eq(ethers.parseEther("100000"));
    });
  });

  context("#updateManagerRatio", async () => {
    it("should revert, when no owner call", async () => {
      await expect(manager.connect(operator).updateManagerRatio(0n)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when manager ratio too large", async () => {
      await expect(manager.updateManagerRatio(5e8 + 1)).to.revertedWithCustomError(manager, "ManagerRatioTooLarge");
    });

    it("should succeed", async () => {
      expect(await manager.getManagerRatio()).to.eq(0n);
      await expect(manager.updateManagerRatio(1n)).to.emit(manager, "UpdateManagerRatio").withArgs(0n, 1n);
      expect(await manager.getManagerRatio()).to.eq(1n);
      await expect(manager.updateManagerRatio(5e8)).to.emit(manager, "UpdateManagerRatio").withArgs(1n, 5e8);
      expect(await manager.getManagerRatio()).to.eq(5e8);
      await expect(manager.updateManagerRatio(0n)).to.emit(manager, "UpdateManagerRatio").withArgs(5e8, 0n);
      expect(await manager.getManagerRatio()).to.eq(0n);
    });
  });

  context("#updateHarvesterRatio", async () => {
    it("should revert, when no owner call", async () => {
      await expect(manager.connect(operator).updateHarvesterRatio(0n)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when harvester ratio too large", async () => {
      await expect(manager.updateHarvesterRatio(1e8 + 1)).to.revertedWithCustomError(manager, "HarvesterRatioTooLarge");
    });

    it("should succeed", async () => {
      expect(await manager.getHarvesterRatio()).to.eq(0n);
      await expect(manager.updateHarvesterRatio(1n)).to.emit(manager, "UpdateHarvesterRatio").withArgs(0n, 1n);
      expect(await manager.getHarvesterRatio()).to.eq(1n);
      await expect(manager.updateHarvesterRatio(1e8)).to.emit(manager, "UpdateHarvesterRatio").withArgs(1n, 1e8);
      expect(await manager.getHarvesterRatio()).to.eq(1e8);
      await expect(manager.updateHarvesterRatio(0n)).to.emit(manager, "UpdateHarvesterRatio").withArgs(1e8, 0n);
      expect(await manager.getHarvesterRatio()).to.eq(0n);
    });
  });
});

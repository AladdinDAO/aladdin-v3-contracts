import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { ConcentratorPlainStrategy, MockERC20 } from "@/types/index";

describe("ConcentratorPlainStrategy.spec", async () => {
  let deployer: HardhatEthersSigner;
  let operator: HardhatEthersSigner;

  let token: MockERC20;
  let strategy: ConcentratorPlainStrategy;

  beforeEach(async () => {
    [deployer, operator] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    token = await MockERC20.deploy("X", "Y", 18);

    const ConcentratorPlainStrategy = await ethers.getContractFactory("ConcentratorPlainStrategy", deployer);
    strategy = await ConcentratorPlainStrategy.deploy(operator.address, token.getAddress());
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      expect(await strategy.owner()).to.eq(deployer.address);
      await expect(strategy.rewards(0)).to.reverted;
      expect(await strategy.stash()).to.eq(ZeroAddress);
      expect(await strategy.isTokenProtected(token.getAddress())).to.eq(true);
      expect(await strategy.name()).to.eq("ConcentratorPlainStrategy");
      expect(await strategy.token()).to.eq(await token.getAddress());
    });
  });

  context("#deposit", async () => {
    it("should revert, when non-operator call deposit", async () => {
      await expect(strategy.deposit(deployer.address, 0)).to.revertedWithCustomError(strategy, "CallerIsNotOperator");
    });

    it("should succeed, when operator call deposit", async () => {
      await strategy.connect(operator).deposit(deployer.address, 0);
    });
  });

  context("#withdraw", async () => {
    it("should revert, when non-operator call withdraw", async () => {
      await expect(strategy.withdraw(deployer.address, 0)).to.revertedWithCustomError(strategy, "CallerIsNotOperator");
    });

    it("should succeed, when operator call withdraw", async () => {
      await token.mint(strategy.getAddress(), 12345);
      expect(await token.balanceOf(deployer.address)).to.eq(0);
      await strategy.connect(operator).withdraw(deployer.address, 12345);
      expect(await token.balanceOf(deployer.address)).to.eq(12345);
    });
  });

  context("#harvest", async () => {
    it("should revert, when non-operator call harvest", async () => {
      await expect(strategy.harvest(deployer.address, token.getAddress())).to.revertedWithCustomError(
        strategy,
        "CallerIsNotOperator"
      );
    });

    it("should succeed, when operator call harvest", async () => {
      await strategy.connect(operator).harvest(ZeroAddress, ZeroAddress);
    });
  });

  context("#sweepToken", async () => {
    it("should revert, when sweep protected token", async () => {
      await expect(strategy.sweepToken([token.getAddress()])).to.revertedWithCustomError(strategy, "TokenIsProtected");
    });
  });
});

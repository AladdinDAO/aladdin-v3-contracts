import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import { expect } from "chai";
import { ZeroAddress, ZeroHash } from "ethers";
import { ethers } from "hardhat";

import { MockConcentratorBaseV2 } from "@/types/index";

describe("ConcentratorBaseV2.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let treasury: HardhatEthersSigner;
  let harvester: HardhatEthersSigner;
  let converter: HardhatEthersSigner;
  let base: MockConcentratorBaseV2;

  beforeEach(async () => {
    [deployer, signer, treasury, harvester, converter] = await ethers.getSigners();

    const MockConcentratorBaseV2 = await ethers.getContractFactory("MockConcentratorBaseV2", deployer);
    base = await MockConcentratorBaseV2.deploy();
    await base.initialize(treasury.address, harvester.address, converter.address);
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      expect(await base.treasury()).to.eq(treasury.address);
      expect(await base.harvester()).to.eq(harvester.address);
      expect(await base.converter()).to.eq(converter.address);
      expect(await base.getExpenseRatio()).to.eq(0n);
      expect(await base.getHarvesterRatio()).to.eq(0n);
      expect(await base.getWithdrawFeePercentage()).to.eq(0n);

      await expect(base.initialize(ZeroAddress, ZeroAddress, ZeroAddress)).to.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("should revert, when reinitialize", async () => {
      await expect(base.reinitialize()).to.revertedWith("Initializable: contract is not initializing");
    });
  });

  context("#updateTreasury", async () => {
    it("should revert, when non-admin call", async () => {
      await expect(base.connect(signer).updateTreasury(ZeroAddress)).to.revertedWith(
        "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
      );
    });

    it("should revert, when treasury is zero", async () => {
      await expect(base.updateTreasury(ZeroAddress)).to.revertedWithCustomError(base, "TreasuryIsZero");
    });

    it("should succeed", async () => {
      expect(await base.treasury()).to.eq(treasury.address);
      await expect(base.updateTreasury(deployer.address))
        .to.emit(base, "UpdateTreasury")
        .withArgs(treasury.address, deployer.address);
      expect(await base.treasury()).to.eq(deployer.address);
    });
  });

  context("#updateHarvester", async () => {
    it("should revert, when non-admin call", async () => {
      await expect(base.connect(signer).updateHarvester(ZeroAddress)).to.revertedWith(
        "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
      );
    });

    it("should succeed", async () => {
      expect(await base.harvester()).to.eq(harvester.address);
      await expect(base.updateHarvester(deployer.address))
        .to.emit(base, "UpdateHarvester")
        .withArgs(harvester.address, deployer.address);
      expect(await base.harvester()).to.eq(deployer.address);
    });
  });

  context("#updateConverter", async () => {
    it("should revert, when non-admin call", async () => {
      await expect(base.connect(signer).updateConverter(ZeroAddress)).to.revertedWith(
        "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
      );
    });

    it("should revert, when converter is zero", async () => {
      await expect(base.updateConverter(ZeroAddress)).to.revertedWithCustomError(base, "ConverterIsZero");
    });

    it("should succeed", async () => {
      expect(await base.converter()).to.eq(converter.address);
      await expect(base.updateConverter(deployer.address))
        .to.emit(base, "UpdateConverter")
        .withArgs(converter.address, deployer.address);
      expect(await base.converter()).to.eq(deployer.address);
    });
  });

  context("#updateExpenseRatio", async () => {
    it("should revert, when non-admin call", async () => {
      await expect(base.connect(signer).updateExpenseRatio(0n)).to.revertedWith(
        "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
      );
    });

    it("should revert, when expense ratio too large", async () => {
      await expect(base.updateExpenseRatio(5e8 + 1)).to.revertedWithCustomError(base, "ExpenseRatioTooLarge");
    });

    it("should succeed", async () => {
      expect(await base.getExpenseRatio()).to.eq(0n);
      await expect(base.updateExpenseRatio(1n)).to.emit(base, "UpdateExpenseRatio").withArgs(0n, 1n);
      expect(await base.getExpenseRatio()).to.eq(1n);
      await expect(base.updateExpenseRatio(100n)).to.emit(base, "UpdateExpenseRatio").withArgs(1n, 100n);
      expect(await base.getExpenseRatio()).to.eq(100n);
      await expect(base.updateExpenseRatio(1e8)).to.emit(base, "UpdateExpenseRatio").withArgs(100n, 1e8);
      expect(await base.getExpenseRatio()).to.eq(1e8);
      await expect(base.updateExpenseRatio(5e8)).to.emit(base, "UpdateExpenseRatio").withArgs(1e8, 5e8);
      expect(await base.getExpenseRatio()).to.eq(5e8);
    });
  });

  context("#updateHarvesterRatio", async () => {
    it("should revert, when non-admin call", async () => {
      await expect(base.connect(signer).updateHarvesterRatio(0n)).to.revertedWith(
        "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
      );
    });

    it("should revert, when harvester ratio too large", async () => {
      await expect(base.updateHarvesterRatio(1e8 + 1)).to.revertedWithCustomError(base, "HarvesterRatioTooLarge");
    });

    it("should succeed", async () => {
      expect(await base.getHarvesterRatio()).to.eq(0n);
      await expect(base.updateHarvesterRatio(1n)).to.emit(base, "UpdateHarvesterRatio").withArgs(0n, 1n);
      expect(await base.getHarvesterRatio()).to.eq(1n);
      await expect(base.updateHarvesterRatio(100n)).to.emit(base, "UpdateHarvesterRatio").withArgs(1n, 100n);
      expect(await base.getHarvesterRatio()).to.eq(100n);
      await expect(base.updateHarvesterRatio(1e7)).to.emit(base, "UpdateHarvesterRatio").withArgs(100n, 1e7);
      expect(await base.getHarvesterRatio()).to.eq(1e7);
      await expect(base.updateHarvesterRatio(1e8)).to.emit(base, "UpdateHarvesterRatio").withArgs(1e7, 1e8);
      expect(await base.getHarvesterRatio()).to.eq(1e8);
    });
  });

  context("#updateWithdrawFeePercentage", async () => {
    it("should revert, when non-admin call", async () => {
      await expect(base.connect(signer).updateWithdrawFeePercentage(0n)).to.revertedWith(
        "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
      );
    });

    it("should revert, when harvester ratio too large", async () => {
      await expect(base.updateWithdrawFeePercentage(1e8 + 1)).to.revertedWithCustomError(
        base,
        "WithdrawFeePercentageTooLarge"
      );
    });

    it("should succeed", async () => {
      expect(await base.getWithdrawFeePercentage()).to.eq(0n);
      await expect(base.updateWithdrawFeePercentage(1n)).to.emit(base, "UpdateWithdrawFeePercentage").withArgs(0n, 1n);
      expect(await base.getWithdrawFeePercentage()).to.eq(1n);
      await expect(base.updateWithdrawFeePercentage(100n))
        .to.emit(base, "UpdateWithdrawFeePercentage")
        .withArgs(1n, 100n);
      expect(await base.getWithdrawFeePercentage()).to.eq(100n);
      await expect(base.updateWithdrawFeePercentage(1e7))
        .to.emit(base, "UpdateWithdrawFeePercentage")
        .withArgs(100n, 1e7);
      expect(await base.getWithdrawFeePercentage()).to.eq(1e7);
      await expect(base.updateWithdrawFeePercentage(1e8))
        .to.emit(base, "UpdateWithdrawFeePercentage")
        .withArgs(1e7, 1e8);
      expect(await base.getWithdrawFeePercentage()).to.eq(1e8);
    });
  });
});

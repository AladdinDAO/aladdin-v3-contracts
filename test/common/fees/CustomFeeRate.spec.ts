import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import { expect } from "chai";
import { ethers } from "hardhat";

import { MockCustomFeeRate } from "@/types/index";

describe("CustomFeeRate.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let fee: MockCustomFeeRate;

  beforeEach(async () => {
    [deployer, signer] = await ethers.getSigners();

    const MockCustomFeeRate = await ethers.getContractFactory("MockCustomFeeRate", deployer);
    fee = await MockCustomFeeRate.deploy();
    await fee.initialize();

    await fee.grantRole(await fee.CUSTOM_FEE_RATIO_SETTER_ROLE(), deployer.address);
  });

  context("#setDefaultFeeRate", async () => {
    it("should revert, when non-admin call", async () => {
      await expect(fee.connect(signer).setDefaultFeeRate(0, 0)).to.revertedWith(
        "AccessControl: account " +
          signer.address.toLowerCase() +
          " is missing role " +
          (await fee.CUSTOM_FEE_RATIO_SETTER_ROLE())
      );
    });

    it("should revert, when fee type too large", async () => {
      await expect(fee.setDefaultFeeRate(8, 0n)).to.revertedWithCustomError(fee, "FeeTypeTooLarge");
    });

    it("should revert, when fee too large", async () => {
      await expect(fee.setDefaultFeeRate(0, 1e9 + 1)).to.revertedWithCustomError(fee, "FeeRateTooLarge");
    });

    it("should succeed", async () => {
      for (let feeType = 0; feeType < 8; ++feeType) {
        expect(await fee.getDefaultFeeRate(feeType)).to.eq(0n);
        await expect(fee.setDefaultFeeRate(feeType, 1n)).to.emit(fee, "SetDefaultFeeRate").withArgs(feeType, 0n, 1n);
        expect(await fee.getDefaultFeeRate(feeType)).to.eq(1n);
        await expect(fee.setDefaultFeeRate(feeType, 1e8)).to.emit(fee, "SetDefaultFeeRate").withArgs(feeType, 1n, 1e8);
        expect(await fee.getDefaultFeeRate(feeType)).to.eq(1e8);
        await expect(fee.setDefaultFeeRate(feeType, 1e9)).to.emit(fee, "SetDefaultFeeRate").withArgs(feeType, 1e8, 1e9);
        expect(await fee.getDefaultFeeRate(feeType)).to.eq(1e9);
      }
    });
  });

  context("#setCustomFeeRate", async () => {
    it("should revert, when non-admin call", async () => {
      await expect(fee.connect(signer).setCustomFeeRate(deployer.address, 0, 0)).to.revertedWith(
        "AccessControl: account " +
          signer.address.toLowerCase() +
          " is missing role " +
          (await fee.CUSTOM_FEE_RATIO_SETTER_ROLE())
      );
    });

    it("should revert, when fee type too large", async () => {
      await expect(fee.setCustomFeeRate(deployer.address, 8, 0n)).to.revertedWithCustomError(fee, "FeeTypeTooLarge");
    });

    it("should revert, when fee too large", async () => {
      await expect(fee.setCustomFeeRate(deployer.address, 0, 1e9 + 1)).to.revertedWithCustomError(
        fee,
        "FeeRateTooLarge"
      );
    });

    it("should succeed", async () => {
      for (let feeType = 0; feeType < 8; ++feeType) {
        expect(await fee.getFeeRate(feeType, deployer.address)).to.eq(0n);
        await expect(fee.setCustomFeeRate(deployer.address, feeType, 1n))
          .to.emit(fee, "SetCustomFeeRate")
          .withArgs(deployer.address, feeType, 1n);
        expect(await fee.getFeeRate(feeType, deployer.address)).to.eq(1n);
        await expect(fee.setCustomFeeRate(deployer.address, feeType, 1e8))
          .to.emit(fee, "SetCustomFeeRate")
          .withArgs(deployer.address, feeType, 1e8);
        expect(await fee.getFeeRate(feeType, deployer.address)).to.eq(1e8);
        await expect(fee.setCustomFeeRate(deployer.address, feeType, 1e9))
          .to.emit(fee, "SetCustomFeeRate")
          .withArgs(deployer.address, feeType, 1e9);
        expect(await fee.getFeeRate(feeType, deployer.address)).to.eq(1e9);
      }
    });
  });

  context("#resetCustomFeeRate", async () => {
    it("should revert, when non-admin call", async () => {
      await expect(fee.connect(signer).resetCustomFeeRate(deployer.address, 0)).to.revertedWith(
        "AccessControl: account " +
          signer.address.toLowerCase() +
          " is missing role " +
          (await fee.CUSTOM_FEE_RATIO_SETTER_ROLE())
      );
    });

    it("should revert, when fee type too large", async () => {
      await expect(fee.resetCustomFeeRate(deployer.address, 8)).to.revertedWithCustomError(fee, "FeeTypeTooLarge");
    });

    it("should succeed", async () => {
      for (let feeType = 0; feeType < 8; ++feeType) {
        await fee.setDefaultFeeRate(feeType, 12345n);
        expect(await fee.getFeeRate(feeType, deployer.address)).to.eq(12345n);
        await fee.setCustomFeeRate(deployer.address, feeType, 67890n);
        expect(await fee.getFeeRate(feeType, deployer.address)).to.eq(67890n);
        await expect(fee.resetCustomFeeRate(deployer.address, feeType))
          .to.emit(fee, "ResetCustomFeeRate")
          .withArgs(deployer.address, feeType);
        expect(await fee.getFeeRate(feeType, deployer.address)).to.eq(12345n);
      }
    });
  });
});

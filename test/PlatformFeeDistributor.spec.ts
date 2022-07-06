/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { CLeverToken, PlatformFeeDistributor } from "../typechain";

describe("PlatformFeeDistributor.spec", async () => {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let treasury: SignerWithAddress;
  let gauge: SignerWithAddress;
  let veDistributor: SignerWithAddress;
  let distributor: PlatformFeeDistributor;

  beforeEach(async () => {
    [deployer, alice, treasury, gauge, veDistributor] = await ethers.getSigners();

    const PlatformFeeDistributor = await ethers.getContractFactory("PlatformFeeDistributor", deployer);
    distributor = await PlatformFeeDistributor.deploy(gauge.address, treasury.address, veDistributor.address, []);
    await distributor.deployed();

    expect(await distributor.gauge()).to.eq(gauge.address);
    expect(await distributor.treasury()).to.eq(treasury.address);
    expect(await distributor.veDistributor()).to.eq(veDistributor.address);
  });

  context("#updateGauge", async () => {
    it("should revert, when call updateGauge and caller is not owner", async () => {
      await expect(distributor.connect(alice).updateGauge(constants.AddressZero)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when gauge is zero", async () => {
      await expect(distributor.updateGauge(constants.AddressZero)).to.revertedWith("zero gauge address");
    });

    it("should succeed", async () => {
      expect(await distributor.gauge()).to.eq(gauge.address);
      await expect(distributor.updateGauge(alice.address)).to.emit(distributor, "UpdateGauge").withArgs(alice.address);
      expect(await distributor.gauge()).to.eq(alice.address);
    });
  });

  context("#updateTreasury", async () => {
    it("should revert, when call updateTreasury and caller is not owner", async () => {
      await expect(distributor.connect(alice).updateTreasury(constants.AddressZero)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when treasury is zero", async () => {
      await expect(distributor.updateTreasury(constants.AddressZero)).to.revertedWith("zero treasury address");
    });

    it("should succeed", async () => {
      expect(await distributor.treasury()).to.eq(treasury.address);
      await expect(distributor.updateTreasury(alice.address))
        .to.emit(distributor, "UpdateTreasury")
        .withArgs(alice.address);
      expect(await distributor.treasury()).to.eq(alice.address);
    });
  });

  context("#updateDistributor", async () => {
    it("should revert, when call updateDistributor and caller is not owner", async () => {
      await expect(distributor.connect(alice).updateDistributor(constants.AddressZero)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when distributor is zero", async () => {
      await expect(distributor.updateDistributor(constants.AddressZero)).to.revertedWith("zero distributor address");
    });

    it("should succeed", async () => {
      expect(await distributor.veDistributor()).to.eq(veDistributor.address);
      await expect(distributor.updateDistributor(alice.address))
        .to.emit(distributor, "UpdateDistributor")
        .withArgs(alice.address);
      expect(await distributor.veDistributor()).to.eq(alice.address);
    });
  });

  context("#addRewardToken", async () => {
    it("should revert, when call addRewardToken and caller is not owner", async () => {
      await expect(distributor.connect(alice).addRewardToken(constants.AddressZero, 0, 0)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when fee too large", async () => {
      await expect(distributor.addRewardToken(constants.AddressZero, 1e9 + 1, 0)).to.revertedWith(
        "gauge percentage too large"
      );
      await expect(distributor.addRewardToken(constants.AddressZero, 0, 1e9 + 1)).to.revertedWith(
        "treasury percentage too large"
      );
      await expect(distributor.addRewardToken(constants.AddressZero, 5e8 + 1, 5e8)).to.revertedWith(
        "distributor percentage too small"
      );
    });

    it("should revert, when duplicated token", async () => {
      await distributor.addRewardToken(constants.AddressZero, 0, 0);
      await expect(distributor.addRewardToken(constants.AddressZero, 0, 0)).to.revertedWith("duplicated reward token");
    });

    it("should succeed", async () => {
      expect(await distributor.getRewardCount()).to.eq(constants.Zero);
      await expect(distributor.addRewardToken(constants.AddressZero, 1, 2))
        .to.emit(distributor, "AddRewardToken")
        .withArgs(constants.AddressZero, 1, 2);
      expect(await distributor.getRewardCount()).to.eq(1);
      expect(await distributor.rewards(0)).to.deep.eq([constants.AddressZero, 1, 2]);
      await expect(distributor.addRewardToken(alice.address, 3, 4))
        .to.emit(distributor, "AddRewardToken")
        .withArgs(alice.address, 3, 4);
      expect(await distributor.getRewardCount()).to.eq(2);
      expect(await distributor.rewards(1)).to.deep.eq([alice.address, 3, 4]);
    });
  });

  context("removeRewardToken", async () => {
    beforeEach(async () => {
      await distributor.addRewardToken(constants.AddressZero, 1, 2);
      await distributor.addRewardToken(alice.address, 3, 4);
      await distributor.addRewardToken(gauge.address, 5, 6);
    });

    it("should revert, when call removeRewardToken and caller is not owner", async () => {
      await expect(distributor.connect(alice).removeRewardToken(0)).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert, when index out of range", async () => {
      await expect(distributor.removeRewardToken(3)).to.revertedWith("index out of range");
    });

    it("should succeed, remove from last", async () => {
      expect(await distributor.getRewardCount()).to.eq(3);
      await expect(distributor.removeRewardToken(2)).to.emit(distributor, "RemoveRewardToken").withArgs(gauge.address);
      expect(await distributor.rewards(0)).to.deep.eq([constants.AddressZero, 1, 2]);
      expect(await distributor.rewards(1)).to.deep.eq([alice.address, 3, 4]);
      expect(await distributor.getRewardCount()).to.eq(2);
      await expect(distributor.removeRewardToken(1)).to.emit(distributor, "RemoveRewardToken").withArgs(alice.address);
      expect(await distributor.rewards(0)).to.deep.eq([constants.AddressZero, 1, 2]);
      expect(await distributor.getRewardCount()).to.eq(1);
      await expect(distributor.removeRewardToken(0))
        .to.emit(distributor, "RemoveRewardToken")
        .withArgs(constants.AddressZero);
      expect(await distributor.getRewardCount()).to.eq(0);
    });

    it("should succeed, remove from first", async () => {
      expect(await distributor.getRewardCount()).to.eq(3);
      await expect(distributor.removeRewardToken(0))
        .to.emit(distributor, "RemoveRewardToken")
        .withArgs(constants.AddressZero);
      expect(await distributor.rewards(0)).to.deep.eq([gauge.address, 5, 6]);
      expect(await distributor.rewards(1)).to.deep.eq([alice.address, 3, 4]);
      expect(await distributor.getRewardCount()).to.eq(2);
      await expect(distributor.removeRewardToken(0)).to.emit(distributor, "RemoveRewardToken").withArgs(gauge.address);
      expect(await distributor.rewards(0)).to.deep.eq([alice.address, 3, 4]);
      expect(await distributor.getRewardCount()).to.eq(1);
      await expect(distributor.removeRewardToken(0)).to.emit(distributor, "RemoveRewardToken").withArgs(alice.address);
      expect(await distributor.getRewardCount()).to.eq(0);
    });
  });

  context("updateRewardPercentage", async () => {
    beforeEach(async () => {
      await distributor.addRewardToken(constants.AddressZero, 1, 2);
      await distributor.addRewardToken(alice.address, 3, 4);
      await distributor.addRewardToken(gauge.address, 5, 6);
    });

    it("should revert, when call updateRewardPercentage and caller is not owner", async () => {
      await expect(distributor.connect(alice).updateRewardPercentage(0, 0, 0)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when fee too large", async () => {
      await expect(distributor.updateRewardPercentage(0, 1e9 + 1, 0)).to.revertedWith("gauge percentage too large");
      await expect(distributor.updateRewardPercentage(0, 0, 1e9 + 1)).to.revertedWith("treasury percentage too large");
      await expect(distributor.updateRewardPercentage(0, 5e8 + 1, 5e8)).to.revertedWith(
        "distributor percentage too small"
      );
    });

    it("should revert, when index out of range", async () => {
      await expect(distributor.updateRewardPercentage(3, 0, 0)).to.revertedWith("index out of range");
    });

    it("should succeed", async () => {
      expect(await distributor.rewards(0)).to.deep.eq([constants.AddressZero, 1, 2]);
      await expect(distributor.updateRewardPercentage(0, 7, 8))
        .to.emit(distributor, "UpdateRewardPercentage")
        .withArgs(constants.AddressZero, 7, 8);
      expect(await distributor.rewards(0)).to.deep.eq([constants.AddressZero, 7, 8]);

      expect(await distributor.rewards(1)).to.deep.eq([alice.address, 3, 4]);
      await expect(distributor.updateRewardPercentage(1, 9, 10))
        .to.emit(distributor, "UpdateRewardPercentage")
        .withArgs(alice.address, 9, 10);
      expect(await distributor.rewards(1)).to.deep.eq([alice.address, 9, 10]);

      expect(await distributor.rewards(2)).to.deep.eq([gauge.address, 5, 6]);
      await expect(distributor.updateRewardPercentage(2, 11, 12))
        .to.emit(distributor, "UpdateRewardPercentage")
        .withArgs(gauge.address, 11, 12);
      expect(await distributor.rewards(2)).to.deep.eq([gauge.address, 11, 12]);
    });
  });

  context("claim", async () => {
    const amount1 = ethers.utils.parseEther("10000");
    const amount2 = ethers.utils.parseEther("90000");
    let token1: CLeverToken;
    let token2: CLeverToken;

    beforeEach(async () => {
      const CLeverToken = await ethers.getContractFactory("CLeverToken", deployer);
      token1 = await CLeverToken.deploy("X", "Y");
      await token1.deployed();
      token2 = await CLeverToken.deploy("XX", "YY");
      await token2.deployed();

      await token1.updateMinters([deployer.address], true);
      await token1.updateCeiling(deployer.address, amount1);
      await token1.mint(deployer.address, amount1);
      await token2.updateMinters([deployer.address], true);
      await token2.updateCeiling(deployer.address, amount2);
      await token2.mint(deployer.address, amount2);

      await distributor.addRewardToken(token1.address, 1e8, 2e8);
    });

    it("should revert, when call claim and caller is not gauge", async () => {
      await expect(distributor.claim()).to.revertedWith("not gauge");
    });

    it("should succeed, when reward is single token", async () => {
      await token1.transfer(distributor.address, amount1);
      await distributor.connect(gauge).claim();
      expect(await token1.balanceOf(gauge.address)).to.eq(amount1.mul(1e8).div(1e9));
      expect(await token1.balanceOf(treasury.address)).to.eq(amount1.mul(2e8).div(1e9));
      expect(await token1.balanceOf(veDistributor.address)).to.eq(amount1.mul(7e8).div(1e9));
    });

    it("should succeed, when reward is multiple tokens", async () => {
      await distributor.addRewardToken(token2.address, 2e8, 3e8);

      await token1.transfer(distributor.address, amount1);
      await token2.transfer(distributor.address, amount2);
      await distributor.connect(gauge).claim();
      expect(await token1.balanceOf(gauge.address)).to.eq(amount1.mul(1e8).div(1e9));
      expect(await token1.balanceOf(treasury.address)).to.eq(amount1.mul(2e8).div(1e9));
      expect(await token1.balanceOf(veDistributor.address)).to.eq(amount1.mul(7e8).div(1e9));
      expect(await token2.balanceOf(gauge.address)).to.eq(amount2.mul(2e8).div(1e9));
      expect(await token2.balanceOf(treasury.address)).to.eq(amount2.mul(3e8).div(1e9));
      expect(await token2.balanceOf(veDistributor.address)).to.eq(amount2.mul(5e8).div(1e9));
    });
  });
});

/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import {
  GaugeRewardDistributor,
  MockCurveGaugeV1V2V3,
  MockCurveGaugeV4V5,
  MockERC20,
  PlatformFeeDistributor,
} from "../typechain";

describe("GaugeRewardDistributor.spec", async () => {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let token1: MockERC20;
  let token2: MockERC20;
  let gaugeDistributor: GaugeRewardDistributor;
  let feeDistributor: PlatformFeeDistributor;
  let gauge1: MockCurveGaugeV1V2V3;
  let gauge2: MockCurveGaugeV4V5;

  beforeEach(async () => {
    [deployer, alice] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    token1 = await MockERC20.deploy("X", "Y", 18);
    await token1.deployed();
    token2 = await MockERC20.deploy("X", "Y", 18);
    await token2.deployed();

    const MockCurveGaugeV1V2V3 = await ethers.getContractFactory("MockCurveGaugeV1V2V3", deployer);
    gauge1 = await MockCurveGaugeV1V2V3.deploy();
    await gauge1.deployed();

    const MockCurveGaugeV4V5 = await ethers.getContractFactory("MockCurveGaugeV4V5", deployer);
    gauge2 = await MockCurveGaugeV4V5.deploy();
    await gauge2.deployed();

    const GaugeRewardDistributor = await ethers.getContractFactory("GaugeRewardDistributor", deployer);
    gaugeDistributor = await GaugeRewardDistributor.deploy();
    await gaugeDistributor.deployed();

    const PlatformFeeDistributor = await ethers.getContractFactory("PlatformFeeDistributor", deployer);
    feeDistributor = await PlatformFeeDistributor.deploy(
      gaugeDistributor.address,
      deployer.address,
      deployer.address,
      []
    );
    await feeDistributor.deployed();

    await gaugeDistributor.updateDistributor(feeDistributor.address);
  });

  context("#updateDistributor", async () => {
    it("should revert, when call updateDistributor and caller is not owner", async () => {
      await expect(gaugeDistributor.connect(alice).updateDistributor(constants.AddressZero)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should succeed", async () => {
      expect(await gaugeDistributor.distributor()).to.eq(feeDistributor.address);
      await expect(gaugeDistributor.updateDistributor(alice.address))
        .to.emit(gaugeDistributor, "UpdateDistributor")
        .withArgs(feeDistributor.address, alice.address);
      expect(await gaugeDistributor.distributor()).to.eq(alice.address);
    });
  });

  context("#updateGaugeTypes", async () => {
    it("should revert, when call updateGaugeTypes and caller is not owner", async () => {
      await expect(gaugeDistributor.connect(alice).updateGaugeTypes([], [])).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when length mismatch", async () => {
      await expect(gaugeDistributor.updateGaugeTypes([constants.AddressZero], [])).to.revertedWith("length mismatch");
    });

    it("should revert, when invalid type", async () => {
      // none => none
      await expect(gaugeDistributor.updateGaugeTypes([constants.AddressZero], [0])).to.revertedWith("invalid type");
      // CurveGaugeV1V2V3 => CurveGaugeV1V2V3 or CurveGaugeV4V5
      await gaugeDistributor.updateGaugeTypes([constants.AddressZero], [1]);
      await expect(gaugeDistributor.updateGaugeTypes([constants.AddressZero], [1])).to.revertedWith("invalid type");
      await expect(gaugeDistributor.updateGaugeTypes([constants.AddressZero], [2])).to.revertedWith("invalid type");
      await gaugeDistributor.updateGaugeTypes([constants.AddressZero], [0]);
      // CurveGaugeV4V5 => CurveGaugeV1V2V3 or CurveGaugeV4V5
      await gaugeDistributor.updateGaugeTypes([constants.AddressZero], [2]);
      await expect(gaugeDistributor.updateGaugeTypes([constants.AddressZero], [1])).to.revertedWith("invalid type");
      await expect(gaugeDistributor.updateGaugeTypes([constants.AddressZero], [2])).to.revertedWith("invalid type");
    });

    it("should succeed", async () => {
      let info1 = await gaugeDistributor.getGaugeInfo(token1.address);
      let info2 = await gaugeDistributor.getGaugeInfo(token2.address);
      expect(info1.gaugeType).to.eq(0);
      expect(info2.gaugeType).to.eq(0);
      await expect(gaugeDistributor.updateGaugeTypes([token1.address, token2.address], [1, 2]))
        .to.emit(gaugeDistributor, "UpdateGaugeType")
        .withArgs(token1.address, 1)
        .to.emit(gaugeDistributor, "UpdateGaugeType")
        .withArgs(token2.address, 2);
      info1 = await gaugeDistributor.getGaugeInfo(token1.address);
      info2 = await gaugeDistributor.getGaugeInfo(token2.address);
      expect(info1.gaugeType).to.eq(1);
      expect(info2.gaugeType).to.eq(2);
    });
  });

  context("#addRewardToken", async () => {
    it("should revert, when call addRewardToken and caller is not owner", async () => {
      await expect(gaugeDistributor.connect(alice).addRewardToken(token1.address, [], [])).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when length mismatch", async () => {
      await expect(gaugeDistributor.addRewardToken(token1.address, [], [1])).to.revertedWith("length mismatch");
    });

    it("should revert, when duplicated reward token", async () => {
      await gaugeDistributor.addRewardToken(token1.address, [gauge1.address], [1e9]);
      await expect(gaugeDistributor.addRewardToken(token1.address, [gauge1.address], [1e9])).to.revertedWith(
        "duplicated reward token"
      );
    });

    it("should revert, when duplicated gauge", async () => {
      await expect(
        gaugeDistributor.addRewardToken(token1.address, [gauge1.address, gauge1.address], [5e8, 5e8])
      ).to.revertedWith("duplicated gauge");
    });

    it("should revert, when sum mismatch", async () => {
      await expect(
        gaugeDistributor.addRewardToken(token1.address, [gauge1.address, gauge2.address], [5e8, 5e8 + 1])
      ).to.revertedWith("sum mismatch");
    });

    it("should succeed", async () => {
      // add token1, push
      await expect(gaugeDistributor.addRewardToken(token1.address, [gauge1.address, gauge2.address], [4e8, 6e8]))
        .to.emit(gaugeDistributor, "AddRewardToken")
        .withArgs(0, token1.address, [gauge1.address, gauge2.address], [4e8, 6e8]);
      let info1 = await gaugeDistributor.getGaugeInfo(gauge1.address);
      let info2 = await gaugeDistributor.getGaugeInfo(gauge2.address);
      expect(info1.tokens).to.deep.eq([token1.address]);
      expect(info2.tokens).to.deep.eq([token1.address]);
      expect(await gaugeDistributor.getDistributionInfo(token1.address)).to.deep.eq([
        [gauge1.address, 4e8],
        [gauge2.address, 6e8],
      ]);

      // add token2, push
      await expect(gaugeDistributor.addRewardToken(token2.address, [gauge1.address, gauge2.address], [6e8, 4e8]))
        .to.emit(gaugeDistributor, "AddRewardToken")
        .withArgs(1, token2.address, [gauge1.address, gauge2.address], [6e8, 4e8]);
      info1 = await gaugeDistributor.getGaugeInfo(gauge1.address);
      info2 = await gaugeDistributor.getGaugeInfo(gauge2.address);
      expect(info1.tokens).to.deep.eq([token1.address, token2.address]);
      expect(info2.tokens).to.deep.eq([token1.address, token2.address]);
      expect(await gaugeDistributor.getDistributionInfo(token1.address)).to.deep.eq([
        [gauge1.address, 4e8],
        [gauge2.address, 6e8],
      ]);
      expect(await gaugeDistributor.getDistributionInfo(token2.address)).to.deep.eq([
        [gauge1.address, 6e8],
        [gauge2.address, 4e8],
      ]);

      // remove token2
      await gaugeDistributor.removeRewardToken(1);
      info1 = await gaugeDistributor.getGaugeInfo(gauge1.address);
      info2 = await gaugeDistributor.getGaugeInfo(gauge2.address);
      expect(info1.tokens).to.deep.eq([token1.address]);
      expect(info2.tokens).to.deep.eq([token1.address]);
      expect(await gaugeDistributor.getDistributionInfo(token1.address)).to.deep.eq([
        [gauge1.address, 4e8],
        [gauge2.address, 6e8],
      ]);
      expect(await gaugeDistributor.getDistributionInfo(token2.address)).to.deep.eq([]);

      // add token2, overwrite
      await expect(gaugeDistributor.addRewardToken(token2.address, [gauge1.address, gauge2.address], [3e8, 7e8]))
        .to.emit(gaugeDistributor, "AddRewardToken")
        .withArgs(1, token2.address, [gauge1.address, gauge2.address], [3e8, 7e8]);
      info1 = await gaugeDistributor.getGaugeInfo(gauge1.address);
      info2 = await gaugeDistributor.getGaugeInfo(gauge2.address);
      expect(info1.tokens).to.deep.eq([token1.address, token2.address]);
      expect(info2.tokens).to.deep.eq([token1.address, token2.address]);
      expect(await gaugeDistributor.getDistributionInfo(token1.address)).to.deep.eq([
        [gauge1.address, 4e8],
        [gauge2.address, 6e8],
      ]);
      expect(await gaugeDistributor.getDistributionInfo(token2.address)).to.deep.eq([
        [gauge1.address, 3e8],
        [gauge2.address, 7e8],
      ]);
    });
  });

  context("#removeRewardToken", async () => {
    it("should revert, when call addRewardToken and caller is not owner", async () => {
      await expect(gaugeDistributor.connect(alice).removeRewardToken(0)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should succeed", async () => {
      // add token1, push
      await expect(gaugeDistributor.addRewardToken(token1.address, [gauge1.address, gauge2.address], [4e8, 6e8]))
        .to.emit(gaugeDistributor, "AddRewardToken")
        .withArgs(0, token1.address, [gauge1.address, gauge2.address], [4e8, 6e8]);
      let info1 = await gaugeDistributor.getGaugeInfo(gauge1.address);
      let info2 = await gaugeDistributor.getGaugeInfo(gauge2.address);
      expect(info1.tokens).to.deep.eq([token1.address]);
      expect(info2.tokens).to.deep.eq([token1.address]);
      expect(await gaugeDistributor.getDistributionInfo(token1.address)).to.deep.eq([
        [gauge1.address, 4e8],
        [gauge2.address, 6e8],
      ]);

      // add token2, push
      await expect(gaugeDistributor.addRewardToken(token2.address, [gauge1.address, gauge2.address], [6e8, 4e8]))
        .to.emit(gaugeDistributor, "AddRewardToken")
        .withArgs(1, token2.address, [gauge1.address, gauge2.address], [6e8, 4e8]);
      info1 = await gaugeDistributor.getGaugeInfo(gauge1.address);
      info2 = await gaugeDistributor.getGaugeInfo(gauge2.address);
      expect(info1.tokens).to.deep.eq([token1.address, token2.address]);
      expect(info2.tokens).to.deep.eq([token1.address, token2.address]);
      expect(await gaugeDistributor.getDistributionInfo(token1.address)).to.deep.eq([
        [gauge1.address, 4e8],
        [gauge2.address, 6e8],
      ]);
      expect(await gaugeDistributor.getDistributionInfo(token2.address)).to.deep.eq([
        [gauge1.address, 6e8],
        [gauge2.address, 4e8],
      ]);

      // remove token2
      expect(await gaugeDistributor.removeRewardToken(1))
        .to.emit(gaugeDistributor, "RemoveRewardToken")
        .withArgs(1, token2.address);
      info1 = await gaugeDistributor.getGaugeInfo(gauge1.address);
      info2 = await gaugeDistributor.getGaugeInfo(gauge2.address);
      expect(info1.tokens).to.deep.eq([token1.address]);
      expect(info2.tokens).to.deep.eq([token1.address]);
      expect(await gaugeDistributor.getDistributionInfo(token1.address)).to.deep.eq([
        [gauge1.address, 4e8],
        [gauge2.address, 6e8],
      ]);
      expect(await gaugeDistributor.getDistributionInfo(token2.address)).to.deep.eq([]);
    });
  });

  context("updateRewardDistribution", async () => {
    beforeEach(async () => {
      // add token1, push
      await expect(gaugeDistributor.addRewardToken(token1.address, [gauge1.address, gauge2.address], [4e8, 6e8]))
        .to.emit(gaugeDistributor, "AddRewardToken")
        .withArgs(0, token1.address, [gauge1.address, gauge2.address], [4e8, 6e8]);

      // add token2, push
      await expect(gaugeDistributor.addRewardToken(token2.address, [gauge1.address, gauge2.address], [6e8, 4e8]))
        .to.emit(gaugeDistributor, "AddRewardToken")
        .withArgs(1, token2.address, [gauge1.address, gauge2.address], [6e8, 4e8]);
    });

    it("should revert, when call updateRewardDistribution and caller is not owner", async () => {
      await expect(gaugeDistributor.connect(alice).updateRewardDistribution(0, [], [])).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when duplicated gauge", async () => {
      await expect(
        gaugeDistributor.updateRewardDistribution(0, [gauge1.address, gauge1.address], [5e8, 5e8])
      ).to.revertedWith("duplicated gauge");
    });

    it("should revert, when sum mismatch", async () => {
      await expect(
        gaugeDistributor.updateRewardDistribution(0, [gauge1.address, gauge2.address], [5e8, 5e8 + 1])
      ).to.revertedWith("sum mismatch");
    });

    it("should succeed", async () => {
      // update token1
      await expect(gaugeDistributor.updateRewardDistribution(0, [gauge2.address], [1e9]))
        .to.emit(gaugeDistributor, "UpdateRewardToken")
        .withArgs(token1.address, [gauge2.address], [1e9]);
      let info1 = await gaugeDistributor.getGaugeInfo(gauge1.address);
      let info2 = await gaugeDistributor.getGaugeInfo(gauge2.address);
      expect(info1.tokens).to.deep.eq([token2.address]);
      expect(info2.tokens).to.deep.eq([token2.address, token1.address]);
      expect(await gaugeDistributor.getDistributionInfo(token1.address)).to.deep.eq([[gauge2.address, 1e9]]);
      expect(await gaugeDistributor.getDistributionInfo(token2.address)).to.deep.eq([
        [gauge1.address, 6e8],
        [gauge2.address, 4e8],
      ]);

      // update token2
      await expect(gaugeDistributor.updateRewardDistribution(1, [gauge1.address], [1e9]))
        .to.emit(gaugeDistributor, "UpdateRewardToken")
        .withArgs(token2.address, [gauge1.address], [1e9]);
      info1 = await gaugeDistributor.getGaugeInfo(gauge1.address);
      info2 = await gaugeDistributor.getGaugeInfo(gauge2.address);
      expect(info1.tokens).to.deep.eq([token2.address]);
      expect(info2.tokens).to.deep.eq([token1.address]);
      expect(await gaugeDistributor.getDistributionInfo(token1.address)).to.deep.eq([[gauge2.address, 1e9]]);
      expect(await gaugeDistributor.getDistributionInfo(token2.address)).to.deep.eq([[gauge1.address, 1e9]]);
    });
  });

  context("claim", async () => {
    const amount1 = ethers.utils.parseEther("10000");
    const amount2 = ethers.utils.parseEther("90000");

    beforeEach(async () => {
      await gaugeDistributor.updateGaugeTypes([gauge1.address, gauge2.address], [1, 2]);
      // add token1, push
      await expect(gaugeDistributor.addRewardToken(token1.address, [gauge1.address, gauge2.address], [4e8, 6e8]))
        .to.emit(gaugeDistributor, "AddRewardToken")
        .withArgs(0, token1.address, [gauge1.address, gauge2.address], [4e8, 6e8]);

      // add token2, push
      await expect(gaugeDistributor.addRewardToken(token2.address, [gauge1.address, gauge2.address], [6e8, 4e8]))
        .to.emit(gaugeDistributor, "AddRewardToken")
        .withArgs(1, token2.address, [gauge1.address, gauge2.address], [6e8, 4e8]);

      await token1.mint(feeDistributor.address, amount1);
      await token2.mint(feeDistributor.address, amount2);
      await feeDistributor.addRewardToken(token1.address, 1e9, 0);
      await feeDistributor.addRewardToken(token2.address, 1e9, 0);
    });

    it("should revert, when call claim and caller is not gauge", async () => {
      await expect(gaugeDistributor.claim()).to.revertedWith("sender not allowed");
    });

    it("should succeed, when reward is multiple tokens", async () => {
      await gauge1["claim(address)"](gaugeDistributor.address);
      expect(await token1.balanceOf(gauge1.address)).to.eq(amount1.mul(4).div(10));
      expect(await token1.balanceOf(gauge2.address)).to.eq(amount1.mul(6).div(10));
      expect(await token2.balanceOf(gauge1.address)).to.eq(amount2.mul(6).div(10));
      expect(await token2.balanceOf(gauge2.address)).to.eq(amount2.mul(4).div(10));
    });
  });

  context("donate", async () => {
    const amount1 = ethers.utils.parseEther("10000");
    const amount2 = ethers.utils.parseEther("90000");

    beforeEach(async () => {
      await gaugeDistributor.updateGaugeTypes([gauge1.address, gauge2.address], [1, 2]);
      // add token1, push
      await expect(gaugeDistributor.addRewardToken(token1.address, [gauge1.address, gauge2.address], [4e8, 6e8]))
        .to.emit(gaugeDistributor, "AddRewardToken")
        .withArgs(0, token1.address, [gauge1.address, gauge2.address], [4e8, 6e8]);

      // add token2, push
      await expect(gaugeDistributor.addRewardToken(token2.address, [gauge1.address, gauge2.address], [6e8, 4e8]))
        .to.emit(gaugeDistributor, "AddRewardToken")
        .withArgs(1, token2.address, [gauge1.address, gauge2.address], [6e8, 4e8]);

      await token1.mint(feeDistributor.address, amount1);
      await token2.mint(feeDistributor.address, amount2);
      await feeDistributor.addRewardToken(token1.address, 1e9, 0);
      await feeDistributor.addRewardToken(token2.address, 1e9, 0);
    });

    it("should revert, when donate non-reward token", async () => {
      await expect(gaugeDistributor.donate([alice.address], [0])).to.revertedWith("not reward token");
    });

    it("should revert, when length mismatch", async () => {
      await expect(gaugeDistributor.donate([alice.address], [])).to.revertedWith("length mismatch");
    });

    it("should succeed, when donate nothing", async () => {
      await gaugeDistributor.donate([], []);
      const info = await gaugeDistributor.getGaugeInfo(gauge1.address);
      expect(info.pendings[0]).to.eq(amount1.mul(4).div(10));
      expect(info.pendings[1]).to.eq(amount2.mul(6).div(10));
      expect(await token1.balanceOf(gauge2.address)).to.eq(amount1.mul(6).div(10));
      expect(await token2.balanceOf(gauge2.address)).to.eq(amount2.mul(4).div(10));
    });

    it("should succeed, when donate something", async () => {
      await token1.mint(deployer.address, amount1);
      await token2.mint(deployer.address, amount2);
      await token1.approve(gaugeDistributor.address, amount1);
      await token2.approve(gaugeDistributor.address, amount2);
      await gaugeDistributor.donate([token1.address, token2.address], [amount1, amount2]);
      const info = await gaugeDistributor.getGaugeInfo(gauge1.address);
      expect(info.pendings[0]).to.eq(amount1.mul(4).div(10).mul(2));
      expect(info.pendings[1]).to.eq(amount2.mul(6).div(10).mul(2));
      expect(await token1.balanceOf(gauge2.address)).to.eq(amount1.mul(6).div(10).mul(2));
      expect(await token2.balanceOf(gauge2.address)).to.eq(amount2.mul(4).div(10).mul(2));
    });
  });
});

/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { MockERC20, PlatformFeeDistributor, VeFeeGateway } from "../../typechain";

describe("VeFeeGateway.spec", async () => {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let treasury: SignerWithAddress;
  let gauge: SignerWithAddress;
  let veDistributor1: SignerWithAddress;
  let veDistributor2: SignerWithAddress;
  let gateway: VeFeeGateway;
  let platform: PlatformFeeDistributor;

  beforeEach(async () => {
    [deployer, alice, treasury, gauge, veDistributor1, veDistributor2] = await ethers.getSigners();

    const PlatformFeeDistributor = await ethers.getContractFactory("PlatformFeeDistributor", deployer);
    platform = await PlatformFeeDistributor.deploy(gauge.address, treasury.address, veDistributor1.address, []);
    await platform.deployed();

    const VeFeeGateway = await ethers.getContractFactory("VeFeeGateway", deployer);
    gateway = await VeFeeGateway.deploy(platform.address);
    await gateway.deployed();

    platform.updateGauge(gateway.address);
    platform.updateDistributor(gateway.address);

    expect(await gateway.platform()).to.eq(platform.address);
  });

  context("#add", async () => {
    it("should revert, when call add and caller is not owner", async () => {
      await expect(gateway.connect(alice).add(constants.AddressZero, constants.AddressZero)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when token mapping exists", async () => {
      await gateway.add(gauge.address, veDistributor1.address);
      await expect(gateway.add(gauge.address, veDistributor1.address)).to.revertedWith("token mapping exists");
    });

    it("should revert, when platform mapping exists", async () => {
      await gateway.add(gauge.address, veDistributor1.address);
      await expect(gateway.add(deployer.address, veDistributor1.address)).to.revertedWith("distributor mapping exists");
    });

    it("should succeed", async () => {
      expect(await gateway.token2distributor(gauge.address)).to.eq(constants.AddressZero);
      expect(await gateway.distributor2token(veDistributor1.address)).to.eq(constants.AddressZero);
      await expect(gateway.add(gauge.address, veDistributor1.address))
        .to.emit(gateway, "AddDistributor")
        .withArgs(gauge.address, veDistributor1.address);
      expect(await gateway.token2distributor(gauge.address)).to.eq(veDistributor1.address);
      expect(await gateway.distributor2token(veDistributor1.address)).to.eq(gauge.address);
    });
  });

  context("#remove", async () => {
    it("should revert, when call remove and caller is not owner", async () => {
      await expect(gateway.connect(alice).remove(constants.AddressZero)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should succeed", async () => {
      expect(await gateway.token2distributor(gauge.address)).to.eq(constants.AddressZero);
      expect(await gateway.distributor2token(veDistributor1.address)).to.eq(constants.AddressZero);
      await expect(gateway.add(gauge.address, veDistributor1.address))
        .to.emit(gateway, "AddDistributor")
        .withArgs(gauge.address, veDistributor1.address);
      expect(await gateway.token2distributor(gauge.address)).to.eq(veDistributor1.address);
      expect(await gateway.distributor2token(veDistributor1.address)).to.eq(gauge.address);
      await expect(gateway.remove(veDistributor1.address))
        .to.emit(gateway, "RemoveDistributor")
        .withArgs(gauge.address, veDistributor1.address);
      expect(await gateway.token2distributor(gauge.address)).to.eq(constants.AddressZero);
      expect(await gateway.distributor2token(veDistributor1.address)).to.eq(constants.AddressZero);
    });
  });

  context("claim", async () => {
    const amount1 = ethers.utils.parseEther("10000");
    const amount2 = ethers.utils.parseEther("90000");
    let token1: MockERC20;
    let token2: MockERC20;

    beforeEach(async () => {
      const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
      token1 = await MockERC20.deploy("X", "Y", 18);
      await token1.deployed();
      token2 = await MockERC20.deploy("XX", "YY", 18);
      await token2.deployed();

      await token1.mint(deployer.address, amount1);
      await token2.mint(deployer.address, amount2);

      await gateway.add(token1.address, veDistributor1.address);
      await gateway.add(token2.address, veDistributor2.address);
    });

    it("should succeed, when reward is single token", async () => {
      await platform.addRewardToken(token1.address, 0, 2e8);
      await token1.transfer(platform.address, amount1);

      await gateway.distribute([veDistributor1.address]);

      expect(await token1.balanceOf(veDistributor1.address)).to.eq(amount1.mul(8e8).div(1e9));
      expect(await token1.balanceOf(treasury.address)).to.eq(amount1.mul(2e8).div(1e9));
    });

    it("should succeed, when reward is multiple tokens", async () => {
      await platform.addRewardToken(token1.address, 0, 2e8);
      await platform.addRewardToken(token2.address, 0, 4e8);
      await token1.transfer(platform.address, amount1);
      await token2.transfer(platform.address, amount2);

      await gateway.distribute([veDistributor1.address, veDistributor2.address]);

      expect(await token1.balanceOf(treasury.address)).to.eq(amount1.mul(2e8).div(1e9));
      expect(await token1.balanceOf(veDistributor1.address)).to.eq(amount1.mul(8e8).div(1e9));
      expect(await token2.balanceOf(treasury.address)).to.eq(amount2.mul(4e8).div(1e9));
      expect(await token2.balanceOf(veDistributor2.address)).to.eq(amount2.mul(6e8).div(1e9));
    });
  });
});

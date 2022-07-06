/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { CLeverToken } from "../../typechain";

describe("CLeverToken.spec", async () => {
  let deployer: SignerWithAddress;
  let minter: SignerWithAddress;
  let clevToken: CLeverToken;

  beforeEach(async () => {
    [deployer, minter] = await ethers.getSigners();

    const CLeverToken = await ethers.getContractFactory("CLeverToken", deployer);
    clevToken = (await CLeverToken.deploy("CLever CVX", "clevCVX")) as CLeverToken;
    await clevToken.deployed();

    await expect(clevToken.updateMinters([minter.address], true))
      .to.emit(clevToken, "UpdateMinter")
      .withArgs(minter.address, true);
  });

  it("should revert, when call updateMinters and caller is not owner", async () => {
    await expect(clevToken.connect(minter).updateMinters([], false)).to.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("should revert, when call updateCeiling and caller is not owner", async () => {
    await expect(clevToken.connect(minter).updateCeiling(minter.address, 10)).to.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("should revert, when call mint and caller is not minter", async () => {
    await expect(clevToken.mint(deployer.address, 1)).to.revertedWith("CLeverToken: only minter");
  });

  it("should revert, when mint reach limit", async () => {
    await expect(clevToken.updateCeiling(minter.address, 10))
      .to.emit(clevToken, "UpdateCeiling")
      .withArgs(minter.address, 10);
    await expect(clevToken.connect(minter).mint(deployer.address, 11)).to.revertedWith(
      "CLeverToken: reach mint ceiling"
    );
  });

  it("should succeed, when mint under limit", async () => {
    await expect(clevToken.updateCeiling(minter.address, 10))
      .to.emit(clevToken, "UpdateCeiling")
      .withArgs(minter.address, 10);
    await clevToken.connect(minter).mint(deployer.address, 10);
    expect(await clevToken.balanceOf(deployer.address)).to.eq(10);
  });

  it("should succeed, when burn own token", async () => {
    await expect(clevToken.updateCeiling(minter.address, 10))
      .to.emit(clevToken, "UpdateCeiling")
      .withArgs(minter.address, 10);
    await clevToken.connect(minter).mint(deployer.address, 10);
    expect(await clevToken.balanceOf(deployer.address)).to.eq(10);
    await clevToken.burn(4);
    expect(await clevToken.balanceOf(deployer.address)).to.eq(6);
  });

  it("should revert, when burn other's token without approve", async () => {
    await expect(clevToken.updateCeiling(minter.address, 10))
      .to.emit(clevToken, "UpdateCeiling")
      .withArgs(minter.address, 10);
    await clevToken.connect(minter).mint(deployer.address, 10);
    expect(await clevToken.balanceOf(deployer.address)).to.eq(10);
    await clevToken.approve(minter.address, 3);
    await expect(clevToken.connect(minter).burnFrom(deployer.address, 4)).to.revertedWith(
      "CLeverToken: burn amount exceeds allowance"
    );
    expect(await clevToken.balanceOf(deployer.address)).to.eq(10);
  });

  it("should succeed, when burn other's token with approve", async () => {
    await expect(clevToken.updateCeiling(minter.address, 10))
      .to.emit(clevToken, "UpdateCeiling")
      .withArgs(minter.address, 10);
    await clevToken.connect(minter).mint(deployer.address, 10);
    expect(await clevToken.balanceOf(deployer.address)).to.eq(10);
    await clevToken.approve(minter.address, 4);
    await clevToken.connect(minter).burnFrom(deployer.address, 4);
    expect(await clevToken.balanceOf(deployer.address)).to.eq(6);
  });
});

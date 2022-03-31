/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { AldCVX } from "../typechain";

describe("aldCVX.spec", async () => {
  let deployer: SignerWithAddress;
  let minter: SignerWithAddress;
  let aldcvx: AldCVX;

  beforeEach(async () => {
    [deployer, minter] = await ethers.getSigners();

    const AldCVX = await ethers.getContractFactory("aldCVX", deployer);
    aldcvx = (await AldCVX.deploy()) as AldCVX;
    await aldcvx.deployed();

    await expect(aldcvx.updateMinters([minter.address], true))
      .to.emit(aldcvx, "UpdateMinter")
      .withArgs(minter.address, true);
  });

  it("should revert, when call updateMinters and caller is not owner", async () => {
    await expect(aldcvx.connect(minter).updateMinters([], false)).to.revertedWith("Ownable: caller is not the owner");
  });

  it("should revert, when call updateCeiling and caller is not owner", async () => {
    await expect(aldcvx.connect(minter).updateCeiling(minter.address, 10)).to.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("should revert, when call mint and caller is not minter", async () => {
    await expect(aldcvx.mint(deployer.address, 1)).to.revertedWith("aldCVX: only minter");
  });

  it("should revert, when mint reach limit", async () => {
    await expect(aldcvx.updateCeiling(minter.address, 10))
      .to.emit(aldcvx, "UpdateCeiling")
      .withArgs(minter.address, 10);
    await expect(aldcvx.connect(minter).mint(deployer.address, 11)).to.revertedWith("aldCVX: reach mint ceiling");
  });

  it("should succeed, when mint under limit", async () => {
    await expect(aldcvx.updateCeiling(minter.address, 10))
      .to.emit(aldcvx, "UpdateCeiling")
      .withArgs(minter.address, 10);
    await aldcvx.connect(minter).mint(deployer.address, 10);
    expect(await aldcvx.balanceOf(deployer.address)).to.eq(10);
  });

  it("should succeed, when burn own token", async () => {
    await expect(aldcvx.updateCeiling(minter.address, 10))
      .to.emit(aldcvx, "UpdateCeiling")
      .withArgs(minter.address, 10);
    await aldcvx.connect(minter).mint(deployer.address, 10);
    expect(await aldcvx.balanceOf(deployer.address)).to.eq(10);
    await aldcvx.burn(4);
    expect(await aldcvx.balanceOf(deployer.address)).to.eq(6);
  });

  it("should revert, when burn other's token without approve", async () => {
    await expect(aldcvx.updateCeiling(minter.address, 10))
      .to.emit(aldcvx, "UpdateCeiling")
      .withArgs(minter.address, 10);
    await aldcvx.connect(minter).mint(deployer.address, 10);
    expect(await aldcvx.balanceOf(deployer.address)).to.eq(10);
    await aldcvx.approve(minter.address, 3);
    await expect(aldcvx.connect(minter).burnFrom(deployer.address, 4)).to.revertedWith(
      "aldCVX: burn amount exceeds allowance"
    );
    expect(await aldcvx.balanceOf(deployer.address)).to.eq(10);
  });

  it("should succeed, when burn other's token with approve", async () => {
    await expect(aldcvx.updateCeiling(minter.address, 10))
      .to.emit(aldcvx, "UpdateCeiling")
      .withArgs(minter.address, 10);
    await aldcvx.connect(minter).mint(deployer.address, 10);
    expect(await aldcvx.balanceOf(deployer.address)).to.eq(10);
    await aldcvx.approve(minter.address, 4);
    await aldcvx.connect(minter).burnFrom(deployer.address, 4);
    expect(await aldcvx.balanceOf(deployer.address)).to.eq(6);
  });
});

/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { AldVeCRV } from "../../typechain";

describe("CLeverToken.spec", async () => {
  let deployer: SignerWithAddress;
  let minter: SignerWithAddress;
  let aldvecrv: AldVeCRV;

  beforeEach(async () => {
    [deployer, minter] = await ethers.getSigners();

    const AldVeCRV = await ethers.getContractFactory("AldVeCRV", deployer);
    aldvecrv = await AldVeCRV.deploy();
    await aldvecrv.deployed();

    expect(await aldvecrv.symbol()).to.eq("aldveCRV");
    expect(await aldvecrv.name()).to.eq("Aladdin DAO veCRV");

    await aldvecrv.setMinter(minter.address);
  });

  it("should revert, when call setMinter and caller is not minter", async () => {
    await expect(aldvecrv.connect(deployer).setMinter(constants.AddressZero)).to.revertedWith("not minter");
  });

  it("should revert, when call mint and caller is not minter", async () => {
    await expect(aldvecrv.connect(deployer).mint(constants.AddressZero, 0)).to.revertedWith("not minter");
  });

  it("should revert, when call burn and caller is not minter", async () => {
    await expect(aldvecrv.connect(deployer).burn(constants.AddressZero, 0)).to.revertedWith("not minter");
  });

  it("should succeed, when change minter", async () => {
    expect(await aldvecrv.minter()).to.eq(minter.address);
    await aldvecrv.connect(minter).setMinter(deployer.address);
    expect(await aldvecrv.minter()).to.eq(deployer.address);
  });

  it("should succeed, when minter mint", async () => {
    await aldvecrv.connect(minter).mint(deployer.address, 100);
    expect(await aldvecrv.balanceOf(deployer.address)).to.eq(100);
  });

  it("should succeed, when minter burn", async () => {
    await aldvecrv.connect(minter).mint(deployer.address, 100);
    expect(await aldvecrv.balanceOf(deployer.address)).to.eq(100);
    await aldvecrv.connect(minter).burn(deployer.address, 10);
    expect(await aldvecrv.balanceOf(deployer.address)).to.eq(90);
  });
});

/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { CLeverVeCRV } from "../../typechain";

describe("CLeverVeCRV.spec", async () => {
  let deployer: SignerWithAddress;
  let minter: SignerWithAddress;
  let cvecrv: CLeverVeCRV;

  beforeEach(async () => {
    [deployer, minter] = await ethers.getSigners();

    const CLeverVeCRV = await ethers.getContractFactory("CLeverVeCRV", deployer);
    cvecrv = await CLeverVeCRV.deploy();
    await cvecrv.deployed();

    expect(await cvecrv.symbol()).to.eq("cveCRV");
    expect(await cvecrv.name()).to.eq("CLever veCRV");

    await cvecrv.setMinter(minter.address);
  });

  it("should revert, when call setMinter and caller is not minter", async () => {
    await expect(cvecrv.connect(deployer).setMinter(constants.AddressZero)).to.revertedWith("not minter");
  });

  it("should revert, when call mint and caller is not minter", async () => {
    await expect(cvecrv.connect(deployer).mint(constants.AddressZero, 0)).to.revertedWith("not minter");
  });

  it("should revert, when call burn and caller is not minter", async () => {
    await expect(cvecrv.connect(deployer).burn(constants.AddressZero, 0)).to.revertedWith("not minter");
  });

  it("should succeed, when change minter", async () => {
    expect(await cvecrv.minter()).to.eq(minter.address);
    await cvecrv.connect(minter).setMinter(deployer.address);
    expect(await cvecrv.minter()).to.eq(deployer.address);
  });

  it("should succeed, when minter mint", async () => {
    await cvecrv.connect(minter).mint(deployer.address, 100);
    expect(await cvecrv.balanceOf(deployer.address)).to.eq(100);
  });

  it("should succeed, when minter burn", async () => {
    await cvecrv.connect(minter).mint(deployer.address, 100);
    expect(await cvecrv.balanceOf(deployer.address)).to.eq(100);
    await cvecrv.connect(minter).burn(deployer.address, 10);
    expect(await cvecrv.balanceOf(deployer.address)).to.eq(90);
  });
});

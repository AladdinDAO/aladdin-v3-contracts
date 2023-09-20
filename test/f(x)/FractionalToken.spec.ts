/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { FractionalToken } from "../../typechain";
import { BigNumber, constants } from "ethers";

const PRECISION = BigNumber.from(10).pow(18);

describe("FractionalToken.spec", async () => {
  let deployer: SignerWithAddress;
  let treasury: SignerWithAddress;
  let token: FractionalToken;

  beforeEach(async () => {
    [deployer, treasury] = await ethers.getSigners();

    const FractionalToken = await ethers.getContractFactory("FractionalToken", deployer);
    token = await FractionalToken.deploy();
    await token.deployed();

    await token.initialize(treasury.address, "Fractional ETH", "fETH");
  });

  context("auth", async () => {
    it("should revert, when intialize again", async () => {
      await expect(token.initialize(constants.AddressZero, "", "")).to.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("should initialize correctly", async () => {
      expect(await token.treasury()).to.eq(treasury.address);
      expect(await token.name()).to.eq("Fractional ETH");
      expect(await token.symbol()).to.eq("fETH");
      expect(await token.nav()).to.eq(PRECISION);
    });
  });

  context("#updateNav", async () => {
    it("should revert, when non-treasury call", async () => {
      await expect(token.updateNav(constants.Zero)).to.revertedWith("Only treasury");
    });

    it("should revert, when multiple too small", async () => {
      await expect(token.connect(treasury).updateNav(constants.Zero.sub(PRECISION))).to.revertedWith(
        "multiple too small"
      );
    });

    it("should revert, when multiple too large", async () => {
      await expect(token.connect(treasury).updateNav(PRECISION.mul(PRECISION))).to.revertedWith("multiple too large");
    });

    it("should succeed", async () => {
      expect(await token.nav()).to.eq(ethers.utils.parseEther("1"));
      await expect(token.connect(treasury).updateNav(ethers.utils.parseEther("0.1")))
        .to.emit(token, "UpdateNav")
        .withArgs(PRECISION, ethers.utils.parseEther("1.1"));
      expect(await token.nav()).to.eq(ethers.utils.parseEther("1.1"));
      await expect(token.connect(treasury).updateNav(constants.Zero.sub(ethers.utils.parseEther("0.1"))))
        .to.emit(token, "UpdateNav")
        .withArgs(ethers.utils.parseEther("1.1"), ethers.utils.parseEther("0.99"));
      expect(await token.nav()).to.eq(ethers.utils.parseEther("0.99"));
    });
  });

  context("#setNav", async () => {
    it("should revert, when non-treasury call", async () => {
      await expect(token.setNav(constants.Zero)).to.revertedWith("Only treasury");
    });

    it("should succeed", async () => {
      expect(await token.nav()).to.eq(ethers.utils.parseEther("1"));
      await expect(token.connect(treasury).setNav(ethers.utils.parseEther("0.1")))
        .to.emit(token, "UpdateNav")
        .withArgs(PRECISION, ethers.utils.parseEther("0.1"));
      expect(await token.nav()).to.eq(ethers.utils.parseEther("0.1"));
      await expect(token.connect(treasury).setNav(ethers.utils.parseEther("0.99")))
        .to.emit(token, "UpdateNav")
        .withArgs(ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.99"));
      expect(await token.nav()).to.eq(ethers.utils.parseEther("0.99"));
    });
  });

  context("#mint", async () => {
    it("should revert, when non-treasury call", async () => {
      await expect(token.mint(constants.AddressZero, constants.Zero)).to.revertedWith("Only treasury");
    });

    it("should succeed", async () => {
      expect(await token.balanceOf(deployer.address)).to.eq(constants.Zero);
      await token.connect(treasury).mint(deployer.address, ethers.utils.parseEther("1.0"));
      expect(await token.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("1.0"));
    });
  });

  context("#burn", async () => {
    it("should revert, when non-treasury call", async () => {
      await expect(token.burn(constants.AddressZero, constants.Zero)).to.revertedWith("Only treasury");
    });

    it("should succeed", async () => {
      expect(await token.balanceOf(deployer.address)).to.eq(constants.Zero);
      await token.connect(treasury).mint(deployer.address, ethers.utils.parseEther("1.0"));
      expect(await token.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("1.0"));
      await token.connect(treasury).burn(deployer.address, ethers.utils.parseEther("0.5"));
      expect(await token.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("0.5"));
    });
  });
});

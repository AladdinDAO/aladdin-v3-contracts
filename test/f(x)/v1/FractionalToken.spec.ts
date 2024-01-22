import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { FractionalToken } from "@/types/index";

const PRECISION = 10n ** 18n;

describe("FractionalToken.spec", async () => {
  let deployer: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
  let token: FractionalToken;

  beforeEach(async () => {
    [deployer, treasury] = await ethers.getSigners();

    const FractionalToken = await ethers.getContractFactory("FractionalToken", deployer);
    token = await FractionalToken.deploy();

    await token.initialize(treasury.address, "Fractional ETH", "fETH");
  });

  context("auth", async () => {
    it("should revert, when intialize again", async () => {
      await expect(token.initialize(ZeroAddress, "", "")).to.revertedWith(
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
      await expect(token.updateNav(0n)).to.revertedWith("Only treasury");
    });

    it("should revert, when multiple too small", async () => {
      await expect(token.connect(treasury).updateNav(-PRECISION)).to.revertedWith("multiple too small");
    });

    it("should revert, when multiple too large", async () => {
      await expect(token.connect(treasury).updateNav(PRECISION * PRECISION)).to.revertedWith("multiple too large");
    });

    it("should succeed", async () => {
      expect(await token.nav()).to.eq(ethers.parseEther("1"));
      await expect(token.connect(treasury).updateNav(ethers.parseEther("0.1")))
        .to.emit(token, "UpdateNav")
        .withArgs(PRECISION, ethers.parseEther("1.1"));
      expect(await token.nav()).to.eq(ethers.parseEther("1.1"));
      await expect(token.connect(treasury).updateNav(-ethers.parseEther("0.1")))
        .to.emit(token, "UpdateNav")
        .withArgs(ethers.parseEther("1.1"), ethers.parseEther("0.99"));
      expect(await token.nav()).to.eq(ethers.parseEther("0.99"));
    });
  });

  context("#setNav", async () => {
    it("should revert, when non-treasury call", async () => {
      await expect(token.setNav(0n)).to.revertedWith("Only treasury");
    });

    it("should succeed", async () => {
      expect(await token.nav()).to.eq(ethers.parseEther("1"));
      await expect(token.connect(treasury).setNav(ethers.parseEther("0.1")))
        .to.emit(token, "UpdateNav")
        .withArgs(PRECISION, ethers.parseEther("0.1"));
      expect(await token.nav()).to.eq(ethers.parseEther("0.1"));
      await expect(token.connect(treasury).setNav(ethers.parseEther("0.99")))
        .to.emit(token, "UpdateNav")
        .withArgs(ethers.parseEther("0.1"), ethers.parseEther("0.99"));
      expect(await token.nav()).to.eq(ethers.parseEther("0.99"));
    });
  });

  context("#mint", async () => {
    it("should revert, when non-treasury call", async () => {
      await expect(token.mint(ZeroAddress, 0n)).to.revertedWith("Only treasury");
    });

    it("should succeed", async () => {
      expect(await token.balanceOf(deployer.address)).to.eq(0n);
      await token.connect(treasury).mint(deployer.address, ethers.parseEther("1.0"));
      expect(await token.balanceOf(deployer.address)).to.eq(ethers.parseEther("1.0"));
    });
  });

  context("#burn", async () => {
    it("should revert, when non-treasury call", async () => {
      await expect(token.burn(ZeroAddress, 0n)).to.revertedWith("Only treasury");
    });

    it("should succeed", async () => {
      expect(await token.balanceOf(deployer.address)).to.eq(0n);
      await token.connect(treasury).mint(deployer.address, ethers.parseEther("1.0"));
      expect(await token.balanceOf(deployer.address)).to.eq(ethers.parseEther("1.0"));
      await token.connect(treasury).burn(deployer.address, ethers.parseEther("0.5"));
      expect(await token.balanceOf(deployer.address)).to.eq(ethers.parseEther("0.5"));
    });
  });
});

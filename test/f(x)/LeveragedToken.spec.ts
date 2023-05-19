/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { LeveragedToken, FractionalToken } from "../../typechain";
import { constants } from "ethers";

describe("LeveragedToken.spec", async () => {
  let deployer: SignerWithAddress;
  let treasury: SignerWithAddress;

  let fToken: FractionalToken;
  let xToken: LeveragedToken;

  beforeEach(async () => {
    [deployer, treasury] = await ethers.getSigners();
    [deployer] = await ethers.getSigners();

    const FractionalToken = await ethers.getContractFactory("FractionalToken", deployer);
    fToken = await FractionalToken.deploy();
    await fToken.deployed();

    const LeveragedToken = await ethers.getContractFactory("LeveragedToken", deployer);
    xToken = await LeveragedToken.deploy();
    await xToken.deployed();

    await fToken.initialize(treasury.address, "Fractional ETH", "fETH");
    await xToken.initialize(treasury.address, fToken.address, "Leveraged ETH", "xETH");
  });

  context("auth", async () => {
    it("should revert, when intialize again", async () => {
      await expect(xToken.initialize(constants.AddressZero, constants.AddressZero, "", "")).to.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("should initialize correctly", async () => {
      expect(await xToken.treasury()).to.eq(treasury.address);
      expect(await xToken.fToken()).to.eq(fToken.address);
      expect(await xToken.name()).to.eq("Leveraged ETH");
      expect(await xToken.symbol()).to.eq("xETH");
    });
  });

  context("#mint", async () => {
    it("should revert, when non-treasury call", async () => {
      await expect(xToken.mint(constants.AddressZero, constants.Zero)).to.revertedWith("Only treasury");
    });

    it("should succeed", async () => {
      expect(await xToken.balanceOf(deployer.address)).to.eq(constants.Zero);
      await xToken.connect(treasury).mint(deployer.address, ethers.utils.parseEther("1.0"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("1.0"));
    });
  });

  context("#burn", async () => {
    it("should revert, when non-treasury call", async () => {
      await expect(xToken.burn(constants.AddressZero, constants.Zero)).to.revertedWith("Only treasury");
    });

    it("should succeed", async () => {
      expect(await xToken.balanceOf(deployer.address)).to.eq(constants.Zero);
      await xToken.connect(treasury).mint(deployer.address, ethers.utils.parseEther("1.0"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("1.0"));
      await xToken.connect(treasury).burn(deployer.address, ethers.utils.parseEther("0.5"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("0.5"));
    });
  });
});

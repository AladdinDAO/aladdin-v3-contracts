import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { FractionalToken, LeveragedToken } from "@/types/index";

describe("LeveragedToken.spec", async () => {
  let deployer: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;

  let fToken: FractionalToken;
  let xToken: LeveragedToken;

  beforeEach(async () => {
    [deployer, treasury] = await ethers.getSigners();
    [deployer] = await ethers.getSigners();

    const FractionalToken = await ethers.getContractFactory("FractionalToken", deployer);
    fToken = await FractionalToken.deploy();

    const LeveragedToken = await ethers.getContractFactory("LeveragedToken", deployer);
    xToken = await LeveragedToken.deploy();

    await fToken.initialize(treasury.address, "Fractional ETH", "fETH");
    await xToken.initialize(treasury.address, fToken.getAddress(), "Leveraged ETH", "xETH");
  });

  context("auth", async () => {
    it("should revert, when intialize again", async () => {
      await expect(xToken.initialize(ZeroAddress, ZeroAddress, "", "")).to.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("should initialize correctly", async () => {
      expect(await xToken.treasury()).to.eq(treasury.address);
      expect(await xToken.fToken()).to.eq(await fToken.getAddress());
      expect(await xToken.name()).to.eq("Leveraged ETH");
      expect(await xToken.symbol()).to.eq("xETH");
    });
  });

  context("#mint", async () => {
    it("should revert, when non-treasury call", async () => {
      await expect(xToken.mint(ZeroAddress, 0n)).to.revertedWith("Only treasury");
    });

    it("should succeed", async () => {
      expect(await xToken.balanceOf(deployer.address)).to.eq(0n);
      await xToken.connect(treasury).mint(deployer.address, ethers.parseEther("1.0"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("1.0"));
    });
  });

  context("#burn", async () => {
    it("should revert, when non-treasury call", async () => {
      await expect(xToken.burn(ZeroAddress, 0n)).to.revertedWith("Only treasury");
    });

    it("should succeed", async () => {
      expect(await xToken.balanceOf(deployer.address)).to.eq(0n);
      await xToken.connect(treasury).mint(deployer.address, ethers.parseEther("1.0"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("1.0"));
      await xToken.connect(treasury).burn(deployer.address, ethers.parseEther("0.5"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("0.5"));
    });
  });
});

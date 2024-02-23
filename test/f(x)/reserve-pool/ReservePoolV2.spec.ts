import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress, ZeroHash, id } from "ethers";
import { ethers } from "hardhat";

import { MockERC20, ReservePoolV2 } from "@/types/index";

describe("ReservePoolV2.spec", async () => {
  let deployer: HardhatEthersSigner;
  let market: HardhatEthersSigner;

  let token: MockERC20;
  let pool: ReservePoolV2;

  beforeEach(async () => {
    [deployer, market] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    token = await MockERC20.deploy("src", "src", 18);

    const ReservePoolV2 = await ethers.getContractFactory("ReservePoolV2", deployer);
    pool = await ReservePoolV2.deploy();
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      expect(await pool.bonusRatio(token.getAddress())).to.eq(0n);
      expect(await pool.hasRole(ZeroHash, deployer.address));
    });
  });

  context("auth", async () => {
    context("#updateBonusRatio", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(pool.connect(market).updateBonusRatio(ZeroAddress, 0n)).to.revertedWith(
          "AccessControl: account " + market.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert when too large", async () => {
        await expect(pool.updateBonusRatio(token.getAddress(), ethers.parseEther("1") + 1n)).to.revertedWithCustomError(
          pool,
          "ErrorRatioTooLarge"
        );
      });

      it("should succeed", async () => {
        expect(await pool.bonusRatio(token.getAddress())).to.eq(0n);
        await expect(pool.updateBonusRatio(token.getAddress(), ethers.parseEther("0.1")))
          .to.emit(pool, "UpdateBonusRatio")
          .withArgs(await token.getAddress(), 0n, ethers.parseEther("0.1"));
        expect(await pool.bonusRatio(token.getAddress())).to.eq(ethers.parseEther("0.1"));
        await expect(pool.updateBonusRatio(token.getAddress(), ethers.parseEther("1")))
          .to.emit(pool, "UpdateBonusRatio")
          .withArgs(await token.getAddress(), ethers.parseEther("0.1"), ethers.parseEther("1"));
        expect(await pool.bonusRatio(token.getAddress())).to.eq(ethers.parseEther("1"));
      });
    });

    context("#withdrawFund", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(pool.connect(market).withdrawFund(ZeroAddress, deployer.address)).to.revertedWith(
          "AccessControl: account " + market.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should succeed to withdraw ETH", async () => {
        await deployer.sendTransaction({ to: await pool.getAddress(), value: ethers.parseEther("1") });
        expect(await ethers.provider.getBalance(pool.getAddress())).to.eq(ethers.parseEther("1"));
        const before = await ethers.provider.getBalance(market.address);
        await pool.withdrawFund(ZeroAddress, market.address);
        const after = await ethers.provider.getBalance(market.address);
        expect(await ethers.provider.getBalance(pool.getAddress())).to.eq(0n);
        expect(after - before).to.eq(ethers.parseEther("1"));
      });

      it("should succeed to withdraw ERC20", async () => {
        await token.mint(pool.getAddress(), ethers.parseEther("1"));
        expect(await token.balanceOf(pool.getAddress())).to.eq(ethers.parseEther("1"));
        const before = await token.balanceOf(market.address);
        await pool.withdrawFund(token.getAddress(), market.address);
        const after = await token.balanceOf(market.address);
        expect(await token.balanceOf(pool.getAddress())).to.eq(0n);
        expect(after - before).to.eq(ethers.parseEther("1"));
      });
    });
  });

  context("#requestBonus", async () => {
    it("should revert when caller is not market", async () => {
      await expect(pool.connect(market).requestBonus(ZeroAddress, ZeroAddress, 0n)).to.revertedWith(
        "AccessControl: account " + market.address.toLowerCase() + " is missing role " + id("MARKET_ROLE")
      );
    });

    it("should succeed when balance enough", async () => {
      await pool.grantRole(id("MARKET_ROLE"), market.address);
      await pool.updateBonusRatio(token.getAddress(), ethers.parseEther("0.05"));
      await token.mint(pool.getAddress(), ethers.parseEther("100000"));
      expect(await token.balanceOf(deployer.address)).to.eq(0n);
      expect(await token.balanceOf(pool.getAddress())).to.eq(ethers.parseEther("100000"));
      const expected = await pool
        .connect(market)
        .requestBonus.staticCall(token.getAddress(), deployer.address, ethers.parseEther("1"));
      expect(expected).to.eq(ethers.parseEther("0.05"));
      await expect(pool.connect(market).requestBonus(token.getAddress(), deployer.address, ethers.parseEther("1")))
        .to.emit(pool, "RequestBonus")
        .withArgs(market.address, await token.getAddress(), deployer.address, ethers.parseEther("1"), expected);
      expect(await token.balanceOf(deployer.address)).to.eq(ethers.parseEther("0.05"));
      expect(await token.balanceOf(pool.getAddress())).to.eq(ethers.parseEther("99999.95"));
    });

    it("should succeed when balance not enough", async () => {
      await pool.grantRole(id("MARKET_ROLE"), market.address);
      await pool.updateBonusRatio(token.getAddress(), ethers.parseEther("0.05"));
      await token.mint(pool.getAddress(), ethers.parseEther("0.04"));
      expect(await token.balanceOf(deployer.address)).to.eq(0n);
      expect(await token.balanceOf(pool.getAddress())).to.eq(ethers.parseEther("0.04"));
      const expected = await pool
        .connect(market)
        .requestBonus.staticCall(token.getAddress(), deployer.address, ethers.parseEther("1"));
      expect(expected).to.eq(ethers.parseEther("0.04"));
      await expect(pool.connect(market).requestBonus(token.getAddress(), deployer.address, ethers.parseEther("1")))
        .to.emit(pool, "RequestBonus")
        .withArgs(market.address, await token.getAddress(), deployer.address, ethers.parseEther("1"), expected);
      expect(await token.balanceOf(deployer.address)).to.eq(ethers.parseEther("0.04"));
      expect(await token.balanceOf(pool.getAddress())).to.eq(0n);
    });
  });
});

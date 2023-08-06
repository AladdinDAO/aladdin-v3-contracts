/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { MockERC20, PlatformFeeSpliter } from "../../typechain";

describe("PlatformFeeSpliter.spec", async () => {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let treasury: SignerWithAddress;
  let ecosystem: SignerWithAddress;
  let staker: SignerWithAddress;
  let locker: SignerWithAddress;
  let spliter: PlatformFeeSpliter;

  beforeEach(async () => {
    [deployer, alice, treasury, staker, ecosystem, locker] = await ethers.getSigners();

    const PlatformFeeSpliter = await ethers.getContractFactory("PlatformFeeSpliter", deployer);
    spliter = await PlatformFeeSpliter.deploy(treasury.address, ecosystem.address, staker.address);
    await spliter.deployed();

    expect(await spliter.staker()).to.eq(staker.address);
    expect(await spliter.treasury()).to.eq(treasury.address);
    expect(await spliter.ecosystem()).to.eq(ecosystem.address);
  });

  context("#updateTreasury", async () => {
    it("should revert, when call updateTreasury and caller is not owner", async () => {
      await expect(spliter.connect(alice).updateTreasury(constants.AddressZero)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when treasury is zero", async () => {
      await expect(spliter.updateTreasury(constants.AddressZero)).to.revertedWith(
        "treasury address should not be zero"
      );
    });

    it("should succeed", async () => {
      expect(await spliter.treasury()).to.eq(treasury.address);
      await expect(spliter.updateTreasury(alice.address)).to.emit(spliter, "UpdateTreasury").withArgs(alice.address);
      expect(await spliter.treasury()).to.eq(alice.address);
    });
  });

  context("#updateEcosystem", async () => {
    it("should revert, when call updateEcosystem and caller is not owner", async () => {
      await expect(spliter.connect(alice).updateEcosystem(constants.AddressZero)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when ecosystem is zero", async () => {
      await expect(spliter.updateEcosystem(constants.AddressZero)).to.revertedWith(
        "ecosystem address should not be zero"
      );
    });

    it("should succeed", async () => {
      expect(await spliter.ecosystem()).to.eq(ecosystem.address);
      await expect(spliter.updateEcosystem(alice.address)).to.emit(spliter, "UpdateEcosystem").withArgs(alice.address);
      expect(await spliter.ecosystem()).to.eq(alice.address);
    });
  });

  context("#updateStaker", async () => {
    it("should revert, when call updateStaker and caller is not owner", async () => {
      await expect(spliter.connect(alice).updateStaker(constants.AddressZero)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when staker is zero", async () => {
      await expect(spliter.updateStaker(constants.AddressZero)).to.revertedWith("staker address should not be zero");
    });

    it("should succeed", async () => {
      expect(await spliter.staker()).to.eq(staker.address);
      await expect(spliter.updateStaker(alice.address)).to.emit(spliter, "UpdateStaker").withArgs(alice.address);
      expect(await spliter.staker()).to.eq(alice.address);
    });
  });

  context("#addRewardToken", async () => {
    it("should revert, when call addRewardToken and caller is not owner", async () => {
      await expect(
        spliter.connect(alice).addRewardToken(constants.AddressZero, constants.AddressZero, 0, 0, 0)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert, when fee too large", async () => {
      await expect(spliter.addRewardToken(constants.AddressZero, constants.AddressZero, 1e9 + 1, 0, 0)).to.revertedWith(
        "staker ratio too large"
      );
      await expect(spliter.addRewardToken(constants.AddressZero, constants.AddressZero, 0, 1e9 + 1, 0)).to.revertedWith(
        "treasury ratio too large"
      );
      await expect(spliter.addRewardToken(constants.AddressZero, constants.AddressZero, 0, 0, 1e9 + 1)).to.revertedWith(
        "locker ratio too large"
      );
      await expect(
        spliter.addRewardToken(constants.AddressZero, constants.AddressZero, 5e8 + 1, 5e8, 0)
      ).to.revertedWith("ecosystem ratio too small");
    });

    it("should revert, when zero burner", async () => {
      await expect(spliter.addRewardToken(constants.AddressZero, constants.AddressZero, 0, 0, 0)).to.revertedWith(
        "burner address should not be zero"
      );
    });

    it("should revert, when duplicated token", async () => {
      await spliter.addRewardToken(constants.AddressZero, locker.address, 0, 0, 0);
      await expect(spliter.addRewardToken(constants.AddressZero, locker.address, 0, 0, 0)).to.revertedWith(
        "duplicated reward token"
      );
    });

    it("should succeed", async () => {
      expect(await spliter.getRewardCount()).to.eq(constants.Zero);
      await expect(spliter.addRewardToken(constants.AddressZero, locker.address, 1, 2, 3))
        .to.emit(spliter, "AddRewardToken")
        .withArgs(constants.AddressZero, locker.address, 1, 2, 3);
      expect(await spliter.getRewardCount()).to.eq(1);
      expect(await spliter.rewards(0)).to.deep.eq([constants.AddressZero, 1, 2, 3]);
      expect(await spliter.burners(constants.AddressZero)).to.eq(locker.address);
      await expect(spliter.addRewardToken(alice.address, locker.address, 3, 4, 5))
        .to.emit(spliter, "AddRewardToken")
        .withArgs(alice.address, locker.address, 3, 4, 5);
      expect(await spliter.getRewardCount()).to.eq(2);
      expect(await spliter.rewards(1)).to.deep.eq([alice.address, 3, 4, 5]);
      expect(await spliter.burners(alice.address)).to.eq(locker.address);
    });
  });

  context("removeRewardToken", async () => {
    beforeEach(async () => {
      await spliter.addRewardToken(constants.AddressZero, locker.address, 1, 2, 3);
      await spliter.addRewardToken(alice.address, locker.address, 3, 4, 5);
      await spliter.addRewardToken(staker.address, locker.address, 5, 6, 7);
    });

    it("should revert, when call removeRewardToken and caller is not owner", async () => {
      await expect(spliter.connect(alice).removeRewardToken(0)).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert, when index out of range", async () => {
      await expect(spliter.removeRewardToken(3)).to.revertedWith("index out of range");
    });

    it("should succeed, remove from last", async () => {
      expect(await spliter.getRewardCount()).to.eq(3);
      await expect(spliter.removeRewardToken(2)).to.emit(spliter, "RemoveRewardToken").withArgs(staker.address);
      expect(await spliter.rewards(0)).to.deep.eq([constants.AddressZero, 1, 2, 3]);
      expect(await spliter.rewards(1)).to.deep.eq([alice.address, 3, 4, 5]);
      expect(await spliter.getRewardCount()).to.eq(2);
      await expect(spliter.removeRewardToken(1)).to.emit(spliter, "RemoveRewardToken").withArgs(alice.address);
      expect(await spliter.rewards(0)).to.deep.eq([constants.AddressZero, 1, 2, 3]);
      expect(await spliter.getRewardCount()).to.eq(1);
      await expect(spliter.removeRewardToken(0)).to.emit(spliter, "RemoveRewardToken").withArgs(constants.AddressZero);
      expect(await spliter.getRewardCount()).to.eq(0);
    });

    it("should succeed, remove from first", async () => {
      expect(await spliter.getRewardCount()).to.eq(3);
      await expect(spliter.removeRewardToken(0)).to.emit(spliter, "RemoveRewardToken").withArgs(constants.AddressZero);
      expect(await spliter.rewards(0)).to.deep.eq([staker.address, 5, 6, 7]);
      expect(await spliter.rewards(1)).to.deep.eq([alice.address, 3, 4, 5]);
      expect(await spliter.getRewardCount()).to.eq(2);
      await expect(spliter.removeRewardToken(0)).to.emit(spliter, "RemoveRewardToken").withArgs(staker.address);
      expect(await spliter.rewards(0)).to.deep.eq([alice.address, 3, 4, 5]);
      expect(await spliter.getRewardCount()).to.eq(1);
      await expect(spliter.removeRewardToken(0)).to.emit(spliter, "RemoveRewardToken").withArgs(alice.address);
      expect(await spliter.getRewardCount()).to.eq(0);
    });
  });

  context("updateRewardTokenRatio", async () => {
    beforeEach(async () => {
      await spliter.addRewardToken(constants.AddressZero, locker.address, 1, 2, 3);
      await spliter.addRewardToken(alice.address, locker.address, 3, 4, 5);
      await spliter.addRewardToken(staker.address, locker.address, 5, 6, 7);
    });

    it("should revert, when call updateRewardTokenRatio and caller is not owner", async () => {
      await expect(spliter.connect(alice).updateRewardTokenRatio(0, 0, 0, 0)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when fee too large", async () => {
      await expect(spliter.updateRewardTokenRatio(0, 1e9 + 1, 0, 0)).to.revertedWith("staker ratio too large");
      await expect(spliter.updateRewardTokenRatio(0, 0, 1e9 + 1, 0)).to.revertedWith("treasury ratio too large");
      await expect(spliter.updateRewardTokenRatio(0, 0, 0, 1e9 + 1)).to.revertedWith("locker ratio too large");
      await expect(spliter.updateRewardTokenRatio(0, 5e8 + 1, 5e8, 0)).to.revertedWith("ecosystem ratio too small");
    });

    it("should revert, when index out of range", async () => {
      await expect(spliter.updateRewardTokenRatio(3, 0, 0, 0)).to.revertedWith("index out of range");
    });

    it("should succeed", async () => {
      expect(await spliter.rewards(0)).to.deep.eq([constants.AddressZero, 1, 2, 3]);
      await expect(spliter.updateRewardTokenRatio(0, 7, 8, 9))
        .to.emit(spliter, "UpdateRewardTokenRatio")
        .withArgs(constants.AddressZero, 7, 8, 9);
      expect(await spliter.rewards(0)).to.deep.eq([constants.AddressZero, 7, 8, 9]);

      expect(await spliter.rewards(1)).to.deep.eq([alice.address, 3, 4, 5]);
      await expect(spliter.updateRewardTokenRatio(1, 9, 10, 11))
        .to.emit(spliter, "UpdateRewardTokenRatio")
        .withArgs(alice.address, 9, 10, 11);
      expect(await spliter.rewards(1)).to.deep.eq([alice.address, 9, 10, 11]);

      expect(await spliter.rewards(2)).to.deep.eq([staker.address, 5, 6, 7]);
      await expect(spliter.updateRewardTokenRatio(2, 11, 12, 13))
        .to.emit(spliter, "UpdateRewardTokenRatio")
        .withArgs(staker.address, 11, 12, 13);
      expect(await spliter.rewards(2)).to.deep.eq([staker.address, 11, 12, 13]);
    });
  });

  context("updateRewardTokenBurner", async () => {
    beforeEach(async () => {
      await spliter.addRewardToken(alice.address, locker.address, 3, 4, 5);
    });

    it("should revert, when call updateRewardTokenBurner and caller is not owner", async () => {
      await expect(
        spliter.connect(alice).updateRewardTokenBurner(alice.address, constants.AddressZero)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert, when new burner is zero", async () => {
      await expect(spliter.updateRewardTokenBurner(alice.address, constants.AddressZero)).to.revertedWith(
        "new burner address should not be zero"
      );
    });

    it("should revert, when old burner is zero", async () => {
      await expect(spliter.updateRewardTokenBurner(constants.AddressZero, locker.address)).to.revertedWith(
        "old burner address should not be zero"
      );
    });

    it("should succeed", async () => {
      expect(await spliter.burners(alice.address)).to.eq(locker.address);
      await expect(spliter.updateRewardTokenBurner(alice.address, staker.address))
        .to.emit(spliter, "UpdateRewardTokenBurner")
        .withArgs(alice.address, staker.address);
      expect(await spliter.burners(alice.address)).to.eq(staker.address);
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

      await spliter.addRewardToken(token1.address, locker.address, 1e8, 2e8, 3e8);
    });

    it("should revert, when call claim and caller is not staker", async () => {
      await expect(spliter.claim()).to.revertedWith("not staker");
    });

    it("should succeed, when reward is single token", async () => {
      await token1.transfer(spliter.address, amount1);
      await spliter.connect(staker).claim();
      expect(await token1.balanceOf(staker.address)).to.eq(amount1.mul(1e8).div(1e9));
      expect(await token1.balanceOf(treasury.address)).to.eq(amount1.mul(2e8).div(1e9));
      expect(await token1.balanceOf(locker.address)).to.eq(amount1.mul(3e8).div(1e9));
      expect(await token1.balanceOf(ecosystem.address)).to.eq(amount1.mul(4e8).div(1e9));
    });

    it("should succeed, when reward is multiple tokens", async () => {
      await spliter.addRewardToken(token2.address, locker.address, 2e8, 3e8, 4e8);

      await token1.transfer(spliter.address, amount1);
      await token2.transfer(spliter.address, amount2);
      await spliter.connect(staker).claim();
      expect(await token1.balanceOf(staker.address)).to.eq(amount1.mul(1e8).div(1e9));
      expect(await token1.balanceOf(treasury.address)).to.eq(amount1.mul(2e8).div(1e9));
      expect(await token1.balanceOf(locker.address)).to.eq(amount1.mul(3e8).div(1e9));
      expect(await token1.balanceOf(ecosystem.address)).to.eq(amount1.mul(4e8).div(1e9));

      expect(await token2.balanceOf(staker.address)).to.eq(amount2.mul(2e8).div(1e9));
      expect(await token2.balanceOf(treasury.address)).to.eq(amount2.mul(3e8).div(1e9));
      expect(await token2.balanceOf(locker.address)).to.eq(amount2.mul(4e8).div(1e9));
      expect(await token2.balanceOf(ecosystem.address)).to.eq(amount2.mul(1e8).div(1e9));
    });
  });
});

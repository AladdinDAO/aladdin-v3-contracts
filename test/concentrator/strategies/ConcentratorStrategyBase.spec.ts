import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { MockConcentratorStrategy, MockERC20 } from "@/types/index";

describe("ConcentratorStrategyBase.spec", async () => {
  let deployer: HardhatEthersSigner;
  let operator: HardhatEthersSigner;

  let token: MockERC20;
  let strategy: MockConcentratorStrategy;

  beforeEach(async () => {
    [deployer, operator] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    token = await MockERC20.deploy("X", "Y", 18);

    const MockConcentratorStrategy = await ethers.getContractFactory("MockConcentratorStrategy", deployer);
    strategy = await MockConcentratorStrategy.deploy(operator.address, token.getAddress(), token.getAddress());
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      expect(await strategy.owner()).to.eq(deployer.address);
      await expect(strategy.rewards(0)).to.reverted;
      expect(await strategy.stash()).to.eq(ZeroAddress);
    });
  });

  context("#execute", async () => {
    it("should revert, when non-operator call execute", async () => {
      await expect(strategy.execute(ZeroAddress, 0, "0x")).to.revertedWithCustomError(strategy, "CallerIsNotOperator");
    });

    it("should succeed, when operator call", async () => {
      const [status, result] = await strategy
        .connect(operator)
        .execute.staticCall(token.getAddress(), 0, token.interface.encodeFunctionData("decimals"));
      await strategy.connect(operator).execute(token.getAddress(), 0, token.interface.encodeFunctionData("decimals"));
      expect(status).to.eq(true);
      const [decimal] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], result);
      expect(decimal).to.eq(18n);
    });
  });

  context("#updateRewards", async () => {
    it("should revert, when non-operator call updateRewards", async () => {
      await expect(strategy.updateRewards([])).to.revertedWithCustomError(strategy, "CallerIsNotOperator");
    });

    it("should revert, when zero token address", async () => {
      await expect(strategy.connect(operator).updateRewards([ZeroAddress])).to.revertedWithCustomError(
        strategy,
        "RewardTokenIsZero"
      );
    });

    it("should revert, when duplicated token", async () => {
      await expect(
        strategy.connect(operator).updateRewards([token.getAddress(), token.getAddress()])
      ).to.revertedWithCustomError(strategy, "DuplicatedRewardToken");
    });

    it("should succeed, when operator call", async () => {
      await expect(strategy.rewards(0)).to.reverted;
      await strategy.connect(operator).updateRewards([token.getAddress()]);
      expect(await strategy.rewards(0)).to.eq(await token.getAddress());
      await expect(strategy.rewards(1)).to.reverted;
    });
  });

  context("#deposit", async () => {
    it("should revert, when non-operator call deposit", async () => {
      await expect(strategy.deposit(deployer.address, 0)).to.revertedWithCustomError(strategy, "CallerIsNotOperator");
    });

    it("should succeed, when operator call deposit", async () => {
      await strategy.connect(operator).deposit(deployer.address, 0);
    });
  });

  context("#withdraw", async () => {
    it("should revert, when non-operator call withdraw", async () => {
      await expect(strategy.withdraw(deployer.address, 0)).to.revertedWithCustomError(strategy, "CallerIsNotOperator");
    });

    it("should succeed, when operator call withdraw", async () => {
      await strategy.connect(operator).withdraw(deployer.address, 0);
    });
  });

  context("#prepareMigrate", async () => {
    it("should revert, when non-operator call prepareMigrate", async () => {
      await expect(strategy.prepareMigrate(deployer.address)).to.revertedWithCustomError(
        strategy,
        "CallerIsNotOperator"
      );
    });

    it("should succeed, when operator call prepareMigrate", async () => {
      await strategy.connect(operator).prepareMigrate(deployer.address);
    });
  });

  context("#finishMigrate", async () => {
    it("should revert, when non-operator call finishMigrate", async () => {
      await expect(strategy.finishMigrate(deployer.address)).to.revertedWithCustomError(
        strategy,
        "CallerIsNotOperator"
      );
    });

    it("should succeed, when operator call finishMigrate", async () => {
      await strategy.connect(operator).finishMigrate(deployer.address);
    });
  });

  context("#sweepToken", async () => {
    it("should revert, when non-owner call sweepToken", async () => {
      await expect(strategy.connect(operator).sweepToken([])).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should succeed", async () => {
      await token.mint(strategy.getAddress(), 1000000n);
      await strategy.updateStash(deployer.address);
      expect(await token.balanceOf(deployer.address)).to.eq(0n);
      await strategy.sweepToken([await token.getAddress()]);
      expect(await token.balanceOf(deployer.address)).to.eq(1000000n);
    });
  });

  context("#updateStash", async () => {
    it("should revert, when non-owner call updateStash", async () => {
      await expect(strategy.connect(operator).updateStash(deployer.address)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should succeed", async () => {
      expect(await strategy.stash()).to.eq(ZeroAddress);
      await strategy.updateStash(deployer.address);
      expect(await strategy.stash()).to.eq(deployer.address);
    });
  });
});

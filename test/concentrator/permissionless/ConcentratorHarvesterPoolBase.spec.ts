import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, network } from "hardhat";
import { expect } from "chai";
import { MaxUint256, ZeroAddress, ZeroHash, toBigInt } from "ethers";

import {
  MockERC20,
  MockConcentratorHarvesterPool,
  MockConcentratorCompounderBase,
  MockConcentratorStrategy,
} from "@/types/index";

describe("ConcentratorHarvesterPoolBase.spec", async () => {
  const Week = 86400 * 7;

  let deployer: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
  let harvester: HardhatEthersSigner;
  let converter: HardhatEthersSigner;
  let holder0: HardhatEthersSigner;
  let holder1: HardhatEthersSigner;

  let stakingToken: MockERC20;
  let rewardToken: MockERC20;

  let compounderStrategy: MockConcentratorStrategy;
  let compounder: MockConcentratorCompounderBase;
  let poolStrategy: MockConcentratorStrategy;
  let pool: MockConcentratorHarvesterPool;

  beforeEach(async () => {
    [deployer, holder0, holder1, treasury, harvester, converter] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    const MockConcentratorStrategy = await ethers.getContractFactory("MockConcentratorStrategy", deployer);
    const MockConcentratorCompounderBase = await ethers.getContractFactory("MockConcentratorCompounderBase", deployer);
    const MockConcentratorHarvesterPool = await ethers.getContractFactory("MockConcentratorHarvesterPool", deployer);

    stakingToken = await MockERC20.deploy("Staking Token", "ST", 18);
    rewardToken = await MockERC20.deploy("Reward Token", "RT", 18);
    compounder = await MockConcentratorCompounderBase.deploy(Week, rewardToken.getAddress());
    compounderStrategy = await MockConcentratorStrategy.deploy(
      compounder.getAddress(),
      rewardToken.getAddress(),
      rewardToken.getAddress()
    );

    pool = await MockConcentratorHarvesterPool.deploy(Week);
    poolStrategy = await MockConcentratorStrategy.deploy(
      pool.getAddress(),
      stakingToken.getAddress(),
      rewardToken.getAddress()
    );

    await compounder.initialize(
      "X",
      "Y",
      deployer.address,
      deployer.address,
      deployer.address,
      compounderStrategy.getAddress()
    );
    await pool.initialize(
      compounder.getAddress(),
      stakingToken.getAddress(),
      treasury.address,
      harvester.address,
      converter.address,
      poolStrategy.getAddress()
    );
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      expect(await pool.stakingToken()).to.eq(await stakingToken.getAddress());
      expect(await pool.strategy()).to.eq(await poolStrategy.getAddress());
      expect(await pool.compounder()).to.eq(await compounder.getAddress());
      expect(await pool.isActive()).to.eq(true);

      // revert
      await expect(pool.reinitialize()).to.revertedWith("Initializable: contract is not initializing");
    });
  });

  context("auth", async () => {
    context("#updateIncentiveRatio", async () => {
      it("should revert, when non-admin call", async () => {
        await expect(pool.connect(holder0).updateIncentiveRatio(0n)).to.revertedWith(
          "AccessControl: account " + holder0.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert, when harvester ratio too large", async () => {
        await expect(pool.updateIncentiveRatio(1e8 + 1)).to.revertedWithCustomError(
          pool,
          "ErrorIncentiveRatioTooLarge"
        );
      });

      it("should succeed", async () => {
        expect(await pool.getIncentiveRatio()).to.eq(0n);
        await expect(pool.updateIncentiveRatio(1n)).to.emit(pool, "UpdateIncentiveRatio").withArgs(0n, 1n);
        expect(await pool.getIncentiveRatio()).to.eq(1n);
        await expect(pool.updateIncentiveRatio(100n)).to.emit(pool, "UpdateIncentiveRatio").withArgs(1n, 100n);
        expect(await pool.getIncentiveRatio()).to.eq(100n);
        await expect(pool.updateIncentiveRatio(1e7)).to.emit(pool, "UpdateIncentiveRatio").withArgs(100n, 1e7);
        expect(await pool.getIncentiveRatio()).to.eq(1e7);
        await expect(pool.updateIncentiveRatio(1e8)).to.emit(pool, "UpdateIncentiveRatio").withArgs(1e7, 1e8);
        expect(await pool.getIncentiveRatio()).to.eq(1e8);
      });
    });

    context("#updateClaimer", async () => {
      it("should revert, when non-admin call", async () => {
        await expect(pool.connect(holder0).updateClaimer(ZeroAddress)).to.revertedWith(
          "AccessControl: account " + holder0.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should succeed", async () => {
        expect(await pool.claimer()).to.eq(ZeroAddress);
        await expect(pool.updateClaimer(deployer.address))
          .to.emit(pool, "UpdateClaimer")
          .withArgs(ZeroAddress, deployer.address);
        expect(await pool.claimer()).to.eq(deployer.address);
      });
    });

    context("#setIsActive", async () => {
      it("should revert, when non-admin call", async () => {
        await expect(pool.connect(holder0).setIsActive(false)).to.revertedWith(
          "AccessControl: account " + holder0.address.toLowerCase() + " is missing role " + ZeroHash
        );
        await expect(pool.connect(holder0).setIsActive(true)).to.revertedWith(
          "AccessControl: account " + holder0.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should succeed", async () => {
        expect(await pool.isActive()).to.eq(true);
        await expect(pool.setIsActive(false)).to.emit(pool, "SetIsActive").withArgs(deployer.address, false);
        expect(await pool.isActive()).to.eq(false);
        await expect(pool.setIsActive(true)).to.emit(pool, "SetIsActive").withArgs(deployer.address, true);
        expect(await pool.isActive()).to.eq(true);
      });
    });

    context("#migrateStrategy", async () => {
      it("should revert, when non-admin call", async () => {
        await expect(pool.connect(holder0).migrateStrategy(ZeroAddress)).to.revertedWith(
          "AccessControl: account " + holder0.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert, when new strategy is zero", async () => {
        await expect(pool.migrateStrategy(ZeroAddress)).to.revertedWithCustomError(pool, "ErrorStrategyIsZero");
      });

      it("should succeed migrate all", async () => {
        const initialSupply = ethers.parseEther("10001");
        await stakingToken.mint(deployer.address, initialSupply);
        await stakingToken.approve(pool.getAddress(), initialSupply);
        await pool["deposit(uint256)"](initialSupply);

        const MockConcentratorStrategy = await ethers.getContractFactory("MockConcentratorStrategy", deployer);
        const newStrategy = await MockConcentratorStrategy.deploy(
          pool.getAddress(),
          stakingToken.getAddress(),
          rewardToken.getAddress()
        );
        await expect(pool.migrateStrategy(newStrategy.getAddress()))
          .to.emit(pool, "Migrate")
          .withArgs(await poolStrategy.getAddress(), await newStrategy.getAddress());
        expect(await pool.strategy()).to.eq(await newStrategy.getAddress());
        expect(await stakingToken.balanceOf(newStrategy.getAddress())).to.eq(initialSupply);
      });
    });

    context("#takeWithdrawFee", async () => {
      it("should revert, when non-admin call", async () => {
        await expect(pool.connect(holder0).takeWithdrawFee(ZeroAddress)).to.revertedWith(
          "AccessControl: account " + holder0.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should succeed", async () => {
        await pool.updateWithdrawFeePercentage(1e8); // 10%
        await stakingToken.mint(deployer.address, 100000);
        await stakingToken.approve(pool.getAddress(), 100000);
        await pool["deposit(uint256)"](100000);

        expect(await pool.withdrawFeeAccumulated()).to.eq(0);
        await pool["withdraw(uint256)"](100000);
        expect(await pool.withdrawFeeAccumulated()).to.eq(10000);
        expect(await stakingToken.balanceOf(holder0.address)).to.eq(0);
        await expect(pool.takeWithdrawFee(holder0.address))
          .to.emit(pool, "TakeWithdrawFee")
          .withArgs(deployer.address, holder0.address, 10000);
        expect(await pool.withdrawFeeAccumulated()).to.eq(0);
        expect(await stakingToken.balanceOf(holder0.address)).to.eq(10000);
      });
    });
  });

  context("reentrant", async () => {
    it("should prevent reentrant on deposit", async () => {
      await expect(
        pool.reentrant(pool.getAddress(), pool.interface.encodeFunctionData("deposit(uint256)", [0n]))
      ).to.revertedWith("ReentrancyGuard: reentrant call");
      await expect(
        pool.reentrant(
          pool.getAddress(),
          pool.interface.encodeFunctionData("deposit(uint256,address)", [0n, ZeroAddress])
        )
      ).to.revertedWith("ReentrancyGuard: reentrant call");
      await expect(
        pool.reentrant(
          pool.getAddress(),
          pool.interface.encodeFunctionData("deposit(uint256,address,bool)", [0n, ZeroAddress, false])
        )
      ).to.revertedWith("ReentrancyGuard: reentrant call");
    });

    it("should prevent reentrant on withdraw", async () => {
      await expect(
        pool.reentrant(pool.getAddress(), pool.interface.encodeFunctionData("withdraw(uint256)", [0n]))
      ).to.revertedWith("ReentrancyGuard: reentrant call");
      await expect(
        pool.reentrant(
          pool.getAddress(),
          pool.interface.encodeFunctionData("withdraw(uint256,address)", [0n, ZeroAddress])
        )
      ).to.revertedWith("ReentrancyGuard: reentrant call");
    });

    it("should prevent reentrant on harvest", async () => {
      await pool.updateHarvester(ZeroAddress);
      await expect(
        pool.reentrant(pool.getAddress(), pool.interface.encodeFunctionData("harvest", [ZeroAddress, 0n]))
      ).to.revertedWith("ReentrancyGuard: reentrant call");
    });

    it("should prevent reentrant on claimFor", async () => {
      await expect(
        pool.reentrant(pool.getAddress(), pool.interface.encodeFunctionData("claimFor", [ZeroAddress, ZeroAddress]))
      ).to.revertedWith("ReentrancyGuard: reentrant call");
    });

    it("should prevent reentrant on transfer", async () => {
      await expect(
        pool.reentrant(pool.getAddress(), pool.interface.encodeFunctionData("transfer", [deployer.address, 0n]))
      ).to.revertedWith("ReentrancyGuard: reentrant call");
    });

    it("should prevent reentrant on transferFrom", async () => {
      await expect(
        pool.reentrant(
          pool.getAddress(),
          pool.interface.encodeFunctionData("transferFrom", [deployer.address, deployer.address, 0n])
        )
      ).to.revertedWith("ReentrancyGuard: reentrant call");
    });
  });

  context("deposit no incentive", async () => {
    beforeEach(async () => {
      await stakingToken.mint(deployer.address, ethers.parseEther("100000"));
      await stakingToken.mint(holder0.address, ethers.parseEther("100000"));
      await stakingToken.mint(holder1.address, ethers.parseEther("100000"));
    });

    it("should revert when deposit zero amount", async () => {
      await expect(pool["deposit(uint256)"](0n)).to.revertedWithCustomError(pool, "ErrorDepositZeroAssets");
      await expect(pool["deposit(uint256,address)"](0n, deployer.address)).to.revertedWithCustomError(
        pool,
        "ErrorDepositZeroAssets"
      );
      await expect(pool["deposit(uint256,address,bool)"](0n, deployer.address, false)).to.revertedWithCustomError(
        pool,
        "ErrorDepositZeroAssets"
      );
      await expect(pool["deposit(uint256,address,bool)"](0n, deployer.address, true)).to.revertedWithCustomError(
        pool,
        "ErrorDepositZeroAssets"
      );
    });

    it("should revert, when no active", async () => {
      await pool.setIsActive(false);
      await expect(pool["deposit(uint256)"](0n)).to.revertedWithCustomError(pool, "ErrorPoolNotActive");
      await expect(pool["deposit(uint256,address)"](0n, deployer.address)).to.revertedWithCustomError(
        pool,
        "ErrorPoolNotActive"
      );
      await expect(pool["deposit(uint256,address,bool)"](0n, deployer.address, false)).to.revertedWithCustomError(
        pool,
        "ErrorPoolNotActive"
      );
      await expect(pool["deposit(uint256,address,bool)"](0n, deployer.address, true)).to.revertedWithCustomError(
        pool,
        "ErrorPoolNotActive"
      );
    });

    it("should succeed when deposit to self", async () => {
      const amount = ethers.parseEther("100");
      await stakingToken.connect(holder0).approve(pool.getAddress(), amount);
      const balanceBefore = await pool.balanceOf(holder0.address);
      const supplyBefore = await pool.totalSupply();
      await expect(pool.connect(holder0)["deposit(uint256)"](amount))
        .to.emit(pool, "Deposit")
        .withArgs(holder0.address, holder0.address, amount);
      expect(await pool.balanceOf(holder0.address)).to.eq(amount + balanceBefore);
      expect(await pool.totalSupply()).to.eq(amount + supplyBefore);
      expect(await stakingToken.balanceOf(poolStrategy.getAddress())).to.eq(await pool.totalSupply());
    });

    it("should succeed when deposit to other", async () => {
      const amount = ethers.parseEther("100");
      await stakingToken.connect(holder0).approve(pool.getAddress(), amount);
      const balanceBefore = await pool.balanceOf(holder1.address);
      const supplyBefore = await pool.totalSupply();
      await expect(pool.connect(holder0)["deposit(uint256,address)"](amount, holder1.address))
        .to.emit(pool, "Deposit")
        .withArgs(holder0.address, holder1.address, amount);
      expect(await pool.balanceOf(holder1.address)).to.eq(amount + balanceBefore);
      expect(await pool.totalSupply()).to.eq(amount + supplyBefore);
      expect(await stakingToken.balanceOf(poolStrategy.getAddress())).to.eq(await pool.totalSupply());
    });

    it("should succeed when deposit all to self", async () => {
      const amount = await stakingToken.balanceOf(holder0.address);
      await stakingToken.connect(holder0).approve(pool.getAddress(), amount);
      const balanceBefore = await pool.balanceOf(holder0.address);
      const supplyBefore = await pool.totalSupply();
      await expect(pool.connect(holder0)["deposit(uint256)"](MaxUint256))
        .to.emit(pool, "Deposit")
        .withArgs(holder0.address, holder0.address, amount);
      expect(await pool.balanceOf(holder0.address)).to.eq(amount + balanceBefore);
      expect(await pool.totalSupply()).to.eq(amount + supplyBefore);
      expect(await stakingToken.balanceOf(poolStrategy.getAddress())).to.eq(await pool.totalSupply());
    });

    it("should succeed when deposit multiple times", async () => {
      const amount = ethers.parseEther("100");
      await stakingToken.connect(holder0).approve(pool.getAddress(), MaxUint256);
      const holder0BalanceBefore = await pool.balanceOf(holder0.address);
      const supplyBefore = await pool.totalSupply();
      await expect(pool.connect(holder0)["deposit(uint256,address,bool)"](amount, holder0.address, false))
        .to.emit(pool, "Deposit")
        .withArgs(holder0.address, holder0.address, amount);
      expect(await pool.balanceOf(holder0.address)).to.eq(amount + holder0BalanceBefore);
      expect(await pool.totalSupply()).to.eq(amount + supplyBefore);

      const holder1BalanceBefore = await pool.balanceOf(holder1.address);
      await expect(pool.connect(holder0)["deposit(uint256,address,bool)"](amount, holder1.address, true))
        .to.emit(pool, "Deposit")
        .withArgs(holder0.address, holder1.address, amount);
      expect(await pool.balanceOf(holder1.address)).to.eq(amount + holder1BalanceBefore);
      expect(await pool.totalSupply()).to.eq(amount * 2n + supplyBefore);
      expect(await stakingToken.balanceOf(poolStrategy.getAddress())).to.eq(await pool.totalSupply());
    });
  });

  context("deposit with incentive", async () => {
    beforeEach(async () => {
      await stakingToken.mint(holder0.address, ethers.parseEther("100000"));
      await stakingToken.mint(holder1.address, ethers.parseEther("100000"));
    });

    it("should succeed", async () => {
      await pool.updateIncentiveRatio(1e8);

      const amount = ethers.parseEther("100");
      await stakingToken.connect(holder0).approve(pool.getAddress(), MaxUint256);
      await stakingToken.connect(holder1).approve(pool.getAddress(), MaxUint256);

      await expect(pool.connect(holder0)["deposit(uint256,address,bool)"](amount, holder0.address, false))
        .to.emit(pool, "Deposit")
        .withArgs(holder0.address, holder0.address, (amount * 9n) / 10n)
        .to.not.emit(poolStrategy, "Deposit");
      expect(await pool.totalSupply()).to.eq((amount * 9n) / 10n);
      expect(await pool.balanceOf(holder0.address)).to.eq((amount * 9n) / 10n);
      expect(await stakingToken.balanceOf(poolStrategy.getAddress())).to.eq(amount);

      await expect(pool.connect(holder1)["deposit(uint256,address,bool)"](amount, holder1.address, true))
        .to.emit(pool, "Deposit")
        .withArgs(holder1.address, holder1.address, (amount * 11n) / 10n)
        .to.emit(poolStrategy, "Deposit")
        .withArgs(await pool.getAddress(), amount * 2n);
      expect(await pool.totalSupply()).to.eq(amount * 2n);
      expect(await pool.balanceOf(holder1.address)).to.eq((amount * 11n) / 10n);
      expect(await stakingToken.balanceOf(poolStrategy.getAddress())).to.eq(await pool.totalSupply());
    });
  });

  context("withdraw no fee", async () => {
    const depositAmount = ethers.parseEther("100");

    beforeEach(async () => {
      await stakingToken.mint(holder0.address, depositAmount);
      await stakingToken.connect(holder0).approve(pool.getAddress(), MaxUint256);
      await pool.connect(holder0)["deposit(uint256)"](depositAmount);
    });

    it("should revert when withdraw zero amount", async () => {
      await expect(pool.connect(holder0)["withdraw(uint256)"](0)).to.revertedWithCustomError(
        pool,
        "ErrorWithdrawZeroAssets"
      );
      await expect(pool.connect(holder0)["withdraw(uint256,address)"](0, deployer.address)).to.revertedWithCustomError(
        pool,
        "ErrorWithdrawZeroAssets"
      );
      await expect(
        pool.connect(holder0)["withdraw(uint256,address,address)"](0, deployer.address, deployer.address)
      ).to.revertedWithCustomError(pool, "ErrorWithdrawZeroAssets");
    });

    it("should revert when withdraw exceed balance", async () => {
      await expect(pool.connect(holder0)["withdraw(uint256)"](depositAmount + 1n)).to.revertedWith(
        "ERC20: burn amount exceeds balance"
      );
    });

    it("should succeed, when withdraw 10 to self", async () => {
      const amountOut = ethers.parseEther("10");
      const supplyBefore = await pool.totalSupply();
      const poolBalanceBefore = await pool.balanceOf(holder0.address);
      const tokenBalanceBefore = await stakingToken.balanceOf(holder0.address);
      await expect(pool.connect(holder0)["withdraw(uint256)"](amountOut))
        .to.emit(pool, "Withdraw")
        .withArgs(holder0.address, holder0.address, holder0.address, amountOut, 0n);
      expect(await stakingToken.balanceOf(holder0.address)).to.eq(tokenBalanceBefore + amountOut);
      expect(await pool.totalSupply()).to.eq(supplyBefore - amountOut);
      expect(await pool.balanceOf(holder0.address)).to.eq(poolBalanceBefore - amountOut);
      expect(await stakingToken.balanceOf(poolStrategy.getAddress())).to.eq(await pool.totalSupply());
    });

    it("should succeed, when withdraw 10 to other", async () => {
      const amountOut = ethers.parseEther("10");
      const supplyBefore = await pool.totalSupply();
      const poolBalanceBefore = await pool.balanceOf(holder0.address);
      const tokenBalanceBefore = await stakingToken.balanceOf(holder1.address);
      await expect(pool.connect(holder0)["withdraw(uint256,address)"](amountOut, holder1.address))
        .to.emit(pool, "Withdraw")
        .withArgs(holder0.address, holder1.address, holder0.address, amountOut, 0n);
      expect(await stakingToken.balanceOf(holder1.address)).to.eq(tokenBalanceBefore + amountOut);
      expect(await pool.totalSupply()).to.eq(supplyBefore - amountOut);
      expect(await pool.balanceOf(holder0.address)).to.eq(poolBalanceBefore - amountOut);
      expect(await stakingToken.balanceOf(poolStrategy.getAddress())).to.eq(await pool.totalSupply());
    });

    it("should succeed, when withdraw all to self", async () => {
      const amountOut = await pool.balanceOf(holder0.address);
      const supplyBefore = await pool.totalSupply();
      const poolBalanceBefore = await pool.balanceOf(holder0.address);
      const tokenBalanceBefore = await stakingToken.balanceOf(holder0.address);
      await expect(
        pool.connect(holder0)["withdraw(uint256,address,address)"](MaxUint256, holder0.address, holder0.address)
      )
        .to.emit(pool, "Withdraw")
        .withArgs(holder0.address, holder0.address, holder0.address, amountOut, 0n);
      expect(await stakingToken.balanceOf(holder0.address)).to.eq(tokenBalanceBefore + amountOut);
      expect(await pool.totalSupply()).to.eq(supplyBefore - amountOut);
      expect(await pool.balanceOf(holder0.address)).to.eq(poolBalanceBefore - amountOut);
      expect(await stakingToken.balanceOf(poolStrategy.getAddress())).to.eq(await pool.totalSupply());
    });

    it("should revert, when withdraw from other and no approve", async () => {
      const amountOut = ethers.parseEther("10");
      await expect(
        pool.connect(holder1)["withdraw(uint256,address,address)"](amountOut, holder1.address, holder0.address)
      ).to.revertedWith("ERC20: insufficient allowance");
    });

    it("should succeed, when withdraw from other and with approve", async () => {
      const amountOut = ethers.parseEther("10");
      await pool.connect(holder0).approve(deployer.address, amountOut);

      const supplyBefore = await pool.totalSupply();
      const poolBalanceBefore = await pool.balanceOf(holder0.address);
      const tokenBalanceBefore = await stakingToken.balanceOf(holder1.address);
      await expect(
        pool.connect(deployer)["withdraw(uint256,address,address)"](amountOut, holder1.address, holder0.address)
      )
        .to.emit(pool, "Withdraw")
        .withArgs(deployer.address, holder1.address, holder0.address, amountOut, 0n);
      expect(await stakingToken.balanceOf(holder1.address)).to.eq(tokenBalanceBefore + amountOut);
      expect(await pool.totalSupply()).to.eq(supplyBefore - amountOut);
      expect(await pool.balanceOf(holder0.address)).to.eq(poolBalanceBefore - amountOut);
      expect(await stakingToken.balanceOf(poolStrategy.getAddress())).to.eq(await pool.totalSupply());
    });
  });

  context("withdraw with 10% fee", async () => {
    const depositAmount = ethers.parseEther("100");

    beforeEach(async () => {
      await stakingToken.mint(holder0.address, depositAmount);
      await stakingToken.connect(holder0).approve(pool.getAddress(), MaxUint256);
      await pool.connect(holder0)["deposit(uint256)"](depositAmount);
      await pool.updateWithdrawFeePercentage(1e8);
    });

    it("should succeed", async () => {
      const amountOut = ethers.parseEther("10");
      const supplyBefore = await pool.totalSupply();
      const poolBalanceBefore = await pool.balanceOf(holder0.address);
      const tokenBalanceBefore = await stakingToken.balanceOf(holder0.address);
      expect(await pool.withdrawFeeAccumulated()).to.eq(0n);
      await expect(pool.connect(holder0)["withdraw(uint256)"](amountOut))
        .to.emit(pool, "Withdraw")
        .withArgs(holder0.address, holder0.address, holder0.address, amountOut, amountOut / 10n);
      expect(await stakingToken.balanceOf(holder0.address)).to.eq(tokenBalanceBefore + (amountOut * 9n) / 10n);
      expect(await pool.totalSupply()).to.eq(supplyBefore - amountOut);
      expect(await pool.balanceOf(holder0.address)).to.eq(poolBalanceBefore - amountOut);
      expect(await stakingToken.balanceOf(poolStrategy.getAddress())).to.eq(
        (await pool.totalSupply()) + amountOut / 10n
      );
      expect(await pool.withdrawFeeAccumulated()).to.eq(amountOut / 10n);
    });
  });

  for (const expenseRatio of [0n, 100000000n]) {
    for (const harvesterRatio of [0n, 10000000n]) {
      const harvested = ethers.parseEther("1000");
      const message = `harvest with expenseRatio[${ethers.formatUnits(
        expenseRatio,
        7
      )}%] harvestBounty[${ethers.formatUnits(harvesterRatio, 7)}%]`;
      context(message, async () => {
        beforeEach(async () => {
          await pool.updateExpenseRatio(expenseRatio);
          await pool.updateHarvesterRatio(harvesterRatio);

          await stakingToken.mint(deployer.address, ethers.parseEther("10000"));
          await stakingToken.approve(pool.getAddress(), MaxUint256);
          await pool["deposit(uint256)"](ethers.parseEther("10000"));
        });

        it("should revert, when caller is not harvester", async () => {
          await expect(pool.harvest(deployer.address, 0)).to.revertedWithCustomError(pool, "CallerIsNotHarvester");
        });

        it("should revert, when InsufficientHarvestedAssets", async () => {
          await rewardToken.connect(deployer).approve(poolStrategy.getAddress(), MaxUint256);
          await rewardToken.mint(deployer.address, harvested);
          await poolStrategy.connect(deployer).setHarvested(harvested);
          await expect(pool.connect(harvester).harvest(deployer.address, harvested + 1n)).to.revertedWithCustomError(
            pool,
            "ErrorInsufficientHarvestedAssets"
          );
        });

        it("should succeed", async () => {
          await rewardToken.connect(deployer).approve(poolStrategy.getAddress(), MaxUint256);
          await rewardToken.mint(deployer.address, harvested);
          await poolStrategy.connect(deployer).setHarvested(harvested);
          expect((await pool.rewardData()).rate).to.eq(0n);
          await expect(pool.connect(harvester).harvest(deployer.address, 0n))
            .to.emit(pool, "Harvest")
            .withArgs(
              harvester.address,
              deployer.address,
              harvested,
              (harvested * expenseRatio) / 1000000000n,
              (harvested * harvesterRatio) / 1000000000n
            );
          expect(await compounder.balanceOf(treasury.address)).to.eq((harvested * expenseRatio) / 1000000000n);
          expect(await compounder.balanceOf(deployer.address)).to.eq((harvested * harvesterRatio) / 1000000000n);
          const real =
            harvested - (harvested * expenseRatio) / 1000000000n - (harvested * harvesterRatio) / 1000000000n;
          expect((await pool.rewardData()).rate).to.eq(real / toBigInt(Week));
        });
      });
    }
  }

  context("claimFor", async () => {
    it("should revert, when caller is not claimer", async () => {
      await expect(pool.claimFor(deployer.address, holder0.address)).to.revertedWithCustomError(
        pool,
        "ErrorCallerNotClaimer"
      );
    });

    it("should succeed, when caller is claimer", async () => {
      await pool.updateClaimer(deployer.address);
      await stakingToken.mint(holder0.address, ethers.parseEther("10000"));
      await stakingToken.connect(holder0).approve(pool.getAddress(), MaxUint256);
      await pool.connect(holder0)["deposit(uint256)"](ethers.parseEther("10000"));
      await rewardToken.connect(deployer).approve(poolStrategy.getAddress(), MaxUint256);
      await rewardToken.mint(deployer.address, ethers.parseEther("10000"));
      await poolStrategy.connect(deployer).setHarvested(ethers.parseEther("10000"));
      await pool.connect(harvester).harvest(deployer.address, 0n);

      // 3 day passes
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 3]);
      await pool.checkpoint(holder0.address);

      expect(await compounder.balanceOf(holder1)).to.eq(0n);
      expect(await compounder.balanceOf(holder0)).to.eq(0n);
      expect(await compounder.balanceOf(deployer)).to.eq(0n);
      expect(await pool.claimable(holder0.address)).to.closeTo(
        (ethers.parseEther("10000") * 3n) / 7n,
        ethers.parseEther("0.1")
      );
      await expect(pool.connect(deployer).claimFor(holder0.address, holder1.address)).to.emit(pool, "Claim");
      expect(await compounder.balanceOf(deployer)).to.eq(0n);
      expect(await compounder.balanceOf(holder0)).to.eq(0n);
      expect(await pool.claimable(holder0.address)).to.eq(0n);
      expect(await compounder.balanceOf(holder1)).to.closeTo(
        (ethers.parseEther("10000") * 3n) / 7n,
        ethers.parseEther("0.1")
      );
    });
  });
});

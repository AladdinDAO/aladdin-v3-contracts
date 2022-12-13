/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers, network } from "hardhat";
import { TOKENS, AVAILABLE_VAULTS, ZAP_ROUTES } from "../../scripts/utils";
import {
  AladdinZap,
  ManualCompoundingConvexCurveStrategy,
  IConvexBasicRewards,
  IConvexBooster,
  MockERC20,
} from "../../typechain";
import { MockConcentratorGeneralVault } from "../../typechain/contracts/mocks/MockConcentratorGeneralVault";
import { request_fork } from "../utils";

const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";

const WITHDRAW_FEE_TYPE_0 = "0x60ab53277c3a52d5a874e834fdb46bbc0453d713a3e6c569f39b35c068662ea8";
const WITHDRAW_FEE_TYPE_1 = "0x60ab53277c3a52d5a874e834fdb46bbc0453d713a3e6c569f39b35c068662ea9";
const WITHDRAW_FEE_TYPE_2 = "0x60ab53277c3a52d5a874e834fdb46bbc0453d713a3e6c569f39b35c068662eaa";

const UNDERLYING: {
  [name: string]: {
    fork: number;
    deployer: string;
    token: string;
    pool: string;
    rewarder: string;
    holder: string;
    amount: string;
    rewards: string[];
    intermediates: string[];
  };
} = {
  frxeth: {
    fork: 16124420,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    token: "0xf43211935C781D5ca1a41d2041F397B8A7366C7A",
    pool: "0xa1F8A6807c402E4A15ef4EBa36528A3FED24E577",
    rewarder: "0xbD5445402B0a287cbC77cb67B2a52e2FC635dce4",
    holder: "0xadd85e4abbb426e895f35e0a2576e22a9bbb7a57",
    amount: "10",
    rewards: ["CVX", "CRV"],
    intermediates: ["CRV", "FXS", "WETH"],
  },
  cvxfxs: {
    fork: 16124420,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    token: "0xF3A43307DcAFa93275993862Aae628fCB50dC768",
    pool: "0xd658A338613198204DCa1143Ac3F01A722b5d94A",
    rewarder: "0xf27AFAD0142393e4b3E5510aBc5fe3743Ad669Cb",
    holder: "0xdc88d12721f9ca1404e9e6e6389ae0abdd54fc6c",
    amount: "1000",
    rewards: ["CVX", "CRV", "FXS"],
    intermediates: ["CRV", "WETH", "FXS"],
  },
};

describe("ConcentratorGeneralVault.ConvexCurve.spec", async () => {
  context("auth", async () => {
    let deployer: SignerWithAddress;
    let operator: SignerWithAddress;
    let vault: MockConcentratorGeneralVault;
    let strategy: ManualCompoundingConvexCurveStrategy;
    let token: MockERC20;

    beforeEach(async () => {
      [deployer, operator] = await ethers.getSigners();

      const MockConcentratorGeneralVault = await ethers.getContractFactory("MockConcentratorGeneralVault", deployer);
      vault = await MockConcentratorGeneralVault.deploy();
      await vault.deployed();

      await vault.initialize(deployer.address, deployer.address, deployer.address);

      const ManualCompoundingConvexCurveStrategy = await ethers.getContractFactory(
        "ManualCompoundingConvexCurveStrategy",
        deployer
      );
      strategy = await ManualCompoundingConvexCurveStrategy.deploy();
      await strategy.deployed();

      const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
      token = await MockERC20.deploy("x", "y", 18);
      await token.deployed();

      const MockConvexBasicRewards = await ethers.getContractFactory("MockConvexBasicRewards", deployer);
      const rewarder = await MockConvexBasicRewards.deploy(1, token.address);
      await rewarder.deployed();

      await strategy.initialize(vault.address, token.address, rewarder.address, []);

      expect(await strategy.name()).to.eq("ManualCompoundingConvexCurve");
    });

    it("should revert, when initialize again", async () => {
      await expect(vault.initialize(deployer.address, deployer.address, deployer.address)).to.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    context("#updatePoolFeeRatio", async () => {
      beforeEach(async () => {
        await vault.addPool(token.address, strategy.address, 1, 2, 3);
      });

      it("should revert, when non-owner call updatePoolFeeRatio", async () => {
        await expect(vault.connect(operator).updatePoolFeeRatio(0, 2, 3, 4)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when pool not exist", async () => {
        await expect(vault.updatePoolFeeRatio(1, 0, 0, 0)).to.revertedWith("Concentrator: pool not exist");
      });

      it("should revert, when fee too large", async () => {
        await expect(vault.updatePoolFeeRatio(0, 1e8 + 1, 0, 0)).to.revertedWith(
          "Concentrator: withdraw fee too large"
        );
        await expect(vault.updatePoolFeeRatio(0, 0, 2e8 + 1, 0)).to.revertedWith(
          "Concentrator: platform fee too large"
        );
        await expect(vault.updatePoolFeeRatio(0, 0, 0, 1e8 + 1)).to.revertedWith(
          "Concentrator: harvest bounty too large"
        );
      });

      it("should succeed, when owner call", async () => {
        expect((await vault.poolInfo(0)).fee.withdrawFeeRatio).to.eq(1);
        expect((await vault.poolInfo(0)).fee.platformFeeRatio).to.eq(2);
        expect((await vault.poolInfo(0)).fee.harvestBountyRatio).to.eq(3);
        await expect(vault.updatePoolFeeRatio(0, 1e8, 2e8, 1e8))
          .to.emit(vault, "UpdatePoolFeeRatio")
          .withArgs(0, 1e8, 2e8, 1e8);
        expect((await vault.poolInfo(0)).fee.withdrawFeeRatio).to.eq(1e8);
        expect((await vault.poolInfo(0)).fee.platformFeeRatio).to.eq(2e8);
        expect((await vault.poolInfo(0)).fee.harvestBountyRatio).to.eq(1e8);
      });
    });

    context("#setWithdrawFeeForUser", async () => {
      beforeEach(async () => {
        await vault.addPool(token.address, strategy.address, 1, 2, 3); // 0
        await vault.addPool(token.address, strategy.address, 4, 5, 6); // 1
        await vault.addPool(token.address, strategy.address, 7, 8, 9); // 2
      });

      it("should revert, when non-owner call setWithdrawFeeForUser", async () => {
        await expect(vault.connect(operator).setWithdrawFeeForUser(0, deployer.address, 0)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when pool not exist", async () => {
        await expect(vault.setWithdrawFeeForUser(3, deployer.address, 0)).to.revertedWith(
          "Concentrator: pool not exist"
        );
      });

      it("should revert, when fee too large", async () => {
        await expect(vault.setWithdrawFeeForUser(0, deployer.address, 1e8 + 1)).to.revertedWith(
          "Concentrator: withdraw fee too large"
        );
        await expect(vault.setWithdrawFeeForUser(1, deployer.address, 1e8 + 1)).to.revertedWith(
          "Concentrator: withdraw fee too large"
        );
        await expect(vault.setWithdrawFeeForUser(2, deployer.address, 1e8 + 1)).to.revertedWith(
          "Concentrator: withdraw fee too large"
        );
      });

      it("should succeed, when owner call", async () => {
        expect(await vault.getFeeRate(WITHDRAW_FEE_TYPE_0, deployer.address)).to.eq(1);
        expect(await vault.getFeeRate(WITHDRAW_FEE_TYPE_1, deployer.address)).to.eq(4);
        expect(await vault.getFeeRate(WITHDRAW_FEE_TYPE_2, deployer.address)).to.eq(7);

        await expect(vault.setWithdrawFeeForUser(0, deployer.address, 11))
          .to.emit(vault, "CustomizeFee")
          .withArgs(WITHDRAW_FEE_TYPE_0, deployer.address, 11);
        await expect(vault.setWithdrawFeeForUser(1, deployer.address, 14))
          .to.emit(vault, "CustomizeFee")
          .withArgs(WITHDRAW_FEE_TYPE_1, deployer.address, 14);
        await expect(vault.setWithdrawFeeForUser(2, deployer.address, 17))
          .to.emit(vault, "CustomizeFee")
          .withArgs(WITHDRAW_FEE_TYPE_2, deployer.address, 17);

        expect(await vault.getFeeRate(WITHDRAW_FEE_TYPE_0, deployer.address)).to.eq(11);
        expect(await vault.getFeeRate(WITHDRAW_FEE_TYPE_1, deployer.address)).to.eq(14);
        expect(await vault.getFeeRate(WITHDRAW_FEE_TYPE_2, deployer.address)).to.eq(17);
      });
    });

    context("#updatePlatform", async () => {
      it("should revert, when non-owner call updatePlatform", async () => {
        await expect(vault.connect(operator).updatePlatform(deployer.address)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed, when owner call updatePlatform", async () => {
        expect(await vault.platform()).to.eq(deployer.address);
        await expect(vault.updatePlatform(operator.address))
          .to.emit(vault, "UpdatePlatform")
          .withArgs(operator.address);
        expect(await vault.platform()).to.eq(operator.address);
      });
    });

    context("#updateZap", async () => {
      it("should revert, when non-owner call updateZap", async () => {
        await expect(vault.connect(operator).updateZap(deployer.address)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed, when owner call updateZap", async () => {
        expect(await vault.zap()).to.eq(deployer.address);
        await expect(vault.updateZap(operator.address)).to.emit(vault, "UpdateZap").withArgs(operator.address);
        expect(await vault.zap()).to.eq(operator.address);
      });
    });

    context("#addPool", async () => {
      it("should revert, when non-owner call execute", async () => {
        await expect(
          vault.connect(operator).addPool(constants.AddressZero, constants.AddressZero, 0, 0, 0)
        ).to.revertedWith("Ownable: caller is not the owner");
      });

      it("should succeed, when owner call", async () => {
        expect(await vault.poolLength()).to.eq(0);
        await expect(vault.addPool(token.address, strategy.address, 1, 2, 3))
          .to.emit(vault, "AddPool")
          .withArgs(0, token.address, strategy.address);
        expect(await vault.poolLength()).to.eq(1);
        expect((await vault.poolInfo(0)).strategy.strategy).to.eq(strategy.address);
        expect((await vault.poolInfo(0)).strategy.token).to.eq(token.address);
        expect((await vault.poolInfo(0)).strategy.pauseDeposit).to.eq(false);
        expect((await vault.poolInfo(0)).strategy.pauseWithdraw).to.eq(false);
        expect((await vault.poolInfo(0)).fee.withdrawFeeRatio).to.eq(1);
        expect((await vault.poolInfo(0)).fee.platformFeeRatio).to.eq(2);
        expect((await vault.poolInfo(0)).fee.harvestBountyRatio).to.eq(3);
      });
    });

    context("#updateRewardPeriod", async () => {
      beforeEach(async () => {
        await vault.addPool(token.address, strategy.address, 1, 2, 3);
      });

      it("should revert, when non-owner call updateRewardPeriod", async () => {
        await expect(vault.connect(operator).updateRewardPeriod(0, 1)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when pool not exist", async () => {
        await expect(vault.updateRewardPeriod(1, 1)).to.revertedWith("Concentrator: pool not exist");
      });

      it("should revert, when period too long", async () => {
        await expect(vault.updateRewardPeriod(0, 86400 * 7 + 1)).to.revertedWith(
          "Concentrator: reward period too long"
        );
      });

      it("should succeed, when owner call", async () => {
        expect((await vault.poolInfo(0)).reward.periodLength).to.eq(0);
        await expect(vault.updateRewardPeriod(0, 86400 * 7))
          .to.emit(vault, "UpdateRewardPeriod")
          .withArgs(0, 86400 * 7);
        expect((await vault.poolInfo(0)).reward.periodLength).to.eq(86400 * 7);
        await expect(vault.updateRewardPeriod(0, 86400)).to.emit(vault, "UpdateRewardPeriod").withArgs(0, 86400);
        expect((await vault.poolInfo(0)).reward.periodLength).to.eq(86400);
        await expect(vault.updateRewardPeriod(0, 0)).to.emit(vault, "UpdateRewardPeriod").withArgs(0, 0);
        expect((await vault.poolInfo(0)).reward.periodLength).to.eq(0);
      });
    });

    context("#updatePoolRewardTokens", async () => {
      beforeEach(async () => {
        await vault.addPool(token.address, strategy.address, 1, 2, 3);
      });

      it("should revert, when non-owner call updatePoolRewardTokens", async () => {
        await expect(vault.connect(operator).updatePoolRewardTokens(0, [])).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when pool not exist", async () => {
        await expect(vault.updatePoolRewardTokens(1, [])).to.revertedWith("Concentrator: pool not exist");
      });

      it("should revert, when zero token address", async () => {
        await expect(vault.updatePoolRewardTokens(0, [constants.AddressZero])).to.revertedWith(
          "ConcentratorStrategy: zero reward token"
        );
      });

      it("should revert, when duplicated token", async () => {
        await expect(vault.updatePoolRewardTokens(0, [token.address, token.address])).to.revertedWith(
          "ConcentratorStrategy: duplicated reward token"
        );
      });

      it("should succeed, when owner call", async () => {
        await expect(strategy.rewards(0)).to.reverted;
        await vault.updatePoolRewardTokens(0, [token.address]);
        expect(await strategy.rewards(0)).to.eq(token.address);
        await expect(strategy.rewards(1)).to.reverted;
      });
    });

    context("#pausePoolWithdraw", async () => {
      beforeEach(async () => {
        await vault.addPool(token.address, strategy.address, 1, 2, 3);
      });

      it("should revert, when non-owner call pausePoolWithdraw", async () => {
        await expect(vault.connect(operator).pausePoolWithdraw(0, true)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when pool not exist", async () => {
        await expect(vault.pausePoolWithdraw(1, true)).to.revertedWith("Concentrator: pool not exist");
      });

      it("should succeed, when owner call", async () => {
        expect((await vault.poolInfo(0)).strategy.pauseWithdraw).to.eq(false);
        await expect(vault.pausePoolWithdraw(0, true)).to.emit(vault, "PausePoolWithdraw").withArgs(0, true);
        expect((await vault.poolInfo(0)).strategy.pauseWithdraw).to.eq(true);
        await expect(vault.pausePoolWithdraw(0, false)).to.emit(vault, "PausePoolWithdraw").withArgs(0, false);
        expect((await vault.poolInfo(0)).strategy.pauseWithdraw).to.eq(false);
      });
    });

    context("#pausePoolDeposit", async () => {
      beforeEach(async () => {
        await vault.addPool(token.address, strategy.address, 1, 2, 3);
      });

      it("should revert, when non-owner call pausePoolDeposit", async () => {
        await expect(vault.connect(operator).pausePoolDeposit(0, true)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when pool not exist", async () => {
        await expect(vault.pausePoolDeposit(1, true)).to.revertedWith("Concentrator: pool not exist");
      });

      it("should succeed, when owner call", async () => {
        expect((await vault.poolInfo(0)).strategy.pauseDeposit).to.eq(false);
        await expect(vault.pausePoolDeposit(0, true)).to.emit(vault, "PausePoolDeposit").withArgs(0, true);
        expect((await vault.poolInfo(0)).strategy.pauseDeposit).to.eq(true);
        await expect(vault.pausePoolDeposit(0, false)).to.emit(vault, "PausePoolDeposit").withArgs(0, false);
        expect((await vault.poolInfo(0)).strategy.pauseDeposit).to.eq(false);
      });
    });

    context("#migrateStrategy", async () => {
      beforeEach(async () => {
        await vault.addPool(token.address, strategy.address, 1, 2, 3);
      });

      it("should revert, when non-owner call migrateStrategy", async () => {
        await expect(vault.connect(operator).migrateStrategy(0, deployer.address)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when pool not exist", async () => {
        await expect(vault.migrateStrategy(1, deployer.address)).to.revertedWith("Concentrator: pool not exist");
      });
    });
  });

  const run = async (
    name: string,
    intermediate: string,
    config: {
      fork: number;
      deployer: string;
      token: string;
      pool: string;
      rewarder: string;
      holder: string;
      amount: string;
      rewards: string[];
    }
  ) => {
    context(`vault[${name}] with intermediate[${intermediate}]`, async () => {
      let deployer: SignerWithAddress;
      let holder: SignerWithAddress;
      let zap: AladdinZap;
      let booster: IConvexBooster;
      let vault: MockConcentratorGeneralVault;
      let strategy: ManualCompoundingConvexCurveStrategy;
      let rewardToken: MockERC20;
      let underlyingToken: MockERC20;
      let rewarder: IConvexBasicRewards;

      beforeEach(async () => {
        request_fork(config.fork, [config.deployer, config.holder]);
        deployer = await ethers.getSigner(config.deployer);
        holder = await ethers.getSigner(config.holder);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });

        rewardToken = await ethers.getContractAt("MockERC20", TOKENS[intermediate].address, deployer);
        underlyingToken = await ethers.getContractAt("MockERC20", config.token, holder);

        booster = await ethers.getContractAt("IConvexBooster", BOOSTER, deployer);
        rewarder = await ethers.getContractAt("IConvexBasicRewards", config.rewarder, deployer);

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        await zap.updatePoolTokens([config.pool], [config.token]);

        for (const [symbol, routes] of Object.entries(AVAILABLE_VAULTS[name].deposit)) {
          await zap.updateRoute(TOKENS[symbol].address, config.token, routes);
        }

        const MockConcentratorGeneralVault = await ethers.getContractFactory("MockConcentratorGeneralVault", deployer);
        vault = await MockConcentratorGeneralVault.deploy();
        await vault.deployed();

        await vault.initialize(rewardToken.address, zap.address, deployer.address);

        const ManualCompoundingConvexCurveStrategy = await ethers.getContractFactory(
          "ManualCompoundingConvexCurveStrategy",
          deployer
        );
        strategy = await ManualCompoundingConvexCurveStrategy.deploy();
        await strategy.deployed();

        await strategy.initialize(
          vault.address,
          config.token,
          config.rewarder,
          config.rewards.map((symbol) => TOKENS[symbol].address)
        );
      });

      context("#deposit", async () => {
        const depositAmount = ethers.utils.parseEther(config.amount);

        beforeEach(async () => {
          await vault.addPool(config.token, strategy.address, 0, 0, 0);
        });

        it("should revert, when pool not exist", async () => {
          await expect(vault.deposit(1, deployer.address, 0)).to.revertedWith("Concentrator: pool not exist");
        });

        it("should revert, when pool paused", async () => {
          await vault.pausePoolDeposit(0, true);
          await expect(vault.deposit(0, deployer.address, 0)).to.revertedWith("Concentrator: deposit paused");
        });

        it("should revert, when deposit zero", async () => {
          await expect(vault.deposit(0, deployer.address, 0)).to.revertedWith("Concentrator: deposit zero amount");
        });

        it("should succeed when deposit some to self", async () => {
          await underlyingToken.approve(vault.address, depositAmount);
          const sharesOut = await vault.connect(holder).callStatic.deposit(0, holder.address, depositAmount);
          await expect(vault.connect(holder).deposit(0, holder.address, depositAmount))
            .to.emit(vault, "Deposit")
            .withArgs(0, holder.address, holder.address, depositAmount, sharesOut);
          expect(sharesOut).to.eq(depositAmount);
          expect(await vault.getTotalShare(0)).to.eq(sharesOut);
          expect(await vault.getTotalUnderlying(0)).to.eq(depositAmount);
          expect(await vault.getUserShare(0, holder.address)).to.eq(sharesOut);
          expect(await rewarder.balanceOf(strategy.address)).to.eq(depositAmount);
        });

        it("should succeed when deposit some to other", async () => {
          await underlyingToken.approve(vault.address, depositAmount);
          const sharesOut = await vault.connect(holder).callStatic.deposit(0, deployer.address, depositAmount);
          await expect(vault.connect(holder).deposit(0, deployer.address, depositAmount))
            .to.emit(vault, "Deposit")
            .withArgs(0, holder.address, deployer.address, depositAmount, sharesOut);
          expect(sharesOut).to.eq(depositAmount);
          expect(await vault.getTotalShare(0)).to.eq(sharesOut);
          expect(await vault.getTotalUnderlying(0)).to.eq(depositAmount);
          expect(await vault.getUserShare(0, deployer.address)).to.eq(sharesOut);
          expect(await rewarder.balanceOf(strategy.address)).to.eq(depositAmount);
        });

        it("should succeed when deposit all to self", async () => {
          const all = await underlyingToken.balanceOf(holder.address);
          await underlyingToken.approve(vault.address, all);
          const sharesOut = await vault.connect(holder).callStatic.deposit(0, holder.address, constants.MaxUint256);
          await expect(vault.connect(holder).deposit(0, holder.address, constants.MaxUint256))
            .to.emit(vault, "Deposit")
            .withArgs(0, holder.address, holder.address, all, sharesOut);
          expect(sharesOut).to.eq(all);
          expect(await vault.getTotalShare(0)).to.eq(sharesOut);
          expect(await vault.getTotalUnderlying(0)).to.eq(all);
          expect(await vault.getUserShare(0, holder.address)).to.eq(sharesOut);
          expect(await rewarder.balanceOf(strategy.address)).to.eq(all);
        });

        it("should succeed when deposit all to other", async () => {
          const all = await underlyingToken.balanceOf(holder.address);
          await underlyingToken.approve(vault.address, all);
          const sharesOut = await vault.connect(holder).callStatic.deposit(0, deployer.address, constants.MaxUint256);
          await expect(vault.connect(holder).deposit(0, deployer.address, constants.MaxUint256))
            .to.emit(vault, "Deposit")
            .withArgs(0, holder.address, deployer.address, all, sharesOut);
          expect(sharesOut).to.eq(all);
          expect(await vault.getTotalShare(0)).to.eq(sharesOut);
          expect(await vault.getTotalUnderlying(0)).to.eq(all);
          expect(await vault.getUserShare(0, deployer.address)).to.eq(sharesOut);
          expect(await rewarder.balanceOf(strategy.address)).to.eq(all);
        });
      });

      context("#withdraw", async () => {
        const depositAmount = ethers.utils.parseEther(config.amount).div(2);
        const depositShares = depositAmount;
        const totalShares = depositAmount.mul(2);

        beforeEach(async () => {
          await vault.addPool(config.token, strategy.address, 0, 0, 0);
          await underlyingToken.approve(vault.address, depositAmount.mul(2));
          await vault.connect(holder).deposit(0, holder.address, depositAmount);
          await vault.connect(holder).deposit(0, deployer.address, depositAmount);
        });

        it("should revert, when pool not exist", async () => {
          await expect(vault.withdraw(1, 0, deployer.address, deployer.address)).to.revertedWith(
            "Concentrator: pool not exist"
          );
        });

        it("should revert, when withdraw zero", async () => {
          await expect(vault.withdraw(0, 0, deployer.address, deployer.address)).to.revertedWith(
            "Concentrator: withdraw zero share"
          );
        });

        it("should revert, when exceeds allowance", async () => {
          await expect(vault.connect(holder).withdraw(0, 1, deployer.address, deployer.address)).to.revertedWith(
            "Concentrator: withdraw exceeds allowance"
          );
        });

        it("should revert, when pool paused", async () => {
          await vault.pausePoolWithdraw(0, true);
          await expect(vault.withdraw(0, 1, deployer.address, deployer.address)).to.revertedWith(
            "Concentrator: withdraw paused"
          );
        });

        for (const feeRatio of [0, 1e7, 1e8]) {
          it(`should succeed when withdraw some to self and withdraw fee is ${feeRatio}`, async () => {
            await vault.setWithdrawFeeForUser(0, holder.address, feeRatio);

            const withdrawShare = depositAmount.div(10);
            const amountOut = await vault
              .connect(holder)
              .callStatic.withdraw(0, withdrawShare, holder.address, holder.address);
            const before = await underlyingToken.balanceOf(holder.address);
            await expect(vault.connect(holder).withdraw(0, withdrawShare, holder.address, holder.address))
              .to.emit(vault, "Withdraw")
              .withArgs(0, holder.address, holder.address, holder.address, withdrawShare, amountOut);
            const after = await underlyingToken.balanceOf(holder.address);
            expect(after.sub(before)).to.eq(amountOut);
            expect(amountOut).to.eq(withdrawShare.sub(withdrawShare.mul(feeRatio).div(1e9)));
            expect(await vault.getTotalShare(0)).to.eq(totalShares.sub(withdrawShare));
            expect(await vault.getTotalUnderlying(0)).to.eq(depositAmount.mul(2).sub(amountOut));
            expect(await vault.getUserShare(0, holder.address)).to.eq(depositShares.sub(withdrawShare));
            expect(await rewarder.balanceOf(strategy.address)).to.eq(depositAmount.mul(2).sub(amountOut));
          });

          it(`should succeed when withdraw some to other and withdraw fee is ${feeRatio}`, async () => {
            await vault.setWithdrawFeeForUser(0, holder.address, feeRatio);

            const withdrawShare = depositAmount.div(10);
            const amountOut = await vault
              .connect(holder)
              .callStatic.withdraw(0, withdrawShare, holder.address, holder.address);
            const before = await underlyingToken.balanceOf(deployer.address);
            await expect(vault.connect(holder).withdraw(0, withdrawShare, deployer.address, holder.address))
              .to.emit(vault, "Withdraw")
              .withArgs(0, holder.address, holder.address, deployer.address, withdrawShare, amountOut);
            const after = await underlyingToken.balanceOf(deployer.address);
            expect(after.sub(before)).to.eq(amountOut);
            expect(amountOut).to.eq(withdrawShare.sub(withdrawShare.mul(feeRatio).div(1e9)));
            expect(await vault.getTotalShare(0)).to.eq(totalShares.sub(withdrawShare));
            expect(await vault.getTotalUnderlying(0)).to.eq(depositAmount.mul(2).sub(amountOut));
            expect(await vault.getUserShare(0, holder.address)).to.eq(depositShares.sub(withdrawShare));
            expect(await rewarder.balanceOf(strategy.address)).to.eq(depositAmount.mul(2).sub(amountOut));
          });

          it(`should succeed when withdraw all to self and withdraw fee is ${feeRatio}`, async () => {
            await vault.setWithdrawFeeForUser(0, holder.address, feeRatio);

            const withdrawShare = await vault.getUserShare(0, holder.address);
            const amountOut = await vault
              .connect(holder)
              .callStatic.withdraw(0, constants.MaxUint256, holder.address, holder.address);
            const before = await underlyingToken.balanceOf(holder.address);
            await expect(vault.connect(holder).withdraw(0, constants.MaxUint256, holder.address, holder.address))
              .to.emit(vault, "Withdraw")
              .withArgs(0, holder.address, holder.address, holder.address, withdrawShare, amountOut);
            const after = await underlyingToken.balanceOf(holder.address);
            expect(after.sub(before)).to.eq(amountOut);
            expect(amountOut).to.eq(withdrawShare.sub(withdrawShare.mul(feeRatio).div(1e9)));
            expect(await vault.getTotalShare(0)).to.eq(totalShares.sub(withdrawShare));
            expect(await vault.getTotalUnderlying(0)).to.eq(depositAmount.mul(2).sub(amountOut));
            expect(await vault.getUserShare(0, holder.address)).to.eq(depositShares.sub(withdrawShare));
            expect(await rewarder.balanceOf(strategy.address)).to.eq(depositAmount.mul(2).sub(amountOut));
          });

          it(`should succeed when withdraw all to other and withdraw fee is ${feeRatio}`, async () => {
            await vault.setWithdrawFeeForUser(0, holder.address, feeRatio);

            const withdrawShare = await vault.getUserShare(0, holder.address);
            const amountOut = await vault
              .connect(holder)
              .callStatic.withdraw(0, constants.MaxUint256, holder.address, holder.address);
            const before = await underlyingToken.balanceOf(deployer.address);
            await expect(vault.connect(holder).withdraw(0, constants.MaxUint256, deployer.address, holder.address))
              .to.emit(vault, "Withdraw")
              .withArgs(0, holder.address, holder.address, deployer.address, withdrawShare, amountOut);
            const after = await underlyingToken.balanceOf(deployer.address);
            expect(after.sub(before)).to.eq(amountOut);
            expect(amountOut).to.eq(withdrawShare.sub(withdrawShare.mul(feeRatio).div(1e9)));
            expect(await vault.getTotalShare(0)).to.eq(totalShares.sub(withdrawShare));
            expect(await vault.getTotalUnderlying(0)).to.eq(depositAmount.mul(2).sub(amountOut));
            expect(await vault.getUserShare(0, holder.address)).to.eq(depositShares.sub(withdrawShare));
            expect(await rewarder.balanceOf(strategy.address)).to.eq(depositAmount.mul(2).sub(amountOut));
          });
        }
      });

      context("harvest", async () => {
        const platform = "0x1000000000000000000000000000000000000001";
        const recipient = "0x1000000000000000000000000000000000000002";
        const depositAmount = ethers.utils.parseEther(config.amount).div(2);
        const totalShares = depositAmount.mul(2);

        beforeEach(async () => {
          await vault.updatePlatform(platform);
          // 20% platform, 10% bounty
          await vault.addPool(config.token, strategy.address, 0, 2e8, 1e8);
          await underlyingToken.approve(vault.address, depositAmount.mul(2));
          await vault.connect(holder).deposit(0, holder.address, depositAmount);
          await vault.connect(holder).deposit(0, deployer.address, depositAmount);

          for (const reward of config.rewards) {
            if (intermediate === reward) continue;
            await zap.updateRoute(
              TOKENS[reward].address,
              TOKENS[intermediate].address,
              ZAP_ROUTES[reward][intermediate]
            );
          }
        });

        it("should succeed, when rewards distribute intermediately", async () => {
          await booster.earmarkRewards(await strategy.pid());

          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          const tx = await vault.harvest(0, recipient, 0);
          const harvested_reward = await rewardToken.balanceOf(vault.address); // 70%
          const harvested_bounty = await rewardToken.balanceOf(recipient); // 10%
          const harvested_platform = await rewardToken.balanceOf(platform); // 20%
          expect(harvested_reward).to.gt(constants.Zero);
          expect(harvested_reward).to.closeToBn(harvested_bounty.mul(7), 100);
          expect(harvested_platform).to.closeToBn(harvested_bounty.mul(2), 100);

          await expect(tx)
            .to.emit(vault, "Harvest")
            .withArgs(
              0,
              deployer.address,
              recipient,
              harvested_reward.add(harvested_bounty).add(harvested_platform),
              harvested_platform,
              harvested_bounty
            );

          const precision = BigNumber.from(10).pow(18);
          expect((await vault.poolInfo(0)).reward.accRewardPerShare).to.eq(
            harvested_reward.mul(precision).div(totalShares)
          );
        });

        it("should succeed, when rewards distribute linear in 7 days", async () => {
          await vault.updateRewardPeriod(0, 86400 * 7);
          await booster.earmarkRewards(await strategy.pid());

          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          const tx = await vault.harvest(0, recipient, 0);
          const harvested_reward = await rewardToken.balanceOf(vault.address); // 70%
          const harvested_bounty = await rewardToken.balanceOf(recipient); // 10%
          const harvested_platform = await rewardToken.balanceOf(platform); // 20%
          expect(harvested_reward).to.gt(constants.Zero);
          expect(harvested_reward).to.closeToBn(harvested_bounty.mul(7), 100);
          expect(harvested_platform).to.closeToBn(harvested_bounty.mul(2), 100);

          await expect(tx)
            .to.emit(vault, "Harvest")
            .withArgs(
              0,
              deployer.address,
              recipient,
              harvested_reward.add(harvested_bounty).add(harvested_platform),
              harvested_platform,
              harvested_bounty
            );

          const precision = BigNumber.from(10).pow(18);
          expect((await vault.poolInfo(0)).reward.accRewardPerShare).to.eq(constants.Zero);
          expect((await vault.poolInfo(0)).reward.rate).to.eq(harvested_reward.div(86400 * 7));
          expect((await vault.poolInfo(0)).reward.finishAt).to.eq(timestamp + 86400 * 7 * 2);
          expect((await vault.poolInfo(0)).reward.lastUpdate).to.eq(timestamp + 86400 * 7);

          // 3 days passed
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 10]);
          await vault.checkpoint(0, deployer.address);
          expect((await vault.poolInfo(0)).reward.accRewardPerShare).to.eq(
            harvested_reward
              .div(86400 * 7)
              .mul(86400 * 3)
              .mul(precision)
              .div(totalShares)
          );
          expect((await vault.poolInfo(0)).reward.rate).to.eq(harvested_reward.div(86400 * 7));
          expect((await vault.poolInfo(0)).reward.finishAt).to.eq(timestamp + 86400 * 7 * 2);
          expect((await vault.poolInfo(0)).reward.lastUpdate).to.eq(timestamp + 86400 * 10);
        });
      });

      context("#claim", async () => {
        const platform = "0x1000000000000000000000000000000000000001";
        const recipient = "0x1000000000000000000000000000000000000002";
        const depositAmount = ethers.utils.parseEther(config.amount).div(10);

        beforeEach(async () => {
          await vault.updatePlatform(platform);
          // 20% platform, 10% bounty
          await vault.addPool(config.token, strategy.address, 0, 2e8, 1e8);
          await underlyingToken.approve(vault.address, depositAmount.mul(10));
          await vault.connect(holder).deposit(0, holder.address, depositAmount.mul(2)); // 20%
          await vault.connect(holder).deposit(0, deployer.address, depositAmount.mul(5)); // 50%
          await vault.connect(holder).deposit(0, recipient, depositAmount.mul(3)); // 30%

          for (const reward of config.rewards) {
            if (intermediate === reward) continue;
            await zap.updateRoute(
              TOKENS[reward].address,
              TOKENS[intermediate].address,
              ZAP_ROUTES[reward][intermediate]
            );
          }
        });

        it("should succeed, when distribute intermediately", async () => {
          await booster.earmarkRewards(await strategy.pid());

          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await vault.harvest(0, recipient, 0);
          const harvested_reward = await rewardToken.balanceOf(vault.address);

          let before = await rewardToken.balanceOf(holder.address);
          await expect(vault.connect(holder).claim(0, holder.address, 0, rewardToken.address)).to.emit(vault, "Claim");
          let after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(2).div(10), 1e6);

          before = await rewardToken.balanceOf(holder.address);
          await expect(vault.connect(deployer).claim(0, holder.address, 0, rewardToken.address)).to.emit(
            vault,
            "Claim"
          );
          after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(5).div(10), 1e6);
        });

        it("should succeed, when distribute linear in 7 days", async () => {
          await vault.updateRewardPeriod(0, 86400 * 7);

          await booster.earmarkRewards(await strategy.pid());
          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await vault.harvest(0, recipient, 0);
          const harvested_reward = await rewardToken.balanceOf(vault.address);

          let before = await rewardToken.balanceOf(holder.address);
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * (7 + 3.5)]);
          await expect(vault.connect(holder).claim(0, holder.address, 0, rewardToken.address)).to.emit(vault, "Claim");
          let after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(2).div(10).div(2), 1e6);

          before = await rewardToken.balanceOf(holder.address);
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * (7 + 4)]);
          await expect(vault.connect(deployer).claim(0, holder.address, 0, rewardToken.address)).to.emit(
            vault,
            "Claim"
          );
          after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(5).div(10).mul(4).div(7), 1e6);
        });
      });

      context("#claimMulti", async () => {
        const platform = "0x1000000000000000000000000000000000000001";
        const recipient = "0x1000000000000000000000000000000000000002";
        const depositAmount = ethers.utils.parseEther(config.amount).div(10);

        beforeEach(async () => {
          await vault.updatePlatform(platform);
          // 20% platform, 10% bounty
          await vault.addPool(config.token, strategy.address, 0, 2e8, 1e8);
          await underlyingToken.approve(vault.address, depositAmount.mul(10));
          await vault.connect(holder).deposit(0, holder.address, depositAmount.mul(2)); // 20%
          await vault.connect(holder).deposit(0, deployer.address, depositAmount.mul(5)); // 50%
          await vault.connect(holder).deposit(0, recipient, depositAmount.mul(3)); // 30%

          for (const reward of config.rewards) {
            if (intermediate === reward) continue;
            await zap.updateRoute(
              TOKENS[reward].address,
              TOKENS[intermediate].address,
              ZAP_ROUTES[reward][intermediate]
            );
          }
        });

        it("should succeed, when distribute intermediately", async () => {
          await booster.earmarkRewards(await strategy.pid());

          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await vault.harvest(0, recipient, 0);
          const harvested_reward = await rewardToken.balanceOf(vault.address);

          let before = await rewardToken.balanceOf(holder.address);
          await expect(vault.connect(holder).claimMulti([0, 0], holder.address, 0, rewardToken.address)).to.emit(
            vault,
            "Claim"
          );
          let after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(2).div(10), 1e6);

          before = await rewardToken.balanceOf(holder.address);
          await expect(vault.connect(deployer).claimMulti([0], holder.address, 0, rewardToken.address)).to.emit(
            vault,
            "Claim"
          );
          after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(5).div(10), 1e6);
        });

        it("should succeed, when distribute linear in 7 days", async () => {
          await vault.updateRewardPeriod(0, 86400 * 7);

          await booster.earmarkRewards(await strategy.pid());
          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await vault.harvest(0, recipient, 0);
          const harvested_reward = await rewardToken.balanceOf(vault.address);

          let before = await rewardToken.balanceOf(holder.address);
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * (7 + 3.5)]);
          await expect(vault.connect(holder).claimMulti([0, 0], holder.address, 0, rewardToken.address)).to.emit(
            vault,
            "Claim"
          );
          let after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(2).div(10).div(2), 1e6);

          before = await rewardToken.balanceOf(holder.address);
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * (7 + 4)]);
          await expect(vault.connect(deployer).claimMulti([0], holder.address, 0, rewardToken.address)).to.emit(
            vault,
            "Claim"
          );
          after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(5).div(10).mul(4).div(7), 1e6);
        });
      });

      context("#claimAll", async () => {
        const platform = "0x1000000000000000000000000000000000000001";
        const recipient = "0x1000000000000000000000000000000000000002";
        const depositAmount = ethers.utils.parseEther(config.amount).div(10);

        beforeEach(async () => {
          await vault.updatePlatform(platform);
          // 20% platform, 10% bounty
          await vault.addPool(config.token, strategy.address, 0, 2e8, 1e8);
          await underlyingToken.approve(vault.address, depositAmount.mul(10));
          await vault.connect(holder).deposit(0, holder.address, depositAmount.mul(2)); // 20%
          await vault.connect(holder).deposit(0, deployer.address, depositAmount.mul(5)); // 50%
          await vault.connect(holder).deposit(0, recipient, depositAmount.mul(3)); // 30%

          for (const reward of config.rewards) {
            if (intermediate === reward) continue;
            await zap.updateRoute(
              TOKENS[reward].address,
              TOKENS[intermediate].address,
              ZAP_ROUTES[reward][intermediate]
            );
          }
        });

        it("should succeed, when distribute intermediately", async () => {
          await booster.earmarkRewards(await strategy.pid());

          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await vault.harvest(0, recipient, 0);
          const harvested_reward = await rewardToken.balanceOf(vault.address);

          let before = await rewardToken.balanceOf(holder.address);
          await expect(vault.connect(holder).claimAll(0, holder.address, rewardToken.address)).to.emit(vault, "Claim");
          let after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(2).div(10), 1e6);

          before = await rewardToken.balanceOf(holder.address);
          await expect(vault.connect(deployer).claimAll(0, holder.address, rewardToken.address)).to.emit(
            vault,
            "Claim"
          );
          after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(5).div(10), 1e6);
        });

        it("should succeed, when distribute linear in 7 days", async () => {
          await vault.updateRewardPeriod(0, 86400 * 7);

          await booster.earmarkRewards(await strategy.pid());
          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await vault.harvest(0, recipient, 0);
          const harvested_reward = await rewardToken.balanceOf(vault.address);

          let before = await rewardToken.balanceOf(holder.address);
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * (7 + 3.5)]);
          await expect(vault.connect(holder).claimAll(0, holder.address, rewardToken.address)).to.emit(vault, "Claim");
          let after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(2).div(10).div(2), 1e6);

          before = await rewardToken.balanceOf(holder.address);
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * (7 + 4)]);
          await expect(vault.connect(deployer).claimAll(0, holder.address, rewardToken.address)).to.emit(
            vault,
            "Claim"
          );
          after = await rewardToken.balanceOf(holder.address);
          expect(after.sub(before)).to.closeToBn(harvested_reward.mul(5).div(10).mul(4).div(7), 1e6);
        });
      });
    });
  };

  for (const [name, config] of Object.entries(UNDERLYING)) {
    for (const intermediate of config.intermediates) {
      run(name, intermediate, config);
    }
  }
});

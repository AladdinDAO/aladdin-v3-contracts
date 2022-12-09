/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import {
  AladdinETH,
  ConvexCurveAutoCompoundingStrategy,
  IConvexBasicRewards,
  IConvexBooster,
  IERC20,
} from "../../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../../utils";
import { TOKENS, VAULT_CONFIG, ZAP_ROUTES } from "../../../scripts/utils";

const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const PLATFORM = "0x07dA2d30E26802ED65a52859a50872cfA615bD0A";
const WITHDRAW_FEE_PERCENTAGE = 1e7; // 1%
const PLATFORM_FEE_PERCENTAGE = 2e8; // 20%
const HARVEST_BOUNTY_PERCENTAGE = 5e7; // 5%

const WITHDRAW_FEE_TYPE = "0x1b984391afd149dbfa9c9ae6207b4124e6f3df34afa8ab1e203176eea408e4da";

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
    intermediate: string;
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
    intermediate: "WETH",
  },
  steth: {
    fork: 16124420,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    token: "0x06325440D014e39736583c165C2963BA99fAf14E",
    pool: "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022",
    rewarder: "0x0A760466E1B4621579a82a39CB56Dda2F4E70f03",
    holder: "0x13e382dfe53207E9ce2eeEab330F69da2794179E",
    amount: "100",
    rewards: ["CVX", "CRV", "LDO"],
    intermediate: "WETH",
  },
  cbeth: {
    fork: 16124420,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    token: "0x5b6C539b224014A09B3388e51CaAA8e354c959C8",
    pool: "0x5FAE7E604FC3e24fd43A72867ceBaC94c65b404A",
    rewarder: "0x5d02EcD9B83f1187e92aD5be3d1bd2915CA03699",
    holder: "0xe4d7e7b90519445585635c3b383c9d86c0596e57",
    amount: "10",
    rewards: ["CVX", "CRV"],
    intermediate: "WETH",
  },
};

describe("AladdinETH.spec", async () => {
  let deployer: SignerWithAddress;
  let signer: SignerWithAddress;
  let aeth: AladdinETH;
  let booster: IConvexBooster;
  let rewarder: IConvexBasicRewards;
  let strategy: ConvexCurveAutoCompoundingStrategy;

  const run = async (
    name: string,
    config: {
      fork: number;
      deployer: string;
      token: string;
      pool: string;
      rewarder: string;
      holder: string;
      amount: string;
      rewards: string[];
      intermediate: string;
    }
  ) => {
    context(`${name}`, async () => {
      beforeEach(async () => {
        request_fork(config.fork, [config.deployer, config.holder]);
        deployer = await ethers.getSigner(config.deployer);
        signer = await ethers.getSigner(config.holder);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        booster = await ethers.getContractAt("IConvexBooster", BOOSTER, deployer);
        rewarder = await ethers.getContractAt("IConvexBasicRewards", config.rewarder, deployer);

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        const zap = await AladdinZap.deploy();
        await zap.initialize();

        await zap.updatePoolTokens([config.pool], [config.token]);

        for (const [symbol, routes] of Object.entries(VAULT_CONFIG[name].deposit)) {
          await zap.updateRoute(TOKENS[symbol].address, config.token, routes);
        }
        for (const reward of config.rewards) {
          await zap.updateRoute(
            TOKENS[reward].address,
            TOKENS[config.intermediate].address,
            ZAP_ROUTES[reward][config.intermediate]
          );
        }

        const ConvexCurveAutoCompoundingStrategy = await ethers.getContractFactory(
          "ConvexCurveAutoCompoundingStrategy",
          deployer
        );
        strategy = await ConvexCurveAutoCompoundingStrategy.deploy();
        await strategy.deployed();

        const AladdinETH = await ethers.getContractFactory("AladdinETH", deployer);
        aeth = await AladdinETH.deploy();
        await aeth.deployed();

        await strategy.initialize(
          aeth.address,
          config.token,
          config.rewarder,
          config.rewards.map((symbol) => TOKENS[symbol].address)
        );
        await aeth.initialize(zap.address, config.token, strategy.address, "Aladdin ETH", "aETH");

        await aeth.updateFeeInfo(PLATFORM, PLATFORM_FEE_PERCENTAGE, HARVEST_BOUNTY_PERCENTAGE, WITHDRAW_FEE_PERCENTAGE);
      });

      it("should initialize correctly", async () => {
        expect(await aeth.asset()).to.eq(config.token);
        expect(await aeth.totalSupply()).to.eq(constants.Zero);
        expect(await aeth.totalAssets()).to.eq(constants.Zero);
      });

      context("auth", async () => {
        it("should revert, when reinitialize", async () => {
          await expect(
            aeth.initialize(constants.AddressZero, constants.AddressZero, constants.AddressZero, "", "")
          ).to.revertedWith("Initializable: contract is already initialized");
        });

        context("updateFeeInfo", async () => {
          it("should revert, when non-owner call", async () => {
            await expect(aeth.connect(signer).updateFeeInfo(constants.AddressZero, 0, 0, 0)).to.revertedWith(
              "Ownable: caller is not the owner"
            );
          });

          it("should revert, when platform is zero", async () => {
            await expect(aeth.updateFeeInfo(constants.AddressZero, 0, 0, 0)).to.revertedWith("zero platform address");
          });

          it("should revert, when fee too large", async () => {
            await expect(aeth.updateFeeInfo(deployer.address, 2e8 + 1, 0, 0)).to.revertedWith("platform fee too large");
            await expect(aeth.updateFeeInfo(deployer.address, 0, 1e8 + 1, 0)).to.revertedWith("bounty fee too large");
            await expect(aeth.updateFeeInfo(deployer.address, 0, 0, 1e8 + 1)).to.revertedWith("withdraw fee too large");
          });

          it("should succeed", async () => {
            expect(await aeth.feeInfo()).to.deep.eq([
              PLATFORM,
              PLATFORM_FEE_PERCENTAGE,
              HARVEST_BOUNTY_PERCENTAGE,
              WITHDRAW_FEE_PERCENTAGE,
            ]);
            await expect(aeth.updateFeeInfo(deployer.address, 2e8, 1e8, 1e7))
              .to.emit(aeth, "UpdateFeeInfo")
              .withArgs(deployer.address, 2e8, 1e8, 1e7);
            expect(await aeth.feeInfo()).to.deep.eq([deployer.address, 2e8, 1e8, 1e7]);
          });
        });

        context("updateRewardPeriodLength", async () => {
          it("should revert, when non-owner call", async () => {
            await expect(aeth.connect(signer).updateRewardPeriodLength(1)).to.revertedWith(
              "Ownable: caller is not the owner"
            );
          });

          it("should succeed", async () => {
            expect((await aeth.rewardInfo()).periodLength).to.eq(0);
            await expect(aeth.updateRewardPeriodLength(1)).to.emit(aeth, "UpdateRewardPeriodLength").withArgs(1);
            expect((await aeth.rewardInfo()).periodLength).to.eq(1);
          });
        });

        context("updateRewards", async () => {
          it("should revert, when non-owner call", async () => {
            await expect(aeth.connect(signer).updateRewards([])).to.revertedWith("Ownable: caller is not the owner");
          });

          it("should succeed", async () => {
            for (let i = 0; i < config.rewards.length; i++) {
              expect(await strategy.rewards(i)).to.eq(TOKENS[config.rewards[i]].address);
            }
            await expect(strategy.rewards(config.rewards.length)).to.reverted;
            await aeth.updateRewards(config.rewards.map((symbol) => TOKENS[symbol].address).reverse());
            for (let i = 0; i < config.rewards.length; i++) {
              expect(await strategy.rewards(i)).to.eq(TOKENS[config.rewards[config.rewards.length - 1 - i]].address);
            }
            await expect(strategy.rewards(config.rewards.length)).to.reverted;
          });
        });

        context("updateZap", async () => {
          it("should revert, when non-owner call", async () => {
            await expect(aeth.connect(signer).updateZap(constants.AddressZero)).to.revertedWith(
              "Ownable: caller is not the owner"
            );
          });

          it("should revert, when zap is zero", async () => {
            await expect(aeth.updateZap(constants.AddressZero)).to.revertedWith("AladdinCompounder: zero zap address");
          });

          it("should succeed", async () => {
            await expect(aeth.updateZap(deployer.address)).to.emit(aeth, "UpdateZap").withArgs(deployer.address);
            expect(await aeth.zap()).to.eq(deployer.address);
          });
        });

        context("setWithdrawFeeForUser", async () => {
          it("should revert, when non-owner call", async () => {
            await expect(aeth.connect(signer).setWithdrawFeeForUser(constants.AddressZero, 0)).to.revertedWith(
              "Ownable: caller is not the owner"
            );
          });

          it("should revert, when fee too large", async () => {
            await expect(aeth.setWithdrawFeeForUser(deployer.address, 1e8 + 1)).to.revertedWith(
              "withdraw fee too large"
            );
          });

          it("should succeed", async () => {
            expect(await aeth.getFeeRate(WITHDRAW_FEE_TYPE, deployer.address)).to.deep.eq(WITHDRAW_FEE_PERCENTAGE);
            await expect(aeth.setWithdrawFeeForUser(deployer.address, 1))
              .to.emit(aeth, "CustomizeFee")
              .withArgs(WITHDRAW_FEE_TYPE, deployer.address, 1);
            expect(await aeth.getFeeRate(WITHDRAW_FEE_TYPE, deployer.address)).to.deep.eq(1);
          });
        });
      });

      context("deposit/mint/withdraw/redeem", async () => {
        const assetsAmount = ethers.utils.parseEther(config.amount).div(3);
        const sharesAmount = ethers.utils.parseEther(config.amount);
        let token: IERC20;

        beforeEach(async () => {
          token = await ethers.getContractAt("IERC20", config.token, signer);
          await token.approve(aeth.address, constants.MaxUint256);
        });

        context("deposit", async () => {
          it("should revert, when deposit zero amount", async () => {
            await expect(aeth.deposit(0, deployer.address)).to.revertedWith("AladdinCompounder: deposit zero amount");
          });

          it("should succeed", async () => {
            const previewAmount = await aeth.previewDeposit(assetsAmount);
            await expect(aeth.connect(signer).deposit(assetsAmount, deployer.address))
              .to.emit(aeth, "Deposit")
              .withArgs(signer.address, deployer.address, assetsAmount, assetsAmount);
            expect(await aeth.totalAssets()).to.eq(assetsAmount);
            expect(await aeth.balanceOf(deployer.address)).to.eq(assetsAmount);
            expect(await aeth.balanceOf(deployer.address)).to.eq(previewAmount);
            expect(await aeth.totalSupply()).to.eq(assetsAmount);
          });
        });

        context("mint", async () => {
          it("should revert, when mint zero amount", async () => {
            await expect(aeth.mint(0, deployer.address)).to.revertedWith("AladdinCompounder: deposit zero amount");
          });

          it("should succeed", async () => {
            const previewAmount = await aeth.previewMint(sharesAmount);
            await expect(aeth.connect(signer).mint(sharesAmount, deployer.address))
              .to.emit(aeth, "Deposit")
              .withArgs(signer.address, deployer.address, sharesAmount, sharesAmount);
            expect(await aeth.totalAssets()).to.eq(sharesAmount);
            expect(await aeth.balanceOf(deployer.address)).to.eq(sharesAmount);
            expect(await aeth.balanceOf(deployer.address)).to.eq(previewAmount);
            expect(await aeth.totalSupply()).to.eq(sharesAmount);
          });
        });

        context("withdraw", async () => {
          beforeEach(async () => {
            await aeth.connect(signer).deposit(assetsAmount, signer.address);
          });

          it("should revert, when exceed total assets", async () => {
            await expect(
              aeth.connect(signer).withdraw(assetsAmount.add(1), deployer.address, signer.address)
            ).to.revertedWith("exceed total assets");
          });

          it("should revert, when exceeds allowance", async () => {
            await expect(
              aeth.connect(signer).withdraw(assetsAmount, deployer.address, deployer.address)
            ).to.revertedWith("withdraw exceeds allowance");
          });

          it("should revert, when withdraw zero share", async () => {
            await expect(aeth.connect(signer).withdraw(0, deployer.address, signer.address)).to.revertedWith(
              "AladdinCompounder: withdraw zero share"
            );
          });

          it("should revert, when insufficient owner shares", async () => {
            await expect(aeth.connect(deployer).withdraw(1, deployer.address, deployer.address)).to.revertedWith(
              "AladdinCompounder: insufficient owner shares"
            );
          });

          it("should succeed", async () => {
            const withdrawAmount = assetsAmount.div(2);
            const preview = await aeth.previewWithdraw(withdrawAmount);
            await expect(aeth.connect(signer).withdraw(withdrawAmount, deployer.address, signer.address))
              .to.emit(aeth, "Withdraw")
              .withArgs(signer.address, deployer.address, signer.address, withdrawAmount, preview);
            expect(await aeth.totalAssets()).to.eq(assetsAmount.sub(withdrawAmount));
            expect(await aeth.balanceOf(signer.address)).to.eq(assetsAmount.sub(preview));
            expect(preview).to.eq(withdrawAmount.mul(1e9).div(1e9 - WITHDRAW_FEE_PERCENTAGE));
          });
        });

        context("redeem", async () => {
          beforeEach(async () => {
            await aeth.connect(signer).deposit(assetsAmount, signer.address);
          });

          it("should revert, when exceeds allowance", async () => {
            await expect(aeth.connect(signer).redeem(assetsAmount, deployer.address, deployer.address)).to.revertedWith(
              "redeem exceeds allowance"
            );
          });

          it("should revert, when withdraw zero share", async () => {
            await expect(aeth.connect(signer).redeem(0, deployer.address, signer.address)).to.revertedWith(
              "AladdinCompounder: withdraw zero share"
            );
          });

          it("should revert, when insufficient owner shares", async () => {
            await expect(aeth.connect(deployer).redeem(1, deployer.address, deployer.address)).to.revertedWith(
              "AladdinCompounder: insufficient owner shares"
            );
          });

          it("should succeed", async () => {
            const redeemAmount = assetsAmount.div(2);
            const fee = redeemAmount.mul(WITHDRAW_FEE_PERCENTAGE).div(1e9);
            const preview = await aeth.previewRedeem(redeemAmount);
            await expect(aeth.connect(signer).redeem(redeemAmount, deployer.address, signer.address))
              .to.emit(aeth, "Withdraw")
              .withArgs(signer.address, deployer.address, signer.address, preview, redeemAmount);
            expect(await aeth.totalAssets()).to.eq(assetsAmount.sub(redeemAmount.sub(fee)));
            expect(await aeth.balanceOf(signer.address)).to.eq(assetsAmount.sub(redeemAmount));
            expect(preview).to.eq(redeemAmount.sub(fee));
          });
        });

        context("distribute harvested reward intermediately", async () => {
          beforeEach(async () => {
            await aeth.updateRewardPeriodLength(0);
            // deposit
            await aeth.connect(signer).deposit(assetsAmount, PLATFORM);
            await booster.earmarkRewards(await strategy.pid());
            const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            // 3 days
            await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
            await hre.network.provider.send("evm_mine", []);
            // harvest
            await aeth.harvest(PLATFORM, 0);
          });

          it("A deposit => harvest => B deposit => A redeem", async () => {
            let totalShares = await aeth.totalSupply();
            let totalAssets = await aeth.totalAssets();
            expect(totalAssets).to.gt(totalShares);

            // do deposit
            let previewDepositShares = await aeth.previewDeposit(assetsAmount);
            expect(previewDepositShares).to.eq(assetsAmount.mul(totalShares).div(totalAssets));
            let callDepositShares = await aeth.connect(signer).callStatic.deposit(assetsAmount, deployer.address);
            expect(callDepositShares).eq(previewDepositShares);
            await expect(aeth.connect(signer).deposit(assetsAmount, deployer.address))
              .to.emit(aeth, "Deposit")
              .withArgs(signer.address, deployer.address, assetsAmount, callDepositShares);
            expect(await aeth.totalSupply()).to.eq(totalShares.add(callDepositShares));
            expect(await aeth.totalAssets()).to.eq(totalAssets.add(assetsAmount));
            expect(await aeth.balanceOf(deployer.address)).to.eq(callDepositShares);

            totalAssets = totalAssets.add(assetsAmount);
            totalShares = totalShares.add(callDepositShares);

            // do harvest
            await booster.earmarkRewards(await strategy.pid());
            const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 4]);
            const tx = await aeth.harvest(deployer.address, 0);
            const harvested = (await aeth.totalAssets()).sub(totalAssets);
            await expect(tx)
              .to.emit(aeth, "Harvest")
              .withArgs(
                deployer.address,
                deployer.address,
                harvested,
                harvested.mul(PLATFORM_FEE_PERCENTAGE).div(1e9),
                harvested.mul(HARVEST_BOUNTY_PERCENTAGE).div(1e9)
              );
            const callerShare = harvested.mul(HARVEST_BOUNTY_PERCENTAGE).div(1e9).mul(totalShares).div(totalAssets);
            const platformShare = harvested.mul(PLATFORM_FEE_PERCENTAGE).div(1e9).mul(totalShares).div(totalAssets);
            expect(await aeth.totalSupply()).to.eq(totalShares.add(callerShare).add(platformShare));
            totalShares = totalShares.add(callerShare).add(platformShare);
            totalAssets = totalAssets.add(harvested);

            // do deposit 2
            previewDepositShares = await aeth.previewDeposit(assetsAmount);
            expect(previewDepositShares).to.eq(assetsAmount.mul(totalShares).div(totalAssets));
            callDepositShares = await aeth.connect(signer).callStatic.deposit(assetsAmount, deployer.address);
            expect(callDepositShares).eq(previewDepositShares);
            await expect(aeth.connect(signer).deposit(assetsAmount, signer.address))
              .to.emit(aeth, "Deposit")
              .withArgs(signer.address, signer.address, assetsAmount, callDepositShares);
            expect(await aeth.totalSupply()).to.eq(totalShares.add(callDepositShares));
            expect(await aeth.totalAssets()).to.eq(totalAssets.add(assetsAmount));
            expect(await aeth.balanceOf(signer.address)).to.eq(callDepositShares);
            totalShares = totalShares.add(callDepositShares);
            totalAssets = totalAssets.add(assetsAmount);

            // deployer redeem
            const deployerShare = await aeth.balanceOf(deployer.address);
            const previewRedeemAmount = await aeth.previewRedeem(deployerShare);
            const redeemFee = deployerShare.mul(totalAssets).div(totalShares).mul(WITHDRAW_FEE_PERCENTAGE).div(1e9);
            expect(previewRedeemAmount).to.eq(deployerShare.mul(totalAssets).div(totalShares).sub(redeemFee));
            const callRedeemAmount = await aeth.callStatic.redeem(deployerShare, deployer.address, deployer.address);
            expect(callRedeemAmount).eq(previewRedeemAmount);
            await expect(aeth.redeem(deployerShare, deployer.address, deployer.address))
              .to.emit(aeth, "Withdraw")
              .withArgs(deployer.address, deployer.address, deployer.address, callRedeemAmount, deployerShare);
            expect(await token.balanceOf(deployer.address)).to.eq(callRedeemAmount);
            expect(await aeth.totalSupply()).to.eq(totalShares.sub(deployerShare));
            expect(await aeth.totalAssets()).to.eq(totalAssets.sub(callRedeemAmount));
            expect(await aeth.balanceOf(deployer.address)).to.eq(constants.Zero);
          });
        });

        context("distribute harvested reward in 7 days", async () => {
          beforeEach(async () => {
            await aeth.updateRewardPeriodLength(86400 * 7);
            await aeth.connect(signer).deposit(assetsAmount, PLATFORM);
          });

          it("A deposit => harvest => B deposit => A redeem => B redeem", async () => {
            let totalShares = await aeth.totalSupply();
            let totalAssets = await aeth.totalAssets();
            expect(totalAssets).to.eq(totalShares);

            // do deposit
            const previewDepositShares = await aeth.previewDeposit(assetsAmount);
            expect(previewDepositShares).to.eq(assetsAmount.mul(totalShares).div(totalAssets));
            let callDepositShares = await aeth.connect(signer).callStatic.deposit(assetsAmount, deployer.address);
            expect(callDepositShares).eq(previewDepositShares);
            await expect(aeth.connect(signer).deposit(assetsAmount, deployer.address))
              .to.emit(aeth, "Deposit")
              .withArgs(signer.address, deployer.address, assetsAmount, callDepositShares);
            expect(await aeth.totalSupply()).to.eq(totalShares.add(callDepositShares));
            expect(await aeth.totalAssets()).to.eq(totalAssets.add(assetsAmount));
            expect(await aeth.balanceOf(deployer.address)).to.eq(callDepositShares);

            totalAssets = totalAssets.add(assetsAmount);
            totalShares = totalShares.add(callDepositShares);

            // do harvest
            await booster.earmarkRewards(await strategy.pid());
            let timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
            const tx = await aeth.harvest(deployer.address, 0);
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            let harvested = (await rewarder.balanceOf(strategy.address)).sub(totalAssets);
            expect(harvested).gt(constants.Zero);
            await expect(tx)
              .to.emit(aeth, "Harvest")
              .withArgs(
                deployer.address,
                deployer.address,
                harvested,
                harvested.mul(PLATFORM_FEE_PERCENTAGE).div(1e9),
                harvested.mul(HARVEST_BOUNTY_PERCENTAGE).div(1e9)
              );
            const callerShare = harvested.mul(HARVEST_BOUNTY_PERCENTAGE).div(1e9).mul(totalShares).div(totalAssets);
            const platformShare = harvested.mul(PLATFORM_FEE_PERCENTAGE).div(1e9).mul(totalShares).div(totalAssets);
            expect(await aeth.totalSupply()).to.eq(totalShares.add(callerShare).add(platformShare));
            expect(await aeth.totalAssets()).to.eq(
              totalAssets
                .add(harvested.mul(HARVEST_BOUNTY_PERCENTAGE).div(1e9))
                .add(harvested.mul(PLATFORM_FEE_PERCENTAGE).div(1e9))
            );
            totalShares = totalShares.add(callerShare).add(platformShare);
            totalAssets = totalAssets
              .add(harvested.mul(HARVEST_BOUNTY_PERCENTAGE).div(1e9))
              .add(harvested.mul(PLATFORM_FEE_PERCENTAGE).div(1e9));

            harvested = harvested
              .sub(harvested.mul(PLATFORM_FEE_PERCENTAGE).div(1e9))
              .sub(harvested.mul(HARVEST_BOUNTY_PERCENTAGE).div(1e9));
            const rate = harvested.div(86400 * 7);
            // do deposit 2
            totalAssets = totalAssets.add(rate.mul(86400 * 3)); // 3days
            callDepositShares = assetsAmount.mul(totalShares).div(totalAssets);
            await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 3]);
            await expect(aeth.connect(signer).deposit(assetsAmount, signer.address))
              .to.emit(aeth, "Deposit")
              .withArgs(signer.address, signer.address, assetsAmount, callDepositShares);
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            expect(await aeth.totalSupply()).to.eq(totalShares.add(callDepositShares));
            expect(await aeth.totalAssets()).to.eq(totalAssets.add(assetsAmount));
            expect(await aeth.balanceOf(signer.address)).to.eq(callDepositShares);
            totalShares = totalShares.add(callDepositShares);
            totalAssets = totalAssets.add(assetsAmount);

            // deployer redeem
            totalAssets = totalAssets.add(rate.mul(86400 * 3)); // 3days
            const deployerShare = await aeth.balanceOf(deployer.address);
            const redeemFee = deployerShare.mul(totalAssets).div(totalShares).mul(WITHDRAW_FEE_PERCENTAGE).div(1e9);
            const callRedeemAmount = deployerShare.mul(totalAssets).div(totalShares).sub(redeemFee);
            await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 3]);
            await expect(aeth.redeem(deployerShare, deployer.address, deployer.address))
              .to.emit(aeth, "Withdraw")
              .withArgs(deployer.address, deployer.address, deployer.address, callRedeemAmount, deployerShare);
            expect(await token.balanceOf(deployer.address)).to.eq(callRedeemAmount);
            expect(await aeth.totalSupply()).to.eq(totalShares.sub(deployerShare));
            expect(await aeth.totalAssets()).to.eq(totalAssets.sub(callRedeemAmount));
            expect(await aeth.balanceOf(deployer.address)).to.eq(constants.Zero);
          });
        });
      });

      context("migrate", async () => {});
    });
  };

  for (const [name, config] of Object.entries(UNDERLYING)) {
    run(name, config);
  }

  context("frxETH in Convex For Frax", async () => {
    // const config = UNDERLYING.frxeth;
  });
});

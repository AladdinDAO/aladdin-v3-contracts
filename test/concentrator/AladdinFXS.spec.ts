/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import { AladdinFXS, CompounderGateway, IConvexBasicRewards, IConvexBooster, IERC20 } from "../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../utils";
import { ADDRESS, TOKENS, VAULT_CONFIG, ZAP_ROUTES } from "../../scripts/utils";

const FORK_BLOCK_NUMBER = 15074229;
const WETH = TOKENS.WETH.address;
const WETH_HOLDER = "0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE";
const USDC = TOKENS.USDC.address;
const USDC_HOLDER = "0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE";
const FXS = TOKENS.FXS.address;
const FXS_HOLDER = "0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE";
const cvxFXS = TOKENS.cvxFXS.address;
// eslint-disable-next-line camelcase
const cvxFXS_HOLDER = "0x6979e645b7cd48c7181ece3c931be9261394aa29";
const CVX = TOKENS.CVX.address;
const CRV = TOKENS.CRV.address;

const CURVE_CVXFXS_TOKEN = ADDRESS.CURVE_CVXFXS_TOKEN;
const CURVE_CVXFXS_HOLDER = "0xdc88d12721f9ca1404e9e6e6389ae0abdd54fc6c";
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const REWARDER = "0xf27AFAD0142393e4b3E5510aBc5fe3743Ad669Cb";

const PLATFORM = "0x07dA2d30E26802ED65a52859a50872cfA615bD0A";
const WITHDRAW_FEE_PERCENTAGE = 1e7; // 1%
const PLATFORM_FEE_PERCENTAGE = 2e8; // 20%
const HARVEST_BOUNTY_PERCENTAGE = 5e7; // 5%

describe("AladdinFXS.spec", async () => {
  let deployer: SignerWithAddress;
  let signer: SignerWithAddress;
  let afxs: AladdinFXS;
  let booster: IConvexBooster;
  let rewarder: IConvexBasicRewards;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [
      DEPLOYER,
      CURVE_CVXFXS_HOLDER,
      WETH_HOLDER,
      USDC_HOLDER,
      FXS_HOLDER,
      // eslint-disable-next-line camelcase
      cvxFXS_HOLDER,
    ]);
    deployer = await ethers.getSigner(DEPLOYER);
    signer = await ethers.getSigner(CURVE_CVXFXS_HOLDER);
    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    booster = await ethers.getContractAt("IConvexBooster", BOOSTER, deployer);
    rewarder = await ethers.getContractAt("IConvexBasicRewards", REWARDER, deployer);

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin", deployer);
    const proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();

    const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
    const zap = await AladdinZap.deploy();
    await zap.initialize();

    for (const [from, to] of [
      ["CRV", "FXS"],
      ["CVX", "FXS"],
    ]) {
      const routes = ZAP_ROUTES[from][to];
      await zap.updateRoute(TOKENS[from].address, TOKENS[to].address, routes);
    }

    const AladdinFXS = await ethers.getContractFactory("AladdinFXS", deployer);
    const impl = await AladdinFXS.deploy();
    await impl.deployed();
    const data = impl.interface.encodeFunctionData("initialize", [zap.address, [FXS, CRV, CVX]]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(impl.address, proxyAdmin.address, data);
    await proxy.deployed();
    afxs = await ethers.getContractAt("AladdinFXS", proxy.address, deployer);

    await afxs.updateFeeInfo(PLATFORM, PLATFORM_FEE_PERCENTAGE, HARVEST_BOUNTY_PERCENTAGE, WITHDRAW_FEE_PERCENTAGE);
  });

  it("should initialize correctly", async () => {
    expect(await afxs.asset()).to.eq(CURVE_CVXFXS_TOKEN);
    expect(await afxs.totalSupply()).to.eq(constants.Zero);
    expect(await afxs.totalAssets()).to.eq(constants.Zero);
  });

  context("auth", async () => {
    it("should revert, when reinitialize", async () => {
      await expect(afxs.initialize(constants.AddressZero, [])).to.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    context("updateFeeInfo", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(afxs.connect(signer).updateFeeInfo(constants.AddressZero, 0, 0, 0)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when platform is zero", async () => {
        await expect(afxs.updateFeeInfo(constants.AddressZero, 0, 0, 0)).to.revertedWith("zero platform address");
      });

      it("should revert, when fee too large", async () => {
        await expect(afxs.updateFeeInfo(deployer.address, 2e8 + 1, 0, 0)).to.revertedWith("platform fee too large");
        await expect(afxs.updateFeeInfo(deployer.address, 0, 1e8 + 1, 0)).to.revertedWith("bounty fee too large");
        await expect(afxs.updateFeeInfo(deployer.address, 0, 0, 1e8 + 1)).to.revertedWith("withdraw fee too large");
      });

      it("should succeed", async () => {
        expect(await afxs.feeInfo()).to.deep.eq([
          PLATFORM,
          PLATFORM_FEE_PERCENTAGE,
          HARVEST_BOUNTY_PERCENTAGE,
          WITHDRAW_FEE_PERCENTAGE,
        ]);
        await expect(afxs.updateFeeInfo(deployer.address, 2e8, 1e8, 1e7))
          .to.emit(afxs, "UpdateFeeInfo")
          .withArgs(deployer.address, 2e8, 1e8, 1e7);
        expect(await afxs.feeInfo()).to.deep.eq([deployer.address, 2e8, 1e8, 1e7]);
      });
    });

    context("updateRewardPeriodLength", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(afxs.connect(signer).updateRewardPeriodLength(1)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect((await afxs.rewardInfo()).periodLength).to.eq(0);
        await expect(afxs.updateRewardPeriodLength(1)).to.emit(afxs, "UpdateRewardPeriodLength").withArgs(1);
        expect((await afxs.rewardInfo()).periodLength).to.eq(1);
      });
    });

    context("updateRewards", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(afxs.connect(signer).updateRewards([])).to.revertedWith("Ownable: caller is not the owner");
      });

      it("should revert, when reward is zero", async () => {
        await expect(afxs.updateRewards([constants.AddressZero])).to.revertedWith("aFXS: zero reward token");
      });

      it("should revert, when first is not FXS", async () => {
        await expect(afxs.updateRewards([CRV, FXS])).to.revertedWith("aFXS: first token not FXS");
      });

      it("should revert, when duplicated reward", async () => {
        await expect(afxs.updateRewards([CRV, CRV])).to.revertedWith("aFXS: duplicated reward token");
      });

      it("should succeed", async () => {
        expect(await afxs.rewards(0)).to.eq(FXS);
        expect(await afxs.rewards(1)).to.eq(CRV);
        expect(await afxs.rewards(2)).to.eq(CVX);
        await afxs.updateRewards([FXS, CVX, CRV]);
        expect(await afxs.rewards(0)).to.eq(FXS);
        expect(await afxs.rewards(1)).to.eq(CVX);
        expect(await afxs.rewards(2)).to.eq(CRV);
      });
    });

    context("updateZap", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(afxs.connect(signer).updateZap(constants.AddressZero)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when zap is zero", async () => {
        await expect(afxs.updateZap(constants.AddressZero)).to.revertedWith("aFXS: zero zap address");
      });

      it("should succeed", async () => {
        await expect(afxs.updateZap(deployer.address)).to.emit(afxs, "UpdateZap").withArgs(deployer.address);
        expect(await afxs.zap()).to.eq(deployer.address);
      });
    });
  });

  context("deposit/mint/withdraw/redeem", async () => {
    const assetsAmount = ethers.utils.parseEther("100");
    const sharesAmount = ethers.utils.parseEther("200");
    let token: IERC20;

    beforeEach(async () => {
      token = await ethers.getContractAt("IERC20", CURVE_CVXFXS_TOKEN, signer);
      await token.approve(afxs.address, constants.MaxUint256);
    });

    context("deposit", async () => {
      it("should revert, when deposit zero amount", async () => {
        await expect(afxs.deposit(0, deployer.address)).to.revertedWith("aFXS: deposit zero amount");
      });

      it("should succeed", async () => {
        const previewAmount = await afxs.previewDeposit(assetsAmount);
        await expect(afxs.connect(signer).deposit(assetsAmount, deployer.address))
          .to.emit(afxs, "Deposit")
          .withArgs(signer.address, deployer.address, assetsAmount, assetsAmount);
        expect(await afxs.totalAssets()).to.eq(assetsAmount);
        expect(await afxs.balanceOf(deployer.address)).to.eq(assetsAmount);
        expect(await afxs.balanceOf(deployer.address)).to.eq(previewAmount);
        expect(await afxs.totalSupply()).to.eq(assetsAmount);
      });
    });

    context("mint", async () => {
      it("should revert, when mint zero amount", async () => {
        await expect(afxs.mint(0, deployer.address)).to.revertedWith("aFXS: deposit zero amount");
      });

      it("should succeed", async () => {
        const previewAmount = await afxs.previewMint(sharesAmount);
        await expect(afxs.connect(signer).mint(sharesAmount, deployer.address))
          .to.emit(afxs, "Deposit")
          .withArgs(signer.address, deployer.address, sharesAmount, sharesAmount);
        expect(await afxs.totalAssets()).to.eq(sharesAmount);
        expect(await afxs.balanceOf(deployer.address)).to.eq(sharesAmount);
        expect(await afxs.balanceOf(deployer.address)).to.eq(previewAmount);
        expect(await afxs.totalSupply()).to.eq(sharesAmount);
      });
    });

    context("withdraw", async () => {
      beforeEach(async () => {
        await afxs.connect(signer).deposit(assetsAmount, signer.address);
      });

      it("should revert, when exceed total assets", async () => {
        await expect(
          afxs.connect(signer).withdraw(assetsAmount.add(1), deployer.address, signer.address)
        ).to.revertedWith("exceed total assets");
      });

      it("should revert, when exceeds allowance", async () => {
        await expect(afxs.connect(signer).withdraw(assetsAmount, deployer.address, deployer.address)).to.revertedWith(
          "withdraw exceeds allowance"
        );
      });

      it("should revert, when withdraw zero share", async () => {
        await expect(afxs.connect(signer).withdraw(0, deployer.address, signer.address)).to.revertedWith(
          "aFXS: withdraw zero share"
        );
      });

      it("should revert, when insufficient owner shares", async () => {
        await expect(afxs.connect(deployer).withdraw(1, deployer.address, deployer.address)).to.revertedWith(
          "aFXS: insufficient owner shares"
        );
      });

      it("should succeed", async () => {
        const withdrawAmount = assetsAmount.div(2);
        const preview = await afxs.previewWithdraw(withdrawAmount);
        await expect(afxs.connect(signer).withdraw(withdrawAmount, deployer.address, signer.address))
          .to.emit(afxs, "Withdraw")
          .withArgs(signer.address, deployer.address, signer.address, withdrawAmount, preview);
        expect(await afxs.totalAssets()).to.eq(assetsAmount.sub(withdrawAmount));
        expect(await afxs.balanceOf(signer.address)).to.eq(assetsAmount.sub(preview));
        expect(preview).to.eq(withdrawAmount.mul(1e9).div(1e9 - WITHDRAW_FEE_PERCENTAGE));
      });
    });

    context("redeem", async () => {
      beforeEach(async () => {
        await afxs.connect(signer).deposit(assetsAmount, signer.address);
      });

      it("should revert, when exceeds allowance", async () => {
        await expect(afxs.connect(signer).redeem(assetsAmount, deployer.address, deployer.address)).to.revertedWith(
          "redeem exceeds allowance"
        );
      });

      it("should revert, when withdraw zero share", async () => {
        await expect(afxs.connect(signer).redeem(0, deployer.address, signer.address)).to.revertedWith(
          "aFXS: withdraw zero share"
        );
      });

      it("should revert, when insufficient owner shares", async () => {
        await expect(afxs.connect(deployer).redeem(1, deployer.address, deployer.address)).to.revertedWith(
          "aFXS: insufficient owner shares"
        );
      });

      it("should succeed", async () => {
        const redeemAmount = assetsAmount.div(2);
        const fee = redeemAmount.mul(WITHDRAW_FEE_PERCENTAGE).div(1e9);
        const preview = await afxs.previewRedeem(redeemAmount);
        await expect(afxs.connect(signer).redeem(redeemAmount, deployer.address, signer.address))
          .to.emit(afxs, "Withdraw")
          .withArgs(signer.address, deployer.address, signer.address, preview, redeemAmount);
        expect(await afxs.totalAssets()).to.eq(assetsAmount.sub(redeemAmount.sub(fee)));
        expect(await afxs.balanceOf(signer.address)).to.eq(assetsAmount.sub(redeemAmount));
        expect(preview).to.eq(redeemAmount.sub(fee));
      });
    });

    context("distribute harvested reward intermediately", async () => {
      beforeEach(async () => {
        // deposit
        await afxs.connect(signer).deposit(assetsAmount, PLATFORM);
        await booster.earmarkRewards(72);
        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        // 7 days
        await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 3]);
        // harvest
        await afxs.harvest(PLATFORM, 0);
      });

      it("A deposit => harvest => B deposit => A redeem", async () => {
        let totalShares = await afxs.totalSupply();
        let totalAssets = await afxs.totalAssets();
        expect(totalAssets).to.gt(totalShares);

        // do deposit
        let previewDepositShares = await afxs.previewDeposit(assetsAmount);
        expect(previewDepositShares).to.eq(assetsAmount.mul(totalShares).div(totalAssets));
        let callDepositShares = await afxs.connect(signer).callStatic.deposit(assetsAmount, deployer.address);
        expect(callDepositShares).eq(previewDepositShares);
        await expect(afxs.connect(signer).deposit(assetsAmount, deployer.address))
          .to.emit(afxs, "Deposit")
          .withArgs(signer.address, deployer.address, assetsAmount, callDepositShares);
        expect(await afxs.totalSupply()).to.eq(totalShares.add(callDepositShares));
        expect(await afxs.totalAssets()).to.eq(totalAssets.add(assetsAmount));
        expect(await afxs.balanceOf(deployer.address)).to.eq(callDepositShares);

        totalAssets = totalAssets.add(assetsAmount);
        totalShares = totalShares.add(callDepositShares);

        // do harvest
        await booster.earmarkRewards(72);
        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 4]);
        const tx = await afxs.harvest(deployer.address, 0);
        const harvested = (await afxs.totalAssets()).sub(totalAssets);
        await expect(tx)
          .to.emit(afxs, "Harvest")
          .withArgs(
            deployer.address,
            deployer.address,
            harvested,
            harvested.mul(PLATFORM_FEE_PERCENTAGE).div(1e9),
            harvested.mul(HARVEST_BOUNTY_PERCENTAGE).div(1e9)
          );
        const callerShare = harvested.mul(HARVEST_BOUNTY_PERCENTAGE).div(1e9).mul(totalShares).div(totalAssets);
        const platformShare = harvested.mul(PLATFORM_FEE_PERCENTAGE).div(1e9).mul(totalShares).div(totalAssets);
        expect(await afxs.totalSupply()).to.eq(totalShares.add(callerShare).add(platformShare));
        totalShares = totalShares.add(callerShare).add(platformShare);
        totalAssets = totalAssets.add(harvested);

        // do deposit 2
        previewDepositShares = await afxs.previewDeposit(assetsAmount);
        expect(previewDepositShares).to.eq(assetsAmount.mul(totalShares).div(totalAssets));
        callDepositShares = await afxs.connect(signer).callStatic.deposit(assetsAmount, deployer.address);
        expect(callDepositShares).eq(previewDepositShares);
        await expect(afxs.connect(signer).deposit(assetsAmount, signer.address))
          .to.emit(afxs, "Deposit")
          .withArgs(signer.address, signer.address, assetsAmount, callDepositShares);
        expect(await afxs.totalSupply()).to.eq(totalShares.add(callDepositShares));
        expect(await afxs.totalAssets()).to.eq(totalAssets.add(assetsAmount));
        expect(await afxs.balanceOf(signer.address)).to.eq(callDepositShares);
        totalShares = totalShares.add(callDepositShares);
        totalAssets = totalAssets.add(assetsAmount);

        // deployer redeem
        const deployerShare = await afxs.balanceOf(deployer.address);
        const previewRedeemAmount = await afxs.previewRedeem(deployerShare);
        const redeemFee = deployerShare.mul(totalAssets).div(totalShares).mul(WITHDRAW_FEE_PERCENTAGE).div(1e9);
        expect(previewRedeemAmount).to.eq(deployerShare.mul(totalAssets).div(totalShares).sub(redeemFee));
        const callRedeemAmount = await afxs.callStatic.redeem(deployerShare, deployer.address, deployer.address);
        expect(callRedeemAmount).eq(previewRedeemAmount);
        await expect(afxs.redeem(deployerShare, deployer.address, deployer.address))
          .to.emit(afxs, "Withdraw")
          .withArgs(deployer.address, deployer.address, deployer.address, callRedeemAmount, deployerShare);
        expect(await token.balanceOf(deployer.address)).to.eq(callRedeemAmount);
        expect(await afxs.totalSupply()).to.eq(totalShares.sub(deployerShare));
        expect(await afxs.totalAssets()).to.eq(totalAssets.sub(callRedeemAmount));
        expect(await afxs.balanceOf(deployer.address)).to.eq(constants.Zero);
      });
    });

    context("distribute harvested reward in 7 days", async () => {
      beforeEach(async () => {
        await afxs.updateRewardPeriodLength(86400 * 7);
        await afxs.connect(signer).deposit(assetsAmount, PLATFORM);
      });

      it("A deposit => harvest => B deposit => A redeem => B redeem", async () => {
        let totalShares = await afxs.totalSupply();
        let totalAssets = await afxs.totalAssets();
        expect(totalAssets).to.eq(totalShares);

        // do deposit
        const previewDepositShares = await afxs.previewDeposit(assetsAmount);
        expect(previewDepositShares).to.eq(assetsAmount.mul(totalShares).div(totalAssets));
        let callDepositShares = await afxs.connect(signer).callStatic.deposit(assetsAmount, deployer.address);
        expect(callDepositShares).eq(previewDepositShares);
        await expect(afxs.connect(signer).deposit(assetsAmount, deployer.address))
          .to.emit(afxs, "Deposit")
          .withArgs(signer.address, deployer.address, assetsAmount, callDepositShares);
        expect(await afxs.totalSupply()).to.eq(totalShares.add(callDepositShares));
        expect(await afxs.totalAssets()).to.eq(totalAssets.add(assetsAmount));
        expect(await afxs.balanceOf(deployer.address)).to.eq(callDepositShares);

        totalAssets = totalAssets.add(assetsAmount);
        totalShares = totalShares.add(callDepositShares);

        // do harvest
        await booster.earmarkRewards(72);
        let timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
        const tx = await afxs.harvest(deployer.address, 0);
        timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        let harvested = (await rewarder.balanceOf(afxs.address)).sub(totalAssets);
        await expect(tx)
          .to.emit(afxs, "Harvest")
          .withArgs(
            deployer.address,
            deployer.address,
            harvested,
            harvested.mul(PLATFORM_FEE_PERCENTAGE).div(1e9),
            harvested.mul(HARVEST_BOUNTY_PERCENTAGE).div(1e9)
          );
        const callerShare = harvested.mul(HARVEST_BOUNTY_PERCENTAGE).div(1e9).mul(totalShares).div(totalAssets);
        const platformShare = harvested.mul(PLATFORM_FEE_PERCENTAGE).div(1e9).mul(totalShares).div(totalAssets);
        expect(await afxs.totalSupply()).to.eq(totalShares.add(callerShare).add(platformShare));
        expect(await afxs.totalAssets()).to.eq(
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
        await expect(afxs.connect(signer).deposit(assetsAmount, signer.address))
          .to.emit(afxs, "Deposit")
          .withArgs(signer.address, signer.address, assetsAmount, callDepositShares);
        timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        expect(await afxs.totalSupply()).to.eq(totalShares.add(callDepositShares));
        expect(await afxs.totalAssets()).to.eq(totalAssets.add(assetsAmount));
        expect(await afxs.balanceOf(signer.address)).to.eq(callDepositShares);
        totalShares = totalShares.add(callDepositShares);
        totalAssets = totalAssets.add(assetsAmount);

        // deployer redeem
        totalAssets = totalAssets.add(rate.mul(86400 * 3)); // 3days
        const deployerShare = await afxs.balanceOf(deployer.address);
        const redeemFee = deployerShare.mul(totalAssets).div(totalShares).mul(WITHDRAW_FEE_PERCENTAGE).div(1e9);
        const callRedeemAmount = deployerShare.mul(totalAssets).div(totalShares).sub(redeemFee);
        await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 3]);
        await expect(afxs.redeem(deployerShare, deployer.address, deployer.address))
          .to.emit(afxs, "Withdraw")
          .withArgs(deployer.address, deployer.address, deployer.address, callRedeemAmount, deployerShare);
        expect(await token.balanceOf(deployer.address)).to.eq(callRedeemAmount);
        expect(await afxs.totalSupply()).to.eq(totalShares.sub(deployerShare));
        expect(await afxs.totalAssets()).to.eq(totalAssets.sub(callRedeemAmount));
        expect(await afxs.balanceOf(deployer.address)).to.eq(constants.Zero);
      });
    });
  });

  context("zap with CompounderGateway", async () => {
    const config = VAULT_CONFIG.cvxfxs;

    let gateway: CompounderGateway;

    beforeEach(async () => {
      const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
      const logic = await TokenZapLogic.deploy();
      await logic.deployed();

      const CompounderGateway = await ethers.getContractFactory("CompounderGateway", deployer);
      gateway = await CompounderGateway.deploy(logic.address);
      await gateway.deployed();
    });

    context("deposit and withdraw", async () => {
      it("should succeed, when deposit with FXS and withdraw as FXS", async () => {
        const amountIn = ethers.utils.parseUnits("100", TOKENS.FXS.decimals);
        const sharesOut = ethers.utils.parseUnits("51.636833906528952410", 18);
        const holder = await ethers.getSigner(FXS_HOLDER);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });
        const token = await ethers.getContractAt("IERC20", FXS, holder);

        await token.connect(holder).approve(gateway.address, amountIn);
        await gateway.connect(holder).deposit(afxs.address, token.address, amountIn, config.deposit.FXS, sharesOut);
        expect(await afxs.balanceOf(holder.address)).to.eq(sharesOut);

        const amountOut = ethers.utils.parseUnits("99.703218840327784687", TOKENS.FXS.decimals);
        await afxs.connect(holder).approve(gateway.address, sharesOut);
        const balanceBefore = await token.balanceOf(holder.address);
        await gateway.connect(holder).withdraw(afxs.address, FXS, sharesOut, config.withdraw.FXS, amountOut);
        const balanceAfter = await token.balanceOf(holder.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(amountOut);
      });

      it("should succeed, when deposit with cvxFXS and withdraw as cvxFXS", async () => {
        const amountIn = ethers.utils.parseUnits("100", TOKENS.cvxFXS.decimals);
        const sharesOut = ethers.utils.parseUnits("48.410816743071109330", 18);
        const holder = await ethers.getSigner(cvxFXS_HOLDER);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });
        const token = await ethers.getContractAt("IERC20", cvxFXS, holder);

        await token.connect(holder).approve(gateway.address, amountIn);
        await gateway.connect(holder).deposit(afxs.address, token.address, amountIn, config.deposit.cvxFXS, sharesOut);
        expect(await afxs.balanceOf(holder.address)).to.eq(sharesOut);

        const amountOut = ethers.utils.parseUnits("99.703217795213135804", TOKENS.cvxFXS.decimals);
        await afxs.connect(holder).approve(gateway.address, sharesOut);
        const balanceBefore = await token.balanceOf(holder.address);
        await gateway.connect(holder).withdraw(afxs.address, cvxFXS, sharesOut, config.withdraw.cvxFXS, amountOut);
        const balanceAfter = await token.balanceOf(holder.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(amountOut);
      });

      it("should succeed, when deposit with USDC and withdraw as USDC", async () => {
        const amountIn = ethers.utils.parseUnits("1000", TOKENS.USDC.decimals);
        const sharesOut = ethers.utils.parseUnits("107.445527269921472409", 18);
        const holder = await ethers.getSigner(USDC_HOLDER);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });
        const token = await ethers.getContractAt("IERC20", USDC, holder);

        await token.connect(holder).approve(gateway.address, amountIn);
        await gateway.connect(holder).deposit(afxs.address, token.address, amountIn, config.deposit.USDC, sharesOut);
        expect(await afxs.balanceOf(holder.address)).to.eq(sharesOut);

        const amountOut = ethers.utils.parseUnits("990.068500", TOKENS.USDC.decimals);
        await afxs.connect(holder).approve(gateway.address, sharesOut);
        const balanceBefore = await token.balanceOf(holder.address);
        await gateway.connect(holder).withdraw(afxs.address, USDC, sharesOut, config.withdraw.USDC, amountOut);
        const balanceAfter = await token.balanceOf(holder.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(amountOut);
      });

      it("should succeed, when deposit with WETH and withdraw as WETH", async () => {
        const amountIn = ethers.utils.parseUnits("10", TOKENS.WETH.decimals);
        const sharesOut = ethers.utils.parseUnits("1130.942371874806551841", 18);
        const holder = await ethers.getSigner(WETH_HOLDER);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });
        const token = await ethers.getContractAt("IERC20", WETH, holder);

        await token.connect(holder).approve(gateway.address, amountIn);
        await gateway.connect(holder).deposit(afxs.address, token.address, amountIn, config.deposit.WETH, sharesOut);
        expect(await afxs.balanceOf(holder.address)).to.eq(sharesOut);

        const amountOut = ethers.utils.parseUnits("9.890823949367958261", TOKENS.WETH.decimals);
        await afxs.connect(holder).approve(gateway.address, sharesOut);
        const balanceBefore = await token.balanceOf(holder.address);
        await gateway.connect(holder).withdraw(afxs.address, WETH, sharesOut, config.withdraw.WETH, amountOut);
        const balanceAfter = await token.balanceOf(holder.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(amountOut);
      });

      it("should succeed, when deposit with ETH and withdraw as ETH", async () => {
        const amountIn = ethers.utils.parseUnits("10", TOKENS.WETH.decimals);
        const sharesOut = ethers.utils.parseUnits("1130.942371874806551841", 18);
        const holder = await ethers.getSigner(WETH_HOLDER);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10").add(amountIn) });

        await gateway
          .connect(holder)
          .deposit(afxs.address, constants.AddressZero, amountIn, config.deposit.WETH, sharesOut, { value: amountIn });
        expect(await afxs.balanceOf(holder.address)).to.eq(sharesOut);

        const amountOut = ethers.utils.parseUnits("9.890823949367958261", TOKENS.WETH.decimals);
        await afxs.connect(holder).approve(gateway.address, sharesOut);
        const balanceBefore = await holder.getBalance();
        const tx = await gateway
          .connect(holder)
          .withdraw(afxs.address, constants.AddressZero, sharesOut, config.withdraw.WETH, amountOut);
        const receipt = await tx.wait();
        const balanceAfter = await holder.getBalance();
        expect(balanceAfter.sub(balanceBefore).add(receipt.gasUsed.mul(receipt.effectiveGasPrice))).to.eq(amountOut);
      });
    });
  });
});

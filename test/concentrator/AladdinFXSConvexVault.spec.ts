/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import {
  AladdinFXS,
  AladdinFXSConvexVault,
  AladdinZap,
  ConcentratorGateway,
  IConvexBasicRewards,
  IConvexBooster,
  IERC20,
} from "../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../utils";
import { ADDRESS, AFXS_VAULTS, TOKENS, VAULT_CONFIG, ZAP_ROUTES } from "../../scripts/utils";

const FORK_BLOCK_NUMBER = 15302700;
const FXS = TOKENS.FXS.address;
const CVX = TOKENS.CVX.address;
const CRV = TOKENS.CRV.address;

const FRAX = TOKENS.FRAX.address;
const FRAX_HOLDER = "0x10c6b61dbf44a083aec3780acf769c77be747e23";

const CONVEX_FRAX3CRV_PID = 32;
const CURVE_FRAX3CRV_TOKEN = ADDRESS.CURVE_FRAX3CRV_TOKEN;
const CURVE_FRAX3CRV_HOLDER = "0x005fb56fe0401a4017e6f046272da922bbf8df06";

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const REWARDER = "0xf27AFAD0142393e4b3E5510aBc5fe3743Ad669Cb";

const PLATFORM = "0x07dA2d30E26802ED65a52859a50872cfA615bD0A";
const WITHDRAW_FEE_PERCENTAGE = 1e7; // 1%
const PLATFORM_FEE_PERCENTAGE = 2e8; // 20%
const HARVEST_BOUNTY_PERCENTAGE = 5e7; // 5%

const PRINT_ZAP = true;

if (PRINT_ZAP) {
  AFXS_VAULTS.forEach(({ name, fees }) => {
    const config = VAULT_CONFIG[name];
    console.log(
      `add pool[${name}]:`,
      `convexId[${config.convexId}]`,
      `rewards[${config.rewards}]`,
      `withdrawFee[${fees.withdraw}]`,
      `platformFee[${fees.platform}]`,
      `harvestBounty[${fees.harvest}]`
    );
  });
  console.log("{");
  AFXS_VAULTS.forEach(({ name }) => {
    const config = VAULT_CONFIG[name];
    console.log(`  "${name}": [`);
    Object.entries(config.deposit).forEach(([symbol, routes]) => {
      console.log(
        `    {"symbol": "${symbol}", "address": "${TOKENS[symbol].address}", "routes": [${routes
          .map((x) => `"${x.toHexString()}"`)
          .join(",")}]},`
      );
    });
    console.log(`  ],`);
  });
  console.log("}");
}

describe("AladdinFXSConvexVault.spec", async () => {
  let deployer: SignerWithAddress;
  let signer: SignerWithAddress;
  let zap: AladdinZap;
  let afxs: AladdinFXS;
  let vault: AladdinFXSConvexVault;
  // eslint-disable-next-line no-unused-vars
  let booster: IConvexBooster;
  // eslint-disable-next-line no-unused-vars
  let rewarder: IConvexBasicRewards;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_FRAX3CRV_HOLDER, FRAX_HOLDER]);
    deployer = await ethers.getSigner(DEPLOYER);
    signer = await ethers.getSigner(CURVE_FRAX3CRV_HOLDER);
    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    booster = await ethers.getContractAt("IConvexBooster", BOOSTER, deployer);
    rewarder = await ethers.getContractAt("IConvexBasicRewards", REWARDER, deployer);

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin", deployer);
    const proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();

    const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
    zap = await AladdinZap.deploy();
    await zap.initialize();

    for (const [from, to] of [
      ["CRV", "FXS"],
      ["CVX", "FXS"],
    ]) {
      const routes = ZAP_ROUTES[from][to];
      await zap.updateRoute(TOKENS[from].address, TOKENS[to].address, routes);
    }

    {
      const AladdinFXS = await ethers.getContractFactory("AladdinFXS", deployer);
      const impl = await AladdinFXS.deploy();
      await impl.deployed();
      const data = impl.interface.encodeFunctionData("initialize", [zap.address, [FXS, CRV, CVX]]);
      const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
      const proxy = await TransparentUpgradeableProxy.deploy(impl.address, proxyAdmin.address, data);
      await proxy.deployed();
      afxs = await ethers.getContractAt("AladdinFXS", proxy.address, deployer);
    }
    await afxs.updateFeeInfo(PLATFORM, PLATFORM_FEE_PERCENTAGE, HARVEST_BOUNTY_PERCENTAGE, WITHDRAW_FEE_PERCENTAGE);

    {
      const AladdinFXSConvexVault = await ethers.getContractFactory("AladdinFXSConvexVault", deployer);
      const impl = await AladdinFXSConvexVault.deploy();
      await impl.deployed();
      const data = impl.interface.encodeFunctionData("initialize", [afxs.address, zap.address, PLATFORM]);
      const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
      const proxy = await TransparentUpgradeableProxy.deploy(impl.address, proxyAdmin.address, data);
      await proxy.deployed();
      vault = await ethers.getContractAt("AladdinFXSConvexVault", proxy.address, deployer);
    }
  });

  it("should initialize correctly", async () => {
    expect(await vault.aladdinFXS()).to.eq(afxs.address);
    expect(await vault.platform()).to.eq(PLATFORM);
    expect(await vault.zap()).to.eq(zap.address);
  });

  context("auth", async () => {
    it("should revert, when reinitialize", async () => {
      await expect(
        vault.initialize(constants.AddressZero, constants.AddressZero, constants.AddressZero)
      ).to.revertedWith("Initializable: contract is already initialized");
    });

    context("updateWithdrawFeePercentage", async () => {
      beforeEach(async () => {
        await vault.addPool(0, [], 0, 0, 0);
      });

      it("should revert, when non-owner call", async () => {
        await expect(vault.connect(signer).updateWithdrawFeePercentage(0, 1)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when update non-exsit pool", async () => {
        await expect(vault.updateWithdrawFeePercentage(1, 1)).to.revertedWith("pool not exist");
      });

      it("should revert, when fee too large", async () => {
        await expect(vault.updateWithdrawFeePercentage(0, 1e8 + 1)).to.revertedWith("fee too large");
      });

      it("should succeed", async () => {
        expect((await vault.poolInfo(0)).withdrawFeePercentage).to.eq(0);
        await expect(vault.updateWithdrawFeePercentage(0, 1e8))
          .to.emit(vault, "UpdateWithdrawalFeePercentage")
          .withArgs(0, 1e8);
        expect((await vault.poolInfo(0)).withdrawFeePercentage).to.eq(1e8);
      });
    });

    context("updatePlatformFeePercentage", async () => {
      beforeEach(async () => {
        await vault.addPool(0, [], 0, 0, 0);
      });

      it("should revert, when non-owner call", async () => {
        await expect(vault.connect(signer).updatePlatformFeePercentage(0, 1)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when update non-exsit pool", async () => {
        await expect(vault.updatePlatformFeePercentage(1, 1)).to.revertedWith("pool not exist");
      });

      it("should revert, when fee too large", async () => {
        await expect(vault.updatePlatformFeePercentage(0, 2e8 + 1)).to.revertedWith("fee too large");
      });

      it("should succeed", async () => {
        expect((await vault.poolInfo(0)).platformFeePercentage).to.eq(0);
        await expect(vault.updatePlatformFeePercentage(0, 2e8))
          .to.emit(vault, "UpdatePlatformFeePercentage")
          .withArgs(0, 2e8);
        expect((await vault.poolInfo(0)).platformFeePercentage).to.eq(2e8);
      });
    });

    context("updateHarvestBountyPercentage", async () => {
      beforeEach(async () => {
        await vault.addPool(0, [], 0, 0, 0);
      });

      it("should revert, when non-owner call", async () => {
        await expect(vault.connect(signer).updateHarvestBountyPercentage(0, 1)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when update non-exsit pool", async () => {
        await expect(vault.updateHarvestBountyPercentage(1, 1)).to.revertedWith("pool not exist");
      });

      it("should revert, when fee too large", async () => {
        await expect(vault.updateHarvestBountyPercentage(0, 1e8 + 1)).to.revertedWith("fee too large");
      });

      it("should succeed", async () => {
        expect((await vault.poolInfo(0)).harvestBountyPercentage).to.eq(0);
        await expect(vault.updateHarvestBountyPercentage(0, 1e8))
          .to.emit(vault, "UpdateHarvestBountyPercentage")
          .withArgs(0, 1e8);
        expect((await vault.poolInfo(0)).harvestBountyPercentage).to.eq(1e8);
      });
    });

    context("updatePlatform", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(vault.connect(signer).updatePlatform(constants.AddressZero)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when update to zero", async () => {
        await expect(vault.updatePlatform(constants.AddressZero)).to.revertedWith("zero platform address");
      });

      it("should succeed", async () => {
        expect(await vault.platform()).to.eq(PLATFORM);
        await expect(vault.updatePlatform(deployer.address))
          .to.emit(vault, "UpdatePlatform")
          .withArgs(deployer.address);
        expect(await vault.platform()).to.eq(deployer.address);
      });
    });

    context("updateRewardPeriod", async () => {
      beforeEach(async () => {
        await vault.addPool(0, [], 0, 0, 0);
      });

      it("should revert, when non-owner call", async () => {
        await expect(vault.connect(signer).updateRewardPeriod(0, 1)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when update non-exsit pool", async () => {
        await expect(vault.updateRewardPeriod(1, 1)).to.revertedWith("pool not exist");
      });

      it("should revert, when period too long", async () => {
        await expect(vault.updateRewardPeriod(0, 86400 * 7 + 1)).to.revertedWith("reward period too long");
      });

      it("should succeed", async () => {
        expect((await vault.rewardInfo(0)).periodLength).to.eq(0);
        await expect(vault.updateRewardPeriod(0, 86400 * 7))
          .to.emit(vault, "UpdateRewardPeriod")
          .withArgs(0, 86400 * 7);
        expect((await vault.rewardInfo(0)).periodLength).to.eq(86400 * 7);
      });
    });

    context("updatePoolRewardTokens", async () => {
      beforeEach(async () => {
        await vault.addPool(0, [], 0, 0, 0);
      });

      it("should revert, when non-owner call", async () => {
        await expect(vault.connect(signer).updatePoolRewardTokens(0, [])).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when update non-exsit pool", async () => {
        await expect(vault.updatePoolRewardTokens(1, [])).to.revertedWith("pool not exist");
      });

      it("should succeed", async () => {
        await expect(vault.updatePoolRewardTokens(0, [CRV]))
          .to.emit(vault, "UpdatePoolRewardTokens")
          .withArgs(0, [CRV]);
      });
    });

    context("pausePoolWithdraw", async () => {
      beforeEach(async () => {
        await vault.addPool(0, [], 0, 0, 0);
      });

      it("should revert, when non-owner call", async () => {
        await expect(vault.connect(signer).pausePoolWithdraw(0, false)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when update non-exsit pool", async () => {
        await expect(vault.pausePoolWithdraw(1, false)).to.revertedWith("pool not exist");
      });

      it("should succeed", async () => {
        expect((await vault.poolInfo(0)).pauseWithdraw).to.eq(false);
        await expect(vault.pausePoolWithdraw(0, true)).to.emit(vault, "PausePoolWithdraw").withArgs(0, true);
        expect((await vault.poolInfo(0)).pauseWithdraw).to.eq(true);
        await expect(vault.pausePoolWithdraw(0, false)).to.emit(vault, "PausePoolWithdraw").withArgs(0, false);
        expect((await vault.poolInfo(0)).pauseWithdraw).to.eq(false);
      });
    });

    context("pausePoolDeposit", async () => {
      beforeEach(async () => {
        await vault.addPool(0, [], 0, 0, 0);
      });

      it("should revert, when non-owner call", async () => {
        await expect(vault.connect(signer).pausePoolDeposit(0, false)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when update non-exsit pool", async () => {
        await expect(vault.pausePoolDeposit(1, false)).to.revertedWith("pool not exist");
      });

      it("should succeed", async () => {
        expect((await vault.poolInfo(0)).pauseDeposit).to.eq(false);
        await expect(vault.pausePoolDeposit(0, true)).to.emit(vault, "PausePoolDeposit").withArgs(0, true);
        expect((await vault.poolInfo(0)).pauseDeposit).to.eq(true);
        await expect(vault.pausePoolDeposit(0, false)).to.emit(vault, "PausePoolDeposit").withArgs(0, false);
        expect((await vault.poolInfo(0)).pauseDeposit).to.eq(false);
      });
    });

    context("addPool", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(vault.connect(signer).addPool(0, [], 0, 0, 0)).to.revertedWith("Ownable: caller is not the owner");
      });

      it("should revert, when duplicated pool", async () => {
        await vault.addPool(0, [], 0, 0, 0);
        await expect(vault.addPool(0, [], 0, 0, 0)).to.revertedWith("duplicate pool");
      });

      it("should revert, when fee too large", async () => {
        await expect(vault.addPool(0, [], 1e8 + 1, 0, 0)).to.revertedWith("fee too large");
        await expect(vault.addPool(0, [], 0, 2e8 + 1, 0)).to.revertedWith("fee too large");
        await expect(vault.addPool(0, [], 0, 0, 1e8 + 1)).to.revertedWith("fee too large");
      });

      it("should succeed", async () => {
        await expect(vault.addPool(1, [CVX, CRV], 1e8, 2e8, 1e8))
          .to.emit(vault, "AddPool")
          .withArgs(0, 1, [CVX, CRV]);
        expect((await vault.poolInfo(0)).withdrawFeePercentage).to.eq(1e8);
        expect((await vault.poolInfo(0)).platformFeePercentage).to.eq(2e8);
        expect((await vault.poolInfo(0)).harvestBountyPercentage).to.eq(1e8);
        expect((await vault.poolInfo(0)).pauseDeposit).to.eq(false);
        expect((await vault.poolInfo(0)).pauseWithdraw).to.eq(false);
        expect((await vault.poolInfo(0)).convexPoolId).to.eq(1);
        expect((await vault.poolInfo(0)).totalShare).to.eq(0);
        expect((await vault.poolInfo(0)).totalUnderlying).to.eq(0);
        expect((await vault.poolInfo(0)).accRewardPerShare).to.eq(0);
        expect((await vault.rewardInfo(0)).rate).to.eq(0);
        expect((await vault.rewardInfo(0)).periodLength).to.eq(0);
        expect((await vault.rewardInfo(0)).lastUpdate).to.eq(0);
        expect((await vault.rewardInfo(0)).finishAt).to.eq(0);
      });
    });
  });

  context("deposit", async () => {
    let token: IERC20;

    beforeEach(async () => {
      await vault.addPool(
        CONVEX_FRAX3CRV_PID,
        [CRV, CVX, FXS],
        WITHDRAW_FEE_PERCENTAGE,
        PLATFORM_FEE_PERCENTAGE,
        HARVEST_BOUNTY_PERCENTAGE
      );
      token = await ethers.getContractAt("IERC20", CURVE_FRAX3CRV_TOKEN, signer);
    });

    it("should revert, when deposit to non-exist pool", async () => {
      await expect(vault.connect(signer).deposit(1, signer.address, 1)).to.revertedWith("pool not exist");
    });

    it("should revert, when deposit zero amount", async () => {
      await expect(vault.connect(signer).deposit(0, signer.address, 0)).to.revertedWith("deposit zero amount");
    });

    it("should revert, when pool paused", async () => {
      await vault.pausePoolDeposit(0, true);
      await expect(vault.connect(signer).deposit(0, signer.address, 1)).to.revertedWith("pool paused");
    });

    it("should succeed, when deposit 10 lp to signer", async () => {
      const amount = ethers.utils.parseEther("10");
      await token.connect(signer).approve(vault.address, amount);
      await expect(vault.connect(signer).deposit(0, signer.address, amount))
        .to.emit(vault, "Deposit")
        .withArgs(0, signer.address, signer.address, amount, amount);
      expect(await vault.getUserShare(0, signer.address)).to.eq(amount);
      expect(await vault.getTotalShare(0)).to.eq(amount);
      expect(await vault.getTotalUnderlying(0)).to.eq(amount);
    });

    it("should succeed, when deposit 10 lp to deployer", async () => {
      const amount = ethers.utils.parseEther("10");
      await token.connect(signer).approve(vault.address, amount);
      await expect(vault.connect(signer).deposit(0, deployer.address, amount))
        .to.emit(vault, "Deposit")
        .withArgs(0, signer.address, deployer.address, amount, amount);
      expect(await vault.getUserShare(0, deployer.address)).to.eq(amount);
      expect(await vault.getTotalShare(0)).to.eq(amount);
      expect(await vault.getTotalUnderlying(0)).to.eq(amount);
    });

    it("should succeed, when deposit all lp to signer", async () => {
      const amount = await token.balanceOf(signer.address);
      await token.connect(signer).approve(vault.address, amount);
      await expect(vault.connect(signer).deposit(0, signer.address, constants.MaxUint256))
        .to.emit(vault, "Deposit")
        .withArgs(0, signer.address, signer.address, amount, amount);
      expect(await vault.getUserShare(0, signer.address)).to.eq(amount);
      expect(await vault.getTotalShare(0)).to.eq(amount);
      expect(await vault.getTotalUnderlying(0)).to.eq(amount);
    });
  });

  context("withdraw", async () => {
    const amountIn = ethers.utils.parseEther("100");
    let token: IERC20;

    beforeEach(async () => {
      await vault.addPool(
        CONVEX_FRAX3CRV_PID,
        [CRV, CVX, FXS],
        WITHDRAW_FEE_PERCENTAGE,
        PLATFORM_FEE_PERCENTAGE,
        HARVEST_BOUNTY_PERCENTAGE
      );
      token = await ethers.getContractAt("IERC20", CURVE_FRAX3CRV_TOKEN, signer);
      await token.connect(signer).approve(vault.address, amountIn);
      await vault.connect(signer).deposit(0, signer.address, amountIn);
      expect(await vault.getUserShare(0, signer.address)).to.eq(amountIn);
      expect(await vault.getTotalShare(0)).to.eq(amountIn);
      expect(await vault.getTotalUnderlying(0)).to.eq(amountIn);
    });

    it("should revert, when withdraw to non-exist pool", async () => {
      await expect(vault.connect(signer).withdraw(1, 1, signer.address, signer.address)).to.revertedWith(
        "pool not exist"
      );
    });

    it("should revert, when withdraw zero amount", async () => {
      await expect(vault.connect(signer).withdraw(0, 0, signer.address, signer.address)).to.revertedWith(
        "withdraw zero share"
      );
    });

    it("should revert, when pool paused", async () => {
      await vault.pausePoolWithdraw(0, true);
      await expect(vault.connect(signer).withdraw(0, 1, signer.address, signer.address)).to.revertedWith("pool paused");
    });

    it("should succeed, when withdraw 10 share to signer", async () => {
      const share = ethers.utils.parseEther("10");
      const fee = share.mul(WITHDRAW_FEE_PERCENTAGE).div(1e9);
      const beforeBalance = await token.balanceOf(signer.address);
      await expect(vault.connect(signer).withdraw(0, share, signer.address, signer.address))
        .to.emit(vault, "Withdraw")
        .withArgs(0, signer.address, signer.address, signer.address, share, share.sub(fee));
      const afterBalance = await token.balanceOf(signer.address);
      expect(afterBalance.sub(beforeBalance)).to.eq(share.sub(fee));
      expect(await vault.getUserShare(0, signer.address)).to.eq(amountIn.sub(share));
      expect(await vault.getTotalShare(0)).to.eq(amountIn.sub(share));
      expect(await vault.getTotalUnderlying(0)).to.eq(amountIn.sub(share.sub(fee)));
    });

    it("should succeed, when withdraw 10 share to deployer", async () => {
      const share = ethers.utils.parseEther("10");
      const fee = share.mul(WITHDRAW_FEE_PERCENTAGE).div(1e9);
      const beforeBalance = await token.balanceOf(deployer.address);
      await expect(vault.connect(signer).withdraw(0, share, deployer.address, signer.address))
        .to.emit(vault, "Withdraw")
        .withArgs(0, signer.address, signer.address, deployer.address, share, share.sub(fee));
      const afterBalance = await token.balanceOf(deployer.address);
      expect(afterBalance.sub(beforeBalance)).to.eq(share.sub(fee));
      expect(await vault.getUserShare(0, signer.address)).to.eq(amountIn.sub(share));
      expect(await vault.getTotalShare(0)).to.eq(amountIn.sub(share));
      expect(await vault.getTotalUnderlying(0)).to.eq(amountIn.sub(share.sub(fee)));
    });

    it("should succeed, when withdraw all share to signer", async () => {
      const share = amountIn;
      const beforeBalance = await token.balanceOf(signer.address);
      await expect(vault.connect(signer).withdraw(0, share, signer.address, signer.address))
        .to.emit(vault, "Withdraw")
        .withArgs(0, signer.address, signer.address, signer.address, share, share);
      const afterBalance = await token.balanceOf(signer.address);
      expect(afterBalance.sub(beforeBalance)).to.eq(share);
      expect(await vault.getUserShare(0, signer.address)).to.eq(0);
      expect(await vault.getTotalShare(0)).to.eq(0);
      expect(await vault.getTotalUnderlying(0)).to.eq(0);
    });

    it("should revert, when withdraw exceeds allowance", async () => {
      await expect(vault.withdraw(0, 1, signer.address, signer.address)).to.revertedWith("withdraw exceeds allowance");
    });

    it("should succeed, when withdraw with approve", async () => {
      const share = ethers.utils.parseEther("10");
      expect(await vault.allowance(0, signer.address, deployer.address)).to.eq(0);
      await vault.connect(signer).approve(0, deployer.address, share);
      expect(await vault.allowance(0, signer.address, deployer.address)).to.eq(share);

      const fee = share.mul(WITHDRAW_FEE_PERCENTAGE).div(1e9);
      const beforeBalance = await token.balanceOf(deployer.address);
      await expect(vault.withdraw(0, share, deployer.address, signer.address))
        .to.emit(vault, "Withdraw")
        .withArgs(0, deployer.address, signer.address, deployer.address, share, share.sub(fee));
      const afterBalance = await token.balanceOf(deployer.address);
      expect(await vault.allowance(0, signer.address, deployer.address)).to.eq(0);

      expect(afterBalance.sub(beforeBalance)).to.eq(share.sub(fee));
      expect(await vault.getUserShare(0, signer.address)).to.eq(amountIn.sub(share));
      expect(await vault.getTotalShare(0)).to.eq(amountIn.sub(share));
      expect(await vault.getTotalUnderlying(0)).to.eq(amountIn.sub(share.sub(fee)));
    });
  });

  context("zap with ConcentratorGateway", async () => {
    const config = VAULT_CONFIG.frax;

    let gateway: ConcentratorGateway;

    beforeEach(async () => {
      const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
      const logic = await TokenZapLogic.deploy();
      await logic.deployed();

      const ConcentratorGateway = await ethers.getContractFactory("ConcentratorGateway", deployer);
      gateway = await ConcentratorGateway.deploy(logic.address);
      await gateway.deployed();

      await vault.addPool(
        CONVEX_FRAX3CRV_PID,
        [CRV, CVX, FXS],
        WITHDRAW_FEE_PERCENTAGE,
        PLATFORM_FEE_PERCENTAGE,
        HARVEST_BOUNTY_PERCENTAGE
      );
    });

    it("should succeed, when deposit with FRAX", async () => {
      const amountIn = ethers.utils.parseUnits("100", TOKENS.FRAX.decimals);
      const sharesOut = ethers.utils.parseUnits("99.148734526204552604", 18);
      const holder = await ethers.getSigner(FRAX_HOLDER);
      await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });
      const token = await ethers.getContractAt("IERC20", FRAX, holder);

      await token.connect(holder).approve(gateway.address, amountIn);
      await gateway
        .connect(holder)
        .deposit(vault.address, 0, token.address, CURVE_FRAX3CRV_TOKEN, amountIn, config.deposit.FRAX, sharesOut);
      console.log(vault.address, 0, token.address, CURVE_FRAX3CRV_TOKEN, amountIn, config.deposit.FRAX, 0);
      expect(await vault.getUserShare(0, holder.address)).to.eq(sharesOut);
    });
  });
});

/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { MaxUint256, ZeroAddress, toBigInt } from "ethers";
import { ethers, network } from "hardhat";

import { ConcentratorStakeDAODeployment } from "@/contracts/ConcentratorStakeDAO";
import { MultisigDeployment } from "@/contracts/Multisig";
import { ProxyAdminDeployment } from "@/contracts/ProxyAdmin";
import { mockETHBalance, request_fork } from "@/test/utils";
import {
  AladdinSdCRV,
  ConcentratorSdCrvGaugeWrapper,
  MockERC20,
  SdCRVBribeBurnerV2,
  SdCrvCompounder,
  StakeDAOCRVVault,
  ConcentratorStakeDAOLocker,
  VeSDTDelegation,
  ProxyAdmin,
  LegacyCompounderStash,
} from "@/types/index";
import { TOKENS, selectDeployments } from "@/utils/index";

const FORK_BLOCK_NUMBER = 18725800;

const CRV_HOLDER = "0x9B44473E223f8a3c047AD86f387B80402536B029";
const SD_VE_CRV_HOLDER = "0xaa0FC588529dF72f71e3D758A69b897341195208";
const SDCRV_HOLDER = "0x25431341A5800759268a6aC1d3CD91C029D7d9CA";
const SDCRV_GAUGE_HOLDER = "0xb0e83C2D71A991017e0116d58c5765Abc57384af";

const SDCRV_GAUGE = "0x7f50786A0b15723D741727882ee99a0BF34e3466";
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const OPERATOR = "0x66c57bF505A85A74609D2C83E94Aabb26d691E1F";
const MERKLE_OWNER = "0x2f18e001B44DCc1a1968553A2F32ab8d45B12195";

const MULTISIG = selectDeployments("mainnet", "Multisig").toObject() as MultisigDeployment;
const PROXY_ADMIN = selectDeployments("mainnet", "ProxyAdmin").toObject() as ProxyAdminDeployment;
const DEPLOYMENT = selectDeployments("mainnet", "Concentrator.StakeDAO").toObject() as ConcentratorStakeDAODeployment;

const ERROR_PRECISION = 10n ** 6n;

describe("SdCrvCompounder.spec", async () => {
  let deployer: HardhatEthersSigner;
  let operator: HardhatEthersSigner;

  let owner: HardhatEthersSigner;
  let admin: ProxyAdmin;

  let locker: ConcentratorStakeDAOLocker;
  let delegation: VeSDTDelegation;
  let legacyVault: StakeDAOCRVVault;
  let burner: SdCRVBribeBurnerV2;
  let wrapper: ConcentratorSdCrvGaugeWrapper;

  let stash: LegacyCompounderStash;
  let asdcrv: AladdinSdCRV;
  let compounder: SdCrvCompounder;
  let compounderImpl: SdCrvCompounder;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [
      DEPLOYER,
      OPERATOR,
      CRV_HOLDER,
      SD_VE_CRV_HOLDER,
      SDCRV_HOLDER,
      SDCRV_GAUGE_HOLDER,
      MERKLE_OWNER,
      MULTISIG.Concentrator,
    ]);
    deployer = await ethers.getSigner(DEPLOYER);
    operator = await ethers.getSigner(OPERATOR);
    owner = await ethers.getSigner(MULTISIG.Concentrator);
    await mockETHBalance(MULTISIG.Concentrator, ethers.parseEther("10"));
    await mockETHBalance(OPERATOR, ethers.parseEther("10"));

    admin = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN.Concentrator, owner);
    locker = await ethers.getContractAt(
      "ConcentratorStakeDAOLocker",
      DEPLOYMENT.ConcentratorStakeDAOLocker.proxy,
      deployer
    );
    delegation = await ethers.getContractAt("VeSDTDelegation", DEPLOYMENT.VeSDTDelegation.proxy, deployer);
    legacyVault = await ethers.getContractAt("StakeDAOCRVVault", DEPLOYMENT.StakeDAOCRVVault.proxy, deployer);

    // upgrade ConcentratorStakeDAOLocker
    {
      const ConcentratorStakeDAOLocker = await ethers.getContractFactory("ConcentratorStakeDAOLocker", deployer);
      const impl = await ConcentratorStakeDAOLocker.deploy();
      await admin.upgrade(locker.getAddress(), impl.getAddress());
    }

    const ConcentratorSdCrvGaugeWrapper = await ethers.getContractFactory("ConcentratorSdCrvGaugeWrapper", deployer);
    wrapper = await ConcentratorSdCrvGaugeWrapper.deploy(SDCRV_GAUGE, locker.getAddress(), delegation.getAddress());

    const SdCRVBribeBurnerV2 = await ethers.getContractFactory("SdCRVBribeBurnerV2", deployer);
    burner = await SdCRVBribeBurnerV2.deploy(wrapper.getAddress());

    await locker.connect(owner).updateOperator(SDCRV_GAUGE, wrapper.getAddress());
    await wrapper.initialize(MULTISIG.Concentrator, burner.getAddress());
    await locker.connect(owner).updateGaugeRewardReceiver(SDCRV_GAUGE, await wrapper.stash());
    await locker.connect(owner).updateClaimer(wrapper.getAddress());

    const SdCrvCompounder = await ethers.getContractFactory("SdCrvCompounder", deployer);
    compounderImpl = await SdCrvCompounder.deploy(legacyVault.getAddress(), wrapper.getAddress());

    compounder = await ethers.getContractAt("SdCrvCompounder", DEPLOYMENT.SdCRVCompounder.proxy);
    asdcrv = await ethers.getContractAt("AladdinSdCRV", DEPLOYMENT.SdCRVCompounder.proxy);

    const LegacyCompounderStash = await ethers.getContractFactory("LegacyCompounderStash", deployer);
    stash = await LegacyCompounderStash.deploy(asdcrv.getAddress());

    // upgrade AladdinSdCRV to SdCrvCompounder
    {
      const feeInfo = await asdcrv.feeInfo();
      const rewardInfo = await asdcrv.rewardInfo();
      const asset = await asdcrv.asset();
      const totalSupply = await asdcrv.totalSupply();
      const zap = await asdcrv.zap();
      await admin.upgrade(compounder.getAddress(), compounderImpl.getAddress());
      await compounder.initializeV2(stash.getAddress());
      expect(await compounder.feeInfo()).to.deep.eq(feeInfo);
      expect(await compounder.rewardInfo()).to.deep.eq(rewardInfo);
      expect(await compounder.asset()).to.eq(asset);
      expect(await compounder.totalSupply()).to.eq(totalSupply);
      expect(await compounder.zap()).to.eq(zap);
    }
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      expect(await compounder.stash()).to.eq(await stash.getAddress());
      expect(await compounder.withdrawLockTime()).to.eq(0n);
    });

    it("should revert when initialize again", async () => {
      await expect(compounder.initializeV2(ZeroAddress)).to.revertedWith("asdCRV: v2 initialized");
    });
  });

  context("auth", async () => {
    context("updateZap", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(compounder.connect(operator).updateZap(ZeroAddress)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when zap is zero", async () => {
        await expect(compounder.connect(owner).updateZap(ZeroAddress)).to.revertedWith("asdCRV: zero zap address");
      });

      it("should succeed", async () => {
        await expect(compounder.connect(owner).updateZap(deployer.address))
          .to.emit(asdcrv, "UpdateZap")
          .withArgs(deployer.address);
        expect(await compounder.zap()).to.eq(deployer.address);
      });
    });

    context("updateStash", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(compounder.connect(operator).updateStash(ZeroAddress)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when stash is zero", async () => {
        await expect(compounder.connect(owner).updateStash(ZeroAddress)).to.revertedWith("asdCRV: zero stash address");
      });

      it("should succeed", async () => {
        expect(await compounder.stash()).to.eq(await stash.getAddress());
        expect(await wrapper.rewardReceiver(compounder.getAddress())).to.eq(await stash.getAddress());
        await expect(compounder.connect(owner).updateStash(deployer.address))
          .to.emit(compounder, "UpdateStash")
          .withArgs(await stash.getAddress(), deployer.address);
        expect(await compounder.stash()).to.eq(deployer.address);
        expect(await wrapper.rewardReceiver(compounder.getAddress())).to.eq(deployer.address);
      });
    });
  });

  context("deposit", async () => {
    let signer: HardhatEthersSigner;
    let token: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("10"));
      token = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, signer);
    });

    it("should revert when deposit zero amount", async () => {
      await expect(compounder.deposit(0, deployer.address)).to.revertedWithCustomError(
        wrapper,
        "ErrorDepositZeroAssets"
      );
    });

    it("should succeed when deposit to self", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(compounder.getAddress(), amount);
      const balanceBefore = await compounder.balanceOf(signer.address);
      const supplyBefore = await compounder.totalSupply();
      const shares = await compounder.previewDeposit(amount);
      await expect(compounder.connect(signer).deposit(amount, signer.address)).to.emit(compounder, "Deposit");
      expect(await compounder.balanceOf(signer.address)).to.closeTo(balanceBefore + shares, ERROR_PRECISION);
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + shares, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });

    it("should succeed when deposit to other", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(compounder.getAddress(), amount);
      const balanceBefore = await compounder.balanceOf(operator.address);
      const supplyBefore = await compounder.totalSupply();
      const shares = await compounder.previewDeposit(amount);
      await expect(compounder.connect(signer).deposit(amount, operator.address)).to.emit(compounder, "Deposit");
      expect(await compounder.balanceOf(operator.address)).to.closeTo(balanceBefore + shares, ERROR_PRECISION);
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + shares, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });

    it("should succeed when deposit all to self", async () => {
      const amount = await token.balanceOf(signer.address);
      await token.approve(compounder.getAddress(), amount);
      const balanceBefore = await compounder.balanceOf(operator.address);
      const supplyBefore = await compounder.totalSupply();
      const shares = await compounder.previewDeposit(amount);
      await expect(compounder.connect(signer).deposit(MaxUint256, operator.address)).to.emit(compounder, "Deposit");
      expect(await compounder.balanceOf(operator.address)).to.closeTo(balanceBefore + shares, ERROR_PRECISION);
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + shares, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });

    it("should succeed when deposit multiple times", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(compounder.getAddress(), MaxUint256);
      const signerBalanceBefore = await compounder.balanceOf(signer.address);
      const supplyBefore = await compounder.totalSupply();
      const signerShares = await compounder.previewDeposit(amount);

      await expect(compounder.connect(signer).deposit(amount, signer.address)).to.emit(compounder, "Deposit");

      expect(await compounder.balanceOf(signer.address)).to.closeTo(
        signerBalanceBefore + signerShares,
        ERROR_PRECISION
      );
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + signerShares, ERROR_PRECISION);
      const operatorBalanceBefore = await compounder.balanceOf(operator.address);
      const operatorShares = await compounder.previewDeposit(amount);

      await expect(compounder.connect(signer).deposit(amount, operator.address)).to.emit(compounder, "Deposit");
      expect(await compounder.balanceOf(operator.address)).to.closeTo(
        operatorBalanceBefore + operatorShares,
        ERROR_PRECISION
      );
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + signerShares + operatorShares, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });
  });

  context("depositWithCRV", async () => {
    let signer: HardhatEthersSigner;
    let token: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(CRV_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("10"));
      token = await ethers.getContractAt("MockERC20", TOKENS.CRV.address, signer);
    });

    it("should revert when deposit zero amount", async () => {
      await expect(compounder.depositWithCRV(0, deployer.address, 0)).to.revertedWithCustomError(
        wrapper,
        "ErrorDepositZeroAssets"
      );
    });

    it("should revert when insufficient share", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(compounder.getAddress(), amount);
      const sharesOut = await compounder.connect(signer).depositWithCRV.staticCall(amount, operator.address, 0);
      await expect(compounder.connect(signer).depositWithCRV(amount, deployer.address, sharesOut + 1n)).to.revertedWith(
        "asdCRV: insufficient share received"
      );
    });

    it("should succeed when deposit to self", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(compounder.getAddress(), amount);
      const balanceBefore = await compounder.balanceOf(signer.address);
      const supplyBefore = await compounder.totalSupply();
      const shares = await compounder.connect(signer).depositWithCRV.staticCall(amount, signer.address, 0);
      await expect(compounder.connect(signer).depositWithCRV(amount, signer.address, shares)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await compounder.balanceOf(signer.address)).to.closeTo(balanceBefore + shares, ERROR_PRECISION);
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + shares, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });

    it("should succeed when deposit to other", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(compounder.getAddress(), amount);
      const balanceBefore = await compounder.balanceOf(operator.address);
      const supplyBefore = await compounder.totalSupply();
      const shares = await compounder.connect(signer).depositWithCRV.staticCall(amount, operator.address, 0);
      await expect(compounder.connect(signer).depositWithCRV(amount, operator.address, shares)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await compounder.balanceOf(operator.address)).to.closeTo(balanceBefore + shares, ERROR_PRECISION);
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + shares, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });

    it("should succeed when deposit all to self", async () => {
      const amount = await token.balanceOf(signer.address);
      await token.approve(compounder.getAddress(), amount);
      const balanceBefore = await compounder.balanceOf(operator.address);
      const supplyBefore = await compounder.totalSupply();
      const shares = await compounder.connect(signer).depositWithCRV.staticCall(MaxUint256, operator.address, 0);
      await expect(compounder.connect(signer).depositWithCRV(MaxUint256, operator.address, shares)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await compounder.balanceOf(operator.address)).to.closeTo(balanceBefore + shares, ERROR_PRECISION);
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + shares, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });

    it("should succeed when deposit multiple times", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(compounder.getAddress(), MaxUint256);
      const signerBalanceBefore = await compounder.balanceOf(signer.address);
      const supplyBefore = await compounder.totalSupply();

      const signerShares = await compounder.connect(signer).depositWithCRV.staticCall(amount, operator.address, 0);
      await expect(compounder.connect(signer).depositWithCRV(amount, signer.address, signerShares)).to.emit(
        compounder,
        "Deposit"
      );

      expect(await compounder.balanceOf(signer.address)).to.closeTo(
        signerBalanceBefore + signerShares,
        ERROR_PRECISION
      );
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + signerShares, ERROR_PRECISION);
      const operatorBalanceBefore = await compounder.balanceOf(operator.address);
      const operatorShares = await compounder.connect(signer).depositWithCRV.staticCall(amount, operator.address, 0);
      await expect(compounder.connect(signer).depositWithCRV(amount, operator.address, operatorShares)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await compounder.balanceOf(operator.address)).to.closeTo(
        operatorBalanceBefore + operatorShares,
        ERROR_PRECISION
      );
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + signerShares + operatorShares, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });
  });

  context("depositWithSdVeCRV", async () => {
    let signer: HardhatEthersSigner;
    let token: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SD_VE_CRV_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("10"));
      token = await ethers.getContractAt("MockERC20", TOKENS.sdveCRV.address, signer);
    });

    it("should revert when deposit zero amount", async () => {
      await expect(compounder.depositWithSdVeCRV(0, deployer.address)).to.revertedWithCustomError(
        wrapper,
        "ErrorDepositZeroAssets"
      );
    });

    it("should succeed when deposit to self", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(compounder.getAddress(), amount);
      const balanceBefore = await compounder.balanceOf(signer.address);
      const supplyBefore = await compounder.totalSupply();
      const shares = await compounder.previewDeposit(amount);
      await expect(compounder.connect(signer).depositWithSdVeCRV(amount, signer.address)).to.emit(asdcrv, "Deposit");
      expect(await compounder.balanceOf(signer.address)).to.closeTo(balanceBefore + shares, ERROR_PRECISION);
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + shares, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });

    it("should succeed when deposit to other", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(compounder.getAddress(), amount);
      const balanceBefore = await compounder.balanceOf(operator.address);
      const supplyBefore = await compounder.totalSupply();
      const shares = await compounder.previewDeposit(amount);
      await expect(compounder.connect(signer).depositWithSdVeCRV(amount, operator.address)).to.emit(asdcrv, "Deposit");
      expect(await compounder.balanceOf(operator.address)).to.closeTo(balanceBefore + shares, ERROR_PRECISION);
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + shares, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });

    it("should succeed when deposit all to self", async () => {
      const amount = await token.balanceOf(signer.address);
      await token.approve(compounder.getAddress(), amount);
      const balanceBefore = await compounder.balanceOf(operator.address);
      const supplyBefore = await compounder.totalSupply();
      const shares = await compounder.previewDeposit(amount);
      await expect(compounder.connect(signer).depositWithSdVeCRV(MaxUint256, operator.address)).to.emit(
        asdcrv,
        "Deposit"
      );
      expect(await compounder.balanceOf(operator.address)).to.closeTo(balanceBefore + shares, ERROR_PRECISION);
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + shares, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });

    it("should succeed when deposit multiple times", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(compounder.getAddress(), MaxUint256);
      const signerBalanceBefore = await compounder.balanceOf(signer.address);
      const supplyBefore = await compounder.totalSupply();
      const signerShares = await compounder.previewDeposit(amount);

      await expect(compounder.connect(signer).depositWithSdVeCRV(amount, signer.address)).to.emit(asdcrv, "Deposit");

      expect(await compounder.balanceOf(signer.address)).to.closeTo(
        signerBalanceBefore + signerShares,
        ERROR_PRECISION
      );
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + signerShares, ERROR_PRECISION);
      const operatorBalanceBefore = await compounder.balanceOf(operator.address);
      const operatorShares = await compounder.previewDeposit(amount);

      await expect(compounder.connect(signer).depositWithSdVeCRV(amount, operator.address)).to.emit(asdcrv, "Deposit");
      expect(await compounder.balanceOf(operator.address)).to.closeTo(
        operatorBalanceBefore + operatorShares,
        ERROR_PRECISION
      );
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + signerShares + operatorShares, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });
  });

  context("depositWithGauge", async () => {
    let signer: HardhatEthersSigner;
    let token: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_GAUGE_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("10"));
      token = await ethers.getContractAt("MockERC20", SDCRV_GAUGE, signer);
    });

    it("should revert when deposit zero amount", async () => {
      await expect(compounder.depositWithGauge(0, deployer.address)).to.revertedWithCustomError(
        wrapper,
        "ErrorDepositZeroAssets"
      );
    });

    it("should succeed when deposit to self", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(compounder.getAddress(), amount);
      const balanceBefore = await compounder.balanceOf(signer.address);
      const supplyBefore = await compounder.totalSupply();
      const shares = await compounder.previewDeposit(amount);
      await expect(compounder.connect(signer).depositWithGauge(amount, signer.address)).to.emit(compounder, "Deposit");
      expect(await compounder.balanceOf(signer.address)).to.closeTo(balanceBefore + shares, ERROR_PRECISION);
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + shares, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });

    it("should succeed when deposit to other", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(compounder.getAddress(), amount);
      const balanceBefore = await compounder.balanceOf(operator.address);
      const supplyBefore = await compounder.totalSupply();
      const shares = await compounder.previewDeposit(amount);
      await expect(compounder.connect(signer).depositWithGauge(amount, operator.address)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await compounder.balanceOf(operator.address)).to.closeTo(balanceBefore + shares, ERROR_PRECISION);
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + shares, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });

    it("should succeed when deposit all to self", async () => {
      const amount = await token.balanceOf(signer.address);
      await token.approve(compounder.getAddress(), amount);
      const balanceBefore = await compounder.balanceOf(operator.address);
      const supplyBefore = await compounder.totalSupply();
      const shares = await compounder.previewDeposit(amount);
      await expect(compounder.connect(signer).depositWithGauge(MaxUint256, operator.address)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await compounder.balanceOf(operator.address)).to.closeTo(balanceBefore + shares, ERROR_PRECISION);
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + shares, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });

    it("should succeed when deposit multiple times", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(compounder.getAddress(), MaxUint256);
      const signerBalanceBefore = await compounder.balanceOf(signer.address);
      const supplyBefore = await compounder.totalSupply();
      const signerShares = await compounder.previewDeposit(amount);

      await expect(compounder.connect(signer).depositWithGauge(amount, signer.address)).to.emit(compounder, "Deposit");

      expect(await compounder.balanceOf(signer.address)).to.closeTo(
        signerBalanceBefore + signerShares,
        ERROR_PRECISION
      );
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + signerShares, ERROR_PRECISION);
      const operatorBalanceBefore = await compounder.balanceOf(operator.address);
      const operatorShares = await compounder.previewDeposit(amount);

      await expect(compounder.connect(signer).depositWithGauge(amount, operator.address)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await compounder.balanceOf(operator.address)).to.closeTo(
        operatorBalanceBefore + operatorShares,
        ERROR_PRECISION
      );
      expect(await compounder.totalSupply()).to.closeTo(supplyBefore + signerShares + operatorShares, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });
  });

  context("redeem", async () => {
    const depositAmount = ethers.parseEther("100");
    let signer: HardhatEthersSigner;
    let sdcrv: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("10"));
      sdcrv = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, signer);
      await sdcrv.approve(compounder.getAddress(), MaxUint256);
      await compounder.connect(signer).deposit(depositAmount, signer.address);
    });

    it("should revert when redeem zero amount", async () => {
      await expect(compounder.connect(signer).redeem(0, deployer.address, signer.address)).to.revertedWith(
        "asdCRV: withdraw zero share"
      );
    });

    it("should revert when redeem exceed balance", async () => {
      await compounder.connect(signer).deposit(depositAmount, deployer.address);
      await expect(
        compounder.connect(signer).redeem(depositAmount + 1n, deployer.address, signer.address)
      ).to.revertedWith("asdCRV: insufficient owner shares");
    });

    it("should succeed, when redeem 10 to self", async () => {
      const supplybefore = await compounder.totalSupply();
      const sharesBefore = await compounder.balanceOf(signer.address);
      const balanceBefore = await sdcrv.balanceOf(signer.address);
      const assetOut = await compounder.previewRedeem(ethers.parseEther("10"));
      await expect(compounder.connect(signer).redeem(ethers.parseEther("10"), signer.address, signer.address)).to.emit(
        compounder,
        "Withdraw"
      );
      expect(await compounder.totalSupply()).to.eq(supplybefore - ethers.parseEther("10"));
      expect(await compounder.balanceOf(signer.address)).to.eq(sharesBefore - ethers.parseEther("10"));
      expect(await sdcrv.balanceOf(signer.address)).to.closeTo(balanceBefore + assetOut, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });

    it("should succeed, when redeem 10 to other", async () => {
      const supplybefore = await compounder.totalSupply();
      const sharesBefore = await compounder.balanceOf(signer.address);
      const balanceBefore = await sdcrv.balanceOf(operator.address);
      const assetOut = await compounder.previewRedeem(ethers.parseEther("10"));
      await expect(
        compounder.connect(signer).redeem(ethers.parseEther("10"), operator.address, signer.address)
      ).to.emit(compounder, "Withdraw");
      expect(await compounder.totalSupply()).to.eq(supplybefore - ethers.parseEther("10"));
      expect(await compounder.balanceOf(signer.address)).to.eq(sharesBefore - ethers.parseEther("10"));
      expect(await sdcrv.balanceOf(operator.address)).to.closeTo(balanceBefore + assetOut, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });

    it("should succeed, when redeem all to self", async () => {
      const supplybefore = await compounder.totalSupply();
      const sharesBefore = await compounder.balanceOf(signer.address);
      const balanceBefore = await sdcrv.balanceOf(signer.address);
      const assetOut = await compounder.previewRedeem(sharesBefore);
      await expect(compounder.connect(signer).redeem(MaxUint256, signer.address, signer.address)).to.emit(
        compounder,
        "Withdraw"
      );
      expect(await compounder.totalSupply()).to.eq(supplybefore - sharesBefore);
      expect(await compounder.balanceOf(signer.address)).to.eq(0n);
      expect(await sdcrv.balanceOf(signer.address)).to.closeTo(balanceBefore + assetOut, ERROR_PRECISION);
      expect(await wrapper.balanceOf(compounder.getAddress())).to.gte(await compounder.totalAssets());
    });
  });

  context("harvest", async () => {
    const depositAmount = ethers.parseEther("800000");
    let signer: HardhatEthersSigner;
    let sdcrv: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("10"));
      sdcrv = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, signer);
      await sdcrv.approve(compounder.getAddress(), MaxUint256);
      await compounder.connect(signer).deposit(depositAmount, signer.address);

      // asdCRV config: 1% platform, 2% bounty, 0% withdraw
      await compounder.connect(owner).updateFeeInfo(operator.address, 1e7, 2e7, 0);
      await compounder.connect(owner).updateHarvester(ZeroAddress);
    });

    it("should succeed, when crv and sdt distribute linear in 7 days", async () => {
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      await compounder.connect(owner).updateRewardPeriodLength(86400 * 7);
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7 - 1]);
      await wrapper.harvest(deployer.address);

      const sdcrv_before = await wrapper.balanceOf(compounder.getAddress());
      const supplyBefore = await compounder.totalSupply();
      const assetsBefore = await compounder.totalAssets();
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      await compounder.harvest(deployer.address, 0);
      const sdcrv_after = await wrapper.balanceOf(compounder.getAddress());
      const sdcrv_harvest = sdcrv_after - sdcrv_before;
      expect(sdcrv_harvest).gt(0n);

      const sdt = await ethers.getContractAt("MockERC20", TOKENS.SDT.address, signer);
      const crv = await ethers.getContractAt("MockERC20", TOKENS.CRV.address, signer);
      const tricrv = await ethers.getContractAt("MockERC20", TOKENS.TRICRV.address, signer);
      expect(await sdcrv.balanceOf(stash.getAddress())).to.eq(0n);
      expect(await sdt.balanceOf(stash.getAddress())).to.eq(0n);
      expect(await crv.balanceOf(stash.getAddress())).to.eq(0n);
      expect(await tricrv.balanceOf(stash.getAddress())).to.eq(0n);

      const sdcrv_bounty = (sdcrv_harvest * 2n) / 100n;
      const sdcrv_platform = (sdcrv_harvest * 1n) / 100n;
      const sdcrv_reward = sdcrv_harvest - sdcrv_bounty - sdcrv_platform;
      expect(await compounder.totalSupply()).to.closeTo(
        supplyBefore + ((sdcrv_bounty + sdcrv_platform) * supplyBefore) / assetsBefore,
        ERROR_PRECISION
      );
      expect(await compounder.totalAssets()).to.eq(sdcrv_before + sdcrv_bounty + sdcrv_platform);
      expect((sdcrv_bounty * supplyBefore) / assetsBefore).to.closeTo(
        await compounder.balanceOf(deployer.address),
        ERROR_PRECISION
      );
      expect((sdcrv_platform * supplyBefore) / assetsBefore).to.closeTo(
        await compounder.balanceOf(operator.address),
        ERROR_PRECISION
      );

      // 3 days passed
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 10]);
      await compounder.checkpoint();
      expect(await compounder.totalAssets()).to.eq(
        sdcrv_before + sdcrv_bounty + sdcrv_platform + (sdcrv_reward / toBigInt(86400 * 7)) * toBigInt(86400 * 3)
      );

      // 7 days passed
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 14]);
      await compounder.checkpoint();
      expect(await compounder.totalAssets()).to.eq(
        sdcrv_before + sdcrv_bounty + sdcrv_platform + (sdcrv_reward / toBigInt(86400 * 7)) * toBigInt(86400 * 7)
      );

      // 14 days passed
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 21]);
      await compounder.checkpoint();
      expect(await compounder.totalAssets()).to.eq(
        sdcrv_before + sdcrv_bounty + sdcrv_platform + (sdcrv_reward / toBigInt(86400 * 7)) * toBigInt(86400 * 7)
      );
    });
  });
});

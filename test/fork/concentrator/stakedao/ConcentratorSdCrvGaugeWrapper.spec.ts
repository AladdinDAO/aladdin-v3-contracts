/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";

import { ConcentratorStakeDAODeployment } from "@/contracts/ConcentratorStakeDAO";
import { MultisigDeployment } from "@/contracts/Multisig";
import { ProxyAdminDeployment } from "@/contracts/ProxyAdmin";
import { mockETHBalance, request_fork } from "@/test/utils";
import {
  ConcentratorSdCrvGaugeWrapper,
  MockERC20,
  SdCRVBribeBurnerV2,
  StakeDAOCRVVault,
  ConcentratorStakeDAOLocker,
  VeSDTDelegation,
  ProxyAdmin,
  IMultiMerkleStash,
  ICurveGauge,
} from "@/types/index";
import { MaxUint256, ZeroAddress, ZeroHash, solidityPackedKeccak256, toBigInt } from "ethers";
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

describe("ConcentratorSdCrvGaugeWrapper.spec", async () => {
  let deployer: HardhatEthersSigner;
  let operator: HardhatEthersSigner;

  let owner: HardhatEthersSigner;
  let admin: ProxyAdmin;

  let gauge: ICurveGauge;

  let locker: ConcentratorStakeDAOLocker;
  let delegation: VeSDTDelegation;
  let legacyVault: StakeDAOCRVVault;
  let burner: SdCRVBribeBurnerV2;
  let wrapper: ConcentratorSdCrvGaugeWrapper;

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
    gauge = await ethers.getContractAt("ICurveGauge", SDCRV_GAUGE, deployer);

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

    const sdCRV = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, deployer);
    const before = await sdCRV.balanceOf(DEPLOYMENT.SdCRVCompounder.proxy);
    await wrapper.initialize(MULTISIG.Concentrator, burner.getAddress());
    const locks = await legacyVault.getUserLocks(DEPLOYMENT.SdCRVCompounder.proxy);
    let sum = 0n;
    for (const lock of locks) sum += lock.amount;
    expect(await sdCRV.balanceOf(DEPLOYMENT.SdCRVCompounder.proxy)).to.eq(sum + before);
    await locker.connect(owner).updateGaugeRewardReceiver(SDCRV_GAUGE, await wrapper.stash());
    await locker.connect(owner).updateClaimer(wrapper.getAddress());
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      // from ConcentratorBaseV2
      expect(await wrapper.treasury()).to.eq(MULTISIG.Concentrator);
      expect(await wrapper.harvester()).to.eq(ZeroAddress);
      expect(await wrapper.converter()).to.eq(await burner.getAddress());
      expect(await wrapper.getExpenseRatio()).to.eq(0n);
      expect(await wrapper.getHarvesterRatio()).to.eq(0n);
      expect(await wrapper.getWithdrawFeePercentage()).to.eq(0n);

      // from LinearMultipleRewardDistributor
      expect(await wrapper.getActiveRewardTokens()).to.deep.eq([
        TOKENS.SDT.address,
        TOKENS.TRICRV.address,
        TOKENS.CRV.address,
        TOKENS.sdCRV.address,
      ]);

      // from ConcentratorStakeDAOGaugeWrapper
      expect(await wrapper.gauge()).to.eq(SDCRV_GAUGE);
      expect(await wrapper.stakingToken()).to.eq(TOKENS.sdCRV.address);
      expect(await wrapper.locker()).to.eq(DEPLOYMENT.ConcentratorStakeDAOLocker.proxy);
      expect(await wrapper.delegation()).to.eq(DEPLOYMENT.VeSDTDelegation.proxy);
      expect(await wrapper.totalSupply()).to.eq(await legacyVault.totalSupply());
      expect(await wrapper.balanceOf(DEPLOYMENT.SdCRVCompounder.proxy)).to.eq(
        await legacyVault.balanceOf(DEPLOYMENT.SdCRVCompounder.proxy)
      );
      expect(await wrapper.stash()).to.not.eq(ZeroAddress);

      // match balance in gauge
      const gauge = await ethers.getContractAt("ICurveGauge", SDCRV_GAUGE, deployer);
      expect(await gauge.balanceOf(DEPLOYMENT.ConcentratorStakeDAOLocker.proxy)).to.eq(await wrapper.totalSupply());
    });

    it("should revert when initialize again", async () => {
      await expect(wrapper.initialize(ZeroAddress, ZeroAddress)).to.revertedWith(
        "Initializable: contract is already initialized"
      );
    });
  });

  context("auth", async () => {
    context("#updateBoosterRatio", async () => {
      it("should revert, when caller is not admin", async () => {
        await expect(wrapper.connect(operator).updateBoosterRatio(0)).to.revertedWith(
          "AccessControl: account " + operator.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert, when fee too large", async () => {
        await expect(wrapper.updateBoosterRatio(2e8 + 1)).to.revertedWithCustomError(
          wrapper,
          "ErrorBoosterRatioTooLarge"
        );
      });

      it("should succeed", async () => {
        expect(await wrapper.getBoosterRatio()).to.eq(0n);
        await expect(wrapper.updateBoosterRatio(2e8)).to.emit(wrapper, "UpdateBoosterRatio").withArgs(0, 2e8);
        expect(await wrapper.getBoosterRatio()).to.eq(2e8);
      });
    });
  });

  context("deposit", async () => {
    let signer: HardhatEthersSigner;
    let token: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_HOLDER);
      await mockETHBalance(SDCRV_HOLDER, ethers.parseEther("10"));
      token = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, signer);
    });

    it("should revert when deposit zero amount", async () => {
      await expect(wrapper.deposit(0, deployer.address)).to.revertedWithCustomError(wrapper, "ErrorDepositZeroAssets");
    });

    it("should succeed when deposit to self", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(wrapper.getAddress(), amount);
      const balanceBefore = await wrapper.balanceOf(signer.address);
      const supplyBefore = await wrapper.totalSupply();
      await expect(wrapper.connect(signer).deposit(amount, signer.address))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, signer.address, amount);
      expect(await wrapper.balanceOf(signer.address)).to.eq(amount + balanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amount + supplyBefore);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(await wrapper.totalSupply());
    });

    it("should succeed when deposit to other", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(wrapper.getAddress(), amount);
      const balanceBefore = await wrapper.balanceOf(operator.address);
      const supplyBefore = await wrapper.totalSupply();
      await expect(wrapper.connect(signer).deposit(amount, operator.address))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, operator.address, amount);
      expect(await wrapper.balanceOf(operator.address)).to.eq(amount + balanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amount + supplyBefore);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(await wrapper.totalSupply());
    });

    it("should succeed when deposit all to self", async () => {
      const amount = await token.balanceOf(signer.address);
      await token.approve(wrapper.getAddress(), amount);
      const balanceBefore = await wrapper.balanceOf(operator.address);
      const supplyBefore = await wrapper.totalSupply();
      await expect(wrapper.connect(signer).deposit(MaxUint256, operator.address))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, operator.address, amount);
      expect(await wrapper.balanceOf(operator.address)).to.eq(amount + balanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amount + supplyBefore);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(await wrapper.totalSupply());
    });

    it("should succeed when deposit multiple times", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(wrapper.getAddress(), MaxUint256);
      const signerBalanceBefore = await wrapper.balanceOf(signer.address);
      const supplyBefore = await wrapper.totalSupply();
      await expect(wrapper.connect(signer).deposit(amount, signer.address))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, signer.address, amount);
      expect(await wrapper.balanceOf(signer.address)).to.eq(amount + signerBalanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amount + supplyBefore);

      const operatorBalanceBefore = await wrapper.balanceOf(operator.address);
      await expect(wrapper.connect(signer).deposit(amount, operator.address))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, operator.address, amount);
      expect(await wrapper.balanceOf(operator.address)).to.eq(amount + operatorBalanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amount * 2n + supplyBefore);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(await wrapper.totalSupply());
    });
  });

  context("depositWithGauge", async () => {
    let signer: HardhatEthersSigner;
    let token: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_GAUGE_HOLDER);
      await mockETHBalance(SDCRV_GAUGE_HOLDER, ethers.parseEther("10"));
      token = await ethers.getContractAt("MockERC20", SDCRV_GAUGE, signer);
    });

    it("should revert when deposit zero amount", async () => {
      await expect(wrapper.depositWithGauge(0, deployer.address)).to.revertedWithCustomError(
        wrapper,
        "ErrorDepositZeroAssets"
      );
    });

    it("should succeed when deposit to self", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(wrapper.getAddress(), amount);
      const balanceBefore = await wrapper.balanceOf(signer.address);
      const supplyBefore = await wrapper.totalSupply();
      await expect(wrapper.connect(signer).depositWithGauge(amount, signer.address))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, signer.address, amount);
      expect(await wrapper.balanceOf(signer.address)).to.eq(amount + balanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amount + supplyBefore);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(await wrapper.totalSupply());
    });

    it("should succeed when deposit to other", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(wrapper.getAddress(), amount);
      const balanceBefore = await wrapper.balanceOf(operator.address);
      const supplyBefore = await wrapper.totalSupply();
      await expect(wrapper.connect(signer).depositWithGauge(amount, operator.address))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, operator.address, amount);
      expect(await wrapper.balanceOf(operator.address)).to.eq(amount + balanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amount + supplyBefore);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(await wrapper.totalSupply());
    });

    it("should succeed when deposit all to self", async () => {
      const amount = await token.balanceOf(signer.address);
      await token.approve(wrapper.getAddress(), amount);
      const balanceBefore = await wrapper.balanceOf(operator.address);
      const supplyBefore = await wrapper.totalSupply();
      await expect(wrapper.connect(signer).depositWithGauge(MaxUint256, operator.address))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, operator.address, amount);
      expect(await wrapper.balanceOf(operator.address)).to.eq(amount + balanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amount + supplyBefore);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(await wrapper.totalSupply());
    });

    it("should succeed when deposit multiple times", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(wrapper.getAddress(), MaxUint256);

      const signerBalanceBefore = await wrapper.balanceOf(signer.address);
      const supplyBefore = await wrapper.totalSupply();
      await expect(wrapper.connect(signer).depositWithGauge(amount, signer.address))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, signer.address, amount);
      expect(await wrapper.balanceOf(signer.address)).to.eq(amount + signerBalanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amount + supplyBefore);

      const operatorBalanceBefore = await wrapper.balanceOf(operator.address);
      await expect(wrapper.connect(signer).depositWithGauge(amount, operator.address))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, operator.address, amount);
      expect(await wrapper.balanceOf(operator.address)).to.eq(amount + operatorBalanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amount * 2n + supplyBefore);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(await wrapper.totalSupply());
    });
  });

  context("depositWithCRV", async () => {
    let signer: HardhatEthersSigner;
    let token: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(CRV_HOLDER);
      await mockETHBalance(CRV_HOLDER, ethers.parseEther("10"));
      token = await ethers.getContractAt("MockERC20", TOKENS.CRV.address, signer);
    });

    it("should revert when deposit zero amount", async () => {
      await expect(wrapper.depositWithCRV(0, deployer.address, 0)).to.revertedWithCustomError(
        wrapper,
        "ErrorDepositZeroAssets"
      );
    });

    it("should revert when insufficient out", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(wrapper.getAddress(), amount);
      const amountOut = await wrapper.connect(signer).depositWithCRV.staticCall(amount, operator.address, 0);
      await expect(
        wrapper.connect(signer).depositWithCRV(amount, deployer.address, amountOut + 1n)
      ).to.revertedWithCustomError(wrapper, "ErrorInsufficientAmountOut");
    });

    it("should succeed when deposit to self", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(wrapper.getAddress(), amount);
      const balanceBefore = await wrapper.balanceOf(signer.address);
      const supplyBefore = await wrapper.totalSupply();
      const amountOut = await wrapper.connect(signer).depositWithCRV.staticCall(amount, signer.address, 0);
      await expect(wrapper.connect(signer).depositWithCRV(amount, signer.address, amountOut))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, signer.address, amountOut);
      expect(await wrapper.balanceOf(signer.address)).to.eq(amountOut + balanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amountOut + supplyBefore);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(await wrapper.totalSupply());
    });

    it("should succeed when deposit to other", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(wrapper.getAddress(), amount);
      const balanceBefore = await wrapper.balanceOf(operator.address);
      const supplyBefore = await wrapper.totalSupply();
      const amountOut = await wrapper.connect(signer).depositWithCRV.staticCall(amount, operator.address, 0);
      await expect(wrapper.connect(signer).depositWithCRV(amount, operator.address, amountOut))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, operator.address, amountOut);
      expect(await wrapper.balanceOf(operator.address)).to.eq(amountOut + balanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amountOut + supplyBefore);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(await wrapper.totalSupply());
    });

    it("should succeed when deposit all to self", async () => {
      const amount = await token.balanceOf(signer.address);
      await token.approve(wrapper.getAddress(), amount);
      const balanceBefore = await wrapper.balanceOf(operator.address);
      const supplyBefore = await wrapper.totalSupply();
      const amountOut = await wrapper.connect(signer).depositWithCRV.staticCall(MaxUint256, operator.address, 0);
      await expect(wrapper.connect(signer).depositWithCRV(MaxUint256, operator.address, amountOut))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, operator.address, amountOut);
      expect(await wrapper.balanceOf(operator.address)).to.eq(amountOut + balanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amountOut + supplyBefore);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(await wrapper.totalSupply());
    });

    it("should succeed when deposit multiple times", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(wrapper.getAddress(), MaxUint256);
      const signerBalanceBefore = await wrapper.balanceOf(signer.address);
      const supplyBefore = await wrapper.totalSupply();

      const amountOut1 = await wrapper.connect(signer).depositWithCRV.staticCall(amount, operator.address, 0);
      await expect(wrapper.connect(signer).depositWithCRV(amount, signer.address, amountOut1))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, signer.address, amountOut1);

      expect(await wrapper.balanceOf(signer.address)).to.eq(amountOut1 + signerBalanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amountOut1 + supplyBefore);
      const operatorBalanceBefore = await wrapper.balanceOf(operator.address);

      const amountOut2 = await wrapper.connect(signer).depositWithCRV.staticCall(amount, operator.address, 0);
      await expect(wrapper.connect(signer).depositWithCRV(amount, operator.address, amountOut2))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, operator.address, amountOut2);

      expect(await wrapper.balanceOf(operator.address)).to.eq(amountOut2 + operatorBalanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amountOut1 + amountOut2 + supplyBefore);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(await wrapper.totalSupply());
    });

    it("should succeed when swap by Curve", async () => {
      // make curve pool with more sdCRV then CRV
      const holder = await ethers.getSigner(SDCRV_HOLDER);
      const sdcrv = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, holder);
      await mockETHBalance(SDCRV_HOLDER, ethers.parseEther("10"));
      const pool = await ethers.getContractAt(
        "ICurveFactoryPlain2Pool",
        "0xCA0253A98D16e9C1e3614caFDA19318EE69772D0",
        holder
      );
      await sdcrv.approve(pool.getAddress(), MaxUint256);
      await pool.exchange(1, 0, await sdcrv.balanceOf(holder.address), 0, holder.address);
      const balance = await sdcrv.balanceOf(pool.getAddress());

      const amount = ethers.parseEther("100");
      await token.approve(wrapper.getAddress(), amount);
      const balanceBefore = await wrapper.balanceOf(signer.address);
      const supplyBefore = await wrapper.totalSupply();
      const amountOut = await wrapper.connect(signer).depositWithCRV.staticCall(amount, signer.address, 0);
      await expect(wrapper.connect(signer).depositWithCRV(amount, signer.address, amountOut))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, signer.address, amountOut);
      expect(await wrapper.balanceOf(signer.address)).to.eq(amountOut + balanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amountOut + supplyBefore);
      expect(await sdcrv.balanceOf(pool.getAddress())).to.lt(balance);
    });

    it("should succeed when swap by lock", async () => {
      const amount = ethers.parseEther("100");

      // make curve pool with more CRV than sdCRV
      const sdcrv = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, signer);
      const pool = await ethers.getContractAt(
        "ICurveFactoryPlain2Pool",
        "0xCA0253A98D16e9C1e3614caFDA19318EE69772D0",
        signer
      );
      await token.approve(pool.getAddress(), MaxUint256);
      await pool.exchange(0, 1, (await token.balanceOf(signer.address)) - amount, 0, signer.address);
      const balance = await sdcrv.balanceOf(pool.getAddress());

      await token.approve(wrapper.getAddress(), amount);
      const balanceBefore = await wrapper.balanceOf(signer.address);
      const supplyBefore = await wrapper.totalSupply();
      const amountOut = await wrapper.connect(signer).depositWithCRV.staticCall(amount, signer.address, 0);
      await expect(wrapper.connect(signer).depositWithCRV(amount, signer.address, amountOut))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, signer.address, amountOut);
      expect(await wrapper.balanceOf(signer.address)).to.eq(amountOut + balanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amountOut + supplyBefore);
      expect(await sdcrv.balanceOf(pool.getAddress())).to.eq(balance);
    });
  });

  context("depositWithSdVeCRV", async () => {
    let signer: HardhatEthersSigner;
    let token: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SD_VE_CRV_HOLDER);
      await mockETHBalance(SD_VE_CRV_HOLDER, ethers.parseEther("10"));
      token = await ethers.getContractAt("MockERC20", TOKENS.sdveCRV.address, signer);
    });

    it("should revert when deposit zero amount", async () => {
      await expect(wrapper.depositWithSdVeCRV(0, deployer.address)).to.revertedWithCustomError(
        wrapper,
        "ErrorDepositZeroAssets"
      );
    });

    it("should succeed when deposit to self", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(wrapper.getAddress(), amount);
      const balanceBefore = await wrapper.balanceOf(signer.address);
      const supplyBefore = await wrapper.totalSupply();
      await expect(wrapper.connect(signer).depositWithSdVeCRV(amount, signer.address))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, signer.address, amount);
      expect(await wrapper.balanceOf(signer.address)).to.eq(amount + balanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amount + supplyBefore);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(await wrapper.totalSupply());
    });

    it("should succeed when deposit to other", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(wrapper.getAddress(), amount);
      const balanceBefore = await wrapper.balanceOf(operator.address);
      const supplyBefore = await wrapper.totalSupply();
      await expect(wrapper.connect(signer).depositWithSdVeCRV(amount, operator.address))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, operator.address, amount);
      expect(await wrapper.balanceOf(operator.address)).to.eq(amount + balanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amount + supplyBefore);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(await wrapper.totalSupply());
    });

    it("should succeed when deposit all to self", async () => {
      const amount = await token.balanceOf(signer.address);
      await token.approve(wrapper.getAddress(), amount);
      const balanceBefore = await wrapper.balanceOf(operator.address);
      const supplyBefore = await wrapper.totalSupply();
      await expect(wrapper.connect(signer).depositWithSdVeCRV(MaxUint256, operator.address))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, operator.address, amount);
      expect(await wrapper.balanceOf(operator.address)).to.eq(amount + balanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amount + supplyBefore);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(await wrapper.totalSupply());
    });

    it("should succeed when deposit multiple times", async () => {
      const amount = ethers.parseEther("100");
      await token.approve(wrapper.getAddress(), MaxUint256);

      const signerBalanceBefore = await wrapper.balanceOf(signer.address);
      const supplyBefore = await wrapper.totalSupply();
      await expect(wrapper.connect(signer).depositWithSdVeCRV(amount, signer.address))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, signer.address, amount);
      expect(await wrapper.balanceOf(signer.address)).to.eq(amount + signerBalanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amount + supplyBefore);

      const operatorBalanceBefore = await wrapper.balanceOf(operator.address);
      await expect(wrapper.connect(signer).depositWithSdVeCRV(amount, operator.address))
        .to.emit(wrapper, "Deposit")
        .withArgs(signer.address, operator.address, amount);
      expect(await wrapper.balanceOf(operator.address)).to.eq(amount + operatorBalanceBefore);
      expect(await wrapper.totalSupply()).to.eq(amount * 2n + supplyBefore);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(await wrapper.totalSupply());
    });
  });

  context("withdraw", async () => {
    const depositAmount = ethers.parseEther("100");
    let signer: HardhatEthersSigner;
    let sdcrv: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_HOLDER);
      await mockETHBalance(SDCRV_HOLDER, ethers.parseEther("10"));
      sdcrv = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, signer);
      await sdcrv.approve(wrapper.getAddress(), MaxUint256);
      await wrapper.connect(signer).deposit(depositAmount, signer.address);
    });

    it("should revert when withdraw zero amount", async () => {
      await expect(wrapper.connect(signer).withdraw(0, deployer.address)).to.revertedWithCustomError(
        wrapper,
        "ErrorWithdrawZeroAssets"
      );
    });

    it("should revert when withdraw exceed balance", async () => {
      await expect(wrapper.connect(signer).withdraw(depositAmount + 1n, deployer.address)).to.revertedWithCustomError(
        wrapper,
        "ErrorInsufficientStakedToken"
      );
    });

    it("should succeed, when withdraw 10 to self", async () => {
      const amountOut = ethers.parseEther("10");
      const supplyBefore = await wrapper.totalSupply();
      const wrapperBalanceBefore = await wrapper.balanceOf(signer.address);
      const tokenBalanceBefore = await sdcrv.balanceOf(signer.address);
      await expect(wrapper.connect(signer).withdraw(amountOut, signer.address))
        .to.emit(wrapper, "Withdraw")
        .withArgs(signer.address, signer.address, amountOut);
      expect(await sdcrv.balanceOf(signer.address)).to.eq(tokenBalanceBefore + amountOut);
      expect(await wrapper.totalSupply()).to.eq(supplyBefore - amountOut);
      expect(await wrapper.balanceOf(signer.address)).to.eq(wrapperBalanceBefore - amountOut);
    });

    it("should succeed, when withdraw 10 to other", async () => {
      const amountOut = ethers.parseEther("10");
      const supplyBefore = await wrapper.totalSupply();
      const wrapperBalanceBefore = await wrapper.balanceOf(signer.address);
      const tokenBalanceBefore = await sdcrv.balanceOf(operator.address);
      await expect(wrapper.connect(signer).withdraw(amountOut, operator.address))
        .to.emit(wrapper, "Withdraw")
        .withArgs(signer.address, operator.address, amountOut);
      expect(await sdcrv.balanceOf(operator.address)).to.eq(tokenBalanceBefore + amountOut);
      expect(await wrapper.totalSupply()).to.eq(supplyBefore - amountOut);
      expect(await wrapper.balanceOf(signer.address)).to.eq(wrapperBalanceBefore - amountOut);
    });

    it("should succeed, when withdraw all to self", async () => {
      const amountOut = await wrapper.balanceOf(signer.address);
      const supplyBefore = await wrapper.totalSupply();
      const wrapperBalanceBefore = await wrapper.balanceOf(signer.address);
      const tokenBalanceBefore = await sdcrv.balanceOf(signer.address);
      await expect(wrapper.connect(signer).withdraw(MaxUint256, signer.address))
        .to.emit(wrapper, "Withdraw")
        .withArgs(signer.address, signer.address, amountOut);
      expect(await sdcrv.balanceOf(signer.address)).to.eq(tokenBalanceBefore + amountOut);
      expect(await wrapper.totalSupply()).to.eq(supplyBefore - amountOut);
      expect(await wrapper.balanceOf(signer.address)).to.eq(wrapperBalanceBefore - amountOut);
    });
  });

  context("harvest", async () => {
    const depositAmount = ethers.parseEther("800000");
    let signer: HardhatEthersSigner;
    let sdcrv: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_HOLDER);
      await mockETHBalance(SDCRV_HOLDER, ethers.parseEther("10"));
      sdcrv = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, signer);
      await sdcrv.approve(wrapper.getAddress(), MaxUint256);
      await wrapper.connect(signer).deposit(depositAmount, signer.address);

      await wrapper.updateTreasury(operator.address);
      await wrapper.updateExpenseRatio(2e8); // 20% platform
      await wrapper.updateHarvesterRatio(1e8); // 10% bounty
      await wrapper.updateBoosterRatio(2e8); // 20% booster
    });

    it("should succeed, when crv and sdt distribute linear in 7 days", async () => {
      const crv = await ethers.getContractAt("MockERC20", TOKENS.CRV.address, deployer);
      const sdt = await ethers.getContractAt("MockERC20", TOKENS.SDT.address, deployer);
      const tricrv = await ethers.getContractAt("MockERC20", TOKENS.TRICRV.address, deployer);
      const supply = await wrapper.totalSupply();

      const wrapperCRVBefore = await crv.balanceOf(wrapper.getAddress());
      const bountyCRVBefore = await crv.balanceOf(deployer.address);
      const platformCRVBefore = await crv.balanceOf(operator.address);
      const wrapperSDTBefore = await sdt.balanceOf(wrapper.getAddress());
      const bountySDTBefore = await sdt.balanceOf(deployer.address);
      const platformSDTBefore = await sdt.balanceOf(operator.address);
      const boosterSDTBefore = await sdt.balanceOf(delegation.getAddress());
      const wrapper3CRVBefore = await tricrv.balanceOf(wrapper.getAddress());
      const bounty3CRVBefore = await tricrv.balanceOf(deployer.address);
      const platform3CRVBefore = await tricrv.balanceOf(operator.address);

      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      const tx = await wrapper.connect(owner).harvest(deployer.address);

      const crv_reward = (await crv.balanceOf(wrapper.getAddress())) - wrapperCRVBefore; // 70%
      const crv_bounty = (await crv.balanceOf(deployer.address)) - bountyCRVBefore; // 10%
      const crv_platform = (await crv.balanceOf(operator.address)) - platformCRVBefore; // 20%
      expect(crv_reward).to.closeTo(crv_bounty * 7n, 100n);
      expect(crv_platform).to.closeTo(crv_bounty * 2n, 100n);

      const sdt_reward = (await sdt.balanceOf(wrapper.getAddress())) - wrapperSDTBefore; // 50%
      const sdt_bounty = (await sdt.balanceOf(deployer.address)) - bountySDTBefore; // 10%
      const sdt_platform = (await sdt.balanceOf(operator.address)) - platformSDTBefore; // 20%
      const sdt_boost = (await sdt.balanceOf(delegation.getAddress())) - boosterSDTBefore; // 20%
      expect(sdt_reward).to.closeTo(sdt_bounty * 5n, 100n);
      expect(sdt_platform).to.closeTo(sdt_bounty * 2n, 100n);
      expect(sdt_boost).to.closeTo(sdt_bounty * 2n, 100n);

      const tricrv_reward = (await tricrv.balanceOf(wrapper.getAddress())) - wrapper3CRVBefore; // 70%
      const tricrv_bounty = (await tricrv.balanceOf(deployer.address)) - bounty3CRVBefore; // 10%
      const tricrv_platform = (await tricrv.balanceOf(operator.address)) - platform3CRVBefore; // 20%
      expect(tricrv_reward).to.closeTo(tricrv_bounty * 7n, 100n);
      expect(tricrv_platform).to.closeTo(tricrv_bounty * 2n, 100n);

      await expect(tx)
        .to.emit(wrapper, "Harvest")
        .withArgs(
          TOKENS.SDT.address,
          owner.address,
          deployer.address,
          sdt_reward + sdt_bounty + sdt_platform + sdt_boost,
          sdt_platform,
          sdt_bounty,
          sdt_boost
        );
      await expect(tx)
        .to.emit(wrapper, "Harvest")
        .withArgs(
          TOKENS.TRICRV.address,
          owner.address,
          deployer.address,
          tricrv_reward + tricrv_bounty + tricrv_platform,
          tricrv_platform,
          tricrv_bounty,
          0n
        );
      await expect(tx)
        .to.emit(wrapper, "Harvest")
        .withArgs(
          TOKENS.CRV.address,
          owner.address,
          deployer.address,
          crv_reward + crv_bounty + crv_platform,
          crv_platform,
          crv_bounty,
          0n
        );

      const precision = 10n ** 18n;
      expect((await wrapper.rewardSnapshot(tricrv.getAddress())).integral).to.eq(0n);
      expect((await wrapper.rewardData(tricrv.getAddress())).rate).to.eq(tricrv_reward / toBigInt(86400 * 7));
      expect((await wrapper.rewardData(tricrv.getAddress())).finishAt).to.eq(timestamp + 86400 * 7 * 2);
      expect((await wrapper.rewardData(tricrv.getAddress())).lastUpdate).to.eq(timestamp + 86400 * 7);
      expect((await wrapper.rewardSnapshot(crv.getAddress())).integral).to.eq(0n);
      expect((await wrapper.rewardData(crv.getAddress())).rate).to.eq(crv_reward / toBigInt(86400 * 7));
      expect((await wrapper.rewardData(crv.getAddress())).finishAt).to.eq(timestamp + 86400 * 7 * 2);
      expect((await wrapper.rewardData(crv.getAddress())).lastUpdate).to.eq(timestamp + 86400 * 7);
      expect((await wrapper.rewardSnapshot(sdt.getAddress())).integral).to.eq(0n);
      expect((await wrapper.rewardData(sdt.getAddress())).rate).to.eq(sdt_reward / toBigInt(86400 * 7));
      expect((await wrapper.rewardData(sdt.getAddress())).finishAt).to.eq(timestamp + 86400 * 7 * 2);
      expect((await wrapper.rewardData(sdt.getAddress())).lastUpdate).to.eq(timestamp + 86400 * 7);

      // 3 days passed
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 10]);
      await wrapper.checkpoint(deployer.address);
      expect((await wrapper.rewardSnapshot(tricrv.getAddress())).integral).to.eq(
        ((tricrv_reward / toBigInt(86400 * 7)) * toBigInt(86400 * 3) * precision) / supply
      );
      expect((await wrapper.rewardData(tricrv.getAddress())).rate).to.eq(tricrv_reward / toBigInt(86400 * 7));
      expect((await wrapper.rewardData(tricrv.getAddress())).finishAt).to.eq(timestamp + 86400 * 7 * 2);
      expect((await wrapper.rewardData(tricrv.getAddress())).lastUpdate).to.eq(timestamp + 86400 * 10);
      expect((await wrapper.rewardSnapshot(crv.getAddress())).integral).to.eq(
        ((crv_reward / toBigInt(86400 * 7)) * toBigInt(86400 * 3) * precision) / supply
      );
      expect((await wrapper.rewardData(crv.getAddress())).rate).to.eq(crv_reward / toBigInt(86400 * 7));
      expect((await wrapper.rewardData(crv.getAddress())).finishAt).to.eq(timestamp + 86400 * 7 * 2);
      expect((await wrapper.rewardData(crv.getAddress())).lastUpdate).to.eq(timestamp + 86400 * 10);
      expect((await wrapper.rewardSnapshot(sdt.getAddress())).integral).to.eq(
        ((sdt_reward / toBigInt(86400 * 7)) * toBigInt(86400 * 3) * precision) / supply
      );
      expect((await wrapper.rewardData(sdt.getAddress())).rate).to.eq(sdt_reward / toBigInt(86400 * 7));
      expect((await wrapper.rewardData(sdt.getAddress())).finishAt).to.eq(timestamp + 86400 * 7 * 2);
      expect((await wrapper.rewardData(sdt.getAddress())).lastUpdate).to.eq(timestamp + 86400 * 10);
    });
  });

  context("claim", async () => {
    const signerAmountIn = ethers.parseEther("160000");
    const deployerAmountIn = ethers.parseEther("400000");
    const operatorAmountIn = ethers.parseEther("240000");

    let signer: HardhatEthersSigner;
    let sdcrv: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_HOLDER);
      await mockETHBalance(SDCRV_HOLDER, ethers.parseEther("10"));
      sdcrv = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, signer);

      await sdcrv.connect(signer).approve(wrapper.getAddress(), MaxUint256);
      await wrapper.connect(signer).deposit(ethers.parseEther("160000"), signer.address);

      await sdcrv.connect(signer).transfer(deployer.address, ethers.parseEther("400000"));
      await sdcrv.connect(deployer).approve(wrapper.getAddress(), MaxUint256);
      await wrapper.connect(deployer).deposit(ethers.parseEther("400000"), deployer.address);

      await sdcrv.connect(signer).transfer(operator.address, ethers.parseEther("240000"));
      await sdcrv.connect(operator).approve(wrapper.getAddress(), MaxUint256);
      await wrapper.connect(operator).deposit(ethers.parseEther("240000"), operator.address);

      await wrapper.updateTreasury(operator.address);
      await wrapper.updateExpenseRatio(2e8); // 20% platform
      await wrapper.updateHarvesterRatio(1e8); // 10% bounty
      await wrapper.updateBoosterRatio(2e8); // 20% booster
    });

    it("should succeed, when distribute linear in 7 days", async () => {
      const crv = await ethers.getContractAt("MockERC20", TOKENS.CRV.address, deployer);
      const sdt = await ethers.getContractAt("MockERC20", TOKENS.SDT.address, deployer);
      const tricrv = await ethers.getContractAt("MockERC20", TOKENS.TRICRV.address, deployer);
      const supply = await wrapper.totalSupply();

      const wrapperCRVBefore = await crv.balanceOf(wrapper.getAddress());
      const wrapperSDTBefore = await sdt.balanceOf(wrapper.getAddress());
      const wrapper3CRVBefore = await tricrv.balanceOf(wrapper.getAddress());

      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      await wrapper.harvest(deployer.address);
      const crv_reward = (await crv.balanceOf(wrapper.getAddress())) - wrapperCRVBefore; // 70%
      const sdt_reward = (await sdt.balanceOf(wrapper.getAddress())) - wrapperSDTBefore; // 50%
      const tricrv_reward = (await tricrv.balanceOf(wrapper.getAddress())) - wrapper3CRVBefore; // 70%

      let beforeCRV = await crv.balanceOf(signer.address);
      let beforeSDT = await sdt.balanceOf(signer.address);
      let before3CRV = await tricrv.balanceOf(signer.address);
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * (7 + 3.5)]);
      await wrapper.connect(signer)["claim(address,address)"](signer.address, signer.address); // to self
      let afterCRV = await crv.balanceOf(signer.address);
      let afterSDT = await sdt.balanceOf(signer.address);
      let after3CRV = await tricrv.balanceOf(signer.address);
      expect(afterCRV - beforeCRV).to.closeTo((crv_reward * signerAmountIn) / supply / 2n, 10n ** 6n);
      expect(afterSDT - beforeSDT).to.closeTo((sdt_reward * signerAmountIn) / supply / 2n, 10n ** 6n);
      expect(after3CRV - before3CRV).to.closeTo((tricrv_reward * signerAmountIn) / supply / 2n, 10n ** 6n);

      beforeCRV = await crv.balanceOf(signer.address);
      beforeSDT = await sdt.balanceOf(signer.address);
      before3CRV = await tricrv.balanceOf(signer.address);
      await wrapper.connect(deployer)["claim(address,address)"](deployer.address, signer.address); // to other
      afterCRV = await crv.balanceOf(signer.address);
      afterSDT = await sdt.balanceOf(signer.address);
      after3CRV = await tricrv.balanceOf(signer.address);
      expect(afterCRV - beforeCRV).to.closeTo(
        (crv_reward * deployerAmountIn) / supply / 2n,
        (afterCRV - beforeCRV) / 10000n
      );
      expect(afterSDT - beforeSDT).to.closeTo(
        (sdt_reward * deployerAmountIn) / supply / 2n,
        (afterSDT - beforeSDT) / 10000n
      );
      expect(after3CRV - before3CRV).to.closeTo(
        (tricrv_reward * deployerAmountIn) / supply / 2n,
        (after3CRV - before3CRV) / 10000n
      );

      beforeCRV = await crv.balanceOf(operator.address);
      beforeSDT = await sdt.balanceOf(operator.address);
      before3CRV = await tricrv.balanceOf(operator.address);
      await wrapper.connect(operator)["claim(address,address)"](operator.address, operator.address); // to self
      afterCRV = await crv.balanceOf(operator.address);
      afterSDT = await sdt.balanceOf(operator.address);
      after3CRV = await tricrv.balanceOf(operator.address);
      expect(afterCRV - beforeCRV).to.closeTo(
        (crv_reward * operatorAmountIn) / supply / 2n,
        (afterCRV - beforeCRV) / 10000n
      );
      expect(afterSDT - beforeSDT).to.closeTo(
        (sdt_reward * operatorAmountIn) / supply / 2n,
        (afterSDT - beforeSDT) / 10000n
      );
      expect(after3CRV - before3CRV).to.closeTo(
        (tricrv_reward * operatorAmountIn) / supply / 2n,
        (after3CRV - before3CRV) / 10000n
      );
    });
  });

  context("harvestBribes", async () => {
    let merkle: IMultiMerkleStash;

    beforeEach(async () => {
      const merkleOwner = await ethers.getSigner(MERKLE_OWNER);
      await network.provider.send("hardhat_setBalance", [MERKLE_OWNER, "0x" + ethers.parseEther("10").toString(16)]);
      merkle = await ethers.getContractAt(
        "IMultiMerkleStash",
        "0x03E34b085C52985F6a5D27243F20C84bDdc01Db4",
        merkleOwner
      );

      await wrapper.updateTreasury(operator.address);
      await wrapper.updateExpenseRatio(2e8); // 20% platform
      await wrapper.updateHarvesterRatio(1e8); // 10% bounty
      await wrapper.updateBoosterRatio(2e8); // 20% booster
    });

    it("should succeed when bribe is SDT", async () => {
      const amount = ethers.parseEther("100");
      const sdt = await ethers.getContractAt("MockERC20", TOKENS.SDT.address, deployer);
      const root = solidityPackedKeccak256(["uint256", "address", "uint256"], [0n, await locker.getAddress(), amount]);
      await merkle.updateMerkleRoot(TOKENS.SDT.address, root);

      const wrapperSDTBefore = await sdt.balanceOf(wrapper.getAddress());
      const platformSDTBefore = await sdt.balanceOf(operator.address);
      const boosterSDTBefore = await sdt.balanceOf(delegation.getAddress());

      const tx = await wrapper.harvestBribes([
        {
          token: TOKENS.SDT.address,
          index: 0n,
          amount,
          merkleProof: [],
        },
      ]);
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      const sdt_reward = (await sdt.balanceOf(wrapper.getAddress())) - wrapperSDTBefore; // 60%
      const sdt_platform = (await sdt.balanceOf(operator.address)) - platformSDTBefore; // 20%
      const sdt_boost = (await sdt.balanceOf(delegation.getAddress())) - boosterSDTBefore; // 20%
      expect(sdt_boost).to.eq(sdt_platform);
      expect(sdt_reward).to.eq(sdt_boost * 3n);
      expect(tx).to.emit(wrapper, "HarvestBribe").withArgs(TOKENS.SDT.address, amount, sdt_platform, sdt_boost);
      expect((await wrapper.rewardData(sdt.getAddress())).rate).to.eq(sdt_reward / toBigInt(86400 * 7));
      expect((await wrapper.rewardData(sdt.getAddress())).finishAt).to.eq(timestamp + 86400 * 7);
      expect((await wrapper.rewardData(sdt.getAddress())).lastUpdate).to.eq(timestamp);
    });

    it("should succeed when bribe is sdCRV", async () => {
      const amount = ethers.parseEther("100");
      const sdcrv = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, deployer);
      const root = solidityPackedKeccak256(["uint256", "address", "uint256"], [0n, await locker.getAddress(), amount]);
      await merkle.updateMerkleRoot(TOKENS.sdCRV.address, root);

      const before = await sdcrv.balanceOf(burner.getAddress());
      const tx = await wrapper.harvestBribes([
        {
          token: TOKENS.sdCRV.address,
          index: 0n,
          amount,
          merkleProof: [],
        },
      ]);
      expect(await sdcrv.balanceOf(burner.getAddress())).eq(before + amount);
      expect(tx)
        .to.emit(wrapper, "HarvestBribe")
        .withArgs(TOKENS.sdCRV.address, amount, (amount * 2n) / 10n, (amount * 2n) / 10n);
    });
  });
});

/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import { AladdinSdCRV, MockERC20, StakeDAOCRVVault, StakeDAOLockerProxy, VeSDTDelegation } from "../../../typechain";
import { request_fork } from "../../utils";
import { ADDRESS, DEPLOYED_CONTRACTS, ZAP_ROUTES } from "../../../scripts/utils";

const FORK_BLOCK_NUMBER = 16076550;

const SDT = "0x73968b9a57c6E53d41345FD57a6E6ae27d6CDB2F";
const THREE_CRV = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
const CRV = "0xD533a949740bb3306d119CC777fa900bA034cd52";
const CRV_HOLDER = "0x9B44473E223f8a3c047AD86f387B80402536B029";

const SD_VE_CRV = "0x478bBC744811eE8310B461514BDc29D03739084D";
const SD_VE_CRV_HOLDER = "0x2e945f5229dc19accaa8568ea783cbe73aac1505";

const SDCRV = "0xD1b5651E55D4CeeD36251c61c50C889B36F6abB5";
const SDCRV_HOLDER = "0x25431341a5800759268a6ac1d3cd91c029d7d9ca";
const SDCRV_GAUGE = "0x7f50786A0b15723D741727882ee99a0BF34e3466";
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const OPERATOR = "0x66c57bF505A85A74609D2C83E94Aabb26d691E1F";

const PLATFORM = DEPLOYED_CONTRACTS.Concentrator.Treasury;
const WITHDRAW_FEE_PERCENTAGE = 1e7; // 1%
const PLATFORM_FEE_PERCENTAGE = 2e8; // 20%
const HARVEST_BOUNTY_PERCENTAGE = 5e7; // 5%

const WITHDRAW_FEE_TYPE = "0x1b984391afd149dbfa9c9ae6207b4124e6f3df34afa8ab1e203176eea408e4da";

describe("AladdinSdCRV.spec", async () => {
  let deployer: SignerWithAddress;
  let operator: SignerWithAddress;
  let proxy: StakeDAOLockerProxy;
  let delegation: VeSDTDelegation;
  let vault: StakeDAOCRVVault;
  let asdcrv: AladdinSdCRV;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [
      DEPLOYED_CONTRACTS.ManagementMultisig,
      DEPLOYER,
      OPERATOR,
      CRV_HOLDER,
      SD_VE_CRV_HOLDER,
      SDCRV_HOLDER,
    ]);
    deployer = await ethers.getSigner(DEPLOYER);
    operator = await ethers.getSigner(OPERATOR);
    await deployer.sendTransaction({ to: CRV_HOLDER, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: SD_VE_CRV_HOLDER, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: SDCRV_HOLDER, value: ethers.utils.parseEther("10") });

    const StakeDAOLockerProxy = await ethers.getContractFactory("StakeDAOLockerProxy", deployer);
    proxy = await StakeDAOLockerProxy.deploy();
    await proxy.deployed();
    await proxy.initialize();

    const VeSDTDelegation = await ethers.getContractFactory("VeSDTDelegation", deployer);
    delegation = await VeSDTDelegation.deploy(proxy.address);
    await delegation.initialize(0);

    const StakeDAOCRVVault = await ethers.getContractFactory("StakeDAOCRVVault", deployer);
    vault = await StakeDAOCRVVault.deploy(proxy.address, delegation.address);
    await vault.initialize(SDCRV_GAUGE, 86400 * 30);

    const AladdinSdCRV = await ethers.getContractFactory("AladdinSdCRV", deployer);
    asdcrv = await AladdinSdCRV.deploy(vault.address);
    await asdcrv.deployed();
    await asdcrv.initialize(DEPLOYED_CONTRACTS.AladdinZap);

    await proxy.updateOperator(SDCRV_GAUGE, vault.address);
    await proxy.updateClaimer(vault.address);

    expect(await vault.rewardTokens(0)).to.eq(SDT);
    expect(await vault.rewardTokens(1)).to.eq(THREE_CRV);
    expect(await vault.rewardTokens(2)).to.eq(CRV);

    await asdcrv.updateFeeInfo(PLATFORM, PLATFORM_FEE_PERCENTAGE, HARVEST_BOUNTY_PERCENTAGE, WITHDRAW_FEE_PERCENTAGE);
  });

  context("auth", async () => {
    it("should revert, when reinitialize", async () => {
      await expect(asdcrv.initialize(constants.AddressZero)).to.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    context("updateFeeInfo", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(asdcrv.connect(operator).updateFeeInfo(constants.AddressZero, 0, 0, 0)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when platform is zero", async () => {
        await expect(asdcrv.updateFeeInfo(constants.AddressZero, 0, 0, 0)).to.revertedWith("zero platform address");
      });

      it("should revert, when fee too large", async () => {
        await expect(asdcrv.updateFeeInfo(deployer.address, 2e8 + 1, 0, 0)).to.revertedWith("platform fee too large");
        await expect(asdcrv.updateFeeInfo(deployer.address, 0, 1e8 + 1, 0)).to.revertedWith("bounty fee too large");
        await expect(asdcrv.updateFeeInfo(deployer.address, 0, 0, 1e8 + 1)).to.revertedWith("withdraw fee too large");
      });

      it("should succeed", async () => {
        expect(await asdcrv.feeInfo()).to.deep.eq([
          PLATFORM,
          PLATFORM_FEE_PERCENTAGE,
          HARVEST_BOUNTY_PERCENTAGE,
          WITHDRAW_FEE_PERCENTAGE,
        ]);
        await expect(asdcrv.updateFeeInfo(deployer.address, 2e8, 1e8, 1e7))
          .to.emit(asdcrv, "UpdateFeeInfo")
          .withArgs(deployer.address, 2e8, 1e8, 1e7);
        expect(await asdcrv.feeInfo()).to.deep.eq([deployer.address, 2e8, 1e8, 1e7]);
      });
    });

    context("updateRewardPeriodLength", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(asdcrv.connect(operator).updateRewardPeriodLength(1)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect((await asdcrv.rewardInfo()).periodLength).to.eq(0);
        await expect(asdcrv.updateRewardPeriodLength(1)).to.emit(asdcrv, "UpdateRewardPeriodLength").withArgs(1);
        expect((await asdcrv.rewardInfo()).periodLength).to.eq(1);
      });
    });

    context("updateZap", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(asdcrv.connect(operator).updateZap(constants.AddressZero)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when zap is zero", async () => {
        await expect(asdcrv.updateZap(constants.AddressZero)).to.revertedWith("asdCRV: zero zap address");
      });

      it("should succeed", async () => {
        await expect(asdcrv.updateZap(deployer.address)).to.emit(asdcrv, "UpdateZap").withArgs(deployer.address);
        expect(await asdcrv.zap()).to.eq(deployer.address);
      });
    });

    context("setWithdrawFeeForUser", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(asdcrv.connect(operator).setWithdrawFeeForUser(constants.AddressZero, 0)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when fee too large", async () => {
        await expect(asdcrv.setWithdrawFeeForUser(deployer.address, 1e8 + 1)).to.revertedWith("withdraw fee too large");
      });

      it("should succeed", async () => {
        expect(await asdcrv.getFeeRate(WITHDRAW_FEE_TYPE, deployer.address)).to.deep.eq(WITHDRAW_FEE_PERCENTAGE);
        await expect(asdcrv.setWithdrawFeeForUser(deployer.address, 1))
          .to.emit(asdcrv, "CustomizeFee")
          .withArgs(WITHDRAW_FEE_TYPE, deployer.address, 1);
        expect(await asdcrv.getFeeRate(WITHDRAW_FEE_TYPE, deployer.address)).to.deep.eq(1);
      });
    });
  });

  context("deposit", async () => {
    let signer: SignerWithAddress;
    let token: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_HOLDER);
      token = await ethers.getContractAt("MockERC20", SDCRV, signer);
    });

    it("should revert when deposit zero amount", async () => {
      await expect(vault.deposit(0, deployer.address)).to.revertedWith("deposit zero amount");
    });

    it("should succeed when deposit to self", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(asdcrv.address, amount);
      expect(await asdcrv.balanceOf(signer.address)).to.eq(constants.Zero);
      expect(await asdcrv.totalSupply()).to.eq(constants.Zero);
      await expect(asdcrv.connect(signer).deposit(amount, signer.address))
        .to.emit(asdcrv, "Deposit")
        .withArgs(signer.address, signer.address, amount, amount);
      expect(await asdcrv.balanceOf(signer.address)).to.eq(amount);
      expect(await asdcrv.totalSupply()).to.eq(amount);
    });

    it("should succeed when deposit to other", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(asdcrv.address, amount);
      expect(await asdcrv.balanceOf(operator.address)).to.eq(constants.Zero);
      expect(await asdcrv.totalSupply()).to.eq(constants.Zero);
      await expect(asdcrv.connect(signer).deposit(amount, operator.address))
        .to.emit(asdcrv, "Deposit")
        .withArgs(signer.address, operator.address, amount, amount);
      expect(await asdcrv.balanceOf(operator.address)).to.eq(amount);
      expect(await asdcrv.totalSupply()).to.eq(amount);
    });

    it("should succeed when deposit all to self", async () => {
      const amount = await token.balanceOf(signer.address);
      await token.approve(asdcrv.address, amount);
      expect(await asdcrv.balanceOf(operator.address)).to.eq(constants.Zero);
      expect(await asdcrv.totalSupply()).to.eq(constants.Zero);
      await expect(asdcrv.connect(signer).deposit(constants.MaxUint256, operator.address))
        .to.emit(asdcrv, "Deposit")
        .withArgs(signer.address, operator.address, amount, amount);
      expect(await asdcrv.balanceOf(operator.address)).to.eq(amount);
      expect(await asdcrv.totalSupply()).to.eq(amount);
    });

    it("should succeed when deposit multiple times", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(asdcrv.address, constants.MaxUint256);
      expect(await asdcrv.balanceOf(signer.address)).to.eq(constants.Zero);
      expect(await asdcrv.totalSupply()).to.eq(constants.Zero);

      await expect(asdcrv.connect(signer).deposit(amount, signer.address))
        .to.emit(asdcrv, "Deposit")
        .withArgs(signer.address, signer.address, amount, amount);

      expect(await asdcrv.balanceOf(signer.address)).to.eq(amount);
      expect(await asdcrv.totalSupply()).to.eq(amount);
      expect(await asdcrv.balanceOf(operator.address)).to.eq(constants.Zero);

      await expect(asdcrv.connect(signer).deposit(amount, operator.address))
        .to.emit(asdcrv, "Deposit")
        .withArgs(signer.address, operator.address, amount, amount);

      expect(await asdcrv.balanceOf(operator.address)).to.eq(amount);
      expect(await asdcrv.totalSupply()).to.eq(amount.mul(2));
    });
  });

  context("depositWithCRV", async () => {
    let signer: SignerWithAddress;
    let token: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(CRV_HOLDER);
      token = await ethers.getContractAt("MockERC20", CRV, signer);
    });

    it("should revert when deposit zero amount", async () => {
      await expect(asdcrv.depositWithCRV(0, deployer.address, 0)).to.revertedWith("deposit zero amount");
    });

    it("should revert when insufficient share", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(asdcrv.address, amount);
      const amountOut = await asdcrv.connect(signer).callStatic.depositWithCRV(amount, operator.address, 0);
      await expect(asdcrv.connect(signer).depositWithCRV(amount, deployer.address, amountOut.add(1))).to.revertedWith(
        "asdCRV: insufficient share received"
      );
    });

    it("should succeed when deposit to self", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(asdcrv.address, amount);
      expect(await asdcrv.balanceOf(signer.address)).to.eq(constants.Zero);
      expect(await asdcrv.totalSupply()).to.eq(constants.Zero);
      const amountOut = await asdcrv.connect(signer).callStatic.depositWithCRV(amount, signer.address, 0);
      await expect(asdcrv.connect(signer).depositWithCRV(amount, signer.address, amountOut))
        .to.emit(asdcrv, "Deposit")
        .withArgs(signer.address, signer.address, amountOut, amountOut);
      expect(await asdcrv.balanceOf(signer.address)).to.eq(amountOut);
      expect(await asdcrv.totalSupply()).to.eq(amountOut);
    });

    it("should succeed when deposit to other", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(asdcrv.address, amount);
      expect(await asdcrv.balanceOf(operator.address)).to.eq(constants.Zero);
      expect(await asdcrv.totalSupply()).to.eq(constants.Zero);
      const amountOut = await asdcrv.connect(signer).callStatic.depositWithCRV(amount, operator.address, 0);
      await expect(asdcrv.connect(signer).depositWithCRV(amount, operator.address, amountOut))
        .to.emit(asdcrv, "Deposit")
        .withArgs(signer.address, operator.address, amountOut, amountOut);
      expect(await asdcrv.balanceOf(operator.address)).to.eq(amountOut);
      expect(await asdcrv.totalSupply()).to.eq(amountOut);
    });

    it("should succeed when deposit all to self", async () => {
      const amount = await token.balanceOf(signer.address);
      await token.approve(asdcrv.address, amount);
      expect(await asdcrv.balanceOf(operator.address)).to.eq(constants.Zero);
      expect(await asdcrv.totalSupply()).to.eq(constants.Zero);
      const amountOut = await asdcrv
        .connect(signer)
        .callStatic.depositWithCRV(constants.MaxUint256, operator.address, 0);
      await expect(asdcrv.connect(signer).depositWithCRV(constants.MaxUint256, operator.address, amountOut))
        .to.emit(asdcrv, "Deposit")
        .withArgs(signer.address, operator.address, amountOut, amountOut);
      expect(await asdcrv.balanceOf(operator.address)).to.eq(amountOut);
      expect(await asdcrv.totalSupply()).to.eq(amountOut);
    });

    it("should succeed when deposit multiple times", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(asdcrv.address, constants.MaxUint256);
      expect(await asdcrv.balanceOf(signer.address)).to.eq(constants.Zero);
      expect(await asdcrv.totalSupply()).to.eq(constants.Zero);

      const amountOut1 = await asdcrv.connect(signer).callStatic.depositWithCRV(amount, operator.address, 0);
      await expect(asdcrv.connect(signer).depositWithCRV(amount, signer.address, amountOut1))
        .to.emit(asdcrv, "Deposit")
        .withArgs(signer.address, signer.address, amountOut1, amountOut1);

      expect(await asdcrv.balanceOf(signer.address)).to.eq(amountOut1);
      expect(await asdcrv.totalSupply()).to.eq(amountOut1);
      expect(await asdcrv.balanceOf(operator.address)).to.eq(constants.Zero);

      const amountOut2 = await asdcrv.connect(signer).callStatic.depositWithCRV(amount, operator.address, 0);
      await expect(asdcrv.connect(signer).depositWithCRV(amount, operator.address, amountOut2))
        .to.emit(asdcrv, "Deposit")
        .withArgs(signer.address, operator.address, amountOut2, amountOut2);

      expect(await asdcrv.balanceOf(operator.address)).to.eq(amountOut2);
      expect(await asdcrv.totalSupply()).to.eq(amountOut1.add(amountOut2));
    });
  });

  context("depositWithSdVeCRV", async () => {
    let signer: SignerWithAddress;
    let token: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SD_VE_CRV_HOLDER);
      token = await ethers.getContractAt("MockERC20", SD_VE_CRV, signer);
    });

    it("should revert when deposit zero amount", async () => {
      await expect(asdcrv.depositWithSdVeCRV(0, deployer.address)).to.revertedWith("deposit zero amount");
    });

    it("should succeed when deposit to self", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(asdcrv.address, amount);
      expect(await asdcrv.balanceOf(signer.address)).to.eq(constants.Zero);
      expect(await asdcrv.totalSupply()).to.eq(constants.Zero);
      await expect(asdcrv.connect(signer).depositWithSdVeCRV(amount, signer.address))
        .to.emit(asdcrv, "Deposit")
        .withArgs(signer.address, signer.address, amount, amount);
      expect(await asdcrv.balanceOf(signer.address)).to.eq(amount);
      expect(await asdcrv.totalSupply()).to.eq(amount);
    });

    it("should succeed when deposit to other", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(asdcrv.address, amount);
      expect(await asdcrv.balanceOf(operator.address)).to.eq(constants.Zero);
      expect(await asdcrv.totalSupply()).to.eq(constants.Zero);
      await expect(asdcrv.connect(signer).depositWithSdVeCRV(amount, operator.address))
        .to.emit(asdcrv, "Deposit")
        .withArgs(signer.address, operator.address, amount, amount);
      expect(await asdcrv.balanceOf(operator.address)).to.eq(amount);
      expect(await asdcrv.totalSupply()).to.eq(amount);
    });

    it("should succeed when deposit all to self", async () => {
      const amount = await token.balanceOf(signer.address);
      await token.approve(asdcrv.address, amount);
      expect(await asdcrv.balanceOf(operator.address)).to.eq(constants.Zero);
      expect(await asdcrv.totalSupply()).to.eq(constants.Zero);
      await expect(asdcrv.connect(signer).depositWithSdVeCRV(constants.MaxUint256, operator.address))
        .to.emit(asdcrv, "Deposit")
        .withArgs(signer.address, operator.address, amount, amount);
      expect(await asdcrv.balanceOf(operator.address)).to.eq(amount);
      expect(await asdcrv.totalSupply()).to.eq(amount);
    });

    it("should succeed when deposit multiple times", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(asdcrv.address, constants.MaxUint256);
      expect(await asdcrv.balanceOf(signer.address)).to.eq(constants.Zero);
      expect(await asdcrv.totalSupply()).to.eq(constants.Zero);

      await expect(asdcrv.connect(signer).depositWithSdVeCRV(amount, signer.address))
        .to.emit(asdcrv, "Deposit")
        .withArgs(signer.address, signer.address, amount, amount);

      expect(await asdcrv.balanceOf(signer.address)).to.eq(amount);
      expect(await asdcrv.totalSupply()).to.eq(amount);
      expect(await asdcrv.balanceOf(operator.address)).to.eq(constants.Zero);

      await expect(asdcrv.connect(signer).depositWithSdVeCRV(amount, operator.address))
        .to.emit(asdcrv, "Deposit")
        .withArgs(signer.address, operator.address, amount, amount);

      expect(await asdcrv.balanceOf(operator.address)).to.eq(amount);
      expect(await asdcrv.totalSupply()).to.eq(amount.mul(2));
    });
  });

  context("redeem", async () => {
    const depositAmount = ethers.utils.parseEther("100");
    let signer: SignerWithAddress;
    let sdcrv: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_HOLDER);
      sdcrv = await ethers.getContractAt("MockERC20", SDCRV, signer);
      await sdcrv.approve(asdcrv.address, constants.MaxUint256);
      await asdcrv.connect(signer).deposit(depositAmount, signer.address);
      await vault.updateFeeInfo(deployer.address, 0, 0, 0, 1e6); // 10% withdraw fee for vault
      await vault.setWithdrawFeeForUser(asdcrv.address, 0);
      await asdcrv.updateFeeInfo(deployer.address, 0, 0, 1e8); // 10% withdraw fee for asdCRV
    });

    it("should revert when redeem zero amount", async () => {
      await expect(asdcrv.connect(signer).redeem(0, deployer.address, signer.address)).to.revertedWith(
        "asdCRV: withdraw zero share"
      );
    });

    it("should revert when redeem exceed balance", async () => {
      await asdcrv.connect(signer).deposit(depositAmount, deployer.address);
      await expect(
        asdcrv.connect(signer).redeem(depositAmount.add(1), deployer.address, signer.address)
      ).to.revertedWith("asdCRV: insufficient owner shares");
    });

    it("should succeed, when redeem 10 to self", async () => {
      expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("100"));
      expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("100"));
      await expect(asdcrv.connect(signer).redeem(ethers.utils.parseEther("10"), signer.address, signer.address))
        .to.emit(asdcrv, "Withdraw")
        .withArgs(
          signer.address,
          signer.address,
          signer.address,
          ethers.utils.parseEther("9"),
          ethers.utils.parseEther("10")
        );
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      expect((await asdcrv.getUserLocks(signer.address))[0].amount).to.eq(ethers.utils.parseEther("9"));
      expect((await asdcrv.getUserLocks(signer.address))[0].expireAt).to.eq(timestamp + 86400 * 30);
      expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("90"));
      expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("90"));
    });

    it("should succeed, when redeem 10 to other", async () => {
      expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("100"));
      expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("100"));
      await expect(asdcrv.connect(signer).redeem(ethers.utils.parseEther("10"), operator.address, signer.address))
        .to.emit(asdcrv, "Withdraw")
        .withArgs(
          signer.address,
          operator.address,
          signer.address,
          ethers.utils.parseEther("9"),
          ethers.utils.parseEther("10")
        );
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      expect((await asdcrv.getUserLocks(operator.address))[0].amount).to.eq(ethers.utils.parseEther("9"));
      expect((await asdcrv.getUserLocks(operator.address))[0].expireAt).to.eq(timestamp + 86400 * 30);
      expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("90"));
      expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("90"));
    });

    it("should succeed, when redeem all to self", async () => {
      expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("100"));
      expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("100"));
      await expect(asdcrv.connect(signer).redeem(constants.MaxUint256, signer.address, signer.address))
        .to.emit(asdcrv, "Withdraw")
        .withArgs(
          signer.address,
          signer.address,
          signer.address,
          ethers.utils.parseEther("100"),
          ethers.utils.parseEther("100")
        );
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      expect((await asdcrv.getUserLocks(signer.address))[0].amount).to.eq(ethers.utils.parseEther("100"));
      expect((await asdcrv.getUserLocks(signer.address))[0].expireAt).to.eq(timestamp + 86400 * 30);
      expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("0"));
      expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("0"));
    });

    it("should succeed, when redeem 10 to self and ignore withdraw fee", async () => {
      await asdcrv.connect(deployer).setWithdrawFeeForUser(signer.address, 0);
      expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("100"));
      expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("100"));
      await expect(asdcrv.connect(signer).redeem(ethers.utils.parseEther("10"), signer.address, signer.address))
        .to.emit(asdcrv, "Withdraw")
        .withArgs(
          signer.address,
          signer.address,
          signer.address,
          ethers.utils.parseEther("10"),
          ethers.utils.parseEther("10")
        );
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      expect((await asdcrv.getUserLocks(signer.address))[0].amount).to.eq(ethers.utils.parseEther("10"));
      expect((await asdcrv.getUserLocks(signer.address))[0].expireAt).to.eq(timestamp + 86400 * 30);
      expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("90"));
      expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("90"));
    });

    it("should succeed, when redeem 10 to self and withdraw fee customize to 5%", async () => {
      await asdcrv.connect(deployer).setWithdrawFeeForUser(signer.address, "50000000");
      expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("100"));
      expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("100"));
      await expect(asdcrv.connect(signer).redeem(ethers.utils.parseEther("10"), signer.address, signer.address))
        .to.emit(asdcrv, "Withdraw")
        .withArgs(
          signer.address,
          signer.address,
          signer.address,
          ethers.utils.parseEther("9.5"),
          ethers.utils.parseEther("10")
        );
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      expect((await asdcrv.getUserLocks(signer.address))[0].amount).to.eq(ethers.utils.parseEther("9.5"));
      expect((await asdcrv.getUserLocks(signer.address))[0].expireAt).to.eq(timestamp + 86400 * 30);
      expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("90"));
      expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("90"));
    });
  });

  context("withdraw", async () => {
    const depositAmount = ethers.utils.parseEther("100");
    let signer: SignerWithAddress;
    let sdcrv: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_HOLDER);
      sdcrv = await ethers.getContractAt("MockERC20", SDCRV, signer);
      await sdcrv.approve(asdcrv.address, constants.MaxUint256);
      await asdcrv.connect(signer).deposit(depositAmount, signer.address);
      await vault.updateFeeInfo(deployer.address, 0, 0, 0, 1e5); // 1% withdraw fee for vault
      await asdcrv.updateFeeInfo(deployer.address, 0, 0, 1e8); // 10% withdraw fee for asdCRV
    });

    it("should revert when withdraw zero amount", async () => {
      await expect(asdcrv.connect(signer).withdraw(0, deployer.address, signer.address)).to.revertedWith(
        "asdCRV: withdraw zero share"
      );
    });

    it("should revert when withdraw exceed tatal asses", async () => {
      await expect(
        asdcrv.connect(signer).withdraw(depositAmount.add(1), deployer.address, signer.address)
      ).to.revertedWith("exceed total assets");
    });

    it("should revert when withdraw exceed balance", async () => {
      await asdcrv.connect(signer).deposit(depositAmount, deployer.address);
      await expect(
        asdcrv.connect(signer).withdraw(depositAmount.add(1), deployer.address, signer.address)
      ).to.revertedWith("asdCRV: insufficient owner shares");
    });

    it("should succeed, when withdraw 10 to self", async () => {
      expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("100"));
      expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("100"));
      await expect(asdcrv.connect(signer).withdraw(ethers.utils.parseEther("10"), signer.address, signer.address))
        .to.emit(asdcrv, "Withdraw")
        .withArgs(
          signer.address,
          signer.address,
          signer.address,
          ethers.utils.parseEther("9.9"),
          ethers.utils.parseEther("11.111111111111111111")
        );
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      expect((await asdcrv.getUserLocks(signer.address))[0].amount).to.eq(ethers.utils.parseEther("9.9"));
      expect((await asdcrv.getUserLocks(signer.address))[0].expireAt).to.eq(timestamp + 86400 * 30);
      expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("88.888888888888888889"));
      expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("88.888888888888888889"));
    });

    it("should succeed, when withdraw 10 to other", async () => {
      expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("100"));
      expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("100"));
      await expect(asdcrv.connect(signer).withdraw(ethers.utils.parseEther("10"), operator.address, signer.address))
        .to.emit(asdcrv, "Withdraw")
        .withArgs(
          signer.address,
          operator.address,
          signer.address,
          ethers.utils.parseEther("9.9"),
          ethers.utils.parseEther("11.111111111111111111")
        );
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      expect((await asdcrv.getUserLocks(operator.address))[0].amount).to.eq(ethers.utils.parseEther("9.9"));
      expect((await asdcrv.getUserLocks(operator.address))[0].expireAt).to.eq(timestamp + 86400 * 30);
      expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("88.888888888888888889"));
      expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("88.888888888888888889"));
    });

    it("should succeed, when withdraw all to self", async () => {
      expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("100"));
      expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("100"));
      await expect(asdcrv.connect(signer).withdraw(constants.MaxUint256, signer.address, signer.address))
        .to.emit(asdcrv, "Withdraw")
        .withArgs(
          signer.address,
          signer.address,
          signer.address,
          ethers.utils.parseEther("99"),
          ethers.utils.parseEther("100")
        );
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      expect((await asdcrv.getUserLocks(signer.address))[0].amount).to.eq(ethers.utils.parseEther("99"));
      expect((await asdcrv.getUserLocks(signer.address))[0].expireAt).to.eq(timestamp + 86400 * 30);
      expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("0"));
      expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("0"));
    });

    for (const vaultFeeRate of [0, 1e7]) {
      for (const asdcrvFeeRate of [0, 5e7]) {
        it(`should succeed, when withdraw 10 to self and aCRV_Fee[${asdcrvFeeRate / 1e7}%] vault_Fee[${
          vaultFeeRate / 1e7
        }%]`, async () => {
          await vault.connect(deployer).setWithdrawFeeForUser(asdcrv.address, vaultFeeRate);
          await asdcrv.connect(deployer).setWithdrawFeeForUser(signer.address, asdcrvFeeRate);
          expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("100"));
          expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("100"));
          const shares = ethers.utils
            .parseEther("10")
            .mul(1e9)
            .div(1e9 - asdcrvFeeRate);
          const amountOut = ethers.utils.parseEther("10").sub(ethers.utils.parseEther("10").mul(vaultFeeRate).div(1e9));
          await expect(asdcrv.connect(signer).withdraw(ethers.utils.parseEther("10"), signer.address, signer.address))
            .to.emit(asdcrv, "Withdraw")
            .withArgs(signer.address, signer.address, signer.address, amountOut, shares);
          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          expect((await asdcrv.getUserLocks(signer.address))[0].amount).to.eq(amountOut);
          expect((await asdcrv.getUserLocks(signer.address))[0].expireAt).to.eq(timestamp + 86400 * 30);
          expect(await asdcrv.totalSupply()).to.eq(ethers.utils.parseEther("100").sub(shares));
          expect(await asdcrv.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("100").sub(shares));
        });
      }
    }
  });

  context("withdrawExpired", async () => {
    const depositAmount = ethers.utils.parseEther("100");
    let signer: SignerWithAddress;
    let sdcrv: MockERC20;
    let timestamps: number[];

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_HOLDER);
      sdcrv = await ethers.getContractAt("MockERC20", SDCRV, signer);
      await vault.updateFeeInfo(deployer.address, 0, 0, 0, 1e5); // 1% withdraw fee for vault
      await asdcrv.updateFeeInfo(deployer.address, 0, 0, 0); // 0% withdraw fee for asdCRV
      await sdcrv.approve(asdcrv.address, constants.MaxUint256);
      await asdcrv.connect(signer).deposit(depositAmount, signer.address);
      timestamps = [];
      for (let i = 0; i < 10; i++) {
        await asdcrv.connect(signer).redeem(ethers.utils.parseEther("10"), signer.address, signer.address);
        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        timestamps.push(timestamp);
        if (i < 9) {
          await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400]);
        }
      }
      const lists = await asdcrv.getUserLocks(signer.address);
      expect(lists.length).to.eq(10);
      for (let i = 0; i < 10; i++) {
        expect(lists[i].amount).to.eq(ethers.utils.parseEther("9.9"));
        expect(lists[i].expireAt).to.eq(timestamps[i] + 86400 * 30);
      }
    });

    it("should revert, when withdraw from others to others", async () => {
      await expect(asdcrv.connect(deployer).withdrawExpired(signer.address, deployer.address)).to.revertedWith(
        "withdraw from others to others"
      );
    });

    it("should succeed, when withdraw expired to self", async () => {
      for (let i = 0; i < 10; i++) {
        await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamps[i] + 86400 * 30]);
        const balanceBefore = await sdcrv.balanceOf(signer.address);
        await expect(asdcrv.connect(signer).withdrawExpired(signer.address, signer.address))
          .to.emit(asdcrv, "WithdrawExpired")
          .withArgs(signer.address, signer.address, ethers.utils.parseEther("9.9"));
        const balanceAfter = await sdcrv.balanceOf(signer.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(ethers.utils.parseEther("9.9"));
        const lists = await asdcrv.getUserLocks(signer.address);
        expect(lists.length).to.eq(9 - i);
      }
    });

    it("should succeed, when with expired to others", async () => {
      for (let i = 0; i < 10; i++) {
        await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamps[i] + 86400 * 30]);
        const balanceBefore = await sdcrv.balanceOf(operator.address);
        await expect(asdcrv.connect(signer).withdrawExpired(signer.address, operator.address))
          .to.emit(asdcrv, "WithdrawExpired")
          .withArgs(signer.address, operator.address, ethers.utils.parseEther("9.9"));
        const balanceAfter = await sdcrv.balanceOf(operator.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(ethers.utils.parseEther("9.9"));
        const lists = await asdcrv.getUserLocks(signer.address);
        expect(lists.length).to.eq(9 - i);
      }
    });
  });

  context("harvest", async () => {
    const depositAmount = ethers.utils.parseEther("800000");
    let signer: SignerWithAddress;
    let sdcrv: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_HOLDER);
      sdcrv = await ethers.getContractAt("MockERC20", SDCRV, signer);
      await sdcrv.approve(asdcrv.address, constants.MaxUint256);
      await asdcrv.connect(signer).deposit(depositAmount, signer.address);
      // vault config: 20% platform, 10% bounty, 20% boost
      await vault.updateFeeInfo(operator.address, 2e6, 1e6, 2e6, 0);
      // asdCRV config: 1% platform, 2% bounty, 0% withdraw
      await asdcrv.updateFeeInfo(operator.address, 1e7, 2e7, 0);

      const owner = await ethers.getSigner(DEPLOYED_CONTRACTS.ManagementMultisig);
      await deployer.sendTransaction({ to: owner.address, value: ethers.utils.parseEther("10") });
      const zap = await ethers.getContractAt("AladdinZap", DEPLOYED_CONTRACTS.AladdinZap, owner);
      await zap.updateRoute(ADDRESS.SDT, ADDRESS.CRV, ZAP_ROUTES.SDT.CRV);
      await zap.updateRoute(ADDRESS.SDT, ADDRESS.WETH, ZAP_ROUTES.SDT.WETH);
      await zap.updateRoute(THREE_CRV, ADDRESS.WETH, ZAP_ROUTES["3CRV"].WETH);
    });

    it("should succeed, when distribute intermediately", async () => {
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      await vault.harvest(deployer.address);

      const sdcrv_before = await vault.balanceOf(asdcrv.address);
      await asdcrv.harvest(deployer.address, 0);
      const sdcrv_after = await vault.balanceOf(asdcrv.address);
      const sdcrv_harvest = sdcrv_after.sub(sdcrv_before);
      expect(sdcrv_harvest).gt(constants.Zero);

      const sdcrv_bounty = sdcrv_harvest.mul(2).div(100);
      const sdcrv_platform = sdcrv_harvest.mul(1).div(100);
      expect(await asdcrv.totalSupply()).to.eq(depositAmount.add(sdcrv_bounty).add(sdcrv_platform));
      expect(await asdcrv.totalAssets()).to.eq(sdcrv_after);
      expect(sdcrv_bounty).to.eq(await asdcrv.balanceOf(deployer.address));
      expect(sdcrv_platform).to.eq(await asdcrv.balanceOf(operator.address));
    });

    it("should succeed, when crv and sdt distribute linear in 7 days", async () => {
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      await asdcrv.updateRewardPeriodLength(86400 * 7);
      await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7 - 1]);
      await vault.harvest(deployer.address);

      const sdcrv_before = await vault.balanceOf(asdcrv.address);
      await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      await asdcrv.harvest(deployer.address, 0);
      const sdcrv_after = await vault.balanceOf(asdcrv.address);
      const sdcrv_harvest = sdcrv_after.sub(sdcrv_before);
      expect(sdcrv_harvest).gt(constants.Zero);

      const sdcrv_bounty = sdcrv_harvest.mul(2).div(100);
      const sdcrv_platform = sdcrv_harvest.mul(1).div(100);
      const sdcrv_reward = sdcrv_harvest.sub(sdcrv_bounty).sub(sdcrv_platform);
      expect(await asdcrv.totalSupply()).to.eq(depositAmount.add(sdcrv_bounty).add(sdcrv_platform));
      expect(await asdcrv.totalAssets()).to.eq(sdcrv_before.add(sdcrv_bounty).add(sdcrv_platform));
      expect(sdcrv_bounty).to.eq(await asdcrv.balanceOf(deployer.address));
      expect(sdcrv_platform).to.eq(await asdcrv.balanceOf(operator.address));

      // 3 days passed
      await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 10]);
      await asdcrv.checkpoint();
      expect(await asdcrv.totalAssets()).to.eq(
        sdcrv_before
          .add(sdcrv_bounty)
          .add(sdcrv_platform)
          .add(sdcrv_reward.div(86400 * 7).mul(86400 * 3))
      );

      // 7 days passed
      await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 14]);
      await asdcrv.checkpoint();
      expect(await asdcrv.totalAssets()).to.eq(
        sdcrv_before
          .add(sdcrv_bounty)
          .add(sdcrv_platform)
          .add(sdcrv_reward.div(86400 * 7).mul(86400 * 7))
      );

      // 14 days passed
      await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 21]);
      await asdcrv.checkpoint();
      expect(await asdcrv.totalAssets()).to.eq(
        sdcrv_before
          .add(sdcrv_bounty)
          .add(sdcrv_platform)
          .add(sdcrv_reward.div(86400 * 7).mul(86400 * 7))
      );
    });
  });
});

/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import { MockERC20, StakeDAOCRVVault, StakeDAOLockerProxy, VeSDTDelegation } from "../../../typechain";
import { request_fork } from "../../utils";

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

describe("StakeDAOCRVVault.spec", async () => {
  let deployer: SignerWithAddress;
  let operator: SignerWithAddress;
  let proxy: StakeDAOLockerProxy;
  let delegation: VeSDTDelegation;
  let vault: StakeDAOCRVVault;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, OPERATOR, CRV_HOLDER, SD_VE_CRV_HOLDER, SDCRV_HOLDER]);
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

    await proxy.updateOperator(SDCRV_GAUGE, vault.address);
    await proxy.updateClaimer(vault.address);

    expect(await vault.rewardTokens(0)).to.eq(SDT);
    expect(await vault.rewardTokens(1)).to.eq(THREE_CRV);
    expect(await vault.rewardTokens(2)).to.eq(CRV);
  });

  context("auth", async () => {
    context("#takeWithdrawFee", async () => {
      it("should revert, when call takeWithdrawFee and caller is not owner", async () => {
        await expect(vault.connect(operator).takeWithdrawFee(operator.address)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    context("#updateFeeInfo", async () => {
      it("should revert, when call updateFeeInfo and caller is not owner", async () => {
        await expect(vault.connect(operator).updateFeeInfo(operator.address, 0, 0, 0, 0)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert when fee too large", async () => {
        await expect(vault.updateFeeInfo(constants.AddressZero, 0, 0, 0, 0)).to.revertedWith("zero address");
        await expect(vault.updateFeeInfo(operator.address, 2e6 + 1, 0, 0, 0)).to.revertedWith("platform fee too large");
        await expect(vault.updateFeeInfo(operator.address, 0, 1e6 + 1, 0, 0)).to.revertedWith("bounty fee too large");
        await expect(vault.updateFeeInfo(operator.address, 0, 0, 2e6 + 1, 0)).to.revertedWith("boost fee too large");
        await expect(vault.updateFeeInfo(operator.address, 0, 0, 0, 1e6 + 1)).to.revertedWith("withdraw fee too large");
      });

      it("should succeed", async () => {
        expect((await vault.feeInfo()).platform).to.eq(constants.AddressZero);
        expect((await vault.feeInfo()).platformPercentage).to.eq(0);
        expect((await vault.feeInfo()).bountyPercentage).to.eq(0);
        expect((await vault.feeInfo()).boostPercentage).to.eq(0);
        expect((await vault.feeInfo()).withdrawPercentage).to.eq(0);
        await expect(vault.connect(deployer).updateFeeInfo(operator.address, 2e6, 1e6, 2e6, 1e6))
          .to.emit(vault, "UpdateFeeInfo")
          .withArgs(operator.address, 2e6, 1e6, 2e6, 1e6);
        expect((await vault.feeInfo()).platform).to.eq(operator.address);
        expect((await vault.feeInfo()).platformPercentage).to.eq(2e6);
        expect((await vault.feeInfo()).bountyPercentage).to.eq(1e6);
        expect((await vault.feeInfo()).boostPercentage).to.eq(2e6);
        expect((await vault.feeInfo()).withdrawPercentage).to.eq(1e6);
      });
    });

    context("#updateRewardPeriod", async () => {
      it("should revert, when call updateRewardPeriod and caller is not owner", async () => {
        await expect(vault.connect(operator).updateRewardPeriod(constants.AddressZero, 0)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when period too long", async () => {
        await expect(vault.updateRewardPeriod(constants.AddressZero, 86400 * 7 + 1)).to.revertedWith(
          "reward period too long"
        );
      });

      it("should succeed", async () => {
        expect((await vault.rewardInfo(operator.address)).periodLength).to.eq(0);
        await expect(vault.updateRewardPeriod(operator.address, 86400 * 7))
          .to.emit(vault, "UpdateRewardPeriod")
          .withArgs(operator.address, 86400 * 7);
        expect((await vault.rewardInfo(operator.address)).periodLength).to.eq(86400 * 7);
      });
    });

    context("#updateWhitelist", async () => {
      it("should revert, when call updateWhitelist and caller is not owner", async () => {
        await expect(vault.connect(operator).updateWhitelist([], true)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await vault.whitelist(operator.address)).to.eq(false);
        await expect(vault.updateWhitelist([operator.address], true))
          .to.emit(vault, "UpdateWhitelist")
          .withArgs(operator.address, true);
        expect(await vault.whitelist(operator.address)).to.eq(true);
        await expect(vault.updateWhitelist([operator.address], false))
          .to.emit(vault, "UpdateWhitelist")
          .withArgs(operator.address, false);
        expect(await vault.whitelist(operator.address)).to.eq(false);
      });
    });

    context("#updateWithdrawLockTime", async () => {
      it("should revert, when call updateWithdrawLockTime and caller is not owner", async () => {
        await expect(vault.connect(operator).updateWithdrawLockTime(0)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when period too small", async () => {
        await expect(vault.updateWithdrawLockTime(86400 - 1)).to.revertedWith("lock time too small");
      });

      it("should succeed", async () => {
        expect(await vault.withdrawLockTime()).to.eq(2592000);
        await expect(vault.updateWithdrawLockTime(86400)).to.emit(vault, "UpdateWithdrawLockTime").withArgs(86400);
        expect(await vault.withdrawLockTime()).to.eq(86400);
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
      await token.approve(vault.address, amount);
      expect(await vault.balanceOf(signer.address)).to.eq(constants.Zero);
      expect(await vault.totalSupply()).to.eq(constants.Zero);
      await expect(vault.connect(signer).deposit(amount, signer.address))
        .to.emit(vault, "Deposit")
        .withArgs(signer.address, signer.address, amount);
      expect(await vault.balanceOf(signer.address)).to.eq(amount);
      expect(await vault.totalSupply()).to.eq(amount);
    });

    it("should succeed when deposit to other", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(vault.address, amount);
      expect(await vault.balanceOf(operator.address)).to.eq(constants.Zero);
      expect(await vault.totalSupply()).to.eq(constants.Zero);
      await expect(vault.connect(signer).deposit(amount, operator.address))
        .to.emit(vault, "Deposit")
        .withArgs(signer.address, operator.address, amount);
      expect(await vault.balanceOf(operator.address)).to.eq(amount);
      expect(await vault.totalSupply()).to.eq(amount);
    });

    it("should succeed when deposit all to self", async () => {
      const amount = await token.balanceOf(signer.address);
      await token.approve(vault.address, amount);
      expect(await vault.balanceOf(operator.address)).to.eq(constants.Zero);
      expect(await vault.totalSupply()).to.eq(constants.Zero);
      await expect(vault.connect(signer).deposit(constants.MaxUint256, operator.address))
        .to.emit(vault, "Deposit")
        .withArgs(signer.address, operator.address, amount);
      expect(await vault.balanceOf(operator.address)).to.eq(amount);
      expect(await vault.totalSupply()).to.eq(amount);
    });

    it("should succeed when deposit multiple times", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(vault.address, constants.MaxUint256);
      expect(await vault.balanceOf(signer.address)).to.eq(constants.Zero);
      expect(await vault.totalSupply()).to.eq(constants.Zero);

      await expect(vault.connect(signer).deposit(amount, signer.address))
        .to.emit(vault, "Deposit")
        .withArgs(signer.address, signer.address, amount);

      expect(await vault.balanceOf(signer.address)).to.eq(amount);
      expect(await vault.totalSupply()).to.eq(amount);
      expect(await vault.balanceOf(operator.address)).to.eq(constants.Zero);

      await expect(vault.connect(signer).deposit(amount, operator.address))
        .to.emit(vault, "Deposit")
        .withArgs(signer.address, operator.address, amount);

      expect(await vault.balanceOf(operator.address)).to.eq(amount);
      expect(await vault.totalSupply()).to.eq(amount.mul(2));
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
      await expect(vault.depositWithCRV(0, deployer.address, 0)).to.revertedWith("deposit zero amount");
    });

    it("should revert when insufficient out", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(vault.address, amount);
      const amountOut = await vault.connect(signer).callStatic.depositWithCRV(amount, operator.address, 0);
      await expect(vault.connect(signer).depositWithCRV(amount, deployer.address, amountOut.add(1))).to.revertedWith(
        "insufficient amount out"
      );
    });

    it("should succeed when deposit to self", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(vault.address, amount);
      expect(await vault.balanceOf(signer.address)).to.eq(constants.Zero);
      expect(await vault.totalSupply()).to.eq(constants.Zero);
      const amountOut = await vault.connect(signer).callStatic.depositWithCRV(amount, signer.address, 0);
      await expect(vault.connect(signer).depositWithCRV(amount, signer.address, amountOut))
        .to.emit(vault, "Deposit")
        .withArgs(signer.address, signer.address, amountOut);
      expect(await vault.balanceOf(signer.address)).to.eq(amountOut);
      expect(await vault.totalSupply()).to.eq(amountOut);
    });

    it("should succeed when deposit to other", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(vault.address, amount);
      expect(await vault.balanceOf(operator.address)).to.eq(constants.Zero);
      expect(await vault.totalSupply()).to.eq(constants.Zero);
      const amountOut = await vault.connect(signer).callStatic.depositWithCRV(amount, operator.address, 0);
      await expect(vault.connect(signer).depositWithCRV(amount, operator.address, amountOut))
        .to.emit(vault, "Deposit")
        .withArgs(signer.address, operator.address, amountOut);
      expect(await vault.balanceOf(operator.address)).to.eq(amountOut);
      expect(await vault.totalSupply()).to.eq(amountOut);
    });

    it("should succeed when deposit all to self", async () => {
      const amount = await token.balanceOf(signer.address);
      await token.approve(vault.address, amount);
      expect(await vault.balanceOf(operator.address)).to.eq(constants.Zero);
      expect(await vault.totalSupply()).to.eq(constants.Zero);
      const amountOut = await vault
        .connect(signer)
        .callStatic.depositWithCRV(constants.MaxUint256, operator.address, 0);
      await expect(vault.connect(signer).depositWithCRV(constants.MaxUint256, operator.address, amountOut))
        .to.emit(vault, "Deposit")
        .withArgs(signer.address, operator.address, amountOut);
      expect(await vault.balanceOf(operator.address)).to.eq(amountOut);
      expect(await vault.totalSupply()).to.eq(amountOut);
    });

    it("should succeed when deposit multiple times", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(vault.address, constants.MaxUint256);
      expect(await vault.balanceOf(signer.address)).to.eq(constants.Zero);
      expect(await vault.totalSupply()).to.eq(constants.Zero);

      const amountOut1 = await vault.connect(signer).callStatic.depositWithCRV(amount, operator.address, 0);
      await expect(vault.connect(signer).depositWithCRV(amount, signer.address, amountOut1))
        .to.emit(vault, "Deposit")
        .withArgs(signer.address, signer.address, amountOut1);

      expect(await vault.balanceOf(signer.address)).to.eq(amountOut1);
      expect(await vault.totalSupply()).to.eq(amountOut1);
      expect(await vault.balanceOf(operator.address)).to.eq(constants.Zero);

      const amountOut2 = await vault.connect(signer).callStatic.depositWithCRV(amount, operator.address, 0);
      await expect(vault.connect(signer).depositWithCRV(amount, operator.address, amountOut2))
        .to.emit(vault, "Deposit")
        .withArgs(signer.address, operator.address, amountOut2);

      expect(await vault.balanceOf(operator.address)).to.eq(amountOut2);
      expect(await vault.totalSupply()).to.eq(amountOut1.add(amountOut2));
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
      await expect(vault.depositWithSdVeCRV(0, deployer.address)).to.revertedWith("deposit zero amount");
    });

    it("should succeed when deposit to self", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(vault.address, amount);
      expect(await vault.balanceOf(signer.address)).to.eq(constants.Zero);
      expect(await vault.totalSupply()).to.eq(constants.Zero);
      await expect(vault.connect(signer).depositWithSdVeCRV(amount, signer.address))
        .to.emit(vault, "Deposit")
        .withArgs(signer.address, signer.address, amount);
      expect(await vault.balanceOf(signer.address)).to.eq(amount);
      expect(await vault.totalSupply()).to.eq(amount);
    });

    it("should succeed when deposit to other", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(vault.address, amount);
      expect(await vault.balanceOf(operator.address)).to.eq(constants.Zero);
      expect(await vault.totalSupply()).to.eq(constants.Zero);
      await expect(vault.connect(signer).depositWithSdVeCRV(amount, operator.address))
        .to.emit(vault, "Deposit")
        .withArgs(signer.address, operator.address, amount);
      expect(await vault.balanceOf(operator.address)).to.eq(amount);
      expect(await vault.totalSupply()).to.eq(amount);
    });

    it("should succeed when deposit all to self", async () => {
      const amount = await token.balanceOf(signer.address);
      await token.approve(vault.address, amount);
      expect(await vault.balanceOf(operator.address)).to.eq(constants.Zero);
      expect(await vault.totalSupply()).to.eq(constants.Zero);
      await expect(vault.connect(signer).depositWithSdVeCRV(constants.MaxUint256, operator.address))
        .to.emit(vault, "Deposit")
        .withArgs(signer.address, operator.address, amount);
      expect(await vault.balanceOf(operator.address)).to.eq(amount);
      expect(await vault.totalSupply()).to.eq(amount);
    });

    it("should succeed when deposit multiple times", async () => {
      const amount = ethers.utils.parseEther("100");
      await token.approve(vault.address, constants.MaxUint256);
      expect(await vault.balanceOf(signer.address)).to.eq(constants.Zero);
      expect(await vault.totalSupply()).to.eq(constants.Zero);

      await expect(vault.connect(signer).depositWithSdVeCRV(amount, signer.address))
        .to.emit(vault, "Deposit")
        .withArgs(signer.address, signer.address, amount);

      expect(await vault.balanceOf(signer.address)).to.eq(amount);
      expect(await vault.totalSupply()).to.eq(amount);
      expect(await vault.balanceOf(operator.address)).to.eq(constants.Zero);

      await expect(vault.connect(signer).depositWithSdVeCRV(amount, operator.address))
        .to.emit(vault, "Deposit")
        .withArgs(signer.address, operator.address, amount);

      expect(await vault.balanceOf(operator.address)).to.eq(amount);
      expect(await vault.totalSupply()).to.eq(amount.mul(2));
    });
  });

  context("withdraw", async () => {
    const depositAmount = ethers.utils.parseEther("100");
    let signer: SignerWithAddress;
    let sdcrv: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_HOLDER);
      sdcrv = await ethers.getContractAt("MockERC20", SDCRV, signer);
      await sdcrv.approve(vault.address, constants.MaxUint256);
      await vault.connect(signer).deposit(depositAmount, signer.address);
      await vault.updateFeeInfo(deployer.address, 0, 0, 0, 1e6); // 10% withdraw fee
    });

    it("should revert when withdraw zero amount", async () => {
      await expect(vault.connect(signer).withdraw(0, deployer.address)).to.revertedWith("withdraw zero amount");
    });

    it("should revert when withdraw exceed balance", async () => {
      await expect(vault.connect(signer).withdraw(depositAmount.add(1), deployer.address)).to.revertedWith(
        "insufficient staked token"
      );
    });

    it("should succeed, when withdraw 10 to self", async () => {
      expect(await vault.withdrawFeeAccumulated()).to.eq(constants.Zero);
      expect(await vault.totalSupply()).to.eq(ethers.utils.parseEther("100"));
      expect(await vault.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("100"));
      await expect(vault.connect(signer).withdraw(ethers.utils.parseEther("10"), signer.address))
        .to.emit(vault, "Withdraw")
        .withArgs(signer.address, signer.address, ethers.utils.parseEther("9"), ethers.utils.parseEther("1"));
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      expect(await vault.withdrawFeeAccumulated()).to.eq(ethers.utils.parseEther("1"));
      expect((await vault.getUserLocks(signer.address))[0].amount).to.eq(ethers.utils.parseEther("9"));
      expect((await vault.getUserLocks(signer.address))[0].expireAt).to.eq(timestamp + 86400 * 30);
      expect(await vault.totalSupply()).to.eq(ethers.utils.parseEther("90"));
      expect(await vault.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("90"));

      await expect(vault.connect(deployer).takeWithdrawFee(deployer.address))
        .to.emit(vault, "TakeWithdrawFee")
        .withArgs(ethers.utils.parseEther("1"));
    });

    it("should succeed, when withdraw 10 to other", async () => {
      expect(await vault.withdrawFeeAccumulated()).to.eq(constants.Zero);
      expect(await vault.totalSupply()).to.eq(ethers.utils.parseEther("100"));
      expect(await vault.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("100"));
      await expect(vault.connect(signer).withdraw(ethers.utils.parseEther("10"), operator.address))
        .to.emit(vault, "Withdraw")
        .withArgs(signer.address, operator.address, ethers.utils.parseEther("9"), ethers.utils.parseEther("1"));
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      expect(await vault.withdrawFeeAccumulated()).to.eq(ethers.utils.parseEther("1"));
      expect((await vault.getUserLocks(operator.address))[0].amount).to.eq(ethers.utils.parseEther("9"));
      expect((await vault.getUserLocks(operator.address))[0].expireAt).to.eq(timestamp + 86400 * 30);
      expect(await vault.totalSupply()).to.eq(ethers.utils.parseEther("90"));
      expect(await vault.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("90"));

      await expect(vault.connect(deployer).takeWithdrawFee(deployer.address))
        .to.emit(vault, "TakeWithdrawFee")
        .withArgs(ethers.utils.parseEther("1"));
    });

    it("should succeed, when withdraw all to self", async () => {
      expect(await vault.withdrawFeeAccumulated()).to.eq(constants.Zero);
      expect(await vault.totalSupply()).to.eq(ethers.utils.parseEther("100"));
      expect(await vault.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("100"));
      await expect(vault.connect(signer).withdraw(constants.MaxUint256, signer.address))
        .to.emit(vault, "Withdraw")
        .withArgs(signer.address, signer.address, ethers.utils.parseEther("90"), ethers.utils.parseEther("10"));
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      expect(await vault.withdrawFeeAccumulated()).to.eq(ethers.utils.parseEther("10"));
      expect((await vault.getUserLocks(signer.address))[0].amount).to.eq(ethers.utils.parseEther("90"));
      expect((await vault.getUserLocks(signer.address))[0].expireAt).to.eq(timestamp + 86400 * 30);
      expect(await vault.totalSupply()).to.eq(ethers.utils.parseEther("0"));
      expect(await vault.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("0"));

      await expect(vault.connect(deployer).takeWithdrawFee(deployer.address))
        .to.emit(vault, "TakeWithdrawFee")
        .withArgs(ethers.utils.parseEther("10"));
    });

    it("should succeed, when withdraw 10 to self and ignore withdraw fee", async () => {
      await vault.connect(deployer).updateWhitelist([signer.address], true);
      expect(await vault.withdrawFeeAccumulated()).to.eq(constants.Zero);
      expect(await vault.totalSupply()).to.eq(ethers.utils.parseEther("100"));
      expect(await vault.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("100"));
      await expect(vault.connect(signer).withdraw(ethers.utils.parseEther("10"), signer.address))
        .to.emit(vault, "Withdraw")
        .withArgs(signer.address, signer.address, ethers.utils.parseEther("10"), ethers.utils.parseEther("0"));
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      expect(await vault.withdrawFeeAccumulated()).to.eq(ethers.utils.parseEther("0"));
      expect((await vault.getUserLocks(signer.address))[0].amount).to.eq(ethers.utils.parseEther("10"));
      expect((await vault.getUserLocks(signer.address))[0].expireAt).to.eq(timestamp + 86400 * 30);
      expect(await vault.totalSupply()).to.eq(ethers.utils.parseEther("90"));
      expect(await vault.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("90"));
    });
  });

  context("withdrawExpired", async () => {
    const depositAmount = ethers.utils.parseEther("100");
    let signer: SignerWithAddress;
    let sdcrv: MockERC20;
    let timestamps: number[];

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_HOLDER);
      sdcrv = await ethers.getContractAt("MockERC20", SDCRV, signer);
      await sdcrv.approve(vault.address, constants.MaxUint256);
      await vault.connect(signer).deposit(depositAmount, signer.address);
      timestamps = [];
      for (let i = 0; i < 10; i++) {
        await vault.connect(signer).withdraw(ethers.utils.parseEther("10"), signer.address);
        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        timestamps.push(timestamp);
        if (i < 9) {
          await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400]);
        }
      }
      const lists = await vault.getUserLocks(signer.address);
      expect(lists.length).to.eq(10);
      for (let i = 0; i < 10; i++) {
        expect(lists[i].amount).to.eq(ethers.utils.parseEther("10"));
        expect(lists[i].expireAt).to.eq(timestamps[i] + 86400 * 30);
      }
    });

    it("should revert, when withdraw from others to others", async () => {
      await expect(vault.connect(deployer).withdrawExpired(signer.address, deployer.address)).to.revertedWith(
        "withdraw from others to others"
      );
    });

    it("should succeed, when with expired to self", async () => {
      for (let i = 0; i < 10; i++) {
        await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamps[i] + 86400 * 30]);
        const balanceBefore = await sdcrv.balanceOf(signer.address);
        await expect(vault.connect(signer).withdrawExpired(signer.address, signer.address))
          .to.emit(vault, "WithdrawExpired")
          .withArgs(signer.address, signer.address, ethers.utils.parseEther("10"));
        const balanceAfter = await sdcrv.balanceOf(signer.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(ethers.utils.parseEther("10"));
        const lists = await vault.getUserLocks(signer.address);
        expect(lists.length).to.eq(9 - i);
      }
    });

    it("should succeed, when with expired to others", async () => {
      for (let i = 0; i < 10; i++) {
        await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamps[i] + 86400 * 30]);
        const balanceBefore = await sdcrv.balanceOf(operator.address);
        await expect(vault.connect(signer).withdrawExpired(signer.address, operator.address))
          .to.emit(vault, "WithdrawExpired")
          .withArgs(signer.address, operator.address, ethers.utils.parseEther("10"));
        const balanceAfter = await sdcrv.balanceOf(operator.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(ethers.utils.parseEther("10"));
        const lists = await vault.getUserLocks(signer.address);
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
      await sdcrv.approve(vault.address, constants.MaxUint256);
      await vault.connect(signer).deposit(depositAmount, signer.address);
      // 20% platform, 10% bounty, 20% boost
      await vault.updateFeeInfo(operator.address, 2e6, 1e6, 2e6, 0);
    });

    it("should succeed, when distribute intermediately", async () => {
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      const crv = await ethers.getContractAt("MockERC20", CRV, deployer);
      const sdt = await ethers.getContractAt("MockERC20", SDT, deployer);
      const tricrv = await ethers.getContractAt("MockERC20", THREE_CRV, deployer);
      const tx = await vault.harvest(deployer.address);
      const crv_reward = await crv.balanceOf(vault.address); // 70%
      const crv_bounty = await crv.balanceOf(deployer.address); // 10%
      const crv_platform = await crv.balanceOf(operator.address); // 20%
      expect(crv_reward).to.eq(crv_bounty.mul(7));
      expect(crv_platform).to.eq(crv_bounty.mul(2));
      const sdt_reward = await sdt.balanceOf(vault.address); // 50%
      const sdt_bounty = await sdt.balanceOf(deployer.address); // 10%
      const sdt_platform = await sdt.balanceOf(operator.address); // 20%
      const sdt_boost = await sdt.balanceOf(delegation.address); // 20%
      expect(sdt_reward).to.eq(sdt_bounty.mul(5));
      expect(sdt_platform).to.eq(sdt_bounty.mul(2));
      expect(sdt_boost).to.eq(sdt_bounty.mul(2));
      const tricrv_reward = await tricrv.balanceOf(vault.address); // 70%
      const tricrv_bounty = await tricrv.balanceOf(deployer.address); // 10%
      const tricrv_platform = await tricrv.balanceOf(operator.address); // 20%
      expect(tricrv_reward).to.eq(tricrv_bounty.mul(7));
      expect(tricrv_platform).to.eq(tricrv_bounty.mul(2));

      await expect(tx)
        .to.emit(vault, "Harvest")
        .withArgs(
          deployer.address,
          [sdt_reward, tricrv_reward, crv_reward],
          [sdt_bounty, tricrv_bounty, crv_bounty],
          [sdt_platform, tricrv_platform, crv_platform],
          sdt_boost
        );

      const precision = BigNumber.from(10).pow(18);
      expect((await vault.rewardInfo(crv.address)).accRewardPerShare).to.eq(
        crv_reward.mul(precision).div(depositAmount)
      );
      expect((await vault.rewardInfo(sdt.address)).accRewardPerShare).to.eq(
        sdt_reward.mul(precision).div(depositAmount)
      );
      expect((await vault.rewardInfo(tricrv.address)).accRewardPerShare).to.eq(
        tricrv_reward.mul(precision).div(depositAmount)
      );
    });

    it("should succeed, when crv and sdt distribute linear in 7 days", async () => {
      const crv = await ethers.getContractAt("MockERC20", CRV, deployer);
      const sdt = await ethers.getContractAt("MockERC20", SDT, deployer);
      const tricrv = await ethers.getContractAt("MockERC20", THREE_CRV, deployer);
      await vault.updateRewardPeriod(crv.address, 86400 * 7);
      await vault.updateRewardPeriod(sdt.address, 86400 * 7);

      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      const tx = await vault.harvest(deployer.address);
      const crv_reward = await crv.balanceOf(vault.address); // 70%
      const crv_bounty = await crv.balanceOf(deployer.address); // 10%
      const crv_platform = await crv.balanceOf(operator.address); // 20%
      expect(crv_reward).to.eq(crv_bounty.mul(7));
      expect(crv_platform).to.eq(crv_bounty.mul(2));
      const sdt_reward = await sdt.balanceOf(vault.address); // 50%
      const sdt_bounty = await sdt.balanceOf(deployer.address); // 10%
      const sdt_platform = await sdt.balanceOf(operator.address); // 20%
      const sdt_boost = await sdt.balanceOf(delegation.address); // 20%
      expect(sdt_reward).to.eq(sdt_bounty.mul(5));
      expect(sdt_platform).to.eq(sdt_bounty.mul(2));
      expect(sdt_boost).to.eq(sdt_bounty.mul(2));
      const tricrv_reward = await tricrv.balanceOf(vault.address); // 70%
      const tricrv_bounty = await tricrv.balanceOf(deployer.address); // 10%
      const tricrv_platform = await tricrv.balanceOf(operator.address); // 20%
      expect(tricrv_reward).to.eq(tricrv_bounty.mul(7));
      expect(tricrv_platform).to.eq(tricrv_bounty.mul(2));

      await expect(tx)
        .to.emit(vault, "Harvest")
        .withArgs(
          deployer.address,
          [sdt_reward, tricrv_reward, crv_reward],
          [sdt_bounty, tricrv_bounty, crv_bounty],
          [sdt_platform, tricrv_platform, crv_platform],
          sdt_boost
        );

      const precision = BigNumber.from(10).pow(18);
      expect((await vault.rewardInfo(tricrv.address)).accRewardPerShare).to.eq(
        tricrv_reward.mul(precision).div(depositAmount)
      );
      expect((await vault.rewardInfo(crv.address)).accRewardPerShare).to.eq(constants.Zero);
      expect((await vault.rewardInfo(crv.address)).rate).to.eq(crv_reward.div(86400 * 7));
      expect((await vault.rewardInfo(crv.address)).finishAt).to.eq(timestamp + 86400 * 7 * 2);
      expect((await vault.rewardInfo(crv.address)).lastUpdate).to.eq(timestamp + 86400 * 7);
      expect((await vault.rewardInfo(sdt.address)).accRewardPerShare).to.eq(constants.Zero);
      expect((await vault.rewardInfo(sdt.address)).rate).to.eq(sdt_reward.div(86400 * 7));
      expect((await vault.rewardInfo(sdt.address)).finishAt).to.eq(timestamp + 86400 * 7 * 2);
      expect((await vault.rewardInfo(sdt.address)).lastUpdate).to.eq(timestamp + 86400 * 7);

      // 3 days passed
      await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 10]);
      await vault.checkpoint(deployer.address);
      expect((await vault.rewardInfo(tricrv.address)).accRewardPerShare).to.eq(
        tricrv_reward.mul(precision).div(depositAmount)
      );
      expect((await vault.rewardInfo(crv.address)).accRewardPerShare).to.eq(
        crv_reward
          .div(86400 * 7)
          .mul(86400 * 3)
          .mul(precision)
          .div(depositAmount)
      );
      expect((await vault.rewardInfo(crv.address)).rate).to.eq(crv_reward.div(86400 * 7));
      expect((await vault.rewardInfo(crv.address)).finishAt).to.eq(timestamp + 86400 * 7 * 2);
      expect((await vault.rewardInfo(crv.address)).lastUpdate).to.eq(timestamp + 86400 * 10);
      expect((await vault.rewardInfo(sdt.address)).accRewardPerShare).to.eq(
        sdt_reward
          .div(86400 * 7)
          .mul(86400 * 3)
          .mul(precision)
          .div(depositAmount)
      );
      expect((await vault.rewardInfo(sdt.address)).rate).to.eq(sdt_reward.div(86400 * 7));
      expect((await vault.rewardInfo(sdt.address)).finishAt).to.eq(timestamp + 86400 * 7 * 2);
      expect((await vault.rewardInfo(sdt.address)).lastUpdate).to.eq(timestamp + 86400 * 10);
    });
  });

  context("claim", async () => {
    let signer: SignerWithAddress;
    let sdcrv: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_HOLDER);
      sdcrv = await ethers.getContractAt("MockERC20", SDCRV, signer);

      await sdcrv.connect(signer).approve(vault.address, constants.MaxUint256);
      await vault.connect(signer).deposit(ethers.utils.parseEther("160000"), signer.address); // 20%

      await sdcrv.connect(signer).transfer(deployer.address, ethers.utils.parseEther("400000")); // 50%
      await sdcrv.connect(deployer).approve(vault.address, constants.MaxUint256);
      await vault.connect(deployer).deposit(ethers.utils.parseEther("400000"), deployer.address); // 50%

      await sdcrv.connect(signer).transfer(operator.address, ethers.utils.parseEther("240000")); // 30%
      await sdcrv.connect(operator).approve(vault.address, constants.MaxUint256);
      await vault.connect(operator).deposit(ethers.utils.parseEther("240000"), operator.address); // 30%

      // 20% platform, 10% bounty, 20% boost
      await vault.updateFeeInfo(operator.address, 2e6, 1e6, 2e6, 0);
    });

    it("should revert, when claim from others to others", async () => {
      await expect(vault.connect(deployer).claim(signer.address, deployer.address)).to.revertedWith(
        "claim from others to others"
      );
    });

    it("should succeed, when distribute intermediately", async () => {
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      const crv = await ethers.getContractAt("MockERC20", CRV, deployer);
      const sdt = await ethers.getContractAt("MockERC20", SDT, deployer);
      const tricrv = await ethers.getContractAt("MockERC20", THREE_CRV, deployer);
      await vault.harvest(deployer.address);
      const crv_reward = await crv.balanceOf(vault.address);
      const sdt_reward = await sdt.balanceOf(vault.address);
      const tricrv_reward = await tricrv.balanceOf(vault.address);

      let beforeCRV = await crv.balanceOf(signer.address);
      let beforeSDT = await sdt.balanceOf(signer.address);
      let before3CRV = await tricrv.balanceOf(signer.address);
      await vault.connect(signer).claim(signer.address, signer.address); // to self
      let afterCRV = await crv.balanceOf(signer.address);
      let afterSDT = await sdt.balanceOf(signer.address);
      let after3CRV = await tricrv.balanceOf(signer.address);
      expect(afterCRV.sub(beforeCRV)).to.closeToBn(crv_reward.mul(2).div(10), 1e6);
      expect(afterSDT.sub(beforeSDT)).to.closeToBn(sdt_reward.mul(2).div(10), 1e6);
      expect(after3CRV.sub(before3CRV)).to.closeToBn(tricrv_reward.mul(2).div(10), 1e6);

      beforeCRV = await crv.balanceOf(signer.address);
      beforeSDT = await sdt.balanceOf(signer.address);
      before3CRV = await tricrv.balanceOf(signer.address);
      await vault.connect(deployer).claim(deployer.address, signer.address); // to other
      afterCRV = await crv.balanceOf(signer.address);
      afterSDT = await sdt.balanceOf(signer.address);
      after3CRV = await tricrv.balanceOf(signer.address);
      expect(afterCRV.sub(beforeCRV)).to.closeToBn(crv_reward.mul(5).div(10), 1e6);
      expect(afterSDT.sub(beforeSDT)).to.closeToBn(sdt_reward.mul(5).div(10), 1e6);
      expect(after3CRV.sub(before3CRV)).to.closeToBn(tricrv_reward.mul(5).div(10), 1e6);

      beforeCRV = await crv.balanceOf(operator.address);
      beforeSDT = await sdt.balanceOf(operator.address);
      before3CRV = await tricrv.balanceOf(operator.address);
      await vault.connect(operator).claim(operator.address, operator.address); // to self
      afterCRV = await crv.balanceOf(operator.address);
      afterSDT = await sdt.balanceOf(operator.address);
      after3CRV = await tricrv.balanceOf(operator.address);
      expect(afterCRV.sub(beforeCRV)).to.closeToBn(crv_reward.mul(3).div(10), 1e6);
      expect(afterSDT.sub(beforeSDT)).to.closeToBn(sdt_reward.mul(3).div(10), 1e6);
      expect(after3CRV.sub(before3CRV)).to.closeToBn(tricrv_reward.mul(3).div(10), 1e6);
    });

    it("should succeed, when distribute linear in 7 days", async () => {
      const crv = await ethers.getContractAt("MockERC20", CRV, deployer);
      const sdt = await ethers.getContractAt("MockERC20", SDT, deployer);
      const tricrv = await ethers.getContractAt("MockERC20", THREE_CRV, deployer);
      await vault.updateRewardPeriod(crv.address, 86400 * 7);
      await vault.updateRewardPeriod(sdt.address, 86400 * 7);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      await vault.harvest(deployer.address);
      const crv_reward = await crv.balanceOf(vault.address);
      const sdt_reward = await sdt.balanceOf(vault.address);
      const tricrv_reward = await tricrv.balanceOf(vault.address);

      let beforeCRV = await crv.balanceOf(signer.address);
      let beforeSDT = await sdt.balanceOf(signer.address);
      let before3CRV = await tricrv.balanceOf(signer.address);
      await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * (7 + 3.5)]);
      await vault.connect(signer).claim(signer.address, signer.address); // to self
      let afterCRV = await crv.balanceOf(signer.address);
      let afterSDT = await sdt.balanceOf(signer.address);
      let after3CRV = await tricrv.balanceOf(signer.address);
      expect(afterCRV.sub(beforeCRV)).to.closeToBn(crv_reward.mul(2).div(10).div(2), 1e6);
      expect(afterSDT.sub(beforeSDT)).to.closeToBn(sdt_reward.mul(2).div(10).div(2), 1e6);
      expect(after3CRV.sub(before3CRV)).to.closeToBn(tricrv_reward.mul(2).div(10), 1e6);

      beforeCRV = await crv.balanceOf(signer.address);
      beforeSDT = await sdt.balanceOf(signer.address);
      before3CRV = await tricrv.balanceOf(signer.address);
      await vault.connect(deployer).claim(deployer.address, signer.address); // to other
      afterCRV = await crv.balanceOf(signer.address);
      afterSDT = await sdt.balanceOf(signer.address);
      after3CRV = await tricrv.balanceOf(signer.address);
      expect(afterCRV.sub(beforeCRV)).to.closeToBn(crv_reward.mul(5).div(10).div(2), afterCRV.sub(beforeCRV).div(1e4));
      expect(afterSDT.sub(beforeSDT)).to.closeToBn(sdt_reward.mul(5).div(10).div(2), afterSDT.sub(beforeSDT).div(1e4));
      expect(after3CRV.sub(before3CRV)).to.closeToBn(tricrv_reward.mul(5).div(10), 1e6);

      beforeCRV = await crv.balanceOf(operator.address);
      beforeSDT = await sdt.balanceOf(operator.address);
      before3CRV = await tricrv.balanceOf(operator.address);
      await vault.connect(operator).claim(operator.address, operator.address); // to self
      afterCRV = await crv.balanceOf(operator.address);
      afterSDT = await sdt.balanceOf(operator.address);
      after3CRV = await tricrv.balanceOf(operator.address);
      expect(afterCRV.sub(beforeCRV)).to.closeToBn(crv_reward.mul(3).div(10).div(2), afterCRV.sub(beforeCRV).div(1e4));
      expect(afterSDT.sub(beforeSDT)).to.closeToBn(sdt_reward.mul(3).div(10).div(2), afterSDT.sub(beforeSDT).div(1e4));
      expect(after3CRV.sub(before3CRV)).to.closeToBn(tricrv_reward.mul(3).div(10), 1e6);
    });
  });
});

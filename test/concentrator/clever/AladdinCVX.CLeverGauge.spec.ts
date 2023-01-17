/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import { CLeverGaugeStrategy, MockERC20 } from "../../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../../utils";
import { DEPLOYED_CONTRACTS, TOKENS } from "../../../scripts/utils";
import { AladdinCVX } from "../../../typechain/contracts/concentrator/clever/cvx";

const FORK_BLOCK_NUMBER = 16111750;
const clevCVX = TOKENS.clevCVX.address;
const CVX = TOKENS.CVX.address;
const CVX_HOLDER = "0x28c6c06298d514db089934071355e5743bf21d60";

const CURVE_clevCVX_TOKEN = "0xf9078fb962a7d13f55d40d49c8aa6472abd1a5a6";
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";

describe("AladdinCVX.CLeverGauge.spec", async () => {
  let deployer: SignerWithAddress;
  let signer: SignerWithAddress;
  let acvx: AladdinCVX;
  let strategy: CLeverGaugeStrategy;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CVX_HOLDER]);
    deployer = await ethers.getSigner(DEPLOYER);
    signer = await ethers.getSigner(CVX_HOLDER);
    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    const CLeverGaugeStrategy = await ethers.getContractFactory("CLeverGaugeStrategy", deployer);
    strategy = await CLeverGaugeStrategy.deploy();

    const AladdinCVX = await ethers.getContractFactory("AladdinCVX", deployer);
    acvx = await AladdinCVX.deploy(
      CVX,
      clevCVX,
      DEPLOYED_CONTRACTS.CLever.Gauge.Curve_clevCVX_CVX.pool,
      DEPLOYED_CONTRACTS.CLever.Gauge.Curve_clevCVX_CVX.token,
      DEPLOYED_CONTRACTS.CLever.CLeverCVX.FurnaceForCVX
    );
    await acvx.deployed();
    // lp/debt = 2:1
    await acvx.initialize(DEPLOYED_CONTRACTS.AladdinZap, strategy.address, "2000000000000000000", []);
    await strategy.initialize(
      acvx.address,
      DEPLOYED_CONTRACTS.CLever.Gauge.Curve_clevCVX_CVX.token,
      DEPLOYED_CONTRACTS.CLever.Gauge.Curve_clevCVX_CVX.gauge,
      [DEPLOYED_CONTRACTS.CLever.CLEV]
    );
  });

  it("should initialize correctly", async () => {
    expect(await acvx.initialRatio()).to.eq(BigNumber.from("2000000000000000000"));
    expect(await acvx.ratio()).to.eq(BigNumber.from("2000000000000000000"));
    expect(await acvx.totalSupply()).to.eq(constants.Zero);
    expect(await acvx.lockPeriod()).to.eq(BigNumber.from(86400));
    expect(await acvx.minimumDeposit()).to.eq(BigNumber.from("1000000000000000000"));
  });

  context("auth", async () => {
    it("should revert, when reinitialize", async () => {
      await expect(acvx.initialize(constants.AddressZero, constants.AddressZero, constants.Zero, [])).to.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    context("updateBountyPercentage", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(acvx.connect(signer).updateBountyPercentage(0)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when fee too large", async () => {
        await expect(acvx.updateBountyPercentage(1e8 + 1)).to.revertedWith("CLeverAMO: fee too large");
      });

      it("should succeed", async () => {
        expect(await acvx.bountyPercentage()).to.deep.eq(constants.Zero);
        await expect(acvx.updateBountyPercentage(1e8)).to.emit(acvx, "UpdateBountyPercentage").withArgs(1e8);
        expect(await acvx.bountyPercentage()).to.eq(1e8);
      });
    });

    context("updateAMOConfig", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(acvx.connect(signer).updateAMOConfig(0, 1, 0, 1)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when invalid ratio", async () => {
        await expect(acvx.updateAMOConfig(2, 1, 0, 1)).to.revertedWith("CLeverAMO: invalid amo ratio");
        await expect(acvx.updateAMOConfig(0, 1, 2, 1)).to.revertedWith("CLeverAMO: invalid lp ratio");
      });

      it("should succeed", async () => {
        expect((await acvx.config()).minAMO).to.eq(BigNumber.from("1000000000000000000"));
        expect((await acvx.config()).maxAMO).to.eq(BigNumber.from("3000000000000000000"));
        expect((await acvx.config()).minLPRatio).to.eq(BigNumber.from("500000000000000000"));
        expect((await acvx.config()).maxLPRatio).to.eq(BigNumber.from("1000000000000000000"));
        await expect(acvx.updateAMOConfig(0, 1, 2, 3)).to.emit(acvx, "UpdateAMOConfig").withArgs(0, 1, 2, 3);
        expect((await acvx.config()).minAMO).to.eq(BigNumber.from("0"));
        expect((await acvx.config()).maxAMO).to.eq(BigNumber.from("1"));
        expect((await acvx.config()).minLPRatio).to.eq(BigNumber.from("2"));
        expect((await acvx.config()).maxLPRatio).to.eq(BigNumber.from("3"));
      });
    });

    context("updateMinimumDeposit", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(acvx.connect(signer).updateMinimumDeposit(0)).to.revertedWith("Ownable: caller is not the owner");
      });

      it("should revert, when amount too small", async () => {
        await expect(acvx.updateMinimumDeposit(BigNumber.from("1000000000000000000").sub(1))).to.revertedWith(
          "CLeverAMO: invalid minimum deposit amount"
        );
      });

      it("should succeed", async () => {
        const amount = BigNumber.from("1000000000000000000").add(1);
        expect(await acvx.minimumDeposit()).to.eq(BigNumber.from("1000000000000000000"));
        await expect(acvx.updateMinimumDeposit(amount)).to.emit(acvx, "UpdateMinimumDeposit").withArgs(amount);
        expect(await acvx.minimumDeposit()).to.eq(amount);
      });
    });

    context("updateLockPeriod", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(acvx.connect(signer).updateLockPeriod(0)).to.revertedWith("Ownable: caller is not the owner");
      });

      it("should revert, when period invalid", async () => {
        await expect(acvx.updateLockPeriod(86400 * 2 + 1)).to.revertedWith("CLeverAMO: invalid lock period");
        await expect(acvx.updateLockPeriod(0)).to.revertedWith("CLeverAMO: invalid lock period");
      });

      it("should succeed", async () => {
        const period = 86400 * 2;
        expect(await acvx.lockPeriod()).to.eq(86400);
        await expect(acvx.updateLockPeriod(period)).to.emit(acvx, "UpdateLockPeriod").withArgs(period);
        expect(await acvx.lockPeriod()).to.eq(period);
      });
    });

    context("updateZap", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(acvx.connect(signer).updateZap(constants.AddressZero)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when zap is zero", async () => {
        await expect(acvx.updateZap(constants.AddressZero)).to.revertedWith("abcCVX: zero zap address");
      });

      it("should succeed", async () => {
        expect(await acvx.zap()).to.eq(DEPLOYED_CONTRACTS.AladdinZap);
        await expect(acvx.updateZap(deployer.address)).to.emit(acvx, "UpdateZap").withArgs(deployer.address);
        expect(await acvx.zap()).to.eq(deployer.address);
      });
    });

    context("migrateStrategy", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(acvx.connect(signer).migrateStrategy(constants.AddressZero)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when new strategy is zero", async () => {
        await expect(acvx.migrateStrategy(constants.AddressZero)).to.revertedWith("abcCVX: zero strategy address");
      });

      it("should succeed", async () => {
        const CLeverGaugeStrategy = await ethers.getContractFactory("CLeverGaugeStrategy", deployer);
        const newStrategy = await CLeverGaugeStrategy.deploy();
        await newStrategy.initialize(
          acvx.address,
          CURVE_clevCVX_TOKEN,
          DEPLOYED_CONTRACTS.CLever.Gauge.Curve_clevCVX_CVX.gauge,
          [DEPLOYED_CONTRACTS.CLever.CLEV]
        );
        expect(await acvx.strategy()).to.eq(strategy.address);
        await expect(acvx.migrateStrategy(newStrategy.address))
          .to.emit(acvx, "MigrateStrategy")
          .withArgs(strategy.address, newStrategy.address);
        expect(await acvx.strategy()).to.eq(newStrategy.address);
      });
    });
  });

  context("deposit", async () => {
    const amount = ethers.utils.parseEther("10");

    it("should revert, when deposit amount too small", async () => {
      await expect(
        acvx.connect(signer).deposit(BigNumber.from("1000000000000000000").sub(1), signer.address)
      ).to.revertedWith("CLeverAMO: deposit amount too small");
    });

    it("should succeed when deposit to self", async () => {
      const cvx = await ethers.getContractAt("MockERC20", CVX, signer);
      await cvx.approve(acvx.address, amount);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      const fixed = Math.floor(timestamp / 86400) * 86400 + 86400;
      await hre.network.provider.send("evm_setNextBlockTimestamp", [fixed]);
      await expect(acvx.connect(signer).deposit(amount, signer.address))
        .to.emit(acvx, "Deposit")
        .withArgs(signer.address, signer.address, amount, fixed + 86400);
      expect((await acvx.getUserLocks(signer.address))[0].balance).to.eq(amount);
      expect((await acvx.getUserLocks(signer.address))[0].unlockAt).to.eq(fixed + 86400);
    });

    it("should succeed when deposit all to self", async () => {
      const cvx = await ethers.getContractAt("MockERC20", CVX, signer);
      await cvx.approve(acvx.address, constants.MaxUint256);
      const balance = await cvx.balanceOf(signer.address);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      const fixed = Math.floor(timestamp / 86400) * 86400 + 86400;
      await hre.network.provider.send("evm_setNextBlockTimestamp", [fixed]);
      await expect(acvx.connect(signer).deposit(constants.MaxUint256, signer.address))
        .to.emit(acvx, "Deposit")
        .withArgs(signer.address, signer.address, balance, fixed + 86400);
      expect((await acvx.getUserLocks(signer.address))[0].balance).to.eq(balance);
      expect((await acvx.getUserLocks(signer.address))[0].unlockAt).to.eq(fixed + 86400);
    });

    it("should succeed when deposit to other", async () => {
      const cvx = await ethers.getContractAt("MockERC20", CVX, signer);
      await cvx.approve(acvx.address, amount);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      const fixed = Math.floor(timestamp / 86400) * 86400 + 86400;
      await hre.network.provider.send("evm_setNextBlockTimestamp", [fixed]);
      await expect(acvx.connect(signer).deposit(amount, deployer.address))
        .to.emit(acvx, "Deposit")
        .withArgs(signer.address, deployer.address, amount, fixed + 86400);
      expect((await acvx.getUserLocks(deployer.address))[0].balance).to.eq(amount);
      expect((await acvx.getUserLocks(deployer.address))[0].unlockAt).to.eq(fixed + 86400);
    });

    it("should succeed when deposit multiple times to self", async () => {
      const cvx = await ethers.getContractAt("MockERC20", CVX, signer);
      await cvx.approve(acvx.address, constants.MaxUint256);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      const fixed = Math.floor(timestamp / 86400) * 86400 + 86400;
      await hre.network.provider.send("evm_setNextBlockTimestamp", [fixed - 10]);
      await expect(acvx.connect(signer).deposit(amount, signer.address))
        .to.emit(acvx, "Deposit")
        .withArgs(signer.address, signer.address, amount, fixed + 86400);
      expect((await acvx.getUserLocks(signer.address))[0].balance).to.eq(amount);
      expect((await acvx.getUserLocks(signer.address))[0].unlockAt).to.eq(fixed + 86400);
      await hre.network.provider.send("evm_setNextBlockTimestamp", [fixed - 5]);
      await expect(acvx.connect(signer).deposit(amount, signer.address))
        .to.emit(acvx, "Deposit")
        .withArgs(signer.address, signer.address, amount, fixed + 86400);
      expect((await acvx.getUserLocks(signer.address))[0].balance).to.eq(amount.mul(2));
      expect((await acvx.getUserLocks(signer.address))[0].unlockAt).to.eq(fixed + 86400);
    });
  });

  context("unlock", async () => {
    const depositAmount = ethers.utils.parseEther("10");

    let cvx: MockERC20;

    beforeEach(async () => {
      cvx = await ethers.getContractAt("MockERC20", CVX, signer);
      await cvx.approve(acvx.address, constants.MaxUint256);
      await acvx.connect(signer).deposit(depositAmount, signer.address);
      await acvx.connect(signer).deposit(depositAmount, deployer.address);
    });

    it("should revert, when no unlocks", async () => {
      expect((await acvx.getUserLocks(signer.address)).length).to.eq(1);
      const unlockAt = (await acvx.getUserLocks(signer.address))[0].unlockAt.toNumber();
      await hre.network.provider.send("evm_setNextBlockTimestamp", [unlockAt - 1]);
      await expect(acvx.connect(signer).unlock(0)).to.revertedWith("CLeverAMO: no unlocks");
    });

    it("should revert, when insufficient shares", async () => {
      expect((await acvx.getUserLocks(signer.address)).length).to.eq(1);
      const unlockAt = (await acvx.getUserLocks(signer.address))[0].unlockAt.toNumber();
      await hre.network.provider.send("evm_setNextBlockTimestamp", [unlockAt]);
      await hre.network.provider.send("evm_mine", []);

      const sharesOut = await acvx.connect(signer).callStatic.unlock(0);
      await expect(acvx.connect(signer).unlock(sharesOut.add(1))).to.revertedWith("CLeverAMO: insufficient shares");
    });

    it("should succeed, when unlock first time", async () => {
      expect((await acvx.getUserLocks(signer.address)).length).to.eq(1);
      const unlockAt = (await acvx.getUserLocks(signer.address))[0].unlockAt.toNumber();
      await hre.network.provider.send("evm_setNextBlockTimestamp", [unlockAt]);
      await hre.network.provider.send("evm_mine", []);

      const sharesOut = await acvx.connect(signer).callStatic.unlock(0);
      const balanceBefore = await cvx.balanceOf(CURVE_clevCVX_TOKEN);
      expect((await acvx.getUserLocks(signer.address)).length).to.eq(1);
      const tx = await acvx.connect(signer).unlock(sharesOut);
      await tx.wait();
      const balanceAfter = await cvx.balanceOf(CURVE_clevCVX_TOKEN);
      const ratio = await acvx.ratio();
      await expect(tx).to.emit(acvx, "Unlock").withArgs(signer.address, depositAmount, sharesOut, ratio);
      expect(balanceAfter.sub(balanceBefore)).to.eq(depositAmount);
      expect((await acvx.getUserLocks(signer.address)).length).to.eq(0);
      expect(await acvx.totalSupply()).to.eq(sharesOut);
      expect(await acvx.balanceOf(signer.address)).to.eq(sharesOut);
      expect(await acvx.ratio()).closeToBn(
        BigNumber.from("2000000000000000000"),
        BigNumber.from("2000000000000000000").div(1e6)
      );
    });

    it("should succeed, when unlock multiple times", async () => {
      expect((await acvx.getUserLocks(signer.address)).length).to.eq(1);
      const unlockAt = (await acvx.getUserLocks(signer.address))[0].unlockAt.toNumber();
      await hre.network.provider.send("evm_setNextBlockTimestamp", [unlockAt]);
      await hre.network.provider.send("evm_mine", []);

      const sharesOut1 = await acvx.connect(signer).callStatic.unlock(0);
      const balanceBefore1 = await cvx.balanceOf(CURVE_clevCVX_TOKEN);
      expect((await acvx.getUserLocks(signer.address)).length).to.eq(1);
      const tx1 = await acvx.connect(signer).unlock(sharesOut1);
      await tx1.wait();
      const balanceAfter1 = await cvx.balanceOf(CURVE_clevCVX_TOKEN);
      const ratio1 = await acvx.ratio();
      await expect(tx1).to.emit(acvx, "Unlock").withArgs(signer.address, depositAmount, sharesOut1, ratio1);
      expect(balanceAfter1.sub(balanceBefore1)).to.eq(depositAmount);
      expect((await acvx.getUserLocks(signer.address)).length).to.eq(0);
      expect(await acvx.totalSupply()).to.eq(sharesOut1);
      expect(await acvx.balanceOf(signer.address)).to.eq(sharesOut1);
      expect(await acvx.ratio()).closeToBn(
        BigNumber.from("2000000000000000000"),
        BigNumber.from("2000000000000000000").div(1e6)
      );

      const sharesOut2 = await acvx.connect(deployer).callStatic.unlock(0);
      const balanceBefore2 = await cvx.balanceOf(CURVE_clevCVX_TOKEN);
      expect((await acvx.getUserLocks(deployer.address)).length).to.eq(1);
      const tx2 = await acvx.connect(deployer).unlock(sharesOut2.mul(9).div(10));
      await tx2.wait();
      const balanceAfter2 = await cvx.balanceOf(CURVE_clevCVX_TOKEN);
      const ratio2 = await acvx.ratio();
      await expect(tx2)
        .to.emit(acvx, "Unlock")
        .withArgs(deployer.address, depositAmount, await acvx.balanceOf(deployer.address), ratio2);
      expect(balanceAfter2.sub(balanceBefore2)).to.gt(depositAmount); // with furnace rewards
      expect((await acvx.getUserLocks(deployer.address)).length).to.eq(0);
      expect(await acvx.totalSupply()).to.closeToBn(sharesOut2.add(sharesOut1), sharesOut2.div(1e6));
      expect(await acvx.balanceOf(deployer.address)).to.closeToBn(sharesOut2, sharesOut2.div(1e6));
      expect(await acvx.ratio()).closeToBn(
        BigNumber.from("2000000000000000000"),
        BigNumber.from("2000000000000000000").div(1e6)
      );
    });
  });

  context("withdraw/withdrawToBase", async () => {
    const depositAmount = ethers.utils.parseEther("10");
    const withdrawAmount = ethers.utils.parseEther("1");

    let signerShares: BigNumber;
    let deployerShares: BigNumber;
    let baseToken: MockERC20;
    let debtToken: MockERC20;
    let lpToken: MockERC20;

    beforeEach(async () => {
      baseToken = await ethers.getContractAt("MockERC20", CVX, deployer);
      debtToken = await ethers.getContractAt("MockERC20", clevCVX, deployer);
      lpToken = await ethers.getContractAt("MockERC20", CURVE_clevCVX_TOKEN, deployer);
      await baseToken.connect(signer).approve(acvx.address, constants.MaxUint256);
      await acvx.connect(signer).deposit(depositAmount, signer.address);
      await acvx.connect(signer).deposit(depositAmount, deployer.address);

      expect((await acvx.getUserLocks(signer.address)).length).to.eq(1);
      const unlockAt = (await acvx.getUserLocks(signer.address))[0].unlockAt.toNumber();
      await hre.network.provider.send("evm_setNextBlockTimestamp", [unlockAt]);
      await hre.network.provider.send("evm_mine", []);

      await acvx.connect(signer).unlock(0);
      await acvx.connect(deployer).unlock(0);

      signerShares = await acvx.balanceOf(signer.address);
      deployerShares = await acvx.balanceOf(deployer.address);
    });

    it("should revert, when withdraw zero amount", async () => {
      await expect(acvx.connect(signer).withdraw(0, signer.address, 0, 0)).to.revertedWith("CLeverAMO: amount is zero");
      await expect(acvx.connect(signer).withdrawToBase(0, signer.address, 0)).to.revertedWith(
        "CLeverAMO: amount is zero"
      );
    });

    it("should revert, when withdraw more than balance", async () => {
      await expect(acvx.connect(signer).withdraw(signerShares.add(1), signer.address, 0, 0)).to.revertedWith(
        "ERC20: burn amount exceeds balance"
      );
      await expect(acvx.connect(signer).withdrawToBase(signerShares.add(1), signer.address, 0)).to.revertedWith(
        "ERC20: burn amount exceeds balance"
      );
    });

    it("should revert, when output is not enough", async () => {
      const [lpOut, debtOut] = await acvx.connect(signer).callStatic.withdraw(withdrawAmount, signer.address, 0, 0);
      await expect(
        acvx.connect(signer).withdraw(withdrawAmount, signer.address, lpOut.mul(11).div(10), debtOut)
      ).to.revertedWith("CLeverAMO: insufficient lp token output");
      await expect(
        acvx.connect(signer).withdraw(withdrawAmount, signer.address, lpOut, debtOut.mul(11).div(10))
      ).to.revertedWith("CLeverAMO: insufficient debt token output");
      const baseOut = await acvx.connect(signer).callStatic.withdrawToBase(withdrawAmount, signer.address, 0);
      await expect(
        acvx.connect(signer).withdrawToBase(withdrawAmount, signer.address, baseOut.mul(11).div(10))
      ).to.revertedWith("CLeverAMO: insufficient base token output");
    });

    it("should succeed when withdraw lp/debt to self", async () => {
      const [lpOut, debtOut] = await acvx.connect(signer).callStatic.withdraw(withdrawAmount, signer.address, 0, 0);
      const lpBefore = await lpToken.balanceOf(signer.address);
      const debtBefore = await debtToken.balanceOf(signer.address);
      const tx = await acvx
        .connect(signer)
        .withdraw(withdrawAmount, signer.address, lpOut.mul(9).div(10), debtOut.mul(0).div(10));
      await tx.wait();
      const lpAfter = await lpToken.balanceOf(signer.address);
      const debtAfter = await debtToken.balanceOf(signer.address);
      await expect(tx)
        .to.emit(acvx, "Withdraw")
        .withArgs(
          signer.address,
          signer.address,
          withdrawAmount,
          debtAfter.sub(debtBefore),
          lpAfter.sub(lpBefore),
          await acvx.ratio()
        );
      expect(lpAfter.sub(lpBefore)).to.closeToBn(lpOut, lpOut.div(1e6));
      expect(debtAfter.sub(debtBefore)).to.closeToBn(debtOut, debtOut.div(1e6));
      expect(await acvx.balanceOf(signer.address)).to.eq(signerShares.sub(withdrawAmount));
      expect(await acvx.totalSupply()).to.eq(signerShares.add(deployerShares).sub(withdrawAmount));
    });

    it("should succeed when withdraw lp/debt to other", async () => {
      const [lpOut, debtOut] = await acvx.connect(signer).callStatic.withdraw(withdrawAmount, deployer.address, 0, 0);
      const lpBefore = await lpToken.balanceOf(deployer.address);
      const debtBefore = await debtToken.balanceOf(deployer.address);
      const tx = await acvx
        .connect(signer)
        .withdraw(withdrawAmount, deployer.address, lpOut.mul(9).div(10), debtOut.mul(0).div(10));
      await tx.wait();
      const lpAfter = await lpToken.balanceOf(deployer.address);
      const debtAfter = await debtToken.balanceOf(deployer.address);
      await expect(tx)
        .to.emit(acvx, "Withdraw")
        .withArgs(
          signer.address,
          deployer.address,
          withdrawAmount,
          debtAfter.sub(debtBefore),
          lpAfter.sub(lpBefore),
          await acvx.ratio()
        );
      expect(lpAfter.sub(lpBefore)).to.closeToBn(lpOut, lpOut.div(1e6));
      expect(debtAfter.sub(debtBefore)).to.closeToBn(debtOut, debtOut.div(1e6));
      expect(await acvx.balanceOf(signer.address)).to.eq(signerShares.sub(withdrawAmount));
      expect(await acvx.totalSupply()).to.eq(signerShares.add(deployerShares).sub(withdrawAmount));
    });

    it("should succeed when withdraw all lp/debt to self", async () => {
      const [lpOut, debtOut] = await acvx
        .connect(signer)
        .callStatic.withdraw(constants.MaxUint256, signer.address, 0, 0);
      const lpBefore = await lpToken.balanceOf(signer.address);
      const debtBefore = await debtToken.balanceOf(signer.address);
      const tx = await acvx
        .connect(signer)
        .withdraw(constants.MaxUint256, signer.address, lpOut.mul(9).div(10), debtOut.mul(0).div(10));
      await tx.wait();
      const lpAfter = await lpToken.balanceOf(signer.address);
      const debtAfter = await debtToken.balanceOf(signer.address);
      await expect(tx)
        .to.emit(acvx, "Withdraw")
        .withArgs(
          signer.address,
          signer.address,
          signerShares,
          debtAfter.sub(debtBefore),
          lpAfter.sub(lpBefore),
          await acvx.ratio()
        );
      expect(lpAfter.sub(lpBefore)).to.closeToBn(lpOut, lpOut.div(1e6));
      expect(debtAfter.sub(debtBefore)).to.closeToBn(debtOut, debtOut.div(1e6));
      expect(await acvx.balanceOf(signer.address)).to.eq(constants.Zero);
      expect(await acvx.totalSupply()).to.eq(deployerShares);
    });

    it("should succeed when withdraw base to self", async () => {
      const baseOut = await acvx.connect(signer).callStatic.withdrawToBase(withdrawAmount, signer.address, 0);
      const baseBefore = await baseToken.balanceOf(signer.address);
      const tx = await acvx.connect(signer).withdrawToBase(withdrawAmount, signer.address, baseOut.mul(9).div(10));
      await tx.wait();
      const baseAfter = await baseToken.balanceOf(signer.address);
      await expect(tx).to.emit(acvx, "Withdraw");
      expect(baseAfter.sub(baseBefore)).to.closeToBn(baseOut, baseOut.div(1e6));
      expect(await acvx.balanceOf(signer.address)).to.eq(signerShares.sub(withdrawAmount));
      expect(await acvx.totalSupply()).to.eq(signerShares.add(deployerShares).sub(withdrawAmount));
    });

    it("should succeed when withdraw base to other", async () => {
      const baseOut = await acvx.connect(signer).callStatic.withdrawToBase(withdrawAmount, signer.address, 0);
      const baseBefore = await baseToken.balanceOf(deployer.address);
      const tx = await acvx.connect(signer).withdrawToBase(withdrawAmount, deployer.address, baseOut.mul(9).div(10));
      await tx.wait();
      const baseAfter = await baseToken.balanceOf(deployer.address);
      await expect(tx).to.emit(acvx, "Withdraw");
      expect(baseAfter.sub(baseBefore)).to.closeToBn(baseOut, baseOut.div(1e6));
      expect(await acvx.balanceOf(signer.address)).to.eq(signerShares.sub(withdrawAmount));
      expect(await acvx.totalSupply()).to.eq(signerShares.add(deployerShares).sub(withdrawAmount));
    });

    it("should succeed when withdraw all base to self", async () => {
      const baseOut = await acvx.connect(signer).callStatic.withdrawToBase(constants.MaxUint256, signer.address, 0);
      const baseBefore = await baseToken.balanceOf(signer.address);
      const tx = await acvx
        .connect(signer)
        .withdrawToBase(constants.MaxUint256, signer.address, baseOut.mul(9).div(10));
      await tx.wait();
      const baseAfter = await baseToken.balanceOf(signer.address);
      await expect(tx).to.emit(acvx, "Withdraw");
      expect(baseAfter.sub(baseBefore)).to.closeToBn(baseOut, baseOut.div(1e6));
      expect(await acvx.balanceOf(signer.address)).to.eq(constants.Zero);
      expect(await acvx.totalSupply()).to.eq(deployerShares);
    });
  });

  context("harvest", async () => {
    const depositAmount = ethers.utils.parseEther("10");

    let signerShares: BigNumber;
    let deployerShares: BigNumber;
    let baseToken: MockERC20;
    let clev: MockERC20;

    beforeEach(async () => {
      baseToken = await ethers.getContractAt("MockERC20", CVX, deployer);
      clev = await ethers.getContractAt("MockERC20", DEPLOYED_CONTRACTS.CLever.CLEV, deployer);
      await baseToken.connect(signer).approve(acvx.address, constants.MaxUint256);
      await acvx.connect(signer).deposit(depositAmount, signer.address);
      await acvx.connect(signer).deposit(depositAmount, deployer.address);

      expect((await acvx.getUserLocks(signer.address)).length).to.eq(1);
      const unlockAt = (await acvx.getUserLocks(signer.address))[0].unlockAt.toNumber();
      await hre.network.provider.send("evm_setNextBlockTimestamp", [unlockAt]);
      await hre.network.provider.send("evm_mine", []);

      await acvx.connect(signer).unlock(0);
      await acvx.connect(deployer).unlock(0);

      signerShares = await acvx.balanceOf(signer.address);
      deployerShares = await acvx.balanceOf(deployer.address);
      await hre.network.provider.send("evm_setNextBlockTimestamp", [unlockAt + 86400 * 3]);
      await hre.network.provider.send("evm_mine", []);
    });

    it("should revert, when insufficient harvested", async () => {
      const baseHarvested = await acvx.callStatic.harvest(deployer.address, 0);
      await expect(acvx.harvest(deployer.address, baseHarvested.mul(11).div(10))).to.revertedWith(
        "CLeverAMO: insufficient harvested"
      );
    });

    it("should succeed without bounty", async () => {
      const poolBalanceBefore = await baseToken.balanceOf(CURVE_clevCVX_TOKEN);
      await expect(acvx.harvest(deployer.address, 0)).to.emit(acvx, "Harvest");
      const poolBalanceAfter = await baseToken.balanceOf(CURVE_clevCVX_TOKEN);
      expect(poolBalanceAfter).to.gt(poolBalanceBefore);
      const clevReward = await clev.balanceOf(acvx.address);
      expect(clevReward).to.gt(constants.Zero);
      expect(await acvx.rewardPerShare(clev.address)).to.eq(
        clevReward.mul(ethers.utils.parseEther("1")).div(signerShares.add(deployerShares))
      );
    });

    it("should succeed with bounty", async () => {
      await acvx.updateBountyPercentage(1e8); // 10% fee
      const poolBalanceBefore = await baseToken.balanceOf(CURVE_clevCVX_TOKEN);
      const balanceBefore = await baseToken.balanceOf(deployer.address);
      await expect(acvx.harvest(deployer.address, 0)).to.emit(acvx, "Harvest");
      const poolBalanceAfter = await baseToken.balanceOf(CURVE_clevCVX_TOKEN);
      const balanceAfter = await baseToken.balanceOf(deployer.address);
      expect(poolBalanceAfter).to.gt(poolBalanceBefore);
      const clevReward = await clev.balanceOf(acvx.address);
      expect(clevReward).to.gt(constants.Zero);
      expect(await acvx.rewardPerShare(clev.address)).to.eq(
        clevReward.mul(ethers.utils.parseEther("1")).div(signerShares.add(deployerShares))
      );
      expect(poolBalanceAfter.sub(poolBalanceBefore)).to.closeToBn(balanceAfter.sub(balanceBefore).mul(9), 1000);
    });
  });

  context("claim", async () => {
    const depositAmount = ethers.utils.parseEther("10");

    let signerShares: BigNumber;
    let deployerShares: BigNumber;
    let baseToken: MockERC20;
    let clev: MockERC20;

    beforeEach(async () => {
      baseToken = await ethers.getContractAt("MockERC20", CVX, deployer);
      clev = await ethers.getContractAt("MockERC20", DEPLOYED_CONTRACTS.CLever.CLEV, deployer);
      await baseToken.connect(signer).approve(acvx.address, constants.MaxUint256);
      await acvx.connect(signer).deposit(depositAmount, signer.address);
      await acvx.connect(signer).deposit(depositAmount, deployer.address);

      expect((await acvx.getUserLocks(signer.address)).length).to.eq(1);
      const unlockAt = (await acvx.getUserLocks(signer.address))[0].unlockAt.toNumber();
      await hre.network.provider.send("evm_setNextBlockTimestamp", [unlockAt]);
      await hre.network.provider.send("evm_mine", []);

      await acvx.connect(signer).unlock(0);
      await acvx.connect(deployer).unlock(0);

      signerShares = await acvx.balanceOf(signer.address);
      deployerShares = await acvx.balanceOf(deployer.address);
      await hre.network.provider.send("evm_setNextBlockTimestamp", [unlockAt + 86400 * 3]);
      await hre.network.provider.send("evm_mine", []);

      await expect(acvx.harvest(deployer.address, 0)).to.emit(acvx, "Harvest");

      await hre.network.provider.send("evm_setNextBlockTimestamp", [unlockAt + 86400 * 4]);
      await hre.network.provider.send("evm_mine", []);
    });

    it("should revert when claim other to other", async () => {
      await expect(acvx.connect(signer).claim(deployer.address, signer.address)).to.revertedWith(
        "forbid claim other to other"
      );
    });

    it("should succeed", async () => {
      const signerClaimable = await acvx.claimable(signer.address);
      const deployerClaimable = await acvx.claimable(deployer.address);

      const clevReward = await clev.balanceOf(acvx.address);
      expect(signerClaimable[0]).to.closeToBn(
        clevReward.mul(signerShares).div(signerShares.add(deployerShares)),
        1000000
      );
      expect(deployerClaimable[0]).to.closeToBn(
        clevReward.mul(deployerShares).div(signerShares.add(deployerShares)),
        1000000
      );

      // claim to self
      const clevBefore1 = await clev.balanceOf(signer.address);
      await expect(acvx.connect(signer).claim(signer.address, signer.address))
        .to.emit(acvx, "Claim")
        .withArgs(clev.address, signer.address, signer.address, signerClaimable[0]);
      const clevAfter1 = await clev.balanceOf(signer.address);
      expect(clevAfter1.sub(clevBefore1)).to.eq(signerClaimable[0]);

      // claim to other
      const clevBefore2 = await clev.balanceOf(signer.address);
      await expect(acvx.connect(deployer).claim(deployer.address, signer.address))
        .to.emit(acvx, "Claim")
        .withArgs(clev.address, deployer.address, signer.address, deployerClaimable[0]);
      const clevAfter2 = await clev.balanceOf(signer.address);
      expect(clevAfter2.sub(clevBefore2)).to.eq(deployerClaimable[0]);
    });
  });

  context("rebalance", async () => {
    let depositAmount: BigNumber;
    let baseToken: MockERC20;
    let debtToken: MockERC20;
    let lpToken: MockERC20;

    beforeEach(async () => {
      baseToken = await ethers.getContractAt("MockERC20", CVX, deployer);
      debtToken = await ethers.getContractAt("MockERC20", clevCVX, deployer);
      lpToken = await ethers.getContractAt("MockERC20", CURVE_clevCVX_TOKEN, deployer);

      const baseInPool = await baseToken.balanceOf(lpToken.address);
      const debtInPool = await debtToken.balanceOf(lpToken.address);
      depositAmount = debtInPool.sub(baseInPool).div(2).mul(2);

      await baseToken.connect(signer).approve(acvx.address, constants.MaxUint256);
      await acvx.connect(signer).deposit(depositAmount.div(2), signer.address);
      await acvx.connect(signer).deposit(depositAmount.div(2), deployer.address);

      expect((await acvx.getUserLocks(signer.address)).length).to.eq(1);
      const unlockAt = (await acvx.getUserLocks(signer.address))[0].unlockAt.toNumber();
      await hre.network.provider.send("evm_setNextBlockTimestamp", [unlockAt]);
      await hre.network.provider.send("evm_mine", []);

      await acvx.connect(signer).unlock(0);
      await acvx.connect(deployer).unlock(0);
    });

    it("should revert, when non-owner call", async () => {
      await expect(acvx.connect(signer).rebalance(0, 0, 0, 0)).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert, when lp/debt ratio out range", async () => {
      await acvx.updateAMOConfig(0, 1, 0, 1);
      await expect(acvx.rebalance(0, 0, 0, 0)).to.revertedWith("abcCVX: ratio out of range");
    });

    it("should revert, when amo ratio in range", async () => {
      await acvx.updateAMOConfig(0, ethers.utils.parseEther("10"), 0, ethers.utils.parseEther("10"));
      await expect(acvx.rebalance(0, 0, 0, 0)).to.revertedWith("abcCVX: amo in range");
    });

    it("should revert, when below of target range, withdraw from furnace", async () => {
      // current debt/base is about 691298562941259547:1000000000000000000
      // ratio after rebalance is 691303695952314713:1000000000000000000
      await acvx.updateAMOConfig(
        ethers.utils.parseEther("10"),
        ethers.utils.parseEther("10"),
        0,
        ethers.utils.parseEther("10")
      );
      await expect(
        acvx.rebalance(
          ethers.utils.parseEther("1"),
          0,
          BigNumber.from("691303695952314714"),
          BigNumber.from("691303695952314714")
        )
      ).to.revertedWith("abcCVX: final ratio below target range");
    });

    it("should revert, when above of target range, withdraw from furnace", async () => {
      // current debt/base is about 691298562941259547:1000000000000000000
      // ratio after rebalance is 691303695952314713:1000000000000000000
      await acvx.updateAMOConfig(
        ethers.utils.parseEther("10"),
        ethers.utils.parseEther("10"),
        0,
        ethers.utils.parseEther("10")
      );
      await expect(
        acvx.rebalance(
          ethers.utils.parseEther("1"),
          0,
          BigNumber.from("691303695952314712"),
          BigNumber.from("691303695952314712")
        )
      ).to.revertedWith("abcCVX: final ratio above target range");
    });

    it("should revert, when below of target range, withdraw from gauge", async () => {
      // current debt/base is about 691298562941259547:1000000000000000000
      // ratio after rebalance is 691293439278589394:1000000000000000000
      await acvx.updateAMOConfig(
        ethers.utils.parseEther("0"),
        ethers.utils.parseEther("0"),
        0,
        ethers.utils.parseEther("10")
      );
      await expect(
        acvx.rebalance(
          ethers.utils.parseEther("1"),
          0,
          BigNumber.from("691293439278589395"),
          BigNumber.from("691293439278589395")
        )
      ).to.revertedWith("abcCVX: final ratio below target range");
    });

    it("should revert, when above of target range, withdraw from gauge", async () => {
      // current debt/base is about 691298562941259547:1000000000000000000
      // ratio after rebalance is 691293439278589394:1000000000000000000
      await acvx.updateAMOConfig(
        ethers.utils.parseEther("0"),
        ethers.utils.parseEther("0"),
        0,
        ethers.utils.parseEther("10")
      );
      await expect(
        acvx.rebalance(
          ethers.utils.parseEther("1"),
          0,
          BigNumber.from("691293439278589393"),
          BigNumber.from("691293439278589393")
        )
      ).to.revertedWith("abcCVX: final ratio above target range");
    });

    it("should succeed, when below of target range, withdraw from furnace", async () => {
      // current debt/base is about 691298562941259547:1000000000000000000
      // ratio after rebalance is 691303695952314713:1000000000000000000
      await acvx.updateAMOConfig(
        ethers.utils.parseEther("10"),
        ethers.utils.parseEther("10"),
        0,
        ethers.utils.parseEther("10")
      );
      await expect(
        acvx.rebalance(ethers.utils.parseEther("1"), 0, BigNumber.from("0"), BigNumber.from("1000000000000000000"))
      )
        .to.emit(acvx, "Rebalance")
        .withArgs(await acvx.ratio(), BigNumber.from("691298562941259547"), BigNumber.from("691303695952314713"));
    });

    it("should succeed, when above of target range, withdraw from gauge", async () => {
      // current debt/base is about 691298562941259547:1000000000000000000
      // ratio after rebalance is 691293439278589394:1000000000000000000
      await acvx.updateAMOConfig(
        ethers.utils.parseEther("0"),
        ethers.utils.parseEther("0"),
        0,
        ethers.utils.parseEther("10")
      );
      await expect(
        acvx.rebalance(ethers.utils.parseEther("1"), 0, BigNumber.from("0"), BigNumber.from("1000000000000000000"))
      )
        .to.emit(acvx, "Rebalance")
        .withArgs(await acvx.ratio(), BigNumber.from("691298562941259547"), BigNumber.from("691293439278589394"));
    });
  });
});

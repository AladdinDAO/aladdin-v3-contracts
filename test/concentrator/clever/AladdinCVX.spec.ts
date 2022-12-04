/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import { MockERC20 } from "../../../typechain";
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

describe("AladdinCVX.spec", async () => {
  let deployer: SignerWithAddress;
  let signer: SignerWithAddress;
  let acvx: AladdinCVX;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CVX_HOLDER]);
    deployer = await ethers.getSigner(DEPLOYER);
    signer = await ethers.getSigner(CVX_HOLDER);
    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    const AladdinCVX = await ethers.getContractFactory("AladdinCVX", deployer);
    acvx = await AladdinCVX.deploy(
      CVX,
      clevCVX,
      CURVE_clevCVX_TOKEN,
      CURVE_clevCVX_TOKEN,
      DEPLOYED_CONTRACTS.CLever.CLeverCVX.FurnaceForCVX,
      DEPLOYED_CONTRACTS.CLever.Gauge.Curve_clevCVX_CVX.gauge
    );
    await acvx.deployed();
    // lp/debt = 2:1
    await acvx.initialize("2000000000000000000", [DEPLOYED_CONTRACTS.CLever.CLEV]);
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
      await expect(acvx.initialize(constants.Zero, [])).to.revertedWith(
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
      await acvx.connect(signer).unlock(sharesOut);
      const balanceAfter = await cvx.balanceOf(CURVE_clevCVX_TOKEN);
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
      await acvx.connect(signer).unlock(sharesOut1);
      const balanceAfter1 = await cvx.balanceOf(CURVE_clevCVX_TOKEN);
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
      await acvx.connect(deployer).unlock(sharesOut2.mul(9).div(10));
      const balanceAfter2 = await cvx.balanceOf(CURVE_clevCVX_TOKEN);
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
});

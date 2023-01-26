/* eslint-disable no-unused-vars */
/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers, network } from "hardhat";
import { TOKENS } from "../../../scripts/utils";
import {
  AldVeCRV,
  AldVeCRVLiquidityStaking,
  CurveLockerProxy,
  ICurveFeeDistributor,
  MockERC20,
} from "../../../typechain";
import { request_fork } from "../../utils";

const FORK_BLOCK_NUMBER = 16489300;

const veCRV = "0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2";
const CRV = TOKENS.CRV.address;
const CRV_HOLDER = "0x32d03db62e464c9168e41028ffa6e9a05d8c6451";

const THREE_CRV = TOKENS.TRICRV.address;
const THREE_CRV_HOLDER = "0x4486083589a063ddef47ee2e4467b5236c508fde";

const CURVE_DAO = "0x40907540d8a6C65c637785e8f8B742ae6b0b9968";
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const OPERATOR = "0x66c57bF505A85A74609D2C83E94Aabb26d691E1F";

describe("AldVeCRVLiquidityStaking.spec", async () => {
  let deployer: SignerWithAddress;
  let operator: SignerWithAddress;

  let aldvecrv: AldVeCRV;
  let proxy: CurveLockerProxy;
  let staker: AldVeCRVLiquidityStaking;
  let distributor: ICurveFeeDistributor;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, OPERATOR, THREE_CRV_HOLDER, CRV_HOLDER, CURVE_DAO]);
    deployer = await ethers.getSigner(DEPLOYER);
    operator = await ethers.getSigner(OPERATOR);
    await deployer.sendTransaction({ to: THREE_CRV_HOLDER, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: CRV_HOLDER, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: CURVE_DAO, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: OPERATOR, value: ethers.utils.parseEther("10") });

    const CurveLockerProxy = await ethers.getContractFactory("CurveLockerProxy", deployer);
    proxy = await CurveLockerProxy.deploy();
    await proxy.deployed();

    const AldVeCRV = await ethers.getContractFactory("AldVeCRV", deployer);
    aldvecrv = await AldVeCRV.deploy();
    await aldvecrv.deployed();

    const AldVeCRVLiquidityStaking = await ethers.getContractFactory("AldVeCRVLiquidityStaking", deployer);
    staker = await AldVeCRVLiquidityStaking.deploy(proxy.address, aldvecrv.address);
    await staker.deployed();
    await staker.initialize();

    // add whitelist
    const dao = await ethers.getSigner(CURVE_DAO);
    const checker = await ethers.getContractAt(
      "SmartWalletWhitelist",
      "0xca719728Ef172d0961768581fdF35CB116e0B7a4",
      dao
    );
    await checker.approveWallet(proxy.address);

    // lock CRV
    const amount = ethers.utils.parseEther("100000");
    const holder = await ethers.getSigner(CRV_HOLDER);
    const crv = await ethers.getContractAt("IERC20", CRV, holder);
    distributor = await ethers.getContractAt(
      "ICurveFeeDistributor",
      "0xA464e6DCda8AC41e03616F95f4BC98a13b8922Dc",
      deployer
    );

    await crv.transfer(proxy.address, amount);
    const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
    await proxy.createLock(amount, timestamp + 86400 * 365 * 4);

    // mint aldveCRV
    await aldvecrv.mint(deployer.address, ethers.utils.parseEther("1000000"));
  });

  context("auth", async () => {
    it("should initialized correctly", async () => {
      expect(await staker.booster()).to.eq(deployer.address);
      expect(await staker.symbol()).to.eq("stk-aldveCRV");
      expect(await staker.name()).to.eq("Staked Aladdin DAO veCRV");
      expect(await staker.proxy()).to.eq(proxy.address);
      expect(await staker.stakingToken()).to.eq(aldvecrv.address);
      expect(await staker.rewardToken()).to.eq(CRV);
    });
  });

  context("deposit", async () => {
    it("should revert, when deposit zero amount", async () => {
      await expect(staker.deposit(constants.Zero, constants.AddressZero)).to.revertedWith("deposit zero amount");
    });

    it("should succeed, when deposit some to self", async () => {
      const amount = ethers.utils.parseEther("100");
      await aldvecrv.approve(staker.address, amount);
      await expect(staker.deposit(amount, deployer.address))
        .to.emit(staker, "Deposit")
        .withArgs(deployer.address, deployer.address, amount);
      expect(await staker.balanceOf(deployer.address)).to.eq(amount);
      expect(await staker.totalSupply()).to.eq(amount);
    });

    it("should succeed, when deposit some to other", async () => {
      const amount = ethers.utils.parseEther("100");
      await aldvecrv.approve(staker.address, amount);
      await expect(staker.deposit(amount, operator.address))
        .to.emit(staker, "Deposit")
        .withArgs(deployer.address, operator.address, amount);
      expect(await staker.balanceOf(operator.address)).to.eq(amount);
      expect(await staker.totalSupply()).to.eq(amount);
    });

    it("should succeed, when deposit all to self", async () => {
      const amount = await aldvecrv.balanceOf(deployer.address);
      await aldvecrv.approve(staker.address, amount);
      await expect(staker.deposit(constants.MaxUint256, deployer.address))
        .to.emit(staker, "Deposit")
        .withArgs(deployer.address, deployer.address, amount);
      expect(await staker.balanceOf(deployer.address)).to.eq(amount);
      expect(await staker.totalSupply()).to.eq(amount);
    });

    it("should succeed, when deposit all to other", async () => {
      const amount = await aldvecrv.balanceOf(deployer.address);
      await aldvecrv.approve(staker.address, amount);
      await expect(staker.deposit(constants.MaxUint256, operator.address))
        .to.emit(staker, "Deposit")
        .withArgs(deployer.address, operator.address, amount);
      expect(await staker.balanceOf(operator.address)).to.eq(amount);
      expect(await staker.totalSupply()).to.eq(amount);
    });
  });

  context("withdraw without claim", async () => {
    const amountIn = ethers.utils.parseEther("1000");

    beforeEach(async () => {
      await aldvecrv.approve(staker.address, amountIn);
      await staker.deposit(amountIn, deployer.address);
    });

    it("should revert, when withdraw zero amount", async () => {
      await expect(staker.withdraw(constants.Zero, constants.AddressZero, false)).to.revertedWith(
        "withdraw zero amount"
      );
    });

    it("should succeed, when withdraw some to self", async () => {
      const amount = ethers.utils.parseEther("100");
      const before = await aldvecrv.balanceOf(deployer.address);
      await expect(staker.withdraw(amount, deployer.address, false))
        .to.emit(staker, "Withdraw")
        .withArgs(deployer.address, deployer.address, amount);
      const after = await aldvecrv.balanceOf(deployer.address);
      expect(await staker.balanceOf(deployer.address)).to.eq(amountIn.sub(amount));
      expect(await staker.totalSupply()).to.eq(amountIn.sub(amount));
      expect(after.sub(before)).to.eq(amount);
    });

    it("should succeed, when withdraw some to other", async () => {
      const amount = ethers.utils.parseEther("100");
      const before = await aldvecrv.balanceOf(operator.address);
      await expect(staker.withdraw(amount, operator.address, false))
        .to.emit(staker, "Withdraw")
        .withArgs(deployer.address, operator.address, amount);
      const after = await aldvecrv.balanceOf(operator.address);
      expect(await staker.balanceOf(deployer.address)).to.eq(amountIn.sub(amount));
      expect(await staker.totalSupply()).to.eq(amountIn.sub(amount));
      expect(after.sub(before)).to.eq(amount);
    });

    it("should succeed, when withdraw all to self", async () => {
      const before = await aldvecrv.balanceOf(deployer.address);
      await expect(staker.withdraw(constants.MaxUint256, deployer.address, false))
        .to.emit(staker, "Withdraw")
        .withArgs(deployer.address, deployer.address, amountIn);
      const after = await aldvecrv.balanceOf(deployer.address);
      expect(await staker.balanceOf(deployer.address)).to.eq(constants.Zero);
      expect(await staker.totalSupply()).to.eq(constants.Zero);
      expect(after.sub(before)).to.eq(amountIn);
    });

    it("should succeed, when withdraw all to other", async () => {
      const before = await aldvecrv.balanceOf(operator.address);
      await expect(staker.withdraw(constants.MaxUint256, operator.address, false))
        .to.emit(staker, "Withdraw")
        .withArgs(deployer.address, operator.address, amountIn);
      const after = await aldvecrv.balanceOf(operator.address);
      expect(await staker.balanceOf(operator.address)).to.eq(constants.Zero);
      expect(await staker.totalSupply()).to.eq(constants.Zero);
      expect(after.sub(before)).to.eq(amountIn);
    });
  });

  context("withdraw claim", async () => {
    const amountIn = ethers.utils.parseEther("1000");
    let crv: MockERC20;
    let holder: SignerWithAddress;

    beforeEach(async () => {
      await aldvecrv.approve(staker.address, amountIn);
      await staker.deposit(amountIn, deployer.address);

      holder = await ethers.getSigner(CRV_HOLDER);
      crv = await ethers.getContractAt("MockERC20", CRV, holder);

      await crv.transfer(staker.address, amountIn);
      await staker.queueNewRewards(amountIn);
    });

    it("should revert, when withdraw zero amount", async () => {
      await expect(staker.withdraw(constants.Zero, constants.AddressZero, false)).to.revertedWith(
        "withdraw zero amount"
      );
    });

    it("should succeed, when withdraw some to self", async () => {
      const amount = ethers.utils.parseEther("100");
      const before = await aldvecrv.balanceOf(deployer.address);
      const crvBefore = await crv.balanceOf(deployer.address);
      await expect(staker.withdraw(amount, deployer.address, true))
        .to.emit(staker, "Withdraw")
        .withArgs(deployer.address, deployer.address, amount)
        .to.emit(staker, "Claim");
      const after = await aldvecrv.balanceOf(deployer.address);
      const crvAfter = await crv.balanceOf(deployer.address);
      expect(await staker.balanceOf(deployer.address)).to.eq(amountIn.sub(amount));
      expect(await staker.totalSupply()).to.eq(amountIn.sub(amount));
      expect(after.sub(before)).to.eq(amount);
      expect(crvAfter).to.gt(crvBefore);
    });

    it("should succeed, when withdraw some to other", async () => {
      const amount = ethers.utils.parseEther("100");
      const before = await aldvecrv.balanceOf(operator.address);
      const crvBefore = await crv.balanceOf(operator.address);
      await expect(staker.withdraw(amount, operator.address, true))
        .to.emit(staker, "Withdraw")
        .withArgs(deployer.address, operator.address, amount)
        .to.emit(staker, "Claim");
      const after = await aldvecrv.balanceOf(operator.address);
      const crvAfter = await crv.balanceOf(operator.address);
      expect(await staker.balanceOf(deployer.address)).to.eq(amountIn.sub(amount));
      expect(await staker.totalSupply()).to.eq(amountIn.sub(amount));
      expect(after.sub(before)).to.eq(amount);
      expect(crvAfter).to.gt(crvBefore);
    });

    it("should succeed, when withdraw all to self", async () => {
      const before = await aldvecrv.balanceOf(deployer.address);
      const crvBefore = await crv.balanceOf(deployer.address);
      await expect(staker.withdraw(constants.MaxUint256, deployer.address, true))
        .to.emit(staker, "Withdraw")
        .withArgs(deployer.address, deployer.address, amountIn)
        .to.emit(staker, "Claim");
      const after = await aldvecrv.balanceOf(deployer.address);
      const crvAfter = await crv.balanceOf(deployer.address);
      expect(await staker.balanceOf(deployer.address)).to.eq(constants.Zero);
      expect(await staker.totalSupply()).to.eq(constants.Zero);
      expect(after.sub(before)).to.eq(amountIn);
      expect(crvAfter).to.gt(crvBefore);
    });

    it("should succeed, when withdraw all to other", async () => {
      const before = await aldvecrv.balanceOf(operator.address);
      const crvBefore = await crv.balanceOf(operator.address);
      await expect(staker.withdraw(constants.MaxUint256, operator.address, true))
        .to.emit(staker, "Withdraw")
        .withArgs(deployer.address, operator.address, amountIn)
        .to.emit(staker, "Claim");
      const after = await aldvecrv.balanceOf(operator.address);
      const crvAfter = await crv.balanceOf(operator.address);
      expect(await staker.balanceOf(operator.address)).to.eq(constants.Zero);
      expect(await staker.totalSupply()).to.eq(constants.Zero);
      expect(after.sub(before)).to.eq(amountIn);
      expect(crvAfter).to.gt(crvBefore);
    });
  });

  context("claim", async () => {});

  context("claimFees", async () => {});
});

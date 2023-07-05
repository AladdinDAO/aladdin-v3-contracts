/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers, network } from "hardhat";
import { DEPLOYED_CONTRACTS, TOKENS, ZAP_ROUTES } from "../../../scripts/utils";
import {
  AladdinFXS,
  AladdinFXSV2,
  AladdinZap,
  CvxFxsStakingStrategy,
  ICvxFxsStaking,
  MockERC20,
  ProxyAdmin,
} from "../../../typechain";
import { request_fork } from "../../utils";

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const aFXS_HOLDER1 = "0x4492f0D0497bfb4564A085e1e1eB3Bb8080DFf93";
const aFXS_HOLDER2 = "0x4CC25E0366c564847546f2feda3D7f0D9155B9ac";
const cvxFXS_HOLDER = "0x54973508cCFbA18072Db8ac133Ab4A4f91eebdd2";
const FXS_HOLDER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const STAKED_cvxFXS_HOLDER = "0xAAc0aa431c237C2C0B5f041c8e59B3f1a43aC78F";

const FEE_DEPOSITOR = "0x7A527d8bB09f7D70C148aB5DE919e9BF68a0d769";
const FEE_DISTRIBUTOR = "0x051C42Ee7A529410a10E5Ec11B9E9b8bA7cbb795";

const STAKED_cvxFXS = "0x49b4d1dF40442f0C31b1BbAEA3EDE7c38e37E31a";

const FORK_HEIGHT = 17626250;

describe("AladdinFXS.upgrade.spec", async () => {
  let deployer: SignerWithAddress;
  let admin: SignerWithAddress;

  let proxyAdmin: ProxyAdmin;
  let afxs: AladdinFXS;
  let afxs_v2: AladdinFXSV2;
  let afxs_v2_impl: AladdinFXSV2;

  let zap: AladdinZap;
  let strategy: CvxFxsStakingStrategy;
  let staker: ICvxFxsStaking;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [
      DEPLOYER,
      aFXS_HOLDER1,
      aFXS_HOLDER2,
      cvxFXS_HOLDER,
      FXS_HOLDER,
      STAKED_cvxFXS_HOLDER,
      DEPLOYED_CONTRACTS.ManagementMultisig,
      DEPLOYED_CONTRACTS.Concentrator.Treasury,
      FEE_DISTRIBUTOR,
    ]);

    deployer = await ethers.getSigner(DEPLOYER);
    admin = await ethers.getSigner(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    const manager = await ethers.getSigner(DEPLOYED_CONTRACTS.ManagementMultisig);

    await deployer.sendTransaction({ to: admin.address, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: manager.address, value: ethers.utils.parseEther("10") });

    staker = await ethers.getContractAt("ICvxFxsStaking", STAKED_cvxFXS, deployer);
    zap = await ethers.getContractAt("AladdinZap", DEPLOYED_CONTRACTS.AladdinZap, manager);

    proxyAdmin = await ethers.getContractAt("ProxyAdmin", DEPLOYED_CONTRACTS.Concentrator.ProxyAdmin, admin);
    afxs = await ethers.getContractAt("AladdinFXS", DEPLOYED_CONTRACTS.Concentrator.cvxFXS.aFXS, admin);

    afxs.updateHarvester(constants.AddressZero);

    const AladdinFXSV2 = await ethers.getContractFactory("AladdinFXSV2", deployer);
    afxs_v2_impl = await AladdinFXSV2.deploy();
    await afxs_v2_impl.deployed();

    const CvxFxsStakingStrategy = await ethers.getContractFactory("CvxFxsStakingStrategy", deployer);
    strategy = await CvxFxsStakingStrategy.deploy(afxs.address);
    await strategy.deployed();
  });

  context("upgraded", async () => {
    let totalAssetsBefore: BigNumber;

    beforeEach(async () => {
      await zap.updateRoute(TOKENS.CVX.address, TOKENS.FXS.address, ZAP_ROUTES.CVX.FXS);

      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      // make sure 7 days passed, then the rewards will not increase anymore.
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      await network.provider.send("evm_mine");

      await afxs.harvest(deployer.address, 0);
      totalAssetsBefore = await afxs.totalAssets();

      await proxyAdmin.upgrade(afxs.address, afxs_v2_impl.address);
      afxs_v2 = await ethers.getContractAt("AladdinFXSV2", afxs.address, admin);
      await afxs_v2.initializeV2(strategy.address);

      await afxs.updateZap(DEPLOYED_CONTRACTS.AladdinZap);
    });

    it("should initialize correctly", async () => {
      expect(await afxs_v2.totalAssets()).to.gt(totalAssetsBefore);
      expect(await afxs_v2.strategy()).to.eq(strategy.address);
      expect(await staker.balanceOf(strategy.address)).to.eq(await afxs_v2.totalAssets());
    });

    context("deposit with cvxFXS", async () => {
      let holder: SignerWithAddress;
      let token: MockERC20;

      beforeEach(async () => {
        holder = await ethers.getSigner(cvxFXS_HOLDER);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });

        token = await ethers.getContractAt("MockERC20", TOKENS.cvxFXS.address, holder);
      });

      it("should revert when deposit zero amount", async () => {
        await expect(afxs_v2.connect(holder).deposit(0, holder.address)).to.reverted;
      });

      it("should succeed, when deposit some amount", async () => {
        const amount = ethers.utils.parseUnits("1000", 18);
        await token.approve(afxs_v2.address, amount);

        const minShare = amount.mul(await afxs_v2.totalSupply()).div(await afxs_v2.totalAssets());
        const shareBefore = await afxs_v2.balanceOf(holder.address);
        const strategyBalanceBefore = await staker.balanceOf(strategy.address);
        await afxs_v2.connect(holder).deposit(amount, holder.address);
        const shareAfter = await afxs_v2.balanceOf(holder.address);
        const strategyBalanceAfter = await staker.balanceOf(strategy.address);
        expect(shareAfter.sub(shareBefore)).to.gte(minShare);
        expect(strategyBalanceAfter.sub(strategyBalanceBefore)).eq(amount);
      });

      it("should succeed, when deposit all amount", async () => {
        const amount = await token.balanceOf(holder.address);
        await token.approve(afxs_v2.address, amount);

        const minShare = amount.mul(await afxs_v2.totalSupply()).div(await afxs_v2.totalAssets());
        const shareBefore = await afxs_v2.balanceOf(holder.address);
        const strategyBalanceBefore = await staker.balanceOf(strategy.address);
        await afxs_v2.connect(holder).deposit(constants.MaxUint256, holder.address);
        const shareAfter = await afxs_v2.balanceOf(holder.address);
        const strategyBalanceAfter = await staker.balanceOf(strategy.address);
        expect(shareAfter.sub(shareBefore)).to.gte(minShare);
        expect(strategyBalanceAfter.sub(strategyBalanceBefore)).eq(amount);
      });
    });

    context("deposit with FXS", async () => {
      let holder: SignerWithAddress;
      let token: MockERC20;

      beforeEach(async () => {
        holder = await ethers.getSigner(FXS_HOLDER);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });

        token = await ethers.getContractAt("MockERC20", TOKENS.FXS.address, holder);
      });

      it("should revert when deposit zero amount", async () => {
        await expect(afxs_v2.connect(holder).depositWithFXS(0, holder.address, 0)).to.reverted;
      });

      it("should succeed, when deposit some amount", async () => {
        const amount = ethers.utils.parseUnits("1000", 18);
        await token.approve(afxs_v2.address, amount);

        const minShare = amount.mul(await afxs_v2.totalSupply()).div(await afxs_v2.totalAssets());
        const shareBefore = await afxs_v2.balanceOf(holder.address);
        const strategyBalanceBefore = await staker.balanceOf(strategy.address);
        await afxs_v2.connect(holder).depositWithFXS(amount, holder.address, minShare);
        const shareAfter = await afxs_v2.balanceOf(holder.address);
        const strategyBalanceAfter = await staker.balanceOf(strategy.address);
        expect(shareAfter.sub(shareBefore)).to.gte(minShare);
        expect(strategyBalanceAfter.sub(strategyBalanceBefore)).gte(amount);
      });

      it("should succeed, when deposit all amount", async () => {
        const amount = await token.balanceOf(holder.address);
        await token.approve(afxs_v2.address, amount);

        const minShare = amount.mul(await afxs_v2.totalSupply()).div(await afxs_v2.totalAssets());
        const shareBefore = await afxs_v2.balanceOf(holder.address);
        const strategyBalanceBefore = await staker.balanceOf(strategy.address);
        await afxs_v2.connect(holder).depositWithFXS(constants.MaxUint256, holder.address, minShare);
        const shareAfter = await afxs_v2.balanceOf(holder.address);
        const strategyBalanceAfter = await staker.balanceOf(strategy.address);
        expect(shareAfter.sub(shareBefore)).to.gte(minShare);
        expect(strategyBalanceAfter.sub(strategyBalanceBefore)).gte(amount);
      });
    });

    context("deposit with stkCvxFxs", async () => {
      let holder: SignerWithAddress;
      let token: MockERC20;

      beforeEach(async () => {
        holder = await ethers.getSigner(STAKED_cvxFXS_HOLDER);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });

        token = await ethers.getContractAt("MockERC20", STAKED_cvxFXS, holder);
      });

      it("should revert when deposit zero amount", async () => {
        await expect(afxs_v2.connect(holder).depositWithStkCvxFxs(0, holder.address)).to.reverted;
      });

      it("should succeed, when deposit some amount", async () => {
        const amount = ethers.utils.parseUnits("1000", 18);
        await token.approve(afxs_v2.address, amount);

        const minShare = amount.mul(await afxs_v2.totalSupply()).div(await afxs_v2.totalAssets());
        const shareBefore = await afxs_v2.balanceOf(holder.address);
        const strategyBalanceBefore = await staker.balanceOf(strategy.address);
        await afxs_v2.connect(holder).depositWithStkCvxFxs(amount, holder.address);
        const shareAfter = await afxs_v2.balanceOf(holder.address);
        const strategyBalanceAfter = await staker.balanceOf(strategy.address);
        expect(shareAfter.sub(shareBefore)).to.gte(minShare);
        expect(strategyBalanceAfter.sub(strategyBalanceBefore)).eq(amount);
      });

      it("should succeed, when deposit all amount", async () => {
        const amount = await token.balanceOf(holder.address);
        await token.approve(afxs_v2.address, amount);

        const minShare = amount.mul(await afxs_v2.totalSupply()).div(await afxs_v2.totalAssets());
        const shareBefore = await afxs_v2.balanceOf(holder.address);
        const strategyBalanceBefore = await staker.balanceOf(strategy.address);
        await afxs_v2.connect(holder).depositWithStkCvxFxs(constants.MaxUint256, holder.address);
        const shareAfter = await afxs_v2.balanceOf(holder.address);
        const strategyBalanceAfter = await staker.balanceOf(strategy.address);
        expect(shareAfter.sub(shareBefore)).to.gte(minShare);
        expect(strategyBalanceAfter.sub(strategyBalanceBefore)).eq(amount);
      });
    });

    context("withdraw", async () => {
      let holder: SignerWithAddress;
      let token: MockERC20;

      beforeEach(async () => {
        holder = await ethers.getSigner(cvxFXS_HOLDER);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });

        token = await ethers.getContractAt("MockERC20", TOKENS.cvxFXS.address, holder);

        const amount = ethers.utils.parseUnits("1000", 18);
        await token.approve(afxs_v2.address, amount);
        await afxs_v2.connect(holder).deposit(amount, holder.address);
      });

      it("should revert, when redeem zero shares", async () => {
        await expect(afxs_v2.connect(holder).redeem(0, deployer.address, deployer.address)).to.reverted;
      });

      it("should succeed, when redeem some share", async () => {
        const share = ethers.utils.parseUnits("100", 18);

        const balanceBefore = await token.balanceOf(deployer.address);
        const shareBefore = await afxs_v2.balanceOf(holder.address);
        await afxs_v2.connect(holder).redeem(share, deployer.address, holder.address);
        const balanceAfter = await token.balanceOf(deployer.address);
        const shareAfter = await afxs_v2.balanceOf(holder.address);

        expect(shareBefore.sub(shareAfter)).to.eq(share);
        expect(balanceAfter.sub(balanceBefore)).to.gt(constants.Zero);
      });

      it("should succeed, when redeem all share", async () => {
        const share = await afxs.balanceOf(holder.address);

        const balanceBefore = await token.balanceOf(deployer.address);
        const shareBefore = await afxs_v2.balanceOf(holder.address);
        await afxs_v2.connect(holder).redeem(constants.MaxUint256, deployer.address, holder.address);
        const balanceAfter = await token.balanceOf(deployer.address);
        const shareAfter = await afxs_v2.balanceOf(holder.address);

        expect(shareBefore.sub(shareAfter)).to.eq(share);
        expect(balanceAfter.sub(balanceBefore)).to.gt(constants.Zero);
      });
    });

    context("harvest", async () => {
      let holder: SignerWithAddress;
      let token: MockERC20;

      beforeEach(async () => {
        holder = await ethers.getSigner(cvxFXS_HOLDER);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });

        token = await ethers.getContractAt("MockERC20", TOKENS.cvxFXS.address, holder);

        const amount = ethers.utils.parseUnits("1000", 18);
        await token.approve(afxs_v2.address, amount);
        await afxs_v2.connect(holder).deposit(amount, holder.address);
      });

      it(`should succeed`, async () => {
        await zap.updateRoute(TOKENS.CVX.address, TOKENS.FXS.address, ZAP_ROUTES.CVX.FXS);

        const distributor = await ethers.getSigner(FEE_DISTRIBUTOR);
        await distributor.sendTransaction({
          to: FEE_DEPOSITOR,
          data: "0xe4fc6b6d",
        });

        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        // make sure 7 days passed, then the rewards will not increase anymore.
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
        await network.provider.send("evm_mine");

        const harvested = await afxs_v2.callStatic.harvest(deployer.address, 0);
        expect(harvested).to.gt(constants.Zero);

        const before = await staker.balanceOf(strategy.address);
        await afxs_v2.harvest(deployer.address, 0);
        const after = await staker.balanceOf(strategy.address);
        expect(after.sub(before)).to.eq(harvested);
        console.log("harvested:", ethers.utils.formatUnits(harvested, 18));
      });
    });
  });
});

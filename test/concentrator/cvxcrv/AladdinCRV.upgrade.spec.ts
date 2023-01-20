/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
// import { AladdinCRV, AladdinCRVV2 } from "../../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers, network } from "hardhat";
import { DEPLOYED_CONTRACTS, TOKENS, ZAP_ROUTES } from "../../../scripts/utils";
import {
  AladdinCRV,
  AladdinCRVV2,
  AladdinZap,
  CvxCrvStakingWrapperStrategy,
  IConvexBooster,
  ICvxCrvStakingWrapper,
  MockERC20,
  ProxyAdmin,
} from "../../../typechain";
import { request_fork } from "../../utils";

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const ACRV_HOLDER1 = "0x4ad8c6d982ea20c6b105c480c866fef79dde36db";
const ACRV_HOLDER2 = "0x488b99c4a94bb0027791e8e0eeb421187ec9a487";
const CVXCRV_HOLDER = "0xbe8f240968a60f8849abbb6838849aa8e96daab4";
const CRV_HOLDER = "0x32d03db62e464c9168e41028ffa6e9a05d8c6451";
const STK_CVXCRV_HOLDER = "0x4ee98b27eef58844e460922ec9da7c05d32f284a";

const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const STAKED_CVXCRV = "0xaa0C3f5F7DFD688C6E646F66CD2a6B66ACdbE434";

const FORK_HEIGHT = 16445265;

describe("AladdinCRV.upgrade.spec", async () => {
  let deployer: SignerWithAddress;
  let admin: SignerWithAddress;

  let proxyAdmin: ProxyAdmin;
  let acrv: AladdinCRV;
  let acrv_v2: AladdinCRVV2;
  let acrv_v2_impl: AladdinCRVV2;

  let zap: AladdinZap;
  let booster: IConvexBooster;
  let strategy: CvxCrvStakingWrapperStrategy;
  let wrapper: ICvxCrvStakingWrapper;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [
      DEPLOYER,
      ACRV_HOLDER1,
      ACRV_HOLDER2,
      CVXCRV_HOLDER,
      CRV_HOLDER,
      STK_CVXCRV_HOLDER,
      DEPLOYED_CONTRACTS.ManagementMultisig,
      DEPLOYED_CONTRACTS.Concentrator.Treasury,
    ]);

    deployer = await ethers.getSigner(DEPLOYER);
    admin = await ethers.getSigner(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    const manager = await ethers.getSigner(DEPLOYED_CONTRACTS.ManagementMultisig);

    await deployer.sendTransaction({ to: admin.address, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: manager.address, value: ethers.utils.parseEther("10") });

    booster = await ethers.getContractAt("IConvexBooster", BOOSTER, deployer);
    wrapper = await ethers.getContractAt("ICvxCrvStakingWrapper", STAKED_CVXCRV, deployer);
    zap = await ethers.getContractAt("AladdinZap", DEPLOYED_CONTRACTS.AladdinZap, manager);

    proxyAdmin = await ethers.getContractAt("ProxyAdmin", DEPLOYED_CONTRACTS.Concentrator.ProxyAdmin, admin);
    acrv = await ethers.getContractAt("AladdinCRV", DEPLOYED_CONTRACTS.Concentrator.cvxCRV.aCRV, admin);

    const AladdinCRVV2 = await ethers.getContractFactory("AladdinCRVV2", deployer);
    acrv_v2_impl = await AladdinCRVV2.deploy("0x9d0464996170c6b9e75eed71c68b99ddedf279e8", wrapper.address);
    await acrv_v2_impl.deployed();

    const CvxCrvStakingWrapperStrategy = await ethers.getContractFactory("CvxCrvStakingWrapperStrategy", deployer);
    strategy = await CvxCrvStakingWrapperStrategy.deploy(acrv.address, STAKED_CVXCRV);
    await strategy.deployed();
  });

  it("should have correct data after upgrade", async () => {
    const acrv_holder1 = await ethers.getSigner(ACRV_HOLDER1);
    const acrv_holder2 = await ethers.getSigner(ACRV_HOLDER2);

    const totalSupplyBefore = await acrv.totalSupply();
    const balanceOfBefore1 = await acrv.balanceOf(acrv_holder1.address);
    const balanceOfBefore2 = await acrv.balanceOf(acrv_holder2.address);
    const zapBefore = await acrv.zap();
    const withdrawFeePercentageBefore = await acrv.withdrawFeePercentage();
    const platformFeePercentageBefore = await acrv.platformFeePercentage();
    const harvestBountyPercentageBefore = await acrv.harvestBountyPercentage();
    const platformBefore = await acrv.platform();

    await proxyAdmin.upgrade(acrv.address, acrv_v2_impl.address);
    acrv_v2 = await ethers.getContractAt("AladdinCRVV2", acrv.address, deployer);

    expect(await acrv_v2.totalSupply()).to.eq(totalSupplyBefore);
    expect(await acrv_v2.balanceOf(acrv_holder1.address)).to.eq(balanceOfBefore1);
    expect(await acrv_v2.balanceOf(acrv_holder2.address)).to.eq(balanceOfBefore2);
    expect(await acrv_v2.zap()).to.eq(zapBefore);
    expect(await acrv_v2.withdrawFeePercentage()).to.eq(withdrawFeePercentageBefore);
    expect(await acrv_v2.platformFeePercentage()).to.eq(platformFeePercentageBefore);
    expect(await acrv_v2.harvestBountyPercentage()).to.eq(harvestBountyPercentageBefore);
    expect(await acrv_v2.platform()).to.eq(platformBefore);
  });

  context("upgraded", async () => {
    let totalUnderlyingBefore: BigNumber;

    beforeEach(async () => {
      await zap.updateRoute(TOKENS.CVX.address, TOKENS.CRV.address, ZAP_ROUTES.CVX.CRV);
      await zap.updateRoute(TOKENS.TRICRV.address, TOKENS.CRV.address, ZAP_ROUTES.TRICRV.CRV);
      await zap.updateRoute(TOKENS.cvxCRV.address, TOKENS.CRV.address, ZAP_ROUTES.cvxCRV.CRV);
      await zap.updateRoute(TOKENS.cvxCRV.address, TOKENS.WETH.address, ZAP_ROUTES.cvxCRV.WETH);

      await booster.earmarkFees();
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      // make sure 7 days passed, then the rewards will not increase anymore.
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      await network.provider.send("evm_mine");

      await acrv.harvest(deployer.address, 0);
      totalUnderlyingBefore = await acrv.totalUnderlying();

      await proxyAdmin.upgrade(acrv.address, acrv_v2_impl.address);
      acrv_v2 = await ethers.getContractAt("AladdinCRVV2", acrv.address, admin);
      await acrv_v2.initializeV2(strategy.address);

      await acrv.updateZap(DEPLOYED_CONTRACTS.AladdinZap);
    });

    it("should initialize correctly", async () => {
      expect(await acrv_v2.totalUnderlying()).to.eq(totalUnderlyingBefore);
      expect(await acrv_v2.strategy()).to.eq(strategy.address);
      expect(await wrapper.balanceOf(strategy.address)).to.eq(totalUnderlyingBefore);
    });

    context("deposit with cvxCRV", async () => {
      let holder: SignerWithAddress;
      let token: MockERC20;

      beforeEach(async () => {
        holder = await ethers.getSigner(CVXCRV_HOLDER);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });

        token = await ethers.getContractAt("MockERC20", TOKENS.cvxCRV.address, holder);
      });

      it("should revert when deposit zero amount", async () => {
        await expect(acrv_v2.connect(holder)["deposit(address,uint256)"](holder.address, 0)).to.reverted;
      });

      it("should succeed, when deposit some amount", async () => {
        const amount = ethers.utils.parseUnits("1000", 18);
        await token.approve(acrv_v2.address, amount);

        const minShare = amount.mul(await acrv_v2.totalSupply()).div(await acrv_v2.totalUnderlying());
        const shareBefore = await acrv_v2.balanceOf(holder.address);
        const strategyBalanceBefore = await wrapper.balanceOf(strategy.address);
        await acrv_v2.connect(holder)["deposit(address,uint256)"](holder.address, amount);
        const shareAfter = await acrv_v2.balanceOf(holder.address);
        const strategyBalanceAfter = await wrapper.balanceOf(strategy.address);
        expect(shareAfter.sub(shareBefore)).to.gte(minShare);
        expect(strategyBalanceAfter.sub(strategyBalanceBefore)).eq(amount);
      });

      it("should succeed, when deposit all amount", async () => {
        const amount = await token.balanceOf(holder.address);
        await token.approve(acrv_v2.address, amount);

        const minShare = amount.mul(await acrv_v2.totalSupply()).div(await acrv_v2.totalUnderlying());
        const shareBefore = await acrv_v2.balanceOf(holder.address);
        const strategyBalanceBefore = await wrapper.balanceOf(strategy.address);
        await acrv_v2.connect(holder)["deposit(address,uint256)"](holder.address, constants.MaxUint256);
        const shareAfter = await acrv_v2.balanceOf(holder.address);
        const strategyBalanceAfter = await wrapper.balanceOf(strategy.address);
        expect(shareAfter.sub(shareBefore)).to.gte(minShare);
        expect(strategyBalanceAfter.sub(strategyBalanceBefore)).eq(amount);
      });
    });

    context("deposit with CRV", async () => {
      let holder: SignerWithAddress;
      let token: MockERC20;

      beforeEach(async () => {
        holder = await ethers.getSigner(CRV_HOLDER);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });

        token = await ethers.getContractAt("MockERC20", TOKENS.CRV.address, holder);
      });

      it("should revert when deposit zero amount", async () => {
        await expect(acrv_v2.connect(holder).depositWithCRV(holder.address, 0)).to.reverted;
      });

      it("should succeed, when deposit some amount", async () => {
        const amount = ethers.utils.parseUnits("1000", 18);
        await token.approve(acrv_v2.address, amount);

        const minShare = amount.mul(await acrv_v2.totalSupply()).div(await acrv_v2.totalUnderlying());
        const shareBefore = await acrv_v2.balanceOf(holder.address);
        const strategyBalanceBefore = await wrapper.balanceOf(strategy.address);
        await acrv_v2.connect(holder).depositWithCRV(holder.address, amount);
        const shareAfter = await acrv_v2.balanceOf(holder.address);
        const strategyBalanceAfter = await wrapper.balanceOf(strategy.address);
        expect(shareAfter.sub(shareBefore)).to.gte(minShare);
        expect(strategyBalanceAfter.sub(strategyBalanceBefore)).gte(amount);
      });

      it("should succeed, when deposit all amount", async () => {
        const amount = await token.balanceOf(holder.address);
        await token.approve(acrv_v2.address, amount);

        const minShare = amount.mul(await acrv_v2.totalSupply()).div(await acrv_v2.totalUnderlying());
        const shareBefore = await acrv_v2.balanceOf(holder.address);
        const strategyBalanceBefore = await wrapper.balanceOf(strategy.address);
        await acrv_v2.connect(holder).depositWithCRV(holder.address, constants.MaxUint256);
        const shareAfter = await acrv_v2.balanceOf(holder.address);
        const strategyBalanceAfter = await wrapper.balanceOf(strategy.address);
        expect(shareAfter.sub(shareBefore)).to.gte(minShare);
        expect(strategyBalanceAfter.sub(strategyBalanceBefore)).gte(amount);
      });
    });

    context("deposit with stkCvxCrv", async () => {
      let holder: SignerWithAddress;
      let token: MockERC20;

      beforeEach(async () => {
        holder = await ethers.getSigner(STK_CVXCRV_HOLDER);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });

        token = await ethers.getContractAt("MockERC20", STAKED_CVXCRV, holder);
      });

      it("should revert when deposit zero amount", async () => {
        await expect(acrv_v2.connect(holder).depositWithWrapper(holder.address, 0)).to.reverted;
      });

      it("should succeed, when deposit some amount", async () => {
        const amount = ethers.utils.parseUnits("1000", 18);
        await token.approve(acrv_v2.address, amount);

        const minShare = amount.mul(await acrv_v2.totalSupply()).div(await acrv_v2.totalUnderlying());
        const shareBefore = await acrv_v2.balanceOf(holder.address);
        const strategyBalanceBefore = await wrapper.balanceOf(strategy.address);
        await acrv_v2.connect(holder).depositWithWrapper(holder.address, amount);
        const shareAfter = await acrv_v2.balanceOf(holder.address);
        const strategyBalanceAfter = await wrapper.balanceOf(strategy.address);
        expect(shareAfter.sub(shareBefore)).to.gte(minShare);
        expect(strategyBalanceAfter.sub(strategyBalanceBefore)).eq(amount);
      });

      it("should succeed, when deposit all amount", async () => {
        const amount = await token.balanceOf(holder.address);
        await token.approve(acrv_v2.address, amount);

        const minShare = amount.mul(await acrv_v2.totalSupply()).div(await acrv_v2.totalUnderlying());
        const shareBefore = await acrv_v2.balanceOf(holder.address);
        const strategyBalanceBefore = await wrapper.balanceOf(strategy.address);
        await acrv_v2.connect(holder).depositWithWrapper(holder.address, constants.MaxUint256);
        const shareAfter = await acrv_v2.balanceOf(holder.address);
        const strategyBalanceAfter = await wrapper.balanceOf(strategy.address);
        expect(shareAfter.sub(shareBefore)).to.gte(minShare);
        expect(strategyBalanceAfter.sub(strategyBalanceBefore)).eq(amount);
      });
    });

    context("withdraw", async () => {
      let holder: SignerWithAddress;
      let token: MockERC20;

      beforeEach(async () => {
        holder = await ethers.getSigner(CVXCRV_HOLDER);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });

        token = await ethers.getContractAt("MockERC20", TOKENS.cvxCRV.address, holder);

        const amount = ethers.utils.parseUnits("1000", 18);
        await token.approve(acrv_v2.address, amount);
        await acrv_v2.connect(holder)["deposit(address,uint256)"](holder.address, amount);
      });

      it("should revert, when withdraw zero shares", async () => {
        await expect(acrv_v2.connect(holder)["withdraw(address,uint256,uint256,uint8)"](deployer.address, 0, 0, 0)).to
          .reverted;
      });

      it("should succeed, when withdraw some share", async () => {
        const share = ethers.utils.parseUnits("100", 18);

        const balanceBefore = await token.balanceOf(deployer.address);
        const shareBefore = await acrv_v2.balanceOf(holder.address);
        await acrv_v2.connect(holder)["withdraw(address,uint256,uint256,uint8)"](deployer.address, share, 0, 0);
        const balanceAfter = await token.balanceOf(deployer.address);
        const shareAfter = await acrv_v2.balanceOf(holder.address);

        expect(shareBefore.sub(shareAfter)).to.eq(share);
        expect(balanceAfter.sub(balanceBefore)).to.gt(constants.Zero);
      });

      it("should succeed, when withdraw some share and stake for", async () => {
        const share = ethers.utils.parseUnits("100", 18);

        const balanceBefore = await wrapper.balanceOf(deployer.address);
        const shareBefore = await acrv_v2.balanceOf(holder.address);
        await acrv_v2.connect(holder)["withdraw(address,uint256,uint256,uint8)"](deployer.address, share, 0, 1);
        const balanceAfter = await wrapper.balanceOf(deployer.address);
        const shareAfter = await acrv_v2.balanceOf(holder.address);

        expect(shareBefore.sub(shareAfter)).to.eq(share);
        expect(balanceAfter.sub(balanceBefore)).to.gt(constants.Zero);
      });

      it("should succeed, when withdraw some share and swap to CRV", async () => {
        const share = ethers.utils.parseUnits("100", 18);
        const crv = await ethers.getContractAt("MockERC20", TOKENS.CRV.address, deployer);

        const balanceBefore = await crv.balanceOf(deployer.address);
        const shareBefore = await acrv_v2.balanceOf(holder.address);
        await acrv_v2.connect(holder)["withdraw(address,uint256,uint256,uint8)"](deployer.address, share, 0, 2);
        const balanceAfter = await crv.balanceOf(deployer.address);
        const shareAfter = await acrv_v2.balanceOf(holder.address);

        expect(shareBefore.sub(shareAfter)).to.eq(share);
        expect(balanceAfter.sub(balanceBefore)).to.gt(constants.Zero);
      });

      it("should succeed, when withdraw some share and swap to CVX", async () => {
        const share = ethers.utils.parseUnits("100", 18);
        const cvx = await ethers.getContractAt("MockERC20", TOKENS.CVX.address, deployer);

        const balanceBefore = await cvx.balanceOf(deployer.address);
        const shareBefore = await acrv_v2.balanceOf(holder.address);
        await acrv_v2.connect(holder)["withdraw(address,uint256,uint256,uint8)"](deployer.address, share, 0, 3);
        const balanceAfter = await cvx.balanceOf(deployer.address);
        const shareAfter = await acrv_v2.balanceOf(holder.address);

        expect(shareBefore.sub(shareAfter)).to.eq(share);
        expect(balanceAfter.sub(balanceBefore)).to.gt(constants.Zero);
      });

      it("should succeed, when withdraw some share and swap to ETH", async () => {
        const share = ethers.utils.parseUnits("100", 18);

        const balanceBefore = await deployer.getBalance();
        const shareBefore = await acrv_v2.balanceOf(holder.address);
        await acrv_v2.connect(holder)["withdraw(address,uint256,uint256,uint8)"](deployer.address, share, 0, 4);
        const balanceAfter = await deployer.getBalance();
        const shareAfter = await acrv_v2.balanceOf(holder.address);

        expect(shareBefore.sub(shareAfter)).to.eq(share);
        expect(balanceAfter.sub(balanceBefore)).to.gt(constants.Zero);
      });
    });

    for (const weight of [0, 0.5, 1]) {
      context(`harvest with weight[${weight}]`, async () => {
        beforeEach(async () => {
          await strategy.setRewardWeight(Math.floor(weight * 10000));

          await booster.earmarkFees();
          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          // make sure 7 days passed, then the rewards will not increase anymore.
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await network.provider.send("evm_mine");
        });

        it("should succeed", async () => {
          const harvested = await acrv_v2.callStatic.harvest(deployer.address, 0);
          expect(harvested).to.gt(constants.Zero);

          const strategyBefore = await wrapper.balanceOf(strategy.address);
          const bountyBefore = await acrv_v2.balanceOf(deployer.address);
          const platformBefore = await acrv_v2.balanceOf(await acrv_v2.platform());
          await acrv_v2.harvest(deployer.address, harvested);
          const strategyAfter = await wrapper.balanceOf(strategy.address);
          const bountyAfter = await acrv_v2.balanceOf(deployer.address);
          const platformAfter = await acrv_v2.balanceOf(await acrv_v2.platform());

          expect(strategyAfter.sub(strategyBefore)).to.eq(harvested);
          expect(bountyAfter.sub(bountyBefore)).to.gt(constants.Zero);
          expect(platformAfter.sub(platformBefore)).to.gt(constants.Zero);
          expect(platformAfter.sub(platformBefore)).to.closeToBn(bountyAfter.sub(bountyBefore).mul(5), 100);
          expect(await acrv_v2.convertToAssets(platformAfter.sub(platformBefore))).to.closeToBn(
            harvested.mul(await acrv_v2.platformFeePercentage()).div(1e9),
            100
          );
          expect(await acrv_v2.convertToAssets(bountyAfter.sub(bountyBefore))).to.closeToBn(
            harvested.mul(await acrv_v2.harvestBountyPercentage()).div(1e9),
            100
          );
          console.log("weight:", weight, "harvested:", ethers.utils.formatUnits(harvested, 18));
        });
      });
    }
  });
});

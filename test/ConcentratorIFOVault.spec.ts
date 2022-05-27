/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { ADDRESS } from "../scripts/config";
import {
  AladdinConvexVault,
  CLeverToken,
  ConcentratorIFOVault,
  IConvexBooster,
  LiquidityMiningRewarder,
} from "../typechain";
import { ConcentratorFeeDistributor } from "../typechain/ConcentratorFeeDistributor";
import { ConcentratorGaugeController } from "../typechain/ConcentratorGaugeController";
import { ConcentratorLiquidityGauge } from "../typechain/ConcentratorLiquidityGauge";
import { CONT } from "../typechain/CONT";
import { CONTMinter } from "../typechain/CONTMinter";
import { VeCONT } from "../typechain/VeCONT";
// eslint-disable-next-line camelcase
import { request_fork } from "./utils";

const FORK_BLOCK_NUMBER = 14853058;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const PROXY_ADMIN = "0x12b1326459d72F2Ab081116bf27ca46cD97762A0";
const VAULT = "0xc8fF37F7d057dF1BB9Ad681b53Fa4726f268E0e8";
const CONCENTRATOR_ADMIN = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const ZAP = "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a";
const ACRV = "0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884";

const SRC_PID = 3;
const CURVE_CVXCRV_TOKEN = "0x9D0464996170c6B9e75eED71c68B99dDEDf279e8";
const CURVE_CVXCRV_HOLDER = "0x52Ad87832400485DE7E7dC965D8Ad890f4e82699";

const CRV = ADDRESS.CRV;
const CRV_HOLDER = "0x7a16fF8270133F063aAb6C9977183D9e72835428";
const CVX = ADDRESS.CVX;
const CVX_HOLDER = "0x28C6c06298d514Db089934071355E5743bf21d60";

describe("ConcentratorIFOVault.spec", async () => {
  let deployer: SignerWithAddress;
  let admin: SignerWithAddress;
  let holder: SignerWithAddress;
  let vault: AladdinConvexVault;
  let mockLP: CLeverToken;
  let cont: CONT;
  let ve: VeCONT;
  let distributor: ConcentratorFeeDistributor;
  let minter: CONTMinter;
  let controller: ConcentratorGaugeController;
  let gauge: ConcentratorLiquidityGauge;
  let rewarder: LiquidityMiningRewarder;
  let ifo: ConcentratorIFOVault;
  let booster: IConvexBooster;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CONCENTRATOR_ADMIN, CRV_HOLDER, CVX_HOLDER, CURVE_CVXCRV_HOLDER]);
    deployer = await ethers.getSigner(DEPLOYER);
    admin = await ethers.getSigner(CONCENTRATOR_ADMIN);
    holder = await ethers.getSigner(CURVE_CVXCRV_HOLDER);

    await deployer.sendTransaction({ to: admin.address, value: ethers.utils.parseEther("100") });

    vault = await ethers.getContractAt("AladdinConvexVault", VAULT, admin);

    const proxyAdmin = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN, admin);

    const AladdinConvexVault = await ethers.getContractFactory("AladdinConvexVault", deployer);
    const impl = await AladdinConvexVault.deploy();
    await impl.deployed();

    await proxyAdmin.upgrade(vault.address, impl.address);

    booster = await ethers.getContractAt("IConvexBooster", BOOSTER, deployer);

    const CLeverToken = await ethers.getContractFactory("CLeverToken", deployer);
    mockLP = await CLeverToken.deploy("LP", "LP");
    await mockLP.deployed();

    const CONT = await ethers.getContractFactory("CONT", deployer);
    cont = await CONT.deploy("Concentrator", "CONT", 18);
    await cont.deployed();
    await cont.set_admin(admin.address);

    const veCONT = await ethers.getContractFactory("veCONT", deployer);
    ve = (await veCONT.deploy(cont.address, "Vote Escrowed CONT", "veCONT", "veCONT_1.0.0")) as VeCONT;
    await ve.deployed();

    const ConcentratorGaugeController = await ethers.getContractFactory("ConcentratorGaugeController", deployer);
    controller = await ConcentratorGaugeController.deploy(cont.address, ve.address);
    await controller.deployed();

    const CONTMinter = await ethers.getContractFactory("CONTMinter", deployer);
    minter = await CONTMinter.deploy(cont.address, controller.address);
    await minter.deployed();

    const ConcentratorFeeDistributor = await ethers.getContractFactory("ConcentratorFeeDistributor", deployer);
    distributor = await ConcentratorFeeDistributor.deploy(ve.address, 0, cont.address, deployer.address, admin.address);
    await distributor.deployed();

    const ConcentratorLiquidityGauge = await ethers.getContractFactory("ConcentratorLiquidityGauge", deployer);
    gauge = await ConcentratorLiquidityGauge.deploy(mockLP.address, minter.address, admin.address);
    await gauge.deployed();

    const LiquidityMiningRewarder = await ethers.getContractFactory("LiquidityMiningRewarder", deployer);
    rewarder = await LiquidityMiningRewarder.deploy(cont.address, gauge.address);
    await rewarder.deployed();

    const ConcentratorIFOVault = await ethers.getContractFactory("ConcentratorIFOVault", deployer);
    ifo = await ConcentratorIFOVault.deploy();
    await ifo.initialize(ACRV, ZAP, admin.address);
    await ifo.transferOwnership(admin.address);
  });

  context("migrate cvxcrv", async () => {
    const amount = ethers.utils.parseEther("1000");

    beforeEach(async () => {
      const token = await ethers.getContractAt("IERC20", CURVE_CVXCRV_TOKEN, holder);
      await token.approve(vault.address, amount);

      await vault.connect(holder)["deposit(uint256,uint256)"](SRC_PID, amount);

      await ifo.connect(admin).addPool(41, [CRV, CVX], 30e5, 1e7, 8e7);
    });

    it("should revert when migrator not set", async () => {
      await expect(vault.migrate(SRC_PID, deployer.address, 0)).to.revertedWith("migrator not set");
    });

    it("should take no fee when migrate", async () => {
      const token = await ethers.getContractAt("IERC20", CURVE_CVXCRV_TOKEN, holder);
      await vault.updateMigrator(ifo.address);
      expect(await vault.getUserShare(0, holder.address)).to.eq(constants.Zero);
      await vault.connect(holder).migrate(SRC_PID, deployer.address, 0);
      expect(await vault.getUserShare(0, holder.address)).to.eq(constants.Zero);
      expect(await ifo.getUserShare(0, deployer.address)).to.closeToBn(amount, 10);

      // can withdraw
      await ifo.connect(deployer).withdrawAllAndClaim(0, 0, 0);
      expect(await token.balanceOf(deployer.address)).to.closeToBn(amount, 10);
      expect(await ifo.getUserShare(0, deployer.address)).to.eq(constants.Zero);
    });
  });

  context("Vault Mining", async () => {
    const amount = ethers.utils.parseEther("100000");

    beforeEach(async () => {
      await ifo.connect(admin).updateIFOConfig(rewarder.address, cont.address, 0, 2e9);
      await ifo.connect(admin).addPool(41, [CRV, CVX], 30e5, 1e7, 8e7);

      const token = await ethers.getContractAt("IERC20", CURVE_CVXCRV_TOKEN, holder);
      await token.approve(ifo.address, amount);
      await ifo.connect(holder)["deposit(uint256,uint256)"](0, amount);
    });

    it("should mint CONT on harvest", async () => {
      const acrv = await ethers.getContractAt("AladdinCRV", ACRV, deployer);
      expect(await acrv.balanceOf(ifo.address)).to.eq(constants.Zero);
      const beforePlatformBalance = await acrv.balanceOf(admin.address);
      await cont.connect(admin).set_minter(ifo.address);
      await booster.earmarkRewards(41);
      await ifo.harvest(0, deployer.address, 0);
      const afterPlatformBalance = await acrv.balanceOf(admin.address);

      // mint cont
      const balance = await cont.balanceOf(ifo.address);
      const rewarderBalance = await cont.balanceOf(rewarder.address);
      expect(balance).to.gt(constants.Zero);
      expect(rewarderBalance).to.eq(balance.mul(6).div(100));

      // no aCRV in ifo
      expect(await acrv.balanceOf(ifo.address)).to.eq(constants.Zero);
      // all aCRV transfer to platform
      expect(afterPlatformBalance.sub(beforePlatformBalance)).to.eq(balance);

      // state is correct
      expect(await ifo.pendingCONT(0, holder.address)).to.closeToBn(balance, 1e6);

      // can claim
      await ifo.connect(holder).claimCONT(0, holder.address);
      expect(await cont.balanceOf(holder.address)).to.closeToBn(balance, 1e6);
      expect(await ifo.pendingCONT(0, holder.address)).to.eq(constants.Zero);
    });
  });

  context("Liquidity Mining", async () => {
    const amount = ethers.utils.parseEther("100000");
    const gaugeAmount = ethers.utils.parseEther("100");

    beforeEach(async () => {
      await ifo.connect(admin).updateIFOConfig(rewarder.address, cont.address, 0, 2e9);
      await ifo.connect(admin).addPool(41, [CRV, CVX], 30e5, 1e7, 8e7);

      const token = await ethers.getContractAt("IERC20", CURVE_CVXCRV_TOKEN, holder);
      await token.approve(ifo.address, amount);
      await ifo.connect(holder)["deposit(uint256,uint256)"](0, amount);

      // mint token
      await mockLP.updateMinters([deployer.address], true);
      await mockLP.updateCeiling(deployer.address, ethers.utils.parseEther("10000"));
      await mockLP.mint(deployer.address, gaugeAmount);

      // gauge
      const sigs = "0x00000000000000004e71d92d0000000000000000000000000000000000000000";
      await gauge
        .connect(admin)
        .set_rewards(rewarder.address, sigs, [
          cont.address,
          constants.AddressZero,
          constants.AddressZero,
          constants.AddressZero,
          constants.AddressZero,
          constants.AddressZero,
          constants.AddressZero,
          constants.AddressZero,
        ]);

      // deposit to gauge
      await mockLP.connect(deployer).approve(gauge.address, gaugeAmount);
      await gauge.connect(deployer)["deposit(uint256)"](gaugeAmount);
    });

    it("should mint CONT on harvest", async () => {
      const acrv = await ethers.getContractAt("AladdinCRV", ACRV, deployer);
      expect(await acrv.balanceOf(ifo.address)).to.eq(constants.Zero);
      await cont.connect(admin).set_minter(ifo.address);
      await booster.earmarkRewards(41);
      await ifo.harvest(0, deployer.address, 0);

      // mint cont
      const balance = await cont.balanceOf(ifo.address);
      const rewarderBalance = await cont.balanceOf(rewarder.address);
      expect(balance).to.gt(constants.Zero);
      expect(rewarderBalance).to.eq(balance.mul(6).div(100));

      // gauge checkpoint
      const rewards = await gauge.callStatic.claimable_reward_write(deployer.address, cont.address);
      expect(rewards).to.closeToBn(rewarderBalance, 100);

      // claim
      const before = await cont.balanceOf(deployer.address);
      await gauge.claimable_reward_write(deployer.address, cont.address);
      await gauge.connect(deployer)["claim_rewards(address)"](deployer.address);
      const after = await cont.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(rewards);
    });
  });
});

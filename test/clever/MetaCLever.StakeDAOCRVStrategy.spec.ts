/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import { CLeverGateway, CLeverToken, MetaCLever, MetaFurnace, MockERC20, StakeDAOCRVVault } from "../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../utils";
import { ADDRESS, DEPLOYED_CONTRACTS, TOKENS, ZAP_ROUTES } from "../../scripts/utils";
import { StakeDAOCRVStrategyUpgradeable } from "../../typechain/contracts/clever/strategies/upgradable/StakeDAOCRVStrategyUpgradeable";

const FORK_BLOCK_NUMBER = 16076550;
const WETH = TOKENS.WETH.address;
const WETH_HOLDER = "0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE";
const USDC = TOKENS.USDC.address;
const USDC_HOLDER = "0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE";
const CRV = TOKENS.CRV.address;
const CRV_HOLDER = "0x32d03db62e464c9168e41028ffa6e9a05d8c6451";

const THREE_CRV = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
const SDCRV = "0xD1b5651E55D4CeeD36251c61c50C889B36F6abB5";
const SDCRV_HOLDER = "0x25431341a5800759268a6ac1d3cd91c029d7d9ca";
const SDCRV_GAUGE = "0x7f50786A0b15723D741727882ee99a0BF34e3466";
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const OPERATOR = "0x66c57bF505A85A74609D2C83E94Aabb26d691E1F";

describe("MetaCLever.StakeDAOCRVStrategy.spec", async () => {
  let deployer: SignerWithAddress;

  let strategy: StakeDAOCRVStrategyUpgradeable;
  let clevCRV: CLeverToken;
  let clever: MetaCLever;
  let furnace: MetaFurnace;
  let vault: StakeDAOCRVVault;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [
      DEPLOYED_CONTRACTS.ManagementMultisig,
      DEPLOYER,
      OPERATOR,
      SDCRV_HOLDER,
      WETH_HOLDER,
      USDC_HOLDER,
      CRV_HOLDER,
    ]);
    deployer = await ethers.getSigner(DEPLOYER);

    const CLeverToken = await ethers.getContractFactory("CLeverToken", deployer);
    clevCRV = await CLeverToken.deploy("CLever CRV", "clevCRV");
    await clevCRV.deployed();

    const MetaFurnace = await ethers.getContractFactory("MetaFurnace", deployer);
    furnace = await MetaFurnace.deploy();
    await furnace.deployed();
    await furnace.initialize(CRV, clevCRV.address);

    const MetaCLever = await ethers.getContractFactory("MetaCLever", deployer);
    clever = await MetaCLever.deploy();
    await clever.deployed();
    await clever.initialize(clevCRV.address, furnace.address);

    await furnace.updateWhitelists([clever.address], true);

    const StakeDAOLockerProxy = await ethers.getContractFactory("StakeDAOLockerProxy", deployer);
    const proxy = await StakeDAOLockerProxy.deploy();
    await proxy.deployed();
    await proxy.initialize();

    const VeSDTDelegation = await ethers.getContractFactory("VeSDTDelegation", deployer);
    const delegation = await VeSDTDelegation.deploy(proxy.address);
    await delegation.initialize(0);

    const StakeDAOCRVVault = await ethers.getContractFactory("StakeDAOCRVVault", deployer);
    vault = await StakeDAOCRVVault.deploy(proxy.address, delegation.address);
    await vault.initialize(SDCRV_GAUGE, 86400 * 30);

    const StakeDAOCRVStrategyUpgradeable = await ethers.getContractFactory("StakeDAOCRVStrategyUpgradeable", deployer);
    strategy = await StakeDAOCRVStrategyUpgradeable.deploy(
      SDCRV,
      CRV,
      clever.address,
      DEPLOYED_CONTRACTS.AladdinZap,
      vault.address
    );
    await strategy.deployed();
    await strategy.initialize();

    await proxy.updateOperator(SDCRV_GAUGE, vault.address);
    await proxy.updateClaimer(vault.address);

    await clever.addYieldStrategy(strategy.address, []);
  });

  context("zap with CLeverGateway", async () => {
    let gateway: CLeverGateway;

    beforeEach(async () => {
      const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
      const logic = await TokenZapLogic.deploy();
      await logic.deployed();

      const CLeverGateway = await ethers.getContractFactory("CLeverGateway", deployer);
      gateway = await CLeverGateway.deploy(logic.address);
      await gateway.deployed();
    });

    it("should succeed, when deposit with sdCRV", async () => {
      const amountIn = ethers.utils.parseUnits("100", TOKENS.sdCRV.decimals);
      const sharesOut = ethers.utils.parseUnits("100", 18);
      const holder = await ethers.getSigner(SDCRV_HOLDER);
      await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });
      const token = await ethers.getContractAt("IERC20", SDCRV, holder);

      await token.connect(holder).approve(clever.address, amountIn);
      await clever.connect(holder).deposit(0, holder.address, amountIn, 0, false);
      expect((await clever.getUserStrategyInfo(holder.address, 0))._share).to.eq(sharesOut);
    });

    it("should succeed, when deposit with CRV", async () => {
      const amountIn = ethers.utils.parseUnits("100", TOKENS.CRV.decimals);
      const sharesOut = ethers.utils.parseUnits("106.009109782154155937", 18);
      const holder = await ethers.getSigner(CRV_HOLDER);
      await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });
      const token = await ethers.getContractAt("IERC20", CRV, holder);

      await token.connect(holder).approve(clever.address, amountIn);
      await clever.connect(holder).deposit(0, holder.address, amountIn, 0, true);
      expect((await clever.getUserStrategyInfo(holder.address, 0))._share).to.eq(sharesOut);
    });

    it("should succeed, when deposit with USDC", async () => {
      const amountIn = ethers.utils.parseUnits("100", TOKENS.USDC.decimals);
      const sharesOut = ethers.utils.parseUnits("158.736939273352474609", 18);
      const holder = await ethers.getSigner(USDC_HOLDER);
      await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });
      const token = await ethers.getContractAt("IERC20", USDC, holder);

      await token.connect(holder).approve(gateway.address, amountIn);
      await gateway.connect(holder).deposit(clever.address, 0, USDC, amountIn, CRV, ZAP_ROUTES.USDC.CRV, 0);
      expect((await clever.getUserStrategyInfo(holder.address, 0))._share).to.eq(sharesOut);
    });

    it("should succeed, when deposit with WETH", async () => {
      const amountIn = ethers.utils.parseUnits("100", TOKENS.WETH.decimals);
      const sharesOut = ethers.utils.parseUnits("190116.986923334620534183", 18);
      const holder = await ethers.getSigner(WETH_HOLDER);
      await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });
      const token = await ethers.getContractAt("IERC20", WETH, holder);

      await token.connect(holder).approve(gateway.address, amountIn);
      await gateway.connect(holder).deposit(clever.address, 0, WETH, amountIn, CRV, ZAP_ROUTES.WETH.CRV, 0);
      expect((await clever.getUserStrategyInfo(holder.address, 0))._share).to.eq(sharesOut);
    });

    it("should succeed, when deposit with ETH", async () => {
      const amountIn = ethers.utils.parseUnits("100", TOKENS.WETH.decimals);
      const sharesOut = ethers.utils.parseUnits("190116.986923334620534183", 18);
      await gateway
        .connect(deployer)
        .deposit(clever.address, 0, constants.AddressZero, amountIn, CRV, ZAP_ROUTES.WETH.CRV, 0, { value: amountIn });
      expect((await clever.getUserStrategyInfo(deployer.address, 0))._share).to.eq(sharesOut);
    });
  });

  context("withdraw", async () => {
    const depositAmount = ethers.utils.parseEther("100");
    let signer: SignerWithAddress;
    let sdcrv: MockERC20;

    beforeEach(async () => {
      signer = await ethers.getSigner(SDCRV_HOLDER);
      sdcrv = await ethers.getContractAt("MockERC20", SDCRV, signer);
      await sdcrv.approve(clever.address, constants.MaxUint256);
      await clever.connect(signer).deposit(0, signer.address, depositAmount, 0, false);
      await vault.updateFeeInfo(deployer.address, 0, 0, 0, 1e5); // 1% withdraw fee for vault
    });

    it("should succeed, when withdraw 10 to self", async () => {
      await clever.connect(signer).withdraw(0, signer.address, ethers.utils.parseEther("10"), 0, false);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      expect((await strategy.getUserLocks(signer.address))[0].amount).to.eq(ethers.utils.parseEther("9.9"));
      expect((await strategy.getUserLocks(signer.address))[0].expireAt).to.eq(timestamp + 86400 * 30);
    });

    it("should succeed, when withdraw 10 to other", async () => {
      await clever.connect(signer).withdraw(0, deployer.address, ethers.utils.parseEther("10"), 0, false);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      expect((await strategy.getUserLocks(deployer.address))[0].amount).to.eq(ethers.utils.parseEther("9.9"));
      expect((await strategy.getUserLocks(deployer.address))[0].expireAt).to.eq(timestamp + 86400 * 30);
    });

    for (const vaultFeeRate of [0, 1e7, 1e8, 5e7]) {
      it(`should succeed, when withdraw 10 to self with vault_Fee[${vaultFeeRate / 1e7}%]`, async () => {
        await vault.connect(deployer).setWithdrawFeeForUser(strategy.address, vaultFeeRate);
        const amountOut = ethers.utils.parseEther("10").sub(ethers.utils.parseEther("10").mul(vaultFeeRate).div(1e9));
        await clever.connect(signer).withdraw(0, signer.address, ethers.utils.parseEther("10"), 0, false);
        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        expect((await strategy.getUserLocks(signer.address))[0].amount).to.eq(amountOut);
        expect((await strategy.getUserLocks(signer.address))[0].expireAt).to.eq(timestamp + 86400 * 30);
      });
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
      await sdcrv.approve(clever.address, constants.MaxUint256);
      await clever.connect(signer).deposit(0, signer.address, depositAmount, 0, false);
      timestamps = [];
      for (let i = 0; i < 10; i++) {
        await clever.connect(signer).withdraw(0, signer.address, ethers.utils.parseEther("10"), 0, false);
        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        timestamps.push(timestamp);
        if (i < 9) {
          await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400]);
        }
      }
      const lists = await strategy.getUserLocks(signer.address);
      expect(lists.length).to.eq(10);
      for (let i = 0; i < 10; i++) {
        expect(lists[i].amount).to.eq(ethers.utils.parseEther("9.9"));
        expect(lists[i].expireAt).to.eq(timestamps[i] + 86400 * 30);
      }
    });

    it("should revert, when withdraw from others to others", async () => {
      await expect(strategy.connect(deployer).withdrawExpired(signer.address, deployer.address)).to.revertedWith(
        "withdraw from others to others"
      );
    });

    it("should succeed, when withdraw expired to self", async () => {
      for (let i = 0; i < 10; i++) {
        await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamps[i] + 86400 * 30]);
        const balanceBefore = await sdcrv.balanceOf(signer.address);
        await expect(strategy.connect(signer).withdrawExpired(signer.address, signer.address))
          .to.emit(strategy, "WithdrawExpired")
          .withArgs(signer.address, signer.address, ethers.utils.parseEther("9.9"));
        const balanceAfter = await sdcrv.balanceOf(signer.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(ethers.utils.parseEther("9.9"));
        const lists = await strategy.getUserLocks(signer.address);
        expect(lists.length).to.eq(9 - i);
      }
    });

    it("should succeed, when with expired to others", async () => {
      for (let i = 0; i < 10; i++) {
        await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamps[i] + 86400 * 30]);
        const balanceBefore = await sdcrv.balanceOf(deployer.address);
        await expect(strategy.connect(signer).withdrawExpired(signer.address, deployer.address))
          .to.emit(strategy, "WithdrawExpired")
          .withArgs(signer.address, deployer.address, ethers.utils.parseEther("9.9"));
        const balanceAfter = await sdcrv.balanceOf(deployer.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(ethers.utils.parseEther("9.9"));
        const lists = await strategy.getUserLocks(signer.address);
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
      await sdcrv.approve(clever.address, constants.MaxUint256);
      await clever.connect(signer).deposit(0, signer.address, depositAmount, 0, false);
      // vault config: 20% platform, 10% bounty, 20% boost
      await vault.updateFeeInfo(deployer.address, 2e6, 1e6, 2e6, 0);

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

      const crv = await ethers.getContractAt("MockERC20", CRV, deployer);

      const crv_before = await crv.balanceOf(furnace.address);
      await clever.harvest(0, deployer.address, 0);
      const crv_after = await crv.balanceOf(furnace.address);
      const crv_harvest = crv_after.sub(crv_before);
      expect(crv_harvest).gt(constants.Zero);
    });
  });
});

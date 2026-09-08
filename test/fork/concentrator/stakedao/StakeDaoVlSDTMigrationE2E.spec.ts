/* eslint-disable camelcase */
/**
 * End-to-end fork rehearsal for the StakeDAO veSDT -> vlSDT + sPENDLE migration
 * (branch `feat/stakedao-migration`, PR #273).
 *
 * This replays, against a real mainnet fork, the exact multisig batch described in:
 *   - Notion "StakeDAO-Migration-Runbook"            (PM runbook, R1/R6/R9 fixes)
 *   - Notion "StakeDAO-Mainnet-Deploy-Verification"   (23-address deploy list + §4 MAIN batch)
 *   - Notion "StakeDAO vlSDT 迁移 — 测试用例库"          (TC-F##/TC-M## test case catalogue)
 *   - Notion "Concentrator - StakeDAO vlSDT 测试执行记录" (QA execution log, found TC-M02/TC-M05)
 *
 * All addresses below are the REAL, already-deployed mainnet contracts (verified independently
 * via eth_call against a public RPC before writing this file - see chat history). Nothing here
 * is freshly deployed; we impersonate the real multisigs and drive the real proxies/impls.
 *
 * IMPORTANT: as of writing, none of this has executed on mainnet yet - `wrapper.delegation()`
 * still resolves to the OLD VeSDTDelegation and `compounder.strategy()` still resolves to the
 * OLD SdPendleGaugeStrategy. This spec is the rehearsal that should be run before the real
 * Safe batches are signed.
 *
 * Run with (needs an archive-capable mainnet RPC in HARDHAT_FORK_URL):
 *   HARDHAT_FORK_URL=<mainnet RPC> npx hardhat test test/fork/concentrator/stakedao/StakeDaoVlSDTMigrationE2E.spec.ts
 */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { id, MaxUint256, ZeroAddress, ZeroHash } from "ethers";
import { ethers, network } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import {
  ConverterRegistry,
  EmergencyConverter,
  MockERC20,
  ProxyAdmin,
  SdCRVBribeBurnerV2,
  SdPendleBribeBurner,
  SdPendleCompounder,
  SdPendleGaugeStrategy,
  VlSDTDelegation,
} from "@/types/index";
import { TOKENS } from "@/utils/index";

// ==========================================================================================
// Fork parameters
// ==========================================================================================
const FORK_BLOCK_NUMBER = 25570000; // recent mainnet block, well after all new contracts were deployed
const WEEK = 86400 * 7;
const DAY = 86400;

// ==========================================================================================
// Real mainnet addresses (cross-checked against deployments/mainnet/*.json + on-chain eth_call)
// ==========================================================================================

// roles / multisigs
const MAIN_MULTISIG = "0xA0FB1b11ccA5871fb0225B64308e249B97804E99"; // deployments/mainnet/Multisig.json: Concentrator
const ADMIN_MULTISIG = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F"; // Multisig.json: AladdinDAO, owns ConverterRegistry
const KEEPER = "0x24f043419850db81d2d7cda72fe9044eacbc5b3d";
const HARVESTER = "0xfa86aa141e45da5183B42792d99Dede3D26Ec515"; // Gateway.json: ConcentratorHarvester (diamond)

// shared infra (unchanged by this migration)
const PROXY_ADMIN = "0x12b1326459d72F2Ab081116bf27ca46cD97762A0"; // ProxyAdmin.json: Concentrator
const CONVERTER_REGISTRY = "0x997B6F43c1c1e8630d03B8E3C11B60E98A1beA90";
const GENERAL_CONVERTER = "0x11C907b3aeDbD863e551c37f21DD3F36b28A6784";
const STAKEDAO_LOCKER = "0x1c0D72a330F2768dAF718DEf8A19BAb019EEAd09";
const SDPENDLE_GAUGE = "0x50DC9aE51f78C593d4138263da7088A973b8184E";
const CTR = TOKENS.CTR.address;
const VECTR = "0xe4C09928d834cd58D233CD77B5af3545484B4968"; // Concentrator.Governance.json: veCTR
const SMART_WALLET_WHITELIST = "0x3557bD058D674DD0981a3FF10515432159F63318";

// sdCRV / vlSDT side
const WRAPPER_PROXY = "0x09B0E3A114135F528F762DB8363b4f5eae3F3bF1";
const OLD_CRV_BURNER = "0x680f26dbc8Fa2B463607ebb49A68A69c33476665";
const NEW_WRAPPER_IMPL = "0xc25118D62046EFfBc3bcAC495cfCa2c08CbD0f08"; // CRV-0, delegation immutable -> new vlSDT
const NEW_CRV_BURNER = "0xC56ec704c18dba3CDE4bf5A5c898E089DDAc5E27"; // SdCRVBribeBurnerV2, delegator -> new vlSDT
const NEW_VLSDT = "0x322c76e1205dE5ee4146e40644563B482B1CDA43"; // VlSDTDelegation proxy
const OLD_VESDT_DELEGATION = "0x6037Bb1BBa598bf88D816cAD90A28cC00fE3ff64"; // kept, untouched, historical claim only
const VLBOOST = "0xaB05ca46d1c78CAbB051efFE35099714Cad2AddA"; // StakeDAO's new vlBoost contract

// sdPENDLE side
const COMPOUNDER_PROXY = "0x606462126E4Bd5c4D153Fe09967e4C46C9c7FeCf";
const NEW_COMPOUNDER_IMPL = "0x8D985f7842A5e347CB668377e88B9fF659259D34"; // adds migrateStrategyV2
const NEW_PENDLE_BURNER = "0x15248cC4Ef7EdCB1B651037Db36DA710847A63cb"; // SdPendleBribeBurner, delegator -> new vlSDT
const NEW_PENDLE_STRATEGY = "0x6402258efa299F9fE8b50c8A6ce3F6E9f492347a"; // handles sPENDLE cooldown
const NEW_PENDLE_STASH = "0x32c9C5fa9f38475626bc9Bc115cC6363188F78A1"; // auto-created by new strategy's constructor
const OLD_PENDLE_STRATEGY = "0x94992Da38bE9aDADD359c2959588FdDFa2dFE5Cd";
const OLD_PENDLE_STASH = "0xC20eA03Db6aE7b465B5BEa4Ecb8453aB0AF37197"; // where the stuck sPENDLE currently sits
const EMERGENCY_CONVERTER = "0x9677f8Cc01226060C61733741E50Bb1B251561Cb";
const SPENDLE = "0x999999999991E178D52Cd95AFd4b00d066664144";

// a real, already-migrated vlSDT user used by QA in their own fork runs (8,100.7 vlSDT holder)
const TEST_VLSDT_USER = "0x3f43a33be58a84bfca084d25328af4ae41678620";

// a real SDT whale (holds ~99.9k SDT as of the fork block above) used to simulate booster-fee
// income landing in VlSDTDelegation, without needing a real bribe-burn swap route.
const SDT_HOLDER = "0x25431341A5800759268a6aC1d3CD91C029D7d9CA";

// sPENDLE -> WETH temporary passthrough route registered in E1, cleared in E2 (from the runbook)
const SPENDLE_WETH_PASSTHROUGH_ROUTE = 897946605976065710371576166102758732145457482764303n;

// roles
const WHITELIST_BURNER_ROLE = id("WHITELIST_BURNER_ROLE");
const REWARD_DEPOSITOR_ROLE = id("REWARD_DEPOSITOR_ROLE");
const REWARD_MANAGER_ROLE = id("REWARD_MANAGER_ROLE");
const DEFAULT_ADMIN_ROLE = ZeroHash;

// minimal hand-written ABIs for external (non-Aladdin) contracts not in our typechain set
const VECTR_ABI = [
  "function create_lock(uint256 value, uint256 unlock_time) external",
  "function locked__end(address addr) view returns (uint256)",
  "function balanceOf(address addr) view returns (uint256)",
];
const SMART_WALLET_WHITELIST_ABI = [
  "function approveWallet(address wallet) external",
  "function check(address wallet) view returns (bool)",
];
const VLBOOST_ABI = [
  "function setOperator(address operator, bool status) external",
  "function isOperator(address account, address operator) view returns (bool)",
  "function receivedTotal(address account) view returns (uint256)",
  "function delegableBalance(address account) view returns (uint256)",
];
const HARVESTER_ABI = ["function harvestConcentratorCompounder(address compounder, uint256 minAssets) external"];

describe("StakeDAO vlSDT migration - full multisig rehearsal (fork)", async () => {
  let mainMultisig: HardhatEthersSigner;
  let adminMultisig: HardhatEthersSigner;
  let keeper: HardhatEthersSigner;
  let harvesterCaller: HardhatEthersSigner;

  let wrapper: any; // ConcentratorSdCrvGaugeWrapper via typechain, fetched by name below
  let newCrvBurner: SdCRVBribeBurnerV2;
  let oldPendleStrategy: SdPendleGaugeStrategy;
  let newPendleStrategy: SdPendleGaugeStrategy;
  let compounder: SdPendleCompounder;
  let newPendleBurner: SdPendleBribeBurner;
  let registry: ConverterRegistry;
  let proxyAdmin: ProxyAdmin;
  let emergencyConverter: EmergencyConverter;
  let vlsdt: VlSDTDelegation;
  let sPendle: MockERC20;
  let sdt: MockERC20;

  let harvester: any;
  let vectr: any;
  let smartWalletWhitelist: any;
  let vlBoost: any;

  before(async () => {
    await request_fork(FORK_BLOCK_NUMBER, [
      MAIN_MULTISIG,
      ADMIN_MULTISIG,
      KEEPER,
      HARVESTER,
      TEST_VLSDT_USER,
      SDT_HOLDER,
    ]);

    mainMultisig = await ethers.getSigner(MAIN_MULTISIG);
    adminMultisig = await ethers.getSigner(ADMIN_MULTISIG);
    keeper = await ethers.getSigner(KEEPER);
    // MAIN-3/9/19 harvest calls are routed through the Harvester diamond; the multisig itself
    // gains permission to call it in MAIN-0..2 (SmartWalletWhitelist + veCTR lock), so we drive
    // it from mainMultisig throughout, exactly as the runbook's MAIN batch does.
    harvesterCaller = mainMultisig;

    await mockETHBalance(MAIN_MULTISIG, ethers.parseEther("10"));
    await mockETHBalance(ADMIN_MULTISIG, ethers.parseEther("10"));
    await mockETHBalance(KEEPER, ethers.parseEther("10"));
    await mockETHBalance(TEST_VLSDT_USER, ethers.parseEther("10"));

    wrapper = await ethers.getContractAt("ConcentratorSdCrvGaugeWrapper", WRAPPER_PROXY, mainMultisig);
    newCrvBurner = await ethers.getContractAt("SdCRVBribeBurnerV2", NEW_CRV_BURNER, mainMultisig);
    oldPendleStrategy = await ethers.getContractAt("SdPendleGaugeStrategy", OLD_PENDLE_STRATEGY, mainMultisig);
    newPendleStrategy = await ethers.getContractAt("SdPendleGaugeStrategy", NEW_PENDLE_STRATEGY, mainMultisig);
    compounder = await ethers.getContractAt("SdPendleCompounder", COMPOUNDER_PROXY, mainMultisig);
    newPendleBurner = await ethers.getContractAt("SdPendleBribeBurner", NEW_PENDLE_BURNER, mainMultisig);
    registry = await ethers.getContractAt("ConverterRegistry", CONVERTER_REGISTRY, adminMultisig);
    proxyAdmin = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN, mainMultisig);
    emergencyConverter = await ethers.getContractAt("EmergencyConverter", EMERGENCY_CONVERTER, mainMultisig);
    // NOTE: NEW_VLSDT's TransparentUpgradeableProxy admin is the main multisig itself (not the
    // shared ProxyAdmin contract), so OZ's proxy blocks any call from mainMultisig with
    // "admin cannot fallback to proxy target". Use a neutral signer as the default here and
    // `.connect(user)` for user-specific actions below.
    vlsdt = await ethers.getContractAt("VlSDTDelegation", NEW_VLSDT, keeper);
    sPendle = await ethers.getContractAt("MockERC20", SPENDLE, mainMultisig);
    sdt = await ethers.getContractAt("MockERC20", TOKENS.SDT.address, mainMultisig);

    harvester = new ethers.Contract(HARVESTER, HARVESTER_ABI, harvesterCaller);
    vectr = new ethers.Contract(VECTR, VECTR_ABI, mainMultisig);
    smartWalletWhitelist = new ethers.Contract(SMART_WALLET_WHITELIST, SMART_WALLET_WHITELIST_ABI, mainMultisig);
    vlBoost = new ethers.Contract(VLBOOST, VLBOOST_ABI, mainMultisig);
  });

  // ========================================================================================
  // 0. Baseline: confirm we're really starting from pre-migration mainnet state
  // ========================================================================================
  context("0. baseline (pre-migration)", async () => {
    it("wrapper/compounder should still point at OLD contracts", async () => {
      expect(await wrapper.delegation()).to.eq(OLD_VESDT_DELEGATION);
      expect(await wrapper.converter()).to.eq(OLD_CRV_BURNER);
      expect(await compounder.strategy()).to.eq(OLD_PENDLE_STRATEGY);
    });

    it("all new contracts should already have code deployed on this fork", async () => {
      for (const addr of [
        NEW_VLSDT,
        NEW_WRAPPER_IMPL,
        NEW_CRV_BURNER,
        NEW_COMPOUNDER_IMPL,
        NEW_PENDLE_BURNER,
        NEW_PENDLE_STRATEGY,
        EMERGENCY_CONVERTER,
      ]) {
        expect(await ethers.provider.getCode(addr)).to.not.eq("0x");
      }
    });

    it("mainMultisig should already hold the roles the MAIN batch relies on", async () => {
      expect(await wrapper.hasRole(DEFAULT_ADMIN_ROLE, MAIN_MULTISIG)).to.eq(true);
      expect(await wrapper.hasRole(REWARD_MANAGER_ROLE, MAIN_MULTISIG)).to.eq(true);
      expect(await compounder.hasRole(DEFAULT_ADMIN_ROLE, MAIN_MULTISIG)).to.eq(true);
    });
  });

  // ========================================================================================
  // 1. E1 - temporary sPENDLE -> WETH passthrough route (admin multisig)
  // ========================================================================================
  context("1. E1 (admin multisig)", async () => {
    it("should register the temporary passthrough route", async () => {
      expect(await registry.getRoutes(SPENDLE, TOKENS.WETH.address)).to.deep.eq([]);
      await registry.updateRoute(SPENDLE, TOKENS.WETH.address, [SPENDLE_WETH_PASSTHROUGH_ROUTE]);
      expect(await registry.getRoutes(SPENDLE, TOKENS.WETH.address)).to.deep.eq([SPENDLE_WETH_PASSTHROUGH_ROUTE]);
    });
  });

  // ========================================================================================
  // 2. TC-M02 / TC-M05 regression demo: run the ORIGINAL 20-step MAIN batch (NO fix) first,
  //    prove the exact bug QA found, THEN apply the fix and prove it's gone.
  // ========================================================================================
  context("1a. TC-M12 negative case: no veCTR lock -> harvester entry point must reject", async () => {
    it("should revert with 'insufficient lock amount' for an address with zero veCTR", async () => {
      // independent re-verification of QA's own "anvil 补验" claim, not just trusting the record
      const stranger = await ethers.getImpersonatedSigner("0x1111111111111111111111111111111111111111");
      await mockETHBalance(await stranger.getAddress(), ethers.parseEther("1"));
      await expect(
        harvester.connect(stranger).harvestConcentratorCompounder(COMPOUNDER_PROXY, 0n)
      ).to.be.revertedWith("insufficient lock amount");
    });
  });

  context("2. MAIN batch step 0-6: veCTR lock, normal harvest, wrapper switch (no TC-M02 fix yet)", async () => {
    it("MAIN-0/1/2: approve wallet, lock CTR, gain harvester permission", async () => {
      await smartWalletWhitelist.connect(mainMultisig).approveWallet(MAIN_MULTISIG);
      expect(await smartWalletWhitelist.check(MAIN_MULTISIG)).to.eq(true);

      const ctr = await ethers.getContractAt("MockERC20", CTR, mainMultisig);
      const lockAmount = ethers.parseEther("3000");
      const balance = await ctr.balanceOf(MAIN_MULTISIG);
      if (balance < lockAmount) {
        // fund the multisig with CTR from itself won't work if it doesn't hold enough on this fork;
        // fall back to minting via a known large holder is out of scope here - assert loudly instead
        // of silently no-op'ing, since a real Safe batch would revert the same way.
        expect(balance, "mainMultisig does not hold enough CTR on this fork block to lock 3000 CTR").to.be.gte(
          lockAmount
        );
      }
      await ctr.approve(VECTR, lockAmount);
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      await vectr.create_lock(lockAmount, timestamp + DAY * 365 * 4);
      expect(await vectr.balanceOf(MAIN_MULTISIG)).to.be.gt(0n);
    });

    it("MAIN-3: normal harvest (R9 pre-step) - drains SDT/WETH/etc from old stash before touching sPENDLE", async () => {
      await harvester.harvestConcentratorCompounder(COMPOUNDER_PROXY, 0n);
    });

    it("MAIN-4/5/6: grant burner role, switch converter, upgrade wrapper impl", async () => {
      await newCrvBurner.grantRole(WHITELIST_BURNER_ROLE, KEEPER);
      expect(await newCrvBurner.hasRole(WHITELIST_BURNER_ROLE, KEEPER)).to.eq(true);

      await wrapper.updateConverter(NEW_CRV_BURNER);
      expect(await wrapper.converter()).to.eq(NEW_CRV_BURNER);

      await proxyAdmin.upgrade(WRAPPER_PROXY, NEW_WRAPPER_IMPL);
      expect(await wrapper.delegation()).to.eq(NEW_VLSDT);

      // balances must be untouched by the impl swap (immutable-only change)
      const asdCRV = await ethers.getContractAt("MockERC20", TOKENS.asdCRV.address, mainMultisig);
      expect(await wrapper.totalSupply()).to.be.gt(0n);
      expect(await asdCRV.totalSupply()).to.be.gt(0n);
    });
  });

  context("2a. TC-M02 regression: distributor NOT yet updated -> new burner cannot deposit reward", async () => {
    it("should revert with NotRewardDistributor if we don't fix it (reproduces QA's problem 1)", async () => {
      // wrapper.distributors(sdCRV/CRV) still points at the OLD burner right after step 2, because
      // the runbook's original MAIN batch never called updateRewardDistributor.
      expect(await wrapper.distributors(TOKENS.sdCRV.address)).to.eq(OLD_CRV_BURNER);
      expect(await wrapper.distributors(TOKENS.CRV.address)).to.not.eq(NEW_CRV_BURNER);

      const newBurnerSigner = await ethers.getImpersonatedSigner(NEW_CRV_BURNER);
      await mockETHBalance(NEW_CRV_BURNER, ethers.parseEther("1"));
      const wrapperAsNewBurner = wrapper.connect(newBurnerSigner);
      await expect(wrapperAsNewBurner.depositReward(TOKENS.sdCRV.address, 0n)).to.be.reverted;
    });

    it("TC-M02 fix: updateRewardDistributor for sdCRV and CRV -> new burner can now deposit", async () => {
      await wrapper.updateRewardDistributor(TOKENS.sdCRV.address, NEW_CRV_BURNER);
      await wrapper.updateRewardDistributor(TOKENS.CRV.address, NEW_CRV_BURNER);
      expect(await wrapper.distributors(TOKENS.sdCRV.address)).to.eq(NEW_CRV_BURNER);
      expect(await wrapper.distributors(TOKENS.CRV.address)).to.eq(NEW_CRV_BURNER);

      const newBurnerSigner = await ethers.getImpersonatedSigner(NEW_CRV_BURNER);
      const wrapperAsNewBurner = wrapper.connect(newBurnerSigner);
      await expect(wrapperAsNewBurner.depositReward(TOKENS.sdCRV.address, 0n)).to.not.be.reverted;
    });
  });

  // ========================================================================================
  // 3. sPENDLE rescue - MAIN-7..12, with R9 (normal-harvest-first) and R6 (updateStash-before-sweep)
  //    already respected by construction (see step ordering below).
  // ========================================================================================
  context("3. TC-M03: sPENDLE rescue (R9 + R6)", async () => {
    it("MAIN-7: syncRewardToken (public, registers sPENDLE as a tracked reward on the OLD strategy)", async () => {
      await oldPendleStrategy.connect(keeper).syncRewardToken();
    });

    it("MAIN-8/9: switch to EmergencyConverter and harvest - should NOT revert because step 2's normal harvest already drained the other rewards (R9)", async () => {
      const stuckBefore = await sPendle.balanceOf(OLD_PENDLE_STASH);
      expect(stuckBefore, "expected some stuck sPENDLE in the old stash on this fork").to.be.gt(0n);

      await compounder.updateConverter(EMERGENCY_CONVERTER);
      await expect(harvester.harvestConcentratorCompounder(COMPOUNDER_PROXY, 0n)).to.not.be.reverted;
    });

    it("MAIN-10/11: updateStash BEFORE sweepToken (R6) - sPENDLE lands in the NEW stash, not lost", async () => {
      const stuckInOldStrategy = await sPendle.balanceOf(OLD_PENDLE_STRATEGY);
      expect(stuckInOldStrategy).to.be.gt(0n);

      await oldPendleStrategy.updateStash(NEW_PENDLE_STASH);
      expect(await oldPendleStrategy.stash()).to.eq(NEW_PENDLE_STASH);

      await oldPendleStrategy.sweepToken([SPENDLE]);

      expect(await sPendle.balanceOf(OLD_PENDLE_STRATEGY)).to.eq(0n);
      expect(await sPendle.balanceOf(NEW_PENDLE_STASH)).to.eq(stuckInOldStrategy);
    });

    it("MAIN-12: restore the real GeneralTokenConverter", async () => {
      await compounder.updateConverter(GENERAL_CONVERTER);
      expect(await compounder.converter()).to.eq(GENERAL_CONVERTER);
    });
  });

  // ========================================================================================
  // 4. safe_D equivalent - MAIN-13..19, with TC-M05 regression demo inline
  // ========================================================================================
  context("4. TC-M04: PENDLE strategy/compounder switch", async () => {
    it("MAIN-13/14: locker operator + gauge reward receiver -> new strategy/stash", async () => {
      const locker = await ethers.getContractAt("ConcentratorStakeDAOLocker", STAKEDAO_LOCKER, mainMultisig);
      await locker.updateOperator(SDPENDLE_GAUGE, NEW_PENDLE_STRATEGY);
      expect(await locker.operators(SDPENDLE_GAUGE)).to.eq(NEW_PENDLE_STRATEGY);

      await locker.updateGaugeRewardReceiver(SDPENDLE_GAUGE, NEW_PENDLE_STASH);
      const gauge = await ethers.getContractAt("ICurveGauge", SDPENDLE_GAUGE, mainMultisig);
      expect(await gauge.rewards_receiver(STAKEDAO_LOCKER)).to.eq(NEW_PENDLE_STASH);
    });

    it("MAIN-15/16: upgrade compounder impl + migrateStrategyV2", async () => {
      await proxyAdmin.upgrade(COMPOUNDER_PROXY, NEW_COMPOUNDER_IMPL);
      await compounder.migrateStrategyV2(NEW_PENDLE_STRATEGY);
      expect(await compounder.strategy()).to.eq(NEW_PENDLE_STRATEGY);
    });

    it("MAIN-17: grant WHITELIST_BURNER_ROLE to keeper on the new PENDLE burner", async () => {
      await newPendleBurner.grantRole(WHITELIST_BURNER_ROLE, KEEPER);
      expect(await newPendleBurner.hasRole(WHITELIST_BURNER_ROLE, KEEPER)).to.eq(true);
    });
  });

  context("4a. TC-M05 regression: REWARD_DEPOSITOR_ROLE not yet granted -> new burner cannot deposit", async () => {
    it("should revert if we don't fix it (reproduces QA's problem 1, PENDLE side)", async () => {
      expect(await compounder.hasRole(REWARD_DEPOSITOR_ROLE, NEW_PENDLE_BURNER)).to.eq(false);

      const newBurnerSigner = await ethers.getImpersonatedSigner(NEW_PENDLE_BURNER);
      await mockETHBalance(NEW_PENDLE_BURNER, ethers.parseEther("1"));
      await expect(compounder.connect(newBurnerSigner).depositReward(0n)).to.be.reverted;
    });

    it("TC-M05 fix: grantRole(REWARD_DEPOSITOR_ROLE, newPendleBurner) -> deposit succeeds", async () => {
      await compounder.grantRole(REWARD_DEPOSITOR_ROLE, NEW_PENDLE_BURNER);
      expect(await compounder.hasRole(REWARD_DEPOSITOR_ROLE, NEW_PENDLE_BURNER)).to.eq(true);

      const newBurnerSigner = await ethers.getImpersonatedSigner(NEW_PENDLE_BURNER);
      await expect(compounder.connect(newBurnerSigner).depositReward(0n)).to.not.be.reverted;
    });
  });

  context("4b. finish MAIN batch", async () => {
    it("MAIN-18: updateBribeBurner -> new PENDLE burner", async () => {
      await compounder.updateBribeBurner(NEW_PENDLE_BURNER);
      expect(await compounder.bribeBurner()).to.eq(NEW_PENDLE_BURNER);
    });

    it("MAIN-19: new harvest - initiates the 14-day sPENDLE cooldown", async () => {
      await harvester.harvestConcentratorCompounder(COMPOUNDER_PROXY, 0n);
      // sPENDLE balance should have left the new strategy into a StakeDAO/Pendle cooldown position
      expect(await sPendle.balanceOf(NEW_PENDLE_STRATEGY)).to.eq(0n);
    });
  });

  // ========================================================================================
  // 5. E2 - clear the temporary route (admin multisig)
  // ========================================================================================
  context("5. E2 (admin multisig)", async () => {
    it("should clear the temporary passthrough route", async () => {
      await registry.updateRoute(SPENDLE, TOKENS.WETH.address, []);
      expect(await registry.getRoutes(SPENDLE, TOKENS.WETH.address)).to.deep.eq([]);
    });
  });

  // ========================================================================================
  // 6. TC-M13 sanity - post-MAIN state, cheap subset of the 40-item verify.ts checklist
  // ========================================================================================
  context("6. TC-M13 sanity checks", async () => {
    it("wrapper/compounder should now point at all the NEW contracts", async () => {
      expect(await wrapper.delegation()).to.eq(NEW_VLSDT);
      expect(await wrapper.converter()).to.eq(NEW_CRV_BURNER);
      expect(await compounder.strategy()).to.eq(NEW_PENDLE_STRATEGY);
      expect(await compounder.bribeBurner()).to.eq(NEW_PENDLE_BURNER);
      expect(await compounder.converter()).to.eq(GENERAL_CONVERTER);
    });

    it("burner bytecode should reference the new vlSDT and not the old VeSDTDelegation", async () => {
      for (const addr of [NEW_CRV_BURNER, NEW_PENDLE_BURNER]) {
        const code = (await ethers.provider.getCode(addr)).toLowerCase();
        expect(code).to.include(NEW_VLSDT.slice(2).toLowerCase());
        expect(code).to.not.include(OLD_VESDT_DELEGATION.slice(2).toLowerCase());
      }
    });

    it("old VeSDTDelegation is untouched", async () => {
      expect(await ethers.provider.getCode(OLD_VESDT_DELEGATION)).to.not.eq("0x");
    });
  });

  // ========================================================================================
  // 7. FINALIZE - +14 days, non-multisig harvest finalizes the cooldown
  // ========================================================================================
  context("7. TC-M11 FINALIZE", async () => {
    it("should finalize the cooldown and compound PENDLE -> sdPENDLE after 15 days", async () => {
      const assetsBefore = await compounder.totalAssets();

      await network.provider.send("evm_increaseTime", [DAY * 15]);
      await network.provider.send("evm_mine", []);

      await harvester.harvestConcentratorCompounder(COMPOUNDER_PROXY, 0n);

      const assetsAfter = await compounder.totalAssets();
      expect(assetsAfter).to.be.gt(assetsBefore);
      expect(await sPendle.balanceOf(NEW_PENDLE_STRATEGY)).to.eq(0n);
    });
  });

  // ========================================================================================
  // 8. TC-M09/M10 - vlSDT delegation, booster, and the "commitment must mature" mechanism
  // ========================================================================================
  // amount of SDT deliberately sent to the delegation while totalSupply == 0 (G-08 probe)
  const STUCK_PROBE = ethers.parseEther("500");

  context("8-pre. G-08 probe: SDT arriving while totalSupply == 0", async () => {
    it("delegation has no delegators yet on mainnet; inject booster-fee SDT anyway (simulates a keeper bribe burn racing ahead of the first delegator)", async () => {
      expect(await vlsdt.totalSupply()).to.eq(0n);

      const holder = await ethers.getSigner(SDT_HOLDER);
      await sdt.connect(holder).transfer(NEW_VLSDT, STUCK_PROBE);
      await vlsdt.checkpointReward();
      // the transfer is now accounted into weeklyRewards of weeks where total boost power is 0
      expect(await sdt.balanceOf(NEW_VLSDT)).to.eq(STUCK_PROBE);
    });
  });

  context("8. TC-M09/M10 vlSDT delegation + maturity-gated claim", async () => {
    let user: HardhatEthersSigner;

    before(async () => {
      user = await ethers.getSigner(TEST_VLSDT_USER);
    });

    it("TC-M09: user must setOperator before boost (front-end change §6.2)", async () => {
      await expect(vlsdt.connect(user).boost(MaxUint256, 0, TEST_VLSDT_USER)).to.be.reverted;

      await vlBoost.connect(user).setOperator(NEW_VLSDT, true);
      expect(await vlBoost.isOperator(TEST_VLSDT_USER, NEW_VLSDT)).to.eq(true);
    });

    it("TC-M09: boost delegates vlSDT to the locker and mints delegation share 1:1", async () => {
      const delegable = await vlBoost.delegableBalance(TEST_VLSDT_USER);
      expect(delegable).to.be.gt(0n);

      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      const endtime = timestamp + DAY * 365;

      const receivedBefore = await vlBoost.receivedTotal(STAKEDAO_LOCKER);
      await vlsdt.connect(user).boost(MaxUint256, endtime, TEST_VLSDT_USER);

      expect(await vlBoost.receivedTotal(STAKEDAO_LOCKER)).to.be.gte(receivedBefore + delegable - 1n);
      expect(await vlsdt.balanceOf(TEST_VLSDT_USER)).to.be.closeTo(delegable, delegable / 1000000n);
    });

    it("TC-M10: bribe that arrives in the SAME week as the boost cannot be claimed yet", async () => {
      // Simulate a booster-fee deposit landing in the delegation contract this week, exactly the
      // way SdCRVBribeBurnerV2.burn()/SdPendleBribeBurner.burn() do it: a plain SDT transfer to
      // `delegator`, followed by checkpointReward() reading the balance delta. Using a real SDT
      // whale instead of a fabricated balance keeps this an actually-executable mainnet-fork tx.
      const holder = await ethers.getSigner(SDT_HOLDER);
      const sdtAsHolder = sdt.connect(holder);
      await sdtAsHolder.transfer(NEW_VLSDT, ethers.parseEther("1000"));

      await vlsdt.checkpointReward();
      const claimable = await vlsdt.claim.staticCall(TEST_VLSDT_USER, TEST_VLSDT_USER);
      expect(claimable).to.eq(0n); // boost hasn't matured past a week boundary yet -> nothing claimable
    });

    it("TC-M10: after crossing a week boundary, a fresh bribe pays out the user's share", async () => {
      await network.provider.send("evm_increaseTime", [WEEK + DAY]);
      await network.provider.send("evm_mine", []);

      // a second, post-maturity bribe income
      const holder = await ethers.getSigner(SDT_HOLDER);
      await sdt.connect(holder).transfer(NEW_VLSDT, ethers.parseEther("1000"));
      await vlsdt.checkpointReward();

      await network.provider.send("evm_increaseTime", [WEEK + DAY]);
      await network.provider.send("evm_mine", []);
      await vlsdt.checkpointReward();

      const before = await sdt.balanceOf(TEST_VLSDT_USER);
      await vlsdt.connect(user).claim(TEST_VLSDT_USER, TEST_VLSDT_USER);
      const after = await sdt.balanceOf(TEST_VLSDT_USER);

      // TEST_VLSDT_USER is very likely not the only delegator on real mainnet, so we only assert
      // directional correctness here, not an exact share - see totalSupply-based reasoning below.
      expect(after).to.be.gt(before);
      // eslint-disable-next-line no-console
      console.log(`      claimed ${ethers.formatEther(after - before)} SDT`);
    });
  });

  // ========================================================================================
  // 9. G-08 verdict - SDT that arrived while totalSupply == 0 is stuck FOREVER
  //    (QA execution log "问题 3": they observed 6,895 SDT stuck the same way)
  // ========================================================================================
  context("9. G-08: pre-first-delegator SDT is permanently unrecoverable", async () => {
    it("even after many weeks of checkpoints and claims, the probe SDT never leaves the contract", async () => {
      const user = await ethers.getSigner(TEST_VLSDT_USER);

      // grind forward 6 more weeks with checkpoints, claiming everything claimable each week
      for (let i = 0; i < 6; i++) {
        await network.provider.send("evm_increaseTime", [WEEK]);
        await network.provider.send("evm_mine", []);
        await vlsdt.checkpointReward();
        await vlsdt.connect(user).claim(TEST_VLSDT_USER, TEST_VLSDT_USER);
      }

      // nothing more claimable for the only delegator...
      expect(await vlsdt.claim.staticCall(TEST_VLSDT_USER, TEST_VLSDT_USER)).to.eq(0n);
      // ...yet the pre-delegator probe is still sitting in the contract, unattributable:
      // _claim() only iterates weeks >= the user's boost week, and weeks where
      // historyBoosts[address(0)][week] == 0 are skipped by everyone forever.
      const remaining = await sdt.balanceOf(NEW_VLSDT);
      expect(remaining).to.be.gte(STUCK_PROBE);
      // eslint-disable-next-line no-console
      console.log(
        `      stuck in contract: ${ethers.formatEther(remaining)} SDT (probe was ${ethers.formatEther(
          STUCK_PROBE
        )}) -> launch runbook MUST place "first delegation" before any bribe burn`
      );
    });
  });
});

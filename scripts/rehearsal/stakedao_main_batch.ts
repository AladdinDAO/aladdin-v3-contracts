/* eslint-disable camelcase, no-console */
/**
 * StakeDAO vlSDT migration - MAIN batch generator + gas measurement.
 *
 * Does two things:
 *  1. Generates the 23-tx Safe Transaction Builder JSON (original 20 from the runbook
 *     + TC-M02 x2 + TC-M05 x1 inserted at the correct positions) into
 *     docs/safe-txs/safe_mainnet_main_23tx.json - importable into the Safe UI, and
 *     diffable against the team's own safe_mainnet_main_abi.json.
 *  2. With RUN_FORK=1, resets the hardhat network to a fresh mainnet fork (latest block),
 *     executes E1 (admin multisig) then all 23 MAIN txs (main multisig) in order, and
 *     prints per-tx and total gasUsed - answering "does the atomic batch fit in a block".
 *
 * Usage:
 *   npx hardhat run scripts/rehearsal/stakedao_main_batch.ts --network hardhat            # JSON only
 *   RUN_FORK=1 npx hardhat run scripts/rehearsal/stakedao_main_batch.ts --network hardhat # JSON + gas
 */
import * as fs from "fs";
import * as path from "path";
import { Interface, id } from "ethers";
import { ethers, network } from "hardhat";

// ---------------------------------------------------------------------------------------
// Addresses (see docs/StakeDAO-Migration-Fork-Rehearsal.md for provenance)
// ---------------------------------------------------------------------------------------
const MAIN_MULTISIG = "0xA0FB1b11ccA5871fb0225B64308e249B97804E99";
const ADMIN_MULTISIG = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const KEEPER = "0x24f043419850db81d2d7cda72fe9044eacbc5b3d";
const HARVESTER = "0xfa86aa141e45da5183B42792d99Dede3D26Ec515";
const PROXY_ADMIN = "0x12b1326459d72F2Ab081116bf27ca46cD97762A0";
const CONVERTER_REGISTRY = "0x997B6F43c1c1e8630d03B8E3C11B60E98A1beA90";
const GENERAL_CONVERTER = "0x11C907b3aeDbD863e551c37f21DD3F36b28A6784";
const STAKEDAO_LOCKER = "0x1c0D72a330F2768dAF718DEf8A19BAb019EEAd09";
const SDPENDLE_GAUGE = "0x50DC9aE51f78C593d4138263da7088A973b8184E";
const CTR = "0xb3Ad645dB386D7F6D753B2b9C3F4B853DA6890B8";
const VECTR = "0xe4C09928d834cd58D233CD77B5af3545484B4968";
const SMART_WALLET_WHITELIST = "0x3557bD058D674DD0981a3FF10515432159F63318";

const WRAPPER_PROXY = "0x09B0E3A114135F528F762DB8363b4f5eae3F3bF1";
const NEW_WRAPPER_IMPL = "0xc25118D62046EFfBc3bcAC495cfCa2c08CbD0f08";
const NEW_CRV_BURNER = "0xC56ec704c18dba3CDE4bf5A5c898E089DDAc5E27";
const COMPOUNDER_PROXY = "0x606462126E4Bd5c4D153Fe09967e4C46C9c7FeCf";
const NEW_COMPOUNDER_IMPL = "0x8D985f7842A5e347CB668377e88B9fF659259D34";
const NEW_PENDLE_BURNER = "0x15248cC4Ef7EdCB1B651037Db36DA710847A63cb";
const NEW_PENDLE_STRATEGY = "0x6402258efa299F9fE8b50c8A6ce3F6E9f492347a";
const NEW_PENDLE_STASH = "0x32c9C5fa9f38475626bc9Bc115cC6363188F78A1";
const OLD_PENDLE_STRATEGY = "0x94992Da38bE9aDADD359c2959588FdDFa2dFE5Cd";
const EMERGENCY_CONVERTER = "0x9677f8Cc01226060C61733741E50Bb1B251561Cb";

const SPENDLE = "0x999999999991E178D52Cd95AFd4b00d066664144";
const SDCRV = "0xD1b5651E55D4CeeD36251c61c50C889B36F6abB5";
const CRV = "0xD533a949740bb3306d119CC777fa900bA034cd52";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const WHITELIST_BURNER_ROLE = id("WHITELIST_BURNER_ROLE");
const REWARD_DEPOSITOR_ROLE = id("REWARD_DEPOSITOR_ROLE");
const SPENDLE_WETH_ROUTE = "897946605976065710371576166102758732145457482764303";
const CTR_LOCK_AMOUNT = 3000n * 10n ** 18n;
const CTR_UNLOCK_TIME = 1908878693n; // ~4 years, from the deploy-verification doc MAIN-2

// ---------------------------------------------------------------------------------------
// Minimal interfaces for encoding
// ---------------------------------------------------------------------------------------
const ifaces = {
  whitelist: new Interface(["function approveWallet(address _wallet)"]),
  erc20: new Interface(["function approve(address spender, uint256 amount)"]),
  vectr: new Interface(["function create_lock(uint256 _value, uint256 _unlock_time)"]),
  harvester: new Interface(["function harvestConcentratorCompounder(address _compounder, uint256 _minAssets)"]),
  accessControl: new Interface(["function grantRole(bytes32 role, address account)"]),
  concentratorBase: new Interface(["function updateConverter(address _newConverter)"]),
  proxyAdmin: new Interface(["function upgrade(address proxy, address implementation)"]),
  distributor: new Interface(["function updateRewardDistributor(address _token, address _newDistributor)"]),
  strategy: new Interface([
    "function syncRewardToken()",
    "function updateStash(address _newStash)",
    "function sweepToken(address[] _tokens)",
  ]),
  locker: new Interface([
    "function updateOperator(address _gauge, address _operator)",
    "function updateGaugeRewardReceiver(address _gauge, address _receiver)",
  ]),
  compounder: new Interface([
    "function migrateStrategyV2(address _newStrategy)",
    "function updateBribeBurner(address _newBurner)",
  ]),
  registry: new Interface(["function updateRoute(address _tokenIn, address _tokenOut, uint256[] _route)"]),
};

interface BatchTx {
  label: string;
  to: string;
  data: string;
}

// E1 (admin multisig, separate Safe) - needed before MAIN-9 on the fork run
const E1: BatchTx = {
  label: "E1: ConverterRegistry.updateRoute(sPENDLE, WETH, [passthrough])",
  to: CONVERTER_REGISTRY,
  data: ifaces.registry.encodeFunctionData("updateRoute", [SPENDLE, WETH, [SPENDLE_WETH_ROUTE]]),
};

// MAIN batch: original 20 + 3 patches (positions marked)
const MAIN: BatchTx[] = [
  { label: "00 SmartWalletWhitelist.approveWallet(mainMultisig)", to: SMART_WALLET_WHITELIST, data: ifaces.whitelist.encodeFunctionData("approveWallet", [MAIN_MULTISIG]) },
  { label: "01 CTR.approve(veCTR, 3000e18)", to: CTR, data: ifaces.erc20.encodeFunctionData("approve", [VECTR, CTR_LOCK_AMOUNT]) },
  { label: "02 veCTR.create_lock(3000e18, ~4y)", to: VECTR, data: ifaces.vectr.encodeFunctionData("create_lock", [CTR_LOCK_AMOUNT, CTR_UNLOCK_TIME]) },
  { label: "03 Harvester.harvest(compounder, 0)  [R9 normal harvest]", to: HARVESTER, data: ifaces.harvester.encodeFunctionData("harvestConcentratorCompounder", [COMPOUNDER_PROXY, 0n]) },
  { label: "04 newCrvBurner.grantRole(WHITELIST_BURNER, keeper)", to: NEW_CRV_BURNER, data: ifaces.accessControl.encodeFunctionData("grantRole", [WHITELIST_BURNER_ROLE, KEEPER]) },
  { label: "05 wrapper.updateConverter(newCrvBurner)", to: WRAPPER_PROXY, data: ifaces.concentratorBase.encodeFunctionData("updateConverter", [NEW_CRV_BURNER]) },
  { label: "06 ProxyAdmin.upgrade(wrapper, newWrapperImpl)", to: PROXY_ADMIN, data: ifaces.proxyAdmin.encodeFunctionData("upgrade", [WRAPPER_PROXY, NEW_WRAPPER_IMPL]) },
  { label: "06a wrapper.updateRewardDistributor(sdCRV, newCrvBurner)  [TC-M02]", to: WRAPPER_PROXY, data: ifaces.distributor.encodeFunctionData("updateRewardDistributor", [SDCRV, NEW_CRV_BURNER]) },
  { label: "06b wrapper.updateRewardDistributor(CRV, newCrvBurner)   [TC-M02]", to: WRAPPER_PROXY, data: ifaces.distributor.encodeFunctionData("updateRewardDistributor", [CRV, NEW_CRV_BURNER]) },
  { label: "07 oldStrategy.syncRewardToken()", to: OLD_PENDLE_STRATEGY, data: ifaces.strategy.encodeFunctionData("syncRewardToken") },
  { label: "08 compounder.updateConverter(EmergencyConverter)", to: COMPOUNDER_PROXY, data: ifaces.concentratorBase.encodeFunctionData("updateConverter", [EMERGENCY_CONVERTER]) },
  { label: "09 Harvester.harvest(compounder, 0)  [emergency harvest]", to: HARVESTER, data: ifaces.harvester.encodeFunctionData("harvestConcentratorCompounder", [COMPOUNDER_PROXY, 0n]) },
  { label: "10 oldStrategy.updateStash(newStash)  [R6]", to: OLD_PENDLE_STRATEGY, data: ifaces.strategy.encodeFunctionData("updateStash", [NEW_PENDLE_STASH]) },
  { label: "11 oldStrategy.sweepToken([sPENDLE])", to: OLD_PENDLE_STRATEGY, data: ifaces.strategy.encodeFunctionData("sweepToken", [[SPENDLE]]) },
  { label: "12 compounder.updateConverter(GeneralConverter)", to: COMPOUNDER_PROXY, data: ifaces.concentratorBase.encodeFunctionData("updateConverter", [GENERAL_CONVERTER]) },
  { label: "13 locker.updateOperator(gauge, newStrategy)", to: STAKEDAO_LOCKER, data: ifaces.locker.encodeFunctionData("updateOperator", [SDPENDLE_GAUGE, NEW_PENDLE_STRATEGY]) },
  { label: "14 locker.updateGaugeRewardReceiver(gauge, newStash)", to: STAKEDAO_LOCKER, data: ifaces.locker.encodeFunctionData("updateGaugeRewardReceiver", [SDPENDLE_GAUGE, NEW_PENDLE_STASH]) },
  { label: "15 ProxyAdmin.upgrade(compounder, newCompounderImpl)", to: PROXY_ADMIN, data: ifaces.proxyAdmin.encodeFunctionData("upgrade", [COMPOUNDER_PROXY, NEW_COMPOUNDER_IMPL]) },
  { label: "16 compounder.migrateStrategyV2(newStrategy)", to: COMPOUNDER_PROXY, data: ifaces.compounder.encodeFunctionData("migrateStrategyV2", [NEW_PENDLE_STRATEGY]) },
  { label: "16a compounder.grantRole(REWARD_DEPOSITOR, newPendleBurner)  [TC-M05]", to: COMPOUNDER_PROXY, data: ifaces.accessControl.encodeFunctionData("grantRole", [REWARD_DEPOSITOR_ROLE, NEW_PENDLE_BURNER]) },
  { label: "17 newPendleBurner.grantRole(WHITELIST_BURNER, keeper)", to: NEW_PENDLE_BURNER, data: ifaces.accessControl.encodeFunctionData("grantRole", [WHITELIST_BURNER_ROLE, KEEPER]) },
  { label: "18 compounder.updateBribeBurner(newPendleBurner)", to: COMPOUNDER_PROXY, data: ifaces.compounder.encodeFunctionData("updateBribeBurner", [NEW_PENDLE_BURNER]) },
  { label: "19 Harvester.harvest(compounder, 0)  [start 14d cooldown]", to: HARVESTER, data: ifaces.harvester.encodeFunctionData("harvestConcentratorCompounder", [COMPOUNDER_PROXY, 0n]) },
];

function writeSafeJson() {
  const outDir = path.join(__dirname, "../../docs/safe-txs");
  fs.mkdirSync(outDir, { recursive: true });
  const json = {
    version: "1.0",
    chainId: "1",
    createdAt: Date.now(),
    meta: {
      name: "StakeDAO vlSDT migration - MAIN batch (23 tx, incl. TC-M02/TC-M05 patches)",
      description:
        "Original 20-tx MAIN batch from StakeDAO-Mainnet-Deploy-Verification §4.2, plus updateRewardDistributor(sdCRV/CRV) after the wrapper upgrade and grantRole(REWARD_DEPOSITOR_ROLE) after the compounder upgrade. Executor: main multisig 0xA0FB. Prerequisite: E1 route tx by admin multisig 0xc405.",
      txBuilderVersion: "1.16.5",
    },
    transactions: MAIN.map((tx) => ({
      to: tx.to,
      value: "0",
      data: tx.data,
      contractMethod: null,
      contractInputsValues: null,
    })),
  };
  const file = path.join(outDir, "safe_mainnet_main_23tx.json");
  fs.writeFileSync(file, JSON.stringify(json, null, 2));
  console.log(`Safe Transaction Builder JSON (${MAIN.length} txs) written to ${file}\n`);
  MAIN.forEach((tx, i) => console.log(`  [${String(i).padStart(2, "0")}] ${tx.label}`));
}

async function measureGasOnFork() {
  const forkUrl = process.env.HARDHAT_FORK_URL;
  if (!forkUrl) throw new Error("set HARDHAT_FORK_URL");
  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: forkUrl } }], // no blockNumber -> latest
  });
  for (const addr of [MAIN_MULTISIG, ADMIN_MULTISIG]) {
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [addr] });
    await network.provider.send("hardhat_setBalance", [addr, "0x" + (10n * 10n ** 18n).toString(16)]);
  }
  const main = await ethers.getSigner(MAIN_MULTISIG);
  const admin = await ethers.getSigner(ADMIN_MULTISIG);
  const block = await ethers.provider.getBlock("latest");
  console.log(`\n=== gas measurement on fork of block ${block!.number} ===\n`);

  const r0 = await (await admin.sendTransaction({ to: E1.to, data: E1.data })).wait();
  console.log(`  E1 (admin multisig, separate Safe): ${r0!.gasUsed} gas`);

  let total = 0n;
  for (const tx of MAIN) {
    const receipt = await (await main.sendTransaction({ to: tx.to, data: tx.data })).wait();
    total += receipt!.gasUsed;
    console.log(`  ${receipt!.gasUsed.toString().padStart(9)} gas  ${tx.label}`);
  }
  console.log(`\n  MAIN total (sum of ${MAIN.length} txs): ${total} gas`);
  console.log(`  block gas limit: ${block!.gasLimit}`);
  console.log(`  headroom: ${((Number(total) / Number(block!.gasLimit)) * 100).toFixed(1)}% of block limit`);
  console.log(`  (Safe MultiSend adds roughly ~5-10k overhead per inner tx on top of this sum)`);
}

async function main() {
  writeSafeJson();
  if (process.env.RUN_FORK === "1") await measureGasOnFork();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

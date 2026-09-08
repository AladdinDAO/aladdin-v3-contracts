/* Negative / adversarial scenarios for PR #278, from the current mainnet state. */
import { ethers, network } from "hardhat";

const FORK_URL = process.env.HARDHAT_FORK_URL!;
const FORK_BLOCK = Number(process.env.FORK_BLOCK || 25924517);
const WEEK = 604800;
const LOCKER = "0x96C68D861aDa016Ed98c30C810879F9df7c64154";
const PROXY_ADMIN = "0x1F57286F7a8083fb363d87Bc8b1DCcD685dc87EE";
const ADMIN = "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E";
const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const CVX_REWARD_POOL = "0xCF50b810E57Ac33B91dCF525C6ddd9881B139332";
const CVX_LOCKER = "0x72a19342e8F1838460eBFCCEf09F6585e32db86E";
const ERC20 = ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"];
const CVXLOCK = ["function lockedBalances(address) view returns (uint256 total,uint256 unlockable,uint256 locked,tuple(uint112 amount,uint112 boosted,uint32 unlockTime)[] lockData)"];

async function fork(extra: string[] = []) {
  await network.provider.request({ method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: FORK_URL, blockNumber: FORK_BLOCK } }] });
  for (const a of [ADMIN, KEEPER, ...extra]) {
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [a] });
    await network.provider.send("hardhat_setBalance", [a, "0x56bc75e2d63100000"]);
  }
}
async function upgrade() {
  const admin = await ethers.getSigner(ADMIN);
  const pa = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN, admin);
  const impl = await (await ethers.getContractFactory("CLeverCVXLocker", admin)).deploy();
  await impl.waitForDeployment();
  await (await pa.upgrade(LOCKER, await impl.getAddress())).wait();
}
async function warpTo(epoch: number) {
  const latest = await ethers.provider.getBlock("latest");
  const ts = Math.max(epoch * WEEK + 1, Number(latest!.timestamp) + 1);
  if (Math.floor(ts / WEEK) !== epoch) throw new Error(`cannot reach epoch ${epoch} (now ${Math.floor(Number(latest!.timestamp)/WEEK)})`);
  await network.provider.send("evm_setNextBlockTimestamp", [ts]);
  await network.provider.send("evm_mine");
}
async function locker() { return ethers.getContractAt("CLeverCVXLocker", LOCKER, await ethers.getSigner(KEEPER)); }
function fmt(x: bigint) { return ethers.formatEther(x); }
async function tryProcess(epoch: number) {
  const c = await locker();
  await warpTo(epoch);
  try { const r = await (await c.processUnlockableCVX()).wait(); return { ok: true, gas: String(r!.gasUsed) }; }
  catch (e: any) { return { ok: false, err: (e.shortMessage || e.message).slice(0, 160) }; }
}

async function scenA() {
  console.log("\n=== A: current (pre-upgrade) implementation, processUnlockableCVX() during epoch 2957 ===");
  await fork();
  const r = await tryProcess(2957);
  console.log("  old impl @2957:", r.ok ? `SUCCEEDED gas=${r.gas}` : `reverted -> ${r.err}`);
}

async function scenF() {
  console.log("\n=== F: two calls inside the same epoch (2957, then again in 2957) ===");
  await fork(); await upgrade();
  console.log("  1st:", JSON.stringify(await tryProcess(2957)));
  const c = await locker();
  try { await (await c.processUnlockableCVX()).wait(); console.log("  2nd: SUCCEEDED (unexpected)"); }
  catch (e: any) { console.log("  2nd: reverted ->", (e.shortMessage || e.message).slice(0,160)); }
}

async function scenB() {
  console.log("\n=== B: skip epoch 2957, first call at 2958, then weekly to 2975 ===");
  await fork(); await upgrade();
  for (let e = 2958; e <= 2975; e++) {
    const r = await tryProcess(e);
    if (!r.ok) { console.log(`  epoch ${e}: REVERT -> ${r.err}`); return; }
    console.log(`  epoch ${e}: ok`);
  }
  console.log("  all succeeded");
}

async function scenC() {
  console.log("\n=== C: epoch 2958 with direct CVX balance drained below 3,173 ===");
  await fork(); await upgrade();
  console.log("  2957:", JSON.stringify(await tryProcess(2957)));
  const cvx = new ethers.Contract(CVX, ERC20, await ethers.getSigner(ADMIN));
  // move the locker's liquid CVX out to emulate user withdrawals during the week
  const bal = await cvx.balanceOf(LOCKER);
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [LOCKER] });
  await network.provider.send("hardhat_setBalance", [LOCKER, "0x56bc75e2d63100000"]);
  const asLocker = new ethers.Contract(CVX, ERC20, await ethers.getSigner(LOCKER));
  const keep = ethers.parseEther("3172");
  await (await asLocker.transfer(ADMIN, bal - keep)).wait();
  console.log("  direct balance now:", fmt(await cvx.balanceOf(LOCKER)), "(reward pool still holds", fmt(await new ethers.Contract(CVX_REWARD_POOL, ERC20, await ethers.getSigner(ADMIN)).balanceOf(LOCKER)) + ")");
  console.log("  2958:", JSON.stringify(await tryProcess(2958)));
  // now top up exactly the shortfall and retry
  const c2 = await locker();
  const need = ethers.parseEther("3173") - (await cvx.balanceOf(LOCKER));
  await (await new ethers.Contract(CVX, ERC20, await ethers.getSigner(ADMIN)).transfer(LOCKER, need)).wait();
  try { const r = await (await c2.processUnlockableCVX()).wait(); console.log(`  2958 after topping up ${fmt(need)} CVX: ok gas=${r!.gasUsed}`); }
  catch (e: any) { console.log("  2958 after top-up: reverted ->", (e.shortMessage||e.message).slice(0,160)); }
  const c3 = await locker();
  const lb = await new ethers.Contract(CVX_LOCKER, CVXLOCK, await ethers.getSigner(KEEPER)).lockedBalances(LOCKER);
  const internal = (await c3.totalLockedGlobal()) + (await c3.totalPendingUnlockGlobal());
  console.log("  after top-up run: internal-physical =", fmt(internal - lb[0]), " (a plain 3,173 top-up when not needed would leave a permanent surplus)");
}

const which = process.env.SCEN || "AFBC";
async function main() {
  if (which.includes("A")) await scenA();
  if (which.includes("F")) await scenF();
  if (which.includes("B")) await scenB();
  if (which.includes("C")) await scenC();
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

/* Withdrawal stress + admin-transfer liveness, using real claimants. */
import { ethers, network } from "hardhat";
import * as fs from "fs";
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
const claimants: string[] = JSON.parse(fs.readFileSync("test/fork/clever/pr278/data/claimants.json", "utf8"));
const f = (x: bigint) => ethers.formatEther(x);

async function fork(accts: string[]) {
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: FORK_URL, blockNumber: FORK_BLOCK } }] });
  for (const a of [ADMIN, KEEPER, ...accts]) {
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
async function warp(epoch: number) {
  const latest = await ethers.provider.getBlock("latest");
  const ts = Math.max(epoch * WEEK + 1, Number(latest!.timestamp) + 1);
  await network.provider.send("evm_setNextBlockTimestamp", [ts]);
  await network.provider.send("evm_mine");
}

async function scenD() {
  console.log("=== D: every claimant withdraws immediately, every week, 2957..2975 ===");
  await fork(claimants); await upgrade();
  const keeper = await ethers.getSigner(KEEPER);
  const clever = await ethers.getContractAt("CLeverCVXLocker", LOCKER, keeper);
  const cvx = new ethers.Contract(CVX, ERC20, keeper);
  const pool = new ethers.Contract(CVX_REWARD_POOL, ERC20, keeper);
  const cvxLocker = new ethers.Contract(CVX_LOCKER, CVXLOCK, keeper);
  let calls = 0, fails = 0, total = 0n, rpUsedWeeks: number[] = [];
  for (let epoch = 2957; epoch <= 2975; epoch++) {
    await warp(epoch);
    const rpBefore = await pool.balanceOf(LOCKER);
    try { await (await clever.processUnlockableCVX()).wait(); }
    catch (e: any) { console.log(`  epoch ${epoch}: processUnlockableCVX REVERTED -> ${(e.shortMessage||e.message).slice(0,120)}`); return; }
    const rpAfter = await pool.balanceOf(LOCKER);
    if (rpAfter < rpBefore) { rpUsedWeeks.push(epoch); console.log(`  epoch ${epoch}: relock pulled ${f(rpBefore - rpAfter)} CVX out of the reward pool`); }
    let wk = 0, wkAmt = 0n;
    for (const u of claimants) {
      const c = await ethers.getContractAt("CLeverCVXLocker", LOCKER, await ethers.getSigner(u));
      const info = await c.getUserInfo(u);
      if (info[2] === 0n) continue;
      const before = await cvx.balanceOf(u);
      try { await (await c.withdrawUnlocked()).wait(); const got = (await cvx.balanceOf(u)) - before; wk++; wkAmt += got; calls++; total += got; }
      catch (e: any) { fails++; console.log(`    epoch ${epoch} withdraw FAILED ${u} claim=${f(info[2])}: ${(e.shortMessage||e.message).slice(0,80)}`); }
    }
    const lb = await cvxLocker.lockedBalances(LOCKER);
    const internal = (await clever.totalLockedGlobal()) + (await clever.totalPendingUnlockGlobal());
    console.log(`  epoch ${epoch}: ${wk} withdrawals, ${f(wkAmt)} CVX | unlockedGlobal=${f(await clever.totalUnlockedGlobal())} pool=${f(await clever.totalCVXInPool())} direct=${f(await cvx.balanceOf(LOCKER))} rp=${f(await pool.balanceOf(LOCKER))} | internal-physical=${f(internal - lb[0])}`);
  }
  console.log(`\n  total: ${calls} successful withdrawals, ${fails} failures, ${f(total)} CVX`);
  console.log(`  weeks where the reward-pool withdrawal path was needed: ${rpUsedWeeks.join(", ") || "none"}`);
  const lb = await cvxLocker.lockedBalances(LOCKER);
  const clever2 = await ethers.getContractAt("CLeverCVXLocker", LOCKER, keeper);
  console.log(`  final: unlockedGlobal=${f(await clever2.totalUnlockedGlobal())} pool=${f(await clever2.totalCVXInPool())} internal-physical=${f((await clever2.totalLockedGlobal()) + (await clever2.totalPendingUnlockGlobal()) - lb[0])}`);
}

async function scenE() {
  console.log("\n=== E: one ordinary withdrawal in epoch 2957 zeroes the liquid balance, then epoch 2958 ===");
  const U = "0xf60240e419bb0a3e9d8527e5b045f86dcdd6ce44"; // claimable 15451.17 > direct balance 15410.55
  await fork([U]); await upgrade();
  const keeper = await ethers.getSigner(KEEPER);
  const clever = await ethers.getContractAt("CLeverCVXLocker", LOCKER, keeper);
  const cvx = new ethers.Contract(CVX, ERC20, keeper);
  await warp(2957);
  await (await clever.processUnlockableCVX()).wait();
  console.log(`  after the 2957 call: direct=${f(await cvx.balanceOf(LOCKER))}`);
  const c = await ethers.getContractAt("CLeverCVXLocker", LOCKER, await ethers.getSigner(U));
  const info = await c.getUserInfo(U);
  await (await c.withdrawUnlocked()).wait();
  console.log(`  user ${U} withdrew ${f(info[2])} CVX -> direct=${f(await cvx.balanceOf(LOCKER))}`);
  await warp(2958);
  try { await (await clever.processUnlockableCVX()).wait(); console.log("  2958: SUCCEEDED"); }
  catch (e: any) { console.log(`  2958: REVERTED -> ${(e.shortMessage||e.message).slice(0,120)}`); }
  // exact-shortfall top-up
  const need = ethers.parseEther("3173") - (await cvx.balanceOf(LOCKER));
  await (await new ethers.Contract(CVX, ERC20, await ethers.getSigner(U)).transfer(LOCKER, need)).wait();
  console.log(`  admin tops up exactly ${f(need)} CVX`);
  try { await (await clever.processUnlockableCVX()).wait(); console.log("  2958 retry: SUCCEEDED"); }
  catch (e: any) { console.log(`  2958 retry: REVERTED -> ${(e.shortMessage||e.message).slice(0,120)}`); return; }
  const lb = await new ethers.Contract(CVX_LOCKER, CVXLOCK, keeper).lockedBalances(LOCKER);
  const internal = (await clever.totalLockedGlobal()) + (await clever.totalPendingUnlockGlobal());
  console.log(`  after retry: internal-physical=${f(internal - lb[0])} (netBorrow should be 104074.280927075760550739)`);
}

async function main() {
  const w = process.env.SCEN || "DE";
  if (w.includes("D")) await scenD();
  if (w.includes("E")) await scenE();
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

/* D1: weekly full-withdrawal pressure from epoch 2958 on.  E2: outside top-up carried through to 2975. */
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
let cvx: any, pool: any, cvxLocker: any, clever: any;

async function setup(accts: string[]) {
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: FORK_URL, blockNumber: FORK_BLOCK } }] });
  for (const a of [ADMIN, KEEPER, ...accts]) {
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [a] });
    await network.provider.send("hardhat_setBalance", [a, "0x56bc75e2d63100000"]);
  }
  const admin = await ethers.getSigner(ADMIN), keeper = await ethers.getSigner(KEEPER);
  const pa = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN, admin);
  const impl = await (await ethers.getContractFactory("CLeverCVXLocker", admin)).deploy();
  await impl.waitForDeployment();
  await (await pa.upgrade(LOCKER, await impl.getAddress())).wait();
  cvx = new ethers.Contract(CVX, ERC20, keeper);
  pool = new ethers.Contract(CVX_REWARD_POOL, ERC20, keeper);
  cvxLocker = new ethers.Contract(CVX_LOCKER, CVXLOCK, keeper);
  clever = await ethers.getContractAt("CLeverCVXLocker", LOCKER, keeper);
}
async function warp(epoch: number) {
  const latest = await ethers.provider.getBlock("latest");
  const ts = Math.max(epoch * WEEK + 1, Number(latest!.timestamp) + 1);
  await network.provider.send("evm_setNextBlockTimestamp", [ts]);
  await network.provider.send("evm_mine");
}
async function drift() {
  const lb = await cvxLocker.lockedBalances(LOCKER);
  return (await clever.totalLockedGlobal()) + (await clever.totalPendingUnlockGlobal()) - lb[0];
}

async function scenD1() {
  console.log("=== D1: from epoch 2958 on, every claimant withdraws right after each weekly call ===");
  await setup(claimants);
  let calls = 0, fails = 0, total = 0n; const rpWeeks: string[] = [];
  for (let epoch = 2957; epoch <= 2975; epoch++) {
    await warp(epoch);
    const rpBefore = await pool.balanceOf(LOCKER);
    try { await (await clever.processUnlockableCVX()).wait(); }
    catch (e: any) { console.log(`  epoch ${epoch}: processUnlockableCVX REVERTED -> ${(e.shortMessage||e.message).slice(0,120)}`); return; }
    const rpAfter = await pool.balanceOf(LOCKER);
    if (rpAfter < rpBefore) rpWeeks.push(`${epoch}(${f(rpBefore-rpAfter)})`);
    if (epoch < 2958) { console.log(`  epoch ${epoch}: processed, no withdrawals yet, direct=${f(await cvx.balanceOf(LOCKER))}`); continue; }
    let wk = 0, wkAmt = 0n;
    for (const u of claimants) {
      const c = await ethers.getContractAt("CLeverCVXLocker", LOCKER, await ethers.getSigner(u));
      const info = await c.getUserInfo(u);
      if (info[2] === 0n) continue;
      const before = await cvx.balanceOf(u);
      try { await (await c.withdrawUnlocked()).wait(); const got = (await cvx.balanceOf(u)) - before; wk++; wkAmt += got; calls++; total += got; }
      catch (e: any) { fails++; console.log(`    epoch ${epoch} WITHDRAW FAILED ${u} claim=${f(info[2])}: ${(e.shortMessage||e.message).slice(0,80)}`); }
    }
    console.log(`  epoch ${epoch}: ${wk} withdrawals ${f(wkAmt)} CVX | unlockedGlobal=${f(await clever.totalUnlockedGlobal())} pool=${f(await clever.totalCVXInPool())} direct=${f(await cvx.balanceOf(LOCKER))} rp=${f(await pool.balanceOf(LOCKER))} | internal-physical=${f(await drift())}`);
  }
  console.log(`\n  ${calls} withdrawals ok, ${fails} failed, ${f(total)} CVX total`);
  console.log(`  reward-pool withdrawal fired at: ${rpWeeks.join(", ") || "never"}`);
  console.log(`  final internal-physical = ${f(await drift())}, unlockedGlobal=${f(await clever.totalUnlockedGlobal())}, pool=${f(await clever.totalCVXInPool())}`);
}

async function scenE2() {
  console.log("\n=== E2: liquid balance drained in 2957, outside 3,173 top-up, carried through to 2975 ===");
  const U = "0xf60240e419bb0a3e9d8527e5b045f86dcdd6ce44";
  await setup([U]);
  await warp(2957); await (await clever.processUnlockableCVX()).wait();
  const c = await ethers.getContractAt("CLeverCVXLocker", LOCKER, await ethers.getSigner(U));
  await (await c.withdrawUnlocked()).wait();
  await warp(2958);
  const need = ethers.parseEther("3173") - (await cvx.balanceOf(LOCKER));
  await (await new ethers.Contract(CVX, ERC20, await ethers.getSigner(U)).transfer(LOCKER, need)).wait();
  for (let epoch = 2958; epoch <= 2975; epoch++) {
    if (epoch > 2958) await warp(epoch);
    try { await (await clever.processUnlockableCVX()).wait(); }
    catch (e: any) { console.log(`  epoch ${epoch}: REVERTED -> ${(e.shortMessage||e.message).slice(0,120)}`); return; }
  }
  console.log(`  all calls 2958..2975 succeeded`);
  console.log(`  final internal-physical = ${f(await drift())}  (a clean run ends at 0)`);
  const lb = await cvxLocker.lockedBalances(LOCKER);
  const byEpoch: Record<number,string> = {};
  for (const it of lb[3]) { const e = Number(BigInt(it.unlockTime)/BigInt(WEEK)); byEpoch[e] = f((BigInt(byEpoch[e]?ethers.parseEther(byEpoch[e]):0n) + BigInt(it.amount))); }
  console.log(`  residue 0 tranche (epoch 2992) = ${byEpoch[2992]}  (clean run: 218801.300076976044019010)`);
}
async function main() { const w = process.env.SCEN || "D1E2"; if (w.includes("D1")) await scenD1(); if (w.includes("E2")) await scenE2(); }
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

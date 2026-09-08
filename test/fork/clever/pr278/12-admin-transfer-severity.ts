/* How bad is the epoch-2958 3,173 CVX transfer precondition, really?
   F1: liquid balance drained in 2957, nobody tops up, epoch 2958 lost, run 2959..2975.
   F2: admin funds a flat 3,173 top-up in the same batch as the call; track admin's net CVX and the final per-residue diffs.
   F3: griefer front-runs the batch and drains to 0 first; does the flat 3,173 top-up still carry the call? */
import { ethers, network } from "hardhat";
import * as fs from "fs";
const FORK_URL = process.env.HARDHAT_FORK_URL!;
const FORK_BLOCK = 25924517, WEEK = 604800;
const LOCKER = "0x96C68D861aDa016Ed98c30C810879F9df7c64154";
const PROXY_ADMIN = "0x1F57286F7a8083fb363d87Bc8b1DCcD685dc87EE";
const ADMIN = "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E";
const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const CVX_LOCKER = "0x72a19342e8F1838460eBFCCEf09F6585e32db86E";
const DRAINER = "0xf60240e419bb0a3e9d8527e5b045f86dcdd6ce44"; // claim 15,451.174919 > liquid 15,410.555678854473047879
const ERC20 = ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"];
const CVXLOCK = ["function lockedBalances(address) view returns (uint256 total,uint256 unlockable,uint256 locked,tuple(uint112 amount,uint112 boosted,uint32 unlockTime)[] lockData)"];
const f = (x: bigint) => ethers.formatEther(x);
const positions = JSON.parse(fs.readFileSync("test/fork/clever/pr278/data/mcpositions.json", "utf8")).positions;
let clever: any, cvx: any, cvxLocker: any;

// users' static data -> claimable / residue demand at any epoch (processUnlockableCVX never touches userInfo)
const epochLockedByResidue = new Array(17).fill(0n) as bigint[];
const pendingByEpoch: Record<number, bigint> = {};
let claimNow = 0n;
for (const u of Object.values<any>(positions)) {
  claimNow += BigInt(u.claimable);
  for (const l of u.epochLocked) epochLockedByResidue[l.unlockEpoch % 17] += BigInt(l.amount);
  for (const q of u.pendingUnlocks) pendingByEpoch[q.unlockEpoch] = (pendingByEpoch[q.unlockEpoch] || 0n) + BigInt(q.amount);
}
const claimableAt = (E: number) => { let s = claimNow; for (const [e, v] of Object.entries(pendingByEpoch)) if (Number(e) <= E) s += v; return s; };
const demandAt = (E: number) => { const d = epochLockedByResidue.slice();
  for (const [e, v] of Object.entries(pendingByEpoch)) if (Number(e) > E) d[Number(e) % 17] += v; return d; };

async function setup() {
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: FORK_URL, blockNumber: FORK_BLOCK } }] });
  for (const a of [ADMIN, KEEPER, DRAINER]) {
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [a] });
    await network.provider.send("hardhat_setBalance", [a, "0x56bc75e2d63100000"]);
  }
  const admin = await ethers.getSigner(ADMIN);
  const pa = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN, admin);
  const impl = await (await ethers.getContractFactory("CLeverCVXLocker", admin)).deploy();
  await impl.waitForDeployment();
  await (await pa.upgrade(LOCKER, await impl.getAddress())).wait();
  clever = await ethers.getContractAt("CLeverCVXLocker", LOCKER, await ethers.getSigner(KEEPER));
  cvx = new ethers.Contract(CVX, ERC20, await ethers.getSigner(KEEPER));
  cvxLocker = new ethers.Contract(CVX_LOCKER, CVXLOCK, await ethers.getSigner(KEEPER));
}
async function warp(e: number) {
  const l = await ethers.provider.getBlock("latest");
  const ts = Math.max(e * WEEK + 1, Number(l!.timestamp) + 1);
  await network.provider.send("evm_setNextBlockTimestamp", [ts]); await network.provider.send("evm_mine");
}
async function drainLiquid() {
  const c = await ethers.getContractAt("CLeverCVXLocker", LOCKER, await ethers.getSigner(DRAINER));
  await (await c.withdrawUnlocked()).wait();
}
async function residueReport(E: number, label: string) {
  const lb = await cvxLocker.lockedBalances(LOCKER);
  const phy = new Array(17).fill(0n) as bigint[];
  for (const it of lb[3]) phy[Number(BigInt(it.unlockTime) / BigInt(WEEK)) % 17] += BigInt(it.amount);
  if (lb[1] > 0n) phy[E % 17] += lb[1];
  const d = demandAt(E);
  const bad: string[] = [];
  for (let r = 0; r < 17; r++) if (d[r] !== phy[r]) bad.push(`residue ${r}: ${f(d[r] - phy[r])}`);
  const gU = await clever.totalUnlockedGlobal(), pool = await clever.totalCVXInPool();
  console.log(`  ${label}`);
  console.log(`    totalUnlockedGlobal = ${f(gU)}   用户可提额聚合 = ${f(claimableAt(E))}   差 = ${f(gU - claimableAt(E))}`);
  console.log(`    totalCVXInPool = ${f(pool)}   pool − 用户可提额 = ${f(pool - claimableAt(E))}`);
  console.log(`    内部 − 物理 = ${f((await clever.totalLockedGlobal()) + (await clever.totalPendingUnlockGlobal()) - lb[0])}`);
  console.log(`    residue 差额非零项: ${bad.length ? bad.join("; ") : "无(17 槽全对平)"}`);
}
async function runWeeks(from: number, to: number, skip: number[] = []) {
  for (let e = from; e <= to; e++) {
    await warp(e);
    if (skip.includes(e)) { console.log(`    epoch ${e}: 故意不调用`); continue; }
    try { await (await clever.processUnlockableCVX()).wait(); }
    catch (err: any) { console.log(`    epoch ${e}: REVERT -> ${(err.shortMessage || err.message).slice(0, 110)}`); return false; }
  }
  return true;
}

async function F1() {
  console.log("\n=== F1: 2957 后被提干,整个 epoch 2958 无人补款 -> 漏掉 2958,继续跑 2959..2975 ===");
  await setup();
  await warp(2957); await (await clever.processUnlockableCVX()).wait();
  await drainLiquid();
  console.log(`  提干后直接余额 = ${f(await cvx.balanceOf(LOCKER))}`);
  await warp(2958);
  try { await (await clever.processUnlockableCVX()).wait(); console.log("  epoch 2958 竟然成功了"); }
  catch (e: any) { console.log(`  epoch 2958 回滚 -> ${(e.shortMessage || e.message).slice(0, 90)}`); }
  const ok = await runWeeks(2959, 2975);
  if (ok) await residueReport(2975, "epoch 2975 终局:");
}

async function F2() {
  console.log("\n=== F2: admin 出资,在同一批次里固定补 3,173(未被提干时也照补) ===");
  await setup();
  await warp(2957); await (await clever.processUnlockableCVX()).wait();
  // give ADMIN some CVX to work with, from the drainer's post-withdrawal balance
  await drainLiquid();
  const drainer = new ethers.Contract(CVX, ERC20, await ethers.getSigner(DRAINER));
  await (await drainer.transfer(ADMIN, ethers.parseEther("4000"))).wait();
  const adminBefore = await cvx.balanceOf(ADMIN);
  await warp(2958);
  await (await new ethers.Contract(CVX, ERC20, await ethers.getSigner(ADMIN)).transfer(LOCKER, ethers.parseEther("3173"))).wait();
  await (await clever.processUnlockableCVX()).wait();
  console.log(`  epoch 2958 成功。admin CVX 净变化 = ${f((await cvx.balanceOf(ADMIN)) - adminBefore)}`);
  const ok = await runWeeks(2959, 2975);
  if (ok) await residueReport(2975, "epoch 2975 终局:");
}

async function F3() {
  console.log("\n=== F3: 抢跑者在批次前把直接余额清零,批次里仍固定补 3,173 ===");
  await setup();
  await warp(2957); await (await clever.processUnlockableCVX()).wait();
  const drainer = new ethers.Contract(CVX, ERC20, await ethers.getSigner(DRAINER));
  await drainLiquid();
  await (await drainer.transfer(ADMIN, ethers.parseEther("4000"))).wait();
  await warp(2958);
  console.log(`  抢跑后直接余额 = ${f(await cvx.balanceOf(LOCKER))}`);
  await (await new ethers.Contract(CVX, ERC20, await ethers.getSigner(ADMIN)).transfer(LOCKER, ethers.parseEther("3173"))).wait();
  try { await (await clever.processUnlockableCVX()).wait(); console.log("  epoch 2958 成功(固定 3,173 抵抗住了抢跑)"); }
  catch (e: any) { console.log(`  epoch 2958 回滚 -> ${(e.shortMessage || e.message).slice(0, 90)}`); }
}

async function main() {
  const w = process.env.SCEN || "F1F2F3";
  if (w.includes("F1")) await F1();
  if (w.includes("F2")) await F2();
  if (w.includes("F3")) await F3();
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

/* 报告第 8 节全部负面/活性场景,一律在链上真实部署的 implementation 上重跑。
   不依赖仓库里的合约源码,因此在任何分支都能运行。 */
import { ethers, network } from "hardhat";
import * as fs from "fs";

const FORK_URL = process.env.HARDHAT_FORK_URL || "https://eth-mainnet.public.blastapi.io";
const FORK_BLOCK = Number(process.env.FORK_BLOCK);
const WEEK = 604800;
const NEW_IMPL = "0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534";
const LOCKER = "0x96C68D861aDa016Ed98c30C810879F9df7c64154";
const PROXY_ADMIN = "0x1F57286F7a8083fb363d87Bc8b1DCcD685dc87EE";
const ADMIN = "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E";
const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const CVX_LOCKER = "0x72a19342e8F1838460eBFCCEf09F6585e32db86E";
const DRAINER = "0xf60240e419bb0a3e9d8527e5b045f86dcdd6ce44";
const L_ABI = ["function processUnlockableCVX()","function withdrawUnlocked()","function totalLockedGlobal() view returns (uint256)","function totalPendingUnlockGlobal() view returns (uint256)","function totalUnlockedGlobal() view returns (uint256)","function totalCVXInPool() view returns (uint256)","function pendingUnlocked(uint256) view returns (uint256)","function getUserInfo(address) view returns (uint256,uint256,uint256,uint256,uint256)"];
const PA_ABI = ["function upgrade(address,address)"];
const CVXLOCK_ABI = ["function lockedBalances(address) view returns (uint256 total,uint256 unlockable,uint256 locked,tuple(uint112 amount,uint112 boosted,uint32 unlockTime)[] lockData)"];
const ERC20 = ["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"];
const f = (x: bigint) => ethers.formatEther(x);

// 用户侧数据离线加载(processUnlockableCVX 不动 userInfo,所以离线推算合法)
const pos = JSON.parse(fs.readFileSync("test/fork/clever/pr278/data/mcpositions_latest.json", "utf8")).positions;
const byResidue = new Array(17).fill(0n) as bigint[];
const pendingByEpoch: Record<number, bigint> = {};
let claimNow = 0n;
for (const u of Object.values<any>(pos)) {
  claimNow += BigInt(u.claimable);
  for (const l of u.epochLocked) byResidue[l.unlockEpoch % 17] += BigInt(l.amount);
  for (const q of u.pendingUnlocks) pendingByEpoch[q.unlockEpoch] = (pendingByEpoch[q.unlockEpoch] || 0n) + BigInt(q.amount);
}
const claimableAt = (E: number) => { let s = claimNow; for (const [e, v] of Object.entries(pendingByEpoch)) if (+e <= E) s += v; return s; };
const demandAt = (E: number) => { const d = byResidue.slice(); for (const [e, v] of Object.entries(pendingByEpoch)) if (+e > E) d[+e % 17] += v; return d; };

let clever: any, cvx: any, cl: any;
async function fork(extra: string[] = []) {
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: FORK_URL, blockNumber: FORK_BLOCK } }] });
  for (const a of [ADMIN, KEEPER, ...extra]) {
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [a] });
    await network.provider.send("hardhat_setBalance", [a, "0x56bc75e2d63100000"]);
  }
  const keeper = await ethers.getSigner(KEEPER);
  clever = new ethers.Contract(LOCKER, L_ABI, keeper);
  cvx = new ethers.Contract(CVX, ERC20, keeper);
  cl = new ethers.Contract(CVX_LOCKER, CVXLOCK_ABI, keeper);
}
async function upgrade() {
  await (await new ethers.Contract(PROXY_ADMIN, PA_ABI, await ethers.getSigner(ADMIN)).upgrade(LOCKER, NEW_IMPL)).wait();
}
async function warp(e: number) {
  const l = await ethers.provider.getBlock("latest");
  const ts = Math.max(e * WEEK + 1, Number(l!.timestamp) + 1);
  await network.provider.send("evm_setNextBlockTimestamp", [ts]);
  await network.provider.send("evm_mine");
}
async function call(e: number) {
  await warp(e);
  try { const r = await (await clever.processUnlockableCVX()).wait(); return { ok: true, gas: String(r!.gasUsed) }; }
  catch (err: any) { return { ok: false, err: (err.shortMessage || err.message).slice(0, 120) }; }
}
async function drift() {
  const lb = await cl.lockedBalances(LOCKER);
  return (await clever.totalLockedGlobal()) + (await clever.totalPendingUnlockGlobal()) - lb[0];
}
async function residueBad(E: number) {
  const lb = await cl.lockedBalances(LOCKER);
  const phy = new Array(17).fill(0n) as bigint[];
  for (const it of lb[3]) phy[Number(BigInt(it.unlockTime) / BigInt(WEEK)) % 17] += BigInt(it.amount);
  if (lb[1] > 0n) phy[E % 17] += lb[1];
  const d = demandAt(E); const bad: string[] = [];
  for (let r = 0; r < 17; r++) if (d[r] !== phy[r]) bad.push(`residue ${r}: ${f(d[r] - phy[r])}`);
  return bad;
}
async function drainByWithdraw() {
  const c = new ethers.Contract(LOCKER, L_ABI, await ethers.getSigner(DRAINER));
  const info = await c.getUserInfo(DRAINER);
  await (await c.withdrawUnlocked()).wait();
  return info[2] as bigint;
}

async function A() {
  console.log("\n=== A:升级前的实现在 epoch 2957 调用 ===");
  await fork();
  const r = await call(2957);
  console.log(`  ${r.ok ? "成功(不符预期)" : "回滚 -> " + r.err}`);
}
async function F() {
  console.log("\n=== F:同一 epoch 内第二次调用 ===");
  await fork(); await upgrade();
  console.log("  第 1 次:", JSON.stringify(await call(2957)));
  try { await (await clever.processUnlockableCVX()).wait(); console.log("  第 2 次:成功(不符预期)"); }
  catch (e: any) { console.log("  第 2 次:回滚 ->", (e.shortMessage || e.message).slice(0, 100)); }
}
async function B() {
  console.log("\n=== B:跳过 epoch 2957,从 2958 起逐周执行 ===");
  await fork(); await upgrade();
  for (let e = 2958; e <= 2975; e++) {
    const u = await clever.totalUnlockedGlobal();
    const r = await call(e);
    if (!r.ok) {
      console.log(`  epoch ${e} 回滚 -> ${r.err}`);
      console.log(`    当时 totalUnlockedGlobal      = ${f(u)}`);
      console.log(`    pendingUnlocked[2838](未合并) = ${f(await clever.pendingUnlocked(2838))}`);
      const need = 237756223183328739207623n - (await clever.pendingUnlocked(2838)) - 561911228961951745608n;
      console.log(`    该分支要扣的数额              = ${f(need)}`);
      return;
    }
  }
  console.log("  全部成功(不符预期)");
}
async function H() {
  console.log("\n=== H:2957–2975 全做,只跳过 hardcode 周 2972 ===");
  await fork(); await upgrade();
  for (let e = 2957; e <= 2975; e++) {
    if (e === 2972) { await warp(e); console.log("    epoch 2972:故意不调用"); continue; }
    const r = await call(e);
    if (!r.ok) { console.log(`  epoch ${e} 回滚 -> ${r.err}`); return; }
  }
  const gU = await clever.totalUnlockedGlobal();
  console.log(`  19 次调用零回滚,但终局账目错:`);
  console.log(`    totalUnlockedGlobal = ${f(gU)}`);
  console.log(`    用户可提额聚合       = ${f(claimableAt(2975))}`);
  console.log(`    缺口                 = ${f(claimableAt(2975) - gU)}`);
  console.log(`    内部 − 物理          = ${f(await drift())}`);
}
async function E() {
  console.log("\n=== E:2957 后单笔普通提款清零直接余额,再执行 2958 ===");
  await fork([DRAINER]); await upgrade();
  await call(2957);
  console.log(`  2957 调用后直接余额 = ${f(await cvx.balanceOf(LOCKER))}`);
  const got = await drainByWithdraw();
  console.log(`  ${DRAINER} 提走 ${f(got)} -> 直接余额 = ${f(await cvx.balanceOf(LOCKER))}`);
  const r = await call(2958);
  console.log(`  epoch 2958: ${r.ok ? "成功(不符预期)" : "回滚 -> " + r.err}`);
}
async function F1() {
  console.log("\n=== F1:直接余额被清零且整个 epoch 2958 无人补款,之后逐周执行 ===");
  await fork([DRAINER]); await upgrade();
  await call(2957); await drainByWithdraw();
  const r58 = await call(2958);
  console.log(`  epoch 2958: ${r58.ok ? "成功" : "回滚 -> " + r58.err}`);
  for (let e = 2959; e <= 2975; e++) {
    const r = await call(e);
    if (!r.ok) { console.log(`  epoch ${e} 回滚 -> ${r.err}`); return; }
  }
  console.log("  2959–2975 全部成功(不符预期)");
}
async function F2() {
  console.log("\n=== F2:admin 在批次内固定补 3,173,跑到 2975 ===");
  await fork([DRAINER]); await upgrade();
  await call(2957);
  await drainByWithdraw();
  const drainer = new ethers.Contract(CVX, ERC20, await ethers.getSigner(DRAINER));
  await (await drainer.transfer(ADMIN, ethers.parseEther("4000"))).wait();
  const adminBefore = await cvx.balanceOf(ADMIN);
  await warp(2958);
  await (await new ethers.Contract(CVX, ERC20, await ethers.getSigner(ADMIN)).transfer(LOCKER, ethers.parseEther("3173"))).wait();
  const r = await (await clever.processUnlockableCVX()).wait();
  console.log(`  epoch 2958 成功 gas=${r!.gasUsed};admin CVX 净变化 = ${f((await cvx.balanceOf(ADMIN)) - adminBefore)}`);
  for (let e = 2959; e <= 2975; e++) {
    const rr = await call(e);
    if (!rr.ok) { console.log(`  epoch ${e} 回滚 -> ${rr.err}`); return; }
  }
  console.log(`  2959–2975 全部成功`);
  console.log(`  终局 内部 − 物理 = ${f(await drift())}   (干净路径为 0)`);
  console.log(`  终局 17 槽差额非零项: ${(await residueBad(2975)).join("  |  ") || "无"}`);
}
async function F3() {
  console.log("\n=== F3:抢跑者先清零直接余额,批次内仍固定补 3,173 ===");
  await fork([DRAINER]); await upgrade();
  await call(2957);
  const drainer = new ethers.Contract(CVX, ERC20, await ethers.getSigner(DRAINER));
  await drainByWithdraw();
  await (await drainer.transfer(ADMIN, ethers.parseEther("4000"))).wait();
  await warp(2958);
  console.log(`  抢跑后直接余额 = ${f(await cvx.balanceOf(LOCKER))}`);
  await (await new ethers.Contract(CVX, ERC20, await ethers.getSigner(ADMIN)).transfer(LOCKER, ethers.parseEther("3173"))).wait();
  try { await (await clever.processUnlockableCVX()).wait(); console.log("  epoch 2958 成功(固定 3,173 抵抗住抢跑)"); }
  catch (e: any) { console.log("  epoch 2958 回滚 ->", (e.shortMessage || e.message).slice(0, 100)); }
}

async function main() {
  console.log(`fork 区块 ${FORK_BLOCK};implementation ${NEW_IMPL}`);
  console.log(`该地址字节码 keccak ${ethers.keccak256(await new ethers.JsonRpcProvider(FORK_URL).getCode(NEW_IMPL))}`);
  for (const s of [A, F, B, H, E, F1, F2, F3]) await s();
  console.log("\n全部场景执行完毕");
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

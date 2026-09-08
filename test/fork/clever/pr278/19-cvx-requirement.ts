/* 精确定位「3,173 CVX 必须在哪、必须多少」:
   A 主路径的 epoch 2957 批次是否需要任何 CVX
   B 主路径的 epoch 2958 是否需要 Safe 持有 CVX
   C 阈值:Locker 直接余额恰好 3,173 / 差 1 wei */
import { ethers, network } from "hardhat";
const FORK_URL = process.env.HARDHAT_FORK_URL || "https://eth-mainnet.public.blastapi.io";
const FORK_BLOCK = Number(process.env.FORK_BLOCK);
const WEEK = 604800;
const NEW_IMPL = "0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534";
const LOCKER = "0x96C68D861aDa016Ed98c30C810879F9df7c64154";
const PROXY_ADMIN = "0x1F57286F7a8083fb363d87Bc8b1DCcD685dc87EE";
const SAFE = "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E";
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const DRAINER = "0xf60240e419bb0a3e9d8527e5b045f86dcdd6ce44";
const WHALE = "0x28C6c06298d514Db089934071355E5743bf21d60";
const L = ["function processUnlockableCVX()","function withdrawUnlocked()","function totalUnlockedGlobal() view returns (uint256)","function pendingUnlocked(uint256) view returns (uint256)","function owner() view returns (address)"];
const PA = ["function upgrade(address,address)"];
const E = ["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"];
const f = (x: bigint) => ethers.formatEther(x);

async function setup(extra: string[] = []) {
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: FORK_URL, blockNumber: FORK_BLOCK } }] });
  for (const a of [SAFE, WHALE, DRAINER, ...extra]) {
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [a] });
    await network.provider.send("hardhat_setBalance", [a, "0x56bc75e2d63100000"]);
  }
  await network.provider.send("evm_mine");
}
async function upgrade() { await (await new ethers.Contract(PROXY_ADMIN, PA, await ethers.getSigner(SAFE)).upgrade(LOCKER, NEW_IMPL)).wait(); }
async function warp(e: number) {
  const l = await ethers.provider.getBlock("latest");
  await network.provider.send("evm_setNextBlockTimestamp", [Math.max(e * WEEK + 1, Number(l!.timestamp) + 1)]);
  await network.provider.send("evm_mine");
}
async function call(byKeeper = SAFE) {
  const c = new ethers.Contract(LOCKER, L, await ethers.getSigner(byKeeper));
  try { const r = await (await c.processUnlockableCVX()).wait(); return `成功 gas=${r!.gasUsed}`; }
  catch (e: any) { return `回滚 -> ${(e.shortMessage || e.message).slice(0, 90)}`; }
}

async function A() {
  console.log("=== A:把 Safe 的 CVX 全部转走,再执行 epoch 2957 主路径 ===");
  await setup();
  const cvx = new ethers.Contract(CVX, E, await ethers.getSigner(SAFE));
  const bal = await cvx.balanceOf(SAFE);
  await (await cvx.transfer(WHALE, bal)).wait();
  console.log(`  Safe CVX 余额清为 ${f(await cvx.balanceOf(SAFE))}(原 ${f(bal)})`);
  await upgrade();
  await warp(2957);
  console.log(`  epoch 2957: ${await call()}`);
  console.log(`  → 2957 批次不需要 Safe 持有任何 CVX`);
}

async function B() {
  console.log("\n=== B:Safe 零 CVX,Locker 保持原有余额,执行 2957 + 2958 ===");
  await setup();
  const cvx = new ethers.Contract(CVX, E, await ethers.getSigner(SAFE));
  await (await cvx.transfer(WHALE, await cvx.balanceOf(SAFE))).wait();
  await upgrade();
  await warp(2957); console.log(`  epoch 2957: ${await call()}`);
  const view = new ethers.Contract(CVX, E, ethers.provider);
  console.log(`  Locker 直接余额 = ${f(await view.balanceOf(LOCKER))}   Safe = ${f(await view.balanceOf(SAFE))}`);
  await warp(2958); console.log(`  epoch 2958: ${await call()}`);
  const c = new ethers.Contract(LOCKER, L, ethers.provider);
  console.log(`  owner() 收到 CVX = ${f(await view.balanceOf(await c.owner()))}`);
  console.log(`  → 主路径 2958 只依赖 Locker 自身余额,Safe 可以是 0`);
}

async function C() {
  console.log("\n=== C:阈值 —— Locker 直接余额恰好 3,173 与差 1 wei ===");
  for (const [label, amount] of [["恰好 3,173", ethers.parseEther("3173")], ["3,173 差 1 wei", ethers.parseEther("3173") - 1n]] as [string, bigint][]) {
    await setup();
    const cvx = new ethers.Contract(CVX, E, await ethers.getSigner(SAFE));
    await (await cvx.transfer(WHALE, await cvx.balanceOf(SAFE))).wait();
    await upgrade();
    await warp(2957); await call();
    // 用真实用户提款把直接余额清零,再由大户精确补到目标值
    await (await new ethers.Contract(LOCKER, L, await ethers.getSigner(DRAINER)).withdrawUnlocked()).wait();
    const view = new ethers.Contract(CVX, E, ethers.provider);
    console.log(`  [${label}] 提款后直接余额 = ${f(await view.balanceOf(LOCKER))}`);
    await (await new ethers.Contract(CVX, E, await ethers.getSigner(WHALE)).transfer(LOCKER, amount)).wait();
    console.log(`             补到 ${f(await view.balanceOf(LOCKER))}`);
    await warp(2958);
    console.log(`             epoch 2958: ${await call()}`);
  }
}

async function main() {
  console.log(`fork 区块 ${FORK_BLOCK}\n`);
  await A(); await B(); await C();
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

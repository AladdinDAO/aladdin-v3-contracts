/* G: skip epoch 2957 -> where and why it breaks.  H: skip a hardcode week (2972). */
import { ethers, network } from "hardhat";
const FORK_URL = process.env.HARDHAT_FORK_URL!;
const FORK_BLOCK = 25924517, WEEK = 604800;
const LOCKER = "0x96C68D861aDa016Ed98c30C810879F9df7c64154";
const PROXY_ADMIN = "0x1F57286F7a8083fb363d87Bc8b1DCcD685dc87EE";
const ADMIN = "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E";
const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";
const CVX_LOCKER = "0x72a19342e8F1838460eBFCCEf09F6585e32db86E";
const CVXLOCK = ["function lockedBalances(address) view returns (uint256 total,uint256 unlockable,uint256 locked,tuple(uint112 amount,uint112 boosted,uint32 unlockTime)[] lockData)"];
const f = (x: bigint) => ethers.formatEther(x);
let clever: any, cvxLocker: any;
async function setup() {
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: FORK_URL, blockNumber: FORK_BLOCK } }] });
  for (const a of [ADMIN, KEEPER]) { await network.provider.request({ method: "hardhat_impersonateAccount", params: [a] });
    await network.provider.send("hardhat_setBalance", [a, "0x56bc75e2d63100000"]); }
  const admin = await ethers.getSigner(ADMIN);
  const pa = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN, admin);
  const impl = await (await ethers.getContractFactory("CLeverCVXLocker", admin)).deploy();
  await impl.waitForDeployment();
  await (await pa.upgrade(LOCKER, await impl.getAddress())).wait();
  clever = await ethers.getContractAt("CLeverCVXLocker", LOCKER, await ethers.getSigner(KEEPER));
  cvxLocker = new ethers.Contract(CVX_LOCKER, CVXLOCK, await ethers.getSigner(KEEPER));
}
async function warp(e: number) {
  const l = await ethers.provider.getBlock("latest");
  const ts = Math.max(e * WEEK + 1, Number(l!.timestamp) + 1);
  await network.provider.send("evm_setNextBlockTimestamp", [ts]); await network.provider.send("evm_mine");
}
async function run(epochs: number[], label: string) {
  console.log(`\n=== ${label} ===`);
  for (const e of epochs) {
    await warp(e);
    const uBefore = await clever.totalUnlockedGlobal();
    try { await (await clever.processUnlockableCVX()).wait(); }
    catch (err: any) {
      console.log(`  epoch ${e}: REVERT -> ${(err.shortMessage||err.message).slice(0,110)}`);
      console.log(`    totalUnlockedGlobal at that moment = ${f(uBefore)}`);
      console.log(`    pendingUnlocked[2838] = ${f(await clever.pendingUnlocked(2838))}`);
      if (e === 2974) {
        const D16 = 237756223183328739207623n, D15 = 561911228961951745608n;
        const need = D16 - (await clever.pendingUnlocked(2838)) - D15;
        console.log(`    the 2974 branch tries to subtract DRIFT_MOD_16 - pendingUnlocked[2838] - DRIFT_MOD_15 = ${f(need)}`);
      }
      return;
    }
  }
  const lb = await cvxLocker.lockedBalances(LOCKER);
  console.log(`  all calls ok. unlockedGlobal=${f(await clever.totalUnlockedGlobal())} pendingGlobal=${f(await clever.totalPendingUnlockGlobal())} internal-physical=${f((await clever.totalLockedGlobal()) + (await clever.totalPendingUnlockGlobal()) - lb[0])}`);
}
async function main() {
  await setup();
  const all = [] as number[]; for (let e = 2958; e <= 2975; e++) all.push(e);
  await run(all, "G: skip epoch 2957, run 2958..2975");
  await setup();
  const skip72 = [] as number[]; for (let e = 2957; e <= 2975; e++) if (e !== 2972) skip72.push(e);
  await run(skip72, "H: run 2957..2975 but skip the hardcode week 2972");
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

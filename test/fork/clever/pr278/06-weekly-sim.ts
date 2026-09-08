/* Independent weekly simulation of PR #278 from the CURRENT mainnet state. */
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
const ERC20 = ["function balanceOf(address) view returns (uint256)"];
const CVXLOCK = ["function lockedBalances(address) view returns (uint256 total,uint256 unlockable,uint256 locked,tuple(uint112 amount,uint112 boosted,uint32 unlockTime)[] lockData)"];

async function fork() {
  await network.provider.request({ method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: FORK_URL, blockNumber: FORK_BLOCK } }] });
  for (const a of [ADMIN, KEEPER])
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [a] });
  await network.provider.send("hardhat_setBalance", [ADMIN, "0x56bc75e2d63100000"]);
  await network.provider.send("hardhat_setBalance", [KEEPER, "0x56bc75e2d63100000"]);
}

async function snap(clever: any, cvx: any, pool: any, cvxLocker: any) {
  const lb = await cvxLocker.lockedBalances(LOCKER);
  const byEpoch: Record<number, string> = {};
  for (const it of lb[3]) {
    const e = Number(BigInt(it.unlockTime) / BigInt(WEEK));
    byEpoch[e] = ((BigInt(byEpoch[e] || 0) + BigInt(it.amount))).toString();
  }
  return {
    totalLockedGlobal: (await clever.totalLockedGlobal()).toString(),
    totalPendingUnlockGlobal: (await clever.totalPendingUnlockGlobal()).toString(),
    totalUnlockedGlobal: (await clever.totalUnlockedGlobal()).toString(),
    totalCVXInPool: (await clever.totalCVXInPool()).toString(),
    cvxDirect: (await cvx.balanceOf(LOCKER)).toString(),
    cvxRewardPool: (await pool.balanceOf(LOCKER)).toString(),
    ownerCVX: (await cvx.balanceOf(ADMIN)).toString(),
    convexTotal: lb[0].toString(), convexUnlockable: lb[1].toString(), convexLocked: lb[2].toString(),
    convexByEpoch: byEpoch,
    pending2817: (await clever.pendingUnlocked(2817)).toString(),
    pending2818: (await clever.pendingUnlocked(2818)).toString(),
    pending2838: (await clever.pendingUnlocked(2838)).toString(),
    pending2752: (await clever.pendingUnlocked(2752)).toString(),
  };
}

async function main() {
  await fork();
  const admin = await ethers.getSigner(ADMIN);
  const keeper = await ethers.getSigner(KEEPER);
  const cvx = new ethers.Contract(CVX, ERC20, keeper);
  const pool = new ethers.Contract(CVX_REWARD_POOL, ERC20, keeper);
  const cvxLocker = new ethers.Contract(CVX_LOCKER, CVXLOCK, keeper);

  const pa = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN, admin);
  console.log("ProxyAdmin.owner =", await pa.owner());
  let clever = await ethers.getContractAt("CLeverCVXLocker", LOCKER, keeper);
  console.log("locker.owner =", await clever.owner(), " isKeeper(KEEPER) =", await clever.isKeeper(KEEPER));

  const out: any = { forkBlock: FORK_BLOCK, before: await snap(clever, cvx, pool, cvxLocker), epochs: {} };

  const impl = await (await ethers.getContractFactory("CLeverCVXLocker", admin)).deploy();
  await impl.waitForDeployment();
  await (await pa.upgrade(LOCKER, await impl.getAddress())).wait();
  clever = await ethers.getContractAt("CLeverCVXLocker", LOCKER, keeper);

  for (let epoch = 2957; epoch <= 2975; epoch++) {
    const latest = await ethers.provider.getBlock("latest");
    const ts = Math.max(epoch * WEEK + 1, Number(latest!.timestamp) + 1);
    if (Math.floor(ts / WEEK) !== epoch) throw new Error(`cannot reach epoch ${epoch}`);
    await network.provider.send("evm_setNextBlockTimestamp", [ts]);
    await network.provider.send("evm_mine");
    const r = await (await clever.processUnlockableCVX()).wait();
    const s = await snap(clever, cvx, pool, cvxLocker);
    (out.epochs as any)[epoch] = { gas: r!.gasUsed.toString(), ...s };
    const internal = BigInt(s.totalLockedGlobal) + BigInt(s.totalPendingUnlockGlobal);
    console.log(
      `epoch ${epoch} ok gas=${r!.gasUsed}`,
      `\n  locked=${ethers.formatEther(s.totalLockedGlobal)} pending=${ethers.formatEther(s.totalPendingUnlockGlobal)} unlocked=${ethers.formatEther(s.totalUnlockedGlobal)}`,
      `\n  pool=${ethers.formatEther(s.totalCVXInPool)} (direct=${ethers.formatEther(s.cvxDirect)} rp=${ethers.formatEther(s.cvxRewardPool)})`,
      `\n  convexTotal=${ethers.formatEther(s.convexTotal)} internal-physical=${ethers.formatEther(internal - BigInt(s.convexTotal))}`,
    );
  }
  fs.writeFileSync("test/fork/clever/pr278/data/sim_out.json", JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

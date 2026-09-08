/* 用链上真实部署的 implementation 做逐周验证(不用本地编译产物)。
   只记全局量与 Convex tranche;用户侧对账交给 15-reconcile-latest.mjs 离线合成。 */
import { ethers, network } from "hardhat";
import * as fs from "fs";

const FORK_URL = process.env.HARDHAT_FORK_URL || "https://eth-mainnet.public.blastapi.io";
const WEEK = 604800;
const NEW_IMPL = "0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534";
const LOCKER = "0x96C68D861aDa016Ed98c30C810879F9df7c64154";
const PROXY_ADMIN = "0x1F57286F7a8083fb363d87Bc8b1DCcD685dc87EE";
const ADMIN = "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E";
const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const CVX_REWARD_POOL = "0xCF50b810E57Ac33B91dCF525C6ddd9881B139332";
const CVX_LOCKER = "0x72a19342e8F1838460eBFCCEf09F6585e32db86E";
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

const LOCKER_ABI = [
  "function processUnlockableCVX()",
  "function totalLockedGlobal() view returns (uint256)",
  "function totalPendingUnlockGlobal() view returns (uint256)",
  "function totalUnlockedGlobal() view returns (uint256)",
  "function totalCVXInPool() view returns (uint256)",
  "function pendingUnlocked(uint256) view returns (uint256)",
  "function isKeeper(address) view returns (bool)",
  "function owner() view returns (address)",
];
const PA_ABI = ["function upgrade(address,address)", "function owner() view returns (address)"];
const CVXLOCK_ABI = ["function lockedBalances(address) view returns (uint256 total,uint256 unlockable,uint256 locked,tuple(uint112 amount,uint112 boosted,uint32 unlockTime)[] lockData)"];
const ERC20 = ["function balanceOf(address) view returns (uint256)"];
const f = (x: bigint) => ethers.formatEther(x);

async function main() {
  const forkBlock = Number(process.env.FORK_BLOCK || (await new ethers.JsonRpcProvider(FORK_URL).getBlockNumber()));
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: FORK_URL, blockNumber: forkBlock } }] });
  for (const a of [ADMIN, KEEPER]) {
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [a] });
    await network.provider.send("hardhat_setBalance", [a, "0x56bc75e2d63100000"]);
  }
  const admin = await ethers.getSigner(ADMIN), keeper = await ethers.getSigner(KEEPER);
  const clever = new ethers.Contract(LOCKER, LOCKER_ABI, keeper);
  const pa = new ethers.Contract(PROXY_ADMIN, PA_ABI, admin);
  const cvxLocker = new ethers.Contract(CVX_LOCKER, CVXLOCK_ABI, keeper);
  const cvx = new ethers.Contract(CVX, ERC20, keeper);
  const pool = new ethers.Contract(CVX_REWARD_POOL, ERC20, keeper);

  async function snap() {
    const lb = await cvxLocker.lockedBalances(LOCKER);
    const byEpoch: Record<number, string> = {};
    for (const it of lb[3]) {
      const e = Number(BigInt(it.unlockTime) / BigInt(WEEK));
      byEpoch[e] = (BigInt(byEpoch[e] || 0) + BigInt(it.amount)).toString();
    }
    return {
      totalLockedGlobal: (await clever.totalLockedGlobal()).toString(),
      totalPendingUnlockGlobal: (await clever.totalPendingUnlockGlobal()).toString(),
      totalUnlockedGlobal: (await clever.totalUnlockedGlobal()).toString(),
      totalCVXInPool: (await clever.totalCVXInPool()).toString(),
      cvxDirect: (await cvx.balanceOf(LOCKER)).toString(),
      cvxRewardPool: (await pool.balanceOf(LOCKER)).toString(),
      ownerCVX: (await cvx.balanceOf(ADMIN)).toString(),
      convexTotal: lb[0].toString(), convexUnlockable: lb[1].toString(), convexByEpoch: byEpoch,
      pending2817: (await clever.pendingUnlocked(2817)).toString(),
      pending2818: (await clever.pendingUnlocked(2818)).toString(),
      pending2838: (await clever.pendingUnlocked(2838)).toString(),
    };
  }

  const out: any = { forkBlock, implAddress: ethers.getAddress(NEW_IMPL), epochs: {} };
  out.implKeccak = ethers.keccak256(await ethers.provider.getCode(NEW_IMPL));
  console.log(`fork 区块 ${forkBlock}`);
  console.log(`implementation ${ethers.getAddress(NEW_IMPL)}  keccak ${out.implKeccak}`);
  console.log(`升级前 proxy impl: ${ethers.getAddress("0x" + (await ethers.provider.getStorage(LOCKER, IMPL_SLOT)).slice(26))}`);
  out.before = await snap();

  await (await pa.upgrade(LOCKER, NEW_IMPL)).wait();
  const nowImpl = ethers.getAddress("0x" + (await ethers.provider.getStorage(LOCKER, IMPL_SLOT)).slice(26));
  console.log(`升级后 proxy impl: ${nowImpl}  ${nowImpl === ethers.getAddress(NEW_IMPL) ? "== 链上真实部署地址" : "!! 不符"}`);
  console.log(`keeper 权限: isKeeper(bot)=${await clever.isKeeper(KEEPER)}  isKeeper(Safe)=${await clever.isKeeper(ADMIN)}`);
  console.log(`locker owner: ${await clever.owner()}\n`);

  for (let epoch = 2957; epoch <= 2975; epoch++) {
    const latest = await ethers.provider.getBlock("latest");
    const ts = Math.max(epoch * WEEK + 1, Number(latest!.timestamp) + 1);
    await network.provider.send("evm_setNextBlockTimestamp", [ts]);
    await network.provider.send("evm_mine");
    const r = await (await clever.processUnlockableCVX()).wait();
    const s = await snap();
    out.epochs[epoch] = { gas: r!.gasUsed.toString(), ...s };
    const internal = BigInt(s.totalLockedGlobal) + BigInt(s.totalPendingUnlockGlobal);
    console.log(`epoch ${epoch}  gas=${String(r!.gasUsed).padStart(6)}  unlockedGlobal=${f(BigInt(s.totalUnlockedGlobal)).padStart(26)}  内部−物理=${f(internal - BigInt(s.convexTotal))}`);
  }
  fs.writeFileSync("test/fork/clever/pr278/data/sim_deployed.json", JSON.stringify(out, null, 1));
  console.log("\n已写入 data/sim_deployed.json");
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

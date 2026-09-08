/* 在真实部署的 implementation 上做提款压力测试:2958 起每周处理完让全部有 claim 的用户立即提款 */
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
const AFFECTED = "0xb828a33af42ab2e8908dfa8c2470850db7e4fd2a";
const L_ABI = ["function processUnlockableCVX()","function withdrawUnlocked()","function totalUnlockedGlobal() view returns (uint256)","function totalCVXInPool() view returns (uint256)","function totalLockedGlobal() view returns (uint256)","function totalPendingUnlockGlobal() view returns (uint256)","function getUserInfo(address) view returns (uint256,uint256,uint256,uint256,uint256)"];
const PA_ABI = ["function upgrade(address,address)"];
const CVXLOCK_ABI = ["function lockedBalances(address) view returns (uint256 total,uint256 unlockable,uint256 locked,tuple(uint112 amount,uint112 boosted,uint32 unlockTime)[] lockData)"];
const ERC20 = ["function balanceOf(address) view returns (uint256)"];
const f = (x: bigint) => ethers.formatEther(x);

async function main() {
  const forkBlock = Number(process.env.FORK_BLOCK);
  const pos = JSON.parse(fs.readFileSync("test/fork/clever/pr278/data/mcpositions_latest.json", "utf8")).positions;
  // 只需要那些现在有 claim 或 2975 前会到期的地址
  const claimants = Object.entries<any>(pos).filter(([, u]) =>
    BigInt(u.claimable) > 0n || u.pendingUnlocks.some((q: any) => q.unlockEpoch <= 2975)).map(([a]) => ethers.getAddress(a));
  console.log(`fork 区块 ${forkBlock};需要提款的地址 ${claimants.length} 个`);

  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: FORK_URL, blockNumber: forkBlock } }] });
  for (const a of [ADMIN, KEEPER, ...claimants]) {
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [a] });
    await network.provider.send("hardhat_setBalance", [a, "0x56bc75e2d63100000"]);
  }
  const admin = await ethers.getSigner(ADMIN), keeper = await ethers.getSigner(KEEPER);
  await (await new ethers.Contract(PROXY_ADMIN, PA_ABI, admin).upgrade(LOCKER, NEW_IMPL)).wait();
  const clever = new ethers.Contract(LOCKER, L_ABI, keeper);
  const cvx = new ethers.Contract(CVX, ERC20, keeper);
  const rp = new ethers.Contract(CVX_REWARD_POOL, ERC20, keeper);
  const cl = new ethers.Contract(CVX_LOCKER, CVXLOCK_ABI, keeper);
  console.log("已升级到真实部署地址\n");

  let ok = 0, fail = 0, total = 0n; const rpWeeks: string[] = [];
  for (let epoch = 2957; epoch <= 2975; epoch++) {
    const latest = await ethers.provider.getBlock("latest");
    const ts = Math.max(epoch * WEEK + 1, Number(latest!.timestamp) + 1);
    await network.provider.send("evm_setNextBlockTimestamp", [ts]);
    await network.provider.send("evm_mine");
    const rpBefore = await rp.balanceOf(LOCKER);
    try { await (await clever.processUnlockableCVX()).wait(); }
    catch (e: any) { console.log(`  epoch ${epoch} processUnlockableCVX 回滚: ${(e.shortMessage||e.message).slice(0,110)}`); return; }
    const rpAfter = await rp.balanceOf(LOCKER);
    if (rpAfter < rpBefore) rpWeeks.push(`${epoch}(${f(rpBefore - rpAfter)})`);
    if (epoch < 2958) { console.log(`epoch ${epoch}: 已处理,尚未开始提款`); continue; }
    let wk = 0, wkAmt = 0n;
    for (const u of claimants) {
      const c = new ethers.Contract(LOCKER, L_ABI, await ethers.getSigner(u));
      const info = await c.getUserInfo(u);
      if (info[2] === 0n) continue;
      const b = await cvx.balanceOf(u);
      try { await (await c.withdrawUnlocked()).wait(); const got = (await cvx.balanceOf(u)) - b; wk++; wkAmt += got; ok++; total += got;
        if (u.toLowerCase() === AFFECTED) console.log(`    >>> 受影响账户 ${AFFECTED} 提出 ${f(got)} CVX`); }
      catch (e: any) { fail++; console.log(`    提款失败 ${u} claim=${f(info[2])}: ${(e.shortMessage||e.message).slice(0,80)}`); }
    }
    const lb = await cl.lockedBalances(LOCKER);
    const internal = (await clever.totalLockedGlobal()) + (await clever.totalPendingUnlockGlobal());
    console.log(`epoch ${epoch}: ${wk} 笔提款 ${f(wkAmt)} CVX | unlockedGlobal=${f(await clever.totalUnlockedGlobal())} pool=${f(await clever.totalCVXInPool())} direct=${f(await cvx.balanceOf(LOCKER))} rp=${f(await rp.balanceOf(LOCKER))} | 内部−物理=${f(internal - lb[0])}`);
  }
  console.log(`\n合计 ${ok} 笔提款成功,${fail} 笔失败,${f(total)} CVX`);
  console.log(`reward pool 取款分支触发于: ${rpWeeks.join(", ") || "未触发"}`);
  const lb = await cl.lockedBalances(LOCKER);
  console.log(`终局 unlockedGlobal=${f(await clever.totalUnlockedGlobal())} pool=${f(await clever.totalCVXInPool())} 内部−物理=${f((await clever.totalLockedGlobal()) + (await clever.totalPendingUnlockGlobal()) - lb[0])}`);
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

/* 以主网执行后的真实状态为基准,推出 epoch 2958 及后续各周的预期值 */
import { ethers, network } from "hardhat";
import * as fs from "fs";
const FORK_URL = process.env.HARDHAT_FORK_URL || "https://eth-mainnet.public.blastapi.io";
const FORK_BLOCK = Number(process.env.FORK_BLOCK || 25939803);
const WEEK = 604800;
const NEW_IMPL = "0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534";
const LOCKER = "0x96C68D861aDa016Ed98c30C810879F9df7c64154";
const SAFE = "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E";
const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const CVX_LOCKER = "0x72a19342e8F1838460eBFCCEf09F6585e32db86E";
const RP = "0xCF50b810E57Ac33B91dCF525C6ddd9881B139332";
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const AFFECTED = "0xb828a33af42ab2e8908dfa8c2470850db7e4fd2a";
const L = ["function processUnlockableCVX()","function withdrawUnlocked()","function totalLockedGlobal() view returns (uint256)",
 "function totalPendingUnlockGlobal() view returns (uint256)","function totalUnlockedGlobal() view returns (uint256)",
 "function totalCVXInPool() view returns (uint256)","function pendingUnlocked(uint256) view returns (uint256)",
 "function getUserInfo(address) view returns (uint256,uint256,uint256,uint256,uint256)"];
const CLK = ["function lockedBalances(address) view returns (uint256 total,uint256 unlockable,uint256 locked,tuple(uint112 amount,uint112 boosted,uint32 unlockTime)[] lockData)"];
const E = ["function balanceOf(address) view returns (uint256)"];
const F = 10n ** 18n;
const f = (x: bigint) => { const n = x < 0n ? -x : x; return (x < 0n ? "-" : "") + (n / F).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + (n % F).toString().padStart(18, "0"); };

const pos = JSON.parse(fs.readFileSync("test/fork/clever/pr278/data/mcpositions_latest.json", "utf8"));
if (pos.block !== FORK_BLOCK) throw new Error(`用户快照区块 ${pos.block} 与 fork 区块 ${FORK_BLOCK} 不一致`);
let claimNow = 0n; const pend: Record<number, bigint> = {};
for (const u of Object.values<any>(pos.positions)) {
  claimNow += BigInt(u.claimable);
  for (const q of u.pendingUnlocks) pend[q.unlockEpoch] = (pend[q.unlockEpoch] || 0n) + BigInt(q.amount);
}
const claimAt = (E_: number) => { let s = claimNow; for (const [e, v] of Object.entries(pend)) if (+e <= E_) s += v; return s; };
const futAt = (E_: number) => { let s = 0n; for (const [e, v] of Object.entries(pend)) if (+e > E_) s += v; return s; };

async function main() {
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: FORK_URL, blockNumber: FORK_BLOCK } }] });
  for (const a of [SAFE, KEEPER, AFFECTED]) {
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [a] });
    await network.provider.send("hardhat_setBalance", [a, "0x56bc75e2d63100000"]);
  }
  await network.provider.send("evm_mine");
  const impl = ethers.getAddress("0x" + (await ethers.provider.getStorage(LOCKER, IMPL_SLOT)).slice(26));
  console.log(`fork 区块 ${FORK_BLOCK}(主网执行后)`);
  console.log(`proxy implementation = ${impl}  ${impl === ethers.getAddress(NEW_IMPL) ? "== 已是新实现,无需再升级" : "!! 不符"}\n`);

  const clever = new ethers.Contract(LOCKER, L, await ethers.getSigner(KEEPER));
  const cvx = new ethers.Contract(CVX, E, ethers.provider);
  const rp = new ethers.Contract(RP, E, ethers.provider);
  const cl = new ethers.Contract(CVX_LOCKER, CLK, ethers.provider);
  console.log(`执行 2958 前:pendingUnlocked[2958] = ${f(await clever.pendingUnlocked(2958))}  (我此前验证时为 0)`);
  console.log(`             Locker 直接余额        = ${f(await cvx.balanceOf(LOCKER))}\n`);

  const rows: string[] = [];
  for (let epoch = 2958; epoch <= 2975; epoch++) {
    const l = await ethers.provider.getBlock("latest");
    await network.provider.send("evm_setNextBlockTimestamp", [Math.max(epoch * WEEK + 1, Number(l!.timestamp) + 1)]);
    await network.provider.send("evm_mine");
    const r = await (await clever.processUnlockableCVX()).wait();
    const lb = await cl.lockedBalances(LOCKER);
    const gU = await clever.totalUnlockedGlobal(), pool = await clever.totalCVXInPool();
    const gP = await clever.totalPendingUnlockGlobal(), gL = await clever.totalLockedGlobal();
    const nb = gU - claimAt(epoch);
    rows.push(`  epoch ${epoch}  gas=${String(r!.gasUsed).padStart(6)}  netBorrow=${f(nb).padStart(30)}  pool−可提额=${f(pool - claimAt(epoch)).padStart(30)}  pending差=${f(gP - futAt(epoch))}`);
    if (epoch === 2958) {
      console.log("════ epoch 2958 执行后的预期读数 ════");
      console.log(`  pendingUnlocked[2958]     = ${f(await clever.pendingUnlocked(2958))}   (期望 0)`);
      console.log(`  totalUnlockedGlobal       = ${f(gU)}`);
      console.log(`  totalCVXInPool            = ${f(pool)}   ${pool === gU ? "== totalUnlockedGlobal" : "!! 不等"}`);
      console.log(`  totalPendingUnlockGlobal  = ${f(gP)}   用户未来 pending = ${f(futAt(2958))}   差 ${f(gP - futAt(2958))}`);
      console.log(`  totalLockedGlobal         = ${f(gL)}`);
      console.log(`  netBorrow                 = ${f(nb)}`);
      console.log(`  Locker 直接余额            = ${f(await cvx.balanceOf(LOCKER))}   reward pool = ${f(await rp.balanceOf(LOCKER))}`);
      console.log(`  owner 收到 CVX             = ${f((await cvx.balanceOf(SAFE)) - 2194515305096139675971n)}   (期望 3,173)`);
      const info = await clever.getUserInfo(AFFECTED);
      if (process.env.NO_WITHDRAW) {
        console.log(`  受影响账户 0xB828…Fd2a 可提 ${f(info[2])}(本次不提,以便给出干净的逐周轨迹)\n`);
      } else {
        const b0 = await cvx.balanceOf(AFFECTED);
        await (await new ethers.Contract(LOCKER, L, await ethers.getSigner(AFFECTED)).withdrawUnlocked()).wait();
        console.log(`  受影响账户 0xB828…Fd2a 可提 ${f(info[2])},实际提出 ${f((await cvx.balanceOf(AFFECTED)) - b0)}\n`);
      }
    }
  }
  console.log("════ 逐周轨迹 ════");
  rows.forEach((r) => console.log(r));
  const lb = await cl.lockedBalances(LOCKER);
  const gL = await clever.totalLockedGlobal(), gP = await clever.totalPendingUnlockGlobal();
  console.log(`\n════ epoch 2975 终局 ════`);
  console.log(`  netBorrow = ${f((await clever.totalUnlockedGlobal()) - claimAt(2975))}`);
  console.log(`  内部账本 − Convex 物理额 = ${f(gL + gP - lb[0])}`);
  const phy = new Array(17).fill(0n) as bigint[];
  for (const it of lb[3]) phy[Number(BigInt(it.unlockTime) / BigInt(WEEK)) % 17] += BigInt(it.amount);
  const byRes = new Array(17).fill(0n) as bigint[];
  for (const u of Object.values<any>(pos.positions)) for (const x of u.epochLocked) byRes[x.unlockEpoch % 17] += BigInt(x.amount);
  const dem = byRes.slice();
  for (const [e, v] of Object.entries(pend)) if (+e > 2975) dem[+e % 17] += v;
  const bad: string[] = [];
  for (let r = 0; r < 17; r++) if (dem[r] !== phy[r]) bad.push(`residue ${r}: ${f(dem[r] - phy[r])}`);
  console.log(`  17 槽差额非零项 = ${bad.length ? bad.join("  |  ") : "无 —— 全部对平"}`);
  console.log(process.env.NO_WITHDRAW ? "" : "\n注:2958 块内执行了受影响账户的提款,因此 2959 起的 netBorrow 含该提款的离线口径偏移。");
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

// 验证：EOA 的 checkpoint 与 Safe 的 windDown 之间隔开时间，是否仍然安全。
// 新执行计划把 10 笔 checkpoint 从原子批次里移到批次之外由普通 EOA 发送，
// 于是 checkpoint 区块 T_c 与 windDown 区块 T_w 之间出现了一段真实的时间间隔。
import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const IMPL = { fxusd: "0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd", treasury: "0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC", pool: "0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5" };
const A: any = { EZETH: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", EZ_TREASURY: "0x38965311507D4E54973F81475a149c09376e241e", EZ_MARKET: "0x69518D1D70AD537C41401303BDf96032338E40dE", FEZETH: "0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9", XEZETH: "0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5", EZ_POOL: "0xf58c499417e36714e99803Cb135f507a95ae7169", XEZ_POOL: "0xBa947cba270D30967369Bf1f73884Be2533d7bDB", RUSD: "0x65D72AA8DA931F047169112fcf34f52DbaAE7D18", SAFE: "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF", PROXY_ADMIN: "0x9b54b7703551d9d0ced177a78367560a8b2edda4", TIMELOCK: "0x68863fb8855b04509a835082478D6E3D0bE4E61a", FXN: "0x365AccFCa291e7D3914637ABf1F7635dB165Bb09", VOTE_OWNER: "0xd11a4Ee017cA0BECA8FA45fF2abFe9C6267b7881" };
const E = 10n ** 18n; const f = (v: bigint) => ethers.formatUnits(v, 18); const WEEK = 604800;
const ERC20 = ["function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)"];
const PA = ["function upgrade(address,address)"];
const M_ABI = ["function updateRedeemFeeRatio(uint256,int256,bool)"];
const T_ABI = ["function initializeWindDown(uint256,uint256,uint256,uint256,uint256)"];
const P_ABI = ["function windDown(uint256,uint256) returns (uint256,uint256)", "function claim(address,address)", "function claimable(address,address) view returns (uint256)", "function checkpoint(address)", "function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)", "function getStakerVoteOwner(address) view returns (address)"];
let P = 0, F = 0;
const ck = (l: string, c: boolean, d = "") => { if (c) { P++; console.log("  PASS  " + l + (d ? "  " + d : "")); } else { F++; console.log("  FAIL  " + l + (d ? "  " + d : "")); } };
async function imp(a: string) { await network.provider.send("hardhat_impersonateAccount", [a]); await network.provider.send("hardhat_setBalance", [a, "0x21e19e0c9bab2400000"]); return await ethers.getSigner(a); }
const snap = async () => await network.provider.send("evm_snapshot", []);
const back = async (s: string) => { await network.provider.send("evm_revert", [s]); };
const warp = async (s: number) => { if (s > 0) { await network.provider.send("evm_increaseTime", [Math.floor(s)]); await network.provider.send("evm_mine", []); } };
async function upgradeAll() {
  const tl = await imp(A.TIMELOCK); const pa = new ethers.Contract(A.PROXY_ADMIN, PA, tl);
  for (const [p, i] of [[A.RUSD, IMPL.fxusd], [A.EZ_TREASURY, IMPL.treasury], [A.EZ_POOL, IMPL.pool], [A.XEZ_POOL, IMPL.pool]]) await (await pa.upgrade(p, i)).wait();
}
async function initWD(safe: any) {
  const ez = new ethers.Contract(A.EZETH, ERC20, ethers.provider), fez = new ethers.Contract(A.FEZETH, ERC20, ethers.provider), xez = new ethers.Contract(A.XEZETH, ERC20, ethers.provider);
  const T = new ethers.Contract(A.EZ_TREASURY, T_ABI, ethers.provider), M = new ethers.Contract(A.EZ_MARKET, M_ABI, ethers.provider);
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0, 0, true)).wait();
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0, 0, false)).wait();
  const B = await ez.balanceOf(A.EZ_TREASURY), Fs = await fez.totalSupply(), X = await xez.totalSupply();
  await (await (T.connect(safe) as any).initializeWindDown(B, Fs, X, Fs, (X * 346669734551971069n) / E)).wait();
}

// 一次完整演练：升级 -> 初始化 -> EOA checkpoint 全员 -> 等待 gap 秒 -> Safe windDown -> 全员领取
async function run(poolAddr: string, holders: string[], gapSec: number, reCheckpoint: boolean, dev: any, safe: any) {
  const fez = new ethers.Contract(A.FEZETH, ERC20, ethers.provider);
  await upgradeAll(); await initWD(safe);
  const Pl = new ethers.Contract(poolAddr, P_ABI, ethers.provider);
  const tCp = (await ethers.provider.getBlock("latest"))!.timestamp;
  for (const h of holders) await (await (Pl.connect(dev) as any).checkpoint(h)).wait();
  await warp(gapSec);
  if (reCheckpoint) for (const h of holders) await (await (Pl.connect(dev) as any).checkpoint(h)).wait();
  const tWd = (await ethers.provider.getBlock("latest"))!.timestamp;
  const bal = await fez.balanceOf(poolAddr);
  await (await (Pl.connect(safe) as any).windDown(bal, 0)).wait();
  let ok = 0, stuck = 0n;
  for (const h of holders) {
    let c = 0n; try { c = await (Pl as any).claimable(h, A.EZETH); } catch (e) { }
    try { await (await (Pl.connect(dev) as any).claim(h, ethers.ZeroAddress)).wait(); ok++; } catch (e) { stuck += c; }
  }
  const ceilCp = Math.ceil(tCp / WEEK) * WEEK;
  return { ok, stuck, tCp, tWd, ceilCp, crossed: ceilCp < tWd };
}

async function main() {
  const H = JSON.parse(fs.readFileSync("/tmp/ezwd/holders.json", "utf8"));
  const ezH = H.ezpool.map((x: any) => x[0]), xezH = H.xezpool.map((x: any) => x[0]);
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: RPC } }] });
  await network.provider.send("evm_mine", []);
  const [dev] = await ethers.getSigners(); const safe = await imp(A.SAFE);
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  const nextWeek = Math.ceil(now / WEEK) * WEEK;
  console.log(`fork now      ${new Date(now * 1000).toISOString()}`);
  console.log(`next WEEK bnd ${new Date(nextWeek * 1000).toISOString()}  (in ${((nextWeek - now) / 3600).toFixed(1)}h)\n`);

  const cases: [string, number][] = [
    ["同一区块 (gap 0)", 0],
    ["+1 小时", 3600],
    ["+6 小时", 6 * 3600],
    ["停在周边界之前 10 分钟", nextWeek - now - 600],
    ["跨过周边界 10 分钟", nextWeek - now + 600],
    ["跨过周边界 1 天", nextWeek - now + 86400],
    ["+3 天", 3 * 86400],
    ["+2 周", 2 * WEEK],
  ];

  console.log("########## ezPool (6 户)  EOA checkpoint -> 间隔 -> Safe windDown ##########");
  for (const [label, gap] of cases) {
    const s = await snap();
    let r: any;
    try { r = await run(A.EZ_POOL, ezH, gap, false, dev, safe); }
    catch (e: any) { console.log(`  ERROR ${label}: ${(e.message || "").slice(0, 120)}`); await back(s); continue; }
    const crossedTag = r.crossed ? "跨周" : "未跨周";
    ck(`${label.padEnd(26)} ${crossedTag}  领取成功 ${r.ok}/${ezH.length}`, r.ok === ezH.length, r.stuck > 0n ? `滞留 ${f(r.stuck)} ezETH` : "");
    await back(s);
  }

  console.log("\n########## xezPool (4 户) 同样矩阵 ##########");
  for (const [label, gap] of cases) {
    const s = await snap();
    let r: any;
    try { r = await run(A.XEZ_POOL, xezH, gap, false, dev, safe); }
    catch (e: any) { console.log(`  ERROR ${label}: ${(e.message || "").slice(0, 120)}`); await back(s); continue; }
    const crossedTag = r.crossed ? "跨周" : "未跨周";
    ck(`${label.padEnd(26)} ${crossedTag}  领取成功 ${r.ok}/${xezH.length}`, r.ok === xezH.length, r.stuck > 0n ? `滞留 ${f(r.stuck)} ezETH` : "");
    await back(s);
  }

  console.log("\n########## 补救：跨周之后、windDown 之前重新 checkpoint 一次 ##########");
  for (const [label, gap] of [["跨过周边界 1 天 + 重新 checkpoint", nextWeek - now + 86400], ["+2 周 + 重新 checkpoint", 2 * WEEK]] as [string, number][]) {
    const s = await snap();
    let r: any;
    try { r = await run(A.EZ_POOL, ezH, gap, true, dev, safe); }
    catch (e: any) { console.log(`  ERROR ${label}: ${(e.message || "").slice(0, 120)}`); await back(s); continue; }
    ck(`${label.padEnd(36)} 领取成功 ${r.ok}/${ezH.length}`, r.ok === ezH.length, r.stuck > 0n ? `滞留 ${f(r.stuck)} ezETH` : "");
    await back(s);
  }

  console.log(`\n==== ${P} passed, ${F} failed ====`);
}
main().catch((e) => { console.error(e); process.exit(1); });

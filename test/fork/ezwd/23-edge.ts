// 精确边界：安全条件是否正好是 _getWeekTs(T_checkpoint) >= T_windDown
// 同时测量每笔 EOA checkpoint 的实际 gas（新方案把 checkpoint 移出批次后需要这个数）
import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const IMPL = { fxusd: "0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd", treasury: "0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC", pool: "0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5" };
const A: any = { EZETH: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", EZ_TREASURY: "0x38965311507D4E54973F81475a149c09376e241e", EZ_MARKET: "0x69518D1D70AD537C41401303BDf96032338E40dE", FEZETH: "0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9", XEZETH: "0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5", EZ_POOL: "0xf58c499417e36714e99803Cb135f507a95ae7169", XEZ_POOL: "0xBa947cba270D30967369Bf1f73884Be2533d7bDB", RUSD: "0x65D72AA8DA931F047169112fcf34f52DbaAE7D18", SAFE: "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF", PROXY_ADMIN: "0x9b54b7703551d9d0ced177a78367560a8b2edda4", TIMELOCK: "0x68863fb8855b04509a835082478D6E3D0bE4E61a" };
const E = 10n ** 18n; const f = (v: bigint) => ethers.formatUnits(v, 18); const WEEK = 604800;
const ERC20 = ["function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)"];
const PA = ["function upgrade(address,address)"];
const M_ABI = ["function updateRedeemFeeRatio(uint256,int256,bool)"];
const T_ABI = ["function initializeWindDown(uint256,uint256,uint256,uint256,uint256)"];
const P_ABI = ["function windDown(uint256,uint256) returns (uint256,uint256)", "function claim(address,address)", "function claimable(address,address) view returns (uint256)", "function checkpoint(address)"];
let P = 0, F = 0;
const ck = (l: string, c: boolean, d = "") => { if (c) { P++; console.log("  PASS  " + l + (d ? "  " + d : "")); } else { F++; console.log("  FAIL  " + l + (d ? "  " + d : "")); } };
async function imp(a: string) { await network.provider.send("hardhat_impersonateAccount", [a]); await network.provider.send("hardhat_setBalance", [a, "0x21e19e0c9bab2400000"]); return await ethers.getSigner(a); }
const snap = async () => await network.provider.send("evm_snapshot", []);
const back = async (s: string) => { await network.provider.send("evm_revert", [s]); };
async function upgradeAll() { const tl = await imp(A.TIMELOCK); const pa = new ethers.Contract(A.PROXY_ADMIN, PA, tl); for (const [p, i] of [[A.RUSD, IMPL.fxusd], [A.EZ_TREASURY, IMPL.treasury], [A.EZ_POOL, IMPL.pool], [A.XEZ_POOL, IMPL.pool]]) await (await pa.upgrade(p, i)).wait(); }
async function initWD(safe: any) {
  const ez = new ethers.Contract(A.EZETH, ERC20, ethers.provider), fez = new ethers.Contract(A.FEZETH, ERC20, ethers.provider), xez = new ethers.Contract(A.XEZETH, ERC20, ethers.provider);
  const T = new ethers.Contract(A.EZ_TREASURY, T_ABI, ethers.provider), M = new ethers.Contract(A.EZ_MARKET, M_ABI, ethers.provider);
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0, 0, true)).wait();
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0, 0, false)).wait();
  const B = await ez.balanceOf(A.EZ_TREASURY), Fs = await fez.totalSupply(), X = await xez.totalSupply();
  await (await (T.connect(safe) as any).initializeWindDown(B, Fs, X, Fs, (X * 346669734551971069n) / E)).wait();
}
// 把下一个区块的时间戳精确设为 target
const setNext = async (t: number) => { await network.provider.send("evm_setNextBlockTimestamp", [t]); await network.provider.send("evm_mine", []); };

async function main() {
  const H = JSON.parse(fs.readFileSync("/tmp/ezwd/holders.json", "utf8"));
  const ezH = H.ezpool.map((x: any) => x[0]), xezH = H.xezpool.map((x: any) => x[0]);
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: RPC } }] });
  await network.provider.send("evm_mine", []);
  const [dev] = await ethers.getSigners(); const safe = await imp(A.SAFE);

  console.log("########## A. 每笔 EOA checkpoint 的 gas ##########");
  {
    const s = await snap();
    await upgradeAll(); await initWD(safe);
    let tot = 0n, mx = 0n;
    for (const [pool, hs] of [[A.EZ_POOL, ezH], [A.XEZ_POOL, xezH]] as const) {
      const Pl = new ethers.Contract(pool, P_ABI, ethers.provider);
      for (const h of hs) {
        const r = await (await (Pl.connect(dev) as any).checkpoint(h)).wait();
        tot += r.gasUsed; if (r.gasUsed > mx) mx = r.gasUsed;
        console.log(`  ${pool === A.EZ_POOL ? "ezPool " : "xezPool"} ${h}  gas ${r.gasUsed.toString().padStart(9)}`);
      }
    }
    console.log(`  10 笔合计 ${tot}   单笔最大 ${mx}`);
    ck("单笔 checkpoint 可在普通区块内完成 (< 3,000,000)", mx < 3000000n, `max ${mx}`);
    await back(s);
  }

  console.log("\n########## B. 精确边界：T_windDown 相对 ceil(T_checkpoint) ##########");
  // offset < 0 : windDown 在周边界之前   offset == 0 : windDown 正好落在周边界
  // offset > 0 : windDown 在周边界之后
  for (const off of [-600, -60, -1, 0, 1, 60, 600]) {
    const s = await snap();
    try {
      await upgradeAll(); await initWD(safe);
      const fez = new ethers.Contract(A.FEZETH, ERC20, ethers.provider);
      const Pl = new ethers.Contract(A.EZ_POOL, P_ABI, ethers.provider);
      // 把 checkpoint 全部放在同一个周边界之前的固定时刻
      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      const bnd = Math.ceil((now + 3600) / WEEK) * WEEK;      // 取一个未来的周边界
      await setNext(bnd - 1800);                              // checkpoint 时刻 = 边界前 30 分钟
      let tCp = 0;
      for (const h of ezH) { const r = await (await (Pl.connect(dev) as any).checkpoint(h)).wait(); tCp = (await ethers.provider.getBlock(r.blockNumber))!.timestamp; }
      const ceilCp = Math.ceil(tCp / WEEK) * WEEK;
      await setNext(ceilCp + off - 1);
      const bal = await fez.balanceOf(A.EZ_POOL);
      // 让 windDown 精确落在 ceilCp + off 这个时间戳上，并从 receipt 里读回真实区块时间
      await network.provider.send("evm_setNextBlockTimestamp", [ceilCp + off]);
      const wdRcpt = await (await (Pl.connect(safe) as any).windDown(bal, 0)).wait();
      const tWd = (await ethers.provider.getBlock(wdRcpt.blockNumber))!.timestamp;
      let ok = 0, stuck = 0n;
      for (const h of ezH) { let c = 0n; try { c = await (Pl as any).claimable(h, A.EZETH); } catch (e) { } try { await (await (Pl.connect(dev) as any).claim(h, ethers.ZeroAddress)).wait(); ok++; } catch (e) { stuck += c; } }
      const predictSafe = ceilCp >= tWd;
      const actualSafe = ok === ezH.length;
      console.log(`  T_wd = ceil(T_cp) ${off >= 0 ? "+" : ""}${off}s   预测安全=${predictSafe}   实际 ${ok}/6${stuck > 0n ? "  滞留 " + f(stuck) : ""}`);
      ck(`    规则 ceil(T_cp) >= T_wd 与实测一致`, predictSafe === actualSafe);
    } catch (e: any) { console.log(`  ERROR off=${off}: ${(e.message || "").slice(0, 140)}`); F++; }
    await back(s);
  }
  console.log(`\n==== ${P} passed, ${F} failed ====`);
}
main().catch((e) => { console.error(e); process.exit(1); });

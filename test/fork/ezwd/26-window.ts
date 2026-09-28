// 现实执行窗口验证：按真实星期几安排 checkpoint 与 windDown，看哪些安排是安全的。
import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const IMPL = { fxusd: "0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd", treasury: "0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC", pool: "0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5" };
const A: any = { EZETH: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", EZ_TREASURY: "0x38965311507D4E54973F81475a149c09376e241e", EZ_MARKET: "0x69518D1D70AD537C41401303BDf96032338E40dE", FEZETH: "0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9", XEZETH: "0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5", EZ_POOL: "0xf58c499417e36714e99803Cb135f507a95ae7169", XEZ_POOL: "0xBa947cba270D30967369Bf1f73884Be2533d7bDB", RUSD: "0x65D72AA8DA931F047169112fcf34f52DbaAE7D18", SAFE: "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF", PROXY_ADMIN: "0x9b54b7703551d9d0ced177a78367560a8b2edda4", TIMELOCK: "0x68863fb8855b04509a835082478D6E3D0bE4E61a" };
const E = 10n ** 18n; const fm = (v: bigint) => ethers.formatUnits(v, 18); const WEEK = 604800; const DAY = 86400;
const ERC20 = ["function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)"];
const PA = ["function upgrade(address,address)"];
const M_ABI = ["function updateRedeemFeeRatio(uint256,int256,bool)"];
const T_ABI = ["function initializeWindDown(uint256,uint256,uint256,uint256,uint256)"];
const P_ABI = ["function windDown(uint256,uint256) returns (uint256,uint256)", "function claim(address,address)", "function checkpoint(address)"];
let P = 0, F = 0;
const ck = (l: string, c: boolean, d = "") => { if (c) { P++; console.log("  PASS  " + l + (d ? "   " + d : "")); } else { F++; console.log("  FAIL  " + l + (d ? "   " + d : "")); } };
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
const WD = ["周四", "周五", "周六", "周日", "周一", "周二", "周三"]; // 纪元日为周四
const wd = (ts: number) => WD[Math.floor(ts / DAY) % 7];
const iso = (ts: number) => new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 16);

async function main() {
  const H = JSON.parse(fs.readFileSync("/tmp/ezwd/holders.json", "utf8"));
  const ezH = H.ezpool.map((x: any) => x[0]);
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: RPC } }] });
  await network.provider.send("evm_mine", []);
  const [dev] = await ethers.getSigners(); const safe = await imp(A.SAFE);
  const now0 = (await ethers.provider.getBlock("latest"))!.timestamp;
  const THU = Math.ceil((now0 + 2 * DAY) / WEEK) * WEEK;   // 一个未来的周四 00:00 UTC

  // [标签, checkpoint 时刻, windDown 时刻]  相对该周四零点
  const cases: [string, number, number][] = [
    ["A  周四 10:00 checkpoint -> 周五 14:00 windDown", 10 * 3600, DAY + 14 * 3600],
    ["B  周五 10:00 checkpoint -> 周二 14:00 windDown", DAY + 10 * 3600, 5 * DAY + 14 * 3600],
    ["C  周五 10:00 checkpoint -> 下周三 20:00 windDown", DAY + 10 * 3600, 6 * DAY + 20 * 3600],
    ["D  周五 10:00 checkpoint -> 下周四 02:00 windDown", DAY + 10 * 3600, 7 * DAY + 2 * 3600],
    ["E  周三 20:00 checkpoint -> 周四 02:00 windDown", -4 * 3600, 2 * 3600],
    ["F  周三 23:50 checkpoint -> 周四 00:10 windDown", -600, 600],
  ];

  for (const [label, dCp, dWd] of cases) {
    const s = await snap();
    try {
      await upgradeAll(); await initWD(safe);
      const Pl = new ethers.Contract(A.EZ_POOL, P_ABI, ethers.provider);
      const fez = new ethers.Contract(A.FEZETH, ERC20, ethers.provider);
      await network.provider.send("evm_setNextBlockTimestamp", [THU + dCp - 10]); await network.provider.send("evm_mine", []);
      let tCp = 0;
      for (const h of ezH) { const r = await (await (Pl.connect(dev) as any).checkpoint(h)).wait(); tCp = (await ethers.provider.getBlock(r.blockNumber))!.timestamp; }
      const bal = await fez.balanceOf(A.EZ_POOL);
      await network.provider.send("evm_setNextBlockTimestamp", [THU + dWd]);
      const wr = await (await (Pl.connect(safe) as any).windDown(bal, 0)).wait();
      const tWd = (await ethers.provider.getBlock(wr.blockNumber))!.timestamp;
      let ok = 0, stuck = 0n;
      for (const h of ezH) { try { await (await (Pl.connect(dev) as any).claim(h, ethers.ZeroAddress)).wait(); ok++; } catch (e) { } }
      const ceilCp = Math.ceil(tCp / WEEK) * WEEK;
      const gapH = ((tWd - tCp) / 3600).toFixed(1);
      ck(`${label}`, ok === ezH.length,
        `间隔 ${gapH.padStart(6)}h  ${ceilCp >= tWd ? "未跨界" : "跨界  "}  领取 ${ok}/${ezH.length}`);
      console.log(`           checkpoint ${iso(tCp)} UTC ${wd(tCp)}   windDown ${iso(tWd)} UTC ${wd(tWd)}   下一个边界 ${iso(ceilCp)} ${wd(ceilCp)}`);
    } catch (e: any) { console.log(`  ERROR ${label}: ${(e.message || "").slice(0, 120)}`); F++; }
    await back(s);
  }
  console.log(`\n==== ${P} passed, ${F} failed ====`);
}
main().catch((e) => { console.error(e); process.exit(1); });

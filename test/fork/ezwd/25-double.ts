// 折中方案可行性：先由 EOA 做一遍 checkpoint（吃掉昂贵的首次状态处理），
// 再把第二遍 checkpoint 放进 Safe 批次与 windDown 同块。测第二遍的 gas。
import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const IMPL = { fxusd: "0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd", treasury: "0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC", pool: "0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5" };
const A: any = { EZETH: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", EZ_TREASURY: "0x38965311507D4E54973F81475a149c09376e241e", EZ_MARKET: "0x69518D1D70AD537C41401303BDf96032338E40dE", FEZETH: "0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9", XEZETH: "0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5", EZ_POOL: "0xf58c499417e36714e99803Cb135f507a95ae7169", XEZ_POOL: "0xBa947cba270D30967369Bf1f73884Be2533d7bDB", RUSD: "0x65D72AA8DA931F047169112fcf34f52DbaAE7D18", SAFE: "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF", PROXY_ADMIN: "0x9b54b7703551d9d0ced177a78367560a8b2edda4", TIMELOCK: "0x68863fb8855b04509a835082478D6E3D0bE4E61a" };
const E = 10n ** 18n; const fm = (v: bigint) => ethers.formatUnits(v, 18); const WEEK = 604800;
const ERC20 = ["function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)"];
const PA = ["function upgrade(address,address)"];
const M_ABI = ["function updateRedeemFeeRatio(uint256,int256,bool)"];
const T_ABI = ["function initializeWindDown(uint256,uint256,uint256,uint256,uint256)"];
const P_ABI = ["function windDown(uint256,uint256) returns (uint256,uint256)", "function claim(address,address)", "function checkpoint(address)"];
async function imp(a: string) { await network.provider.send("hardhat_impersonateAccount", [a]); await network.provider.send("hardhat_setBalance", [a, "0x21e19e0c9bab2400000"]); return await ethers.getSigner(a); }
async function upgradeAll() { const tl = await imp(A.TIMELOCK); const pa = new ethers.Contract(A.PROXY_ADMIN, PA, tl); for (const [p, i] of [[A.RUSD, IMPL.fxusd], [A.EZ_TREASURY, IMPL.treasury], [A.EZ_POOL, IMPL.pool], [A.XEZ_POOL, IMPL.pool]]) await (await pa.upgrade(p, i)).wait(); }
async function initWD(safe: any) {
  const ez = new ethers.Contract(A.EZETH, ERC20, ethers.provider), fez = new ethers.Contract(A.FEZETH, ERC20, ethers.provider), xez = new ethers.Contract(A.XEZETH, ERC20, ethers.provider);
  const T = new ethers.Contract(A.EZ_TREASURY, T_ABI, ethers.provider), M = new ethers.Contract(A.EZ_MARKET, M_ABI, ethers.provider);
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0, 0, true)).wait();
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0, 0, false)).wait();
  const B = await ez.balanceOf(A.EZ_TREASURY), Fs = await fez.totalSupply(), X = await xez.totalSupply();
  await (await (T.connect(safe) as any).initializeWindDown(B, Fs, X, Fs, (X * 346669734551971069n) / E)).wait();
}
async function main() {
  const H = JSON.parse(fs.readFileSync("/tmp/ezwd/holders.json", "utf8"));
  const ezH = H.ezpool.map((x: any) => x[0]), xezH = H.xezpool.map((x: any) => x[0]);
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: RPC } }] });
  await network.provider.send("evm_mine", []);
  const [dev] = await ethers.getSigners(); const safe = await imp(A.SAFE);
  await upgradeAll(); await initWD(safe);
  const fez = new ethers.Contract(A.FEZETH, ERC20, ethers.provider);

  let r1 = 0n, r2 = 0n; const g1: Record<string, bigint> = {};
  console.log("第一遍 (EOA，批次外)                     第二遍 (同块，模拟放进批次)");
  for (const [pool, hs, tag] of [[A.EZ_POOL, ezH, "ezPool "], [A.XEZ_POOL, xezH, "xezPool"]] as const) {
    const Pl = new ethers.Contract(pool, P_ABI, ethers.provider);
    for (const h of hs) { const r = await (await (Pl.connect(dev) as any).checkpoint(h)).wait(); r1 += r.gasUsed; g1[h] = r.gasUsed; }
  }
  // 第二遍：紧接着再调一次
  const g2: Record<string, bigint> = {};
  for (const [pool, hs] of [[A.EZ_POOL, ezH], [A.XEZ_POOL, xezH]] as const) {
    const Pl = new ethers.Contract(pool, P_ABI, ethers.provider);
    for (const h of hs) { const r = await (await (Pl.connect(dev) as any).checkpoint(h)).wait(); r2 += r.gasUsed; g2[h] = r.gasUsed; }
  }
  for (const [pool, hs, tag] of [[A.EZ_POOL, ezH, "ezPool "], [A.XEZ_POOL, xezH, "xezPool"]] as const)
    for (const h of hs) console.log(`  ${tag} ${h}   第一遍 ${g1[h].toString().padStart(9)}   第二遍 ${g2[h].toString().padStart(8)}`);
  console.log(`\n  第一遍 10 笔合计 ${r1}`);
  console.log(`  第二遍 10 笔合计 ${r2}     <- 放进批次需要多付的 gas`);

  // 确认折中方案确实有效：第二遍与 windDown 同块
  const Pl = new ethers.Contract(A.EZ_POOL, P_ABI, ethers.provider);
  await (await (Pl.connect(safe) as any).windDown(await fez.balanceOf(A.EZ_POOL), 0)).wait();
  let ok = 0; for (const h of ezH) { try { await (await (Pl.connect(dev) as any).claim(h, ethers.ZeroAddress)).wait(); ok++; } catch (e) { } }
  console.log(`\n  折中方案实测 ezPool 领取 ${ok}/${ezH.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

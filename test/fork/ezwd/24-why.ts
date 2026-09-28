// 跨周情形的硬证据：抓 revert 原始数据 + 打印决定分支的三个状态量
import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const IMPL = { fxusd: "0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd", treasury: "0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC", pool: "0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5" };
const A: any = { EZETH: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", EZ_TREASURY: "0x38965311507D4E54973F81475a149c09376e241e", EZ_MARKET: "0x69518D1D70AD537C41401303BDf96032338E40dE", FEZETH: "0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9", XEZETH: "0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5", EZ_POOL: "0xf58c499417e36714e99803Cb135f507a95ae7169", XEZ_POOL: "0xBa947cba270D30967369Bf1f73884Be2533d7bDB", RUSD: "0x65D72AA8DA931F047169112fcf34f52DbaAE7D18", SAFE: "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF", PROXY_ADMIN: "0x9b54b7703551d9d0ced177a78367560a8b2edda4", TIMELOCK: "0x68863fb8855b04509a835082478D6E3D0bE4E61a", VOTE_OWNER: "0xd11a4Ee017cA0BECA8FA45fF2abFe9C6267b7881" };
const E = 10n ** 18n; const fm = (v: bigint) => ethers.formatUnits(v, 18); const WEEK = 604800;
const ERC20 = ["function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)"];
const PA = ["function upgrade(address,address)"];
const M_ABI = ["function updateRedeemFeeRatio(uint256,int256,bool)"];
const T_ABI = ["function initializeWindDown(uint256,uint256,uint256,uint256,uint256)"];
const P_ABI = ["function windDown(uint256,uint256) returns (uint256,uint256)", "function claim(address,address)", "function claimable(address,address) view returns (uint256)", "function checkpoint(address)", "function balanceOf(address) view returns (uint256)", "function getBoostRatio(address) view returns (uint256)",
  "function voteOwnerBalances(address) view returns (uint112 product, uint104 amount, uint40 updateAt)",
  "function totalSupplyHistory(uint256) view returns (uint112 product, uint104 amount, uint40 updateAt)",
  "function numTotalSupplyHistory() view returns (uint256)",
  "function boostCheckpoint(address) view returns (uint64 boostRatio, uint64 historyIndex)"];
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
// 原始 eth_call，拿未经包装的 revert data
async function rawCall(to: string, data: string) {
  try { await network.provider.send("eth_call", [{ to, data }, "latest"]); return { ok: true, data: "0x" }; }
  catch (e: any) { const d = e?.data?.data || e?.data || e?.error?.data || ""; return { ok: false, data: typeof d === "string" ? d : JSON.stringify(d) }; }
}
const decodeRevert = (d: string) => {
  if (!d || d === "0x") return "(空)";
  if (d.startsWith("0x4e487b71")) { const code = BigInt("0x" + d.slice(10)); return `Panic(0x${code.toString(16)})` + (code === 0x12n ? "  = division or modulo by zero" : ""); }
  if (d.startsWith("0x08c379a0")) { try { return "Error(" + ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + d.slice(10))[0] + ")"; } catch { return d.slice(0, 20); } }
  return d.slice(0, 20) + "…";
};

async function scenario(label: string, crossBoundary: boolean, dev: any, safe: any, holders: string[]) {
  console.log(`\n================ ${label} ================`);
  const fez = new ethers.Contract(A.FEZETH, ERC20, ethers.provider);
  await upgradeAll(); await initWD(safe);
  const Pl = new ethers.Contract(A.EZ_POOL, P_ABI, ethers.provider);
  const now0 = (await ethers.provider.getBlock("latest"))!.timestamp;
  const bnd = Math.ceil((now0 + 3600) / WEEK) * WEEK;
  // checkpoint 固定在该周边界前 30 分钟
  await network.provider.send("evm_setNextBlockTimestamp", [bnd - 1800]); await network.provider.send("evm_mine", []);
  let tCp = 0;
  for (const h of holders) { const r = await (await (Pl.connect(dev) as any).checkpoint(h)).wait(); tCp = (await ethers.provider.getBlock(r.blockNumber))!.timestamp; }
  // windDown 落在边界之前 或 之后
  const tTarget = crossBoundary ? bnd + 600 : bnd - 60;
  await network.provider.send("evm_setNextBlockTimestamp", [tTarget]);
  const bal = await fez.balanceOf(A.EZ_POOL);
  const wr = await (await (Pl.connect(safe) as any).windDown(bal, 0)).wait();
  const tWd = (await ethers.provider.getBlock(wr.blockNumber))!.timestamp;
  const ceilCp = Math.ceil(tCp / WEEK) * WEEK;
  console.log(`T_checkpoint   ${tCp}  ${new Date(tCp * 1000).toISOString()}`);
  console.log(`ceil(T_cp)     ${ceilCp}  ${new Date(ceilCp * 1000).toISOString()}   <- _getBoostRatio 的第一个采样点`);
  console.log(`T_windDown     ${tWd}  ${new Date(tWd * 1000).toISOString()}`);
  console.log(`判据 ceil(T_cp) >= T_wd :  ${ceilCp >= tWd}`);

  const n = await (Pl as any).numTotalSupplyHistory();
  const last = await (Pl as any).totalSupplyHistory(n - 1n);
  const prev = await (Pl as any).totalSupplyHistory(n - 2n);
  const epochOf = (p: bigint) => Number(p >> 88n);
  console.log(`totalSupplyHistory[${n - 2n}]  epoch ${epochOf(prev[0])}  amount ${fm(prev[1])}  updateAt ${prev[2]}`);
  console.log(`totalSupplyHistory[${n - 1n}]  epoch ${epochOf(last[0])}  amount ${fm(last[1])}  updateAt ${last[2]}   <- windDown 清零档`);
  console.log(`第一个采样点 ${ceilCp} 会命中哪一档: updateAt <= ${ceilCp} 的最大档 => ${Number(last[2]) <= ceilCp ? `[${n - 1n}] 清零档(epoch ${epochOf(last[0])}) -> _realBalance = 0 -> L887 早退` : `[${n - 2n}] 清零前档(epoch ${epochOf(prev[0])}) -> _realBalance 非零 -> 进入 L894 除法`}`);

  // 第一个人领取（会把 voteOwner 归零）
  const first = holders[0];
  try { await (await (Pl.connect(dev) as any).claim(first, ethers.ZeroAddress)).wait(); console.log(`\n第 1 人 ${first} claim 成功`); } catch (e: any) { console.log(`\n第 1 人 claim 失败`); }
  const vo = await (Pl as any).voteOwnerBalances(A.VOTE_OWNER);
  console.log(`voteOwnerBalances(0xd11a4Ee0…)  epoch ${epochOf(vo[0])}  amount ${fm(vo[1])}  updateAt ${vo[2]}`);

  // 第二个人：抓原始 revert data
  const iface = new ethers.Interface(P_ABI);
  for (const victim of holders.slice(1, 3)) {
    const r1 = await rawCall(A.EZ_POOL, iface.encodeFunctionData("claimable", [victim, A.EZETH]));
    const r2 = await rawCall(A.EZ_POOL, iface.encodeFunctionData("getBoostRatio", [victim]));
    const r3 = await rawCall(A.EZ_POOL, iface.encodeFunctionData("claim", [victim, ethers.ZeroAddress]));
    console.log(`  ${victim}`);
    console.log(`     claimable(…,ezETH)  ${r1.ok ? "OK  " + fm(ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], r1.data === "0x" ? "0x" + "0".repeat(64) : r1.data)[0]) : "REVERT " + decodeRevert(r1.data)}`);
    console.log(`     getBoostRatio(…)    ${r2.ok ? "OK" : "REVERT " + decodeRevert(r2.data)}`);
    console.log(`     claim(…)            ${r3.ok ? "OK" : "REVERT " + decodeRevert(r3.data)}`);
  }
  let ok = 0; for (const h of holders) { try { await (await (Pl.connect(dev) as any).claim(h, ethers.ZeroAddress)).wait(); ok++; } catch (e) { } }
  console.log(`\n最终可领取 ${ok}/${holders.length}`);
}

async function main() {
  const H = JSON.parse(fs.readFileSync("/tmp/ezwd/holders.json", "utf8"));
  const ezH = H.ezpool.map((x: any) => x[0]);
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: RPC } }] });
  await network.provider.send("evm_mine", []);
  const [dev] = await ethers.getSigners(); const safe = await imp(A.SAFE);
  let s = await snap(); await scenario("A. 不跨周边界（windDown 在边界前 60 秒）", false, dev, safe, ezH); await back(s);
  s = await snap(); await scenario("B. 跨过周边界（windDown 在边界后 600 秒）", true, dev, safe, ezH); await back(s);
}
main().catch((e) => { console.error(e); process.exit(1); });

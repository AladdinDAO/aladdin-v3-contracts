import { ethers, network } from "hardhat";
import * as fs from "fs";

const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const A: any = {
  EZETH: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",
  EZ_TREASURY: "0x38965311507D4E54973F81475a149c09376e241e",
  EZ_MARKET: "0x69518D1D70AD537C41401303BDf96032338E40dE",
  FEZETH: "0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9",
  XEZETH: "0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5",
  EZ_POOL: "0xf58c499417e36714e99803Cb135f507a95ae7169",
  XEZ_POOL: "0xBa947cba270D30967369Bf1f73884Be2533d7bDB",
  RUSD: "0x65D72AA8DA931F047169112fcf34f52DbaAE7D18",
  SAFE: "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF",
  PROXY_ADMIN: "0x9B54B7703551D9d0ced177A78367560a8B2eDDA4",
  TIMELOCK: "0x68863fb8855b04509a835082478D6E3D0bE4E61a",
  WEETH: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee",
  WEETH_TREASURY: "0x781BA968d5cc0b40EB592D5c8a9a3A4000063885",
  WEETH_MARKET: "0x267C6A96Db7422faA60Aa7198FfEeeC4169CD65f",
  FEETH: "0x9216272158F563488FfC36AFB877acA2F265C560",
  XEETH: "0xACB3604AaDF26e6C0bb8c720420380629A328d2C",
  WE_POOL_A: "0xc2DeF1E39FF35367F2F2a312a793477C576fD4c3",
  WE_POOL_B: "0x7EB0ed173480299e1310d55E04Ece401c2B06626",
  WEETH_WHALE: "0xBdfa7b7893081B35Fb54027489e2Bc7A38275129",
  RUSD_WHALE: "0x6dc7a100d09DDbF344FC4Dd0398f79500D0c2716",
  FXN: "0x365AccFCa291e7D3914637ABf1F7635dB165Bb09",
};
const IMPL = { fxusd: "0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd", treasury: "0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC", pool: "0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5" };
const EZ_VAULTS = ["0x4A036ab673722468a8e1fCC0F74A2dD5914FD1c1","0x4c75A7349B20745DAf37E6C348b85E8a03F72F9A","0x0Fa286332b2d1bBB0c7637CD63BA742a050b5AAd","0x7DCe6D8752A0e2fCF3cE92e9CeAdf9857F920ACc","0xCbE9e9E80b5301956c12FbB40742b144f98d4e63","0x492550DDcc5349940A879cAf4d3CFFfaa1Ab0F64"];
const XEZ_VAULTS = ["0xC68A2AE2b932C472Fd4Ad4367FF6e093E4E3Da8f","0x3b0c2E02b0F3a4f507bA8F39aB3Ea93BF4863a90","0x9af69159D25e213a35A2b6E7274023Da2D2bdaC6","0x1090988Cf5569cc811756220AC3160aA028988AA"];
const E = 10n ** 18n;
const f = (v: bigint) => ethers.formatUnits(v, 18);
let P = 0, F = 0; const FAILS: string[] = [];
const ck = (l: string, c: boolean, d = "") => { if (c) { P++; console.log("  PASS  " + l + (d ? "  " + d : "")); } else { F++; FAILS.push(l + " " + d); console.log("  FAIL  " + l + (d ? "  " + d : "")); } };
const note = (s: string) => console.log("  NOTE  " + s);
const errOf = (e: any) => { const m = (e.shortMessage || e.message || "").toString(); return m.includes("panic code 0x12") ? "DIV/0" : m.replace(/^.*custom error /, "").replace(/^VM Exception[^:]*: /, "").slice(0, 60); };
async function imp(a: string) { await network.provider.send("hardhat_impersonateAccount", [a]); await network.provider.send("hardhat_setBalance", [a, "0x21e19e0c9bab2400000"]); return await ethers.getSigner(a); }
const snap = async () => await network.provider.send("evm_snapshot", []);
const back = async (s: string) => { await network.provider.send("evm_revert", [s]); };
const implOf = async (p: string) => "0x" + (await network.provider.send("eth_getStorageAt", [p, "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", "latest"])).slice(26);

const ERC20 = ["function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)", "function transfer(address,uint256) returns (bool)", "function approve(address,uint256) returns (bool)"];
const RUSD_ABI = ["function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)", "function markets(address) view returns (address,address,address,uint256,uint256)", "function getMarkets() view returns (address[])", "function getRebalancePools() view returns (address[])", "function nav() view returns (uint256)", "function isUnderCollateral() view returns (bool)", "function mint(address,uint256,address,uint256) returns (uint256)", "function redeem(address,uint256,address,uint256) returns (uint256,uint256)", "function autoRedeem(uint256,address,uint256[]) returns (address[],uint256[],uint256[])", "function wrap(address,uint256,address)", "function earn(address,uint256,address)", "function mintAndEarn(address,uint256,address,uint256)", "function redeemFrom(address,uint256,address,uint256) returns (uint256,uint256)", "function removeMarket(address)", "function removeRebalancePools(address[])", "function updateMintCap(address,uint256)", "function initializeWindDown(uint256,uint256,uint256,uint256,uint256)"];
const T_ABI = ["function initializeWindDown(uint256,uint256,uint256,uint256,uint256)", "function windDownPreviewRedeem(uint256,uint256) view returns (uint256)", "function totalBaseToken() view returns (uint256)", "function baseTokenCap() view returns (uint256)", "function strategy() view returns (address)", "function priceOracle() view returns (address)", "function rateProvider() view returns (address)", "function platform() view returns (address)", "function rebalancePoolSplitter() view returns (address)", "function collateralRatio() view returns (uint256)", "function currentBaseTokenPrice() view returns (uint256)", "function getUnderlyingValue(uint256) view returns (uint256)", "function updateBaseTokenCap(uint256)", "function getRebalancePoolRatio() view returns (uint256)", "function getHarvesterRatio() view returns (uint256)", "function referenceBaseTokenPrice() view returns (uint256)"];
const M_ABI = ["function updateRedeemFeeRatio(uint256,int256,bool)", "function updateMintStatus(bool)", "function updateRedeemStatus(bool)", "function mintPaused() view returns (bool)", "function redeemPaused() view returns (bool)", "function fTokenMintPausedInStabilityMode() view returns (bool)", "function xTokenRedeemPausedInStabilityMode() view returns (bool)", "function stabilityRatio() view returns (uint256)", "function fTokenRedeemFeeRatio() view returns (uint256,int256)", "function xTokenRedeemFeeRatio() view returns (uint256,int256)", "function fTokenMintFeeRatio() view returns (uint256,int256)", "function xTokenMintFeeRatio() view returns (uint256,int256)", "function platform() view returns (address)", "function reservePool() view returns (address)", "function registry() view returns (address)", "function fxUSD() view returns (address)", "function redeemFToken(uint256,address,uint256) returns (uint256,uint256)", "function mintFToken(uint256,address,uint256) returns (uint256)"];
const P_ABI = ["function windDown(uint256,uint256) returns (uint256,uint256)", "function checkpoint(address)", "function claim(address,address)", "function claimable(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)", "function asset() view returns (address)", "function deposit(uint256,address)", "function withdraw(uint256,address)", "function getActiveRewardTokens() view returns (address[])"];

async function main() {
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: RPC } }] });
  await network.provider.send("evm_mine", []);
  const [dev] = await ethers.getSigners();
  const safe = await imp(A.SAFE);
  const ez = new ethers.Contract(A.EZETH, ERC20, ethers.provider);
  const fez = new ethers.Contract(A.FEZETH, ERC20, ethers.provider);
  const xez = new ethers.Contract(A.XEZETH, ERC20, ethers.provider);
  const weeth = new ethers.Contract(A.WEETH, ERC20, ethers.provider);
  const feeth = new ethers.Contract(A.FEETH, ERC20, ethers.provider);
  const xeeth = new ethers.Contract(A.XEETH, ERC20, ethers.provider);
  const R = new ethers.Contract(A.RUSD, RUSD_ABI, ethers.provider);
  const T = new ethers.Contract(A.EZ_TREASURY, T_ABI, ethers.provider);
  const WT = new ethers.Contract(A.WEETH_TREASURY, T_ABI, ethers.provider);
  const Mk = new ethers.Contract(A.EZ_MARKET, M_ABI, ethers.provider);
  const WMk = new ethers.Contract(A.WEETH_MARKET, M_ABI, ethers.provider);

  // ---------- 升级前全量快照 ----------
  const snapshot = async () => ({
    rusdSupply: await R.totalSupply(),
    weManaged: (await R.markets(A.WEETH))[4],
    ezManaged: (await R.markets(A.EZETH))[4],
    weMintCap: (await R.markets(A.WEETH))[3],
    rusdFeeth: await feeth.balanceOf(A.RUSD),
    rusdXeeth: await xeeth.balanceOf(A.RUSD),
    feethSupply: await feeth.totalSupply(),
    xeethSupply: await xeeth.totalSupply(),
    weTreasImpl: await implOf(A.WEETH_TREASURY),
    weMarketImpl: await implOf(A.WEETH_MARKET),
    ezMarketImpl: await implOf(A.EZ_MARKET),
    wePoolAImpl: await implOf(A.WE_POOL_A),
    wePoolBImpl: await implOf(A.WE_POOL_B),
    weTotalBase: await WT.totalBaseToken(),
    weCap: await WT.baseTokenCap(),
    weStrategy: await WT.strategy(),
    weOracle: await WT.priceOracle(),
    weRate: await WT.rateProvider(),
    wePlatform: await WT.platform(),
    weSplitter: await WT.rebalancePoolSplitter(),
    weRpRatio: await WT.getRebalancePoolRatio(),
    weHvRatio: await WT.getHarvesterRatio(),
    weBal: await weeth.balanceOf(A.WEETH_TREASURY),
    weMktMintPaused: await WMk.mintPaused(),
    weMktRedeemPaused: await WMk.redeemPaused(),
    weMktStab: await WMk.stabilityRatio(),
    weMktFRedeem: (await WMk.fTokenRedeemFeeRatio()).map((x: any) => x.toString()).join(","),
    weMktXRedeem: (await WMk.xTokenRedeemFeeRatio()).map((x: any) => x.toString()).join(","),
    weMktFMint: (await WMk.fTokenMintFeeRatio()).map((x: any) => x.toString()).join(","),
    weMktXMint: (await WMk.xTokenMintFeeRatio()).map((x: any) => x.toString()).join(","),
    wePoolASupply: await (new ethers.Contract(A.WE_POOL_A, P_ABI, ethers.provider)).totalSupply(),
    wePoolBSupply: await (new ethers.Contract(A.WE_POOL_B, P_ABI, ethers.provider)).totalSupply(),
    ezReserve: await Mk.reservePool(),
    ezRegistry: await Mk.registry(),
  });
  const pre = await snapshot();

  console.log("=== 0. 升级前 rUSD 全局不变量 ===");
  ck("rUSD totalSupply == sum(managed)", pre.rusdSupply === pre.weManaged + pre.ezManaged,
    `${f(pre.rusdSupply)} vs ${f(pre.weManaged)} + ${f(pre.ezManaged)} = ${f(pre.weManaged + pre.ezManaged)}`);
  ck("rUSD feETH 余额 == weETH managed", pre.rusdFeeth === pre.weManaged, f(pre.rusdFeeth));
  ck("rUSD fezETH 余额 == ezETH managed", (await fez.balanceOf(A.RUSD)) === pre.ezManaged, f(pre.ezManaged));

  // ---------- 执行批次(补齐 checkpoint 后的 22 步) ----------
  const tl = await imp(A.TIMELOCK);
  const pa = new ethers.Contract(A.PROXY_ADMIN, ["function upgrade(address,address)"], tl);
  const mkS = new ethers.Contract(A.EZ_MARKET, M_ABI, safe);
  await (await mkS.updateMintStatus(true)).wait();
  await (await mkS.updateRedeemStatus(true)).wait();
  for (const [px, im] of [[A.RUSD, IMPL.fxusd], [A.EZ_TREASURY, IMPL.treasury], [A.EZ_POOL, IMPL.pool], [A.XEZ_POOL, IMPL.pool]]) await (await pa.upgrade(px, im)).wait();

  console.log("\n=== 1. 升级后、批次三之前:weETH 侧与 rUSD 是否受影响 ===");
  ck("weETH Treasury impl 未变", (await implOf(A.WEETH_TREASURY)) === pre.weTreasImpl);
  ck("weETH Market impl 未变", (await implOf(A.WEETH_MARKET)) === pre.weMarketImpl);
  ck("ezETH Market impl 未变", (await implOf(A.EZ_MARKET)) === pre.ezMarketImpl);
  ck("weETH 两个 Pool impl 未变", (await implOf(A.WE_POOL_A)) === pre.wePoolAImpl && (await implOf(A.WE_POOL_B)) === pre.wePoolBImpl);
  ck("rUSD 全局不变量仍成立", (await R.totalSupply()) === (await R.markets(A.WEETH))[4] + (await R.markets(A.EZETH))[4]);
  ck("rUSD.isUnderCollateral() 可调用且为 false", (await R.isUnderCollateral()) === false);
  try { const n = await R.nav(); ck("rUSD.nav() 可读", n > 0n, f(n)); } catch (e: any) { ck("rUSD.nav() 可读", false, errOf(e)); }

  console.log("\n=== 2. 设计文档提到但批次未覆盖的两条,是否有实际影响 ===");
  {
    const s = await snap();
    const cap = (await R.markets(A.EZETH))[3];
    note(`rUSD ezETH mintCap 当前 = ${cap === ethers.MaxUint256 ? "type(uint256).max" : f(cap)}(设计文档要求设为 0,批次未设)`);
    const w = await imp(A.RUSD_WHALE);
    const src = await imp(A.WEETH_WHALE);
    await (await (weeth.connect(src) as any).transfer(A.RUSD_WHALE, E)).wait();
    await (await (weeth.connect(w) as any).approve(A.RUSD, E)).wait();
    for (const [label, fn] of [
      ["rUSD.mint(ezETH, ...)", async () => await (R.connect(w) as any).mint.staticCall(A.EZETH, E, A.RUSD_WHALE, 0)],
      ["rUSD.wrap(ezETH, ...)", async () => await (R.connect(w) as any).wrap.staticCall(A.EZETH, 1, A.RUSD_WHALE)],
      ["rUSD.earn(ezPool, ...)", async () => await (R.connect(w) as any).earn.staticCall(A.EZ_POOL, 1, A.RUSD_WHALE)],
      ["rUSD.mintAndEarn(ezPool, ...)", async () => await (R.connect(w) as any).mintAndEarn.staticCall(A.EZ_POOL, E, A.RUSD_WHALE, 0)],
    ] as const) {
      try { await (fn as any)(); ck(`  ${label} 被挡住`, false, "(未回滚 -> mintCap 为 0 才是必要的)"); }
      catch (e: any) { ck(`  ${label} 被挡住`, true, errOf(e)); }
    }
    note("即使 mintCap 不为 0,ezETH 侧所有新增敞口入口都已被 Market pause + Treasury mint revert 挡住");
    await back(s);
  }
  {
    const s = await snap();
    const before = { ezA: await ez.balanceOf(A.EZ_POOL), fxnA: await (new ethers.Contract(A.FXN, ERC20, ethers.provider)).balanceOf(A.EZ_POOL) };
    const Pl = new ethers.Contract(A.EZ_POOL, P_ABI, ethers.provider);
    for (const v of EZ_VAULTS) await (await (Pl.connect(dev) as any).checkpoint(v)).wait();
    let owed = 0n; for (const v of EZ_VAULTS) owed += await Pl.claimable(v, A.EZETH);
    ck("checkpoint 一并完成了设计文档第 2 条(结算待分配 reward)", owed > 0n,
      `checkpoint 后 6 人合计可领 ${f(owed)} ezETH,池内 ${f(before.ezA)}`);
    await back(s);
  }

  console.log("\n=== 3. 执行完整 22 步批次 ===");
  const B = await ez.balanceOf(A.EZ_TREASURY), Fs = await fez.totalSupply(), X = await xez.totalSupply();
  const rp = new ethers.Contract("0xE3fF08070aB3aD7eeE7a1cab35105F27DF8EfF10", ["function getRate() view returns (uint256)"], ethers.provider);
  const cl = new ethers.Contract("0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"], ethers.provider);
  const Pez = ((BigInt((await cl.latestRoundData())[1]) * 10n ** 10n) * (await rp.getRate())) / E;
  const fW = Fs, xW = (B * Pez) / E - Fs;
  const TS = new ethers.Contract(A.EZ_TREASURY, T_ABI, safe);
  const RS = new ethers.Contract(A.RUSD, RUSD_ABI, safe);
  const WTS = new ethers.Contract(A.WEETH_TREASURY, T_ABI, safe);
  await (await mkS.updateRedeemFeeRatio(0, 0, true)).wait();
  await (await mkS.updateRedeemFeeRatio(0, 0, false)).wait();
  await (await TS.initializeWindDown(B, Fs, X, fW, xW)).wait();
  const ezManaged = (await R.markets(A.EZETH))[4];
  const safeRUsd = await R.balanceOf(A.SAFE);
  const need = ezManaged > safeRUsd ? ezManaged - safeRUsd : 0n;
  const price: bigint = await WT.currentBaseTokenPrice();
  const fPerWe = ((await WT.getUnderlyingValue(E)) * price) / E;
  const weIn = (((need * E + fPerWe - 1n) / fPerWe) * 105n) / 100n;
  await (await WTS.updateBaseTokenCap((await WT.totalBaseToken()) + ((await WT.getUnderlyingValue(weIn)) * 120n) / 100n)).wait();
  { const src = await imp(A.WEETH_WHALE); await (await (weeth.connect(src) as any).transfer(A.SAFE, weIn)).wait(); }
  await (await (weeth.connect(safe) as any).approve(A.RUSD, weIn)).wait();
  await (await RS.mint(A.WEETH, weIn, A.SAFE, need)).wait();
  await (await mkS.updateRedeemStatus(false)).wait();
  await (await RS.redeem(A.EZETH, ezManaged, A.SAFE, 0)).wait();
  await (await RS.removeMarket(A.EZETH)).wait();
  await (await RS.removeRebalancePools([A.EZ_POOL, A.XEZ_POOL])).wait();
  for (const [pool, list] of [[A.EZ_POOL, EZ_VAULTS], [A.XEZ_POOL, XEZ_VAULTS]] as const) {
    const Pl = new ethers.Contract(pool, P_ABI, safe);
    for (const v of list) await (await (Pl as any).checkpoint(v)).wait();
    const bal = await fez.balanceOf(pool);
    await (await (Pl as any).windDown(bal, 0)).wait();
  }
  console.log("  22 步执行完毕");

  console.log("\n=== 3b. 在同一批次末尾把 weETH baseTokenCap 改回 0 ===");
  {
    const before = await WT.baseTokenCap();
    await (await WTS.updateBaseTokenCap(0)).wait();
    ck("批次内可以把 cap 直接改回 0", (await WT.baseTokenCap()) === 0n, `${f(before)} -> 0`);
    const w2 = await imp(A.RUSD_WHALE);
    const src2 = await imp(A.WEETH_WHALE);
    await (await (weeth.connect(src2) as any).transfer(A.RUSD_WHALE, E)).wait();
    await (await (weeth.connect(w2) as any).approve(A.RUSD, E)).wait();
    try { await (R.connect(w2) as any).mint.staticCall(A.WEETH, E, A.RUSD_WHALE, 0); ck("  cap 归 0 后 weETH mint 被挡住", false, "(仍可 mint)"); }
    catch (e: any) { ck("  cap 归 0 后 weETH mint 被挡住", errOf(e).includes("0x2cbf45d6"), errOf(e)); }
    try { await (R.connect(w2) as any).redeem.staticCall(A.WEETH, E, A.RUSD_WHALE, 0); ck("  cap 归 0 不影响 redeem", true); }
    catch (e: any) { ck("  cap 归 0 不影响 redeem", false, errOf(e)); }
    const Pl = new ethers.Contract(A.WE_POOL_A, P_ABI, ethers.provider);
    try { await (await (Pl.connect(dev) as any).claim("0xE0Fd85F791Ef2211aD9b421070AD29E6405c133b", ethers.ZeroAddress)).wait(); ck("  cap 归 0 不影响 weETH pool claim", true); }
    catch (e: any) { ck("  cap 归 0 不影响 weETH pool claim", false, errOf(e)); }
  }

  console.log("\n=== 4. rUSD 全局不变量与 weETH 侧回归 ===");
  const post = await snapshot();
  ck("rUSD totalSupply == sum(managed)(现在只剩 weETH 一个市场)", post.rusdSupply === post.weManaged,
    `${f(post.rusdSupply)} vs ${f(post.weManaged)}`);
  ck("rUSD feETH 余额 == weETH managed", post.rusdFeeth === post.weManaged, f(post.rusdFeeth));
  ck("rUSD 原有 feETH 未被转出", post.rusdFeeth >= pre.rusdFeeth, `${f(pre.rusdFeeth)} -> ${f(post.rusdFeeth)}`);
  ck("rUSD xeETH 余额未变", post.rusdXeeth === pre.rusdXeeth);
  ck("xeETH totalSupply 未变", post.xeethSupply === pre.xeethSupply);
  ck("weETH Treasury impl / Market impl / 两个 weETH Pool impl 全部未变",
    post.weTreasImpl === pre.weTreasImpl && post.weMarketImpl === pre.weMarketImpl &&
    post.wePoolAImpl === pre.wePoolAImpl && post.wePoolBImpl === pre.wePoolBImpl);
  ck("weETH Treasury strategy / oracle / rateProvider / platform / splitter 未变",
    post.weStrategy === pre.weStrategy && post.weOracle === pre.weOracle && post.weRate === pre.weRate &&
    post.wePlatform === pre.wePlatform && post.weSplitter === pre.weSplitter);
  ck("weETH Treasury rebalancePool / harvester 分成比例未变", post.weRpRatio === pre.weRpRatio && post.weHvRatio === pre.weHvRatio);
  ck("weETH Market 四组费率、稳定阈值、暂停状态全部未变",
    post.weMktFRedeem === pre.weMktFRedeem && post.weMktXRedeem === pre.weMktXRedeem &&
    post.weMktFMint === pre.weMktFMint && post.weMktXMint === pre.weMktXMint &&
    post.weMktStab === pre.weMktStab && post.weMktMintPaused === pre.weMktMintPaused && post.weMktRedeemPaused === pre.weMktRedeemPaused);
  ck("weETH 两个 Pool totalSupply 未变", post.wePoolASupply === pre.wePoolASupply && post.wePoolBSupply === pre.wePoolBSupply);
  ck("ezETH Market reservePool / registry 未变", post.ezReserve === pre.ezReserve && post.ezRegistry === pre.ezRegistry);
  note(`weETH Treasury totalBaseToken ${f(pre.weTotalBase)} -> ${f(post.weTotalBase)}  (+${f(post.weTotalBase - pre.weTotalBase)})`);
  note(`weETH Treasury baseTokenCap  ${f(pre.weCap)} -> ${f(post.weCap)}  <- 事后需恢复`);
  note(`feETH totalSupply ${f(pre.feethSupply)} -> ${f(post.feethSupply)}  (+${f(post.feethSupply - pre.feethSupply)})`);
  ck("feETH 增量 == rUSD feETH 增量(没有多铸给别人)", post.feethSupply - pre.feethSupply === post.rusdFeeth - pre.rusdFeeth,
    `${f(post.feethSupply - pre.feethSupply)}`);

  console.log("\n=== 5. 批次后 rUSD 用户路径回归 ===");
  const whale = await imp(A.RUSD_WHALE);
  const wbal = await R.balanceOf(A.RUSD_WHALE);
  console.log(`  rUSD 大户 ${A.RUSD_WHALE} 余额 ${f(wbal)}`);
  for (const [label, fn] of [
    ["redeem(weETH, 1e18)", async () => await (R.connect(whale) as any).redeem.staticCall(A.WEETH, E, A.RUSD_WHALE, 0)],
    ["autoRedeem(1e18, [0])  <- 单元素数组", async () => await (R.connect(whale) as any).autoRedeem.staticCall(E, A.RUSD_WHALE, [0])],
    ["autoRedeem(全部余额, [0])", async () => await (R.connect(whale) as any).autoRedeem.staticCall(wbal, A.RUSD_WHALE, [0])],
  ] as const) {
    try { await (fn as any)(); ck(`  ${label} 正常`, true); }
    catch (e: any) { ck(`  ${label} 正常`, false, errOf(e)); }
  }
  try { await (R.connect(whale) as any).autoRedeem.staticCall(E, A.RUSD_WHALE, [0, 0]); ck("  autoRedeem 用旧的双元素数组会回滚(接口变更)", false, "(未回滚)"); }
  catch (e: any) { ck("  autoRedeem 用旧的双元素数组会回滚(接口变更)", true, errOf(e)); }
  {
    const src = await imp(A.WEETH_WHALE);
    await (await (weeth.connect(src) as any).transfer(A.RUSD_WHALE, 2n * E)).wait();
    await (await (weeth.connect(whale) as any).approve(A.RUSD, 2n * E)).wait();
    try { const m = await (R.connect(whale) as any).mint.staticCall(A.WEETH, E, A.RUSD_WHALE, 0); ck("  mint(weETH) 正常", m > 0n, f(m)); }
    catch (e: any) { ck("  mint(weETH) 正常", false, errOf(e)); }
    try { await (R.connect(whale) as any).mintAndEarn.staticCall(A.WE_POOL_A, E, A.RUSD_WHALE, 0); ck("  mintAndEarn(weETH pool) 按 cap 被挡住", false, "(未回滚)"); }
    catch (e: any) { ck("  mintAndEarn(weETH pool) 按 cap 被挡住", errOf(e).includes("0x2cbf45d6"), errOf(e)); }
  }
  for (const [label, pool] of [["weETH pool A", A.WE_POOL_A], ["weETH pool B", A.WE_POOL_B]] as const) {
    const pl = (await R.getRebalancePools()).map((x: string) => x.toLowerCase());
    ck(`  ${label} 仍在 rUSD 支持列表`, pl.includes(pool.toLowerCase()));
  }
  {
    const feethWhale = await imp(A.RUSD);
    const rusdSigner = await imp(A.RUSD);
    await (await (feeth.connect(rusdSigner) as any).transfer(A.RUSD_WHALE, E)).wait();
    await (await (feeth.connect(whale) as any).approve(A.RUSD, E)).wait();
    try { await (R.connect(whale) as any).wrap.staticCall(A.WEETH, E, A.RUSD_WHALE); ck("  wrap(weETH feETH -> rUSD) 正常", true); }
    catch (e: any) { ck("  wrap(weETH feETH -> rUSD) 正常", false, errOf(e)); }
  }

  console.log("\n=== 6. weETH 两个 Pool 的存款人是否受影响 ===");
  for (const [label, pool] of [["weETH pool A", A.WE_POOL_A], ["weETH pool B", A.WE_POOL_B]] as const) {
    const Pl = new ethers.Contract(pool, P_ABI, ethers.provider);
    const stakers = label.endsWith("A")
      ? ["0xE0Fd85F791Ef2211aD9b421070AD29E6405c133b", "0xe21a01A78C9E0c983a653b919600B0276Da62B08", "0xe474948E45E03648a2042Cb2747Ed1ac6EC7DCfd"]
      : ["0x572cCcfad655dba513271Df9f41248eaFd4bCA33", "0xeFD48016c1787dB417b5D4DDfEDf4F6736803860", "0xF15191f3f3DAf02e5515DE72A19801Ac3727ec60"];
    let ok = 0;
    for (const st of stakers) {
      try { await (await (Pl.connect(dev) as any).claim(st, ethers.ZeroAddress)).wait(); ok++; }
      catch (e: any) { console.log(`    ${label} ${st.slice(0, 10)} claim -> ${errOf(e)}`); }
    }
    ck(`  ${label} 3 个存款人仍可正常 claim`, ok === 3, `${ok}/3`);
  }

  console.log("\n=== 7. ezETH 侧收尾状态 ===");
  ck("ezETH market 已从 rUSD 移除", !(await R.getMarkets()).map((x: string) => x.toLowerCase()).includes(A.EZETH.toLowerCase()));
  ck("两个 ezETH Pool 已移除", !(await R.getRebalancePools()).map((x: string) => x.toLowerCase()).some((x: string) => x === A.EZ_POOL.toLowerCase() || x === A.XEZ_POOL.toLowerCase()));
  ck("两池 fezETH 清零", (await fez.balanceOf(A.EZ_POOL)) === 0n && (await fez.balanceOf(A.XEZ_POOL)) === 0n);
  let allOk = 0, got = 0n;
  for (const [pool, list] of [[A.EZ_POOL, EZ_VAULTS], [A.XEZ_POOL, XEZ_VAULTS]] as const) {
    const Pl = new ethers.Contract(pool, P_ABI, ethers.provider);
    for (const v of list) {
      const c = await Pl.claimable(v, A.EZETH); const b0 = await ez.balanceOf(v);
      try { await (await (Pl.connect(dev) as any).claim(v, ethers.ZeroAddress)).wait(); if ((await ez.balanceOf(v)) - b0 === c) { allOk++; got += c; } } catch (e) { }
    }
  }
  ck("10 个 ezETH 侧存款人全部足额领取", allOk === 10, f(got) + " ezETH");
  ck("ezETH Market mint 仍暂停、redeem 已开放", (await Mk.mintPaused()) === true && (await Mk.redeemPaused()) === false);

  console.log("\n================ 结果 ================");
  console.log(`PASS ${P}   FAIL ${F}`);
  if (F) { console.log("\nFAILURES:"); FAILS.forEach((x) => console.log("  - " + x)); }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

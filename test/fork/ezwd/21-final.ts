import { ethers, network } from "hardhat";
import * as fs from "fs";

const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const DIR = "/tmp/ezwd/safe";
const A: any = {
  EZETH: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", EZ_TREASURY: "0x38965311507D4E54973F81475a149c09376e241e",
  EZ_MARKET: "0x69518D1D70AD537C41401303BDf96032338E40dE", FEZETH: "0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9",
  XEZETH: "0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5", EZ_POOL: "0xf58c499417e36714e99803Cb135f507a95ae7169",
  XEZ_POOL: "0xBa947cba270D30967369Bf1f73884Be2533d7bDB", RUSD: "0x65D72AA8DA931F047169112fcf34f52DbaAE7D18",
  SAFE: "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF", PROXY_ADMIN: "0x9B54B7703551D9d0ced177A78367560a8B2eDDA4",
  TIMELOCK: "0x68863fb8855b04509a835082478D6E3D0bE4E61a", MULTISEND: "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D",
  WEETH: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee", WEETH_TREASURY: "0x781BA968d5cc0b40EB592D5c8a9a3A4000063885",
  WEETH_MARKET: "0x267C6A96Db7422faA60Aa7198FfEeeC4169CD65f", FEETH: "0x9216272158F563488FfC36AFB877acA2F265C560",
  XEETH: "0xACB3604AaDF26e6C0bb8c720420380629A328d2C", WE_POOL_A: "0xc2DeF1E39FF35367F2F2a312a793477C576fD4c3",
  WE_POOL_B: "0x7EB0ed173480299e1310d55E04Ece401c2B06626", WEETH_WHALE: "0xBdfa7b7893081B35Fb54027489e2Bc7A38275129",
  RUSD_WHALE: "0x6dc7a100d09DDbF344FC4Dd0398f79500D0c2716", FXN: "0x365AccFCa291e7D3914637ABf1F7635dB165Bb09",
  XEZ_WHALE: "0xC01Ac9349396935f60d39737EBe352572d1483A2",
};
const IMPL = { fxusd: "0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd", treasury: "0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC", pool: "0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5" };
const EZ_VAULTS = ["0x4A036ab673722468a8e1fCC0F74A2dD5914FD1c1","0x4c75A7349B20745DAf37E6C348b85E8a03F72F9A","0x0Fa286332b2d1bBB0c7637CD63BA742a050b5AAd","0x7DCe6D8752A0e2fCF3cE92e9CeAdf9857F920ACc","0xCbE9e9E80b5301956c12FbB40742b144f98d4e63","0x492550DDcc5349940A879cAf4d3CFFfaa1Ab0F64"];
const XEZ_VAULTS = ["0xC68A2AE2b932C472Fd4Ad4367FF6e093E4E3Da8f","0x3b0c2E02b0F3a4f507bA8F39aB3Ea93BF4863a90","0x9af69159D25e213a35A2b6E7274023Da2D2bdaC6","0x1090988Cf5569cc811756220AC3160aA028988AA"];
const WE_A_STAKERS = ["0xE0Fd85F791Ef2211aD9b421070AD29E6405c133b","0xe21a01A78C9E0c983a653b919600B0276Da62B08","0xe474948E45E03648a2042Cb2747Ed1ac6EC7DCfd","0xf5830FF9B625b60131D82530c51c9e294a9f7478","0x57081166Ff4A1f68E66a79cdf52333d27E2E47E5"];
const WE_B_STAKERS = ["0x572cCcfad655dba513271Df9f41248eaFd4bCA33","0xeFD48016c1787dB417b5D4DDfEDf4F6736803860","0xF15191f3f3DAf02e5515DE72A19801Ac3727ec60","0x4d2f8bA4BddE8f7C3C1d86700D495e30D0CC2587","0xB55d5Bca25262594EC04117946a4A57Da5CC3B56"];
const E = 10n ** 18n;
const f = (v: bigint) => ethers.formatUnits(v, 18);
let P = 0, F = 0; const FAILS: string[] = [];
const ck = (l: string, c: boolean, d = "") => { if (c) { P++; console.log("  PASS  " + l + (d ? "  " + d : "")); } else { F++; FAILS.push(l + "  " + d); console.log("  FAIL  " + l + (d ? "  " + d : "")); } };
const note = (s: string) => console.log("  NOTE  " + s);
const errOf = (e: any) => { const m = (e.shortMessage || e.message || "").toString(); return m.includes("panic code 0x12") ? "DIV/0" : m.replace(/^.*custom error /, "").replace(/^VM Exception[^:]*: /, "").slice(0, 60); };
async function imp(a: string) { await network.provider.send("hardhat_impersonateAccount", [a]); await network.provider.send("hardhat_setBalance", [a, "0x21e19e0c9bab2400000"]); return await ethers.getSigner(a); }
const snap = async () => await network.provider.send("evm_snapshot", []);
const back = async (s: string) => { await network.provider.send("evm_revert", [s]); };
const implOf = async (p: string) => "0x" + (await network.provider.send("eth_getStorageAt", [p, "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", "latest"])).slice(26);

const ERC20 = ["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function transfer(address,uint256) returns (bool)","function approve(address,uint256) returns (bool)"];
const SAFE_ABI = ["function nonce() view returns (uint256)","function getOwners() view returns (address[])","function getThreshold() view returns (uint256)","function domainSeparator() view returns (bytes32)","function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns (bytes32)","function approveHash(bytes32)","function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) payable returns (bool)"];
const RUSD_ABI = ["function totalSupply() view returns (uint256)","function balanceOf(address) view returns (uint256)","function markets(address) view returns (address,address,address,uint256,uint256)","function getMarkets() view returns (address[])","function getRebalancePools() view returns (address[])","function nav() view returns (uint256)","function isUnderCollateral() view returns (bool)","function mint(address,uint256,address,uint256) returns (uint256)","function redeem(address,uint256,address,uint256) returns (uint256,uint256)","function autoRedeem(uint256,address,uint256[]) returns (address[],uint256[],uint256[])","function wrap(address,uint256,address)","function earn(address,uint256,address)","function mintAndEarn(address,uint256,address,uint256)","function redeemFrom(address,uint256,address,uint256) returns (uint256,uint256)"];
const T_ABI = ["function windDownStatus() view returns (uint8)","function windDownBaseBalance() view returns (uint256)","function windDownBaseClaimed() view returns (uint256)","function windDownFBaseBalance() view returns (uint256)","function windDownXBaseBalance() view returns (uint256)","function windDownPreviewRedeem(uint256,uint256) view returns (uint256)","function totalBaseToken() view returns (uint256)","function baseTokenCap() view returns (uint256)","function strategy() view returns (address)","function priceOracle() view returns (address)","function rateProvider() view returns (address)","function platform() view returns (address)","function rebalancePoolSplitter() view returns (address)","function getRebalancePoolRatio() view returns (uint256)","function getHarvesterRatio() view returns (uint256)","function currentBaseTokenPrice() view returns (uint256)","function getUnderlyingValue(uint256) view returns (uint256)"];
const M_ABI = ["function mintPaused() view returns (bool)","function redeemPaused() view returns (bool)","function xTokenRedeemPausedInStabilityMode() view returns (bool)","function fTokenMintPausedInStabilityMode() view returns (bool)","function stabilityRatio() view returns (uint256)","function fTokenRedeemFeeRatio() view returns (uint256,int256)","function xTokenRedeemFeeRatio() view returns (uint256,int256)","function fTokenMintFeeRatio() view returns (uint256,int256)","function xTokenMintFeeRatio() view returns (uint256,int256)","function reservePool() view returns (address)","function registry() view returns (address)","function redeemFToken(uint256,address,uint256) returns (uint256,uint256)","function redeemXToken(uint256,address,uint256) returns (uint256)"];
const P_ABI = ["function checkpoint(address)","function claim(address,address)","function claimable(address,address) view returns (uint256)","function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function deposit(uint256,address)","function withdraw(uint256,address)","function getStakerVoteOwner(address) view returns (address)"];

function encodeTx(t: any) {
  const m = t.contractMethod;
  const types = m.inputs.map((i: any) => i.type);
  const args = m.inputs.map((i: any) => { const v = t.contractInputsValues[i.name]; if (i.type.endsWith("[]")) return JSON.parse(v); if (i.type === "bool") return v === "true"; return v; });
  return ethers.id(`${m.name}(${types.join(",")})`).slice(0, 10) + ethers.AbiCoder.defaultAbiCoder().encode(types, args).slice(2);
}
function multiSend(txs: any[]) {
  let packed = "0x";
  for (const t of txs) { const d = encodeTx(t); packed += "00" + t.to.slice(2).toLowerCase() + ethers.toBeHex(BigInt(t.value || "0"), 32).slice(2) + ethers.toBeHex((d.length - 2) / 2, 32).slice(2) + d.slice(2); }
  return new ethers.Interface(["function multiSend(bytes)"]).encodeFunctionData("multiSend", [packed]);
}
async function execViaSafe(label: string, txs: any[]) {
  const sr = new ethers.Contract(A.SAFE, SAFE_ABI, ethers.provider);
  const owners: string[] = [...(await sr.getOwners())];
  const th = Number(await sr.getThreshold());
  const nonce = await sr.nonce();
  const single = txs.length === 1;
  const to = single ? txs[0].to : A.MULTISEND;
  const data = single ? encodeTx(txs[0]) : multiSend(txs);
  const op = single ? 0 : 1;
  const h = await sr.getTransactionHash(to, 0, data, op, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, nonce);
  const ds = await sr.domainSeparator();
  const TH = ethers.id("SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)");
  const sh = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32","address","uint256","bytes32","uint8","uint256","uint256","uint256","address","address","uint256"], [TH, to, 0, ethers.keccak256(data), op, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, nonce]));
  ck(`${label}: safeTxHash 与独立 EIP-712 复算一致`, ethers.keccak256(ethers.concat(["0x1901", ds, sh])) === h, h);
  const signers = owners.slice(0, th).map((o) => o.toLowerCase()).sort();
  for (const o of signers) { const s = await imp(ethers.getAddress(o)); await (await (new ethers.Contract(A.SAFE, SAFE_ABI, s) as any).approveHash(h)).wait(); }
  let sigs = "0x"; for (const o of signers) sigs += ethers.zeroPadValue(o, 32).slice(2) + "0".repeat(64) + "01";
  const ex = await imp(ethers.getAddress(signers[0]));
  const r = await (await (new ethers.Contract(A.SAFE, SAFE_ABI, ex) as any).execTransaction(to, 0, data, op, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, sigs)).wait();
  ck(`${label}: 真实 ${th}/${owners.length} execTransaction 成功`, r.status === 1, `nonce ${nonce}  ${txs.length} 步  gas ${r.gasUsed}  calldata ${(data.length - 2) / 2} bytes`);
  return { h, gas: r.gasUsed };
}

async function main() {
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: RPC } }] });
  await network.provider.send("evm_mine", []);
  const [dev] = await ethers.getSigners();
  const b1 = JSON.parse(fs.readFileSync(`${DIR}/safe-1-upgrade-schedule.json`, "utf8")).transactions;
  const b2 = JSON.parse(fs.readFileSync(`${DIR}/safe-2-pause-and-execute.json`, "utf8")).transactions;
  const b3 = JSON.parse(fs.readFileSync(`${DIR}/safe-3-operations.json`, "utf8")).transactions;
  console.log(`fork block ${await ethers.provider.getBlockNumber()}   批次 ${b1.length} / ${b2.length} / ${b3.length} 步\n`);
  ck("批次三为 23 步(12 原步 + 10 checkpoint + 1 cap 归零)", b3.length === 23, `${b3.length}`);
  ck("批次三最后一步是 weETH Treasury updateBaseTokenCap", b3[22].to.toLowerCase() === A.WEETH_TREASURY.toLowerCase() && b3[22].contractMethod.name === "updateBaseTokenCap", b3[22].contractInputsValues._baseTokenCap);

  const ez = new ethers.Contract(A.EZETH, ERC20, ethers.provider), fez = new ethers.Contract(A.FEZETH, ERC20, ethers.provider), xez = new ethers.Contract(A.XEZETH, ERC20, ethers.provider);
  const weeth = new ethers.Contract(A.WEETH, ERC20, ethers.provider), feeth = new ethers.Contract(A.FEETH, ERC20, ethers.provider), xeeth = new ethers.Contract(A.XEETH, ERC20, ethers.provider);
  const fxn = new ethers.Contract(A.FXN, ERC20, ethers.provider);
  const R = new ethers.Contract(A.RUSD, RUSD_ABI, ethers.provider), T = new ethers.Contract(A.EZ_TREASURY, T_ABI, ethers.provider);
  const WT = new ethers.Contract(A.WEETH_TREASURY, T_ABI, ethers.provider);
  const Mk = new ethers.Contract(A.EZ_MARKET, M_ABI, ethers.provider), WMk = new ethers.Contract(A.WEETH_MARKET, M_ABI, ethers.provider);
  const snapAll = async () => ({
    rusdSupply: await R.totalSupply(), weManaged: (await R.markets(A.WEETH))[4], ezManaged: (await R.markets(A.EZETH))[4],
    rusdFeeth: await feeth.balanceOf(A.RUSD), rusdXeeth: await xeeth.balanceOf(A.RUSD),
    feethSupply: await feeth.totalSupply(), xeethSupply: await xeeth.totalSupply(),
    weTreasImpl: await implOf(A.WEETH_TREASURY), weMarketImpl: await implOf(A.WEETH_MARKET), ezMarketImpl: await implOf(A.EZ_MARKET),
    wePoolA: await implOf(A.WE_POOL_A), wePoolB: await implOf(A.WE_POOL_B),
    weTotalBase: await WT.totalBaseToken(), weCap: await WT.baseTokenCap(), weStrategy: await WT.strategy(),
    weOracle: await WT.priceOracle(), weRate: await WT.rateProvider(), wePlatform: await WT.platform(), weSplitter: await WT.rebalancePoolSplitter(),
    weRp: await WT.getRebalancePoolRatio(), weHv: await WT.getHarvesterRatio(), weBal: await weeth.balanceOf(A.WEETH_TREASURY),
    weMintP: await WMk.mintPaused(), weRedeemP: await WMk.redeemPaused(), weStab: await WMk.stabilityRatio(),
    weFR: (await WMk.fTokenRedeemFeeRatio()).map(String).join(), weXR: (await WMk.xTokenRedeemFeeRatio()).map(String).join(),
    weFM: (await WMk.fTokenMintFeeRatio()).map(String).join(), weXM: (await WMk.xTokenMintFeeRatio()).map(String).join(),
    wePoolASupply: await (new ethers.Contract(A.WE_POOL_A, P_ABI, ethers.provider)).totalSupply(),
    wePoolBSupply: await (new ethers.Contract(A.WE_POOL_B, P_ABI, ethers.provider)).totalSupply(),
    ezReserve: await Mk.reservePool(), ezRegistry: await Mk.registry(),
  });
  const pre = await snapAll();

  console.log("\n===== 0. 升级前基线 =====");
  ck("rUSD totalSupply == sum(managed)", pre.rusdSupply === pre.weManaged + pre.ezManaged, `${f(pre.rusdSupply)}`);
  ck("weETH baseTokenCap 当前为 0(mint 本来就关着)", pre.weCap === 0n);
  ck("两池 fezETH 余额 == 各自 totalSupply(会走 100% 清零分支)",
    (await fez.balanceOf(A.EZ_POOL)) === (await (new ethers.Contract(A.EZ_POOL, P_ABI, ethers.provider)).totalSupply()) &&
    (await fez.balanceOf(A.XEZ_POOL)) === (await (new ethers.Contract(A.XEZ_POOL, P_ABI, ethers.provider)).totalSupply()));

  console.log("\n===== 1. 第一轮签名:scheduleBatch =====");
  const r1 = await execViaSafe("批次一", b1);
  const tl = new ethers.Contract(A.TIMELOCK, ["function isOperationPending(bytes32) view returns (bool)","function isOperationDone(bytes32) view returns (bool)","function getMinDelay() view returns (uint256)","function hashOperationBatch(address[],uint256[],bytes[],bytes32,bytes32) view returns (bytes32)"], ethers.provider);
  const iv = b1[0].contractInputsValues;
  const opId = await tl.hashOperationBatch(JSON.parse(iv.targets), JSON.parse(iv.values), JSON.parse(iv.payloads), iv.predecessor, iv.salt);
  ck("Timelock operation pending", await tl.isOperationPending(opId), opId);

  console.log("\n===== 2. 第二轮签名:3 天后 pause + executeBatch =====");
  const gov = await snap();
  await network.provider.send("evm_increaseTime", [Number(await tl.getMinDelay()) + 1]);
  await network.provider.send("evm_mine", []);
  const r2 = await execViaSafe("批次二", b2);
  ck("mint/redeem 均已暂停", (await Mk.mintPaused()) === true && (await Mk.redeemPaused()) === true);
  ck("四个代理升级到位", (await implOf(A.RUSD)) === IMPL.fxusd.toLowerCase() && (await implOf(A.EZ_TREASURY)) === IMPL.treasury.toLowerCase() && (await implOf(A.EZ_POOL)) === IMPL.pool.toLowerCase() && (await implOf(A.XEZ_POOL)) === IMPL.pool.toLowerCase());
  ck("Timelock operation done", await tl.isOperationDone(opId));
  ck("windDownStatus == 0", (await T.windDownStatus()) === 0n);
  ck("xTokenRedeemPausedInStabilityMode 仍为 false", (await Mk.xTokenRedeemPausedInStabilityMode()) === false);
  ck("冻结:两池 deposit 已禁用(存款人名单自此冻结)", await (async () => { try { await (new ethers.Contract(A.EZ_POOL, P_ABI, dev) as any).deposit.staticCall(1, dev.address); return false; } catch { return true; } })());
  await back(gov);
  { const s = await imp(A.SAFE); const m = new ethers.Contract(A.EZ_MARKET, ["function updateMintStatus(bool)","function updateRedeemStatus(bool)"], s);
    await (await m.updateMintStatus(true)).wait(); await (await m.updateRedeemStatus(true)).wait();
    const t = await imp(A.TIMELOCK); const pa = new ethers.Contract(A.PROXY_ADMIN, ["function upgrade(address,address)"], t);
    for (const [px, im] of [[A.RUSD, IMPL.fxusd],[A.EZ_TREASURY, IMPL.treasury],[A.EZ_POOL, IMPL.pool],[A.XEZ_POOL, IMPL.pool]]) await (await pa.upgrade(px, im)).wait(); }
  note("(历史 fork 的 3 天快进会让 weETH 预言机过期,治理路径已单独验证,下面在未快进的时间线上继续)");

  console.log("\n===== 3. 第三轮签名:23 步 operations =====");
  { const need = BigInt(b3.find((t: any) => t.contractMethod.name === "approve").contractInputsValues.amount);
    const w = await imp(A.WEETH_WHALE); await (await (weeth.connect(w) as any).transfer(A.SAFE, need)).wait();
    ck("前置:Safe 已持有所需 weETH", (await weeth.balanceOf(A.SAFE)) >= need, f(need)); }
  const r3 = await execViaSafe("批次三", b3);

  console.log("\n===== 4. ezETH 侧收尾 =====");
  ck("费率两档归零", (await Mk.fTokenRedeemFeeRatio())[0] === 0n && (await Mk.xTokenRedeemFeeRatio())[0] === 0n && (await Mk.xTokenRedeemFeeRatio())[1] === 0n);
  ck("windDownStatus == 1", (await T.windDownStatus()) === 1n);
  ck("rUSD ezETH managed == 0", (await R.markets(A.EZETH))[4] === 0n);
  ck("ezETH market 与两个 pool 已移除", !(await R.getMarkets()).map((x: string) => x.toLowerCase()).includes(A.EZETH.toLowerCase()) && !(await R.getRebalancePools()).map((x: string) => x.toLowerCase()).some((x: string) => x === A.EZ_POOL.toLowerCase() || x === A.XEZ_POOL.toLowerCase()));
  ck("两池 fezETH 清零、xezETH 未被铸造", (await fez.balanceOf(A.EZ_POOL)) === 0n && (await fez.balanceOf(A.XEZ_POOL)) === 0n && (await xez.balanceOf(A.XEZ_POOL)) === 0n);
  ck("mint 仍暂停、redeem 已开放", (await Mk.mintPaused()) === true && (await Mk.redeemPaused()) === false);

  console.log("\n===== 5. 10 个 ezETH 侧存款人逐个领取 =====");
  let ok = 0, got = 0n;
  for (const [name, pool, list] of [["ezPool", A.EZ_POOL, EZ_VAULTS], ["xezPool", A.XEZ_POOL, XEZ_VAULTS]] as const) {
    const Pl = new ethers.Contract(pool, P_ABI, ethers.provider);
    for (const v of list) {
      let c = 0n; try { c = await Pl.claimable(v, A.EZETH); } catch (e: any) { ck(`  ${name} ${v.slice(0, 10)} claimable() 可读`, false, errOf(e)); continue; }
      const b0 = await ez.balanceOf(v);
      try { await (await (Pl.connect(dev) as any).claim(v, ethers.ZeroAddress)).wait(); const g = (await ez.balanceOf(v)) - b0; ck(`  ${name} ${v.slice(0, 10)} 实收 == claimable`, g === c, f(g)); if (g === c) { ok++; got += g; } }
      catch (e: any) { ck(`  ${name} ${v.slice(0, 10)} 领取`, false, errOf(e)); }
    }
  }
  ck("全部 10 个存款人足额领取", ok === 10, `合计 ${f(got)} ezETH`);
  { const Pl = new ethers.Contract(A.EZ_POOL, P_ABI, ethers.provider); const b0 = await ez.balanceOf(EZ_VAULTS[0]);
    await (await (Pl.connect(dev) as any).claim(EZ_VAULTS[0], ethers.ZeroAddress)).wait();
    ck("重复领取为空操作", (await ez.balanceOf(EZ_VAULTS[0])) === b0); }

  console.log("\n===== 6. weETH 侧全量回归 =====");
  const post = await snapAll();
  ck("rUSD totalSupply == weETH managed(唯一剩余市场)", post.rusdSupply === post.weManaged, f(post.rusdSupply));
  ck("rUSD feETH 余额 == weETH managed", post.rusdFeeth === post.weManaged);
  ck("rUSD 原有 feETH 未被转出", post.rusdFeeth >= pre.rusdFeeth, `${f(pre.rusdFeeth)} -> ${f(post.rusdFeeth)}`);
  ck("feETH 增量 == rUSD feETH 增量", post.feethSupply - pre.feethSupply === post.rusdFeeth - pre.rusdFeeth, f(post.feethSupply - pre.feethSupply));
  ck("xeETH totalSupply 与 rUSD 持仓未变", post.xeethSupply === pre.xeethSupply && post.rusdXeeth === pre.rusdXeeth);
  ck("weETH Treasury / Market / 两个 weETH Pool 的 impl 全部未变", post.weTreasImpl === pre.weTreasImpl && post.weMarketImpl === pre.weMarketImpl && post.wePoolA === pre.wePoolA && post.wePoolB === pre.wePoolB);
  ck("ezETH Market impl 未变", post.ezMarketImpl === pre.ezMarketImpl);
  ck("weETH Treasury strategy/oracle/rateProvider/platform/splitter 未变", post.weStrategy === pre.weStrategy && post.weOracle === pre.weOracle && post.weRate === pre.weRate && post.wePlatform === pre.wePlatform && post.weSplitter === pre.weSplitter);
  ck("weETH Treasury 两项分成比例未变", post.weRp === pre.weRp && post.weHv === pre.weHv);
  ck("weETH Market 四组费率 / stabilityRatio / 暂停状态未变", post.weFR === pre.weFR && post.weXR === pre.weXR && post.weFM === pre.weFM && post.weXM === pre.weXM && post.weStab === pre.weStab && post.weMintP === pre.weMintP && post.weRedeemP === pre.weRedeemP);
  ck("weETH 两个 Pool totalSupply 未变", post.wePoolASupply === pre.wePoolASupply && post.wePoolBSupply === pre.wePoolBSupply);
  ck("ezETH Market reservePool / registry 未变", post.ezReserve === pre.ezReserve && post.ezRegistry === pre.ezRegistry);
  ck("★ weETH baseTokenCap 已被批次改回原值", post.weCap === pre.weCap, `${f(pre.weCap)} -> ${f(post.weCap)}`);
  note(`weETH totalBaseToken ${f(pre.weTotalBase)} -> ${f(post.weTotalBase)}  (+${f(post.weTotalBase - pre.weTotalBase)})`);

  console.log("\n===== 7. 批次后用户路径 =====");
  const whale = await imp(A.RUSD_WHALE); const wbal = await R.balanceOf(A.RUSD_WHALE);
  for (const [label, fn, want] of [
    ["rUSD.redeem(weETH)", async () => await (R.connect(whale) as any).redeem.staticCall(A.WEETH, E, A.RUSD_WHALE, 0), true],
    ["rUSD.autoRedeem(单元素数组)", async () => await (R.connect(whale) as any).autoRedeem.staticCall(E, A.RUSD_WHALE, [0]), true],
    ["rUSD.autoRedeem(全部余额)", async () => await (R.connect(whale) as any).autoRedeem.staticCall(wbal, A.RUSD_WHALE, [0]), true],
    ["rUSD.autoRedeem(旧的双元素数组)", async () => await (R.connect(whale) as any).autoRedeem.staticCall(E, A.RUSD_WHALE, [0, 0]), false],
    ["rUSD.mint(weETH)  cap 已归 0", async () => await (R.connect(whale) as any).mint.staticCall(A.WEETH, E, A.RUSD_WHALE, 0), false],
  ] as const) {
    try { await (fn as any)(); ck(`  ${label}`, want === true); }
    catch (e: any) { ck(`  ${label}`, want === false, errOf(e)); }
  }
  { const hs = await imp(A.XEZ_WHALE); const b = await xez.balanceOf(A.XEZ_WHALE); const exp = await T.windDownPreviewRedeem(0, b);
    const out = await (Mk.connect(hs) as any).redeemXToken.staticCall(b, A.XEZ_WHALE, exp);
    ck("  xezETH 大户可按固定比例全额赎回", out === exp, f(exp)); }

  console.log("\n===== 8. weETH 两个 Pool 的存款人未受影响 =====");
  for (const [label, pool, list] of [["weETH pool A", A.WE_POOL_A, WE_A_STAKERS], ["weETH pool B", A.WE_POOL_B, WE_B_STAKERS]] as const) {
    const Pl = new ethers.Contract(pool, P_ABI, ethers.provider);
    let n = 0, shared = 0;
    for (const st of list) {
      if ((await Pl.getStakerVoteOwner(st)) !== ethers.ZeroAddress) shared++;
      try { await (await (Pl.connect(dev) as any).claim(st, ethers.ZeroAddress)).wait(); n++; }
      catch (e: any) { console.log(`    ${st.slice(0, 10)} -> ${errOf(e)}`); }
    }
    ck(`  ${label} ${list.length} 个存款人全部可正常 claim(其中 ${shared} 个共享同一 vote owner)`, n === list.length, `${n}/${list.length}`);
    try { const s2 = await imp(list[0]); await (Pl.connect(s2) as any).withdraw.staticCall(1, list[0]); ck(`  ${label} withdraw 仍可用`, true); }
    catch (e: any) { ck(`  ${label} withdraw 仍可用`, false, errOf(e)); }
  }

  console.log("\n===== 9. 守恒与上限 =====");
  const claimed = await T.windDownBaseClaimed(), cap = await T.windDownBaseBalance();
  ck("windDownBaseClaimed <= windDownBaseBalance", claimed <= cap, `${f(claimed)} / ${f(cap)}`);
  ck("claimed + Treasury 余额 == windDownBaseBalance", claimed + (await ez.balanceOf(A.EZ_TREASURY)) === cap);
  ck("fBase + xBase == B", (await T.windDownFBaseBalance()) + (await T.windDownXBaseBalance()) === cap);

  console.log("\n================ 结果 ================");
  console.log(`PASS ${P}   FAIL ${F}`);
  console.log(`批次一 ${r1.h}  gas ${r1.gas}`);
  console.log(`批次二 ${r2.h}  gas ${r2.gas}`);
  console.log(`批次三 ${r3.h}  gas ${r3.gas}`);
  if (F) { console.log("\nFAILURES:"); FAILS.forEach((x) => console.log("  - " + x)); }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

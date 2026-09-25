import { ethers, network } from "hardhat";
import * as fs from "fs";

const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const A = {
  EZETH: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",
  EZ_TREASURY: "0x38965311507D4E54973F81475a149c09376e241e",
  EZ_MARKET: "0x69518D1D70AD537C41401303BDf96032338E40dE",
  FEZETH: "0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9",
  XEZETH: "0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5",
  EZ_POOL: "0xf58c499417e36714e99803Cb135f507a95ae7169",
  XEZ_POOL: "0xBa947cba270D30967369Bf1f73884Be2533d7bDB",
  RUSD: "0x65D72AA8DA931F047169112fcf34f52DbaAE7D18",
  WEETH: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee",
  WEETH_TREASURY: "0x781BA968d5cc0b40EB592D5c8a9a3A4000063885",
  FEETH: "0x9216272158F563488FfC36AFB877acA2F265C560",
  XEETH: "0xACB3604AaDF26e6C0bb8c720420380629A328d2C",
  WEETH_POOL: "0xc2DeF1E39FF35367F2F2a312a793477C576fD4c3",
  SAFE: "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF",
  PROXY_ADMIN: "0x9b54b7703551d9d0ced177a78367560a8b2edda4",
  TIMELOCK: "0x68863fb8855b04509a835082478D6E3D0bE4E61a",
  FXN: "0x365AccFCa291e7D3914637ABf1F7635dB165Bb09",
  PLATFORM: "0x0084C2e1B1823564e597Ff4848a88D61ac63D703",
  XEZ_WHALE: "0xC01Ac9349396935f60d39737EBe352572d1483A2",
  RUSD_WHALE: "0x6dc7a100d09DDbF344FC4Dd0398f79500D0c2716",
};
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const E = 10n ** 18n;
const f = (v: bigint) => ethers.formatUnits(v, 18);
const ERC20 = ["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function approve(address,uint256) returns (bool)","function transfer(address,uint256) returns (bool)"];
const PA_ABI = ["function upgrade(address,address)","function owner() view returns (address)"];
const MARKET_ABI = ["function redeemFToken(uint256,address,uint256) returns (uint256,uint256)","function redeemXToken(uint256,address,uint256) returns (uint256)","function updateRedeemFeeRatio(uint256,int256,bool)","function fTokenRedeemFeeRatio() view returns (uint256,int256)","function xTokenRedeemFeeRatio() view returns (uint256,int256)"];
const T_ABI = ["function windDownStatus() view returns (uint8)","function windDownBaseBalance() view returns (uint256)","function windDownFBaseBalance() view returns (uint256)","function windDownXBaseBalance() view returns (uint256)","function windDownBaseClaimed() view returns (uint256)","function windDownPreviewRedeem(uint256,uint256) view returns (uint256)","function initializeWindDown(uint256,uint256,uint256,uint256,uint256)","function finalizeWindDown()","function adminClaim()","function isUnderCollateral() view returns (bool)","function totalBaseToken() view returns (uint256)","function updateBaseTokenCap(uint256)","function baseTokenCap() view returns (uint256)","function getUnderlyingValue(uint256) view returns (uint256)","function currentBaseTokenPrice() view returns (uint256)"];
const RUSD_ABI = ["function isUnderCollateral() view returns (bool)","function nav() view returns (uint256)","function totalSupply() view returns (uint256)","function balanceOf(address) view returns (uint256)","function markets(address) view returns (address,address,address,uint256,uint256)","function getMarkets() view returns (address[])","function getRebalancePools() view returns (address[])","function mint(address,uint256,address,uint256) returns (uint256)","function redeem(address,uint256,address,uint256) returns (uint256,uint256)","function autoRedeem(uint256,address,uint256[]) returns (address[],uint256[],uint256[])","function removeMarket(address)","function removeRebalancePools(address[])"];
const POOL_ABI = ["function windDown(uint256,uint256) returns (uint256,uint256)","function adminClaim()","function deposit(uint256,address)","function withdraw(uint256,address)","function withdrawFrom(address,uint256,address)","function totalSupply() view returns (uint256)","function balanceOf(address) view returns (uint256)","function claimable(address,address) view returns (uint256)","function claim(address,address)","function getActiveRewardTokens() view returns (address[])","function getHistoricalRewardTokens() view returns (address[])","function fxn() view returns (address)","function ve() view returns (address)","function veHelper() view returns (address)","function minter() view returns (address)","function liquidate(uint256,uint256) returns (uint256,uint256)"];
const CVX_VAULT = ["function owner() view returns (address)","function pid() view returns (uint256)","function getReward()","function getReward(bool)","function getReward(bool,address[])","function withdraw(uint256)","function rewards() view returns (address)"];

let PASS = 0, FAIL = 0; const NOTES: string[] = [];
const check = (l: string, c: boolean, d = "") => { if (c) { PASS++; console.log("  PASS  " + l + (d ? "  " + d : "")); } else { FAIL++; console.log("  FAIL  " + l + (d ? "  " + d : "")); } };
const note = (s: string) => { NOTES.push(s); console.log("  NOTE  " + s); };
async function rev(l: string, fn: () => Promise<any>, want?: string) {
  try { await fn(); check(l + " reverts", false, "(did NOT revert)"); return "no-revert"; }
  catch (e: any) { const m = (e.shortMessage || e.message || "").toString(); const SEL: any = { ErrorInsufficientBaseOutput: "0x3a1a0aae", ErrorWindDownNotStarted: "ErrorWindDownNotStarted" };
    const ok = !want || m.includes(want) || (SEL[want] && m.includes(SEL[want])); check(l + " reverts" + (want ? ` [${want}]` : ""), ok, ok ? "" : m.slice(0, 130)); return m; }
}
async function imp(a: string) { await network.provider.send("hardhat_impersonateAccount", [a]); await network.provider.send("hardhat_setBalance", [a, "0x21e19e0c9bab2400000"]); return await ethers.getSigner(a); }
const implOf = async (p: string) => "0x" + (await network.provider.send("eth_getStorageAt", [p, IMPL_SLOT, "latest"])).slice(26);
async function setBal(token: string, who: string, amount: bigint) {
  for (let i = 0; i < 90; i++) {
    const slot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [who, i]));
    const before = await network.provider.send("eth_getStorageAt", [token, slot, "latest"]);
    await network.provider.send("hardhat_setStorageAt", [token, slot, ethers.toBeHex(amount, 32)]);
    if ((await new ethers.Contract(token, ERC20, ethers.provider).balanceOf(who)) === amount) return;
    await network.provider.send("hardhat_setStorageAt", [token, slot, before]);
  }
  throw new Error("slot not found " + token);
}

async function main() {
  const H = JSON.parse(fs.readFileSync("/tmp/ezwd/holders.json", "utf8"));
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: RPC } }] });
  await network.provider.send("evm_mine", []);
  console.log("fork block", await ethers.provider.getBlockNumber());
  const [dev] = await ethers.getSigners();
  const ez = new ethers.Contract(A.EZETH, ERC20, ethers.provider);
  const fez = new ethers.Contract(A.FEZETH, ERC20, ethers.provider);
  const xez = new ethers.Contract(A.XEZETH, ERC20, ethers.provider);
  const fxn = new ethers.Contract(A.FXN, ERC20, ethers.provider);
  const weeth = new ethers.Contract(A.WEETH, ERC20, ethers.provider);
  const feeth = new ethers.Contract(A.FEETH, ERC20, ethers.provider);
  const xeeth = new ethers.Contract(A.XEETH, ERC20, ethers.provider);
  const T = new ethers.Contract(A.EZ_TREASURY, T_ABI, ethers.provider);
  const WT = new ethers.Contract(A.WEETH_TREASURY, T_ABI, ethers.provider);
  const M = new ethers.Contract(A.EZ_MARKET, MARKET_ABI, ethers.provider);
  const R = new ethers.Contract(A.RUSD, RUSD_ABI, ethers.provider);
  const EZP = new ethers.Contract(A.EZ_POOL, POOL_ABI, ethers.provider);
  const XEZP = new ethers.Contract(A.XEZ_POOL, POOL_ABI, ethers.provider);
  const safe = await imp(A.SAFE), tl = await imp(A.TIMELOCK);

  const pre = { weImpl: await implOf(A.WEETH_TREASURY), mktImpl: await implOf(A.EZ_MARKET), xeethSupply: await xeeth.totalSupply(), rusdXeeth: await xeeth.balanceOf(A.RUSD), rusdFeeth: await feeth.balanceOf(A.RUSD), weManaged: (await R.markets(A.WEETH))[4], weCap: await WT.baseTokenCap(), rusdSupply: await R.totalSupply() };

  const DEPLOYED = { fxusd: "0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd", treasury: "0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC", pool: "0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5" };
  const fxusdImpl = { getAddress: async () => DEPLOYED.fxusd } as any;
  const treImpl = { getAddress: async () => DEPLOYED.treasury } as any;
  const poolImpl = { getAddress: async () => DEPLOYED.pool } as any;
  for (const [n, a] of Object.entries(DEPLOYED)) check("deployed impl " + n + " has code on the fork", (await ethers.provider.getCode(a)) !== "0x", a);

  // ---- storage layout regression: read a wide set of slots before and after the upgrade ----
  const LAYOUT_TARGETS = [[A.EZ_TREASURY, 60], [A.RUSD, 260], [A.EZ_POOL, 160], [A.XEZ_POOL, 160]] as const;
  const slotsBefore: Record<string, string[]> = {};
  for (const [addr, n] of LAYOUT_TARGETS) { const a: string[] = []; for (let i = 0; i < n; i++) a.push(await network.provider.send("eth_getStorageAt", [addr, ethers.toBeHex(i, 32), "latest"])); slotsBefore[addr] = a; }
  const pa = new ethers.Contract(A.PROXY_ADMIN, PA_ABI, tl);
  for (const [px, im] of [[A.RUSD, await fxusdImpl.getAddress()], [A.EZ_TREASURY, await treImpl.getAddress()], [A.EZ_POOL, await poolImpl.getAddress()], [A.XEZ_POOL, await poolImpl.getAddress()]]) await (await pa.upgrade(px, im)).wait();

  console.log("\n=== 0. Storage layout regression across the upgrade");
  for (const [addr, n] of LAYOUT_TARGETS) {
    const diffs: number[] = [];
    for (let i = 0; i < n; i++) { const now = await network.provider.send("eth_getStorageAt", [addr, ethers.toBeHex(i, 32), "latest"]); if (now !== slotsBefore[addr][i]) diffs.push(i); }
    check(`${addr.slice(0, 10)} slots 0..${n - 1} unchanged by the upgrade`, diffs.length === 0, diffs.length ? "changed: " + diffs.join(",") : `${n} slots`);
  }

  console.log("\n=== 1. rUSD un-bricked by the upgrade, before initializeWindDown");
  check("windDownStatus == 0", (await T.windDownStatus()) === 0n);
  check("rUSD.isUnderCollateral() callable == false", (await R.isUnderCollateral()) === false);
  const whale = await imp(A.RUSD_WHALE);
  const wBal = await R.balanceOf(A.RUSD_WHALE);
  console.log("  rUSD whale", A.RUSD_WHALE, f(wBal));
  try { await (R.connect(whale) as any).redeem.staticCall(A.WEETH, E, A.RUSD_WHALE, 0); check("rUSD.redeem(weETH) works after upgrade", true); } catch (e: any) { check("rUSD.redeem(weETH) works after upgrade", false, (e.shortMessage || "").slice(0, 100)); }
  try { await (R.connect(whale) as any).autoRedeem.staticCall(E, A.RUSD_WHALE, [0, 0]); check("small autoRedeem works after upgrade", true); } catch (e: any) { check("small autoRedeem works after upgrade", false, (e.shortMessage || "").slice(0, 100)); }
  const weM0 = (await R.markets(A.WEETH))[4];
  { const s0 = await network.provider.send("evm_snapshot", []);
    for (const [h] of (H.rusd as any[])) {
      if ((await R.balanceOf(A.RUSD_WHALE)) > weM0 + 5n * E) break;
      if (h.toLowerCase() === A.RUSD_WHALE.toLowerCase()) continue;
      const b: bigint = await R.balanceOf(h); if (b === 0n) continue;
      const hh = await imp(h);
      try { await (await (new ethers.Contract(A.RUSD, ERC20, hh) as any).transfer(A.RUSD_WHALE, b)).wait(); } catch (e) { }
    }
    console.log("    topped whale rUSD to", f(await R.balanceOf(A.RUSD_WHALE)), "vs weETH managed", f(weM0));
    await rev("autoRedeem spilling into the ezETH market (pre-init)", async () => await (R.connect(whale) as any).autoRedeem.staticCall(weM0 + E, A.RUSD_WHALE, [0, 0]), "ErrorWindDownNotStarted");
    await network.provider.send("evm_revert", [s0]); }
  await rev("ezMarket.redeemFToken pre-init", async () => await (M.connect(dev) as any).redeemFToken.staticCall(E, dev.address, 0), "ErrorWindDownNotStarted");

  console.log("\n=== 2. initializeWindDown guards + the weight parameter");
  const B = await ez.balanceOf(A.EZ_TREASURY), F = await fez.totalSupply(), X = await xez.totalSupply();
  const fNav = E, xNav = 346669734551971069n;
  const fW = (F * fNav) / E, xW = (X * xNav) / E;
  console.log("  B", f(B), "F", f(F), "X", f(X), "| fW", f(fW), "xW", f(xW), "f share", (Number(fW * 10000n / (fW + xW)) / 100).toFixed(2) + "%");
  await rev("init with wrong expectedBaseBalance", async () => await (T.connect(safe) as any).initializeWindDown.staticCall(B + 1n, F, X, fW, xW), "ErrorWindDownUnexpectedBaseBalance");
  await rev("init with wrong fSupply", async () => await (T.connect(safe) as any).initializeWindDown.staticCall(B, F + 1n, X, fW, xW), "ErrorWindDownUnexpectedFSupply");
  await rev("init with wrong xSupply", async () => await (T.connect(safe) as any).initializeWindDown.staticCall(B, F, X + 1n, fW, xW), "ErrorWindDownUnexpectedXSupply");
  await rev("init by non-admin", async () => await (T.connect(dev) as any).initializeWindDown.staticCall(B, F, X, fW, xW));
  { const s = await network.provider.send("evm_snapshot", []);
    await (await (T.connect(safe) as any).initializeWindDown(B, F, X, 1n, 0n)).wait();
    note("weights are NOT validated: initializeWindDown(fW=1, xW=0) succeeded -> fBase=" + f(await T.windDownFBaseBalance()) + ", xBase=" + f(await T.windDownXBaseBalance()) + " (xezETH holders would get nothing)");
    await network.provider.send("evm_revert", [s]); }
  await (await (T.connect(safe) as any).initializeWindDown(B, F, X, fW, xW)).wait();
  check("windDownStatus == 1", (await T.windDownStatus()) === 1n);
  check("fBase + xBase == B", (await T.windDownFBaseBalance()) + (await T.windDownXBaseBalance()) === B);
  console.log("  fBaseBalance", f(await T.windDownFBaseBalance()), " xBaseBalance", f(await T.windDownXBaseBalance()));
  await rev("initializeWindDown twice", async () => await (T.connect(safe) as any).initializeWindDown.staticCall(B, F, X, fW, xW), "ErrorWindDownInitialized");

  console.log("\n=== 3. Redeem fee tiers (audit issue 4) measured on-chain");
  for (const [kind, holder, amt] of [["fezETH", A.EZ_POOL, E], ["xezETH", A.XEZ_WHALE, E]] as const) {
    const s = await network.provider.send("evm_snapshot", []);
    const hs = await imp(holder);
    const before = await ez.balanceOf(A.PLATFORM);
    const expected = kind === "fezETH" ? await T.windDownPreviewRedeem(amt, 0) : await T.windDownPreviewRedeem(0, amt);
    const out = kind === "fezETH" ? (await (M.connect(hs) as any).redeemFToken.staticCall(amt, holder, 0))[0] : await (M.connect(hs) as any).redeemXToken.staticCall(amt, holder, 0);
    if (kind === "fezETH") await (await (M.connect(hs) as any).redeemFToken(amt, holder, 0)).wait(); else await (await (M.connect(hs) as any).redeemXToken(amt, holder, 0)).wait();
    const fee = (await ez.balanceOf(A.PLATFORM)) - before;
    note(`fees NOT zeroed: redeem 1 ${kind} -> preview ${f(expected)}, user got ${f(out)}, platform took ${f(fee)} = ${(Number(fee * 1000000n / expected) / 10000).toFixed(4)}%`);
    await network.provider.send("evm_revert", [s]);
  }
  { const s = await network.provider.send("evm_snapshot", []);
    const hs = await imp(A.XEZ_WHALE);
    const expected = await T.windDownPreviewRedeem(0, E);
    await rev("redeemXToken(minOut = wind-down preview) while fee != 0", async () => await (M.connect(hs) as any).redeemXToken.staticCall(E, A.XEZ_WHALE, expected), "ErrorInsufficientBaseOutput");
    await network.provider.send("evm_revert", [s]); }
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0, 0, true)).wait();
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0, 0, false)).wait();
  check("both redeem fee tiers now zero", (await M.fTokenRedeemFeeRatio())[0] === 0n && (await M.xTokenRedeemFeeRatio())[0] === 0n && (await M.xTokenRedeemFeeRatio())[1] === 0n);

  console.log("\n=== 4. Front-running window before the rUSD migration");
  { const s = await network.provider.send("evm_snapshot", []);
    const before = (await R.markets(A.EZETH))[4];
    const amt = before / 10n;
    const out = await (R.connect(whale) as any).redeem.staticCall(A.EZETH, amt, A.RUSD_WHALE, 0);
    await (await (R.connect(whale) as any).redeem(A.EZETH, amt, A.RUSD_WHALE, 0)).wait();
    note(`any rUSD holder can call redeem(ezETH, ${f(amt)}) and take ${f(out[0])} ezETH once wind-down is initialized; managed drifted ${f(before)} -> ${f((await R.markets(A.EZETH))[4])}, so a Safe batch pinned to the old value would revert`);
    await network.provider.send("evm_revert", [s]); }

  console.log("\n=== 5. rUSD backing migration");
  const ezManaged = (await R.markets(A.EZETH))[4];
  check("rUSD fezETH balance == markets(ezETH).managed", (await fez.balanceOf(A.RUSD)) === ezManaged, f(ezManaged));
  const price: bigint = await WT.currentBaseTokenPrice();
  const fPerWeEth = ((await WT.getUnderlyingValue(E)) * price) / E;
  const weIn = ((ezManaged * E + fPerWeEth - 1n) / fPerWeEth) * 102n / 100n;
  check("weETH treasury baseTokenCap currently 0 -> mint blocked", pre.weCap === 0n);
  const newCap = (await WT.totalBaseToken()) + (await WT.getUnderlyingValue(weIn)) + E;
  await (await (WT.connect(safe) as any).updateBaseTokenCap(newCap)).wait();
  note("migration requires raising weETH treasury baseTokenCap 0 -> " + f(newCap) + " (weETH market config is touched)");
  { const src = await imp("0xBdfa7b7893081B35Fb54027489e2Bc7A38275129");
    await (await (new ethers.Contract(A.WEETH, ERC20, src) as any).transfer(A.SAFE, weIn)).wait(); }
  await (await (new ethers.Contract(A.WEETH, ERC20, safe) as any).approve(A.RUSD, weIn)).wait();
  const minted = await (R.connect(safe) as any).mint.staticCall(A.WEETH, weIn, A.SAFE, 0);
  await (await (R.connect(safe) as any).mint(A.WEETH, weIn, A.SAFE, 0)).wait();
  check("Safe minted >= ezETH managed", minted >= ezManaged, f(minted));
  const safeEz0 = await ez.balanceOf(A.SAFE);
  const expectOut = await T.windDownPreviewRedeem(ezManaged, 0);
  const red = await (R.connect(safe) as any).redeem.staticCall(A.EZETH, ezManaged, A.SAFE, expectOut);
  await (await (R.connect(safe) as any).redeem(A.EZETH, ezManaged, A.SAFE, expectOut)).wait();
  check("rUSD redeemed ezETH at the fixed rate", red[0] === expectOut, f(expectOut));
  check("Safe received exactly the preview", (await ez.balanceOf(A.SAFE)) - safeEz0 === expectOut);
  check("markets(ezETH).managed == 0", (await R.markets(A.EZETH))[4] === 0n);
  check("rUSD fezETH balance == 0", (await fez.balanceOf(A.RUSD)) === 0n);
  check("rUSD totalSupply unchanged by the swap", (await R.totalSupply()) === pre.rusdSupply + minted - ezManaged);
  note(`migration economics: Safe supplied ${f(weIn)} weETH (minting ${f(minted)} rUSD of backing) and received ${f(expectOut)} ezETH; leftover rUSD held by Safe = ${f(minted - ezManaged)}`);

  console.log("\n=== 6. removeMarket / removeRebalancePools");
  await (await (R.connect(safe) as any).removeMarket(A.EZETH)).wait();
  await (await (R.connect(safe) as any).removeRebalancePools([A.EZ_POOL, A.XEZ_POOL])).wait();
  check("ezETH market removed", !(await R.getMarkets()).map((x: string) => x.toLowerCase()).includes(A.EZETH.toLowerCase()));
  const pl = (await R.getRebalancePools()).map((x: string) => x.toLowerCase());
  check("both ezETH pools removed, weETH pool kept", !pl.includes(A.EZ_POOL.toLowerCase()) && !pl.includes(A.XEZ_POOL.toLowerCase()) && pl.includes(A.WEETH_POOL.toLowerCase()));
  try { await (R.connect(whale) as any).autoRedeem.staticCall(await R.balanceOf(A.RUSD_WHALE), A.RUSD_WHALE, [0]); check("whale can autoRedeem its full rUSD balance after removal", true); }
  catch (e: any) { check("whale can autoRedeem its full rUSD balance after removal", false, (e.shortMessage || "").slice(0, 110)); }

  console.log("\n=== 7. Pool wind-down (all stakers are Convex f(x) vaults)");
  const poolInfo: any = {};
  for (const [name, P, key] of [["ezPool", EZP, "ezpool"], ["xezPool", XEZP, "xezpool"]] as const) {
    const addr = name === "ezPool" ? A.EZ_POOL : A.XEZ_POOL;
    const bal = await fez.balanceOf(addr), sup = await (P as any).totalSupply();
    check(`${name} fezETH balance == pool totalSupply`, bal === sup, f(bal));
    const ezBefore = await ez.balanceOf(addr);
    const expected = await T.windDownPreviewRedeem(bal, 0);
    await rev(`${name}.deposit`, async () => await (P.connect(dev) as any).deposit.staticCall(1, dev.address), "ErrorWindDownNotAllowed");
    await rev(`${name}.withdraw`, async () => await (P.connect(dev) as any).withdraw.staticCall(1, dev.address), "ErrorWindDownNotAllowed");
    await rev(`${name}.withdrawFrom`, async () => await (P.connect(safe) as any).withdrawFrom.staticCall(dev.address, 1, dev.address), "ErrorWindDownNotAllowed");
    await rev(`${name}.liquidate`, async () => await (P.connect(safe) as any).liquidate.staticCall(1, 0), "ErrorWindDownNotAllowed");
    await rev(`${name}.windDown wrong expected balance`, async () => await (P.connect(safe) as any).windDown.staticCall(bal + 1n, 0), "ErrorWindDownUnexpectedAssetBalance");
    await rev(`${name}.windDown by non-admin`, async () => await (P.connect(dev) as any).windDown.staticCall(bal, 0));
    const stakers: string[] = H[key].map((x: any[]) => x[0]);
    const pre1: any = {};
    for (const s of stakers) pre1[s] = { share: await (P as any).balanceOf(s), ez: await (P as any).claimable(s, A.EZETH), fxn: await (P as any).claimable(s, A.FXN) };
    const r = await (P.connect(safe) as any).windDown.staticCall(bal, expected);
    await (await (P.connect(safe) as any).windDown(bal, expected)).wait();
    check(`${name} liquidated the full balance`, r[0] === bal);
    check(`${name} baseOut == fixed-rate preview`, r[1] === expected, f(expected));
    check(`${name} fezETH -> 0`, (await fez.balanceOf(addr)) === 0n);
    check(`${name} ezETH credited exactly`, (await ez.balanceOf(addr)) - ezBefore === expected);
    check(`${name} totalSupply wiped`, (await (P as any).totalSupply()) === 0n);
    check(`${name} xezETH untouched (wrapper bypassed)`, (await xez.balanceOf(addr)) === 0n);
    await rev(`${name}.windDown a second time`, async () => await (P.connect(safe) as any).windDown.staticCall(0, 0), "ErrorWindDownZeroAsset");
    // distribution fairness across the real stakers
    let sumClaimable = 0n; const rows: string[] = [];
    for (const s of stakers) {
      const c = await (P as any).claimable(s, A.EZETH);
      const gain = c - pre1[s].ez;
      sumClaimable += gain;
      const sharePct = Number(pre1[s].share * 1000000n / bal) / 10000;
      const gainPct = expected === 0n ? 0 : Number(gain * 1000000n / expected) / 10000;
      rows.push(`    ${s.slice(0, 10)} share ${sharePct.toFixed(4)}%  ezETH share ${gainPct.toFixed(4)}%  ${f(gain)}`);
      check(`  ${name} ${s.slice(0, 10)} pro-rata within 1e-6`, Math.abs(sharePct - gainPct) < 0.0001, `${sharePct.toFixed(6)} vs ${gainPct.toFixed(6)}`);
      check(`  ${name} ${s.slice(0, 10)} share wiped to 0`, (await (P as any).balanceOf(s)) === 0n);
    }
    rows.forEach(r2 => console.log(r2));
    check(`${name} sum of newly claimable == baseOut (dust <= 1e-9)`, expected - sumClaimable <= 10n ** 9n && sumClaimable <= expected, f(expected - sumClaimable) + " dust");
    poolInfo[name] = { addr, stakers, expected };
  }

  console.log("\n=== 8. Can a Convex vault owner actually get the ezETH out?");
  for (const [name, P] of [["ezPool", EZP], ["xezPool", XEZP]] as const) {
    const st = poolInfo[name].stakers[0];
    const v = new ethers.Contract(st, CVX_VAULT, ethers.provider);
    let owner = "";
    try { owner = await v.owner(); } catch (e) { }
    const claimable = await (P as any).claimable(st, A.EZETH);
    console.log(`  ${name} vault ${st} owner ${owner} claimable ezETH ${f(claimable)}`);
    // (a) permissionless claim() puts ezETH into the vault
    { const s = await network.provider.send("evm_snapshot", []);
      const b0 = await ez.balanceOf(st);
      await (await (P.connect(dev) as any).claim(st, ethers.ZeroAddress)).wait();
      check(`  ${name} permissionless claim() credits the vault`, (await ez.balanceOf(st)) - b0 === claimable, f(claimable));
      // (b) can the vault owner then pull ezETH out via Convex getReward(bool,address[])?
      const os = await imp(owner);
      const ob0 = await ez.balanceOf(owner);
      let ok = false, why = "";
      try { await (await (v.connect(os) as any)["getReward(bool,address[])"](false, [A.EZETH])).wait(); ok = (await ez.balanceOf(owner)) - ob0 > 0n; }
      catch (e: any) { why = (e.shortMessage || e.message || "").slice(0, 100); }
      check(`  ${name} vault owner extracted ezETH via Convex getReward(bool,address[])`, ok, ok ? f((await ez.balanceOf(owner)) - ob0) : why);
      await network.provider.send("evm_revert", [s]); }
    // (c) does the Convex withdraw path still work?
    { const s = await network.provider.send("evm_snapshot", []);
      const os = await imp(owner);
      await rev(`  ${name} Convex vault withdraw(1) after wind-down`, async () => await (v.connect(os) as any)["withdraw(uint256)"].staticCall(1));
      await network.provider.send("evm_revert", [s]); }
  }

  console.log("\n=== 9. Redeem the remaining supply, then finalize");
  { const hs = await imp(A.XEZ_WHALE);
    const b = await xez.balanceOf(A.XEZ_WHALE);
    const exp = await T.windDownPreviewRedeem(0, b);
    const out = await (M.connect(hs) as any).redeemXToken.staticCall(b, A.XEZ_WHALE, exp);
    await (await (M.connect(hs) as any).redeemXToken(b, A.XEZ_WHALE, exp)).wait();
    check("xezETH whale (99.99% of supply) redeemed at the fixed rate", out === exp, f(exp)); }
  for (const [addr] of (H.xezeth as any[]).slice(1, 8)) {
    const b = await xez.balanceOf(addr); if (b === 0n) continue;
    const hs = await imp(addr);
    try { await (await (M.connect(hs) as any).redeemXToken(b, addr, 0)).wait(); } catch (e: any) { note(`small xezETH holder ${addr.slice(0, 10)} (${f(b)}) could not redeem: ${(e.shortMessage || "").slice(0, 70)}`); }
  }
  for (const [name] of [["ezPool"], ["xezPool"]] as const) { }
  const claimed = await T.windDownBaseClaimed(), cap = await T.windDownBaseBalance();
  check("windDownBaseClaimed <= windDownBaseBalance", claimed <= cap, f(claimed) + " / " + f(cap));
  const treLeft = await ez.balanceOf(A.EZ_TREASURY);
  console.log("  treasury ezETH left", f(treLeft), " unredeemed fezETH", f(await fez.totalSupply()), " xezETH", f(await xez.totalSupply()));
  console.log("  totalBaseToken (accounting) now", f(await T.totalBaseToken()));
  const safeEzPre = await ez.balanceOf(A.SAFE);
  await (await (T.connect(safe) as any).finalizeWindDown()).wait();
  check("windDownStatus == 2", (await T.windDownStatus()) === 2n);
  await rev("redeem after finalize", async () => await (M.connect(dev) as any).redeemFToken.staticCall(E, dev.address, 0), "ErrorWindDownFinalized");
  await (await (T.connect(safe) as any).adminClaim()).wait();
  check("treasury swept to 0", (await ez.balanceOf(A.EZ_TREASURY)) === 0n);
  check("admin received the remainder", (await ez.balanceOf(A.SAFE)) - safeEzPre === treLeft, f(treLeft));

  console.log("\n=== 10. Pool adminClaim vs unclaimed staker rewards");
  for (const [name, P] of [["ezPool", EZP], ["xezPool", XEZP]] as const) {
    const addr = poolInfo[name].addr;
    let cEz = 0n, cFxn = 0n, n = 0;
    for (const s of poolInfo[name].stakers) { const a = await (P as any).claimable(s, A.EZETH), b = await (P as any).claimable(s, A.FXN); if (a > 0n || b > 0n) n++; cEz += a; cFxn += b; }
    const pEz = await ez.balanceOf(addr), pFxn = await fxn.balanceOf(addr);
    console.log(`  ${name}: ${n} stakers still owed ${f(cEz)} ezETH + ${f(cFxn)} FXN; pool holds ${f(pEz)} ezETH + ${f(pFxn)} FXN`);
    await (await (P.connect(safe) as any).adminClaim()).wait();
    check(`${name} adminClaim swept every reward token`, (await ez.balanceOf(addr)) === 0n && (await fxn.balanceOf(addr)) === 0n);
    if (cEz > 0n) {
      note(`${name}: adminClaim() moved ${f(pEz)} ezETH + ${f(pFxn)} FXN to the admin while ${n} stakers were still owed ${f(cEz)} ezETH + ${f(cFxn)} FXN`);
      const victim = poolInfo[name].stakers.find(async (s: string) => (await (P as any).claimable(s, A.EZETH)) > 0n) || poolInfo[name].stakers[0];
      await rev(`  ${name} staker ${victim.slice(0, 10)} claim() AFTER adminClaim`, async () => await (await (P.connect(dev) as any).claim(victim, ethers.ZeroAddress)).wait());
    }
  }

  console.log("\n=== 11. weETH-side invariants");
  check("weETH treasury impl unchanged", (await implOf(A.WEETH_TREASURY)) === pre.weImpl);
  check("ezETH Market impl unchanged", (await implOf(A.EZ_MARKET)) === pre.mktImpl);
  check("xeETH totalSupply unchanged", (await xeeth.totalSupply()) === pre.xeethSupply);
  check("rUSD xeETH balance unchanged", (await xeeth.balanceOf(A.RUSD)) === pre.rusdXeeth);
  const fNow = await feeth.balanceOf(A.RUSD), wmNow = (await R.markets(A.WEETH))[4];
  check("rUSD feETH balance == weETH managed", fNow === wmNow, f(fNow));
  check("rUSD original feETH never moved out", fNow >= pre.rusdFeeth, f(pre.rusdFeeth) + " -> " + f(fNow));
  if ((await WT.baseTokenCap()) !== pre.weCap) note("weETH treasury baseTokenCap left at " + f(await WT.baseTokenCap()) + " (was " + f(pre.weCap) + "); restore it or weETH minting stays open");

  console.log("\n================ RESULT ================\nPASS " + PASS + "  FAIL " + FAIL);
  console.log("\nNOTES:"); NOTES.forEach((n, i) => console.log(` ${i + 1}. ${n}`));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

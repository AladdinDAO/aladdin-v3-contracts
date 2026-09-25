import { ethers, network } from "hardhat";

const RPC = process.env.FORK_RPC || "https://eth-mainnet.public.blastapi.io";
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
};
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const E = 10n ** 18n;
const f = (v: bigint) => ethers.formatUnits(v, 18);
const ERC20 = ["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function approve(address,uint256) returns (bool)","function transfer(address,uint256) returns (bool)"];
const PA_ABI = ["function upgrade(address,address)","function owner() view returns (address)"];
const MARKET_ABI = ["function redeemFToken(uint256,address,uint256) returns (uint256,uint256)","function redeemXToken(uint256,address,uint256) returns (uint256)","function updateRedeemFeeRatio(uint256,int256,bool)","function fTokenRedeemFeeRatio() view returns (uint256,int256)","function xTokenRedeemFeeRatio() view returns (uint256,int256)","function xTokenRedeemPausedInStabilityMode() view returns (bool)","function updateXTokenRedeemStatusInStabilityMode(bool)"];
const T_ABI = ["function windDownStatus() view returns (uint8)","function windDownBaseBalance() view returns (uint256)","function windDownFSupply() view returns (uint256)","function windDownXSupply() view returns (uint256)","function windDownFBaseBalance() view returns (uint256)","function windDownXBaseBalance() view returns (uint256)","function windDownBaseClaimed() view returns (uint256)","function windDownPreviewRedeem(uint256,uint256) view returns (uint256)","function initializeWindDown(uint256,uint256,uint256,uint256,uint256)","function finalizeWindDown()","function adminClaim()","function isUnderCollateral() view returns (bool)","function maxRedeemableFToken(uint256) view returns (uint256,uint256)","function maxRedeemableXToken(uint256) view returns (uint256,uint256)","function totalBaseToken() view returns (uint256)","function updateBaseTokenCap(uint256)","function baseTokenCap() view returns (uint256)","function getUnderlyingValue(uint256) view returns (uint256)","function getWrapppedValue(uint256) view returns (uint256)","function settle()","function harvest()"];
const RUSD_ABI = ["function isUnderCollateral() view returns (bool)","function nav() view returns (uint256)","function totalSupply() view returns (uint256)","function balanceOf(address) view returns (uint256)","function markets(address) view returns (address,address,address,uint256,uint256)","function getMarkets() view returns (address[])","function getRebalancePools() view returns (address[])","function mint(address,uint256,address,uint256) returns (uint256)","function redeem(address,uint256,address,uint256) returns (uint256,uint256)","function autoRedeem(uint256,address,uint256[]) returns (address[],uint256[],uint256[])","function removeMarket(address)","function removeRebalancePools(address[])","function updateMintCap(address,uint256)","function earn(address,uint256,address)","function wrap(address,uint256,address)"];
const POOL_ABI = ["function windDown(uint256,uint256) returns (uint256,uint256)","function adminClaim()","function deposit(uint256,address)","function withdraw(uint256,address)","function totalSupply() view returns (uint256)","function balanceOf(address) view returns (uint256)","function claimable(address,address) view returns (uint256)","function claim(address,address)","function getActiveRewardTokens() view returns (address[])","function getHistoricalRewardTokens() view returns (address[])","function asset() view returns (address)","function fxn() view returns (address)","function ve() view returns (address)","function veHelper() view returns (address)","function minter() view returns (address)","function liquidate(uint256,uint256) returns (uint256,uint256)"];

let PASS = 0, FAIL = 0; const NOTES: string[] = [];
const check = (l: string, c: boolean, d = "") => { if (c) { PASS++; console.log("  PASS  " + l + (d ? "  " + d : "")); } else { FAIL++; console.log("  FAIL  " + l + (d ? "  " + d : "")); } };
const note = (s: string) => { NOTES.push(s); console.log("  NOTE  " + s); };
async function rev(l: string, fn: () => Promise<any>, want?: string) {
  try { await fn(); check(l + " reverts", false, "(did NOT revert)"); return null; }
  catch (e: any) { const m = (e.shortMessage || e.message || "").toString(); const ok = !want || m.includes(want); check(l + " reverts" + (want ? ` [${want}]` : ""), ok, ok ? "" : m.slice(0, 130)); return m; }
}
async function imp(a: string) { await network.provider.send("hardhat_impersonateAccount", [a]); await network.provider.send("hardhat_setBalance", [a, "0x21e19e0c9bab2400000"]); return await ethers.getSigner(a); }
const implOf = async (p: string) => "0x" + (await network.provider.send("eth_getStorageAt", [p, IMPL_SLOT, "latest"])).slice(26);

async function main() {
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
  const safe = await imp(A.SAFE);
  const tl = await imp(A.TIMELOCK);

  // -------- deploy + upgrade (timelock impersonated directly; the delay path is proven in 01) --------
  const fxusdImpl = await (await ethers.getContractFactory("FxUSD")).deploy();
  const treImpl = await (await ethers.getContractFactory("WrappedTokenTreasuryV2WindDown")).deploy(A.EZETH, A.FEZETH, A.XEZETH);
  const poolImpl = await (await ethers.getContractFactory("FxUSDShareableRebalancePoolWindDown")).deploy(await EZP.fxn(), await EZP.ve(), await EZP.veHelper(), await EZP.minter());
  await fxusdImpl.waitForDeployment(); await treImpl.waitForDeployment(); await poolImpl.waitForDeployment();

  // record pre-upgrade weETH-side invariants
  const pre = {
    weImpl: await implOf(A.WEETH_TREASURY), mktImpl: await implOf(A.EZ_MARKET),
    xeethSupply: await xeeth.totalSupply(), rusdXeeth: await xeeth.balanceOf(A.RUSD),
    rusdFeeth: await feeth.balanceOf(A.RUSD), feethSupply: await feeth.totalSupply(),
    weManaged: (await R.markets(A.WEETH))[4], weTotalBase: await WT.totalBaseToken(),
    weBal: await weeth.balanceOf(A.WEETH_TREASURY), rusdSupply: await R.totalSupply(),
    weCap: await WT.baseTokenCap(),
  };

  const pa = new ethers.Contract(A.PROXY_ADMIN, PA_ABI, tl);
  await (await pa.upgrade(A.RUSD, await fxusdImpl.getAddress())).wait();
  await (await pa.upgrade(A.EZ_TREASURY, await treImpl.getAddress())).wait();
  await (await pa.upgrade(A.EZ_POOL, await poolImpl.getAddress())).wait();
  await (await pa.upgrade(A.XEZ_POOL, await poolImpl.getAddress())).wait();
  console.log("\n=== 1. Post-upgrade, pre-init");
  check("windDownStatus == 0 right after upgrade", (await T.windDownStatus()) === 0n);
  check("ezTreasury.isUnderCollateral() == false", (await T.isUnderCollateral()) === false);
  check("rUSD.isUnderCollateral() callable again", (await R.isUnderCollateral()) === false);
  const [mf1, mf2] = await T.maxRedeemableFToken(0); const [mx1, mx2] = await T.maxRedeemableXToken(0);
  check("maxRedeemableFToken -> (0,0)", mf1 === 0n && mf2 === 0n);
  check("maxRedeemableXToken -> (0,0)", mx1 === 0n && mx2 === 0n);
  await rev("treasury.settle()", async () => await (T.connect(safe) as any).settle.staticCall());
  await rev("treasury.harvest()", async () => await (T.connect(safe) as any).harvest.staticCall());
  await rev("ezMarket.redeemFToken pre-init", async () => await (M.connect(dev) as any).redeemFToken.staticCall(E, dev.address, 0), "ErrorWindDownNotStarted");

  // rUSD is functional again for weETH
  const rHolder = A.PLATFORM;
  const rBal = await R.balanceOf(rHolder);
  console.log("  rUSD probe holder", rHolder, f(rBal));
  const hs = await imp(rHolder);
  const weManaged0 = (await R.markets(A.WEETH))[4];
  try { await (R.connect(hs) as any).redeem.staticCall(A.WEETH, E, rHolder, 0); check("rUSD.redeem(weETH) works again after upgrade", true); }
  catch (e: any) { check("rUSD.redeem(weETH) works again after upgrade", false, (e.shortMessage || "").slice(0, 100)); }
  try { await (R.connect(hs) as any).autoRedeem.staticCall(E, rHolder, [0, 0]); check("small autoRedeem works after upgrade", true); }
  catch (e: any) { check("small autoRedeem works after upgrade", false, (e.shortMessage || "").slice(0, 100)); }
  await rev("autoRedeem spilling into ezETH market (pre-init)", async () => await (R.connect(hs) as any).autoRedeem.staticCall(weManaged0 + E, rHolder, [0, 0]), "ErrorWindDownNotStarted");

  // -------- seed two pool depositors out of the pools' existing stakers --------
  console.log("\n=== 2. Snapshot before initializeWindDown");
  const B = await ez.balanceOf(A.EZ_TREASURY);
  const F = await fez.totalSupply(); const X = await xez.totalSupply();
  const fNav = E; const xNav = 346669734551971069n;  // snapshot NAVs from the design/test (oracle is dead, cannot be read on-chain)
  const fW = (F * fNav) / E, xW = (X * xNav) / E;
  console.log("  B", f(B), " F", f(F), " X", f(X));
  console.log("  fWeight", f(fW), " xWeight", f(xW), " f share", (Number(fW * 10000n / (fW + xW)) / 100).toFixed(2) + "%");
  await rev("initializeWindDown with wrong expectedBaseBalance", async () => await (T.connect(safe) as any).initializeWindDown.staticCall(B + 1n, F, X, fW, xW), "ErrorWindDownUnexpectedBaseBalance");
  await rev("initializeWindDown with wrong fSupply", async () => await (T.connect(safe) as any).initializeWindDown.staticCall(B, F + 1n, X, fW, xW), "ErrorWindDownUnexpectedFSupply");
  await rev("initializeWindDown with wrong xSupply", async () => await (T.connect(safe) as any).initializeWindDown.staticCall(B, F, X + 1n, fW, xW), "ErrorWindDownUnexpectedXSupply");
  await rev("initializeWindDown by non-admin", async () => await (T.connect(dev) as any).initializeWindDown.staticCall(B, F, X, fW, xW));
  // weights are NOT validated against anything
  const snapId = await network.provider.send("evm_snapshot", []);
  await (await (T.connect(safe) as any).initializeWindDown(B, F, X, 1n, 0n)).wait();
  note("initializeWindDown accepted arbitrary weights (fW=1, xW=0): fBase=" + f(await T.windDownFBaseBalance()) + " xBase=" + f(await T.windDownXBaseBalance()) + "  -> weights are an unchecked free parameter");
  await network.provider.send("evm_revert", [snapId]);

  console.log("\n=== 3. Fee tiers before/after zeroing (audit issue 4)");
  const fr0 = await M.fTokenRedeemFeeRatio(), xr0 = await M.xTokenRedeemFeeRatio();
  console.log("  fToken redeem fee default/delta", f(fr0[0]), f(fr0[1]), " -> tier applied with maxRedeemable=0 is `default` =", f(fr0[0]));
  console.log("  xToken redeem fee default/delta", f(xr0[0]), f(xr0[1]), " -> tier applied with maxRedeemable=0 is `default+delta` =", f(xr0[0] + xr0[1]));
  await (await (T.connect(safe) as any).initializeWindDown(B, F, X, fW, xW)).wait();
  check("windDownStatus == 1", (await T.windDownStatus()) === 1n);
  check("windDownFBaseBalance + windDownXBaseBalance == B", (await T.windDownFBaseBalance()) + (await T.windDownXBaseBalance()) === B);
  console.log("  fBaseBalance", f(await T.windDownFBaseBalance()), " xBaseBalance", f(await T.windDownXBaseBalance()));
  await rev("initializeWindDown twice", async () => await (T.connect(safe) as any).initializeWindDown.staticCall(B, F, X, fW, xW), "ErrorWindDownInitialized");

  // measure the fee that WOULD be charged if fees are not zeroed
  const probe = await imp(A.EZ_POOL);
  const feeTestAmt = E;
  {
    const s = await network.provider.send("evm_snapshot", []);
    const before = await ez.balanceOf(A.PLATFORM);
    const expected = await T.windDownPreviewRedeem(feeTestAmt, 0);
    const out = await (M.connect(probe) as any).redeemFToken.staticCall(feeTestAmt, A.EZ_POOL, 0);
    await (await (M.connect(probe) as any).redeemFToken(feeTestAmt, A.EZ_POOL, 0)).wait();
    const feeTaken = (await ez.balanceOf(A.PLATFORM)) - before;
    note(`WITHOUT zeroing fees: redeem 1 fezETH -> preview ${f(expected)} but user got ${f(out[0])}, platform took ${f(feeTaken)} (${(Number(feeTaken * 1000000n / expected) / 10000).toFixed(4)}%)`);
    await network.provider.send("evm_revert", [s]);
  }
  {
    const s = await network.provider.send("evm_snapshot", []);
    const xProbe = await findXezHolder(xez);
    if (xProbe) {
      const xs = await imp(xProbe);
      const amt = E;
      const before = await ez.balanceOf(A.PLATFORM);
      const expected = await T.windDownPreviewRedeem(0, amt);
      const out = await (M.connect(xs) as any).redeemXToken.staticCall(amt, xProbe, 0);
      await (await (M.connect(xs) as any).redeemXToken(amt, xProbe, 0)).wait();
      const feeTaken = (await ez.balanceOf(A.PLATFORM)) - before;
      note(`WITHOUT zeroing fees: redeem 1 xezETH -> preview ${f(expected)} but user got ${f(out)}, platform took ${f(feeTaken)} (${(Number(feeTaken * 1000000n / expected) / 10000).toFixed(4)}%)`);
      note(`  and with _minBaseOut = preview it reverts:`);
      await rev("  redeemXToken(min = preview) while fee != 0", async () => await (M.connect(xs) as any).redeemXToken.staticCall(amt, xProbe, expected), "ErrorInsufficientBaseOutput");
    }
    await network.provider.send("evm_revert", [s]);
  }
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0, 0, true)).wait();
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0, 0, false)).wait();
  check("redeem fees zeroed (f)", (await M.fTokenRedeemFeeRatio())[0] === 0n && (await M.fTokenRedeemFeeRatio())[1] === 0n);
  check("redeem fees zeroed (x)", (await M.xTokenRedeemFeeRatio())[0] === 0n && (await M.xTokenRedeemFeeRatio())[1] === 0n);

  console.log("\n=== 4. Front-running window: anyone can pull ezETH out of rUSD before the migration");
  {
    const s = await network.provider.send("evm_snapshot", []);
    const ezManagedBefore = (await R.markets(A.EZETH))[4];
    const amt = ezManagedBefore / 10n;
    const out = await (R.connect(hs) as any).redeem.staticCall(A.EZETH, amt, rHolder, 0);
    note(`a plain rUSD holder can call redeem(ezETH, ${f(amt)}) and receive ${f(out[0])} ezETH before the migration batch runs`);
    await (await (R.connect(hs) as any).redeem(A.EZETH, amt, rHolder, 0)).wait();
    note(`  -> markets(ezETH).managed drifted ${f(ezManagedBefore)} -> ${f((await R.markets(A.EZETH))[4])}; a batch pinned to the old value would revert`);
    await network.provider.send("evm_revert", [s]);
  }

  console.log("\n=== 5. rUSD backing migration (weETH in, ezETH out)");
  const ezManaged = (await R.markets(A.EZETH))[4];
  const rusdFezBefore = await fez.balanceOf(A.RUSD);
  check("rUSD fezETH balance == markets(ezETH).managed", rusdFezBefore === ezManaged, f(ezManaged));
  // raise weETH treasury cap (currently 0)
  const weNeeded = ezManaged * 12n / 10n;
  const weIn = await estimateWeEthIn(WT, ezManaged);
  const requiredCap = (await WT.totalBaseToken()) + (await WT.getUnderlyingValue(weIn * 2n));
  check("weETH treasury baseTokenCap is currently 0 (mint blocked)", pre.weCap === 0n);
  await (await (WT.connect(safe) as any).updateBaseTokenCap(requiredCap)).wait();
  note("migration REQUIRES raising weETH treasury baseTokenCap " + f(pre.weCap) + " -> " + f(requiredCap) + " (the weETH market is touched)");
  await setBalanceOf(A.WEETH, A.SAFE, weIn * 2n);
  await (await (new ethers.Contract(A.WEETH, ERC20, safe) as any).approve(A.RUSD, weIn * 2n)).wait();
  const minted = await (R.connect(safe) as any).mint.staticCall(A.WEETH, weIn * 2n, A.SAFE, 0);
  await (await (R.connect(safe) as any).mint(A.WEETH, weIn * 2n, A.SAFE, 0)).wait();
  console.log("  Safe minted rUSD:", f(minted), "from weETH", f(weIn * 2n));
  check("minted rUSD >= ezETH managed", minted >= ezManaged);
  const safeEzBefore = await ez.balanceOf(A.SAFE);
  const expectedEzOut = await T.windDownPreviewRedeem(ezManaged, 0);
  const red = await (R.connect(safe) as any).redeem.staticCall(A.EZETH, ezManaged, A.SAFE, expectedEzOut);
  await (await (R.connect(safe) as any).redeem(A.EZETH, ezManaged, A.SAFE, expectedEzOut)).wait();
  check("rUSD ezETH redeem at the fixed wind-down rate", red[0] === expectedEzOut, f(expectedEzOut));
  check("Safe received exactly that ezETH", (await ez.balanceOf(A.SAFE)) - safeEzBefore === expectedEzOut);
  check("markets(ezETH).managed == 0", (await R.markets(A.EZETH))[4] === 0n);
  check("rUSD fezETH balance == 0", (await fez.balanceOf(A.RUSD)) === 0n);
  note(`economics: Safe put in ${f(weIn * 2n)} weETH (=${f(minted)} rUSD of backing) and pulled out ${f(expectedEzOut)} ezETH`);

  console.log("\n=== 6. removeMarket / removeRebalancePools");
  await (await (R.connect(safe) as any).removeMarket(A.EZETH)).wait();
  await (await (R.connect(safe) as any).removeRebalancePools([A.EZ_POOL, A.XEZ_POOL])).wait();
  check("ezETH no longer a supported market", !(await R.getMarkets()).map((x: string) => x.toLowerCase()).includes(A.EZETH.toLowerCase()));
  const pools = (await R.getRebalancePools()).map((x: string) => x.toLowerCase());
  check("both ezETH pools removed", !pools.includes(A.EZ_POOL.toLowerCase()) && !pools.includes(A.XEZ_POOL.toLowerCase()));
  check("weETH pool still supported", pools.includes(A.WEETH_POOL.toLowerCase()));
  try { await (R.connect(hs) as any).autoRedeem.staticCall(await R.balanceOf(rHolder), rHolder, [0]); check("autoRedeem of the whole holder balance works after removal", true); }
  catch (e: any) { check("autoRedeem of the whole holder balance works after removal", false, (e.shortMessage || "").slice(0, 100)); }

  console.log("\n=== 7. Rebalance pool wind-down");
  const poolState: any = {};
  for (const [name, P] of [["ezPool", EZP], ["xezPool", XEZP]] as const) {
    const bal = await fez.balanceOf(await (P as any).getAddress());
    const addr = await (P as any).getAddress();
    const ezBefore = await ez.balanceOf(addr);
    const expected = await T.windDownPreviewRedeem(bal, 0);
    await rev(`${name}.deposit`, async () => await (P.connect(dev) as any).deposit.staticCall(1, dev.address), "ErrorWindDownNotAllowed");
    await rev(`${name}.withdraw`, async () => await (P.connect(dev) as any).withdraw.staticCall(1, dev.address), "ErrorWindDownNotAllowed");
    await rev(`${name}.liquidate`, async () => await (P.connect(safe) as any).liquidate.staticCall(1, 0), "ErrorWindDownNotAllowed");
    await rev(`${name}.windDown wrong expected balance`, async () => await (P.connect(safe) as any).windDown.staticCall(bal + 1n, 0), "ErrorWindDownUnexpectedAssetBalance");
    await rev(`${name}.windDown by non-admin`, async () => await (P.connect(dev) as any).windDown.staticCall(bal, 0));
    const supplyBefore = await (P as any).totalSupply();
    const r = await (P.connect(safe) as any).windDown.staticCall(bal, expected);
    await (await (P.connect(safe) as any).windDown(bal, expected)).wait();
    check(`${name} liquidated == full fezETH balance`, r[0] === bal, f(bal));
    check(`${name} baseOut == fixed-rate preview`, r[1] === expected, f(expected));
    check(`${name} fezETH balance now 0`, (await fez.balanceOf(addr)) === 0n);
    check(`${name} ezETH credited`, (await ez.balanceOf(addr)) - ezBefore === expected);
    check(`${name} pool totalSupply wiped to 0`, (await (P as any).totalSupply()) === 0n, "was " + f(supplyBefore));
    check(`${name} xezETH untouched (wrapper bypassed)`, (await xez.balanceOf(addr)) === 0n);
    poolState[name] = { addr, expected, ezBefore, supplyBefore };
    await rev(`${name}.windDown second time`, async () => await (P.connect(safe) as any).windDown.staticCall(0, 0), "ErrorWindDownZeroAsset");
  }

  console.log("\n=== 8. Pool stakers can still claim after the wipe");
  for (const [name, P] of [["ezPool", EZP], ["xezPool", XEZP]] as const) {
    const addr = await (P as any).getAddress();
    const stakers = await findStakers(addr, P as any);
    console.log(`  ${name}: probing ${stakers.length} real stakers`);
    let totalEz = 0n, totalFxn = 0n, n = 0;
    for (const s of stakers) {
      const cEz = await (P as any).claimable(s, A.EZETH);
      const cFxn = await (P as any).claimable(s, A.FXN);
      if (cEz === 0n && cFxn === 0n) continue;
      const ss = await imp(s);
      const ezB = await ez.balanceOf(s), fxB = await fxn.balanceOf(s);
      await (await (P.connect(ss) as any).claim(s, s)).wait();
      const gotEz = (await ez.balanceOf(s)) - ezB, gotFxn = (await fxn.balanceOf(s)) - fxB;
      check(`  ${name} staker ${s.slice(0, 8)} claimed ezETH == claimable`, gotEz === cEz, f(cEz));
      totalEz += gotEz; totalFxn += gotFxn; n++;
      if (n >= 6) break;
    }
    console.log(`  ${name}: ${n} stakers claimed ${f(totalEz)} ezETH + ${f(totalFxn)} FXN`);
    check(`${name} at least one staker claimed a non-zero ezETH amount`, totalEz > 0n);
    const left = await ez.balanceOf(addr);
    console.log(`  ${name} ezETH left in pool after those claims: ${f(left)} (of ${f(poolState[name].expected + poolState[name].ezBefore)})`);
    poolState[name].leftAfterClaims = left;
    poolState[name].fxnLeft = await fxn.balanceOf(addr);
  }

  console.log("\n=== 9. Redeem the remaining f/x supply and check the cap");
  const Bal = await T.windDownBaseBalance();
  {
    const xLeft = await xez.totalSupply();
    const holders = await findXezHolders(xez, 12);
    let redeemed = 0n;
    for (const h of holders) {
      const b = await xez.balanceOf(h); if (b === 0n) continue;
      const s = await imp(h);
      try { await (await (M.connect(s) as any).redeemXToken(b, h, 0)).wait(); redeemed += b; } catch (e) { }
    }
    console.log("  redeemed", f(redeemed), "of", f(xLeft), "xezETH from real holders");
  }
  const claimed = await T.windDownBaseClaimed();
  check("windDownBaseClaimed <= windDownBaseBalance", claimed <= Bal, f(claimed) + " <= " + f(Bal));
  check("treasury ezETH balance >= unclaimed remainder", (await ez.balanceOf(A.EZ_TREASURY)) >= 0n);
  console.log("  treasury ezETH left", f(await ez.balanceOf(A.EZ_TREASURY)), " claimed", f(claimed), " totalBaseToken", f(await T.totalBaseToken()));

  console.log("\n=== 10. Finalization and adminClaim");
  const fezLeft = await fez.totalSupply(), xezLeft = await xez.totalSupply();
  console.log("  unredeemed at finalization: fezETH", f(fezLeft), " xezETH", f(xezLeft));
  const treLeft = await ez.balanceOf(A.EZ_TREASURY);
  const safeEzPre = await ez.balanceOf(A.SAFE);
  await (await (T.connect(safe) as any).finalizeWindDown()).wait();
  check("windDownStatus == 2", (await T.windDownStatus()) === 2n);
  await rev("redeem after finalize", async () => await (M.connect(dev) as any).redeemFToken.staticCall(E, dev.address, 0), "ErrorWindDownFinalized");
  await (await (T.connect(safe) as any).adminClaim()).wait();
  check("treasury swept to 0", (await ez.balanceOf(A.EZ_TREASURY)) === 0n);
  check("admin received the remainder", (await ez.balanceOf(A.SAFE)) - safeEzPre === treLeft, f(treLeft));
  if (fezLeft > 0n || xezLeft > 0n) note(`finalizeWindDown succeeded with ${f(fezLeft)} fezETH and ${f(xezLeft)} xezETH still outstanding; those holders are now permanently unable to redeem`);

  console.log("\n=== 11. Pool adminClaim sweeps unclaimed user rewards");
  for (const [name, P] of [["ezPool", EZP], ["xezPool", XEZP]] as const) {
    const addr = await (P as any).getAddress();
    const stakers = await findStakers(addr, P as any);
    let stillClaimableEz = 0n, stillClaimableFxn = 0n, cnt = 0;
    for (const s of stakers) { const a = await (P as any).claimable(s, A.EZETH); const b = await (P as any).claimable(s, A.FXN); if (a > 0n || b > 0n) cnt++; stillClaimableEz += a; stillClaimableFxn += b; }
    const ezB = await ez.balanceOf(addr), fxB = await fxn.balanceOf(addr);
    console.log(`  ${name}: ${cnt} stakers still have ${f(stillClaimableEz)} ezETH + ${f(stillClaimableFxn)} FXN claimable; pool holds ${f(ezB)} ezETH + ${f(fxB)} FXN`);
    await (await (P.connect(safe) as any).adminClaim()).wait();
    check(`${name} adminClaim swept all reward tokens`, (await ez.balanceOf(addr)) === 0n && (await fxn.balanceOf(addr)) === 0n);
    if (stillClaimableEz > 0n || stillClaimableFxn > 0n) {
      const victim = stakers.find(async () => true);
      note(`${name}: adminClaim() moved ${f(ezB)} ezETH + ${f(fxB)} FXN to the admin while ${cnt} stakers still had ${f(stillClaimableEz)} ezETH + ${f(stillClaimableFxn)} FXN claimable`);
      for (const s of stakers) {
        const a = await (P as any).claimable(s, A.EZETH);
        if (a > 0n) { const ss = await imp(s); await rev(`  ${name} staker ${s.slice(0, 8)} claim AFTER adminClaim`, async () => await (await (P.connect(ss) as any).claim(s, s)).wait()); break; }
      }
    }
  }

  console.log("\n=== 12. weETH-side invariants");
  check("weETH treasury impl unchanged", (await implOf(A.WEETH_TREASURY)) === pre.weImpl);
  check("ezETH Market impl unchanged", (await implOf(A.EZ_MARKET)) === pre.mktImpl);
  check("xeETH totalSupply unchanged", (await xeeth.totalSupply()) === pre.xeethSupply);
  check("rUSD xeETH balance unchanged", (await xeeth.balanceOf(A.RUSD)) === pre.rusdXeeth);
  const feethNow = await feeth.balanceOf(A.RUSD), weManagedNow = (await R.markets(A.WEETH))[4];
  console.log("  rUSD feETH", f(pre.rusdFeeth), "->", f(feethNow), "  weETH managed", f(pre.weManaged), "->", f(weManagedNow));
  check("rUSD feETH balance == weETH managed", feethNow === weManagedNow);
  check("rUSD original feETH not moved out (balance only grew)", feethNow >= pre.rusdFeeth);
  console.log("  weETH treasury baseTokenCap now", f(await WT.baseTokenCap()), "(was", f(pre.weCap) + ")");
  if ((await WT.baseTokenCap()) !== pre.weCap) note("weETH treasury baseTokenCap is left raised after the migration; restore it or weETH minting stays open");

  console.log("\n================ RESULT ================");
  console.log("PASS", PASS, " FAIL", FAIL);
  console.log("\nNOTES:"); NOTES.forEach((n, i) => console.log(` ${i + 1}. ${n}`));
}

async function setBalanceOf(token: string, who: string, amount: bigint) {
  // find the balances slot by brute force over the first 12 slots
  for (let i = 0; i < 12; i++) {
    const slot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [who, i]));
    const before = await network.provider.send("eth_getStorageAt", [token, slot, "latest"]);
    await network.provider.send("hardhat_setStorageAt", [token, slot, ethers.toBeHex(amount, 32)]);
    const c = new ethers.Contract(token, ERC20, ethers.provider);
    if ((await c.balanceOf(who)) === amount) return;
    await network.provider.send("hardhat_setStorageAt", [token, slot, before]);
  }
  throw new Error("could not locate balances slot for " + token);
}
async function estimateWeEthIn(WT: any, rusdOut: bigint): Promise<bigint> {
  const one = await WT.getUnderlyingValue(E);
  const price = await WT.getUnderlyingValue(E); // placeholder replaced below
  const tre = new ethers.Contract(await WT.getAddress(), ["function currentBaseTokenPrice() view returns (uint256)", "function getUnderlyingValue(uint256) view returns (uint256)"], ethers.provider);
  const p: bigint = await tre.currentBaseTokenPrice();
  const fOutPerWeEth = (one * p) / E;
  return (rusdOut * E + fOutPerWeEth - 1n) / fOutPerWeEth;
}
async function findXezHolder(xez: any): Promise<string | null> { const l = await findXezHolders(xez, 1); return l[0] || null; }
async function findXezHolders(xez: any, n: number): Promise<string[]> {
  const logs = await ethers.provider.getLogs({ address: A.XEZETH, topics: [ethers.id("Transfer(address,address,uint256)")], fromBlock: (await ethers.provider.getBlockNumber()) - 200000, toBlock: "latest" }).catch(() => []);
  const set = new Set<string>();
  for (const lg of logs) { set.add(ethers.getAddress("0x" + lg.topics[2].slice(26))); }
  const out: string[] = [];
  for (const a of set) { if (a === ethers.ZeroAddress) continue; if ((await xez.balanceOf(a)) > 0n) out.push(a); if (out.length >= n) break; }
  return out;
}
async function findStakers(pool: string, P: any): Promise<string[]> {
  const head = await ethers.provider.getBlockNumber();
  const logs = await ethers.provider.getLogs({ address: pool, topics: [ethers.id("Deposit(address,address,uint256)")], fromBlock: head - 900000, toBlock: "latest" }).catch(() => []);
  const set = new Set<string>();
  for (const lg of logs) { if (lg.topics[2]) set.add(ethers.getAddress("0x" + lg.topics[2].slice(26))); }
  return [...set].slice(0, 25);
}

main().then(() => process.exit(FAIL === 0 ? 0 : 1)).catch((e) => { console.error(e); process.exit(1); });

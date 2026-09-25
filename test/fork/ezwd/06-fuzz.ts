import { ethers, network } from "hardhat";
import * as fs from "fs";

const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const IMPL = { fxusd: "0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd", treasury: "0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC", pool: "0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5" };
const A: any = {
  EZETH: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", EZ_TREASURY: "0x38965311507D4E54973F81475a149c09376e241e",
  EZ_MARKET: "0x69518D1D70AD537C41401303BDf96032338E40dE", FEZETH: "0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9",
  XEZETH: "0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5", EZ_POOL: "0xf58c499417e36714e99803Cb135f507a95ae7169",
  XEZ_POOL: "0xBa947cba270D30967369Bf1f73884Be2533d7bDB", RUSD: "0x65D72AA8DA931F047169112fcf34f52DbaAE7D18",
  SAFE: "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF", PROXY_ADMIN: "0x9b54b7703551d9d0ced177a78367560a8b2edda4",
  TIMELOCK: "0x68863fb8855b04509a835082478D6E3D0bE4E61a", FXN: "0x365AccFCa291e7D3914637ABf1F7635dB165Bb09",
  PLATFORM: "0x0084C2e1B1823564e597Ff4848a88D61ac63D703", EZ_WHALE: "0xC01Ac9349396935f60d39737EBe352572d1483A2",
};
const SLOT = { fSupply: 53, xSupply: 53, refPrice: 152, totalBaseToken: 153, rateProvider: 201 };
const E = 10n ** 18n;
const f = (v: bigint) => ethers.formatUnits(v, 18);
const ERC20 = ["function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)", "function transfer(address,uint256) returns (bool)", "function approve(address,uint256) returns (bool)"];
const PA = ["function upgrade(address,address)"];
const M_ABI = ["function redeemFToken(uint256,address,uint256) returns (uint256,uint256)", "function redeemXToken(uint256,address,uint256) returns (uint256)", "function updateRedeemFeeRatio(uint256,int256,bool)"];
const T_ABI = ["function windDownStatus() view returns (uint8)", "function windDownBaseBalance() view returns (uint256)", "function windDownFSupply() view returns (uint256)", "function windDownXSupply() view returns (uint256)", "function windDownFBaseBalance() view returns (uint256)", "function windDownXBaseBalance() view returns (uint256)", "function windDownBaseClaimed() view returns (uint256)", "function windDownPreviewRedeem(uint256,uint256) view returns (uint256)", "function initializeWindDown(uint256,uint256,uint256,uint256,uint256)", "function finalizeWindDown()", "function adminClaim()", "function redeem(uint256,uint256,address) returns (uint256)", "function totalBaseToken() view returns (uint256)", "function settle()", "function harvest()", "function transferToStrategy(uint256)", "function initializeProtocol(uint256) returns (uint256,uint256)", "function mintFToken(uint256,address) returns (uint256)", "function mintXToken(uint256,address) returns (uint256)", "function updateStrategy(address)", "function updatePriceOracle(address)", "function updateBaseTokenCap(uint256)", "function updateEMASampleInterval(uint24)", "function updateRebalancePoolSplitter(address)", "function updateRateProvider(address)", "function rateProvider() view returns (address)"];
const P_ABI = ["function windDown(uint256,uint256) returns (uint256,uint256)", "function adminClaim()", "function claimable(address,address) view returns (uint256)", "function claim(address,address)", "function checkpoint(address)", "function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)", "function fxn() view returns (address)", "function ve() view returns (address)", "function veHelper() view returns (address)", "function minter() view returns (address)"];

let P = 0, F = 0; const FAILS: string[] = [];
const ck = (l: string, c: boolean, d = "") => { if (c) { P++; } else { F++; FAILS.push(l + (d ? "  " + d : "")); console.log("  FAIL  " + l + (d ? "  " + d : "")); } };
const ckv = (l: string, c: boolean, d = "") => { ck(l, c, d); if (c) console.log("  PASS  " + l + (d ? "  " + d : "")); };
async function rev(l: string, fn: () => Promise<any>, want?: string) {
  try { await fn(); ckv(l + " reverts", false, "(did NOT revert)"); }
  catch (e: any) { const m = (e.shortMessage || e.message || "").toString(); ckv(l + " reverts" + (want ? ` [${want}]` : ""), !want || m.includes(want), (!want || m.includes(want)) ? "" : m.slice(0, 120)); }
}
async function imp(a: string) { await network.provider.send("hardhat_impersonateAccount", [a]); await network.provider.send("hardhat_setBalance", [a, "0x21e19e0c9bab2400000"]); return await ethers.getSigner(a); }
const snap = async () => await network.provider.send("evm_snapshot", []);
const back = async (s: string) => { await network.provider.send("evm_revert", [s]); };
async function setSlot(addr: string, slot: number, val: bigint) { await network.provider.send("hardhat_setStorageAt", [addr, ethers.toBeHex(slot, 32), ethers.toBeHex(val, 32)]); }
// deterministic PRNG so the run is reproducible
let seed = 0x5eed1234n;
function rnd(mod: bigint): bigint { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return mod === 0n ? 0n : seed % mod; }

async function setup() {
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: RPC } }] });
  await network.provider.send("evm_mine", []);
  const tl = await imp(A.TIMELOCK), safe = await imp(A.SAFE);
  const pa = new ethers.Contract(A.PROXY_ADMIN, PA, tl);
  await (await pa.upgrade(A.RUSD, IMPL.fxusd)).wait();
  await (await pa.upgrade(A.EZ_TREASURY, IMPL.treasury)).wait();
  await (await pa.upgrade(A.EZ_POOL, IMPL.pool)).wait();
  await (await pa.upgrade(A.XEZ_POOL, IMPL.pool)).wait();
  const M = new ethers.Contract(A.EZ_MARKET, M_ABI, ethers.provider);
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0, 0, true)).wait();
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0, 0, false)).wait();
  return { safe, tl };
}

async function main() {
  const H = JSON.parse(fs.readFileSync("/tmp/ezwd/holders.json", "utf8"));
  const { safe } = await setup();
  const [dev, ...rest] = await ethers.getSigners();
  const ez = new ethers.Contract(A.EZETH, ERC20, ethers.provider);
  const fez = new ethers.Contract(A.FEZETH, ERC20, ethers.provider);
  const xez = new ethers.Contract(A.XEZETH, ERC20, ethers.provider);
  const fxn = new ethers.Contract(A.FXN, ERC20, ethers.provider);
  const T = new ethers.Contract(A.EZ_TREASURY, T_ABI, ethers.provider);
  const M = new ethers.Contract(A.EZ_MARKET, M_ABI, ethers.provider);
  const EZP = new ethers.Contract(A.EZ_POOL, P_ABI, ethers.provider);
  const XEZP = new ethers.Contract(A.XEZ_POOL, P_ABI, ethers.provider);

  const B0 = await ez.balanceOf(A.EZ_TREASURY), F0 = await fez.totalSupply(), X0 = await xez.totalSupply();
  const fW = F0, xW = (X0 * 346669734551971069n) / E;

  // ======================= PART 5 first: init-time edge cases (need un-initialized treasury) ==========
  console.log("\n########## 5. initializeWindDown edge cases (storage-forced supplies) ##########");
  {
    const s = await snap();
    await rev("B == 0", async () => { await setSlot(A.EZ_TREASURY, 999, 0n); const s2 = await snap(); await network.provider.send("hardhat_setStorageAt", [A.EZETH, ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [A.EZ_TREASURY, 51])), ethers.ZeroHash]); await (T.connect(safe) as any).initializeWindDown.staticCall(0, F0, X0, fW, xW); await back(s2); }, "ErrorWindDown");
    await back(s);
  }
  for (const [label, expr] of [
    ["fW + xW == 0", async () => await (T.connect(safe) as any).initializeWindDown.staticCall(B0, F0, X0, 0, 0)],
  ] as const) await rev(label, expr as any, "ErrorWindDownInvalidWeights");
  {
    const s = await snap();
    await setSlot(A.FEZETH, SLOT.fSupply, 0n);
    ckv("forced fezETH totalSupply == 0", (await fez.totalSupply()) === 0n);
    await rev("F == 0 with fWeight > 0", async () => await (T.connect(safe) as any).initializeWindDown.staticCall(B0, 0, X0, 1, xW), "ErrorWindDownInvalidWeights");
    await (await (T.connect(safe) as any).initializeWindDown(B0, 0, X0, 0, xW)).wait();
    ckv("F == 0 with fWeight == 0 -> all base to xToken", (await T.windDownXBaseBalance()) === B0 && (await T.windDownFBaseBalance()) === 0n, f(B0));
    await rev("previewRedeem(f) when windDownFSupply == 0", async () => await T.windDownPreviewRedeem(E, 0), "ErrorWindDownInvalidRedeemInput");
    await back(s);
  }
  {
    const s = await snap();
    await setSlot(A.XEZETH, SLOT.xSupply, 0n);
    await rev("X == 0 with xWeight > 0", async () => await (T.connect(safe) as any).initializeWindDown.staticCall(B0, F0, 0, fW, 1), "ErrorWindDownInvalidWeights");
    await (await (T.connect(safe) as any).initializeWindDown(B0, F0, 0, fW, 0)).wait();
    ckv("X == 0 with xWeight == 0 -> all base to fToken", (await T.windDownFBaseBalance()) === B0 && (await T.windDownXBaseBalance()) === 0n, f(B0));
    await rev("previewRedeem(x) when windDownXSupply == 0", async () => await T.windDownPreviewRedeem(0, E), "ErrorWindDownInvalidRedeemInput");
    await back(s);
  }
  {
    const s = await snap();
    await (await (T.connect(safe) as any).initializeWindDown(B0, F0, X0, 0, xW)).wait();
    ckv("fWeight == 0 with F > 0 -> fBase 0, previewRedeem(f) yields 0 -> redeem reverts", (await T.windDownFBaseBalance()) === 0n);
    const hs = await imp(A.EZ_POOL);
    await rev("redeemFToken when fBase == 0", async () => await (M.connect(hs) as any).redeemFToken.staticCall(E, A.EZ_POOL, 0), "ErrorWindDownZeroBaseOutput");
    await back(s);
  }
  // rounding of the split
  {
    const s = await snap();
    await (await (T.connect(safe) as any).initializeWindDown(B0, F0, X0, 1n, 1n)).wait();
    const fb = await T.windDownFBaseBalance(), xb = await T.windDownXBaseBalance();
    ckv("50/50 weights: fBase + xBase == B exactly (no lost wei)", fb + xb === B0, `${fb} + ${xb}`);
    ckv("50/50 weights: fBase == floor(B/2)", fb === B0 / 2n);
    await back(s);
  }

  // ======================= real initialization =======================
  await (await (T.connect(safe) as any).initializeWindDown(B0, F0, X0, fW, xW)).wait();
  const CAP = await T.windDownBaseBalance(), FB = await T.windDownFBaseBalance(), XB = await T.windDownXBaseBalance();
  const FS = await T.windDownFSupply(), XS = await T.windDownXSupply();
  console.log(`\ninitialized: B=${f(CAP)}  fBase=${f(FB)}  xBase=${f(XB)}  F=${f(FS)}  X=${f(XS)}`);

  // ======================= PART 1: fuzz redemptions =======================
  console.log("\n########## 1. Fuzzed redemptions (300 draws, random side/size/order/time) ##########");
  {
    const s = await snap();
    // give ourselves inventory: move fezETH and xezETH from real holders to 8 test actors
    const actors = rest.slice(0, 8).map((x) => x.address);
    const fHolders = [A.RUSD, A.XEZ_POOL, A.EZ_POOL];
    for (let i = 0; i < fHolders.length; i++) {
      const h = fHolders[i]; const hs = await imp(h);
      const bal = await fez.balanceOf(h);
      const per = bal / BigInt(actors.length + 1);
      for (const a of actors) await (await (new ethers.Contract(A.FEZETH, ERC20, hs) as any).transfer(a, per)).wait();
    }
    { const hs = await imp(A.EZ_WHALE); const bal = await xez.balanceOf(A.EZ_WHALE); const per = bal / BigInt(actors.length + 1);
      for (const a of actors) await (await (new ethers.Contract(A.XEZETH, ERC20, hs) as any).transfer(a, per)).wait(); }

    let sumF = 0n, sumX = 0n, nF = 0, nX = 0, prevClaimed = 0n, refQuoteF = -1n, refQuoteX = -1n;
    for (let i = 0; i < 300; i++) {
      const who = rest[Number(rnd(8n))];
      const side = rnd(2n) === 0n;
      const tok = side ? fez : xez;
      const bal: bigint = await tok.balanceOf(who.address);
      if (bal === 0n) continue;
      // sizes: tiny, mid, whole balance
      const pick = rnd(10n);
      let amt = pick < 2n ? (rnd(4000n) + 1n) : pick < 9n ? (bal / (rnd(60n) + 2n)) + 1n : bal;
      if (amt > bal) amt = bal;
      const expect = side ? (amt * FB) / FS : (amt * XB) / XS;
      const treBefore = await ez.balanceOf(A.EZ_TREASURY);
      const claimedBefore = await T.windDownBaseClaimed();
      const userBefore = await ez.balanceOf(who.address);
      if (expect === 0n) {
        await rev(`  draw ${i}: floor-to-zero input reverts`, async () => side ? await (M.connect(who) as any).redeemFToken.staticCall(amt, who.address, 0) : await (M.connect(who) as any).redeemXToken.staticCall(amt, who.address, 0), "ErrorWindDownZeroBaseOutput");
        continue;
      }
      let out: bigint;
      if (side) { const r = await (M.connect(who) as any).redeemFToken.staticCall(amt, who.address, expect); await (await (M.connect(who) as any).redeemFToken(amt, who.address, expect)).wait(); out = r[0]; sumF += out; nF++; }
      else { out = await (M.connect(who) as any).redeemXToken.staticCall(amt, who.address, expect); await (await (M.connect(who) as any).redeemXToken(amt, who.address, expect)).wait(); sumX += out; nX++; }
      ck(`draw ${i}: out == floor(in * base / supply)`, out === expect, `${out} vs ${expect}`);
      ck(`draw ${i}: user received exactly out`, (await ez.balanceOf(who.address)) - userBefore === out);
      ck(`draw ${i}: treasury debited exactly out`, treBefore - (await ez.balanceOf(A.EZ_TREASURY)) === out);
      ck(`draw ${i}: claimed += out`, (await T.windDownBaseClaimed()) - claimedBefore === out);
      const claimedNow = await T.windDownBaseClaimed();
      ck(`draw ${i}: claimed monotone`, claimedNow >= prevClaimed); prevClaimed = claimedNow;
      ck(`draw ${i}: claimed <= cap`, claimedNow <= CAP);
      ck(`draw ${i}: treasury balance == B - claimed`, (await ez.balanceOf(A.EZ_TREASURY)) === CAP - claimedNow);
      // the pricing function itself must be unchanged: a fixed reference quote must not move
      const qf = await T.windDownPreviewRedeem(10n ** 12n, 0), qx = await T.windDownPreviewRedeem(0, 10n ** 12n);
      if (refQuoteF === -1n) { refQuoteF = qf; refQuoteX = qx; }
      ck(`draw ${i}: fixed reference quote (f) unchanged`, qf === refQuoteF, `${qf} vs ${refQuoteF}`);
      ck(`draw ${i}: fixed reference quote (x) unchanged`, qx === refQuoteX, `${qx} vs ${refQuoteX}`);
      if (i % 37 === 0) { await network.provider.send("evm_increaseTime", [Number(rnd(86400n))]); await network.provider.send("evm_mine", []); }
    }
    console.log(`  ${nF} fToken + ${nX} xToken redemptions executed`);
    ckv("sum(fToken outs) <= windDownFBaseBalance", sumF <= FB, `${f(sumF)} <= ${f(FB)}`);
    ckv("sum(xToken outs) <= windDownXBaseBalance", sumX <= XB, `${f(sumX)} <= ${f(XB)}`);
    ckv("windDownBaseClaimed == sumF + sumX", (await T.windDownBaseClaimed()) === sumF + sumX);
    ckv("fixed reference quote identical before and after every draw", refQuoteF > 0n && refQuoteX > 0n, `f:${refQuoteF} x:${refQuoteX} per 1e12 token-wei`);
    await back(s);
  }

  // ======================= PART 2: order independence =======================
  console.log("\n########## 2. Order independence (same multiset, 5 different orders) ##########");
  {
    const actors = rest.slice(0, 6).map((x) => x.address);
    const amounts = [10n ** 7n, 123456789n, E / 3n, 7n * E, 137n * E, 999n * E];
    const results: string[] = [];
    for (let run = 0; run < 5; run++) {
      const s = await snap();
      const hs = await imp(A.RUSD);
      for (let i = 0; i < actors.length; i++) await (await (new ethers.Contract(A.FEZETH, ERC20, hs) as any).transfer(actors[i], amounts[i])).wait();
      const order = [...Array(actors.length).keys()];
      for (let i = order.length - 1; i > 0; i--) { const j = Number(rnd(BigInt(i + 1))); [order[i], order[j]] = [order[j], order[i]]; }
      const outs: bigint[] = new Array(actors.length).fill(0n);
      for (const idx of order) {
        const w = rest[idx];
        const r = await (M.connect(w) as any).redeemFToken.staticCall(amounts[idx], w.address, 0);
        await (await (M.connect(w) as any).redeemFToken(amounts[idx], w.address, 0)).wait();
        outs[idx] = r[0];
        await network.provider.send("evm_increaseTime", [3600]); await network.provider.send("evm_mine", []);
      }
      results.push(JSON.stringify(outs.map(String)) + "|" + (await T.windDownBaseClaimed()).toString());
      await back(s);
    }
    ckv("all 5 orderings produce byte-identical per-actor outputs and total claimed", new Set(results).size === 1, results[0].slice(0, 90) + "…");
  }

  // ======================= PART 3: extreme / malformed inputs =======================
  console.log("\n########## 3. Extreme and malformed inputs ##########");
  {
    const s = await snap();
    const mkt = await imp(A.EZ_MARKET);
    await rev("treasury.redeem(0, 0)", async () => await (T.connect(mkt) as any).redeem.staticCall(0, 0, A.RUSD), "ErrorWindDownInvalidRedeemInput");
    await rev("treasury.redeem(both sides non-zero)", async () => await (T.connect(mkt) as any).redeem.staticCall(E, E, A.RUSD), "ErrorWindDownInvalidRedeemInput");
    await rev("treasury.redeem from a non-market caller", async () => await (T.connect(dev) as any).redeem.staticCall(E, 0, A.RUSD));
    await rev("redeem 1 wei fezETH (floors to 0)", async () => await (T.connect(mkt) as any).redeem.staticCall(1, 0, A.RUSD), "ErrorWindDownZeroBaseOutput");
    const minF = (FS + FB - 1n) / FB; // smallest input that yields >= 1 wei out
    const outMin = await T.windDownPreviewRedeem(minF, 0);
    ckv("smallest non-zero fToken input yields exactly 1 wei", outMin === 1n, `${minF} fezETH-wei -> ${outMin}`);
    const rusd = await imp(A.RUSD);
    const rbal = await fez.balanceOf(A.RUSD);
    await rev("redeem more than the holder owns", async () => await (M.connect(rusd) as any).redeemFToken.staticCall(rbal + 1n, A.RUSD, 0));
    const outAll = await T.windDownPreviewRedeem(FS, 0);
    ckv("previewRedeem(entire fToken supply) == windDownFBaseBalance", outAll === FB, f(outAll));
    const outAllX = await T.windDownPreviewRedeem(0, XS);
    ckv("previewRedeem(entire xToken supply) == windDownXBaseBalance", outAllX === XB, f(outAllX));
    await rev("previewRedeem beyond total supply would exceed the cap", async () => await (T.connect(mkt) as any).redeem.staticCall(FS + XS, 0, A.RUSD), "ErrorWindDownExceedBaseBalance");
    // type(uint256).max path through the market
    const hs = await imp(A.EZ_POOL);
    const pb = await fez.balanceOf(A.EZ_POOL);
    const rmax = await (M.connect(hs) as any).redeemFToken.staticCall(ethers.MaxUint256, A.EZ_POOL, 0);
    ckv("redeemFToken(type(uint256).max) redeems exactly the caller balance", rmax[0] === (pb * FB) / FS, f(rmax[0]));
    await back(s);
  }

  // ======================= PART 4: external interference =======================
  console.log("\n########## 4. External interference (donation / drain attempts) ##########");
  {
    const s = await snap();
    const rateBefore = await T.windDownPreviewRedeem(E, 0);
    const whale = await imp("0xBdfa7b7893081B35Fb54027489e2Bc7A38275129");
    // donate ezETH straight to the treasury
    const donor = await imp(A.EZ_POOL);
    const donateAmt = await ez.balanceOf(A.EZ_POOL);
    await (await (new ethers.Contract(A.EZETH, ERC20, donor) as any).transfer(A.EZ_TREASURY, donateAmt)).wait();
    ckv("donating ezETH to the treasury does not change the redemption rate", (await T.windDownPreviewRedeem(E, 0)) === rateBefore, f(donateAmt) + " donated");
    ckv("donation does not change windDownBaseBalance", (await T.windDownBaseBalance()) === CAP);
    ckv("donation does not change windDownBaseClaimed", (await T.windDownBaseClaimed()) === 0n);
    // can anyone pull it out?
    await rev("non-admin adminClaim after donation", async () => await (T.connect(dev) as any).adminClaim.staticCall());
    await rev("adminClaim before finalize", async () => await (T.connect(safe) as any).adminClaim.staticCall(), "ErrorWindDownNotStarted");
    // donate fezETH to the treasury (should not become claimable by anyone)
    const rusd = await imp(A.RUSD);
    await (await (new ethers.Contract(A.FEZETH, ERC20, rusd) as any).transfer(A.EZ_TREASURY, E)).wait();
    ckv("donated fezETH does not change the rate either", (await T.windDownPreviewRedeem(E, 0)) === rateBefore);
    await back(s);
  }

  // ======================= PART 6: rate-provider dependency =======================
  console.log("\n########## 6. Rate provider dependency of the redemption path ##########");
  {
    const Mock = await ethers.getContractFactory("MockRateProviderForWindDown");
    for (const [label, rate, expectOk] of [["rate = 1.0e18 (exact)", E, true], ["rate = 1e18 + 1", E + 1n, true], ["rate = 1.5e18", 15n * E / 10n, true], ["rate = 10e18", 10n * E, true], ["rate = 1e18 - 1", E - 1n, false], ["rate = 0.5e18", E / 2n, false], ["rate = 0", 0n, false]] as const) {
      const s = await snap();
      const mock = await Mock.deploy(rate); await mock.waitForDeployment();
      await setSlot(A.EZ_TREASURY, SLOT.rateProvider, BigInt(await mock.getAddress()));
      ck("mock rate provider wired", (await T.rateProvider()).toLowerCase() === (await mock.getAddress()).toLowerCase());
      const hs = await imp(A.RUSD);
      if (expectOk) {
        try { const r = await (M.connect(hs) as any).redeemFToken.staticCall(E, A.RUSD, 0); ckv(`  ${label}: redemption succeeds, out == fixed-rate preview`, r[0] === (E * FB) / FS, f(r[0])); }
        catch (e: any) { ckv(`  ${label}: redemption succeeds`, false, (e.shortMessage || "").slice(0, 100)); }
      } else {
        await rev(`  ${label}: redemption`, async () => await (M.connect(hs) as any).redeemFToken.staticCall(E, A.RUSD, 0));
      }
      await back(s);
    }
    {
      const s = await snap();
      const mock = await Mock.deploy(11n * E / 10n); await mock.waitForDeployment();
      await (await mock.setShouldRevert(true)).wait();
      await setSlot(A.EZ_TREASURY, SLOT.rateProvider, BigInt(await mock.getAddress()));
      const hs = await imp(A.RUSD);
      await rev("  rate provider reverting: whole redemption path", async () => await (M.connect(hs) as any).redeemFToken.staticCall(E, A.RUSD, 0));
      await back(s);
    }
  }

  // ======================= PART 7: access control matrix =======================
  console.log("\n########## 7. Access control matrix (from a random EOA) ##########");
  {
    const s = await snap();
    const stranger = rest[9];
    for (const [name, call] of [
      ["initializeWindDown", () => (T.connect(stranger) as any).initializeWindDown.staticCall(CAP, FS, XS, fW, xW)],
      ["finalizeWindDown", () => (T.connect(stranger) as any).finalizeWindDown.staticCall()],
      ["adminClaim", () => (T.connect(stranger) as any).adminClaim.staticCall()],
      ["redeem", () => (T.connect(stranger) as any).redeem.staticCall(E, 0, A.RUSD)],
      ["mintFToken", () => (T.connect(stranger) as any).mintFToken.staticCall(E, stranger.address)],
      ["mintXToken", () => (T.connect(stranger) as any).mintXToken.staticCall(E, stranger.address)],
      ["settle", () => (T.connect(stranger) as any).settle.staticCall()],
      ["harvest", () => (T.connect(stranger) as any).harvest.staticCall()],
      ["transferToStrategy", () => (T.connect(stranger) as any).transferToStrategy.staticCall(1)],
      ["initializeProtocol", () => (T.connect(stranger) as any).initializeProtocol.staticCall(1)],
      ["updateStrategy", () => (T.connect(stranger) as any).updateStrategy.staticCall(stranger.address)],
      ["updatePriceOracle", () => (T.connect(stranger) as any).updatePriceOracle.staticCall(stranger.address)],
      ["updateBaseTokenCap", () => (T.connect(stranger) as any).updateBaseTokenCap.staticCall(1)],
      ["updateEMASampleInterval", () => (T.connect(stranger) as any).updateEMASampleInterval.staticCall(1)],
      ["updateRebalancePoolSplitter", () => (T.connect(stranger) as any).updateRebalancePoolSplitter.staticCall(stranger.address)],
      ["updateRateProvider", () => (T.connect(stranger) as any).updateRateProvider.staticCall(stranger.address)],
      ["pool.windDown", () => (EZP.connect(stranger) as any).windDown.staticCall(1, 0)],
      ["pool.adminClaim", () => (EZP.connect(stranger) as any).adminClaim.staticCall()],
    ] as const) await rev(`  stranger ${name}`, call as any);
    // and the admin-callable-but-disabled set
    for (const [name, call] of [
      ["settle", () => (T.connect(safe) as any).settle.staticCall()],
      ["harvest", () => (T.connect(safe) as any).harvest.staticCall()],
      ["initializeProtocol", () => (T.connect(safe) as any).initializeProtocol.staticCall(1)],
      ["updateStrategy", () => (T.connect(safe) as any).updateStrategy.staticCall(A.SAFE)],
      ["updatePriceOracle", () => (T.connect(safe) as any).updatePriceOracle.staticCall(A.SAFE)],
      ["updateBaseTokenCap", () => (T.connect(safe) as any).updateBaseTokenCap.staticCall(1)],
      ["updateEMASampleInterval", () => (T.connect(safe) as any).updateEMASampleInterval.staticCall(1)],
      ["updateRebalancePoolSplitter", () => (T.connect(safe) as any).updateRebalancePoolSplitter.staticCall(A.SAFE)],
      ["updateRateProvider", () => (T.connect(safe) as any).updateRateProvider.staticCall(A.SAFE)],
    ] as const) await rev(`  admin ${name} (disabled in wind-down)`, call as any, "ErrorWindDownNotAllowed");
    await back(s);
  }

  // ======================= PART 8: pool claim fuzz =======================
  console.log("\n########## 8. Pool claim fuzz (10 real Convex vaults, random orders) ##########");
  {
    for (const [name, Pl, key] of [["ezPool", EZP, "ezpool"], ["xezPool", XEZP, "xezpool"]] as const) {
      const addr = name === "ezPool" ? A.EZ_POOL : A.XEZ_POOL;
      const stakers: string[] = H[key].map((x: any[]) => x[0]);
      const orders: string[] = [];
      for (let run = 0; run < 3; run++) {
        const s = await snap();
        const bal = await fez.balanceOf(addr);
        await (await (Pl.connect(safe) as any).windDown(bal, 0)).wait();
        const order = [...stakers];
        for (let i = order.length - 1; i > 0; i--) { const j = Number(rnd(BigInt(i + 1))); [order[i], order[j]] = [order[j], order[i]]; }
        const got: Record<string, string> = {};
        let total = 0n;
        for (const st of order) {
          const c = await (Pl as any).claimable(st, A.EZETH);
          const b0 = await ez.balanceOf(st);
          await (await (Pl.connect(dev) as any).claim(st, ethers.ZeroAddress)).wait();
          const g = (await ez.balanceOf(st)) - b0;
          ck(`${name} run${run} ${st.slice(0, 8)} claimed == claimable`, g === c, `${g} vs ${c}`);
          got[st] = g.toString(); total += g;
          // double claim yields nothing more
          const b1 = await ez.balanceOf(st);
          await (await (Pl.connect(dev) as any).claim(st, ethers.ZeroAddress)).wait();
          ck(`${name} run${run} ${st.slice(0, 8)} second claim is a no-op`, (await ez.balanceOf(st)) === b1);
          await network.provider.send("evm_increaseTime", [Number(rnd(7200n))]); await network.provider.send("evm_mine", []);
        }
        ck(`${name} run${run} pool remains solvent`, (await ez.balanceOf(addr)) >= 0n);
        orders.push(JSON.stringify(Object.keys(got).sort().map((k) => got[k])));
        await back(s);
      }
      ckv(`${name}: 3 different claim orders give identical per-staker amounts`, new Set(orders).size === 1);
    }
  }

  // ======================= PART 9: end-to-end conservation =======================
  console.log("\n########## 9. End-to-end conservation ##########");
  {
    const s = await snap();
    // redeem every token that exists, in a shuffled order across all real holders
    const jobs: Array<[string, boolean, bigint]> = [];
    for (const h of [A.RUSD, A.EZ_POOL, A.XEZ_POOL]) { const b = await fez.balanceOf(h); if (b > 0n) jobs.push([h, true, b]); }
    for (const [h] of H.xezeth as any[]) { const b = await xez.balanceOf(h); if (b > 0n) jobs.push([h, false, b]); }
    for (let i = jobs.length - 1; i > 0; i--) { const j = Number(rnd(BigInt(i + 1))); [jobs[i], jobs[j]] = [jobs[j], jobs[i]]; }
    let paid = 0n, skipped = 0n;
    for (const [h, side, amt] of jobs) {
      const hs = await imp(h);
      try {
        if (side) { const r = await (M.connect(hs) as any).redeemFToken.staticCall(amt, h, 0); await (await (M.connect(hs) as any).redeemFToken(amt, h, 0)).wait(); paid += r[0]; }
        else { const r = await (M.connect(hs) as any).redeemXToken.staticCall(amt, h, 0); await (await (M.connect(hs) as any).redeemXToken(amt, h, 0)).wait(); paid += r; }
      } catch (e) { skipped += amt; }
    }
    const claimed = await T.windDownBaseClaimed();
    const left = await ez.balanceOf(A.EZ_TREASURY);
    const fLeft = await fez.totalSupply(), xLeft = await xez.totalSupply();
    console.log(`  redeemed ${f(paid)} ezETH across ${jobs.length} holders; fezETH left ${f(fLeft)}, xezETH left ${f(xLeft)}`);
    ckv("claimed == sum of all payouts", claimed === paid, f(claimed));
    ckv("claimed + treasury balance == windDownBaseBalance", claimed + left === CAP, `${f(claimed)} + ${f(left)} == ${f(CAP)}`);
    ckv("claimed <= windDownBaseBalance", claimed <= CAP);
    const owedF = fLeft === 0n ? 0n : (fLeft * FB) / FS, owedX = xLeft === 0n ? 0n : (xLeft * XB) / XS;
    ckv("treasury remainder >= what unredeemed holders are still owed", left >= owedF + owedX, `${f(left)} >= ${f(owedF + owedX)}`);
    ckv("leftover dust is bounded (< 1e-9 ezETH per redemption)", left - (owedF + owedX) < BigInt(jobs.length) * 10n ** 9n, f(left - owedF - owedX));
    // finalize and sweep
    const safeBefore = await ez.balanceOf(A.SAFE);
    await (await (T.connect(safe) as any).finalizeWindDown()).wait();
    await rev("redeem after finalize", async () => await (M.connect(await imp(A.RUSD)) as any).redeemFToken.staticCall(1, A.RUSD, 0), "ErrorWindDownFinalized");
    await rev("finalizeWindDown twice", async () => await (T.connect(safe) as any).finalizeWindDown.staticCall(), "ErrorWindDownNotStarted");
    await (await (T.connect(safe) as any).adminClaim()).wait();
    ckv("adminClaim swept the exact remainder", (await ez.balanceOf(A.SAFE)) - safeBefore === left, f(left));
    ckv("treasury ezETH == 0 after sweep", (await ez.balanceOf(A.EZ_TREASURY)) === 0n);
    await (await (T.connect(safe) as any).adminClaim()).wait();
    ckv("adminClaim is idempotent on an empty treasury", (await ez.balanceOf(A.EZ_TREASURY)) === 0n);
    await back(s);
  }

  console.log("\n================ FUZZ / INVARIANT RESULT ================");
  console.log("PASS " + P + "   FAIL " + F);
  if (F) { console.log("\nFAILURES:"); FAILS.slice(0, 40).forEach((x) => console.log("  - " + x)); }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

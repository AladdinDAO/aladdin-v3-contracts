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
  WEETH_MARKET: "0x267C6A96Db7422faA60Aa7198FfEeeC4169CD65f",
  FEETH: "0x9216272158F563488FfC36AFB877acA2F265C560",
  XEETH: "0xACB3604AaDF26e6C0bb8c720420380629A328d2C",
  SAFE: "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF",
  PROXY_ADMIN: "0x9b54b7703551d9d0ced177a78367560a8b2edda4",
  TIMELOCK: "0x68863fb8855b04509a835082478D6E3D0bE4E61a",
  FXN: "0x365AccFCa291e7D3914637ABf1F7635dB165Bb09",
  WEETH_WHALE: "0x267C6A96Db7422faA60Aa7198FfEeeC4169CD65f",
};

const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const E = 10n ** 18n;
const fmt = (v: bigint, d = 18) => ethers.formatUnits(v, d);
const ZERO32 = ethers.ZeroHash;

const ERC20 = ["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function approve(address,uint256) returns (bool)","function transfer(address,uint256) returns (bool)"];
const PROXY_ADMIN_ABI = ["function upgrade(address,address)","function owner() view returns (address)","function getProxyImplementation(address) view returns (address)"];
const TIMELOCK_ABI = [
  "function scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)",
  "function executeBatch(address[],uint256[],bytes[],bytes32,bytes32) payable",
  "function getMinDelay() view returns (uint256)",
];
const MARKET_ABI = [
  "function redeemFToken(uint256,address,uint256) returns (uint256,uint256)",
  "function redeemXToken(uint256,address,uint256) returns (uint256)",
  "function updateRedeemFeeRatio(uint256,int256,bool)",
  "function fTokenRedeemFeeRatio() view returns (uint256,int256)",
  "function xTokenRedeemFeeRatio() view returns (uint256,int256)",
  "function xTokenRedeemPausedInStabilityMode() view returns (bool)",
];
const TREASURY_ABI = [
  "function windDownStatus() view returns (uint8)",
  "function windDownBaseBalance() view returns (uint256)",
  "function windDownFSupply() view returns (uint256)",
  "function windDownXSupply() view returns (uint256)",
  "function windDownFBaseBalance() view returns (uint256)",
  "function windDownXBaseBalance() view returns (uint256)",
  "function windDownBaseClaimed() view returns (uint256)",
  "function windDownPreviewRedeem(uint256,uint256) view returns (uint256)",
  "function initializeWindDown(uint256,uint256,uint256,uint256,uint256)",
  "function finalizeWindDown()",
  "function adminClaim()",
  "function isUnderCollateral() view returns (bool)",
  "function maxRedeemableFToken(uint256) view returns (uint256,uint256)",
  "function totalBaseToken() view returns (uint256)",
  "function updateBaseTokenCap(uint256)",
  "function baseTokenCap() view returns (uint256)",
  "function getUnderlyingValue(uint256) view returns (uint256)",
  "function getWrapppedValue(uint256) view returns (uint256)",
];
const FXUSD_ABI = [
  "function isUnderCollateral() view returns (bool)",
  "function nav() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function markets(address) view returns (address,address,address,uint256,uint256)",
  "function getMarkets() view returns (address[])",
  "function getRebalancePools() view returns (address[])",
  "function mint(address,uint256,address,uint256) returns (uint256)",
  "function redeem(address,uint256,address,uint256) returns (uint256,uint256)",
  "function autoRedeem(uint256,address,uint256[]) returns (address[],uint256[],uint256[])",
  "function removeMarket(address)",
  "function removeRebalancePools(address[])",
  "function updateMintCap(address,uint256)",
];
const POOL_ABI = [
  "function windDown(uint256,uint256) returns (uint256,uint256)",
  "function adminClaim()",
  "function deposit(uint256,address)",
  "function withdraw(uint256,address)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function claimable(address,address) view returns (uint256)",
  "function claim(address,address)",
  "function getActiveRewardTokens() view returns (address[])",
  "function getHistoricalRewardTokens() view returns (address[])",
  "function asset() view returns (address)",
  "function fxn() view returns (address)","function ve() view returns (address)","function veHelper() view returns (address)","function minter() view returns (address)",
];

let PASS = 0, FAIL = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) { PASS++; console.log("  PASS  " + label + (detail ? "  " + detail : "")); }
  else { FAIL++; console.log("  FAIL  " + label + (detail ? "  " + detail : "")); }
}
async function expectRevert(label: string, fn: () => Promise<any>, want?: string) {
  try { await fn(); check(label + " reverts", false, "(did not revert)"); }
  catch (e: any) {
    const msg = (e.shortMessage || e.message || "").toString();
    const ok = !want || msg.includes(want);
    check(label + " reverts" + (want ? ` (${want})` : ""), ok, ok ? "" : msg.slice(0, 120));
  }
}
async function imp(addr: string) {
  await network.provider.send("hardhat_impersonateAccount", [addr]);
  await network.provider.send("hardhat_setBalance", [addr, "0x3635c9adc5dea00000"]);
  return await ethers.getSigner(addr);
}
async function implOf(proxy: string) {
  return "0x" + (await network.provider.send("eth_getStorageAt", [proxy, IMPL_SLOT, "latest"])).slice(26);
}
async function stealERC20(token: string, from: string, to: string, amount: bigint) {
  const s = await imp(from);
  await (new ethers.Contract(token, ERC20, s) as any).transfer(to, amount);
}

async function main() {
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: RPC } }] });
  await network.provider.send("evm_mine", []);
  const bn = await ethers.provider.getBlockNumber();
  console.log("fork block", bn);

  const [dev] = await ethers.getSigners();
  const ez = new ethers.Contract(A.EZETH, ERC20, ethers.provider);
  const fez = new ethers.Contract(A.FEZETH, ERC20, ethers.provider);
  const xez = new ethers.Contract(A.XEZETH, ERC20, ethers.provider);
  const fxn = new ethers.Contract(A.FXN, ERC20, ethers.provider);
  const weeth = new ethers.Contract(A.WEETH, ERC20, ethers.provider);
  const T = new ethers.Contract(A.EZ_TREASURY, TREASURY_ABI, ethers.provider);
  const M = new ethers.Contract(A.EZ_MARKET, MARKET_ABI, ethers.provider);
  const R = new ethers.Contract(A.RUSD, FXUSD_ABI, ethers.provider);
  const EZP = new ethers.Contract(A.EZ_POOL, POOL_ABI, ethers.provider);
  const XEZP = new ethers.Contract(A.XEZ_POOL, POOL_ABI, ethers.provider);

  const safe = await imp(A.SAFE);

  // ---------------- Section 0: baseline ----------------
  console.log("\n=== 0. Baseline (pre-upgrade mainnet state)");
  const B0 = await ez.balanceOf(A.EZ_TREASURY);
  const F0 = await fez.totalSupply();
  const X0 = await xez.totalSupply();
  console.log("  treasury ezETH", fmt(B0), " fezETH supply", fmt(F0), " xezETH supply", fmt(X0));
  await expectRevert("baseline rUSD.isUnderCollateral()", async () => await R.isUnderCollateral());
  await expectRevert("baseline rUSD.redeem(weETH)", async () => await R.connect(dev).redeem.staticCall(A.WEETH, E, dev.address, 0));
  await expectRevert("baseline rUSD.autoRedeem", async () => await R.connect(dev).autoRedeem.staticCall(E, dev.address, [0, 0]));
  await expectRevert("baseline ezMarket.redeemFToken", async () => await M.connect(dev).redeemFToken.staticCall(E, dev.address, 0));

  // seed pool depositors from the pools' own fezETH before wind-down (simulates two real stakers)
  const DEP_A = "0x00000000000000000000000000000000000000A1";
  const DEP_B = "0x00000000000000000000000000000000000000b2";

  // ---------------- Section 1: real upgrade path (Timelock -> ProxyAdmin) ----------------
  console.log("\n=== 1. Upgrade via the real ProxyAdmin/Timelock path");
  const FxUSDF = await ethers.getContractFactory("FxUSD");
  const fxusdImpl = await FxUSDF.deploy();
  const TreF = await ethers.getContractFactory("WrappedTokenTreasuryV2WindDown");
  const treImpl = await TreF.deploy(A.EZETH, A.FEZETH, A.XEZETH);
  const PoolF = await ethers.getContractFactory("FxUSDShareableRebalancePoolWindDown");
  const poolImpl = await PoolF.deploy(await EZP.fxn(), await EZP.ve(), await EZP.veHelper(), await EZP.minter());
  await fxusdImpl.waitForDeployment(); await treImpl.waitForDeployment(); await poolImpl.waitForDeployment();
  console.log("  impls:", await fxusdImpl.getAddress(), await treImpl.getAddress(), await poolImpl.getAddress());

  const pa = new ethers.Contract(A.PROXY_ADMIN, PROXY_ADMIN_ABI, ethers.provider);
  const tl = new ethers.Contract(A.TIMELOCK, TIMELOCK_ABI, safe);
  const minDelay: bigint = await tl.getMinDelay();
  console.log("  timelock minDelay", minDelay.toString(), "s =", Number(minDelay) / 86400, "days");
  check("ProxyAdmin.owner == Timelock", (await pa.owner()).toLowerCase() === A.TIMELOCK.toLowerCase());

  const paIface = new ethers.Interface(PROXY_ADMIN_ABI);
  const targets = [A.PROXY_ADMIN, A.PROXY_ADMIN, A.PROXY_ADMIN, A.PROXY_ADMIN];
  const values = [0, 0, 0, 0];
  const payloads = [
    paIface.encodeFunctionData("upgrade", [A.RUSD, await fxusdImpl.getAddress()]),
    paIface.encodeFunctionData("upgrade", [A.EZ_TREASURY, await treImpl.getAddress()]),
    paIface.encodeFunctionData("upgrade", [A.EZ_POOL, await poolImpl.getAddress()]),
    paIface.encodeFunctionData("upgrade", [A.XEZ_POOL, await poolImpl.getAddress()]),
  ];
  const salt = ethers.id("ezeth-winddown");
  await (await tl.scheduleBatch(targets, values, payloads, ZERO32, salt, minDelay)).wait();
  await expectRevert("executeBatch before delay", async () => await tl.executeBatch.staticCall(targets, values, payloads, ZERO32, salt));
  await network.provider.send("evm_increaseTime", [Number(minDelay) + 1]);
  await network.provider.send("evm_mine", []);
  await (await tl.executeBatch(targets, values, payloads, ZERO32, salt)).wait();
  check("rUSD impl upgraded", (await implOf(A.RUSD)).toLowerCase() === (await fxusdImpl.getAddress()).toLowerCase());
  check("ezTreasury impl upgraded", (await implOf(A.EZ_TREASURY)).toLowerCase() === (await treImpl.getAddress()).toLowerCase());
  check("ezPool impl upgraded", (await implOf(A.EZ_POOL)).toLowerCase() === (await poolImpl.getAddress()).toLowerCase());
  check("xezPool impl upgraded", (await implOf(A.XEZ_POOL)).toLowerCase() === (await poolImpl.getAddress()).toLowerCase());
  check("ezMarket impl UNCHANGED", (await implOf(A.EZ_MARKET)).toLowerCase() === "0xe650a519a88bc980750cea783e26d32fd35c3b5e");
  check("weETH treasury impl UNCHANGED", (await implOf(A.WEETH_TREASURY)).toLowerCase() !== (await treImpl.getAddress()).toLowerCase());

  // ---------------- Section 2: the window between upgrade and initializeWindDown ----------------
  console.log("\n=== 2. Window between upgrade and initializeWindDown (windDownStatus == 0)");
  check("windDownStatus == 0", (await T.windDownStatus()) === 0n);
  check("ezTreasury.isUnderCollateral() == false (no oracle)", (await T.isUnderCollateral()) === false);
  check("rUSD.isUnderCollateral() now callable == false", (await R.isUnderCollateral()) === false);
  const nav = await R.nav().catch((e: any) => "REVERT " + (e.shortMessage || "").slice(0, 60));
  console.log("  rUSD.nav() ->", typeof nav === "bigint" ? fmt(nav) : nav);
  await expectRevert("ez redeemFToken before init", async () => await M.connect(dev).redeemFToken.staticCall(E, dev.address, 0));
  await expectRevert("treasury.mintFToken before init", async () => {
    const s = await imp(A.EZ_MARKET);
    await (new ethers.Contract(A.EZ_TREASURY, ["function mintFToken(uint256,address) returns (uint256)"], s) as any).mintFToken.staticCall(E, dev.address);
  });
  // can a plain rUSD holder still autoRedeem in this window?
  const rHolder = await findRusdHolder(R);
  if (rHolder) {
    console.log("  rUSD holder used for probes:", rHolder, fmt(await R.balanceOf(rHolder)));
    const hs = await imp(rHolder);
    const small = E; // 1 rUSD
    try {
      await (R.connect(hs) as any).autoRedeem.staticCall(small, rHolder, [0, 0]);
      check("small autoRedeem works in the window (routes to weETH)", true);
    } catch (e: any) { check("small autoRedeem works in the window", false, (e.shortMessage || "").slice(0, 90)); }
    const weManaged = (await R.markets(A.WEETH))[4];
    const big = weManaged + E;
    try {
      await (R.connect(hs) as any).autoRedeem.staticCall(big, rHolder, [0, 0]);
      check("autoRedeem spilling into ezETH market reverts in the window", false, "(it succeeded)");
    } catch (e: any) { check("autoRedeem spilling into ezETH market reverts in the window", true, (e.shortMessage || "").slice(0, 60)); }
  }
  console.log("  (weETH treasury baseTokenCap =", fmt(await (new ethers.Contract(A.WEETH_TREASURY, TREASURY_ABI, ethers.provider)).baseTokenCap()), " totalBaseToken =", fmt(await (new ethers.Contract(A.WEETH_TREASURY, TREASURY_ABI, ethers.provider)).totalBaseToken()), ")");

  console.log("\nSUMMARY so far: PASS", PASS, "FAIL", FAIL);
}

async function findRusdHolder(R: any): Promise<string | null> {
  const candidates = [
    "0x0084C2e1B1823564e597Ff4848a88D61ac63D703",
    "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF",
  ];
  for (const c of candidates) { if ((await R.balanceOf(c)) > 0n) return c; }
  return null;
}

main().then(() => process.exit(FAIL === 0 ? 0 : 1)).catch((e) => { console.error(e); process.exit(1); });

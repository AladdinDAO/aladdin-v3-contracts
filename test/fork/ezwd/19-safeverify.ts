import { ethers, network } from "hardhat";
import * as fs from "fs";

const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const DIR = "/tmp/ezwd/safe";
const A: any = {
  SAFE: "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF",
  MULTISEND: "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D",
  TIMELOCK: "0x68863fb8855b04509a835082478D6E3D0bE4E61a",
  PROXY_ADMIN: "0x9B54B7703551D9d0ced177A78367560a8B2eDDA4",
  EZETH: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",
  FEZETH: "0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9",
  XEZETH: "0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5",
  EZ_TREASURY: "0x38965311507D4E54973F81475a149c09376e241e",
  EZ_MARKET: "0x69518D1D70AD537C41401303BDf96032338E40dE",
  EZ_POOL: "0xf58c499417e36714e99803Cb135f507a95ae7169",
  XEZ_POOL: "0xBa947cba270D30967369Bf1f73884Be2533d7bDB",
  RUSD: "0x65D72AA8DA931F047169112fcf34f52DbaAE7D18",
  WEETH: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee",
  WEETH_WHALE: "0xBdfa7b7893081B35Fb54027489e2Bc7A38275129",
  FXN: "0x365AccFCa291e7D3914637ABf1F7635dB165Bb09",
};
const IMPL = { fxusd: "0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd", treasury: "0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC", pool: "0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5" };
const EZ_VAULTS = ["0x4A036ab673722468a8e1fCC0F74A2dD5914FD1c1","0x4c75A7349B20745DAf37E6C348b85E8a03F72F9A","0x0Fa286332b2d1bBB0c7637CD63BA742a050b5AAd","0x7DCe6D8752A0e2fCF3cE92e9CeAdf9857F920ACc","0xCbE9e9E80b5301956c12FbB40742b144f98d4e63","0x492550DDcc5349940A879cAf4d3CFFfaa1Ab0F64"];
const XEZ_VAULTS = ["0xC68A2AE2b932C472Fd4Ad4367FF6e093E4E3Da8f","0x3b0c2E02b0F3a4f507bA8F39aB3Ea93BF4863a90","0x9af69159D25e213a35A2b6E7274023Da2D2bdaC6","0x1090988Cf5569cc811756220AC3160aA028988AA"];

const SAFE_ABI = [
  "function nonce() view returns (uint256)",
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function domainSeparator() view returns (bytes32)",
  "function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns (bytes32)",
  "function approveHash(bytes32)",
  "function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) payable returns (bool)",
];
const E = 10n ** 18n;
const f = (v: bigint) => ethers.formatUnits(v, 18);
let P = 0, F = 0;
const ck = (l: string, c: boolean, d = "") => { if (c) { P++; console.log("  PASS  " + l + (d ? "  " + d : "")); } else { F++; console.log("  FAIL  " + l + (d ? "  " + d : "")); } };
async function imp(a: string) { await network.provider.send("hardhat_impersonateAccount", [a]); await network.provider.send("hardhat_setBalance", [a, "0x21e19e0c9bab2400000"]); return await ethers.getSigner(a); }

function encodeTx(t: any) {
  const m = t.contractMethod;
  const types = m.inputs.map((i: any) => i.type);
  const args = m.inputs.map((i: any) => {
    const v = t.contractInputsValues[i.name];
    if (i.type.endsWith("[]")) return JSON.parse(v);
    if (i.type === "bool") return v === "true";
    return v;
  });
  const sig = `${m.name}(${types.join(",")})`;
  return ethers.id(sig).slice(0, 10) + ethers.AbiCoder.defaultAbiCoder().encode(types, args).slice(2);
}
function multiSend(txs: any[]) {
  let packed = "0x";
  for (const t of txs) {
    const data = encodeTx(t);
    packed += "00" + t.to.slice(2).toLowerCase() +
      ethers.toBeHex(BigInt(t.value || "0"), 32).slice(2) +
      ethers.toBeHex((data.length - 2) / 2, 32).slice(2) + data.slice(2);
  }
  return new ethers.Interface(["function multiSend(bytes)"]).encodeFunctionData("multiSend", [packed]);
}

async function execViaSafe(label: string, txs: any[]) {
  const safeRead = new ethers.Contract(A.SAFE, SAFE_ABI, ethers.provider);
  const owners: string[] = [...(await safeRead.getOwners())];
  const threshold = Number(await safeRead.getThreshold());
  const nonce = await safeRead.nonce();
  const single = txs.length === 1;
  const to = single ? txs[0].to : A.MULTISEND;
  const data = single ? encodeTx(txs[0]) : multiSend(txs);
  const operation = single ? 0 : 1;
  const safeTxHash = await safeRead.getTransactionHash(to, 0, data, operation, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, nonce);

  // independent EIP-712 recomputation
  const ds = await safeRead.domainSeparator();
  const TYPEHASH = ethers.id("SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)");
  const structHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address", "uint256", "bytes32", "uint8", "uint256", "uint256", "uint256", "address", "address", "uint256"],
    [TYPEHASH, to, 0, ethers.keccak256(data), operation, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, nonce]));
  const recomputed = ethers.keccak256(ethers.concat(["0x1901", ds, structHash]));
  ck(`${label}: safeTxHash 与独立 EIP-712 复算一致`, recomputed === safeTxHash, safeTxHash);

  const signers = owners.slice(0, threshold).map((o) => o.toLowerCase()).sort();
  for (const o of signers) { const s = await imp(ethers.getAddress(o)); await (await (new ethers.Contract(A.SAFE, SAFE_ABI, s) as any).approveHash(safeTxHash)).wait(); }
  let sigs = "0x";
  for (const o of signers) sigs += ethers.zeroPadValue(o, 32).slice(2) + "0".repeat(64) + "01";

  const exec = await imp(ethers.getAddress(signers[0]));
  const r = await (await (new ethers.Contract(A.SAFE, SAFE_ABI, exec) as any).execTransaction(to, 0, data, operation, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, sigs)).wait();
  ck(`${label}: 真实 ${threshold}/${owners.length} execTransaction 成功`, r.status === 1, `nonce ${nonce}  ${txs.length} 步  gas ${r.gasUsed}`);
  return { safeTxHash, gasUsed: r.gasUsed, nonce, calldataLen: (data.length - 2) / 2 };
}

const implOf = async (px: string) => "0x" + (await network.provider.send("eth_getStorageAt", [px, "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", "latest"])).slice(26);

async function main() {
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: RPC } }] });
  await network.provider.send("evm_mine", []);
  const [dev] = await ethers.getSigners();
  const b1 = JSON.parse(fs.readFileSync(`${DIR}/safe-1-upgrade-schedule.json`, "utf8")).transactions;
  const b2 = JSON.parse(fs.readFileSync(`${DIR}/safe-2-pause-and-execute.json`, "utf8")).transactions;
  const b3 = JSON.parse(fs.readFileSync(`${DIR}/safe-3-operations.json`, "utf8")).transactions;
  console.log("fork block " + (await ethers.provider.getBlockNumber()));
  console.log(`载入 JSON: 批次一 ${b1.length} 步, 批次二 ${b2.length} 步, 批次三 ${b3.length} 步\n`);

  const ez = new ethers.Contract(A.EZETH, ["function balanceOf(address) view returns (uint256)"], ethers.provider);
  const fez = new ethers.Contract(A.FEZETH, ["function balanceOf(address) view returns (uint256)"], ethers.provider);
  const fxn = new ethers.Contract(A.FXN, ["function balanceOf(address) view returns (uint256)"], ethers.provider);
  const weeth = new ethers.Contract(A.WEETH, ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"], ethers.provider);
  const Mk = new ethers.Contract(A.EZ_MARKET, ["function mintPaused() view returns (bool)", "function redeemPaused() view returns (bool)", "function fTokenRedeemFeeRatio() view returns (uint256,int256)", "function xTokenRedeemFeeRatio() view returns (uint256,int256)"], ethers.provider);
  const T = new ethers.Contract(A.EZ_TREASURY, ["function windDownStatus() view returns (uint8)", "function windDownBaseBalance() view returns (uint256)", "function windDownFBaseBalance() view returns (uint256)"], ethers.provider);
  const R = new ethers.Contract(A.RUSD, ["function markets(address) view returns (address,address,address,uint256,uint256)", "function getMarkets() view returns (address[])", "function getRebalancePools() view returns (address[])"], ethers.provider);

  // ---- 治理路径: 批次一 + 3 天 + 批次二 ----
  console.log("=== 批次一: schedule ===");
  const r1 = await execViaSafe("批次一", b1);
  const tl = new ethers.Contract(A.TIMELOCK, ["function isOperationPending(bytes32) view returns (bool)", "function isOperationDone(bytes32) view returns (bool)", "function getMinDelay() view returns (uint256)"], ethers.provider);
  const opId = "0x0aaf4bd9ba41f8e3e9031261c08f81ae0fa868bf652199a0e7f320d32c2b627a";
  ck("批次一: Timelock operation 进入 pending", await tl.isOperationPending(opId));

  const gov = await network.provider.send("evm_snapshot", []);
  await network.provider.send("evm_increaseTime", [Number(await tl.getMinDelay()) + 1]);
  await network.provider.send("evm_mine", []);
  console.log("\n=== 批次二: pause + executeBatch (3 天后) ===");
  await execViaSafe("批次二", b2);
  ck("批次二: mintPaused", (await Mk.mintPaused()) === true);
  ck("批次二: redeemPaused", (await Mk.redeemPaused()) === true);
  ck("批次二: 四个代理升级到位",
    (await implOf(A.RUSD)) === IMPL.fxusd.toLowerCase() && (await implOf(A.EZ_TREASURY)) === IMPL.treasury.toLowerCase() &&
    (await implOf(A.EZ_POOL)) === IMPL.pool.toLowerCase() && (await implOf(A.XEZ_POOL)) === IMPL.pool.toLowerCase());
  ck("批次二: Timelock operation done", await tl.isOperationDone(opId));
  ck("批次二: windDownStatus == 0", (await T.windDownStatus()) === 0n);

  // 回滚时间线(历史 fork 的 3 天快进会让 weETH 预言机过期), 用 Timelock 身份复原同一升级结果
  await network.provider.send("evm_revert", [gov]);
  {
    const s = await imp(A.SAFE);
    const mk = new ethers.Contract(A.EZ_MARKET, ["function updateMintStatus(bool)", "function updateRedeemStatus(bool)"], s);
    await (await mk.updateMintStatus(true)).wait();
    await (await mk.updateRedeemStatus(true)).wait();
    const t = await imp(A.TIMELOCK);
    const pa = new ethers.Contract(A.PROXY_ADMIN, ["function upgrade(address,address)"], t);
    for (const [px, im] of [[A.RUSD, IMPL.fxusd], [A.EZ_TREASURY, IMPL.treasury], [A.EZ_POOL, IMPL.pool], [A.XEZ_POOL, IMPL.pool]]) await (await pa.upgrade(px, im)).wait();
  }

  // Safe 需要先持有 weETH
  {
    const need = BigInt(b3.find((t: any) => t.contractMethod.name === "approve").contractInputsValues.amount);
    const w = await imp(A.WEETH_WHALE);
    await (await (weeth.connect(w) as any).transfer(A.SAFE, need)).wait();
    ck("前置: Safe 已持有批次三所需 weETH", (await weeth.balanceOf(A.SAFE)) >= need, f(need));
  }

  console.log("\n=== 批次三: 22 步 operations ===");
  const r3 = await execViaSafe("批次三", b3);
  ck("批次三: 费率两档归零", (await Mk.fTokenRedeemFeeRatio())[0] === 0n && (await Mk.xTokenRedeemFeeRatio())[0] === 0n && (await Mk.xTokenRedeemFeeRatio())[1] === 0n);
  ck("批次三: windDownStatus == 1", (await T.windDownStatus()) === 1n);
  ck("批次三: rUSD ezETH managed == 0", (await R.markets(A.EZETH))[4] === 0n);
  ck("批次三: ezETH market 已移除", !(await R.getMarkets()).map((x: string) => x.toLowerCase()).includes(A.EZETH.toLowerCase()));
  const pools = (await R.getRebalancePools()).map((x: string) => x.toLowerCase());
  ck("批次三: 两个 ezETH pool 已移除", !pools.includes(A.EZ_POOL.toLowerCase()) && !pools.includes(A.XEZ_POOL.toLowerCase()));
  ck("批次三: 两个 pool 的 fezETH 清零", (await fez.balanceOf(A.EZ_POOL)) === 0n && (await fez.balanceOf(A.XEZ_POOL)) === 0n);
  ck("批次三: mint 仍暂停, redeem 已开放", (await Mk.mintPaused()) === true && (await Mk.redeemPaused()) === false);

  console.log("\n=== 批次三之后: 10 个真实存款人逐个领取 ===");
  let ok = 0, got = 0n;
  for (const [name, pool, list] of [["ezPool", A.EZ_POOL, EZ_VAULTS], ["xezPool", A.XEZ_POOL, XEZ_VAULTS]] as const) {
    const Pl = new ethers.Contract(pool, ["function claimable(address,address) view returns (uint256)", "function claim(address,address)"], ethers.provider);
    for (const v of list) {
      const c: bigint = await Pl.claimable(v, A.EZETH);
      const b0: bigint = await ez.balanceOf(v);
      try {
        await (await (Pl.connect(dev) as any).claim(v, ethers.ZeroAddress)).wait();
        const g = (await ez.balanceOf(v)) - b0;
        ck(`  ${name} ${v.slice(0, 10)} 实收 == claimable`, g === c, f(g));
        if (g === c) { ok++; got += g; }
      } catch (e: any) { ck(`  ${name} ${v.slice(0, 10)} 领取`, false, (e.shortMessage || "").slice(0, 50)); }
    }
  }
  ck(`全部 10 个存款人均可领取`, ok === 10, `合计 ${f(got)} ezETH`);

  console.log("\n================ 结果 ================");
  console.log(`PASS ${P}   FAIL ${F}`);
  console.log(`批次一 safeTxHash ${r1.safeTxHash}  gas ${r1.gasUsed}`);
  console.log(`批次三 safeTxHash ${r3.safeTxHash}  gas ${r3.gasUsed}  calldata ${r3.calldataLen} bytes`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

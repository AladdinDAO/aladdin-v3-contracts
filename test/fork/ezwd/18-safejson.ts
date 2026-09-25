import { ethers, network } from "hardhat";
import * as fs from "fs";

const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const OUT = "/tmp/ezwd/safe";

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
};
const IMPL = {
  fxusd: "0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd",
  treasury: "0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC",
  pool: "0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5",
};
const EZ_VAULTS = [
  "0x4A036ab673722468a8e1fCC0F74A2dD5914FD1c1",
  "0x4c75A7349B20745DAf37E6C348b85E8a03F72F9A",
  "0x0Fa286332b2d1bBB0c7637CD63BA742a050b5AAd",
  "0x7DCe6D8752A0e2fCF3cE92e9CeAdf9857F920ACc",
  "0xCbE9e9E80b5301956c12FbB40742b144f98d4e63",
  "0x492550DDcc5349940A879cAf4d3CFFfaa1Ab0F64",
];
const XEZ_VAULTS = [
  "0xC68A2AE2b932C472Fd4Ad4367FF6e093E4E3Da8f",
  "0x3b0c2E02b0F3a4f507bA8F39aB3Ea93BF4863a90",
  "0x9af69159D25e213a35A2b6E7274023Da2D2bdaC6",
  "0x1090988Cf5569cc811756220AC3160aA028988AA",
];
const SALT = "0x7a1de5f0c2b4498d6e3a0f7c5d2b8e14a9c6037b5e8d1f2a4c7b093e6d5a8f21";
const E = 10n ** 18n;
const f = (v: bigint) => ethers.formatUnits(v, 18);

const M: any = {
  scheduleBatch: { name: "scheduleBatch", payable: false, inputs: [{ name: "targets", type: "address[]" }, { name: "values", type: "uint256[]" }, { name: "payloads", type: "bytes[]" }, { name: "predecessor", type: "bytes32" }, { name: "salt", type: "bytes32" }, { name: "delay", type: "uint256" }] },
  executeBatch: { name: "executeBatch", payable: true, inputs: [{ name: "targets", type: "address[]" }, { name: "values", type: "uint256[]" }, { name: "payloads", type: "bytes[]" }, { name: "predecessor", type: "bytes32" }, { name: "salt", type: "bytes32" }] },
  updateMintStatus: { name: "updateMintStatus", payable: false, inputs: [{ name: "_newStatus", type: "bool" }] },
  updateRedeemStatus: { name: "updateRedeemStatus", payable: false, inputs: [{ name: "_newStatus", type: "bool" }] },
  updateRedeemFeeRatio: { name: "updateRedeemFeeRatio", payable: false, inputs: [{ name: "_defaultFeeRatio", type: "uint256" }, { name: "_extraFeeRatio", type: "int256" }, { name: "_isFToken", type: "bool" }] },
  initializeWindDown: { name: "initializeWindDown", payable: false, inputs: [{ name: "_expectedBaseBalance", type: "uint256" }, { name: "_expectedFSupply", type: "uint256" }, { name: "_expectedXSupply", type: "uint256" }, { name: "_fWeight", type: "uint256" }, { name: "_xWeight", type: "uint256" }] },
  updateBaseTokenCap: { name: "updateBaseTokenCap", payable: false, inputs: [{ name: "_baseTokenCap", type: "uint256" }] },
  approve: { name: "approve", payable: false, inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }] },
  mint: { name: "mint", payable: false, inputs: [{ name: "_baseToken", type: "address" }, { name: "_amountIn", type: "uint256" }, { name: "_receiver", type: "address" }, { name: "_minOut", type: "uint256" }] },
  redeem: { name: "redeem", payable: false, inputs: [{ name: "_baseToken", type: "address" }, { name: "_amountIn", type: "uint256" }, { name: "_receiver", type: "address" }, { name: "_minOut", type: "uint256" }] },
  removeMarket: { name: "removeMarket", payable: false, inputs: [{ name: "baseToken", type: "address" }] },
  removeRebalancePools: { name: "removeRebalancePools", payable: false, inputs: [{ name: "_pools", type: "address[]" }] },
  checkpoint: { name: "checkpoint", payable: false, inputs: [{ name: "_account", type: "address" }] },
  windDown: { name: "windDown", payable: false, inputs: [{ name: "_expectedAssetBalance", type: "uint256" }, { name: "_minBaseOut", type: "uint256" }] },
};

const tx = (to: string, m: any, vals: Record<string, string>) => ({
  to, value: "0",
  contractMethod: { inputs: m.inputs, name: m.name, payable: m.payable },
  contractInputsValues: vals,
});
const sigOf = (m: any) => `${m.name}(${m.inputs.map((i: any) => i.type).join(",")})`;
function encode(m: any, vals: Record<string, string>) {
  const types = m.inputs.map((i: any) => i.type);
  const args = m.inputs.map((i: any) => {
    const v = vals[i.name];
    if (i.type.endsWith("[]")) return JSON.parse(v);
    if (i.type === "bool") return v === "true";
    return v;
  });
  return ethers.id(sigOf(m)).slice(0, 10) + ethers.AbiCoder.defaultAbiCoder().encode(types, args).slice(2);
}

async function main() {
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: RPC } }] });
  await network.provider.send("evm_mine", []);
  const bn = await ethers.provider.getBlockNumber();

  const ez = new ethers.Contract(A.EZETH, ["function balanceOf(address) view returns (uint256)"], ethers.provider);
  const fez = new ethers.Contract(A.FEZETH, ["function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)"], ethers.provider);
  const xez = new ethers.Contract(A.XEZETH, ["function totalSupply() view returns (uint256)"], ethers.provider);
  const R = new ethers.Contract(A.RUSD, ["function markets(address) view returns (address,address,address,uint256,uint256)", "function balanceOf(address) view returns (uint256)"], ethers.provider);
  const WT = new ethers.Contract(A.WEETH_TREASURY, ["function totalBaseToken() view returns (uint256)", "function getUnderlyingValue(uint256) view returns (uint256)", "function currentBaseTokenPrice() view returns (uint256)", "function baseTokenCap() view returns (uint256)"], ethers.provider);
  const rp = new ethers.Contract("0xE3fF08070aB3aD7eeE7a1cab35105F27DF8EfF10", ["function getRate() view returns (uint256)"], ethers.provider);
  const cl = new ethers.Contract("0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"], ethers.provider);

  const B: bigint = await ez.balanceOf(A.EZ_TREASURY);
  const F: bigint = await fez.totalSupply();
  const X: bigint = await xez.totalSupply();
  const ethUsd = BigInt((await cl.latestRoundData())[1]) * 10n ** 10n;
  const rate: bigint = await rp.getRate();
  const Pez = (ethUsd * rate) / E;
  const fW = F;
  const xW = (B * Pez) / E - F;
  const fBase = (B * fW) / (fW + xW);
  const ezManaged: bigint = (await R.markets(A.EZETH))[4];
  const safeRUsd: bigint = await R.balanceOf(A.SAFE);
  const need = ezManaged > safeRUsd ? ezManaged - safeRUsd : 0n;
  const price: bigint = await WT.currentBaseTokenPrice();
  const fPerWe = ((await WT.getUnderlyingValue(E)) * price) / E;
  const weIn = (((need * E + fPerWe - 1n) / fPerWe) * 105n) / 100n;
  const weTotalBase: bigint = await WT.totalBaseToken();
  const newCap = weTotalBase + ((await WT.getUnderlyingValue(weIn)) * 120n) / 100n;
  const ezPoolAsset: bigint = await fez.balanceOf(A.EZ_POOL);
  const xezPoolAsset: bigint = await fez.balanceOf(A.XEZ_POOL);
  const rusdMinOut = (ezManaged * fBase) / F;
  const ezPoolMinOut = (ezPoolAsset * fBase) / F;
  const xezPoolMinOut = (xezPoolAsset * fBase) / F;

  const pai = new ethers.Interface(["function upgrade(address,address)"]);
  const targets = [A.PROXY_ADMIN, A.PROXY_ADMIN, A.PROXY_ADMIN, A.PROXY_ADMIN];
  const values = ["0", "0", "0", "0"];
  const payloads = [
    pai.encodeFunctionData("upgrade", [A.RUSD, IMPL.fxusd]),
    pai.encodeFunctionData("upgrade", [A.EZ_TREASURY, IMPL.treasury]),
    pai.encodeFunctionData("upgrade", [A.EZ_POOL, IMPL.pool]),
    pai.encodeFunctionData("upgrade", [A.XEZ_POOL, IMPL.pool]),
  ];

  const b1 = [tx(A.TIMELOCK, M.scheduleBatch, { targets: JSON.stringify(targets), values: JSON.stringify(values), payloads: JSON.stringify(payloads), predecessor: ethers.ZeroHash, salt: SALT, delay: "259200" })];
  const b2 = [
    tx(A.EZ_MARKET, M.updateMintStatus, { _newStatus: "true" }),
    tx(A.EZ_MARKET, M.updateRedeemStatus, { _newStatus: "true" }),
    tx(A.TIMELOCK, M.executeBatch, { targets: JSON.stringify(targets), values: JSON.stringify(values), payloads: JSON.stringify(payloads), predecessor: ethers.ZeroHash, salt: SALT }),
  ];
  const b3: any[] = [
    tx(A.EZ_MARKET, M.updateRedeemFeeRatio, { _defaultFeeRatio: "0", _extraFeeRatio: "0", _isFToken: "true" }),
    tx(A.EZ_MARKET, M.updateRedeemFeeRatio, { _defaultFeeRatio: "0", _extraFeeRatio: "0", _isFToken: "false" }),
    tx(A.EZ_TREASURY, M.initializeWindDown, { _expectedBaseBalance: B.toString(), _expectedFSupply: F.toString(), _expectedXSupply: X.toString(), _fWeight: fW.toString(), _xWeight: xW.toString() }),
    tx(A.WEETH_TREASURY, M.updateBaseTokenCap, { _baseTokenCap: newCap.toString() }),
    tx(A.WEETH, M.approve, { spender: A.RUSD, amount: weIn.toString() }),
    tx(A.RUSD, M.mint, { _baseToken: A.WEETH, _amountIn: weIn.toString(), _receiver: A.SAFE, _minOut: need.toString() }),
    tx(A.EZ_MARKET, M.updateRedeemStatus, { _newStatus: "false" }),
    tx(A.RUSD, M.redeem, { _baseToken: A.EZETH, _amountIn: ezManaged.toString(), _receiver: A.SAFE, _minOut: rusdMinOut.toString() }),
    tx(A.RUSD, M.removeMarket, { baseToken: A.EZETH }),
    tx(A.RUSD, M.removeRebalancePools, { _pools: JSON.stringify([A.EZ_POOL, A.XEZ_POOL]) }),
  ];
  for (const v of EZ_VAULTS) b3.push(tx(A.EZ_POOL, M.checkpoint, { _account: v }));
  b3.push(tx(A.EZ_POOL, M.windDown, { _expectedAssetBalance: ezPoolAsset.toString(), _minBaseOut: ezPoolMinOut.toString() }));
  for (const v of XEZ_VAULTS) b3.push(tx(A.XEZ_POOL, M.checkpoint, { _account: v }));
  b3.push(tx(A.XEZ_POOL, M.windDown, { _expectedAssetBalance: xezPoolAsset.toString(), _minBaseOut: xezPoolMinOut.toString() }));
  // 23: restore the weETH treasury cap to its pre-execution value so the batch leaves no open mint capacity
  b3.push(tx(A.WEETH_TREASURY, M.updateBaseTokenCap, { _baseTokenCap: (await WT.baseTokenCap()).toString() }));

  const mk = (name: string, desc: string, txs: any[]) => ({ version: "1.0", chainId: "1", createdAt: Date.now(), meta: { name, description: desc, txBuilderVersion: "1.18.0", createdFromSafeAddress: A.SAFE }, transactions: txs });
  fs.mkdirSync(OUT, { recursive: true });
  const files: Record<string, any> = {
    "safe-1-upgrade-schedule.json": mk("ezETH wind-down 1/3 schedule", "Timelock.scheduleBatch with 4 ProxyAdmin.upgrade payloads, delay 259200", b1),
    "safe-2-pause-and-execute.json": mk("ezETH wind-down 2/3 pause+execute", "Pause ezETH market mint and redeem, then Timelock.executeBatch", b2),
    "safe-3-operations.json": mk("ezETH wind-down 3/3 operations", "Fees to zero, initializeWindDown, rUSD migration, market/pool removal, checkpoints + windDown", b3),
  };
  for (const [n, j] of Object.entries(files)) fs.writeFileSync(`${OUT}/${n}`, JSON.stringify(j, null, 2));

  const tlc = new ethers.Contract(A.TIMELOCK, ["function hashOperationBatch(address[],uint256[],bytes[],bytes32,bytes32) view returns (bytes32)"], ethers.provider);
  const opId = await tlc.hashOperationBatch(targets, [0, 0, 0, 0], payloads, ethers.ZeroHash, SALT);

  console.log("fork block " + bn);
  console.log("\n===== 冻结后读数 (本次按当前区块模拟, 正式执行须在冻结后重读) =====");
  console.log("  B (Treasury ezETH)  = " + B.toString() + "   (" + f(B) + ")");
  console.log("  F (fezETH supply)   = " + F.toString() + "   (" + f(F) + ")");
  console.log("  X (xezETH supply)   = " + X.toString() + "   (" + f(X) + ")");
  console.log("  ETH/USD             = " + f(ethUsd) + "   ezETH rate = " + f(rate));
  console.log("  P_ezETH             = " + Pez.toString() + "   ($" + f(Pez) + ")");
  console.log("  fWeight             = " + fW.toString());
  console.log("  xWeight             = " + xW.toString());
  console.log("  f 份额               = " + (Number((fW * 1000000n) / (fW + xW)) / 10000).toFixed(4) + "%    fBase = " + f(fBase));
  console.log("  ezManaged           = " + ezManaged.toString());
  console.log("  Safe rUSD           = " + safeRUsd.toString() + "   需 mint = " + need.toString());
  console.log("  weETH in            = " + weIn.toString() + "   (" + f(weIn) + ")");
  console.log("  weETH totalBaseToken= " + weTotalBase.toString() + "   newCap = " + newCap.toString());
  console.log("  ezPool asset        = " + ezPoolAsset.toString() + "   minBaseOut = " + ezPoolMinOut.toString());
  console.log("  xezPool asset       = " + xezPoolAsset.toString() + "   minBaseOut = " + xezPoolMinOut.toString());

  console.log("\n===== 批次一: Timelock payload =====");
  payloads.forEach((p, i) => console.log("  [" + i + "] " + p));
  console.log("  salt        = " + SALT);
  console.log("  operationId = " + opId);
  console.log("  scheduleBatch calldata:");
  console.log("    " + encode(M.scheduleBatch, b1[0].contractInputsValues));

  console.log("\n===== 批次二: 3 步 =====");
  b2.forEach((t, i) => console.log("  " + (i + 1) + "  " + t.to + "  " + t.contractMethod.name + "  " + JSON.stringify(t.contractInputsValues).slice(0, 120)));

  console.log("\n===== 批次三: " + b3.length + " 步 =====");
  b3.forEach((t, i) => {
    const cd = encode(t.contractMethod, t.contractInputsValues);
    console.log("  " + String(i + 1).padStart(2) + "  " + t.to + "  " + t.contractMethod.name);
    console.log("      args " + JSON.stringify(t.contractInputsValues));
    console.log("      data " + (cd.length > 210 ? cd.slice(0, 210) + "…(" + (cd.length - 2) / 2 + " bytes)" : cd));
  });

  console.log("\nJSON 已写入 " + OUT);
  for (const n of Object.keys(files)) console.log("  " + n + "  " + fs.statSync(`${OUT}/${n}`).size + " bytes");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

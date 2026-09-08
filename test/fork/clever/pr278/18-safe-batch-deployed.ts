/* 上线批次的真实执行验证:
   T1 存储布局回归、T2 真实 6-of-9 execTransaction 原子批次、
   T3 批次失败时的原子性、T4 两次调用之间的无权限干扰、T5 批次 gas。 */
import { ethers, network } from "hardhat";

const FORK_URL = process.env.HARDHAT_FORK_URL || "https://eth-mainnet.public.blastapi.io";
const FORK_BLOCK = Number(process.env.FORK_BLOCK);
const WEEK = 604800;
const NEW_IMPL = "0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534";
const OLD_IMPL = "0xDFC1F72D5604020463318ff256433eca02B355d2";
const LOCKER = "0x96C68D861aDa016Ed98c30C810879F9df7c64154";
const PROXY_ADMIN = "0x1F57286F7a8083fb363d87Bc8b1DCcD685dc87EE";
const SAFE = "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E";
const MULTISEND = "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D"; // MultiSendCallOnly v1.3.0
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const CVX_LOCKER = "0x72a19342e8F1838460eBFCCEf09F6585e32db86E";
const DRAINER = "0xf60240e419bb0a3e9d8527e5b045f86dcdd6ce44";
const WHALE = "0x28C6c06298d514Db089934071355E5743bf21d60"; // 无关的 CVX 大户,仅用于出资
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

const SAFE_ABI = [
  "function getOwners() view returns (address[])","function getThreshold() view returns (uint256)","function nonce() view returns (uint256)",
  "function approveHash(bytes32)","function approvedHashes(address,bytes32) view returns (uint256)","function domainSeparator() view returns (bytes32)",
  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 _nonce) view returns (bytes32)",
  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns (bool)",
];
const L_ABI = ["function processUnlockableCVX()","function withdrawUnlocked()","function donate(uint256)","function harvest(address,uint256) returns (uint256)",
 "function totalLockedGlobal() view returns (uint256)","function totalPendingUnlockGlobal() view returns (uint256)","function totalUnlockedGlobal() view returns (uint256)",
 "function totalDebtGlobal() view returns (uint256)","function accRewardPerShare() view returns (uint256)","function totalCVXInPool() view returns (uint256)",
 "function pendingUnlocked(uint256) view returns (uint256)","function clevCVX() view returns (address)","function furnace() view returns (address)",
 "function zap() view returns (address)","function platform() view returns (address)","function owner() view returns (address)",
 "function stakePercentage() view returns (uint256)","function stakeThreshold() view returns (uint256)","function reserveRate() view returns (uint256)",
 "function repayFeePercentage() view returns (uint256)","function harvestBountyPercentage() view returns (uint256)","function platformFeePercentage() view returns (uint256)",
 "function isKeeper(address) view returns (bool)","function getUserInfo(address) view returns (uint256,uint256,uint256,uint256,uint256)"];
const PA_ABI = ["function upgrade(address,address)"];
const MS_ABI = ["function multiSend(bytes transactions) payable"];
const ERC20 = ["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)","function approve(address,uint256) returns (bool)"];
const CVXLOCK = ["function lockedBalances(address) view returns (uint256 total,uint256 unlockable,uint256 locked,tuple(uint112 amount,uint112 boosted,uint32 unlockTime)[] lockData)"];
const f = (x: bigint) => ethers.formatEther(x);

async function fork(extra: string[] = []) {
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: FORK_URL, blockNumber: FORK_BLOCK } }] });
  for (const a of extra) {
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [a] });
    await network.provider.send("hardhat_setBalance", [a, "0x56bc75e2d63100000"]);
  }
  await network.provider.send("evm_mine"); // reset 后首次 eth_call 可能返回陈旧读数
}
function encodeMultiSend(txs: { to: string; data: string }[]) {
  let packed = "0x";
  for (const t of txs) {
    packed += ethers.solidityPacked(["uint8", "address", "uint256", "uint256", "bytes"], [0, t.to, 0, (t.data.length - 2) / 2, t.data]).slice(2);
  }
  return new ethers.Interface(MS_ABI).encodeFunctionData("multiSend", [packed]);
}
async function execViaSafe(txs: { to: string; data: string }[]) {
  const safe = new ethers.Contract(SAFE, SAFE_ABI, await ethers.getSigner(SAFE));
  const owners: string[] = [...(await safe.getOwners())];
  const threshold = Number(await safe.getThreshold());
  const nonce = await safe.nonce();
  const data = encodeMultiSend(txs);
  const hash = await safe.getTransactionHash(MULTISEND, 0, data, 1, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, nonce);
  // 独立按 EIP-712 复算,与合约读数交叉校验
  const TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes("SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)"));
  const structHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32","address","uint256","bytes32","uint8","uint256","uint256","uint256","address","address","uint256"],
    [TYPEHASH, MULTISEND, 0, ethers.keccak256(data), 1, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, nonce]));
  const localHash = ethers.keccak256(ethers.concat(["0x1901", await safe.domainSeparator(), structHash]));
  if (localHash !== hash) throw new Error(`safeTxHash 不一致: 合约读数 ${hash} vs 本地复算 ${localHash}`);
  const signers = [...owners].slice(0, threshold).sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
  for (const o of signers) {
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [o] });
    await network.provider.send("hardhat_setBalance", [o, "0x56bc75e2d63100000"]);
    await (await new ethers.Contract(SAFE, SAFE_ABI, await ethers.getSigner(o)).approveHash(hash)).wait();
    if ((await safe.approvedHashes(o, hash)) !== 1n) throw new Error(`approveHash 未生效: ${o}`);
  }
  let sigs = "0x";
  for (const o of signers) sigs += ethers.zeroPadValue(o, 32).slice(2) + "0".repeat(64) + "01";
  const exec = new ethers.Contract(SAFE, SAFE_ABI, await ethers.getSigner(signers[0]));
  return { hash, nonce, threshold, ownersCount: owners.length, signers, run: () => exec.execTransaction(MULTISEND, 0, data, 1, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, sigs) };
}
const GETTERS = ["totalLockedGlobal","totalPendingUnlockGlobal","totalUnlockedGlobal","totalDebtGlobal","accRewardPerShare","clevCVX","furnace","zap","platform","owner","stakePercentage","stakeThreshold","reserveRate","repayFeePercentage","harvestBountyPercentage","platformFeePercentage"];
async function readAll() {
  const c = new ethers.Contract(LOCKER, L_ABI, ethers.provider);
  const o: Record<string, string> = {};
  for (const g of GETTERS) o[g] = String(await (c as any)[g]());
  for (const e of [2817, 2818, 2838, 2957, 2958, 2972]) o[`pendingUnlocked[${e}]`] = String(await c.pendingUnlocked(e));
  for (const s of [100, 101, 102, 103, 104, 105, 106, 107]) o[`slot${s}`] = await ethers.provider.getStorage(LOCKER, s);
  o["userInfo(0xB828)"] = JSON.stringify((await c.getUserInfo("0xb828a33af42ab2e8908dfa8c2470850db7e4fd2a")).map(String));
  return o;
}

async function T1() {
  console.log("=== T1:升级前后存储布局回归(升级后立即读,不调用任何函数)===");
  await fork([SAFE]);
  const before = await readAll();
  await (await new ethers.Contract(PROXY_ADMIN, PA_ABI, await ethers.getSigner(SAFE)).upgrade(LOCKER, NEW_IMPL)).wait();
  const after = await readAll();
  const diff = Object.keys(before).filter((k) => before[k] !== after[k]);
  console.log(`  比对 ${Object.keys(before).length} 项(公开 getter + 原始 slot + 一个用户结构)`);
  console.log(diff.length ? "  ！有差异: " + diff.map((k) => `${k}: ${before[k]} → ${after[k]}`).join("; ") : "  全部一致 —— 存储布局无变化");
}

async function T2() {
  console.log("\n=== T2:真实 6-of-9 Safe 原子批次(upgrade + processUnlockableCVX)===");
  await fork([SAFE]);
  const latest = await ethers.provider.getBlock("latest");
  await network.provider.send("evm_setNextBlockTimestamp", [Number(latest!.timestamp) + 1]);
  const lb0 = await new ethers.Contract(CVX_LOCKER, CVXLOCK, ethers.provider).lockedBalances(LOCKER);
  let pre2974 = 0n;
  for (const it of lb0[3]) if (Number(BigInt(it.unlockTime) / BigInt(WEEK)) === 2974) pre2974 += BigInt(it.amount);
  const expect2974 = pre2974 + (lb0[1] as bigint);
  console.log(`  执行前:epoch 2974 tranche=${f(pre2974)}  unlockable=${f(lb0[1])}  → 执行后应为 ${f(expect2974)}`);
  const b = await execViaSafe([
    { to: PROXY_ADMIN, data: new ethers.Interface(PA_ABI).encodeFunctionData("upgrade", [LOCKER, NEW_IMPL]) },
    { to: LOCKER, data: new ethers.Interface(L_ABI).encodeFunctionData("processUnlockableCVX") },
  ]);
  console.log(`  Safe nonce=${b.nonce}  门槛=${b.threshold}/${b.ownersCount}  safeTxHash=${b.hash}`);
  console.log(`  签名人(前 ${b.threshold} 个 owner,按地址排序):`);
  for (const s of b.signers) console.log(`    ${s}`);
  const r = await (await b.run()).wait();
  console.log(`  execTransaction 成功,gasUsed=${r!.gasUsed}`);
  const c = new ethers.Contract(LOCKER, L_ABI, ethers.provider);
  const impl = ethers.getAddress("0x" + (await ethers.provider.getStorage(LOCKER, IMPL_SLOT)).slice(26));
  const lb = await new ethers.Contract(CVX_LOCKER, CVXLOCK, ethers.provider).lockedBalances(LOCKER);
  const byEpoch: Record<number, bigint> = {};
  for (const it of lb[3]) { const e = Number(BigInt(it.unlockTime) / BigInt(WEEK)); byEpoch[e] = (byEpoch[e] || 0n) + BigInt(it.amount); }
  console.log(`  执行后 proxy implementation = ${impl}  ${impl === ethers.getAddress(NEW_IMPL) ? "OK" : "!! 不符"}`);
  console.log(`  pendingUnlocked[2957] = ${f(await c.pendingUnlocked(2957))}   (期望 0)`);
  console.log(`  pendingUnlocked[2838] = ${f(await c.pendingUnlocked(2838))}   (期望 146396.418713827263680565)`);
  console.log(`  Convex unlockable     = ${f(lb[1])}   (期望 0)`);
  const got2974 = byEpoch[2974] || 0n;
  console.log(`  residue 16 新 tranche(epoch 2974)= ${f(got2974)}   ${got2974 === expect2974 ? "OK(= 执行前 tranche + unlockable)" : "!! 期望 " + f(expect2974)}`);
}

async function T3() {
  console.log("\n=== T3:批次内任一步失败时的原子性(故意放两次 processUnlockableCVX)===");
  await fork([SAFE]);
  const b = await execViaSafe([
    { to: PROXY_ADMIN, data: new ethers.Interface(PA_ABI).encodeFunctionData("upgrade", [LOCKER, NEW_IMPL]) },
    { to: LOCKER, data: new ethers.Interface(L_ABI).encodeFunctionData("processUnlockableCVX") },
    { to: LOCKER, data: new ethers.Interface(L_ABI).encodeFunctionData("processUnlockableCVX") },
  ]);
  try { await (await b.run()).wait(); console.log("  execTransaction 成功(不符预期)"); }
  catch (e: any) { console.log(`  execTransaction 回滚 -> ${(e.shortMessage || e.message).slice(0, 100)}`); }
  const impl = ethers.getAddress("0x" + (await ethers.provider.getStorage(LOCKER, IMPL_SLOT)).slice(26));
  console.log(`  代理 implementation = ${impl}  ${impl === ethers.getAddress(OLD_IMPL) ? "仍是旧实现 —— 升级已随整批回滚" : "!! 升级未回滚"}`);
}

async function T4() {
  console.log("\n=== T4:2957 与 2958 之间的无权限函数干扰(出资来自无关大户,不动 Locker 余额)===");
  await fork([SAFE, WHALE]);
  await (await new ethers.Contract(PROXY_ADMIN, PA_ABI, await ethers.getSigner(SAFE)).upgrade(LOCKER, NEW_IMPL)).wait();
  const keeper = await ethers.getSigner(SAFE);
  const clever = new ethers.Contract(LOCKER, L_ABI, keeper);
  const cvx = new ethers.Contract(CVX, ERC20, keeper);
  const l0 = await ethers.provider.getBlock("latest");
  await network.provider.send("evm_setNextBlockTimestamp", [Number(l0!.timestamp) + 1]);
  await (await clever.processUnlockableCVX()).wait();
  console.log(`  2957 调用后直接余额 = ${f(await cvx.balanceOf(LOCKER))}`);

  const wcvx = new ethers.Contract(CVX, ERC20, await ethers.getSigner(WHALE));
  const wl = new ethers.Contract(LOCKER, L_ABI, await ethers.getSigner(WHALE));
  const amt = ethers.parseEther("100");
  await (await wcvx.approve(LOCKER, amt)).wait();
  try { await (await wl.donate(amt)).wait(); console.log(`  donate(100) 成功 -> 直接余额 = ${f(await cvx.balanceOf(LOCKER))}`); }
  catch (e: any) { console.log(`  donate(100) 回滚 -> ${(e.shortMessage || e.message).slice(0, 140)}`); }

  try { const r = await (await wl.harvest(WHALE, 0)).wait(); console.log(`  harvest 成功 gas=${r!.gasUsed} -> 直接余额 = ${f(await cvx.balanceOf(LOCKER))}`); }
  catch (e: any) { console.log(`  harvest 回滚 -> ${(e.shortMessage || e.message).slice(0, 140)}`); }

  const dbal = await cvx.balanceOf(LOCKER);
  console.log(`  干扰后直接余额 = ${f(dbal)}   ${dbal >= ethers.parseEther("3173") ? ">= 3,173,2958 应可过" : "< 3,173"}`);
  const l = await ethers.provider.getBlock("latest");
  await network.provider.send("evm_setNextBlockTimestamp", [Math.max(2958 * WEEK + 1, Number(l!.timestamp) + 1)]);
  await network.provider.send("evm_mine");
  try { await (await clever.processUnlockableCVX()).wait(); console.log(`  epoch 2958 成功`); }
  catch (e: any) { console.log(`  epoch 2958 回滚 -> ${(e.shortMessage || e.message).slice(0, 120)}`); }
}

async function T5() {
  console.log("\n=== T5:plan B 兜底批次走真实 Safe 流程(直接余额被真实提款清零后)===");
  await fork([SAFE, DRAINER, WHALE]);
  await (await new ethers.Contract(PROXY_ADMIN, PA_ABI, await ethers.getSigner(SAFE)).upgrade(LOCKER, NEW_IMPL)).wait();
  const clever = new ethers.Contract(LOCKER, L_ABI, await ethers.getSigner(SAFE));
  const cvx = new ethers.Contract(CVX, ERC20, await ethers.getSigner(SAFE));
  const l0 = await ethers.provider.getBlock("latest");
  await network.provider.send("evm_setNextBlockTimestamp", [Number(l0!.timestamp) + 1]);
  await (await clever.processUnlockableCVX()).wait();
  await (await new ethers.Contract(LOCKER, L_ABI, await ethers.getSigner(DRAINER)).withdrawUnlocked()).wait();
  console.log(`  真实用户提款后直接余额 = ${f(await cvx.balanceOf(LOCKER))}`);
  console.log(`  Safe 当前 CVX 余额     = ${f(await cvx.balanceOf(SAFE))}   (plan B 需要 3,173)`);

  const l = await ethers.provider.getBlock("latest");
  await network.provider.send("evm_setNextBlockTimestamp", [Math.max(2958 * WEEK + 1, Number(l!.timestamp) + 1)]);
  await network.provider.send("evm_mine");

  const planB = () => execViaSafe([
    { to: CVX, data: new ethers.Interface(ERC20).encodeFunctionData("transfer", [LOCKER, ethers.parseEther("3173")]) },
    { to: LOCKER, data: new ethers.Interface(L_ABI).encodeFunctionData("processUnlockableCVX") },
  ]);
  const b1 = await planB();
  try { await (await b1.run()).wait(); console.log("  用 Safe 当前余额执行 plan B:成功(不符预期)"); }
  catch (e: any) { console.log(`  用 Safe 当前余额执行 plan B:回滚 -> ${(e.shortMessage || e.message).slice(0, 110)}`); }

  const need = ethers.parseEther("3173") - (await cvx.balanceOf(SAFE));
  await (await new ethers.Contract(CVX, ERC20, await ethers.getSigner(WHALE)).transfer(SAFE, need)).wait();
  console.log(`  给 Safe 补 ${f(need)} CVX 后余额 = ${f(await cvx.balanceOf(SAFE))}`);
  const b2 = await planB();
  const safeBefore = await cvx.balanceOf(SAFE);
  const r = await (await b2.run()).wait();
  const safeAfter = await cvx.balanceOf(SAFE);
  console.log(`  plan B 执行成功,gasUsed=${r!.gasUsed}  safeTxHash=${b2.hash}`);
  const lb = await new ethers.Contract(CVX_LOCKER, CVXLOCK, ethers.provider).lockedBalances(LOCKER);
  const c = new ethers.Contract(LOCKER, L_ABI, ethers.provider);
  console.log(`  pendingUnlocked[2958] = ${f(await c.pendingUnlocked(2958))}   (期望 0)`);
  console.log(`  locker owner()         = ${await c.owner()}  ${(await c.owner()) === ethers.getAddress(SAFE) ? "== Safe 本身" : ""}`);
  console.log(`  Safe CVX 余额          = ${f(safeBefore)} → ${f(safeAfter)}   净变化 ${f(safeAfter - safeBefore)}`);
  console.log(`  内部账本 − Convex 物理额 = ${f((await c.totalLockedGlobal()) + (await c.totalPendingUnlockGlobal()) - lb[0])}`);
}

async function main() {
  console.log(`fork 区块 ${FORK_BLOCK}\nMultiSendCallOnly ${MULTISEND} 字节码长度 ${(await new ethers.JsonRpcProvider(FORK_URL).getCode(MULTISEND)).length / 2 - 1} 字节\n`);
  if (!process.env.ONLY || process.env.ONLY.includes("1")) await T1();
  if (!process.env.ONLY || process.env.ONLY.includes("2")) await T2();
  if (!process.env.ONLY || process.env.ONLY.includes("3")) await T3();
  if (!process.env.ONLY || process.env.ONLY.includes("4")) await T4();
  if (!process.env.ONLY || process.env.ONLY.includes("5")) await T5();
  console.log("\n全部完成");
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

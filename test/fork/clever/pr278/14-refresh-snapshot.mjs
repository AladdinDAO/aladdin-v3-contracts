/* 按当前区块刷新用户集合与仓位快照(远端 Multicall3,不经 fork) */
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
const DATA = path.join(import.meta.dirname, 'data/');
const p = new ethers.JsonRpcProvider('https://mainnet.gateway.tenderly.co');
const LOCKER = '0x96C68D861aDa016Ed98c30C810879F9df7c64154';
const MC3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const CVX_LOCKER = '0x72a19342e8F1838460eBFCCEf09F6585e32db86E';
const iface = new ethers.Interface([
  'function getUserInfo(address) view returns (uint256,uint256,uint256,uint256,uint256)',
  'function getUserLocks(address) view returns (tuple(uint192 pendingUnlock,uint64 unlockEpoch)[], tuple(uint192 pendingUnlock,uint64 unlockEpoch)[])',
]);
const mc = new ethers.Contract(MC3, ['function aggregate3(tuple(address target,bool allowFailure,bytes callData)[]) view returns (tuple(bool success,bytes returnData)[])'], p);

const BLOCK = Number(process.env.BLOCK || await p.getBlockNumber());
const prev = JSON.parse(fs.readFileSync(DATA + 'state.json', 'utf8'));
let users = JSON.parse(fs.readFileSync(DATA + 'users.json', 'utf8')).users.map(a => ethers.getAddress(a));

// 补扫新 Deposit
const logs = await p.getLogs({ address: LOCKER, topics: [ethers.id('Deposit(address,uint256)')], fromBlock: prev.block, toBlock: BLOCK });
const added = [];
for (const l of logs) {
  const a = ethers.getAddress('0x' + l.topics[1].slice(26));
  if (!users.includes(a)) { users.push(a); added.push(a); }
}
console.error(`区块 ${prev.block} → ${BLOCK}:新 Deposit ${logs.length} 笔,新增地址 ${added.length} 个${added.length ? ' (' + added.join(', ') + ')' : ''}`);
console.error(`用户总数 ${users.length},开始读仓位…`);

const out = {};
const B = 40;
for (let i = 0; i < users.length; i += B) {
  const batch = users.slice(i, i + B);
  const calls = batch.flatMap(u => [
    { target: LOCKER, allowFailure: false, callData: iface.encodeFunctionData('getUserInfo', [u]) },
    { target: LOCKER, allowFailure: false, callData: iface.encodeFunctionData('getUserLocks', [u]) },
  ]);
  let res;
  for (let a = 0; ; a++) {
    try { res = await mc.aggregate3.staticCall(calls, { blockTag: BLOCK }); break; }
    catch (e) { if (a > 6) throw e; await new Promise(r => setTimeout(r, 1500 * (a + 1))); }
  }
  for (let k = 0; k < batch.length; k++) {
    const info = iface.decodeFunctionResult('getUserInfo', res[2*k][1]);
    const lk = iface.decodeFunctionResult('getUserLocks', res[2*k+1][1]);
    out[batch[k].toLowerCase()] = {
      locked: info[0].toString(), futurePending: info[1].toString(), claimable: info[2].toString(), debt: info[3].toString(),
      epochLocked: lk[0].map(x => ({ amount: x[0].toString(), unlockEpoch: Number(x[1]) })),
      pendingUnlocks: lk[1].map(x => ({ amount: x[0].toString(), unlockEpoch: Number(x[1]) })),
    };
  }
  process.stderr.write(`  ${Math.min(i+B, users.length)}/${users.length}\n`);
}
// Convex 物理侧
const cl = new ethers.Contract(CVX_LOCKER, ['function lockedBalances(address) view returns (uint256 total,uint256 unlockable,uint256 locked,tuple(uint112 amount,uint112 boosted,uint32 unlockTime)[] lockData)'], p);
const lb = await cl.lockedBalances(LOCKER, { blockTag: BLOCK });
const convexByEpoch = {};
for (const d of lb[3]) { const e = Number(BigInt(d[2]) / 604800n); convexByEpoch[e] = ((BigInt(convexByEpoch[e] || 0) + BigInt(d[0]))).toString(); }

fs.writeFileSync(DATA + 'users.json', JSON.stringify({ depositEvents: null, users: users.map(a => a.toLowerCase()).sort() }, null, 1));
fs.writeFileSync(DATA + 'mcpositions_latest.json', JSON.stringify({ block: BLOCK, positions: out }, null, 1));
fs.writeFileSync(DATA + 'convex_latest.json', JSON.stringify({ block: BLOCK, total: lb[0].toString(), unlockable: lb[1].toString(), byEpoch: convexByEpoch }, null, 1));
console.error(`已写入 mcpositions_latest.json / convex_latest.json (block ${BLOCK}, ${Object.keys(out).length} 个用户)`);

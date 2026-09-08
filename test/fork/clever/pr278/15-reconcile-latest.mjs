/* 把刷新后的用户快照与真实 implementation 的逐周模拟结果合成对账 */
import fs from 'fs'; import path from 'path';
const DATA = path.join(import.meta.dirname, 'data/');
const { block, positions } = JSON.parse(fs.readFileSync(DATA + 'mcpositions_latest.json', 'utf8'));
const sim = JSON.parse(fs.readFileSync(DATA + 'sim_deployed.json', 'utf8'));
const convexNow = JSON.parse(fs.readFileSync(DATA + 'convex_latest.json', 'utf8'));
const F = 10n ** 18n;
const fmt = x => { const n = x < 0n ? -x : x; return (x < 0n ? '-' : '') + (n / F) + '.' + (n % F).toString().padStart(18, '0'); };

let aggLocked = 0n, claimNow = 0n;
const byResidue = new Array(17).fill(0n);
const pendingByEpoch = {};
for (const u of Object.values(positions)) {
  aggLocked += BigInt(u.locked); claimNow += BigInt(u.claimable);
  for (const l of u.epochLocked) byResidue[l.unlockEpoch % 17] += BigInt(l.amount);
  for (const q of u.pendingUnlocks) pendingByEpoch[q.unlockEpoch] = (pendingByEpoch[q.unlockEpoch] || 0n) + BigInt(q.amount);
}
const claimableAt = E => { let s = claimNow; for (const [e, v] of Object.entries(pendingByEpoch)) if (+e <= E) s += v; return s; };
const futureAt = E => { let s = 0n; for (const [e, v] of Object.entries(pendingByEpoch)) if (+e > E) s += v; return s; };
const demandAt = E => { const d = byResidue.slice(); for (const [e, v] of Object.entries(pendingByEpoch)) if (+e > E) d[+e % 17] += v; return d; };

console.log(`用户快照区块 ${block},fork 区块 ${sim.forkBlock}  ${block === sim.forkBlock ? '(一致)' : '(!! 不一致)'}`);
console.log(`implementation ${sim.implAddress}  keccak ${sim.implKeccak}`);
console.log(`用户数 ${Object.keys(positions).length}\n`);

function table(E, snap, label) {
  const d = demandAt(E);
  const phy = new Array(17).fill(0n);
  for (const [e, v] of Object.entries(snap.convexByEpoch)) phy[+e % 17] += BigInt(v);
  if (BigInt(snap.convexUnlockable) > 0n) phy[E % 17] += BigInt(snap.convexUnlockable);
  const bad = [];
  for (let r = 0; r < 17; r++) if (d[r] !== phy[r]) bad.push(`residue ${r}: ${fmt(d[r] - phy[r])}`);
  console.log(`--- ${label}(epoch ${E})---`);
  console.log(`  用户 locked            = ${fmt(aggLocked)}`);
  console.log(`  global locked          = ${fmt(BigInt(snap.totalLockedGlobal))}   差 = ${fmt(BigInt(snap.totalLockedGlobal) - aggLocked)}`);
  console.log(`  用户未来 pending        = ${fmt(futureAt(E))}`);
  console.log(`  global pending         = ${fmt(BigInt(snap.totalPendingUnlockGlobal))}   差 = ${fmt(BigInt(snap.totalPendingUnlockGlobal) - futureAt(E))}`);
  console.log(`  用户可提额              = ${fmt(claimableAt(E))}`);
  console.log(`  totalUnlockedGlobal    = ${fmt(BigInt(snap.totalUnlockedGlobal))}   netBorrow = ${fmt(BigInt(snap.totalUnlockedGlobal) - claimableAt(E))}`);
  console.log(`  totalCVXInPool         = ${fmt(BigInt(snap.totalCVXInPool))}   pool − 用户可提额 = ${fmt(BigInt(snap.totalCVXInPool) - claimableAt(E))}`);
  console.log(`  内部账本 − Convex 物理额 = ${fmt(BigInt(snap.totalLockedGlobal) + BigInt(snap.totalPendingUnlockGlobal) - BigInt(snap.convexTotal))}`);
  console.log(`  17 槽差额非零项          : ${bad.length ? bad.join('  |  ') : '无 —— 全部对平'}`);
  return bad.length;
}

const b1 = table(2957, { ...sim.before, convexByEpoch: sim.before.convexByEpoch, convexUnlockable: sim.before.convexUnlockable }, '升级前');
console.log('');
for (const E of [2958, 2970, 2971, 2972, 2975]) {
  const s = sim.epochs[E];
  console.log(`epoch ${E} 处理后:netBorrow = ${fmt(BigInt(s.totalUnlockedGlobal) - claimableAt(E))}   pool − 用户可提额 = ${fmt(BigInt(s.totalCVXInPool) - claimableAt(E))}   global pending − 用户未来 pending = ${fmt(BigInt(s.totalPendingUnlockGlobal) - futureAt(E))}`);
}
console.log('');
const b2 = table(2975, sim.epochs[2975], 'epoch 2975 终局');
console.log('');
console.log(`owner 在 epoch 2958 收到的 CVX = ${fmt(BigInt(sim.epochs[2958].ownerCVX) - BigInt(sim.before.ownerCVX))}`);
let weeks = 0n;
for (let E = 2958; E <= 2975; E++) weeks += BigInt(sim.epochs[E].totalUnlockedGlobal) - claimableAt(E);
console.log(`奖励补偿基数(2958–2975 逐周 netBorrow 累加)= ${fmt(weeks)} CVX-weeks`);
console.log('');
console.log(b1 === 0 || b2 === 0 ? '' : '');
console.log(b2 === 0 ? '>>> 终局 17 槽全部对平' : `>>> 终局仍有 ${b2} 个槽位不平,需查`);

import fs from 'fs';
import path from 'path';
const DATA = path.join(import.meta.dirname, 'data/');
const { positions } = JSON.parse(fs.readFileSync(DATA + 'mcpositions.json','utf8'));
const sim = JSON.parse(fs.readFileSync(DATA + 'sim_out.json','utf8'));
const F = 10n**18n;
const fmt = (x) => { const n = x < 0n ? -x : x; return (x<0n?'-':'') + (n/F) + '.' + (n%F).toString().padStart(18,'0'); };
const users = Object.entries(positions);

let aggLocked = 0n, claimNow = 0n, aggDebt = 0n;
const epochLockedByResidue = new Array(17).fill(0n);
const pendingByEpoch = {};
for (const [, u] of users) {
  aggLocked += BigInt(u.locked); claimNow += BigInt(u.claimable); aggDebt += BigInt(u.debt);
  for (const l of u.epochLocked) epochLockedByResidue[l.unlockEpoch % 17] += BigInt(l.amount);
  for (const q of u.pendingUnlocks) pendingByEpoch[q.unlockEpoch] = (pendingByEpoch[q.unlockEpoch]||0n) + BigInt(q.amount);
}
const claimableAt = (E) => { let s = claimNow; for (const [e,v] of Object.entries(pendingByEpoch)) if (Number(e) <= E) s += v; return s; };
const futurePendingAt = (E) => { let s = 0n; for (const [e,v] of Object.entries(pendingByEpoch)) if (Number(e) > E) s += v; return s; };
const demandAt = (E) => { const d = epochLockedByResidue.slice();
  for (const [e,v] of Object.entries(pendingByEpoch)) if (Number(e) > E) d[Number(e)%17] += v; return d; };

console.log(`users=${users.length}`);
console.log(`aggregate locked            = ${fmt(aggLocked)}`);
console.log(`global   totalLockedGlobal  = ${fmt(BigInt(sim.before.totalLockedGlobal))}   diff=${fmt(BigInt(sim.before.totalLockedGlobal)-aggLocked)}`);
console.log(`aggregate debt              = ${fmt(aggDebt)}`);
console.log('');
console.log(`--- BEFORE the fix (epoch 2957, pre-call) ---`);
console.log(`users' claimable            = ${fmt(claimableAt(2957))}`);
console.log(`totalUnlockedGlobal         = ${fmt(BigInt(sim.before.totalUnlockedGlobal))}`);
console.log(`  global - users            = ${fmt(BigInt(sim.before.totalUnlockedGlobal) - claimableAt(2957))}  <= the shortfall that bricks withdrawals`);
console.log(`users' future pending       = ${fmt(futurePendingAt(2957))}`);
console.log(`totalPendingUnlockGlobal    = ${fmt(BigInt(sim.before.totalPendingUnlockGlobal))}`);
console.log(`  global - users            = ${fmt(BigInt(sim.before.totalPendingUnlockGlobal) - futurePendingAt(2957))}`);
console.log(`pool                        = ${fmt(BigInt(sim.before.totalCVXInPool))}`);

function residueTable(E, snap, label) {
  const d = demandAt(E);
  const phy = new Array(17).fill(0n);
  for (const [e, v] of Object.entries(snap.convexByEpoch)) phy[Number(e)%17] += BigInt(v);
  if (BigInt(snap.convexUnlockable) > 0n) phy[E % 17] += BigInt(snap.convexUnlockable);
  console.log(`\n--- ${label} : per-residue internal demand vs Convex physical ---`);
  let sum = 0n;
  for (let r = 0; r < 17; r++) { const x = d[r]-phy[r]; sum += x;
    console.log(` residue ${String(r).padStart(2)} | demand ${fmt(d[r]).padStart(28)} | physical ${fmt(phy[r]).padStart(28)} | diff ${fmt(x)}`); }
  console.log(` sum(diff) = ${fmt(sum)}   internal_total - physical_total = ${fmt(BigInt(snap.totalLockedGlobal)+BigInt(snap.totalPendingUnlockGlobal)-BigInt(snap.convexTotal))}`);
}
// pre-state physical (unlockable belongs to residue 2957%17=16)
residueTable(2957, { convexByEpoch: Object.fromEntries(Object.entries(sim.before.convexByEpoch)), convexUnlockable: sim.before.convexUnlockable,
  totalLockedGlobal: sim.before.totalLockedGlobal, totalPendingUnlockGlobal: sim.before.totalPendingUnlockGlobal, convexTotal: sim.before.convexTotal }, 'BEFORE the fix (epoch 2957)');

for (const E of [2958, 2970, 2971, 2972, 2975]) {
  const snap = sim.epochs[E];
  console.log(`\n=== after processUnlockableCVX() at epoch ${E} ===`);
  console.log(`users' claimable = ${fmt(claimableAt(E))}   totalUnlockedGlobal = ${fmt(BigInt(snap.totalUnlockedGlobal))}   netBorrow(global-users) = ${fmt(BigInt(snap.totalUnlockedGlobal)-claimableAt(E))}`);
  console.log(`users' future pending = ${fmt(futurePendingAt(E))}   totalPendingUnlockGlobal = ${fmt(BigInt(snap.totalPendingUnlockGlobal))}   diff = ${fmt(BigInt(snap.totalPendingUnlockGlobal)-futurePendingAt(E))}`);
  console.log(`pool = ${fmt(BigInt(snap.totalCVXInPool))}   pool - users' claimable = ${fmt(BigInt(snap.totalCVXInPool)-claimableAt(E))}`);
  if (E === 2975) residueTable(E, snap, `AFTER epoch ${E}`);
}
// reward-compensation basis
let cvxWeeks = 0n;
for (let E = 2958; E <= 2975; E++) cvxWeeks += BigInt(sim.epochs[E].totalUnlockedGlobal) - claimableAt(E);
console.log(`\nreward compensation basis, sum of weekly netBorrow (epochs 2958..2975) = ${fmt(cvxWeeks)} CVX-weeks`);

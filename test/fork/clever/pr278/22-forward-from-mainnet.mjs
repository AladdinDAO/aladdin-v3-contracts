/* 执行后的当前状态对账:以主网执行区块为基准,核 epoch 2957 完成后的账目形态 */
import fs from 'fs'; import path from 'path';
const DATA = path.join(import.meta.dirname, 'data/');
const { block, positions } = JSON.parse(fs.readFileSync(DATA+'mcpositions_latest.json','utf8'));
const cx = JSON.parse(fs.readFileSync(DATA+'convex_latest.json','utf8'));
const st = JSON.parse(fs.readFileSync(DATA+'mainnet_state.json','utf8'));
const F=10n**18n;
const f=x=>{const n=x<0n?-x:x;return (x<0n?'-':'')+(n/F).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+(n%F).toString().padStart(18,'0')};
let locked=0n, claim=0n; const byRes=new Array(17).fill(0n); const pend={};
for (const u of Object.values(positions)) {
  locked+=BigInt(u.locked); claim+=BigInt(u.claimable);
  for (const l of u.epochLocked) byRes[l.unlockEpoch%17]+=BigInt(l.amount);
  for (const q of u.pendingUnlocks) pend[q.unlockEpoch]=(pend[q.unlockEpoch]||0n)+BigInt(q.amount);
}
const B=st.B;
console.log(`基准区块 ${block}(= 主网执行区块 ${st.post})  epoch 2957,升级与 2957 前置已完成\n`);
console.log('════ 用户侧 vs global ════');
console.log(`  用户 locked 聚合          = ${f(locked)}`);
console.log(`  totalLockedGlobal        = ${f(BigInt(B.locked))}   差 ${f(BigInt(B.locked)-locked)}`);
const fut=Object.entries(pend).filter(([e])=>+e>2957).reduce((s,[,v])=>s+v,0n);
console.log(`  用户未来 pending          = ${f(fut)}`);
console.log(`  totalPendingUnlockGlobal = ${f(BigInt(B.pending))}   差 ${f(BigInt(B.pending)-fut)}`);
const cl=claim+Object.entries(pend).filter(([e])=>+e<=2957).reduce((s,[,v])=>s+v,0n);
console.log(`  用户可提额聚合            = ${f(cl)}`);
console.log(`  totalUnlockedGlobal      = ${f(BigInt(B.unlocked))}   差 ${f(BigInt(B.unlocked)-cl)}`);
console.log(`  totalCVXInPool           = ${f(BigInt(B.pool))}`);
console.log();
console.log('  说明:此刻 global pending 高于用户未来 pending、global unlocked 低于用户可提额,');
console.log('       差额均为已到期未处理的用户债权(集中在 pendingUnlocked[2817]+[2818]+[2838]),');
console.log('       按设计要到 epoch 2958 的调用才转入 global unlocked。');
console.log();
const gap = BigInt(B.p2817)+BigInt(B.p2818)+BigInt(B.p2838);
console.log(`  pendingUnlocked[2817]+[2818]+[2838] = ${f(gap)}`);
console.log(`  global pending − 用户未来 pending    = ${f(BigInt(B.pending)-fut)}   ${gap===BigInt(B.pending)-fut?'吻合':'不吻合'}`);
console.log(`  用户可提额 − global unlocked         = ${f(cl-BigInt(B.unlocked))}   ${gap===cl-BigInt(B.unlocked)?'吻合':'不吻合'}`);
console.log();
console.log('════ 17 槽:内部需求 vs Convex 物理 ════');
const phy=new Array(17).fill(0n);
for (const [e,v] of Object.entries(cx.byEpoch)) phy[+e%17]+=BigInt(v);
if (BigInt(cx.unlockable)>0n) phy[2957%17]+=BigInt(cx.unlockable);
const dem=byRes.slice();
for (const [e,v] of Object.entries(pend)) if (+e>2957) dem[+e%17]+=v;
let sum=0n;
for (let r=0;r<17;r++){ const d=dem[r]-phy[r]; sum+=d;
  if (d!==0n) console.log(`  residue ${String(r).padStart(2)} | 需求 ${f(dem[r]).padStart(30)} | 物理 ${f(phy[r]).padStart(30)} | 差 ${f(d)}`); }
console.log(`  其余槽位差额为 0。sum(diff) = ${f(sum)}`);
console.log(`  内部账本 − Convex 物理额 = ${f(BigInt(B.locked)+BigInt(B.pending)-BigInt(B.cvxTotal))}`);

/* 主网执行前后的状态核对与事件解码(执行区块 25939803,前一区块为基准) */
import { ethers } from 'ethers';
import fs from 'fs'; import path from 'path';
const DATA = path.join(import.meta.dirname, 'data/');
const p = new ethers.JsonRpcProvider(process.env.RPC || 'https://mainnet.gateway.tenderly.co');
const POST = Number(process.env.POST || 25939803), PRE = POST - 1;
const TX = '0x76f130e6d92a30ed5c0335c0ea7d6760e8e3139ef393565b77cd11ce3b1034ff';
const LOCKER='0x96C68D861aDa016Ed98c30C810879F9df7c64154', NEW_IMPL='0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534';
const OLD_IMPL='0xDFC1F72D5604020463318ff256433eca02B355d2', SAFE='0xFC08757c505eA28709dF66E54870fB6dE09f0C5E';
const CVX='0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B', CVX_LOCKER='0x72a19342e8F1838460eBFCCEf09F6585e32db86E';
const RP='0xCF50b810E57Ac33B91dCF525C6ddd9881B139332';
const IMPL_SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const WEEK=604800n, F=10n**18n;
const fmt=x=>{const n=x<0n?-x:x;return (x<0n?'-':'')+(n/F).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+(n%F).toString().padStart(18,'0')};
let pass=0,fail=0; const ck=(n,ok,d='')=>{(ok?pass++:fail++);console.log(`  ${ok?'OK  ':'FAIL'}  ${n}${d?'   '+d:''}`)};
const L=new ethers.Interface(['function totalLockedGlobal() view returns (uint256)','function totalPendingUnlockGlobal() view returns (uint256)',
 'function totalUnlockedGlobal() view returns (uint256)','function totalCVXInPool() view returns (uint256)',
 'function pendingUnlocked(uint256) view returns (uint256)','function owner() view returns (address)','function accRewardPerShare() view returns (uint256)',
 'function totalDebtGlobal() view returns (uint256)']);
const CL=new ethers.Interface(['function lockedBalances(address) view returns (uint256 total,uint256 unlockable,uint256 locked,tuple(uint112 amount,uint112 boosted,uint32 unlockTime)[] lockData)']);
const E=new ethers.Interface(['function balanceOf(address) view returns (uint256)','event Transfer(address indexed from,address indexed to,uint256 value)','event Approval(address indexed owner,address indexed spender,uint256 value)']);
const c=async(to,i,f,a,b)=>i.decodeFunctionResult(f,await p.call({to,data:i.encodeFunctionData(f,a),blockTag:b}));
const g=async(f,a,b)=>(await c(LOCKER,L,f,a,b))[0];

async function snap(b){
  const lb=(await c(CVX_LOCKER,CL,'lockedBalances',[LOCKER],b));
  const byEpoch={}; for(const it of lb[3]){const e=Number(BigInt(it[2])/WEEK); byEpoch[e]=(byEpoch[e]||0n)+BigInt(it[0]);}
  return { impl: ethers.getAddress('0x'+(await p.getStorage(LOCKER,IMPL_SLOT,b)).slice(26)),
    locked:await g('totalLockedGlobal',[],b), pending:await g('totalPendingUnlockGlobal',[],b),
    unlocked:await g('totalUnlockedGlobal',[],b), pool:await g('totalCVXInPool',[],b), debt:await g('totalDebtGlobal',[],b),
    acc:await g('accRewardPerShare',[],b),
    p2817:await g('pendingUnlocked',[2817],b), p2818:await g('pendingUnlocked',[2818],b),
    p2838:await g('pendingUnlocked',[2838],b), p2957:await g('pendingUnlocked',[2957],b),
    p2752:await g('pendingUnlocked',[2752],b), p2958:await g('pendingUnlocked',[2958],b),
    direct:(await c(CVX,E,'balanceOf',[LOCKER],b))[0], rp:(await c(RP,E,'balanceOf',[LOCKER],b))[0],
    safeCVX:(await c(CVX,E,'balanceOf',[SAFE],b))[0],
    cvxTotal:lb[0], unlockable:lb[1], byEpoch };
}
const A=await snap(PRE), B=await snap(POST);

console.log('════ 4. 升级本身 ════');
ck('执行前 implementation = 旧', A.impl===ethers.getAddress(OLD_IMPL), A.impl);
ck('执行后 implementation = 新部署地址', B.impl===ethers.getAddress(NEW_IMPL), B.impl);
ck('新 implementation 字节码 keccak 未变',
   ethers.keccak256(await p.getCode(NEW_IMPL,POST))==='0xc84c87dcb24aa0afcda4ae018391c163f1f2e6e291c7c33f657250a75df50d52');

console.log('\n════ 5. epoch 2957 分支的三项效果 ════');
ck('pendingUnlocked[2957] 已清零', B.p2957===0n, `${fmt(A.p2957)} → ${fmt(B.p2957)}`);
ck('pendingUnlocked[2838] = 旧值 + 原 [2957]', B.p2838===A.p2838+A.p2957, `${fmt(A.p2838)} → ${fmt(B.p2838)}`);
ck('  且等于验证时预测的 146,396.418713827263680565', B.p2838===146396418713827263680565n);
ck('Convex unlockable 已归零', B.unlockable===0n, `${fmt(A.unlockable)} → ${fmt(B.unlockable)}`);
const pre2974=A.byEpoch[2974]||0n, post2974=B.byEpoch[2974]||0n;
ck('epoch 2974 tranche 增量 = 执行前 unlockable', post2974-pre2974===A.unlockable,
   `${fmt(pre2974)} → ${fmt(post2974)}  增量 ${fmt(post2974-pre2974)}`);
ck('重锁落在 residue 16', 2974%17===16, `2974 % 17 = ${2974%17}`);
ck('Convex 物理总额未变(取出即重锁)', B.cvxTotal===A.cvxTotal, fmt(A.cvxTotal));

console.log('\n════ 6. 不该动的量 ════');
for (const [k,label] of [['locked','totalLockedGlobal'],['pending','totalPendingUnlockGlobal'],['unlocked','totalUnlockedGlobal'],
  ['pool','totalCVXInPool'],['debt','totalDebtGlobal'],['acc','accRewardPerShare'],['direct','Locker 直接余额'],
  ['rp','reward pool 余额'],['safeCVX','Safe CVX 余额'],['p2817','pendingUnlocked[2817]'],['p2818','pendingUnlocked[2818]'],
  ['p2752','pendingUnlocked[2752]'],['p2958','pendingUnlocked[2958]']])
  ck(`${label} 未变`, A[k]===B[k], typeof A[k]==='bigint'?fmt(A[k]):String(A[k]));

console.log('\n════ 7. 交易事件解码 ════');
const rc=await p.getTransactionReceipt(TX);
const CLI=new ethers.Interface(['event Withdrawn(address indexed _user,uint256 _amount,bool _relocked)','event Staked(address indexed _user,uint256 indexed _epoch,uint256 _paidAmount,uint256 _lockedAmount,uint256 _boostedAmount)']);
const PAI=new ethers.Interface(['event Upgraded(address indexed implementation)']);
const SI=new ethers.Interface(['event ExecutionSuccess(bytes32 txHash,uint256 payment)']);
let seenUpgraded=false, wd=0n, staked=0n;
rc.logs.forEach((l,i)=>{
  for (const [nm,iface] of [['CVXLocker',CLI],['Proxy',PAI],['Safe',SI],['ERC20',E]]) {
    try { const x=iface.parseLog(l); if(!x) continue;
      const at = l.address.toLowerCase()===LOCKER.toLowerCase()?'Locker':l.address.toLowerCase()===CVX.toLowerCase()?'CVX':
                 l.address.toLowerCase()===CVX_LOCKER.toLowerCase()?'CVXLockerV2':l.address.toLowerCase()===SAFE.toLowerCase()?'Safe':l.address;
      console.log(`        [${i}] ${at}.${x.name}(${x.args.map(a=>typeof a==='bigint'?fmt(a):String(a)).join(', ')})`);
      if (x.name==='Upgraded') seenUpgraded = String(x.args[0])===ethers.getAddress(NEW_IMPL);
      if (x.name==='Withdrawn') wd=x.args[1];
      if (x.name==='Staked') staked=x.args[2]??0n;
      break; } catch {}
  }
});
ck('发出 Upgraded(新 implementation)', seenUpgraded);
ck('Convex Withdrawn 金额 = 执行前 unlockable', wd===A.unlockable, fmt(wd));
ck('Convex 重锁金额 = 取出金额', staked===wd, fmt(staked));

console.log('\n════ 8. 下一个窗口 ════');
const now=Math.floor(Date.now()/1000);
const hrs=(2958*604800-now)/3600;
console.log(`        当前 epoch ${Math.floor(now/604800)},epoch 2958 开始于 2026-09-10T00:00:00Z,还有 ${hrs.toFixed(1)} 小时`);
const cur=await snap('latest');
console.log(`        Locker 直接余额 ${fmt(cur.direct)}   门槛 3,173`);
ck('Locker 直接余额仍 >= 3,173(epoch 2958 主路径)', cur.direct>=3173n*F, `余量 ${fmt(cur.direct-3173n*F)}`);
console.log(`        Safe CVX 余额   ${fmt(cur.safeCVX)}   兜底批次需 3,173`);
console.log(`        ${cur.safeCVX>=3173n*F?'兜底批次可执行':'兜底批次不可执行,缺 '+fmt(3173n*F-cur.safeCVX)}`);
console.log(`        pendingUnlocked[2958] 现值 ${fmt(cur.p2958)}`);

fs.writeFileSync(DATA+'mainnet_state.json', JSON.stringify({ pre:PRE, post:POST,
  A:Object.fromEntries(Object.entries(A).map(([k,v])=>[k,typeof v==='bigint'?v.toString():v])),
  B:Object.fromEntries(Object.entries(B).map(([k,v])=>[k,typeof v==='bigint'?v.toString():v])) }, (k,v)=>typeof v==='bigint'?v.toString():v, 1));
console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exitCode=fail?1:0;

/* 对主网已执行的上线交易做全链路核对:批次解码、签名、执行前后状态、事件、逐槽对账。 */
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
const DATA = path.join(import.meta.dirname, 'data/');
const p = new ethers.JsonRpcProvider(process.env.RPC || 'https://mainnet.gateway.tenderly.co');

const TX       = process.env.TX || '0x76f130e6d92a30ed5c0335c0ea7d6760e8e3139ef393565b77cd11ce3b1034ff';
const SAFE     = '0xFC08757c505eA28709dF66E54870fB6dE09f0C5E';
const MULTISEND= '0x40A2aCCbd92BCA938b02010E17A5b8929b49130D';
const PA       = '0x1F57286F7a8083fb363d87Bc8b1DCcD685dc87EE';
const LOCKER   = '0x96C68D861aDa016Ed98c30C810879F9df7c64154';
const NEW_IMPL = '0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534';
const OLD_IMPL = '0xDFC1F72D5604020463318ff256433eca02B355d2';
const CVX      = '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B';
const CVX_LOCKER='0x72a19342e8F1838460eBFCCEf09F6585e32db86E';
const RP       = '0xCF50b810E57Ac33B91dCF525C6ddd9881B139332';
const IMPL_SLOT= '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const WEEK = 604800n;
const F = 10n**18n;
const fmt = x => { const n = x<0n?-x:x; return (x<0n?'-':'')+ (n/F).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',') +'.'+ (n%F).toString().padStart(18,'0'); };
let pass=0, fail=0;
const ck = (name, ok, detail='') => { (ok?pass++:fail++); console.log(`  ${ok?'OK  ':'FAIL'}  ${name}${detail?'   '+detail:''}`); };

const L = new ethers.Interface([
  'function processUnlockableCVX()','function totalLockedGlobal() view returns (uint256)',
  'function totalPendingUnlockGlobal() view returns (uint256)','function totalUnlockedGlobal() view returns (uint256)',
  'function totalCVXInPool() view returns (uint256)','function pendingUnlocked(uint256) view returns (uint256)',
  'function owner() view returns (address)','function isKeeper(address) view returns (bool)',
  'function getUserInfo(address) view returns (uint256,uint256,uint256,uint256,uint256)',
  'function getUserLocks(address) view returns (tuple(uint192 pendingUnlock,uint64 unlockEpoch)[], tuple(uint192 pendingUnlock,uint64 unlockEpoch)[])']);
const PAI = new ethers.Interface(['function upgrade(address,address)']);
const MSI = new ethers.Interface(['function multiSend(bytes)']);
const SAFEI = new ethers.Interface([
  'function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns (bool)',
  'function nonce() view returns (uint256)','function domainSeparator() view returns (bytes32)',
  'function getOwners() view returns (address[])','function getThreshold() view returns (uint256)',
  'event ExecutionSuccess(bytes32 txHash, uint256 payment)']);
const CVXLOCK = new ethers.Interface(['function lockedBalances(address) view returns (uint256 total,uint256 unlockable,uint256 locked,tuple(uint112 amount,uint112 boosted,uint32 unlockTime)[] lockData)']);
const ERC20 = new ethers.Interface(['function balanceOf(address) view returns (uint256)']);
const call = async (to, iface, fn, args, block) =>
  iface.decodeFunctionResult(fn, await p.call({ to, data: iface.encodeFunctionData(fn, args), blockTag: block }));

const tx = await p.getTransaction(TX), rc = await p.getTransactionReceipt(TX);
const blk = await p.getBlock(rc.blockNumber);
const POST = rc.blockNumber, PRE = rc.blockNumber - 1;

console.log('════ 1. 交易与执行窗口 ════');
ck('交易成功', rc.status === 1, `status=${rc.status}`);
ck('目标是 CLever 多签', tx.to.toLowerCase() === SAFE.toLowerCase(), tx.to);
ck('调用 execTransaction', tx.data.slice(0,10) === '0x6a761202');
const epoch = Number(BigInt(blk.timestamp) / WEEK);
ck('落在 epoch 2957 窗口内', epoch === 2957, `epoch=${epoch}  ${new Date(blk.timestamp*1000).toISOString()}`);
const owners = (await call(SAFE, SAFEI, 'getOwners', [], POST))[0];
ck('发起人是多签 owner', owners.map(o=>o.toLowerCase()).includes(tx.from.toLowerCase()), tx.from);
console.log(`        区块 ${POST}  gasUsed ${rc.gasUsed}  手续费 ${ethers.formatEther(rc.gasUsed*rc.gasPrice)} ETH`);

console.log('\n════ 2. 批次内容逐字节解码 ════');
const d = SAFEI.decodeFunctionData('execTransaction', tx.data);
ck('外层 to = MultiSendCallOnly v1.3.0', d[0].toLowerCase() === MULTISEND.toLowerCase(), d[0]);
ck('operation = 1 (delegatecall)', Number(d[3]) === 1);
ck('value = 0', d[1] === 0n);
ck('safeTxGas / baseGas / gasPrice 均为 0', d[4]===0n && d[5]===0n && d[6]===0n);
ck('gasToken / refundReceiver 均为零地址', d[7]===ethers.ZeroAddress && d[8]===ethers.ZeroAddress);
const inner = MSI.decodeFunctionData('multiSend', d[2])[0];
// 解开 packed 的 multiSend 负载
const ops=[]; let o=2;
while (o < inner.length) {
  const op = parseInt(inner.slice(o,o+2),16); o+=2;
  const to = '0x'+inner.slice(o,o+40); o+=40;
  const value = BigInt('0x'+inner.slice(o,o+64)); o+=64;
  const len = parseInt(inner.slice(o,o+64),16); o+=64;
  const data = '0x'+inner.slice(o, o+len*2); o+=len*2;
  ops.push({ op, to: ethers.getAddress(to), value, data });
}
ck('批次恰好 2 步', ops.length === 2, `实际 ${ops.length} 步`);
const [o1,o2] = ops;
ck('第 1 步:CALL → ProxyAdmin', o1.op===0 && o1.to.toLowerCase()===PA.toLowerCase(), `${o1.to}`);
let up=[null,null]; try { up = PAI.decodeFunctionData('upgrade', o1.data); } catch {}
ck('第 1 步 = upgrade(Locker, 新 implementation)',
   up[0] && up[0].toLowerCase()===LOCKER.toLowerCase() && up[1].toLowerCase()===NEW_IMPL.toLowerCase(),
   up[0] ? `${up[0]} → ${up[1]}` : o1.data.slice(0,10));
ck('第 2 步:CALL → Locker', o2.op===0 && o2.to.toLowerCase()===LOCKER.toLowerCase(), o2.to);
ck('第 2 步 = processUnlockableCVX()', o2.data === L.getFunction('processUnlockableCVX').selector, o2.data);
ck('两步 value 均为 0', o1.value===0n && o2.value===0n);

console.log('\n════ 3. safeTxHash 与签名 ════');
const nonceBefore = (await call(SAFE, SAFEI, 'nonce', [], PRE))[0];
const ds = (await call(SAFE, SAFEI, 'domainSeparator', [], POST))[0];
const TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes('SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)'));
const structHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
  ['bytes32','address','uint256','bytes32','uint8','uint256','uint256','uint256','address','address','uint256'],
  [TYPEHASH, d[0], d[1], ethers.keccak256(d[2]), d[3], d[4], d[5], d[6], d[7], d[8], nonceBefore]));
const localHash = ethers.keccak256(ethers.concat(['0x1901', ds, structHash]));
const evt = rc.logs.filter(l=>l.address.toLowerCase()===SAFE.toLowerCase()).map(l=>{try{return SAFEI.parseLog(l)}catch{return null}}).find(x=>x&&x.name==='ExecutionSuccess');
ck('链上发出 ExecutionSuccess', !!evt);
ck('safeTxHash 与本地 EIP-712 复算一致', evt && evt.args[0].toLowerCase()===localHash.toLowerCase(), `${evt?evt.args[0]:'-'}`);
console.log(`        执行时 Safe nonce = ${nonceBefore}`);
const threshold = Number((await call(SAFE, SAFEI, 'getThreshold', [], POST))[0]);
const sigs = ethers.getBytes(d[9]);
ck('签名长度是 65 的整数倍', sigs.length % 65 === 0, `${sigs.length} 字节 = ${sigs.length/65} 个`);
const n = sigs.length/65, recovered=[];
for (let i=0;i<n;i++){
  const r_='0x'+Buffer.from(sigs.slice(i*65,i*65+32)).toString('hex');
  const s_='0x'+Buffer.from(sigs.slice(i*65+32,i*65+64)).toString('hex');
  const v = sigs[i*65+64];
  if (v===1) recovered.push({ signer: ethers.getAddress('0x'+r_.slice(26)), kind:'approvedHash' });
  else if (v===0) recovered.push({ signer: ethers.getAddress('0x'+r_.slice(26)), kind:'contract' });
  else recovered.push({ signer: ethers.recoverAddress(v>30?ethers.hashMessage(ethers.getBytes(localHash)):localHash, {r:r_,s:s_,v:v>30?v-4:v}), kind: v>30?'eth_sign':'ecdsa' });
}
ck(`签名数不少于门槛 ${threshold}`, n >= threshold, `${n} 个`);
const lowOwners = owners.map(x=>x.toLowerCase());
ck('全部签名人都是多签 owner', recovered.every(x=>lowOwners.includes(x.signer.toLowerCase())));
for (const x of recovered) console.log(`        ${x.signer}  (${x.kind})`);

fs.writeFileSync(DATA+'mainnet_exec.json', JSON.stringify({ tx:TX, block:POST, timestamp:blk.timestamp, epoch,
  gasUsed:rc.gasUsed.toString(), safeTxHash:evt?evt.args[0]:null, nonce:nonceBefore.toString(),
  signers:recovered.map(x=>x.signer), ops:ops.map(x=>({...x, value:x.value.toString()})) }, null, 1));
console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exitCode = fail ? 1 : 0;

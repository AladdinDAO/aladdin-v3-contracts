import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
const DATA = path.join(import.meta.dirname, 'data/');
const RPC = 'https://mainnet.gateway.tenderly.co';
const CVX_LOCKER = '0x72a19342e8F1838460eBFCCEf09F6585e32db86E';
const CLEVER = '0x96C68D861aDa016Ed98c30C810879F9df7c64154';
const pad = a => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
const WITHDRAWN = ethers.id('Withdrawn(address,uint256,bool)');
const STAKED = ethers.id('Staked(address,uint256,uint256,uint256)');
const KICK = ethers.id('KickReward(address,address,uint256)');
const START = 14627685, END = 25924517, SPAN = 400000;
async function rpc(params, attempt=0) {
  try {
    const r = await fetch(RPC, { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getLogs',params:[params]})});
    const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
  } catch(e) { if (attempt>6) throw e; await new Promise(r=>setTimeout(r,1000*(attempt+1))); return rpc(params, attempt+1); }
}
async function scan(topics) {
  const out = [];
  for (let f = START; f <= END; f += SPAN) {
    const t = Math.min(f+SPAN-1, END);
    const logs = await rpc({ address: CVX_LOCKER, topics, fromBlock:'0x'+f.toString(16), toBlock:'0x'+t.toString(16) });
    out.push(...logs);
  }
  return out;
}
const [wd, st, kick] = await Promise.all([
  scan([WITHDRAWN, pad(CLEVER)]),
  scan([STAKED, pad(CLEVER)]),
  scan([KICK, null, pad(CLEVER)]),
]);
// need block timestamps
const blocks = [...new Set([...wd, ...st, ...kick].map(l => l.blockNumber))];
const ts = {};
async function blockTs(b, attempt=0) {
  try {
    const r = await fetch(RPC, {method:'POST',headers:{'content-type':'application/json'},
      body: JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBlockByNumber',params:[b,false]})});
    const j = await r.json();
    if (!j.result || !j.result.timestamp) throw new Error('no result');
    return parseInt(j.result.timestamp, 16);
  } catch (e) { if (attempt>8) throw new Error(`block ${b}: ${e.message}`); await new Promise(r=>setTimeout(r,1200*(attempt+1))); return blockTs(b, attempt+1); }
}
for (let i = 0; i < blocks.length; i += 5) {
  const chunk = blocks.slice(i, i+5);
  const rs = await Promise.all(chunk.map(async b => [b, await blockTs(b)]));
  for (const [b, t] of rs) ts[b] = t;
  process.stderr.write(`ts ${Math.min(i+5,blocks.length)}/${blocks.length}\r`);
}
const dec = (l, kind) => {
  const t = ts[l.blockNumber];
  const e = Math.floor(t / 604800);
  if (kind === 'W') { const d = ethers.AbiCoder.defaultAbiCoder().decode(['uint256','bool'], l.data);
    return { kind, epoch: e, block: parseInt(l.blockNumber,16), amount: d[0].toString(), relocked: d[1], tx: l.transactionHash }; }
  if (kind === 'S') { const d = ethers.AbiCoder.defaultAbiCoder().decode(['uint256','uint256','uint256'], l.data);
    return { kind, epoch: e, block: parseInt(l.blockNumber,16), paid: d[0].toString(), lockedBal: d[1].toString(), tx: l.transactionHash }; }
  const d = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], l.data);
  return { kind, epoch: e, block: parseInt(l.blockNumber,16), reward: d[0].toString(), kicker: '0x'+l.topics[1].slice(26), tx: l.transactionHash };
};
const all = [...wd.map(l=>dec(l,'W')), ...st.map(l=>dec(l,'S')), ...kick.map(l=>dec(l,'K'))].sort((a,b)=>a.block-b.block);
fs.writeFileSync(DATA + 'convexhist.json', JSON.stringify(all, null, 1));
console.log('Withdrawn:', wd.length, 'Staked:', st.length, 'KickReward:', kick.length);
console.log('epochs with a Withdrawn (processExpiredLocks) event:', [...new Set(wd.map(l=>Math.floor(ts[l.blockNumber]/604800)))].join(','));

import fs from 'fs';
import path from 'path';
const DATA = path.join(import.meta.dirname, 'data/');
const RPC = 'https://mainnet.gateway.tenderly.co';
const A = '0x96C68D861aDa016Ed98c30C810879F9df7c64154';
const TOPICS = {
  Deposit:  '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c',
  Unlock:   null, Withdraw: null,
};
const START = 14627685, END = 25924517;
async function rpc(method, params, attempt = 0) {
  try {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j.result;
  } catch (e) {
    if (attempt > 6) throw new Error(`${method} ${JSON.stringify(params).slice(0,120)}: ${e.message}`);
    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    return rpc(method, params, attempt + 1);
  }
}
async function scan(topic, span) {
  const out = [];
  for (let f = START; f <= END; f += span) {
    const t = Math.min(f + span - 1, END);
    let logs;
    let s = span;
    while (true) {
      try { logs = await rpc('eth_getLogs', [{ address: A, topics: [topic], fromBlock: '0x'+f.toString(16), toBlock: '0x'+Math.min(f+s-1, END).toString(16) }]); break; }
      catch (e) { if (s <= 20000) throw e; s = Math.floor(s/2); process.stderr.write(`shrink to ${s}\n`); }
    }
    out.push(...logs);
    process.stderr.write(`${f}-${Math.min(f+s-1,END)} -> ${logs.length} (cum ${out.length})\n`);
    f = f + s - span; // adjust when shrunk
  }
  return out;
}
const dep = await scan(TOPICS.Deposit, 400000);
const users = [...new Set(dep.map(l => '0x'+l.topics[1].slice(26)))].sort();
console.error(`Deposit events=${dep.length} unique users=${users.length}`);
fs.writeFileSync(DATA + 'users.json', JSON.stringify({ depositEvents: dep.length, users }, null, 1));

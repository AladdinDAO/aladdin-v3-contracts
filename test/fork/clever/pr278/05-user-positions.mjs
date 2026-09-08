import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
const DATA = path.join(import.meta.dirname, 'data/');
const BLOCK = 25924517;
const p = new ethers.JsonRpcProvider('https://mainnet.gateway.tenderly.co');
const LOCKER = '0x96C68D861aDa016Ed98c30C810879F9df7c64154';
const MC3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const mc = new ethers.Contract(MC3, ['function aggregate3(tuple(address target,bool allowFailure,bytes callData)[]) view returns (tuple(bool success,bytes returnData)[])'], p);
const iface = new ethers.Interface([
  'function getUserInfo(address) view returns (uint256,uint256,uint256,uint256,uint256)',
  'function getUserLocks(address) view returns (tuple(uint192 pendingUnlock,uint64 unlockEpoch)[], tuple(uint192 pendingUnlock,uint64 unlockEpoch)[])',
]);
const { users } = JSON.parse(fs.readFileSync(DATA + 'users.json','utf8'));
const out = {};
const B = 40;
for (let i = 0; i < users.length; i += B) {
  const batch = users.slice(i, i+B);
  const calls = [];
  for (const u of batch) {
    calls.push({ target: LOCKER, allowFailure: false, callData: iface.encodeFunctionData('getUserInfo',[u]) });
    calls.push({ target: LOCKER, allowFailure: false, callData: iface.encodeFunctionData('getUserLocks',[u]) });
  }
  let res;
  for (let a = 0; ; a++) {
    try { res = await mc.aggregate3.staticCall(calls, { blockTag: BLOCK }); break; }
    catch (e) { if (a > 6) throw e; await new Promise(r=>setTimeout(r, 1500*(a+1))); }
  }
  for (let k = 0; k < batch.length; k++) {
    const info = iface.decodeFunctionResult('getUserInfo', res[2*k][1]);
    const lk = iface.decodeFunctionResult('getUserLocks', res[2*k+1][1]);
    out[batch[k]] = {
      locked: info[0].toString(), futurePending: info[1].toString(), claimable: info[2].toString(), debt: info[3].toString(),
      epochLocked: lk[0].map(x => ({ amount: x[0].toString(), unlockEpoch: Number(x[1]) })),
      pendingUnlocks: lk[1].map(x => ({ amount: x[0].toString(), unlockEpoch: Number(x[1]) })),
    };
  }
  process.stderr.write(`${Math.min(i+B, users.length)}/${users.length}\n`);
}
fs.writeFileSync(DATA + 'mcpositions.json', JSON.stringify({ block: BLOCK, positions: out }, null, 1));
console.log('saved', Object.keys(out).length);

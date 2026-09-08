import { ethers } from 'ethers';
const p = new ethers.JsonRpcProvider('https://mainnet.gateway.tenderly.co');
const CVX_LOCKER = '0x72a19342e8F1838460eBFCCEf09F6585e32db86E';
const CLEVER = '0x96C68D861aDa016Ed98c30C810879F9df7c64154';
const abi = ['function lockedBalances(address) view returns (uint256 total,uint256 unlockable,uint256 locked,tuple(uint112 amount,uint112 boosted,uint32 unlockTime)[] lockData)'];
const C = new ethers.Contract(CVX_LOCKER, abi, p);
const WEEK = 604800n;
async function blockAtTs(target) {
  let lo = 14627685, hi = await p.getBlockNumber();
  while (hi - lo > 1) {
    const mid = Math.floor((lo+hi)/2);
    const b = await p.getBlock(mid);
    if (b.timestamp < target) lo = mid; else hi = mid;
  }
  return lo; // last block with ts < target
}
const CONST = {
  2752: { name: 'DRIFT_MOD_15', value: 561911228961951745608n },
  2817: { name: 'DRIFT_MOD_12', value: 76667262837450359231536n },
  2818: { name: 'DRIFT_MOD_13', value: 32351447410870579373820n },
  2838: { name: 'DRIFT_MOD_16', value: 237756223183328739207623n },
};
for (const e of [2752, 2817, 2818, 2838]) {
  const start = Number(BigInt(e) * WEEK);
  const blk = await blockAtTs(start - 30);
  const lb = await C.lockedBalances(CLEVER, { blockTag: blk });
  let expiring = 0n, unlockable = lb[1];
  for (const d of lb[3]) if (Number(d[2]) === start) expiring += BigInt(d[0]);
  const c = CONST[e];
  console.log(`epoch ${e} (residue ${e % 17}) @block ${blk}:`);
  console.log(`  tranche expiring at epoch start = ${ethers.formatEther(expiring)} CVX`);
  console.log(`  already-unlockable at that block = ${ethers.formatEther(unlockable)} CVX`);
  console.log(`  ${c.name} = ${ethers.formatEther(c.value)}  -> ${expiring === c.value ? 'MATCH' : 'MISMATCH (diff ' + ethers.formatEther(expiring - c.value) + ')'}`);
}

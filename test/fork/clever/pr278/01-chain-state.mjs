import { ethers } from 'ethers';
const RPC = process.env.RPC;
const p = new ethers.JsonRpcProvider(RPC);
const LOCKER = '0x96C68D861aDa016Ed98c30C810879F9df7c64154';
const CVX = '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B';
const CVX_REWARD_POOL = '0xCF50b810E57Ac33B91dCF525C6ddd9881B139332';
const CVX_LOCKER = '0x72a19342e8F1838460eBFCCEf09F6585e32db86E';

const lockerAbi = [
  'function totalLockedGlobal() view returns (uint256)',
  'function totalPendingUnlockGlobal() view returns (uint256)',
  'function totalUnlockedGlobal() view returns (uint256)',
  'function totalDebtGlobal() view returns (uint256)',
  'function totalCVXInPool() view returns (uint256)',
  'function pendingUnlocked(uint256) view returns (uint256)',
  'function owner() view returns (address)',
  'function isKeeper(address) view returns (bool)',
];
const erc20 = ['function balanceOf(address) view returns (uint256)'];
const cvxLockerAbi = [
  'function lockedBalances(address) view returns (uint256 total, uint256 unlockable, uint256 locked, (uint256 amount, uint256 boosted, uint256 unlockTime)[] lockData)',
  'function epochCount() view returns (uint256)',
];

const bn = await p.getBlockNumber();
const blk = await p.getBlock(bn);
const EPOCH = 604800n;
const curEpoch = BigInt(blk.timestamp) / EPOCH;

const L = new ethers.Contract(LOCKER, lockerAbi, p);
const out = {};
out.block = bn; out.timestamp = blk.timestamp;
out.currentEpoch = curEpoch.toString();
out.epochStart = (curEpoch*EPOCH).toString();
out.epochEndUTC = new Date(Number((curEpoch+1n)*EPOCH)*1000).toISOString();
out.totalLockedGlobal = (await L.totalLockedGlobal()).toString();
out.totalPendingUnlockGlobal = (await L.totalPendingUnlockGlobal()).toString();
out.totalUnlockedGlobal = (await L.totalUnlockedGlobal()).toString();
out.totalDebtGlobal = (await L.totalDebtGlobal()).toString();
out.totalCVXInPool = (await L.totalCVXInPool()).toString();
out.owner = await L.owner();
out.cvxBalanceDirect = (await new ethers.Contract(CVX, erc20, p).balanceOf(LOCKER)).toString();
out.cvxInRewardPool = (await new ethers.Contract(CVX_REWARD_POOL, erc20, p).balanceOf(LOCKER)).toString();
// proxy implementation slot (EIP-1967)
out.impl = await p.getStorage(LOCKER, '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc');
out.proxyAdminSlot = await p.getStorage(LOCKER, '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103');

// scan pendingUnlocked over a wide epoch range
const nonzero = {};
for (let e = 2600; e <= 3010; e++) {
  const v = await L.pendingUnlocked(e);
  if (v !== 0n) nonzero[e] = v.toString();
}
out.pendingUnlockedNonZero = nonzero;

const cl = new ethers.Contract(CVX_LOCKER, cvxLockerAbi, p);
const lb = await cl.lockedBalances(LOCKER);
out.convex = { total: lb[0].toString(), unlockable: lb[1].toString(), locked: lb[2].toString() };
out.convexLocks = lb[3].map(d => ({
  amount: d[0].toString(),
  unlockTime: Number(d[2]),
  unlockEpoch: Number(BigInt(d[2])/EPOCH),
  residue: Number((BigInt(d[2])/EPOCH) % 17n),
  unlockUTC: new Date(Number(d[2])*1000).toISOString(),
}));
console.log(JSON.stringify(out, null, 2));

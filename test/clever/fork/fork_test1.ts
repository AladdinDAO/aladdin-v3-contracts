/* eslint-disable camelcase */
import { expect } from "chai";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, network } from "hardhat";

import { CLeverCVXLocker } from "@/types/index";
import { mockETHBalance } from "@/test/utils";

const DEFAULT_FORK_URL = "https://eth.drpc.org";
const FORK_BLOCK_NUMBER = 25902896;
const REWARDS_DURATION = 86400 * 7;

const CLEVER_LOCKER = "0x96C68D861aDa016Ed98c30C810879F9df7c64154";
const PROXY_ADMIN = "0x1F57286F7a8083fb363d87Bc8b1DCcD685dc87EE";
const ADMIN = "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E";
const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";
const CVX_LOCKER = "0x72a19342e8F1838460eBFCCEf09F6585e32db86E";
const LOCKER_ABI = [
  "function lockedBalances(address) view returns (uint256 total,uint256 unlockable,uint256 locked,tuple(uint112 amount,uint112 boosted,uint32 unlockTime)[] lockData)",
];
const TOTAL_LOCKED_GLOBAL = 3132239712948798911166696n;
const EXPECTED_GLOBALS: Record<number, { pending: bigint; unlocked: bigint; convexTotal: bigint }> = {
  2957: {
    pending: 168974130879801758050412n,
    unlocked: 77052778394272365239391n,
    convexTotal: 3304386843828600669217108n,
  },
  2958: {
    pending: 20806282844729316315230n,
    unlocked: 329294907356420567525312n,
    convexTotal: 3048971714866452466931187n,
  },
  2959: {
    pending: 20805282844729316315230n,
    unlocked: 329295907356420567525312n,
    convexTotal: 3048970714866452466931187n,
  },
  2960: {
    pending: 20518994915477111443199n,
    unlocked: 329582195285672772397343n,
    convexTotal: 3048684426937200262059156n,
  },
  2961: {
    pending: 20056684632147688014303n,
    unlocked: 330044505569002195826239n,
    convexTotal: 3048222116653870838630260n,
  },
  2962: {
    pending: 18464675070670698793496n,
    unlocked: 331636515130479185047046n,
    convexTotal: 3046630107092393849409453n,
  },
  2963: {
    pending: 17797658609135445061046n,
    unlocked: 332303531592014438779496n,
    convexTotal: 3045963090630858595677003n,
  },
  2964: {
    pending: 15150766806745447182230n,
    unlocked: 334950423394404436658312n,
    convexTotal: 3043316198828468597798187n,
  },
  2965: {
    pending: 14930369702265494462118n,
    unlocked: 335170820498884389378424n,
    convexTotal: 3043095801723988645078075n,
  },
  2966: {
    pending: 4636215245758946869827n,
    unlocked: 345464974955390936970715n,
    convexTotal: 3032801647267482097485784n,
  },
  2967: {
    pending: 4636215245758946869827n,
    unlocked: 345464974955390936970715n,
    convexTotal: 3032801647267482097485784n,
  },
  2968: {
    pending: 1832961450830400722428n,
    unlocked: 348268228750319483118114n,
    convexTotal: 3029998393472553551338385n,
  },
  2969: {
    pending: 1432961450830400722428n,
    unlocked: 348668228750319483118114n,
    convexTotal: 3029598393472553551338385n,
  },
  2970: {
    pending: 1432961450830400722428n,
    unlocked: 272210155116661034121842n,
    convexTotal: 3106056467106212000334657n,
  },
  2971: {
    pending: 10000000000000000n,
    unlocked: 246026899274074123289803n,
    convexTotal: 3132239722948798911166696n,
  },
  2972: {
    pending: 0n,
    unlocked: 355045619522395061895159n,
    convexTotal: 3023221002700477972561340n,
  },
  2973: {
    pending: 0n,
    unlocked: 354483708293433110149551n,
    convexTotal: 3023782913929439924306948n,
  },
  2974: {
    pending: 0n,
    unlocked: 263685815052893586368101n,
    convexTotal: 3114580807169979448088398n,
  },
  2975: {
    pending: 0n,
    unlocked: 246026909274074123289803n,
    convexTotal: 3132239712948798911166696n,
  },
};
const EXPECTED_FINAL_CONVEX_LOCKS: Record<number, bigint> = {
  2991: 203159631621666622758925n,
  2992: 218801300076976044019010n,
};

async function requestFork(accounts: string[]) {
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.HARDHAT_FORK_URL || DEFAULT_FORK_URL,
          blockNumber: FORK_BLOCK_NUMBER,
        },
      },
    ],
  });

  for (const address of accounts) {
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [address],
    });
  }
}

async function processAt(clever: CLeverCVXLocker, epoch: number) {
  const latest = await ethers.provider.getBlock("latest");
  const timestamp = Math.max(epoch * REWARDS_DURATION + 1, Number(latest!.timestamp) + 1);
  if (Math.floor(timestamp / REWARDS_DURATION) !== epoch) {
    throw new Error(`cannot process epoch ${epoch} from timestamp ${latest!.timestamp}`);
  }
  await network.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await network.provider.send("evm_mine");
  await (await clever.processUnlockableCVX()).wait();
}

async function getConvexLocksByEpoch(cvxLocker: any) {
  const [, , , lockData] = await cvxLocker.lockedBalances(CLEVER_LOCKER);
  const locks: Record<number, bigint> = {};
  for (const item of lockData) {
    const unlockEpoch = Number(BigInt(item.unlockTime) / BigInt(REWARDS_DURATION));
    locks[unlockEpoch] = (locks[unlockEpoch] || 0n) + BigInt(item.amount);
  }
  return locks;
}

describe("fork_test1", async () => {
  let admin: HardhatEthersSigner;
  let keeper: HardhatEthersSigner;
  let clever: CLeverCVXLocker;
  let cvxLocker: any;

  beforeEach(async () => {
    await requestFork([ADMIN, KEEPER]);
    admin = await ethers.getSigner(ADMIN);
    keeper = await ethers.getSigner(KEEPER);

    await mockETHBalance(admin.address, ethers.parseEther("100"));
    await mockETHBalance(keeper.address, ethers.parseEther("100"));

    const CLeverCVXLocker = await ethers.getContractFactory("CLeverCVXLocker", admin);
    const implementation = await CLeverCVXLocker.deploy();
    await implementation.waitForDeployment();

    const proxyAdmin = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN, admin);
    await proxyAdmin.upgrade(CLEVER_LOCKER, await implementation.getAddress());

    clever = await ethers.getContractAt("CLeverCVXLocker", CLEVER_LOCKER, keeper);
    cvxLocker = new ethers.Contract(CVX_LOCKER, LOCKER_ABI, keeper);
  });

  it("should process every week until global drift is cleared", async () => {
    expect(await clever.totalPendingUnlockGlobal()).to.eq(168974130879801758050412n);

    for (let epoch = 2957; epoch <= 2975; epoch++) {
      await processAt(clever, epoch);

      const expected = EXPECTED_GLOBALS[epoch];
      const [convexTotal] = await cvxLocker.lockedBalances(CLEVER_LOCKER);
      expect(await clever.totalLockedGlobal()).to.eq(TOTAL_LOCKED_GLOBAL);
      expect(await clever.totalPendingUnlockGlobal()).to.eq(expected.pending);
      expect(await clever.totalUnlockedGlobal()).to.eq(expected.unlocked);
      expect(convexTotal).to.eq(expected.convexTotal);
    }

    const [convexTotal] = await cvxLocker.lockedBalances(CLEVER_LOCKER);
    expect(await clever.totalPendingUnlockGlobal()).to.eq(0n);
    expect((await clever.totalLockedGlobal()) + (await clever.totalPendingUnlockGlobal())).to.eq(convexTotal);

    const convexLocks = await getConvexLocksByEpoch(cvxLocker);
    for (const [epoch, amount] of Object.entries(EXPECTED_FINAL_CONVEX_LOCKS)) {
      expect(convexLocks[Number(epoch)]).to.eq(amount);
    }
  });
});

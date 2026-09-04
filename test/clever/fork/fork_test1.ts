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
  await network.provider.send("evm_setNextBlockTimestamp", [epoch * REWARDS_DURATION + 1]);
  await network.provider.send("evm_mine");
  await (await clever.processUnlockableCVX()).wait();
}

describe("fork_test1", async () => {
  let admin: HardhatEthersSigner;
  let keeper: HardhatEthersSigner;
  let clever: CLeverCVXLocker;

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
  });

  it("should not underflow totalPendingUnlockGlobal when fixing fake pending", async () => {
    expect(await clever.totalPendingUnlockGlobal()).to.eq(168974130879801758050412n);

    await processAt(clever, 2958);
    expect(await clever.totalPendingUnlockGlobal()).to.eq(20806282844729316315230n);
    expect(await clever.totalUnlockedGlobal()).to.eq(329294907356420567525312n);

    await processAt(clever, 2970);
    expect(await clever.totalPendingUnlockGlobal()).to.eq(20806282844729316315230n);

    await processAt(clever, 2971);
    expect(await clever.totalPendingUnlockGlobal()).to.eq(19373331393898915592802n);

    await processAt(clever, 2972);
    expect(await clever.totalPendingUnlockGlobal()).to.eq(19373321393898915592802n);
  });
});

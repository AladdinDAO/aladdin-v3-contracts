/* eslint-disable camelcase */
import { expect } from "chai";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, network } from "hardhat";

import { CLeverCVXLocker } from "@/types/index";
import { mockETHBalance } from "@/test/utils";

const DEFAULT_FORK_URL = "https://eth.drpc.org";
const FORK_BLOCK_NUMBER = 25902896;
const REWARDS_DURATION = 86400 * 7;
const TOTAL_UNLOCKED_GLOBAL_SLOT = 105;

const CLEVER_LOCKER = "0x96C68D861aDa016Ed98c30C810879F9df7c64154";
const PROXY_ADMIN = "0x1F57286F7a8083fb363d87Bc8b1DCcD685dc87EE";
const ADMIN = "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E";
const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const CVX_REWARD_POOL = "0xCF50b810E57Ac33B91dCF525C6ddd9881B139332";
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

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

describe("fork_test2", async () => {
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

  it("should withdraw staked CVX before relocking when liquid balance is insufficient", async () => {
    const cvx = new ethers.Contract(CVX, ERC20_ABI, keeper);
    const rewardPool = new ethers.Contract(CVX_REWARD_POOL, ERC20_ABI, keeper);

    await processAt(clever, 2958);

    const storageValue = await ethers.provider.getStorage(CLEVER_LOCKER, TOTAL_UNLOCKED_GLOBAL_SLOT);
    expect(BigInt(storageValue)).to.eq(await clever.totalUnlockedGlobal());

    await network.provider.send("hardhat_setStorageAt", [
      CLEVER_LOCKER,
      ethers.toBeHex(TOTAL_UNLOCKED_GLOBAL_SLOT),
      ethers.toBeHex(0n, 32),
    ]);

    const liquidBefore = await cvx.balanceOf(CLEVER_LOCKER);
    const stakedBefore = await rewardPool.balanceOf(CLEVER_LOCKER);
    expect(stakedBefore).to.eq(61642222715417892191512n);

    await processAt(clever, 2959);

    expect(await cvx.balanceOf(CLEVER_LOCKER)).to.be.lt(liquidBefore);
    expect(await rewardPool.balanceOf(CLEVER_LOCKER)).to.be.lt(stakedBefore);
    expect(await rewardPool.balanceOf(CLEVER_LOCKER)).to.eq(ethers.parseEther("1"));
  });
});

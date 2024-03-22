/* eslint-disable camelcase */
import { expect } from "chai";
import { ethers } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import { DEPLOYED_CONTRACTS } from "@/utils/index";

const FORK_BLOCK_NUMBER = 19490379;

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const VAULT = "0xa8917d2f1c45aa5bb17ac25883c8b396ba5ae8e0";

describe("ShareableRebalancePool.fix", async () => {
  it("should succeed", async () => {
    await request_fork(FORK_BLOCK_NUMBER, [DEPLOYED_CONTRACTS.Fx.Treasury, DEPLOYER]);
    const deployer = await ethers.getSigner(DEPLOYER);
    const owner = await ethers.getSigner(DEPLOYED_CONTRACTS.Fx.Treasury);
    await mockETHBalance(DEPLOYED_CONTRACTS.Fx.Treasury, ethers.parseEther("10"));

    const proxyAdmin = await ethers.getContractAt("ProxyAdmin", DEPLOYED_CONTRACTS.Fx.ProxyAdmin, owner);
    const pool = await ethers.getContractAt(
      "FxUSDShareableRebalancePool",
      "0x9aD382b028e03977D446635Ba6b8492040F829b7",
      deployer
    );

    // revert
    await expect(pool["claim(address)"](VAULT)).to.reverted;
    await expect(pool.getBoostRatio(VAULT)).to.reverted;

    // upgrade
    const FxUSDShareableRebalancePool = await ethers.getContractFactory("FxUSDShareableRebalancePool", deployer);
    const impl = await FxUSDShareableRebalancePool.deploy(
      await pool.fxn(),
      await pool.ve(),
      await pool.veHelper(),
      await pool.minter()
    );
    await proxyAdmin.upgrade(pool.getAddress(), impl.getAddress());

    // succeed
    expect(await pool.getBoostRatio(VAULT)).to.gt(0n);
    await pool["claim(address)"](VAULT);
  });
});

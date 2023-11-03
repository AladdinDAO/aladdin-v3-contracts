import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, Overrides, ZeroAddress } from "ethers";
import { ethers, network } from "hardhat";

import { ADDRESS, AVAILABLE_VAULTS, DEPLOYED_VAULTS, selectDeployments } from "@/utils/index";
import { contractCall, minimalProxyDeploy, ownerContractCall } from "./helpers";

const Strategy: { [name: string]: string } = {
  AutoCompoundingConvexFraxStrategy: "0x6Cc546cE582b0dD106c231181f7782C79Ef401da",
  AutoCompoundingConvexCurveStrategy: ZeroAddress,
  ManualCompoundingConvexCurveStrategy: "0xE25f0E29060AeC19a0559A2EF8366a5AF086222e",
  ManualCompoundingCurveGaugeStrategy: "0x188bd82BF11cC321F7872acdCa4B1a3Bf9a802dE",
  CLeverGaugeStrategy: ZeroAddress,
  AMOConvexCurveStrategy: "0x2be5B652836C630E15c3530bf642b544ae901239",
};

export interface ConcentratorFrxETHDeployment {
  ConcentratorVault: {
    proxy: string;
    implementation: string;
  };
}

export async function deploy(
  _deployer: HardhatEthersSigner,
  _overrides?: Overrides
): Promise<ConcentratorFrxETHDeployment> {
  const deployment = selectDeployments(network.name, "Concentrator.frxETH");

  return deployment.toObject() as ConcentratorFrxETHDeployment;
}

export async function initialize(
  deployer: HardhatEthersSigner,
  deployment: ConcentratorFrxETHDeployment,
  overrides?: Overrides
): Promise<void> {
  const vault = await ethers.getContractAt("ConcentratorAladdinETHVault", deployment.ConcentratorVault.proxy, deployer);
  const pools = DEPLOYED_VAULTS.afrxETH;

  const startIndex = Number(await vault.poolLength());
  for (let pid = startIndex; pid < pools.length; ++pid) {
    const pool = pools[pid];
    const vaultConfig = AVAILABLE_VAULTS[pool.name];
    const strategyName = `ManualCompounding${pool.strategy}Strategy`;

    // deploy strategy
    let strategy: Contract;
    {
      const address = await minimalProxyDeploy(deployer, strategyName, Strategy[strategyName], overrides);
      strategy = await ethers.getContractAt(strategyName, address, deployer);
    }
    const underlying = ADDRESS[`${vaultConfig.token}_TOKEN`];
    if (strategyName === "ManualCompoundingConvexCurveStrategy") {
      await contractCall(
        strategy,
        `Initialize ${strategyName} for pool[${pool.name}]`,
        "initialize",
        [await vault.getAddress(), underlying, vaultConfig.rewarder!, vaultConfig.rewards],
        overrides
      );
    } else if (strategyName === "ManualCompoundingCurveGaugeStrategy") {
      await contractCall(
        strategy,
        `Initialize ${strategyName} for pool[${pool.name}]`,
        "initialize",
        [await vault.getAddress(), underlying, vaultConfig.gauge!, vaultConfig.rewards],
        overrides
      );
    } else {
      throw new Error(`strategy ${strategyName} not supported`);
    }

    await ownerContractCall(
      vault as unknown as Contract,
      `Add pool[${pool.name}] with pid[${pid}]`,
      "addPool",
      [underlying, await strategy.getAddress(), pool.fees.withdraw, pool.fees.platform, pool.fees.harvest],
      overrides
    );
  }
}

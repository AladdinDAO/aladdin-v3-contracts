/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides, id } from "ethers";
import { network, ethers } from "hardhat";

import { FxUSDCompounder, FxUSDCompounder4626__factory, FxUSDCompounder__factory } from "@/types/index";
import { CONVERTER_ROUTRS as CONVERTER_ROUTES, TOKENS, selectDeployments } from "@/utils/index";

import { ContractCallHelper, DeploymentHelper } from "./helpers";
import { ProxyAdminDeployment } from "./ProxyAdmin";
import { ConcentratorGovernanceDeployment } from "./ConcentratorGovernance";
import { GatewayDeployment } from "./Gateway";
import { ConverterDeployment } from "./Converter";
import { FxUSDDeployment } from "./FxConfig";

const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";

export interface ConcentratorFxUSDDeployment {
  FxUSDCompounder: {
    proxy: {
      afxUSD: string;
      arUSD: string;
    };
    implementation: string;
  };
  FxUSDCompounder4626: {
    proxy: {
      afxUSD: string;
      arUSD: string;
    };
    implementation: string;
  };
}

export async function deploy(
  deployer: HardhatEthersSigner,
  overrides?: Overrides
): Promise<ConcentratorFxUSDDeployment> {
  const admin = selectDeployments(network.name, "ProxyAdmin").toObject() as ProxyAdminDeployment;
  const gateway = selectDeployments(network.name, "Gateway").toObject() as GatewayDeployment;
  const converter = selectDeployments(network.name, "Converter").toObject() as ConverterDeployment;
  const governance = selectDeployments(
    network.name,
    "Concentrator.Governance"
  ).toObject() as ConcentratorGovernanceDeployment;
  const fxusd = selectDeployments(network.name, "Fx.FxUSD").toObject() as FxUSDDeployment;
  const deployment = new DeploymentHelper(network.name, "Concentrator.FxUSD", deployer, overrides);

  await deployment.contractDeploy(
    "FxUSDCompounder.implementation",
    "FxUSDCompounder implementation",
    "FxUSDCompounder",
    []
  );
  await deployment.contractDeploy(
    "FxUSDCompounder4626.implementation",
    "FxUSDCompounder4626 implementation",
    "FxUSDCompounder4626",
    []
  );

  await deployment.proxyDeploy(
    "FxUSDCompounder.proxy.afxUSD",
    "afxUSD",
    deployment.get("FxUSDCompounder.implementation"),
    admin.Concentrator,
    FxUSDCompounder__factory.createInterface().encodeFunctionData("initialize", [
      governance.PlatformFeeSplitter,
      gateway.ConcentratorHarvester,
      converter.GeneralTokenConverter,
      fxusd.FxUSD.proxy.fxUSD,
      fxusd.Markets.wstETH.RebalancePool.wstETH.pool,
      "Aladdin fxUSD",
      "afxUSD",
      2,
    ])
  );

  await deployment.proxyDeploy(
    "FxUSDCompounder.proxy.arUSD",
    "arUSD",
    deployment.get("FxUSDCompounder.implementation"),
    admin.Concentrator,
    FxUSDCompounder__factory.createInterface().encodeFunctionData("initialize", [
      governance.PlatformFeeSplitter,
      gateway.ConcentratorHarvester,
      converter.GeneralTokenConverter,
      fxusd.FxUSD.proxy.rUSD,
      fxusd.Markets.weETH.RebalancePool.weETH.pool,
      "Aladdin rUSD",
      "arUSD",
      19,
    ])
  );

  await deployment.proxyDeploy(
    "FxUSDCompounder4626.proxy.afxUSD",
    "afxUSD-ERC4626",
    deployment.get("FxUSDCompounder4626.implementation"),
    admin.Concentrator,
    FxUSDCompounder4626__factory.createInterface().encodeFunctionData("initialize", [
      deployment.get("FxUSDCompounder.proxy.afxUSD"),
    ])
  );

  await deployment.proxyDeploy(
    "FxUSDCompounder4626.proxy.arUSD",
    "arUSD-ERC4626",
    deployment.get("FxUSDCompounder4626.implementation"),
    admin.Concentrator,
    FxUSDCompounder4626__factory.createInterface().encodeFunctionData("initialize", [
      deployment.get("FxUSDCompounder.proxy.arUSD"),
    ])
  );

  return deployment.toObject() as ConcentratorFxUSDDeployment;
}

async function setupFxUSDCompounder(
  caller: ContractCallHelper,
  compounder: FxUSDCompounder,
  routes: bigint[]
): Promise<void> {
  const symbol = await compounder.symbol();
  // update route for FXN
  if ((await compounder.getConvertRoutes(TOKENS.FXN.address)).toString() !== routes.toString()) {
    await caller.ownerCall(compounder, symbol + " updateConvertRoutes for FXN", "updateConvertRoutes", [
      TOKENS.FXN.address,
      routes,
    ]);
  }
  // grant role
  if (!(await compounder.hasRole(id("REBALANCER_ROLE"), KEEPER))) {
    await caller.ownerCall(compounder, symbol + " grant REBALANCER_ROLE", "grantRole", [id("REBALANCER_ROLE"), KEEPER]);
  }
  // update expense ratio
  if ((await compounder.getExpenseRatio()) !== ethers.parseUnits("0.1", 9)) {
    await caller.ownerCall(compounder, symbol + " updateExpenseRatio", "updateExpenseRatio", [
      ethers.parseUnits("0.1", 9),
    ]);
  }
  // update harvester ratio
  if ((await compounder.getHarvesterRatio()) !== ethers.parseUnits("0.01", 9)) {
    await caller.ownerCall(compounder, symbol + " updateHarvesterRatio", "updateHarvesterRatio", [
      ethers.parseUnits("0.01", 9),
    ]);
  }
  // update minimum rebalance profit
  if ((await compounder.minRebalanceProfit()) !== ethers.parseUnits("0.05", 9)) {
    await caller.ownerCall(compounder, symbol + " updateMinRebalanceProfit", "updateMinRebalanceProfit", [
      ethers.parseUnits("0.05", 9),
    ]);
  }
}

export async function initialize(
  deployer: HardhatEthersSigner,
  deployment: ConcentratorFxUSDDeployment,
  overrides?: Overrides
): Promise<void> {
  // const admin = selectDeployments(network.name, "ProxyAdmin").toObject() as ProxyAdminDeployment;
  const caller = new ContractCallHelper(deployer, overrides);

  const afxUSD = await caller.contract<FxUSDCompounder>("FxUSDCompounder", deployment.FxUSDCompounder.proxy.afxUSD);
  const arUSD = await caller.contract<FxUSDCompounder>("FxUSDCompounder", deployment.FxUSDCompounder.proxy.arUSD);

  await setupFxUSDCompounder(caller, afxUSD, CONVERTER_ROUTES.FXN.wstETH);
  await setupFxUSDCompounder(caller, arUSD, CONVERTER_ROUTES.FXN.weETH);

  /*
  await caller.upgrade(
    admin.Concentrator,
    "afxUSD upgrade",
    await afxUSD.getAddress(),
    deployment.FxUSDCompounder.implementation
  );
  await caller.upgrade(
    admin.Concentrator,
    "arUSD upgrade",
    await arUSD.getAddress(),
    deployment.FxUSDCompounder.implementation
  );
  */
}

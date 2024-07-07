/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Interface, Overrides, ZeroAddress, getAddress, id } from "ethers";
import { network } from "hardhat";

import {
  DiamondCutFacet,
  DiamondCutFacet__factory,
  DiamondLoupeFacet,
  DiamondLoupeFacet__factory,
  FxMarketV1Facet__factory,
  FxUSDCompounderHarvestFacet__factory,
  FxUSDFacet__factory,
  IDiamond,
  OwnershipFacet__factory,
  TokenConvertManagementFacet,
  TokenConvertManagementFacet__factory,
} from "@/types/index";
import { selectDeployments } from "@/utils/index";

import { ContractCallHelper, DeploymentHelper } from "./helpers";
import * as ERC2535 from "./ERC2535";
import { FxUSDDeployment } from "./FxConfig";

const getAllSignatures = (e: Interface): string[] => {
  const sigs: string[] = [];
  e.forEachFunction((func, _) => {
    sigs.push(func.selector);
  });
  return sigs;
};

export interface GatewayDeployment {
  ConcentratorHarvester: string;
  GatewayRouter: string;
}

async function deployGatewayRouter(deployment: DeploymentHelper, facets: ERC2535.ERC2535Deployment) {
  const diamondCuts: IDiamond.FacetCutStruct[] = [
    {
      facetAddress: facets.DiamondCutFacet,
      action: 0,
      functionSelectors: getAllSignatures(DiamondCutFacet__factory.createInterface()),
    },
    {
      facetAddress: facets.DiamondLoupeFacet,
      action: 0,
      functionSelectors: getAllSignatures(DiamondLoupeFacet__factory.createInterface()),
    },
    {
      facetAddress: facets.OwnershipFacet,
      action: 0,
      functionSelectors: getAllSignatures(OwnershipFacet__factory.createInterface()),
    },
    {
      facetAddress: facets.TokenConvertManagementFacet,
      action: 0,
      functionSelectors: getAllSignatures(TokenConvertManagementFacet__factory.createInterface()),
    },
    {
      facetAddress: facets.FxMarketV1Facet,
      action: 0,
      functionSelectors: getAllSignatures(FxMarketV1Facet__factory.createInterface()),
    },
    {
      facetAddress: facets.FxUSDFacet,
      action: 0,
      functionSelectors: getAllSignatures(FxUSDFacet__factory.createInterface()),
    },
  ];

  await deployment.contractDeploy("GatewayRouter", "GatewayRouter Diamond Proxy", "Diamond", [
    diamondCuts,
    {
      owner: deployment.deployer.address,
      init: facets.FxMarketV1Facet,
      initCalldata: FxMarketV1Facet__factory.createInterface().encodeFunctionData("initalizeFxMarketV1Facet"),
    },
  ]);
}

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<GatewayDeployment> {
  const facets = selectDeployments(network.name, "ERC2535").toObject() as ERC2535.ERC2535Deployment;
  const deployment = new DeploymentHelper(network.name, "Gateway", deployer, overrides);
  await deployGatewayRouter(deployment, facets);

  return deployment.toObject() as GatewayDeployment;
}

async function initializeConcentratorHarvester(caller: ContractCallHelper, deployment: GatewayDeployment) {
  const cutFacet = (await caller.contract("DiamondCutFacet", deployment.ConcentratorHarvester)) as DiamondCutFacet;
  const facets = selectDeployments(network.name, "ERC2535").toObject() as ERC2535.ERC2535Deployment;
  const cuts: IDiamond.FacetCutStruct[] = [];
  cuts.push({
    facetAddress: facets.FxUSDCompounderHarvestFacet,
    action: 0,
    functionSelectors: getAllSignatures(FxUSDCompounderHarvestFacet__factory.createInterface()),
  });
  if (cuts[0].functionSelectors.length > 0) {
    await caller.ownerCall(cutFacet, "ConcentratorHarvester diamondCut", "diamondCut", [cuts, ZeroAddress, "0x"]);
  }
}

// eslint-disable-next-line no-unused-vars
async function initializeGatewayRouter(caller: ContractCallHelper, deployment: GatewayDeployment) {
  const facets = selectDeployments(network.name, "ERC2535").toObject() as ERC2535.ERC2535Deployment;
  const fxusd = selectDeployments(network.name, "Fx.FxUSD").toObject() as FxUSDDeployment;

  // update manage and fxusd facets
  const loupeFacet = (await caller.contract("DiamondLoupeFacet", deployment.GatewayRouter)) as DiamondLoupeFacet;
  const cutFacet = (await caller.contract("DiamondCutFacet", deployment.GatewayRouter)) as DiamondCutFacet;
  const cuts: IDiamond.FacetCutStruct[] = [];
  /*
    cuts.push({
      facetAddress: ZeroAddress,
      action: 2,
      functionSelectors: await loupeFacet.facetFunctionSelectors("0x5fd37C3b46d05859B333D6E418ce7d6d405c20b6"),
    });
    cuts.push({
      facetAddress: ZeroAddress,
      action: 2,
      functionSelectors: await loupeFacet.facetFunctionSelectors("0x2eD6624Cc9E6200c2a60631f8cEb69FbAFbE3733"),
    });
    cuts.push({
      facetAddress: facets.TokenConvertManagementFacet,
      action: 0,
      functionSelectors: getAllSignatures(TokenConvertManagementFacet__factory.createInterface()),
    });
    cuts.push({
      facetAddress: facets.FxUSDFacet,
      action: 0,
      functionSelectors: getAllSignatures(FxUSDFacet__factory.createInterface()),
    });
    */
  cuts.push({
    facetAddress: ZeroAddress,
    action: 2,
    functionSelectors: await loupeFacet.facetFunctionSelectors("0x5fd37C3b46d05859B333D6E418ce7d6d405c20b6"),
  });
  cuts.push({
    facetAddress: facets.TokenConvertManagementFacet,
    action: 0,
    functionSelectors: getAllSignatures(TokenConvertManagementFacet__factory.createInterface()),
  });
  cuts.push({
    facetAddress: facets.FxUSDCompounderHarvestFacet,
    action: 0,
    functionSelectors: getAllSignatures(FxUSDCompounderHarvestFacet__factory.createInterface()),
  });
  if (cuts[0].functionSelectors.length > 0) {
    await caller.ownerCall(cutFacet, "GatewayRouter diamondCut", "diamondCut", [cuts, ZeroAddress, "0x"]);
  }

  const manageFacet = (await caller.contract(
    "TokenConvertManagementFacet",
    deployment.GatewayRouter
  )) as TokenConvertManagementFacet;

  // approve targets
  const targets = [
    {
      target: "0x1111111254eeb25477b68fb85ed929f73a960582",
      name: "1inch AggregationRouterV5",
    },
    {
      target: "0x0c439DB9b9f11E7F2D4624dE6d0f8FfC23DCd1f8",
      name: "MultiPathConverter",
    },
    {
      target: "0x11C907b3aeDbD863e551c37f21DD3F36b28A6784",
      name: "GeneralTokenConverter",
    },
  ];
  const approvedTargets = await manageFacet.getApprovedTargets();
  for (const target of targets) {
    if (!approvedTargets.includes(getAddress(target.target))) {
      await caller.ownerCall(manageFacet, "GatewayRouter approve " + target.name, "approveTarget", [
        target.target,
        target.target,
      ]);
    }
  }

  // add whitelist
  for (const [target, kind] of [
    [fxusd.Markets.wstETH.Market.proxy, 2n],
    [fxusd.Markets.sfrxETH.Market.proxy, 2n],
    [fxusd.Markets.weETH.Market.proxy, 2n],
    [fxusd.Markets.ezETH.Market.proxy, 2n],
    [fxusd.Markets.WBTC.Market.proxy, 2n],
    [fxusd.Markets.aCVX.Market.proxy, 2n],
    [fxusd.Markets.wstETH.FxInitialFund, 3n],
    [fxusd.Markets.sfrxETH.FxInitialFund, 3n],
    [fxusd.Markets.weETH.FxInitialFund, 3n],
    [fxusd.Markets.ezETH.FxInitialFund, 3n],
    [fxusd.Markets.WBTC.FxInitialFund, 3n],
    [fxusd.Markets.aCVX.FxInitialFund, 3n],
    [fxusd.Markets.wstETH.RebalancePool.wstETH.pool, 4n],
    [fxusd.Markets.wstETH.RebalancePool.xstETH.pool, 4n],
    [fxusd.Markets.sfrxETH.RebalancePool.sfrxETH.pool, 4n],
    [fxusd.Markets.sfrxETH.RebalancePool.xfrxETH.pool, 4n],
    [fxusd.Markets.weETH.RebalancePool.weETH.pool, 4n],
    [fxusd.Markets.weETH.RebalancePool.xeETH.pool, 4n],
    [fxusd.Markets.ezETH.RebalancePool.ezETH.pool, 4n],
    [fxusd.Markets.ezETH.RebalancePool.xezETH.pool, 4n],
    [fxusd.Markets.WBTC.RebalancePool.WBTC.pool, 4n],
    [fxusd.Markets.WBTC.RebalancePool.xWBTC.pool, 4n],
    [fxusd.Markets.aCVX.RebalancePool.aCVX.pool, 4n],
    [fxusd.Markets.aCVX.RebalancePool.xCVX.pool, 4n],
    [fxusd.FxUSD.proxy.fxUSD, 5n],
    [fxusd.FxUSD.proxy.rUSD, 5n],
    [fxusd.FxUSD.proxy.btcUSD, 5n],
    [fxusd.FxUSD.proxy.cvxUSD, 5n],
  ]) {
    if ((await manageFacet.getWhitelistKind(target as string)) !== kind) {
      await caller.ownerCall(manageFacet, "GatewayRouter updateWhitelist ", "updateWhitelist", [target, kind]);
    }
  }
  // add withdraw from role
  const WITHDRAW_FROM_ROLE = id("WITHDRAW_FROM_ROLE");
  for (const [pool, name] of [
    [fxusd.Markets.wstETH.RebalancePool.wstETH.pool, "FxUSDShareableRebalancePool/wstETH"],
    [fxusd.Markets.wstETH.RebalancePool.xstETH.pool, "FxUSDShareableRebalancePool/xstETH"],
    [fxusd.Markets.sfrxETH.RebalancePool.sfrxETH.pool, "FxUSDShareableRebalancePool/sfrxET"],
    [fxusd.Markets.sfrxETH.RebalancePool.xfrxETH.pool, "FxUSDShareableRebalancePool/xfrxETH"],
    [fxusd.Markets.weETH.RebalancePool.weETH.pool, "FxUSDShareableRebalancePool/weETH"],
    [fxusd.Markets.weETH.RebalancePool.xeETH.pool, "FxUSDShareableRebalancePool/xeETH"],
    [fxusd.Markets.ezETH.RebalancePool.ezETH.pool, "FxUSDShareableRebalancePool/ezETH"],
    [fxusd.Markets.ezETH.RebalancePool.xezETH.pool, "FxUSDShareableRebalancePool/xezETH"],
    [fxusd.Markets.WBTC.RebalancePool.WBTC.pool, "FxUSDShareableRebalancePool/WBTC"],
    [fxusd.Markets.WBTC.RebalancePool.xWBTC.pool, "FxUSDShareableRebalancePool/xWBTC"],
    [fxusd.Markets.aCVX.RebalancePool.aCVX.pool, "FxUSDShareableRebalancePool/aCVX"],
    [fxusd.Markets.aCVX.RebalancePool.xCVX.pool, "FxUSDShareableRebalancePool/xCVX"],
  ]) {
    await caller.grantRole(pool, name + " WITHDRAW_FROM_ROLE", WITHDRAW_FROM_ROLE, deployment.GatewayRouter);
  }
}

export async function initialize(deployer: HardhatEthersSigner, deployment: GatewayDeployment, overrides?: Overrides) {
  const caller = new ContractCallHelper(deployer, overrides);

  await initializeConcentratorHarvester(caller, deployment);
  await initializeGatewayRouter(caller, deployment);
}

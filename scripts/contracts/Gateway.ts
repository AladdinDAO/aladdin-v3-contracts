/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Interface, Overrides, getAddress } from "ethers";
import { ethers, network } from "hardhat";

import {
  DiamondCutFacet__factory,
  DiamondLoupeFacet__factory,
  FxMarketV1Facet__factory,
  FxUSDFacet__factory,
  IDiamond,
  OwnershipFacet__factory,
  TokenConvertManagementFacet__factory,
} from "@/types/index";

import { DeploymentHelper, contractCall } from "./helpers";
import * as ERC2535 from "./ERC2535";

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
  const facets = await ERC2535.deploy(deployer, overrides);
  const deployment = new DeploymentHelper(network.name, "Gateway", deployer, overrides);
  await deployGatewayRouter(deployment, facets);

  return deployment.toObject() as GatewayDeployment;
}

export async function initialize(deployer: HardhatEthersSigner, deployment: GatewayDeployment, overrides?: Overrides) {
  const manageFacet = await ethers.getContractAt("TokenConvertManagementFacet", deployment.GatewayRouter, deployer);

  const targets = [
    {
      target: "0x1111111254eeb25477b68fb85ed929f73a960582",
      name: "1inch AggregationRouterV5",
    },
    {
      target: "0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57",
      spender: "0x216B4B4Ba9F3e719726886d34a177484278Bfcae",
      name: "Paraswap AugustusSwapper v5",
    },
    {
      target: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
      name: "stETH",
    },
    {
      target: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
      name: "wstETH",
    },
    {
      target: "0xF0d4c12A5768D806021F80a262B4d39d26C58b8D",
      name: "CurveRouter v1.0",
    },
    {
      target: "0xbAFA44EFE7901E04E39Dad13167D089C559c1138",
      name: "frxETH Minter",
    },
    {
      target: "0x4F96fe476e7dcD0404894454927b9885Eb8B57c3",
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
      await contractCall(manageFacet, "GatewayRouter approve " + target.name, "approveTarget", [
        target.target,
        target.spender ?? target.target,
      ]);
    }
  }
}

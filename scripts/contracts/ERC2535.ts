import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { network } from "hardhat";

import { TOKENS, selectDeployments } from "@/utils/index";

import { DeploymentHelper } from "./helpers";
import * as FxStETH from "./FxStETH";

export interface ERC2535Deployment {
  // default facets
  DiamondCutFacet: string;
  DiamondLoupeFacet: string;
  OwnershipFacet: string;

  // gateway facets
  FxMarketV1Facet: string;
  FxUSDFacet: string;
  TokenConvertManagementFacet: string;

  // harvester facets
  ConcentratorHarvesterFacet: string;
  StakeDaoHarvesterFacet: string;
  CLeverAMOHarvesterFacet: string;
}

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<ERC2535Deployment> {
  const fxsteth = selectDeployments(network.name, "Fx.stETH").toObject() as FxStETH.FxStETHDeployment;
  const deployment = new DeploymentHelper(network.name, "ERC2535", deployer, overrides);

  // deploy default facets
  await deployment.contractDeploy("DiamondCutFacet", "DiamondCutFacet implementation", "DiamondCutFacet", []);
  await deployment.contractDeploy("DiamondLoupeFacet", "DiamondLoupeFacet implementation", "DiamondLoupeFacet", []);
  await deployment.contractDeploy("OwnershipFacet", "OwnershipFacet implementation", "OwnershipFacet", []);

  // deploy harvester facets
  await deployment.contractDeploy(
    "ConcentratorHarvesterFacet",
    "ConcentratorHarvesterFacet implementation",
    "ConcentratorHarvesterFacet",
    []
  );
  await deployment.contractDeploy(
    "StakeDaoHarvesterFacet",
    "StakeDaoHarvesterFacet implementation",
    "StakeDaoHarvesterFacet",
    []
  );
  await deployment.contractDeploy(
    "CLeverAMOHarvesterFacet",
    "CLeverAMOHarvesterFacet implementation",
    "CLeverAMOHarvesterFacet",
    []
  );

  // deploy gateway facets
  await deployment.contractDeploy(
    "TokenConvertManagementFacet",
    "TokenConvertManagementFacet implementation",
    "TokenConvertManagementFacet",
    []
  );
  await deployment.contractDeploy("FxMarketV1Facet", "FxMarketV1Facet implementation", "FxMarketV1Facet", [
    fxsteth.Market.proxy,
    TOKENS.stETH.address,
    fxsteth.FractionalToken.proxy,
    fxsteth.LeveragedToken.proxy,
  ]);
  await deployment.contractDeploy("FxUSDFacet", "FxUSDFacet implementation", "FxUSDFacet", []);

  return deployment.toObject() as ERC2535Deployment;
}

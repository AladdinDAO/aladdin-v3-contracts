/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides, Contract } from "ethers";
import { network, ethers } from "hardhat";

import { DEPLOYED_CONTRACTS } from "@/utils/deploys";
import { TOKENS } from "@/utils/tokens";

import { DeploymentHelper, contractCall } from "./helpers";
import { FxBaseDeployment, SaleConfig } from "./FxConfig";

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<FxBaseDeployment> {
  const deployment = new DeploymentHelper(network.name, "Fx.Base", deployer, overrides);

  for (const round of ["TokenSaleBase1", "TokenSaleBase2"]) {
    await deployment.contractDeploy(round, round, "TokenSale", [
      TOKENS.WETH.address,
      TOKENS.fxUSD.address,
      DEPLOYED_CONTRACTS.AladdinZap,
      SaleConfig[round].cap,
    ]);
  }
  return deployment.toObject() as FxBaseDeployment;
}

export async function initialize(deployer: HardhatEthersSigner, deployment: FxBaseDeployment, overrides?: Overrides) {
  // initialize token sale
  for (const round of ["TokenSaleBase1", "TokenSaleBase2"]) {
    const sale = await ethers.getContractAt("TokenSale", (deployment as any)[round], deployer);
    const saleConfig = SaleConfig[round];

    if ((await sale.priceData()).initialPrice !== saleConfig.price.InitialPrice) {
      await contractCall(sale as unknown as Contract, "TokenSale.updatePrice", "updatePrice", [
        saleConfig.price.InitialPrice,
        saleConfig.price.UpRatio,
        saleConfig.price.Variation,
      ]);
    }

    const saleTime = await sale.saleTimeData();
    if (
      saleTime.whitelistSaleTime !== saleConfig.time.WhitelistStartTime ||
      saleTime.publicSaleTime !== saleConfig.time.PublicStartTime ||
      saleTime.saleDuration !== saleConfig.time.SaleDuration
    ) {
      await contractCall(sale as unknown as Contract, "TokenSale.updateSaleTime", "updateSaleTime", [
        saleConfig.time.WhitelistStartTime,
        saleConfig.time.PublicStartTime,
        saleConfig.time.SaleDuration,
      ]);
    }

    const tokens: string[] = [];
    for (const token of saleConfig.tokens) {
      if (!(await sale.isSupported(token))) {
        tokens.push(token);
      }
    }
    if (tokens.length > 0) {
      await contractCall(sale as unknown as Contract, "TokenSale.updateSupportedTokens", "updateSupportedTokens", [
        tokens,
        true,
      ]);
    }
  }
}

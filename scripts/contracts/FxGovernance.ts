/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { network, ethers } from "hardhat";
import { BigNumber, Contract, Overrides, constants } from "ethers";

import { DEPLOYED_CONTRACTS, TOKENS, selectDeployments } from "../utils";
import { contractCall, contractDeploy } from ".";

export interface FxGovernanceDeployment {
  TokenSale1: string;
  TokenSale2: string;
}

const SaleConfig: {
  [round: string]: {
    cap: BigNumber;
    time: { WhitelistStartTime: number; PublicStartTime: number; SaleDuration: number };
    tokens: string[];
    price: {
      InitialPrice: BigNumber;
      UpRatio: BigNumber;
      Variation: BigNumber;
    };
  };
} = {
  TokenSale1: {
    cap: ethers.utils.parseEther("20000"),
    time: { WhitelistStartTime: 1685620800, PublicStartTime: 1685624400, SaleDuration: 86400 * 6 },
    tokens: [constants.AddressZero],
    price: {
      InitialPrice: ethers.utils.parseEther("0.005"),
      UpRatio: constants.Zero,
      Variation: ethers.utils.parseEther("1"),
    },
  },
  TokenSale2: {
    cap: ethers.utils.parseEther("40000"),
    time: { WhitelistStartTime: 1690981200, PublicStartTime: 1691586000, SaleDuration: 0 },
    tokens: [constants.AddressZero],
    price: {
      InitialPrice: ethers.utils.parseEther("0.0075"),
      UpRatio: constants.Zero,
      Variation: ethers.utils.parseEther("1"),
    },
  },
};

export async function deploy(deployer: SignerWithAddress, overrides?: Overrides): Promise<FxGovernanceDeployment> {
  const deployment = selectDeployments(network.name, "Fx.Governance");

  for (const round of ["TokenSale1", "TokenSale2"]) {
    if (!deployment.get(round)) {
      await contractDeploy(deployer, round, "TokenSale", [
        TOKENS.WETH.address,
        TOKENS.WETH.address,
        DEPLOYED_CONTRACTS.AladdinZap,
        SaleConfig[round].cap,
      ]);
    } else {
      console.log(`Found ${round} at:`, deployment.get(round));
    }
  }

  return deployment.toObject() as FxGovernanceDeployment;
}

export async function initialize(deployer: SignerWithAddress, deployment: FxGovernanceDeployment) {
  // initialize token sale
  for (const round of ["TokenSale1", "TokenSale2"]) {
    const sale = await ethers.getContractAt("TokenSale", (deployment as any)[round], deployer);
    const saleConfig = SaleConfig[round];

    if (!(await sale.priceData()).initialPrice.eq(saleConfig.price.InitialPrice)) {
      await contractCall(sale as Contract, "TokenSale.updatePrice", "updatePrice", [
        saleConfig.price.InitialPrice,
        saleConfig.price.UpRatio,
        saleConfig.price.Variation,
      ]);
    }

    const saleTime = await sale.saleTimeData();
    if (
      !saleTime.whitelistSaleTime.eq(saleConfig.time.WhitelistStartTime) ||
      !saleTime.publicSaleTime.eq(saleConfig.time.PublicStartTime) ||
      !saleTime.saleDuration.eq(saleConfig.time.SaleDuration)
    ) {
      await contractCall(sale as Contract, "TokenSale.updateSaleTime", "updateSaleTime", [
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
      await contractCall(sale as Contract, "TokenSale.updateSupportedTokens", "updateSupportedTokens", [tokens, true]);
    }
  }
}

/* eslint-disable node/no-missing-import */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { network, ethers } from "hardhat";

import { DEPLOYED_CONTRACTS, TOKENS, selectDeployments } from "../utils";
import { contractCall, contractDeploy, minimalProxyDeploy, ownerContractCall } from ".";

import * as Multisig from "./Multisig";
import * as VotingEscrow from "./VotingEscrow";
import { ZeroAddress, Overrides, Contract } from "ethers";

export interface FxGovernanceDeployment {
  TokenSale1: string;
  TokenSale2: string;

  FNX: string;
  veFNX: string;
  TokenMinter: string;
  GaugeController: string;
  FeeDistributor: string;

  SmartWalletWhitelist: string;
  PlatformFeeSpliter: string;
  Vesting: string;
}

const SaleConfig: {
  [round: string]: {
    cap: bigint;
    time: { WhitelistStartTime: bigint; PublicStartTime: bigint; SaleDuration: bigint };
    tokens: string[];
    price: {
      InitialPrice: bigint;
      UpRatio: bigint;
      Variation: bigint;
    };
  };
} = {
  TokenSale1: {
    cap: ethers.parseEther("20000"),
    time: { WhitelistStartTime: 1685620800n, PublicStartTime: 1685624400n, SaleDuration: 86400n * 6n },
    tokens: [ZeroAddress],
    price: {
      InitialPrice: ethers.parseEther("0.005"),
      UpRatio: 0n,
      Variation: ethers.parseEther("1"),
    },
  },
  TokenSale2: {
    cap: ethers.parseEther("40000"),
    time: { WhitelistStartTime: 1690981200n, PublicStartTime: 1691586000n, SaleDuration: 0n },
    tokens: [ZeroAddress],
    price: {
      InitialPrice: ethers.parseEther("0.0075"),
      UpRatio: 0n,
      Variation: ethers.parseEther("1"),
    },
  },
};

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<FxGovernanceDeployment> {
  const multisig = Multisig.deploy(network.name);
  const implementationDeployment = await VotingEscrow.deploy(deployer, overrides);
  const deployment = selectDeployments(network.name, "Fx.Governance");

  for (const round of ["TokenSale1", "TokenSale2"]) {
    if (!deployment.get(round)) {
      const address = await contractDeploy(deployer, round, "TokenSale", [
        TOKENS.WETH.address,
        TOKENS.WETH.address,
        DEPLOYED_CONTRACTS.AladdinZap,
        SaleConfig[round].cap,
      ]);
      deployment.set(round, address);
    } else {
      console.log(`Found ${round} at:`, deployment.get(round));
    }
  }

  if (!deployment.get("FNX")) {
    const address = await minimalProxyDeploy(deployer, "FNX", implementationDeployment.GovernanceToken, overrides);
    deployment.set("FNX", address);
  } else {
    console.log(`Found FNX token at:`, deployment.get("FNX"));
  }

  if (!deployment.get("veFNX")) {
    const address = await minimalProxyDeploy(deployer, "veFNX", implementationDeployment.VotingEscrow, overrides);
    deployment.set("veFNX", address);
  } else {
    console.log(`Found veFNX at:`, deployment.get("veFNX"));
  }

  if (!deployment.get("TokenMinter")) {
    const address = await minimalProxyDeploy(deployer, "TokenMinter", implementationDeployment.TokenMinter, overrides);
    deployment.set("TokenMinter", address);
  } else {
    console.log(`Found TokenMinter at:`, deployment.get("TokenMinter"));
  }

  if (!deployment.get("GaugeController")) {
    const address = await minimalProxyDeploy(
      deployer,
      "GaugeController",
      implementationDeployment.GaugeController,
      overrides
    );
    deployment.set("GaugeController", address);
  } else {
    console.log(`Found GaugeController at:`, deployment.get("GaugeController"));
  }

  if (!deployment.get("FeeDistributor")) {
    const address = await minimalProxyDeploy(
      deployer,
      "FeeDistributor",
      implementationDeployment.FeeDistributor,
      overrides
    );
    deployment.set("FeeDistributor", address);
  } else {
    console.log(`Found FeeDistributor at:`, deployment.get("FeeDistributor"));
  }

  if (!deployment.get("SmartWalletWhitelist")) {
    const address = await contractDeploy(deployer, "SmartWalletWhitelist", "SmartWalletWhitelist", [], overrides);
    deployment.set("SmartWalletWhitelist", address);
  } else {
    console.log(`Found SmartWalletWhitelist at:`, deployment.get("SmartWalletWhitelist"));
  }

  if (!deployment.get("Vesting")) {
    const address = await contractDeploy(deployer, "FNX Vesting", "Vesting", [deployment.get("FNX")], overrides);
    deployment.set("Vesting", address);
  } else {
    console.log(`Found FNX Vesting at:`, deployment.get("Vesting"));
  }

  if (!deployment.get("PlatformFeeSpliter")) {
    const address = await contractDeploy(
      deployer,
      "PlatformFeeSpliter",
      "PlatformFeeSpliter",
      [multisig.Fx, multisig.Fx, multisig.Fx],
      overrides
    );
    deployment.set("PlatformFeeSpliter", address);
  } else {
    console.log(`Found PlatformFeeSpliter at:`, deployment.get("PlatformFeeSpliter"));
  }

  return deployment.toObject() as FxGovernanceDeployment;
}

export async function initialize(
  deployer: HardhatEthersSigner,
  deployment: FxGovernanceDeployment,
  overrides?: Overrides
) {
  const multisig = Multisig.deploy(network.name);

  // initialize token sale
  for (const round of ["TokenSale1", "TokenSale2"]) {
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

  const fnx = await ethers.getContractAt("GovernanceToken", deployment.FNX, deployer);
  const ve = await ethers.getContractAt("VotingEscrow", deployment.veFNX, deployer);
  const minter = await ethers.getContractAt("TokenMinter", deployment.TokenMinter, deployer);
  const controller = await ethers.getContractAt("GaugeController", deployment.GaugeController, deployer);
  const distributor = await ethers.getContractAt("FeeDistributor", deployment.FeeDistributor, deployer);
  // const whitelist = await ethers.getContractAt("SmartWalletWhitelist", deployment.SmartWalletWhitelist, deployer);
  // const spliter = await ethers.getContractAt("PlatformFeeSpliter", deployment.PlatformFeeSpliter, deployer);
  // const vesting = await ethers.getContractAt("Vesting", deployment.Vesting, deployer);

  // initialize FNX
  if ((await fnx.name()) === "") {
    await contractCall(
      fnx as unknown as Contract,
      "initialize FNX",
      "initialize",
      [
        ethers.parseEther("1020000"), // initial supply
        ethers.parseEther("98000") / (86400n * 365n), // initial rate, 10%,
        1111111111111111111n, // rate reduction coefficient, 1/0.9 * 1e18,
        deployer.address,
        "FNX Token",
        "FNX",
      ],
      overrides
    );
  }
  // set minter
  if ((await fnx.minter({ gasLimit: 1e6 })) === ZeroAddress) {
    await contractCall(
      fnx as unknown as Contract,
      "initialize minter for FNX",
      "set_minter",
      [deployment.TokenMinter],
      overrides
    );
  }

  // initialize veFNX
  if ((await ve.token({ gasLimit: 1e6 })) === ZeroAddress) {
    await contractCall(
      ve as unknown as Contract,
      "initialize veFNX",
      "initialize",
      [deployer.address, deployment.FNX, "Voting Escrow FNX", "veFNX", "1.0.0"],
      overrides
    );
  }
  // commit smart_wallet_checker
  if (
    (await ve.smart_wallet_checker({ gasLimit: 1e6 })) !== deployment.SmartWalletWhitelist &&
    (await ve.future_smart_wallet_checker({ gasLimit: 1e6 })) !== deployment.SmartWalletWhitelist
  ) {
    await ownerContractCall(
      ve as unknown as Contract,
      "commit smart_wallet_checker",
      "commit_smart_wallet_checker",
      [deployment.SmartWalletWhitelist],
      overrides
    );
  }
  // apply smart_wallet_checker
  if (
    (await ve.smart_wallet_checker({ gasLimit: 1e6 })) !== deployment.SmartWalletWhitelist &&
    (await ve.future_smart_wallet_checker({ gasLimit: 1e6 })) === deployment.SmartWalletWhitelist
  ) {
    await ownerContractCall(
      ve as unknown as Contract,
      "apply smart_wallet_checker",
      "apply_smart_wallet_checker",
      [],
      overrides
    );
  }

  // initialize TokenMinter
  if ((await minter.token({ gasLimit: 1e6 })) === ZeroAddress) {
    await contractCall(
      minter as unknown as Contract,
      "initialize TokenMinter",
      "initialize",
      [deployment.FNX, deployment.GaugeController],
      overrides
    );
  }

  // initialize GaugeController
  if ((await controller.admin({ gasLimit: 1e6 })) === ZeroAddress) {
    await contractCall(
      controller as unknown as Contract,
      "initialize GaugeController",
      "initialize",
      [multisig.Fx, deployment.FNX, deployment.veFNX],
      overrides
    );
  }

  // initialize FeeDistributor
  if ((await distributor.token({ gasLimit: 1e6 })) === ZeroAddress) {
    // @todo
  }

  // setup SmartWalletWhitelist

  // setup PlatformFeeSpliter

  // setup Vesting
}

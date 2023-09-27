/* eslint-disable node/no-missing-import */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ZeroAddress, Overrides, Contract } from "ethers";
import { network, ethers } from "hardhat";

import { DEPLOYED_CONTRACTS, selectDeployments } from "@/utils/deploys";
import { TOKENS } from "@/utils/tokens";

import { contractCall, contractDeploy, minimalProxyDeploy, ownerContractCall } from "./helpers";
import * as Converter from "./Converter";
import * as Multisig from "./Multisig";
import * as VotingEscrow from "./VotingEscrow";

export interface FxGovernanceDeployment {
  TokenSale1: string;
  TokenSale2: string;

  FXN: string;
  veFXN: string;
  TokenMinter: string;
  GaugeController: string;
  FeeDistributor: { [symbol: string]: string };

  SmartWalletWhitelist: string;
  PlatformFeeSpliter: string;
  MultipleVestHelper: string;
  Vesting: { [symbol: string]: string };
  Burner: {
    PlatformFeeBurner: string;
  };
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
  const converter = await Converter.deploy(deployer, overrides);
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

  if (!deployment.get("FXN")) {
    const address = await minimalProxyDeploy(deployer, "FXN", implementationDeployment.GovernanceToken, overrides);
    deployment.set("FXN", address);
  } else {
    console.log(`Found FXN token at:`, deployment.get("FXN"));
  }

  if (!deployment.get("veFXN")) {
    const address = await minimalProxyDeploy(deployer, "veFXN", implementationDeployment.VotingEscrow, overrides);
    deployment.set("veFXN", address);
  } else {
    console.log(`Found veFXN at:`, deployment.get("veFXN"));
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

  for (const token of ["stETH", "wstETH"]) {
    const selector = `FeeDistributor.${token}`;
    if (!deployment.get(selector)) {
      const address = await minimalProxyDeploy(
        deployer,
        `FeeDistributor ${token}`,
        implementationDeployment.FeeDistributor,
        overrides
      );
      deployment.set(selector, address);
    } else {
      console.log(`Found FeeDistributor ${token} at:`, deployment.get(selector));
    }
  }

  if (!deployment.get("SmartWalletWhitelist")) {
    const address = await contractDeploy(deployer, "SmartWalletWhitelist", "SmartWalletWhitelist", [], overrides);
    deployment.set("SmartWalletWhitelist", address);
  } else {
    console.log(`Found SmartWalletWhitelist at:`, deployment.get("SmartWalletWhitelist"));
  }

  if (!deployment.get("MultipleVestHelper")) {
    const address = await contractDeploy(deployer, "FXN MultipleVestHelper", "MultipleVestHelper", [], overrides);
    deployment.set("MultipleVestHelper", address);
  } else {
    console.log(`Found FXN MultipleVestHelper at:`, deployment.get("MultipleVestHelper"));
  }

  for (const token of ["FXN", "fETH"]) {
    const selector = `Vesting.${token}`;
    if (!deployment.get(selector)) {
      const address = await contractDeploy(deployer, `${token} Vesting`, "Vesting", [TOKENS[token].address], overrides);
      deployment.set(selector, address);
    } else {
      console.log(`Found ${token} Vesting at:`, deployment.get(selector));
    }
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

  if (!deployment.get("Burner.PlatformFeeBurner")) {
    const address = await contractDeploy(
      deployer,
      "PlatformFeeBurner",
      "PlatformFeeBurner",
      [converter.GeneralTokenConverter, deployment.get("FeeDistributor.wstETH")],
      overrides
    );
    deployment.set("Burner.PlatformFeeBurner", address);
  } else {
    console.log(`Found PlatformFeeBurner at:`, deployment.get("Burner.PlatformFeeBurner"));
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

  const fxn = await ethers.getContractAt("GovernanceToken", deployment.FXN, deployer);
  const ve = await ethers.getContractAt("VotingEscrow", deployment.veFXN, deployer);
  const minter = await ethers.getContractAt("TokenMinter", deployment.TokenMinter, deployer);
  const controller = await ethers.getContractAt("GaugeController", deployment.GaugeController, deployer);
  const distributor = await ethers.getContractAt("FeeDistributor", deployment.FeeDistributor.wstETH, deployer);
  const whitelist = await ethers.getContractAt("SmartWalletWhitelist", deployment.SmartWalletWhitelist, deployer);
  const fnxVesting = await ethers.getContractAt("Vesting", deployment.Vesting.FXN, deployer);
  const fethVesting = await ethers.getContractAt("Vesting", deployment.Vesting.fETH, deployer);
  const burner = await ethers.getContractAt("PlatformFeeBurner", deployment.Burner.PlatformFeeBurner, deployer);

  // initialize FXN
  if ((await fxn.admin({ gasLimit: 1e6 })) === ZeroAddress) {
    await contractCall(
      fxn as unknown as Contract,
      "initialize FXN",
      "initialize",
      [
        ethers.parseEther("1020000"), // initial supply
        ethers.parseEther("98000") / (86400n * 365n), // initial rate, 10%,
        1111111111111111111n, // rate reduction coefficient, 1/0.9 * 1e18,
        deployer.address,
        "FXN Token",
        "FXN",
      ],
      overrides
    );
  }
  // set minter
  if ((await fxn.minter({ gasLimit: 1e6 })) === ZeroAddress) {
    await contractCall(
      fxn as unknown as Contract,
      "initialize minter for FXN",
      "set_minter",
      [deployment.TokenMinter],
      overrides
    );
  }

  // initialize veFXN
  if ((await ve.token({ gasLimit: 1e6 })) === ZeroAddress) {
    await contractCall(
      ve as unknown as Contract,
      "initialize veFXN",
      "initialize",
      [deployer.address, deployment.FXN, "Voting Escrow FXN", "veFXN", "1.0.0"],
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
      [deployment.FXN, deployment.GaugeController],
      overrides
    );
  }

  // initialize GaugeController
  if ((await controller.admin({ gasLimit: 1e6 })) === ZeroAddress) {
    await contractCall(
      controller as unknown as Contract,
      "initialize GaugeController",
      "initialize",
      [multisig.Fx, deployment.FXN, deployment.veFXN],
      overrides
    );
  }

  // initialize FeeDistributor
  if ((await distributor.start_time({ gasLimit: 1e6 })) === 0n) {
    await contractCall(
      distributor as unknown as Contract,
      "initialize FeeDistributor",
      "initialize",
      [deployment.veFXN, 1695859200n, TOKENS.wstETH.address, deployer.address, multisig.Fx],
      overrides
    );
  }
  if (!(await distributor.can_checkpoint_token())) {
    await ownerContractCall(
      distributor as unknown as Contract,
      "FeeDistributor allow checkpoint ",
      "toggle_allow_checkpoint_token",
      [],
      overrides
    );
  }

  // setup SmartWalletWhitelist
  for (const address of [multisig.AladdinDAO]) {
    if (!(await whitelist.wallets(address))) {
      await ownerContractCall(
        whitelist as unknown as Contract,
        `SmartWalletWhitelist approve ${address}`,
        "approveWallet",
        [address],
        overrides
      );
    }
  }

  for (const vesting of [fnxVesting, fethVesting]) {
    // setup Vesting
    const whitelists = [];
    for (const address of [multisig.Fx, deployment.MultipleVestHelper]) {
      if (!(await vesting.isWhitelist(address))) {
        whitelists.push(address);
      }
    }
    if (whitelists.length > 0) {
      await ownerContractCall(
        vesting as unknown as Contract,
        `Vesting add whitelist [${whitelists.join(",")}]`,
        "updateWhitelist",
        [whitelists, true],
        overrides
      );
    }
  }

  // setup PlatformFeeBurner
  if (!(await burner.isKeeper("0x11E91BB6d1334585AA37D8F4fde3932C7960B938"))) {
    await ownerContractCall(
      burner as unknown as Contract,
      "PlatformFeeBurner add keeper",
      "updateKeeperStatus",
      ["0x11E91BB6d1334585AA37D8F4fde3932C7960B938", true],
      overrides
    );
  }
}

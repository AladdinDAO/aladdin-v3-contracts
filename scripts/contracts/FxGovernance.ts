/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ZeroAddress, Overrides, Contract, MaxUint256, ZeroHash } from "ethers";
import { network, ethers } from "hardhat";

import { GaugeController, SharedLiquidityGauge__factory } from "@/types/index";
import { DEPLOYED_CONTRACTS } from "@/utils/deploys";
import { TOKENS } from "@/utils/tokens";

import { DeploymentHelper, contractCall, ownerContractCall } from "./helpers";
import * as Converter from "./Converter";
import * as Multisig from "./Multisig";
import * as ProxyAdmin from "./ProxyAdmin";
import * as VotingEscrow from "./VotingEscrow";

const DeployedGauges: {
  [name: string]: {
    token: string;
    rewarder?: string;
    immutable: boolean;
    harvesterRatio: bigint;
    managerRatio: bigint;
  };
} = {
  "ETH+FXN": {
    token: TOKENS["CURVE_CRYPTO_ETH/FXN_311"].address,
    rewarder: "0x2b732f0Eee9e1b4329C25Cbb8bdC0dc3bC1448E2",
    immutable: true,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "FXN+cvxFXN": {
    token: TOKENS["CURVE_PLAIN_FXN/cvxFXN_358"].address,
    rewarder: "0x19A0117a5bE27e4D3059Be13FB069eB8f1646d86",
    immutable: true,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "FXN+sdFXN": {
    token: TOKENS["CURVE_PLAIN_FXN/sdFXN_359"].address,
    rewarder: "0x883D7AB9078970b0204c50B56e1c3F72AB5544f9",
    immutable: true,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "crvUSD+fxUSD": {
    token: TOKENS["CURVE_STABLE_NG_crvUSD/fxUSD_106"].address,
    rewarder: "0x65C57A4bbCb1A0E23A2ed8cAfbA5BA6133C8DaC8",
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "PYUSD+fxUSD": {
    token: TOKENS["CURVE_STABLE_NG_PYUSD/fxUSD_107"].address,
    rewarder: "0x18DB87dEE953BA34eb839739Cd6E2F2d01eEa471",
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "DOLA+fxUSD": {
    token: TOKENS["CURVE_STABLE_NG_DOLA/fxUSD_108"].address,
    rewarder: "0x2ef1dA0368470B2603BAb392932E70205eEb9046",
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "GRAI+fxUSD": {
    token: TOKENS["CURVE_STABLE_NG_GRAI/fxUSD_109"].address,
    rewarder: "0x2F7473369B5d21418B10543823a6a38BcE529908",
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "FRAX+fxUSD": {
    token: TOKENS["CURVE_STABLE_NG_FRAX/fxUSD_110"].address,
    rewarder: "0xfbb02DFA57C2eA0E6F5F2c260957d8656ab7A94a",
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "GHO+fxUSD": {
    token: TOKENS["CURVE_STABLE_NG_GHO/fxUSD_111"].address,
    rewarder: "0x77e69Dc146C6044b996ad5c93D88D104Ee13F186",
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "mkUSD+fxUSD": {
    token: TOKENS["CURVE_STABLE_NG_mkUSD/fxUSD_115"].address,
    rewarder: "0x99C9dd0a99A3e05997Ae9a2AB469a4e414C9d8fb",
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "ULTRA+fxUSD": {
    token: TOKENS["CURVE_STABLE_NG_ULTRA/fxUSD_116"].address,
    rewarder: "0x9A0E529223a9c2fCD27aB4894F086eb97Ea4477A",
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
};

const GaugeTypeLists: Array<{ name: string; weight: bigint }> = [
  { name: "Liquidity", weight: ethers.parseEther("1") },
  { name: "Rebalance Pool", weight: ethers.parseEther("1") },
  { name: "Fundraising", weight: ethers.parseEther("1") },
];

export interface FxGovernanceDeployment {
  TokenSale1: string;
  TokenSale2: string;

  FXN: string;
  veFXN: string;
  VotingEscrowBoost: string;
  VotingEscrowHelper: string;
  VotingEscrowProxy: string;
  TokenMinter: string;
  GaugeController: string;
  GaugeControllerOwner: string;
  LiquidityGauge: {
    implementation: {
      LiquidityGauge: string;
      DelegatedLiquidityGauge: string;
      SharedLiquidityGauge: string;
      ConvexCurveManager: string;
    };
    ConvexDualFarm: {
      [token: string]: {
        gauge: string;
        manager: string;
      };
    };
  };
  FundraiseGauge: {
    implementation: {
      FundraisingGaugeFx: string;
    };
    Gauge: {
      FxTreasury: string;
    };
  };
  FeeDistributor: { [symbol: string]: string };

  SmartWalletWhitelist: string;
  PlatformFeeSpliter: string;
  MultipleVestHelper: string;
  Vesting: { [symbol: string]: string };
  ManageableVesting: {
    vesting: { [symbol: string]: string };
    manager: {
      CvxFxnVestingManager: string;
      SdFxnVestingManager: string;
    };
  };
  Burner: {
    PlatformFeeBurner: string;
  };
  ReservePool: string;
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
  const admin = await ProxyAdmin.deploy(deployer);
  const converter = await Converter.deploy(deployer, overrides);
  const implementationDeployment = await VotingEscrow.deploy(deployer, overrides);
  const deployment = new DeploymentHelper(network.name, "Fx.Governance", deployer, overrides);

  for (const round of ["TokenSale1", "TokenSale2"]) {
    await deployment.contractDeploy(round, round, "TokenSale", [
      TOKENS.WETH.address,
      TOKENS.WETH.address,
      DEPLOYED_CONTRACTS.AladdinZap,
      SaleConfig[round].cap,
    ]);
  }

  // Token related contracts
  await deployment.minimalProxyDeploy("FXN", "FXN", implementationDeployment.GovernanceToken);
  await deployment.minimalProxyDeploy("TokenMinter", "TokenMinter", implementationDeployment.TokenMinter);

  // VotingEscrow related contracts
  await deployment.minimalProxyDeploy("veFXN", "veFXN", implementationDeployment.VotingEscrow);
  await deployment.contractDeploy("SmartWalletWhitelist", "SmartWalletWhitelist", "SmartWalletWhitelist", []);
  await deployment.contractDeploy("VotingEscrowHelper", "VotingEscrowHelper", "VotingEscrowHelper", [
    deployment.get("veFXN"),
  ]);
  await deployment.contractDeploy("VotingEscrowBoost", "VotingEscrowBoost", "VotingEscrowBoost", [
    deployment.get("veFXN"),
  ]);
  await deployment.contractDeploy("VotingEscrowProxy", "VotingEscrowProxy", "VotingEscrowProxy", [
    deployment.get("veFXN"),
  ]);

  // GaugeController
  await deployment.minimalProxyDeploy("GaugeController", "GaugeController", implementationDeployment.GaugeController);
  // GaugeControllerOwner
  await deployment.contractDeploy("GaugeControllerOwner", "GaugeControllerOwner", "GaugeControllerOwner", [
    deployment.get("GaugeController"),
  ]);

  // LiquidityGauge related contracts
  await deployment.contractDeploy(
    "LiquidityGauge.implementation.SharedLiquidityGauge",
    "SharedLiquidityGauge implementation",
    "SharedLiquidityGauge",
    [deployment.get("TokenMinter"), deployment.get("VotingEscrowProxy")]
  );
  await deployment.contractDeploy(
    "LiquidityGauge.implementation.ConvexCurveManager",
    "ConvexCurveManager implementation",
    "ConvexCurveManager",
    []
  );
  for (const name of [
    "ETH+FXN",
    "FXN+cvxFXN",
    "FXN+sdFXN",
    "crvUSD+fxUSD",
    "PYUSD+fxUSD",
    "DOLA+fxUSD",
    "GRAI+fxUSD",
    "FRAX+fxUSD",
    "GHO+fxUSD",
    "mkUSD+fxUSD",
    "ULTRA+fxUSD",
  ]) {
    await deployment.proxyDeploy(
      "LiquidityGauge.ConvexDualFarm." + name + ".gauge",
      `SharedLiquidityGauge of ${name}`,
      deployment.get("LiquidityGauge.implementation.SharedLiquidityGauge"),
      admin.Fx,
      SharedLiquidityGauge__factory.createInterface().encodeFunctionData("initialize", [DeployedGauges[name].token])
    );
    if (DeployedGauges[name].rewarder) {
      if (DeployedGauges[name].immutable) {
        await deployment.contractDeploy(
          "LiquidityGauge.ConvexDualFarm." + name + ".manager",
          `ConvexCurveManagerImmutable of ${name}`,
          "ConvexCurveManagerImmutable",
          [
            deployment.get("LiquidityGauge.ConvexDualFarm." + name + ".gauge"),
            DeployedGauges[name].token,
            DeployedGauges[name].rewarder,
          ]
        );
      } else {
        await deployment.minimalProxyDeploy(
          "LiquidityGauge.ConvexDualFarm." + name + ".manager",
          `ConvexCurveManager of ${name}`,
          deployment.get("LiquidityGauge.implementation.ConvexCurveManager")
        );
      }
    }
  }
  // Fundraising related contracts
  await deployment.contractDeploy(
    "FundraiseGauge.implementation.FundraisingGaugeFx",
    "FundraisingGaugeFx implementation",
    "FundraisingGaugeFx",
    [multisig.Fx]
  );
  await deployment.minimalProxyDeploy(
    "FundraiseGauge.Gauge.FxTreasury",
    "FundraisingGaugeFx for FxTreasury",
    deployment.get("FundraiseGauge.implementation.FundraisingGaugeFx")
  );

  // Vesting related contracts
  await deployment.contractDeploy("MultipleVestHelper", "FXN MultipleVestHelper", "MultipleVestHelper", []);

  for (const token of ["FXN", "fETH"]) {
    await deployment.contractDeploy(`Vesting.${token}`, `${token} Vesting`, "Vesting", [TOKENS[token].address]);
  }

  for (const token of ["FXN"]) {
    await deployment.contractDeploy(
      `ManageableVesting.vesting.${token}`,
      `${token} ManageableVesting`,
      "ManageableVesting",
      [TOKENS[token].address]
    );
  }

  await deployment.contractDeploy(
    "ManageableVesting.manager.CvxFxnVestingManager",
    "CvxFxnVestingManager",
    "CvxFxnVestingManager",
    []
  );

  await deployment.contractDeploy(
    "ManageableVesting.manager.SdFxnVestingManager",
    "SdFxnVestingManager",
    "SdFxnVestingManager",
    []
  );

  // Revenue Sharing related contracts
  for (const token of ["stETH", "wstETH"]) {
    await deployment.minimalProxyDeploy(
      `FeeDistributor.${token}`,
      `FeeDistributor for ${token}`,
      implementationDeployment.FeeDistributor
    );
  }
  await deployment.contractDeploy("PlatformFeeSpliter", "PlatformFeeSpliter", "PlatformFeeSpliter", [
    multisig.Fx,
    multisig.Fx,
    multisig.Fx,
  ]);
  await deployment.contractDeploy("Burner.PlatformFeeBurner", "PlatformFeeBurner for wstETH", "PlatformFeeBurner", [
    converter.GeneralTokenConverter,
    deployment.get("FeeDistributor.wstETH"),
  ]);
  await deployment.contractDeploy("ReservePool", "ReservePoolV2", "ReservePoolV2", []);

  return deployment.toObject() as FxGovernanceDeployment;
}

export async function addGauge(
  controller: GaugeController,
  name: string,
  address: string,
  type: number,
  overrides?: Overrides
) {
  try {
    await controller.gauge_types(address, { gasLimit: 1e6 });
  } catch {
    await ownerContractCall(
      controller,
      "GaugeController add gauge: " + name,
      "0x3a04f900", // keccack("add_gauge(address,int128)")
      [address, type],
      overrides
    );
  }
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
  const veProxy = await ethers.getContractAt("VotingEscrowProxy", deployment.VotingEscrowProxy, deployer);
  const minter = await ethers.getContractAt("TokenMinter", deployment.TokenMinter, deployer);
  const controller = await ethers.getContractAt("GaugeController", deployment.GaugeController, deployer);
  const distributor = await ethers.getContractAt("FeeDistributor", deployment.FeeDistributor.wstETH, deployer);
  const whitelist = await ethers.getContractAt("SmartWalletWhitelist", deployment.SmartWalletWhitelist, deployer);
  const fnxVesting = await ethers.getContractAt("Vesting", deployment.Vesting.FXN, deployer);
  const fethVesting = await ethers.getContractAt("Vesting", deployment.Vesting.fETH, deployer);
  const burner = await ethers.getContractAt("PlatformFeeBurner", deployment.Burner.PlatformFeeBurner, deployer);
  const platformFeeSpliter = await ethers.getContractAt("PlatformFeeSpliter", deployment.PlatformFeeSpliter, deployer);
  const fnxManageableVesting = await ethers.getContractAt(
    "ManageableVesting",
    deployment.ManageableVesting.vesting.FXN,
    deployer
  );

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

  // setuo VotingEscrowProxy
  if ((await veProxy.veBoost()) !== deployment.VotingEscrowBoost) {
    await ownerContractCall(
      veProxy,
      "VotingEscrowProxy updateVeBoost",
      "updateVeBoost",
      [deployment.VotingEscrowBoost],
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

  // add CvxFxnVestingManager
  try {
    const manager = await fnxManageableVesting.managers(1);
    if (manager !== deployment.ManageableVesting.manager.CvxFxnVestingManager) {
      await ownerContractCall(
        fnxManageableVesting as unknown as Contract,
        "update CvxFxnVestingManager",
        "updateVestingManager",
        [1, deployment.ManageableVesting.manager.CvxFxnVestingManager]
      );
    }
  } catch {
    await ownerContractCall(
      fnxManageableVesting as unknown as Contract,
      "add CvxFxnVestingManager",
      "addVestingManager",
      [deployment.ManageableVesting.manager.CvxFxnVestingManager]
    );
  }

  // add SdFxnVestingManager
  try {
    const manager = await fnxManageableVesting.managers(2);
    if (manager !== deployment.ManageableVesting.manager.SdFxnVestingManager) {
      await ownerContractCall(
        fnxManageableVesting as unknown as Contract,
        "update SdFxnVestingManager",
        "updateVestingManager",
        [2, deployment.ManageableVesting.manager.SdFxnVestingManager]
      );
    }
  } catch {
    await ownerContractCall(
      fnxManageableVesting as unknown as Contract,
      "add SdFxnVestingManager",
      "addVestingManager",
      [deployment.ManageableVesting.manager.SdFxnVestingManager]
    );
  }

  // Setup GaugeController
  for (let i = 0; i < GaugeTypeLists.length; i++) {
    if ((await controller.gauge_type_names(i)) !== GaugeTypeLists[i].name) {
      await ownerContractCall(
        controller,
        "GaugeController add type: " + GaugeTypeLists[i].name,
        "0x92d0d232", // keccack("add_type(string)")
        [GaugeTypeLists[i].name, GaugeTypeLists[i].weight],
        overrides
      );
    }
  }
  // Setup LiquidityGauge
  for (const name of [
    "ETH+FXN",
    "FXN+cvxFXN",
    "FXN+sdFXN",
    "crvUSD+fxUSD",
    "PYUSD+fxUSD",
    "DOLA+fxUSD",
    "GRAI+fxUSD",
    "FRAX+fxUSD",
    "GHO+fxUSD",
    "mkUSD+fxUSD",
    "ULTRA+fxUSD",
  ]) {
    const gauge = await ethers.getContractAt(
      "SharedLiquidityGauge",
      deployment.LiquidityGauge.ConvexDualFarm[name].gauge,
      deployer
    );
    if ((await gauge.stakingToken()) === ZeroAddress) {
      await contractCall(
        gauge,
        `SharedLiquidityGauge for ${name} initialize`,
        "initialize",
        [DeployedGauges[name].token],
        overrides
      );
    }

    if (DeployedGauges[name].rewarder) {
      const manager = await ethers.getContractAt(
        "ConvexCurveManager",
        deployment.LiquidityGauge.ConvexDualFarm[name].manager,
        deployer
      );
      if (!DeployedGauges[name].immutable && (await manager.token()) === ZeroAddress) {
        // do initialize
        await contractCall(
          manager,
          `ConvexCurveManager of ${name} initialize`,
          "initialize",
          [
            deployment.LiquidityGauge.ConvexDualFarm[name].gauge,
            DeployedGauges[name].token,
            DeployedGauges[name].rewarder,
          ],
          overrides
        );
      }
      if ((await manager.getHarvesterRatio()) !== DeployedGauges[name].harvesterRatio) {
        await ownerContractCall(
          manager,
          `ConvexCurveManager for ${name} updateHarvesterRatio`,
          "updateHarvesterRatio",
          [DeployedGauges[name].harvesterRatio],
          overrides
        );
      }
      if ((await manager.getManagerRatio()) !== DeployedGauges[name].managerRatio) {
        await ownerContractCall(
          manager,
          `ConvexCurveManager for ${name} updateManagerRatio`,
          "updateManagerRatio",
          [DeployedGauges[name].managerRatio],
          overrides
        );
      }
      if ((await gauge.manager()) === ZeroAddress) {
        await ownerContractCall(
          gauge,
          `SharedLiquidityGauge for ${name} updateLiquidityManager`,
          "updateLiquidityManager",
          [await manager.getAddress()],
          overrides
        );
      }
      const REWARD_MANAGER_ROLE = await gauge.REWARD_MANAGER_ROLE();
      if (
        (await gauge.hasRole(ZeroHash, deployer.address)) &&
        !(await gauge.hasRole(REWARD_MANAGER_ROLE, deployer.address))
      ) {
        await ownerContractCall(
          gauge,
          `SharedLiquidityGauge for ${name} grant REWARD_MANAGER_ROLE`,
          "grantRole",
          [REWARD_MANAGER_ROLE, deployer.address],
          overrides
        );
      }
      for (const token of ["CRV", "CVX"]) {
        if ((await gauge.distributors(TOKENS[token].address)) === ZeroAddress) {
          await ownerContractCall(
            gauge,
            `SharedLiquidityGauge for ${name} add extra reward ${token}`,
            "registerRewardToken",
            [TOKENS[token].address, await manager.getAddress()],
            overrides
          );
        }
      }
    }
    await addGauge(controller, name, await gauge.getAddress(), 0);
  }
  // Setup FundraisingGauge
  {
    const gauge = await ethers.getContractAt(
      "FundraisingGaugeFx",
      deployment.FundraiseGauge.Gauge.FxTreasury,
      deployer
    );
    if ((await gauge.receiver()) !== multisig.Fx) {
      await contractCall(
        gauge,
        `FundraisingGaugeFx for FxTreasury initialize`,
        "initialize",
        [multisig.Fx, MaxUint256],
        overrides
      );
    }
    await addGauge(controller, "FundraisingGaugeFx.FxTreasury", await gauge.getAddress(), 2);
  }

  // Setup PlatformFeeSpliter
  if ((await platformFeeSpliter.treasury()) !== deployment.ReservePool) {
    await ownerContractCall(
      platformFeeSpliter,
      "PlatformFeeSpliter set ReservePool as Treasury",
      "updateTreasury",
      [deployment.ReservePool],
      overrides
    );
  }
  if ((await platformFeeSpliter.staker()) !== "0x11E91BB6d1334585AA37D8F4fde3932C7960B938") {
    await ownerContractCall(
      platformFeeSpliter,
      "PlatformFeeSpliter set keeper as staker",
      "updateStaker",
      ["0x11E91BB6d1334585AA37D8F4fde3932C7960B938"],
      overrides
    );
  }
}

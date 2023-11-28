/* eslint-disable node/no-missing-import */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ZeroAddress, Overrides, Contract } from "ethers";
import { network, ethers } from "hardhat";

import { GaugeController } from "@/types/index";
import { DEPLOYED_CONTRACTS } from "@/utils/deploys";
import { TOKENS } from "@/utils/tokens";

import { DeploymentHelper, contractCall, ownerContractCall } from "./helpers";
import * as Converter from "./Converter";
import * as Multisig from "./Multisig";
import * as VotingEscrow from "./VotingEscrow";

/*
const DeployedGauges: { [name: string]: { token: string; rewarder: string; immutable: boolean } } = {
  "ETH+xETH": {
    token: TOKENS["CURVE_CRYPTO_ETH/xETH_302"].address,
    rewarder: "0x0831c171938033d0C5218B509502E2d95AC10cAb",
    immutable: false,
  },
  "ETH+FXN": {
    token: TOKENS["CURVE_CRYPTO_ETH/FXN_311"].address,
    rewarder: "0x2b732f0Eee9e1b4329C25Cbb8bdC0dc3bC1448E2",
    immutable: false,
  },
  "crvUSD+fETH": {
    token: TOKENS["CURVE_CRYPTO_crvUSD/fETH_299"].address,
    rewarder: "0xFcef86a917fb2D0AB39D60e111a3763927Db485d",
    immutable: true,
  },
  "fETH+FRAXBP": {
    token: TOKENS["CURVE_CRYPTO_fETH/FRAXBP_301"].address,
    rewarder: "0x2267b760Ce858617ff1Ef8E7c598397093c276bD",
    immutable: true,
  },
};

const GaugeTypeLists: Array<{ name: string; weight: bigint }> = [
  { name: "Liquidity", weight: ethers.parseEther("0.3") },
  { name: "Rebalance Pool", weight: ethers.parseEther("0.2") },
  { name: "Fundraising", weight: ethers.parseEther("0.1") },
  { name: "Rebalance Pool (fETH)", weight: ethers.parseEther("0.25") },
  { name: "Rebalance Pool (fBTC)", weight: ethers.parseEther("0.15") },
];
*/

export interface FxGovernanceDeployment {
  TokenSale1: string;
  TokenSale2: string;

  FXN: string;
  veFXN: string;
  VotingEscrowBoost: string;
  VotingEscrowProxy: string;
  TokenMinter: string;
  GaugeController: string;
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
  /*
  await deployment.contractDeploy("VotingEscrowBoost", "VotingEscrowBoost", "VotingEscrowBoost", [
    deployment.get("veFXN"),
  ]);
  await deployment.contractDeploy("VotingEscrowProxy", "VotingEscrowProxy", "VotingEscrowProxy", [
    deployment.get("veFXN"),
  ]);
  */

  // GaugeController
  await deployment.minimalProxyDeploy("GaugeController", "GaugeController", implementationDeployment.GaugeController);

  /*
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
  for (const name of ["ETH+xETH", "ETH+FXN", "crvUSD+fETH", "fETH+FRAXBP"]) {
    await deployment.minimalProxyDeploy(
      "LiquidityGauge.ConvexDualFarm." + name + ".gauge",
      `SharedLiquidityGauge of ${name}`,
      deployment.get("LiquidityGauge.implementation.SharedLiquidityGauge")
    );
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
  */

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
  const minter = await ethers.getContractAt("TokenMinter", deployment.TokenMinter, deployer);
  const controller = await ethers.getContractAt("GaugeController", deployment.GaugeController, deployer);
  const distributor = await ethers.getContractAt("FeeDistributor", deployment.FeeDistributor.wstETH, deployer);
  const whitelist = await ethers.getContractAt("SmartWalletWhitelist", deployment.SmartWalletWhitelist, deployer);
  const fnxVesting = await ethers.getContractAt("Vesting", deployment.Vesting.FXN, deployer);
  const fethVesting = await ethers.getContractAt("Vesting", deployment.Vesting.fETH, deployer);
  const burner = await ethers.getContractAt("PlatformFeeBurner", deployment.Burner.PlatformFeeBurner, deployer);
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

  /*
  // Setup GaugeController
  for (let i = 0; i < GaugeTypeLists.length; i++) {
    if ((await controller.gauge_type_names(i)) !== "Liquidity") {
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
  for (const name of ["ETH+xETH", "ETH+FXN", "crvUSD+fETH", "fETH+FRAXBP"]) {
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
        [await manager.token()],
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
    if (!(await gauge.hasRole(REWARD_MANAGER_ROLE, deployer.address))) {
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
  */
}

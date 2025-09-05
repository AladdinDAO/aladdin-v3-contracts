/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ZeroAddress, Overrides, Contract, MaxUint256, ZeroHash } from "ethers";
import { network, ethers } from "hardhat";

import { GaugeController, LiquidityGauge__factory, SharedLiquidityGauge__factory } from "@/types/index";
import { DEPLOYED_CONTRACTS, selectDeployments } from "@/utils/deploys";
import { TOKENS } from "@/utils/tokens";

import { DeploymentHelper, contractCall, ownerContractCall } from "./helpers";
import { ConverterDeployment } from "./Converter";
import { DeployedGauges, FxGovernanceDeployment, GaugeTypeLists, SaleConfig } from "./FxConfig";
import { ProxyAdminDeployment } from "./ProxyAdmin";
import { MultisigDeployment } from "./Multisig";
import { VotingEscrowDeployment } from "./VotingEscrow";

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<FxGovernanceDeployment> {
  const multisig = selectDeployments(network.name, "Multisig").toObject() as MultisigDeployment;
  const admin = selectDeployments(network.name, "ProxyAdmin").toObject() as ProxyAdminDeployment;
  const converter = selectDeployments(network.name, "Converter").toObject() as ConverterDeployment;
  const implementationDeployment = selectDeployments(network.name, "VotingEscrow").toObject() as VotingEscrowDeployment;
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
  await deployment.contractDeploy("FeeDistributorAdmin", "FeeDistributorAdmin", "FeeDistributorAdmin", []);

  // GaugeController
  await deployment.minimalProxyDeploy("GaugeController", "GaugeController", implementationDeployment.GaugeController);
  // GaugeControllerOwner
  await deployment.contractDeploy("GaugeControllerOwner", "GaugeControllerOwner", "GaugeControllerOwner", [
    deployment.get("GaugeController"),
  ]);

  // LiquidityGauge related contracts
  await deployment.contractDeploy(
    "LiquidityGauge.implementation.LiquidityGauge",
    "LiquidityGauge implementation",
    "LiquidityGauge",
    [deployment.get("TokenMinter")]
  );
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

  for (const name of ["uniBTC"]) {
    await deployment.proxyDeploy(
      "LiquidityGauge.StakingGauge." + name,
      `LiquidityGauge of ${name}`,
      deployment.get("LiquidityGauge.implementation.LiquidityGauge"),
      admin.Fx,
      LiquidityGauge__factory.createInterface().encodeFunctionData("initialize", [TOKENS[name].address])
    );
  }

  for (const name of ["fxUSD+USDC+USDaf+BOLD"]) {
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

  for (const token of ["FXN", "fETH", "fxUSD"]) {
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
  const multisig = selectDeployments(network.name, "Multisig").toObject() as MultisigDeployment;
  const converter = selectDeployments(network.name, "Converter").toObject() as ConverterDeployment;

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
  if ((await burner.converter()) !== converter.GeneralTokenConverter) {
    await ownerContractCall(
      burner,
      "PlatformFeeBurner updateConverter",
      "updateConverter",
      [converter.GeneralTokenConverter],
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
  for (const name of ["fxUSD+USDC+USDaf+BOLD"]) {
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

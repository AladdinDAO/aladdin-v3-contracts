/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, constants, Contract } from "ethers";
import { ethers } from "hardhat";
import {
  AladdinETH,
  AutoCompoundingConvexFraxStrategy,
  AutoCompoundingConvexCurveStrategy,
  ConcentratorStrategyFactory,
  UpgradeableBeacon,
  ConcentratorAladdinETHVault,
  ConcentratorAladdinETHVault__factory,
  ConcentratorGeneralVault,
  AladdinCVX,
  AMOConvexCurveStrategy,
} from "../typechain";
import { ADDRESS, DEPLOYED_CONTRACTS, DEPLOYED_VAULTS, TOKENS, AVAILABLE_VAULTS } from "./utils";

interface IConcentratorInterface {
  ratio: {
    platform: number;
    harvest: number;
    withdraw: number;
  };
  underlying: string;
  name: string;
  symbol: string;
  rewards: string[];
  strategy: string;
  compounder: string;
  vault: string;
}

interface ICLeverAMOInterface {
  initialRatio: BigNumber;
  AMORatio: {
    min: BigNumber;
    max: BigNumber;
  };
  LPRatio: {
    min: BigNumber;
    max: BigNumber;
  };
  strategy: string;
  amo: {
    proxy: string;
    impl: string;
  };
  gauge: string;
}

const config: {
  Strategy: {
    factory: string;
    impls: { [name: string]: string };
  };
  UpgradeableBeacon: { [contract: string]: { impl: string; beacon: string } };
  ConcentratorETHInConvexCurve: { [name: string]: IConcentratorInterface };
  ConcentratorETHInConvexFrax: { [name: string]: IConcentratorInterface };
  ConcentratorCRV: IConcentratorInterface;
  ConcentratorFXS: IConcentratorInterface;
  abcCVX: ICLeverAMOInterface;
} = {
  Strategy: {
    factory: "0x23384DD4380b3677b829C6c88c0Ea9cc41C099bb",
    impls: {
      AutoCompoundingConvexFraxStrategy: "0x6Cc546cE582b0dD106c231181f7782C79Ef401da",
      AutoCompoundingConvexCurveStrategy: constants.AddressZero,
      ManualCompoundingConvexCurveStrategy: "0xE25f0E29060AeC19a0559A2EF8366a5AF086222e",
      CLeverGaugeStrategy: constants.AddressZero,
      AMOConvexCurveStrategy: "0x2be5B652836C630E15c3530bf642b544ae901239",
    },
  },
  UpgradeableBeacon: {
    AladdinETH: {
      impl: "0x7f6Ce8b08BcA036c60F71693cD9425614Ab8f9BE",
      beacon: "0xC999894424b281cE8602B50DF5F2D57F91e852f7",
    },
    ConcentratorAladdinETHVault: {
      impl: "0x06dFAf0E53ce24d43eaC332BbDC07b690894DF74",
      beacon: "0x7D6c00032cAbc699b908ECE34097ff1A159da998",
    },
  },
  ConcentratorETHInConvexCurve: {
    steth: {
      ratio: {
        platform: 10e7, // 10%
        harvest: 1e7, // 1%
        withdraw: 0.25e7, // 0.25%
      },
      underlying: "steth",
      name: "Aladdin steCRV",
      symbol: "astETH",
      rewards: ["CVX", "CRV", "LDO"],
      strategy: constants.AddressZero,
      compounder: constants.AddressZero,
      vault: constants.AddressZero,
    },
  },
  ConcentratorETHInConvexFrax: {
    frxeth: {
      ratio: {
        platform: 10e7, // 10%
        harvest: 1e7, // 1%
        withdraw: 0.25e7, // 0.25%
      },
      underlying: "frxeth",
      name: "AladdinETH: ETH/frxETH",
      symbol: "afrxETH",
      rewards: ["CVX", "CRV"],
      strategy: "0xc9cfD6205914AB1E209FfE70326d8dd15fc58187",
      compounder: "0xb15Ad6113264094Fd9BF2238729410A07EBE5ABa",
      vault: "0x50B47c4A642231dbe0B411a0B2FBC1EBD129346D",
    },
  },
  ConcentratorCRV: {
    ratio: {
      platform: 25000000, // 2.5%
      harvest: 25000000, // 2.5%
      withdraw: 2500000, // 0.25%
    },
    underlying: "cvxcrv",
    name: "Aladdin cvxCRV",
    symbol: "aCRV",
    rewards: ["CVX", "CRV", "TRICRV"],
    strategy: "",
    compounder: "0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884",
    vault: "0x3Cf54F3A1969be9916DAD548f3C084331C4450b5",
  },
  ConcentratorFXS: {
    ratio: {
      platform: 25000000, // 2.5%
      harvest: 25000000, // 2.5%
      withdraw: 2500000, // 0.25%
    },
    underlying: "cvxfxs",
    name: "Aladdin cvxFXS/FXS",
    symbol: "aFXS",
    rewards: ["FXS", "CVX", "CRV"],
    strategy: "",
    compounder: "0xDAF03D70Fe637b91bA6E521A32E1Fb39256d3EC9",
    vault: "0xD6E3BB7b1D6Fa75A71d48CFB10096d59ABbf99E1",
  },
  abcCVX: {
    initialRatio: ethers.utils.parseUnits("99", 10),
    AMORatio: {
      min: ethers.utils.parseUnits("0.1", 10),
      max: ethers.utils.parseUnits("0.5", 10),
    },
    LPRatio: {
      min: ethers.utils.parseUnits("1", 10),
      max: ethers.utils.parseUnits("99", 10),
    },
    strategy: "0x29E56d5E68b4819FC4a997b91fc9F4f8818ef1B4",
    amo: {
      proxy: "0xDEC800C2b17c9673570FDF54450dc1bd79c8E359",
      impl: "0x07d9d83df553c013e767872af8da75d84e1368f9",
    },
    gauge: constants.AddressZero,
  },
};

const maxFeePerGas = 30e9;
const maxPriorityFeePerGas = 1.2e9;

let aladdinETHBeacon: UpgradeableBeacon;
let concentratorAladdinETHVaultBeacon: UpgradeableBeacon;
let factory: ConcentratorStrategyFactory;

async function addVaults(
  deployer: SignerWithAddress,
  compounderName: string,
  pools: {
    name: string;
    strategy: string;
    fees: {
      withdraw: number;
      harvest: number;
      platform: number;
    };
  }[],
  vault: ConcentratorGeneralVault
) {
  const startIndex = (await vault.poolLength()).toNumber();
  for (let pid = startIndex; pid < pools.length; ++pid) {
    const pool = pools[pid];
    const vaultConfig = AVAILABLE_VAULTS[pool.name];
    const strategyName = `ManualCompounding${pool.strategy}Strategy`;

    // deploy strategy
    let strategy: Contract;
    const underlying = ADDRESS[`${vaultConfig.token}_TOKEN`];
    {
      const address = await factory.callStatic.createStrategy(config.Strategy.impls[strategyName]);
      const tx = await factory.createStrategy(config.Strategy.impls[strategyName], {
        gasLimit: 1000000,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      console.log(
        `Deploying ${strategyName} for pool[${pool.name}] with Compounder[${compounderName}], hash:`,
        tx.hash
      );
      const receipt = await tx.wait();
      console.log(
        `✅ Deploy ${strategyName} for pool[${pool.name}] with Compounder[${compounderName}] at:`,
        address,
        "gas used:",
        receipt.gasUsed.toString()
      );
      strategy = await ethers.getContractAt(strategyName, address, deployer);
    }
    if (strategyName === "ManualCompoundingConvexCurveStrategy") {
      const tx = await strategy.initialize(vault.address, underlying, vaultConfig.rewarder!, vaultConfig.rewards, {
        gasLimit: 1000000,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      console.log(
        `Initializing ${strategyName} for pool ${pool.name} with Compounder[${compounderName}], hash:`,
        tx.hash
      );
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    } else {
      throw new Error(`strategy ${strategyName} not supported`);
    }

    // add pool with strategy
    const tx = await vault.addPool(
      underlying,
      strategy.address,
      pool.fees.withdraw,
      pool.fees.platform,
      pool.fees.harvest,
      {
        gasLimit: 1000000,
        maxFeePerGas,
        maxPriorityFeePerGas,
      }
    );
    console.log(`Add pool ${pool.name} with pid[${pid}] and Compounder[${compounderName}], hash:`, tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }
}

// eslint-disable-next-line no-unused-vars
async function deployConcentratorFXS() {}

// eslint-disable-next-line no-unused-vars
async function deployConcentratorCRV() {}

// eslint-disable-next-line no-unused-vars
async function deployConcentratorETH() {
  const [deployer] = await ethers.getSigners();

  if (config.UpgradeableBeacon.AladdinETH.impl !== "") {
    console.log("Found AladdinETH Impl at:", config.UpgradeableBeacon.AladdinETH.impl);
  } else {
    const AladdinETH = await ethers.getContractFactory("AladdinETH", deployer);
    const impl = await AladdinETH.deploy();
    console.log("Deploying AladdinETH Impl, hash:", impl.deployTransaction.hash);
    const receipt = await impl.deployTransaction.wait();
    console.log("✅ Deploy AladdinETH Impl at:", impl.address, "gas used:", receipt.gasUsed.toString());
    config.UpgradeableBeacon.AladdinETH.impl = impl.address;
  }

  if (config.UpgradeableBeacon.AladdinETH.beacon !== "") {
    aladdinETHBeacon = await ethers.getContractAt(
      "UpgradeableBeacon",
      config.UpgradeableBeacon.AladdinETH.beacon,
      deployer
    );
    console.log("Found AladdinETHBeacon at:", aladdinETHBeacon.address);
  } else {
    const UpgradeableBeacon = await ethers.getContractFactory("UpgradeableBeacon", deployer);
    aladdinETHBeacon = await UpgradeableBeacon.deploy(config.UpgradeableBeacon.AladdinETH.impl);
    console.log("Deploying AladdinETHBeacon, hash:", aladdinETHBeacon.deployTransaction.hash);
    await aladdinETHBeacon.deployed();
    const receipt = await aladdinETHBeacon.deployTransaction.wait();
    console.log("✅ Deploy AladdinETHBeacon at:", aladdinETHBeacon.address, "gas used:", receipt.gasUsed.toString());
    config.UpgradeableBeacon.AladdinETH.beacon = aladdinETHBeacon.address;
  }

  if (config.UpgradeableBeacon.ConcentratorAladdinETHVault.impl !== "") {
    console.log(
      "Found ConcentratorAladdinETHVault Impl at:",
      config.UpgradeableBeacon.ConcentratorAladdinETHVault.impl
    );
  } else {
    const ConcentratorAladdinETHVault = await ethers.getContractFactory("ConcentratorAladdinETHVault", deployer);
    const impl = await ConcentratorAladdinETHVault.deploy();
    console.log("Deploying ConcentratorAladdinETHVault Impl, hash:", impl.deployTransaction.hash);
    await impl.deployed();
    const receipt = await impl.deployTransaction.wait();
    console.log(
      "✅ Deploy ConcentratorAladdinETHVault Impl at:",
      impl.address,
      "gas used:",
      receipt.gasUsed.toString()
    );
    config.UpgradeableBeacon.ConcentratorAladdinETHVault.impl = impl.address;
  }

  if (config.UpgradeableBeacon.ConcentratorAladdinETHVault.beacon !== "") {
    concentratorAladdinETHVaultBeacon = await ethers.getContractAt(
      "UpgradeableBeacon",
      config.UpgradeableBeacon.ConcentratorAladdinETHVault.beacon,
      deployer
    );
    console.log("Found ConcentratorAladdinETHVaultBeacon at:", concentratorAladdinETHVaultBeacon.address);
  } else {
    const UpgradeableBeacon = await ethers.getContractFactory("UpgradeableBeacon", deployer);
    concentratorAladdinETHVaultBeacon = await UpgradeableBeacon.deploy(
      config.UpgradeableBeacon.ConcentratorAladdinETHVault.impl
    );
    console.log(
      "Deploying ConcentratorAladdinETHVaultBeacon, hash:",
      concentratorAladdinETHVaultBeacon.deployTransaction.hash
    );
    await concentratorAladdinETHVaultBeacon.deployed();
    const receipt = await concentratorAladdinETHVaultBeacon.deployTransaction.wait();
    console.log(
      "✅ Deploy ConcentratorAladdinETHVaultBeacon at:",
      concentratorAladdinETHVaultBeacon.address,
      "gas used:",
      receipt.gasUsed.toString()
    );
    config.UpgradeableBeacon.ConcentratorAladdinETHVault.beacon = concentratorAladdinETHVaultBeacon.address;
  }

  for (const name of []) {
    const compounderConfig = config.ConcentratorETHInConvexFrax[name];
    const compounderName = `${compounderConfig.symbol}/ConvexCurve`;
    let strategy: AutoCompoundingConvexCurveStrategy;
    let compounder: AladdinETH;
    const underlying = ADDRESS[`${AVAILABLE_VAULTS[name].token}_TOKEN`];
    if (config.ConcentratorETHInConvexCurve[name].strategy !== "") {
      strategy = await ethers.getContractAt(
        "AutoCompoundingConvexCurveStrategy",
        config.ConcentratorETHInConvexCurve[name].strategy,
        deployer
      );
      console.log(`Found AutoCompoundingConvexCurveStrategy for ${compounderName} at:`, strategy.address);
    } else {
      const address = await factory.callStatic.createStrategy(config.Strategy.impls.AutoCompoundingConvexCurveStrategy);
      const tx = await factory.createStrategy(config.Strategy.impls.AutoCompoundingConvexCurveStrategy);
      console.log(`Deploying AutoCompoundingConvexCurveStrategy for ${compounderName}, hash:`, tx.hash);
      const receipt = await tx.wait();
      console.log(
        `✅ Deploy AutoCompoundingConvexCurveStrategy for ${compounderName} at:`,
        address,
        "gas used:",
        receipt.gasUsed.toString()
      );
      strategy = await ethers.getContractAt("AutoCompoundingConvexCurveStrategy", address, deployer);
      config.ConcentratorETHInConvexCurve[name].strategy = strategy.address;
    }

    if (config.ConcentratorETHInConvexCurve[name].compounder !== "") {
      compounder = await ethers.getContractAt(
        "AladdinETH",
        config.ConcentratorETHInConvexCurve[name].compounder,
        deployer
      );
      console.log(`Found AladdinETH For ${compounderName} at:`, compounder.address);
    } else {
      const BeaconProxy = await ethers.getContractFactory("BeaconProxy", deployer);
      const proxy = await BeaconProxy.deploy(aladdinETHBeacon.address, "0x");
      console.log(`Deploying AladdinETH For ${compounderName}, hash:`, proxy.deployTransaction.hash);
      await proxy.deployed();
      const receipt = await proxy.deployTransaction.wait();
      compounder = await ethers.getContractAt("AladdinETH", proxy.address, deployer);
      console.log(
        `✅ Deploy AladdinETH For ${compounderName} at:`,
        compounder.address,
        "gas used:",
        receipt.gasUsed.toString()
      );
      config.ConcentratorETHInConvexCurve[name].compounder = compounder.address;
    }

    if ((await strategy.operator()) === constants.AddressZero) {
      const tx = await strategy.initialize(
        compounder.address,
        underlying,
        AVAILABLE_VAULTS[name].rewarder!,
        config.ConcentratorETHInConvexCurve[name].rewards.map((t) => TOKENS[t].address)
      );
      console.log(`AutoCompoundingConvexCurveStrategy.initialize for ${compounderName}, hash:`, tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    if ((await compounder.strategy()) === constants.AddressZero) {
      const tx = await compounder.initialize(
        DEPLOYED_CONTRACTS.AladdinZap,
        underlying,
        strategy.address,
        config.ConcentratorETHInConvexCurve[name].name,
        config.ConcentratorETHInConvexCurve[name].symbol
      );
      console.log(`AladdinETH.initialize for ${compounderName}, hash:`, tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    if ((await compounder.feeInfo()).platform !== DEPLOYED_CONTRACTS.Concentrator.Treasury) {
      const tx = await compounder.updateFeeInfo(
        DEPLOYED_CONTRACTS.Concentrator.Treasury,
        compounderConfig.ratio.platform,
        compounderConfig.ratio.harvest,
        compounderConfig.ratio.withdraw
      );
      console.log(`AladdinETH.updateFeeInfo for ${compounderName}, hash:`, tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }
  }

  for (const name of ["frxeth"]) {
    const compounderConfig = config.ConcentratorETHInConvexFrax[name];
    const compounderName = `${compounderConfig.symbol}/ConvexFrax`;
    let strategy: AutoCompoundingConvexFraxStrategy;
    let compounder: AladdinETH;
    const underlying = ADDRESS[`${AVAILABLE_VAULTS[name].token}_TOKEN`];
    if (compounderConfig.strategy !== "") {
      strategy = await ethers.getContractAt("AutoCompoundingConvexFraxStrategy", compounderConfig.strategy, deployer);
      console.log(`Found AutoCompoundingConvexFraxStrategy for ${compounderName}, at:`, strategy.address);
    } else {
      const address = await factory.callStatic.createStrategy(config.Strategy.impls.AutoCompoundingConvexFraxStrategy);
      const tx = await factory.createStrategy(config.Strategy.impls.AutoCompoundingConvexFraxStrategy);
      console.log(`Deploying AutoCompoundingConvexFraxStrategy for ${compounderName}, hash:`, tx.hash);
      const receipt = await tx.wait();
      console.log(
        `✅ Deploy AutoCompoundingConvexFraxStrategy for ${compounderName}, at:`,
        address,
        "gas used:",
        receipt.gasUsed.toString()
      );
      strategy = await ethers.getContractAt("AutoCompoundingConvexFraxStrategy", address, deployer);
      compounderConfig.strategy = strategy.address;
    }

    if (compounderConfig.compounder !== "") {
      compounder = await ethers.getContractAt(
        "AladdinETH",
        config.ConcentratorETHInConvexFrax[name].compounder,
        deployer
      );
      console.log(`Found AladdinETH For ${compounderName}, at:`, compounder.address);
    } else {
      const BeaconProxy = await ethers.getContractFactory("BeaconProxy", deployer);
      const proxy = await BeaconProxy.deploy(aladdinETHBeacon.address, "0x");
      console.log(`Deploying AladdinETH For ${compounderName}, hash:`, proxy.deployTransaction.hash);
      await proxy.deployed();
      const receipt = await proxy.deployTransaction.wait();
      compounder = await ethers.getContractAt("AladdinETH", proxy.address, deployer);
      console.log(
        `✅ Deploy AladdinETH For ${compounderName}, at:`,
        compounder.address,
        "gas used:",
        receipt.gasUsed.toString()
      );
      compounderConfig.compounder = compounder.address;
    }

    if ((await strategy.operator()) === constants.AddressZero) {
      const tx = await strategy.initialize(
        compounder.address,
        underlying,
        AVAILABLE_VAULTS[name].convexFraxID!,
        compounderConfig.rewards.map((t) => TOKENS[t].address)
      );
      console.log(`AutoCompoundingConvexFraxStrategy.initialize for ${compounderName}, hash:`, tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    if ((await compounder.strategy()) === constants.AddressZero) {
      const tx = await compounder.initialize(
        DEPLOYED_CONTRACTS.AladdinZap,
        underlying,
        strategy.address,
        compounderConfig.name,
        compounderConfig.symbol
      );
      console.log(`AladdinETH.initialize for ${compounderName}, hash:`, tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    if ((await compounder.feeInfo()).platform !== DEPLOYED_CONTRACTS.Concentrator.Treasury) {
      const tx = await compounder.updateFeeInfo(
        DEPLOYED_CONTRACTS.Concentrator.Treasury,
        compounderConfig.ratio.platform,
        compounderConfig.ratio.harvest,
        compounderConfig.ratio.withdraw
      );
      console.log(`AladdinETH.updateFeeInfo for ${compounderName}, hash:`, tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    let vault: ConcentratorAladdinETHVault;
    if (compounderConfig.vault !== "") {
      vault = await ethers.getContractAt("ConcentratorAladdinETHVault", compounderConfig.vault, deployer);
      console.log(`Found ConcentratorAladdinETHVault For ${compounderName}, at:`, vault.address);
    } else {
      const BeaconProxy = await ethers.getContractFactory("BeaconProxy", deployer);
      const data = ConcentratorAladdinETHVault__factory.createInterface().encodeFunctionData("initialize", [
        compounder.address,
        DEPLOYED_CONTRACTS.AladdinZap,
        DEPLOYED_CONTRACTS.Concentrator.PlatformFeeDistributor,
      ]);
      const proxy = await BeaconProxy.deploy(concentratorAladdinETHVaultBeacon.address, data);
      console.log(`Deploying ConcentratorAladdinETHVault For ${compounderName}, hash:`, proxy.deployTransaction.hash);
      await proxy.deployed();
      const receipt = await proxy.deployTransaction.wait();
      vault = await ethers.getContractAt("ConcentratorAladdinETHVault", proxy.address, deployer);
      console.log(
        `✅ Deploy ConcentratorAladdinETHVault For ${compounderName}, at:`,
        vault.address,
        "gas used:",
        receipt.gasUsed.toString()
      );
      compounderConfig.vault = vault.address;
    }

    await addVaults(deployer, compounderName, DEPLOYED_VAULTS[compounderConfig.symbol], vault);
  }
}

async function deployAbcCVX() {
  let impl: AladdinCVX;
  let acvx: AladdinCVX;

  const [deployer] = await ethers.getSigners();

  const proxyAdmin = await ethers.getContractAt("ProxyAdmin", DEPLOYED_CONTRACTS.CLever.ProxyAdmin, deployer);

  let strategy: AMOConvexCurveStrategy;
  if (config.abcCVX.strategy !== "") {
    strategy = await ethers.getContractAt("AMOConvexCurveStrategy", config.abcCVX.strategy, deployer);
    console.log(`Found AMOConvexCurveStrategy for abcCVX, at:`, strategy.address);
  } else {
    const address = await factory.callStatic.createStrategy(config.Strategy.impls.AMOConvexCurveStrategy);
    const tx = await factory.createStrategy(config.Strategy.impls.AMOConvexCurveStrategy);
    console.log(`Deploying AMOConvexCurveStrategy for abcCVX, hash:`, tx.hash);
    const receipt = await tx.wait();
    console.log(`✅ Deploy AMOConvexCurveStrategy for abcCVX, at:`, address, "gas used:", receipt.gasUsed.toString());
    strategy = await ethers.getContractAt("AMOConvexCurveStrategy", address, deployer);
    config.abcCVX.strategy = strategy.address;
  }

  if (config.abcCVX.amo.impl !== "") {
    impl = await ethers.getContractAt("AladdinCVX", config.abcCVX.amo.impl, deployer);
    console.log("Found AladdinCVX Impl at:", impl.address);
  } else {
    const AladdinCVX = await ethers.getContractFactory("AladdinCVX", deployer);
    impl = await AladdinCVX.deploy(
      TOKENS.CVX.address,
      DEPLOYED_CONTRACTS.CLever.CLeverCVX.clevCVX,
      DEPLOYED_CONTRACTS.CLever.Gauge.Curve_clevCVX_CVX.pool,
      DEPLOYED_CONTRACTS.CLever.Gauge.Curve_clevCVX_CVX.token,
      DEPLOYED_CONTRACTS.CLever.CLeverCVX.FurnaceForCVX
    );
    console.log("Deploying AladdinCVX Impl, hash:", impl.deployTransaction.hash);
    await impl.deployed();
    const receipt = await impl.deployTransaction.wait();
    console.log("✅ Deploy AladdinCVX Impl at:", impl.address, "gas used:", receipt.gasUsed.toString());
  }

  if (config.abcCVX.amo.proxy !== "") {
    acvx = await ethers.getContractAt("AladdinCVX", config.abcCVX.amo.proxy, deployer);
    console.log("Found AladdinCVX at:", acvx.address);
  } else {
    const data = impl.interface.encodeFunctionData("initialize", [
      DEPLOYED_CONTRACTS.AladdinZap,
      strategy.address,
      config.abcCVX.initialRatio,
      [DEPLOYED_CONTRACTS.CLever.CLEV],
    ]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(impl.address, proxyAdmin.address, data);
    console.log("Deploying AladdinCVX Proxy, hash:", proxy.deployTransaction.hash);
    await proxy.deployed();
    const receipt = await proxy.deployTransaction.wait();
    acvx = await ethers.getContractAt("AladdinCVX", proxy.address, deployer);
    console.log("✅ Deploy AladdinCVX Proxy at:", acvx.address, "gas used:", receipt.gasUsed.toString());
  }

  // Deploy abcCVX Gauge
  if (config.abcCVX.gauge === "") {
    const LiquidityGaugeV3 = await ethers.getContractFactory("LiquidityGaugeV3", deployer);
    const gauge = await LiquidityGaugeV3.deploy(
      config.abcCVX.amo.proxy,
      DEPLOYED_CONTRACTS.CLever.CLEVMinter,
      deployer.address
    );
    console.log("Deploying abcCVX Gauge, hash:", gauge.deployTransaction.hash);
    await gauge.deployed();
    console.log("✅ Deploy abcCVX Gauge at:", gauge.address);
    config.abcCVX.gauge = gauge.address;
  }

  if ((await strategy.operator()) === constants.AddressZero) {
    const tx = await strategy.initialize(
      acvx.address,
      DEPLOYED_CONTRACTS.CLever.Gauge.Curve_clevCVX_CVX.token,
      "0x706f34D0aB8f4f9838F15b0D155C8Ef42229294B",
      [TOKENS.CRV.address, TOKENS.CVX.address]
    );
    console.log(`AMOConvexCurveStrategy.initialize for abcCVX, hash:`, tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }

  const amoConfig = await acvx.config();
  if (
    !amoConfig.minAMO.eq(config.abcCVX.AMORatio.min) ||
    !amoConfig.maxAMO.eq(config.abcCVX.AMORatio.max) ||
    !amoConfig.minLPRatio.eq(config.abcCVX.LPRatio.min) ||
    !amoConfig.maxLPRatio.eq(config.abcCVX.LPRatio.max)
  ) {
    const tx = await acvx.updateAMOConfig(
      config.abcCVX.AMORatio.min,
      config.abcCVX.AMORatio.max,
      config.abcCVX.LPRatio.min,
      config.abcCVX.LPRatio.max
    );
    console.log(
      `Update amo config`,
      `AMORatio[${ethers.utils.formatUnits(config.abcCVX.AMORatio.min, 10)}-${ethers.utils.formatUnits(
        config.abcCVX.AMORatio.max,
        10
      )}]`,
      `LPRatio[${ethers.utils.formatUnits(config.abcCVX.LPRatio.min, 10)}-${ethers.utils.formatUnits(
        config.abcCVX.LPRatio.max,
        10
      )}],`,
      `hash: ${tx.hash}`
    );
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  if (deployer.address === "0x11E91BB6d1334585AA37D8F4fde3932C7960B938") {
    console.log("invalid deployer");
    return;
  }

  if (config.Strategy.factory !== "") {
    factory = await ethers.getContractAt("ConcentratorStrategyFactory", config.Strategy.factory, deployer);
    console.log("Found ConcentratorStrategyFactory at:", factory.address);
  } else {
    const ConcentratorStrategyFactory = await ethers.getContractFactory("ConcentratorStrategyFactory", deployer);
    factory = await ConcentratorStrategyFactory.deploy();
    console.log("Deploying ConcentratorStrategyFactory, hash:", factory.deployTransaction.hash);
    await factory.deployed();
    const receipt = await factory.deployTransaction.wait();
    console.log("✅ Deploy ConcentratorStrategyFactory at:", factory.address, "gas used:", receipt.gasUsed.toString());
  }

  for (const name of [
    "AMOConvexCurveStrategy",
    "AutoCompoundingConvexFraxStrategy",
    "AutoCompoundingConvexCurveStrategy",
    "ManualCompoundingConvexCurveStrategy",
  ]) {
    if (config.Strategy.impls[name] === "") {
      const Contract = await ethers.getContractFactory(name, deployer);
      const impl = await Contract.deploy();
      console.log(`Deploying ${name} Impl hash:`, impl.deployTransaction.hash);
      await impl.deployed();
      const receipt = await impl.deployTransaction.wait();
      console.log(`✅ Deploy ${name} Impl at:`, impl.address, "gas used:", receipt.gasUsed.toString());
      config.Strategy.impls[name] = impl.address;
    } else {
      console.log(`Found ${name} Impl at:`, config.Strategy.impls[name]);
    }
  }

  await deployAbcCVX();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

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
  CvxCrvStakingWrapperStrategy,
  StakeDAOLockerProxy,
  StakeDAOLockerProxy__factory,
  AladdinSdCRV,
  VeSDTDelegation,
  VeSDTDelegation__factory,
  StakeDAOCRVVault,
  StakeDAOCRVVault__factory,
  AladdinSdCRV__factory,
} from "../typechain";
import { ADDRESS, DEPLOYED_CONTRACTS, DEPLOYED_VAULTS, TOKENS, AVAILABLE_VAULTS, ZAP_ROUTES } from "./utils";

interface IConcentratorInterface {
  compounder: {
    ratio: {
      platform: number;
      harvest: number;
      withdraw: number;
    };
    underlying: string;
    name: string;
    symbol: string;
    impl: string;
    proxy: string;
    strategy: string;
    rewards: string[];
  };
  vault: {
    impl: string;
    proxy: string;
  };
}

interface ICLeverAMOInterface {
  initialRatio: BigNumber;
  feeRatio: {
    harvest: number;
    platform: number;
  };
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

const STAKED_CVXCRV = "0xaa0C3f5F7DFD688C6E646F66CD2a6B66ACdbE434";

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
  ConcentratorStakeDAO: {
    StakeDAOLockerProxy: {
      impl: string;
      proxy: string;
    };
    VeSDTDelegation: {
      impl: string;
      proxy: string;
      start: number;
    };
    StakeDAOCRVVault: {
      impl: string;
      proxy: string;
      gauge: string;
      lockDuration: number;
      ratio: {
        platform: number;
        harvest: number;
        boost: number;
        withdraw: number;
      };
    };
    AladdinSdCRV: {
      impl: string;
      proxy: string;
      ratio: {
        platform: number;
        harvest: number;
        withdraw: number;
      };
    };
  };
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
      compounder: {
        ratio: {
          platform: 10e7, // 10%
          harvest: 1e7, // 1%
          withdraw: 0.25e7, // 0.25%
        },
        underlying: "steth",
        name: "Aladdin steCRV",
        symbol: "astETH",
        rewards: ["CVX", "CRV", "LDO"],
        proxy: constants.AddressZero,
        impl: constants.AddressZero,
        strategy: constants.AddressZero,
      },
      vault: {
        impl: constants.AddressZero,
        proxy: constants.AddressZero,
      },
    },
  },
  ConcentratorETHInConvexFrax: {
    frxeth: {
      compounder: {
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
        proxy: "0xb15Ad6113264094Fd9BF2238729410A07EBE5ABa",
        impl: "0xC999894424b281cE8602B50DF5F2D57F91e852f7",
      },
      vault: {
        proxy: "0x50B47c4A642231dbe0B411a0B2FBC1EBD129346D",
        impl: "0x7D6c00032cAbc699b908ECE34097ff1A159da998",
      },
    },
  },
  ConcentratorCRV: {
    compounder: {
      ratio: {
        platform: 25000000, // 2.5%
        harvest: 25000000, // 2.5%
        withdraw: 2500000, // 0.25%
      },
      underlying: "cvxcrv",
      name: "Aladdin cvxCRV",
      symbol: "aCRV",
      rewards: ["CVX", "CRV", "TRICRV"],
      strategy: "0x94cC627Db80253056B2130aAC39abB252A75F345",
      proxy: "0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884",
      impl: "0x8C7E36A669b4B9f55608C7d3C373e8b9F19c444D",
    },
    vault: {
      proxy: "0x3Cf54F3A1969be9916DAD548f3C084331C4450b5",
      impl: "0x4D90Ba583Cd7f524ad76C5c07EcCf81A32061E65",
    },
  },
  ConcentratorFXS: {
    compounder: {
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
      proxy: "0xDAF03D70Fe637b91bA6E521A32E1Fb39256d3EC9",
      impl: "0xeb5EB007Ab39e9831a1921E8116Bc353AFE5BA2C",
    },
    vault: {
      proxy: "0xD6E3BB7b1D6Fa75A71d48CFB10096d59ABbf99E1",
      impl: "0xFD265e6FcF0306FBCC69228a77576c45C234baba",
    },
  },
  abcCVX: {
    initialRatio: ethers.utils.parseUnits("99", 10),
    feeRatio: {
      harvest: 1e7, // 1%
      platform: 0,
    },
    AMORatio: {
      min: ethers.utils.parseUnits("1", 10),
      max: ethers.utils.parseUnits("5", 10),
    },
    LPRatio: {
      min: ethers.utils.parseUnits("1", 10),
      max: ethers.utils.parseUnits("99.9", 10),
    },
    strategy: "0x29E56d5E68b4819FC4a997b91fc9F4f8818ef1B4",
    amo: {
      proxy: "0xDEC800C2b17c9673570FDF54450dc1bd79c8E359",
      impl: "0x07d9d83df553c013e767872af8da75d84e1368f9",
    },
    gauge: "0xc5022291cA8281745d173bB855DCd34dda67F2f0",
  },
  ConcentratorStakeDAO: {
    StakeDAOLockerProxy: {
      impl: "0xbccb5BCD5DeA5511aC11114Ef4FeD908a45832CF",
      proxy: "0x1c0D72a330F2768dAF718DEf8A19BAb019EEAd09",
    },
    VeSDTDelegation: {
      impl: "0xA5d31B528D2710af19E57fedA324483c14aE0F12",
      proxy: "0x6037Bb1BBa598bf88D816cAD90A28cC00fE3ff64",
      start: 1675728000, // Tue Feb 07 2023 00:00:00 GMT+0000
    },
    StakeDAOCRVVault: {
      impl: "0xe86Cf56582Ee0A798b3490886de6CB59D56e4aAd",
      proxy: "0x2b3e72f568F96d7209E20C8B8f4F2A363ee1E3F6",
      gauge: "0x7f50786A0b15723D741727882ee99a0BF34e3466",
      lockDuration: 86400 * 1,
      ratio: {
        platform: 5e7 / 100, // 5%
        harvest: 1e7 / 100, // 1%
        boost: 10e7 / 100, // 10%
        withdraw: 0 / 100, // 0%
      },
    },
    AladdinSdCRV: {
      impl: "0xdC4Ca266b54084cB2371A4258e080bCE9e23545E",
      proxy: "0x43E54C2E7b3e294De3A155785F52AB49d87B9922",
      ratio: {
        platform: 10e7, // 10%
        harvest: 1e7, // 1%
        withdraw: 0.25e7, // 0.25%
      },
    },
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

    if ((await vault.owner()) === deployer.address) {
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
    } else {
      console.log(
        `Add pool ${pool.name} with pid[${pid}] and Compounder[${compounderName}]:`,
        `target[${vault.address}]`,
        `method[addPool]`,
        `params[${underlying},${strategy.address},${pool.fees.withdraw},${pool.fees.platform},${pool.fees.harvest}]`
      );
    }
  }
}

// eslint-disable-next-line no-unused-vars
async function deployConcentratorFXS() {}

// eslint-disable-next-line no-unused-vars
async function deployConcentratorCRV() {
  for (const [from, to] of [
    ["CVX", "CRV"],
    ["TRICRV", "CRV"],
    ["cvxCRV", "CRV"],
    ["cvxCRV", "WETH"],
  ]) {
    console.log(
      `zap ${from} => ${to}:`,
      `from[${TOKENS[from].address}]`,
      `to[${TOKENS[to].address}]`,
      `routes[${ZAP_ROUTES[from][to].map((r) => `"${r.toHexString()}"`)}]`
    );
  }

  const [deployer] = await ethers.getSigners();
  const concentratorCRVConfig = config.ConcentratorCRV;

  let strategy: CvxCrvStakingWrapperStrategy;

  const acrv = await ethers.getContractAt("AladdinCRV", DEPLOYED_CONTRACTS.Concentrator.cvxCRV.aCRV, deployer);

  if (concentratorCRVConfig.compounder.strategy !== "") {
    strategy = await ethers.getContractAt(
      "CvxCrvStakingWrapperStrategy",
      concentratorCRVConfig.compounder.strategy,
      deployer
    );
    console.log("Found CvxCrvStakingWrapperStrategy at:", strategy.address);
  } else {
    const CvxCrvStakingWrapperStrategy = await ethers.getContractFactory("CvxCrvStakingWrapperStrategy", deployer);
    strategy = await CvxCrvStakingWrapperStrategy.deploy(acrv.address, STAKED_CVXCRV);
    console.log("Deploying CvxCrvStakingWrapperStrategy, hash:", strategy.deployTransaction.hash);

    const receipt = await strategy.deployTransaction.wait();
    console.log(
      "✅ Deploy CvxCrvStakingWrapperStrategy at:",
      strategy.address,
      "gas used:",
      receipt.gasUsed.toString()
    );

    concentratorCRVConfig.compounder.strategy = strategy.address;
  }

  if (concentratorCRVConfig.compounder.impl !== "") {
    console.log("Found AladdinCRVV2 Impl at:", concentratorCRVConfig.compounder.impl);
  } else {
    const AladdinCRVV2 = await ethers.getContractFactory("AladdinCRVV2", deployer);
    const impl = await AladdinCRVV2.deploy("0x9d0464996170c6b9e75eed71c68b99ddedf279e8", STAKED_CVXCRV);
    console.log("Deploying AladdinCRVV2 Impl, hash:", impl.deployTransaction.hash);
    const receipt = await impl.deployTransaction.wait();
    console.log("✅ Deploy AladdinCRVV2 Impl at:", impl.address, "gas used:", receipt.gasUsed.toString());
    concentratorCRVConfig.compounder.impl = impl.address;
  }
}

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
    const compounderName = `${compounderConfig.compounder.symbol}/ConvexCurve`;
    let strategy: AutoCompoundingConvexCurveStrategy;
    let compounder: AladdinETH;
    const underlying = ADDRESS[`${AVAILABLE_VAULTS[name].token}_TOKEN`];
    if (config.ConcentratorETHInConvexCurve[name].compounder.strategy !== "") {
      strategy = await ethers.getContractAt(
        "AutoCompoundingConvexCurveStrategy",
        config.ConcentratorETHInConvexCurve[name].compounder.strategy,
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
      config.ConcentratorETHInConvexCurve[name].compounder.strategy = strategy.address;
    }

    if (config.ConcentratorETHInConvexCurve[name].compounder.proxy !== "") {
      compounder = await ethers.getContractAt(
        "AladdinETH",
        config.ConcentratorETHInConvexCurve[name].compounder.proxy,
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
      config.ConcentratorETHInConvexCurve[name].compounder.proxy = compounder.address;
    }

    if ((await strategy.operator()) === constants.AddressZero) {
      const tx = await strategy.initialize(
        compounder.address,
        underlying,
        AVAILABLE_VAULTS[name].rewarder!,
        config.ConcentratorETHInConvexCurve[name].compounder.rewards.map((t) => TOKENS[t].address)
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
        config.ConcentratorETHInConvexCurve[name].compounder.name,
        config.ConcentratorETHInConvexCurve[name].compounder.symbol
      );
      console.log(`AladdinETH.initialize for ${compounderName}, hash:`, tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    if ((await compounder.feeInfo()).platform !== DEPLOYED_CONTRACTS.Concentrator.Treasury) {
      const tx = await compounder.updateFeeInfo(
        DEPLOYED_CONTRACTS.Concentrator.Treasury,
        compounderConfig.compounder.ratio.platform,
        compounderConfig.compounder.ratio.harvest,
        compounderConfig.compounder.ratio.withdraw
      );
      console.log(`AladdinETH.updateFeeInfo for ${compounderName}, hash:`, tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }
  }

  for (const name of ["frxeth"]) {
    const compounderConfig = config.ConcentratorETHInConvexFrax[name];
    const compounderName = `${compounderConfig.compounder.symbol}/ConvexFrax`;
    let strategy: AutoCompoundingConvexFraxStrategy;
    let compounder: AladdinETH;
    const underlying = ADDRESS[`${AVAILABLE_VAULTS[name].token}_TOKEN`];
    if (compounderConfig.compounder.strategy !== "") {
      strategy = await ethers.getContractAt(
        "AutoCompoundingConvexFraxStrategy",
        compounderConfig.compounder.strategy,
        deployer
      );
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
      compounderConfig.compounder.strategy = strategy.address;
    }

    if (compounderConfig.compounder.proxy !== "") {
      compounder = await ethers.getContractAt(
        "AladdinETH",
        config.ConcentratorETHInConvexFrax[name].compounder.proxy,
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
      compounderConfig.compounder.proxy = compounder.address;
    }

    if ((await strategy.operator()) === constants.AddressZero) {
      const tx = await strategy.initialize(
        compounder.address,
        underlying,
        AVAILABLE_VAULTS[name].convexFraxID!,
        compounderConfig.compounder.rewards.map((t) => TOKENS[t].address)
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
        compounderConfig.compounder.name,
        compounderConfig.compounder.symbol
      );
      console.log(`AladdinETH.initialize for ${compounderName}, hash:`, tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    if ((await compounder.feeInfo()).platform !== DEPLOYED_CONTRACTS.Concentrator.Treasury) {
      const tx = await compounder.updateFeeInfo(
        DEPLOYED_CONTRACTS.Concentrator.Treasury,
        compounderConfig.compounder.ratio.platform,
        compounderConfig.compounder.ratio.harvest,
        compounderConfig.compounder.ratio.withdraw
      );
      console.log(`AladdinETH.updateFeeInfo for ${compounderName}, hash:`, tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    let vault: ConcentratorAladdinETHVault;
    if (compounderConfig.vault.proxy !== "") {
      vault = await ethers.getContractAt("ConcentratorAladdinETHVault", compounderConfig.vault.proxy, deployer);
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
      compounderConfig.vault.proxy = vault.address;
    }

    await addVaults(deployer, compounderName, DEPLOYED_VAULTS[compounderConfig.compounder.symbol], vault);
  }
}

async function deployAbcCVX() {
  let impl: AladdinCVX;
  let acvx: AladdinCVX;

  const cvxConfig = config.abcCVX;
  const [deployer] = await ethers.getSigners();

  const proxyAdmin = await ethers.getContractAt("ProxyAdmin", DEPLOYED_CONTRACTS.CLever.ProxyAdmin, deployer);

  let strategy: AMOConvexCurveStrategy;
  if (cvxConfig.strategy !== "") {
    strategy = await ethers.getContractAt("AMOConvexCurveStrategy", cvxConfig.strategy, deployer);
    console.log(`Found AMOConvexCurveStrategy for abcCVX, at:`, strategy.address);
  } else {
    const address = await factory.callStatic.createStrategy(config.Strategy.impls.AMOConvexCurveStrategy);
    const tx = await factory.createStrategy(config.Strategy.impls.AMOConvexCurveStrategy);
    console.log(`Deploying AMOConvexCurveStrategy for abcCVX, hash:`, tx.hash);
    const receipt = await tx.wait();
    console.log(`✅ Deploy AMOConvexCurveStrategy for abcCVX, at:`, address, "gas used:", receipt.gasUsed.toString());
    strategy = await ethers.getContractAt("AMOConvexCurveStrategy", address, deployer);
    cvxConfig.strategy = strategy.address;
  }

  if (cvxConfig.amo.impl !== "") {
    impl = await ethers.getContractAt("AladdinCVX", cvxConfig.amo.impl, deployer);
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

  if (cvxConfig.amo.proxy !== "") {
    acvx = await ethers.getContractAt("AladdinCVX", cvxConfig.amo.proxy, deployer);
    console.log("Found AladdinCVX at:", acvx.address);
  } else {
    const data = impl.interface.encodeFunctionData("initialize", [
      DEPLOYED_CONTRACTS.AladdinZap,
      strategy.address,
      cvxConfig.initialRatio,
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
  if (cvxConfig.gauge === "") {
    const LiquidityGaugeV3 = await ethers.getContractFactory("LiquidityGaugeV3", deployer);
    const gauge = await LiquidityGaugeV3.deploy(
      cvxConfig.amo.proxy,
      DEPLOYED_CONTRACTS.CLever.CLEVMinter,
      deployer.address
    );
    console.log("Deploying abcCVX Gauge, hash:", gauge.deployTransaction.hash);
    await gauge.deployed();
    console.log("✅ Deploy abcCVX Gauge at:", gauge.address);
    cvxConfig.gauge = gauge.address;
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
    !amoConfig.minAMO.eq(cvxConfig.AMORatio.min) ||
    !amoConfig.maxAMO.eq(cvxConfig.AMORatio.max) ||
    !amoConfig.minLPRatio.eq(cvxConfig.LPRatio.min) ||
    !amoConfig.maxLPRatio.eq(cvxConfig.LPRatio.max)
  ) {
    const tx = await acvx.updateAMOConfig(
      cvxConfig.AMORatio.min,
      cvxConfig.AMORatio.max,
      cvxConfig.LPRatio.min,
      cvxConfig.LPRatio.max
    );
    console.log(
      `Update amo config`,
      "AMORatio:",
      `[${ethers.utils.formatUnits(amoConfig.minAMO, 10)}-${ethers.utils.formatUnits(amoConfig.maxAMO, 10)}]`,
      "=>",
      `[${ethers.utils.formatUnits(cvxConfig.AMORatio.min, 10)}-${ethers.utils.formatUnits(
        cvxConfig.AMORatio.max,
        10
      )}],`,
      "LPRatio:",
      `[${ethers.utils.formatUnits(amoConfig.minLPRatio, 10)}-${ethers.utils.formatUnits(amoConfig.maxLPRatio, 10)}]`,
      "=>",
      `[${ethers.utils.formatUnits(cvxConfig.LPRatio.min, 10)}-${ethers.utils.formatUnits(
        cvxConfig.LPRatio.max,
        10
      )}],`,
      `hash: ${tx.hash}`
    );
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }

  if (!(await acvx.bountyPercentage()).eq(cvxConfig.feeRatio.harvest)) {
    const tx = await acvx.updateBountyPercentage(cvxConfig.feeRatio.harvest);
    console.log(
      `update harvest bounty ratio`,
      `${ethers.utils.formatUnits(await acvx.bountyPercentage(), 9)}`,
      "=>",
      `${ethers.utils.formatUnits(cvxConfig.feeRatio.harvest, 9)}`,
      `hash: ${tx.hash}`
    );
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }

  if (
    !(await acvx.platformPercentage()).eq(cvxConfig.feeRatio.platform) ||
    (await acvx.platform()) !== DEPLOYED_CONTRACTS.Concentrator.Treasury
  ) {
    const tx = await acvx.updatePlatformPercentage(
      DEPLOYED_CONTRACTS.Concentrator.Treasury,
      cvxConfig.feeRatio.platform
    );
    console.log(
      `update platform fee ratio`,
      `${ethers.utils.formatUnits(await acvx.platformPercentage(), 9)}`,
      "=>",
      `${ethers.utils.formatUnits(cvxConfig.feeRatio.platform, 9)},`,
      `hash: ${tx.hash}`
    );
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }
}

async function deployConcentratorStakeDAO() {
  console.log(
    "zap SDT => WETH:",
    `from[${TOKENS.SDT.address}]`,
    `to[${TOKENS.WETH.address}]`,
    `routes[${ZAP_ROUTES.SDT.WETH.map((r) => `"${r.toHexString()}"`)}]`
  );
  console.log(
    "zap 3CRV => WETH:",
    `from[${TOKENS.TRICRV.address}]`,
    `to[${TOKENS.WETH.address}]`,
    `routes[${ZAP_ROUTES["3CRV"].WETH.map((r) => `"${r.toHexString()}"`)}]`
  );

  const [deployer] = await ethers.getSigners();
  const deployConfig = config.ConcentratorStakeDAO;

  let lockerProxy: StakeDAOLockerProxy;
  let delegation: VeSDTDelegation;
  let sdCRVVault: StakeDAOCRVVault;
  let asdCRV: AladdinSdCRV;

  if (deployConfig.StakeDAOLockerProxy.impl === "") {
    const StakeDAOLockerProxy = await ethers.getContractFactory("StakeDAOLockerProxy", deployer);
    const impl = await StakeDAOLockerProxy.deploy();
    console.log("Deploying StakeDAOLockerProxy Impl, hash:", impl.deployTransaction.hash);
    const receipt = await impl.deployTransaction.wait();
    console.log("✅ Deploy StakeDAOLockerProxy Impl at:", impl.address, "gas used:", receipt.gasUsed.toString());
    deployConfig.StakeDAOLockerProxy.impl = impl.address;
  } else {
    console.log("Found StakeDAOLockerProxy Impl at:", deployConfig.StakeDAOLockerProxy.impl);
  }

  if (deployConfig.StakeDAOLockerProxy.proxy !== "") {
    lockerProxy = await ethers.getContractAt("StakeDAOLockerProxy", deployConfig.StakeDAOLockerProxy.proxy, deployer);
    console.log("Found StakeDAOLockerProxy at:", lockerProxy.address);
  } else {
    const data = StakeDAOLockerProxy__factory.createInterface().encodeFunctionData("initialize");
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(
      deployConfig.StakeDAOLockerProxy.impl,
      DEPLOYED_CONTRACTS.Concentrator.ProxyAdmin,
      data
    );
    console.log(`Deploying StakeDAOLockerProxy, hash:`, proxy.deployTransaction.hash);
    await proxy.deployed();
    const receipt = await proxy.deployTransaction.wait();
    console.log(`✅ Deploy StakeDAOLockerProxy, at:`, proxy.address, "gas used:", receipt.gasUsed.toString());

    lockerProxy = await ethers.getContractAt("StakeDAOLockerProxy", proxy.address, deployer);
    deployConfig.StakeDAOLockerProxy.proxy = lockerProxy.address;
  }

  if (deployConfig.VeSDTDelegation.impl === "") {
    const VeSDTDelegation = await ethers.getContractFactory("VeSDTDelegation", deployer);
    const impl = await VeSDTDelegation.deploy(lockerProxy.address);
    console.log("Deploying VeSDTDelegation Impl, hash:", impl.deployTransaction.hash);
    const receipt = await impl.deployTransaction.wait();
    console.log("✅ Deploy VeSDTDelegation Impl at:", impl.address, "gas used:", receipt.gasUsed.toString());
    deployConfig.VeSDTDelegation.impl = impl.address;
  } else {
    console.log("Found VeSDTDelegation Impl at:", deployConfig.VeSDTDelegation.impl);
  }

  if (deployConfig.VeSDTDelegation.proxy !== "") {
    delegation = await ethers.getContractAt("VeSDTDelegation", deployConfig.VeSDTDelegation.proxy, deployer);
    console.log("Found VeSDTDelegation at:", delegation.address);
  } else {
    const data = VeSDTDelegation__factory.createInterface().encodeFunctionData("initialize", [
      deployConfig.VeSDTDelegation.start,
    ]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(
      deployConfig.VeSDTDelegation.impl,
      DEPLOYED_CONTRACTS.Concentrator.ProxyAdmin,
      data
    );
    console.log(`Deploying VeSDTDelegation, hash:`, proxy.deployTransaction.hash);
    await proxy.deployed();
    const receipt = await proxy.deployTransaction.wait();
    console.log(`✅ Deploy VeSDTDelegation, at:`, proxy.address, "gas used:", receipt.gasUsed.toString());

    delegation = await ethers.getContractAt("VeSDTDelegation", proxy.address, deployer);
    deployConfig.VeSDTDelegation.proxy = delegation.address;
  }

  if (deployConfig.StakeDAOCRVVault.impl === "") {
    const StakeDAOCRVVault = await ethers.getContractFactory("StakeDAOCRVVault", deployer);
    const impl = await StakeDAOCRVVault.deploy(lockerProxy.address, delegation.address);
    console.log("Deploying StakeDAOCRVVault Impl, hash:", impl.deployTransaction.hash);
    const receipt = await impl.deployTransaction.wait();
    console.log("✅ Deploy StakeDAOCRVVault Impl at:", impl.address, "gas used:", receipt.gasUsed.toString());
    deployConfig.StakeDAOCRVVault.impl = impl.address;
  } else {
    console.log("Found StakeDAOCRVVault Impl at:", deployConfig.StakeDAOCRVVault.impl);
  }

  if (deployConfig.StakeDAOCRVVault.proxy !== "") {
    sdCRVVault = await ethers.getContractAt("StakeDAOCRVVault", deployConfig.StakeDAOCRVVault.proxy, deployer);
    console.log("Found StakeDAOCRVVault at:", sdCRVVault.address);
  } else {
    const data = StakeDAOCRVVault__factory.createInterface().encodeFunctionData("initialize", [
      deployConfig.StakeDAOCRVVault.gauge,
      deployConfig.StakeDAOCRVVault.lockDuration,
    ]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(
      deployConfig.StakeDAOCRVVault.impl,
      DEPLOYED_CONTRACTS.Concentrator.ProxyAdmin,
      data
    );
    console.log(`Deploying StakeDAOCRVVault, hash:`, proxy.deployTransaction.hash);
    await proxy.deployed();
    const receipt = await proxy.deployTransaction.wait();
    console.log(`✅ Deploy StakeDAOCRVVault, at:`, proxy.address, "gas used:", receipt.gasUsed.toString());

    sdCRVVault = await ethers.getContractAt("StakeDAOCRVVault", proxy.address, deployer);
    deployConfig.StakeDAOCRVVault.proxy = sdCRVVault.address;
  }

  if (deployConfig.AladdinSdCRV.impl === "") {
    const AladdinSdCRV = await ethers.getContractFactory("AladdinSdCRV", deployer);
    const impl = await AladdinSdCRV.deploy(sdCRVVault.address);
    console.log("Deploying AladdinSdCRV Impl, hash:", impl.deployTransaction.hash);
    const receipt = await impl.deployTransaction.wait();
    console.log("✅ Deploy AladdinSdCRV Impl at:", impl.address, "gas used:", receipt.gasUsed.toString());
    deployConfig.AladdinSdCRV.impl = impl.address;
  } else {
    console.log("Found AladdinSdCRV Impl at:", deployConfig.AladdinSdCRV.impl);
  }

  if (deployConfig.AladdinSdCRV.proxy !== "") {
    asdCRV = await ethers.getContractAt("AladdinSdCRV", deployConfig.AladdinSdCRV.proxy, deployer);
    console.log("Found AladdinSdCRV at:", asdCRV.address);
  } else {
    const data = AladdinSdCRV__factory.createInterface().encodeFunctionData("initialize", [
      DEPLOYED_CONTRACTS.AladdinZap,
    ]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(
      deployConfig.AladdinSdCRV.impl,
      DEPLOYED_CONTRACTS.Concentrator.ProxyAdmin,
      data
    );
    console.log(`Deploying AladdinSdCRV, hash:`, proxy.deployTransaction.hash);
    await proxy.deployed();
    const receipt = await proxy.deployTransaction.wait();
    console.log(`✅ Deploy AladdinSdCRV, at:`, proxy.address, "gas used:", receipt.gasUsed.toString());

    asdCRV = await ethers.getContractAt("AladdinSdCRV", proxy.address, deployer);
    deployConfig.AladdinSdCRV.proxy = asdCRV.address;
  }

  if ((await lockerProxy.operators(deployConfig.StakeDAOCRVVault.gauge)) !== sdCRVVault.address) {
    const tx = await lockerProxy.updateOperator(deployConfig.StakeDAOCRVVault.gauge, sdCRVVault.address, {
      maxFeePerGas,
      maxPriorityFeePerGas,
    });
    console.log("updateOperator for sdCRV gauge, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }

  if ((await lockerProxy.claimer()) !== sdCRVVault.address) {
    const tx = await lockerProxy.updateClaimer(sdCRVVault.address, {
      maxFeePerGas,
      maxPriorityFeePerGas,
    });
    console.log("updateClaimer for sdCRV bribes, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }

  const vaultFeeInfo = await sdCRVVault.feeInfo();
  if (
    vaultFeeInfo.platform !== DEPLOYED_CONTRACTS.Concentrator.Treasury ||
    vaultFeeInfo.platformPercentage !== deployConfig.StakeDAOCRVVault.ratio.platform ||
    vaultFeeInfo.bountyPercentage !== deployConfig.StakeDAOCRVVault.ratio.harvest ||
    vaultFeeInfo.withdrawPercentage !== deployConfig.StakeDAOCRVVault.ratio.withdraw ||
    vaultFeeInfo.boostPercentage !== deployConfig.StakeDAOCRVVault.ratio.boost
  ) {
    const tx = await sdCRVVault.updateFeeInfo(
      DEPLOYED_CONTRACTS.Concentrator.Treasury,
      deployConfig.StakeDAOCRVVault.ratio.platform,
      deployConfig.StakeDAOCRVVault.ratio.harvest,
      deployConfig.StakeDAOCRVVault.ratio.boost,
      deployConfig.StakeDAOCRVVault.ratio.withdraw
    );
    console.log(
      "sdCRVVault.updateFeeInfo",
      `platform[${vaultFeeInfo.platform}=>${DEPLOYED_CONTRACTS.Concentrator.Treasury}]`,
      `withdrawRatio[${ethers.utils.formatUnits(vaultFeeInfo.withdrawPercentage, 7)}=>${ethers.utils.formatUnits(
        deployConfig.StakeDAOCRVVault.ratio.withdraw,
        7
      )}]`,
      `bountyRatio[${ethers.utils.formatUnits(vaultFeeInfo.bountyPercentage, 7)}=>${ethers.utils.formatUnits(
        deployConfig.StakeDAOCRVVault.ratio.harvest,
        7
      )}]`,
      `platformRatio[${ethers.utils.formatUnits(vaultFeeInfo.platformPercentage, 7)}=>${ethers.utils.formatUnits(
        deployConfig.StakeDAOCRVVault.ratio.platform,
        7
      )}]`,
      `boostRatio[${ethers.utils.formatUnits(vaultFeeInfo.boostPercentage, 7)}=>${ethers.utils.formatUnits(
        deployConfig.StakeDAOCRVVault.ratio.boost,
        7
      )}]`,
      `hash[${tx.hash}]`
    );
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }

  const withdrawLockTime = await sdCRVVault.withdrawLockTime();
  if (withdrawLockTime.toNumber() !== deployConfig.StakeDAOCRVVault.lockDuration) {
    const tx = await sdCRVVault.updateWithdrawLockTime(deployConfig.StakeDAOCRVVault.lockDuration);
    console.log(
      "sdCRVVault.updateWithdrawLockTime",
      `withdrawLockTime[${withdrawLockTime.toNumber()}=>${deployConfig.StakeDAOCRVVault.lockDuration}]`,
      `hash[${tx.hash}]`
    );
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }

  const asdCRVFeeInfo = await asdCRV.feeInfo();
  if (
    asdCRVFeeInfo.platform !== DEPLOYED_CONTRACTS.Concentrator.Treasury ||
    asdCRVFeeInfo.platformPercentage !== deployConfig.AladdinSdCRV.ratio.platform ||
    asdCRVFeeInfo.bountyPercentage !== deployConfig.AladdinSdCRV.ratio.harvest ||
    asdCRVFeeInfo.withdrawPercentage !== deployConfig.AladdinSdCRV.ratio.withdraw
  ) {
    const tx = await asdCRV.updateFeeInfo(
      DEPLOYED_CONTRACTS.Concentrator.Treasury,
      deployConfig.AladdinSdCRV.ratio.platform,
      deployConfig.AladdinSdCRV.ratio.harvest,
      deployConfig.AladdinSdCRV.ratio.withdraw
    );
    console.log(
      "asdCRV.updateFeeInfo",
      `platform[${asdCRVFeeInfo.platform}=>${DEPLOYED_CONTRACTS.Concentrator.Treasury}]`,
      `withdrawRatio[${ethers.utils.formatUnits(asdCRVFeeInfo.withdrawPercentage, 9)}=>${ethers.utils.formatUnits(
        deployConfig.AladdinSdCRV.ratio.withdraw,
        9
      )}]`,
      `bountyRatio[${ethers.utils.formatUnits(asdCRVFeeInfo.bountyPercentage, 9)}=>${ethers.utils.formatUnits(
        deployConfig.AladdinSdCRV.ratio.harvest,
        9
      )}]`,
      `platformRatio[${ethers.utils.formatUnits(asdCRVFeeInfo.platformPercentage, 9)}=>${ethers.utils.formatUnits(
        deployConfig.AladdinSdCRV.ratio.platform,
        9
      )}]`,
      `hash[${tx.hash}]`
    );
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  if (deployer.address !== "0x07dA2d30E26802ED65a52859a50872cfA615bD0A") {
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

  const cmd = process.env.CMD;

  if (cmd === "concentrator.eth") {
    await deployConcentratorETH();
  }

  if (cmd === "concentrator.cvxcrv") {
    await deployConcentratorCRV();
  }

  if (cmd === "concentrator.fxs") {
    await deployConcentratorFXS();
  }

  if (cmd === "concentrator.sdcrv") {
    await deployConcentratorStakeDAO();
  }

  if (cmd === "concentrator.abccvx") {
    await deployAbcCVX();
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

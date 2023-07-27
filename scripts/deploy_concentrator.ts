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
  Diamond,
  IDiamond,
  ManualCompoundingConvexCurveStrategy,
  ManualCompoundingCurveGaugeStrategy,
  ConcentratorVaultForAsdCRV__factory,
  ConcentratorVaultForAsdCRV,
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
    ConcentratorVaultForAsdCRV: {
      impl: string;
      proxy: string;
    };
    SdCRVBribeBurner: string;
  };
  PriceOracle: {
    AladdinPriceOracle: string;
    ChainlinkPriceOracle: string;
    CurveBasePoolPriceOracle: string;
    CurveV2PriceOracle: { [base: string]: string };
  };
  Diamonds: { [name: string]: string };
  Facets: {
    [name: string]: {
      address: string;
      selectors: string[];
    };
  };
} = {
  Strategy: {
    factory: "0x23384DD4380b3677b829C6c88c0Ea9cc41C099bb",
    impls: {
      AutoCompoundingConvexFraxStrategy: "0x6Cc546cE582b0dD106c231181f7782C79Ef401da",
      AutoCompoundingConvexCurveStrategy: constants.AddressZero,
      ManualCompoundingConvexCurveStrategy: "0xE25f0E29060AeC19a0559A2EF8366a5AF086222e",
      ManualCompoundingCurveGaugeStrategy: "0x188bd82BF11cC321F7872acdCa4B1a3Bf9a802dE",
      CLeverGaugeStrategy: constants.AddressZero,
      AMOConvexCurveStrategy: "0x2be5B652836C630E15c3530bf642b544ae901239",
    },
  },
  UpgradeableBeacon: {
    AladdinETH: {
      impl: "0xd3B15898d10B63Ddc309c287f7B68b768Afb777c",
      beacon: "0xC999894424b281cE8602B50DF5F2D57F91e852f7",
    },
    ConcentratorAladdinETHVault: {
      impl: "0x1af1639f02E03107d95c6d1670adE9E7262C9fA5",
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
        impl: "0xd3B15898d10B63Ddc309c287f7B68b768Afb777c",
      },
      vault: {
        proxy: "0x50B47c4A642231dbe0B411a0B2FBC1EBD129346D",
        impl: "0x1af1639f02E03107d95c6d1670adE9E7262C9fA5",
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
      impl: "0xCffd499C1A8699E0A57C82C95FCc9a33BB70ef90",
    },
    vault: {
      proxy: "0x3Cf54F3A1969be9916DAD548f3C084331C4450b5",
      impl: "0x4657e91f056a77493B7E47D4CCD8c8AFAfC84283",
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
      impl: "0x165A7a410C14054cd39d03b4b7Cb392f61be6EDc",
    },
    vault: {
      proxy: "0xD6E3BB7b1D6Fa75A71d48CFB10096d59ABbf99E1",
      impl: "0x4b5cfdc5d2b8185b73Deb54f9060D70D82b49fE7",
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
      impl: "0x705299acafCb8974057cEE1b7529ddA12A0042fc",
    },
    gauge: "0xc5022291cA8281745d173bB855DCd34dda67F2f0",
  },
  ConcentratorStakeDAO: {
    StakeDAOLockerProxy: {
      impl: "0xcB968efeFC641b832dB39470423CD88470c36075",
      proxy: "0x1c0D72a330F2768dAF718DEf8A19BAb019EEAd09",
    },
    VeSDTDelegation: {
      impl: "0xA5d31B528D2710af19E57fedA324483c14aE0F12",
      proxy: "0x6037Bb1BBa598bf88D816cAD90A28cC00fE3ff64",
      start: 1675728000, // Tue Feb 07 2023 00:00:00 GMT+0000
    },
    StakeDAOCRVVault: {
      impl: "0x0e20D8b0EC57cA8157d9bc2BEEc2c28a80Eaae8a",
      proxy: "0x2b3e72f568F96d7209E20C8B8f4F2A363ee1E3F6",
      gauge: "0x7f50786A0b15723D741727882ee99a0BF34e3466",
      lockDuration: 86400 * 1,
      ratio: {
        platform: 0e7 / 100, // 0%
        harvest: 2e7 / 100, // 2%
        boost: 15e7 / 100, // 15%
        withdraw: 0 / 100, // 0%
      },
    },
    AladdinSdCRV: {
      impl: "0x165A7a410C14054cd39d03b4b7Cb392f61be6EDc",
      proxy: "0x43E54C2E7b3e294De3A155785F52AB49d87B9922",
      ratio: {
        platform: 10e7, // 10%
        harvest: 2e7, // 2%
        withdraw: 0e7, // 0%
      },
    },
    ConcentratorVaultForAsdCRV: {
      impl: "0x0a6E1167c9b8599EE1decCB331AaC176E2aA0b97",
      proxy: "0x59866EC5650e9BA00c51f6D681762b48b0AdA3de",
    },
    SdCRVBribeBurner: "0xf98Af660d1ff28Cd986b205d6201FB1D5EE231A3",
  },
  PriceOracle: {
    AladdinPriceOracle: "0x304047F1D867A00082C8549E81a2F0b389d869B4",
    ChainlinkPriceOracle: "0xa1DeeC3F57567Ae1800433b698d2602acD544819",
    CurveBasePoolPriceOracle: "0x6e230F8Df4157aDd23Bd1BAA5D00b0a167B56a05",
    CurveV2PriceOracle: {
      WETH: "0x4dda42b56756c3fB0Aa654857B09D939A5e0B1DD",
      crvFRAX: "0x7aE753d916A812E6031Ce0774dE1d6D623c295F8",
    },
  },
  Diamonds: {
    ConcentratorHarvester: "0xfa86aa141e45da5183B42792d99Dede3D26Ec515",
  },
  Facets: {
    DiamondCutFacet: {
      address: "0x9a3c5ec5De774E30074E623e2BF35395Beee3C98",
      selectors: [
        "0x1f931c1c", // diamondCut((address,uint8,bytes4[])[],address,bytes)
      ],
    },
    DiamondLoupeFacet: {
      address: "0x190c58357B8dAb707FdCE1f646eE147f5c0ed85B",
      selectors: [
        "0x7a0ed627", // facets()
        "0xadfca15e", // facetFunctionSelectors(address)
        "0x52ef6b2c", // facetAddresses()
        "0xcdffacc6", // facetAddress(bytes4)
        "0x01ffc9a7", // supportsInterface(bytes4)
      ],
    },
    OwnershipFacet: {
      address: "0x359eB1D2F45dBE9E74C8c8F51FDe70fbf76f230F",
      selectors: [
        "0xf2fde38b", // transferOwnership(address)
        "0x8da5cb5b", // owner()
      ],
    },
    ConcentratorHarvesterFacet: {
      address: "0x1B544Befd7a51D5CDb40F79eEF5205f16A63Cd98",
      selectors: [
        "0xc76b4ae2", // minLockCTR()
        "0xd6a298e9", // minLockDuration()
        "0xc683630d", // isWhitelist(address)
        "0x333e99db", // isBlacklist(address)
        "0x97128e00", // hasPermission(address)
        "0xc7f884c6", // harvestConcentratorVault(address,uint256,uint256)
        "0x04117561", // harvestConcentratorCompounder(address,uint256)
        "0x0f45b177", // updatePermission(uint128,uint128)
        "0x0d392cd9", // updateWhitelist(address,bool)
        "0x9155e083", // updateBlacklist(address,bool)
      ],
    },
    StakeDaoHarvesterFacet: {
      address: "0xc56b67f58ecf4C9906548Cb28d13ba6B8F18249c",
      selectors: [
        "0xb0af8758", // harvestStakeDaoVault(address)
        "0xa486d532", // harvestStakeDaoVaultAndCompounder(address,address,uint256)
      ],
    },
    CLeverAMOHarvesterFacet: {
      address: "0xD912d922E7E6d11d5caaE204f7907F38E70AbEd2",
      selectors: [
        "0x7edadc04", // harvestCLeverAMO(address,uint256)
      ],
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
      const tx = await (strategy as ManualCompoundingConvexCurveStrategy).initialize(
        vault.address,
        underlying,
        vaultConfig.rewarder!,
        vaultConfig.rewards,
        {
          gasLimit: 1000000,
          maxFeePerGas,
          maxPriorityFeePerGas,
        }
      );
      console.log(
        `Initializing ${strategyName} for pool ${pool.name} with Compounder[${compounderName}], hash:`,
        tx.hash
      );
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    } else if (strategyName === "ManualCompoundingCurveGaugeStrategy") {
      const tx = await (strategy as ManualCompoundingCurveGaugeStrategy).initialize(
        vault.address,
        underlying,
        vaultConfig.gauge!,
        vaultConfig.rewards,
        {
          gasLimit: 1000000,
          maxFeePerGas,
          maxPriorityFeePerGas,
        }
      );
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
    ["cvxCRV", "FRAX"],
    ["cvxCRV", "CVX"],
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
    const impl = await AladdinCRVV2.deploy("0x971add32ea87f10bd192671630be3be8a11b8623", STAKED_CVXCRV);
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

  const proxyAdmin = await ethers.getContractAt("ProxyAdmin", DEPLOYED_CONTRACTS.Concentrator.ProxyAdmin, deployer);

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

  if (deployConfig.ConcentratorVaultForAsdCRV.impl === "") {
    const ConcentratorVaultForAsdCRV = await ethers.getContractFactory("ConcentratorVaultForAsdCRV", deployer);
    const impl = await ConcentratorVaultForAsdCRV.deploy();
    console.log("Deploying ConcentratorVaultForAsdCRV Impl, hash:", impl.deployTransaction.hash);
    const receipt = await impl.deployTransaction.wait();
    console.log("✅ Deploy ConcentratorVaultForAsdCRV Impl at:", impl.address, "gas used:", receipt.gasUsed.toString());
    deployConfig.ConcentratorVaultForAsdCRV.impl = impl.address;
  } else {
    console.log("Found ConcentratorVaultForAsdCRV Impl at:", deployConfig.ConcentratorVaultForAsdCRV.impl);
  }

  let vault: ConcentratorVaultForAsdCRV;
  if (deployConfig.ConcentratorVaultForAsdCRV.proxy !== "") {
    vault = await ethers.getContractAt(
      "ConcentratorVaultForAsdCRV",
      deployConfig.ConcentratorVaultForAsdCRV.proxy,
      deployer
    );
    console.log("Found ConcentratorVaultForAsdCRV at:", asdCRV.address);
  } else {
    const data = ConcentratorVaultForAsdCRV__factory.createInterface().encodeFunctionData("initialize", [
      asdCRV.address,
      DEPLOYED_CONTRACTS.AladdinZap,
      DEPLOYED_CONTRACTS.Concentrator.PlatformFeeDistributor,
    ]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(
      deployConfig.ConcentratorVaultForAsdCRV.impl,
      DEPLOYED_CONTRACTS.Concentrator.ProxyAdmin,
      data
    );
    console.log(`Deploying ConcentratorVaultForAsdCRV, hash:`, proxy.deployTransaction.hash);
    await proxy.deployed();
    const receipt = await proxy.deployTransaction.wait();
    console.log(`✅ Deploy ConcentratorVaultForAsdCRV, at:`, proxy.address, "gas used:", receipt.gasUsed.toString());

    vault = await ethers.getContractAt("ConcentratorVaultForAsdCRV", proxy.address, deployer);
    deployConfig.ConcentratorVaultForAsdCRV.proxy = vault.address;
  }

  if (deployConfig.SdCRVBribeBurner !== "") {
    const burner = await ethers.getContractAt("SdCRVBribeBurner", deployConfig.SdCRVBribeBurner, deployer);
    console.log("Found SdCRVBribeBurner at:", burner.address);
  } else {
    const SdCRVBribeBurner = await ethers.getContractFactory("SdCRVBribeBurner", deployer);
    const burner = await SdCRVBribeBurner.deploy(DEPLOYED_CONTRACTS.TokenZapLogic);
    console.log("Deploying SdCRVBribeBurner, hash:", burner.deployTransaction.hash);
    const receipt = await burner.deployTransaction.wait();
    console.log("✅ Deploy SdCRVBribeBurner at:", burner.address, "gas used:", receipt.gasUsed.toString());
    deployConfig.SdCRVBribeBurner = burner.address;
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

  await addVaults(deployer, "asdCRV", DEPLOYED_VAULTS.asdCRV, vault);
}

async function deployPriceOracle() {
  const [deployer] = await ethers.getSigners();
  const deployConfig = config.PriceOracle;

  if (deployConfig.AladdinPriceOracle === "") {
    const AladdinPriceOracle = await ethers.getContractFactory("AladdinPriceOracle", deployer);
    const oracle = await AladdinPriceOracle.deploy();
    console.log("Deploying AladdinPriceOracle, hash:", oracle.deployTransaction.hash);
    const receipt = await oracle.deployTransaction.wait();
    console.log("✅ Deploy AladdinPriceOracle at:", oracle.address, "gas used:", receipt.gasUsed.toString());
    deployConfig.AladdinPriceOracle = oracle.address;
  } else {
    console.log("Found AladdinPriceOracle at:", deployConfig.AladdinPriceOracle);
  }

  if (deployConfig.ChainlinkPriceOracle === "") {
    const ChainlinkPriceOracle = await ethers.getContractFactory("ChainlinkPriceOracle", deployer);
    const oracle = await ChainlinkPriceOracle.deploy();
    console.log("Deploying ChainlinkPriceOracle, hash:", oracle.deployTransaction.hash);
    const receipt = await oracle.deployTransaction.wait();
    console.log("✅ Deploy ChainlinkPriceOracle at:", oracle.address, "gas used:", receipt.gasUsed.toString());
    deployConfig.ChainlinkPriceOracle = oracle.address;
  } else {
    console.log("Found ChainlinkPriceOracle at:", deployConfig.ChainlinkPriceOracle);
  }

  if (deployConfig.CurveBasePoolPriceOracle === "") {
    const CurveBasePoolPriceOracle = await ethers.getContractFactory("CurveBasePoolPriceOracle", deployer);
    const oracle = await CurveBasePoolPriceOracle.deploy(deployConfig.ChainlinkPriceOracle, {
      nonce: 516,
      gasPrice: 23.1e9,
    });
    console.log("Deploying CurveBasePoolPriceOracle, hash:", oracle.deployTransaction.hash);
    const receipt = await oracle.deployTransaction.wait();
    console.log("✅ Deploy CurveBasePoolPriceOracle at:", oracle.address, "gas used:", receipt.gasUsed.toString());
    deployConfig.CurveBasePoolPriceOracle = oracle.address;
  } else {
    console.log("Found CurveBasePoolPriceOracle at:", deployConfig.CurveBasePoolPriceOracle);
  }

  // WETH base CurveV2
  if (deployConfig.CurveV2PriceOracle.WETH === "") {
    const CurveV2PriceOracle = await ethers.getContractFactory("CurveV2PriceOracle", deployer);
    const oracle = await CurveV2PriceOracle.deploy(deployConfig.ChainlinkPriceOracle, TOKENS.WETH.address);
    console.log("Deploying CurveV2PriceOracle.WETH, hash:", oracle.deployTransaction.hash);
    const receipt = await oracle.deployTransaction.wait();
    console.log("✅ Deploy CurveV2PriceOracle.WETH at:", oracle.address, "gas used:", receipt.gasUsed.toString());
    deployConfig.CurveV2PriceOracle.WETH = oracle.address;
  } else {
    console.log("Found CurveV2PriceOracle.WETH at:", deployConfig.CurveV2PriceOracle.WETH);
  }

  // crvFRAX base CurveV2
  if (deployConfig.CurveV2PriceOracle.crvFRAX === "") {
    const CurveV2PriceOracle = await ethers.getContractFactory("CurveV2PriceOracle", deployer);
    const oracle = await CurveV2PriceOracle.deploy(deployConfig.CurveBasePoolPriceOracle, TOKENS.crvFRAX.address);
    console.log("Deploying CurveV2PriceOracle.crvFRAX, hash:", oracle.deployTransaction.hash);
    const receipt = await oracle.deployTransaction.wait();
    console.log("✅ Deploy CurveV2PriceOracle.crvFRAX at:", oracle.address, "gas used:", receipt.gasUsed.toString());
    deployConfig.CurveV2PriceOracle.crvFRAX = oracle.address;
  } else {
    console.log("Found CurveV2PriceOracle.crvFRAX at:", deployConfig.CurveV2PriceOracle.crvFRAX);
  }

  // set chainlink oracle
  {
    const CHAINLINK_FEEDS: { [symbol: string]: string } = {
      CRV: "0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f",
      CVX: "0xd962fC30A72A84cE50161031391756Bf2876Af5D",
      DAI: "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9",
      USDC: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
      USDT: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
      FRAX: "0xB9E1E3A9feFf48998E45Fa90847ed4D467E8BcfD",
      WETH: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    };
    const oracle = await ethers.getContractAt("ChainlinkPriceOracle", deployConfig.ChainlinkPriceOracle, deployer);
    const symbols: string[] = [];
    for (const symbol of ["WETH", "USDC", "DAI", "USDT", "FRAX"]) {
      const feed = (await oracle.feeds(TOKENS[symbol].address)).feed;
      if (feed === constants.AddressZero) {
        symbols.push(symbol);
      } else {
        console.log(`Found feed for ChainlinkPriceOracle/${symbol} at ${feed}`);
      }
    }
    if (symbols.length > 0) {
      const addresses = symbols.map((s) => TOKENS[s].address);
      const feeds = symbols.map((s) => CHAINLINK_FEEDS[s]);
      const tx = await oracle.setFeeds(addresses, feeds);
      console.log("Setup ChainlinkPriceOracle", `symbols[${symbols}]`, `feeds[${feeds}]`, `hash[${tx.hash}]`);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }
  }

  // set curve base pool oracle
  {
    const oracle = await ethers.getContractAt(
      "CurveBasePoolPriceOracle",
      deployConfig.CurveBasePoolPriceOracle,
      deployer
    );
    const POOLS: { [symbol: string]: string } = {
      crvFRAX: "0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2",
      TRICRV: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
    };
    const symbols: string[] = [];
    for (const symbol of ["TRICRV", "crvFRAX"]) {
      const pool = await oracle.pools(TOKENS[symbol].address);
      if (pool === constants.AddressZero) {
        symbols.push(symbol);
      } else {
        console.log(`Found pool for CurveBasePoolPriceOracle/${symbol} at ${pool}`);
      }
    }
    if (symbols.length > 0) {
      const addresses = symbols.map((s) => TOKENS[s].address);
      const pools = symbols.map((s) => POOLS[s]);
      const tx = await oracle.setPools(addresses, pools);
      console.log("Setup CurveBasePoolPriceOracle", `symbols[${symbols}]`, `pools[${pools}]`, `hash[${tx.hash}]`);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }
  }

  // set curve v2 oracle, WETH base
  {
    const WETH_POOLS: { [symbol: string]: string } = {
      CRV: "0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511",
      CVX: "0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4",
      LDO: "0x9409280DC1e6D33AB7A8C6EC03e5763FB61772B5",
      YFI: "0xC26b89A667578ec7b3f11b2F98d6Fd15C07C54ba",
      KP3R: "0x21410232B484136404911780bC32756D5d1a9Fa9",
      cbETH: "0x5FAE7E604FC3e24fd43A72867ceBaC94c65b404A",
      T: "0x752eBeb79963cf0732E9c0fec72a49FD1DEfAEAC",
      GEAR: "0x0E9B5B092caD6F1c5E6bc7f89Ffe1abb5c95F1C2",
    };
    const oracle = await ethers.getContractAt("CurveV2PriceOracle", deployConfig.CurveV2PriceOracle.WETH, deployer);
    const symbols: string[] = [];
    for (const symbol of ["CRV", "CVX"]) {
      const pool = (await oracle.pools(TOKENS[symbol].address)).pool;
      if (pool === constants.AddressZero) {
        symbols.push(symbol);
      } else {
        console.log(`Found pool for CurveV2PriceOracle.WETH/${symbol} at ${pool}`);
      }
    }
    if (symbols.length > 0) {
      const addresses = symbols.map((s) => TOKENS[s].address);
      const pools = symbols.map((s) => WETH_POOLS[s]);
      const tx = await oracle.setPools(addresses, pools);
      console.log("Setup CurveV2PriceOracle.WETH", `symbols[${symbols}]`, `pools[${pools}]`, `hash[${tx.hash}]`);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }
  }

  // set curve v2 oracle, crvFRAX base
  {
    const FRAXBP_POOLS: { [symbol: string]: string } = {
      cvxFXS: "0x21d158d95c2e150e144c36fc64e3653b8d6c6267",
      RSR: "0x6a6283ab6e31c2aec3fa08697a8f806b740660b2",
      cvxCRV: "0x31c325a01861c7dbd331a9270296a31296d797a0",
      CVX: "0xbec570d92afb7ffc553bdd9d4b4638121000b10d",
      BADGER: "0x13b876c26ad6d21cb87ae459eaf6d7a1b788a113",
      agEUR: "0x58257e4291f95165184b4bea7793a1d6f8e7b627",
      SDT: "0x3e3c6c7db23cddef80b694679aaf1bcd9517d0ae",
      ALCX: "0x4149d1038575ce235e03e03b39487a80fd709d31",
    };
    const oracle = await ethers.getContractAt("CurveV2PriceOracle", deployConfig.CurveV2PriceOracle.crvFRAX, deployer);
    const symbols: string[] = [];
    for (const symbol of ["cvxCRV"]) {
      const pool = (await oracle.pools(TOKENS[symbol].address)).pool;
      if (pool === constants.AddressZero) {
        symbols.push(symbol);
      } else {
        console.log(`Found pool for CurveV2PriceOracle.crvFRAX/${symbol} at ${pool}`);
      }
    }
    if (symbols.length > 0) {
      const addresses = symbols.map((s) => TOKENS[s].address);
      const pools = symbols.map((s) => FRAXBP_POOLS[s]);
      const tx = await oracle.setPools(addresses, pools);
      console.log("Setup CurveV2PriceOracle.crvFRAX", `symbols[${symbols}]`, `pools[${pools}]`, `hash[${tx.hash}]`);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }
  }

  // set aladdin oracle
  {
    const SOURCES: { [symbol: string]: string } = {
      CRV: deployConfig.CurveV2PriceOracle.WETH,
      CVX: deployConfig.CurveV2PriceOracle.WETH,
      cvxCRV: deployConfig.CurveV2PriceOracle.crvFRAX,
      TRICRV: deployConfig.CurveBasePoolPriceOracle,
    };
    const oracle = await ethers.getContractAt("AladdinPriceOracle", deployConfig.AladdinPriceOracle, deployer);
    const symbols: string[] = [];
    for (const symbol of ["CRV", "CVX", "cvxCRV", "TRICRV"]) {
      const source = await oracle.sources(TOKENS[symbol].address);
      if (source === constants.AddressZero) {
        symbols.push(symbol);
      } else {
        console.log(`Found source for AladdinPriceOracle/${symbol} at ${source}`);
      }
    }
    if (symbols.length > 0) {
      const addresses = symbols.map((s) => TOKENS[s].address);
      const sources = symbols.map((s) => SOURCES[s]);
      const tx = await oracle.setSources(addresses, sources);
      console.log("Setup AladdinPriceOracle", `symbols[${symbols}]`, `sources[${sources}]`, `hash[${tx.hash}]`);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }
  }
}

async function deployConcentratorHarvester() {
  const [deployer] = await ethers.getSigners();
  const facets = config.Facets;
  const diamonds = config.Diamonds;
  for (const name of [
    "OwnershipFacet",
    "DiamondLoupeFacet",
    "DiamondCutFacet",
    "ConcentratorHarvesterFacet",
    "StakeDaoHarvesterFacet",
    "CLeverAMOHarvesterFacet",
  ]) {
    if (facets[name].address !== "") {
      console.log(`Found ${name} at: ${facets[name].address}`);
    } else {
      const contract = await ethers.getContractFactory(name, deployer);
      const facet = await contract.deploy();
      console.log(`Deploying ${name}, hash:`, facet.deployTransaction.hash);
      const receipt = await facet.deployTransaction.wait();
      console.log(`✅ Deploy ${name} at:`, facet.address, "gas used:", receipt.gasUsed.toString());
      facets[name].address = facet.address;
    }
  }

  let diamond: Diamond;
  if (diamonds.ConcentratorHarvester !== "") {
    diamond = await ethers.getContractAt("Diamond", diamonds.ConcentratorHarvester, deployer);
    console.log("Found ConcentratorHarvester Diamond at:", diamond.address);
  } else {
    const Diamond = await ethers.getContractFactory("Diamond", deployer);
    const diamondCuts: IDiamond.FacetCutStruct[] = [];
    for (const name of [
      "OwnershipFacet",
      "DiamondLoupeFacet",
      "DiamondCutFacet",
      "ConcentratorHarvesterFacet",
      "StakeDaoHarvesterFacet",
      "CLeverAMOHarvesterFacet",
    ]) {
      diamondCuts.push({
        facetAddress: facets[name].address,
        action: 0,
        functionSelectors: facets[name].selectors,
      });
    }
    diamond = await Diamond.deploy(diamondCuts, {
      owner: deployer.address,
      init: constants.AddressZero,
      initCalldata: "0x",
    });
    console.log(`Deploying ConcentratorHarvester Diamond, hash:`, diamond.deployTransaction.hash);
    const receipt = await diamond.deployTransaction.wait();
    console.log(
      `✅ Deploy ConcentratorHarvester Diamond, at:`,
      diamond.address,
      "gas used:",
      receipt.gasUsed.toString()
    );
    diamonds.ConcentratorHarvester = diamond.address;
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
    "ManualCompoundingCurveGaugeStrategy",
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

  if (cmd === "concentrator.oracle") {
    await deployPriceOracle();
  }

  if (cmd === "concentrator.harvester") {
    await deployConcentratorHarvester();
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

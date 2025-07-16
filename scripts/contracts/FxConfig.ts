import { MaxUint256, ZeroAddress, ethers } from "ethers";

import { TOKENS } from "@/utils/index";

export const DeployedGauges: {
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
  "fxUSD+rUSD": {
    token: TOKENS["CURVE_STABLE_NG_fxUSD/rUSD_138"].address,
    rewarder: "0x5ab09936cD1e186Fb82a2762CfbD0Ced10633c50",
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "alUSD+fxUSD": {
    token: TOKENS["CURVE_STABLE_NG_alUSD/fxUSD_139"].address,
    rewarder: "0x720154D25092804244D1638Eca532536631cE461",
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "eUSD+fxUSD": {
    token: TOKENS["CURVE_STABLE_NG_eUSD/fxUSD_114"].address,
    rewarder: "0x056056063ba7cE97fB4a1bCAaeDEE6AB0DA2Ac6a",
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "rgUSD+fxUSD": {
    token: TOKENS["CURVE_STABLE_NG_rgUSD/fxUSD_127"].address,
    rewarder: "0xd39D1F27C1a4b2aCd10C493D9639384bE024Dc2B",
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "MIM+fxUSD": {
    token: TOKENS["CURVE_STABLE_NG_MIM/fxUSD_141"].address,
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "zunUSD+fxUSD": {
    token: TOKENS["CURVE_S_NG_zunUSD/fxUSD_179"].address,
    rewarder: "0xeB503b47F192e83b73Dc39185f61114e94e644B8",
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "USDC+fxUSD": {
    token: TOKENS["CURVE_S_NG_USDC/fxUSD_193"].address,
    rewarder: "0x64973eE75eB00B99E99EEb8c380550a5C4Eb680d",
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "USD0+fxUSD": {
    token: TOKENS["CURVE_S_NG_USD0/fxUSD_195"].address,
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "fxUSD+rUSD+btcUSD": {
    token: TOKENS["CURVE_S_NG_fxUSD/rUSD/btcUSD_204"].address,
    rewarder: "0xE00Da4e45b5ddF09C1E4AB99C7bb47C18687611F",
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "fxUSD+USDN": {
    token: TOKENS["CURVE_S_NG_fxUSD/USDN_387"].address,
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "reUSD+fxUSD": {
    token: TOKENS["CURVE_S_NG_reUSD/fxUSD_414"].address,
    rewarder: "0x46E764CC319f0033d35902b1ACf2CdA45C7B9b7b",
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
  "fxSAVE+scrvUSD": {
    token: TOKENS["CURVE_S_NG_fxSAVE/scrvUSD_475"].address,
    rewarder: "0x53Da3D4b0BC0F7db48CEACEd16e150fEC1165216",
    immutable: false,
    harvesterRatio: ethers.parseUnits("0.01", 9), // 1%
    managerRatio: ethers.parseUnits("0.01", 9), // 1%
  },
};

export const GaugeTypeLists: Array<{ name: string; weight: bigint }> = [
  { name: "Liquidity", weight: ethers.parseEther("1") },
  { name: "Rebalance Pool", weight: ethers.parseEther("1") },
  { name: "Fundraising", weight: ethers.parseEther("1") },
];

export const SaleConfig: {
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
  TokenSaleBase1: {
    cap: ethers.parseEther("10000000"),
    time: { WhitelistStartTime: 1738764000n, PublicStartTime: 1738764000n, SaleDuration: 604800n },
    tokens: [TOKENS.fxUSD.address],
    price: {
      InitialPrice: ethers.parseEther("0.2"),
      UpRatio: 0n,
      Variation: ethers.parseEther("1"),
    },
  },
  TokenSaleBase2: {
    cap: ethers.parseEther("10000000"),
    time: { WhitelistStartTime: 1738764000n, PublicStartTime: 1738764000n, SaleDuration: 604800n },
    tokens: [TOKENS.fxUSD.address],
    price: {
      InitialPrice: ethers.parseEther("0.1"),
      UpRatio: 0n,
      Variation: ethers.parseEther("1"),
    },
  },
};

export const MarketConfig: {
  [symbol: string]: {
    FractionalToken: {
      name: string;
      symbol: string;
    };
    LeveragedToken: {
      name: string;
      symbol: string;
    };
    Treasury: {
      HarvesterRatio: bigint;
      RebalancePoolRatio: bigint;
    };
    Market: {
      FractionalMintFeeRatio: { default: bigint; delta: bigint };
      LeveragedMintFeeRatio: { default: bigint; delta: bigint };
      FractionalRedeemFeeRatio: { default: bigint; delta: bigint };
      LeveragedRedeemFeeRatio: { default: bigint; delta: bigint };
      StabilityRatio: bigint;
    };
    BaseTokenCapacity: bigint;
    FxUSDMintCapacity: bigint;
    ReservePoolBonusRatio: bigint;
    FundingCostScale?: bigint;
  };
} = {
  wstETH: {
    FractionalToken: { name: "Fractional stETH", symbol: "fstETH" },
    LeveragedToken: { name: "Leveraged stETH", symbol: "xstETH" },
    Treasury: {
      HarvesterRatio: ethers.parseUnits("0.01", 9), // 1%,
      RebalancePoolRatio: ethers.parseUnits("0.5", 9), // 50%,
    },
    Market: {
      FractionalMintFeeRatio: { default: ethers.parseEther("0"), delta: 0n }, // 0% and 0%
      LeveragedMintFeeRatio: { default: ethers.parseEther("0.015"), delta: -ethers.parseEther("0.015") }, // 1.5% and -1.5%
      FractionalRedeemFeeRatio: { default: ethers.parseEther("0.0025"), delta: -ethers.parseEther("0.0025") }, // 0.25% and 0.25%
      LeveragedRedeemFeeRatio: { default: ethers.parseEther("0.015"), delta: ethers.parseEther("0.07") }, // 1.5% and 7%
      StabilityRatio: ethers.parseEther("1.3055"), // 130.55%
    },
    BaseTokenCapacity: ethers.parseEther("20000"),
    FxUSDMintCapacity: MaxUint256,
    ReservePoolBonusRatio: ethers.parseEther("0.05"), // 5%
  },
  sfrxETH: {
    FractionalToken: { name: "Fractional frxETH", symbol: "ffrxETH" },
    LeveragedToken: { name: "Leveraged frxETH", symbol: "xfrxETH" },
    Treasury: {
      HarvesterRatio: ethers.parseUnits("0.01", 9), // 1%,
      RebalancePoolRatio: ethers.parseUnits("0.5", 9), // 50%,
    },
    Market: {
      FractionalMintFeeRatio: { default: ethers.parseEther("0"), delta: 0n }, // 0% and 0%
      LeveragedMintFeeRatio: { default: ethers.parseEther("0.015"), delta: -ethers.parseEther("0.015") }, // 1.5% and -1.5%
      FractionalRedeemFeeRatio: { default: ethers.parseEther("0.0025"), delta: -ethers.parseEther("0.0025") }, // 0.25% and -0.25%
      LeveragedRedeemFeeRatio: { default: ethers.parseEther("0.015"), delta: ethers.parseEther("0.07") }, // 1.5% and 7%
      StabilityRatio: ethers.parseEther("1.3055"), // 130.55%
    },
    BaseTokenCapacity: ethers.parseEther("5000"),
    FxUSDMintCapacity: MaxUint256,
    ReservePoolBonusRatio: ethers.parseEther("0.05"), // 5%
  },
  weETH: {
    FractionalToken: { name: "Fractional eETH", symbol: "feETH" },
    LeveragedToken: { name: "Leveraged eETH", symbol: "xeETH" },
    Treasury: {
      HarvesterRatio: ethers.parseUnits("0.01", 9), // 1%,
      RebalancePoolRatio: ethers.parseUnits("0.5", 9), // 50%,
    },
    Market: {
      FractionalMintFeeRatio: { default: ethers.parseEther("0"), delta: 0n }, // 0% and 0%
      LeveragedMintFeeRatio: { default: ethers.parseEther("0.015"), delta: -ethers.parseEther("0.015") }, // 2% and -2%
      FractionalRedeemFeeRatio: { default: ethers.parseEther("0.0025"), delta: -ethers.parseEther("0.0025") }, // 0.25% and -0.25%
      LeveragedRedeemFeeRatio: { default: ethers.parseEther("0.015"), delta: ethers.parseEther("0.07") }, // 2% and 7%
      StabilityRatio: ethers.parseEther("1.3055"), // 130.55%
    },
    BaseTokenCapacity: ethers.parseEther("5000"),
    FxUSDMintCapacity: MaxUint256,
    ReservePoolBonusRatio: ethers.parseEther("0.05"), // 5%
  },
  apxETH: {
    FractionalToken: { name: "Fractional pxETH", symbol: "fpxETH" },
    LeveragedToken: { name: "Leveraged pxETH", symbol: "xpxETH" },
    Treasury: {
      HarvesterRatio: ethers.parseUnits("0.01", 9), // 1%,
      RebalancePoolRatio: ethers.parseUnits("0.5", 9), // 50%,
    },
    Market: {
      FractionalMintFeeRatio: { default: ethers.parseEther("0.0025"), delta: 0n }, // 0.25% and 0%
      LeveragedMintFeeRatio: { default: ethers.parseEther("0.01"), delta: -ethers.parseEther("0.01") }, // 1% and -1%
      FractionalRedeemFeeRatio: { default: ethers.parseEther("0.0025"), delta: -ethers.parseEther("0.0025") }, // 0.25% and -0.25%
      LeveragedRedeemFeeRatio: { default: ethers.parseEther("0.01"), delta: ethers.parseEther("0.07") }, // 1% and 7%
      StabilityRatio: ethers.parseEther("1.3055"), // 130.55%
    },
    BaseTokenCapacity: ethers.parseEther("10000"),
    FxUSDMintCapacity: MaxUint256,
    ReservePoolBonusRatio: ethers.parseEther("0.05"), // 5%
  },
  ezETH: {
    FractionalToken: { name: "Fractional ezETH", symbol: "fezETH" },
    LeveragedToken: { name: "Leveraged ezETH", symbol: "xezETH" },
    Treasury: {
      HarvesterRatio: ethers.parseUnits("0.01", 9), // 1%,
      RebalancePoolRatio: ethers.parseUnits("0.5", 9), // 50%,
    },
    Market: {
      FractionalMintFeeRatio: { default: ethers.parseEther("0"), delta: 0n }, // 0% and 0%
      LeveragedMintFeeRatio: { default: ethers.parseEther("0.02"), delta: -ethers.parseEther("0.02") }, // 2% and -2%
      FractionalRedeemFeeRatio: { default: ethers.parseEther("0.0025"), delta: -ethers.parseEther("0.0025") }, // 0.25% and -0.25%
      LeveragedRedeemFeeRatio: { default: ethers.parseEther("0.02"), delta: ethers.parseEther("0.07") }, // 1% and 7%
      StabilityRatio: ethers.parseEther("1.3055"), // 130.55%
    },
    BaseTokenCapacity: ethers.parseEther("200"),
    FxUSDMintCapacity: MaxUint256,
    ReservePoolBonusRatio: ethers.parseEther("0.05"), // 5%
  },
  aCVX: {
    FractionalToken: { name: "Fractional CVX", symbol: "fCVX" },
    LeveragedToken: { name: "Leveraged CVX", symbol: "xCVX" },
    Treasury: {
      HarvesterRatio: ethers.parseUnits("0.01", 9), // 1%,
      RebalancePoolRatio: ethers.parseUnits("0.5", 9), // 50%,
    },
    Market: {
      FractionalMintFeeRatio: { default: ethers.parseEther("0"), delta: 0n }, // 0% and 0%
      LeveragedMintFeeRatio: { default: ethers.parseEther("0.025"), delta: -ethers.parseEther("0.025") }, // 2.5% and -2.5%
      FractionalRedeemFeeRatio: { default: ethers.parseEther("0.001"), delta: -ethers.parseEther("0.001") }, // 0.1% and -0.1%
      LeveragedRedeemFeeRatio: { default: ethers.parseEther("0.001"), delta: ethers.parseEther("0.071") }, // 0.1% and 7%
      StabilityRatio: ethers.parseEther("1.50"), // 150%
    },
    BaseTokenCapacity: ethers.parseEther("500000"),
    FxUSDMintCapacity: MaxUint256,
    ReservePoolBonusRatio: ethers.parseEther("0.05"), // 5%
  },
  WBTC: {
    FractionalToken: { name: "Fractional WBTC", symbol: "fWBTC" },
    LeveragedToken: { name: "Leveraged WBTC", symbol: "xWBTC" },
    Treasury: {
      HarvesterRatio: ethers.parseUnits("0", 9), // 0%,
      RebalancePoolRatio: ethers.parseUnits("0.666666666", 9), // 50%,
    },
    Market: {
      FractionalMintFeeRatio: { default: ethers.parseEther("0"), delta: 0n }, // 0.25% and 0%
      LeveragedMintFeeRatio: { default: ethers.parseEther("0"), delta: -ethers.parseEther("0") }, // 0.25% and -0.25%
      FractionalRedeemFeeRatio: { default: ethers.parseEther("0.0025"), delta: -ethers.parseEther("0.0025") }, // 0.25% and -0.25%
      LeveragedRedeemFeeRatio: { default: ethers.parseEther("0.02"), delta: ethers.parseEther("0.07") }, // 2% and 7%
      StabilityRatio: ethers.parseEther("1.2192"), // 121.92%
    },
    BaseTokenCapacity: ethers.parseEther("200"),
    FxUSDMintCapacity: MaxUint256,
    ReservePoolBonusRatio: ethers.parseEther("0.05"), // 5%
    FundingCostScale: ethers.parseEther("0.75"),
  },
};

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
    StakingGauge: {
      [token: string]: string;
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

export interface FxUSDDeployment {
  EmptyContract: string;
  FxUSDRebalancer: string;
  FxUSDShareableRebalancePool: string;
  ShareableRebalancePoolV2: string;
  Implementation: {
    RewardTokenWrapper: string;
  };
  RewardTokenWrapper: string;
  Markets: {
    [baseToken: string]: {
      FractionalToken: {
        implementation: string;
        proxy: string;
      };
      LeveragedToken: {
        implementation: string;
        proxy: string;
      };
      Treasury: {
        implementation: string;
        proxy: string;
      };
      Market: {
        implementation: string;
        proxy: string;
      };
      FxInitialFund: string;
      RebalancePoolRegistry: string;
      RewardTokenWrapper?: string;
      RebalancePoolSplitter: { [symbol: string]: string };
      RebalancePoolGauge: string;
      RebalancePoolGaugeClaimer: string;
      RebalancePool: {
        [reward: string]: {
          pool: string;
          wrapper?: string;
        };
      };
    };
  };
  FxUSD: {
    implementation: string;
    proxy: {
      fxUSD: string;
      rUSD: string;
      btcUSD: string;
      cvxUSD: string;
    };
  };
}

export interface FxBaseDeployment {
  TokenSale1: string;
  TokenSale2: string;
}

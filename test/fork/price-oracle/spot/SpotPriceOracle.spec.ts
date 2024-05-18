/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { request_fork } from "@/test/utils";
import { SpotPriceOracle } from "@/types/index";
import { TOKENS } from "@/utils/tokens";
import { SpotPricePoolType, decodeSpotPricePool, encodeSpotPricePool } from "@/utils/codec";

interface ITestCase {
  fork: number;
  name: string;
  encoding: bigint;
  expected: bigint;
}

const UniswapV2TestCases: Array<ITestCase> = [
  {
    fork: 19752120,
    name: "ETH/USDT by Uniswap V2 ETH-USDT",
    encoding: encodeSpotPricePool("0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852", SpotPricePoolType.UniswapV2, {
      base_index: 0,
      base_scale: 0,
      quote_scale: 12,
    }),
    expected: ethers.parseEther("3319.713983498024214728"),
  },
  {
    fork: 19752120,
    name: "ETH/USDC by Uniswap V2 USDC-ETH",
    encoding: encodeSpotPricePool("0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc", SpotPricePoolType.UniswapV2, {
      base_index: 1,
      base_scale: 0,
      quote_scale: 12,
    }),
    expected: ethers.parseEther("3313.715894008618693665"),
  },
  {
    fork: 19752120,
    name: "ETH/DAI by Uniswap V2 DAI-ETH",
    encoding: encodeSpotPricePool("0xa478c2975ab1ea89e8196811f51a7b7ade33eb11", SpotPricePoolType.UniswapV2, {
      base_index: 1,
      base_scale: 0,
      quote_scale: 0,
    }),
    expected: ethers.parseEther("3306.744974232474060802"),
  },
  {
    fork: 19752120,
    name: "USDC/USDT by Uniswap V2 USDC-USDT",
    encoding: encodeSpotPricePool("0x3041cbd36888becc7bbcbc0045e3b1f144466f5f", SpotPricePoolType.UniswapV2, {
      base_index: 0,
      base_scale: 0,
      quote_scale: 0,
    }),
    expected: ethers.parseEther("1.000661598099234818"),
  },
  {
    fork: 19752120,
    name: "USDT/USDC by Uniswap V2 USDC-USDT",
    encoding: encodeSpotPricePool("0x3041cbd36888becc7bbcbc0045e3b1f144466f5f", SpotPricePoolType.UniswapV2, {
      base_index: 1,
      base_scale: 0,
      quote_scale: 0,
    }),
    expected: ethers.parseEther("0.9993388393234121"),
  },
];

const UniswapV3TestCases: Array<ITestCase> = [
  {
    fork: 19752120,
    name: "ETH/USDT by Uniswap V3 ETH/USDT 0.05%",
    encoding: encodeSpotPricePool("0x11b815efb8f581194ae79006d24e0d814b7697f6", SpotPricePoolType.UniswapV3, {
      base_index: 0,
      base_scale: 0,
      quote_scale: 12,
    }),
    expected: ethers.parseEther("3317.300257681337775849"),
  },
  {
    fork: 19752120,
    name: "ETH/USDT by Uniswap V3 ETH/USDT 0.3%",
    encoding: encodeSpotPricePool("0x4e68ccd3e89f51c3074ca5072bbac773960dfa36", SpotPricePoolType.UniswapV3, {
      base_index: 0,
      base_scale: 0,
      quote_scale: 12,
    }),
    expected: ethers.parseEther("3316.947271269431726161"),
  },
  {
    fork: 19752120,
    name: "ETH/USDC by Uniswap V3 USDC/ETH 0.05%",
    encoding: encodeSpotPricePool("0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640", SpotPricePoolType.UniswapV3, {
      base_index: 1,
      base_scale: 0,
      quote_scale: 12,
    }),
    expected: ethers.parseEther("3315.411429366375717049"),
  },
  {
    fork: 19752120,
    name: "ETH/USDC by Uniswap V3 USDC/ETH 0.3%",
    encoding: encodeSpotPricePool("0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8", SpotPricePoolType.UniswapV3, {
      base_index: 1,
      base_scale: 0,
      quote_scale: 12,
    }),
    expected: ethers.parseEther("3312.791551850453212401"),
  },
  {
    fork: 19752120,
    name: "WBTC/ETH by Uniswap V3 WBTC/ETH 0.3%",
    encoding: encodeSpotPricePool("0xcbcdf9626bc03e24f779434178a73a0b4bad62ed", SpotPricePoolType.UniswapV3, {
      base_index: 0,
      base_scale: 10,
      quote_scale: 0,
    }),
    expected: ethers.parseEther("19.344801268566215233"),
  },
  {
    fork: 19752120,
    name: "WBTC/ETH by Uniswap V3 WBTC/ETH 0.05%",
    encoding: encodeSpotPricePool("0x4585fe77225b41b697c938b018e2ac67ac5a20c0", SpotPricePoolType.UniswapV3, {
      base_index: 0,
      base_scale: 10,
      quote_scale: 0,
    }),
    expected: ethers.parseEther("19.305856081264549729"),
  },
  {
    fork: 19752120,
    name: "weETH/ETH by Uniswap V3 ETH/weETH 0.05%",
    encoding: encodeSpotPricePool("0x7a415b19932c0105c82fdb6b720bb01b0cc2cae3", SpotPricePoolType.UniswapV3, {
      base_index: 1,
      base_scale: 0,
      quote_scale: 0,
    }),
    expected: ethers.parseEther("1.036919680726971024"),
  },
  {
    fork: 19752120,
    name: "weETH/wstETH by Uniswap V3 wstETH/weETH 0.05%",
    encoding: encodeSpotPricePool("0xf47f04a8605be181e525d6391233cba1f7474182", SpotPricePoolType.UniswapV3, {
      base_index: 1,
      base_scale: 0,
      quote_scale: 0,
    }),
    expected: ethers.parseEther("0.890771422960106884"),
  },
  {
    fork: 19752120,
    name: "wstETH/ETH by Uniswap V3 wstETH/ETH 0.01%",
    encoding: encodeSpotPricePool("0x109830a1aaad605bbf02a9dfa7b0b92ec2fb7daa", SpotPricePoolType.UniswapV3, {
      base_index: 0,
      base_scale: 0,
      quote_scale: 0,
    }),
    expected: ethers.parseEther("1.164826185002730496"),
  },
  {
    fork: 19752120,
    name: "ezETH/ETH by Uniswap V3 ezETH/ETH 0.01%",
    encoding: encodeSpotPricePool("0xbe80225f09645f172b079394312220637c440a63", SpotPricePoolType.UniswapV3, {
      base_index: 0,
      base_scale: 0,
      quote_scale: 0,
    }),
    expected: ethers.parseEther("0.981988991769094929"),
  },
  {
    fork: 19752120,
    name: "WBTC/USDC by Uniswap V3 WBTC/USDC 0.3%",
    encoding: encodeSpotPricePool("0x99ac8ca7087fa4a2a1fb6357269965a2014abc35", SpotPricePoolType.UniswapV3, {
      base_index: 0,
      base_scale: 10,
      quote_scale: 12,
    }),
    expected: ethers.parseEther("64049.081470109208000025"),
  },
];

const BalancerV2WeightedTestCases: Array<ITestCase> = [
  {
    fork: 19752120,
    name: "BAL/ETH by Balancer V2 B-80BAL-20ETH",
    encoding: encodeSpotPricePool("0x5c6ee304399dbdb9c8ef030ab642b10820db8f56", SpotPricePoolType.BalancerV2Weighted, {
      base_index: 0,
      quote_index: 1,
      base_scale: 0,
      quote_scale: 0,
    }),
    expected: ethers.parseEther("0.001210917182997212"),
  },
  {
    fork: 19752120,
    name: "AAVE/wstETH by Balancer V2 20wstETH-80AAVE",
    encoding: encodeSpotPricePool("0x3de27efa2f1aa663ae5d458857e731c129069f29", SpotPricePoolType.BalancerV2Weighted, {
      base_index: 1,
      quote_index: 0,
      base_scale: 0,
      quote_scale: 0,
    }),
    expected: ethers.parseEther("0.024054514497673912"),
  },
  {
    fork: 19752120,
    name: "STG/USDC by Balancer V2 20USDC-50STG",
    encoding: encodeSpotPricePool("0x3ff3a210e57cfe679d9ad1e9ba6453a716c56a2e", SpotPricePoolType.BalancerV2Weighted, {
      base_index: 1,
      quote_index: 0,
      base_scale: 0,
      quote_scale: 12,
    }),
    expected: ethers.parseEther("0.540495444389876452"),
  },
  {
    fork: 19752120,
    name: "WBTC/ETH by Balancer V2 20WBTC-50ETH",
    encoding: encodeSpotPricePool("0xa6f548df93de924d73be7d25dc02554c6bd66db5", SpotPricePoolType.BalancerV2Weighted, {
      base_index: 0,
      quote_index: 1,
      base_scale: 10,
      quote_scale: 0,
    }),
    expected: ethers.parseEther("19.318993074603718223"),
  },
  {
    fork: 19752120,
    name: "rETH/WETH by Balancer V2 10RAI-6FLX-3rETH-26WETH-55RPL",
    encoding: encodeSpotPricePool("0xb721a3b209f8b598b926826f69280bee7a6bb796", SpotPricePoolType.BalancerV2Weighted, {
      base_index: 2,
      quote_index: 3,
      base_scale: 0,
      quote_scale: 0,
    }),
    expected: ethers.parseEther("1.055174752073536776"),
  },
];

const BalancerV2StableTestCases: Array<ITestCase> = [
  {
    fork: 19752120,
    name: "ezETHUnderlying/WETH by Balancer V2 ezETH-WETH-BPT",
    encoding: encodeSpotPricePool("0x596192bb6e41802428ac943d2f1476c1af25cc0e", SpotPricePoolType.BalancerV2Stable, {
      base_index: 0,
      quote_index: 1,
    }),
    expected: ethers.parseEther("0.974249138872683893"),
  },
  {
    fork: 19752120,
    name: "stETH/WETH by Balancer V2 wstETH-WETH-BPT",
    encoding: encodeSpotPricePool("0x93d199263632a4ef4bb438f1feb99e57b4b5f0bd", SpotPricePoolType.BalancerV2Stable, {
      base_index: 0,
      quote_index: 1,
    }),
    expected: ethers.parseEther("0.999880945003193414"),
  },
  {
    fork: 19752120,
    name: "GHO/USDC by Balancer V2 GHO/USDC/USDT",
    encoding: encodeSpotPricePool("0x8353157092ed8be69a9df8f95af097bbf33cb2af", SpotPricePoolType.BalancerV2Stable, {
      base_index: 0,
      quote_index: 1,
    }),
    expected: ethers.parseEther("0.997509050956825375"),
  },
  {
    fork: 19752120,
    name: "GHO/USDT by Balancer V2 GHO/USDC/USDT",
    encoding: encodeSpotPricePool("0x8353157092ed8be69a9df8f95af097bbf33cb2af", SpotPricePoolType.BalancerV2Stable, {
      base_index: 0,
      quote_index: 2,
    }),
    expected: ethers.parseEther("0.998022771665361957"),
  },
  {
    fork: 19752120,
    name: "USDC/USDT by Balancer V2 GHO/USDC/USDT",
    encoding: encodeSpotPricePool("0x8353157092ed8be69a9df8f95af097bbf33cb2af", SpotPricePoolType.BalancerV2Stable, {
      base_index: 1,
      quote_index: 2,
    }),
    expected: ethers.parseEther("1.000515003556152009"),
  },
  {
    fork: 19752120,
    name: "USDT/USDC by Balancer V2 GHO/USDC/USDT",
    encoding: encodeSpotPricePool("0x8353157092ed8be69a9df8f95af097bbf33cb2af", SpotPricePoolType.BalancerV2Stable, {
      base_index: 2,
      quote_index: 1,
    }),
    expected: ethers.parseEther("0.999485261535987444"),
  },
  {
    fork: 19752120,
    name: "frxETH/stETH by Balancer V2 wstETH-sfrxETH-rETH",
    encoding: encodeSpotPricePool("0x42ed016f826165c2e5976fe5bc3df540c5ad0af7", SpotPricePoolType.BalancerV2Stable, {
      base_index: 1,
      quote_index: 0,
    }),
    expected: ethers.parseEther("0.996949247612814612"),
  },
];

const CurvePlainTestCases: Array<ITestCase> = [
  {
    fork: 19752120,
    name: "USDC/USDT by Curve 3pool DAI/USDC/USDT",
    encoding: encodeSpotPricePool("0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7", SpotPricePoolType.CurvePlain, {
      tokens: 3,
      base_index: 1,
      quote_index: 2,
      has_amm_precise: false,
      scales: [0, 12, 12],
    }),
    expected: ethers.parseEther("1.000609906067492315"),
  },
  {
    fork: 19752120,
    name: "stETH/ETH by Curve steth ETH/stETH",
    encoding: encodeSpotPricePool("0xdc24316b9ae028f1497c275eb9192a3ea0f67022", SpotPricePoolType.CurvePlain, {
      tokens: 2,
      base_index: 1,
      quote_index: 0,
      has_amm_precise: true,
      scales: [0, 0],
    }),
    expected: ethers.parseEther("0.999889824509074675"),
  },
  {
    fork: 19752120,
    name: "FRAX/USDC by Curve fraxusdc FRAX/USDC",
    encoding: encodeSpotPricePool("0xdcef968d416a41cdac0ed8702fac8128a64241a2", SpotPricePoolType.CurvePlain, {
      tokens: 2,
      base_index: 0,
      quote_index: 1,
      has_amm_precise: true,
      scales: [0, 12],
    }),
    expected: ethers.parseEther("0.998602126216327138"),
  },
  {
    fork: 19752120,
    name: "frxETH/stETH by Curve stETH/frxETH",
    encoding: encodeSpotPricePool("0x4d9f9D15101EEC665F77210cB999639f760F831E", SpotPricePoolType.CurvePlain, {
      tokens: 2,
      base_index: 1,
      quote_index: 0,
      has_amm_precise: true,
      scales: [0, 0],
    }),
    expected: ethers.parseEther("0.997240484347644939"),
  },
];

const CurvePlainWithOracleTestCases: Array<ITestCase> = [
  {
    fork: 19752120,
    name: "frxETH/ETH by Curve frxeth ETH/frxETH, no cache",
    encoding: encodeSpotPricePool(
      "0xa1f8a6807c402e4a15ef4eba36528a3fed24e577",
      SpotPricePoolType.CurvePlainWithOracle,
      {
        base_index: 1,
        use_cache: false,
      }
    ),
    expected: ethers.parseEther("0.996694298849812058"),
  },
  {
    fork: 19752120,
    name: "frxETH/ETH by Curve WETH/frxETH, no cache",
    encoding: encodeSpotPricePool(
      "0x9c3b46c0ceb5b9e304fcd6d88fc50f7dd24b31bc",
      SpotPricePoolType.CurvePlainWithOracle,
      {
        base_index: 1,
        use_cache: false,
      }
    ),
    expected: ethers.parseEther("0.996672265561320278"),
  },
  {
    fork: 19752120,
    name: "frxETH/ETH by Curve WETH/frxETH",
    encoding: encodeSpotPricePool(
      "0x9c3b46c0ceb5b9e304fcd6d88fc50f7dd24b31bc",
      SpotPricePoolType.CurvePlainWithOracle,
      {
        base_index: 1,
        use_cache: true,
      }
    ),
    expected: ethers.parseEther("0.996672265509764609"),
  },
];

const CurvePlainNGTestCases: Array<ITestCase> = [
  {
    fork: 19752120,
    name: "ezETHUnderlying/ETH by Curve ezETH/WETH, no cache",
    encoding: encodeSpotPricePool("0x85de3add465a219ee25e04d22c39ab027cf5c12e", SpotPricePoolType.CurvePlainNG, {
      base_index: 0,
      quote_index: 1,
      use_cache: false,
    }),
    expected: ethers.parseEther("0.973665548316908716"),
  },
  {
    fork: 19752120,
    name: "eETH/ETH by Curve weETH/WETH, no cache",
    encoding: encodeSpotPricePool("0x13947303f63b363876868d070f14dc865c36463b", SpotPricePoolType.CurvePlainNG, {
      base_index: 0,
      quote_index: 1,
      use_cache: false,
    }),
    expected: ethers.parseEther("0.999987172238060857"),
  },
  {
    fork: 19752120,
    name: "USDC/PYUSD by Curve PYUSD/USDC, no cache",
    encoding: encodeSpotPricePool("0x383e6b4437b59fff47b619cba855ca29342a8559", SpotPricePoolType.CurvePlainNG, {
      base_index: 1,
      quote_index: 0,
      use_cache: false,
    }),
    expected: ethers.parseEther("1.000197391972776221"),
  },
  {
    fork: 19752120,
    name: "ezETHUnderlying/ETH by Curve ezETH/WETH",
    encoding: encodeSpotPricePool("0x85de3add465a219ee25e04d22c39ab027cf5c12e", SpotPricePoolType.CurvePlainNG, {
      base_index: 0,
      quote_index: 1,
      use_cache: true,
    }),
    expected: ethers.parseEther("0.973665567060388291"),
  },
  {
    fork: 19752120,
    name: "eETH/ETH by Curve weETH/WETH",
    encoding: encodeSpotPricePool("0x13947303f63b363876868d070f14dc865c36463b", SpotPricePoolType.CurvePlainNG, {
      base_index: 0,
      quote_index: 1,
      use_cache: true,
    }),
    expected: ethers.parseEther("0.999987178645456716"),
  },
  {
    fork: 19752120,
    name: "USDC/PYUSD by Curve PYUSD/USDC",
    encoding: encodeSpotPricePool("0x383e6b4437b59fff47b619cba855ca29342a8559", SpotPricePoolType.CurvePlainNG, {
      base_index: 1,
      quote_index: 0,
      use_cache: true,
    }),
    expected: ethers.parseEther("1.000202981563437642"),
  },
];

const CurveCryptoTestCases: Array<ITestCase> = [
  {
    fork: 19752120,
    name: "STG/USDC by Curve STG/USDC",
    encoding: encodeSpotPricePool("0x3211c6cbef1429da3d0d58494938299c92ad5860", SpotPricePoolType.CurveCrypto, {
      base_index: 0,
    }),
    expected: ethers.parseEther("0.537088031230011034"),
  },
  {
    fork: 19752120,
    name: "EURS/USDC by Curve eursusd USDC/EURS",
    encoding: encodeSpotPricePool("0x98a7f18d4e56cfe84e3d081b40001b3d5bd3eb8b", SpotPricePoolType.CurveCrypto, {
      base_index: 1,
    }),
    expected: ethers.parseEther("1.065329191299497621"),
  },
  {
    fork: 19752120,
    name: "CVX/ETH by Curve cvxeth ETH/CVX",
    encoding: encodeSpotPricePool("0xb576491f1e6e5e62f1d8f26062ee822b40b0e0d4", SpotPricePoolType.CurveCrypto, {
      base_index: 1,
    }),
    expected: ethers.parseEther("0.000814676242375373"),
  },
  {
    fork: 19752120,
    name: "cbETH/ETH by Curve cvxeth ETH/cbETH",
    encoding: encodeSpotPricePool("0x5fae7e604fc3e24fd43a72867cebac94c65b404a", SpotPricePoolType.CurveCrypto, {
      base_index: 1,
    }),
    expected: ethers.parseEther("1.066907484017562837"),
  },
];

const CurveTriCryptoTestCases: Array<ITestCase> = [
  {
    fork: 19752120,
    name: "WBTC/USDC by Curve TricryptoUSDC USDC/WBTC/ETH",
    encoding: encodeSpotPricePool("0x7f86bf177dd4f3494b841a37e810a34dd56c829b", SpotPricePoolType.CurveTriCrypto, {
      base_index: 1,
      quote_index: 0,
    }),
    expected: ethers.parseEther("64001.324668811978711136"),
  },
  {
    fork: 19752120,
    name: "ETH/USDC by Curve TricryptoUSDC USDC/WBTC/ETH",
    encoding: encodeSpotPricePool("0x7f86bf177dd4f3494b841a37e810a34dd56c829b", SpotPricePoolType.CurveTriCrypto, {
      base_index: 2,
      quote_index: 0,
    }),
    expected: ethers.parseEther("3310.28069489938110841"),
  },
  {
    fork: 19752120,
    name: "WBTC/ETH by Curve TricryptoUSDC USDC/WBTC/ETH",
    encoding: encodeSpotPricePool("0x7f86bf177dd4f3494b841a37e810a34dd56c829b", SpotPricePoolType.CurveTriCrypto, {
      base_index: 1,
      quote_index: 2,
    }),
    expected: ethers.parseEther("19.334108061418445735"),
  },
];

const ERC4626TestCases: Array<ITestCase> = [
  {
    fork: 19752120,
    name: "sfrxETH/frxETH by ERC4626/sfrxETH",
    encoding: encodeSpotPricePool(TOKENS.sfrxETH.address, SpotPricePoolType.ERC4626, {
      base_is_underlying: false,
    }),
    expected: ethers.parseEther("1.084628381570964551"),
  },
  {
    fork: 19752120,
    name: "frxETH/sfrxETH by ERC4626/sfrxETH",
    encoding: encodeSpotPricePool(TOKENS.sfrxETH.address, SpotPricePoolType.ERC4626, {
      base_is_underlying: true,
    }),
    expected: ethers.parseEther("0.92197476854418599"),
  },
  {
    fork: 19752120,
    name: "apxETH/pxETH by ERC4626/apxETH",
    encoding: encodeSpotPricePool(TOKENS.apxETH.address, SpotPricePoolType.ERC4626, {
      base_is_underlying: false,
    }),
    expected: ethers.parseEther("1.024284484129897927"),
  },
  {
    fork: 19752120,
    name: "pxETH/apxETH by ERC4626/apxETH",
    encoding: encodeSpotPricePool(TOKENS.apxETH.address, SpotPricePoolType.ERC4626, {
      base_is_underlying: true,
    }),
    expected: ethers.parseEther("0.976291267015642602"),
  },
];

const ETHLSDTestCases: Array<ITestCase> = [
  {
    fork: 19752120,
    name: "wstETH/stETH by wstETH",
    encoding: encodeSpotPricePool(TOKENS.wstETH.address, SpotPricePoolType.ETHLSD, {
      base_is_ETH: false,
    }),
    expected: ethers.parseEther("1.164970742506368622"),
  },
  {
    fork: 19752120,
    name: "stETH/wstETH by wstETH",
    encoding: encodeSpotPricePool(TOKENS.wstETH.address, SpotPricePoolType.ETHLSD, {
      base_is_ETH: true,
    }),
    expected: ethers.parseEther("0.858390656102278237"),
  },
  {
    fork: 19752120,
    name: "weETH/eETH by weETH",
    encoding: encodeSpotPricePool(TOKENS.weETH.address, SpotPricePoolType.ETHLSD, {
      base_is_ETH: false,
    }),
    expected: ethers.parseEther("1.037161048184836228"),
  },
  {
    fork: 19752120,
    name: "eETH/weETH by weETH",
    encoding: encodeSpotPricePool(TOKENS.weETH.address, SpotPricePoolType.ETHLSD, {
      base_is_ETH: true,
    }),
    expected: ethers.parseEther("0.964170416687097157"),
  },
  {
    fork: 19752120,
    name: "ezETH/ETH by ezETH",
    encoding: encodeSpotPricePool(TOKENS.ezETH.address, SpotPricePoolType.ETHLSD, {
      base_is_ETH: false,
    }),
    expected: ethers.parseEther("1.008346884759635824"),
  },
  {
    fork: 19752120,
    name: "ETH/ezETH by ezETH",
    encoding: encodeSpotPricePool(TOKENS.ezETH.address, SpotPricePoolType.ETHLSD, {
      base_is_ETH: true,
    }),
    expected: ethers.parseEther("0.991722209007840086"),
  },
];

const BalancerV2CachedRateTestCases: Array<ITestCase> = [
  {
    fork: 19752120,
    name: "ezETH/WETH by Balancer V2 ezETH-WETH-BPT",
    encoding: encodeSpotPricePool(
      "0x596192bb6e41802428ac943d2f1476c1af25cc0e",
      SpotPricePoolType.BalancerV2CachedRate,
      {
        base_index: 1,
      }
    ),
    expected: ethers.parseEther("1.008346445507228219"),
  },
];

const TestCases = [
  ...UniswapV2TestCases,
  ...UniswapV3TestCases,
  ...BalancerV2WeightedTestCases,
  ...BalancerV2StableTestCases,
  ...CurvePlainTestCases,
  ...CurvePlainWithOracleTestCases,
  ...CurvePlainNGTestCases,
  ...CurveCryptoTestCases,
  ...CurveTriCryptoTestCases,
  ...ERC4626TestCases,
  ...ETHLSDTestCases,
  ...BalancerV2CachedRateTestCases,
];

describe("SpotPriceOracle.spec", async () => {
  let deployer: HardhatEthersSigner;

  let oracle: SpotPriceOracle;

  for (const testcase of TestCases) {
    context(`${testcase.name}`, async () => {
      beforeEach(async () => {
        request_fork(testcase.fork, [ZeroAddress]);
        deployer = await ethers.getSigner(ZeroAddress);

        const SpotPriceOracle = await ethers.getContractFactory("SpotPriceOracle", deployer);
        oracle = await SpotPriceOracle.deploy();
      });

      it("should succeed", async () => {
        console.log(decodeSpotPricePool(testcase.encoding));
        const price = await oracle.getSpotPrice(testcase.encoding);
        const gas = await oracle.getSpotPrice.estimateGas(testcase.encoding);
        console.log(`Price[${ethers.formatEther(price)}]`, `GasEstimated[${gas - 21000n}]`);
        if (testcase.name.includes("ERC4626")) {
          expect(price).to.closeTo(testcase.expected, testcase.expected / 1000n);
        } else {
          expect(price).to.eq(testcase.expected);
        }
      });
    });
  }
});

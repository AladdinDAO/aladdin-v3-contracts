/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { ConverterRegistry, GeneralTokenConverter } from "@/types/index";
import { Action, ADDRESS, encodePoolHintV3, PoolTypeV3, TOKENS } from "@/utils/index";

import { request_fork } from "../../../utils";

interface ISwapForkConfig {
  tokenIn: string;
  tokenOut: string;
  encoding: bigint;
  fork: number;
  deployer: string;
  holder: string;
  amountIn: string;
  amountOut: string;
}

describe("GeneralTokenConverter.spec", async () => {
  let converter: GeneralTokenConverter;
  let registry: ConverterRegistry;
  let deployer: HardhatEthersSigner;

  const UniswapV2Swaps: {
    [path: string]: ISwapForkConfig;
  } = {
    "FXS ==(UniswapV2.TWAMM.Swap)==> FRAX": {
      tokenIn: TOKENS.FXS.address,
      tokenOut: TOKENS.FRAX.address,
      encoding: encodePoolHintV3(ADDRESS.FXS_FRAX_FraxSwap, PoolTypeV3.UniswapV2, 2, 0, 1, Action.Swap, {
        fee_num: 997000,
        twamm: true,
      }),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      amountIn: "1000",
      amountOut: "6499.408538257086268933",
    },
    "ALCX ==(UniswapV2.Swap)==> WETH": {
      tokenIn: TOKENS.ALCX.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS.WETH_ALCX_UNIV2, PoolTypeV3.UniswapV2, 2, 1, 0, Action.Swap, {
        fee_num: 997000,
      }),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x000000000000000000000000000000000000dEaD",
      amountIn: "1000",
      amountOut: "7.675539244322534268",
    },
    "FXS ==(UniswapV2.Swap)==> FRAX": {
      tokenIn: TOKENS.FXS.address,
      tokenOut: TOKENS.FRAX.address,
      encoding: encodePoolHintV3(ADDRESS.FXS_FRAX_UNIV2, PoolTypeV3.UniswapV2, 2, 0, 1, Action.Swap, {
        fee_num: 997000,
      }),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      amountIn: "1000",
      amountOut: "5750.127795384376416510",
    },
    "INV ==(UniswapV2.Swap)==> WETH": {
      tokenIn: TOKENS.INV.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS.INV_WETH_UNIV2, PoolTypeV3.UniswapV2, 2, 0, 1, Action.Swap, {
        fee_num: 997000,
      }),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x6E7f42019C18132b8Ab0F0a8BeD4985D0C235161",
      amountIn: "1000",
      amountOut: "1.456118570299781715",
    },
    "SPELL ==(UniswapV2.Swap)==> WETH": {
      tokenIn: TOKENS.SPELL.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS.SPELL_WETH_UNIV2, PoolTypeV3.UniswapV2, 2, 0, 1, Action.Swap, {
        fee_num: 997000,
      }),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      amountIn: "10000000",
      amountOut: "3.177979944773205763",
    },
  };

  const UniswapV3Swaps: {
    [path: string]: ISwapForkConfig;
  } = {
    "USDC ==(UniswapV3.Swap)==> WETH": {
      tokenIn: TOKENS.USDC.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x28C6c06298d514Db089934071355E5743bf21d60",
      amountIn: "2000",
      amountOut: "1.024213000075615359",
    },
    "MET ==(UniswapV3.Swap)==> WETH": {
      tokenIn: TOKENS.MET.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS.MET_WETH_UNIV3_10000, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, {
        fee_num: 10000,
      }),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xFBb1b73C4f0BDa4f67dcA266ce6Ef42f520fBB98",
      amountIn: "2000",
      amountOut: "1.036264855146013570",
    },
    "OGV ==(UniswapV3.Swap)==> WETH": {
      tokenIn: TOKENS.OGV.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS.OGV_WETH_UNIV3_3000, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, {
        fee_num: 3000,
      }),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      amountIn: "1000000",
      amountOut: "2.598136215683916709",
    },
    "TUSD ==(UniswapV3.Pancake.Swap)==> USDT": {
      tokenIn: TOKENS.TUSD.address,
      tokenOut: TOKENS.USDT.address,
      encoding: encodePoolHintV3(ADDRESS.TUSD_USDT_PancakeV3_100, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, {
        fee_num: 100,
      }),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      amountIn: "10000",
      amountOut: "9986.253307",
    },
  };

  const BalancerV1Swaps: {
    [path: string]: ISwapForkConfig;
  } = {
    "AAVE ==(BalancerV1.Swap)==> WETH / two tokens": {
      tokenIn: TOKENS.AAVE.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS.AAVE_WETH_BalancerV1, PoolTypeV3.BalancerV1, 2, 0, 1, Action.Swap),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      amountIn: "100",
      amountOut: "3.879860510747447529",
    },
    "AAVE ==(BalancerV1.Swap)==> WETH / seven tokens": {
      tokenIn: TOKENS.AAVE.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(
        "0x49ff149d649769033d43783e7456f626862cd160",
        PoolTypeV3.BalancerV1,
        7,
        2,
        1,
        Action.Swap
      ),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      amountIn: "100",
      amountOut: "3.776164244698092758",
    },
  };

  const BalancerV2Swaps: {
    [path: string]: ISwapForkConfig;
  } = {
    "BAL ==(BalancerV2.Swap)==> WETH / WeightedPool2Tokens": {
      tokenIn: TOKENS.BAL.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS.BAL80_WETH20_BalancerV2, PoolTypeV3.BalancerV2, 2, 0, 1, Action.Swap),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      amountIn: "1000",
      amountOut: "1.965131554918829302",
    },
    "rETH ==(BalancerV2.Swap)==> WETH / MetaStablePool": {
      tokenIn: TOKENS.rETH.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS.Stable_rETH_WETH_BalancerV2, PoolTypeV3.BalancerV2, 2, 0, 1, Action.Swap),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x714301eB35fE043FAa547976ce15BcE57BD53144",
      amountIn: "100",
      amountOut: "108.503085701305992829",
    },
    "rETH ==(BalancerV2.Swap)==> wstETH-rETH-sfrxETH-BPT / ComposableStablePool": {
      tokenIn: TOKENS.rETH.address,
      tokenOut: ADDRESS.Stable_wstETH_sfrxETH_rETH_BalancerV2,
      encoding: encodePoolHintV3(
        ADDRESS.Stable_wstETH_sfrxETH_rETH_BalancerV2,
        PoolTypeV3.BalancerV2,
        4,
        3,
        0,
        Action.Swap
      ),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x714301eB35fE043FAa547976ce15BcE57BD53144",
      amountIn: "100",
      amountOut: "108.056862942883104938",
    },
    "rETH ==(BalancerV2.Swap)==> wstETH / ComposableStablePool": {
      tokenIn: TOKENS.rETH.address,
      tokenOut: TOKENS.wstETH.address,
      encoding: encodePoolHintV3(
        ADDRESS.Stable_wstETH_sfrxETH_rETH_BalancerV2,
        PoolTypeV3.BalancerV2,
        4,
        3,
        1,
        Action.Swap
      ),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x714301eB35fE043FAa547976ce15BcE57BD53144",
      amountIn: "100",
      amountOut: "95.108271492748635808",
    },
    "rETH ==(BalancerV2.Swap)==> frxETH / ComposableStablePool": {
      tokenIn: TOKENS.rETH.address,
      tokenOut: TOKENS.sfrxETH.address,
      encoding: encodePoolHintV3(
        ADDRESS.Stable_wstETH_sfrxETH_rETH_BalancerV2,
        PoolTypeV3.BalancerV2,
        4,
        3,
        2,
        Action.Swap
      ),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x714301eB35fE043FAa547976ce15BcE57BD53144",
      amountIn: "100",
      amountOut: "102.655366920506589925",
    },
    "auraBAL ==(BalancerV2.Swap)==> B-80BAL-20WETH / StablePool": {
      tokenIn: TOKENS.auraBAL.address,
      tokenOut: "0x5c6Ee304399DBdB9C8Ef030aB642B10820DB8F56",
      encoding: encodePoolHintV3(
        "0x3dd0843a028c86e0b760b1a76929d1c5ef93a2dd",
        PoolTypeV3.BalancerV2,
        2,
        1,
        0,
        Action.Swap
      ),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xc02A0fFc3a2B142954848f3605B341c42d1D58f4",
      amountIn: "1000",
      amountOut: "994.005521266258598419",
    },
  };

  const CurvePlainPoolSwaps: {
    [path: string]: ISwapForkConfig;
  } = {
    "sdCRV ==(CurvePlainPool.Swap)==> CRV": {
      tokenIn: TOKENS.sdCRV.address,
      tokenOut: TOKENS.CRV.address,
      encoding: encodePoolHintV3(ADDRESS["CURVE_CRV/sdCRV_V2_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x25431341A5800759268a6aC1d3CD91C029D7d9CA",
      amountIn: "1000",
      amountOut: "976.589209323566660308",
    },
    "CRV ==(CurvePlainPool.Swap)==> cvxCRV": {
      tokenIn: TOKENS.CRV.address,
      tokenOut: TOKENS.cvxCRV.address,
      encoding: encodePoolHintV3(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x25431341A5800759268a6aC1d3CD91C029D7d9CA",
      amountIn: "1000",
      amountOut: "1030.991452258856831178",
    },
    "FRAX ==(CurvePlainPool.Swap)==> USDC": {
      tokenIn: TOKENS.FRAX.address,
      tokenOut: TOKENS.USDC.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_FRAXUSDC_POOL, PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x4C569Fcdd8b9312B8010Ab2c6D865c63C4De5609",
      amountIn: "1000",
      amountOut: "999.126561",
    },
    "stETH ==(CurvePlainPool.Swap)==> WETH": {
      tokenIn: TOKENS.stETH.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xE3Ece6502d0A4c2593252607B5C8f93153145b90",
      amountIn: "1000",
      amountOut: "999.224267693111302169",
    },
    "WETH ==(CurvePlainPool.Swap)==> stETH / use_eth": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.stETH.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap, {
        use_eth: true,
      }),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "999.768867722417151044",
    },
    "TUSD ==(CurvePlainPool.Swap)==> crvUSD": {
      tokenIn: TOKENS.TUSD.address,
      tokenOut: TOKENS.crvUSD.address,
      encoding: encodePoolHintV3(ADDRESS["CURVE_TUSD/crvUSD_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      amountIn: "10000",
      amountOut: "9993.634586886330191493",
    },
    "sdFXS ==(CurvePlainPool.Swap)==> FXS": {
      tokenIn: TOKENS.sdFXS.address,
      tokenOut: TOKENS.FXS.address,
      encoding: encodePoolHintV3(ADDRESS["CURVE_FXS/sdFXS_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xC5d3D004a223299C4F95Bb702534C14A32e8778c",
      amountIn: "100",
      amountOut: "97.813438604075207410",
    },
    "WETH ==(CurvePlainPool.Add)==> ETH/stETH / use_eth": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: ADDRESS.CURVE_stETH_TOKEN,
      encoding: encodePoolHintV3(ADDRESS.CURVE_stETH_TOKEN, PoolTypeV3.CurvePlainPool, 2, 0, 0, Action.Add, {
        use_eth: true,
      }),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "925.965096579666181262",
    },
    "WETH ==(CurvePlainPool.Add)==> ETH/frxETH": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: ADDRESS.CURVE_frxETH_TOKEN,
      encoding: encodePoolHintV3(ADDRESS.CURVE_frxETH_TOKEN, PoolTypeV3.CurvePlainPool, 2, 0, 0, Action.Add, {
        use_eth: true,
      }),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "999.776110633340531006",
    },
    "DAI ==(CurvePlainPool.Add)==> 3CRV": {
      tokenIn: TOKENS.DAI.address,
      tokenOut: TOKENS.TRICRV.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_TRICRV_TOKEN, PoolTypeV3.CurvePlainPool, 3, 0, 0, Action.Add),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "10000",
      amountOut: "9733.157834119920680549",
    },
    "USDC ==(CurvePlainPool.Add)==> 3CRV": {
      tokenIn: TOKENS.USDC.address,
      tokenOut: TOKENS.TRICRV.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_TRICRV_TOKEN, PoolTypeV3.CurvePlainPool, 3, 1, 1, Action.Add),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "10000",
      amountOut: "9733.098120580819196408",
    },
    "USDT ==(CurvePlainPool.Add)==> 3CRV": {
      tokenIn: TOKENS.USDT.address,
      tokenOut: TOKENS.TRICRV.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_TRICRV_TOKEN, PoolTypeV3.CurvePlainPool, 3, 2, 2, Action.Add),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "10000",
      amountOut: "9730.974402061877104439",
    },
    "FRAX ==(CurvePlainPool.Add)==> crvFRAX": {
      tokenIn: TOKENS.FRAX.address,
      tokenOut: TOKENS.crvFRAX.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_FRAXUSDC_TOKEN, PoolTypeV3.CurvePlainPool, 2, 0, 0, Action.Add),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x267fc49a3170950Ee5d49eF84878695c29cCA1e0",
      amountIn: "10000",
      amountOut: "9980.183678451578076227",
    },
    "USDC ==(CurvePlainPool.Add)==> crvFRAX": {
      tokenIn: TOKENS.USDC.address,
      tokenOut: TOKENS.crvFRAX.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_FRAXUSDC_TOKEN, PoolTypeV3.CurvePlainPool, 2, 1, 1, Action.Add),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "10000",
      amountOut: "10000.188159252728250761",
    },
    "ETH/frxETH ==(CurvePlainPool.Remove)==> WETH": {
      tokenIn: ADDRESS.CURVE_frxETH_TOKEN,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_frxETH_TOKEN, PoolTypeV3.CurvePlainPool, 2, 0, 0, Action.Remove),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x38a93e70b0D8343657f802C1c3Fdb06aC8F8fe99",
      amountIn: "10",
      amountOut: "10.001930840287081988",
    },
    "3CRV ==(CurvePlainPool.Remove)==> DAI": {
      tokenIn: TOKENS.TRICRV.address,
      tokenOut: TOKENS.DAI.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_TRICRV_TOKEN, PoolTypeV3.CurvePlainPool, 3, 0, 0, Action.Remove),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xe74b28c2eAe8679e3cCc3a94d5d0dE83CCB84705",
      amountIn: "9715.608591360829671614",
      amountOut: "9980.888482718021783990",
    },
    "3CRV ==(CurvePlainPool.Remove)==> USDC": {
      tokenIn: TOKENS.TRICRV.address,
      tokenOut: TOKENS.USDC.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_TRICRV_TOKEN, PoolTypeV3.CurvePlainPool, 3, 1, 1, Action.Remove),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xe74b28c2eAe8679e3cCc3a94d5d0dE83CCB84705",
      amountIn: "9715.608591360829671614",
      amountOut: "9980.953887",
    },
    "3CRV ==(CurvePlainPool.Remove)==> USDT": {
      tokenIn: TOKENS.TRICRV.address,
      tokenOut: TOKENS.USDT.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_TRICRV_TOKEN, PoolTypeV3.CurvePlainPool, 3, 2, 2, Action.Remove),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xe74b28c2eAe8679e3cCc3a94d5d0dE83CCB84705",
      amountIn: "9715.608591360829671614",
      amountOut: "9983.370971",
    },
    "crvFRAX ==(CurvePlainPool.Remove)==> FRAX": {
      tokenIn: TOKENS.crvFRAX.address,
      tokenOut: TOKENS.FRAX.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_FRAXUSDC_TOKEN, PoolTypeV3.CurvePlainPool, 2, 0, 0, Action.Remove),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xb9b97135f01a5462E5F741854435C256Dd6CD3eE",
      amountIn: "10000",
      amountOut: "10019.464455369883117787",
    },
    "crvFRAX ==(CurvePlainPool.Remove)==> USDC": {
      tokenIn: TOKENS.crvFRAX.address,
      tokenOut: TOKENS.USDC.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_FRAXUSDC_TOKEN, PoolTypeV3.CurvePlainPool, 2, 1, 1, Action.Remove),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xb9b97135f01a5462E5F741854435C256Dd6CD3eE",
      amountIn: "10000",
      amountOut: "9998.197575",
    },
  };

  const CurveAPoolSwaps: {
    [path: string]: ISwapForkConfig;
  } = {
    "DAI ==(CurveAPool.Swap)==> USDT / aave": {
      tokenIn: TOKENS.DAI.address,
      tokenOut: TOKENS.USDT.address,
      encoding: encodePoolHintV3(
        "0xdebf20617708857ebe4f679508e7b7863a8a8eee",
        PoolTypeV3.CurveAPool,
        3,
        0,
        2,
        Action.Swap,
        { use_underlying: true }
      ),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "999.736101",
    },
    "aDAI ==(CurveAPool.Swap)==> aUSDT / aave": {
      tokenIn: "0x028171bCA77440897B824Ca71D1c56caC55b68A3",
      tokenOut: "0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811",
      encoding: encodePoolHintV3(
        "0xdebf20617708857ebe4f679508e7b7863a8a8eee",
        PoolTypeV3.CurveAPool,
        3,
        0,
        2,
        Action.Swap
      ),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x07edE94cF6316F4809f2B725f5d79AD303fB4Dc8",
      amountIn: "1000",
      amountOut: "999.736101",
    },
    "DAI ==(CurveAPool.Add)==> DAI/USDC/USDT / aave": {
      tokenIn: TOKENS.DAI.address,
      tokenOut: "0xfd2a8fa60abd58efe3eee34dd494cd491dc14900",
      encoding: encodePoolHintV3(
        "0xfd2a8fa60abd58efe3eee34dd494cd491dc14900",
        PoolTypeV3.CurveAPool,
        3,
        0,
        0,
        Action.Add,
        { use_underlying: true }
      ),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "888.181938835011202801",
    },
    "USDC ==(CurveAPool.Add)==> DAI/USDC/USDT / aave": {
      tokenIn: TOKENS.USDC.address,
      tokenOut: "0xfd2a8fa60abd58efe3eee34dd494cd491dc14900",
      encoding: encodePoolHintV3(
        "0xfd2a8fa60abd58efe3eee34dd494cd491dc14900",
        PoolTypeV3.CurveAPool,
        3,
        1,
        1,
        Action.Add,
        { use_underlying: true }
      ),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "888.103427878880883481",
    },
    "USDT ==(CurveAPool.Add)==> DAI/USDC/USDT / aave": {
      tokenIn: TOKENS.USDT.address,
      tokenOut: "0xfd2a8fa60abd58efe3eee34dd494cd491dc14900",
      encoding: encodePoolHintV3(
        "0xfd2a8fa60abd58efe3eee34dd494cd491dc14900",
        PoolTypeV3.CurveAPool,
        3,
        2,
        2,
        Action.Add,
        { use_underlying: true }
      ),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "888.053160333912556557",
    },
    "aDAI ==(CurveAPool.Add)==> DAI/USDC/USDT / aave": {
      tokenIn: "0x028171bCA77440897B824Ca71D1c56caC55b68A3",
      tokenOut: "0xfd2a8fa60abd58efe3eee34dd494cd491dc14900",
      encoding: encodePoolHintV3(
        "0xfd2a8fa60abd58efe3eee34dd494cd491dc14900",
        PoolTypeV3.CurveAPool,
        3,
        0,
        0,
        Action.Add
      ),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x07edE94cF6316F4809f2B725f5d79AD303fB4Dc8",
      amountIn: "1000",
      amountOut: "888.181941463846434631",
    },
    "DAI/USDC/USDT ==(CurveAPool.Remove)==> DAI / aave": {
      tokenIn: "0xfd2a8fa60abd58efe3eee34dd494cd491dc14900",
      tokenOut: TOKENS.DAI.address,
      encoding: encodePoolHintV3(
        "0xfd2a8fa60abd58efe3eee34dd494cd491dc14900",
        PoolTypeV3.CurveAPool,
        3,
        0,
        0,
        Action.Remove,
        { use_underlying: true }
      ),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xb6e81F0906498171779361Fb4Cc1AC58A1159fCD",
      amountIn: "1000",
      amountOut: "1125.299116130587828144",
    },
    "DAI/USDC/USDT ==(CurveAPool.Remove)==> USDC / aave": {
      tokenIn: "0xfd2a8fa60abd58efe3eee34dd494cd491dc14900",
      tokenOut: TOKENS.USDC.address,
      encoding: encodePoolHintV3(
        "0xfd2a8fa60abd58efe3eee34dd494cd491dc14900",
        PoolTypeV3.CurveAPool,
        3,
        1,
        1,
        Action.Remove,
        { use_underlying: true }
      ),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xb6e81F0906498171779361Fb4Cc1AC58A1159fCD",
      amountIn: "1000",
      amountOut: "1125.351713",
    },
    "DAI/USDC/USDT ==(CurveAPool.Remove)==> USDT / aave": {
      tokenIn: "0xfd2a8fa60abd58efe3eee34dd494cd491dc14900",
      tokenOut: TOKENS.USDT.address,
      encoding: encodePoolHintV3(
        "0xfd2a8fa60abd58efe3eee34dd494cd491dc14900",
        PoolTypeV3.CurveAPool,
        3,
        2,
        2,
        Action.Remove,
        { use_underlying: true }
      ),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xb6e81F0906498171779361Fb4Cc1AC58A1159fCD",
      amountIn: "1000",
      amountOut: "1125.488619",
    },
    "DAI/USDC/USDT ==(CurveAPool.Remove)==> aDAI / aave": {
      tokenIn: "0xfd2a8fa60abd58efe3eee34dd494cd491dc14900",
      tokenOut: "0x028171bCA77440897B824Ca71D1c56caC55b68A3",
      encoding: encodePoolHintV3(
        "0xfd2a8fa60abd58efe3eee34dd494cd491dc14900",
        PoolTypeV3.CurveAPool,
        3,
        0,
        0,
        Action.Remove
      ),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xb6e81F0906498171779361Fb4Cc1AC58A1159fCD",
      amountIn: "1000",
      amountOut: "1125.299116130594028957",
    },
  };

  const CurveYPoolSwaps: {
    [path: string]: ISwapForkConfig;
  } = {
    "sUSD ==(CurveYPool.Swap)==> USDT / susd": {
      tokenIn: TOKENS.sUSD.address,
      tokenOut: TOKENS.USDT.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_sUSD_DEPOSIT, PoolTypeV3.CurveYPool, 4, 3, 2, Action.Swap, {
        use_underlying: true,
      }),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      amountIn: "1000",
      amountOut: "999.313749",
    },
    "DAI ==(CurveYPool.Swap)==> USDC / compound": {
      tokenIn: TOKENS.DAI.address,
      tokenOut: TOKENS.USDC.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_COMPOUND_DEPOSIT, PoolTypeV3.CurveYPool, 2, 0, 1, Action.Swap, {
        use_underlying: true,
      }),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "999.983746",
    },
    "USDC ==(CurveYPool.Swap)==> DAI / compound": {
      tokenIn: TOKENS.USDC.address,
      tokenOut: TOKENS.DAI.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_COMPOUND_DEPOSIT, PoolTypeV3.CurveYPool, 2, 1, 0, Action.Swap, {
        use_underlying: true,
      }),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "999.215319744136015374",
    },
    "cDAI ==(CurveYPool.Swap)==> cUSDC / compound": {
      tokenIn: "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643",
      tokenOut: "0x39AA39c021dfbaE8faC545936693aC917d5E7563",
      encoding: encodePoolHintV3(ADDRESS.CURVE_COMPOUND_POOL, PoolTypeV3.CurveYPool, 2, 0, 1, Action.Swap),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xA68e008113d421934E09558a4A5161A4e6A3cb90",
      amountIn: "1000",
      amountOut: "972.41182600",
    },
    "cUSDC ==(CurveYPool.Swap)==> cDAI / compound": {
      tokenIn: "0x39AA39c021dfbaE8faC545936693aC917d5E7563",
      tokenOut: "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643",
      encoding: encodePoolHintV3(ADDRESS.CURVE_COMPOUND_POOL, PoolTypeV3.CurveYPool, 2, 1, 0, Action.Swap),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xb99CC7e10Fe0Acc68C50C7829F473d81e23249cc",
      amountIn: "1000",
      amountOut: "1027.54831718",
    },
    "DAI ==(CurveYPool.Add)==> DAI/USDC / compound": {
      tokenIn: TOKENS.DAI.address,
      tokenOut: ADDRESS.CURVE_COMPOUND_TOKEN,
      encoding: encodePoolHintV3(ADDRESS.CURVE_COMPOUND_DEPOSIT, PoolTypeV3.CurveYPool, 2, 0, 0, Action.Add, {
        use_underlying: true,
      }),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "885.761525437075941056",
    },
    "USDC ==(CurveYPool.Add)==> DAI/USDC / compound": {
      tokenIn: TOKENS.USDC.address,
      tokenOut: ADDRESS.CURVE_COMPOUND_TOKEN,
      encoding: encodePoolHintV3(ADDRESS.CURVE_COMPOUND_DEPOSIT, PoolTypeV3.CurveYPool, 2, 1, 1, Action.Add, {
        use_underlying: true,
      }),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "885.596450881156190866",
    },
    "cDAI ==(CurveYPool.Add)==> DAI/USDC / compound": {
      tokenIn: "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643",
      tokenOut: ADDRESS.CURVE_COMPOUND_TOKEN,
      encoding: encodePoolHintV3(ADDRESS.CURVE_COMPOUND_TOKEN, PoolTypeV3.CurveYPool, 2, 0, 0, Action.Add),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xA68e008113d421934E09558a4A5161A4e6A3cb90",
      amountIn: "1000",
      amountOut: "19.859905145304628740",
    },
    "cUSDC ==(CurveYPool.Add)==> DAI/USDC / compound": {
      tokenIn: "0x39AA39c021dfbaE8faC545936693aC917d5E7563",
      tokenOut: ADDRESS.CURVE_COMPOUND_TOKEN,
      encoding: encodePoolHintV3(ADDRESS.CURVE_COMPOUND_TOKEN, PoolTypeV3.CurveYPool, 2, 1, 1, Action.Add),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xb99CC7e10Fe0Acc68C50C7829F473d81e23249cc",
      amountIn: "1000",
      amountOut: "20.419214318594801322",
    },
    "sUSD ==(CurveYPool.Add)==> DAI/USDC/USDT/sUSD / susd": {
      tokenIn: TOKENS.sUSD.address,
      tokenOut: ADDRESS.CURVE_sUSD_TOKEN,
      encoding: encodePoolHintV3(ADDRESS.CURVE_sUSD_TOKEN, PoolTypeV3.CurveYPool, 4, 3, 3, Action.Add),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      amountIn: "1000",
      amountOut: "938.282090344992205223",
    },
    "DAI/USDC ==(CurveYPool.Remove)==> DAI / compound": {
      tokenIn: ADDRESS.CURVE_COMPOUND_TOKEN,
      tokenOut: TOKENS.DAI.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_COMPOUND_DEPOSIT, PoolTypeV3.CurveYPool, 2, 0, 0, Action.Remove, {
        use_underlying: true,
      }),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x48CDB2914227fbc7F0259a5EA6De28e0b7f7B473",
      amountIn: "1000",
      amountOut: "1128.535144164296764267",
    },
    "DAI/USDC ==(CurveYPool.Remove)==> USDC / compound": {
      tokenIn: ADDRESS.CURVE_COMPOUND_TOKEN,
      tokenOut: TOKENS.USDC.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_COMPOUND_DEPOSIT, PoolTypeV3.CurveYPool, 2, 1, 1, Action.Remove, {
        use_underlying: true,
      }),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x48CDB2914227fbc7F0259a5EA6De28e0b7f7B473",
      amountIn: "1000",
      amountOut: "1129.248442",
    },
    "DAI/USDC/USDT/sUSD ==(CurveYPool.Remove)==> sUSD / susd": {
      tokenIn: ADDRESS.CURVE_sUSD_TOKEN,
      tokenOut: TOKENS.sUSD.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_sUSD_DEPOSIT, PoolTypeV3.CurveYPool, 4, 3, 3, Action.Remove, {
        use_underlying: true,
      }),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x9E51BE7071F086d3A1fD5Dc0016177473619b237",
      amountIn: "1000",
      amountOut: "1065.547015304139681629",
    },
  };

  const CurveMetaPoolSwaps: {
    [path: string]: ISwapForkConfig;
  } = {
    "TUSD ==(CurveMetaPool.Swap)==> 3CRV": {
      tokenIn: TOKENS.TUSD.address,
      tokenOut: TOKENS.TRICRV.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_TUSD3CRV_POOL, PoolTypeV3.CurveMetaPool, 2, 0, 1, Action.Swap),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      amountIn: "10000",
      amountOut: "9715.608591360829671614",
    },
    "alUSD ==(CurveMetaPool.Add)==> alUSD/FraxBP": {
      tokenIn: TOKENS.alUSD.address,
      tokenOut: ADDRESS.CURVE_alUSDFRAXBP_TOKEN,
      encoding: encodePoolHintV3(ADDRESS.CURVE_alUSDFRAXBP_TOKEN, PoolTypeV3.CurveMetaPool, 2, 0, 0, Action.Add),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xFa0c409E4f88807a96Cced2aCCF116cC1649c425",
      amountIn: "10000",
      amountOut: "9956.614580478083636655",
    },
    "crvFRAX ==(CurveMetaPool.Add)==> alUSD/FraxBP": {
      tokenIn: TOKENS.crvFRAX.address,
      tokenOut: ADDRESS.CURVE_alUSDFRAXBP_TOKEN,
      encoding: encodePoolHintV3(ADDRESS.CURVE_alUSDFRAXBP_TOKEN, PoolTypeV3.CurveMetaPool, 2, 1, 1, Action.Add),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xb9b97135f01a5462E5F741854435C256Dd6CD3eE",
      amountIn: "10000",
      amountOut: "10026.103316732168791481",
    },
    "alUSD ==(CurveMetaPool.Remove)==> alUSD/FraxBP": {
      tokenIn: ADDRESS.CURVE_alUSDFRAXBP_TOKEN,
      tokenOut: TOKENS.alUSD.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_alUSDFRAXBP_TOKEN, PoolTypeV3.CurveMetaPool, 2, 0, 0, Action.Remove),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x59De0242328a22191E6e61A7BfDaB271E530fA77",
      amountIn: "1000",
      amountOut: "1004.117050308968399044",
    },
    "crvFRAX ==(CurveMetaPool.Remove)==> alUSD/FraxBP": {
      tokenIn: ADDRESS.CURVE_alUSDFRAXBP_TOKEN,
      tokenOut: TOKENS.crvFRAX.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_alUSDFRAXBP_TOKEN, PoolTypeV3.CurveMetaPool, 2, 1, 1, Action.Remove),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x59De0242328a22191E6e61A7BfDaB271E530fA77",
      amountIn: "1000",
      amountOut: "996.833829638338230684",
    },
  };

  const CurveCryptoPoolSwaps: {
    [path: string]: ISwapForkConfig;
  } = {
    "WETH ==(CurveCryptoPool.Swap)==> CRV": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.CRV.address,
      encoding: encodePoolHintV3(
        ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"],
        PoolTypeV3.CurveCryptoPool,
        3,
        1,
        2,
        Action.Swap
      ),
      fork: 17968230,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1",
      amountOut: "3534.216084882960871069",
    },
    "WETH ==(CurveCryptoPool.Swap)==> CRV / use_eth": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.CRV.address,
      encoding: encodePoolHintV3(
        ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"],
        PoolTypeV3.CurveCryptoPool,
        3,
        1,
        2,
        Action.Swap,
        { use_eth: true }
      ),
      fork: 17968230,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1",
      amountOut: "3534.216084882960871069",
    },
    "CRV ==(CurveCryptoPool.Swap)==> WETH": {
      tokenIn: TOKENS.CRV.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(
        ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"],
        PoolTypeV3.CurveCryptoPool,
        3,
        2,
        1,
        Action.Swap
      ),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x7a16fF8270133F063aAb6C9977183D9e72835428",
      amountIn: "3000",
      amountOut: "0.986065807633969690",
    },
    "crvUSD ==(CurveCryptoPool.Swap)==> WETH": {
      tokenIn: TOKENS.crvUSD.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(
        ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"],
        PoolTypeV3.CurveCryptoPool,
        3,
        0,
        1,
        Action.Swap
      ),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x0a7b9483030994016567b3B1B4bbB865578901Cb",
      amountIn: "9993.634586886330191493",
      amountOut: "6.254973166107013822",
    },
    "CVX ==(CurveCryptoPool.Swap)==> WETH": {
      tokenIn: TOKENS.CVX.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_CVXETH_POOL, PoolTypeV3.CurveCryptoPool, 2, 1, 0, Action.Swap),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x15A5F10cC2611bB18b18322E34eB473235EFCa39",
      amountIn: "1000",
      amountOut: "2.099046947581684230",
    },
    "WETH ==(CurveCryptoPool.Swap)==> CVX": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.CVX.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_CVXETH_POOL, PoolTypeV3.CurveCryptoPool, 2, 0, 1, Action.Swap),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "2",
      amountOut: "1036.465859257799266409",
    },
    "WETH ==(CurveCryptoPool.Swap)==> CVX / use_eth": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.CVX.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_CVXETH_POOL, PoolTypeV3.CurveCryptoPool, 2, 0, 1, Action.Swap, {
        use_eth: true,
      }),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "2",
      amountOut: "1036.465859257799266409",
    },
    "CNC ==(CurveCryptoPool.Swap)==> WETH": {
      tokenIn: TOKENS.CNC.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS["CURVE_ETH/CNC_POOL"], PoolTypeV3.CurveCryptoPool, 2, 1, 0, Action.Swap),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x991a26269Cc54B42DD108b982Afc550bB517871E",
      amountIn: "1000",
      amountOut: "1.304588162629576441",
    },
    "WETH ==(CurveCryptoPool.Swap)==> USDT": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.USDT.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_TRICRYPTO_POOL, PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "1517913.401540",
    },
    "WETH ==(CurveCryptoPool.NG.Swap)==> USDT": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.USDT.address,
      encoding: encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "1453566.349199",
    },
    "WETH ==(CurveCryptoPool.NG.Swap)==> USDC": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.USDC.address,
      encoding: encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "1450250.837132",
    },
    "WETH ==(CurveCryptoPool.Swap)==> USDT / use_eth": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.USDT.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_TRICRYPTO_POOL, PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {
        use_eth: true,
      }),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "1517913.401540",
    },
    "WETH ==(CurveCryptoPool.NG.Swap)==> USDT / use_eth": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.USDT.address,
      encoding: encodePoolHintV3(
        ADDRESS["CURVE_USDT/WBTC/ETH_POOL"],
        PoolTypeV3.CurveCryptoPool,
        3,
        2,
        0,
        Action.Swap,
        {
          use_eth: true,
        }
      ),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "1453566.349199",
    },
    "WETH ==(CurveCryptoPool.NG.Swap)==> USDC / use_eth": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.USDC.address,
      encoding: encodePoolHintV3(
        ADDRESS["CURVE_USDC/WBTC/ETH_POOL"],
        PoolTypeV3.CurveCryptoPool,
        3,
        2,
        0,
        Action.Swap,
        {
          use_eth: true,
        }
      ),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "1450250.837132",
    },
    "INV ==(CurveCryptoPool.NG.Swap)==> WETH": {
      tokenIn: TOKENS.INV.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS["CURVE_USDC/ETH/INV_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 1, Action.Swap),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x6E7f42019C18132b8Ab0F0a8BeD4985D0C235161",
      amountIn: "1000",
      amountOut: "14.471251803235107731",
    },
    "OGV ==(CurveCryptoPool.Swap)==> WETH": {
      tokenIn: TOKENS.OGV.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS["CURVE_OGV/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 2, 0, 1, Action.Swap),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      amountIn: "1000000",
      amountOut: "2.538280269881366827",
    },
    "WETH ==(CurveCryptoPool.Add)==> ETH/CVX": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: ADDRESS.CURVE_CVXETH_TOKEN,
      encoding: encodePoolHintV3(ADDRESS.CURVE_CVXETH_TOKEN, PoolTypeV3.CurveCryptoPool, 2, 0, 0, Action.Add),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "2",
      amountOut: "22.113053289216868399",
    },
    "WETH ==(CurveCryptoPool.Add)==> ETH/CVX / use_eth": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: ADDRESS.CURVE_CVXETH_TOKEN,
      encoding: encodePoolHintV3(ADDRESS.CURVE_CVXETH_TOKEN, PoolTypeV3.CurveCryptoPool, 2, 0, 0, Action.Add, {
        use_eth: true,
      }),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "2",
      amountOut: "22.113053289216868399",
    },
    "WETH ==(CurveCryptoPool.Add)==> USDT/WBTC/ETH": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: ADDRESS.CURVE_TRICRYPTO_TOKEN,
      encoding: encodePoolHintV3(ADDRESS.CURVE_TRICRYPTO_TOKEN, PoolTypeV3.CurveCryptoPool, 3, 2, 2, Action.Add),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "1465.503217910483143863",
    },
    "WETH ==(CurveCryptoPool.NG.Add)==> USDT/WBTC/ETH": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: ADDRESS["CURVE_USDT/WBTC/ETH_TOKEN"],
      encoding: encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_TOKEN"], PoolTypeV3.CurveCryptoPool, 3, 2, 2, Action.Add),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "1490.190991558994894187",
    },
    "WETH ==(CurveCryptoPool.NG.Add)==> USDT/WBTC/ETH / use_eth": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: ADDRESS["CURVE_USDT/WBTC/ETH_TOKEN"],
      encoding: encodePoolHintV3(
        ADDRESS["CURVE_USDT/WBTC/ETH_TOKEN"],
        PoolTypeV3.CurveCryptoPool,
        3,
        2,
        2,
        Action.Add,
        {
          use_eth: true,
        }
      ),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "1490.190991558994894187",
    },
    "WETH ==(CurveCryptoPool.NG.Add)==> USDC/WBTC/ETH / use_eth": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: ADDRESS["CURVE_USDC/WBTC/ETH_TOKEN"],
      encoding: encodePoolHintV3(
        ADDRESS["CURVE_USDC/WBTC/ETH_TOKEN"],
        PoolTypeV3.CurveCryptoPool,
        3,
        2,
        2,
        Action.Add,
        {
          use_eth: true,
        }
      ),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "1487.512081919022536508",
    },
    "FXS/cvxFXS ==(CurveCryptoPool.Remove)==> FXS": {
      tokenIn: ADDRESS.CURVE_cvxFXS_TOKEN,
      tokenOut: TOKENS.FXS.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_cvxFXS_TOKEN, PoolTypeV3.CurveCryptoPool, 2, 0, 0, Action.Remove),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xdc88d12721F9cA1404e9e6E6389aE0AbDd54fc6C",
      amountIn: "1000",
      amountOut: "1999.192791586638691039",
    },
    "USDT/WBTC/ETH ==(CurveCryptoPool.NG.Remove)==> USDT": {
      tokenIn: ADDRESS["CURVE_USDT/WBTC/ETH_TOKEN"],
      tokenOut: TOKENS.USDT.address,
      encoding: encodePoolHintV3(
        ADDRESS["CURVE_USDT/WBTC/ETH_TOKEN"],
        PoolTypeV3.CurveCryptoPool,
        3,
        0,
        0,
        Action.Remove
      ),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xeCb456EA5365865EbAb8a2661B0c503410e9B347",
      amountIn: "1",
      amountOut: "1044.875732",
    },
    "USDT/WBTC/ETH ==(CurveCryptoPool.NG.Remove)==> WBTC": {
      tokenIn: ADDRESS["CURVE_USDT/WBTC/ETH_TOKEN"],
      tokenOut: TOKENS.WBTC.address,
      encoding: encodePoolHintV3(
        ADDRESS["CURVE_USDT/WBTC/ETH_TOKEN"],
        PoolTypeV3.CurveCryptoPool,
        3,
        1,
        1,
        Action.Remove
      ),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xeCb456EA5365865EbAb8a2661B0c503410e9B347",
      amountIn: "1",
      amountOut: "0.03989569",
    },
    "USDT/WBTC/ETH ==(CurveCryptoPool.NG.Remove)==> WETH": {
      tokenIn: ADDRESS["CURVE_USDT/WBTC/ETH_TOKEN"],
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(
        ADDRESS["CURVE_USDT/WBTC/ETH_TOKEN"],
        PoolTypeV3.CurveCryptoPool,
        3,
        2,
        2,
        Action.Remove
      ),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xeCb456EA5365865EbAb8a2661B0c503410e9B347",
      amountIn: "1",
      amountOut: "0.647726517237495680",
    },
    "ETH/CVX ==(CurveCryptoPool.Remove)==> WETH": {
      tokenIn: ADDRESS.CURVE_CVXETH_TOKEN,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_CVXETH_TOKEN, PoolTypeV3.CurveCryptoPool, 2, 0, 0, Action.Remove),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x14D2f4D1b0B5A7bB98b8Ec62Eb3723d461ffBcD2",
      amountIn: "1000",
      amountOut: "89.623957486549320768",
    },
    "ETH/CVX ==(CurveCryptoPool.Remove)==> CVX": {
      tokenIn: ADDRESS.CURVE_CVXETH_TOKEN,
      tokenOut: TOKENS.CVX.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_CVXETH_TOKEN, PoolTypeV3.CurveCryptoPool, 2, 1, 1, Action.Remove),
      fork: 18217460,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x14D2f4D1b0B5A7bB98b8Ec62Eb3723d461ffBcD2",
      amountIn: "1000",
      amountOut: "46658.697863432958274928",
    },
  };

  const ERC4626Swaps: {
    [path: string]: ISwapForkConfig;
  } = {
    "aFXS ==(ERC4626.aFXS.Remove)==> Curve FXS/cvxFXS LP": {
      tokenIn: TOKENS.aFXS.address,
      tokenOut: ADDRESS.CURVE_cvxFXS_TOKEN,
      encoding: encodePoolHintV3(TOKENS.aFXS.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x4492f0D0497bfb4564A085e1e1eB3Bb8080DFf93",
      amountIn: "100",
      amountOut: "111.077428005631012027",
    },
    "cvxCRV ==(ERC4626.aCRV.Add)==> aCRV": {
      tokenIn: TOKENS.cvxCRV.address,
      tokenOut: TOKENS.aCRV.address,
      encoding: encodePoolHintV3(TOKENS.aCRV.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xD292b72e5C787f9F7E092aB7802aDDF76930981F",
      amountIn: "1000",
      amountOut: "735.733360409363601010",
    },
  };

  const LidoSwaps: {
    [path: string]: ISwapForkConfig;
  } = {
    "WETH ==(Lido.stETH.Add)==> stETH": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.stETH.address,
      encoding: encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
      fork: 18211300,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "999.999999999999999998",
    },
    "stETH ==(Lido.wstETH.Add)==> wstETH": {
      tokenIn: TOKENS.stETH.address,
      tokenOut: TOKENS.wstETH.address,
      encoding: encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
      fork: 18211300,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
      amountIn: "1000",
      amountOut: "876.659929668178739728",
    },
    "wstETH ==(Lido.wstETH.Remove)==> stETH": {
      tokenIn: TOKENS.wstETH.address,
      tokenOut: TOKENS.stETH.address,
      encoding: encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
      fork: 18211300,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x176F3DAb24a159341c0509bB36B833E7fdd0a132",
      amountIn: "1000",
      amountOut: "1140.693176632934788582",
    },
  };

  const swaps: {
    [path: string]: ISwapForkConfig;
  } = {
    ...UniswapV2Swaps,
    ...UniswapV3Swaps,
    ...BalancerV1Swaps,
    ...BalancerV2Swaps,
    ...CurvePlainPoolSwaps,
    ...CurveAPoolSwaps,
    ...CurveYPoolSwaps,
    ...CurveMetaPoolSwaps,
    ...CurveCryptoPoolSwaps,
    ...ERC4626Swaps,
    ...LidoSwaps,
  };

  for (const swap_name of Object.keys(swaps)) {
    const swap = swaps[swap_name];

    describe(swap_name, async () => {
      beforeEach(async () => {
        request_fork(swap.fork, [swap.deployer, swap.holder]);
        deployer = await ethers.getSigner(swap.deployer);

        const ConverterRegistry = await ethers.getContractFactory("ConverterRegistry", deployer);
        registry = await ConverterRegistry.deploy();

        const GeneralTokenConverter = await ethers.getContractFactory("GeneralTokenConverter", deployer);
        converter = await GeneralTokenConverter.deploy(await registry.getAddress());

        // register GeneralTokenConverter
        for (let i = 0; i < 10; i++) {
          await registry.register(i, await converter.getAddress());
        }

        // register LidoConverter
        const LidoConverter = await ethers.getContractFactory("LidoConverter", deployer);
        const lidoConverter = await LidoConverter.deploy(await registry.getAddress());
        await registry.register(10, await lidoConverter.getAddress());
      });

      it("should succeed", async () => {
        const signer = await ethers.getSigner(swap.holder);
        await deployer.sendTransaction({ to: signer.address, value: ethers.parseEther("10") });

        const pair = await registry.getTokenPair(swap.encoding);
        expect(pair[0].toLowerCase()).to.eq(swap.tokenIn.toLowerCase());
        expect(pair[1].toLowerCase()).to.eq(swap.tokenOut.toLowerCase());

        const tokenIn = await ethers.getContractAt("MockERC20", swap.tokenIn, signer);
        const tokenOut = await ethers.getContractAt("MockERC20", swap.tokenOut, signer);
        const decimalIn = await tokenIn.decimals();
        const decimalOut = await tokenOut.decimals();

        const amountIn = ethers.parseUnits(swap.amountIn, decimalIn);
        const expectedAmountOut = ethers.parseUnits(swap.amountOut, decimalOut);
        const queryAmountOut = await converter.queryConvert.staticCall(swap.encoding, amountIn);

        await tokenIn.transfer(await converter.getAddress(), amountIn);
        const before = await tokenOut.balanceOf(signer.address);
        const tx = await converter.convert(swap.encoding, amountIn, signer.address);
        await tx.wait();
        const after = await tokenOut.balanceOf(signer.address);
        if (
          swap_name.search("TWAMM") !== -1 ||
          swap_name.search("CurveAPool") !== -1 ||
          swap_name.search("CurveYPool") !== -1
        ) {
          expect(after - before).to.closeTo(expectedAmountOut, expectedAmountOut / 1000000n);
        } else {
          expect(after - before).to.eq(expectedAmountOut);
        }
        if (swap_name.search("Add") !== -1 && swap_name.search("Curve") !== -1) {
          expect(after - before).to.closeTo(queryAmountOut, queryAmountOut / 1000n);
        } else {
          expect(after - before).to.closeTo(queryAmountOut, queryAmountOut / 100000n);
        }
      });
    });
  }
});

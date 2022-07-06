/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers } from "hardhat";
import { Action, encodePoolHintV2, PoolType } from "../../scripts/utils";
import { IERC20, TokenZapLogic } from "../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../utils";

const Type2String: { [type: number]: string } = {
  [PoolType.UniswapV2]: "UniswapV2",
  [PoolType.UniswapV3]: "UniswapV3",
  [PoolType.BalancerV2]: "BalancerV2", // add/remove liquidity not supported
  [PoolType.CurveETHPool]: "CurveETHPool", // including Factory Pool
  [PoolType.CurveCryptoPool]: "CurveCryptoPool", // including Factory Pool
  [PoolType.CurveMetaCryptoPool]: "CurveMetaCryptoPool",
  [PoolType.CurveTriCryptoPool]: "CurveTriCryptoPool",
  [PoolType.CurveBasePool]: "CurveBasePool",
  [PoolType.CurveAPool]: "CurveAPool",
  [PoolType.CurveAPoolUnderlying]: "CurveAPoolUnderlying",
  [PoolType.CurveYPool]: "CurveYPool",
  [PoolType.CurveYPoolUnderlying]: "CurveYPoolUnderlying",
  [PoolType.CurveMetaPool]: "CurveMetaPool",
  [PoolType.CurveMetaPoolUnderlying]: "CurveMetaPoolUnderlying",
  [PoolType.CurveFactoryPlainPool]: "CurveFactoryPlainPool",
  [PoolType.CurveFactoryMetaPool]: "CurveFactoryMetaPool",
  [PoolType.CurveFactoryUSDMetaPoolUnderlying]: "CurveFactoryUSDMetaPoolUnderlying",
  [PoolType.CurveFactoryBTCMetaPoolUnderlying]: "CurveFactoryBTCMetaPoolUnderlying",
  [PoolType.LidoStake]: "LidoStake", // eth to stETH
  [PoolType.LidoWrap]: "LidoWrap", // stETH to wstETH or wstETH to stETH
};

const TOKENS: { [address: string]: { symbol: string; decimals: number } } = {
  "0x6B175474E89094C44Da98b954EedeAC495271d0F": {
    symbol: "DAI",
    decimals: 18,
  },
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": {
    symbol: "USDC",
    decimals: 6,
  },
  "0xdAC17F958D2ee523a2206206994597C13D831ec7": {
    symbol: "USDT",
    decimals: 6,
  },
  "0x028171bCA77440897B824Ca71D1c56caC55b68A3": {
    symbol: "aDAI",
    decimals: 18,
  },
  "0xBcca60bB61934080951369a648Fb03DF4F96263C": {
    symbol: "aUSDC",
    decimals: 6,
  },
  "0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811": {
    symbol: "aUSDT",
    decimals: 6,
  },
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE": {
    symbol: "ETH",
    decimals: 18,
  },
  "0xE95A203B1a91a908F9B9CE46459d101078c2c3cb": {
    symbol: "aETHc",
    decimals: 18,
  },
  "0x4Fabb145d64652a948d72533023f6E7A623C7C53": {
    symbol: "BUSD",
    decimals: 18,
  },
  "0xC2cB1040220768554cf699b0d863A3cd4324ce32": {
    symbol: "yDAI",
    decimals: 18,
  },
  "0x26EA744E5B887E5205727f55dFBE8685e3b21951": {
    symbol: "yUSDC",
    decimals: 6,
  },
  "0xE6354ed5bC4b393a5Aad09f21c46E101e692d447": {
    symbol: "yUSDT",
    decimals: 6,
  },
  "0x04bC0Ab673d88aE9dbC9DA2380cB6B79C4BCa9aE": {
    symbol: "yBUSD",
    decimals: 18,
  },
  "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643": {
    symbol: "cDAI",
    decimals: 8,
  },
  "0x39AA39c021dfbaE8faC545936693aC917d5E7563": {
    symbol: "cUSDC",
    decimals: 8,
  },
  "0xdB25f211AB05b1c97D595516F45794528a807ad8": {
    symbol: "EURS",
    decimals: 2,
  },
  "0xD71eCFF9342A5Ced620049e616c5035F1dB98620": {
    symbol: "sEUR",
    decimals: 18,
  },
  "0x0316EB71485b0Ab14103307bf65a021042c6d380": {
    symbol: "hBTC",
    decimals: 18,
  },
  "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": {
    symbol: "WBTC",
    decimals: 8,
  },
  "0x8e595470Ed749b85C6F7669de83EAe304C2ec68F": {
    symbol: "iDAI",
    decimals: 8,
  },
  "0x76Eb2FE28b36B3ee97F3Adae0C69606eeDB2A37c": {
    symbol: "iUSDC",
    decimals: 8,
  },
  "0x48759F220ED983dB51fA7A8C0D2AAb8f3ce4166a": {
    symbol: "iUSDT",
    decimals: 8,
  },
  "0x514910771AF9Ca656af840dff83E8264EcF986CA": {
    symbol: "LINK",
    decimals: 18,
  },
  "0xbBC455cb4F1B9e4bFC4B73970d360c8f032EfEE6": {
    symbol: "sLINK",
    decimals: 18,
  },
  "0x99d1Fa417f94dcD62BfE781a1213c092a47041Bc": {
    symbol: "ycDAI",
    decimals: 18,
  },
  "0x9777d7E2b60bB01759D0E2f8be2095df444cb07E": {
    symbol: "ycUSDC",
    decimals: 6,
  },
  "0x1bE5d71F2dA660BFdee8012dDc58D024448A0A59": {
    symbol: "ycUSDT",
    decimals: 6,
  },
  "0x8E870D67F660D95d5be530380D0eC0bd388289E1": {
    symbol: "USDP",
    decimals: 18,
  },
  "0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D": {
    symbol: "renBTC",
    decimals: 8,
  },
  "0x57Ab1ec28D129707052df4dF418D58a2D46d5f51": {
    symbol: "sUSD",
    decimals: 18,
  },
  "0x6C5024Cd4F8A59110119C56f8933403A539555EB": {
    symbol: "aSUSD",
    decimals: 18,
  },
  "0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6": {
    symbol: "sBTC",
    decimals: 18,
  },
  "0x5e74C9036fb86BD7eCdcb084a0673EFc32eA31cb": {
    symbol: "sETH",
    decimals: 18,
  },
  "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84": {
    symbol: "stETH",
    decimals: 18,
  },
  "0x16de59092dAE5CcF4A1E6439D611fd0653f0Bd01": {
    symbol: "yDAI",
    decimals: 18,
  },
  "0xd6aD7a6750A7593E092a9B218d66C0A814a3436e": {
    symbol: "yUSDC",
    decimals: 6,
  },
  "0x83f798e925BcD4017Eb265844FDDAbb448f1707D": {
    symbol: "yUSDT",
    decimals: 6,
  },
  "0x73a052500105205d34Daf004eAb301916DA8190f": {
    symbol: "yTUSD",
    decimals: 18,
  },
  "0x0000000000085d4780B73119b644AE5ecd22b376": {
    symbol: "TUSD",
    decimals: 18,
  },
  "0x5BC25f649fc4e26069dDF4cF4010F9f706c23831": {
    symbol: "DUSD",
    decimals: 18,
  },
  "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490": {
    symbol: "3CRV",
    decimals: 18,
  },
  "0x056Fd409E1d7A124BD7017459dFEa2F387b6d5Cd": {
    symbol: "GUSD",
    decimals: 2,
  },
  "0xdF574c24545E5FfEcb9a659c229253D4111d87e1": {
    symbol: "HUSD",
    decimals: 8,
  },
  "0x0E2EC54fC0B509F445631Bf4b91AB8168230C752": {
    symbol: "LINKUSD",
    decimals: 18,
  },
  "0xe2f2a5C287993345a840Db3B0845fbC70f5935a5": {
    symbol: "mUSD",
    decimals: 18,
  },
  "0x196f4727526eA7FB1e17b2071B3d8eAA38486988": {
    symbol: "RSV",
    decimals: 18,
  },
  "0x1c48f86ae57291F7686349F12601910BD8D470bb": {
    symbol: "USDK",
    decimals: 18,
  },
  "0x674C6Ad92Fd080e4004b2312b45f796a192D27a0": {
    symbol: "USDN",
    decimals: 18,
  },
  "0x1456688345527bE1f37E9e627DA0837D6f08C925": {
    symbol: "USDP",
    decimals: 18,
  },
  "0xa47c8bf37f92aBed4A126BDA807A7b7498661acD": {
    symbol: "UST",
    decimals: 18,
  },
  "0x9BE89D2a4cd102D8Fecc6BF9dA793be995C22541": {
    symbol: "bBTC",
    decimals: 8,
  },
  "0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3": {
    symbol: "crvRenWSBTC",
    decimals: 18,
  },
  "0x8064d9Ae6cDf087b1bcd5BDf3531bD5d8C537a68": {
    symbol: "oBTC",
    decimals: 18,
  },
  "0x5228a22e72ccC52d415EcFd199F99D0665E7733b": {
    symbol: "pBTC",
    decimals: 18,
  },
  "0x8dAEBADE922dF735c38C80C7eBD708Af50815fAa": {
    symbol: "tBTC",
    decimals: 18,
  },
  "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0": {
    symbol: "LUSD",
    decimals: 18,
  },
  "0x853d955aCEf822Db058eb8505911ED77F175b99e": {
    symbol: "FRAX",
    decimals: 18,
  },
  "0x9559Aaa82d9649C7A7b220E7c461d2E74c9a3593": {
    symbol: "rETH",
    decimals: 18,
  },
  "0xBC6DA0FE9aD5f3b0d58160288917AA56653660E9": {
    symbol: "alUSD",
    decimals: 18,
  },
  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": {
    symbol: "WETH",
    decimals: 18,
  },
  "0x03ab458634910AaD20eF5f1C8ee96F1D6ac54919": {
    symbol: "RAI",
    decimals: 18,
  },
  "0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3": {
    symbol: "MIM",
    decimals: 18,
  },
  "0xC581b735A1688071A1746c968e0798D642EDE491": {
    symbol: "EURT",
    decimals: 6,
  },
  "0xa693B19d2931d498c5B318dF961919BB4aee87a5": {
    symbol: "UST",
    decimals: 6,
  },
  "0x68749665FF8D2d112Fa859AA293F07A622782F38": {
    symbol: "XAUt",
    decimals: 6,
  },
  "0xD533a949740bb3306d119CC777fa900bA034cd52": {
    symbol: "CRV",
    decimals: 18,
  },
  "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B": {
    symbol: "CVX",
    decimals: 18,
  },
  "0x090185f2135308BaD17527004364eBcC2D37e5F6": {
    symbol: "SPELL",
    decimals: 18,
  },
  "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5": {
    symbol: "T",
    decimals: 18,
  },
  "0x8751D4196027d4e6DA63716fA7786B5174F04C15": {
    symbol: "ibBTC",
    decimals: 18,
  },
  "0x0100546F2cD4C9D97f798fFC9755E47865FF7Ee6": {
    symbol: "alETH",
    decimals: 18,
  },
  "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0": {
    symbol: "FXS",
    decimals: 18,
  },
  "0xFEEf77d3f69374f66429C91d732A244f074bdf74": {
    symbol: "cvxFXS",
    decimals: 18,
  },
  "0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7": {
    symbol: "cvxCRV",
    decimals: 18,
  },
  "0x865377367054516e17014CcdED1e7d814EDC9ce4": {
    symbol: "DOLA",
    decimals: 18,
  },
  "0xae78736Cd615f374D3085123A210448E74Fc6393": {
    symbol: "rETH",
    decimals: 18,
  },
  "0x466a756E9A7401B5e2444a3fCB3c2C12FBEa0a54": {
    symbol: "PUSD",
    decimals: 18,
  },
  "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": {
    symbol: "wstETH",
    decimals: 18,
  },
};

// including all pools from https://curve.readthedocs.io/ref-addresses.html#addresses-overview
// and all factory plain pool, factory meta pool, factory eth pool, factory crypto pool
const CURVE_POOLS: {
  [name: string]: {
    type: PoolType;
    pool: string;
    deposit?: string;
    lpToken: string;
    tokens: string[];
    underlyings?: string[];
    fork: number;
    holder: string;
    amount: string;
  };
} = {
  "3Pool": {
    type: PoolType.CurveBasePool,
    pool: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
    lpToken: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
    tokens: [
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0x85eB61a62701be46479C913717E8d8FAD42b398d",
    amount: "10000",
  },
  AAVE: {
    type: PoolType.CurveAPool,
    pool: "0xDeBF20617708857ebe4F679508E7b7863a8A8EeE",
    lpToken: "0xFd2a8fA60Abd58Efe3EeE34dd494cD491dC14900",
    tokens: [
      "0x028171bCA77440897B824Ca71D1c56caC55b68A3",
      "0xBcca60bB61934080951369a648Fb03DF4F96263C",
      "0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811",
    ],
    underlyings: [
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0x310d5c8ee1512d5092ee4377061ae82e48973689",
    amount: "10000",
  },
  ankrETH: {
    type: PoolType.CurveETHPool,
    pool: "0xA96A65c051bF88B4095Ee1f2451C2A9d43F53Ae2",
    lpToken: "0xaA17A236F2bAdc98DDc0Cf999AbB47D47Fc0A6Cf",
    tokens: ["0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", "0xE95A203B1a91a908F9B9CE46459d101078c2c3cb"],
    fork: 14927574,
    holder: "0xc656e6c85482e43226366097fadb5140828f459e",
    amount: "100",
  },
  BUSD: {
    type: PoolType.CurveYPool,
    pool: "0x79a8C46DeA5aDa233ABaFFD40F3A0A2B1e5A4F27",
    lpToken: "0x3B3Ac5386837Dc563660FB6a0937DFAa5924333B",
    deposit: "0xb6c057591E073249F2D9D88Ba59a46CFC9B59EdB",
    tokens: [
      "0xC2cB1040220768554cf699b0d863A3cd4324ce32",
      "0x26EA744E5B887E5205727f55dFBE8685e3b21951",
      "0xE6354ed5bC4b393a5Aad09f21c46E101e692d447",
      "0x04bC0Ab673d88aE9dbC9DA2380cB6B79C4BCa9aE",
    ],
    underlyings: [
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "0x4Fabb145d64652a948d72533023f6E7A623C7C53",
    ],
    fork: 14927574,
    holder: "0x613d9871c25721e8f90acf8cc4341bb145f29c23",
    amount: "10000",
  },
  Compound: {
    type: PoolType.CurveYPool,
    pool: "0xA2B47E3D5c44877cca798226B7B8118F9BFb7A56",
    lpToken: "0x845838DF265Dcd2c412A1Dc9e959c7d08537f8a2",
    deposit: "0xeB21209ae4C2c9FF2a86ACA31E123764A3B6Bc06",
    tokens: ["0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643", "0x39AA39c021dfbaE8faC545936693aC917d5E7563"],
    underlyings: ["0x6B175474E89094C44Da98b954EedeAC495271d0F", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"],
    fork: 14927574,
    holder: "0xfd1935fd3c8f49723deb7296c58ba4bb1a0e48e1",
    amount: "10000",
  },
  EURS: {
    type: PoolType.CurveBasePool,
    pool: "0x0Ce6a5fF5217e38315f87032CF90686C96627CAA",
    lpToken: "0x194eBd173F6cDacE046C53eACcE9B953F28411d1",
    tokens: ["0xdB25f211AB05b1c97D595516F45794528a807ad8", "0xD71eCFF9342A5Ced620049e616c5035F1dB98620"],
    fork: 14927574,
    holder: "0x6165fd87c1bc73a4c44b23934e9136fd92df5b01",
    amount: "10000",
  },
  hBTC: {
    type: PoolType.CurveBasePool,
    pool: "0x4CA9b3063Ec5866A4B82E437059D2C43d1be596F",
    lpToken: "0xb19059ebb43466C323583928285a49f558E572Fd",
    tokens: ["0x0316EB71485b0Ab14103307bf65a021042c6d380", "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"],
    fork: 14927574,
    holder: "0x7a7a599d2384ed203cfea49721628aa851e0da16",
    amount: "1",
  },
  IronBank: {
    type: PoolType.CurveAPool,
    pool: "0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF",
    lpToken: "0x5282a4eF67D9C33135340fB3289cc1711c13638C",
    tokens: [
      "0x8e595470Ed749b85C6F7669de83EAe304C2ec68F",
      "0x76Eb2FE28b36B3ee97F3Adae0C69606eeDB2A37c",
      "0x48759F220ED983dB51fA7A8C0D2AAb8f3ce4166a",
    ],
    underlyings: [
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0xd4dfbde97c93e56d1e41325bb428c18299db203f",
    amount: "100",
  },
  Link: {
    type: PoolType.CurveBasePool,
    pool: "0xF178C0b5Bb7e7aBF4e12A4838C7b7c5bA2C623c0",
    lpToken: "0xcee60cfa923170e4f8204ae08b4fa6a3f5656f3a",
    tokens: ["0x514910771AF9Ca656af840dff83E8264EcF986CA", "0xbBC455cb4F1B9e4bFC4B73970d360c8f032EfEE6"],
    fork: 14927574,
    holder: "0x8107b00171a02f83d7a17f62941841c29c3ae60f",
    amount: "10000",
  },
  PAX: {
    type: PoolType.CurveYPool,
    pool: "0x06364f10B501e868329afBc005b3492902d6C763",
    lpToken: "0xD905e2eaeBe188fc92179b6350807D8bd91Db0D8",
    deposit: "0xA50cCc70b6a011CffDdf45057E39679379187287",
    tokens: [
      "0x99d1Fa417f94dcD62BfE781a1213c092a47041Bc",
      "0x9777d7E2b60bB01759D0E2f8be2095df444cb07E",
      "0x1bE5d71F2dA660BFdee8012dDc58D024448A0A59",
      "0x8E870D67F660D95d5be530380D0eC0bd388289E1",
    ],
    underlyings: [
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "0x8E870D67F660D95d5be530380D0eC0bd388289E1",
    ],
    fork: 14927574,
    holder: "0x0e5aec84f66909e59c23237f5eb8f74c6eddd1ae",
    amount: "10000",
  },
  renBTC: {
    type: PoolType.CurveBasePool,
    pool: "0x93054188d876f558f4a66B2EF1d97d16eDf0895B",
    lpToken: "0x49849C98ae39Fff122806C06791Fa73784FB3675",
    tokens: ["0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D", "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"],
    fork: 14927574,
    holder: "0x3cbe654df532c6b7e8dd6428617df7359d468e99",
    amount: "10",
  },
  sAAVE: {
    type: PoolType.CurveAPool,
    pool: "0xEB16Ae0052ed37f479f7fe63849198Df1765a733",
    lpToken: "0x02d341CcB60fAaf662bC0554d13778015d1b285C",
    tokens: ["0x028171bCA77440897B824Ca71D1c56caC55b68A3", "0x6C5024Cd4F8A59110119C56f8933403A539555EB"],
    underlyings: ["0x6B175474E89094C44Da98b954EedeAC495271d0F", "0x57Ab1ec28D129707052df4dF418D58a2D46d5f51"],
    fork: 14927574,
    holder: "0xb617bf66b848d301c4fd2db586a244a5c07e2ec0",
    amount: "1000",
  },
  sBTC: {
    type: PoolType.CurveBasePool,
    pool: "0x7fC77b5c7614E1533320Ea6DDc2Eb61fa00A9714",
    lpToken: "0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3",
    tokens: [
      "0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D",
      "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      "0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6",
    ],
    fork: 14927574,
    holder: "0x5ec3f59397498cee61d71399d15458ecc171b783",
    amount: "10",
  },
  sETH: {
    type: PoolType.CurveETHPool,
    pool: "0xc5424B857f758E906013F3555Dad202e4bdB4567",
    lpToken: "0xA3D87FffcE63B53E0d54fAa1cc983B7eB0b74A9c",
    tokens: ["0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", "0x5e74C9036fb86BD7eCdcb084a0673EFc32eA31cb"],
    fork: 14927574,
    holder: "0x781814773609d820ab3fff2f21624d93e9b4784a",
    amount: "100",
  },
  stETH: {
    type: PoolType.CurveETHPool,
    pool: "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022",
    lpToken: "0x06325440D014e39736583c165C2963BA99fAf14E",
    tokens: ["0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84"],
    fork: 14927574,
    holder: "0x56c915758ad3f76fd287fff7563ee313142fb663",
    amount: "1000",
  },
  sUSD: {
    type: PoolType.CurveYPool,
    pool: "0xA5407eAE9Ba41422680e2e00537571bcC53efBfD",
    lpToken: "0xC25a3A3b969415c80451098fa907EC722572917F",
    deposit: "0xFCBa3E75865d2d561BE8D220616520c171F12851",
    tokens: [
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "0x57Ab1ec28D129707052df4dF418D58a2D46d5f51",
    ],
    underlyings: [
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "0x57Ab1ec28D129707052df4dF418D58a2D46d5f51",
    ],
    fork: 14927574,
    holder: "0xfeec87662a5dfe8a159e1516af01fb9014b3ef0d",
    amount: "10000",
  },
  USDT: {
    type: PoolType.CurveYPool,
    pool: "0x52EA46506B9CC5Ef470C5bf89f17Dc28bB35D85C",
    lpToken: "0x9fC689CCaDa600B6DF723D9E47D84d76664a1F23",
    deposit: "0xac795D2c97e60DF6a99ff1c814727302fD747a80",
    tokens: [
      "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643",
      "0x39AA39c021dfbaE8faC545936693aC917d5E7563",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    underlyings: [
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0xa6cb47ebd1e8f9b60af7033c5b075527409c7771",
    amount: "10000",
  },
  Y: {
    type: PoolType.CurveYPool,
    pool: "0x45F783CCE6B7FF23B2ab2D70e416cdb7D6055f51",
    lpToken: "0xdF5e0e81Dff6FAF3A7e52BA697820c5e32D806A8",
    deposit: "0xbBC81d23Ea2c3ec7e56D39296F0cbB648873a5d3",
    tokens: [
      "0x16de59092dAE5CcF4A1E6439D611fd0653f0Bd01",
      "0xd6aD7a6750A7593E092a9B218d66C0A814a3436e",
      "0x83f798e925BcD4017Eb265844FDDAbb448f1707D",
      "0x73a052500105205d34Daf004eAb301916DA8190f",
    ],
    underlyings: [
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "0x0000000000085d4780B73119b644AE5ecd22b376",
    ],
    fork: 14927574,
    holder: "0x2df3fde898113cfac1e3d6b7e7b8fd3da851b5ce",
    amount: "10000",
  },
  DUSD: {
    type: PoolType.CurveMetaPool,
    pool: "0x8038C01A0390a8c547446a0b2c18fc9aEFEcc10c",
    deposit: "0x61E10659fe3aa93d036d099405224E4Ac24996d0",
    lpToken: "0x3a664Ab939FD8482048609f652f9a0B0677337B9",
    tokens: ["0x5BC25f649fc4e26069dDF4cF4010F9f706c23831", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0x5BC25f649fc4e26069dDF4cF4010F9f706c23831",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0x8da02d597a2616e9ec0c82b2b8366b00d69da29a",
    amount: "1000",
  },
  GUSD: {
    type: PoolType.CurveMetaPool,
    pool: "0x4f062658EaAF2C1ccf8C8e36D6824CDf41167956",
    deposit: "0x64448B78561690B70E17CBE8029a3e5c1bB7136e",
    lpToken: "0xD2967f45c4f384DEEa880F807Be904762a3DeA07",
    tokens: ["0x056Fd409E1d7A124BD7017459dFEa2F387b6d5Cd", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0x056Fd409E1d7A124BD7017459dFEa2F387b6d5Cd",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0xb41742195962ca2d9886690ac2854abf7b826090",
    amount: "10000",
  },
  HUSD: {
    type: PoolType.CurveMetaPool,
    pool: "0x3eF6A01A0f81D6046290f3e2A8c5b843e738E604",
    deposit: "0x09672362833d8f703D5395ef3252D4Bfa51c15ca",
    lpToken: "0x5B5CFE992AdAC0C9D48E05854B2d91C73a003858",
    tokens: ["0xdF574c24545E5FfEcb9a659c229253D4111d87e1", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0xdF574c24545E5FfEcb9a659c229253D4111d87e1",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0xc3897aef9fb4867ed988e76831366d6a69f9ca75",
    amount: "100",
  },
  LinkUSD: {
    type: PoolType.CurveMetaPool,
    pool: "0xE7a24EF0C5e95Ffb0f6684b813A78F2a3AD7D171",
    deposit: "0x1de7f0866e2c4adAC7b457c58Cc25c8688CDa1f2",
    lpToken: "0x6D65b498cb23deAba52db31c93Da9BFFb340FB8F",
    tokens: ["0x0E2EC54fC0B509F445631Bf4b91AB8168230C752", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0x0E2EC54fC0B509F445631Bf4b91AB8168230C752",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0x5e8d405cbc564473d85a9a31fbfca76167d69978",
    amount: "1000",
  },
  mUSD: {
    type: PoolType.CurveMetaPool,
    pool: "0x8474DdbE98F5aA3179B3B3F5942D724aFcdec9f6",
    deposit: "0x803A2B40c5a9BB2B86DD630B274Fa2A9202874C2",
    lpToken: "0x1AEf73d49Dedc4b1778d0706583995958Dc862e6",
    tokens: ["0xe2f2a5C287993345a840Db3B0845fbC70f5935a5", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0xe2f2a5C287993345a840Db3B0845fbC70f5935a5",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0x9d91f56a559eb2991cec9b31d703a4c543d6075f",
    amount: "100",
  },
  RSV: {
    type: PoolType.CurveMetaPool,
    pool: "0xC18cC39da8b11dA8c3541C598eE022258F9744da",
    deposit: "0xBE175115BF33E12348ff77CcfEE4726866A0Fbd5",
    lpToken: "0xC2Ee6b0334C261ED60C72f6054450b61B8f18E35",
    tokens: ["0x196f4727526eA7FB1e17b2071B3d8eAA38486988", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0x196f4727526eA7FB1e17b2071B3d8eAA38486988",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0x1b692c0a8e54753d4fccdf21e7b1724c03f8260c",
    amount: "1000",
  },
  USDK: {
    type: PoolType.CurveMetaPool,
    pool: "0x3E01dD8a5E1fb3481F0F589056b428Fc308AF0Fb",
    deposit: "0xF1f85a74AD6c64315F85af52d3d46bF715236ADc",
    lpToken: "0x97E2768e8E73511cA874545DC5Ff8067eB19B787",
    tokens: ["0x1c48f86ae57291F7686349F12601910BD8D470bb", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0x1c48f86ae57291F7686349F12601910BD8D470bb",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0x457db311325a0075007846a1c74ddc6f2f24aa77",
    amount: "1000",
  },
  USDN: {
    type: PoolType.CurveMetaPool,
    pool: "0x0f9cb53Ebe405d49A0bbdBD291A65Ff571bC83e1",
    deposit: "0x094d12e5b541784701FD8d65F11fc0598FBC6332",
    lpToken: "0x4f3E8F405CF5aFC05D68142F3783bDfE13811522",
    tokens: ["0x674C6Ad92Fd080e4004b2312b45f796a192D27a0", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0x674C6Ad92Fd080e4004b2312b45f796a192D27a0",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0xbb750139e72761385c9e9ee1d70fc1b7b750f6f6",
    amount: "10000",
  },
  USDP: {
    type: PoolType.CurveMetaPool,
    pool: "0x42d7025938bEc20B69cBae5A77421082407f053A",
    deposit: "0x3c8cAee4E09296800f8D29A68Fa3837e2dae4940",
    lpToken: "0x7Eb40E450b9655f4B3cC4259BCC731c63ff55ae6",
    tokens: ["0x1456688345527bE1f37E9e627DA0837D6f08C925", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0x1456688345527bE1f37E9e627DA0837D6f08C925",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0xdbc0e7fe0c6a27756bf08b2042ad4cf8661e5d56",
    amount: "10000",
  },
  UST: {
    type: PoolType.CurveMetaPool,
    pool: "0x890f4e345B1dAED0367A877a1612f86A1f86985f",
    deposit: "0xB0a0716841F2Fc03fbA72A891B8Bb13584F52F2d",
    lpToken: "0x94e131324b6054c0D789b190b2dAC504e4361b53",
    tokens: ["0xa47c8bf37f92aBed4A126BDA807A7b7498661acD", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0xa47c8bf37f92aBed4A126BDA807A7b7498661acD",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0x19d57ca590dd45a8b05a8d9c373c9c168477bc76",
    amount: "1000",
  },
  bBTC: {
    type: PoolType.CurveMetaPool,
    pool: "0x071c661B4DeefB59E2a3DdB20Db036821eeE8F4b",
    deposit: "0xC45b2EEe6e09cA176Ca3bB5f7eEe7C47bF93c756",
    lpToken: "0x410e3E86ef427e30B9235497143881f717d93c2A",
    tokens: ["0x9BE89D2a4cd102D8Fecc6BF9dA793be995C22541", "0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3"],
    underlyings: [
      "0x9BE89D2a4cd102D8Fecc6BF9dA793be995C22541",
      "0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D",
      "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      "0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6",
    ],
    fork: 14927574,
    holder: "0x87e218c838be1471db1f79f143e6a00e736113c3",
    amount: "0.1",
  },
  oBTC: {
    type: PoolType.CurveMetaPool,
    pool: "0xd81dA8D904b52208541Bade1bD6595D8a251F8dd",
    deposit: "0xd5BCf53e2C81e1991570f33Fa881c49EEa570C8D",
    lpToken: "0x2fE94ea3d5d4a175184081439753DE15AeF9d614",
    tokens: ["0x8064d9Ae6cDf087b1bcd5BDf3531bD5d8C537a68", "0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3"],
    underlyings: [
      "0x8064d9Ae6cDf087b1bcd5BDf3531bD5d8C537a68",
      "0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D",
      "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      "0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6",
    ],
    fork: 14927574,
    holder: "0x806ed321e5d8255ff1478b9171bdc97ae09b2d37",
    amount: "0.1",
  },
  pBTC: {
    type: PoolType.CurveMetaPool,
    pool: "0x7F55DDe206dbAD629C080068923b36fe9D6bDBeF",
    deposit: "0x11F419AdAbbFF8d595E7d5b223eee3863Bb3902C",
    lpToken: "0xDE5331AC4B3630f94853Ff322B66407e0D6331E8",
    tokens: ["0x5228a22e72ccC52d415EcFd199F99D0665E7733b", "0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3"],
    underlyings: [
      "0x5228a22e72ccC52d415EcFd199F99D0665E7733b",
      "0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D",
      "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      "0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6",
    ],
    fork: 14927574,
    holder: "0x09bc19cd33faf805e55b708c2db3de87979b3950",
    amount: "0.01",
  },
  tBTC: {
    type: PoolType.CurveMetaPool,
    pool: "0xC25099792E9349C7DD09759744ea681C7de2cb66",
    deposit: "0xaa82ca713D94bBA7A89CEAB55314F9EfFEdDc78c",
    lpToken: "0x64eda51d3Ad40D56b9dFc5554E06F94e1Dd786Fd",
    tokens: ["0x8dAEBADE922dF735c38C80C7eBD708Af50815fAa", "0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3"],
    underlyings: [
      "0x8dAEBADE922dF735c38C80C7eBD708Af50815fAa",
      "0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D",
      "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      "0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6",
    ],
    fork: 14927574,
    holder: "0x3d24d77bec08549d7ea86c4e9937204c11e153f1",
    amount: "1",
  },
  Factory_TUSD: {
    type: PoolType.CurveFactoryMetaPool,
    pool: "0xEcd5e75AFb02eFa118AF914515D6521aaBd189F1",
    lpToken: "0xEcd5e75AFb02eFa118AF914515D6521aaBd189F1",
    tokens: ["0x0000000000085d4780B73119b644AE5ecd22b376", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0x0000000000085d4780B73119b644AE5ecd22b376",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0xd34f3e85bb7c8020c7959b80a4b87a369d639dc0",
    amount: "1000",
  },
  Factory_LUSD: {
    type: PoolType.CurveFactoryMetaPool,
    pool: "0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA",
    lpToken: "0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA",
    tokens: ["0x5f98805A4E8be255a32880FDeC7F6728C6568bA0", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0xc64844d9b3db280a6e46c1431e2229cd62dd2d69",
    amount: "10000",
  },
  Factory_FRAX: {
    type: PoolType.CurveFactoryMetaPool,
    pool: "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B",
    lpToken: "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B",
    tokens: ["0x853d955aCEf822Db058eb8505911ED77F175b99e", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0x853d955aCEf822Db058eb8505911ED77F175b99e",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0x605b5f6549538a94bd2653d1ee67612a47039da0",
    amount: "10000",
  },
  Factory_BUSD: {
    type: PoolType.CurveFactoryMetaPool,
    pool: "0x4807862AA8b2bF68830e4C8dc86D0e9A998e085a",
    lpToken: "0x4807862AA8b2bF68830e4C8dc86D0e9A998e085a",
    tokens: ["0x4Fabb145d64652a948d72533023f6E7A623C7C53", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0x4Fabb145d64652a948d72533023f6E7A623C7C53",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0x8c3e24477c309deae96e533a2dc191d728aced9c",
    amount: "1000",
  },
  rETH: {
    type: PoolType.CurveETHPool,
    pool: "0xF9440930043eb3997fc70e1339dBb11F341de7A8",
    lpToken: "0x53a901d48795C58f485cBB38df08FA96a24669D5",
    tokens: ["0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", "0x9559Aaa82d9649C7A7b220E7c461d2E74c9a3593"],
    fork: 14927574,
    holder: "0x6e3ff35d5b72480c5d064cd84708bbd35dfe5c4b",
    amount: "1",
  },
  Factory_alUSD: {
    type: PoolType.CurveFactoryMetaPool,
    pool: "0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c",
    lpToken: "0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c",
    tokens: ["0xBC6DA0FE9aD5f3b0d58160288917AA56653660E9", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0xBC6DA0FE9aD5f3b0d58160288917AA56653660E9",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0xc16e8f5ce96515e5ffdc198f23293d75b42c3266",
    amount: "10000",
  },
  TriCrypto2: {
    type: PoolType.CurveTriCryptoPool,
    pool: "0xD51a44d3FaE010294C616388b506AcdA1bfAAE46",
    lpToken: "0xc4AD29ba4B3c580e6D59105FFf484999997675Ff",
    tokens: [
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    ],
    fork: 14927574,
    holder: "0x51434f6502b6167abec98ff9f5fd37ef3e07e7d2",
    amount: "100",
  },
  RAI: {
    type: PoolType.CurveMetaPool,
    pool: "0x618788357D0EBd8A37e763ADab3bc575D54c2C7d",
    deposit: "0xcB636B81743Bb8a7F1E355DEBb7D33b07009cCCC",
    lpToken: "0x6BA5b4e438FA0aAf7C1bD179285aF65d13bD3D90",
    tokens: ["0x03ab458634910AaD20eF5f1C8ee96F1D6ac54919", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0x03ab458634910AaD20eF5f1C8ee96F1D6ac54919",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0xc6c9f2ee86fb3033c8a366b15253ae447f7a36aa",
    amount: "100",
  },
  Factory_MIM: {
    type: PoolType.CurveFactoryMetaPool,
    pool: "0x5a6A4D54456819380173272A5E8E9B9904BdF41B",
    lpToken: "0x5a6A4D54456819380173272A5E8E9B9904BdF41B",
    tokens: ["0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0xe896e539e557bc751860a7763c8dd589af1698ce",
    amount: "10000",
  },
  Factory_EURT: {
    type: PoolType.CurveFactoryPlainPool,
    pool: "0xFD5dB7463a3aB53fD211b4af195c5BCCC1A03890",
    lpToken: "0xFD5dB7463a3aB53fD211b4af195c5BCCC1A03890",
    tokens: ["0xC581b735A1688071A1746c968e0798D642EDE491", "0xD71eCFF9342A5Ced620049e616c5035F1dB98620"],
    fork: 14927574,
    holder: "0x2be48819aefb2b2a186d12b63a90349422abd9e0",
    amount: "100",
  },
  Factory_4Pool: {
    type: PoolType.CurveFactoryPlainPool,
    pool: "0x4e0915C88bC70750D68C481540F081fEFaF22273",
    lpToken: "0x4e0915C88bC70750D68C481540F081fEFaF22273",
    tokens: [
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "0xa693B19d2931d498c5B318dF961919BB4aee87a5",
      "0x853d955aCEf822Db058eb8505911ED77F175b99e",
    ],
    fork: 14927574,
    holder: "0xbc40468348dea82a4924224947b54629ec1f0be3",
    amount: "1000",
  },
  eurtusd: {
    type: PoolType.CurveCryptoPool,
    pool: "0x9838eCcC42659FA8AA7daF2aD134b53984c9427b",
    deposit: "0x5D0F47B32fDd343BfA74cE221808e2abE4A53827",
    lpToken: "0x3b6831c0077a1e44ED0a21841C3bC4dC11bCE833",
    tokens: ["0xC581b735A1688071A1746c968e0798D642EDE491", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0xC581b735A1688071A1746c968e0798D642EDE491",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0x3dfcfaac8ee248cf9976e866822f2daac2ac7d03",
    amount: "10000",
  },
  xautusd: {
    type: PoolType.CurveCryptoPool,
    pool: "0xAdCFcf9894335dC340f6Cd182aFA45999F45Fc44",
    deposit: "0xc5FA220347375ac4f91f9E4A4AAb362F22801504",
    lpToken: "0x8484673cA7BfF40F82B041916881aeA15ee84834",
    tokens: ["0x68749665FF8D2d112Fa859AA293F07A622782F38", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0x68749665FF8D2d112Fa859AA293F07A622782F38",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0x84eaf06a85f498d4192946880307f9271d59304d",
    amount: "0.01",
  },
  eursusd: {
    type: PoolType.CurveCryptoPool,
    pool: "0x98a7F18d4E56Cfe84E3D081B40001B3d5bD3eB8B",
    lpToken: "0x3D229E1B4faab62F621eF2F6A610961f7BD7b23B",
    tokens: ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "0xdB25f211AB05b1c97D595516F45794528a807ad8"],
    fork: 14927574,
    holder: "0x3dfcfaac8ee248cf9976e866822f2daac2ac7d03",
    amount: "10000",
  },
  CRVETH: {
    type: PoolType.CurveCryptoPool,
    pool: "0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511",
    lpToken: "0xEd4064f376cB8d68F770FB1Ff088a3d0F3FF5c4d",
    tokens: ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0xD533a949740bb3306d119CC777fa900bA034cd52"],
    fork: 14927574,
    holder: "0xc75441d085d73983d8659635251dcf528dfb9be2",
    amount: "100",
  },
  CVXETH: {
    type: PoolType.CurveCryptoPool,
    pool: "0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4",
    lpToken: "0x3A283D9c08E8b55966afb64C515f5143cf907611",
    tokens: ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B"],
    fork: 14927574,
    holder: "0x38ee5f5a39c01cb43473992c12936ba1219711ab",
    amount: "100",
  },
  SPELLETH: {
    type: PoolType.CurveCryptoPool,
    pool: "0x98638FAcf9a3865cd033F36548713183f6996122",
    lpToken: "0x8282BD15dcA2EA2bDf24163E8f2781B30C43A2ef",
    tokens: ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0x090185f2135308BaD17527004364eBcC2D37e5F6"],
    fork: 14927574,
    holder: "0xc2351ec3e087eb3b8541e77dda069ea2ea823262",
    amount: "100",
  },
  TETH: {
    type: PoolType.CurveCryptoPool,
    pool: "0x752eBeb79963cf0732E9c0fec72a49FD1DEfAEAC",
    lpToken: "0xCb08717451aaE9EF950a2524E33B6DCaBA60147B",
    tokens: ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5"],
    fork: 14927574,
    holder: "0x6f9bb7e454f5b3eb2310343f0e99269dc2bb8a1d",
    amount: "100",
  },
  Factory_ibBTC: {
    type: PoolType.CurveFactoryMetaPool,
    pool: "0xFbdCA68601f835b27790D98bbb8eC7f05FDEaA9B",
    lpToken: "0xFbdCA68601f835b27790D98bbb8eC7f05FDEaA9B",
    tokens: ["0x8751D4196027d4e6DA63716fA7786B5174F04C15", "0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3"],
    underlyings: [
      "0x8751D4196027d4e6DA63716fA7786B5174F04C15",
      "0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D",
      "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      "0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6",
    ],
    fork: 14927574,
    holder: "0xd98c31ef5c44dc9edef1f6fd55548a80986bbcb2",
    amount: "1",
  },
  Factory_alETH: {
    type: PoolType.CurveETHPool,
    pool: "0xC4C319E2D4d66CcA4464C0c2B32c9Bd23ebe784e",
    lpToken: "0xC4C319E2D4d66CcA4464C0c2B32c9Bd23ebe784e",
    tokens: ["0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", "0x0100546F2cD4C9D97f798fFC9755E47865FF7Ee6"],
    fork: 14927574,
    holder: "0x084d0cd0605f47d92dc2dfd22238e9c5605023e9",
    amount: "1",
  },
  Factory_cvxFXS: {
    type: PoolType.CurveCryptoPool,
    pool: "0xd658A338613198204DCa1143Ac3F01A722b5d94A",
    lpToken: "0xF3A43307DcAFa93275993862Aae628fCB50dC768",
    tokens: ["0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0", "0xFEEf77d3f69374f66429C91d732A244f074bdf74"],
    fork: 14927574,
    holder: "0xea1c95d7d7b5489d9e6da6545373c82d2c3db1e2",
    amount: "1000",
  },
  Factory_cvxCRV: {
    type: PoolType.CurveFactoryPlainPool,
    pool: "0x9D0464996170c6B9e75eED71c68B99dDEDf279e8",
    lpToken: "0x9D0464996170c6B9e75eED71c68B99dDEDf279e8",
    tokens: ["0xD533a949740bb3306d119CC777fa900bA034cd52", "0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7"],
    fork: 14927574,
    holder: "0x52ad87832400485de7e7dc965d8ad890f4e82699",
    amount: "10000",
  },
  Factory_DOLA: {
    type: PoolType.CurveFactoryMetaPool,
    pool: "0xAA5A67c256e27A5d80712c51971408db3370927D",
    lpToken: "0xAA5A67c256e27A5d80712c51971408db3370927D",
    tokens: ["0x865377367054516e17014CcdED1e7d814EDC9ce4", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0x865377367054516e17014CcdED1e7d814EDC9ce4",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0xa83f6bec55a100ca3402245fc1d46127889354ec",
    amount: "10000",
  },
  Factory_rETHwstETH: {
    type: PoolType.CurveFactoryPlainPool,
    pool: "0x447Ddd4960d9fdBF6af9a790560d0AF76795CB08",
    lpToken: "0x447Ddd4960d9fdBF6af9a790560d0AF76795CB08",
    tokens: ["0xae78736Cd615f374D3085123A210448E74Fc6393", "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0"],
    fork: 14927574,
    holder: "0x28ac885d3d8b30bd5733151c732c5f01e18847aa",
    amount: "10",
  },
  Factory_PUSD: {
    type: PoolType.CurveFactoryMetaPool,
    pool: "0x8EE017541375F6Bcd802ba119bdDC94dad6911A1",
    lpToken: "0x8EE017541375F6Bcd802ba119bdDC94dad6911A1",
    tokens: ["0x466a756E9A7401B5e2444a3fCB3c2C12FBEa0a54", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"],
    underlyings: [
      "0x466a756E9A7401B5e2444a3fCB3c2C12FBEa0a54",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
    fork: 14927574,
    holder: "0xb8d5ed3f983ea318ffc9174078a663640139b851",
    amount: "10000",
  },
};

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";

describe("TokenZapLogic.spec", async () => {
  let zap: TokenZapLogic;
  let deployer: SignerWithAddress;

  describe("SushiSwap ALCX/ETH pool [UniswapV2]", async () => {
    const FORK_BLOCK_NUMBER = 14243290;
    const ALCX = "0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF";
    const ALCX_HOLDER = "0x28C6c06298d514Db089934071355E5743bf21d60";
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
    const ALCX_WETH_POOL = "0xC3f279090a47e80990Fe3a9c30d24Cb117EF91a8";

    beforeEach(async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, ALCX_HOLDER, WETH_HOLDER]);
      deployer = await ethers.getSigner(DEPLOYER);

      const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
      zap = await TokenZapLogic.deploy();
      await zap.deployed();
    });

    it("should succeed, when swap ALCX => ETH", async () => {
      const signer = await ethers.getSigner(ALCX_HOLDER);
      await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("100") });

      const amountIn = ethers.utils.parseEther("1000");
      const amountOut = ethers.utils.parseEther("51.495099018330704251");

      const alcx = await ethers.getContractAt("IERC20", ALCX, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      await alcx.transfer(zap.address, amountIn);
      const output = await zap.callStatic.swap(
        encodePoolHintV2(ALCX_WETH_POOL, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
        amountIn
      );
      const before = await weth.balanceOf(zap.address);
      const tx = await zap.swap(encodePoolHintV2(ALCX_WETH_POOL, PoolType.UniswapV2, 2, 1, 0, Action.Swap), amountIn);
      await tx.wait();
      const after = await weth.balanceOf(zap.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when swap ETH => ALCX", async () => {
      const amountIn = ethers.utils.parseEther("51");
      const amountOut = ethers.utils.parseEther("974.326629973535940649");

      await deployer.sendTransaction({ to: zap.address, value: amountIn });
      const alcx = await ethers.getContractAt("IERC20", ALCX, deployer);
      const output = await zap.callStatic.swap(
        encodePoolHintV2(ALCX_WETH_POOL, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
        amountIn
      );
      const before = await alcx.balanceOf(zap.address);
      await zap.swap(encodePoolHintV2(ALCX_WETH_POOL, PoolType.UniswapV2, 2, 0, 1, Action.Swap), amountIn);
      const after = await alcx.balanceOf(zap.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when swap WETH => ALCX", async () => {
      const signer = await ethers.getSigner(WETH_HOLDER);
      await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("100") });
      const amountIn = ethers.utils.parseEther("51");
      const amountOut = ethers.utils.parseEther("974.326629973535940649");

      const alcx = await ethers.getContractAt("IERC20", ALCX, deployer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      await weth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.swap(
        encodePoolHintV2(ALCX_WETH_POOL, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
        amountIn
      );
      const before = await alcx.balanceOf(zap.address);
      await zap.swap(encodePoolHintV2(ALCX_WETH_POOL, PoolType.UniswapV2, 2, 0, 1, Action.Swap), amountIn);
      const after = await alcx.balanceOf(zap.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });
  });

  describe("UniswapV2 FXS/FRAX pool [UniswapV2]", async () => {
    const FORK_BLOCK_NUMBER = 14243290;
    const FXS = "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0";
    const FXS_HOLDER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
    const FRAX = "0x853d955aCEf822Db058eb8505911ED77F175b99e";
    const FRAX_HOLDER = "0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE";
    const FXS_FRAX_POOL = "0xE1573B9D29e2183B1AF0e743Dc2754979A40D237";

    beforeEach(async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, FXS_HOLDER, FRAX_HOLDER]);
      deployer = await ethers.getSigner(DEPLOYER);

      const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
      zap = await TokenZapLogic.deploy();
      await zap.deployed();
    });

    it("should succeed, when swap FXS => FRAX", async () => {
      const signer = await ethers.getSigner(FXS_HOLDER);
      await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("100") });
      const amountIn = ethers.utils.parseEther("1000");
      const amountOut = ethers.utils.parseEther("20426.482715012613886488");

      const fxs = await ethers.getContractAt("IERC20", FXS, signer);
      const frax = await ethers.getContractAt("IERC20", FRAX, signer);
      await fxs.transfer(zap.address, amountIn);
      const output = await zap.callStatic.swap(
        encodePoolHintV2(FXS_FRAX_POOL, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
        amountIn
      );
      const before = await frax.balanceOf(zap.address);
      await zap.swap(encodePoolHintV2(FXS_FRAX_POOL, PoolType.UniswapV2, 2, 0, 1, Action.Swap), amountIn);
      const after = await frax.balanceOf(zap.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when swap FRAX => FXS", async () => {
      const signer = await ethers.getSigner(FRAX_HOLDER);
      await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("100") });
      const amountIn = ethers.utils.parseEther("20426");
      const amountOut = ethers.utils.parseEther("993.236385083446866442");

      const fxs = await ethers.getContractAt("IERC20", FXS, signer);
      const frax = await ethers.getContractAt("IERC20", FRAX, signer);
      await frax.transfer(zap.address, amountIn);
      const output = await zap.callStatic.swap(
        encodePoolHintV2(FXS_FRAX_POOL, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
        amountIn
      );
      const before = await fxs.balanceOf(zap.address);
      await zap.swap(encodePoolHintV2(FXS_FRAX_POOL, PoolType.UniswapV2, 2, 1, 0, Action.Swap), amountIn);
      const after = await fxs.balanceOf(zap.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });
  });

  describe("UniswapV3 FXS/ETH pool [UniswapV3]", async () => {
    const FORK_BLOCK_NUMBER = 14243290;
    const FXS = "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0";
    const FXS_HOLDER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
    const FXS_WETH_POOL = "0xCD8286b48936cDAC20518247dBD310ab681A9fBf";

    beforeEach(async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, FXS_HOLDER, WETH_HOLDER]);
      deployer = await ethers.getSigner(DEPLOYER);

      const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
      zap = await TokenZapLogic.deploy();
      await zap.deployed();
    });

    it("should succeed, when swap FXS => WETH", async () => {
      const signer = await ethers.getSigner(FXS_HOLDER);
      await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("100") });
      const amountIn = ethers.utils.parseEther("1000");
      const amountOut = ethers.utils.parseEther("7.741961292003055789");

      const fxs = await ethers.getContractAt("IERC20", FXS, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      await fxs.transfer(zap.address, amountIn);
      const output = await zap.callStatic.swap(
        encodePoolHintV2(FXS_WETH_POOL, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        amountIn
      );
      const before = await weth.balanceOf(zap.address);
      await zap.swap(encodePoolHintV2(FXS_WETH_POOL, PoolType.UniswapV3, 2, 0, 1, Action.Swap), amountIn);
      const after = await weth.balanceOf(zap.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when swap ETH => FXS", async () => {
      const amountIn = ethers.utils.parseEther("6");
      const amountOut = ethers.utils.parseEther("757.393998811295210898");

      const fxs = await ethers.getContractAt("IERC20", FXS, deployer);
      await deployer.sendTransaction({ to: zap.address, value: amountIn });
      const output = await zap.callStatic.swap(
        encodePoolHintV2(FXS_WETH_POOL, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        amountIn
      );
      const before = await fxs.balanceOf(zap.address);
      await zap.swap(encodePoolHintV2(FXS_WETH_POOL, PoolType.UniswapV3, 2, 1, 0, Action.Swap), amountIn);
      const after = await fxs.balanceOf(zap.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when swap WETH => FXS", async () => {
      const signer = await ethers.getSigner(WETH_HOLDER);
      await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("100") });
      const amountIn = ethers.utils.parseEther("6");
      const amountOut = ethers.utils.parseEther("757.393998811295210898");

      const fxs = await ethers.getContractAt("IERC20", FXS, deployer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      await weth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.swap(
        encodePoolHintV2(FXS_WETH_POOL, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        amountIn
      );
      const before = await fxs.balanceOf(zap.address);
      await zap.swap(encodePoolHintV2(FXS_WETH_POOL, PoolType.UniswapV3, 2, 1, 0, Action.Swap), amountIn);
      const after = await fxs.balanceOf(zap.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });
  });

  describe("BalancerV2 BAL/ETH pool [BalancerV2]", async () => {
    const FORK_BLOCK_NUMBER = 14243290;
    const BAL = "0xba100000625a3754423978a60c9317c58a424e3D";
    const BAL_HOLDER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
    const BAL_WETH_POOL = "0x5c6Ee304399DBdB9C8Ef030aB642B10820DB8F56";

    beforeEach(async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, BAL_HOLDER, WETH_HOLDER]);
      deployer = await ethers.getSigner(DEPLOYER);

      const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
      zap = await TokenZapLogic.deploy();
      await zap.deployed();
    });

    it("should succeed, when swap BAL => WETH", async () => {
      const signer = await ethers.getSigner(BAL_HOLDER);
      await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("100") });
      const amountIn = ethers.utils.parseEther("1000");
      const amountOut = ethers.utils.parseEther("4.764865930000778955");

      const bal = await ethers.getContractAt("IERC20", BAL, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      await bal.transfer(zap.address, amountIn);
      const output = await zap.callStatic.swap(
        encodePoolHintV2(BAL_WETH_POOL, PoolType.BalancerV2, 2, 0, 1, Action.Swap),
        amountIn
      );
      const before = await weth.balanceOf(zap.address);
      await zap.swap(encodePoolHintV2(BAL_WETH_POOL, PoolType.BalancerV2, 2, 0, 1, Action.Swap), amountIn);
      const after = await weth.balanceOf(zap.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when swap ETH => BAL", async () => {
      const amountIn = ethers.utils.parseEther("5");
      const amountOut = ethers.utils.parseEther("1047.319488206268040465");

      const bal = await ethers.getContractAt("IERC20", BAL, deployer);
      await deployer.sendTransaction({ to: zap.address, value: amountIn });
      const output = await zap.callStatic.swap(
        encodePoolHintV2(BAL_WETH_POOL, PoolType.BalancerV2, 2, 1, 0, Action.Swap),
        amountIn
      );
      const before = await bal.balanceOf(zap.address);
      await zap.swap(encodePoolHintV2(BAL_WETH_POOL, PoolType.BalancerV2, 2, 1, 0, Action.Swap), amountIn);
      const after = await bal.balanceOf(zap.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when swap WETH => BAL", async () => {
      const signer = await ethers.getSigner(WETH_HOLDER);
      await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("100") });
      const amountIn = ethers.utils.parseEther("5");
      const amountOut = ethers.utils.parseEther("1047.319488206268040465");

      const bal = await ethers.getContractAt("IERC20", BAL, deployer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      await weth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.swap(
        encodePoolHintV2(BAL_WETH_POOL, PoolType.BalancerV2, 2, 1, 0, Action.Swap),
        amountIn
      );
      const before = await bal.balanceOf(zap.address);
      await zap.swap(encodePoolHintV2(BAL_WETH_POOL, PoolType.BalancerV2, 2, 1, 0, Action.Swap), amountIn);
      const after = await bal.balanceOf(zap.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });
  });

  describe("ETH/stETH [LidoStake]", async () => {
    const FORK_BLOCK_NUMBER = 14243290;
    const STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";

    beforeEach(async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, WETH_HOLDER]);
      deployer = await ethers.getSigner(DEPLOYER);

      const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
      zap = await TokenZapLogic.deploy();
      await zap.deployed();
    });

    it("should succeed, when wrap ETH to stETH", async () => {
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("9.999999999999999999"); // steth has some rounding error

      const steth = await ethers.getContractAt("IERC20", STETH, deployer);
      await deployer.sendTransaction({ to: zap.address, value: amountIn });
      const output = await zap.callStatic.swap(
        encodePoolHintV2(STETH, PoolType.LidoStake, 2, 0, 0, Action.AddLiquidity),
        amountIn
      );
      const before = await steth.balanceOf(zap.address);
      await zap.swap(encodePoolHintV2(STETH, PoolType.LidoStake, 2, 0, 0, Action.AddLiquidity), amountIn);
      const after = await steth.balanceOf(zap.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut); // steth has some rounding error
    });

    it("should succeed, when wrap WETH to stETH", async () => {
      const signer = await ethers.getSigner(WETH_HOLDER);
      await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("100") });
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("9.999999999999999999"); // steth has some rounding error

      const steth = await ethers.getContractAt("IERC20", STETH, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      await weth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.swap(
        encodePoolHintV2(STETH, PoolType.LidoStake, 2, 0, 0, Action.AddLiquidity),
        amountIn
      );
      const before = await steth.balanceOf(zap.address);
      await zap.swap(encodePoolHintV2(STETH, PoolType.LidoStake, 2, 0, 0, Action.AddLiquidity), amountIn);
      const after = await steth.balanceOf(zap.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut); // steth has some rounding error
    });
  });

  describe("stETH/wstETH [LidoWrap]", async () => {
    const FORK_BLOCK_NUMBER = 14243290;
    const STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
    const STETH_HOLDER = "0x06920C9fC643De77B99cB7670A944AD31eaAA260";
    const WSTETH = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";
    const WSTETH_HOLDER = "0xD655F6507D86203F3970AA4448d9b7873B7942a9";

    beforeEach(async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, STETH_HOLDER, WSTETH_HOLDER]);
      deployer = await ethers.getSigner(DEPLOYER);

      const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
      zap = await TokenZapLogic.deploy();
      await zap.deployed();
    });

    it("should succeed, when wrap stETH to wstETH", async () => {
      const signer = await ethers.getSigner(STETH_HOLDER);
      await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("100") });
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("9.419555176735992187");

      const steth = await ethers.getContractAt("IERC20", STETH, signer);
      const wsteth = await ethers.getContractAt("IERC20", WSTETH, signer);
      await steth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.swap(
        encodePoolHintV2(WSTETH, PoolType.LidoWrap, 2, 0, 0, Action.AddLiquidity),
        amountIn
      );
      const before = await wsteth.balanceOf(zap.address);
      await zap.swap(encodePoolHintV2(WSTETH, PoolType.LidoWrap, 2, 0, 0, Action.AddLiquidity), amountIn);
      const after = await wsteth.balanceOf(zap.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when unwrap wstETH to stETH", async () => {
      const signer = await ethers.getSigner(WSTETH_HOLDER);
      await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("100") });
      const amountIn = ethers.utils.parseEther("9.419555176735992187");
      const amountOut = ethers.utils.parseEther("9.999999999999999999"); // steth has some rounding error

      const steth = await ethers.getContractAt("IERC20", STETH, signer);
      const wsteth = await ethers.getContractAt("IERC20", WSTETH, signer);
      await wsteth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.swap(
        encodePoolHintV2(WSTETH, PoolType.LidoWrap, 2, 0, 0, Action.RemoveLiquidity),
        amountIn
      );
      const before = await steth.balanceOf(zap.address);
      await zap.swap(encodePoolHintV2(WSTETH, PoolType.LidoWrap, 2, 0, 0, Action.RemoveLiquidity), amountIn);
      const after = await steth.balanceOf(zap.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before).add(1)).to.eq(amountOut); // steth has some rounding error
    });
  });

  const getBalanceFromZap = async (address: string) => {
    if (
      address === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" ||
      address === "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
    ) {
      const weth = await ethers.getContractAt("IERC20", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", deployer);
      const nativeBalance = await ethers.provider.getBalance(zap.address);
      const walletBalance = await weth.balanceOf(zap.address);
      return nativeBalance.add(walletBalance);
    } else {
      const token = await ethers.getContractAt("IERC20", address, deployer);
      return await token.balanceOf(zap.address);
    }
  };

  const generateCurveTests = async (name: string) => {
    let signer: SignerWithAddress;
    let lpToken: IERC20;

    const pool = CURVE_POOLS[name];

    // CurveYPool has no `remove_liquidity_one_coin`
    if (pool.type !== PoolType.CurveYPool) {
      context(`Curve ${name}, type[${Type2String[pool.type]}], tokens[${pool.tokens.length}]`, async () => {
        beforeEach(async () => {
          request_fork(pool.fork, [DEPLOYER, pool.holder]);
          deployer = await ethers.getSigner(DEPLOYER);
          signer = await ethers.getSigner(pool.holder);

          await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("100") });

          const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
          zap = await TokenZapLogic.deploy();
          await zap.deployed();

          lpToken = await ethers.getContractAt("IERC20", pool.lpToken, signer);
        });

        describe("RemoveLiquidity", async () => {
          const amountIn = ethers.utils.parseEther(pool.amount);

          beforeEach(async () => {
            await lpToken.transfer(zap.address, amountIn);
          });

          pool.tokens.forEach((address, index) => {
            const symbol = TOKENS[address].symbol;
            const decimals = TOKENS[address].decimals;

            it(`should succeed, when remove liquidity to ${symbol}`, async () => {
              const output = await zap.callStatic.swap(
                encodePoolHintV2(pool.pool, pool.type, pool.tokens.length, 0, index, Action.RemoveLiquidity),
                amountIn
              );
              expect(output).gt(constants.Zero);
              console.log("amountIn:", pool.amount, "amountOut:", ethers.utils.formatUnits(output, decimals));
              const beforeBalance = await getBalanceFromZap(address);
              await zap.swap(
                encodePoolHintV2(pool.pool, pool.type, pool.tokens.length, 0, index, Action.RemoveLiquidity),
                amountIn
              );
              const afterBalance = await getBalanceFromZap(address);
              if ([PoolType.CurveAPool, PoolType.CurveYPool].includes(pool.type)) {
                expect(afterBalance.sub(beforeBalance)).to.closeToBn(output, output.div(1000000));
              } else {
                expect(afterBalance.sub(beforeBalance)).to.eq(output);
              }
            });
          });
        });

        describe("AddLiquidity", async () => {
          const lpAmount = ethers.utils.parseEther(pool.amount);
          beforeEach(async () => {
            await lpToken.transfer(zap.address, lpAmount);
          });

          pool.tokens.forEach((address, index) => {
            const symbol = TOKENS[address].symbol;
            const decimals = TOKENS[address].decimals;

            if (symbol === "ETH" || symbol === "WETH") {
              address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
            }

            it(`should succeed, when add ${symbol} liquidity`, async () => {
              // remove liquidity first
              await zap.swap(
                encodePoolHintV2(pool.pool, pool.type, pool.tokens.length, 0, index, Action.RemoveLiquidity),
                lpAmount
              );
              const amountIn = await getBalanceFromZap(address);
              const output = await zap.callStatic.swap(
                encodePoolHintV2(pool.pool, pool.type, pool.tokens.length, index, 0, Action.AddLiquidity),
                amountIn
              );
              expect(output).gt(constants.Zero);
              console.log(
                "amountIn:",
                ethers.utils.formatUnits(amountIn, decimals),
                "amountOut:",
                ethers.utils.formatUnits(output, 18)
              );
              const beforeBalance = await getBalanceFromZap(lpToken.address);
              await zap.swap(
                encodePoolHintV2(pool.pool, pool.type, pool.tokens.length, index, 0, Action.AddLiquidity),
                amountIn
              );
              const afterBalance = await getBalanceFromZap(lpToken.address);
              if ([PoolType.CurveAPool, PoolType.CurveYPool].includes(pool.type)) {
                expect(afterBalance.sub(beforeBalance)).to.closeToBn(output, output.div(1000000));
              } else {
                expect(afterBalance.sub(beforeBalance)).to.eq(output);
              }
            });
          });
        });

        pool.tokens.forEach((srcAddress, indexIn) => {
          const srcSymbol = TOKENS[srcAddress].symbol;
          const srcDecimals = TOKENS[srcAddress].decimals;

          describe(`Swap from ${srcSymbol}`, async () => {
            let amountIn: BigNumber;
            beforeEach(async () => {
              const lpAmount = ethers.utils.parseEther(pool.amount);
              await lpToken.transfer(zap.address, lpAmount);

              // remove liquidity first
              await zap.swap(
                encodePoolHintV2(pool.pool, pool.type, pool.tokens.length, 0, indexIn, Action.RemoveLiquidity),
                lpAmount
              );
              amountIn = await getBalanceFromZap(srcAddress);
            });

            pool.tokens.forEach((dstAddress, indexOut) => {
              if (indexIn === indexOut) return;
              const dstSymbol = TOKENS[dstAddress].symbol;
              const dstDecimals = TOKENS[dstAddress].decimals;

              it(`should succeed, when swap ${srcSymbol} to ${dstSymbol}`, async () => {
                const output = await zap.callStatic.swap(
                  encodePoolHintV2(pool.pool, pool.type, pool.tokens.length, indexIn, indexOut, Action.Swap),
                  amountIn
                );
                expect(output).gt(constants.Zero);
                console.log(
                  "amountIn:",
                  ethers.utils.formatUnits(amountIn, srcDecimals),
                  "amountOut:",
                  ethers.utils.formatUnits(output, dstDecimals)
                );
                const beforeBalance = await getBalanceFromZap(dstAddress);
                await zap.swap(
                  encodePoolHintV2(pool.pool, pool.type, pool.tokens.length, indexIn, indexOut, Action.Swap),
                  amountIn
                );
                const afterBalance = await getBalanceFromZap(dstAddress);
                if ([PoolType.CurveAPool, PoolType.CurveYPool].includes(pool.type)) {
                  expect(afterBalance.sub(beforeBalance)).to.closeToBn(output, output.div(1000000));
                } else {
                  expect(afterBalance.sub(beforeBalance)).to.eq(output);
                }
              });
            });
          });
        });
      });
    }

    const underlyingTokens = pool.underlyings;
    if (underlyingTokens !== undefined) {
      let underlyingType: PoolType = 0;
      if (pool.type === PoolType.CurveAPool) underlyingType = PoolType.CurveAPoolUnderlying;
      else if (pool.type === PoolType.CurveYPool) underlyingType = PoolType.CurveYPoolUnderlying;
      else if (pool.type === PoolType.CurveMetaPool) underlyingType = PoolType.CurveMetaPoolUnderlying;
      else if (pool.type === PoolType.CurveFactoryMetaPool) {
        if (pool.tokens[1] === "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490")
          underlyingType = PoolType.CurveFactoryUSDMetaPoolUnderlying;
        else if (pool.tokens[1] === "0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3")
          underlyingType = PoolType.CurveFactoryBTCMetaPoolUnderlying;
      } else if (pool.type === PoolType.CurveCryptoPool) underlyingType = PoolType.CurveMetaCryptoPool;

      let poolAddress = pool.pool;
      if (underlyingType === PoolType.CurveYPoolUnderlying) poolAddress = pool.deposit!;
      if (underlyingType === PoolType.CurveMetaPoolUnderlying) poolAddress = pool.deposit!;
      if (underlyingType === PoolType.CurveMetaCryptoPool) poolAddress = pool.deposit!;

      context(`Curve ${name}, type[${Type2String[underlyingType]}], tokens[${underlyingTokens.length}]`, async () => {
        beforeEach(async () => {
          request_fork(pool.fork, [DEPLOYER, pool.holder]);
          deployer = await ethers.getSigner(DEPLOYER);
          signer = await ethers.getSigner(pool.holder);

          await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("100") });

          const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
          zap = await TokenZapLogic.deploy();
          await zap.deployed();

          lpToken = await ethers.getContractAt("IERC20", pool.lpToken, signer);
        });

        describe("RemoveLiquidity", async () => {
          const amountIn = ethers.utils.parseEther(pool.amount);

          beforeEach(async () => {
            await lpToken.transfer(zap.address, amountIn);
          });

          underlyingTokens.forEach((address, index) => {
            const symbol = TOKENS[address].symbol;
            const decimals = TOKENS[address].decimals;

            it(`should succeed, when remove liquidity to ${symbol}`, async () => {
              const output = await zap.callStatic.swap(
                encodePoolHintV2(
                  poolAddress,
                  underlyingType,
                  underlyingTokens.length,
                  0,
                  index,
                  Action.RemoveLiquidity
                ),
                amountIn
              );
              expect(output).gt(constants.Zero);
              console.log("amountIn:", pool.amount, "amountOut:", ethers.utils.formatUnits(output, decimals));
              const beforeBalance = await getBalanceFromZap(address);
              await zap.swap(
                encodePoolHintV2(poolAddress, underlyingType, pool.tokens.length, 0, index, Action.RemoveLiquidity),
                amountIn
              );
              const afterBalance = await getBalanceFromZap(address);
              if ([PoolType.CurveAPool, PoolType.CurveYPool].includes(pool.type)) {
                expect(afterBalance.sub(beforeBalance)).to.closeToBn(output, output.div(1000000));
              } else {
                expect(afterBalance.sub(beforeBalance)).to.eq(output);
              }
            });
          });
        });

        describe("AddLiquidity", async () => {
          const lpAmount = ethers.utils.parseEther(pool.amount);
          beforeEach(async () => {
            await lpToken.transfer(zap.address, lpAmount);
          });

          underlyingTokens.forEach((address, index) => {
            const symbol = TOKENS[address].symbol;
            const decimals = TOKENS[address].decimals;

            if (symbol === "ETH" || symbol === "WETH") {
              address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
            }

            it(`should succeed, when add ${symbol} liquidity`, async () => {
              // remove liquidity first
              const amountIn = await zap.callStatic.swap(
                encodePoolHintV2(
                  poolAddress,
                  underlyingType,
                  underlyingTokens.length,
                  0,
                  index,
                  Action.RemoveLiquidity
                ),
                lpAmount
              );
              await zap.swap(
                encodePoolHintV2(
                  poolAddress,
                  underlyingType,
                  underlyingTokens.length,
                  0,
                  index,
                  Action.RemoveLiquidity
                ),
                lpAmount
              );

              const output = await zap.callStatic.swap(
                encodePoolHintV2(poolAddress, underlyingType, underlyingTokens.length, index, 0, Action.AddLiquidity),
                amountIn
              );
              expect(output).gt(constants.Zero);
              console.log(
                "amountIn:",
                ethers.utils.formatUnits(amountIn, decimals),
                "amountOut:",
                ethers.utils.formatUnits(output, 18)
              );
              const beforeBalance = await getBalanceFromZap(lpToken.address);
              await zap.swap(
                encodePoolHintV2(poolAddress, underlyingType, underlyingTokens.length, index, 0, Action.AddLiquidity),
                amountIn
              );
              const afterBalance = await getBalanceFromZap(lpToken.address);
              if ([PoolType.CurveAPool, PoolType.CurveYPool].includes(pool.type)) {
                expect(afterBalance.sub(beforeBalance)).to.closeToBn(output, output.div(1000000));
              } else {
                expect(afterBalance.sub(beforeBalance)).to.eq(output);
              }
            });
          });
        });

        underlyingTokens.forEach((srcAddress, indexIn) => {
          const srcSymbol = TOKENS[srcAddress].symbol;
          const srcDecimals = TOKENS[srcAddress].decimals;

          describe(`Swap from ${srcSymbol}`, async () => {
            let amountIn: BigNumber;
            beforeEach(async () => {
              const lpAmount = ethers.utils.parseEther(pool.amount);
              await lpToken.transfer(zap.address, lpAmount);

              // remove liquidity first
              amountIn = await zap.callStatic.swap(
                encodePoolHintV2(
                  poolAddress,
                  underlyingType,
                  underlyingTokens.length,
                  0,
                  indexIn,
                  Action.RemoveLiquidity
                ),
                lpAmount
              );
              await zap.swap(
                encodePoolHintV2(
                  poolAddress,
                  underlyingType,
                  underlyingTokens.length,
                  0,
                  indexIn,
                  Action.RemoveLiquidity
                ),
                lpAmount
              );
            });

            underlyingTokens.forEach((dstAddress, indexOut) => {
              if (indexIn === indexOut) return;
              const dstSymbol = TOKENS[dstAddress].symbol;
              const dstDecimals = TOKENS[dstAddress].decimals;

              it(`should succeed, when swap ${srcSymbol} to ${dstSymbol}`, async () => {
                const output = await zap.callStatic.swap(
                  encodePoolHintV2(
                    poolAddress,
                    underlyingType,
                    underlyingTokens.length,
                    indexIn,
                    indexOut,
                    Action.Swap
                  ),
                  amountIn
                );
                expect(output).gt(constants.Zero);
                console.log(
                  "amountIn:",
                  ethers.utils.formatUnits(amountIn, srcDecimals),
                  "amountOut:",
                  ethers.utils.formatUnits(output, dstDecimals)
                );
                const beforeBalance = await getBalanceFromZap(dstAddress);
                await zap.swap(
                  encodePoolHintV2(
                    poolAddress,
                    underlyingType,
                    underlyingTokens.length,
                    indexIn,
                    indexOut,
                    Action.Swap
                  ),
                  amountIn
                );
                const afterBalance = await getBalanceFromZap(dstAddress);
                if ([PoolType.CurveAPool, PoolType.CurveYPool].includes(pool.type)) {
                  expect(afterBalance.sub(beforeBalance)).to.closeToBn(output, output.div(1000000));
                } else {
                  expect(afterBalance.sub(beforeBalance)).to.eq(output);
                }
              });
            });
          });
        });
      });
    }
  };

  for (const pool of [
    "Factory_FRAX",
    "stETH",
    "TriCrypto2",
    "3Pool",
    "IronBank",
    "Factory_MIM",
    "Factory_cvxCRV",
    "renBTC",
    "Compound",
    "Factory_alETH",
    "CVXETH",
    "CRVETH",
    "Factory_DOLA",
    "Factory_cvxFXS",
    "Factory_LUSD",
    "Factory_ibBTC",
    "USDN",
    "Factory_rETHwstETH",
    "Factory_PUSD",
  ]) {
    generateCurveTests(pool);
  }
});

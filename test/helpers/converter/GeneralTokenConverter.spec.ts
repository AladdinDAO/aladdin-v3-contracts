/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Action, ADDRESS, encodePoolHintV3, PoolTypeV3, TOKENS } from "../../../scripts/utils";
import { ConverterRegistry, GeneralTokenConverter } from "../../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../../utils";
import { BigNumber } from "ethers";

/*
const Type2String: { [type: number]: string } = {
  [PoolTypeV3.UniswapV2]: "UniswapV2",
  [PoolTypeV3.UniswapV3]: "UniswapV3",
  [PoolTypeV3.BalancerV1]: "BalancerV1",
  [PoolTypeV3.BalancerV2]: "BalancerV2",
  [PoolTypeV3.CurvePlainPool]: "CurvePlainPool",
  [PoolTypeV3.CurveAPool]: "CurveAPool",
  [PoolTypeV3.CurveYPool]: "CurveYPool",
  [PoolTypeV3.CurveMetaPool]: "CurveMetaPool",
  [PoolTypeV3.CurveCryptoPool]: "CurveCryptoPool",
};

const CURVE_POOLS: {
  [name: string]: {
    type: PoolTypeV3;
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
  "ETH/stETH-steth": {
    type: PoolTypeV3.CurvePlainPool,
    pool: "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022",
    lpToken: "0x06325440D014e39736583c165C2963BA99fAf14E",
    tokens: ["ETH", "stETH"],
    fork: 17621560,
    holder: "0x65eaB5eC71ceC12f38829Fbb14C98ce4baD28C46",
    amount: "100",
  },
  "FRAX/USDC-fraxusdc": {
    type: PoolTypeV3.CurvePlainPool,
    pool: "0xdcef968d416a41cdac0ed8702fac8128a64241a2",
    lpToken: "0x3175df0976dfa876431c2e9ee6bc45b65d3473cc",
    tokens: ["FRAX", "USDC"],
    fork: 17621560,
    holder: "0x2983a7225ed34C73F97527F51a90CdDeD605CBf5",
    amount: "100",
  },
  "DAI/USDC/USDT-3pool": {
    type: PoolTypeV3.CurvePlainPool,
    pool: "0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7",
    lpToken: "0x6c3f90f043a72fa612cbac8115ee7e52bde6e490",
    tokens: ["DAI", "USDC", "USDT"],
    fork: 17621560,
    holder: "0xeCb456EA5365865EbAb8a2661B0c503410e9B347",
    amount: "100",
  },
  "FRAX/3CRV": {
    type: PoolTypeV3.CurveMetaPool,
    pool: "0xd632f22692fac7611d2aa1c0d552930d43caed3b",
    lpToken: "0xd632f22692fac7611d2aa1c0d552930d43caed3b",
    tokens: ["FRAX", "3CRV"],
    fork: 17621560,
    holder: "0x11FEFB3591A83D5fbc5C9ab19a7e77a36d737c28",
    amount: "100",
  },
  "ETH/frxETH-frxeth": {
    type: PoolTypeV3.CurvePlainPool,
    pool: "0xa1f8a6807c402e4a15ef4eba36528a3fed24e577",
    lpToken: "0xf43211935c781d5ca1a41d2041f397b8a7366c7a",
    tokens: ["ETH", "frxETH"],
    fork: 17621560,
    holder: "0x38a93e70b0D8343657f802C1c3Fdb06aC8F8fe99",
    amount: "10",
  },
  "USDT/WBTC/ETH-tricrypto2": {
    type: PoolTypeV3.CurveCryptoPool,
    pool: "0xd51a44d3fae010294c616388b506acda1bfaae46",
    lpToken: "0xc4ad29ba4b3c580e6d59105fff484999997675ff",
    tokens: ["USDT", "WBTC", "ETH"],
    fork: 17621560,
    holder: "0x347140c7F001452e6A60131D24b37103D0e34231",
    amount: "10",
  },
  "FRAX/FPI-FPI2Pool": {
    type: PoolTypeV3.CurveCryptoPool,
    pool: "0xf861483fa7e511fbc37487d91b6faa803af5d37c",
    lpToken: "0x4704ab1fb693ce163f7c9d3a31b3ff4eaf797714",
    tokens: ["FRAX", "FPI"],
    fork: 17621560,
    holder: "0xeCb456EA5365865EbAb8a2661B0c503410e9B347",
    amount: "10",
  },
  "FRAX/USDP-fraxusdp": {
    type: PoolTypeV3.CurvePlainPool,
    pool: "0xae34574ac03a15cd58a92dc79de7b1a0800f1ce3",
    lpToken: "0xfc2838a17d8e8b1d5456e0a351b0708a09211147",
    tokens: ["FRAX", "USDP"],
    fork: 17621560,
    holder: "0xE6DA683076b7eD6ce7eC972f21Eb8F91e9137a17",
    amount: "10",
  },
  "ETH/stETH-ng": {
    type: PoolTypeV3.CurvePlainPool,
    pool: "0x21e27a5e5513d6e65c4f830167390997aa84843a",
    lpToken: "0x21e27a5e5513d6e65c4f830167390997aa84843a",
    tokens: ["ETH", "stETH"],
    fork: 17621560,
    holder: "0x0FCbf9A4398C15d6609580879681Aa5382FF8542",
    amount: "10",
  },
  "MIM/3CRV": {
    type: PoolTypeV3.CurveMetaPool,
    pool: "0x5a6a4d54456819380173272a5e8e9b9904bdf41b",
    lpToken: "0x5a6a4d54456819380173272a5e8e9b9904bdf41b",
    tokens: ["MIM", "3CRV"],
    fork: 17621560,
    holder: "0x66C90baCE2B68955C875FdA89Ba2c5A94e672440",
    amount: "10000",
  },
  "DAI/USDC/USDT/sUSD-susd": {
    type: PoolTypeV3.CurveYPool,
    pool: "0xa5407eae9ba41422680e2e00537571bcc53efbfd",
    lpToken: "0xc25a3a3b969415c80451098fa907ec722572917f",
    deposit: "0xFCBa3E75865d2d561BE8D220616520c171F12851",
    tokens: ["DAI", "USDC", "USDT", "sUSD"],
    underlyings: ["DAI", "USDC", "USDT", "sUSD"],
    fork: 17621560,
    holder: "0x9E51BE7071F086d3A1fD5Dc0016177473619b237",
    amount: "10000",
  },
  "alUSD/crvFRAX": {
    type: PoolTypeV3.CurveMetaPool,
    pool: "0xb30da2376f63de30b42dc055c93fa474f31330a5",
    lpToken: "0xb30da2376f63de30b42dc055c93fa474f31330a5",
    tokens: ["alUSD", "crvFRAX"],
    fork: 17621560,
    holder: "0x5Ae9f3d885C41d42b2d575de59f6eB2108d76A23",
    amount: "10",
  },
  "USDT/WBTC/ETH-TricryptoUSDT": {
    type: PoolTypeV3.CurveCryptoPool,
    pool: "0xf5f5b97624542d72a9e06f04804bf81baa15e2b4",
    lpToken: "0xf5f5b97624542d72a9e06f04804bf81baa15e2b4",
    tokens: ["USDT", "WBTC", "ETH"],
    fork: 17621560,
    holder: "0xeCb456EA5365865EbAb8a2661B0c503410e9B347",
    amount: "1",
  },
  "CRV/cvxCRV": {
    type: PoolTypeV3.CurvePlainPool,
    pool: "0x971add32ea87f10bd192671630be3be8a11b8623",
    lpToken: "0x971add32ea87f10bd192671630be3be8a11b8623",
    tokens: ["CRV", "cvxCRV"],
    fork: 17621560,
    holder: "0x109B3C39d675A2FF16354E116d080B94d238a7c9",
    amount: "100",
  },
  "ETH/CRV-crveth": {
    type: PoolTypeV3.CurveCryptoPool,
    pool: "0x8301ae4fc9c624d1d396cbdaa1ed877821d7c511",
    lpToken: "0xed4064f376cb8d68f770fb1ff088a3d0f3ff5c4d",
    tokens: ["ETH", "CRV"],
    fork: 17621560,
    holder: "0x38a93e70b0D8343657f802C1c3Fdb06aC8F8fe99",
    amount: "10",
  },
};
*/

describe("GeneralTokenConverter.spec", async () => {
  let converter: GeneralTokenConverter;
  let registry: ConverterRegistry;
  let deployer: SignerWithAddress;

  const swaps: {
    [path: string]: {
      tokenIn: string;
      tokenOut: string;
      encoding: BigNumber;
      fork: number;
      deployer: string;
      holder: string;
      amountIn: string;
      amountOut: string;
    };
  } = {
    "sdCRV => CRV with Curve": {
      tokenIn: TOKENS.sdCRV.address,
      tokenOut: TOKENS.CRV.address,
      encoding: encodePoolHintV3(ADDRESS["CURVE_CRV/sdCRV_V2_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x25431341A5800759268a6aC1d3CD91C029D7d9CA",
      amountIn: "1000",
      amountOut: "976.589209323566660308",
    },
    "CRV => cvxCRV with Curve": {
      tokenIn: TOKENS.CRV.address,
      tokenOut: TOKENS.cvxCRV.address,
      encoding: encodePoolHintV3(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x25431341A5800759268a6aC1d3CD91C029D7d9CA",
      amountIn: "1000",
      amountOut: "1030.991452258856831178",
    },
    "Curve FXS/cvxFXS LP => FXS": {
      tokenIn: ADDRESS.CURVE_cvxFXS_TOKEN,
      tokenOut: TOKENS.FXS.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_cvxFXS_TOKEN, PoolTypeV3.CurveCryptoPool, 2, 0, 0, Action.Remove),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xdc88d12721F9cA1404e9e6E6389aE0AbDd54fc6C",
      amountIn: "1000",
      amountOut: "1999.192791586638691039",
    },
    "FXS => FRAX with FraxSwap": {
      tokenIn: TOKENS.FXS.address,
      tokenOut: TOKENS.FRAX.address,
      encoding: encodePoolHintV3(ADDRESS.FXS_FRAX_FRAXSWAP, PoolTypeV3.UniswapV2, 2, 0, 1, Action.Swap, {
        fee_num: 997000,
        twamm: true,
      }),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      amountIn: "1000",
      amountOut: "6499.408538257086268933",
    },
    "FRAX => USDC with Curve": {
      tokenIn: TOKENS.FRAX.address,
      tokenOut: TOKENS.USDC.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_FRAXUSDC_POOL, PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x4C569Fcdd8b9312B8010Ab2c6D865c63C4De5609",
      amountIn: "1000",
      amountOut: "999.126561",
    },
    "USDC => WETH with UniV3": {
      tokenIn: TOKENS.USDC.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x28C6c06298d514Db089934071355E5743bf21d60",
      amountIn: "2000",
      amountOut: "1.024213000075615359",
    },
    "WETH => CRV with Curve": {
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
    "CVX => WETH with Curve": {
      tokenIn: TOKENS.CVX.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_CVXETH_POOL, PoolTypeV3.CurveCryptoPool, 2, 1, 0, Action.Swap),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x15A5F10cC2611bB18b18322E34eB473235EFCa39",
      amountIn: "1000",
      amountOut: "2.099046947581684230",
    },
    "Curve ETH/frxETH LP => WETH": {
      tokenIn: ADDRESS.CURVE_frxETH_TOKEN,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_frxETH_TOKEN, PoolTypeV3.CurvePlainPool, 2, 0, 0, Action.Remove),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x38a93e70b0D8343657f802C1c3Fdb06aC8F8fe99",
      amountIn: "10",
      amountOut: "10.001930840287081988",
    },
    "aFXS => Curve FXS/cvxFXS LP": {
      tokenIn: TOKENS.aFXS.address,
      tokenOut: ADDRESS.CURVE_cvxFXS_TOKEN,
      encoding: encodePoolHintV3(TOKENS.aFXS.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
      fork: 17622145,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x4492f0D0497bfb4564A085e1e1eB3Bb8080DFf93",
      amountIn: "100",
      amountOut: "111.077428005631012027",
    },
    "cvxCRV => aCRV": {
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

  for (const swap_name of Object.keys(swaps)) {
    const swap = swaps[swap_name];

    describe(swap_name, async () => {
      beforeEach(async () => {
        request_fork(swap.fork, [swap.deployer, swap.holder]);
        deployer = await ethers.getSigner(swap.deployer);

        const ConverterRegistry = await ethers.getContractFactory("ConverterRegistry", deployer);
        registry = await ConverterRegistry.deploy();
        await registry.deployed();

        const GeneralTokenConverter = await ethers.getContractFactory("GeneralTokenConverter", deployer);
        converter = await GeneralTokenConverter.deploy(registry.address);
        await converter.deployed();

        await converter.updateSupportedPoolTypes(1023);
      });

      it("should succeed", async () => {
        const signer = await ethers.getSigner(swap.holder);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const pair = await converter.getTokenPair(swap.encoding);
        expect(pair[0].toLowerCase()).to.eq(swap.tokenIn.toLowerCase());
        expect(pair[1].toLowerCase()).to.eq(swap.tokenOut.toLowerCase());

        const tokenIn = await ethers.getContractAt("MockERC20", swap.tokenIn, signer);
        const tokenOut = await ethers.getContractAt("MockERC20", swap.tokenOut, signer);
        const decimalIn = await tokenIn.decimals();
        const decimalOut = await tokenOut.decimals();

        const amountIn = ethers.utils.parseUnits(swap.amountIn, decimalIn);
        const expectedAmountOut = ethers.utils.parseUnits(swap.amountOut, decimalOut);

        await tokenIn.transfer(converter.address, amountIn);
        const before = await tokenOut.balanceOf(signer.address);
        const tx = await converter.convert(swap.encoding, amountIn, signer.address);
        await tx.wait();
        const after = await tokenOut.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(expectedAmountOut);
      });
    });
  }
});

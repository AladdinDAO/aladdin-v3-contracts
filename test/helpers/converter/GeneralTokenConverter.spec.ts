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
    "stETH ==(Curve)==> WETH": {
      tokenIn: TOKENS.stETH.address,
      tokenOut: TOKENS.WETH.address,
      encoding: encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap, {
        use_eth: false,
      }),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0xE3Ece6502d0A4c2593252607B5C8f93153145b90",
      amountIn: "1000",
      amountOut: "999.224267693111302169",
    },
    "WETH ==(CurveTricryptoNG)==> USDT": {
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
          use_eth: false,
        }
      ),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "1453566.349199",
    },
    "WETH ==(CurveTricryptoNG)==> USDC": {
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
          use_eth: false,
        }
      ),
      fork: 18119650,
      deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "1450250.837132",
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

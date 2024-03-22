/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import { ConverterRegistry, GeneralTokenConverter, CurveNGConverter } from "@/types/index";
import { Action, encodePoolHintV3, PoolTypeV3, TOKENS } from "@/utils/index";

interface ISwapForkConfig {
  tokenIn: string;
  tokenOut: string;
  encoding: bigint;
  fork: number;
  holder: string;
  amountIn: string;
  amountOut: string;
}

describe("CurveNGConverter.spec", async () => {
  let converter: GeneralTokenConverter;
  let registry: ConverterRegistry;
  let deployer: HardhatEthersSigner;

  context("auth", async () => {
    let converter: CurveNGConverter;

    beforeEach(async () => {
      [deployer] = await ethers.getSigners();

      const ConverterRegistry = await ethers.getContractFactory("ConverterRegistry", deployer);
      registry = await ConverterRegistry.deploy();

      const CurveNGConverter = await ethers.getContractFactory("CurveNGConverter", deployer);
      converter = await CurveNGConverter.deploy(await registry.getAddress());
      expect(await converter.registry()).to.eq(await registry.getAddress());
      await registry.register(12, await converter.getAddress());
      await registry.register(13, await converter.getAddress());
    });

    it("should revert when unsupported poolType", async () => {
      for (let i = 0; i < 20; ++i) {
        if (i === 12 || i === 13) continue;
        await expect(converter.getTokenPair(i)).to.revertedWith("unsupported poolType");
        await expect(converter.queryConvert(i, 0)).to.revertedWith("unsupported poolType");
        await expect(converter.convert(i, 0, ZeroAddress)).to.revertedWith("unsupported poolType");
      }
    });

    it("should revert, when action is invalid", async () => {
      let encoding = encodePoolHintV3(ZeroAddress, PoolTypeV3.CurveStableSwapNG, 2, 1, 0, 3 as Action);
      await expect(converter.getTokenPair(encoding)).to.revertedWith("unsupported action");
      await expect(converter.queryConvert(encoding, 0)).to.revertedWith("unsupported action");
      await expect(converter.convert(encoding, 0, ZeroAddress)).to.revertedWith("unsupported action");

      encoding = encodePoolHintV3(ZeroAddress, PoolTypeV3.CurveStableSwapMetaNG, 2, 1, 0, 3 as Action);
      await expect(converter.getTokenPair(encoding)).to.revertedWith("unsupported action");
      await expect(converter.queryConvert(encoding, 0)).to.revertedWith("unsupported action");
      await expect(converter.convert(encoding, 0, ZeroAddress)).to.revertedWith("unsupported action");
    });
  });

  const CurveNGSwaps: {
    [path: string]: ISwapForkConfig;
  } = {
    "FRAX ==(CurveStableSwapNG.Swap)==> sDAI": {
      tokenIn: TOKENS.FRAX.address,
      tokenOut: TOKENS.sDAI.address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_FRAX/sDAI_32"].address,
        PoolTypeV3.CurveStableSwapNG,
        2,
        0,
        1,
        Action.Swap
      ),
      fork: 19198780,
      holder: "0xB1748C79709f4Ba2Dd82834B8c82D4a505003f27",
      amountIn: "10000",
      amountOut: "9454.561949059299493369",
    },
    "PYUSD ==(CurveStableSwapNG.Swap)==> FRAX": {
      tokenIn: TOKENS.PYUSD.address,
      tokenOut: TOKENS.FRAX.address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_FRAX/PYUSD_34"].address,
        PoolTypeV3.CurveStableSwapNG,
        2,
        1,
        0,
        Action.Swap
      ),
      fork: 19198780,
      holder: "0xCFFAd3200574698b78f32232aa9D63eABD290703",
      amountIn: "10000",
      amountOut: "10019.893534325066414570",
    },
    "sDAI ==(CurveStableSwapNG.Swap)==> sFRAX": {
      tokenIn: TOKENS.sDAI.address,
      tokenOut: TOKENS.sFRAX.address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61"].address,
        PoolTypeV3.CurveStableSwapNG,
        3,
        1,
        2,
        Action.Swap
      ),
      fork: 19198780,
      holder: "0xB1748C79709f4Ba2Dd82834B8c82D4a505003f27",
      amountIn: "10000",
      amountOut: "10384.951817987176731607",
    },
    "stETH ==(CurveStableSwapNG.Swap)==> pxETH": {
      tokenIn: TOKENS.stETH.address,
      tokenOut: TOKENS.pxETH.address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_pxETH/stETH_30"].address,
        PoolTypeV3.CurveStableSwapNG,
        2,
        1,
        0,
        Action.Swap
      ),
      fork: 19198780,
      holder: "0x18709E89BD403F470088aBDAcEbE86CC60dda12e",
      amountIn: "10",
      amountOut: "10.020029693565455889",
    },
    "pxETH ==(CurveStableSwapNG.Swap)==> stETH": {
      tokenIn: TOKENS.pxETH.address,
      tokenOut: TOKENS.stETH.address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_pxETH/stETH_30"].address,
        PoolTypeV3.CurveStableSwapNG,
        2,
        0,
        1,
        Action.Swap
      ),
      fork: 19198780,
      holder: "0x0819D04C2bc1b156bF8bF0D89A8049d41a3a3A24",
      amountIn: "10",
      amountOut: "9.968229529423663374",
    },
    "USDV ==(CurveStableSwapMetaNG.Swap)==> 3CRV": {
      tokenIn: TOKENS.USDV.address,
      tokenOut: TOKENS.TRICRV.address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_USDV/3CRV_38"].address,
        PoolTypeV3.CurveStableSwapMetaNG,
        2,
        0,
        1,
        Action.Swap
      ),
      fork: 19198780,
      holder: "0x51971c86b04516062c1e708CDC048CB04fbe959f",
      amountIn: "10000",
      amountOut: "9694.929616059414496579",
    },
    "3CRV ==(CurveStableSwapMetaNG.Swap)==> USDM": {
      tokenIn: TOKENS.TRICRV.address,
      tokenOut: TOKENS.USDM.address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_USDM/3CRV_26"].address,
        PoolTypeV3.CurveStableSwapMetaNG,
        2,
        1,
        0,
        Action.Swap
      ),
      fork: 19198780,
      holder: "0xe74b28c2eAe8679e3cCc3a94d5d0dE83CCB84705",
      amountIn: "10000",
      amountOut: "10289.355351953121817976",
    },
    "mkUSD ==(CurveStableSwapNG.Add)==> CURVE_STABLE_NG_mkUSD/USDC_17": {
      tokenIn: TOKENS.mkUSD.address,
      tokenOut: TOKENS["CURVE_STABLE_NG_mkUSD/USDC_17"].address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_mkUSD/USDC_17"].address,
        PoolTypeV3.CurveStableSwapNG,
        2,
        0,
        0,
        Action.Add
      ),
      fork: 19198780,
      holder: "0x15DeAacCE662Bcbc9fA55aB76Feb9710B16Be260",
      amountIn: "10000",
      amountOut: "9959.878305300377249866",
    },
    "USDC ==(CurveStableSwapNG.Add)==> CURVE_STABLE_NG_mkUSD/USDC_17": {
      tokenIn: TOKENS.USDC.address,
      tokenOut: TOKENS["CURVE_STABLE_NG_mkUSD/USDC_17"].address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_mkUSD/USDC_17"].address,
        PoolTypeV3.CurveStableSwapNG,
        2,
        1,
        1,
        Action.Add
      ),
      fork: 19198780,
      holder: "0x28C6c06298d514Db089934071355E5743bf21d60",
      amountIn: "10000",
      amountOut: "10046.398174835639533530",
    },
    "sUSDe ==(CurveStableSwapNG.Add)==> CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61": {
      tokenIn: TOKENS.sUSDe.address,
      tokenOut: TOKENS["CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61"].address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61"].address,
        PoolTypeV3.CurveStableSwapNG,
        3,
        0,
        0,
        Action.Add
      ),
      fork: 19198780,
      holder: "0x8A25d8C9fa8C7A726137f2D618d85CbC2C083F78",
      amountIn: "10000",
      amountOut: "9998.080276375529366973",
    },
    "sDAI ==(CurveStableSwapNG.Add)==> CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61": {
      tokenIn: TOKENS.sDAI.address,
      tokenOut: TOKENS["CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61"].address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61"].address,
        PoolTypeV3.CurveStableSwapNG,
        3,
        1,
        1,
        Action.Add
      ),
      fork: 19198780,
      holder: "0xB1748C79709f4Ba2Dd82834B8c82D4a505003f27",
      amountIn: "10000",
      amountOut: "10524.757503635152740898",
    },
    "sFRAX ==(CurveStableSwapNG.Add)==> CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61": {
      tokenIn: TOKENS.sFRAX.address,
      tokenOut: TOKENS["CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61"].address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61"].address,
        PoolTypeV3.CurveStableSwapNG,
        3,
        2,
        2,
        Action.Add
      ),
      fork: 19198780,
      holder: "0x6A7efa964Cf6D9Ab3BC3c47eBdDB853A8853C502",
      amountIn: "10000",
      amountOut: "10131.472750367554390886",
    },
    "USDV ==(CurveStableSwapMetaNG.Add)==> CURVE_STABLE_NG_USDV/3CRV_38": {
      tokenIn: TOKENS.USDV.address,
      tokenOut: TOKENS["CURVE_STABLE_NG_USDV/3CRV_38"].address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_USDV/3CRV_38"].address,
        PoolTypeV3.CurveStableSwapMetaNG,
        2,
        0,
        0,
        Action.Add
      ),
      fork: 19198780,
      holder: "0x51971c86b04516062c1e708CDC048CB04fbe959f",
      amountIn: "10000",
      amountOut: "9989.043225677630731407",
    },
    "3CRV ==(CurveStableSwapMetaNG.Add)==> CURVE_STABLE_NG_USDV/3CRV_38": {
      tokenIn: TOKENS.TRICRV.address,
      tokenOut: TOKENS["CURVE_STABLE_NG_USDV/3CRV_38"].address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_USDV/3CRV_38"].address,
        PoolTypeV3.CurveStableSwapMetaNG,
        2,
        1,
        1,
        Action.Add
      ),
      fork: 19198780,
      holder: "0xe74b28c2eAe8679e3cCc3a94d5d0dE83CCB84705",
      amountIn: "10000",
      amountOut: "10301.713781109175958696",
    },
    "CURVE_STABLE_NG_mkUSD/USDC_17 ==(CurveStableSwapNG.Remove)==> mkUSD": {
      tokenIn: TOKENS["CURVE_STABLE_NG_mkUSD/USDC_17"].address,
      tokenOut: TOKENS.mkUSD.address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_mkUSD/USDC_17"].address,
        PoolTypeV3.CurveStableSwapNG,
        2,
        0,
        0,
        Action.Remove
      ),
      fork: 19198780,
      holder: "0x94dFcE828c3DAaF6492f1B6F66f9a1825254D24B",
      amountIn: "10000",
      amountOut: "10039.067474612716346090",
    },
    "CURVE_STABLE_NG_mkUSD/USDC_17 ==(CurveStableSwapNG.Remove)==> USDC": {
      tokenIn: TOKENS["CURVE_STABLE_NG_mkUSD/USDC_17"].address,
      tokenOut: TOKENS.USDC.address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_mkUSD/USDC_17"].address,
        PoolTypeV3.CurveStableSwapNG,
        2,
        1,
        1,
        Action.Remove
      ),
      fork: 19198780,
      holder: "0x94dFcE828c3DAaF6492f1B6F66f9a1825254D24B",
      amountIn: "10000",
      amountOut: "9950.686622",
    },
    "CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61 ==(CurveStableSwapNG.Remove)==> sUSDe": {
      tokenIn: TOKENS["CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61"].address,
      tokenOut: TOKENS.sUSDe.address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61"].address,
        PoolTypeV3.CurveStableSwapNG,
        3,
        0,
        0,
        Action.Remove
      ),
      fork: 19198780,
      holder: "0xE8f4F324e11c1Cadf348b9Bf201E380b61D3C695",
      amountIn: "10000",
      amountOut: "10000.008329517603091369",
    },
    "CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61 ==(CurveStableSwapNG.Remove)==> sDAI": {
      tokenIn: TOKENS["CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61"].address,
      tokenOut: TOKENS.sDAI.address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61"].address,
        PoolTypeV3.CurveStableSwapNG,
        3,
        1,
        1,
        Action.Remove
      ),
      fork: 19198780,
      holder: "0xE8f4F324e11c1Cadf348b9Bf201E380b61D3C695",
      amountIn: "10000",
      amountOut: "9494.911303244174361990",
    },
    "CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61 ==(CurveStableSwapNG.Remove)==> sFRAX": {
      tokenIn: TOKENS["CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61"].address,
      tokenOut: TOKENS.sFRAX.address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61"].address,
        PoolTypeV3.CurveStableSwapNG,
        3,
        2,
        2,
        Action.Remove
      ),
      fork: 19198780,
      holder: "0xE8f4F324e11c1Cadf348b9Bf201E380b61D3C695",
      amountIn: "10000",
      amountOut: "9867.497016001083522893",
    },
    "CURVE_STABLE_NG_USDV/3CRV_38 ==(CurveStableSwapMetaNG.Remove)==> USDV": {
      tokenIn: TOKENS["CURVE_STABLE_NG_USDV/3CRV_38"].address,
      tokenOut: TOKENS.USDV.address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_USDV/3CRV_38"].address,
        PoolTypeV3.CurveStableSwapMetaNG,
        2,
        0,
        0,
        Action.Remove
      ),
      fork: 19198780,
      holder: "0xbDbAD73D8C47A768Da88DCeD68867b007E1f3022",
      amountIn: "10000",
      amountOut: "10010.256709",
    },
    "CURVE_STABLE_NG_USDV/3CRV_38 ==(CurveStableSwapMetaNG.Remove)==> 3CRV": {
      tokenIn: TOKENS["CURVE_STABLE_NG_USDV/3CRV_38"].address,
      tokenOut: TOKENS.TRICRV.address,
      encoding: encodePoolHintV3(
        TOKENS["CURVE_STABLE_NG_USDV/3CRV_38"].address,
        PoolTypeV3.CurveStableSwapMetaNG,
        2,
        1,
        1,
        Action.Remove
      ),
      fork: 19198780,
      holder: "0xbDbAD73D8C47A768Da88DCeD68867b007E1f3022",
      amountIn: "10000",
      amountOut: "9705.688825529913618819",
    },
  };

  const swaps: {
    [path: string]: ISwapForkConfig;
  } = {
    ...CurveNGSwaps,
  };

  for (const swap_name of Object.keys(swaps)) {
    const swap = swaps[swap_name];

    describe(swap_name, async () => {
      beforeEach(async () => {
        request_fork(swap.fork, [ZeroAddress, swap.holder]);
        deployer = await ethers.getSigner(ZeroAddress);
        await mockETHBalance(deployer.address, ethers.parseEther("100"));

        const ConverterRegistry = await ethers.getContractFactory("ConverterRegistry", deployer);
        registry = await ConverterRegistry.deploy();

        const GeneralTokenConverter = await ethers.getContractFactory("GeneralTokenConverter", deployer);
        converter = await GeneralTokenConverter.deploy(await registry.getAddress());

        // register CurveNGConverter
        const CurveNGConverter = await ethers.getContractFactory("CurveNGConverter", deployer);
        const curveNGConverter = await CurveNGConverter.deploy(await registry.getAddress());
        await registry.register(12, await curveNGConverter.getAddress());
        await registry.register(13, await curveNGConverter.getAddress());
      });

      it("should succeed", async () => {
        const signer = await ethers.getSigner(swap.holder);
        await mockETHBalance(signer.address, ethers.parseEther("100"));

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
        console.log("converted:", after - before);
        expect(after - before).to.closeTo(expectedAmountOut, expectedAmountOut / 1000n);
        expect(after - before).to.closeTo(queryAmountOut, queryAmountOut / 1000n);
      });
    });
  }
});

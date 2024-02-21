/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import { ConverterRegistry, GeneralTokenConverter, ETHLSDConverter } from "@/types/index";
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

describe("ETHLSDConverter.spec", async () => {
  let converter: GeneralTokenConverter;
  let registry: ConverterRegistry;
  let deployer: HardhatEthersSigner;

  context("auth", async () => {
    let converter: ETHLSDConverter;

    beforeEach(async () => {
      [deployer] = await ethers.getSigners();

      const ConverterRegistry = await ethers.getContractFactory("ConverterRegistry", deployer);
      registry = await ConverterRegistry.deploy();

      const ETHLSDConverter = await ethers.getContractFactory("ETHLSDConverter", deployer);
      converter = await ETHLSDConverter.deploy(await registry.getAddress());
      expect(await converter.registry()).to.eq(await registry.getAddress());
      await registry.register(12, await converter.getAddress());
      await registry.register(13, await converter.getAddress());
    });

    it("should revert when unsupported poolType", async () => {
      for (let i = 0; i < 20; ++i) {
        if (i === 11) continue;
        await expect(converter.getTokenPair(i)).to.revertedWith("unsupported poolType");
        await expect(converter.queryConvert(i, 0)).to.revertedWith("unsupported poolType");
        await expect(converter.convert(i, 0, ZeroAddress)).to.revertedWith("unsupported poolType");
      }
    });

    it("should revert when unsupported protocol", async () => {
      for (let i = 0; i < 20; ++i) {
        if (i <= 6) continue;
        const encoding = encodePoolHintV3(ZeroAddress, PoolTypeV3.ETHLSDV1, 2, 0, 0, Action.Add, { protocol: i });
        await expect(converter.getTokenPair(encoding)).to.revertedWith("unsupported protocol");
        await expect(converter.queryConvert(encoding, 0)).to.revertedWith("unsupported protocol");
        await expect(converter.convert(encoding, 0, ZeroAddress)).to.revertedWith("unsupported protocol");
      }
    });

    it("should revert, when action is invalid", async () => {
      for (const [protocol, action] of [
        [0, Action.Swap],
        [1, Action.Swap],
        [2, Action.Swap],
        [3, Action.Swap],
        [4, Action.Swap],
        [5, Action.Swap],
        [0, Action.Remove],
        [1, Action.Remove],
        [2, Action.Remove],
        [3, Action.Remove],
        [4, Action.Remove],
      ]) {
        const encoding = encodePoolHintV3(ZeroAddress, PoolTypeV3.ETHLSDV1, 2, 0, 0, action, { protocol });
        await expect(converter.getTokenPair(encoding)).to.revertedWith("unsupported action");
        await expect(converter.queryConvert(encoding, 0)).to.revertedWith("unsupported action");
        await expect(converter.convert(encoding, 0, ZeroAddress)).to.revertedWith("unsupported action");
      }
      const encoding = encodePoolHintV3(TOKENS.eETH.address, PoolTypeV3.ETHLSDV1, 2, 0, 0, Action.Remove, {
        protocol: 5,
      });
      await expect(converter.getTokenPair(encoding)).to.revertedWith("unsupported action");
      await expect(converter.queryConvert(encoding, 0)).to.revertedWith("unsupported action");
      await expect(converter.convert(encoding, 0, ZeroAddress)).to.revertedWith("unsupported action");
    });

    it("should revert, when unsupported pool", async () => {
      const encoding = encodePoolHintV3(ZeroAddress, PoolTypeV3.ETHLSDV1, 2, 0, 0, Action.Remove, {
        protocol: 5,
      });
      await expect(converter.getTokenPair(encoding)).to.revertedWith("unsupported pool");
      await expect(converter.queryConvert(encoding, 0)).to.revertedWith("unsupported pool");
      await expect(converter.convert(encoding, 0, ZeroAddress)).to.revertedWith("unsupported pool");
    });
  });

  const ETHLSDV1Swaps: {
    [path: string]: ISwapForkConfig;
  } = {
    "WETH ==(wBETH.Add)==> wBETH": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.wBETH.address,
      encoding: encodePoolHintV3(TOKENS.wBETH.address, PoolTypeV3.ETHLSDV1, 2, 0, 0, Action.Add, { protocol: 0 }),
      fork: 19198780,
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "970.498953685521507223",
    },
    /*
    "WETH ==(RocketPool.Add)==> rETH": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.rETH.address,
      encoding: encodePoolHintV3(
        "0xDD3f50F8A6CafbE9b31a427582963f465E745AF8",
        PoolTypeV3.ETHLSDV1,
        0,
        0,
        0,
        Action.Add,
        { protocol: 1 }
      ),
      fork: 19198780,
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1",
      amountOut: "0",
    },
    */
    "WETH ==(Frax.Add)==> frxETH": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.frxETH.address,
      encoding: encodePoolHintV3(
        "0xbAFA44EFE7901E04E39Dad13167D089C559c1138",
        PoolTypeV3.ETHLSDV1,
        2,
        0,
        0,
        Action.Add,
        { protocol: 2 }
      ),
      fork: 19198780,
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "1000",
    },
    "WETH ==(Pirex.Add)==> pxETH": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.pxETH.address,
      encoding: encodePoolHintV3(
        "0xD664b74274DfEB538d9baC494F3a4760828B02b0",
        PoolTypeV3.ETHLSDV1,
        2,
        0,
        0,
        Action.Add,
        { protocol: 3 }
      ),
      fork: 19198780,
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "1000",
    },
    "WETH ==(Renzo.Add)==> ezETH": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.ezETH.address,
      encoding: encodePoolHintV3(ZeroAddress, PoolTypeV3.ETHLSDV1, 2, 0, 0, Action.Add, { protocol: 4 }),
      fork: 19198780,
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "996.199434160256352441",
    },
    /*
    "wBETH ==(Renzo.Add)==> ezETH": {
      tokenIn: TOKENS.wBETH.address,
      tokenOut: TOKENS.ezETH.address,
      encoding: encodePoolHintV3(ZeroAddress, PoolTypeV3.ETHLSDV1, 0, 1, 1, Action.Add, { protocol: 4 }),
      fork: 19198780,
      holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      amountIn: "1000",
      amountOut: "0",
    },
    "stETH ==(Renzo.Add)==> ezETH": {
      tokenIn: TOKENS.stETH.address,
      tokenOut: TOKENS.ezETH.address,
      encoding: encodePoolHintV3(ZeroAddress, PoolTypeV3.ETHLSDV1, 0, 2, 2, Action.Add, { protocol: 4 }),
      fork: 19198780,
      holder: "0x18709E89BD403F470088aBDAcEbE86CC60dda12e",
      amountIn: "1000",
      amountOut: "0",
    },
    */
    "WETH ==(EtherFi.eETH.Add)==> eETH": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.eETH.address,
      encoding: encodePoolHintV3(TOKENS.eETH.address, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Add, { protocol: 5 }),
      fork: 19198780,
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "1000",
    },
    "eETH ==(EtherFi.weETH.Add)==> weETH": {
      tokenIn: TOKENS.eETH.address,
      tokenOut: TOKENS.weETH.address,
      encoding: encodePoolHintV3(TOKENS.weETH.address, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Add, { protocol: 5 }),
      fork: 19198780,
      holder: "0x30653c83162ff00918842D8bFe016935Fdd6Ab84",
      amountIn: "1000",
      amountOut: "969.990510402540459430",
    },
    "weETH ==(EtherFi.weETH.Remove)==> eETH": {
      tokenIn: TOKENS.weETH.address,
      tokenOut: TOKENS.eETH.address,
      encoding: encodePoolHintV3(TOKENS.weETH.address, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Remove, { protocol: 5 }),
      fork: 19198780,
      holder: "0xDceED643320622Cad92b7A90465E24d7dF0a9519",
      amountIn: "1000",
      amountOut: "1030.937920810179653934",
    },
    "stETH ==(KelpDAO.Add)==> rsETH": {
      tokenIn: TOKENS.stETH.address,
      tokenOut: TOKENS.rsETH.address,
      encoding: encodePoolHintV3(
        "0x036676389e48133b63a802f8635ad39e752d375d",
        PoolTypeV3.ETHLSDV1,
        0,
        0,
        0,
        Action.Add,
        { protocol: 6 }
      ),
      fork: 19198780,
      holder: "0x18709E89BD403F470088aBDAcEbE86CC60dda12e",
      amountIn: "1000",
      amountOut: "994.360001753563626579",
    },
    "ETHx ==(KelpDAO.Add)==> rsETH": {
      tokenIn: TOKENS.ETHx.address,
      tokenOut: TOKENS.rsETH.address,
      encoding: encodePoolHintV3(
        "0x036676389e48133b63a802f8635ad39e752d375d",
        PoolTypeV3.ETHLSDV1,
        0,
        1,
        1,
        Action.Add,
        { protocol: 6 }
      ),
      fork: 19198780,
      holder: "0x1a0EBB8B15c61879a8e8DA7817Bb94374A7c4007",
      amountIn: "1000",
      amountOut: "1015.547617804861742693",
    },
    "sfrxETH ==(KelpDAO.Add)==> rsETH": {
      tokenIn: TOKENS.sfrxETH.address,
      tokenOut: TOKENS.rsETH.address,
      encoding: encodePoolHintV3(
        "0x036676389e48133b63a802f8635ad39e752d375d",
        PoolTypeV3.ETHLSDV1,
        0,
        2,
        2,
        Action.Add,
        { protocol: 6 }
      ),
      fork: 19198780,
      holder: "0xB1748C79709f4Ba2Dd82834B8c82D4a505003f27",
      amountIn: "1000",
      amountOut: "1068.740826908931029101",
    },
    "WETH ==(KelpDAO.Add)==> rsETH": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.rsETH.address,
      encoding: encodePoolHintV3(
        "0x036676389e48133b63a802f8635ad39e752d375d",
        PoolTypeV3.ETHLSDV1,
        0,
        3,
        3,
        Action.Add,
        { protocol: 6 }
      ),
      fork: 19274260,
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1000",
      amountOut: "993.448160295060662982",
    },
  };

  const swaps: {
    [path: string]: ISwapForkConfig;
  } = {
    ...ETHLSDV1Swaps,
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

        // register ETHLSDConverter
        const ETHLSDConverter = await ethers.getContractFactory("ETHLSDConverter", deployer);
        const ethLSDConverter = await ETHLSDConverter.deploy(await registry.getAddress());
        await registry.register(11, await ethLSDConverter.getAddress());
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

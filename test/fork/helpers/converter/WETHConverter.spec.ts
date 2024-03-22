/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import { ConverterRegistry, GeneralTokenConverter, WETHConverter } from "@/types/index";
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

describe("WETHConverter.spec", async () => {
  let converter: GeneralTokenConverter;
  let registry: ConverterRegistry;
  let deployer: HardhatEthersSigner;

  context("auth", async () => {
    let converter: WETHConverter;

    beforeEach(async () => {
      [deployer] = await ethers.getSigners();

      const ConverterRegistry = await ethers.getContractFactory("ConverterRegistry", deployer);
      registry = await ConverterRegistry.deploy();

      const WETHConverter = await ethers.getContractFactory("WETHConverter", deployer);
      converter = await WETHConverter.deploy(await registry.getAddress());
      expect(await converter.registry()).to.eq(await registry.getAddress());
      await registry.register(1, await converter.getAddress());
    });

    it("should revert when unsupported poolType", async () => {
      for (let i = 0; i < 20; ++i) {
        if (i === 14) continue;
        await expect(converter.getTokenPair(i)).to.revertedWith("unsupported poolType");
        await expect(converter.queryConvert(i, 0)).to.revertedWith("unsupported poolType");
        await expect(converter.convert(i, 0, ZeroAddress)).to.revertedWith("unsupported poolType");
      }
    });

    it("should revert, when action is invalid", async () => {
      let encoding = encodePoolHintV3(ZeroAddress, PoolTypeV3.WETH, 0, 0, 0, Action.Add);
      await expect(converter.getTokenPair(encoding)).to.revertedWith("unsupported action");
      await expect(converter.queryConvert(encoding, 0)).to.revertedWith("unsupported action");
      await expect(converter.convert(encoding, 0, ZeroAddress)).to.revertedWith("unsupported action");

      encoding = encodePoolHintV3(ZeroAddress, PoolTypeV3.WETH, 0, 0, 0, Action.Swap);
      await expect(converter.getTokenPair(encoding)).to.revertedWith("unsupported action");
      await expect(converter.queryConvert(encoding, 0)).to.revertedWith("unsupported action");
      await expect(converter.convert(encoding, 0, ZeroAddress)).to.revertedWith("unsupported action");
    });
  });

  const WETHSwaps: {
    [path: string]: ISwapForkConfig;
  } = {
    "WETH ==(WETH.Remove)==> ETH": {
      tokenIn: TOKENS.WETH.address,
      tokenOut: TOKENS.ETH.address,
      encoding: encodePoolHintV3(ZeroAddress, PoolTypeV3.WETH, 2, 1, 0, Action.Remove),
      fork: 17622145,
      holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      amountIn: "1.024213000075615359",
      amountOut: "1.024213000075615359",
    },
  };

  const swaps: {
    [path: string]: ISwapForkConfig;
  } = {
    ...WETHSwaps,
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
        await converter.updateSupportedPoolTypes(1021);

        // register WETHConverter
        const WETHConverter = await ethers.getContractFactory("WETHConverter", deployer);
        const wethConverter = await WETHConverter.deploy(await registry.getAddress());
        await registry.register(14, await wethConverter.getAddress());
      });

      it("should succeed", async () => {
        const signer = await ethers.getSigner(swap.holder);
        await mockETHBalance(signer.address, ethers.parseEther("100"));

        const pair = await registry.getTokenPair(swap.encoding);
        expect(pair[0].toLowerCase()).to.eq(swap.tokenIn.toLowerCase());
        expect(pair[1].toLowerCase()).to.eq(swap.tokenOut.toLowerCase());

        const tokenIn = await ethers.getContractAt("MockERC20", swap.tokenIn, signer);
        const decimalIn = await tokenIn.decimals();

        const amountIn = ethers.parseUnits(swap.amountIn, decimalIn);
        const expectedAmountOut = ethers.parseUnits(swap.amountOut, decimalIn);
        const queryAmountOut = await converter.queryConvert.staticCall(swap.encoding, amountIn);

        await tokenIn.transfer(await converter.getAddress(), amountIn);
        const before = await ethers.provider.getBalance(signer.address);
        const tx = await converter.convert(swap.encoding, amountIn, signer.address);
        await tx.wait();
        const after = await ethers.provider.getBalance(signer.address);
        expect(after - before).to.eq(expectedAmountOut);
        expect(after - before).to.closeTo(queryAmountOut, queryAmountOut / 100000n);
      });
    });
  }
});

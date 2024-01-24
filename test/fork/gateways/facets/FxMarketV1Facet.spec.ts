/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { Interface, ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import {
  IDiamond,
  Diamond,
  TokenConvertManagementFacet,
  FxMarketV1Facet,
  MultiPathConverter,
  GeneralTokenConverter,
} from "@/types/index";
import { TOKENS, Action, PoolTypeV3, encodePoolHintV3, ADDRESS } from "@/utils/index";

const FORK_BLOCK_NUMBER = 19082800;

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const OPERATOR = "0x66c57bF505A85A74609D2C83E94Aabb26d691E1F";
const WETH_HOLDER = "0x8EB8a3b98659Cce290402893d0123abb75E3ab28";
const USDC_HOLDER = "0x8EB8a3b98659Cce290402893d0123abb75E3ab28";
const WSTETH_HOLDER = "0x176F3DAb24a159341c0509bB36B833E7fdd0a132";
const FETH_HOLDRR = "0xe8AC0E7c16cef9182cb291dcEBFe1320C3a48FC0";
const XETH_HOLDRR = "0x488b99c4A94BB0027791E8e0eEB421187EC9a487";

describe("FxMarketV1Facet.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let diamond: Diamond;
  let manage: TokenConvertManagementFacet;
  let gateway: FxMarketV1Facet;
  let inputConverter: MultiPathConverter;
  let outputConverter: GeneralTokenConverter;

  const getAllSignatures = (e: Interface): string[] => {
    const sigs: string[] = [];
    e.forEachFunction((func, _) => {
      sigs.push(func.selector);
    });
    return sigs;
  };

  beforeEach(async () => {
    await request_fork(FORK_BLOCK_NUMBER, [
      DEPLOYER,
      OPERATOR,
      WETH_HOLDER,
      USDC_HOLDER,
      WSTETH_HOLDER,
      FETH_HOLDRR,
      XETH_HOLDRR,
      "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF",
    ]);
    deployer = await ethers.getSigner(DEPLOYER);
    signer = await ethers.getSigner(OPERATOR);
    await mockETHBalance(deployer.address, ethers.parseEther("100"));
    await mockETHBalance(signer.address, ethers.parseEther("100"));

    const diamondCuts: IDiamond.FacetCutStruct[] = [];
    for (const name of ["DiamondCutFacet", "DiamondLoupeFacet", "OwnershipFacet", "TokenConvertManagementFacet"]) {
      const Contract = await ethers.getContractFactory(name, deployer);
      const facet = await Contract.deploy();
      diamondCuts.push({
        facetAddress: await facet.getAddress(),
        action: 0,
        functionSelectors: getAllSignatures(facet.interface),
      });
    }
    const FxMarketV1Facet = await ethers.getContractFactory("FxMarketV1Facet", deployer);
    const facet = await FxMarketV1Facet.deploy(
      "0xe7b9c7c9cA85340b8c06fb805f7775e3015108dB",
      TOKENS.stETH.address,
      TOKENS.fETH.address,
      TOKENS.xETH.address
    );
    diamondCuts.push({
      facetAddress: await facet.getAddress(),
      action: 0,
      functionSelectors: getAllSignatures(facet.interface),
    });

    const Diamond = await ethers.getContractFactory("Diamond", deployer);
    diamond = await Diamond.deploy(diamondCuts, {
      owner: deployer.address,
      init: ZeroAddress,
      initCalldata: "0x",
    });
    manage = await ethers.getContractAt("TokenConvertManagementFacet", await diamond.getAddress(), deployer);
    gateway = await ethers.getContractAt("FxMarketV1Facet", await diamond.getAddress(), deployer);
    inputConverter = await ethers.getContractAt(
      "MultiPathConverter",
      "0x4F96fe476e7dcD0404894454927b9885Eb8B57c3",
      deployer
    );
    outputConverter = await ethers.getContractAt(
      "GeneralTokenConverter",
      "0x11C907b3aeDbD863e551c37f21DD3F36b28A6784",
      deployer
    );

    await gateway.initalizeFxMarketV1Facet();
    await manage.approveTarget(inputConverter.getAddress(), inputConverter.getAddress());
    await manage.approveTarget(outputConverter.getAddress(), outputConverter.getAddress());
    await manage.approveTarget(TOKENS.stETH.address, ZeroAddress);
  });

  context("fxMintFTokenV1", async () => {
    it("should succeed to mint from ETH", async () => {
      const amountIn = ethers.parseEther("10");
      const params = {
        src: ZeroAddress,
        amount: amountIn,
        target: TOKENS.stETH.address,
        data: "0x",
        minOut: 0,
      };
      const expected = await gateway.fxMintFTokenV1.staticCall(params, 0n, { value: amountIn });
      console.log("fETH minted:", ethers.formatEther(expected));
      const token = await ethers.getContractAt("MockERC20", TOKENS.fETH.address, deployer);
      const balanceBefore = await token.balanceOf(deployer.address);
      await gateway.fxMintFTokenV1(params, expected, { value: amountIn });
      const balanceAfter = await token.balanceOf(deployer.address);
      expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 1000000n);
    });

    it("should succeed to mint from WETH", async () => {
      const holder = await ethers.getSigner(WETH_HOLDER);
      await mockETHBalance(holder.address, ethers.parseEther("100"));
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, holder);
      const amountIn = ethers.parseEther("10");
      await tokenIn.approve(gateway.getAddress(), amountIn);
      const params = {
        src: TOKENS.WETH.address,
        amount: amountIn,
        target: await inputConverter.getAddress(),
        data: inputConverter.interface.encodeFunctionData("convert", [
          TOKENS.WETH.address,
          amountIn,
          1048575n + (1n << 20n),
          [encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add)],
        ]),
        minOut: 0,
      };
      const expected = await gateway.connect(holder).fxMintFTokenV1.staticCall(params, 0n);
      console.log("fETH minted:", ethers.formatEther(expected));
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.fETH.address, deployer);
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway.connect(holder).fxMintFTokenV1(params, expected);
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 1000000n);
    });

    it("should succeed to mint from wstETH", async () => {
      const holder = await ethers.getSigner(WSTETH_HOLDER);
      await mockETHBalance(holder.address, ethers.parseEther("100"));
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.wstETH.address, holder);
      const amountIn = ethers.parseEther("10");
      await tokenIn.approve(gateway.getAddress(), amountIn);
      const params = {
        src: TOKENS.wstETH.address,
        amount: amountIn,
        target: await inputConverter.getAddress(),
        data: inputConverter.interface.encodeFunctionData("convert", [
          TOKENS.wstETH.address,
          amountIn,
          1048575n + (1n << 20n),
          [encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove)],
        ]),
        minOut: 0,
      };
      const expected = await gateway.connect(holder).fxMintFTokenV1.staticCall(params, 0n);
      console.log("fETH minted:", ethers.formatEther(expected));
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.fETH.address, deployer);
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway.connect(holder).fxMintFTokenV1(params, expected);
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 1000000n);
    });

    it("should succeed to mint from USDC", async () => {
      const holder = await ethers.getSigner(USDC_HOLDER);
      await mockETHBalance(holder.address, ethers.parseEther("100"));
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, holder);
      const amountIn = ethers.parseUnits("10000", 6);
      await tokenIn.approve(gateway.getAddress(), amountIn);
      const params = {
        src: TOKENS.USDC.address,
        amount: amountIn,
        target: await inputConverter.getAddress(),
        data: inputConverter.interface.encodeFunctionData("convert", [
          TOKENS.USDC.address,
          amountIn,
          1048575n + (2n << 20n),
          [
            encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
            encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
          ],
        ]),
        minOut: 0,
      };
      const expected = await gateway.connect(holder).fxMintFTokenV1.staticCall(params, 0n);
      console.log("fETH minted:", ethers.formatEther(expected));
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.fETH.address, deployer);
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway.connect(holder).fxMintFTokenV1(params, expected);
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 1000000n);
    });
  });

  context("fxMintXTokenV1", async () => {
    it("should succeed to mint from ETH", async () => {
      const amountIn = ethers.parseEther("10");
      const params = {
        src: ZeroAddress,
        amount: amountIn,
        target: TOKENS.stETH.address,
        data: "0x",
        minOut: 0,
      };
      const [expected, bonus] = await gateway.fxMintXTokenV1.staticCall(params, 0n, { value: amountIn });
      console.log("xETH minted:", ethers.formatEther(expected), "bonus stETH:", ethers.formatEther(bonus));
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.xETH.address, deployer);
      const balanceBefore = await tokenOut.balanceOf(deployer.address);
      await gateway.fxMintXTokenV1(params, expected - expected / 1000000n, { value: amountIn });
      const balanceAfter = await tokenOut.balanceOf(deployer.address);
      expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 1000000n);
    });

    it("should succeed to mint from WETH", async () => {
      const holder = await ethers.getSigner(WETH_HOLDER);
      await mockETHBalance(holder.address, ethers.parseEther("100"));
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, holder);
      const amountIn = ethers.parseEther("10");
      await tokenIn.approve(gateway.getAddress(), amountIn);
      const params = {
        src: TOKENS.WETH.address,
        amount: amountIn,
        target: await inputConverter.getAddress(),
        data: inputConverter.interface.encodeFunctionData("convert", [
          TOKENS.WETH.address,
          amountIn,
          1048575n + (1n << 20n),
          [encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add)],
        ]),
        minOut: 0,
      };
      const [expected, bonus] = await gateway.connect(holder).fxMintXTokenV1.staticCall(params, 0n);
      console.log("xETH minted:", ethers.formatEther(expected), "bonus stETH:", ethers.formatEther(bonus));
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.xETH.address, deployer);
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway.connect(holder).fxMintXTokenV1(params, expected - expected / 1000000n);
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 1000000n);
    });

    it("should succeed to mint from wstETH", async () => {
      const holder = await ethers.getSigner(WSTETH_HOLDER);
      await mockETHBalance(holder.address, ethers.parseEther("100"));
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.wstETH.address, holder);
      const amountIn = ethers.parseEther("10");
      await tokenIn.approve(gateway.getAddress(), amountIn);
      const params = {
        src: TOKENS.wstETH.address,
        amount: amountIn,
        target: await inputConverter.getAddress(),
        data: inputConverter.interface.encodeFunctionData("convert", [
          TOKENS.wstETH.address,
          amountIn,
          1048575n + (1n << 20n),
          [encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove)],
        ]),
        minOut: 0,
      };
      const [expected, bonus] = await gateway.connect(holder).fxMintXTokenV1.staticCall(params, 0n);
      console.log("xETH minted:", ethers.formatEther(expected), "bonus stETH:", ethers.formatEther(bonus));
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.xETH.address, deployer);
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway.connect(holder).fxMintXTokenV1(params, expected - expected / 1000000n);
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 1000000n);
    });

    it("should succeed to mint from USDC", async () => {
      const holder = await ethers.getSigner(USDC_HOLDER);
      await mockETHBalance(holder.address, ethers.parseEther("100"));
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, holder);
      const amountIn = ethers.parseUnits("10000", 6);
      await tokenIn.approve(gateway.getAddress(), amountIn);
      const params = {
        src: TOKENS.USDC.address,
        amount: amountIn,
        target: await inputConverter.getAddress(),
        data: inputConverter.interface.encodeFunctionData("convert", [
          TOKENS.USDC.address,
          amountIn,
          1048575n + (2n << 20n),
          [
            encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
            encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
          ],
        ]),
        minOut: 0,
      };
      const [expected, bonus] = await gateway.connect(holder).fxMintXTokenV1.staticCall(params, 0n);
      console.log("xETH minted:", ethers.formatEther(expected), "bonus stETH:", ethers.formatEther(bonus));
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.xETH.address, deployer);
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway.connect(holder).fxMintXTokenV1(params, expected - expected / 1000000n);
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 1000000n);
    });
  });

  context("fxAddBaseTokenV1", async () => {
    beforeEach(async () => {
      const admin = await ethers.getSigner("0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF");
      await mockETHBalance(admin.address, ethers.parseEther("100"));
      const market = await ethers.getContractAt("Market", "0xe7b9c7c9cA85340b8c06fb805f7775e3015108dB", admin);
      await market.updateMarketConfig(
        ethers.parseEther("2"),
        ethers.parseEther("1.1"),
        ethers.parseEther("1.01"),
        ethers.parseEther("1")
      );
    });

    it("should succeed to mint from ETH", async () => {
      const amountIn = ethers.parseEther("10");
      const params = {
        src: ZeroAddress,
        amount: amountIn,
        target: TOKENS.stETH.address,
        data: "0x",
        minOut: 0,
      };
      const expected = await gateway.fxAddBaseTokenV1.staticCall(params, 0n, { value: amountIn });
      console.log("xETH minted:", ethers.formatEther(expected));
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.xETH.address, deployer);
      const balanceBefore = await tokenOut.balanceOf(deployer.address);
      await gateway.fxAddBaseTokenV1(params, expected - expected / 1000000n, { value: amountIn });
      const balanceAfter = await tokenOut.balanceOf(deployer.address);
      expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 1000000n);
    });

    it("should succeed to mint from WETH", async () => {
      const holder = await ethers.getSigner(WETH_HOLDER);
      await mockETHBalance(holder.address, ethers.parseEther("100"));
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, holder);
      const amountIn = ethers.parseEther("10");
      await tokenIn.approve(gateway.getAddress(), amountIn);
      const params = {
        src: TOKENS.WETH.address,
        amount: amountIn,
        target: await inputConverter.getAddress(),
        data: inputConverter.interface.encodeFunctionData("convert", [
          TOKENS.WETH.address,
          amountIn,
          1048575n + (1n << 20n),
          [encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add)],
        ]),
        minOut: 0,
      };
      const expected = await gateway.connect(holder).fxAddBaseTokenV1.staticCall(params, 0n);
      console.log("xETH minted:", ethers.formatEther(expected));
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.xETH.address, deployer);
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway.connect(holder).fxAddBaseTokenV1(params, expected - expected / 1000000n);
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 1000000n);
    });

    it("should succeed to mint from wstETH", async () => {
      const holder = await ethers.getSigner(WSTETH_HOLDER);
      await mockETHBalance(holder.address, ethers.parseEther("100"));
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.wstETH.address, holder);
      const amountIn = ethers.parseEther("10");
      await tokenIn.approve(gateway.getAddress(), amountIn);
      const params = {
        src: TOKENS.wstETH.address,
        amount: amountIn,
        target: await inputConverter.getAddress(),
        data: inputConverter.interface.encodeFunctionData("convert", [
          TOKENS.wstETH.address,
          amountIn,
          1048575n + (1n << 20n),
          [encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove)],
        ]),
        minOut: 0,
      };
      const expected = await gateway.connect(holder).fxAddBaseTokenV1.staticCall(params, 0n);
      console.log("xETH minted:", ethers.formatEther(expected));
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.xETH.address, deployer);
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway.connect(holder).fxAddBaseTokenV1(params, expected - expected / 1000000n);
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 1000000n);
    });

    it("should succeed to mint from USDC", async () => {
      const holder = await ethers.getSigner(USDC_HOLDER);
      await mockETHBalance(holder.address, ethers.parseEther("100"));
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, holder);
      const amountIn = ethers.parseUnits("10000", 6);
      await tokenIn.approve(gateway.getAddress(), amountIn);
      const params = {
        src: TOKENS.USDC.address,
        amount: amountIn,
        target: await inputConverter.getAddress(),
        data: inputConverter.interface.encodeFunctionData("convert", [
          TOKENS.USDC.address,
          amountIn,
          1048575n + (2n << 20n),
          [
            encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
            encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
          ],
        ]),
        minOut: 0,
      };
      const expected = await gateway.connect(holder).fxAddBaseTokenV1.staticCall(params, 0n);
      console.log("xETH minted:", ethers.formatEther(expected));
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.xETH.address, deployer);
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway.connect(holder).fxAddBaseTokenV1(params, expected - expected / 1000000n);
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 1000000n);
    });
  });

  context("fxRedeemV1", async () => {
    it("should succeed when redeem fToken as WETH", async () => {
      const holder = await ethers.getSigner(FETH_HOLDRR);
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.fETH.address, holder);
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, holder);
      await mockETHBalance(holder.address, ethers.parseEther("100"));
      const amountIn = ethers.parseEther("2000");
      await tokenIn.approve(gateway.getAddress(), amountIn);

      const params = {
        converter: await outputConverter.getAddress(),
        minOut: 0n,
        routes: [encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap)],
      };
      const [baseOut, dstOut, bounsOut] = await gateway.connect(holder).fxRedeemV1.staticCall(params, amountIn, 0n, 0n);
      console.log(
        "stETH redeemed:",
        ethers.formatEther(baseOut),
        "WETH swapped:",
        ethers.formatEther(dstOut),
        "bonus stETH:",
        ethers.formatEther(bounsOut)
      );
      params.minOut = dstOut - dstOut / 1000000n;
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway.connect(holder).fxRedeemV1(params, amountIn, 0n, baseOut - baseOut / 1000000n);
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(dstOut, dstOut / 1000000n);
    });

    it("should succeed when redeem fToken as wstETH", async () => {
      const holder = await ethers.getSigner(FETH_HOLDRR);
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.fETH.address, holder);
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.wstETH.address, holder);
      await mockETHBalance(holder.address, ethers.parseEther("100"));
      const amountIn = ethers.parseEther("2000");
      await tokenIn.approve(gateway.getAddress(), amountIn);

      const params = {
        converter: await outputConverter.getAddress(),
        minOut: 0n,
        routes: [encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add)],
      };
      const [baseOut, dstOut, bounsOut] = await gateway.connect(holder).fxRedeemV1.staticCall(params, amountIn, 0n, 0n);
      console.log(
        "stETH redeemed:",
        ethers.formatEther(baseOut),
        "wstETH swapped:",
        ethers.formatEther(dstOut),
        "bonus stETH:",
        ethers.formatEther(bounsOut)
      );
      params.minOut = dstOut - dstOut / 1000000n;
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway.connect(holder).fxRedeemV1(params, amountIn, 0n, baseOut - baseOut / 1000000n);
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(dstOut, dstOut / 1000000n);
    });

    it("should succeed when redeem fToken as USDC", async () => {
      const holder = await ethers.getSigner(FETH_HOLDRR);
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.fETH.address, holder);
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, holder);
      await mockETHBalance(holder.address, ethers.parseEther("100"));
      const amountIn = ethers.parseEther("2000");
      await tokenIn.approve(gateway.getAddress(), amountIn);

      const params = {
        converter: await outputConverter.getAddress(),
        minOut: 0n,
        routes: [
          encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
          encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {
            use_eth: false,
          }),
        ],
      };
      const [baseOut, dstOut, bounsOut] = await gateway.connect(holder).fxRedeemV1.staticCall(params, amountIn, 0n, 0n);
      console.log(
        "stETH redeemed:",
        ethers.formatEther(baseOut),
        "USDC swapped:",
        ethers.formatUnits(dstOut, 6),
        "bonus stETH:",
        ethers.formatEther(bounsOut)
      );
      params.minOut = dstOut - dstOut / 100000n;
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway.connect(holder).fxRedeemV1(params, amountIn, 0n, baseOut - baseOut / 1000000n);
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(dstOut, dstOut / 1000000n);
    });

    it("should succeed when redeem xToken as WETH", async () => {
      const holder = await ethers.getSigner(XETH_HOLDRR);
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.xETH.address, holder);
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, holder);
      await mockETHBalance(holder.address, ethers.parseEther("100"));
      const amountIn = ethers.parseEther("2000");
      await tokenIn.approve(gateway.getAddress(), amountIn);

      const params = {
        converter: await outputConverter.getAddress(),
        minOut: 0n,
        routes: [encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap)],
      };
      const [baseOut, dstOut, bounsOut] = await gateway.connect(holder).fxRedeemV1.staticCall(params, 0n, amountIn, 0n);
      console.log(
        "stETH redeemed:",
        ethers.formatEther(baseOut),
        "WETH swapped:",
        ethers.formatEther(dstOut),
        "bonus stETH:",
        ethers.formatEther(bounsOut)
      );
      params.minOut = dstOut - dstOut / 1000000n;
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway.connect(holder).fxRedeemV1(params, 0n, amountIn, baseOut - baseOut / 1000000n);
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(dstOut, dstOut / 1000000n);
    });

    it("should succeed when redeem xToken as wstETH", async () => {
      const holder = await ethers.getSigner(XETH_HOLDRR);
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.xETH.address, holder);
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.wstETH.address, holder);
      await mockETHBalance(holder.address, ethers.parseEther("100"));
      const amountIn = ethers.parseEther("2000");
      await tokenIn.approve(gateway.getAddress(), amountIn);

      const params = {
        converter: await outputConverter.getAddress(),
        minOut: 0n,
        routes: [encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add)],
      };
      const [baseOut, dstOut, bounsOut] = await gateway.connect(holder).fxRedeemV1.staticCall(params, 0n, amountIn, 0n);
      console.log(
        "stETH redeemed:",
        ethers.formatEther(baseOut),
        "wstETH swapped:",
        ethers.formatEther(dstOut),
        "bonus stETH:",
        ethers.formatEther(bounsOut)
      );
      params.minOut = dstOut - dstOut / 1000000n;
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway.connect(holder).fxRedeemV1(params, 0n, amountIn, baseOut - baseOut / 1000000n);
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(dstOut, dstOut / 1000000n);
    });

    it("should succeed when redeem xToken as USDC", async () => {
      const holder = await ethers.getSigner(XETH_HOLDRR);
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.xETH.address, holder);
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, holder);
      await mockETHBalance(holder.address, ethers.parseEther("100"));
      const amountIn = ethers.parseEther("2000");
      await tokenIn.approve(gateway.getAddress(), amountIn);

      const params = {
        converter: await outputConverter.getAddress(),
        minOut: 0n,
        routes: [
          encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
          encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {
            use_eth: false,
          }),
        ],
      };
      const [baseOut, dstOut, bounsOut] = await gateway.connect(holder).fxRedeemV1.staticCall(params, 0n, amountIn, 0n);
      console.log(
        "stETH redeemed:",
        ethers.formatEther(baseOut),
        "USDC swapped:",
        ethers.formatUnits(dstOut, 6),
        "bonus stETH:",
        ethers.formatEther(bounsOut)
      );
      params.minOut = dstOut - dstOut / 100000n;
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway.connect(holder).fxRedeemV1(params, 0n, amountIn, baseOut - baseOut / 1000000n);
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(dstOut, dstOut / 1000000n);
    });
  });

  context("fxSwapV1", async () => {
    it("should succeed when swap fToken to xToken", async () => {
      const holder = await ethers.getSigner(FETH_HOLDRR);
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.fETH.address, holder);
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.xETH.address, holder);
      await mockETHBalance(holder.address, ethers.parseEther("100"));
      const amountIn = ethers.parseEther("2000");
      await tokenIn.approve(gateway.getAddress(), amountIn);
      const [dstOut, bounsOut] = await gateway.connect(holder).fxSwapV1.staticCall(amountIn, true, 0n);
      console.log("xETH swapped:", ethers.formatEther(dstOut), "bonus stETH:", ethers.formatEther(bounsOut));
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway.connect(holder).fxSwapV1(amountIn, true, dstOut - dstOut / 1000000n);
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(dstOut, dstOut / 1000000n);
    });

    it("should succeed when swap xToken to fToken", async () => {
      const holder = await ethers.getSigner(XETH_HOLDRR);
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.xETH.address, holder);
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.fETH.address, holder);
      await mockETHBalance(holder.address, ethers.parseEther("100"));
      const amountIn = ethers.parseEther("2000");
      await tokenIn.approve(gateway.getAddress(), amountIn);
      const [dstOut, bounsOut] = await gateway.connect(holder).fxSwapV1.staticCall(amountIn, false, 0n);
      console.log("fETH swapped:", ethers.formatEther(dstOut), "bonus stETH:", ethers.formatEther(bounsOut));
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway.connect(holder).fxSwapV1(amountIn, false, dstOut - dstOut / 1000000n);
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(dstOut, dstOut / 1000000n);
    });
  });
});

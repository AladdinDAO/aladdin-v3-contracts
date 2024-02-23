/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { Interface, ZeroAddress, id } from "ethers";
import { ethers } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import {
  IDiamond,
  Diamond,
  TokenConvertManagementFacet,
  MultiPathConverter,
  GeneralTokenConverter,
  FxUSDFacet,
  MockERC20,
  FractionalTokenV2,
  LeveragedTokenV2,
  MarketV2,
  WrappedTokenTreasuryV2,
  FxEETHTwapOracle,
  ConverterRegistry,
} from "@/types/index";
import { TOKENS, Action, PoolTypeV3, encodePoolHintV3, ADDRESS } from "@/utils/index";

const FORK_BLOCK_NUMBER = 19211926;

const MANAGER = "0x28c921adAC4c1072658eB01a28DA06b5F651eF62";
const ADMIN = "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF";

const weETH_HOLDER = "0xDceED643320622Cad92b7A90465E24d7dF0a9519";
const eETH_HOLDER = "0x30653c83162ff00918842D8bFe016935Fdd6Ab84";
const WETH_HOLDER = "0x8EB8a3b98659Cce290402893d0123abb75E3ab28";

describe("MarketV2.eETH.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let diamond: Diamond;
  let manage: TokenConvertManagementFacet;
  let gateway: FxUSDFacet;
  let converterRegistry: ConverterRegistry;
  let inputConverter: MultiPathConverter;
  let outputConverter: GeneralTokenConverter;

  let baseToken: MockERC20;
  let fToken: FractionalTokenV2;
  let xToken: LeveragedTokenV2;
  let market: MarketV2;
  let treasury: WrappedTokenTreasuryV2;
  let oracle: FxEETHTwapOracle;

  const getAllSignatures = (e: Interface): string[] => {
    const sigs: string[] = [];
    e.forEachFunction((func, _) => {
      sigs.push(func.selector);
    });
    return sigs;
  };

  beforeEach(async () => {
    await request_fork(FORK_BLOCK_NUMBER, [ZeroAddress, weETH_HOLDER, eETH_HOLDER, WETH_HOLDER, ADMIN, MANAGER]);
    const admin = await ethers.getSigner(ADMIN);
    const manager = await ethers.getSigner(MANAGER);
    deployer = await ethers.getSigner(ZeroAddress);
    await mockETHBalance(deployer.address, ethers.parseEther("100"));
    await mockETHBalance(admin.address, ethers.parseEther("100"));
    await mockETHBalance(manager.address, ethers.parseEther("100"));

    // deploy diamond
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
    const FxUSDFacet = await ethers.getContractFactory("FxUSDFacet", deployer);
    const facet = await FxUSDFacet.deploy(ZeroAddress);
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
    gateway = await ethers.getContractAt("FxUSDFacet", await diamond.getAddress(), deployer);

    // deploy converter
    converterRegistry = await ethers.getContractAt(
      "ConverterRegistry",
      "0x997B6F43c1c1e8630d03B8E3C11B60E98A1beA90",
      manager
    );
    outputConverter = await ethers.getContractAt(
      "GeneralTokenConverter",
      "0x11C907b3aeDbD863e551c37f21DD3F36b28A6784",
      manager
    );
    const MultiPathConverter = await ethers.getContractFactory("MultiPathConverter", deployer);
    inputConverter = await MultiPathConverter.deploy(outputConverter.getAddress());
    const ETHLSDConverter = await ethers.getContractFactory("ETHLSDConverter", deployer);
    const ethLSDConverter = await ETHLSDConverter.deploy(await converterRegistry.getAddress());
    await converterRegistry.register(11, await ethLSDConverter.getAddress());
    const CurveNGConverter = await ethers.getContractFactory("CurveNGConverter", deployer);
    const curveNGConverter = await CurveNGConverter.deploy(await converterRegistry.getAddress());
    await converterRegistry.register(12, await curveNGConverter.getAddress());
    await converterRegistry.register(13, await curveNGConverter.getAddress());
    await manage.approveTarget(inputConverter.getAddress(), inputConverter.getAddress());
    await manage.approveTarget(outputConverter.getAddress(), outputConverter.getAddress());

    // deploy market
    const FxEETHTwapOracle = await ethers.getContractFactory("FxEETHTwapOracle", deployer);
    oracle = await FxEETHTwapOracle.deploy(
      TOKENS["CURVE_STABLE_NG_weETH/WETH_22"].address,
      "0x4e68ccd3e89f51c3074ca5072bbac773960dfa36",
      "0x460B3CdE57DfbA90DBed02fd83d3990a92DA1230"
    );

    const RebalancePoolSplitter = await ethers.getContractFactory("RebalancePoolSplitter", deployer);
    const splitter = await RebalancePoolSplitter.deploy();

    baseToken = await ethers.getContractAt("MockERC20", TOKENS.weETH.address, deployer);
    const EmptyContract = await ethers.getContractFactory("EmptyContract", deployer);
    const placeholder = await EmptyContract.deploy();
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const treasuryProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    treasury = await ethers.getContractAt("WrappedTokenTreasuryV2", await treasuryProxy.getAddress(), deployer);
    const marketProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    market = await ethers.getContractAt("MarketV2", await marketProxy.getAddress(), deployer);
    const fTokenProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    fToken = await ethers.getContractAt("FractionalTokenV2", await fTokenProxy.getAddress(), deployer);
    const xTokenProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    xToken = await ethers.getContractAt("LeveragedTokenV2", await xTokenProxy.getAddress(), deployer);

    const WrappedTokenTreasuryV2 = await ethers.getContractFactory("WrappedTokenTreasuryV2", deployer);
    const treasuryImpl = await WrappedTokenTreasuryV2.deploy(
      baseToken.getAddress(),
      fToken.getAddress(),
      xToken.getAddress()
    );
    await treasuryProxy.connect(admin).upgradeTo(treasuryImpl.getAddress());

    const MarketV2 = await ethers.getContractFactory("MarketV2", deployer);
    const marketImpl = await MarketV2.deploy(treasuryProxy.getAddress());
    await marketProxy.connect(admin).upgradeTo(marketImpl.getAddress());

    const FractionalTokenV2 = await ethers.getContractFactory("FractionalTokenV2", deployer);
    const fTokenImpl = await FractionalTokenV2.deploy(treasury.getAddress());
    await fTokenProxy.connect(admin).upgradeTo(fTokenImpl.getAddress());

    const LeveragedTokenV2 = await ethers.getContractFactory("LeveragedTokenV2", deployer);
    const xTokenImpl = await LeveragedTokenV2.deploy(treasury.getAddress(), fToken.getAddress());
    await xTokenProxy.connect(admin).upgradeTo(xTokenImpl.getAddress());

    const ReservePoolV2 = await ethers.getContractFactory("ReservePoolV2", deployer);
    const reservePool = await ReservePoolV2.deploy();

    const RebalancePoolRegistry = await ethers.getContractFactory("RebalancePoolRegistry", deployer);
    const registry = await RebalancePoolRegistry.deploy();

    await fToken.initialize("Fractional eETH", "feETH");
    await xToken.initialize("Leveraged eETH", "xeETH");
    await treasury.initialize(
      ADMIN,
      splitter.getAddress(),
      TOKENS.weETH.address,
      oracle.getAddress(),
      ethers.parseEther("10000"),
      60
    );
    await market.initialize(ADMIN, reservePool.getAddress(), registry.getAddress());
    await treasury.grantRole(id("FX_MARKET_ROLE"), market.getAddress());
    await reservePool.grantRole(id("MARKET_ROLE"), market.getAddress());

    signer = await ethers.getSigner(weETH_HOLDER);
    await mockETHBalance(signer.address, ethers.parseEther("100"));
    await baseToken.connect(signer).transfer(treasury.getAddress(), ethers.parseEther("1000"));
    await treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), signer.address);
    await treasury.connect(signer).initializeProtocol(ethers.parseEther("1000"));
    await market.updateStabilityRatio(ethers.parseEther("1.3"));
  });

  context("mint fToken", async () => {
    it("should succeed when mint from weETH", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(weETH_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("1000"));
      const token = await ethers.getContractAt("MockERC20", TOKENS.weETH.address, signer);
      await token.approve(market.getAddress(), amountIn);

      const minted = await market.connect(signer).mintFToken.staticCall(amountIn, signer.address, 0n);
      console.log("mint feETH from weETH:", ethers.formatEther(minted));
      const before = await fToken.balanceOf(signer.address);
      await market.connect(signer).mintFToken(amountIn, signer.address, (minted * 9999n) / 10000n);
      const after = await fToken.balanceOf(signer.address);
      expect(after - before).to.closeTo(minted, minted / 10000n);
    });

    it("should succeed when mint from eETH", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(eETH_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("1000"));
      const token = await ethers.getContractAt("MockERC20", TOKENS.eETH.address, signer);
      await token.approve(gateway.getAddress(), amountIn);

      const params = {
        src: TOKENS.eETH.address,
        amount: amountIn,
        target: await inputConverter.getAddress(),
        data: inputConverter.interface.encodeFunctionData("convert", [
          TOKENS.eETH.address,
          amountIn,
          1048575n + (1n << 20n),
          [encodePoolHintV3(TOKENS.weETH.address, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Add, { protocol: 5 })],
        ]),
        minOut: 0,
      };

      const minted = await gateway.connect(signer).fxMintFTokenV2.staticCall(params, market.getAddress(), 0n);
      console.log("mint feETH from eETH:", ethers.formatEther(minted));
      const before = await fToken.balanceOf(signer.address);
      await gateway.connect(signer).fxMintFTokenV2(params, market.getAddress(), (minted * 9999n) / 10000n);
      const after = await fToken.balanceOf(signer.address);
      expect(after - before).to.closeTo(minted, minted / 10000n);
    });

    it("should succeed when mint from WETH", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(WETH_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("1000"));
      const token = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, signer);
      await token.approve(gateway.getAddress(), amountIn);

      const params = {
        src: TOKENS.WETH.address,
        amount: amountIn,
        target: await inputConverter.getAddress(),
        data: inputConverter.interface.encodeFunctionData("convert", [
          TOKENS.WETH.address,
          amountIn,
          1048575n + (2n << 20n),
          [
            encodePoolHintV3(TOKENS.eETH.address, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Add, { protocol: 5 }),
            encodePoolHintV3(TOKENS.weETH.address, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Add, { protocol: 5 }),
          ],
        ]),
        minOut: 0,
      };

      const minted = await gateway.connect(signer).fxMintFTokenV2.staticCall(params, market.getAddress(), 0n);
      console.log("mint feETH from WETH:", ethers.formatEther(minted));
      const before = await fToken.balanceOf(signer.address);
      await gateway.connect(signer).fxMintFTokenV2(params, market.getAddress(), (minted * 9999n) / 10000n);
      const after = await fToken.balanceOf(signer.address);
      expect(after - before).to.closeTo(minted, minted / 10000n);
    });

    it("should succeed when mint from ETH", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(WETH_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("1000"));

      const params = {
        src: ZeroAddress,
        amount: amountIn,
        target: await inputConverter.getAddress(),
        data: inputConverter.interface.encodeFunctionData("convert", [
          ZeroAddress,
          amountIn,
          1048575n + (2n << 20n),
          [
            encodePoolHintV3(TOKENS.eETH.address, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Add, { protocol: 5 }),
            encodePoolHintV3(TOKENS.weETH.address, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Add, { protocol: 5 }),
          ],
        ]),
        minOut: 0,
      };

      const minted = await gateway
        .connect(signer)
        .fxMintFTokenV2.staticCall(params, market.getAddress(), 0n, { value: amountIn });
      console.log("mint feETH from ETH:", ethers.formatEther(minted));
      const before = await fToken.balanceOf(signer.address);
      await gateway
        .connect(signer)
        .fxMintFTokenV2(params, market.getAddress(), (minted * 9999n) / 10000n, { value: amountIn });
      const after = await fToken.balanceOf(signer.address);
      expect(after - before).to.closeTo(minted, minted / 10000n);
    });
  });

  context("mint xToken", async () => {
    it("should succeed when mint from weETH", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(weETH_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("1000"));
      const token = await ethers.getContractAt("MockERC20", TOKENS.weETH.address, signer);
      await token.approve(market.getAddress(), amountIn);

      const [minted] = await market.connect(signer).mintXToken.staticCall(amountIn, signer.address, 0n);
      console.log("mint xeETH from weETH:", ethers.formatEther(minted));
      const before = await xToken.balanceOf(signer.address);
      await market.connect(signer).mintXToken(amountIn, signer.address, (minted * 9999n) / 10000n);
      const after = await xToken.balanceOf(signer.address);
      expect(after - before).to.closeTo(minted, minted / 10000n);
    });

    it("should succeed when mint from eETH", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(eETH_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("1000"));
      const token = await ethers.getContractAt("MockERC20", TOKENS.eETH.address, signer);
      await token.approve(gateway.getAddress(), amountIn);

      const params = {
        src: TOKENS.eETH.address,
        amount: amountIn,
        target: await inputConverter.getAddress(),
        data: inputConverter.interface.encodeFunctionData("convert", [
          TOKENS.eETH.address,
          amountIn,
          1048575n + (1n << 20n),
          [encodePoolHintV3(TOKENS.weETH.address, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Add, { protocol: 5 })],
        ]),
        minOut: 0,
      };

      const [minted] = await gateway.connect(signer).fxMintXTokenV2.staticCall(params, market.getAddress(), 0n);
      console.log("mint xeETH from eETH:", ethers.formatEther(minted));
      const before = await xToken.balanceOf(signer.address);
      await gateway.connect(signer).fxMintXTokenV2(params, market.getAddress(), (minted * 9999n) / 10000n);
      const after = await xToken.balanceOf(signer.address);
      expect(after - before).to.closeTo(minted, minted / 10000n);
    });

    it("should succeed when mint from WETH", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(WETH_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("1000"));
      const token = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, signer);
      await token.approve(gateway.getAddress(), amountIn);

      const params = {
        src: TOKENS.WETH.address,
        amount: amountIn,
        target: await inputConverter.getAddress(),
        data: inputConverter.interface.encodeFunctionData("convert", [
          TOKENS.WETH.address,
          amountIn,
          1048575n + (2n << 20n),
          [
            encodePoolHintV3(TOKENS.eETH.address, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Add, { protocol: 5 }),
            encodePoolHintV3(TOKENS.weETH.address, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Add, { protocol: 5 }),
          ],
        ]),
        minOut: 0,
      };

      const [minted] = await gateway.connect(signer).fxMintXTokenV2.staticCall(params, market.getAddress(), 0n);
      console.log("mint xeETH from WETH:", ethers.formatEther(minted));
      const before = await xToken.balanceOf(signer.address);
      await gateway.connect(signer).fxMintXTokenV2(params, market.getAddress(), (minted * 9999n) / 10000n);
      const after = await xToken.balanceOf(signer.address);
      expect(after - before).to.closeTo(minted, minted / 10000n);
    });

    it("should succeed when mint from ETH", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(WETH_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("1000"));

      const params = {
        src: ZeroAddress,
        amount: amountIn,
        target: await inputConverter.getAddress(),
        data: inputConverter.interface.encodeFunctionData("convert", [
          ZeroAddress,
          amountIn,
          1048575n + (2n << 20n),
          [
            encodePoolHintV3(TOKENS.eETH.address, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Add, { protocol: 5 }),
            encodePoolHintV3(TOKENS.weETH.address, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Add, { protocol: 5 }),
          ],
        ]),
        minOut: 0,
      };

      const [minted] = await gateway
        .connect(signer)
        .fxMintXTokenV2.staticCall(params, market.getAddress(), 0n, { value: amountIn });
      console.log("mint xeETH from ETH:", ethers.formatEther(minted));
      const before = await xToken.balanceOf(signer.address);
      await gateway
        .connect(signer)
        .fxMintXTokenV2(params, market.getAddress(), (minted * 9999n) / 10000n, { value: amountIn });
      const after = await xToken.balanceOf(signer.address);
      expect(after - before).to.closeTo(minted, minted / 10000n);
    });
  });

  context("redeem fToken", async () => {
    it("should succeed when redeem as weETH", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(weETH_HOLDER);
      const token = await ethers.getContractAt("MockERC20", TOKENS.weETH.address, signer);
      const [redeemed] = await market.connect(signer).redeemFToken.staticCall(amountIn, signer.address, 0n);
      console.log("redeem fToken as weETH:", ethers.formatEther(redeemed));
      const before = await token.balanceOf(signer.address);
      await market.connect(signer).redeemFToken(amountIn, signer.address, (redeemed * 9999n) / 10000n);
      const after = await token.balanceOf(signer.address);
      expect(after - before).to.closeTo(redeemed, redeemed / 10000n);
    });

    it("should succeed when redeem as eETH", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(weETH_HOLDER);
      const token = await ethers.getContractAt("MockERC20", TOKENS.eETH.address, signer);
      await fToken.connect(signer).approve(gateway.getAddress(), amountIn);

      const params = {
        converter: await outputConverter.getAddress(),
        minOut: 0n,
        routes: [encodePoolHintV3(TOKENS.weETH.address, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Remove, { protocol: 5 })],
      };

      const [base, dst] = await gateway
        .connect(signer)
        .fxRedeemFTokenV2.staticCall(params, market.getAddress(), amountIn, 0n);
      console.log("redeem fToken as weETH:", ethers.formatEther(base));
      console.log("redeem fToken as eETH:", ethers.formatEther(dst));
      params.minOut = (dst * 9999n) / 10000n;
      const before = await token.balanceOf(signer.address);
      await gateway.connect(signer).fxRedeemFTokenV2(params, market.getAddress(), amountIn, (base * 9999n) / 10000n);
      const after = await token.balanceOf(signer.address);
      expect(after - before).to.closeTo(dst, dst / 10000n);
    });

    it("should succeed when redeem as WETH", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(weETH_HOLDER);
      const token = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, signer);
      await fToken.connect(signer).approve(gateway.getAddress(), amountIn);

      const params = {
        converter: await outputConverter.getAddress(),
        minOut: 0n,
        routes: [
          encodePoolHintV3(
            ADDRESS["CURVE_STABLE_NG_weETH/WETH_22_POOL"],
            PoolTypeV3.CurveStableSwapNG,
            2,
            0,
            1,
            Action.Swap
          ),
        ],
      };

      const [base, dst] = await gateway
        .connect(signer)
        .fxRedeemFTokenV2.staticCall(params, market.getAddress(), amountIn, 0n);
      console.log("redeem fToken as weETH:", ethers.formatEther(base));
      console.log("redeem fToken as WETH:", ethers.formatEther(dst));
      params.minOut = (dst * 9999n) / 10000n;
      const before = await token.balanceOf(signer.address);
      await gateway.connect(signer).fxRedeemFTokenV2(params, market.getAddress(), amountIn, (base * 9999n) / 10000n);
      const after = await token.balanceOf(signer.address);
      expect(after - before).to.closeTo(dst, dst / 10000n);
    });
  });

  context("redeem xToken", async () => {
    it("should succeed when redeem as weETH", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(weETH_HOLDER);
      const token = await ethers.getContractAt("MockERC20", TOKENS.weETH.address, signer);
      const redeemed = await market.connect(signer).redeemXToken.staticCall(amountIn, signer.address, 0n);
      console.log("redeem xToken as weETH:", ethers.formatEther(redeemed));
      const before = await token.balanceOf(signer.address);
      await market.connect(signer).redeemXToken(amountIn, signer.address, (redeemed * 9999n) / 10000n);
      const after = await token.balanceOf(signer.address);
      expect(after - before).to.closeTo(redeemed, redeemed / 10000n);
    });

    it("should succeed when redeem as eETH", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(weETH_HOLDER);
      const token = await ethers.getContractAt("MockERC20", TOKENS.eETH.address, signer);
      await xToken.connect(signer).approve(gateway.getAddress(), amountIn);

      const params = {
        converter: await outputConverter.getAddress(),
        minOut: 0n,
        routes: [encodePoolHintV3(TOKENS.weETH.address, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Remove, { protocol: 5 })],
      };

      const [base, dst] = await gateway
        .connect(signer)
        .fxRedeemXTokenV2.staticCall(params, market.getAddress(), amountIn, 0n);
      console.log("redeem xToken as weETH:", ethers.formatEther(base));
      console.log("redeem xToken as eETH:", ethers.formatEther(dst));
      params.minOut = (dst * 9999n) / 10000n;
      const before = await token.balanceOf(signer.address);
      await gateway.connect(signer).fxRedeemXTokenV2(params, market.getAddress(), amountIn, (base * 9999n) / 10000n);
      const after = await token.balanceOf(signer.address);
      expect(after - before).to.closeTo(dst, dst / 10000n);
    });

    it("should succeed when redeem as WETH", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(weETH_HOLDER);
      const token = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, signer);
      await xToken.connect(signer).approve(gateway.getAddress(), amountIn);

      const params = {
        converter: await outputConverter.getAddress(),
        minOut: 0n,
        routes: [
          encodePoolHintV3(
            ADDRESS["CURVE_STABLE_NG_weETH/WETH_22_POOL"],
            PoolTypeV3.CurveStableSwapNG,
            2,
            0,
            1,
            Action.Swap
          ),
        ],
      };

      const [base, dst] = await gateway
        .connect(signer)
        .fxRedeemXTokenV2.staticCall(params, market.getAddress(), amountIn, 0n);
      console.log("redeem xToken as weETH:", ethers.formatEther(base));
      console.log("redeem xToken as WETH:", ethers.formatEther(dst));
      params.minOut = (dst * 9999n) / 10000n;
      const before = await token.balanceOf(signer.address);
      await gateway.connect(signer).fxRedeemXTokenV2(params, market.getAddress(), amountIn, (base * 9999n) / 10000n);
      const after = await token.balanceOf(signer.address);
      expect(after - before).to.closeTo(dst, dst / 10000n);
    });
  });
});

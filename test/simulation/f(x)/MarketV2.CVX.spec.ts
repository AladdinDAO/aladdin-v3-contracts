/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { Interface, Wallet, ZeroAddress, id } from "ethers";
import { ethers } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import {
  IDiamond,
  TokenConvertManagementFacet,
  MultiPathConverter,
  GeneralTokenConverter,
  FxUSDFacet,
  MockERC20,
  FractionalTokenV2,
  LeveragedTokenV2,
  MarketV2,
  WrappedTokenTreasuryV2,
  ConverterRegistry,
  FxCVXTwapOracle,
} from "@/types/index";
import { TOKENS, ADDRESS, CONVERTER_ROUTRS } from "@/utils/index";
import { simulateMintFTokenV2, simulateMintXTokenV2, simulateRedeemFTokenV2, simulateRedeemXTokenV2 } from "./helpers";

const FORK_BLOCK_NUMBER = 19326670;

const MANAGER = "0x28c921adAC4c1072658eB01a28DA06b5F651eF62";
const ADMIN = "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF";

const TokenHolder: { [symbol: string]: { holder: string; amount: bigint } } = {
  aCVX: { holder: "0x7BFEe91193d9Df2Ac0bFe90191D40F23c773C060", amount: ethers.parseEther("10") },
  CVX: { holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC", amount: ethers.parseEther("10") },
  WETH: { holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28", amount: ethers.parseEther("10") },
  ETH: { holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28", amount: ethers.parseEther("10") },
  USDC: { holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28", amount: ethers.parseUnits("20000", 6) },
  USDT: { holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28", amount: ethers.parseUnits("20000", 6) },
};

describe("MarketV2.CVX.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;
  let oracleSigner: Wallet;

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
  let oracle: FxCVXTwapOracle;

  const getAllSignatures = (e: Interface): string[] => {
    const sigs: string[] = [];
    e.forEachFunction((func, _) => {
      sigs.push(func.selector);
    });
    return sigs;
  };

  beforeEach(async () => {
    await request_fork(FORK_BLOCK_NUMBER, [
      ZeroAddress,
      ...Object.values(TokenHolder).map((x) => x.holder),
      ADMIN,
      MANAGER,
    ]);
    const admin = await ethers.getSigner(ADMIN);
    const manager = await ethers.getSigner(MANAGER);
    deployer = await ethers.getSigner(ZeroAddress);
    oracleSigner = new Wallet("0x0000000000000000000000000000000000000000000000000000000000000001");
    await mockETHBalance(deployer.address, ethers.parseEther("100"));
    await mockETHBalance(admin.address, ethers.parseEther("100"));
    await mockETHBalance(manager.address, ethers.parseEther("100"));

    const loupeFacet = await ethers.getContractAt(
      "DiamondLoupeFacet",
      "0xA5e2Ec4682a32605b9098Ddd7204fe84Ab932fE4",
      deployer
    );
    const cutFacet = await ethers.getContractAt(
      "DiamondCutFacet",
      "0xA5e2Ec4682a32605b9098Ddd7204fe84Ab932fE4",
      deployer
    );
    const cuts: IDiamond.FacetCutStruct[] = [];
    const x: string[] = await loupeFacet.facetFunctionSelectors("0x5fd37C3b46d05859B333D6E418ce7d6d405c20b6");
    const y: string[] = await loupeFacet.facetFunctionSelectors("0x2eD6624Cc9E6200c2a60631f8cEb69FbAFbE3733");
    cuts.push({
      facetAddress: ZeroAddress,
      action: 2,
      functionSelectors: x.map((x) => x),
    });
    cuts.push({
      facetAddress: ZeroAddress,
      action: 2,
      functionSelectors: y.map((x) => x),
    });
    for (const name of ["FxUSDFacet", "TokenConvertManagementFacet", "EIP712Facet"]) {
      const Contract = await ethers.getContractFactory(name, deployer);
      const facet = await Contract.deploy();
      cuts.push({
        facetAddress: await facet.getAddress(),
        action: 0,
        functionSelectors: getAllSignatures(facet.interface),
      });
    }
    await cutFacet.connect(manager).diamondCut(cuts, ZeroAddress, "0x");

    manage = await ethers.getContractAt(
      "TokenConvertManagementFacet",
      "0xA5e2Ec4682a32605b9098Ddd7204fe84Ab932fE4",
      deployer
    );
    gateway = await ethers.getContractAt("FxUSDFacet", "0xA5e2Ec4682a32605b9098Ddd7204fe84Ab932fE4", deployer);

    inputConverter = await ethers.getContractAt(
      "MultiPathConverter",
      "0xCa1D3F8f770Fd50b8cF76551ec54012C26036c2A",
      deployer
    );
    outputConverter = await ethers.getContractAt(
      "GeneralTokenConverter",
      "0x11C907b3aeDbD863e551c37f21DD3F36b28A6784",
      deployer
    );
    converterRegistry = await ethers.getContractAt(
      "ConverterRegistry",
      "0x997B6F43c1c1e8630d03B8E3C11B60E98A1beA90",
      deployer
    );
    const WETHConverter = await ethers.getContractFactory("WETHConverter", deployer);
    const wethConverter = await WETHConverter.deploy(await converterRegistry.getAddress());
    await converterRegistry.connect(manager).register(14, await wethConverter.getAddress());
    await manage.connect(manager).approveTarget(inputConverter.getAddress(), ZeroAddress);
    await manage.connect(manager).updateSigner(oracleSigner.getAddress(), true);
    const eip712 = await ethers.getContractAt("EIP712Facet", "0xA5e2Ec4682a32605b9098Ddd7204fe84Ab932fE4", deployer);
    await eip712.connect(manager).initializeEIP712("Gateway Router", "1.0.0");

    // deploy market
    const ERC4626RateProvider = await ethers.getContractFactory("ERC4626RateProvider", deployer);
    const rateProvider = await ERC4626RateProvider.deploy(TOKENS.aCVX.address);
    const ChainlinkTwapOracleV3 = await ethers.getContractFactory("ChainlinkTwapOracleV3", deployer);
    const cvxTwapOracle = await ChainlinkTwapOracleV3.deploy(
      "0xd962fC30A72A84cE50161031391756Bf2876Af5D",
      1,
      10800,
      "CVX"
    );
    const FxCVXTwapOracle = await ethers.getContractFactory("FxCVXTwapOracle", deployer);
    oracle = await FxCVXTwapOracle.deploy(
      ADDRESS.CURVE_CVXETH_POOL,
      cvxTwapOracle.getAddress(),
      "0x460B3CdE57DfbA90DBed02fd83d3990a92DA1230"
    );

    const RebalancePoolSplitter = await ethers.getContractFactory("RebalancePoolSplitter", deployer);
    const splitter = await RebalancePoolSplitter.deploy();

    baseToken = await ethers.getContractAt("MockERC20", TOKENS.aCVX.address, deployer);
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

    await fToken.initialize("Fractional CVX", "fCVX");
    await xToken.initialize("Leveraged CVX", "xCVX");
    await treasury.initialize(
      ADMIN,
      splitter.getAddress(),
      rateProvider.getAddress(),
      oracle.getAddress(),
      ethers.parseEther("10000"),
      60
    );
    await market.initialize(ADMIN, reservePool.getAddress(), registry.getAddress());
    await treasury.grantRole(id("FX_MARKET_ROLE"), market.getAddress());
    await reservePool.grantRole(id("MARKET_ROLE"), market.getAddress());

    signer = await ethers.getSigner(TokenHolder.aCVX.holder);
    await mockETHBalance(signer.address, ethers.parseEther("100"));
    await baseToken.connect(signer).transfer(treasury.getAddress(), ethers.parseEther("1000"));
    await treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), signer.address);
    await treasury.connect(signer).initializeProtocol(ethers.parseEther("1000"));
    await market.updateStabilityRatio(ethers.parseEther("1.3"));

    await manage.connect(manager).updateWhitelist(market.getAddress(), 2);
  });

  context("mint fToken", async () => {
    it("should succeed when mint from aCVX", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(TokenHolder.aCVX.holder);
      await mockETHBalance(signer.address, ethers.parseEther("1000"));
      const token = await ethers.getContractAt("MockERC20", TOKENS.aCVX.address, signer);
      await token.approve(market.getAddress(), amountIn);

      const minted = await market.connect(signer).mintFToken.staticCall(amountIn, signer.address, 0n);
      console.log("mint fCVX from aCVX:", ethers.formatEther(minted));
      const before = await fToken.balanceOf(signer.address);
      await market.connect(signer).mintFToken(amountIn, signer.address, (minted * 9999n) / 10000n);
      const after = await fToken.balanceOf(signer.address);
      expect(after - before).to.closeTo(minted, minted / 10000n);
    });

    for (const symbol of ["CVX", "WETH", "USDC", "USDT", "ETH"]) {
      it(`should succeed when mint from ${symbol}`, async () => {
        await simulateMintFTokenV2(
          oracleSigner,
          gateway,
          inputConverter,
          market,
          fToken,
          TokenHolder[symbol].holder,
          symbol,
          TokenHolder[symbol].amount,
          CONVERTER_ROUTRS[symbol === "ETH" ? "WETH" : symbol].aCVX
        );
      });
    }
  });

  context("mint xToken", async () => {
    it("should succeed when mint from aCVX", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(TokenHolder.aCVX.holder);
      await mockETHBalance(signer.address, ethers.parseEther("1000"));
      const token = await ethers.getContractAt("MockERC20", TOKENS.aCVX.address, signer);
      await token.approve(market.getAddress(), amountIn);

      const [minted] = await market.connect(signer).mintXToken.staticCall(amountIn, signer.address, 0n);
      console.log("mint xCVX from aCVX:", ethers.formatEther(minted));
      const before = await xToken.balanceOf(signer.address);
      await market.connect(signer).mintXToken(amountIn, signer.address, (minted * 9999n) / 10000n);
      const after = await xToken.balanceOf(signer.address);
      expect(after - before).to.closeTo(minted, minted / 10000n);
    });

    for (const symbol of ["CVX", "WETH", "USDC", "USDT", "ETH"]) {
      it(`should succeed when mint from ${symbol}`, async () => {
        await simulateMintXTokenV2(
          oracleSigner,
          gateway,
          inputConverter,
          market,
          xToken,
          TokenHolder[symbol].holder,
          symbol,
          TokenHolder[symbol].amount,
          CONVERTER_ROUTRS[symbol === "ETH" ? "WETH" : symbol].aCVX
        );
      });
    }
  });

  context("redeem fToken", async () => {
    it("should succeed when redeem as aCVX", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(TokenHolder.aCVX.holder);
      const token = await ethers.getContractAt("MockERC20", TOKENS.aCVX.address, signer);
      const [redeemed] = await market.connect(signer).redeemFToken.staticCall(amountIn, signer.address, 0n);
      console.log("redeem fToken as aCVX:", ethers.formatEther(redeemed));
      const before = await token.balanceOf(signer.address);
      await market.connect(signer).redeemFToken(amountIn, signer.address, (redeemed * 9999n) / 10000n);
      const after = await token.balanceOf(signer.address);
      expect(after - before).to.closeTo(redeemed, redeemed / 10000n);
    });

    for (const symbol of ["CVX", "WETH", "USDC", "USDT", "ETH"]) {
      it(`should succeed when redeem as ${symbol}`, async () => {
        await simulateRedeemFTokenV2(
          oracleSigner,
          gateway,
          outputConverter,
          market,
          fToken,
          TokenHolder.aCVX.holder,
          symbol,
          ethers.parseEther("10"),
          CONVERTER_ROUTRS.aCVX[symbol]
        );
      });
    }
  });

  context("redeem xToken", async () => {
    it("should succeed when redeem as aCVX", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(TokenHolder.aCVX.holder);
      const token = await ethers.getContractAt("MockERC20", TOKENS.aCVX.address, signer);
      const redeemed = await market.connect(signer).redeemXToken.staticCall(amountIn, signer.address, 0n);
      console.log("redeem xToken as CVX:", ethers.formatEther(redeemed));
      const before = await token.balanceOf(signer.address);
      await market.connect(signer).redeemXToken(amountIn, signer.address, (redeemed * 9999n) / 10000n);
      const after = await token.balanceOf(signer.address);
      expect(after - before).to.closeTo(redeemed, redeemed / 10000n);
    });

    for (const symbol of ["CVX", "WETH", "USDC", "USDT", "ETH"]) {
      it(`should succeed when redeem as ${symbol}`, async () => {
        await simulateRedeemXTokenV2(
          oracleSigner,
          gateway,
          outputConverter,
          market,
          xToken,
          TokenHolder.aCVX.holder,
          symbol,
          ethers.parseEther("10"),
          CONVERTER_ROUTRS.aCVX[symbol]
        );
      });
    }
  });
});

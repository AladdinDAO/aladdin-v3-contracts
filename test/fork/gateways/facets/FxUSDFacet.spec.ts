/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { Interface, MaxUint256, ZeroAddress, id } from "ethers";
import { ethers } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import {
  IDiamond,
  Diamond,
  TokenConvertManagementFacet,
  MultiPathConverter,
  GeneralTokenConverter,
  FxUSD,
  FxUSDFacet,
  MockERC20,
  FractionalTokenV2,
  LeveragedTokenV2,
  MarketV2,
  ReservePoolV2,
  RebalancePoolRegistry,
  WrappedTokenTreasuryV2,
  MockFxRateProvider,
  MockTwapOracle,
  RebalancePoolSplitter,
  ShareableRebalancePool,
  IFxRateProvider,
  IFxPriceOracle,
  FxInitialFund,
} from "@/types/index";
import { LibGatewayRouter } from "@/types/contracts/gateways/facets/FxUSDFacet";
import { TOKENS, Action, PoolTypeV3, encodePoolHintV3, ADDRESS } from "@/utils/index";

const FORK_BLOCK_NUMBER = 19082800;

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const ADMIN = "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF";
const OPERATOR = "0x66c57bF505A85A74609D2C83E94Aabb26d691E1F";
const WETH_HOLDER = "0x8EB8a3b98659Cce290402893d0123abb75E3ab28";
const USDC_HOLDER = "0x8EB8a3b98659Cce290402893d0123abb75E3ab28";
const STETH_HOLDER = "0x18709E89BD403F470088aBDAcEbE86CC60dda12e";
const WSTETH_HOLDER = "0x176F3DAb24a159341c0509bB36B833E7fdd0a132";
const FRXETH_HOLDER = "0x8306300ffd616049FD7e4b0354a64Da835c1A81C";
const SFRXETH_HOLDER = "0x46782D268FAD71DaC3383Ccf2dfc44C861fb4c7D";

interface FxMarket {
  holder: HardhatEthersSigner;
  baseToken: MockERC20;
  fToken: FractionalTokenV2;
  xToken: LeveragedTokenV2;
  market: MarketV2;
  reservePool: ReservePoolV2;
  registry: RebalancePoolRegistry;
  treasury: WrappedTokenTreasuryV2;
  splitter: RebalancePoolSplitter;
  pool: ShareableRebalancePool;

  rateProvider: IFxRateProvider;
  oracle: IFxPriceOracle;
}

describe("FxUSDFacet.spec", async () => {
  let deployer: HardhatEthersSigner;
  let admin: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let diamond: Diamond;
  let manage: TokenConvertManagementFacet;
  let gateway: FxUSDFacet;
  let inputConverter: MultiPathConverter;
  let outputConverter: GeneralTokenConverter;

  let sfrxETHMarket: FxMarket;
  let wstETHMarket: FxMarket;
  let fxUSD: FxUSD;

  const getAllSignatures = (e: Interface): string[] => {
    const sigs: string[] = [];
    e.forEachFunction((func, _) => {
      sigs.push(func.selector);
    });
    return sigs;
  };

  const deployFxMarket = async (
    token: string,
    holder: HardhatEthersSigner,
    doInitialize: boolean
  ): Promise<FxMarket> => {
    await mockETHBalance(holder.address, ethers.parseEther("100"));
    let baseToken: MockERC20;
    let rateProvider: IFxRateProvider;
    let oracle: IFxPriceOracle;
    if (token === TOKENS.wstETH.address) {
      const WstETHRateProvider = await ethers.getContractFactory("WstETHRateProvider", deployer);
      rateProvider = await WstETHRateProvider.deploy(token);
      oracle = (await ethers.getContractAt(
        "FxStETHTwapOracle",
        "0xa84360896cE9152d1780c546305BB54125F962d9",
        deployer
      )) as any as IFxPriceOracle;
      baseToken = await ethers.getContractAt("MockERC20", token, holder);
    } else if (token === TOKENS.sfrxETH.address) {
      const ERC4626RateProvider = await ethers.getContractFactory("ERC4626RateProvider", deployer);
      rateProvider = await ERC4626RateProvider.deploy(token);

      const FxFrxETHTwapOracle = await ethers.getContractFactory("FxFrxETHTwapOracle", deployer);
      oracle = (await FxFrxETHTwapOracle.deploy(
        "0x460B3CdE57DfbA90DBed02fd83d3990a92DA1230",
        "0x9c3b46c0ceb5b9e304fcd6d88fc50f7dd24b31bc"
      )) as any as IFxPriceOracle;
      baseToken = await ethers.getContractAt("MockERC20", token, holder);
    } else {
      const MockFxRateProvider = await ethers.getContractFactory("MockFxRateProvider", deployer);
      rateProvider = await MockFxRateProvider.deploy();
      await (rateProvider as MockFxRateProvider).setRate(ethers.parseEther("1"));

      const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
      oracle = (await MockTwapOracle.deploy()) as any as IFxPriceOracle;
      await (oracle as any as MockTwapOracle).setIsValid(true);
      await (oracle as any as MockTwapOracle).setPrice(ethers.parseEther("2000"));

      const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
      baseToken = await MockERC20.deploy("x", "y", 18);
      await baseToken.mint(holder.address, ethers.parseEther("10000"));
    }

    const RebalancePoolSplitter = await ethers.getContractFactory("RebalancePoolSplitter", deployer);
    const splitter = await RebalancePoolSplitter.deploy();

    const EmptyContract = await ethers.getContractFactory("EmptyContract", deployer);
    const placeholder = await EmptyContract.deploy();
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const treasuryProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    const treasury = await ethers.getContractAt("WrappedTokenTreasuryV2", await treasuryProxy.getAddress(), deployer);
    const marketProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    const market = await ethers.getContractAt("MarketV2", await marketProxy.getAddress(), deployer);
    const fTokenProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    const fToken = await ethers.getContractAt("FractionalTokenV2", await fTokenProxy.getAddress(), deployer);
    const xTokenProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    const xToken = await ethers.getContractAt("LeveragedTokenV2", await xTokenProxy.getAddress(), deployer);

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

    await fToken.initialize("Fractional ETH", "fETH");
    await xToken.initialize("Leveraged ETH", "xETH");
    await treasury.initialize(
      deployer.address,
      splitter.getAddress(),
      rateProvider.getAddress(),
      oracle.getAddress(),
      ethers.parseEther("10000"),
      60
    );
    await market.initialize(deployer.address, reservePool.getAddress(), registry.getAddress());
    await treasury.grantRole(id("FX_MARKET_ROLE"), market.getAddress());
    await reservePool.grantRole(id("MARKET_ROLE"), market.getAddress());

    if (doInitialize) {
      await baseToken.transfer(treasury.getAddress(), ethers.parseEther("1"));
      await treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), signer.address);
      await treasury.connect(signer).initializeProtocol(ethers.parseEther("1"));
    }
    await market.updateStabilityRatio(ethers.parseEther("1.3"));

    const ShareableRebalancePool = await ethers.getContractFactory("ShareableRebalancePool", deployer);
    const pool = await ShareableRebalancePool.deploy(
      "0x365AccFCa291e7D3914637ABf1F7635dB165Bb09",
      "0xEC6B8A3F3605B083F7044C0F31f2cac0caf1d469",
      "0xd766f2b87DE4b08c2239580366e49710180aba02",
      "0xC8b194925D55d5dE9555AD1db74c149329F71DeF"
    );
    await pool.initialize(treasury.getAddress(), market.getAddress(), ZeroAddress);
    await pool.connect(deployer).grantRole(id("WITHDRAW_FROM_ROLE"), gateway.getAddress());

    return {
      baseToken,
      holder,
      fToken,
      xToken,
      market,
      reservePool,
      registry,
      treasury,
      rateProvider,
      oracle,
      splitter,
      pool,
    };
  };

  beforeEach(async () => {
    await request_fork(FORK_BLOCK_NUMBER, [
      DEPLOYER,
      OPERATOR,
      WETH_HOLDER,
      USDC_HOLDER,
      WSTETH_HOLDER,
      SFRXETH_HOLDER,
      STETH_HOLDER,
      FRXETH_HOLDER,
      ADMIN,
      "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF",
    ]);
    admin = await ethers.getSigner(ADMIN);
    deployer = await ethers.getSigner(DEPLOYER);
    signer = await ethers.getSigner(OPERATOR);
    await mockETHBalance(admin.address, ethers.parseEther("100"));
    await mockETHBalance(deployer.address, ethers.parseEther("100"));
    await mockETHBalance(signer.address, ethers.parseEther("100"));

    const FxUSD = await ethers.getContractFactory("FxUSD", deployer);
    fxUSD = await FxUSD.deploy();
    await fxUSD.initialize("f(x) USD", "fxUSD");

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
    const facet = await FxUSDFacet.deploy(await fxUSD.getAddress());
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

    await manage.approveTarget(inputConverter.getAddress(), inputConverter.getAddress());
    await manage.approveTarget(outputConverter.getAddress(), outputConverter.getAddress());
    await manage.approveTarget(TOKENS.stETH.address, ZeroAddress);
    await manage.approveTarget(TOKENS.wstETH.address, ZeroAddress);

    sfrxETHMarket = await deployFxMarket(TOKENS.sfrxETH.address, await ethers.getSigner(SFRXETH_HOLDER), true);
    wstETHMarket = await deployFxMarket(TOKENS.wstETH.address, await ethers.getSigner(WSTETH_HOLDER), true);
    await fxUSD.addMarket(wstETHMarket.market.getAddress(), MaxUint256);
    await fxUSD.addMarket(sfrxETHMarket.market.getAddress(), MaxUint256);
  });

  const checkFxMintFTokenV2 = async (
    market: MarketV2,
    holder: HardhatEthersSigner,
    amountIn: bigint,
    tokenOut: MockERC20,
    params: LibGatewayRouter.ConvertInParamsStruct,
    tokenIn?: MockERC20
  ) => {
    if (tokenIn) {
      await tokenIn.connect(holder).approve(gateway.getAddress(), amountIn);
    }
    const expected = await gateway.connect(holder).fxMintFTokenV2.staticCall(params, market.getAddress(), 0n, {
      value: tokenIn ? 0n : amountIn,
    });
    console.log("fETH minted:", ethers.formatEther(expected));
    const balanceBefore = await tokenOut.balanceOf(holder.address);
    await gateway
      .connect(holder)
      .fxMintFTokenV2(params, market.getAddress(), expected - expected / 100000n, { value: tokenIn ? 0n : amountIn });
    const balanceAfter = await tokenOut.balanceOf(holder.address);
    expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 100000n);
  };

  const checkFxMintXTokenV2 = async (
    market: MarketV2,
    holder: HardhatEthersSigner,
    amountIn: bigint,
    tokenOut: MockERC20,
    params: LibGatewayRouter.ConvertInParamsStruct,
    tokenIn?: MockERC20
  ) => {
    if (tokenIn) {
      await tokenIn.connect(holder).approve(gateway.getAddress(), amountIn);
    }
    const [expected, bonus] = await gateway.connect(holder).fxMintXTokenV2.staticCall(params, market.getAddress(), 0n, {
      value: tokenIn ? 0n : amountIn,
    });
    console.log("xETH minted:", ethers.formatEther(expected), "bonus:", ethers.formatEther(bonus));
    const balanceBefore = await tokenOut.balanceOf(holder.address);
    await gateway
      .connect(holder)
      .fxMintXTokenV2(params, market.getAddress(), expected - expected / 100000n, { value: tokenIn ? 0n : amountIn });
    const balanceAfter = await tokenOut.balanceOf(holder.address);
    expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 100000n);
  };

  const checkFxRedeemFTokenV2 = async (
    market: MarketV2,
    holder: HardhatEthersSigner,
    tokenIn: MockERC20,
    amountIn: bigint,
    tokenOut: MockERC20,
    params: LibGatewayRouter.ConvertOutParamsStruct
  ) => {
    await tokenIn.connect(holder).approve(gateway.getAddress(), amountIn);
    const [baseOut, dstOut, bounsOut] = await gateway
      .connect(holder)
      .fxRedeemFTokenV2.staticCall(params, market.getAddress(), amountIn, 0n);
    console.log(
      "redeemed:",
      ethers.formatEther(baseOut),
      "swapped:",
      ethers.formatUnits(dstOut, await tokenOut.decimals()),
      "bonus:",
      ethers.formatEther(bounsOut)
    );
    params.minOut = dstOut - dstOut / 100000n;
    const balanceBefore = await tokenOut.balanceOf(holder.address);
    await gateway.connect(holder).fxRedeemFTokenV2(params, market.getAddress(), amountIn, baseOut - baseOut / 100000n);
    const balanceAfter = await tokenOut.balanceOf(holder.address);
    expect(balanceAfter - balanceBefore).to.closeTo(dstOut, dstOut / 100000n);
  };

  const checkFxRedeemXTokenV2 = async (
    market: MarketV2,
    holder: HardhatEthersSigner,
    tokenIn: MockERC20,
    amountIn: bigint,
    tokenOut: MockERC20,
    params: LibGatewayRouter.ConvertOutParamsStruct
  ) => {
    await tokenIn.connect(holder).approve(gateway.getAddress(), amountIn);
    const [baseOut, dstOut] = await gateway
      .connect(holder)
      .fxRedeemXTokenV2.staticCall(params, market.getAddress(), amountIn, 0n);
    console.log(
      "redeemed:",
      ethers.formatEther(baseOut),
      "swapped:",
      ethers.formatUnits(dstOut, await tokenOut.decimals())
    );
    params.minOut = dstOut - dstOut / 100000n;
    const balanceBefore = await tokenOut.balanceOf(holder.address);
    await gateway.connect(holder).fxRedeemXTokenV2(params, market.getAddress(), amountIn, baseOut - baseOut / 100000n);
    const balanceAfter = await tokenOut.balanceOf(holder.address);
    expect(balanceAfter - balanceBefore).to.closeTo(dstOut, dstOut / 100000n);
  };

  const checkFxMintFxUSD = async (
    baseToken: MockERC20,
    holder: HardhatEthersSigner,
    amountIn: bigint,
    params: LibGatewayRouter.ConvertInParamsStruct,
    tokenIn?: MockERC20
  ) => {
    if (tokenIn) {
      await tokenIn.connect(holder).approve(gateway.getAddress(), amountIn);
    }
    const expected = await gateway.connect(holder).fxMintFxUSD.staticCall(params, baseToken.getAddress(), 0n, {
      value: tokenIn ? 0n : amountIn,
    });
    console.log("fxUSD minted:", ethers.formatEther(expected));
    const balanceBefore = await fxUSD.balanceOf(holder.address);
    await gateway
      .connect(holder)
      .fxMintFxUSD(params, baseToken.getAddress(), expected - expected / 100000n, { value: tokenIn ? 0n : amountIn });
    const balanceAfter = await fxUSD.balanceOf(holder.address);
    expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 100000n);
  };

  const checkFxMintFxUSDAndEarn = async (
    pool: ShareableRebalancePool,
    holder: HardhatEthersSigner,
    amountIn: bigint,
    params: LibGatewayRouter.ConvertInParamsStruct,
    tokenIn?: MockERC20
  ) => {
    if (tokenIn) {
      await tokenIn.connect(holder).approve(gateway.getAddress(), amountIn);
    }
    const expected = await gateway.connect(holder).fxMintFxUSDAndEarn.staticCall(params, pool.getAddress(), 0n, {
      value: tokenIn ? 0n : amountIn,
    });
    console.log("fxUSD minted:", ethers.formatEther(expected));
    const balanceBefore = await pool.balanceOf(holder.address);
    await gateway
      .connect(holder)
      .fxMintFxUSDAndEarn(params, pool.getAddress(), expected - expected / 100000n, { value: tokenIn ? 0n : amountIn });
    const balanceAfter = await pool.balanceOf(holder.address);
    expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 100000n);
  };

  const checkFxRebalancePoolWithdrawAs = async (
    pool: ShareableRebalancePool,
    holder: HardhatEthersSigner,
    amountIn: bigint,
    tokenOut: MockERC20,
    params: LibGatewayRouter.ConvertOutParamsStruct
  ) => {
    const dstOut = await gateway
      .connect(holder)
      .fxRebalancePoolWithdrawAs.staticCall(params, pool.getAddress(), amountIn);
    console.log("withdrawn:", ethers.formatUnits(dstOut, await tokenOut.decimals()));
    params.minOut = dstOut - dstOut / 100000n;
    const balanceBefore = await tokenOut.balanceOf(holder.address);
    await gateway.connect(holder).fxRebalancePoolWithdrawAs(params, pool.getAddress(), amountIn);
    const balanceAfter = await tokenOut.balanceOf(holder.address);
    expect(balanceAfter - balanceBefore).to.closeTo(dstOut, dstOut / 100000n);
  };

  const checkFxRedeemFxUSD = async (
    baseToken: MockERC20,
    holder: HardhatEthersSigner,
    amountIn: bigint,
    tokenOut: MockERC20,
    params: LibGatewayRouter.ConvertOutParamsStruct
  ) => {
    await fxUSD.connect(holder).approve(gateway.getAddress(), amountIn);
    const [baseOut, dstOut, bonusOut] = await gateway
      .connect(holder)
      .fxRedeemFxUSD.staticCall(params, baseToken.getAddress(), amountIn, 0n);
    console.log(
      "redeemed:",
      ethers.formatEther(baseOut),
      "swapped:",
      ethers.formatUnits(dstOut, await tokenOut.decimals()),
      "bonus:",
      ethers.formatEther(bonusOut)
    );
    params.minOut = dstOut - dstOut / 100000n;
    const balanceBefore = await tokenOut.balanceOf(holder.address);
    await gateway.connect(holder).fxRedeemFxUSD(params, baseToken.getAddress(), amountIn, baseOut - baseOut / 100000n);
    const balanceAfter = await tokenOut.balanceOf(holder.address);
    expect(balanceAfter - balanceBefore).to.closeTo(dstOut, dstOut / 100000n);
  };

  context("wstETH market", async () => {
    context("fxMintFTokenV2", async () => {
      it("should succeed to mint from ETH", async () => {
        const amountIn = ethers.parseEther("10");
        await checkFxMintFTokenV2(wstETHMarket.market, deployer, amountIn, wstETHMarket.fToken, {
          src: ZeroAddress,
          amount: amountIn,
          target: TOKENS.wstETH.address,
          data: "0x",
          minOut: 0,
        });
      });

      it("should succeed to mint from WETH", async () => {
        const holder = await ethers.getSigner(WETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxMintFTokenV2(
          wstETHMarket.market,
          holder,
          amountIn,
          wstETHMarket.fToken,
          {
            src: TOKENS.WETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.WETH.address,
              amountIn,
              1048575n + (2n << 20n),
              [
                encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
                encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from stETH", async () => {
        const holder = await ethers.getSigner(STETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.stETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxMintFTokenV2(
          wstETHMarket.market,
          holder,
          amountIn,
          wstETHMarket.fToken,
          {
            src: TOKENS.stETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.stETH.address,
              amountIn,
              1048575n + (1n << 20n),
              [encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add)],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from USDC", async () => {
        const holder = await ethers.getSigner(USDC_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, holder);
        const amountIn = ethers.parseUnits("10000", 6);
        await checkFxMintFTokenV2(
          wstETHMarket.market,
          holder,
          amountIn,
          wstETHMarket.fToken,
          {
            src: TOKENS.USDC.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.USDC.address,
              amountIn,
              1048575n + (3n << 20n),
              [
                encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
                encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
                encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });
    });

    context("fxMintXTokenV2", async () => {
      it("should succeed to mint from ETH", async () => {
        const amountIn = ethers.parseEther("10");
        await checkFxMintXTokenV2(wstETHMarket.market, deployer, amountIn, wstETHMarket.xToken, {
          src: ZeroAddress,
          amount: amountIn,
          target: TOKENS.wstETH.address,
          data: "0x",
          minOut: 0,
        });
      });

      it("should succeed to mint from WETH", async () => {
        const holder = await ethers.getSigner(WETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxMintXTokenV2(
          wstETHMarket.market,
          holder,
          amountIn,
          wstETHMarket.xToken,
          {
            src: TOKENS.WETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.WETH.address,
              amountIn,
              1048575n + (2n << 20n),
              [
                encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
                encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from stETH", async () => {
        const holder = await ethers.getSigner(STETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.stETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxMintXTokenV2(
          wstETHMarket.market,
          holder,
          amountIn,
          wstETHMarket.xToken,
          {
            src: TOKENS.stETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.stETH.address,
              amountIn,
              1048575n + (1n << 20n),
              [encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add)],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from USDC", async () => {
        const holder = await ethers.getSigner(USDC_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, holder);
        const amountIn = ethers.parseUnits("10000", 6);
        await checkFxMintXTokenV2(
          wstETHMarket.market,
          holder,
          amountIn,
          wstETHMarket.xToken,
          {
            src: TOKENS.USDC.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.USDC.address,
              amountIn,
              1048575n + (3n << 20n),
              [
                encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
                encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
                encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });
    });

    context("fxRedeemFTokenV2", async () => {
      it("should succeed when redeem fToken as WETH", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, signer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemFTokenV2(wstETHMarket.market, signer, wstETHMarket.fToken, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
            encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
          ],
        });
      });

      it("should succeed when redeem fToken as stETH", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.stETH.address, signer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemFTokenV2(wstETHMarket.market, signer, wstETHMarket.fToken, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove)],
        });
      });

      it("should succeed when redeem fToken as USDC", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, signer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemFTokenV2(wstETHMarket.market, signer, wstETHMarket.fToken, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
            encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
            encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {
              use_eth: false,
            }),
          ],
        });
      });
    });

    context("fxRedeemXTokenV2", async () => {
      it("should succeed when redeem xToken as WETH", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, signer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemXTokenV2(wstETHMarket.market, signer, wstETHMarket.xToken, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
            encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
          ],
        });
      });

      it("should succeed when redeem xToken as stETH", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.stETH.address, signer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemXTokenV2(wstETHMarket.market, signer, wstETHMarket.xToken, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove)],
        });
      });

      it("should succeed when redeem xToken as USDC", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, signer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemXTokenV2(wstETHMarket.market, signer, wstETHMarket.xToken, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
            encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
            encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {
              use_eth: false,
            }),
          ],
        });
      });
    });

    context("fxSwapV2", async () => {
      it("should succeed when swap fToken to xToken", async () => {
        const amountIn = ethers.parseEther("200");
        await wstETHMarket.fToken.connect(signer).approve(gateway.getAddress(), amountIn);
        const [dstOut, bounsOut] = await gateway
          .connect(signer)
          .fxSwapV2.staticCall(wstETHMarket.market, amountIn, true, 0n);
        console.log("swapped:", ethers.formatEther(dstOut), "bonus:", ethers.formatEther(bounsOut));
        const balanceBefore = await wstETHMarket.xToken.balanceOf(signer.address);
        await gateway.connect(signer).fxSwapV2(wstETHMarket.market, amountIn, true, dstOut - dstOut / 100000n);
        const balanceAfter = await wstETHMarket.xToken.balanceOf(signer.address);
        expect(balanceAfter - balanceBefore).to.closeTo(dstOut, dstOut / 100000n);
      });

      it("should succeed when swap xToken to fToken", async () => {
        const amountIn = ethers.parseEther("200");
        await wstETHMarket.xToken.connect(signer).approve(gateway.getAddress(), amountIn);
        const [dstOut, bounsOut] = await gateway
          .connect(signer)
          .fxSwapV2.staticCall(wstETHMarket.market, amountIn, false, 0n);
        console.log("swapped:", ethers.formatEther(dstOut), "bonus:", ethers.formatEther(bounsOut));
        const balanceBefore = await wstETHMarket.fToken.balanceOf(signer.address);
        await gateway.connect(signer).fxSwapV2(wstETHMarket.market, amountIn, false, dstOut - dstOut / 100000n);
        const balanceAfter = await wstETHMarket.fToken.balanceOf(signer.address);
        expect(balanceAfter - balanceBefore).to.closeTo(dstOut, dstOut / 100000n);
      });
    });

    context("fxMintFxUSD", async () => {
      it("should succeed to mint from ETH", async () => {
        const amountIn = ethers.parseEther("10");
        await checkFxMintFxUSD(wstETHMarket.baseToken, deployer, amountIn, {
          src: ZeroAddress,
          amount: amountIn,
          target: TOKENS.wstETH.address,
          data: "0x",
          minOut: 0,
        });
      });

      it("should succeed to mint from WETH", async () => {
        const holder = await ethers.getSigner(WETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxMintFxUSD(
          wstETHMarket.baseToken,
          holder,
          amountIn,
          {
            src: TOKENS.WETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.WETH.address,
              amountIn,
              1048575n + (2n << 20n),
              [
                encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
                encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from stETH", async () => {
        const holder = await ethers.getSigner(STETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.stETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxMintFxUSD(
          wstETHMarket.baseToken,
          holder,
          amountIn,
          {
            src: TOKENS.stETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.stETH.address,
              amountIn,
              1048575n + (1n << 20n),
              [encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add)],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from USDC", async () => {
        const holder = await ethers.getSigner(USDC_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, holder);
        const amountIn = ethers.parseUnits("10000", 6);
        await checkFxMintFxUSD(
          wstETHMarket.baseToken,
          holder,
          amountIn,
          {
            src: TOKENS.USDC.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.USDC.address,
              amountIn,
              1048575n + (3n << 20n),
              [
                encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
                encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
                encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });
    });

    context("fxMintFxUSDAndEarn", async () => {
      it("should succeed to mint from ETH", async () => {
        const amountIn = ethers.parseEther("10");
        await checkFxMintFxUSDAndEarn(wstETHMarket.pool, deployer, amountIn, {
          src: ZeroAddress,
          amount: amountIn,
          target: TOKENS.wstETH.address,
          data: "0x",
          minOut: 0,
        });
      });

      it("should succeed to mint from WETH", async () => {
        const holder = await ethers.getSigner(WETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxMintFxUSDAndEarn(
          wstETHMarket.pool,
          holder,
          amountIn,
          {
            src: TOKENS.WETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.WETH.address,
              amountIn,
              1048575n + (2n << 20n),
              [
                encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
                encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from stETH", async () => {
        const holder = await ethers.getSigner(STETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.stETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxMintFxUSDAndEarn(
          wstETHMarket.pool,
          holder,
          amountIn,
          {
            src: TOKENS.stETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.stETH.address,
              amountIn,
              1048575n + (1n << 20n),
              [encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add)],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from USDC", async () => {
        const holder = await ethers.getSigner(USDC_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, holder);
        const amountIn = ethers.parseUnits("10000", 6);
        await checkFxMintFxUSDAndEarn(
          wstETHMarket.pool,
          holder,
          amountIn,
          {
            src: TOKENS.USDC.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.USDC.address,
              amountIn,
              1048575n + (3n << 20n),
              [
                encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
                encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
                encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });
    });

    context("fxRebalancePoolWithdraw", async () => {
      it("should succeed", async () => {
        const amountIn = ethers.parseEther("10");
        await wstETHMarket.fToken.connect(signer).approve(wstETHMarket.pool.getAddress(), MaxUint256);
        await wstETHMarket.pool.connect(signer).deposit(amountIn, deployer.address);
        expect(await fxUSD.balanceOf(deployer.address)).to.eq(0);
        await gateway.connect(deployer).fxRebalancePoolWithdraw(wstETHMarket.pool, amountIn);
        expect(await fxUSD.balanceOf(deployer.address)).to.eq(amountIn);
      });
    });

    context("fxRebalancePoolWithdrawAs", async () => {
      beforeEach(async () => {
        const amountIn = ethers.parseEther("200");
        await wstETHMarket.fToken.connect(signer).approve(wstETHMarket.pool.getAddress(), MaxUint256);
        await wstETHMarket.pool.connect(signer).deposit(amountIn, deployer.address);
      });

      it("should succeed when redeem fxUSD as WETH", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, deployer);
        const amountIn = ethers.parseEther("200");
        await checkFxRebalancePoolWithdrawAs(wstETHMarket.pool, deployer, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
            encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
          ],
        });
      });

      it("should succeed when redeem fxUSD as stETH", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.stETH.address, deployer);
        const amountIn = ethers.parseEther("200");
        await checkFxRebalancePoolWithdrawAs(wstETHMarket.pool, deployer, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove)],
        });
      });

      it("should succeed when redeem fxUSD as USDC", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, deployer);
        const amountIn = ethers.parseEther("200");
        await checkFxRebalancePoolWithdrawAs(wstETHMarket.pool, deployer, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
            encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
            encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {
              use_eth: false,
            }),
          ],
        });
      });
    });

    context("fxRedeemFxUSD", async () => {
      beforeEach(async () => {
        const amountIn = ethers.parseEther("200");
        await wstETHMarket.fToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
        await fxUSD.connect(signer).wrap(wstETHMarket.baseToken.getAddress(), amountIn, deployer.address);
      });

      it("should succeed when redeem fxUSD as WETH", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, deployer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemFxUSD(wstETHMarket.baseToken, deployer, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
            encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
          ],
        });
      });

      it("should succeed when redeem fxUSD as stETH", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.stETH.address, deployer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemFxUSD(wstETHMarket.baseToken, deployer, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove)],
        });
      });

      it("should succeed when redeem fxUSD as USDC", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, deployer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemFxUSD(wstETHMarket.baseToken, deployer, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
            encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
            encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {
              use_eth: false,
            }),
          ],
        });
      });
    });
  });

  context("sfrxETH market", async () => {
    context("fxMintFTokenV2", async () => {
      it("should succeed to mint from WETH", async () => {
        const holder = await ethers.getSigner(WETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxMintFTokenV2(
          sfrxETHMarket.market,
          holder,
          amountIn,
          sfrxETHMarket.fToken,
          {
            src: TOKENS.WETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.WETH.address,
              amountIn,
              1048575n + (2n << 20n),
              [
                encodePoolHintV3(
                  ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
                  PoolTypeV3.CurvePlainPool,
                  2,
                  0,
                  1,
                  Action.Swap
                ),
                encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from frxETH", async () => {
        const holder = await ethers.getSigner(FRXETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.frxETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxMintFTokenV2(
          sfrxETHMarket.market,
          holder,
          amountIn,
          sfrxETHMarket.fToken,
          {
            src: TOKENS.frxETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.frxETH.address,
              amountIn,
              1048575n + (1n << 20n),
              [encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add)],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from USDC", async () => {
        const holder = await ethers.getSigner(USDC_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, holder);
        const amountIn = ethers.parseUnits("10000", 6);
        await checkFxMintFTokenV2(
          sfrxETHMarket.market,
          holder,
          amountIn,
          sfrxETHMarket.fToken,
          {
            src: TOKENS.USDC.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.USDC.address,
              amountIn,
              1048575n + (3n << 20n),
              [
                encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
                encodePoolHintV3(
                  ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
                  PoolTypeV3.CurvePlainPool,
                  2,
                  0,
                  1,
                  Action.Swap
                ),
                encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });
    });

    context("fxMintXTokenV2", async () => {
      it("should succeed to mint from WETH", async () => {
        const holder = await ethers.getSigner(WETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxMintXTokenV2(
          sfrxETHMarket.market,
          holder,
          amountIn,
          sfrxETHMarket.xToken,
          {
            src: TOKENS.WETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.WETH.address,
              amountIn,
              1048575n + (2n << 20n),
              [
                encodePoolHintV3(
                  ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
                  PoolTypeV3.CurvePlainPool,
                  2,
                  0,
                  1,
                  Action.Swap
                ),
                encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from frxETH", async () => {
        const holder = await ethers.getSigner(FRXETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.frxETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxMintXTokenV2(
          sfrxETHMarket.market,
          holder,
          amountIn,
          sfrxETHMarket.xToken,
          {
            src: TOKENS.frxETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.frxETH.address,
              amountIn,
              1048575n + (1n << 20n),
              [encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add)],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from USDC", async () => {
        const holder = await ethers.getSigner(USDC_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, holder);
        const amountIn = ethers.parseUnits("10000", 6);
        await checkFxMintXTokenV2(
          sfrxETHMarket.market,
          holder,
          amountIn,
          sfrxETHMarket.xToken,
          {
            src: TOKENS.USDC.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.USDC.address,
              amountIn,
              1048575n + (3n << 20n),
              [
                encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
                encodePoolHintV3(
                  ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
                  PoolTypeV3.CurvePlainPool,
                  2,
                  0,
                  1,
                  Action.Swap
                ),
                encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });
    });

    context("fxRedeemFTokenV2", async () => {
      it("should succeed when redeem fToken as WETH", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, signer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemFTokenV2(sfrxETHMarket.market, signer, sfrxETHMarket.fToken, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
            encodePoolHintV3(
              ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
              PoolTypeV3.CurvePlainPool,
              2,
              1,
              0,
              Action.Swap
            ),
          ],
        });
      });

      it("should succeed when redeem fToken as frxETH", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.frxETH.address, signer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemFTokenV2(sfrxETHMarket.market, signer, sfrxETHMarket.fToken, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove)],
        });
      });

      it("should succeed when redeem fToken as USDC", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, signer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemFTokenV2(sfrxETHMarket.market, signer, sfrxETHMarket.fToken, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
            encodePoolHintV3(
              ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
              PoolTypeV3.CurvePlainPool,
              2,
              1,
              0,
              Action.Swap
            ),
            encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {
              use_eth: false,
            }),
          ],
        });
      });
    });

    context("fxRedeemXTokenV2", async () => {
      it("should succeed when redeem xToken as WETH", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, signer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemXTokenV2(sfrxETHMarket.market, signer, sfrxETHMarket.xToken, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
            encodePoolHintV3(
              ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
              PoolTypeV3.CurvePlainPool,
              2,
              1,
              0,
              Action.Swap
            ),
          ],
        });
      });

      it("should succeed when redeem xToken as frxETH", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.frxETH.address, signer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemXTokenV2(sfrxETHMarket.market, signer, sfrxETHMarket.xToken, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove)],
        });
      });

      it("should succeed when redeem xToken as USDC", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, signer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemXTokenV2(sfrxETHMarket.market, signer, sfrxETHMarket.xToken, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
            encodePoolHintV3(
              ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
              PoolTypeV3.CurvePlainPool,
              2,
              1,
              0,
              Action.Swap
            ),
            encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {
              use_eth: false,
            }),
          ],
        });
      });
    });

    context("fxSwapV2", async () => {
      it("should succeed when swap fToken to xToken", async () => {
        const amountIn = ethers.parseEther("200");
        await sfrxETHMarket.fToken.connect(signer).approve(gateway.getAddress(), amountIn);
        const [dstOut, bounsOut] = await gateway
          .connect(signer)
          .fxSwapV2.staticCall(sfrxETHMarket.market, amountIn, true, 0n);
        console.log("swapped:", ethers.formatEther(dstOut), "bonus:", ethers.formatEther(bounsOut));
        const balanceBefore = await sfrxETHMarket.xToken.balanceOf(signer.address);
        await gateway.connect(signer).fxSwapV2(sfrxETHMarket.market, amountIn, true, dstOut - dstOut / 100000n);
        const balanceAfter = await sfrxETHMarket.xToken.balanceOf(signer.address);
        expect(balanceAfter - balanceBefore).to.closeTo(dstOut, dstOut / 100000n);
      });

      it("should succeed when swap xToken to fToken", async () => {
        const amountIn = ethers.parseEther("200");
        await sfrxETHMarket.xToken.connect(signer).approve(gateway.getAddress(), amountIn);
        const [dstOut, bounsOut] = await gateway
          .connect(signer)
          .fxSwapV2.staticCall(sfrxETHMarket.market, amountIn, false, 0n);
        console.log("swapped:", ethers.formatEther(dstOut), "bonus:", ethers.formatEther(bounsOut));
        const balanceBefore = await sfrxETHMarket.fToken.balanceOf(signer.address);
        await gateway.connect(signer).fxSwapV2(sfrxETHMarket.market, amountIn, false, dstOut - dstOut / 100000n);
        const balanceAfter = await sfrxETHMarket.fToken.balanceOf(signer.address);
        expect(balanceAfter - balanceBefore).to.closeTo(dstOut, dstOut / 100000n);
      });
    });

    context("fxMintFxUSD", async () => {
      it("should succeed to mint from WETH", async () => {
        const holder = await ethers.getSigner(WETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxMintFxUSD(
          sfrxETHMarket.baseToken,
          holder,
          amountIn,
          {
            src: TOKENS.WETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.WETH.address,
              amountIn,
              1048575n + (2n << 20n),
              [
                encodePoolHintV3(
                  ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
                  PoolTypeV3.CurvePlainPool,
                  2,
                  0,
                  1,
                  Action.Swap
                ),
                encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from frxETH", async () => {
        const holder = await ethers.getSigner(FRXETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.frxETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxMintFxUSD(
          sfrxETHMarket.baseToken,
          holder,
          amountIn,
          {
            src: TOKENS.frxETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.frxETH.address,
              amountIn,
              1048575n + (1n << 20n),
              [encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add)],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from USDC", async () => {
        const holder = await ethers.getSigner(USDC_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, holder);
        const amountIn = ethers.parseUnits("10000", 6);
        await checkFxMintFxUSD(
          sfrxETHMarket.baseToken,
          holder,
          amountIn,
          {
            src: TOKENS.USDC.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.USDC.address,
              amountIn,
              1048575n + (3n << 20n),
              [
                encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
                encodePoolHintV3(
                  ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
                  PoolTypeV3.CurvePlainPool,
                  2,
                  0,
                  1,
                  Action.Swap
                ),
                encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });
    });

    context("fxMintFxUSDAndEarn", async () => {
      it("should succeed to mint from WETH", async () => {
        const holder = await ethers.getSigner(WETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxMintFxUSDAndEarn(
          sfrxETHMarket.pool,
          holder,
          amountIn,
          {
            src: TOKENS.WETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.WETH.address,
              amountIn,
              1048575n + (2n << 20n),
              [
                encodePoolHintV3(
                  ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
                  PoolTypeV3.CurvePlainPool,
                  2,
                  0,
                  1,
                  Action.Swap
                ),
                encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from frxETH", async () => {
        const holder = await ethers.getSigner(FRXETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.frxETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxMintFxUSDAndEarn(
          sfrxETHMarket.pool,
          holder,
          amountIn,
          {
            src: TOKENS.frxETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.frxETH.address,
              amountIn,
              1048575n + (1n << 20n),
              [encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add)],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from USDC", async () => {
        const holder = await ethers.getSigner(USDC_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, holder);
        const amountIn = ethers.parseUnits("10000", 6);
        await checkFxMintFxUSDAndEarn(
          sfrxETHMarket.pool,
          holder,
          amountIn,
          {
            src: TOKENS.USDC.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.USDC.address,
              amountIn,
              1048575n + (3n << 20n),
              [
                encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
                encodePoolHintV3(
                  ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
                  PoolTypeV3.CurvePlainPool,
                  2,
                  0,
                  1,
                  Action.Swap
                ),
                encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });
    });

    context("fxRebalancePoolWithdraw", async () => {
      it("should succeed", async () => {
        const amountIn = ethers.parseEther("10");
        await sfrxETHMarket.fToken.connect(signer).approve(sfrxETHMarket.pool.getAddress(), MaxUint256);
        await sfrxETHMarket.pool.connect(signer).deposit(amountIn, deployer.address);
        expect(await fxUSD.balanceOf(deployer.address)).to.eq(0);
        await gateway.connect(deployer).fxRebalancePoolWithdraw(sfrxETHMarket.pool, amountIn);
        expect(await fxUSD.balanceOf(deployer.address)).to.eq(amountIn);
      });
    });

    context("fxRebalancePoolWithdrawAs", async () => {
      beforeEach(async () => {
        const amountIn = ethers.parseEther("200");
        await sfrxETHMarket.fToken.connect(signer).approve(sfrxETHMarket.pool.getAddress(), MaxUint256);
        await sfrxETHMarket.pool.connect(signer).deposit(amountIn, deployer.address);
      });

      it("should succeed when redeem fxUSD as WETH", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, deployer);
        const amountIn = ethers.parseEther("200");
        await checkFxRebalancePoolWithdrawAs(sfrxETHMarket.pool, deployer, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
            encodePoolHintV3(
              ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
              PoolTypeV3.CurvePlainPool,
              2,
              1,
              0,
              Action.Swap
            ),
          ],
        });
      });

      it("should succeed when redeem fxUSD as frxETH", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.frxETH.address, deployer);
        const amountIn = ethers.parseEther("200");
        await checkFxRebalancePoolWithdrawAs(sfrxETHMarket.pool, deployer, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove)],
        });
      });

      it("should succeed when redeem fxUSD as USDC", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, deployer);
        const amountIn = ethers.parseEther("200");
        await checkFxRebalancePoolWithdrawAs(sfrxETHMarket.pool, deployer, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
            encodePoolHintV3(
              ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
              PoolTypeV3.CurvePlainPool,
              2,
              1,
              0,
              Action.Swap
            ),
            encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {
              use_eth: false,
            }),
          ],
        });
      });
    });

    context("fxRedeemFxUSD", async () => {
      beforeEach(async () => {
        const amountIn = ethers.parseEther("200");
        await sfrxETHMarket.fToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
        await fxUSD.connect(signer).wrap(sfrxETHMarket.baseToken.getAddress(), amountIn, deployer.address);
      });

      it("should succeed when redeem fxUSD as WETH", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, deployer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemFxUSD(sfrxETHMarket.baseToken, deployer, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
            encodePoolHintV3(
              ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
              PoolTypeV3.CurvePlainPool,
              2,
              1,
              0,
              Action.Swap
            ),
          ],
        });
      });

      it("should succeed when redeem fxUSD as frxETH", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.frxETH.address, deployer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemFxUSD(sfrxETHMarket.baseToken, deployer, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove)],
        });
      });

      it("should succeed when redeem fxUSD as USDC", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, deployer);
        const amountIn = ethers.parseEther("200");
        await checkFxRedeemFxUSD(sfrxETHMarket.baseToken, deployer, amountIn, tokenOut, {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
            encodePoolHintV3(
              ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
              PoolTypeV3.CurvePlainPool,
              2,
              1,
              0,
              Action.Swap
            ),
            encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {
              use_eth: false,
            }),
          ],
        });
      });
    });
  });

  context("fxAutoRedeemFxUSD", async () => {
    beforeEach(async () => {
      const amountIn = ethers.parseEther("100");
      await sfrxETHMarket.fToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
      await wstETHMarket.fToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
      await fxUSD.connect(signer).wrap(sfrxETHMarket.baseToken.getAddress(), amountIn, deployer.address);
      await fxUSD.connect(signer).wrap(wstETHMarket.baseToken.getAddress(), amountIn * 2n, deployer.address);
    });

    it("should succeed all swap to WETH", async () => {
      const amountIn = ethers.parseEther("300");
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, signer);
      await fxUSD.connect(deployer).approve(gateway.getAddress(), amountIn);
      const params = [
        {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
            encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
          ],
        },
        {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
            encodePoolHintV3(
              ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
              PoolTypeV3.CurvePlainPool,
              2,
              1,
              0,
              Action.Swap
            ),
          ],
        },
      ];
      const [baseOuts, bonusOuts, dstOut] = await gateway
        .connect(deployer)
        .fxAutoRedeemFxUSD.staticCall(params, amountIn, [0n, 0n]);
      console.log("wstETH:", ethers.formatEther(baseOuts[0]));
      console.log("sfrxETH:", ethers.formatEther(baseOuts[1]));
      expect(bonusOuts[0]).to.eq(0n);
      expect(bonusOuts[1]).to.eq(0n);
      expect(await fxUSD.balanceOf(deployer.address)).to.eq(amountIn);
      await gateway.connect(deployer).fxAutoRedeemFxUSD(params, amountIn, [0n, 0n]);
      expect(await fxUSD.balanceOf(deployer.address)).to.eq(0n);
      expect(await tokenOut.balanceOf(deployer.address)).to.closeTo(dstOut, dstOut / 100000n);
    });

    it("should succeed all swap to USDC", async () => {
      const amountIn = ethers.parseEther("300");
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, signer);
      await fxUSD.connect(deployer).approve(gateway.getAddress(), amountIn);
      const params = [
        {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
            encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
            encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {
              use_eth: false,
            }),
          ],
        },
        {
          converter: await outputConverter.getAddress(),
          minOut: 0n,
          routes: [
            encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
            encodePoolHintV3(
              ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
              PoolTypeV3.CurvePlainPool,
              2,
              1,
              0,
              Action.Swap
            ),
            encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {
              use_eth: false,
            }),
          ],
        },
      ];
      const [baseOuts, bonusOuts, dstOut] = await gateway
        .connect(deployer)
        .fxAutoRedeemFxUSD.staticCall(params, amountIn, [0n, 0n]);
      console.log("wstETH:", ethers.formatEther(baseOuts[0]));
      console.log("sfrxETH:", ethers.formatEther(baseOuts[1]));
      expect(bonusOuts[0]).to.eq(0n);
      expect(bonusOuts[1]).to.eq(0n);
      expect(await fxUSD.balanceOf(deployer.address)).to.eq(amountIn);
      await gateway.connect(deployer).fxAutoRedeemFxUSD(params, amountIn, [0n, 0n]);
      expect(await fxUSD.balanceOf(deployer.address)).to.eq(0n);
      expect(await tokenOut.balanceOf(deployer.address)).to.closeTo(dstOut, dstOut / 100000n);
    });
  });

  context("fxBaseTokenSwap", async () => {
    beforeEach(async () => {
      const amountIn = ethers.parseEther("500");
      await sfrxETHMarket.fToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
      await wstETHMarket.fToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
      await fxUSD.connect(signer).wrap(sfrxETHMarket.baseToken.getAddress(), amountIn, deployer.address);
      await fxUSD.connect(signer).wrap(wstETHMarket.baseToken.getAddress(), amountIn * 2n, deployer.address);
    });

    it("should succeed swap from wstETH => sfrxETH", async () => {
      const holder = await ethers.getSigner(WSTETH_HOLDER);
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.wstETH.address, holder);
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.sfrxETH.address, holder);
      const amountIn = ethers.parseEther("0.01");
      await tokenIn.approve(gateway.getAddress(), amountIn);

      const [expected, bonus] = await gateway
        .connect(holder)
        .fxBaseTokenSwap.staticCall(
          wstETHMarket.baseToken.getAddress(),
          amountIn,
          sfrxETHMarket.baseToken.getAddress(),
          0n
        );
      console.log("swapped:", ethers.formatEther(expected), "bonus:", ethers.formatEther(bonus));
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway
        .connect(holder)
        .fxBaseTokenSwap(
          wstETHMarket.baseToken.getAddress(),
          amountIn,
          sfrxETHMarket.baseToken.getAddress(),
          expected - expected / 100000n
        );
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 100000n);
    });

    it("should succeed swap from sfrxETH => wstETH", async () => {
      const holder = await ethers.getSigner(SFRXETH_HOLDER);
      const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.sfrxETH.address, holder);
      const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.wstETH.address, holder);
      const amountIn = ethers.parseEther("0.01");
      await tokenIn.approve(gateway.getAddress(), amountIn);

      const [expected, bonus] = await gateway
        .connect(holder)
        .fxBaseTokenSwap.staticCall(
          sfrxETHMarket.baseToken.getAddress(),
          amountIn,
          wstETHMarket.baseToken.getAddress(),
          0n
        );
      console.log("swapped:", ethers.formatEther(expected), "bonus:", ethers.formatEther(bonus));
      const balanceBefore = await tokenOut.balanceOf(holder.address);
      await gateway
        .connect(holder)
        .fxBaseTokenSwap(
          sfrxETHMarket.baseToken.getAddress(),
          amountIn,
          wstETHMarket.baseToken.getAddress(),
          expected - expected / 100000n
        );
      const balanceAfter = await tokenOut.balanceOf(holder.address);
      expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 100000n);
    });
  });

  const checkFxInitialFundDeposit = async (
    fund: FxInitialFund,
    holder: HardhatEthersSigner,
    amountIn: bigint,
    tokenOut: MockERC20,
    params: LibGatewayRouter.ConvertInParamsStruct,
    tokenIn?: MockERC20
  ) => {
    if (tokenIn) {
      await tokenIn.connect(holder).approve(gateway.getAddress(), amountIn);
    }
    const expected = await gateway.connect(holder).fxInitialFundDeposit.staticCall(params, fund.getAddress(), {
      value: tokenIn ? 0n : amountIn,
    });
    console.log("base swapped:", ethers.formatEther(expected));
    params.minOut = expected - expected / 100000n;
    const balanceBefore = await fund.shares(holder.address);
    await gateway.connect(holder).fxInitialFundDeposit(params, fund.getAddress(), { value: tokenIn ? 0n : amountIn });
    const balanceAfter = await fund.shares(holder.address);
    expect(balanceAfter - balanceBefore).to.closeTo(expected, expected / 100000n);
  };

  context("fxInitialFundDeposit", async () => {
    let fund: FxInitialFund;

    context("wstETH market", async () => {
      beforeEach(async () => {
        const FxInitialFund = await ethers.getContractFactory("FxInitialFund", deployer);
        fund = await FxInitialFund.deploy(wstETHMarket.market.getAddress(), fxUSD.getAddress());
      });

      it("should succeed to mint from ETH", async () => {
        const amountIn = ethers.parseEther("10");
        await checkFxInitialFundDeposit(fund, deployer, amountIn, wstETHMarket.fToken, {
          src: ZeroAddress,
          amount: amountIn,
          target: TOKENS.wstETH.address,
          data: "0x",
          minOut: 0,
        });
      });

      it("should succeed to mint from WETH", async () => {
        const holder = await ethers.getSigner(WETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxInitialFundDeposit(
          fund,
          holder,
          amountIn,
          wstETHMarket.fToken,
          {
            src: TOKENS.WETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.WETH.address,
              amountIn,
              1048575n + (2n << 20n),
              [
                encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
                encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from stETH", async () => {
        const holder = await ethers.getSigner(STETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.stETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxInitialFundDeposit(
          fund,
          holder,
          amountIn,
          wstETHMarket.fToken,
          {
            src: TOKENS.stETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.stETH.address,
              amountIn,
              1048575n + (1n << 20n),
              [encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add)],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from USDC", async () => {
        const holder = await ethers.getSigner(USDC_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, holder);
        const amountIn = ethers.parseUnits("10000", 6);
        await checkFxInitialFundDeposit(
          fund,
          holder,
          amountIn,
          wstETHMarket.fToken,
          {
            src: TOKENS.USDC.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.USDC.address,
              amountIn,
              1048575n + (3n << 20n),
              [
                encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
                encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
                encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });
    });

    context("sfrxETH market", async () => {
      beforeEach(async () => {
        const FxInitialFund = await ethers.getContractFactory("FxInitialFund", deployer);
        fund = await FxInitialFund.deploy(sfrxETHMarket.market.getAddress(), fxUSD.getAddress());
      });

      it("should succeed to mint from WETH", async () => {
        const holder = await ethers.getSigner(WETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.WETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxInitialFundDeposit(
          fund,
          holder,
          amountIn,
          sfrxETHMarket.fToken,
          {
            src: TOKENS.WETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.WETH.address,
              amountIn,
              1048575n + (2n << 20n),
              [
                encodePoolHintV3(
                  ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
                  PoolTypeV3.CurvePlainPool,
                  2,
                  0,
                  1,
                  Action.Swap
                ),
                encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from frxETH", async () => {
        const holder = await ethers.getSigner(FRXETH_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.frxETH.address, holder);
        const amountIn = ethers.parseEther("10");
        await checkFxInitialFundDeposit(
          fund,
          holder,
          amountIn,
          sfrxETHMarket.fToken,
          {
            src: TOKENS.frxETH.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.frxETH.address,
              amountIn,
              1048575n + (1n << 20n),
              [encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add)],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });

      it("should succeed to mint from USDC", async () => {
        const holder = await ethers.getSigner(USDC_HOLDER);
        await mockETHBalance(holder.address, ethers.parseEther("100"));
        const tokenIn = await ethers.getContractAt("MockERC20", TOKENS.USDC.address, holder);
        const amountIn = ethers.parseUnits("10000", 6);
        await checkFxInitialFundDeposit(
          fund,
          holder,
          amountIn,
          sfrxETHMarket.fToken,
          {
            src: TOKENS.USDC.address,
            amount: amountIn,
            target: await inputConverter.getAddress(),
            data: inputConverter.interface.encodeFunctionData("convert", [
              TOKENS.USDC.address,
              amountIn,
              1048575n + (3n << 20n),
              [
                encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
                encodePoolHintV3(
                  ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
                  PoolTypeV3.CurvePlainPool,
                  2,
                  0,
                  1,
                  Action.Swap
                ),
                encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
              ],
            ]),
            minOut: 0,
          },
          tokenIn
        );
      });
    });
  });
});

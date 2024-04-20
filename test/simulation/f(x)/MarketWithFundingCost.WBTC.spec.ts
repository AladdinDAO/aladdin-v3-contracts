/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress, id } from "ethers";
import { ethers } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import {
  TokenConvertManagementFacet,
  MultiPathConverter,
  GeneralTokenConverter,
  FxUSDFacet,
  MockERC20,
  FractionalTokenV2,
  LeveragedTokenV2,
  MarketWithFundingCost,
  TreasuryWithFundingCost,
  FxWBTCTwapOracle,
} from "@/types/index";
import { TOKENS, CONVERTER_ROUTRS } from "@/utils/index";

import { simulateMintFTokenV2, simulateMintXTokenV2, simulateRedeemFTokenV2, simulateRedeemXTokenV2 } from "./helpers";

const FORK_BLOCK_NUMBER = 19595270;

const MANAGER = "0x28c921adAC4c1072658eB01a28DA06b5F651eF62";
const ADMIN = "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF";

const TokenHolder: { [symbol: string]: { holder: string; amount: bigint } } = {
  WBTC: { holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28", amount: ethers.parseUnits("1", 8) },
  WETH: { holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28", amount: ethers.parseEther("10") },
  USDC: { holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28", amount: ethers.parseUnits("20000", 6) },
  USDT: { holder: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28", amount: ethers.parseUnits("20000", 6) },
};

describe("MarketWithFundingCost.WBTC.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let manage: TokenConvertManagementFacet;
  let gateway: FxUSDFacet;
  let inputConverter: MultiPathConverter;
  let outputConverter: GeneralTokenConverter;

  let baseToken: MockERC20;
  let fToken: FractionalTokenV2;
  let xToken: LeveragedTokenV2;
  let market: MarketWithFundingCost;
  let treasury: TreasuryWithFundingCost;
  let oracle: FxWBTCTwapOracle;

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
    await mockETHBalance(deployer.address, ethers.parseEther("100"));
    await mockETHBalance(admin.address, ethers.parseEther("100"));
    await mockETHBalance(manager.address, ethers.parseEther("100"));

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
    await manage.connect(manager).approveTarget(inputConverter.getAddress(), ZeroAddress);

    // deploy market
    const FxChainlinkTwapOracle = await ethers.getContractFactory("FxChainlinkTwapOracle", deployer);
    const BTCUSDOracle = await FxChainlinkTwapOracle.deploy(
      30 * 60,
      "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
      1,
      3600,
      "BTC/USD"
    );
    const WBTCBTCOracle = await FxChainlinkTwapOracle.deploy(
      30 * 60,
      "0xfdFD9C85aD200c506Cf9e21F1FD8dd01932FBB23",
      1,
      86400,
      "WBTC/BTC"
    );
    const FxWBTCTwapOracle = await ethers.getContractFactory("FxWBTCTwapOracle", deployer);
    oracle = await FxWBTCTwapOracle.deploy(
      "0x9db9e0e53058c89e5b94e29621a205198648425b",
      BTCUSDOracle.getAddress(),
      WBTCBTCOracle.getAddress()
    );

    const RebalancePoolSplitter = await ethers.getContractFactory("RebalancePoolSplitter", deployer);
    const splitter = await RebalancePoolSplitter.deploy();

    baseToken = await ethers.getContractAt("MockERC20", TOKENS.WBTC.address, deployer);
    const EmptyContract = await ethers.getContractFactory("EmptyContract", deployer);
    const placeholder = await EmptyContract.deploy();
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const treasuryProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    treasury = await ethers.getContractAt("TreasuryWithFundingCost", await treasuryProxy.getAddress(), deployer);
    const marketProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    market = await ethers.getContractAt("MarketWithFundingCost", await marketProxy.getAddress(), deployer);
    const fTokenProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    fToken = await ethers.getContractAt("FractionalTokenV2", await fTokenProxy.getAddress(), deployer);
    const xTokenProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    xToken = await ethers.getContractAt("LeveragedTokenV2", await xTokenProxy.getAddress(), deployer);

    const TreasuryWithFundingCost = await ethers.getContractFactory("TreasuryWithFundingCost", deployer);
    const treasuryImpl = await TreasuryWithFundingCost.deploy(
      baseToken.getAddress(),
      fToken.getAddress(),
      xToken.getAddress()
    );
    await treasuryProxy.connect(admin).upgradeTo(treasuryImpl.getAddress());

    const MarketWithFundingCost = await ethers.getContractFactory("MarketWithFundingCost", deployer);
    const marketImpl = await MarketWithFundingCost.deploy(treasuryProxy.getAddress());
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

    await fToken.initialize("Fractional WBTC", "fWBTC");
    await xToken.initialize("Leveraged WBTC", "xWBTC");
    await treasury.initialize(
      ADMIN,
      splitter.getAddress(),
      oracle.getAddress(),
      ethers.parseEther("10000"),
      60,
      "0xE0438Eb3703bF871E31Ce639bd351109c88666ea"
    );
    await market.initialize(ADMIN, reservePool.getAddress(), registry.getAddress());
    await treasury.grantRole(id("FX_MARKET_ROLE"), market.getAddress());
    await reservePool.grantRole(id("MARKET_ROLE"), market.getAddress());

    signer = await ethers.getSigner(TokenHolder.WBTC.holder);
    await mockETHBalance(signer.address, ethers.parseEther("100"));
    await baseToken.connect(signer).transfer(treasury.getAddress(), TokenHolder.WBTC.amount * 100n);
    await treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), signer.address);
    await treasury.connect(signer).initializeProtocol(TokenHolder.WBTC.amount * 100n * 10n ** 10n);
    await market.updateStabilityRatio(ethers.parseEther("1.3"));
  });

  context("mint fToken", async () => {
    it("should succeed when mint from WBTC", async () => {
      const amountIn = TokenHolder.WBTC.amount;
      signer = await ethers.getSigner(TokenHolder.WBTC.holder);
      await mockETHBalance(signer.address, ethers.parseEther("1000"));
      const token = await ethers.getContractAt("MockERC20", TOKENS.WBTC.address, signer);
      await token.approve(market.getAddress(), amountIn);

      const minted = await market.connect(signer).mintFToken.staticCall(amountIn, signer.address, 0n);
      console.log("mint fWBTC from WBTC:", ethers.formatEther(minted));
      const before = await fToken.balanceOf(signer.address);
      await market.connect(signer).mintFToken(amountIn, signer.address, (minted * 9999n) / 10000n);
      const after = await fToken.balanceOf(signer.address);
      expect(after - before).to.closeTo(minted, minted / 10000n);
    });

    for (const symbol of ["WETH", "USDC", "USDT"]) {
      it(`should succeed when mint from ${symbol}`, async () => {
        await simulateMintFTokenV2(
          gateway,
          inputConverter,
          market,
          fToken,
          TokenHolder[symbol].holder,
          symbol,
          TokenHolder[symbol].amount,
          CONVERTER_ROUTRS[symbol === "ETH" ? "WETH" : symbol].WBTC
        );
      });
    }
  });

  context("mint xToken", async () => {
    it("should succeed when mint from WBTC", async () => {
      const amountIn = TokenHolder.WBTC.amount;
      signer = await ethers.getSigner(TokenHolder.WBTC.holder);
      await mockETHBalance(signer.address, ethers.parseEther("1000"));
      const token = await ethers.getContractAt("MockERC20", TOKENS.WBTC.address, signer);
      await token.approve(market.getAddress(), amountIn);

      const [minted] = await market.connect(signer).mintXToken.staticCall(amountIn, signer.address, 0n);
      console.log("mint xWBTC from WBTC:", ethers.formatEther(minted));
      const before = await xToken.balanceOf(signer.address);
      await market.connect(signer).mintXToken(amountIn, signer.address, (minted * 9999n) / 10000n);
      const after = await xToken.balanceOf(signer.address);
      expect(after - before).to.closeTo(minted, minted / 10000n);
    });

    for (const symbol of ["WETH", "USDC", "USDT"]) {
      it(`should succeed when mint from ${symbol}`, async () => {
        await simulateMintXTokenV2(
          gateway,
          inputConverter,
          market,
          xToken,
          TokenHolder[symbol].holder,
          symbol,
          TokenHolder[symbol].amount,
          CONVERTER_ROUTRS[symbol === "ETH" ? "WETH" : symbol].WBTC
        );
      });
    }
  });

  context("redeem fToken", async () => {
    it("should succeed when redeem as WBTC", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(TokenHolder.WBTC.holder);
      const token = await ethers.getContractAt("MockERC20", TOKENS.WBTC.address, signer);
      const [redeemed] = await market.connect(signer).redeemFToken.staticCall(amountIn, signer.address, 0n);
      console.log("redeem fToken as WBTC:", ethers.formatUnits(redeemed, 8));
      const before = await token.balanceOf(signer.address);
      await market.connect(signer).redeemFToken(amountIn, signer.address, (redeemed * 9999n) / 10000n);
      const after = await token.balanceOf(signer.address);
      expect(after - before).to.closeTo(redeemed, redeemed / 10000n);
    });

    for (const symbol of ["WETH", "USDC", "USDT"]) {
      it(`should succeed when redeem as ${symbol}`, async () => {
        await simulateRedeemFTokenV2(
          gateway,
          outputConverter,
          market,
          fToken,
          TokenHolder.WBTC.holder,
          symbol,
          ethers.parseEther("10"),
          CONVERTER_ROUTRS.WBTC[symbol]
        );
      });
    }
  });

  context("redeem xToken", async () => {
    it("should succeed when redeem as WBTC", async () => {
      const amountIn = ethers.parseEther("10");
      signer = await ethers.getSigner(TokenHolder.WBTC.holder);
      const token = await ethers.getContractAt("MockERC20", TOKENS.WBTC.address, signer);
      const redeemed = await market.connect(signer).redeemXToken.staticCall(amountIn, signer.address, 0n);
      console.log("redeem xToken as WBTC:", ethers.formatUnits(redeemed, 8));
      const before = await token.balanceOf(signer.address);
      await market.connect(signer).redeemXToken(amountIn, signer.address, (redeemed * 9999n) / 10000n);
      const after = await token.balanceOf(signer.address);
      expect(after - before).to.closeTo(redeemed, redeemed / 10000n);
    });

    for (const symbol of ["WETH", "USDC", "USDT"]) {
      it(`should succeed when redeem as ${symbol}`, async () => {
        await simulateRedeemXTokenV2(
          gateway,
          outputConverter,
          market,
          xToken,
          TokenHolder.WBTC.holder,
          symbol,
          ethers.parseEther("10"),
          CONVERTER_ROUTRS.WBTC[symbol]
        );
      });
    }
  });
});

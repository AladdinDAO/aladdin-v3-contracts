import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { MaxUint256, ZeroAddress, ZeroHash, id } from "ethers";
import { ethers, network } from "hardhat";

import {
  FractionalTokenV2,
  MockTwapOracle,
  MockFxRateProvider,
  WrappedTokenTreasuryV2,
  MockERC20,
  LeveragedTokenV2,
  RebalancePoolSplitter,
  MarketV2,
  ReservePool,
  RebalancePoolRegistry,
  FxUSD,
  ShareableRebalancePool,
  GovernanceToken,
  VotingEscrow,
  VotingEscrowHelper,
  GaugeController,
  TokenMinter,
} from "@/types/index";

const PRECISION = ethers.parseEther("1");

interface FxMarket {
  baseToken: MockERC20;
  fToken: FractionalTokenV2;
  xToken: LeveragedTokenV2;
  market: MarketV2;
  reservePool: ReservePool;
  registry: RebalancePoolRegistry;
  treasury: WrappedTokenTreasuryV2;
  rateProvider: MockFxRateProvider;
  oracle: MockTwapOracle;
  splitter: RebalancePoolSplitter;
  pool: ShareableRebalancePool;
}

describe("FxUSD.spec", async () => {
  let deployer: HardhatEthersSigner;
  let platform: HardhatEthersSigner;
  let signer: HardhatEthersSigner;
  let admin: HardhatEthersSigner;

  let fxn: GovernanceToken;
  let ve: VotingEscrow;
  let helper: VotingEscrowHelper;
  let controller: GaugeController;
  let minter: TokenMinter;

  let m1: FxMarket;
  let m2: FxMarket;
  let fxUSD: FxUSD;

  const deployFxMarket = async (): Promise<FxMarket> => {
    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    const baseToken = await MockERC20.deploy("x", "x", 18);

    const MockFxRateProvider = await ethers.getContractFactory("MockFxRateProvider", deployer);
    const rateProvider = await MockFxRateProvider.deploy();
    await rateProvider.setRate(ethers.parseEther("1"));

    const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
    const oracle = await MockTwapOracle.deploy();

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

    const ReservePool = await ethers.getContractFactory("ReservePool", deployer);
    const reservePool = await ReservePool.deploy(market.getAddress(), fToken.getAddress());

    const RebalancePoolRegistry = await ethers.getContractFactory("RebalancePoolRegistry", deployer);
    const registry = await RebalancePoolRegistry.deploy();

    await fToken.initialize("Fractional ETH", "fETH");
    await xToken.initialize("Leveraged ETH", "xETH");
    await treasury.initialize(
      platform.address,
      splitter.getAddress(),
      rateProvider.getAddress(),
      oracle.getAddress(),
      ethers.parseEther("10000"),
      60
    );
    await market.initialize(platform.address, reservePool.getAddress(), registry.getAddress());
    await treasury.grantRole(id("FX_MARKET_ROLE"), market.getAddress());

    await oracle.setPrice(ethers.parseEther("2000"));
    await oracle.setIsValid(true);
    await rateProvider.setRate(ethers.parseEther("1.0"));
    await baseToken.mint(treasury.getAddress(), ethers.parseEther("1"));
    await treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), signer.address);
    await treasury.connect(signer).initializeProtocol(ethers.parseEther("1"));
    await market.updateStabilityRatio(ethers.parseEther("1.3"));

    const ShareableRebalancePool = await ethers.getContractFactory("ShareableRebalancePool", deployer);
    const pool = await ShareableRebalancePool.deploy(
      fxn.getAddress(),
      ve.getAddress(),
      helper.getAddress(),
      minter.getAddress()
    );
    await pool.initialize(treasury.getAddress(), market.getAddress(), ZeroAddress);

    return {
      baseToken,
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
    [deployer, signer, admin, platform] = await ethers.getSigners();

    const GovernanceToken = await ethers.getContractFactory("GovernanceToken", deployer);
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow", deployer);
    const GaugeController = await ethers.getContractFactory("GaugeController", deployer);
    const TokenMinter = await ethers.getContractFactory("TokenMinter", deployer);

    fxn = await GovernanceToken.deploy();
    ve = await VotingEscrow.deploy();
    controller = await GaugeController.deploy();
    minter = await TokenMinter.deploy();

    await fxn.initialize(
      ethers.parseEther("1020000"), // initial supply
      ethers.parseEther("98000") / (86400n * 365n), // initial rate, 10%,
      1111111111111111111n, // rate reduction coefficient, 1/0.9 * 1e18,
      deployer.address,
      "Governance Token",
      "GOV"
    );
    await ve.initialize(deployer.address, fxn.getAddress(), "Voting Escrow GOV", "veGOV", "1.0");
    await controller.initialize(deployer.address, fxn.getAddress(), ve.getAddress());
    await minter.initialize(fxn.getAddress(), controller.getAddress());
    await fxn.set_minter(minter.getAddress());
    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400]);
    await fxn.update_mining_parameters();

    const VotingEscrowHelper = await ethers.getContractFactory("VotingEscrowHelper", deployer);
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 14]);
    helper = await VotingEscrowHelper.deploy(ve.getAddress());

    // create lock
    await fxn.approve(ve.getAddress(), MaxUint256);
    await ve.create_lock(ethers.parseEther("1"), timestamp + 86400 * 365);

    m1 = await deployFxMarket();

    const FxUSD = await ethers.getContractFactory("FxUSD", deployer);
    fxUSD = await FxUSD.deploy();
    await fxUSD.initialize("f(x) USD", "fxUSD");
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      expect(await fxUSD.name()).to.eq("f(x) USD");
      expect(await fxUSD.symbol()).to.eq("fxUSD");
      expect(await fxUSD.nav()).to.eq(PRECISION);
      expect(await fxUSD.getMarkets()).to.deep.eq([]);
      expect(await fxUSD.isUnderCollateral()).to.deep.eq(false);

      await expect(fxUSD.initialize("", "")).to.revertedWith("Initializable: contract is already initialized");
    });
  });

  context("auth", async () => {
    context("#addMarket", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(fxUSD.connect(signer).addMarket(ZeroAddress, 0n)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert when add twice", async () => {
        await fxUSD.addMarket(m1.market.getAddress(), 0n);
        await expect(fxUSD.addMarket(m1.market.getAddress(), 0n)).to.revertedWithCustomError(
          fxUSD,
          "ErrorMarketAlreadySupported"
        );
      });

      it("should succeed", async () => {
        await expect(fxUSD.addMarket(m1.market.getAddress(), 1n))
          .to.emit(fxUSD, "AddMarket")
          .withArgs(await m1.baseToken.getAddress(), 1n);
        expect(await fxUSD.getMarkets()).to.deep.eq([await m1.baseToken.getAddress()]);
        expect(await fxUSD.markets(m1.baseToken.getAddress())).to.deep.eq([
          await m1.fToken.getAddress(),
          await m1.treasury.getAddress(),
          await m1.market.getAddress(),
          1n,
          0,
        ]);

        m2 = await deployFxMarket();
        await expect(fxUSD.addMarket(m2.market.getAddress(), 2n))
          .to.emit(fxUSD, "AddMarket")
          .withArgs(await m2.baseToken.getAddress(), 2n);
        expect(await fxUSD.getMarkets()).to.deep.eq([await m1.baseToken.getAddress(), await m2.baseToken.getAddress()]);
        expect(await fxUSD.markets(m2.baseToken.getAddress())).to.deep.eq([
          await m2.fToken.getAddress(),
          await m2.treasury.getAddress(),
          await m2.market.getAddress(),
          2n,
          0,
        ]);
      });
    });

    context("#addRebalancePools", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(fxUSD.connect(signer).addRebalancePools([ZeroAddress])).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert when no base token", async () => {
        await expect(fxUSD.addRebalancePools([await m1.pool.getAddress()])).to.revertedWithCustomError(
          fxUSD,
          "ErrorUnsupportedMarket"
        );
      });

      it("should succeed", async () => {
        await fxUSD.addMarket(m1.market.getAddress(), 1n);
        await expect(fxUSD.addRebalancePools([await m1.pool.getAddress()]))
          .to.emit(fxUSD, "AddRebalancePool")
          .withArgs(await m1.baseToken.getAddress(), await m1.pool.getAddress());
        expect(await fxUSD.getRebalancePools()).to.deep.eq([await m1.pool.getAddress()]);
        await expect(fxUSD.addRebalancePools([await m1.pool.getAddress()])).to.not.emit(fxUSD, "AddRebalancePool");
        expect(await fxUSD.getRebalancePools()).to.deep.eq([await m1.pool.getAddress()]);

        m2 = await deployFxMarket();
        await fxUSD.addMarket(m2.market.getAddress(), 1n);
        await expect(fxUSD.addRebalancePools([await m2.pool.getAddress()]))
          .to.emit(fxUSD, "AddRebalancePool")
          .withArgs(await m2.baseToken.getAddress(), await m2.pool.getAddress());
        expect(await fxUSD.getRebalancePools()).to.deep.eq([await m1.pool.getAddress(), await m2.pool.getAddress()]);
      });
    });

    context("#removeRebalancePools", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(fxUSD.connect(signer).removeRebalancePools([ZeroAddress])).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should succeed", async () => {
        // add
        m2 = await deployFxMarket();
        await fxUSD.addMarket(m1.market.getAddress(), 1n);
        await fxUSD.addMarket(m2.market.getAddress(), 1n);
        await expect(fxUSD.addRebalancePools([await m1.pool.getAddress(), await m2.pool.getAddress()]))
          .to.emit(fxUSD, "AddRebalancePool")
          .withArgs(await m1.baseToken.getAddress(), await m1.pool.getAddress())
          .to.emit(fxUSD, "AddRebalancePool")
          .withArgs(await m2.baseToken.getAddress(), await m2.pool.getAddress());
        expect(await fxUSD.getRebalancePools()).to.deep.eq([await m1.pool.getAddress(), await m2.pool.getAddress()]);

        // remove
        await expect(fxUSD.removeRebalancePools([await m1.pool.getAddress(), await m2.pool.getAddress()]))
          .to.emit(fxUSD, "RemoveRebalancePool")
          .withArgs(await m1.baseToken.getAddress(), await m1.pool.getAddress())
          .to.emit(fxUSD, "RemoveRebalancePool")
          .withArgs(await m2.baseToken.getAddress(), await m2.pool.getAddress());
        expect(await fxUSD.getRebalancePools()).to.deep.eq([]);
        await expect(fxUSD.removeRebalancePools([await m1.pool.getAddress(), await m2.pool.getAddress()])).to.not.emit(
          fxUSD,
          "RemoveRebalancePool"
        );
        expect(await fxUSD.getRebalancePools()).to.deep.eq([]);
      });
    });

    context("#updateMintCap", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(fxUSD.connect(signer).updateMintCap(ZeroAddress, 0n)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert, when market not supported", async () => {
        await expect(fxUSD.updateMintCap(ZeroAddress, 0n)).to.revertedWithCustomError(fxUSD, "ErrorUnsupportedMarket");
      });

      it("should succeed", async () => {
        await fxUSD.addMarket(m1.market.getAddress(), 0n);
        expect((await fxUSD.markets(m1.baseToken.getAddress())).mintCap).to.eq(0n);
        await expect(fxUSD.updateMintCap(m1.baseToken.getAddress(), 123n))
          .to.emit(fxUSD, "UpdateMintCap")
          .withArgs(await m1.baseToken.getAddress(), 0n, 123n);
      });
    });
  });

  context("#mint and redeem", async () => {
    beforeEach(async () => {
      m2 = await deployFxMarket();
      await fxUSD.addMarket(m1.market.getAddress(), ethers.parseEther("100000"));
      await fxUSD.addMarket(m2.market.getAddress(), ethers.parseEther("100000"));
      await fxUSD.addRebalancePools([await m1.pool.getAddress(), await m2.pool.getAddress()]);
    });

    context("#wrap", async () => {
      it("should revert when unsupported", async () => {
        await expect(fxUSD.wrap(ZeroAddress, 0n, ZeroAddress)).to.revertedWithCustomError(
          fxUSD,
          "ErrorUnsupportedMarket"
        );
      });

      it("should revert when in stability mode", async () => {
        await m1.oracle.setPrice(ethers.parseEther("1001"));
        await expect(fxUSD.wrap(m1.baseToken.getAddress(), 0n, deployer.address)).to.revertedWithCustomError(
          fxUSD,
          "ErrorMarketInStabilityMode"
        );
      });

      it("should revert when invalid price", async () => {
        await m1.oracle.setIsValid(false);
        await expect(fxUSD.wrap(m1.baseToken.getAddress(), 0n, deployer.address)).to.revertedWithCustomError(
          fxUSD,
          "ErrorMarketWithInvalidPrice"
        );
      });

      it("should revert when under collateral", async () => {
        await m1.oracle.setPrice(ethers.parseEther("1000"));
        await expect(fxUSD.wrap(m2.baseToken.getAddress(), 0n, deployer.address)).to.revertedWithCustomError(
          fxUSD,
          "ErrorUnderCollateral"
        );
      });

      it("should succeed", async () => {
        await m1.fToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
        const beforeSigner = await m1.fToken.balanceOf(signer.address);
        const beforeDeployer = await fxUSD.balanceOf(deployer.address);
        await expect(fxUSD.connect(signer).wrap(m1.baseToken.getAddress(), ethers.parseEther("10"), deployer.address))
          .to.emit(fxUSD, "Wrap")
          .withArgs(await m1.baseToken.getAddress(), signer.address, deployer.address, ethers.parseEther("10"));
        const afterSigner = await m1.fToken.balanceOf(signer.address);
        const afterDeployer = await fxUSD.balanceOf(deployer.address);
        expect(beforeSigner - afterSigner).to.eq(ethers.parseEther("10"));
        expect(afterDeployer - beforeDeployer).to.eq(ethers.parseEther("10"));
        expect(await fxUSD.totalSupply()).to.eq(ethers.parseEther("10"));
        expect((await fxUSD.markets(m1.baseToken.getAddress())).managed).to.eq(ethers.parseEther("10"));
      });
    });

    context("#mint", async () => {
      it("should revert when unsupported", async () => {
        await expect(fxUSD.mint(ZeroAddress, 0n, ZeroAddress, 0n)).to.revertedWithCustomError(
          fxUSD,
          "ErrorUnsupportedMarket"
        );
      });

      it("should revert when in stability mode", async () => {
        await m1.oracle.setPrice(ethers.parseEther("1001"));
        await expect(fxUSD.mint(m1.baseToken.getAddress(), 0n, deployer.address, 0n)).to.revertedWithCustomError(
          fxUSD,
          "ErrorMarketInStabilityMode"
        );
      });

      it("should revert when invalid price", async () => {
        await m1.oracle.setIsValid(false);
        await expect(fxUSD.mint(m1.baseToken.getAddress(), 0n, deployer.address, 0n)).to.revertedWithCustomError(
          fxUSD,
          "ErrorMarketWithInvalidPrice"
        );
      });

      it("should revert when under collateral", async () => {
        await m1.oracle.setPrice(ethers.parseEther("1000"));
        await expect(fxUSD.mint(m2.baseToken.getAddress(), 0n, deployer.address, 0n)).to.revertedWithCustomError(
          fxUSD,
          "ErrorUnderCollateral"
        );
      });

      it("should revert when exceed cap", async () => {
        const cap = (await fxUSD.markets(m1.baseToken.getAddress())).mintCap;
        const left = cap - (await m1.fToken.totalSupply());
        const amount = (left * PRECISION) / ethers.parseEther("2000");
        await m1.baseToken.mint(deployer.address, amount + 1n);
        await m1.baseToken.approve(fxUSD.getAddress(), MaxUint256);
        await expect(
          fxUSD.mint(m1.baseToken.getAddress(), amount + 1n, deployer.address, 0n)
        ).to.revertedWithCustomError(fxUSD, "ErrorExceedMintCap");
      });

      it("should succeed", async () => {
        await m1.baseToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
        await m1.baseToken.mint(signer.address, ethers.parseEther("0.005"));
        const beforeSigner = await m1.baseToken.balanceOf(signer.address);
        const beforeDeployer = await fxUSD.balanceOf(deployer.address);
        const expected = await fxUSD
          .connect(signer)
          .mint.staticCall(m1.baseToken.getAddress(), ethers.parseEther("0.005"), deployer.address, 0n);
        expect(expected).to.eq(ethers.parseEther("10"));
        await expect(
          fxUSD
            .connect(signer)
            .mint(m1.baseToken.getAddress(), ethers.parseEther("0.005"), deployer.address, expected + 1n)
        ).to.revertedWithCustomError(m1.market, "ErrorInsufficientFTokenOutput");
        await expect(
          fxUSD.connect(signer).mint(m1.baseToken.getAddress(), ethers.parseEther("0.005"), deployer.address, expected)
        )
          .to.emit(fxUSD, "Wrap")
          .withArgs(await m1.baseToken.getAddress(), signer.address, deployer.address, expected);
        const afterSigner = await m1.baseToken.balanceOf(signer.address);
        const afterDeployer = await fxUSD.balanceOf(deployer.address);
        expect(beforeSigner - afterSigner).to.eq(ethers.parseEther("0.005"));
        expect(afterDeployer - beforeDeployer).to.eq(expected);
        expect(await fxUSD.totalSupply()).to.eq(expected);
        expect((await fxUSD.markets(m1.baseToken.getAddress())).managed).to.eq(expected);
      });
    });

    context("#earn", async () => {
      it("should revert when under collateral", async () => {
        await m1.oracle.setPrice(ethers.parseEther("1000"));
        await expect(fxUSD.earn(m2.pool.getAddress(), 0n, deployer.address)).to.revertedWithCustomError(
          fxUSD,
          "ErrorUnderCollateral"
        );
      });

      it("should revert when unsupported", async () => {
        const ShareableRebalancePool = await ethers.getContractFactory("ShareableRebalancePool", deployer);
        const pool = await ShareableRebalancePool.deploy(
          fxn.getAddress(),
          ve.getAddress(),
          helper.getAddress(),
          minter.getAddress()
        );
        await expect(fxUSD.earn(pool.getAddress(), 0n, ZeroAddress)).to.revertedWithCustomError(
          fxUSD,
          "ErrorUnsupportedRebalancePool"
        );
      });

      it("should revert, when insufficient liquidity", async () => {
        await m1.fToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
        await fxUSD.connect(signer).wrap(m1.baseToken.getAddress(), ethers.parseEther("100"), deployer.address);
        await expect(
          fxUSD.earn(m2.pool.getAddress(), ethers.parseEther("1"), signer.address)
        ).to.revertedWithCustomError(fxUSD, "ErrorInsufficientLiquidity");
      });

      it("should succeed", async () => {
        await m1.fToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
        await fxUSD.connect(signer).wrap(m1.baseToken.getAddress(), ethers.parseEther("100"), deployer.address);
        expect(await fxUSD.totalSupply()).to.eq(ethers.parseEther("100"));
        expect(await fxUSD.balanceOf(deployer.address)).to.eq(ethers.parseEther("100"));
        expect((await fxUSD.markets(m1.baseToken.getAddress())).managed).to.eq(ethers.parseEther("100"));
        expect(await m1.pool.balanceOf(signer.address)).to.eq(0);
        expect(await m1.pool.totalSupply()).to.eq(0);
        await expect(fxUSD.earn(m1.pool.getAddress(), ethers.parseEther("1"), signer.address))
          .to.emit(fxUSD, "Unwrap")
          .withArgs(await m1.baseToken.getAddress(), deployer.address, signer.address, ethers.parseEther("1"));
        expect(await fxUSD.totalSupply()).to.eq(ethers.parseEther("99"));
        expect(await fxUSD.balanceOf(deployer.address)).to.eq(ethers.parseEther("99"));
        expect((await fxUSD.markets(m1.baseToken.getAddress())).managed).to.eq(ethers.parseEther("99"));
        expect(await m1.pool.balanceOf(signer.address)).to.eq(ethers.parseEther("1"));
        expect(await m1.pool.totalSupply()).to.eq(ethers.parseEther("1"));
      });
    });

    context("#mintAndEarn", async () => {
      it("should revert when under collateral", async () => {
        await m1.oracle.setPrice(ethers.parseEther("1000"));
        await expect(fxUSD.mintAndEarn(m2.pool.getAddress(), 0n, deployer.address, 0n)).to.revertedWithCustomError(
          fxUSD,
          "ErrorUnderCollateral"
        );
      });

      it("should revert when unsupported", async () => {
        const ShareableRebalancePool = await ethers.getContractFactory("ShareableRebalancePool", deployer);
        const pool = await ShareableRebalancePool.deploy(
          fxn.getAddress(),
          ve.getAddress(),
          helper.getAddress(),
          minter.getAddress()
        );
        await expect(fxUSD.earn(pool.getAddress(), 0n, ZeroAddress)).to.revertedWithCustomError(
          fxUSD,
          "ErrorUnsupportedRebalancePool"
        );
      });

      it("should revert when in stability mode", async () => {
        await m1.oracle.setPrice(ethers.parseEther("1001"));
        await expect(fxUSD.mintAndEarn(m1.pool.getAddress(), 0n, deployer.address, 0n)).to.revertedWithCustomError(
          fxUSD,
          "ErrorMarketInStabilityMode"
        );
      });

      it("should revert when invalid price", async () => {
        await m1.oracle.setIsValid(false);
        await expect(fxUSD.mintAndEarn(m1.pool.getAddress(), 0n, deployer.address, 0n)).to.revertedWithCustomError(
          fxUSD,
          "ErrorMarketWithInvalidPrice"
        );
      });

      it("should revert when exceed cap", async () => {
        const cap = (await fxUSD.markets(m1.baseToken.getAddress())).mintCap;
        const left = cap - (await m1.fToken.totalSupply());
        const amount = (left * PRECISION) / ethers.parseEther("2000");
        await m1.baseToken.mint(deployer.address, amount + 1n);
        await m1.baseToken.approve(fxUSD.getAddress(), MaxUint256);
        await expect(
          fxUSD.mintAndEarn(m1.pool.getAddress(), amount + 1n, deployer.address, 0n)
        ).to.revertedWithCustomError(fxUSD, "ErrorExceedMintCap");
      });

      it("should succeed", async () => {
        await m1.baseToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
        await m1.baseToken.mint(signer.address, ethers.parseEther("0.005"));
        const beforeSigner = await m1.baseToken.balanceOf(signer.address);
        expect(await fxUSD.balanceOf(deployer.address)).to.eq(0n);
        expect(await fxUSD.totalSupply()).to.eq(0n);
        expect((await fxUSD.markets(m1.baseToken.getAddress())).managed).to.eq(0n);
        expect(await m1.pool.balanceOf(deployer.address)).to.eq(0n);
        expect(await m1.pool.totalSupply()).to.eq(0n);
        const expected = await fxUSD
          .connect(signer)
          .mintAndEarn.staticCall(m1.pool.getAddress(), ethers.parseEther("0.005"), deployer.address, 0n);
        expect(expected).to.eq(ethers.parseEther("10"));
        await expect(
          fxUSD
            .connect(signer)
            .mintAndEarn(m1.pool.getAddress(), ethers.parseEther("0.005"), deployer.address, expected + 1n)
        ).to.revertedWithCustomError(m1.market, "ErrorInsufficientFTokenOutput");
        await fxUSD
          .connect(signer)
          .mintAndEarn(m1.pool.getAddress(), ethers.parseEther("0.005"), deployer.address, expected);
        const afterSigner = await m1.baseToken.balanceOf(signer.address);
        expect(beforeSigner - afterSigner).to.eq(ethers.parseEther("0.005"));
        expect(await fxUSD.balanceOf(deployer.address)).to.eq(0n);
        expect(await fxUSD.totalSupply()).to.eq(0n);
        expect((await fxUSD.markets(m1.baseToken.getAddress())).managed).to.eq(0n);
        expect(await m1.pool.balanceOf(deployer.address)).to.eq(expected);
        expect(await m1.pool.totalSupply()).to.eq(expected);
      });
    });

    context("#redeem", async () => {
      it("should revert when unsupported", async () => {
        await expect(fxUSD.redeem(ZeroAddress, 0n, ZeroAddress, 0n)).to.revertedWithCustomError(
          fxUSD,
          "ErrorUnsupportedMarket"
        );
      });

      it("should revert when under collateral", async () => {
        await m1.oracle.setPrice(ethers.parseEther("1000"));
        await expect(fxUSD.redeem(m2.baseToken.getAddress(), 0n, deployer.address, 0n)).to.revertedWithCustomError(
          fxUSD,
          "ErrorUnderCollateral"
        );
      });

      it("should revert, when insufficient liquidity", async () => {
        await m1.fToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
        await fxUSD.connect(signer).wrap(m1.baseToken.getAddress(), ethers.parseEther("100"), deployer.address);
        await m2.fToken.connect(signer).transfer(fxUSD, ethers.parseEther("1"));
        await expect(
          fxUSD.redeem(m2.baseToken.getAddress(), ethers.parseEther("1"), signer.address, 0n)
        ).to.revertedWithCustomError(fxUSD, "ErrorInsufficientLiquidity");
      });

      it("should succeed", async () => {
        await m1.fToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
        await fxUSD.connect(signer).wrap(m1.baseToken.getAddress(), ethers.parseEther("100"), deployer.address);
        expect(await fxUSD.totalSupply()).to.eq(ethers.parseEther("100"));
        expect(await fxUSD.balanceOf(deployer.address)).to.eq(ethers.parseEther("100"));
        expect((await fxUSD.markets(m1.baseToken.getAddress())).managed).to.eq(ethers.parseEther("100"));
        expect(await m1.pool.balanceOf(signer.address)).to.eq(0);
        const [expected, expectedBonus] = await fxUSD.redeem.staticCall(
          m1.baseToken.getAddress(),
          ethers.parseEther("1"),
          signer.address,
          0n
        );
        expect(expected).to.eq(ethers.parseEther("0.0005"));
        await expect(
          fxUSD.redeem(m1.baseToken.getAddress(), ethers.parseEther("1"), signer.address, expected + 1n)
        ).to.revertedWithCustomError(m1.market, "ErrorInsufficientBaseOutput");
        await expect(fxUSD.redeem(m1.baseToken.getAddress(), ethers.parseEther("1"), signer.address, expected))
          .to.emit(fxUSD, "Unwrap")
          .withArgs(await m1.baseToken.getAddress(), deployer.address, signer.address, ethers.parseEther("1"));
        expect(await fxUSD.totalSupply()).to.eq(ethers.parseEther("99"));
        expect(await fxUSD.balanceOf(deployer.address)).to.eq(ethers.parseEther("99"));
        expect((await fxUSD.markets(m1.baseToken.getAddress())).managed).to.eq(ethers.parseEther("99"));
        expect(await m1.baseToken.balanceOf(signer.address)).to.eq(expected + expectedBonus);
      });
    });

    context("#redeem auto", async () => {
      it("should revert when length mismatch", async () => {
        await expect(fxUSD.autoRedeem(0n, deployer.address, [])).to.revertedWithCustomError(
          fxUSD,
          "ErrorLengthMismatch"
        );
      });

      it("should succeed when redeem from max", async () => {
        await m1.fToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
        await fxUSD.connect(signer).wrap(m1.baseToken.getAddress(), ethers.parseEther("100"), deployer.address);
        await m2.fToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
        await fxUSD.connect(signer).wrap(m2.baseToken.getAddress(), ethers.parseEther("200"), deployer.address);

        const [baseTokens, amountOuts, bonusOuts] = await fxUSD
          .connect(deployer)
          .autoRedeem.staticCall(ethers.parseEther("100"), signer.address, [0n, 0n]);
        expect(baseTokens[0]).to.eq(await m1.baseToken.getAddress());
        expect(baseTokens[1]).to.eq(await m2.baseToken.getAddress());
        expect(amountOuts[0]).to.eq(0n);
        expect(amountOuts[1]).to.eq(ethers.parseEther("0.05"));
        expect(bonusOuts[0]).to.eq(0n);
        expect(bonusOuts[1]).to.eq(0n);
        await expect(
          fxUSD.connect(deployer).autoRedeem(ethers.parseEther("100"), signer.address, [0n, amountOuts[1] + 1n])
        ).to.revertedWithCustomError(m2.market, "ErrorInsufficientBaseOutput");
        await expect(
          fxUSD.connect(deployer).autoRedeem(ethers.parseEther("100"), signer.address, [amountOuts[0], amountOuts[1]])
        )
          .to.emit(fxUSD, "Unwrap")
          .withArgs(await m2.baseToken.getAddress(), deployer.address, signer.address, ethers.parseEther("100"));
        expect((await fxUSD.markets(m1.baseToken.getAddress())).managed).to.eq(ethers.parseEther("100"));
        expect((await fxUSD.markets(m2.baseToken.getAddress())).managed).to.eq(ethers.parseEther("100"));
        expect(await fxUSD.totalSupply()).to.eq(ethers.parseEther("200"));
        expect(await fxUSD.balanceOf(deployer.address)).to.eq(ethers.parseEther("200"));
        expect(await m1.baseToken.balanceOf(signer.address)).to.eq(amountOuts[0]);
        expect(await m2.baseToken.balanceOf(signer.address)).to.eq(amountOuts[1]);
      });

      it("should succeed when redeem from max and second max", async () => {
        await m1.fToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
        await fxUSD.connect(signer).wrap(m1.baseToken.getAddress(), ethers.parseEther("100"), deployer.address);
        await m2.fToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
        await fxUSD.connect(signer).wrap(m2.baseToken.getAddress(), ethers.parseEther("200"), deployer.address);

        const [baseTokens, amountOuts, bonusOuts] = await fxUSD
          .connect(deployer)
          .autoRedeem.staticCall(ethers.parseEther("250"), signer.address, [0n, 0n]);
        expect(baseTokens[0]).to.eq(await m1.baseToken.getAddress());
        expect(baseTokens[1]).to.eq(await m2.baseToken.getAddress());
        expect(amountOuts[0]).to.eq(ethers.parseEther("0.025"));
        expect(amountOuts[1]).to.eq(ethers.parseEther("0.1"));
        expect(bonusOuts[0]).to.eq(0n);
        expect(bonusOuts[1]).to.eq(0n);
        await expect(
          fxUSD.connect(deployer).autoRedeem(ethers.parseEther("250"), signer.address, [amountOuts[0] + 1n, 0n])
        ).to.revertedWithCustomError(m2.market, "ErrorInsufficientBaseOutput");
        await expect(
          fxUSD.connect(deployer).autoRedeem(ethers.parseEther("250"), signer.address, [0n, amountOuts[1] + 1n])
        ).to.revertedWithCustomError(m2.market, "ErrorInsufficientBaseOutput");
        await expect(
          fxUSD.connect(deployer).autoRedeem(ethers.parseEther("250"), signer.address, [amountOuts[0], amountOuts[1]])
        )
          .to.emit(fxUSD, "Unwrap")
          .withArgs(await m2.baseToken.getAddress(), deployer.address, signer.address, ethers.parseEther("200"))
          .to.emit(fxUSD, "Unwrap")
          .withArgs(await m1.baseToken.getAddress(), deployer.address, signer.address, ethers.parseEther("50"));
        expect((await fxUSD.markets(m1.baseToken.getAddress())).managed).to.eq(ethers.parseEther("50"));
        expect((await fxUSD.markets(m2.baseToken.getAddress())).managed).to.eq(ethers.parseEther("0"));
        expect(await fxUSD.totalSupply()).to.eq(ethers.parseEther("50"));
        expect(await fxUSD.balanceOf(deployer.address)).to.eq(ethers.parseEther("50"));
        expect(await m1.baseToken.balanceOf(signer.address)).to.eq(amountOuts[0]);
        expect(await m2.baseToken.balanceOf(signer.address)).to.eq(amountOuts[1]);
      });

      it("should succeed when under collateral", async () => {
        await m1.fToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
        await fxUSD.connect(signer).wrap(m1.baseToken.getAddress(), ethers.parseEther("100"), deployer.address);
        await m2.fToken.connect(signer).approve(fxUSD.getAddress(), MaxUint256);
        await fxUSD.connect(signer).wrap(m2.baseToken.getAddress(), ethers.parseEther("500"), deployer.address);
        await m1.oracle.setPrice(ethers.parseEther("900"));

        const [baseTokens, amountOuts, bonusOuts] = await fxUSD
          .connect(deployer)
          .autoRedeem.staticCall(ethers.parseEther("250"), signer.address, [0n, 0n]);
        expect(baseTokens[0]).to.eq(await m1.baseToken.getAddress());
        expect(baseTokens[1]).to.eq(await m2.baseToken.getAddress());
        expect(amountOuts[0]).to.eq(ethers.parseEther("0.041666666666666666"));
        expect(amountOuts[1]).to.eq(ethers.parseEther("0.104166666666666666"));
        expect(bonusOuts[0]).to.eq(0n);
        expect(bonusOuts[1]).to.eq(0n);
        await expect(
          fxUSD.connect(deployer).autoRedeem(ethers.parseEther("250"), signer.address, [amountOuts[0] + 1n, 0n])
        ).to.revertedWithCustomError(m2.market, "ErrorInsufficientBaseOutput");
        await expect(
          fxUSD.connect(deployer).autoRedeem(ethers.parseEther("250"), signer.address, [0n, amountOuts[1] + 1n])
        ).to.revertedWithCustomError(m2.market, "ErrorInsufficientBaseOutput");
        await expect(
          fxUSD.connect(deployer).autoRedeem(ethers.parseEther("250"), signer.address, [amountOuts[0], amountOuts[1]])
        )
          .to.emit(fxUSD, "Unwrap")
          .withArgs(
            await m2.baseToken.getAddress(),
            deployer.address,
            signer.address,
            ethers.parseEther("208.333333333333333333")
          )
          .to.emit(fxUSD, "Unwrap")
          .withArgs(
            await m1.baseToken.getAddress(),
            deployer.address,
            signer.address,
            ethers.parseEther("41.666666666666666666")
          );
        expect((await fxUSD.markets(m1.baseToken.getAddress())).managed).to.eq(
          ethers.parseEther("58.333333333333333334")
        );
        expect((await fxUSD.markets(m2.baseToken.getAddress())).managed).to.eq(
          ethers.parseEther("291.666666666666666667")
        );
        expect(await fxUSD.totalSupply()).to.eq(ethers.parseEther("350"));
        expect(await fxUSD.balanceOf(deployer.address)).to.eq(ethers.parseEther("350"));
        expect(await m1.baseToken.balanceOf(signer.address)).to.eq(amountOuts[0]);
        expect(await m2.baseToken.balanceOf(signer.address)).to.eq(amountOuts[1]);
      });
    });
  });
});

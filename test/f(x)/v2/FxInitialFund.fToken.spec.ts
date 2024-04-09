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
  ShareableRebalancePool,
  GovernanceToken,
  VotingEscrow,
  VotingEscrowHelper,
  GaugeController,
  TokenMinter,
  FxInitialFund,
} from "@/types/index";

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

describe("FxInitialFund.fToken.spec", async () => {
  let deployer: HardhatEthersSigner;
  let platform: HardhatEthersSigner;
  let signer: HardhatEthersSigner;
  let admin: HardhatEthersSigner;

  let fxn: GovernanceToken;
  let ve: VotingEscrow;
  let helper: VotingEscrowHelper;
  let controller: GaugeController;
  let minter: TokenMinter;

  let m: FxMarket;
  let fund: FxInitialFund;

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
    await rateProvider.setRate(ethers.parseEther("1.1"));
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

    m = await deployFxMarket();

    const FxInitialFund = await ethers.getContractFactory("FxInitialFund", deployer);
    fund = await FxInitialFund.deploy(m.market.getAddress(), ZeroAddress);
    await m.treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), fund.getAddress());
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      expect(await fund.MINTER_ROLE()).to.eq(id("MINTER_ROLE"));
      expect(await fund.market()).to.eq(await m.market.getAddress());
      expect(await fund.treasury()).to.eq(await m.treasury.getAddress());
      expect(await fund.baseToken()).to.eq(await m.baseToken.getAddress());
      expect(await fund.fToken()).to.eq(await m.fToken.getAddress());
      expect(await fund.xToken()).to.eq(await m.xToken.getAddress());
      expect(await fund.fxUSD()).to.eq(ZeroAddress);

      expect(await fund.totalShares()).to.eq(0n);
      expect(await fund.totalFToken()).to.eq(0n);
      expect(await fund.totalXToken()).to.eq(0n);
      expect(await fund.initialized()).to.eq(false);
      expect(await fund.fxWithdrawalEnabled()).to.eq(false);
    });
  });

  context("#deposit", async () => {
    it("should revert when initialized", async () => {
      await m.baseToken.mint(fund.getAddress(), ethers.parseEther("1"));
      await fund.grantRole(id("MINTER_ROLE"), deployer.address);
      await fund.mint();

      await expect(fund.deposit(0n, ZeroAddress)).to.revertedWithCustomError(fund, "ErrorInitialized");
    });

    it("should succeed", async () => {
      const amountIn = ethers.parseEther("1");
      await m.baseToken.mint(deployer.address, amountIn);
      await m.baseToken.connect(deployer).approve(fund.getAddress(), amountIn);
      await fund.connect(deployer).deposit(amountIn, signer.address);
      expect(await fund.totalShares()).to.eq(amountIn);
      expect(await fund.shares(signer.address)).to.eq(amountIn);
    });
  });

  context("#withdrawBaseToken", async () => {
    it("should revert when not initialized", async () => {
      await expect(fund.withdrawBaseToken(ZeroAddress, 0n)).to.revertedWithCustomError(fund, "ErrorNotInitialized");
    });

    it("should succeed", async () => {
      const amountIn = ethers.parseEther("1");
      await m.baseToken.mint(deployer.address, amountIn * 3n);
      await m.baseToken.connect(deployer).approve(fund.getAddress(), amountIn * 3n);
      await fund.connect(deployer).deposit(amountIn, signer.address);
      await fund.connect(deployer).deposit(amountIn * 2n, deployer.address);
      expect(await fund.totalShares()).to.eq(amountIn * 3n);
      expect(await fund.shares(signer.address)).to.eq(amountIn);
      expect(await fund.shares(deployer.address)).to.eq(amountIn * 2n);

      await fund.grantRole(id("MINTER_ROLE"), deployer.address);
      await fund.mint();
      expect(await fund.totalFToken()).to.eq(ethers.parseEther("3300"));
      expect(await fund.totalXToken()).to.eq(ethers.parseEther("3300"));
      expect(await fund.initialized()).to.eq(true);

      const expected = await fund.connect(signer).withdrawBaseToken.staticCall(signer.address, 0n);
      expect(expected).to.eq(ethers.parseEther("1"));
      await expect(fund.connect(signer).withdrawBaseToken(signer.address, expected + 1n)).to.revertedWithCustomError(
        fund,
        "ErrorInsufficientBaseToken"
      );
      await fund.connect(signer).withdrawBaseToken(signer.address, expected);
      expect(await m.baseToken.balanceOf(signer.address)).to.eq(expected);
    });
  });

  context("#withdraw", async () => {
    it("should revert when not initialized", async () => {
      await expect(fund.withdraw(ZeroAddress)).to.revertedWithCustomError(fund, "ErrorNotInitialized");
    });

    it("should revert when not enable", async () => {
      await fund.grantRole(id("MINTER_ROLE"), deployer.address);
      await m.baseToken.mint(fund.getAddress(), ethers.parseEther("1"));
      await fund.mint();
      await expect(fund.withdraw(ZeroAddress)).to.revertedWithCustomError(fund, "ErrorFxWithdrawalNotEnabled");
    });

    it("should succeed", async () => {
      const amountIn = ethers.parseEther("1");
      await m.baseToken.mint(deployer.address, amountIn * 3n);
      await m.baseToken.connect(deployer).approve(fund.getAddress(), amountIn * 3n);
      await fund.connect(deployer).deposit(amountIn, signer.address);
      await fund.connect(deployer).deposit(amountIn * 2n, deployer.address);
      expect(await fund.totalShares()).to.eq(amountIn * 3n);
      expect(await fund.shares(signer.address)).to.eq(amountIn);
      expect(await fund.shares(deployer.address)).to.eq(amountIn * 2n);

      await fund.grantRole(id("MINTER_ROLE"), deployer.address);
      await fund.mint();
      expect(await fund.totalFToken()).to.eq(ethers.parseEther("3300"));
      expect(await fund.totalXToken()).to.eq(ethers.parseEther("3300"));
      expect(await fund.initialized()).to.eq(true);
      await fund.toggleFxWithdrawalStatus();

      expect(await m.fToken.balanceOf(signer.address)).to.eq(0n);
      expect(await m.xToken.balanceOf(signer.address)).to.eq(0n);
      await fund.connect(signer).withdraw(signer.address);
      expect(await m.fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1100"));
      expect(await m.xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1100"));
    });
  });

  context("#mint", async () => {
    it("should revert, when caller is not minter", async () => {
      await expect(fund.connect(signer).mint()).to.revertedWith(
        "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("MINTER_ROLE")
      );
    });

    it("should revert when initialized", async () => {
      await m.baseToken.mint(fund.getAddress(), ethers.parseEther("1"));
      await fund.grantRole(id("MINTER_ROLE"), deployer.address);
      await fund.mint();

      await expect(fund.mint()).to.revertedWithCustomError(fund, "ErrorInitialized");
    });

    it("should succeed", async () => {
      const amountIn = ethers.parseEther("1");
      await m.baseToken.mint(deployer.address, amountIn * 3n);
      await m.baseToken.connect(deployer).approve(fund.getAddress(), amountIn * 3n);
      await fund.connect(deployer).deposit(amountIn, signer.address);
      await fund.connect(deployer).deposit(amountIn * 2n, deployer.address);
      expect(await fund.totalShares()).to.eq(amountIn * 3n);
      expect(await fund.shares(signer.address)).to.eq(amountIn);
      expect(await fund.shares(deployer.address)).to.eq(amountIn * 2n);

      await fund.grantRole(id("MINTER_ROLE"), deployer.address);
      expect(await fund.initialized()).to.eq(false);
      await fund.mint();
      expect(await fund.totalFToken()).to.eq(ethers.parseEther("3300"));
      expect(await fund.totalXToken()).to.eq(ethers.parseEther("3300"));
      expect(await fund.initialized()).to.eq(true);
    });
  });

  context("#toggleFxWithdrawalStatus", async () => {
    it("should revert, when caller is not admin", async () => {
      await expect(fund.connect(signer).toggleFxWithdrawalStatus()).to.revertedWith(
        "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
      );
    });

    it("should succeed", async () => {
      expect(await fund.fxWithdrawalEnabled()).to.eq(false);
      await fund.toggleFxWithdrawalStatus();
      expect(await fund.fxWithdrawalEnabled()).to.eq(true);
      await fund.toggleFxWithdrawalStatus();
      expect(await fund.fxWithdrawalEnabled()).to.eq(false);
    });
  });
});

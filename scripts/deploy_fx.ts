/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { BigNumber, constants, Contract } from "ethers";
import { ethers } from "hardhat";
import {
  ChainlinkTwapOracleV3,
  StETHGateway,
  FractionalToken,
  LeveragedToken,
  Market,
  ProxyAdmin,
  TokenSale,
  StETHTreasury,
  RebalancePool,
  RebalanceWithBonusToken,
  WstETHWrapper,
} from "../typechain";
import { DEPLOYED_CONTRACTS, TOKENS } from "./utils";

const KEEPER = "0x11e91bb6d1334585aa37d8f4fde3932c7960b938";

const config: {
  initialMintRatio: BigNumber;
  beta: BigNumber;
  baseTokenCap: BigNumber;
  marketConfig: {
    stabilityRatio: BigNumber;
    liquidationRatio: BigNumber;
    selfLiquidationRatio: BigNumber;
    recapRatio: BigNumber;
  };
  incentiveConfig: {
    stabilityIncentiveRatio: BigNumber;
    liquidationIncentiveRatio: BigNumber;
    selfLiquidationIncentiveRatio: BigNumber;
  };
  feeRatio: {
    [type: string]: {
      defaultFeeRatio: BigNumber;
      extraFeeRatio: BigNumber;
    };
  };

  ProxyAdmin: string;
  Sale: {
    [round: string]: {
      cap: BigNumber;
      time: { WhitelistStartTime: number; PublicStartTime: number; SaleDuration: number };
      tokens: string[];
      price: {
        InitialPrice: BigNumber;
        UpRatio: BigNumber;
        Variation: BigNumber;
      };
      address: string;
    };
  };
  Ratio: {
    stabilityPoolRatio: BigNumber;
    harvestBountyRatio: BigNumber;
  };
  impls: { [name: string]: string };
  Liquidator: { [name: string]: string };
  LeveragedToken: string;
  FractionalToken: string;
  stETHTreasury: string;
  RebalancePool: string;
  Market: string;
  ChainlinkTwapOracleV3: string;
  wstETHWrapper: string;
  stETHGateway: string;
} = {
  ProxyAdmin: DEPLOYED_CONTRACTS.Fx.ProxyAdmin,

  initialMintRatio: ethers.utils.parseUnits("0.5", 18),
  beta: ethers.utils.parseUnits("0.1", 18),
  baseTokenCap: ethers.utils.parseUnits("1000", 18),

  marketConfig: {
    stabilityRatio: ethers.utils.parseUnits("1.3055", 18),
    liquidationRatio: ethers.utils.parseUnits("1.2067", 18),
    selfLiquidationRatio: ethers.utils.parseUnits("1.1439", 18),
    recapRatio: ethers.utils.parseUnits("1", 18),
  },
  incentiveConfig: {
    stabilityIncentiveRatio: constants.Zero,
    liquidationIncentiveRatio: constants.Zero,
    selfLiquidationIncentiveRatio: constants.Zero,
  },
  feeRatio: {
    fTokenMintFeeRatio: {
      defaultFeeRatio: ethers.utils.parseEther("0.25").div(100),
      extraFeeRatio: constants.Zero,
    },
    xTokenMintFeeRatio: {
      defaultFeeRatio: ethers.utils.parseEther("1").div(100),
      extraFeeRatio: ethers.utils.parseEther("-1").div(100),
    },
    fTokenRedeemFeeRatio: {
      defaultFeeRatio: ethers.utils.parseEther("0.25").div(100),
      extraFeeRatio: ethers.utils.parseEther("-0.25").div(100),
    },
    xTokenRedeemFeeRatio: {
      defaultFeeRatio: ethers.utils.parseEther("1").div(100),
      extraFeeRatio: ethers.utils.parseEther("7").div(100),
    },
  },

  Sale: {
    round1: {
      cap: ethers.utils.parseEther("20000"),
      time: { WhitelistStartTime: 1685620800, PublicStartTime: 1685624400, SaleDuration: 86400 * 6 },
      tokens: [constants.AddressZero],
      price: {
        InitialPrice: ethers.utils.parseEther("0.005"),
        UpRatio: constants.Zero,
        Variation: ethers.utils.parseEther("1"),
      },
      address: "0x3eB6Da2d3f39BA184AEA23876026E0747Fb0E17f",
    },
    round2: {
      cap: ethers.utils.parseEther("40000"),
      time: { WhitelistStartTime: 1690981200, PublicStartTime: 1691586000, SaleDuration: 0 },
      tokens: [constants.AddressZero],
      price: {
        InitialPrice: ethers.utils.parseEther("0.0075"),
        UpRatio: constants.Zero,
        Variation: ethers.utils.parseEther("1"),
      },
      address: "0x674A745ADb09c3333D655cC63e2d77ACbE6De935",
    },
  },
  impls: {
    LeveragedToken: "0x92d0cb7E56806Bf977e7F5296EA2Fe84B475Fe83",
    FractionalToken: "0x2a906eAB9B088E6753670bC8D3840f9473745748",
    stETHTreasury: "0xCE938c27C04d4A638307D44e28515D4bcD28bD74",
    Market: "0x505002BbADAC4eBC17666b1622cFF0605fe90bD5",
    RebalancePool: "0x3415fcD2885C486E2d848403d51077f7176473C7",
  },
  Ratio: {
    stabilityPoolRatio: ethers.utils.parseEther("0.5"),
    harvestBountyRatio: ethers.utils.parseEther("0.01"),
  },
  Liquidator: {
    RebalanceWithBonusToken: constants.AddressZero,
  },
  ChainlinkTwapOracleV3: "0x460B3CdE57DfbA90DBed02fd83d3990a92DA1230",
  FractionalToken: "0x53805A76E1f5ebbFE7115F16f9c87C2f7e633726",
  LeveragedToken: "0xe063F04f280c60aECa68b38341C2eEcBeC703ae2",
  stETHTreasury: "0x0e5CAA5c889Bdf053c9A76395f62267E653AFbb0",
  Market: "0xe7b9c7c9cA85340b8c06fb805f7775e3015108dB",
  RebalancePool: "0xa677d95B91530d56791FbA72C01a862f1B01A49e",
  stETHGateway: "0x4C5C52d507066780500e627d592DbE11476E7c21",
  wstETHWrapper: "0xb09e34dD25d5E88a1E9Ff6F6418109927675B658",
};

const maxFeePerGas = 20e9;
const maxPriorityFeePerGas = 1e9;

async function main() {
  const overrides = {
    maxFeePerGas: BigNumber.from(maxFeePerGas),
    maxPriorityFeePerGas: BigNumber.from(maxPriorityFeePerGas),
  };

  const [deployer] = await ethers.getSigners();
  if (deployer.address !== "0x07dA2d30E26802ED65a52859a50872cfA615bD0A") {
    console.log("invalid deployer");
    return;
  }

  let proxyAdmin: ProxyAdmin;
  if (config.ProxyAdmin) {
    proxyAdmin = await ethers.getContractAt("ProxyAdmin", config.ProxyAdmin, deployer);
    console.log("Found ProxyAdmin at:", proxyAdmin.address);
  } else {
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin", deployer);
    proxyAdmin = await ProxyAdmin.deploy(overrides);

    console.log(`Deploying ProxyAdmin hash:`, proxyAdmin.deployTransaction.hash);
    await proxyAdmin.deployed();
    const receipt = await proxyAdmin.deployTransaction.wait();
    console.log(`✅ Deploy ProxyAdmin at:`, proxyAdmin.address, "gas used:", receipt.gasUsed.toString());
    config.ProxyAdmin = proxyAdmin.address;
  }

  for (const name of ["LeveragedToken", "FractionalToken", "stETHTreasury", "Market", "RebalancePool"]) {
    if (config.impls[name] === "") {
      const Contract = await ethers.getContractFactory(name, deployer);
      let impl: Contract;
      if (name === "stETHTreasury") {
        impl = await Contract.deploy(config.initialMintRatio, overrides);
      } else {
        impl = await Contract.deploy(overrides);
      }
      console.log(`Deploying ${name} Impl hash:`, impl.deployTransaction.hash);
      await impl.deployed();
      const receipt = await impl.deployTransaction.wait();
      console.log(`✅ Deploy ${name} Impl at:`, impl.address, "gas used:", receipt.gasUsed.toString());
      config.impls[name] = impl.address;
    } else {
      console.log(`Found ${name} Impl at:`, config.impls[name]);
    }
  }

  for (const round of ["round1", "round2"]) {
    const saleConfig = config.Sale[round];
    let sale: TokenSale;
    if (saleConfig.address !== "") {
      sale = await ethers.getContractAt("TokenSale", saleConfig.address, deployer);
      console.log(`Found ${round} TokenSale at:`, sale.address);
    } else {
      const TokenSale = await ethers.getContractFactory("TokenSale", deployer);
      sale = await TokenSale.deploy(
        TOKENS.WETH.address,
        TOKENS.WETH.address,
        DEPLOYED_CONTRACTS.AladdinZap,
        saleConfig.cap,
        overrides
      );
      console.log(`Deploying ${round} TokenSale hash:`, sale.deployTransaction.hash);
      await sale.deployed();
      const receipt = await sale.deployTransaction.wait();
      console.log(`✅ Deploy ${round} TokenSale at:`, sale.address, "gas used:", receipt.gasUsed.toString());
      saleConfig.address = sale.address;
    }

    if (!(await sale.priceData()).initialPrice.eq(saleConfig.price.InitialPrice)) {
      const tx = await sale.updatePrice(
        saleConfig.price.InitialPrice,
        saleConfig.price.UpRatio,
        saleConfig.price.Variation
      );
      console.log("TokenSale.updatePrice, hash:", tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
    }

    const saleTime = await sale.saleTimeData();
    if (
      !saleTime.whitelistSaleTime.eq(saleConfig.time.WhitelistStartTime) ||
      !saleTime.publicSaleTime.eq(saleConfig.time.PublicStartTime) ||
      !saleTime.saleDuration.eq(saleConfig.time.SaleDuration)
    ) {
      const tx = await sale.updateSaleTime(
        saleConfig.time.WhitelistStartTime,
        saleConfig.time.PublicStartTime,
        saleConfig.time.SaleDuration
      );
      console.log("TokenSale.updateSaleTime, hash:", tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
    }
    const tokens: string[] = [];
    for (const token of saleConfig.tokens) {
      if (!(await sale.isSupported(token))) {
        tokens.push(token);
      }
    }
    if (tokens.length > 0) {
      const tx = await sale.updateSupportedTokens(tokens, true);
      console.log("TokenSale.updateSupportedTokens, hash:", tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
    }
  }

  let oracle: ChainlinkTwapOracleV3;
  if (config.ChainlinkTwapOracleV3 !== "") {
    oracle = await ethers.getContractAt("ChainlinkTwapOracleV3", config.ChainlinkTwapOracleV3, deployer);
    console.log(`Found ChainlinkTwapOracleV3 at:`, oracle.address);
  } else {
    const ChainlinkTwapOracleV3 = await ethers.getContractFactory("ChainlinkTwapOracleV3", deployer);
    oracle = await ChainlinkTwapOracleV3.deploy(
      "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
      1,
      10800,
      "ETH",
      overrides
    );

    console.log(`Deploying ChainlinkTwapOracleV3 hash:`, oracle.deployTransaction.hash);
    await oracle.deployed();
    const receipt = await oracle.deployTransaction.wait();
    console.log(`✅ Deploy ChainlinkTwapOracleV3 at:`, oracle.address, "gas used:", receipt.gasUsed.toString());
    config.ChainlinkTwapOracleV3 = oracle.address;
  }

  const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);

  let fETH: FractionalToken;
  if (config.FractionalToken !== "") {
    fETH = await ethers.getContractAt("FractionalToken", config.FractionalToken, deployer);
    console.log(`Found fETH at:`, fETH.address);
  } else {
    const proxy = await TransparentUpgradeableProxy.deploy(
      config.impls.FractionalToken,
      config.ProxyAdmin,
      "0x",
      overrides
    );
    console.log(`Deploying fETH, hash:`, proxy.deployTransaction.hash);
    const receipt = await proxy.deployTransaction.wait();
    console.log(`✅ Deploy fETH, at:`, proxy.address, "gas used:", receipt.gasUsed.toString());

    fETH = await ethers.getContractAt("FractionalToken", proxy.address, deployer);
    config.FractionalToken = fETH.address;
  }

  let xETH: LeveragedToken;
  if (config.LeveragedToken !== "") {
    xETH = await ethers.getContractAt("LeveragedToken", config.LeveragedToken, deployer);
    console.log(`Found xETH at:`, xETH.address);
  } else {
    const proxy = await TransparentUpgradeableProxy.deploy(
      config.impls.LeveragedToken,
      config.ProxyAdmin,
      "0x",
      overrides
    );
    console.log(`Deploying xETH, hash:`, proxy.deployTransaction.hash);
    const receipt = await proxy.deployTransaction.wait();
    console.log(`✅ Deploy xETH, at:`, proxy.address, "gas used:", receipt.gasUsed.toString());

    xETH = await ethers.getContractAt("LeveragedToken", proxy.address, deployer);
    config.LeveragedToken = xETH.address;
  }

  let treasury: StETHTreasury;
  if (config.stETHTreasury !== "") {
    treasury = (await ethers.getContractAt("stETHTreasury", config.stETHTreasury, deployer)) as StETHTreasury;
    console.log(`Found stETHTreasury at:`, treasury.address);
  } else {
    const proxy = await TransparentUpgradeableProxy.deploy(
      config.impls.stETHTreasury,
      config.ProxyAdmin,
      "0x",
      overrides
    );
    console.log(`Deploying treasury, hash:`, proxy.deployTransaction.hash);
    const receipt = await proxy.deployTransaction.wait();
    console.log(`✅ Deploy treasury, at:`, proxy.address, "gas used:", receipt.gasUsed.toString());

    treasury = (await ethers.getContractAt("stETHTreasury", proxy.address, deployer)) as StETHTreasury;
    config.stETHTreasury = treasury.address;
  }

  let market: Market;
  if (config.Market !== "") {
    market = await ethers.getContractAt("Market", config.Market, deployer);
    console.log(`Found Market at:`, market.address);
  } else {
    const proxy = await TransparentUpgradeableProxy.deploy(config.impls.Market, config.ProxyAdmin, "0x", overrides);
    console.log(`Deploying market, hash:`, proxy.deployTransaction.hash);
    const receipt = await proxy.deployTransaction.wait();
    console.log(`✅ Deploy market, at:`, proxy.address, "gas used:", receipt.gasUsed.toString());

    market = await ethers.getContractAt("Market", proxy.address, deployer);
    config.Market = market.address;
  }

  let stabilityPool: RebalancePool;
  if (config.RebalancePool !== "") {
    stabilityPool = await ethers.getContractAt("RebalancePool", config.RebalancePool, deployer);
    console.log(`Found RebalancePool at:`, stabilityPool.address);
  } else {
    const proxy = await TransparentUpgradeableProxy.deploy(
      config.impls.RebalancePool,
      config.ProxyAdmin,
      "0x",
      overrides
    );
    console.log(`Deploying RebalancePool, hash:`, proxy.deployTransaction.hash);
    const receipt = await proxy.deployTransaction.wait();
    console.log(`✅ Deploy RebalancePool, at:`, proxy.address, "gas used:", receipt.gasUsed.toString());

    stabilityPool = await ethers.getContractAt("RebalancePool", proxy.address, deployer);
    config.RebalancePool = stabilityPool.address;
  }

  /*
  if ((await proxyAdmin.getProxyImplementation(treasury.address)) !== config.impls.stETHTreasury) {
    const tx = await proxyAdmin.upgrade(treasury.address, config.impls.stETHTreasury);
    console.log("ProxyAdmin.upgrade, Treasury, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if ((await proxyAdmin.getProxyImplementation(market.address)) !== config.impls.Market) {
    const tx = await proxyAdmin.upgrade(market.address, config.impls.Market);
    console.log("ProxyAdmin.upgrade, Market, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if ((await proxyAdmin.getProxyImplementation(stabilityPool.address)) !== config.impls.RebalancePool) {
    const tx = await proxyAdmin.upgrade(stabilityPool.address, config.impls.RebalancePool);
    console.log("ProxyAdmin.upgrade, RebalancePool, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }
  */

  let gateway: StETHGateway;
  if (config.stETHGateway !== "") {
    gateway = (await ethers.getContractAt("stETHGateway", config.stETHGateway, deployer)) as StETHGateway;
    console.log(`Found stETHGateway at:`, gateway.address);
  } else {
    const stETHGateway = await ethers.getContractFactory("stETHGateway", deployer);
    gateway = (await stETHGateway.deploy(market.address, fETH.address, xETH.address)) as StETHGateway;

    console.log(`Deploying stETHGateway hash:`, gateway.deployTransaction.hash);
    await gateway.deployed();
    const receipt = await gateway.deployTransaction.wait();
    console.log(`✅ Deploy stETHGateway at:`, gateway.address, "gas used:", receipt.gasUsed.toString());
    config.stETHGateway = gateway.address;
  }

  let wrapper: WstETHWrapper;
  if (config.wstETHWrapper !== "") {
    wrapper = (await ethers.getContractAt("wstETHWrapper", config.wstETHWrapper, deployer)) as WstETHWrapper;
    console.log(`Found wstETHWrapper at:`, wrapper.address);
  } else {
    const wstETHWrapper = await ethers.getContractFactory("wstETHWrapper", deployer);
    wrapper = (await wstETHWrapper.deploy()) as WstETHWrapper;

    console.log(`Deploying wstETHWrapper hash:`, wrapper.deployTransaction.hash);
    await gateway.deployed();
    const receipt = await wrapper.deployTransaction.wait();
    console.log(`✅ Deploy wstETHWrapper at:`, wrapper.address, "gas used:", receipt.gasUsed.toString());
    config.wstETHWrapper = wrapper.address;
  }

  let liquidator: RebalanceWithBonusToken;
  if (config.Liquidator.RebalanceWithBonusToken !== "") {
    liquidator = await ethers.getContractAt(
      "RebalanceWithBonusToken",
      config.Liquidator.RebalanceWithBonusToken,
      deployer
    );
    console.log(`Found RebalanceWithBonusToken at:`, liquidator.address);
  } else {
    const RebalanceWithBonusToken = await ethers.getContractFactory("RebalanceWithBonusToken", deployer);
    liquidator = await RebalanceWithBonusToken.deploy(stabilityPool.address, TOKENS.WETH.address);

    console.log(`Deploying RebalanceWithBonusToken hash:`, gateway.deployTransaction.hash);
    await liquidator.deployed();
    const receipt = await liquidator.deployTransaction.wait();
    console.log(`✅ Deploy RebalanceWithBonusToken at:`, liquidator.address, "gas used:", receipt.gasUsed.toString());
    config.Liquidator.RebalanceWithBonusToken = liquidator.address;
  }

  // initialize
  if ((await fETH.treasury()) === constants.AddressZero) {
    const tx = await fETH.initialize(treasury.address, "Fractional ETH", "fETH");
    console.log("Initialize fETH, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if ((await xETH.treasury()) === constants.AddressZero) {
    const tx = await xETH.initialize(treasury.address, fETH.address, "Leveraged ETH", "xETH");
    console.log("Initialize xETH, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if ((await treasury.market()) === constants.AddressZero) {
    const tx = await treasury.initialize(
      market.address,
      TOKENS.stETH.address,
      fETH.address,
      xETH.address,
      oracle.address,
      config.beta,
      config.baseTokenCap
    );
    console.log("Initialize Treasury, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if ((await market.treasury()) === constants.AddressZero) {
    const tx = await market.initialize(treasury.address, DEPLOYED_CONTRACTS.Fx.Treasury);
    console.log("Initialize Market, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if ((await stabilityPool.market()) === constants.AddressZero) {
    const tx = await stabilityPool.initialize(treasury.address, market.address);
    console.log("Initialize RebalancePool, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  /*
  if ((await treasury.priceOracle()) !== oracle.address) {
    const tx = await treasury.updatePriceOracle(oracle.address);
    console.log("Treasury.updatePriceOracle, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }
  */

  // Setup Treasury
  if ((await treasury.stabilityPool()) !== stabilityPool.address) {
    const tx = await treasury.updateStabilityPool(stabilityPool.address);
    console.log("Treasury.updateStabilityPool, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if ((await treasury.platform()) === constants.AddressZero) {
    const tx = await treasury.updatePlatform(DEPLOYED_CONTRACTS.Fx.Treasury);
    console.log("Treasury.updatePlatform, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if (
    !(await treasury.harvestBountyRatio()).eq(config.Ratio.harvestBountyRatio) ||
    !(await treasury.stabilityPoolRatio()).eq(config.Ratio.stabilityPoolRatio)
  ) {
    const tx = await treasury.updateRewardRatio(config.Ratio.stabilityPoolRatio, config.Ratio.harvestBountyRatio);
    console.log("Treasury.updateRewardRatio, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  // Setup Market
  const marketConfig = await market.marketConfig();
  if (
    !marketConfig.stabilityRatio.eq(config.marketConfig.stabilityRatio) ||
    !marketConfig.liquidationRatio.eq(config.marketConfig.liquidationRatio) ||
    !marketConfig.selfLiquidationRatio.eq(config.marketConfig.selfLiquidationRatio) ||
    !marketConfig.recapRatio.eq(config.marketConfig.recapRatio)
  ) {
    const tx = await market.updateMarketConfig(
      config.marketConfig.stabilityRatio,
      config.marketConfig.liquidationRatio,
      config.marketConfig.selfLiquidationRatio,
      config.marketConfig.recapRatio
    );
    console.log("Market.updateMarketConfig, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  const incentiveConfig = await market.incentiveConfig();
  if (
    !incentiveConfig.stabilityIncentiveRatio.eq(config.incentiveConfig.liquidationIncentiveRatio) ||
    !incentiveConfig.liquidationIncentiveRatio.eq(config.incentiveConfig.liquidationIncentiveRatio) ||
    !incentiveConfig.selfLiquidationIncentiveRatio.eq(config.incentiveConfig.selfLiquidationIncentiveRatio)
  ) {
    const tx = await market.updateIncentiveConfig(
      config.incentiveConfig.liquidationIncentiveRatio,
      config.incentiveConfig.liquidationIncentiveRatio,
      config.incentiveConfig.selfLiquidationIncentiveRatio
    );
    console.log("Market.updateIncentiveConfig, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if (!(await market.fTokenMintInSystemStabilityModePaused())) {
    const tx = await market.pauseFTokenMintInSystemStabilityMode(true);
    console.log("Market.pauseFTokenMintInSystemStabilityMode, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if (await market.xTokenRedeemInSystemStabilityModePaused()) {
    const tx = await market.pauseXTokenRedeemInSystemStabilityMode(false);
    console.log("Market.pauseXTokenRedeemInSystemStabilityMode, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  const fTokenMintFeeRatio = await market.fTokenMintFeeRatio();
  if (
    !fTokenMintFeeRatio.defaultFeeRatio.eq(config.feeRatio.fTokenMintFeeRatio.defaultFeeRatio) ||
    !fTokenMintFeeRatio.extraFeeRatio.eq(config.feeRatio.fTokenMintFeeRatio.extraFeeRatio)
  ) {
    const tx = await market.updateMintFeeRatio(
      config.feeRatio.fTokenMintFeeRatio.defaultFeeRatio,
      config.feeRatio.fTokenMintFeeRatio.extraFeeRatio,
      true
    );
    console.log("Market.updateMintFeeRatio, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  const xTokenMintFeeRatio = await market.xTokenMintFeeRatio();
  if (
    !xTokenMintFeeRatio.defaultFeeRatio.eq(config.feeRatio.xTokenMintFeeRatio.defaultFeeRatio) ||
    !xTokenMintFeeRatio.extraFeeRatio.eq(config.feeRatio.xTokenMintFeeRatio.extraFeeRatio)
  ) {
    const tx = await market.updateMintFeeRatio(
      config.feeRatio.xTokenMintFeeRatio.defaultFeeRatio,
      config.feeRatio.xTokenMintFeeRatio.extraFeeRatio,
      false
    );
    console.log("Market.updateMintFeeRatio, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  const fTokenRedeemFeeRatio = await market.fTokenRedeemFeeRatio();
  if (
    !fTokenRedeemFeeRatio.defaultFeeRatio.eq(config.feeRatio.fTokenRedeemFeeRatio.defaultFeeRatio) ||
    !fTokenRedeemFeeRatio.extraFeeRatio.eq(config.feeRatio.fTokenRedeemFeeRatio.extraFeeRatio)
  ) {
    const tx = await market.updateRedeemFeeRatio(
      config.feeRatio.fTokenRedeemFeeRatio.defaultFeeRatio,
      config.feeRatio.fTokenRedeemFeeRatio.extraFeeRatio,
      true
    );
    console.log("Market.updateRedeemFeeRatio, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  const xTokenRedeemFeeRatio = await market.xTokenRedeemFeeRatio();
  if (
    !xTokenRedeemFeeRatio.defaultFeeRatio.eq(config.feeRatio.xTokenRedeemFeeRatio.defaultFeeRatio) ||
    !xTokenRedeemFeeRatio.extraFeeRatio.eq(config.feeRatio.xTokenRedeemFeeRatio.extraFeeRatio)
  ) {
    const tx = await market.updateRedeemFeeRatio(
      config.feeRatio.xTokenRedeemFeeRatio.defaultFeeRatio,
      config.feeRatio.xTokenRedeemFeeRatio.extraFeeRatio,
      false
    );
    console.log("Market.updateRedeemFeeRatio, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if (!(await market.liquidationWhitelist(KEEPER))) {
    const tx = await market.updateLiquidationWhitelist(KEEPER, true);
    console.log("Market.updateLiquidationWhitelist, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  // Setup StabilityPool
  if ((await stabilityPool.rewardManager(TOKENS.wstETH.address)) === constants.AddressZero) {
    const tx = await stabilityPool.addReward(TOKENS.wstETH.address, treasury.address, 86400 * 7);
    console.log("RebalancePool.addReward, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if ((await stabilityPool.wrapper()) !== wrapper.address) {
    const tx = await stabilityPool.updateWrapper(wrapper.address);
    console.log("RebalancePool.updateWrapper, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if (!(await stabilityPool.liquidatableCollateralRatio()).eq(config.marketConfig.stabilityRatio)) {
    const tx = await stabilityPool.updateLiquidatableCollateralRatio(config.marketConfig.stabilityRatio);
    console.log("RebalancePool.updateLiquidatableCollateralRatio, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  /*
  if ((await treasury.lastPermissionedPrice()).eq(constants.Zero)) {
    const tx = await treasury.initializePrice();
    console.log("Treasury.initializePrice, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
    console.log("Price is:", ethers.utils.formatEther(await treasury.lastPermissionedPrice()));
  }

  if ((await treasury.totalBaseToken()).eq(constants.Zero)) {
    const token = await ethers.getContractAt("IERC20", TOKENS.stETH.address, deployer);
    const steth = await ethers.getContractAt("ILidoStETH", TOKENS.stETH.address, deployer);
    if ((await token.balanceOf(deployer.address)).eq(constants.Zero)) {
      const tx = await steth.submit(constants.AddressZero, { value: ethers.utils.parseEther("0.1") });
      await tx.wait();
    }
    if ((await token.allowance(deployer.address, market.address)).eq(constants.Zero)) {
      const tx = await token.approve(market.address, constants.MaxUint256);
      await tx.wait();
    }

    const tx = await market.mint(ethers.utils.parseEther("0.01"), deployer.address, 0, 0);
    await tx.wait();
  }

  if ((await stabilityPool.liquidator()) === constants.AddressZero) {
    const tx = await stabilityPool.updateLiquidator(liquidator.address);
    console.log("RebalancePool.updateLiquidator, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }
  */
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

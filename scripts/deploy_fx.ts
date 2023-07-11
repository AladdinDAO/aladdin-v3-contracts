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
  StabilityPool,
  LiquidatorWithBonusToken,
  WstETHWrapper,
} from "../typechain";
import { DEPLOYED_CONTRACTS, TOKENS } from "./utils";

const config: {
  initialMintRatio: BigNumber;
  beta: BigNumber;
  marketConfig: {
    stabilityRatio: BigNumber;
    liquidationRatio: BigNumber;
    selfLiquidationRatio: BigNumber;
    recapRatio: BigNumber;
  };

  ProxyAdmin: string;
  Sale: {
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
  Ratio: {
    stabilityPoolRatio: BigNumber;
    harvestBountyRatio: BigNumber;
  };
  impls: { [name: string]: string };
  Liquidator: { [name: string]: string };
  LeveragedToken: string;
  FractionalToken: string;
  stETHTreasury: string;
  StabilityPool: string;
  Market: string;
  ChainlinkTwapOracleV3: string;
  wstETHWrapper: string;
  stETHGateway: string;
} = {
  initialMintRatio: ethers.utils.parseUnits("0.5", 18),
  beta: ethers.utils.parseUnits("0.1", 18),
  marketConfig: {
    stabilityRatio: ethers.utils.parseUnits("1.3", 18),
    liquidationRatio: ethers.utils.parseUnits("1.2", 18),
    selfLiquidationRatio: ethers.utils.parseUnits("1.14", 18),
    recapRatio: ethers.utils.parseUnits("1", 18),
  },

  ProxyAdmin: "0xa569a849bb4E47FE90707209305f001BC976CE57",
  Sale: {
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
  impls: {
    LeveragedToken: "0x2651e295bC2B54BB7c60AB71f8fb0b032eBeBf7d",
    FractionalToken: "0x0e20D8b0EC57cA8157d9bc2BEEc2c28a80Eaae8a",
    stETHTreasury: "0xA6cdB82DD4288b38E691E68b8ecA9FdDe648D60a",
    Market: "0x1AC1aD7Ba1D86A90C23B09FcA9b3F969d00DDCC0",
    StabilityPool: "0xBB8828DDb2774a141EBE3BB449d1cc5BF6212885",
  },
  Ratio: {
    stabilityPoolRatio: ethers.utils.parseEther("0.5"),
    harvestBountyRatio: ethers.utils.parseEther("0.01"),
  },
  Liquidator: {
    LiquidatorWithBonusToken: "0xBED3FEBBB237AeDdAc81904aD49a93143d5026C8",
  },
  ChainlinkTwapOracleV3: "0xEbA9A8fdd2539d33e070c66Afc1127478bA78054",
  FractionalToken: "0xdBB1AAeb04F3B5e2587E4bB849717E9ebD0c8acC",
  LeveragedToken: "0x4eECa6bFa3C96210260691639827eEF4D80FA8C6",
  StabilityPool: "0x719c287932B0ea6037862b4cec4A786939DEb1d8",
  stETHTreasury: "0xe6AAF8fBB56488941f619A9ADB0EB4d89fA9d217",
  Market: "0x7185E3477Ad54A8186e623768833e8C2686591D3",
  wstETHWrapper: "0x7b9Bb9CdBb04BF57F2F82e51D54F6C8ee165FF3B",
  stETHGateway: "0x674A745ADb09c3333D655cC63e2d77ACbE6De935",
};

const maxFeePerGas = 30e9;
const maxPriorityFeePerGas = 1.2e9;

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

  for (const name of ["LeveragedToken", "FractionalToken", "stETHTreasury", "Market", "StabilityPool"]) {
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

  let sale: TokenSale;
  if (config.Sale.address !== "") {
    sale = await ethers.getContractAt("TokenSale", config.Sale.address, deployer);
    console.log(`Found TokenSale at:`, sale.address);
  } else {
    const TokenSale = await ethers.getContractFactory("TokenSale", deployer);
    sale = await TokenSale.deploy(
      TOKENS.WETH.address,
      TOKENS.WETH.address,
      DEPLOYED_CONTRACTS.AladdinZap,
      config.Sale.cap,
      overrides
    );
    console.log(`Deploying TokenSale hash:`, sale.deployTransaction.hash);
    await sale.deployed();
    const receipt = await sale.deployTransaction.wait();
    console.log(`✅ Deploy TokenSale at:`, sale.address, "gas used:", receipt.gasUsed.toString());
    config.Sale.address = sale.address;
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

  if ((await proxyAdmin.getProxyImplementation(treasury.address)) !== config.impls.stETHTreasury) {
    const tx = await proxyAdmin.upgrade(treasury.address, config.impls.stETHTreasury);
    console.log("ProxyAdmin.upgrade, Treasury, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
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

  let stabilityPool: StabilityPool;
  if (config.StabilityPool !== "") {
    stabilityPool = await ethers.getContractAt("StabilityPool", config.StabilityPool, deployer);
    console.log(`Found StabilityPool at:`, stabilityPool.address);
  } else {
    const proxy = await TransparentUpgradeableProxy.deploy(
      config.impls.StabilityPool,
      config.ProxyAdmin,
      "0x",
      overrides
    );
    console.log(`Deploying StabilityPool, hash:`, proxy.deployTransaction.hash);
    const receipt = await proxy.deployTransaction.wait();
    console.log(`✅ Deploy StabilityPool, at:`, proxy.address, "gas used:", receipt.gasUsed.toString());

    stabilityPool = await ethers.getContractAt("StabilityPool", proxy.address, deployer);
    config.StabilityPool = stabilityPool.address;
  }

  if ((await proxyAdmin.getProxyImplementation(market.address)) !== config.impls.Market) {
    const tx = await proxyAdmin.upgrade(market.address, config.impls.Market);
    console.log("ProxyAdmin.upgrade, Market, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if ((await proxyAdmin.getProxyImplementation(stabilityPool.address)) !== config.impls.StabilityPool) {
    const tx = await proxyAdmin.upgrade(stabilityPool.address, config.impls.StabilityPool);
    console.log("ProxyAdmin.upgrade, StabilityPool, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

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

  let liquidator: LiquidatorWithBonusToken;
  if (config.Liquidator.LiquidatorWithBonusToken !== "") {
    liquidator = await ethers.getContractAt(
      "LiquidatorWithBonusToken",
      config.Liquidator.LiquidatorWithBonusToken,
      deployer
    );
    console.log(`Found LiquidatorWithBonusToken at:`, liquidator.address);
  } else {
    const LiquidatorWithBonusToken = await ethers.getContractFactory("LiquidatorWithBonusToken", deployer);
    liquidator = await LiquidatorWithBonusToken.deploy(stabilityPool.address, TOKENS.WETH.address);

    console.log(`Deploying LiquidatorWithBonusToken hash:`, gateway.deployTransaction.hash);
    await liquidator.deployed();
    const receipt = await liquidator.deployTransaction.wait();
    console.log(`✅ Deploy LiquidatorWithBonusToken at:`, liquidator.address, "gas used:", receipt.gasUsed.toString());
    config.Liquidator.LiquidatorWithBonusToken = liquidator.address;
  }

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
      config.beta
    );
    console.log("Initialize Treasury, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if ((await market.treasury()) === constants.AddressZero) {
    const tx = await market.initialize(treasury.address, deployer.address);
    console.log("Initialize Market, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if ((await stabilityPool.market()) === constants.AddressZero) {
    const tx = await stabilityPool.initialize(treasury.address, market.address);
    console.log("Initialize StabilityPool, hash:", tx.hash);
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

  if ((await treasury.lastPermissionedPrice()).eq(constants.Zero)) {
    const tx = await treasury.initializePrice();
    console.log("Treasury.initializePrice, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
    console.log("Price is:", ethers.utils.formatEther(await treasury.lastPermissionedPrice()));
  }

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

  if ((await market.marketConfig()).stabilityRatio.eq(constants.Zero)) {
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

  if ((await stabilityPool.rewardManager(TOKENS.wstETH.address)) === constants.AddressZero) {
    const tx = await stabilityPool.addReward(TOKENS.wstETH.address, treasury.address, 86400 * 7);
    console.log("StabilityPool.addReward, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if ((await stabilityPool.liquidator()) === constants.AddressZero) {
    const tx = await stabilityPool.updateLiquidator(liquidator.address);
    console.log("StabilityPool.updateLiquidator, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if ((await stabilityPool.wrapper()) !== wrapper.address) {
    const tx = await stabilityPool.updateWrapper(wrapper.address);
    console.log("StabilityPool.updateWrapper, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if (!(await stabilityPool.liquidatableCollateralRatio()).eq(config.marketConfig.stabilityRatio)) {
    const tx = await stabilityPool.updateLiquidatableCollateralRatio(config.marketConfig.stabilityRatio);
    console.log("StabilityPool.updateLiquidatableCollateralRatio, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  console.log(await liquidator.callStatic.liquidate(0));

  /*
  if (!(await sale.priceData()).initialPrice.eq(config.Sale.price.InitialPrice)) {
    const tx = await sale.updatePrice(
      config.Sale.price.InitialPrice,
      config.Sale.price.UpRatio,
      config.Sale.price.Variation
    );
    console.log("TokenSale.updatePrice, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  const saleTime = await sale.saleTimeData();
  if (
    !saleTime.whitelistSaleTime.eq(config.Sale.time.WhitelistStartTime) ||
    !saleTime.publicSaleTime.eq(config.Sale.time.PublicStartTime) ||
    !saleTime.saleDuration.eq(config.Sale.time.SaleDuration)
  ) {
    const tx = await sale.updateSaleTime(
      config.Sale.time.WhitelistStartTime,
      config.Sale.time.PublicStartTime,
      config.Sale.time.SaleDuration
    );
    console.log("TokenSale.updateSaleTime, hash:", tx.hash);
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

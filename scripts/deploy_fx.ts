/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { BigNumber, constants, Contract } from "ethers";
import { ethers } from "hardhat";
import {
  ChainlinkTwapOracleV3,
  ETHGateway,
  FractionalToken,
  LeveragedToken,
  Market,
  ProxyAdmin,
  Treasury,
} from "../typechain";
import { TOKENS } from "./utils";

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
    time: { WhitelistStartTime: number; PublicStartTime: number; SaleDuration: number };
    price: {
      InitialPrice: BigNumber;
      UpRatio: BigNumber;
      Variation: BigNumber;
    };
    address: string;
  };
  impls: { [name: string]: string };

  LeveragedToken: string;
  FractionalToken: string;
  Treasury: string;
  Market: string;
  ChainlinkTwapOracleV3: string;
  ETHGateway: string;
} = {
  initialMintRatio: ethers.utils.parseUnits("0.5", 18),
  beta: ethers.utils.parseUnits("0.1", 18),
  marketConfig: {
    stabilityRatio: ethers.utils.parseUnits("1.3", 18),
    liquidationRatio: ethers.utils.parseUnits("1.2", 18),
    selfLiquidationRatio: ethers.utils.parseUnits("1.14", 18),
    recapRatio: ethers.utils.parseUnits("1", 18),
  },

  ProxyAdmin: "0x588b85AA6074CcABE631D739eD42aa355012a534",
  Sale: {
    time: { WhitelistStartTime: 0, PublicStartTime: 0, SaleDuration: 0 },
    price: {
      InitialPrice: constants.Zero,
      UpRatio: constants.Zero,
      Variation: constants.Zero,
    },
    address: constants.AddressZero,
  },
  impls: {
    LeveragedToken: "0x9176e7145d3820CC658cD2C61c17A1BBa7F2B2BA",
    FractionalToken: "0x695EB50A92AD2AEBB89C6dD1f3c7546A28411403",
    Treasury: "0x789E729713ddC80cf2db4e59ca064D3770f1A034",
    Market: "0x719c287932B0ea6037862b4cec4A786939DEb1d8",
  },
  ChainlinkTwapOracleV3: "0x32366846354DB5C08e92b4Ab0D2a510b2a2380C8",
  FractionalToken: "0x85F560f5b00205bDee15D7998E731F60ef1d1Fc3",
  LeveragedToken: "0x01949D63B4d42278a4A7F1D184b78c85d8c53001",
  Treasury: "0x12eD4197A9121E67EBe876C20aB65247c1830f2b",
  Market: "0x81242a5A4ba8F8734fE518CBf45942F09932157c",
  ETHGateway: "0x07eD30C1bcd4D8DC2D8d45c2215362917Cc24B60",
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

  for (const name of ["LeveragedToken", "FractionalToken", "Treasury", "Market"]) {
    if (config.impls[name] === "") {
      const Contract = await ethers.getContractFactory(name, deployer);
      let impl: Contract;
      if (name === "Treasury") {
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

  let treasury: Treasury;
  if (config.Treasury !== "") {
    treasury = await ethers.getContractAt("Treasury", config.Treasury, deployer);
    console.log(`Found Treasury at:`, treasury.address);
  } else {
    const proxy = await TransparentUpgradeableProxy.deploy(config.impls.Treasury, config.ProxyAdmin, "0x", overrides);
    console.log(`Deploying treasury, hash:`, proxy.deployTransaction.hash);
    const receipt = await proxy.deployTransaction.wait();
    console.log(`✅ Deploy treasury, at:`, proxy.address, "gas used:", receipt.gasUsed.toString());

    treasury = await ethers.getContractAt("Treasury", proxy.address, deployer);
    config.Treasury = treasury.address;
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

  if ((await proxyAdmin.getProxyImplementation(market.address)) !== config.impls.Market) {
    const tx = await proxyAdmin.upgrade(market.address, config.impls.Market);
    console.log("ProxyAdmin.upgrade, Market, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  let gateway: ETHGateway;
  if (config.ETHGateway !== "") {
    gateway = await ethers.getContractAt("ETHGateway", config.ETHGateway, deployer);
    console.log(`Found ETHGateway at:`, gateway.address);
  } else {
    const ETHGateway = await ethers.getContractFactory("ETHGateway", deployer);
    gateway = await ETHGateway.deploy(market.address, TOKENS.WETH.address, fETH.address, xETH.address);

    console.log(`Deploying ETHGateway hash:`, gateway.deployTransaction.hash);
    await gateway.deployed();
    const receipt = await gateway.deployTransaction.wait();
    console.log(`✅ Deploy ETHGateway at:`, gateway.address, "gas used:", receipt.gasUsed.toString());
    config.ETHGateway = gateway.address;
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
      TOKENS.WETH.address,
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

  if ((await treasury.priceOracle()) !== oracle.address) {
    const tx = await treasury.updatePriceOracle(oracle.address);
    console.log("Treasury.updatePriceOracle, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
  }

  if ((await treasury.lastPermissionedPrice()).eq(constants.Zero)) {
    const tx = await treasury.initializePrice();
    console.log("Treasury.initializePrice, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done,", "gas used:", receipt.gasUsed.toString());
    console.log("Price is:", ethers.utils.formatEther(await treasury.lastPermissionedPrice()));
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
    const token = await ethers.getContractAt("IERC20", TOKENS.WETH.address, deployer);
    const weth = await ethers.getContractAt("IWETH", TOKENS.WETH.address, deployer);
    if ((await token.balanceOf(deployer.address)).eq(constants.Zero)) {
      const tx = await weth.deposit({ value: ethers.utils.parseEther("0.1") });
      await tx.wait();
    }
    if ((await token.allowance(deployer.address, market.address)).eq(constants.Zero)) {
      const tx = await token.approve(market.address, constants.MaxUint256);
      await tx.wait();
    }

    const tx = await market.mint(ethers.utils.parseEther("0.01"), deployer.address, 0, 0);
    await tx.wait();
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

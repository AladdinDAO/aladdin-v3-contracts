/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { request_fork } from "@/test/utils";
import { FxCVXOracle } from "@/types/index";
import { SpotPriceEncodings, encodeChainlinkPriceFeed, encodeSpotPriceSources } from "@/utils/index";

const FORK_HEIGHT = 20139170;

const CHAINLINK_ETH_USD = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
const CHAINLINK_CVX_USD = "0xd962fC30A72A84cE50161031391756Bf2876Af5D";

describe("FxCVXOracle.spec", async () => {
  let deployer: HardhatEthersSigner;

  let oracle: FxCVXOracle;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [ZeroAddress]);
    deployer = await ethers.getSigner(ZeroAddress);

    const SpotPriceOracle = await ethers.getContractFactory("SpotPriceOracle", deployer);
    const spot = await SpotPriceOracle.deploy();

    const FxChainlinkTwapOracle = await ethers.getContractFactory("FxChainlinkTwapOracle", deployer);
    const ETH_USDTwap = await FxChainlinkTwapOracle.deploy(60 * 30, CHAINLINK_ETH_USD, 1, 3600 * 3, "ETH/USD");
    const CVX_USDTwap = await FxChainlinkTwapOracle.deploy(60 * 30, CHAINLINK_CVX_USD, 1, 86400 * 2, "CVX/USD");

    const FxCVXOracle = await ethers.getContractFactory("FxCVXOracle", deployer);
    oracle = await FxCVXOracle.deploy(
      spot.getAddress(),
      "0x" +
        encodeChainlinkPriceFeed(CHAINLINK_ETH_USD, 10n ** 10n, 3600 * 3)
          .toString(16)
          .padStart(64, "0"),
      ETH_USDTwap.getAddress(),
      CVX_USDTwap.getAddress()
    );

    await oracle.updateOnchainSpotEncodings(SpotPriceEncodings["WETH/USDC"], 0);
    await oracle.updateOnchainSpotEncodings(SpotPriceEncodings["CVX/WETH"], 1);
    await oracle.updateOnchainSpotEncodings(encodeSpotPriceSources([]), 2);
    await oracle.updateMaxPriceDeviation(ethers.parseEther("0.02"));
  });

  it("should succeed when normal", async () => {
    const ETH_USD_SpotPrices = await oracle.getETHUSDSpotPrices();
    console.log("ETH/USD:", ETH_USD_SpotPrices.map((x) => ethers.formatEther(x)).join(","));
    const CVX_ETH_SpotPrices = await oracle.getERC20ETHSpotPrices();
    console.log("CVX/ETH:", CVX_ETH_SpotPrices.map((x) => ethers.formatEther(x)).join(","));
    const CVX_USD_SpotPrices = await oracle.getERC20USDSpotPrices();
    expect(CVX_USD_SpotPrices.length).to.eq(0);
    const [ETHUSDChainlink, ETHUSDMinPrice, ETHUSDMaxPrice] = await oracle.getETHUSDSpotPrice();
    console.log(
      `ETHUSDChainlink[${ethers.formatEther(ETHUSDChainlink)}]`,
      `ETHUSDMinPrice[${ethers.formatEther(ETHUSDMinPrice)}]`,
      `ETHUSDMaxPrice[${ethers.formatEther(ETHUSDMaxPrice)}]`
    );

    const [isValid, twap, minPrice, maxPrice] = await oracle.getPrice();
    const gas = await oracle.getPrice.estimateGas();
    console.log(
      `isValid[${isValid}]`,
      `twap[${ethers.formatEther(twap)}]`,
      `minPrice[${ethers.formatEther(minPrice)}]`,
      `maxPrice[${ethers.formatEther(maxPrice)}]`,
      `GasEstimated[${gas - 21000n}]`
    );
    expect(isValid).to.eq(true);
  });
});

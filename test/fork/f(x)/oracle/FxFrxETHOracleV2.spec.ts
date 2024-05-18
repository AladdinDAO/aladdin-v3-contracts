/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { request_fork } from "@/test/utils";
import { FxFrxETHOracleV2 } from "@/types/index";
import { ADDRESS, SpotPriceEncodings, encodeChainlinkPriceFeed, encodeSpotPriceSources } from "@/utils/index";

const FORK_HEIGHT = 19752120;

const CHAINLINK_ETH_USD = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";

describe("FxFrxETHOracleV2.spec", async () => {
  let deployer: HardhatEthersSigner;

  let oracle: FxFrxETHOracleV2;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [ZeroAddress]);
    deployer = await ethers.getSigner(ZeroAddress);

    const SpotPriceOracle = await ethers.getContractFactory("SpotPriceOracle", deployer);
    const spot = await SpotPriceOracle.deploy();

    const FxChainlinkTwapOracle = await ethers.getContractFactory("FxChainlinkTwapOracle", deployer);
    const twap = await FxChainlinkTwapOracle.deploy(60 * 30, CHAINLINK_ETH_USD, 1, 3600 * 3, "ETH/USD");

    const FxFrxETHOracleV2 = await ethers.getContractFactory("FxFrxETHOracleV2", deployer);
    oracle = await FxFrxETHOracleV2.deploy(
      spot.getAddress(),
      "0x" +
        encodeChainlinkPriceFeed(CHAINLINK_ETH_USD, 10n ** 10n, 3600 * 3)
          .toString(16)
          .padStart(64, "0"),
      twap.getAddress(),
      ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"]
    );

    await oracle.updateOnchainSpotEncodings(SpotPriceEncodings["WETH/USDC"], 0);
    await oracle.updateOnchainSpotEncodings(SpotPriceEncodings["frxETH/WETH"], 1);
    await oracle.updateOnchainSpotEncodings(encodeSpotPriceSources([]), 2);
  });

  it("should succeed when normal", async () => {
    const ETH_USD_SpotPrices = await oracle.getETHUSDSpotPrices();
    console.log("ETH/USD:", ETH_USD_SpotPrices.map((x) => ethers.formatEther(x)).join(","));
    const frxETH_ETH_SpotPrices = await oracle.getLSDETHSpotPrices();
    console.log("frxETH/ETH:", frxETH_ETH_SpotPrices.map((x) => ethers.formatEther(x)).join(","));
    const frxETH_USD_SpotPrices = await oracle.getLSDUSDSpotPrices();
    expect(frxETH_USD_SpotPrices.length).to.eq(0);
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

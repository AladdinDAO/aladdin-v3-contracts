/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { request_fork } from "@/test/utils";
import { FxEETHOracleV2 } from "@/types/index";
import { SpotPriceEncodings, encodeChainlinkPriceFeed, encodeSpotPriceSources } from "@/utils/index";

const FORK_HEIGHT = 19752120;

const CHAINLINK_ETH_USD = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
const RedStone_weETH_ETH = "0x8751F736E94F6CD167e8C5B97E245680FbD9CC36";

describe("FxEETHOracleV2.spec", async () => {
  let deployer: HardhatEthersSigner;

  let oracle: FxEETHOracleV2;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [ZeroAddress]);
    deployer = await ethers.getSigner(ZeroAddress);

    const SpotPriceOracle = await ethers.getContractFactory("SpotPriceOracle", deployer);
    const spot = await SpotPriceOracle.deploy();

    const FxChainlinkTwapOracle = await ethers.getContractFactory("FxChainlinkTwapOracle", deployer);
    const ETH_USDTwap = await FxChainlinkTwapOracle.deploy(60 * 30, CHAINLINK_ETH_USD, 1, 3600 * 3, "ETH/USD");
    const weETH_ETHTwap = await FxChainlinkTwapOracle.deploy(60 * 30, RedStone_weETH_ETH, 1, 86400 * 2, "weETH/ETH");

    const FxEETHOracleV2 = await ethers.getContractFactory("FxEETHOracleV2", deployer);
    oracle = await FxEETHOracleV2.deploy(
      spot.getAddress(),
      "0x" +
        encodeChainlinkPriceFeed(CHAINLINK_ETH_USD, 10n ** 10n, 3600 * 3)
          .toString(16)
          .padStart(64, "0"),
      ETH_USDTwap.getAddress(),
      weETH_ETHTwap.getAddress()
    );

    await oracle.updateOnchainSpotEncodings(SpotPriceEncodings["WETH/USDC"], 0);
    await oracle.updateOnchainSpotEncodings(SpotPriceEncodings["eETH/WETH"], 1);
    await oracle.updateOnchainSpotEncodings(encodeSpotPriceSources([]), 2);
  });

  it("should succeed when normal", async () => {
    const ETH_USD_SpotPrices = await oracle.getETHUSDSpotPrices();
    console.log("ETH/USD:", ETH_USD_SpotPrices.map((x) => ethers.formatEther(x)).join(","));
    const eETH_ETH_SpotPrices = await oracle.getLSDETHSpotPrices();
    console.log("eETH/ETH:", eETH_ETH_SpotPrices.map((x) => ethers.formatEther(x)).join(","));
    const eETH_USD_SpotPrices = await oracle.getLSDUSDSpotPrices();
    expect(eETH_USD_SpotPrices.length).to.eq(0);
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

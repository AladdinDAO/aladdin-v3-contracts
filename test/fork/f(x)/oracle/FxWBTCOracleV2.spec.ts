/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { request_fork } from "@/test/utils";
import { FxWBTCOracleV2 } from "@/types/index";
import { SpotPriceEncodings } from "@/utils/index";

const FORK_HEIGHT = 19752120;

const CHAINLINK_BTC_USD = "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c";
const CHAINLINK_WBTC_BTC = "0xfdFD9C85aD200c506Cf9e21F1FD8dd01932FBB23";

describe("FxWBTCOracleV2.spec", async () => {
  let deployer: HardhatEthersSigner;

  let oracle: FxWBTCOracleV2;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [ZeroAddress]);
    deployer = await ethers.getSigner(ZeroAddress);

    const SpotPriceOracle = await ethers.getContractFactory("SpotPriceOracle", deployer);
    const spot = await SpotPriceOracle.deploy();

    const FxChainlinkTwapOracle = await ethers.getContractFactory("FxChainlinkTwapOracle", deployer);
    const BTC_USDTwap = await FxChainlinkTwapOracle.deploy(60 * 30, CHAINLINK_BTC_USD, 1, 3600 * 3, "BTC/USD");
    const WBTC_BTCTwap = await FxChainlinkTwapOracle.deploy(60 * 30, CHAINLINK_WBTC_BTC, 1, 86400 * 2, "WBTC/BTC");

    const FxWBTCOracleV2 = await ethers.getContractFactory("FxWBTCOracleV2", deployer);
    oracle = await FxWBTCOracleV2.deploy(spot.getAddress(), BTC_USDTwap.getAddress(), WBTC_BTCTwap.getAddress());

    await oracle.updateOnchainSpotEncodings(SpotPriceEncodings["WBTC/USDC"]);
  });

  it("should succeed when normal", async () => {
    const WBTC_USD_SpotPrices = await oracle.getBTCDerivativeUSDSpotPrices();
    console.log("WBTC/USD:", WBTC_USD_SpotPrices.map((x) => ethers.formatEther(x)).join(","));
    const [WBTCUSDChainlink, WBTCUSDMinPrice, WBTCUSDMaxPrice] = await oracle.getBTCDerivativeUSDSpotPrices();
    console.log(
      `WBTCUSDChainlink[${ethers.formatEther(WBTCUSDChainlink)}]`,
      `WBTCUSDMinPrice[${ethers.formatEther(WBTCUSDMinPrice)}]`,
      `WBTCUSDMaxPrice[${ethers.formatEther(WBTCUSDMaxPrice)}]`
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

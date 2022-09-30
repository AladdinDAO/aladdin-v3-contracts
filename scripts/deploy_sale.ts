/* eslint-disable node/no-missing-import */
import { BigNumber, constants } from "ethers";
import { ethers } from "hardhat";
import { TokenSale } from "../typechain";
import { ADDRESS, DEPLOYED_CONTRACTS, ZAP_ROUTES } from "./utils";

const config: {
  time: { WhitelistStartTime: number; PublicStartTime: number; SaleDuration: number };
  price: {
    InitialPrice: BigNumber;
    UpRatio: BigNumber;
    Variation: BigNumber;
  };
  TokenSale: string;
} = {
  time: { WhitelistStartTime: 1664978400 - 1, PublicStartTime: 1664978400, SaleDuration: 86400 * 7 },
  price: {
    InitialPrice: ethers.utils.parseEther("1"),
    UpRatio: ethers.utils.parseUnits("0", 9),
    Variation: ethers.utils.parseEther("10000"),
  },
  TokenSale: "0x07867298d99B95772008583bd603cfA68B8C75E7",
};

const WETH = ADDRESS.WETH;
const CVX = ADDRESS.CVX;
const USDC = ADDRESS.USDC;

let sale: TokenSale;

async function main() {
  const [deployer] = await ethers.getSigners();

  if (config.TokenSale !== "") {
    sale = await ethers.getContractAt("TokenSale", config.TokenSale, deployer);
    console.log("Found TokenSale at:", sale.address);
  } else {
    const TokenSale = await ethers.getContractFactory("TokenSale", deployer);
    sale = await TokenSale.deploy(WETH, CVX, DEPLOYED_CONTRACTS.AladdinZap, ethers.utils.parseEther("100000"));
    await sale.deployed();
    config.TokenSale = sale.address;
    console.log("Deploy TokenSale at:", sale.address);
  }

  const times = await sale.saleTimeData();
  if (
    !times.whitelistSaleTime.eq(config.time.WhitelistStartTime) ||
    !times.publicSaleTime.eq(config.time.PublicStartTime) ||
    !times.saleDuration.eq(config.time.SaleDuration)
  ) {
    const tx = await sale.updateSaleTime(
      config.time.WhitelistStartTime,
      config.time.PublicStartTime,
      config.time.SaleDuration
    );
    console.log("Update Sale Time, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }
  const price = await sale.priceData();
  if (
    !price.initialPrice.eq(config.price.InitialPrice) ||
    price.upRatio !== config.price.UpRatio.toNumber() ||
    !price.variation.eq(config.price.Variation)
  ) {
    const tx = await sale.updatePrice(config.price.InitialPrice, config.price.UpRatio, config.price.Variation);
    console.log("Update Price, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }
  if (!(await sale.isSupported(WETH))) {
    const tx = await sale.updateSupportedTokens([WETH, constants.AddressZero, USDC, CVX], true);
    console.log("Update Supported Tokens, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }
  console.log(`from[${WETH}]`, `to[${CVX}]`, `route[${ZAP_ROUTES.WETH.CVX.map((r) => `"${r.toHexString()}"`)}]`);
  console.log(`from[${USDC}]`, `to[${CVX}]`, `route[${ZAP_ROUTES.USDC.CVX.map((r) => `"${r.toHexString()}"`)}]`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

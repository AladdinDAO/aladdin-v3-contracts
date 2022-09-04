/* eslint-disable node/no-missing-import */
import { constants } from "ethers";
import { ethers } from "hardhat";
import { CLeverToken, Vesting, TokenSale } from "../typechain";
import { ADDRESS, DEPLOYED_CONTRACTS, ZAP_ROUTES } from "./utils";

const config: {
  token: string;
  vest: string;
  sale: string;
} = {
  token: "0x544967DE46AfEFf2eeD153F5970992Fa95eF740B",
  vest: "0x84C82d43f1Cc64730849f3E389fE3f6d776F7A4E",
  sale: "0xB9CD9979718e7E4C341D8D99dA3F1290c908FBdd",
};

const WETH = ADDRESS.WETH;
const CVX = ADDRESS.CVX;
const USDC = ADDRESS.USDC;

let token: CLeverToken;
let vest: Vesting;
let sale: TokenSale;

async function main() {
  const [deployer] = await ethers.getSigners();

  if (config.token !== "") {
    token = await ethers.getContractAt("CLeverToken", config.token, deployer);
    console.log("Found Token at:", token.address);
  } else {
    const CLeverToken = await ethers.getContractFactory("CLeverToken", deployer);
    token = await CLeverToken.deploy("CLEV", "CLEV");
    await token.deployed();
    config.token = token.address;
    console.log("Deploy Token at:", token.address);
  }

  if (config.vest !== "") {
    vest = await ethers.getContractAt("Vesting", config.vest, deployer);
    console.log("Found Vesting at:", vest.address);
  } else {
    const Vesting = await ethers.getContractFactory("Vesting", deployer);
    vest = await Vesting.deploy(token.address);
    await vest.deployed();
    config.vest = vest.address;
    console.log("Deploy Vesting at:", vest.address);
  }

  if (config.sale !== "") {
    sale = await ethers.getContractAt("TokenSale", config.sale, deployer);
    console.log("Found TokenSale at:", sale.address);
  } else {
    const TokenSale = await ethers.getContractFactory("TokenSale", deployer);
    sale = await TokenSale.deploy(WETH, CVX, DEPLOYED_CONTRACTS.AladdinZap, ethers.utils.parseEther("1000000"));
    await sale.deployed();
    config.sale = sale.address;
    console.log("Deploy TokenSale at:", sale.address);
  }

  const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
  await sale.updateSaleTime(timestamp + 1000, timestamp + 86400 * 5, 86400 * 5);
  await sale.updatePrice(
    ethers.utils.parseEther("1"),
    ethers.utils.parseUnits("0", 9),
    ethers.utils.parseEther("100000")
  );
  await sale.updateSupportedTokens([WETH, constants.AddressZero, USDC, CVX], true);
  // await sale.callStatic.buy(constants.AddressZero, 1, 0, { value: 1 });
  console.log(`from[${WETH}]`, `to[${CVX}]`, `route[${ZAP_ROUTES.WETH.CVX.map((r) => `"${r.toHexString()}"`)}]`);
  console.log(`from[${USDC}]`, `to[${CVX}]`, `route[${ZAP_ROUTES.USDC.CVX.map((r) => `"${r.toHexString()}"`)}]`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

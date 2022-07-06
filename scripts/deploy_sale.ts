/* eslint-disable node/no-missing-import */
import { ethers } from "hardhat";
import { AladdinZap, CLeverToken, ProxyAdmin, Vesting, TokenSale } from "../typechain";
import { ADDRESS } from "./utils";

const config: {
  proxyAdmin?: string;
  aladdinZap?: string;
  token?: string;
  vest?: string;
  sale?: string;
} = {
  proxyAdmin: "0xf05e58fCeA29ab4dA01A495140B349F8410Ba904",
  aladdinZap: "0xCe4dCc5028588377E279255c0335Effe2d7aB72a",
  token: "0xdC846CcbCe1Be474E6410445ef5223CA00eCed94",
  vest: "0x96C68D861aDa016Ed98c30C810879F9df7c64154",
  sale: "0xf293d3281F1a4222E1547faf935b4a93d20556DA",
};

const WETH = ADDRESS.WETH;

let proxyAdmin: ProxyAdmin;
let aladdinZap: AladdinZap;
let token: CLeverToken;
let vest: Vesting;
let sale: TokenSale;

async function main() {
  const [deployer] = await ethers.getSigners();

  if (config.proxyAdmin) {
    proxyAdmin = await ethers.getContractAt("ProxyAdmin", config.proxyAdmin, deployer);
    console.log("Found ProxyAdmin at:", proxyAdmin.address);
  } else {
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin", deployer);
    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    console.log("Deploy ProxyAdmin at:", proxyAdmin.address);
  }

  if (config.aladdinZap) {
    aladdinZap = await ethers.getContractAt("AladdinZap", config.aladdinZap, deployer);
    console.log("Found AladdinZap at:", aladdinZap.address);
  } else {
    const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
    const impl = await AladdinZap.deploy();
    await impl.deployed();
    console.log("Deploy AladdinZap Impl at:", impl.address);

    const data = impl.interface.encodeFunctionData("initialize");
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(impl.address, proxyAdmin.address, data);
    await proxy.deployed();
    aladdinZap = await ethers.getContractAt("AladdinZap", proxy.address, deployer);
    console.log("Deploy AladdinZap at:", proxy.address);
  }

  if (config.token) {
    token = await ethers.getContractAt("CLeverToken", config.token, deployer);
    console.log("Found Token at:", token.address);
  } else {
    const CLeverToken = await ethers.getContractFactory("CLeverToken", deployer);
    token = await CLeverToken.deploy("CLEV", "CLEV");
    await token.deployed();
    config.token = token.address;
    console.log("Deploy Token at:", token.address);
  }

  if (config.vest) {
    vest = await ethers.getContractAt("Vesting", config.vest, deployer);
    console.log("Found Vesting at:", vest.address);
  } else {
    const Vesting = await ethers.getContractFactory("Vesting", deployer);
    vest = await Vesting.deploy(token.address);
    await vest.deployed();
    config.vest = vest.address;
    console.log("Deploy Vesting at:", vest.address);
  }

  if (config.sale) {
    sale = await ethers.getContractAt("TokenSale", config.sale, deployer);
    console.log("Found TokenSale at:", sale.address);
  } else {
    const TokenSale = await ethers.getContractFactory("TokenSale", deployer);
    sale = await TokenSale.deploy(WETH, token.address, WETH, aladdinZap.address, ethers.utils.parseEther("1000000"));
    await sale.deployed();
    config.sale = sale.address;
    console.log("Deploy TokenSale at:", sale.address);
  }

  await sale.updateSaleTime(1650758400 + 86400, 1651017600 + 86400, 432000);
  await sale.updatePrice(
    ethers.utils.parseEther("0.001"),
    ethers.utils.parseUnits("0.05", 9),
    ethers.utils.parseEther("100000")
  );
  await sale.transferOwnership("0xb9a1649b31FC2De6bbE78672A3d6EbecFa69B56b");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

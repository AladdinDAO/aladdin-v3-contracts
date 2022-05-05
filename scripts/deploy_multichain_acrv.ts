/* eslint-disable node/no-missing-import */
import * as dotenv from "dotenv";
import { constants, Wallet } from "ethers";

import { ethers, network } from "hardhat";
import {
  ProxyAdmin,
  CrossChainCallProxy,
  FantomCRVDepositor,
  PolygonCRVDepositor,
  FantomACRVProxy,
  PolygonACRVProxy,
} from "../typechain";

dotenv.config();

const ANYCALL_PROXY = "0x37414a8662bC1D25be3ee51Fb27C2686e2490A89";
const ANYSWAP_ROUTER: { [network: string]: string } = {
  mainnet: "0x765277EebeCA2e31912C9946eAe1021199B39C61",
  fantom: "0xb576C9403f39829565BD6051695E2AC7Ecf850E2",
  polygon: "0x6fF0609046A38D76Bd40C5863b4D1a2dCe687f73",
};
const CRV: { [network: string]: string } = {
  mainnet: "0xD533a949740bb3306d119CC777fa900bA034cd52",
  fantom: "0x1E4F97b9f9F913c46F1632781732927B9019C68b",
  polygon: "0x172370d5Cd63279eFa6d502DAB29171933a610AF",
};
const ACRV: { [network: string]: string } = {
  mainnet: "0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884",
  fantom: "0x666a3776b3e82F171CB1dFF7428B6808D2Cd7d02",
  polygon: "0x89C90E480A39fBE3886bB5bD53ba5B1Acc69D4Fb",
};

const config: {
  proxyAdmin: { [network: string]: string };
  crossChainCallProxy: { [network: string]: string };
  acrvProxy: { [network: string]: string };
  fantomDepositor?: string;
  polygonDepositor?: string;
} = {
  proxyAdmin: {
    mainnet: "0x12b1326459d72F2Ab081116bf27ca46cD97762A0",
    polygon: "0x71Fb0cc62139766383C0F09F1E31375023592841",
    fantom: "0x12b1326459d72F2Ab081116bf27ca46cD97762A0",
  },
  crossChainCallProxy: {
    polygon: "0xac0250EE662A9A00E0B45f5b596500bBb54EF907",
    fantom: "0xac0250EE662A9A00E0B45f5b596500bBb54EF907",
  },
  fantomDepositor: "0x200282c631ba9BcA2d5aA2447E798aF698987871",
  polygonDepositor: "0x94BF442b38061Fe523Ec03F8eA5fd26A0D73bCc9",
  acrvProxy: {},
};

let proxyAdmin: ProxyAdmin;
let crossChainCallProxy: CrossChainCallProxy;
let fantomACRVProxy: FantomACRVProxy;
let polygonACRVProxy: PolygonACRVProxy;
let fantomDepositor: FantomCRVDepositor;
let polygonDepositor: PolygonCRVDepositor;

async function main() {
  console.log("Current Network:", network.name);

  const [deployer] = await ethers.getSigners();
  const crossChainCallProxyDeployer = new Wallet(process.env.PRIVATE_KEY_CROSS_CHAIN_CALL_PROXY!, ethers.provider);
  const fantomDeployer = new Wallet(process.env.PRIVATE_KEY_FANTOM!, ethers.provider);
  const polygonDeployer = new Wallet(process.env.PRIVATE_KEY_POLYGON!, ethers.provider);
  console.log("deployer:", deployer.address);
  console.log("crossChainCallProxyDeployer:", crossChainCallProxyDeployer.address);
  console.log("fantomDeployer:", fantomDeployer.address);
  console.log("polygonDeployer:", polygonDeployer.address);

  if (config.proxyAdmin[network.name]) {
    proxyAdmin = await ethers.getContractAt("ProxyAdmin", config.proxyAdmin[network.name], deployer);
    console.log("Found ProxyAdmin at:", proxyAdmin.address);
  } else {
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin", deployer);
    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    config.proxyAdmin[network.name] = proxyAdmin.address;
    console.log("Deploy ProxyAdmin at:", proxyAdmin.address);
  }

  if (config.crossChainCallProxy[network.name]) {
    crossChainCallProxy = await ethers.getContractAt(
      "CrossChainCallProxy",
      config.crossChainCallProxy[network.name],
      crossChainCallProxyDeployer
    );
    console.log("Found CrossChainCallProxy at:", crossChainCallProxy.address);
  } else {
    const CrossChainCallProxy = await ethers.getContractFactory("CrossChainCallProxy", crossChainCallProxyDeployer);
    crossChainCallProxy = await CrossChainCallProxy.deploy(ANYCALL_PROXY);
    await crossChainCallProxy.deployed();
    config.crossChainCallProxy[network.name] = crossChainCallProxy.address;
    console.log("Deploy CrossChainCallProxy at:", crossChainCallProxy.address);
  }

  if (network.name === "mainnet") {
    // deploy ACRVProxy with fantomDeployer or polygonDeployer
  } else if (network.name === "fantom") {
    if (config.fantomDepositor) {
      fantomDepositor = await ethers.getContractAt("FantomCRVDepositor", config.fantomDepositor, deployer);
      console.log("Found FantomCRVDepositor at:", fantomDepositor.address);
    } else {
      const FantomCRVDepositor = await ethers.getContractFactory("FantomCRVDepositor", fantomDeployer);
      const impl = await FantomCRVDepositor.deploy({ nonce: 0, gasPrice: 500 * 1e9 });
      await impl.deployed();
      console.log("Deploy FantomCRVDepositor Impl at:", impl.address);

      const data = impl.interface.encodeFunctionData("initialize", [
        ANYCALL_PROXY,
        ANYSWAP_ROUTER[network.name],
        crossChainCallProxy.address,
        deployer.address,
        CRV[network.name],
        ACRV[network.name],
        deployer.address, // change it later
      ]);
      const TransparentUpgradeableProxy = await ethers.getContractFactory(
        "TransparentUpgradeableProxy",
        fantomDeployer
      );
      const proxy = await TransparentUpgradeableProxy.deploy(impl.address, proxyAdmin.address, data, {
        nonce: 1,
        gasPrice: 500 * 1e9,
      });
      await proxy.deployed();
      fantomDepositor = await ethers.getContractAt("FantomCRVDepositor", proxy.address, fantomDeployer);
      console.log("Deploy FantomCRVDepositor at:", fantomDepositor.address);
    }
  } else if (network.name === "polygon") {
    if (config.polygonDepositor) {
      polygonDepositor = await ethers.getContractAt("PolygonCRVDepositor", config.polygonDepositor, deployer);
      console.log("Found PolygonCRVDepositor at:", polygonDepositor.address);
    } else {
      const PolygonCRVDepositor = await ethers.getContractFactory("PolygonCRVDepositor", polygonDeployer);
      const impl = await PolygonCRVDepositor.deploy();
      await impl.deployed();
      console.log("Deploy PolygonCRVDepositor Impl at:", impl.address);

      const data = impl.interface.encodeFunctionData("initialize", [
        ANYCALL_PROXY,
        ANYSWAP_ROUTER[network.name],
        crossChainCallProxy.address,
        deployer.address,
        CRV[network.name],
        ACRV[network.name],
        deployer.address, // change it later
      ]);
      const TransparentUpgradeableProxy = await ethers.getContractFactory(
        "TransparentUpgradeableProxy",
        polygonDeployer
      );
      const proxy = await TransparentUpgradeableProxy.deploy(impl.address, proxyAdmin.address, data);
      await proxy.deployed();
      polygonDepositor = await ethers.getContractAt("PolygonCRVDepositor", proxy.address, polygonDeployer);
      console.log("Deploy PolygonCRVDepositor at:", polygonDepositor.address);
    }
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

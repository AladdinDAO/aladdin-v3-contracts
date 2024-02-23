import { network } from "hardhat";
import { ethers, toBigInt } from "ethers";

import { showConverterRoute } from "@/utils/routes";

import { ensureDeployer } from "@/contracts/helpers";
import * as FxGovernance from "@/contracts/FxGovernance";
import * as FxOracle from "@/contracts/FxOracle";
import * as FxStETH from "@/contracts/FxStETH";
import * as FxUSD from "@/contracts/FxUSD";

const maxFeePerGas = ethers.parseUnits("36", "gwei");
const maxPriorityFeePerGas = ethers.parseUnits("0.01", "gwei");

async function main() {
  const overrides = {
    maxFeePerGas: toBigInt(maxFeePerGas),
    maxPriorityFeePerGas: toBigInt(maxPriorityFeePerGas),
  };
  const deployer = await ensureDeployer(network.name);

  console.log("\nFx Convert Routes:");
  for (const [src, dst] of [
    // stETH market
    ["stETH", "WETH"],
    ["stETH", "USDC"],
    ["stETH", "USDT"],
    ["stETH", "wstETH"],
    ["stETH", "crvUSD"],
    ["stETH", "FRAX"],
    // wstETH market
    ["wstETH", "stETH"],
    ["wstETH", "WETH"],
    ["wstETH", "USDC"],
    ["wstETH", "USDT"],
    ["wstETH", "crvUSD"],
    ["wstETH", "FRAX"],
    ["stETH", "wstETH"],
    ["WETH", "wstETH"],
    ["USDC", "wstETH"],
    ["USDT", "wstETH"],
    ["crvUSD", "wstETH"],
    ["FRAX", "wstETH"],
    // sfrxETH market
    ["sfrxETH", "frxETH"],
    ["sfrxETH", "WETH"],
    ["sfrxETH", "USDC"],
    ["sfrxETH", "USDT"],
    ["sfrxETH", "crvUSD"],
    ["sfrxETH", "FRAX"],
    ["sfrxETH", "wstETH"],
    ["frxETH", "sfrxETH"],
    ["WETH", "sfrxETH"],
    ["USDC", "sfrxETH"],
    ["USDT", "sfrxETH"],
    ["crvUSD", "sfrxETH"],
    ["FRAX", "sfrxETH"],
  ]) {
    showConverterRoute(src, dst, 2);
  }

  const governance = await FxGovernance.deploy(deployer, overrides);
  await FxGovernance.initialize(deployer, governance, overrides);

  await FxOracle.deploy(deployer, overrides);

  const fxsteth = await FxStETH.deploy(deployer, overrides);
  await FxStETH.initialize(deployer, fxsteth);

  const fxusd = await FxUSD.deploy(deployer, overrides);
  await FxUSD.initialize(deployer, fxusd, overrides);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

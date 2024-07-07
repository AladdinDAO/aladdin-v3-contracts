import { network } from "hardhat";
import { ethers, toBigInt } from "ethers";

import { showConverterRoute } from "@/utils/routes";

import { ensureDeployer } from "@/contracts/helpers";
import * as FxGovernance from "@/contracts/FxGovernance";
import * as FxOracle from "@/contracts/FxOracle";
import * as FxStETH from "@/contracts/FxStETH";
import * as FxUSD from "@/contracts/FxUSD";

const maxFeePerGas = ethers.parseUnits("15", "gwei");
const maxPriorityFeePerGas = ethers.parseUnits("0.01", "gwei");

function showRoutes(title: string, pairs: Array<[string, string]>, decode?: boolean) {
  console.log(`\n${title}:`);
  for (const [src, dst] of pairs) {
    showConverterRoute(src, dst, 2, decode);
  }
}

async function main() {
  const overrides = {
    maxFeePerGas: toBigInt(maxFeePerGas),
    maxPriorityFeePerGas: toBigInt(maxPriorityFeePerGas),
  };
  const deployer = await ensureDeployer(network.name);

  showRoutes("Fx Convert Routes (stETH)", [
    ["stETH", "WETH"],
    ["stETH", "USDC"],
    ["stETH", "USDT"],
    ["stETH", "wstETH"],
    ["stETH", "crvUSD"],
    ["stETH", "FRAX"],
  ]);
  showRoutes("Fx Convert Routes (wstETH)", [
    ["wstETH", "stETH"],
    ["wstETH", "WETH"],
    ["wstETH", "ETH"],
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
  ]);
  showRoutes("Fx Convert Routes (sfrxETH)", [
    ["sfrxETH", "frxETH"],
    ["sfrxETH", "WETH"],
    ["sfrxETH", "ETH"],
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
  ]);
  showRoutes("Fx Convert Routes (weETH)", [
    ["weETH", "eETH"],
    ["weETH", "WETH"],
    ["weETH", "USDC"],
    ["weETH", "USDT"],
    ["weETH", "ETH"],
    ["weETH", "wstETH"],
    ["eETH", "weETH"],
    ["WETH", "weETH"],
    ["USDC", "weETH"],
    ["USDT", "weETH"],
  ]);
  showRoutes("Fx Convert Routes (ezETH)", [
    ["ezETH", "WETH"],
    ["ezETH", "USDC"],
    ["ezETH", "USDT"],
    ["ezETH", "ETH"],
    ["ezETH", "wstETH"],
    ["WETH", "ezETH"],
    ["USDC", "ezETH"],
    ["USDT", "ezETH"],
  ]);
  showRoutes("Fx Convert Routes (WBTC)", [["WBTC", "wstETH"]]);
  /*
  showRoutes("Fx Convert Routes (apxETH)", [
    ["apxETH", "pxETH"],
    ["apxETH", "WETH"],
    ["apxETH", "USDC"],
    ["apxETH", "USDT"],
    ["apxETH", "ETH"],
    ["pxETH", "apxETH"],
    ["WETH", "apxETH"],
    ["USDC", "apxETH"],
    ["USDT", "apxETH"],
  ]);
  showRoutes("Fx Convert Routes (aCVX)", [
    ["aCVX", "CVX"],
    ["aCVX", "WETH"],
    ["aCVX", "USDC"],
    ["aCVX", "USDT"],
    ["aCVX", "ETH"],
    ["CVX", "aCVX"],
    ["WETH", "aCVX"],
    ["USDC", "aCVX"],
    ["USDT", "aCVX"],
  ]);
  */

  const cmd = process.env.CMD;
  if (cmd === "gov") {
    const governance = await FxGovernance.deploy(deployer, overrides);
    await FxGovernance.initialize(deployer, governance, overrides);
  } else if (cmd === "oracle") {
    const oracle = await FxOracle.deploy(deployer, overrides);
    await FxOracle.initialize(deployer, oracle, overrides);
  } else if (cmd === "steth") {
    const fxsteth = await FxStETH.deploy(deployer, overrides);
    await FxStETH.initialize(deployer, fxsteth);
  } else if (cmd && cmd.length > 0) {
    const fxusd = await FxUSD.deploy(deployer, cmd, overrides);
    await FxUSD.initialize(deployer, fxusd, cmd, overrides);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import * as dotenv from "dotenv";
import { ProxyAgent, setGlobalDispatcher } from "undici";

import { HardhatUserConfig, task } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-vyper";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";

dotenv.config();

if (process.env.PROXY) {
  const proxyAgent = new ProxyAgent(process.env.PROXY);
  setGlobalDispatcher(proxyAgent);
}

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

const accounts = process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [];

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  vyper: {
    compilers: [{ version: "0.3.1" }, { version: "0.2.7" }],
  },
  networks: {
    mainnet: {
      url: process.env.MAINNET_URL || "https://rpc.ankr.com/eth",
      chainId: 1,
      accounts,
    },
    goerli: {
      url: process.env.GOERLI_URL || "https://rpc.ankr.com/eth_goerli",
      chainId: 5,
      accounts,
    },
    sepolia: {
      url: process.env.SEPOLIA_URL || "https://rpc.sepolia.org",
      chainId: 11155111,
      accounts,
    },
    fork_mainnet_10540: {
      url: process.env.MAINNET_FORK_10540_URL || "",
      accounts,
    },
    fork_mainnet_10547: {
      url: process.env.MAINNET_FORK_10547_URL || "",
      accounts,
    },
    fork_mainnet_10548: {
      url: process.env.MAINNET_FORK_10548_URL || "",
      accounts,
    },
  },
  typechain: {
    outDir: "./typechain",
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  mocha: {
    timeout: 400000,
  },
};

export default config;

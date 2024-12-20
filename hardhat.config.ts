import * as dotenv from "dotenv";
import { ProxyAgent, setGlobalDispatcher } from "undici";

import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-verify";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-vyper";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";

dotenv.config();

if (process.env.PROXY) {
  const proxyAgent = new ProxyAgent(process.env.PROXY);
  setGlobalDispatcher(proxyAgent);
}

const accounts = process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [];

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const SolcV076 = {
  version: "0.7.6",
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    evmVersion: "istanbul",
  },
};

const SolcV0820 = {
  version: "0.8.20",
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    evmVersion: "shanghai",
  },
};

const config: HardhatUserConfig = {
  solidity: {
    compilers: [SolcV076, SolcV0820],
    overrides: {
      "contracts/f(x)/rate-provider/wBETHRateProvider.sol": SolcV076,
      "contracts/harvester/concentrator/FxUSDCompounderHarvestFacet.sol": SolcV076,
      "contracts/harvester/libraries/LibConcentratorHarvester.sol": SolcV076,
      "contracts/interfaces/ICurveVoteEscrow.sol": SolcV076,
      "contracts/interfaces/IWBETH.sol": SolcV076,
      "contracts/interfaces/concentrator/IConcentratorSdCrvVault.sol": SolcV076,
      "contracts/interfaces/concentrator/IConcentratorStakeDAOVault.sol": SolcV076,
    },
  },
  vyper: {
    compilers: [{ version: "0.3.1" }, { version: "0.2.7" }],
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    mainnet: {
      url: process.env.MAINNET_URL || "https://rpc.ankr.com/eth",
      chainId: 1,
      accounts: [process.env.PRIVATE_KEY_MAINNET!],
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
    hermez: {
      url: process.env.HERMEZ_URL || "https://zkevm-rpc.com",
      chainId: 1101,
      accounts: [process.env.PRIVATE_KEY_HERMEZ!],
    },
    fork_phalcon: {
      url: `https://rpc.phalcon.blocksec.com/${process.env.PHALCON_RPC_ID || ""}`,
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
    outDir: "./scripts/@types",
    target: "ethers-v6",
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      hermez: process.env.ETHERSCAN_API_KEY || "",
      phalcon: process.env.PHALCON_FORK_ACCESS_KEY || "",
    },
    customChains: [
      {
        network: "hermez",
        chainId: 1101,
        urls: {
          apiURL: "https://api-zkevm.polygonscan.com/api",
          browserURL: "https://zkevm.polygonscan.com",
        },
      },
      {
        network: "phalcon",
        chainId: parseInt(process.env.PHALCON_CHAIN_ID || "1"),
        urls: {
          apiURL: `https://api.phalcon.xyz/api/${process.env.PHALCON_RPC_ID || ""}`,
          browserURL: `https://scan.phalcon.xyz/${process.env.PHALCON_FORK_ID || ""}`,
        },
      },
    ],
  },
  sourcify: {
    enabled: false,
  },
  mocha: {
    timeout: 400000,
  },
};

export default config;

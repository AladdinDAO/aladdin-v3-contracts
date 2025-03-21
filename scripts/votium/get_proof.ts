import { Command } from "commander";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database";
import { IClaimParam } from "./config";

import { TOKENS } from "@/utils/tokens";

const program = new Command();
program.version("1.0.0");

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB5m79DPiFl6lfBzEAIi4Es5frVjNdhA70",
  authDomain: "test-54f45.firebaseapp.com",
  databaseURL: "https://test-54f45-default-rtdb.firebaseio.com",
  projectId: "test-54f45",
  storageBucket: "test-54f45.appspot.com",
  messagingSenderId: "1041511688078",
  appId: "1:1041511688078:web:ac1873792d9f48463226df",
  measurementId: "G-WFSV46SNJF",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const LOCKER = "0x96C68D861aDa016Ed98c30C810879F9df7c64154";

/* eslint-disable prettier/prettier */
// prettier-ignore
const REWARDS: { [round: number]: string[] } = {
  19: ["ALCX", "CVX", "EURS", "FXS", "JPEG", "LDO", "LYRA", "SNX", "STG", "TRIBE", "USDN"],
  20: ["ALCX", "CVX", "FXS", "JPEG", "LDO", "MTA", "SNX", "STG", "USDN"],
  21: ["ALCX", "CVX", "FXS", "FLX", "GNO", "INV", "JPEG", "LDO", "SPELL", "STG"],
  22: ["ALCX", "CVX", "EURS", "FXS", "FLX", "GNO", "INV", "JPEG", "SNX", "SPELL"],
  23: ["ALCX", "CVX", "FLX", "FXS", "GNO", "INV", "JPEG", "TUSD"],
  24: ["ALCX", "APEFI", "CVX", "EURS", "FXS", "GNO", "INV", "JPEG", "SNX", "STG", "TUSD", "USDD"],
  25: ["ALCX", "APEFI", "CVX", "FXS", "GNO", "INV", "JPEG", "SNX", "TUSD", "USDD"],
  26: ["ALCX", "APEFI", "CVX", "cvxCRV", "EURS", "FXS", "GNO", "INV", "JPEG", "MTA", "T", "TUSD", "USDD"],
  27: ["ALCX", "APEFI", "CVX", "FXS", "GNO", "INV", "JPEG", "T", "TUSD", "USDD"],
  28: ["ALCX", "APEFI", "CRV", "CVX", "FXS", "GNO", "INV", "JPEG", "T", "TUSD", "USDD"],
  29: ["ALCX", "APEFI", "CRV", "CVX", "FXS", "INV", "JPEG", "OGN", "T"],
  30: ["ALCX", "APEFI", "CRV", "CVX", "FXS", "GNO", "INV", "OGN", "T", "TUSD", "USDD"],
  31: ["ALCX", "APEFI", "BADGER", "CRV", "CVX", "cvxCRV", "FRAX", "FXS", "GNO", "INV", "OGN", "T", "TUSD", "USDD"],
  32: ["ALCX", "APEFI", "CRV", "CVX", "cvxCRV", "FXS", "GNO", "T", "TUSD", "USDD"],
  33: ["ALCX", "APEFI", "CRV", "CVX", "FXS", "GNO", "USDD"],
  34: ["ALCX", "APEFI", "CRV", "CVX", "FXS", "GNO", "SNX", "TUSD"],
  35: ["ALCX", "CRV", "CVX", "EURS", "FXS", "GNO", "INV", "TUSD", "USDD"],
  36: ["ALCX", "CLEV", "CRV", "CVX", "EURS", "FXS", "GNO", "INV", "TUSD", "USDC", "USDD"],
  37: ["ALCX", "CLEV", "CRV", "CVX", "FXS", "GNO", "INV", "JPEG", "MULTI", "STG", "TUSD", "USDC", "USDD"],
  38: ["ALCX", "CLEV", "CRV", "CVX", "FXS", "GNO", "INV", "JPEG", "STG", "TUSD", "USDD"],
  39: ["ALCX", "CLEV", "CNC", "CRV", "CVX", "EURS", "FXS", "GNO", "INV", "SPELL", "TUSD"],
  40: ["ALCX", "CLEV", "CNC", "CRV", "CVX", "FXS", "GNO", "INV", "SPELL", "TUSD", "USDD"],
  41: ["ALCX", "CLEV", "CNC", "CRV", "CVX", "FXS", "GNO", "INV", "SPELL", "STG", "TUSD", "USDD"],
  42: ["ALCX", "CLEV", "CNC", "CRV", "CVX", "FXS", "GNO", "INV", "SPELL", "STG", "TUSD", "USDC", "USDD", "eCFX"],
  43: ["ALCX", "CLEV", "CNC", "CRV", "CVX", "FXS", "GNO", "INV", "SPELL", "STG", "TUSD", "USDD", "eCFX"],
  44: ["ALCX", "CNC", "CRV", "CVX", "FXS", "GNO", "INV", "SPELL", "STG", "TUSD", "USDC", "eCFX", "wBETH"],
  45: ["ALCX", "CLEV", "CNC", "CRV", "CVX", "FXS", "GNO", "INV", "MET", "OGV", "SPELL", "STG", "TUSD", "USDC", "eCFX", "wBETH"],
  46: ["ALCX", "CLEV", "CNC", "CRV", "CVX", "FXS", "GNO", "INV", "MET", "OGV", "SPELL", "STG", "TUSD", "USDC", "USDD", "sdFXS"],
  47: ["ALCX", "CLEV", "CNC", "CRV", "CVX", "FXS", "GNO", "INV", "MET", "OGV", "SPELL", "STG", "TUSD", "USDC", "USDD"],
  48: ["ALCX", "CLEV", "CNC", "CRV", "CVX", "FXS", "GNO", "MET", "OGV", "SPELL", "TUSD", "USDC", "USDD", "sdFXS"],
  49: ["ALCX", "CLEV", "CNC", "CRV", "CVX", "FXS", "GNO", "INV", "MET", "OGV", "SPELL", "TUSD", "USDC", "USDD", "sdFXS"],
  50: ["ALCX", "CNC", "CRV", "CVX", "FXS", "GNO", "INV", "MET", "OGV", "SPELL", "TUSD", "USDC", "USDD", "sdFXS"],
  51: ["ALCX", "CNC", "CRV", "CVX", "FXS", "GNO", "INV", "MET", "OGV", "SPELL", "TUSD", "USDD", "sdFXS"],
  52: ["ALCX", "CNC", "CRV", "CVX", "FXS", "GNO", "GRAI", "INV", "MET", "SPELL", "TUSD", "USDD", "sdFXS"],
  53: ["ALCX", "CNC", "CRV", "CVX", "FXS", "INV", "MET", "OGV", "SPELL", "TUSD", "USDD", "WETH", "sdFXS"],
  54: ["ALCX", "CNC", "CRV", "CVX", "FXS", "INV", "MET", "OGV", "SPELL", "TUSD", "USDD"],
  55: ["ALCX", "CNC", "CRV", "CVX", "FXS", "INV", "MET", "SPELL", "WETH"],
  56: ["ALCX", "CNC", "CRV", "CVX", "FXS", "INV", "MET", "SPELL", "WETH", "sdFXS"],
  57: ["ALCX", "CNC", "CRV", "CVX", "FXS", "INV", "MET", "SPELL", "WETH", "sdFXS"],
  58: ["ALCX", "CNC", "CRV", "CVX", "FXS", "INV", "MET", "SPELL", "WETH"],
  59: ["ALCX", "CNC", "CRV", "CVX", "FXS", "INV", "MET", "cvxPrisma", "PRISMA", "SPELL", "WETH", "sdFXS", "USDC"],
  60: ["ALCX", "CNC", "CRV", "CVX", "FXS", "INV", "MET", "PRISMA", "SPELL", "WETH", "sdFXS"],
  61: ["ALCX", "CNC", "CRV", "CVX", "FXS", "INV", "MET", "PRISMA", "SPELL", "WETH", "sdFXS", "xETH"],
  62: ["ALCX", "CNC", "CRV", "CVX", "FXS", "INV", "MET", "OGV", "PRISMA", "PYUSD", "SPELL", "sdFXS", "xETH"],
  63: ["ALCX", "CNC", "CRV", "CVX", "FXS", "INV", "MET", "OGV", "PRISMA", "SPELL", "USDC", "WETH", "mkUSD", "sdFXS"],
  64: ["ALCX", "CNC", "CRV", "CVX", "FXS", "INV", "MET", "OGV", "PRISMA", "SPELL", "WETH", "sdFXS", "xETH"],
  65: ["ALCX", "BTRFLY", "CNC", "CRV", "CVX", "FXS", "INV", "MET", "OGV", "PRISMA", "PYUSD", "SPELL", "USDC", "USDT", "WETH", "crvUSD", "xETH"],
  66: ["ALCX", "BTRFLY", "CNC", "CRV", "CVX", "FXS", "INV", "MET", "OGV", "PRISMA", "PYUSD", "SPELL", "WETH", "sdFXS", "xETH"],
  67: ["ALCX", "BTRFLY", "CNC", "CRV", "CVX", "FXN", "FXS", "GHO", "INV", "MET", "OGV", "PRISMA", "SPELL", "USDT", "WETH", "sdFXS"],
  68: ["ALCX", "BTRFLY", "CNC", "CRV", "CVX", "FXS", "GHO", "INV", "MET", "OGV", "PRISMA", "SPELL", "TXJP", "WETH", "sdFXS"],
  69: ["ALCX", "BTRFLY", "CNC", "CRV", "CVX", "FXS", "GHO", "INV", "MET", "OGV", "PRISMA", "SPELL", "TXJP", "WETH", "ZETA", "sdFXS"],
  70: ["ALCX", "BTRFLY", "CNC", "CRV", "CVX", "FXS", "GHO", "INV", "MET", "OGV", "PRISMA", "SPELL", "TXJP", "WETH", "crvUSD"],
  71: ["ALCX", "BTRFLY", "CNC", "CRV", "CVX", "FXS", "GHO", "INV", "MET", "OGV", "PRISMA", "SNX", "SPELL", "TXJP", "USDC", "USDT", "WETH", "ZETA"],
  72: ["ALCX", "BTRFLY", "CNC", "CRV", "CVX", "FXN", "FXS", "GHO", "INV", "OGN", "PRISMA", "SPELL", "TXJP", "USDC", "WETH", "ZETA"],
  73: ["ALCX", "BTRFLY", "CNC", "CRV", "CVX", "FXN", "FXS", "GHO", "INV", "MET", "OGN", "PRISMA", "SPELL", "TXJP", "USDT", "WETH", "ZUN"],
  74: ["ALCX", "BTRFLY", "CNC", "CRV", "CVX", "FXN", "FXS", "GHO", "INV", "MET", "OGN", "PRISMA", "SPELL", "TXJP", "USDT", "WETH", "ZUN", "sdFXS"],
  75: ["ALCX", "BTRFLY", "CNC", "CRV", "CVX", "FXN", "FXS", "GHO", "INV", "MET", "OGN", "PRISMA", "SPELL", "TXJP", "WETH", "ZUN"],
  76: ["ALCX", "CNC", "CRV", "CVX", "DINERO", "FXN", "FXS", "GHO", "INV", "MET", "OGN", "PRISMA", "SPELL", "TXJP", "WETH", "ZUN"],
  77: ["CNC", "CRV", "CVX", "DINERO", "FXN", "FXS", "GHO", "INV", "MET", "OGN", "PRISMA", "TXJP", "WETH", "ZUN"],
  78: ["ALCX", "CNC", "CRV", "CVX", "DINERO", "FXN", "FXS", "GHO", "INV", "MET", "OGN", "PRISMA", "SPELL", "TXJP", "USDC", "WETH", "ZUN"],
  79: ["ALCX", "CNC", "CRV", "CVX", "DINERO", "FXN", "FXS", "GHO", "INV", "MET", "OGN", "SPELL", "TXJP", "USDC", "ZUN"],
  80: ["ALCX", "CNC", "CRV", "CVX", "DINERO", "FXN", "FXS", "GHO", "INV", "MET", "OGN", "SPELL", "TXJP", "USDC", "WETH", "ZUN"],
  81: ["ALCX", "CNC", "CRV", "CVX", "DINERO", "FXN", "FXS", "GHO", "INV", "MET", "SPELL", "TXJP", "USDC", "ZUN"],
  82: ["ALCX", "CNC", "CRV", "CVX", "DINERO", "FXN", "FXS", "GHO", "INV", "MET", "SPELL", "TXJP", "USDC", "WETH", "ZUN"],
  83: ["ALCX", "CRV", "CVX", "DINERO", "FXN", "FXS", "GHO", "INV", "MET", "SPELL", "TXJP", "USDC", "WETH", "ZUN"],
  84: ["ALCX", "CNC", "CRV", "CVX", "DINERO", "FXN", "FXS", "GHO", "INV", "MET", "SPELL", "TXJP", "USDC", "WETH", "ZUN"],
  85: ["AIOZ", "ALCX", "CNC", "CRV", "CVX", "DINERO", "FXS", "GHO", "INV", "MET", "TXJP", "USDC", "ZUN", "crvUSD"],
};
/* eslint-enable prettier/prettier */

async function main(round: number) {
  const filepath = path.join(__dirname, "data", `${round}.json`);
  const claimParams: { [symbol: string]: IClaimParam } = {};
  for (const token of REWARDS[round]) {
    claimParams[token] = {
      token: TOKENS[token].address,
      index: 0,
      amount: "0x",
      merkleProof: [],
    };
  }
  for (const token of REWARDS[round]) {
    const address = TOKENS[token].address;
    const amountRef = ref(db, "claims/" + address.toUpperCase() + "/claims/" + LOCKER + "/amount/");
    const proofRef = ref(db, "claims/" + address.toUpperCase() + "/claims/" + LOCKER + "/proof/");
    const indexRef = ref(db, "claims/" + address.toUpperCase() + "/claims/" + LOCKER + "/index/");

    onValue(indexRef, (snapshot) => {
      const data = snapshot.val();
      if (data !== null) {
        console.log("token:", token, "index:", data.toString());
        claimParams[token].index = parseInt(data.toString());
      } else {
        console.log("token:", token, "Couldn't get index from db");
      }
      fs.writeFileSync(filepath, JSON.stringify(Object.values(claimParams), undefined, 2));
    });
    onValue(amountRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        console.log("token:", token, "amount:", ethers.formatUnits(data.toString(), TOKENS[token].decimals));
        claimParams[token].amount = data.toString();
      } else {
        console.log("token:", token, "Couldn't get earned balance from db");
      }
      fs.writeFileSync(filepath, JSON.stringify(Object.values(claimParams), undefined, 2));
    });
    onValue(proofRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        console.log("token:", token, "proof generated");
        claimParams[token].merkleProof = data;
      } else {
        console.log("token:", token, "Couldn't get merkle proof from db");
      }
      fs.writeFileSync(filepath, JSON.stringify(Object.values(claimParams), undefined, 2));
    });
  }
}

program.option("--round <round>", "round number");
program.parse(process.argv);
const options = program.opts();

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main(parseInt(options.round)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

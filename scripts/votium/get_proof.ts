/* eslint-disable node/no-missing-import */
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database";
import { TOKENS } from "../utils";

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
};

async function main() {
  for (const token of REWARDS[29]) {
    const address = TOKENS[token].address;
    const amountRef = ref(db, "claims/" + address.toUpperCase() + "/claims/" + LOCKER + "/amount/");
    const proofRef = ref(db, "claims/" + address.toUpperCase() + "/claims/" + LOCKER + "/proof/");
    const indexRef = ref(db, "claims/" + address.toUpperCase() + "/claims/" + LOCKER + "/index/");

    onValue(amountRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        console.log("token:", token, "amount:", data.toString());
      } else {
        console.log("Couldn't get earned balance from db");
      }
    });
    onValue(proofRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        console.log("token:", token, "proof:", data);
      } else {
        console.log("Couldn't get merkle proof from db");
      }
    });
    onValue(indexRef, (snapshot) => {
      const data = snapshot.val();
      if (data !== null) {
        console.log("token:", token, "index:", data.toString());
      } else {
        console.log("Couldn't get index from db");
      }
    });
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

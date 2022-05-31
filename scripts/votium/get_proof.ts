/* eslint-disable node/no-missing-import */
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database";
import { ADDRESS } from "../config";

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

const TOKENS = ["ALCX", "CVX", "EURS", "FXS", "JPEG", "LDO", "SNX", "STG", "TRIBE", "USDN"];

async function main() {
  for (const token of TOKENS) {
    const address = ADDRESS[token];
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

/* eslint-disable node/no-missing-import */
import { BigNumberish } from "ethers";
import fs from "fs";
import path from "path";

interface IClaimParam {
  token: string;
  index: number;
  amount: BigNumberish;
  merkleProof: string[];
}

export function loadParams(round: string): IClaimParam[] {
  const filepath = path.join(__dirname, "data", `${round}.json`);
  return JSON.parse(fs.readFileSync(filepath, "utf-8"));
}

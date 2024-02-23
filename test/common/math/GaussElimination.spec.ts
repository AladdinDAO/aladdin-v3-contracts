import { expect } from "chai";
import { ethers } from "hardhat";

import { MockGaussElimination } from "@/types/index";

const Equations = [
  ["2 1"],
  ["1 -8"],
  ["5 9"],
  ["1 1 7", "4 -9 7"],
  ["9 4 5", "3 7 8"],
  ["4 -5 9", "7 6 -7"],
  ["2 6 1 0", "6 7 7 0", "5 6 3 8"],
  ["0.87 -7.70 7.48 4.74", "6.14 8.77 0.50 6.72", "1.20 6.89 7.41 5.20"],
  ["3.18 6.21 -3.54 6.85", "4.89 2.39 -5.22 2.76", "1.73 -5.78 2.07 1.35"],
  ["6.08 0.71 0.64 1.43 3.25", "5.02 8.19 2.50 4.97 5.86", "7.82 3.68 1.79 3.96 1.57", "4.94 2.91 6.49 5.29 -8.43"],
  ["4.62 -8.53 3.58 8.36 8.01", "1.42 0.53 -2.33 7.40 -3.88", "5.03 0.68 6.93 8.57 2.45", "6.98 3.02 -5.59 6.75 3.85"],
  ["5.03 2.58 -3.83 2.80 4.55", "6.55 -3.38 6.37 7.47 -5.85", "1.62 5.54 8.13 3.56 8.26", "5.87 4.09 4.07 3.11 -3.19"],
];

describe("GaussElimination.spec", async () => {
  let lib: MockGaussElimination;

  beforeEach(async () => {
    const [deployer] = await ethers.getSigners();

    const MockGaussElimination = await ethers.getContractFactory("MockGaussElimination", deployer);
    lib = await MockGaussElimination.deploy();
  });

  it("should succeed", async () => {
    for (const equations of Equations) {
      const n = equations.length;
      const a: Array<Array<bigint>> = new Array(n);
      const b: Array<bigint> = new Array(n);
      for (let i = 0; i < n; ++i) {
        const items = equations[i].split(" ");
        a[i] = new Array(n);
        for (let j = 0; j < n; ++j) {
          a[i][j] = ethers.parseEther(items[j]);
        }
        b[i] = ethers.parseEther(items[n]);
      }
      const [hasSolution, x] = await lib.solve(a, b);
      expect(hasSolution).to.eq(true);
      for (let i = 0; i < n; ++i) {
        let sum = 0n;
        for (let j = 0; j < n; ++j) sum += x[j] * a[i][j];
        expect(sum / 10n ** 18n).to.closeTo(b[i], 100000n);
      }
    }
  });
});

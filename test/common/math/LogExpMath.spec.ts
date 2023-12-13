import { expect } from "chai";
import { ethers } from "hardhat";

import { MockLogExpMath } from "@/types/index";

describe("LogExpMath.spec", async () => {
  let lib: MockLogExpMath;

  const MAX_X = 2n ** 255n - 1n;
  const MAX_Y = 2n ** 254n / 10n ** 20n - 1n;

  beforeEach(async () => {
    const [deployer] = await ethers.getSigners();

    const MockLogExpMath = await ethers.getContractFactory("MockLogExpMath", deployer);
    lib = await MockLogExpMath.deploy();
  });

  describe("exponent zero", () => {
    const exponent = 0;

    it("handles base zero", async () => {
      const base = 0;
      expect(await lib.pow(base, exponent)).to.be.equal(10n ** 18n);
    });

    it("handles base one", async () => {
      const base = 1;
      expect(await lib.pow(base, exponent)).to.be.equal(10n ** 18n);
    });

    it("handles base greater than one", async () => {
      const base = 10;
      expect(await lib.pow(base, exponent)).to.be.equal(10n ** 18n);
    });
  });

  describe("base zero", () => {
    const base = 0;

    it("handles exponent zero", async () => {
      const exponent = 0;
      expect(await lib.pow(base, exponent)).to.be.equal(10n ** 18n);
    });

    it("handles exponent one", async () => {
      const exponent = 1;
      const expectedResult = 0;
      expect(await lib.pow(base, exponent)).to.be.equal(expectedResult);
    });

    it("handles exponent greater than one", async () => {
      const exponent = 10;
      const expectedResult = 0;
      expect(await lib.pow(base, exponent)).to.be.equal(expectedResult);
    });
  });

  describe("base one", () => {
    const base = 1;

    it("handles exponent zero", async () => {
      const exponent = 0;
      expect(await lib.pow(base, exponent)).to.be.equal(10n ** 18n);
    });

    it("handles exponent one", async () => {
      const exponent = 1;
      expect(await lib.pow(base, exponent)).closeTo(10n ** 18n, 1000000n);
    });

    it("handles exponent greater than one", async () => {
      const exponent = 10;
      expect(await lib.pow(base, exponent)).closeTo(10n ** 18n, 1000000n);
    });
  });

  describe("decimals", () => {
    it("handles decimals properly", async () => {
      const base = 2n * 10n ** 18n;
      const exponent = 4n * 10n ** 18n;
      const expectedResult = 2n ** 4n * 10n ** 18n;

      const result = await lib.pow(base, exponent);
      expect(result).closeTo(expectedResult, 100000n);
    });
  });

  describe("max values", () => {
    it("cannot handle a base greater than 2^255 - 1", async () => {
      const base = MAX_X + 1n;
      const exponent = 1;

      await expect(lib.pow(base, exponent)).to.be.revertedWith("X_OUT_OF_BOUNDS");
    });

    it("cannot handle an exponent greater than (2^254/1e20) - 1", async () => {
      const base = 1;
      const exponent = MAX_Y + 1n;

      await expect(lib.pow(base, exponent)).to.be.revertedWith("Y_OUT_OF_BOUNDS");
    });
  });
});

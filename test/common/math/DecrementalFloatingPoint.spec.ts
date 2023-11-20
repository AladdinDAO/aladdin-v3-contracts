import { expect } from "chai";
import { ethers } from "hardhat";

import { MockDecrementalFloatingPoint } from "@/types/index";

describe("DecrementalFloatingPoint.spec", async () => {
  let contract: MockDecrementalFloatingPoint;

  beforeEach(async () => {
    const [deployer] = await ethers.getSigners();

    const MockDecrementalFloatingPoint = await ethers.getContractFactory("MockDecrementalFloatingPoint", deployer);
    contract = await MockDecrementalFloatingPoint.deploy();
  });

  context("encode and decode", async () => {
    it("should correct", async () => {
      for (const epoch of [0n, 1n, 4096n, 16777215n]) {
        for (const exponent of [0n, 1n, 4096n, 16777215n]) {
          for (const magnitude of [0n, 1n, 10n ** 9n, 10n ** 18n]) {
            const product = magnitude | (exponent << 64n) | (epoch << 88n);
            expect(await contract.encode(epoch, exponent, magnitude)).to.eq(product);
            expect(await contract.epoch(product)).to.eq(epoch);
            expect(await contract.exponent(product)).to.eq(exponent);
            expect(await contract.magnitude(product)).to.eq(magnitude);
            expect(await contract.epochAndExponent(product)).to.eq(exponent | (epoch << 24n));
          }
        }
      }
    });
  });

  context("#mul", async () => {
    it("should succeed", async () => {
      const v0 = await contract.encode(1n, 123n, 10n ** 17n);
      // mul 0
      const v1 = await contract.mul(v0, 0n);
      expect(await contract.epoch(v1)).to.eq(2n);
      expect(await contract.exponent(v1)).to.eq(0n);
      expect(await contract.magnitude(v1)).to.eq(10n ** 18n);

      // mul 1
      const v2 = await contract.mul(v0, 10n ** 18n);
      expect(await contract.epoch(v2)).to.eq(1n);
      expect(await contract.exponent(v2)).to.eq(123n);
      expect(await contract.magnitude(v2)).to.eq(10n ** 17n);

      // mul 0.9
      const v3 = await contract.mul(v0, 9n * 10n ** 17n);
      expect(await contract.epoch(v3)).to.eq(1n);
      expect(await contract.exponent(v3)).to.eq(123n);
      expect(await contract.magnitude(v3)).to.eq(9n * 10n ** 16n);

      // mul 0.000000009
      const v4 = await contract.mul(v0, 9000000000n);
      expect(await contract.epoch(v4)).to.eq(1n);
      expect(await contract.exponent(v4)).to.eq(124n);
      expect(await contract.magnitude(v4)).to.eq(9n * 10n ** 17n);
    });
  });
});

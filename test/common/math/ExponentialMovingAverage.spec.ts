import { expect } from "chai";
import { ethers, network } from "hardhat";

import { MockExponentialMovingAverage } from "@/types/index";

describe("ExponentialMovingAverage.spec", async () => {
  let lib: MockExponentialMovingAverage;

  beforeEach(async () => {
    const [deployer] = await ethers.getSigners();

    const MockExponentialMovingAverage = await ethers.getContractFactory("MockExponentialMovingAverage", deployer);
    lib = await MockExponentialMovingAverage.deploy();
  });

  it("should succeed", async () => {
    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    await lib.setState({
      lastTime: timestamp,
      sampleInterval: 60,
      lastValue: 10n ** 18n,
      lastEmaValue: 10n ** 18n,
    });
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 60]);
    await network.provider.send("evm_mine");
    expect(await lib.emaValue()).to.eq(10n ** 18n);

    await lib.saveValue(5n * 10n ** 18n);
    expect(await lib.emaValue()).to.eq((await lib.state()).lastEmaValue);
    expect((await lib.state()).lastValue).to.eq(5n * 10n ** 18n);
    expect((await lib.state()).lastTime).to.eq((await ethers.provider.getBlock("latest"))!.timestamp);

    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 90]);
    await network.provider.send("evm_mine");
    expect(await lib.emaValue()).to.eq(2533103142523356912n);

    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 120]);
    await network.provider.send("evm_mine");
    expect(await lib.emaValue()).to.eq(3503751421591669436n);

    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 240]);
    await network.provider.send("evm_mine");
    expect(await lib.emaValue()).to.eq(4797504774848729492n);

    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 1000]);
    await network.provider.send("evm_mine");
    expect(await lib.emaValue()).to.eq(4999999361219941924n);

    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 100000]);
    await network.provider.send("evm_mine");
    expect(await lib.emaValue()).to.eq(5000000000000000000n);
  });
});

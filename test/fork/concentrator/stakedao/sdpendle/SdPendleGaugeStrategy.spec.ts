/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers, network } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import { GeneralTokenConverter, MockERC20, SdPendleGaugeStrategy } from "@/types/index";
import { CONVERTER_ROUTRS, TOKENS } from "@/utils/index";

const DEPLOYER = "0x1000000000000000000000000000000000000001";
const OPERATOR = "0x2000000000000000000000000000000000000002";
const OWNER_ALADDIN = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const OWNER_CONCENTRATOR = "0xA0FB1b11ccA5871fb0225B64308e249B97804E99";

const SdPendleGauge = "0x50DC9aE51f78C593d4138263da7088A973b8184E";
const SdPendleHolder = "0x2a88487328E89Fe6C3b71706069715F301F4BEB4";
const Locker = "0x1c0D72a330F2768dAF718DEf8A19BAb019EEAd09";

const FORK_HEIGHT = 20317250;

describe("SdPendleGaugeStrategy.spec", async () => {
  let deployer: HardhatEthersSigner;
  let operator: HardhatEthersSigner;
  let holder: HardhatEthersSigner;

  let converter: GeneralTokenConverter;
  let strategy: SdPendleGaugeStrategy;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [DEPLOYER, SdPendleHolder, OPERATOR, OWNER_ALADDIN, OWNER_CONCENTRATOR]);
    const ownerAladdin = await ethers.getSigner(OWNER_ALADDIN);
    const ownerConcentrator = await ethers.getSigner(OWNER_CONCENTRATOR);
    deployer = await ethers.getSigner(DEPLOYER);
    operator = await ethers.getSigner(OPERATOR);
    holder = await ethers.getSigner(SdPendleHolder);

    await mockETHBalance(ownerAladdin.address, ethers.parseEther("100"));
    await mockETHBalance(ownerConcentrator.address, ethers.parseEther("100"));
    await mockETHBalance(deployer.address, ethers.parseEther("100"));
    await mockETHBalance(operator.address, ethers.parseEther("100"));
    await mockETHBalance(holder.address, ethers.parseEther("100"));

    const locker = await ethers.getContractAt("ConcentratorStakeDAOLocker", Locker, ownerConcentrator);
    const registry = await ethers.getContractAt(
      "ConverterRegistry",
      "0x997B6F43c1c1e8630d03B8E3C11B60E98A1beA90",
      ownerAladdin
    );
    converter = await ethers.getContractAt(
      "GeneralTokenConverter",
      "0x11C907b3aeDbD863e551c37f21DD3F36b28A6784",
      ownerAladdin
    );

    const SdPendleGaugeStrategy = await ethers.getContractFactory("SdPendleGaugeStrategy", deployer);
    strategy = await SdPendleGaugeStrategy.deploy(operator.getAddress());
    expect(await strategy.name()).to.eq("SdPendleGauge");

    const StakeDAOGaugeWrapperStash = await ethers.getContractFactory("StakeDAOGaugeWrapperStash", deployer);
    const stash = await StakeDAOGaugeWrapperStash.deploy(strategy.getAddress());

    await strategy.updateStash(stash.getAddress());
    await locker.updateOperator(SdPendleGauge, strategy.getAddress());
    await locker.updateGaugeRewardReceiver(SdPendleGauge, stash.getAddress());
    await registry.updateRoute(TOKENS.WETH.address, TOKENS.PENDLE.address, CONVERTER_ROUTRS.WETH.PENDLE);
  });

  context("auth", async () => {
    let token: MockERC20;

    beforeEach(async () => {
      const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
      token = await MockERC20.deploy("MockERC20", "M", 18);
    });

    context("#execute", async () => {
      it("should revert, when non-operator call execute", async () => {
        await expect(strategy.execute(ZeroAddress, 0, "0x")).to.revertedWithCustomError(
          strategy,
          "CallerIsNotOperator"
        );
      });

      it("should succeed, when operator call", async () => {
        const [status, result] = await strategy
          .connect(operator)
          .execute.staticCall(token.getAddress(), 0, token.interface.encodeFunctionData("decimals"));
        await strategy.connect(operator).execute(token.getAddress(), 0, token.interface.encodeFunctionData("decimals"));
        expect(status).to.eq(true);
        const [decimal] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], result);
        expect(decimal).to.eq(18n);
      });
    });

    context("#updateRewards", async () => {
      it("should revert, when non-operator call updateRewards", async () => {
        await expect(strategy.updateRewards([])).to.revertedWithCustomError(strategy, "CallerIsNotOperator");
      });

      it("should revert, when zero token address", async () => {
        await expect(strategy.connect(operator).updateRewards([ZeroAddress])).to.revertedWithCustomError(
          strategy,
          "RewardTokenIsZero"
        );
      });

      it("should revert, when duplicated token", async () => {
        await expect(
          strategy.connect(operator).updateRewards([token.getAddress(), token.getAddress()])
        ).to.revertedWithCustomError(strategy, "DuplicatedRewardToken");
      });

      it("should succeed, when operator call", async () => {
        expect(await strategy.rewards(0)).to.eq(TOKENS.SDT.address);
        expect(await strategy.rewards(1)).to.eq(TOKENS.WETH.address);
        expect(await strategy.rewards(2)).to.eq(TOKENS.PENDLE.address);
        await expect(strategy.rewards(3)).to.reverted;
        await strategy.connect(operator).updateRewards([await token.getAddress()]);
        expect(await strategy.rewards(0)).to.eq(await token.getAddress());
        await expect(strategy.rewards(1)).to.reverted;
      });
    });

    context("#deposit", async () => {
      it("should revert, when non-operator call deposit", async () => {
        await expect(strategy.deposit(deployer.address, 0)).to.revertedWithCustomError(strategy, "CallerIsNotOperator");
      });

      it("should succeed, when operator call deposit", async () => {
        await strategy.connect(operator).deposit(deployer.address, 0);
      });
    });

    context("#withdraw", async () => {
      it("should revert, when non-operator call withdraw", async () => {
        await expect(strategy.withdraw(deployer.address, 0)).to.revertedWithCustomError(
          strategy,
          "CallerIsNotOperator"
        );
      });

      it("should succeed, when operator call withdraw", async () => {
        await strategy.connect(operator).withdraw(deployer.address, 0);
      });
    });

    context("#harvest", async () => {
      it("should revert, when non-operator call harvest", async () => {
        await expect(strategy.harvest(deployer.address, token.getAddress())).to.revertedWithCustomError(
          strategy,
          "CallerIsNotOperator"
        );
      });

      it("should succeed, when operator call harvest", async () => {
        await strategy.connect(operator).harvest(converter.getAddress(), TOKENS.PENDLE.address);
      });
    });

    context("#prepareMigrate", async () => {
      it("should revert, when non-operator call prepareMigrate", async () => {
        await expect(strategy.prepareMigrate(deployer.address)).to.revertedWithCustomError(
          strategy,
          "CallerIsNotOperator"
        );
      });

      it("should succeed, when operator call prepareMigrate", async () => {
        await strategy.connect(operator).prepareMigrate(deployer.address);
      });
    });

    context("#finishMigrate", async () => {
      it("should revert, when non-operator call finishMigrate", async () => {
        await expect(strategy.finishMigrate(deployer.address)).to.revertedWithCustomError(
          strategy,
          "CallerIsNotOperator"
        );
      });

      it("should succeed, when operator call finishMigrate", async () => {
        await strategy.connect(operator).finishMigrate(deployer.address);
      });
    });

    context("#sweepToken", async () => {
      it("should revert, when non-owner call sweepToken", async () => {
        await expect(strategy.connect(operator).sweepToken([])).to.revertedWith("Ownable: caller is not the owner");
      });

      it("should revert, when sweep protected token", async () => {
        await expect(strategy.sweepToken([TOKENS.SDT.address])).to.revertedWithCustomError(
          strategy,
          "TokenIsProtected"
        );
        await expect(strategy.sweepToken([TOKENS.PENDLE.address])).to.revertedWithCustomError(
          strategy,
          "TokenIsProtected"
        );
        await expect(strategy.sweepToken([TOKENS.WETH.address])).to.revertedWithCustomError(
          strategy,
          "TokenIsProtected"
        );
        await expect(strategy.sweepToken([TOKENS.sdPENDLE.address])).to.revertedWithCustomError(
          strategy,
          "TokenIsProtected"
        );
      });

      it("should succeed", async () => {
        await token.mint(strategy.getAddress(), 1000000n);
        await strategy.updateStash(deployer.address);
        expect(await token.balanceOf(deployer.address)).to.eq(0n);
        await strategy.sweepToken([await token.getAddress()]);
        expect(await token.balanceOf(deployer.address)).to.eq(1000000n);
      });
    });

    context("#updateStash", async () => {
      it("should revert, when non-owner call updateStash", async () => {
        await expect(strategy.connect(operator).updateStash(deployer.address)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        await strategy.updateStash(deployer.address);
        expect(await strategy.stash()).to.eq(deployer.address);
      });
    });
  });

  it("should succeed when syncRewardToken", async () => {
    await strategy.connect(operator).updateRewards([]);

    await expect(strategy.rewards(0)).to.reverted;
    await strategy.syncRewardToken();
    expect(await strategy.rewards(0)).to.eq(TOKENS.SDT.address);
    expect(await strategy.rewards(1)).to.eq(TOKENS.WETH.address);
    expect(await strategy.rewards(2)).to.eq(TOKENS.PENDLE.address);
    await expect(strategy.rewards(3)).to.reverted;
  });

  it("should succeed when deposit", async () => {
    const token = await ethers.getContractAt("MockERC20", TOKENS.sdPENDLE.address, holder);
    const gauge = await ethers.getContractAt("MockERC20", SdPendleGauge, holder);
    const amount = ethers.parseEther("1000");
    await token.transfer(strategy.getAddress(), amount);
    expect(await gauge.balanceOf(Locker)).to.eq(0n);
    await strategy.connect(operator).deposit(deployer.address, amount);
    expect(await gauge.balanceOf(Locker)).to.eq(amount);
  });

  it("should succeed when withdraw", async () => {
    const token = await ethers.getContractAt("MockERC20", TOKENS.sdPENDLE.address, holder);
    const gauge = await ethers.getContractAt("MockERC20", SdPendleGauge, holder);
    const amount = ethers.parseEther("1000");
    await token.transfer(strategy.getAddress(), amount);
    expect(await gauge.balanceOf(Locker)).to.eq(0n);
    await strategy.connect(operator).deposit(deployer.address, amount);
    expect(await gauge.balanceOf(Locker)).to.eq(amount);

    const before = await token.balanceOf(deployer.address);
    await strategy.connect(operator).withdraw(deployer.address, amount);
    const after = await token.balanceOf(deployer.address);
    expect(after - before).to.eq(amount);
    expect(await gauge.balanceOf(Locker)).to.eq(0n);
  });

  it(`should succeed when harvest to PENDLE and deposit as sdPENDLE`, async () => {
    const token = await ethers.getContractAt("MockERC20", TOKENS.sdPENDLE.address, holder);
    const gauge = await ethers.getContractAt("MockERC20", SdPendleGauge, holder);
    const amount = ethers.parseEther("1000");
    await token.transfer(strategy.getAddress(), amount);
    expect(await gauge.balanceOf(Locker)).to.eq(0n);
    await strategy.connect(operator).deposit(deployer.address, amount);
    expect(await gauge.balanceOf(Locker)).to.eq(amount);

    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    // make sure 7 days passed, then the rewards will not increase anymore.
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
    await network.provider.send("evm_mine");

    const harvested = await strategy
      .connect(operator)
      .harvest.staticCall(converter.getAddress(), TOKENS.PENDLE.address);
    expect(harvested).to.gt(0n);

    const before = await gauge.balanceOf(Locker);
    await strategy.connect(operator).harvest(converter.getAddress(), TOKENS.PENDLE.address);
    const after = await gauge.balanceOf(Locker);
    expect(after - before).to.eq(harvested);
    console.log("harvested:", ethers.formatUnits(harvested, 18));
  });
});

/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers, network } from "hardhat";

import { ConverterRegistry, CvxStakingStrategy, GeneralTokenConverter, ICvxRewardPool, MockERC20 } from "@/types/index";
import { CONVERTER_ROUTRS, TOKENS } from "@/utils/index";

import { request_fork } from "../../../utils";

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const CVX_REWARD_POOL = "0xCF50b810E57Ac33B91dCF525C6ddd9881B139332";
const HOLDER = "0xf584F8728B874a6a5c7A8d4d387C9aae9172D621";
const OPERATOR = "0xD292b72e5C787f9F7E092aB7802aDDF76930981F";
const FORK_HEIGHT = 18178555;

describe("CvxStakingStrategy.spec", async () => {
  let deployer: HardhatEthersSigner;
  let operator: HardhatEthersSigner;
  let holder: HardhatEthersSigner;

  let registry: ConverterRegistry;
  let converter: GeneralTokenConverter;

  let strategy: CvxStakingStrategy;
  let staker: ICvxRewardPool;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [DEPLOYER, HOLDER, OPERATOR]);
    deployer = await ethers.getSigner(DEPLOYER);
    holder = await ethers.getSigner(HOLDER);
    operator = await ethers.getSigner(OPERATOR);

    await deployer.sendTransaction({ to: holder.address, value: ethers.parseEther("10") });
    await deployer.sendTransaction({ to: operator.address, value: ethers.parseEther("10") });

    staker = await ethers.getContractAt("ICvxRewardPool", CVX_REWARD_POOL, deployer);

    const ConverterRegistry = await ethers.getContractFactory("ConverterRegistry", deployer);
    registry = await ConverterRegistry.deploy();

    const GeneralTokenConverter = await ethers.getContractFactory("GeneralTokenConverter", deployer);
    converter = await GeneralTokenConverter.deploy(registry.getAddress());

    const CvxStakingStrategy = await ethers.getContractFactory("CvxStakingStrategy", deployer);
    strategy = await CvxStakingStrategy.deploy(operator.address, staker.getAddress());

    expect(await strategy.name()).to.eq("CvxStaking");

    await registry.updateRoute(TOKENS.cvxCRV.address, TOKENS.WETH.address, CONVERTER_ROUTRS.cvxCRV.WETH);
    await registry.updateRoute(TOKENS.WETH.address, TOKENS.CVX.address, CONVERTER_ROUTRS.WETH.CVX);
    await converter.updateSupportedPoolTypes(1023);
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
        expect(await strategy.rewards(0)).to.eq(TOKENS.cvxCRV.address);
        await expect(strategy.rewards(1)).to.reverted;
        await strategy.connect(operator).updateRewards([token.getAddress()]);
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
        await strategy.connect(operator).harvest(converter.getAddress(), token.getAddress());
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
        await expect(strategy.sweepToken([TOKENS.CVX.address])).to.revertedWithCustomError(
          strategy,
          "TokenIsProtected"
        );
        await expect(strategy.sweepToken([TOKENS.cvxCRV.address])).to.revertedWithCustomError(
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
        expect(await strategy.stash()).to.eq(ZeroAddress);
        await strategy.updateStash(deployer.address);
        expect(await strategy.stash()).to.eq(deployer.address);
      });
    });
  });

  it("should succeed when deposit", async () => {
    const token = await ethers.getContractAt("MockERC20", TOKENS.CVX.address, holder);
    const amount = ethers.parseEther("1000");
    await token.transfer(strategy.getAddress(), amount);
    expect(await staker.balanceOf(strategy.getAddress())).to.eq(0n);
    await strategy.connect(operator).deposit(deployer.address, amount);
    expect(await staker.balanceOf(strategy.getAddress())).to.eq(amount);
  });

  it("should succeed when withdraw", async () => {
    const token = await ethers.getContractAt("MockERC20", TOKENS.CVX.address, holder);
    const amount = ethers.parseEther("1000");
    await token.transfer(strategy.getAddress(), amount);
    expect(await staker.balanceOf(strategy.getAddress())).to.eq(0n);
    await strategy.connect(operator).deposit(deployer.address, amount);
    expect(await staker.balanceOf(strategy.getAddress())).to.eq(amount);

    const before = await token.balanceOf(deployer.address);
    await strategy.connect(operator).withdraw(deployer.address, amount);
    const after = await token.balanceOf(deployer.address);
    expect(after - before).to.eq(amount);
    expect(await staker.balanceOf(strategy.getAddress())).to.eq(0n);
  });

  it(`should succeed when harvest to CVX with WETH as intermediate`, async () => {
    const token = await ethers.getContractAt("MockERC20", TOKENS.CVX.address, holder);
    const amount = ethers.parseEther("1000");
    await token.transfer(strategy.getAddress(), amount);
    expect(await staker.balanceOf(strategy.getAddress())).to.eq(0n);
    await strategy.connect(operator).deposit(deployer.address, amount);
    expect(await staker.balanceOf(strategy.getAddress())).to.eq(amount);

    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    // make sure 7 days passed, then the rewards will not increase anymore.
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
    await network.provider.send("evm_mine");

    const harvested = await strategy.connect(operator).harvest.staticCall(converter.getAddress(), TOKENS.WETH.address);
    expect(harvested).to.gt(0n);

    const before = await staker.balanceOf(strategy.getAddress());
    await strategy.connect(operator).harvest(converter.getAddress(), TOKENS.WETH.address);
    const after = await staker.balanceOf(strategy.getAddress());
    expect(after - before).to.eq(harvested);
    console.log("harvested:", ethers.formatUnits(harvested, 18));
  });
});

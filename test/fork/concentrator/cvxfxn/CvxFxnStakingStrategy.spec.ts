/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers, network } from "hardhat";

import { request_fork } from "@/test/utils";
import {
  ConverterRegistry,
  CvxFxnStakingStrategy,
  GeneralTokenConverter,
  IConvexFXNDepositor,
  MockERC20,
} from "@/types/index";
import { CONVERTER_ROUTRS, TOKENS } from "@/utils/index";

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const CvxFxnStaking = "0xEC60Cd4a5866fb3B0DD317A46d3B474a24e06beF";
const FxnDepositor = "0x56B3c8eF8A095f8637B6A84942aA898326B82b91";
const FXN_HOLDER = "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF";
const OPERATOR = "0xD292b72e5C787f9F7E092aB7802aDDF76930981F";
const FORK_HEIGHT = 18343180;

describe("CvxFxnStakingStrategy.spec", async () => {
  let deployer: HardhatEthersSigner;
  let operator: HardhatEthersSigner;
  let holder: HardhatEthersSigner;

  let registry: ConverterRegistry;
  let converter: GeneralTokenConverter;

  let depositor: IConvexFXNDepositor;
  let strategy: CvxFxnStakingStrategy;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [DEPLOYER, FXN_HOLDER, OPERATOR]);
    deployer = await ethers.getSigner(DEPLOYER);
    holder = await ethers.getSigner(FXN_HOLDER);
    operator = await ethers.getSigner(OPERATOR);

    await deployer.sendTransaction({ to: holder.address, value: ethers.parseEther("10") });
    await deployer.sendTransaction({ to: operator.address, value: ethers.parseEther("10") });

    depositor = await ethers.getContractAt("IConvexFXNDepositor", FxnDepositor, deployer);

    const ConverterRegistry = await ethers.getContractFactory("ConverterRegistry", deployer);
    registry = await ConverterRegistry.deploy();

    const GeneralTokenConverter = await ethers.getContractFactory("GeneralTokenConverter", deployer);
    converter = await GeneralTokenConverter.deploy(registry.getAddress());

    const CvxFxnStakingStrategy = await ethers.getContractFactory("CvxFxnStakingStrategy", deployer);
    strategy = await CvxFxnStakingStrategy.deploy(operator.address);

    expect(await strategy.name()).to.eq("CvxFxnStaking");

    const fxn = await ethers.getContractAt("GovernanceToken", TOKENS.FXN.address, holder);
    await fxn.approve(depositor.getAddress(), ethers.parseEther("10000"));
    await depositor.connect(holder).deposit(ethers.parseEther("10000"), false);
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
        expect(await strategy.rewards(0)).to.eq(TOKENS.FXN.address);
        expect(await strategy.rewards(1)).to.eq(TOKENS.CVX.address);
        expect(await strategy.rewards(2)).to.eq(TOKENS.wstETH.address);
        await expect(strategy.rewards(3)).to.reverted;
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
        await strategy.connect(operator).harvest(converter.getAddress(), TOKENS.FXN.address);
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
        await expect(strategy.sweepToken([TOKENS.FXN.address])).to.revertedWithCustomError(
          strategy,
          "TokenIsProtected"
        );
        await expect(strategy.sweepToken([TOKENS.CVX.address])).to.revertedWithCustomError(
          strategy,
          "TokenIsProtected"
        );
        await expect(strategy.sweepToken([TOKENS.cvxFXN.address])).to.revertedWithCustomError(
          strategy,
          "TokenIsProtected"
        );
        await expect(strategy.sweepToken([TOKENS.wstETH.address])).to.revertedWithCustomError(
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

  it("should succeed when syncRewardToken", async () => {
    await strategy.connect(operator).updateRewards([]);

    await expect(strategy.rewards(0)).to.reverted;
    await strategy.syncRewardToken();
    expect(await strategy.rewards(0)).to.eq(TOKENS.FXN.address);
    expect(await strategy.rewards(1)).to.eq(TOKENS.CVX.address);
    expect(await strategy.rewards(2)).to.eq(TOKENS.wstETH.address);
    await expect(strategy.rewards(3)).to.reverted;
  });

  it("should succeed when deposit", async () => {
    const token = await ethers.getContractAt("MockERC20", TOKENS.cvxFXN.address, holder);
    const staker = await ethers.getContractAt("MockERC20", CvxFxnStaking, holder);
    const amount = ethers.parseEther("1000");
    await token.transfer(strategy.getAddress(), amount);
    expect(await staker.balanceOf(strategy.getAddress())).to.eq(0n);
    await strategy.connect(operator).deposit(deployer.address, amount);
    expect(await staker.balanceOf(strategy.getAddress())).to.eq(amount);
  });

  it("should succeed when withdraw", async () => {
    const token = await ethers.getContractAt("MockERC20", TOKENS.cvxFXN.address, holder);
    const staker = await ethers.getContractAt("MockERC20", CvxFxnStaking, holder);
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

  it("should sweep extra token to stash", async () => {
    await strategy.updateStash(deployer.address);
    const token = await ethers.getContractAt("MockERC20", TOKENS.FXN.address, holder);

    expect(await token.balanceOf(deployer.address)).to.eq(0n);
    await token.transfer(strategy.getAddress(), 123456789n);
    await strategy.connect(operator).harvest(converter.getAddress(), TOKENS.FXN.address);
    expect(await token.balanceOf(deployer.address)).to.eq(123456789n);
  });

  it(`should succeed when harvest to FXN`, async () => {
    await registry.updateRoute(TOKENS.CVX.address, TOKENS.WETH.address, CONVERTER_ROUTRS.CVX.WETH);
    await registry.updateRoute(TOKENS.WETH.address, TOKENS.FXN.address, CONVERTER_ROUTRS.WETH.FXN);
    await converter.updateSupportedPoolTypes(1023);

    const token = await ethers.getContractAt("MockERC20", TOKENS.cvxFXN.address, holder);
    const staker = await ethers.getContractAt("MockERC20", CvxFxnStaking, holder);
    const amount = ethers.parseEther("1000");
    await token.transfer(strategy.getAddress(), amount);
    expect(await staker.balanceOf(strategy.getAddress())).to.eq(0n);
    await strategy.connect(operator).deposit(deployer.address, amount);
    expect(await staker.balanceOf(strategy.getAddress())).to.eq(amount);

    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    // make sure 7 days passed, then the rewards will not increase anymore.
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
    await network.provider.send("evm_mine");

    const harvested = await strategy.connect(operator).harvest.staticCall(converter.getAddress(), TOKENS.FXN.address);
    expect(harvested).to.gt(0n);

    const before = await staker.balanceOf(strategy.getAddress());
    await strategy.connect(operator).harvest(converter.getAddress(), TOKENS.FXN.address);
    const after = await staker.balanceOf(strategy.getAddress());
    expect(after - before).to.eq(harvested);
    console.log("harvested:", ethers.formatUnits(harvested, 18));
  });
});

/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers, network } from "hardhat";
import { TOKENS, ZAP_ROUTES } from "../../../scripts/utils";
import { AladdinZap, CvxFxsStakingStrategy, ICvxFxsStaking, MockERC20 } from "../../../typechain";
import { request_fork } from "../../utils";

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const STAKED_cvxFXS = "0x49b4d1dF40442f0C31b1BbAEA3EDE7c38e37E31a";
const HOLDER = "0x54973508cCFbA18072Db8ac133Ab4A4f91eebdd2";
const OPERATOR = "0xD292b72e5C787f9F7E092aB7802aDDF76930981F";
const FORK_HEIGHT = 17626250;

describe("CvxFxsStakingStrategy.spec", async () => {
  let deployer: SignerWithAddress;
  let operator: SignerWithAddress;
  let holder: SignerWithAddress;
  let zap: AladdinZap;

  let strategy: CvxFxsStakingStrategy;
  let staker: ICvxFxsStaking;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [DEPLOYER, HOLDER, OPERATOR]);
    deployer = await ethers.getSigner(DEPLOYER);
    holder = await ethers.getSigner(HOLDER);
    operator = await ethers.getSigner(OPERATOR);

    await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: operator.address, value: ethers.utils.parseEther("10") });

    staker = await ethers.getContractAt("ICvxFxsStaking", STAKED_cvxFXS, deployer);

    const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
    zap = await AladdinZap.deploy();
    await zap.deployed();
    await zap.initialize();

    const CvxFxsStakingStrategy = await ethers.getContractFactory("CvxFxsStakingStrategy", deployer);
    strategy = await CvxFxsStakingStrategy.deploy(operator.address);
    await strategy.deployed();

    expect(await strategy.name()).to.eq("CvxFxsStaking");
  });

  context("auth", async () => {
    let token: MockERC20;

    beforeEach(async () => {
      token = await ethers.getContractAt("MockERC20", TOKENS.FXS.address, deployer);
    });

    context("#execute", async () => {
      it("should revert, when non-operator call execute", async () => {
        await expect(strategy.execute(constants.AddressZero, 0, [])).to.revertedWith(
          "ConcentratorStrategy: only operator"
        );
      });

      it("should succeed, when operator call", async () => {
        const [status, result] = await strategy
          .connect(operator)
          .callStatic.execute(token.address, 0, token.interface.encodeFunctionData("decimals"));
        await strategy.connect(operator).execute(token.address, 0, token.interface.encodeFunctionData("decimals"));
        expect(status).to.eq(true);
        const [decimal] = ethers.utils.defaultAbiCoder.decode(["uint256"], result);
        expect(decimal).to.eq(BigNumber.from("18"));
      });
    });

    context("#updateRewards", async () => {
      it("should revert, when non-operator call updateRewards", async () => {
        await expect(strategy.updateRewards([])).to.revertedWith("ConcentratorStrategy: only operator");
      });

      it("should revert, when zero token address", async () => {
        await expect(strategy.connect(operator).updateRewards([constants.AddressZero])).to.revertedWith(
          "ConcentratorStrategy: zero reward token"
        );
      });

      it("should revert, when duplicated token", async () => {
        await expect(strategy.connect(operator).updateRewards([token.address, token.address])).to.revertedWith(
          "ConcentratorStrategy: duplicated reward token"
        );
      });

      it("should succeed, when operator call", async () => {
        expect(await strategy.rewards(0)).to.eq(TOKENS.FXS.address);
        expect(await strategy.rewards(1)).to.eq(TOKENS.CVX.address);
        await expect(strategy.rewards(2)).to.reverted;
        await strategy.connect(operator).updateRewards([token.address]);
        expect(await strategy.rewards(0)).to.eq(token.address);
        await expect(strategy.rewards(1)).to.reverted;
      });
    });

    context("#deposit", async () => {
      it("should revert, when non-operator call deposit", async () => {
        await expect(strategy.deposit(deployer.address, 0)).to.revertedWith("ConcentratorStrategy: only operator");
      });

      it("should succeed, when operator call deposit", async () => {
        await strategy.connect(operator).deposit(deployer.address, 0);
      });
    });

    context("#withdraw", async () => {
      it("should revert, when non-operator call withdraw", async () => {
        await expect(strategy.withdraw(deployer.address, 0)).to.revertedWith("ConcentratorStrategy: only operator");
      });

      it("should succeed, when operator call withdraw", async () => {
        await strategy.connect(operator).withdraw(deployer.address, 0);
      });
    });

    context("#harvest", async () => {
      it("should revert, when non-operator call harvest", async () => {
        await expect(strategy.harvest(deployer.address, token.address)).to.revertedWith(
          "ConcentratorStrategy: only operator"
        );
      });

      it("should revert, when intermediate not FXS", async () => {
        await expect(strategy.connect(operator).harvest(deployer.address, constants.AddressZero)).to.revertedWith(
          "intermediate not FXS"
        );
      });

      it("should succeed, when operator call harvest", async () => {
        await strategy.connect(operator).harvest(deployer.address, token.address);
      });
    });

    context("#prepareMigrate", async () => {
      it("should revert, when non-operator call prepareMigrate", async () => {
        await expect(strategy.prepareMigrate(deployer.address)).to.revertedWith("ConcentratorStrategy: only operator");
      });

      it("should succeed, when operator call prepareMigrate", async () => {
        await strategy.connect(operator).prepareMigrate(deployer.address);
      });
    });

    context("#finishMigrate", async () => {
      it("should revert, when non-operator call finishMigrate", async () => {
        await expect(strategy.finishMigrate(deployer.address)).to.revertedWith("ConcentratorStrategy: only operator");
      });

      it("should succeed, when operator call finishMigrate", async () => {
        await strategy.connect(operator).finishMigrate(deployer.address);
      });
    });
  });

  it("should succeed when syncRewardToken", async () => {
    await strategy.connect(operator).updateRewards([]);

    await expect(strategy.rewards(0)).to.reverted;
    await strategy.syncRewardToken();
    expect(await strategy.rewards(0)).to.eq(TOKENS.FXS.address);
    expect(await strategy.rewards(1)).to.eq(TOKENS.CVX.address);
    await expect(strategy.rewards(2)).to.reverted;
  });

  it("should succeed when deposit", async () => {
    const token = await ethers.getContractAt("MockERC20", TOKENS.cvxFXS.address, holder);
    const amount = ethers.utils.parseEther("1000");
    await token.transfer(strategy.address, amount);
    expect(await staker.balanceOf(strategy.address)).to.eq(constants.Zero);
    await strategy.connect(operator).deposit(deployer.address, amount);
    expect(await staker.balanceOf(strategy.address)).to.eq(amount);
  });

  it("should succeed when withdraw", async () => {
    const token = await ethers.getContractAt("MockERC20", TOKENS.cvxFXS.address, holder);
    const amount = ethers.utils.parseEther("1000");
    await token.transfer(strategy.address, amount);
    expect(await staker.balanceOf(strategy.address)).to.eq(constants.Zero);
    await strategy.connect(operator).deposit(deployer.address, amount);
    expect(await staker.balanceOf(strategy.address)).to.eq(amount);

    const before = await token.balanceOf(deployer.address);
    await strategy.connect(operator).withdraw(deployer.address, amount);
    const after = await token.balanceOf(deployer.address);
    expect(after.sub(before)).to.eq(amount);
    expect(await staker.balanceOf(strategy.address)).to.eq(constants.Zero);
  });

  it(`should succeed when harvest to FXS`, async () => {
    await zap.updateRoute(TOKENS.CVX.address, TOKENS.FXS.address, ZAP_ROUTES.CVX.FXS);

    const token = await ethers.getContractAt("MockERC20", TOKENS.cvxFXS.address, holder);
    const amount = ethers.utils.parseEther("1000");
    await token.transfer(strategy.address, amount);
    expect(await staker.balanceOf(strategy.address)).to.eq(constants.Zero);
    await strategy.connect(operator).deposit(deployer.address, amount);
    expect(await staker.balanceOf(strategy.address)).to.eq(amount);

    const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
    // make sure 7 days passed, then the rewards will not increase anymore.
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
    await network.provider.send("evm_mine");

    const harvested = await strategy.connect(operator).callStatic.harvest(zap.address, TOKENS.FXS.address);
    expect(harvested).to.gt(constants.Zero);

    const before = await staker.balanceOf(strategy.address);
    await strategy.connect(operator).harvest(zap.address, TOKENS.FXS.address);
    const after = await staker.balanceOf(strategy.address);
    expect(after.sub(before)).to.eq(harvested);
    console.log("harvested:", ethers.utils.formatUnits(harvested, 18));
  });
});

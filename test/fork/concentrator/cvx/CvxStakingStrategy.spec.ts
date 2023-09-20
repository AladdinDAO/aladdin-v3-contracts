/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { TOKENS, ZAP_ROUTES } from "../../../../scripts/utils";
import { AladdinZap, CvxStakingStrategy, ICvxRewardPool, MockERC20 } from "../../../../typechain";
import { request_fork } from "../../../utils";
import { ZeroAddress } from "ethers";

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const CVX_REWARD_POOL = "0xCF50b810E57Ac33B91dCF525C6ddd9881B139332";
const HOLDER = "0xf584F8728B874a6a5c7A8d4d387C9aae9172D621";
const OPERATOR = "0xD292b72e5C787f9F7E092aB7802aDDF76930981F";
const FORK_HEIGHT = 18178555;

describe("CvxStakingStrategy.spec", async () => {
  let deployer: HardhatEthersSigner;
  let operator: HardhatEthersSigner;
  let holder: HardhatEthersSigner;
  let zap: AladdinZap;

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

    const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
    zap = await AladdinZap.deploy();
    await zap.initialize();

    const CvxStakingStrategy = await ethers.getContractFactory("CvxStakingStrategy", deployer);
    strategy = await CvxStakingStrategy.deploy(operator.address, await staker.getAddress());

    expect(await strategy.name()).to.eq("CvxStaking");
  });

  context("auth", async () => {
    let token: MockERC20;

    beforeEach(async () => {
      token = await ethers.getContractAt("MockERC20", TOKENS.FXS.address, deployer);
    });

    context("#execute", async () => {
      it("should revert, when non-operator call execute", async () => {
        await expect(strategy.execute(ZeroAddress, 0, "0x")).to.revertedWith("ConcentratorStrategy: only operator");
      });

      it("should succeed, when operator call", async () => {
        const [status, result] = await strategy
          .connect(operator)
          .execute.staticCall(await token.getAddress(), 0, token.interface.encodeFunctionData("decimals"));
        await strategy
          .connect(operator)
          .execute(await token.getAddress(), 0, token.interface.encodeFunctionData("decimals"));
        expect(status).to.eq(true);
        const [decimal] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], result);
        expect(decimal).to.eq(18n);
      });
    });

    context("#updateRewards", async () => {
      it("should revert, when non-operator call updateRewards", async () => {
        await expect(strategy.updateRewards([])).to.revertedWith("ConcentratorStrategy: only operator");
      });

      it("should revert, when zero token address", async () => {
        await expect(strategy.connect(operator).updateRewards([ZeroAddress])).to.revertedWith(
          "ConcentratorStrategy: zero reward token"
        );
      });

      it("should revert, when duplicated token", async () => {
        await expect(
          strategy.connect(operator).updateRewards([await token.getAddress(), await token.getAddress()])
        ).to.revertedWith("ConcentratorStrategy: duplicated reward token");
      });

      it("should succeed, when operator call", async () => {
        expect(await strategy.rewards(0)).to.eq(TOKENS.cvxCRV.address);
        await expect(strategy.rewards(1)).to.reverted;
        await strategy.connect(operator).updateRewards([await token.getAddress()]);
        expect(await strategy.rewards(0)).to.eq(await token.getAddress());
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
        await expect(strategy.harvest(deployer.address, await token.getAddress())).to.revertedWith(
          "ConcentratorStrategy: only operator"
        );
      });

      it("should succeed, when operator call harvest", async () => {
        await strategy.connect(operator).harvest(deployer.address, await token.getAddress());
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

  it("should succeed when deposit", async () => {
    const token = await ethers.getContractAt("MockERC20", TOKENS.CVX.address, holder);
    const amount = ethers.parseEther("1000");
    await token.transfer(await strategy.getAddress(), amount);
    expect(await staker.balanceOf(await strategy.getAddress())).to.eq(0n);
    await strategy.connect(operator).deposit(deployer.address, amount);
    expect(await staker.balanceOf(await strategy.getAddress())).to.eq(amount);
  });

  it("should succeed when withdraw", async () => {
    const token = await ethers.getContractAt("MockERC20", TOKENS.CVX.address, holder);
    const amount = ethers.parseEther("1000");
    await token.transfer(await strategy.getAddress(), amount);
    expect(await staker.balanceOf(await strategy.getAddress())).to.eq(0n);
    await strategy.connect(operator).deposit(deployer.address, amount);
    expect(await staker.balanceOf(await strategy.getAddress())).to.eq(amount);

    const before = await token.balanceOf(deployer.address);
    await strategy.connect(operator).withdraw(deployer.address, amount);
    const after = await token.balanceOf(deployer.address);
    expect(after - before).to.eq(amount);
    expect(await staker.balanceOf(await strategy.getAddress())).to.eq(0n);
  });

  it(`should succeed when harvest to CVX with WETH as intermediate`, async () => {
    await zap.updateRoute(TOKENS.cvxCRV.address, TOKENS.WETH.address, ZAP_ROUTES.cvxCRV.WETH);
    await zap.updateRoute(TOKENS.WETH.address, TOKENS.CVX.address, ZAP_ROUTES.WETH.CVX);

    const token = await ethers.getContractAt("MockERC20", TOKENS.CVX.address, holder);
    const amount = ethers.parseEther("1000");
    await token.transfer(await strategy.getAddress(), amount);
    expect(await staker.balanceOf(await strategy.getAddress())).to.eq(0n);
    await strategy.connect(operator).deposit(deployer.address, amount);
    expect(await staker.balanceOf(await strategy.getAddress())).to.eq(amount);

    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    // make sure 7 days passed, then the rewards will not increase anymore.
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
    await network.provider.send("evm_mine");

    const harvested = await strategy.connect(operator).harvest.staticCall(await zap.getAddress(), TOKENS.WETH.address);
    expect(harvested).to.gt(0n);

    const before = await staker.balanceOf(await strategy.getAddress());
    await strategy.connect(operator).harvest(await zap.getAddress(), TOKENS.WETH.address);
    const after = await staker.balanceOf(await strategy.getAddress());
    expect(after - before).to.eq(harvested);
    console.log("harvested:", ethers.formatUnits(harvested, 18));
  });
});

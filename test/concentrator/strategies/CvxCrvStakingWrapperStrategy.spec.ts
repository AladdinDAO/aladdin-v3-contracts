/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers, network } from "hardhat";
import { TOKENS, ZAP_ROUTES } from "../../../scripts/utils";
import {
  AladdinZap,
  CvxCrvStakingWrapperStrategy,
  IConvexBooster,
  ICvxCrvStakingWrapper,
  MockERC20,
} from "../../../typechain";
import { request_fork } from "../../utils";

const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const STAKED_CVXCRV = "0xaa0C3f5F7DFD688C6E646F66CD2a6B66ACdbE434";
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const HOLDER = "0xbe8f240968a60f8849abbb6838849aa8e96daab4";
const OPERATOR = "0xD292b72e5C787f9F7E092aB7802aDDF76930981F";
const FORK_HEIGHT = 16445265;

describe("CvxCrvStakingWrapperStrategy.spec", async () => {
  // WEIGHT_PRECISION = 10000
  const run = async (weight: number) => {
    context(`weight[${weight}]`, async () => {
      let deployer: SignerWithAddress;
      let operator: SignerWithAddress;
      let holder: SignerWithAddress;
      let zap: AladdinZap;
      let booster: IConvexBooster;
      let strategy: CvxCrvStakingWrapperStrategy;
      let wrapper: ICvxCrvStakingWrapper;

      beforeEach(async () => {
        request_fork(FORK_HEIGHT, [DEPLOYER, HOLDER, OPERATOR]);
        deployer = await ethers.getSigner(DEPLOYER);
        holder = await ethers.getSigner(HOLDER);
        operator = await ethers.getSigner(OPERATOR);

        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });
        await deployer.sendTransaction({ to: operator.address, value: ethers.utils.parseEther("10") });

        booster = await ethers.getContractAt("IConvexBooster", BOOSTER, deployer);
        wrapper = await ethers.getContractAt("ICvxCrvStakingWrapper", STAKED_CVXCRV, deployer);

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        const CvxCrvStakingWrapperStrategy = await ethers.getContractFactory("CvxCrvStakingWrapperStrategy", deployer);
        strategy = await CvxCrvStakingWrapperStrategy.deploy(operator.address, STAKED_CVXCRV);
        await strategy.deployed();

        expect(await strategy.name()).to.eq("CvxCrvStakingWrapper");
        await strategy.setRewardWeight(Math.floor(weight * 10000));
      });

      context("auth", async () => {
        let token: MockERC20;

        beforeEach(async () => {
          token = await ethers.getContractAt("MockERC20", TOKENS.CVX.address, deployer);
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
            expect(await strategy.rewards(0)).to.eq(TOKENS.CRV.address);
            expect(await strategy.rewards(1)).to.eq(TOKENS.CVX.address);
            expect(await strategy.rewards(2)).to.eq(TOKENS.TRICRV.address);
            await expect(strategy.rewards(3)).to.reverted;
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

          it("should succeed, when operator call harvest", async () => {
            await strategy.connect(operator).harvest(deployer.address, token.address);
          });
        });

        context("#prepareMigrate", async () => {
          it("should revert, when non-operator call prepareMigrate", async () => {
            await expect(strategy.prepareMigrate(deployer.address)).to.revertedWith(
              "ConcentratorStrategy: only operator"
            );
          });

          it("should succeed, when operator call prepareMigrate", async () => {
            await strategy.connect(operator).prepareMigrate(deployer.address);
          });
        });

        context("#finishMigrate", async () => {
          it("should revert, when non-operator call finishMigrate", async () => {
            await expect(strategy.finishMigrate(deployer.address)).to.revertedWith(
              "ConcentratorStrategy: only operator"
            );
          });

          it("should succeed, when operator call finishMigrate", async () => {
            await strategy.connect(operator).finishMigrate(deployer.address);
          });
        });

        context("setRewardWeight", async () => {
          it("should revert, when non-owner call setRewardWeight", async () => {
            await expect(strategy.connect(operator).setRewardWeight(0)).to.revertedWith(
              "Ownable: caller is not the owner"
            );
          });

          it("should revert, when weight too large", async () => {
            await expect(strategy.setRewardWeight(10001)).to.revertedWith("!invalid");
          });

          it("should succeed", async () => {
            expect(await wrapper.userRewardWeight(strategy.address)).to.eq(0);
            await strategy.setRewardWeight(1);
            expect(await wrapper.userRewardWeight(strategy.address)).to.eq(1);
            await strategy.setRewardWeight(100);
            expect(await wrapper.userRewardWeight(strategy.address)).to.eq(100);
            await strategy.setRewardWeight(10000);
            expect(await wrapper.userRewardWeight(strategy.address)).to.eq(10000);
          });
        });
      });

      it("should succeed when deposit", async () => {
        const token = await ethers.getContractAt("MockERC20", TOKENS.cvxCRV.address, holder);
        const amount = ethers.utils.parseEther("1000");
        await token.transfer(strategy.address, amount);
        expect(await wrapper.balanceOf(strategy.address)).to.eq(constants.Zero);
        await strategy.connect(operator).deposit(deployer.address, amount);
        expect(await wrapper.balanceOf(strategy.address)).to.eq(amount);
      });

      it("should succeed when withdraw", async () => {
        const token = await ethers.getContractAt("MockERC20", TOKENS.cvxCRV.address, holder);
        const amount = ethers.utils.parseEther("1000");
        await token.transfer(strategy.address, amount);
        expect(await wrapper.balanceOf(strategy.address)).to.eq(constants.Zero);
        await strategy.connect(operator).deposit(deployer.address, amount);
        expect(await wrapper.balanceOf(strategy.address)).to.eq(amount);

        const before = await token.balanceOf(deployer.address);
        await strategy.connect(operator).withdraw(deployer.address, amount);
        const after = await token.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amount);
        expect(await wrapper.balanceOf(strategy.address)).to.eq(constants.Zero);
      });

      it(`should succeed when harvest to CRV`, async () => {
        await zap.updateRoute(TOKENS.CVX.address, TOKENS.CRV.address, ZAP_ROUTES.CVX.CRV);
        await zap.updateRoute(TOKENS.TRICRV.address, TOKENS.CRV.address, ZAP_ROUTES.TRICRV.CRV);

        const token = await ethers.getContractAt("MockERC20", TOKENS.cvxCRV.address, holder);
        const intermediateToken = await ethers.getContractAt("MockERC20", TOKENS.CRV.address, holder);
        const amount = ethers.utils.parseEther("100000");
        await token.transfer(strategy.address, amount);
        expect(await wrapper.balanceOf(strategy.address)).to.eq(constants.Zero);
        await strategy.connect(operator).deposit(deployer.address, amount);
        expect(await wrapper.balanceOf(strategy.address)).to.eq(amount);

        await booster.earmarkFees();
        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        // make sure 7 days passed, then the rewards will not increase anymore.
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
        await network.provider.send("evm_mine");

        const harvested = await strategy.connect(operator).callStatic.harvest(zap.address, TOKENS.CRV.address);
        expect(harvested).to.gt(constants.Zero);

        const before = await intermediateToken.balanceOf(operator.address);
        await strategy.connect(operator).harvest(zap.address, TOKENS.CRV.address);
        const after = await intermediateToken.balanceOf(operator.address);
        expect(after.sub(before)).to.eq(harvested);
        console.log("harvested:", ethers.utils.formatUnits(harvested, 18));
      });
    });
  };

  for (const weight of [0, 0.5, 1]) {
    run(weight);
  }
});

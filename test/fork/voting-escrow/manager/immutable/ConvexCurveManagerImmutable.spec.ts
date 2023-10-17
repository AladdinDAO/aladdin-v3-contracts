/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { toBigInt } from "ethers";
import { ethers, network } from "hardhat";

import { request_fork } from "@/test/utils";
import { ConvexCurveManagerImmutable, IConvexBasicRewards, LiquidityGauge, MockERC20 } from "@/types/index";
import { TOKENS } from "@/utils/tokens";

interface ITestCase {
  fork: number;
  holder: string;
  deployer: string;
  name: string;
  token: string;
  rewarder: string;
  amount: bigint;
  rewards: Array<string>;
}

const TestCases: Array<ITestCase> = [
  {
    fork: 18339600,
    holder: "0x310D5C8EE1512D5092ee4377061aE82E48973689",
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    name: "MIM/3CRV",
    token: "0x5a6A4D54456819380173272A5E8E9B9904BdF41B",
    rewarder: "0xFd5AbF66b003881b88567EB9Ed9c651F14Dc4771",
    amount: ethers.parseEther("50000"),
    rewards: [TOKENS.CRV.address, TOKENS.SPELL.address, TOKENS.CVX.address],
  },
  {
    fork: 18339600,
    holder: "0xd8c2ee2FEfAc57F8B3cD63bE28D8F89bBBf5a5F2",
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    name: "ETH/CNC",
    token: "0xF9835375f6b268743Ea0a54d742Aa156947f8C06",
    rewarder: "0x1A3c8B2F89B1C2593fa46C30ADA0b4E3D0133fF8",
    amount: ethers.parseEther("20"),
    rewards: [TOKENS.CRV.address, TOKENS.CNC.address, TOKENS.CVX.address],
  },
];

describe("ConvexCurveManagerImmutable.spec", async () => {
  let deployer: HardhatEthersSigner;
  let holder: HardhatEthersSigner;

  let token: MockERC20;
  let gauge: LiquidityGauge;
  let rewarder: IConvexBasicRewards;
  let manager: ConvexCurveManagerImmutable;

  for (const testcase of TestCases) {
    context(`test with token[${testcase.name}] in rewarder[${testcase.rewarder}]`, async () => {
      beforeEach(async () => {
        request_fork(testcase.fork, [testcase.deployer, testcase.holder]);
        deployer = await ethers.getSigner(testcase.deployer);
        holder = await ethers.getSigner(testcase.holder);
        await deployer.sendTransaction({ to: holder.address, value: ethers.parseEther("10") });

        const ConvexCurveManagerImmutable = await ethers.getContractFactory("ConvexCurveManagerImmutable", deployer);
        const LiquidityGauge = await ethers.getContractFactory("LiquidityGauge", deployer);

        rewarder = await ethers.getContractAt("IConvexBasicRewards", testcase.rewarder, deployer);
        token = await ethers.getContractAt("MockERC20", testcase.token, deployer);
        gauge = await LiquidityGauge.deploy("0xC8b194925D55d5dE9555AD1db74c149329F71DeF");
        manager = await ConvexCurveManagerImmutable.deploy(
          gauge.getAddress(),
          token.getAddress(),
          rewarder.getAddress()
        );

        await gauge.initialize(token.getAddress());
        await gauge.updateLiquidityManager(manager.getAddress());
        await gauge.grantRole(await gauge.REWARD_MANAGER_ROLE(), deployer.address);
        for (const reward of testcase.rewards) {
          await gauge.registerRewardToken(reward, manager.getAddress());
        }
      });

      context("constructor", async () => {
        it("should initialize correctly", async () => {
          expect(await manager.operator()).to.eq(await gauge.getAddress());
          expect(await manager.token()).to.eq(await token.getAddress());
          expect(await manager.isActive()).to.eq(true);
          expect(await manager.getManagerRatio()).to.eq(0n);
          expect(await manager.getHarvesterRatio()).to.eq(0n);

          expect(await manager.getRewardTokens()).to.deep.eq(testcase.rewards);
          expect(await manager.pid()).to.eq(await rewarder.pid());
          expect(await manager.rewarder()).to.eq(testcase.rewarder);
        });
      });

      context("#deposit", async () => {
        it("should succeed, when deposit without manage", async () => {
          await token.connect(holder).approve(gauge.getAddress(), testcase.amount);
          expect(await token.balanceOf(manager.getAddress())).to.eq(0n);
          await gauge.connect(holder)["deposit(uint256,address)"](testcase.amount, holder.address);
          expect(await token.balanceOf(manager.getAddress())).to.eq(testcase.amount);
        });

        it("should succeed, when deposit with manage", async () => {
          await manager.updateManagerRatio(1e8); // 10%

          // deposit with manage, no incentive
          await token.connect(holder).approve(gauge.getAddress(), testcase.amount);
          expect(await token.balanceOf(manager.getAddress())).to.eq(0n);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(0n);
          await gauge.connect(holder)["deposit(uint256,address,bool)"](testcase.amount, holder.address, true);
          expect(await token.balanceOf(manager.getAddress())).to.eq(0n);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(testcase.amount);

          // check incentive
          const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await manager.harvest(deployer.address);

          const crv = await ethers.getContractAt("MockERC20", TOKENS.CRV.address, deployer);
          const cvx = await ethers.getContractAt("MockERC20", TOKENS.CVX.address, deployer);
          const crvIncentive = await manager.incentive(TOKENS.CRV.address);
          const cvxIncentive = await manager.incentive(TOKENS.CVX.address);
          expect(await manager.incentive(TOKENS.CRV.address)).to.gt(0n);
          expect(await manager.incentive(TOKENS.CVX.address)).to.gt(0n);

          // deposit with manage again, this time will give some incentive
          const crvBefore = await crv.balanceOf(deployer.address);
          const cvxBefore = await cvx.balanceOf(deployer.address);
          await token.connect(holder).approve(gauge.getAddress(), testcase.amount);
          expect(await token.balanceOf(manager.getAddress())).to.eq(0n);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(testcase.amount);
          await gauge.connect(holder)["deposit(uint256,address,bool)"](testcase.amount, deployer.address, true);
          const crvAfter = await crv.balanceOf(deployer.address);
          const cvxAfter = await cvx.balanceOf(deployer.address);
          expect(await token.balanceOf(manager.getAddress())).to.eq(0n);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(testcase.amount * 2n);

          expect(crvAfter - crvBefore).to.eq(crvIncentive);
          expect(cvxAfter - cvxBefore).to.eq(cvxIncentive);

          expect(await manager.incentive(TOKENS.CRV.address)).to.eq(0n);
          expect(await manager.incentive(TOKENS.CVX.address)).to.eq(0n);
        });
      });

      context("#withdraw", async () => {
        beforeEach(async () => {
          // deposit with manage
          await token.connect(holder).approve(gauge.getAddress(), testcase.amount);
          await gauge.connect(holder)["deposit(uint256,address,bool)"](testcase.amount, holder.address, true);
          // deposit without manage
          await token.connect(holder).approve(gauge.getAddress(), testcase.amount);
          await gauge.connect(holder)["deposit(uint256,address,bool)"](testcase.amount, holder.address, false);
        });

        it("should succeed", async () => {
          expect(await token.balanceOf(manager.getAddress())).to.eq(testcase.amount);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(testcase.amount);

          // withdraw from manager balance
          const before = await token.balanceOf(deployer.address);
          await gauge.connect(holder)["withdraw(uint256,address)"](testcase.amount - 1n, deployer.address);
          let after = await token.balanceOf(deployer.address);
          expect(after - before).to.eq(testcase.amount - 1n);
          expect(await token.balanceOf(manager.getAddress())).to.eq(1n);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(testcase.amount);

          // withdraw from manager and rewarder
          await gauge.connect(holder)["withdraw(uint256,address)"](testcase.amount, deployer.address);
          after = await token.balanceOf(deployer.address);
          expect(after - before).to.eq(testcase.amount * 2n - 1n);
          expect(await token.balanceOf(manager.getAddress())).to.eq(0n);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(1n);
        });
      });

      context("#execute", async () => {
        beforeEach(async () => {
          // deposit with manage
          await token.connect(holder).approve(gauge.getAddress(), testcase.amount);
          await gauge.connect(holder)["deposit(uint256,address,bool)"](testcase.amount, holder.address, true);
          // deposit without manage
          await token.connect(holder).approve(gauge.getAddress(), testcase.amount);
          await gauge.connect(holder)["deposit(uint256,address,bool)"](testcase.amount, holder.address, false);
        });

        it("should succeed to withdraw from rewarder", async () => {
          expect(await token.balanceOf(manager.getAddress())).to.eq(testcase.amount);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(testcase.amount);
          await manager.execute(
            rewarder.getAddress(),
            0,
            rewarder.interface.encodeFunctionData("withdrawAndUnwrap", [testcase.amount, false])
          );
          expect(await token.balanceOf(manager.getAddress())).to.eq(testcase.amount * 2n);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(0n);
        });
      });

      context("#kill", async () => {
        beforeEach(async () => {
          // deposit with manage
          await token.connect(holder).approve(gauge.getAddress(), testcase.amount);
          await gauge.connect(holder)["deposit(uint256,address,bool)"](testcase.amount, holder.address, true);
          // deposit without manage
          await token.connect(holder).approve(gauge.getAddress(), testcase.amount);
          await gauge.connect(holder)["deposit(uint256,address,bool)"](testcase.amount, holder.address, false);
        });

        it("should succeed to return fund to gauge", async () => {
          expect(await token.balanceOf(manager.getAddress())).to.eq(testcase.amount);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(testcase.amount);
          await manager.kill();
          expect(await token.balanceOf(manager.getAddress())).to.eq(0n);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(0n);
          expect(await token.balanceOf(gauge.getAddress())).to.eq(testcase.amount * 2n);
        });
      });

      context("#manage", async () => {
        beforeEach(async () => {
          await manager.updateManagerRatio(1e8); // 10%

          // deposit with manage, no incentive
          await token.connect(holder).approve(gauge.getAddress(), testcase.amount);
          expect(await token.balanceOf(manager.getAddress())).to.eq(0n);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(0n);
          await gauge.connect(holder)["deposit(uint256,address,bool)"](testcase.amount, holder.address, true);
          expect(await token.balanceOf(manager.getAddress())).to.eq(0n);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(testcase.amount);

          // check incentive
          const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await manager.harvest(deployer.address);
          expect(await manager.incentive(TOKENS.CRV.address)).to.gt(0n);
          expect(await manager.incentive(TOKENS.CVX.address)).to.gt(0n);
        });

        it("should succeed", async () => {
          const crv = await ethers.getContractAt("MockERC20", TOKENS.CRV.address, deployer);
          const cvx = await ethers.getContractAt("MockERC20", TOKENS.CVX.address, deployer);
          const crvIncentive = await manager.incentive(TOKENS.CRV.address);
          const cvxIncentive = await manager.incentive(TOKENS.CVX.address);

          // manage, no incentive
          let crvBefore = await crv.balanceOf(deployer.address);
          let cvxBefore = await cvx.balanceOf(deployer.address);
          await token.connect(holder).approve(gauge.getAddress(), testcase.amount);
          expect(await token.balanceOf(manager.getAddress())).to.eq(0n);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(testcase.amount);
          await manager.manage(deployer.address);
          let crvAfter = await crv.balanceOf(deployer.address);
          let cvxAfter = await cvx.balanceOf(deployer.address);
          expect(await token.balanceOf(manager.getAddress())).to.eq(0n);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(testcase.amount);
          expect(crvAfter - crvBefore).to.eq(0n);
          expect(cvxAfter - cvxBefore).to.eq(0n);
          expect(await manager.incentive(TOKENS.CRV.address)).to.eq(crvIncentive);
          expect(await manager.incentive(TOKENS.CVX.address)).to.eq(cvxIncentive);

          // deposit without manage
          expect(await token.balanceOf(manager.getAddress())).to.eq(0n);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(testcase.amount);
          await gauge.connect(holder)["deposit(uint256,address,bool)"](testcase.amount, deployer.address, false);
          expect(await token.balanceOf(manager.getAddress())).to.eq(testcase.amount);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(testcase.amount);

          // manage, with incentive
          crvBefore = await crv.balanceOf(deployer.address);
          cvxBefore = await cvx.balanceOf(deployer.address);
          await manager.manage(deployer.address);
          crvAfter = await crv.balanceOf(deployer.address);
          cvxAfter = await cvx.balanceOf(deployer.address);
          expect(await token.balanceOf(manager.getAddress())).to.eq(0n);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(testcase.amount * 2n);
          expect(crvAfter - crvBefore).to.eq(crvIncentive);
          expect(cvxAfter - cvxBefore).to.eq(cvxIncentive);
          expect(await manager.incentive(TOKENS.CRV.address)).to.eq(0n);
          expect(await manager.incentive(TOKENS.CVX.address)).to.eq(0n);
        });
      });

      context("#harvest", async () => {
        beforeEach(async () => {
          // deposit with manage, no incentive
          await token.connect(holder).approve(gauge.getAddress(), testcase.amount);
          expect(await token.balanceOf(manager.getAddress())).to.eq(0n);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(0n);
          await gauge.connect(holder)["deposit(uint256,address,bool)"](testcase.amount, holder.address, true);
          expect(await token.balanceOf(manager.getAddress())).to.eq(0n);
          expect(await rewarder.balanceOf(manager.getAddress())).to.eq(testcase.amount);
        });

        for (const managerRatio of [5e7, 1e8]) {
          for (const harvesterRatio of [0, 5e6, 1e7]) {
            it(`should succeed, managerRatio=${managerRatio} harvesterRatio=${harvesterRatio}`, async () => {
              await manager.updateManagerRatio(managerRatio);
              await manager.updateHarvesterRatio(harvesterRatio);

              const crv = await ethers.getContractAt("MockERC20", TOKENS.CRV.address, deployer);
              const cvx = await ethers.getContractAt("MockERC20", TOKENS.CVX.address, deployer);

              const crvGaugeBefore = await crv.balanceOf(gauge.getAddress());
              const crvDeployerBefore = await crv.balanceOf(deployer.address);
              const crvIncentiveBefore = await manager.incentive(TOKENS.CRV.address);
              const cvxGaugeBefore = await cvx.balanceOf(gauge.getAddress());
              const cvxDeployerBefore = await cvx.balanceOf(deployer.address);
              const cvxIncentiveBefore = await manager.incentive(TOKENS.CVX.address);
              const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
              await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
              await manager.harvest(deployer.address);
              const crvGaugeAfter = await crv.balanceOf(gauge.getAddress());
              const crvDeployerAfter = await crv.balanceOf(deployer.address);
              const crvIncentiveAfter = await manager.incentive(TOKENS.CRV.address);
              const cvxGaugeAfter = await cvx.balanceOf(gauge.getAddress());
              const cvxDeployerAfter = await cvx.balanceOf(deployer.address);
              const cvxIncentiveAfter = await manager.incentive(TOKENS.CVX.address);
              const crvTotal =
                crvGaugeAfter -
                crvGaugeBefore +
                crvDeployerAfter -
                crvDeployerBefore +
                crvIncentiveAfter -
                crvIncentiveBefore;
              const crvHarvester = (crvTotal * toBigInt(harvesterRatio)) / toBigInt(1e9);
              const crvIncentive = (crvTotal * toBigInt(managerRatio)) / toBigInt(1e9);
              expect(crvDeployerAfter - crvDeployerBefore).to.eq(crvHarvester);
              expect(crvIncentiveAfter - crvIncentiveBefore).to.eq(crvIncentive);
              expect(crvGaugeAfter - crvGaugeBefore).to.eq(crvTotal - crvHarvester - crvIncentive);
              const cvxTotal =
                cvxGaugeAfter -
                cvxGaugeBefore +
                cvxDeployerAfter -
                cvxDeployerBefore +
                cvxIncentiveAfter -
                cvxIncentiveBefore;
              const cvxHarvester = (cvxTotal * toBigInt(harvesterRatio)) / toBigInt(1e9);
              const cvxIncentive = (cvxTotal * toBigInt(managerRatio)) / toBigInt(1e9);
              expect(cvxDeployerAfter - cvxDeployerBefore).to.eq(cvxHarvester);
              expect(cvxIncentiveAfter - cvxIncentiveBefore).to.eq(cvxIncentive);
              expect(cvxGaugeAfter - cvxGaugeBefore).to.eq(cvxTotal - cvxHarvester - cvxIncentive);
            });
          }
        }
      });
    });
  }
});

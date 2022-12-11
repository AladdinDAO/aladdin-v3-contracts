/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers, network } from "hardhat";
import { TOKENS, VAULT_CONFIG, ZAP_ROUTES } from "../../../scripts/utils";
import { AladdinZap, ManualCompoundingCurveGaugeStrategy, ICurveGauge, MockERC20 } from "../../../typechain";
import { request_fork } from "../../utils";

const UNDERLYING: {
  [name: string]: {
    fork: number;
    deployer: string;
    token: string;
    pool: string;
    gauge: string;
    holder: string;
    amount: string;
    rewards: string[];
    intermediates: string[];
  };
} = {
  frxeth: {
    fork: 16124420,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    token: "0xf43211935C781D5ca1a41d2041F397B8A7366C7A",
    pool: "0xa1F8A6807c402E4A15ef4EBa36528A3FED24E577",
    gauge: "0x2932a86df44Fe8D2A706d8e9c5d51c24883423F5",
    holder: "0xadd85e4abbb426e895f35e0a2576e22a9bbb7a57",
    amount: "10",
    rewards: ["CVX", "CRV"],
    intermediates: ["CRV", "FXS", "WETH"],
  },
  steth: {
    fork: 16124420,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    token: "0x06325440D014e39736583c165C2963BA99fAf14E",
    pool: "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022",
    gauge: "0x182B723a58739a9c974cFDB385ceaDb237453c28",
    holder: "0x13e382dfe53207E9ce2eeEab330F69da2794179E",
    amount: "100",
    rewards: ["CVX", "CRV", "LDO"],
    intermediates: ["CRV", "WETH"],
  },
  cbeth: {
    fork: 16124420,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    token: "0x5b6C539b224014A09B3388e51CaAA8e354c959C8",
    pool: "0x5FAE7E604FC3e24fd43A72867ceBaC94c65b404A",
    gauge: "0xAd96E10123Fa34a01cf2314C42D75150849C9295",
    holder: "0xe4d7e7b90519445585635c3b383c9d86c0596e57",
    amount: "10",
    rewards: ["CVX", "CRV"],
    intermediates: ["CRV", "WETH"],
  },
  cvxfxs: {
    fork: 16124420,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    token: "0xF3A43307DcAFa93275993862Aae628fCB50dC768",
    pool: "0xd658A338613198204DCa1143Ac3F01A722b5d94A",
    gauge: "0xab1927160ec7414c6fa71763e2a9f3d107c126dd",
    holder: "0xdc88d12721f9ca1404e9e6e6389ae0abdd54fc6c",
    amount: "1000",
    rewards: ["CVX", "CRV", "FXS"],
    intermediates: ["CRV", "WETH", "FXS"],
  },
};

describe("ManualCompoundingCurveGaugeStrategy.spec", async () => {
  context("auth", async () => {
    let deployer: SignerWithAddress;
    let operator: SignerWithAddress;
    let strategy: ManualCompoundingCurveGaugeStrategy;
    let token: MockERC20;

    beforeEach(async () => {
      [deployer, operator] = await ethers.getSigners();

      const ManualCompoundingCurveGaugeStrategy = await ethers.getContractFactory(
        "ManualCompoundingCurveGaugeStrategy",
        deployer
      );
      strategy = await ManualCompoundingCurveGaugeStrategy.deploy();
      await strategy.deployed();

      const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
      token = await MockERC20.deploy("x", "y", 18);
      await token.deployed();

      const MockCurveGaugeV4V5 = await ethers.getContractFactory("MockCurveGaugeV4V5", deployer);
      const gauge = await MockCurveGaugeV4V5.deploy();
      await gauge.deployed();

      await strategy.initialize(operator.address, token.address, gauge.address, []);

      expect(await strategy.name()).to.eq("ManualCompoundingCurveGauge");
    });

    it("should revert, when initialize again", async () => {
      await expect(
        strategy.initialize(constants.AddressZero, constants.AddressZero, constants.AddressZero, [])
      ).to.revertedWith("Initializable: contract is already initialized");
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
        await expect(strategy.rewards(0)).to.reverted;
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

  const run = async (
    name: string,
    config: {
      fork: number;
      deployer: string;
      token: string;
      pool: string;
      gauge: string;
      holder: string;
      amount: string;
      rewards: string[];
      intermediates: string[];
    }
  ) => {
    context(`${name}`, async () => {
      let deployer: SignerWithAddress;
      let holder: SignerWithAddress;
      let zap: AladdinZap;
      let strategy: ManualCompoundingCurveGaugeStrategy;
      let gauge: ICurveGauge;

      beforeEach(async () => {
        request_fork(config.fork, [config.deployer, config.holder]);
        deployer = await ethers.getSigner(config.deployer);
        holder = await ethers.getSigner(config.holder);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });

        gauge = await ethers.getContractAt("ICurveGauge", config.gauge, deployer);

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        await zap.updatePoolTokens([config.pool], [config.token]);

        for (const [symbol, routes] of Object.entries(VAULT_CONFIG[name].deposit)) {
          await zap.updateRoute(TOKENS[symbol].address, config.token, routes);
        }

        const ManualCompoundingCurveGaugeStrategy = await ethers.getContractFactory(
          "ManualCompoundingCurveGaugeStrategy",
          deployer
        );
        strategy = await ManualCompoundingCurveGaugeStrategy.deploy();
        await strategy.deployed();

        await strategy.initialize(
          deployer.address,
          config.token,
          config.gauge,
          config.rewards.map((symbol) => TOKENS[symbol].address)
        );
      });

      it("should succeed when deposit", async () => {
        const token = await ethers.getContractAt("MockERC20", config.token, holder);
        const amount = ethers.utils.parseEther(config.amount);
        await token.transfer(strategy.address, amount);
        await strategy.deposit(deployer.address, amount);
        expect(await gauge.balanceOf(strategy.address)).to.eq(amount);
      });

      it("should succeed when withdraw", async () => {
        const token = await ethers.getContractAt("MockERC20", config.token, holder);
        const amount = ethers.utils.parseEther(config.amount);
        await token.transfer(strategy.address, amount);
        await strategy.deposit(deployer.address, amount);
        expect(await gauge.balanceOf(strategy.address)).to.eq(amount);

        const before = await token.balanceOf(deployer.address);
        await strategy.withdraw(deployer.address, amount);
        const after = await token.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amount);
        expect(await gauge.balanceOf(strategy.address)).to.eq(constants.Zero);
      });

      for (const intermediate of config.intermediates) {
        it(`should succeed when harvest to ${intermediate}`, async () => {
          for (const reward of config.rewards) {
            if (intermediate === reward) continue;
            await zap.updateRoute(
              TOKENS[reward].address,
              TOKENS[intermediate].address,
              ZAP_ROUTES[reward][intermediate]
            );
          }

          const token = await ethers.getContractAt("MockERC20", config.token, holder);
          const amount = ethers.utils.parseEther(config.amount);
          await token.transfer(strategy.address, amount);
          await strategy.deposit(deployer.address, amount);
          expect(await gauge.balanceOf(strategy.address)).to.eq(amount);

          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          // make sure 7 days passed, then the rewards will not increase anymore.
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await network.provider.send("evm_mine");

          const intermediateToken = await ethers.getContractAt("MockERC20", TOKENS[intermediate].address, holder);
          const harvested = await strategy.callStatic.harvest(zap.address, TOKENS[intermediate].address);
          expect(harvested).to.gt(constants.Zero);

          const before = await intermediateToken.balanceOf(deployer.address);
          await strategy.harvest(zap.address, TOKENS[intermediate].address);
          const after = await intermediateToken.balanceOf(deployer.address);
          expect(after.sub(before)).to.closeToBn(harvested, harvested.div(1e4));
        });

        if (intermediate === "WETH") {
          it(`should succeed when harvest to ETH`, async () => {
            for (const reward of config.rewards) {
              if (intermediate === reward) continue;
              await zap.updateRoute(
                TOKENS[reward].address,
                TOKENS[intermediate].address,
                ZAP_ROUTES[reward][intermediate]
              );
            }

            const token = await ethers.getContractAt("MockERC20", config.token, holder);
            const amount = ethers.utils.parseEther(config.amount);
            await token.transfer(strategy.address, amount);
            await strategy.deposit(deployer.address, amount);
            expect(await gauge.balanceOf(strategy.address)).to.eq(amount);

            const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            // make sure 7 days passed, then the rewards will not increase anymore.
            await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
            await network.provider.send("evm_mine");

            const harvested = await strategy.callStatic.harvest(zap.address, constants.AddressZero);
            expect(harvested).to.gt(constants.Zero);

            const before = await deployer.getBalance();
            const tx = await strategy.harvest(zap.address, constants.AddressZero);
            const receipt = await tx.wait();
            const after = await deployer.getBalance();
            expect(after.sub(before).add(receipt.gasUsed.mul(receipt.effectiveGasPrice))).to.closeToBn(
              harvested,
              harvested.div(1e4)
            );
          });
        }
      }
    });
  };

  for (const [name, config] of Object.entries(UNDERLYING)) {
    run(name, config);
  }
});

/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers, network } from "hardhat";
import { TOKENS, VAULT_CONFIG, ZAP_ROUTES } from "../../../scripts/utils";
import { AladdinZap, ConvexCurveAutoCompoundingStrategy, IConvexBasicRewards, MockERC20 } from "../../../typechain";
import { request_fork } from "../../utils";

const UNDERLYING: {
  [name: string]: {
    fork: number;
    deployer: string;
    token: string;
    pool: string;
    rewarder: string;
    holder: string;
    amount: string;
    rewards: string[];
    intermediate: string;
  };
} = {
  frxeth: {
    fork: 16124420,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    token: "0xf43211935C781D5ca1a41d2041F397B8A7366C7A",
    pool: "0xa1F8A6807c402E4A15ef4EBa36528A3FED24E577",
    rewarder: "0xbD5445402B0a287cbC77cb67B2a52e2FC635dce4",
    holder: "0xadd85e4abbb426e895f35e0a2576e22a9bbb7a57",
    amount: "10",
    rewards: ["CVX", "CRV"],
    intermediate: "WETH",
  },
  steth: {
    fork: 16124420,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    token: "0x06325440D014e39736583c165C2963BA99fAf14E",
    pool: "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022",
    rewarder: "0x0A760466E1B4621579a82a39CB56Dda2F4E70f03",
    holder: "0x13e382dfe53207E9ce2eeEab330F69da2794179E",
    amount: "100",
    rewards: ["CVX", "CRV", "LDO"],
    intermediate: "WETH",
  },
  cbeth: {
    fork: 16124420,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    token: "0x5b6C539b224014A09B3388e51CaAA8e354c959C8",
    pool: "0x5FAE7E604FC3e24fd43A72867ceBaC94c65b404A",
    rewarder: "0x5d02EcD9B83f1187e92aD5be3d1bd2915CA03699",
    holder: "0xe4d7e7b90519445585635c3b383c9d86c0596e57",
    amount: "10",
    rewards: ["CVX", "CRV"],
    intermediate: "WETH",
  },
};

describe("ConvexCurveAutoCompoundingStrategy.spec", async () => {
  context("auth", async () => {
    let deployer: SignerWithAddress;
    let operator: SignerWithAddress;
    let strategy: ConvexCurveAutoCompoundingStrategy;
    let token: MockERC20;

    beforeEach(async () => {
      [deployer, operator] = await ethers.getSigners();

      const ConvexCurveAutoCompoundingStrategy = await ethers.getContractFactory(
        "ConvexCurveAutoCompoundingStrategy",
        deployer
      );
      strategy = await ConvexCurveAutoCompoundingStrategy.deploy();
      await strategy.deployed();

      const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
      token = await MockERC20.deploy("x", "y", 18);
      await token.deployed();

      const MockConvexBasicRewards = await ethers.getContractFactory("MockConvexBasicRewards", deployer);
      const rewarder = await MockConvexBasicRewards.deploy(1, token.address);
      await rewarder.deployed();

      await strategy.initialize(operator.address, token.address, rewarder.address, []);
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

      it("should succeed, when operator call prepareMigrate", async () => {
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
      rewarder: string;
      holder: string;
      amount: string;
      rewards: string[];
      intermediate: string;
    }
  ) => {
    context(`${name}`, async () => {
      let deployer: SignerWithAddress;
      let holder: SignerWithAddress;
      let zap: AladdinZap;
      let strategy: ConvexCurveAutoCompoundingStrategy;
      let rewarder: IConvexBasicRewards;

      beforeEach(async () => {
        request_fork(config.fork, [config.deployer, config.holder]);
        deployer = await ethers.getSigner(config.deployer);
        holder = await ethers.getSigner(config.holder);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });

        rewarder = await ethers.getContractAt("IConvexBasicRewards", config.rewarder, deployer);

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        await zap.updatePoolTokens([config.pool], [config.token]);

        for (const [symbol, routes] of Object.entries(VAULT_CONFIG[name].deposit)) {
          await zap.updateRoute(TOKENS[symbol].address, config.token, routes);
        }
        for (const reward of config.rewards) {
          await zap.updateRoute(
            TOKENS[reward].address,
            TOKENS[config.intermediate].address,
            ZAP_ROUTES[reward][config.intermediate]
          );
        }

        const ConvexCurveAutoCompoundingStrategy = await ethers.getContractFactory(
          "ConvexCurveAutoCompoundingStrategy",
          deployer
        );
        strategy = await ConvexCurveAutoCompoundingStrategy.deploy();
        await strategy.deployed();

        await strategy.initialize(
          deployer.address,
          config.token,
          config.rewarder,
          config.rewards.map((symbol) => TOKENS[symbol].address)
        );
      });

      it("should succeed when deposit", async () => {
        const token = await ethers.getContractAt("MockERC20", config.token, holder);
        const amount = ethers.utils.parseEther(config.amount);
        await token.transfer(strategy.address, amount);
        await strategy.deposit(deployer.address, amount);
        expect(await rewarder.balanceOf(strategy.address)).to.eq(amount);
      });

      it("should succeed when withdraw", async () => {
        const token = await ethers.getContractAt("MockERC20", config.token, holder);
        const amount = ethers.utils.parseEther(config.amount);
        await token.transfer(strategy.address, amount);
        await strategy.deposit(deployer.address, amount);
        expect(await rewarder.balanceOf(strategy.address)).to.eq(amount);

        const before = await token.balanceOf(deployer.address);
        await strategy.withdraw(deployer.address, amount);
        const after = await token.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amount);
        expect(await rewarder.balanceOf(strategy.address)).to.eq(constants.Zero);
      });

      it("should succeed when harvest", async () => {
        const token = await ethers.getContractAt("MockERC20", config.token, holder);
        const amount = ethers.utils.parseEther(config.amount);
        await token.transfer(strategy.address, amount);
        await strategy.deposit(deployer.address, amount);
        expect(await rewarder.balanceOf(strategy.address)).to.eq(amount);

        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        // make sure 7 days passed, then the rewards will not increase anymore.
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
        await network.provider.send("evm_mine");

        const harvested = await strategy.callStatic.harvest(zap.address, TOKENS[config.intermediate].address);
        expect(harvested).to.gt(constants.Zero);
        await strategy.harvest(zap.address, TOKENS[config.intermediate].address);
        expect(await rewarder.balanceOf(strategy.address)).to.eq(amount.add(harvested));
      });
    });
  };

  for (const [name, config] of Object.entries(UNDERLYING)) {
    run(name, config);
  }
});

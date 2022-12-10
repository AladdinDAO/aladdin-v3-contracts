/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers, network } from "hardhat";
import { ADDRESS, TOKENS, VAULT_CONFIG, ZAP_ROUTES } from "../../../scripts/utils";
import { AladdinZap, ConvexFraxAutoCompoundingStrategy, IFraxUnifiedFarm } from "../../../typechain";
import { request_fork } from "../../utils";

const UNDERLYING: {
  [name: string]: {
    fork: number;
    deployer: string;
    token: string;
    pool: string;
    pid: number;
    farm: string;
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
    pid: 36,
    farm: "0xa537d64881b84faffb9Ae43c951EEbF368b71cdA",
    holder: "0xadd85e4abbb426e895f35e0a2576e22a9bbb7a57",
    amount: "1",
    rewards: ["CVX", "CRV"],
    intermediate: "WETH",
  },
};

describe("ConvexFraxAutoCompoundingStrategy.spec", async () => {
  const run = async (
    name: string,
    config: {
      fork: number;
      deployer: string;
      token: string;
      pool: string;
      pid: number;
      farm: string;
      holder: string;
      amount: string;
      rewards: string[];
      intermediate: string;
    }
  ) => {
    context(`${name}`, async () => {
      let deployer: SignerWithAddress;
      let operator: SignerWithAddress;
      let holder: SignerWithAddress;
      let zap: AladdinZap;
      let strategy: ConvexFraxAutoCompoundingStrategy;
      let farm: IFraxUnifiedFarm;

      beforeEach(async () => {
        request_fork(config.fork, [config.deployer, config.holder]);
        deployer = await ethers.getSigner(config.deployer);
        operator = deployer;
        holder = await ethers.getSigner(config.holder);
        await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });

        farm = await ethers.getContractAt("IFraxUnifiedFarm", config.farm, deployer);

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

        const ConvexFraxAutoCompoundingStrategy = await ethers.getContractFactory(
          "ConvexFraxAutoCompoundingStrategy",
          deployer
        );
        strategy = await ConvexFraxAutoCompoundingStrategy.deploy();
        await strategy.deployed();

        await strategy.initialize(
          deployer.address,
          config.token,
          config.pid,
          config.rewards.map((symbol) => TOKENS[symbol].address)
        );
        expect(await strategy.name()).to.eq("ConvexFraxAutoCompounding");
      });

      context("auth", async () => {
        it("should revert, when initialize again", async () => {
          await expect(strategy.initialize(constants.AddressZero, constants.AddressZero, 0, [])).to.revertedWith(
            "Initializable: contract is already initialized"
          );
        });

        context("#execute", async () => {
          it("should revert, when non-operator call execute", async () => {
            await expect(strategy.connect(holder).execute(constants.AddressZero, 0, [])).to.revertedWith(
              "ConcentratorStrategy: only operator"
            );
          });

          it("should succeed, when operator call", async () => {
            const token = await ethers.getContractAt("MockERC20", config.token, deployer);
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
            await expect(strategy.connect(holder).updateRewards([])).to.revertedWith(
              "ConcentratorStrategy: only operator"
            );
          });

          it("should revert, when zero token address", async () => {
            await expect(strategy.connect(operator).updateRewards([constants.AddressZero])).to.revertedWith(
              "ConcentratorStrategy: zero reward token"
            );
          });

          it("should revert, when duplicated token", async () => {
            await expect(strategy.connect(operator).updateRewards([ADDRESS.CRV, ADDRESS.CRV])).to.revertedWith(
              "ConcentratorStrategy: duplicated reward token"
            );
          });

          it("should succeed, when operator call", async () => {
            for (let i = 0; i < config.rewards.length; i++) {
              expect(await strategy.rewards(i)).to.eq(TOKENS[config.rewards[i]].address);
            }
            await expect(strategy.rewards(config.rewards.length)).to.reverted;
            await strategy.updateRewards(config.rewards.map((symbol) => TOKENS[symbol].address).reverse());
            for (let i = 0; i < config.rewards.length; i++) {
              expect(await strategy.rewards(i)).to.eq(TOKENS[config.rewards[config.rewards.length - 1 - i]].address);
            }
            await expect(strategy.rewards(config.rewards.length)).to.reverted;
          });
        });

        context("#deposit", async () => {
          it("should revert, when non-operator call deposit", async () => {
            await expect(strategy.connect(holder).deposit(deployer.address, 0)).to.revertedWith(
              "ConcentratorStrategy: only operator"
            );
          });

          it("should succeed, when operator call deposit", async () => {
            await strategy.connect(operator).deposit(deployer.address, 0);
          });
        });

        context("#withdraw", async () => {
          it("should revert, when non-operator call withdraw", async () => {
            await expect(strategy.connect(holder).withdraw(deployer.address, 0)).to.revertedWith(
              "ConcentratorStrategy: only operator"
            );
          });

          it("should succeed, when operator call withdraw", async () => {
            await strategy.connect(operator).withdraw(deployer.address, 0);
          });
        });

        context("#harvest", async () => {
          it("should revert, when non-operator call harvest", async () => {
            await expect(strategy.connect(holder).harvest(deployer.address, constants.AddressZero)).to.revertedWith(
              "ConcentratorStrategy: only operator"
            );
          });
        });

        context("#prepareMigrate", async () => {
          it("should revert, when non-operator call prepareMigrate", async () => {
            await expect(strategy.connect(holder).prepareMigrate(deployer.address)).to.revertedWith(
              "ConcentratorStrategy: only operator"
            );
          });

          it("should succeed, when operator call prepareMigrate", async () => {
            await strategy.connect(operator).prepareMigrate(deployer.address);
          });
        });

        context("#finishMigrate", async () => {
          it("should revert, when non-operator call finishMigrate", async () => {
            await expect(strategy.connect(holder).finishMigrate(deployer.address)).to.revertedWith(
              "ConcentratorStrategy: only operator"
            );
          });

          it("should succeed, when operator call finishMigrate", async () => {
            await strategy.connect(operator).finishMigrate(deployer.address);
          });
        });

        context("#setPaused", async () => {
          it("should revert, when non-owner call setPaused", async () => {
            await expect(strategy.connect(holder).setPaused(false)).to.revertedWith("Ownable: caller is not the owner");
          });

          it("should succeed, when owner call", async () => {
            expect(await strategy.paused()).to.eq(false);
            await strategy.setPaused(true);
            expect(await strategy.paused()).to.eq(true);
            await strategy.setPaused(false);
            expect(await strategy.paused()).to.eq(false);
          });
        });

        context("#updateLockDuration", async () => {
          it("should revert, when non-owner call updateLockDuration", async () => {
            await expect(strategy.connect(holder).updateLockDuration(0)).to.revertedWith(
              "Ownable: caller is not the owner"
            );
          });

          it("should revert, when duration invalid", async () => {
            // set min - 1
            await expect(strategy.updateLockDuration(594000 - 1)).to.revertedWith(
              "ConcentratorStrategy: invalid duration"
            );
            // set max + 1
            await expect(strategy.updateLockDuration(1 * 365 * 86400 + 1)).to.revertedWith(
              "ConcentratorStrategy: invalid duration"
            );
          });

          it("should succeed, when owner call", async () => {
            expect((await strategy.locks()).duration).to.eq(86400 * 7);
            await strategy.updateLockDuration(594000); // set min
            expect((await strategy.locks()).duration).to.eq(594000);
            await strategy.updateLockDuration(1 * 365 * 86400); // set max
            expect((await strategy.locks()).duration).to.eq(1 * 365 * 86400);
          });
        });
      });

      context("#deposit", async () => {
        it("should succeed when deposit", async () => {
          const token = await ethers.getContractAt("MockERC20", config.token, holder);
          const amount = ethers.utils.parseEther(config.amount);
          const vault = await strategy.vault();

          // lock first time
          await token.transfer(strategy.address, amount);
          await strategy.deposit(deployer.address, amount);
          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          let locks = await strategy.locks();
          expect(await farm.lockedLiquidityOf(vault)).to.eq(amount);
          expect((await farm.lockedStakesOf(vault)).length).to.eq(1);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(locks.key);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(amount);
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(timestamp);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(timestamp + 86400 * 7);
          expect(locks.unlockAt).to.eq(timestamp + 86400 * 7);

          // lock second time right after
          await token.transfer(strategy.address, amount);
          await strategy.deposit(deployer.address, amount);
          locks = await strategy.locks();
          expect(await farm.lockedLiquidityOf(vault)).to.eq(amount.mul(2));
          expect((await farm.lockedStakesOf(vault)).length).to.eq(1);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(locks.key);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(amount.mul(2));
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(timestamp);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(timestamp + 86400 * 7);
          expect(locks.unlockAt).to.eq(timestamp + 86400 * 7);

          // lock third time after 7 days
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7 + 1]);
          await network.provider.send("evm_mine");
          await token.transfer(strategy.address, amount);
          await strategy.deposit(deployer.address, amount);
          locks = await strategy.locks();
          const timestamp2 = (await ethers.provider.getBlock("latest")).timestamp;
          expect(await farm.lockedLiquidityOf(vault)).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault)).length).to.eq(1);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(locks.key);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(timestamp2);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(timestamp2 + 86400 * 7);
          expect(locks.unlockAt).to.eq(timestamp2 + 86400 * 7);
        });
      });

      context("#withdraw", async () => {
        it("should succeed when withdraw 1/3 before unlock and claim", async () => {
          const token = await ethers.getContractAt("MockERC20", config.token, holder);
          const amount = ethers.utils.parseEther(config.amount);

          // lock first time
          await token.transfer(strategy.address, amount.mul(3));
          await strategy.deposit(deployer.address, amount.mul(3));
          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          const vault = await strategy.vault();
          let locks = await strategy.locks();
          expect(await farm.lockedLiquidityOf(vault)).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault)).length).to.eq(1);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(locks.key);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(timestamp);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(timestamp + 86400 * 7);
          expect(locks.unlockAt).to.eq(timestamp + 86400 * 7);
          expect((await strategy.getUserLocks(deployer.address)).length).to.eq(0);

          // withdraw
          await strategy.withdraw(deployer.address, amount);
          locks = await strategy.locks();
          expect(await farm.lockedLiquidityOf(vault)).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault)).length).to.eq(1);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(locks.key);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(timestamp);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(timestamp + 86400 * 7);
          expect(locks.unlockAt).to.eq(timestamp + 86400 * 7);
          expect(locks.pendingUnlocked).to.eq(amount);
          expect((await strategy.getUserLocks(deployer.address)).length).to.eq(1);
          expect((await strategy.getUserLocks(deployer.address))[0].balance).to.eq(amount);
          expect((await strategy.getUserLocks(deployer.address))[0].unlockAt).to.eq(timestamp + 86400 * 7);

          // 7 days passed
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7 + 1]);
          await network.provider.send("evm_mine");
          const before = await token.balanceOf(deployer.address);
          await strategy.claim(deployer.address);
          const after = await token.balanceOf(deployer.address);
          expect(after.sub(before)).to.eq(amount);
          locks = await strategy.locks();
          const timestamp2 = (await ethers.provider.getBlock("latest")).timestamp;
          expect(await farm.lockedLiquidityOf(vault)).to.eq(amount.mul(2));
          expect((await farm.lockedStakesOf(vault)).length).to.eq(2);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(constants.HashZero);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault))[1].kek_id).to.eq(locks.key);
          expect((await farm.lockedStakesOf(vault))[1].liquidity).to.eq(amount.mul(2));
          expect((await farm.lockedStakesOf(vault))[1].start_timestamp).to.eq(timestamp2);
          expect((await farm.lockedStakesOf(vault))[1].ending_timestamp).to.eq(timestamp2 + 86400 * 7);
          expect(locks.unlockAt).to.eq(timestamp2 + 86400 * 7);
          expect(locks.pendingUnlocked).to.eq(constants.Zero);
          expect((await strategy.getUserLocks(deployer.address)).length).to.eq(0);
        });

        it("should succeed when withdraw all before unlock and claim", async () => {
          const token = await ethers.getContractAt("MockERC20", config.token, holder);
          const amount = ethers.utils.parseEther(config.amount);

          // lock first time
          await token.transfer(strategy.address, amount.mul(3));
          await strategy.deposit(deployer.address, amount.mul(3));
          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          const vault = await strategy.vault();
          let locks = await strategy.locks();
          expect(await farm.lockedLiquidityOf(vault)).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault)).length).to.eq(1);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(locks.key);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(timestamp);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(timestamp + 86400 * 7);
          expect(locks.unlockAt).to.eq(timestamp + 86400 * 7);
          expect((await strategy.getUserLocks(deployer.address)).length).to.eq(0);

          // withdraw
          await strategy.withdraw(deployer.address, amount.mul(3));
          locks = await strategy.locks();
          expect(await farm.lockedLiquidityOf(vault)).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault)).length).to.eq(1);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(locks.key);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(timestamp);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(timestamp + 86400 * 7);
          expect(locks.unlockAt).to.eq(timestamp + 86400 * 7);
          expect(locks.pendingUnlocked).to.eq(amount.mul(3));
          expect((await strategy.getUserLocks(deployer.address)).length).to.eq(1);
          expect((await strategy.getUserLocks(deployer.address))[0].balance).to.eq(amount.mul(3));
          expect((await strategy.getUserLocks(deployer.address))[0].unlockAt).to.eq(timestamp + 86400 * 7);

          // 7 days passed
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7 + 1]);
          await network.provider.send("evm_mine");
          const before = await token.balanceOf(deployer.address);
          await strategy.claim(deployer.address);
          const after = await token.balanceOf(deployer.address);
          expect(after.sub(before)).to.eq(amount.mul(3));
          locks = await strategy.locks();
          expect(await farm.lockedLiquidityOf(vault)).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault)).length).to.eq(1);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(constants.HashZero);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(constants.Zero);
          expect(locks.unlockAt).to.eq(timestamp + 86400 * 7);
          expect(locks.pendingUnlocked).to.eq(constants.Zero);
          expect((await strategy.getUserLocks(deployer.address)).length).to.eq(0);
        });

        it("should succeed when withdraw all multiple times before unlock and claim", async () => {
          const token = await ethers.getContractAt("MockERC20", config.token, holder);
          const amount = ethers.utils.parseEther(config.amount);

          // lock first time
          await token.transfer(strategy.address, amount.mul(3));
          await strategy.deposit(deployer.address, amount.mul(3));
          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          const vault = await strategy.vault();
          let locks = await strategy.locks();
          expect(await farm.lockedLiquidityOf(vault)).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault)).length).to.eq(1);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(locks.key);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(timestamp);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(timestamp + 86400 * 7);
          expect(locks.unlockAt).to.eq(timestamp + 86400 * 7);
          expect((await strategy.getUserLocks(deployer.address)).length).to.eq(0);

          // withdraw
          await strategy.withdraw(deployer.address, amount);
          await strategy.withdraw(deployer.address, amount);
          await strategy.withdraw(deployer.address, amount);
          locks = await strategy.locks();
          expect(await farm.lockedLiquidityOf(vault)).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault)).length).to.eq(1);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(locks.key);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(timestamp);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(timestamp + 86400 * 7);
          expect(locks.unlockAt).to.eq(timestamp + 86400 * 7);
          expect(locks.pendingUnlocked).to.eq(amount.mul(3));
          expect((await strategy.getUserLocks(deployer.address)).length).to.eq(3);
          expect((await strategy.getUserLocks(deployer.address))[0].balance).to.eq(amount);
          expect((await strategy.getUserLocks(deployer.address))[0].unlockAt).to.eq(timestamp + 86400 * 7);
          expect((await strategy.getUserLocks(deployer.address))[1].balance).to.eq(amount);
          expect((await strategy.getUserLocks(deployer.address))[1].unlockAt).to.eq(timestamp + 86400 * 7);
          expect((await strategy.getUserLocks(deployer.address))[2].balance).to.eq(amount);
          expect((await strategy.getUserLocks(deployer.address))[2].unlockAt).to.eq(timestamp + 86400 * 7);

          // 7 days passed
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7 + 1]);
          await network.provider.send("evm_mine");
          const before = await token.balanceOf(deployer.address);
          await strategy.claim(deployer.address);
          const after = await token.balanceOf(deployer.address);
          expect(after.sub(before)).to.eq(amount.mul(3));
          locks = await strategy.locks();
          expect(await farm.lockedLiquidityOf(vault)).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault)).length).to.eq(1);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(constants.HashZero);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(constants.Zero);
          expect(locks.unlockAt).to.eq(timestamp + 86400 * 7);
          expect(locks.pendingUnlocked).to.eq(constants.Zero);
          expect((await strategy.getUserLocks(deployer.address)).length).to.eq(0);
        });

        it("should succeed when withdraw 1/3 after unlock and claim", async () => {
          const token = await ethers.getContractAt("MockERC20", config.token, holder);
          const amount = ethers.utils.parseEther(config.amount);

          // lock first time
          await token.transfer(strategy.address, amount.mul(3));
          await strategy.deposit(deployer.address, amount.mul(3));
          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          const vault = await strategy.vault();
          let locks = await strategy.locks();
          expect(await farm.lockedLiquidityOf(vault)).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault)).length).to.eq(1);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(locks.key);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(timestamp);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(timestamp + 86400 * 7);
          expect(locks.unlockAt).to.eq(timestamp + 86400 * 7);
          expect((await strategy.getUserLocks(deployer.address)).length).to.eq(0);

          // 7 days passed
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7 + 1]);
          await network.provider.send("evm_mine");

          // withdraw
          await strategy.withdraw(deployer.address, amount);
          const timestamp2 = (await ethers.provider.getBlock("latest")).timestamp;
          locks = await strategy.locks();
          expect(await farm.lockedLiquidityOf(vault)).to.eq(amount.mul(2));
          expect((await farm.lockedStakesOf(vault)).length).to.eq(2);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(constants.HashZero);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault))[1].kek_id).to.eq(locks.key);
          expect((await farm.lockedStakesOf(vault))[1].liquidity).to.eq(amount.mul(2));
          expect((await farm.lockedStakesOf(vault))[1].start_timestamp).to.eq(timestamp2);
          expect((await farm.lockedStakesOf(vault))[1].ending_timestamp).to.eq(timestamp2 + 86400 * 7);
          expect(locks.unlockAt).to.eq(timestamp2 + 86400 * 7);
          expect(locks.pendingUnlocked).to.eq(constants.Zero);
          expect((await strategy.getUserLocks(deployer.address)).length).to.eq(1);
          expect((await strategy.getUserLocks(deployer.address))[0].balance).to.eq(amount);
          expect((await strategy.getUserLocks(deployer.address))[0].unlockAt).to.eq(timestamp + 86400 * 7);

          // claim
          const before = await token.balanceOf(deployer.address);
          await strategy.claim(deployer.address);
          const after = await token.balanceOf(deployer.address);
          expect(after.sub(before)).to.eq(amount);
          locks = await strategy.locks();
          expect(await farm.lockedLiquidityOf(vault)).to.eq(amount.mul(2));
          expect((await farm.lockedStakesOf(vault)).length).to.eq(2);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(constants.HashZero);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault))[1].kek_id).to.eq(locks.key);
          expect((await farm.lockedStakesOf(vault))[1].liquidity).to.eq(amount.mul(2));
          expect((await farm.lockedStakesOf(vault))[1].start_timestamp).to.eq(timestamp2);
          expect((await farm.lockedStakesOf(vault))[1].ending_timestamp).to.eq(timestamp2 + 86400 * 7);
          expect(locks.unlockAt).to.eq(timestamp2 + 86400 * 7);
          expect(locks.pendingUnlocked).to.eq(constants.Zero);
          expect((await strategy.getUserLocks(deployer.address)).length).to.eq(0);
        });

        it("should succeed when withdraw all after unlock and claim", async () => {
          const token = await ethers.getContractAt("MockERC20", config.token, holder);
          const amount = ethers.utils.parseEther(config.amount);

          // lock first time
          await token.transfer(strategy.address, amount.mul(3));
          await strategy.deposit(deployer.address, amount.mul(3));
          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          const vault = await strategy.vault();
          let locks = await strategy.locks();
          expect(await farm.lockedLiquidityOf(vault)).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault)).length).to.eq(1);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(locks.key);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(amount.mul(3));
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(timestamp);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(timestamp + 86400 * 7);
          expect(locks.unlockAt).to.eq(timestamp + 86400 * 7);
          expect((await strategy.getUserLocks(deployer.address)).length).to.eq(0);

          // 7 days passed
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7 + 1]);
          await network.provider.send("evm_mine");

          // withdraw
          await strategy.withdraw(deployer.address, amount.mul(3));
          locks = await strategy.locks();
          expect(await farm.lockedLiquidityOf(vault)).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault)).length).to.eq(1);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(constants.HashZero);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(constants.Zero);
          expect(locks.unlockAt).to.eq(timestamp + 86400 * 7);
          expect(locks.key).to.eq(constants.HashZero);
          expect(locks.pendingUnlocked).to.eq(constants.Zero);
          expect((await strategy.getUserLocks(deployer.address)).length).to.eq(1);
          expect((await strategy.getUserLocks(deployer.address))[0].balance).to.eq(amount.mul(3));
          expect((await strategy.getUserLocks(deployer.address))[0].unlockAt).to.eq(timestamp + 86400 * 7);

          // claim
          const before = await token.balanceOf(deployer.address);
          await strategy.claim(deployer.address);
          const after = await token.balanceOf(deployer.address);
          expect(after.sub(before)).to.eq(amount.mul(3));
          locks = await strategy.locks();
          expect(await farm.lockedLiquidityOf(vault)).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault)).length).to.eq(1);
          expect((await farm.lockedStakesOf(vault))[0].kek_id).to.eq(constants.HashZero);
          expect((await farm.lockedStakesOf(vault))[0].liquidity).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault))[0].start_timestamp).to.eq(constants.Zero);
          expect((await farm.lockedStakesOf(vault))[0].ending_timestamp).to.eq(constants.Zero);
          expect(locks.unlockAt).to.eq(timestamp + 86400 * 7);
          expect(locks.key).to.eq(constants.HashZero);
          expect(locks.pendingUnlocked).to.eq(constants.Zero);
          expect((await strategy.getUserLocks(deployer.address)).length).to.eq(0);
        });
      });

      context("#harvest", async () => {
        it("should succeed when harvest", async () => {
          const vault = await strategy.vault();
          const token = await ethers.getContractAt("MockERC20", config.token, holder);
          const amount = ethers.utils.parseEther(config.amount);
          await token.transfer(strategy.address, amount);
          await strategy.deposit(deployer.address, amount);
          expect(await farm.lockedLiquidityOf(vault)).to.eq(amount);

          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          // make sure 7 days passed, then the rewards will not increase anymore.
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
          await network.provider.send("evm_mine");

          const harvested = await strategy.callStatic.harvest(zap.address, TOKENS[config.intermediate].address);
          await strategy.harvest(zap.address, TOKENS[config.intermediate].address);
          expect(await farm.lockedLiquidityOf(vault)).to.eq(amount.add(harvested));
        });
      });

      context("#pause", async () => {
        it("should not extend when paused", async () => {});
      });

      context("migrate", async () => {
        it("should revert, when migrate before unlock", async () => {
          const ConvexFraxAutoCompoundingStrategy = await ethers.getContractFactory(
            "ConvexFraxAutoCompoundingStrategy",
            deployer
          );
          const newStrategy = await ConvexFraxAutoCompoundingStrategy.deploy();
          await newStrategy.deployed();
          await newStrategy.initialize(
            deployer.address,
            config.token,
            config.pid,
            config.rewards.map((symbol) => TOKENS[symbol].address)
          );

          const token = await ethers.getContractAt("MockERC20", config.token, holder);
          const amount = ethers.utils.parseEther(config.amount);

          // lock first time
          await token.transfer(strategy.address, amount);
          await strategy.deposit(deployer.address, amount);

          await strategy.prepareMigrate(newStrategy.address);
          await strategy.withdraw(newStrategy.address, amount);
          await expect(strategy.finishMigrate(newStrategy.address)).to.revertedWith(
            "ConvexFraxAutoCompoundingStrategy: migration failed"
          );
        });

        it("should succeed, when migrate before unlock and wait after unlock", async () => {
          const ConvexFraxAutoCompoundingStrategy = await ethers.getContractFactory(
            "ConvexFraxAutoCompoundingStrategy",
            deployer
          );
          const newStrategy = await ConvexFraxAutoCompoundingStrategy.deploy();
          await newStrategy.deployed();
          await newStrategy.initialize(
            deployer.address,
            config.token,
            config.pid,
            config.rewards.map((symbol) => TOKENS[symbol].address)
          );

          const token = await ethers.getContractAt("MockERC20", config.token, holder);
          const amount = ethers.utils.parseEther(config.amount);

          // lock first time
          await token.transfer(strategy.address, amount);
          await strategy.deposit(deployer.address, amount);
          await strategy.withdraw(newStrategy.address, amount);

          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7 + 1]);
          await network.provider.send("evm_mine");
          await strategy.prepareMigrate(newStrategy.address);
          await strategy.finishMigrate(newStrategy.address);
          expect(await token.balanceOf(newStrategy.address)).to.eq(amount);
        });

        it("should succeed, when migrate after unlock", async () => {
          const ConvexFraxAutoCompoundingStrategy = await ethers.getContractFactory(
            "ConvexFraxAutoCompoundingStrategy",
            deployer
          );
          const newStrategy = await ConvexFraxAutoCompoundingStrategy.deploy();
          await newStrategy.deployed();
          await newStrategy.initialize(
            deployer.address,
            config.token,
            config.pid,
            config.rewards.map((symbol) => TOKENS[symbol].address)
          );

          const token = await ethers.getContractAt("MockERC20", config.token, holder);
          const amount = ethers.utils.parseEther(config.amount);

          // lock first time
          await token.transfer(strategy.address, amount);
          await strategy.deposit(deployer.address, amount);
          const timestamp = (await ethers.provider.getBlock("latest")).timestamp;

          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7 + 1]);
          await network.provider.send("evm_mine");
          await strategy.prepareMigrate(newStrategy.address);
          await strategy.withdraw(newStrategy.address, amount);
          await strategy.finishMigrate(newStrategy.address);
          expect(await token.balanceOf(newStrategy.address)).to.eq(amount);
        });
      });
    });
  };

  for (const [name, config] of Object.entries(UNDERLYING)) {
    run(name, config);
  }
});

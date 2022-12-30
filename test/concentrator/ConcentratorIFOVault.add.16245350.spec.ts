/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import {
  ADDRESS,
  DEPLOYED_CONTRACTS,
  TOKENS,
  AVAILABLE_VAULTS,
  ZAP_ROUTES,
  DEPLOYED_VAULTS,
} from "../../scripts/utils";
import { AladdinZap, ConcentratorGateway, ConcentratorIFOVault, IConvexBooster, IERC20 } from "../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../utils";

const POOL_HOLDERS: {
  [name: string]: {
    fork: number;
    holder: string;
    amount: string;
    harvest: boolean;
  };
} = {
  blusd: {
    fork: 16245350,
    holder: "0xa5cd3bc3f3d34b3a716111643e19db88bfa649c7",
    amount: "10000",
    harvest: true,
  },
};

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const PID = 34;
const PRINT_ZAP = true;

describe("ConcentratorIFOVault.add.16245350.spec", async () => {
  let deployer: SignerWithAddress;
  let signer: SignerWithAddress;
  let lpToken: IERC20;
  let vault: ConcentratorIFOVault;
  let zap: AladdinZap;
  let gateway: ConcentratorGateway;

  if (PRINT_ZAP) {
    DEPLOYED_VAULTS.aCRV.forEach(({ name, fees }) => {
      const config = AVAILABLE_VAULTS[name];
      const holder = POOL_HOLDERS[name];
      if (holder === undefined) {
        return;
      }
      console.log(
        `add pool[${name}]:`,
        `convexCurveID[${config.convexCurveID}]`,
        `rewards[${config.rewards}]`,
        `withdrawFee[${fees.withdraw}]`,
        `platformFee[${fees.platform}]`,
        `harvestBounty[${fees.harvest}]`
      );
    });
    console.log("{");
    DEPLOYED_VAULTS.aCRV.forEach(({ name, fees }) => {
      const config = AVAILABLE_VAULTS[name];
      const holder = POOL_HOLDERS[name];
      if (holder === undefined) {
        return;
      }
      console.log(`  "${name}": [`);
      Object.entries(config.deposit).forEach(([symbol, routes]) => {
        if (symbol === "WETH") {
          console.log(
            `    {"symbol": "ETH", "address": "${constants.AddressZero}", "routes": [${routes
              .map((x) => `"${x.toHexString()}"`)
              .join(",")}]},`
          );
        }
        console.log(
          `    {"symbol": "${symbol}", "address": "${TOKENS[symbol].address}", "routes": [${routes
            .map((x) => `"${x.toHexString()}"`)
            .join(",")}]},`
        );
      });
      console.log(`  ],`);
    });
    console.log("}");
  }

  const genTests = async (
    name: string,
    fees: {
      withdraw: number;
      harvest: number;
      platform: number;
    }
  ) => {
    const config = AVAILABLE_VAULTS[name];
    const holder = POOL_HOLDERS[name];
    if (holder === undefined) {
      return;
    }

    context(`ifo for pool: ${name}`, async () => {
      beforeEach(async () => {
        request_fork(holder.fork, [
          DEPLOYER,
          holder.holder,
          DEPLOYED_CONTRACTS.CommunityMultisig,
          DEPLOYED_CONTRACTS.ManagementMultisig,
          DEPLOYED_CONTRACTS.Concentrator.Treasury,
        ]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(holder.holder);
        const manager = await ethers.getSigner(DEPLOYED_CONTRACTS.ManagementMultisig);
        const owner = await ethers.getSigner(DEPLOYED_CONTRACTS.Concentrator.Treasury);

        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });
        await deployer.sendTransaction({ to: manager.address, value: ethers.utils.parseEther("10") });
        await deployer.sendTransaction({ to: owner.address, value: ethers.utils.parseEther("10") });

        lpToken = await ethers.getContractAt("IERC20", ADDRESS[`${config.token}_TOKEN`]);

        const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
        const logic = await TokenZapLogic.deploy();
        await logic.deployed();

        // upgrade zap contract
        const proxyAdmin = await ethers.getContractAt("ProxyAdmin", DEPLOYED_CONTRACTS.Concentrator.ProxyAdmin, owner);
        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        const impl = await AladdinZap.deploy();
        await proxyAdmin.upgrade(DEPLOYED_CONTRACTS.AladdinZap, impl.address);
        zap = await ethers.getContractAt("AladdinZap", DEPLOYED_CONTRACTS.AladdinZap, manager);

        // setup withdraw zap
        await zap.updatePoolTokens([ADDRESS[`${config.token}_POOL`]], [lpToken.address]);
        await zap.updatePoolTokens([ADDRESS.CURVE_LUSD3CRV_POOL], [ADDRESS.CURVE_LUSD3CRV_TOKEN]);
        if (ADDRESS[`${config.token}_DEPOSIT`]) {
          await zap.updatePoolTokens([ADDRESS[`${config.token}_DEPOSIT`]], [lpToken.address]);
        }
        for (const [symbol, routes] of Object.entries(config.withdraw)) {
          await zap.updateRoute(lpToken.address, ADDRESS[symbol], routes);
        }

        gateway = await ethers.getContractAt(
          "ConcentratorGateway",
          DEPLOYED_CONTRACTS.Concentrator.ConcentratorGateway,
          owner
        );
        await gateway.updateLogic(logic.address);

        vault = await ethers.getContractAt(
          "ConcentratorIFOVault",
          DEPLOYED_CONTRACTS.Concentrator.cvxCRV.ConcentratorIFOVault,
          owner
        );
        await vault.addPool(config.convexCurveID!, config.rewards, fees.withdraw, fees.platform, fees.harvest);
      });

      context("deposit", async () => {
        const amountLP = ethers.utils.parseEther(holder.amount);
        it("deposit, withdraw as ETH, deposit from ETH", async () => {
          // deposit
          await lpToken.connect(signer).approve(vault.address, amountLP);
          await vault.connect(signer)["deposit(uint256,uint256)"](PID, amountLP);
          const sharesOut = await vault.getUserShare(PID, signer.address);
          expect(sharesOut).to.eq(amountLP);
          // withdraw to ETH
          const etherBefore = await signer.getBalance();
          const tx = await vault.connect(signer).withdrawAndZap(PID, sharesOut, constants.AddressZero, 0);
          expect(await vault.getUserShare(PID, signer.address)).to.eq(constants.Zero);
          const receipt = await tx.wait();
          const baseFee = (await ethers.provider.getFeeData()).lastBaseFeePerGas!;
          const effectiveGasPrice = tx.gasPrice ? tx.gasPrice : baseFee.add(tx.maxPriorityFeePerGas!);
          const etherAfter = await signer.getBalance();
          expect(etherAfter.add(receipt.gasUsed.mul(effectiveGasPrice))).gt(etherBefore);
          // zap from ETH
          const amountIn = etherAfter.add(receipt.gasUsed.mul(effectiveGasPrice)).sub(etherBefore);
          await gateway
            .connect(signer)
            .deposit(vault.address, PID, constants.AddressZero, lpToken.address, amountIn, config.deposit.WETH, 0, {
              value: amountIn,
            });
          const zapSharesOut = await vault.getUserShare(PID, signer.address);
          console.log(
            `amountLP[${ethers.utils.formatEther(amountLP)}]`,
            `amountIn[${ethers.utils.formatEther(amountIn)}]`,
            `zapSharesOut[${ethers.utils.formatEther(zapSharesOut)}]`
          );
          expect(zapSharesOut).to.gt(constants.Zero);
          expect(zapSharesOut).to.closeToBn(sharesOut, sharesOut.mul(2).div(100)); // 2% error
        });

        Object.entries(config.deposit).forEach(([symbol, routes]) => {
          it(`deposit, withdraw as ${symbol}, deposit from ${symbol}`, async () => {
            // deposit
            await lpToken.connect(signer).approve(vault.address, amountLP);
            await vault.connect(signer)["deposit(uint256,uint256)"](PID, amountLP);
            const sharesOut = await vault.getUserShare(PID, signer.address);
            expect(sharesOut).to.eq(amountLP);
            // withdraw to token
            const token = await ethers.getContractAt("IERC20", ADDRESS[symbol], signer);
            const tokenBefore = await token.balanceOf(signer.address);
            await vault.connect(signer).withdrawAndZap(PID, sharesOut, token.address, 0);
            const tokenAfter = await token.balanceOf(signer.address);
            expect(tokenAfter.gt(tokenBefore));
            // zap from token
            const amountIn = tokenAfter.sub(tokenBefore);
            await token.approve(gateway.address, constants.MaxUint256);
            await gateway
              .connect(signer)
              .deposit(vault.address, PID, token.address, lpToken.address, amountIn, routes, 0);
            const zapSharesOut = await vault.getUserShare(PID, signer.address);
            console.log(
              `amountLP[${ethers.utils.formatEther(amountLP)}]`,
              `amountIn[${ethers.utils.formatUnits(amountIn, TOKENS[symbol].decimals)}]`,
              `zapSharesOut[${ethers.utils.formatEther(zapSharesOut)}]`
            );
            expect(zapSharesOut).to.gt(constants.Zero);
            expect(zapSharesOut).to.closeToBn(sharesOut, sharesOut.mul(2).div(100)); // 2% error
          });
        });
      });

      if (holder.harvest) {
        context("harvest", async () => {
          const amountLP = ethers.utils.parseEther(holder.amount);
          let booster: IConvexBooster;
          let firstCall = true;

          beforeEach(async () => {
            booster = await ethers.getContractAt("IConvexBooster", BOOSTER, deployer);
            for (const reward of config.rewards) {
              const symbol = Object.entries(ADDRESS).find(([, address]) => address === reward)![0];
              if (symbol === "CRV") continue;
              const routes = ZAP_ROUTES[symbol].WETH;
              if (firstCall) {
                console.log(
                  `harvest zap ${symbol}=>WETH:`,
                  `from[${reward}]`,
                  `to[${ADDRESS.WETH}]`,
                  `routes[${routes.toString()}]`
                );
              }
              await zap.updateRoute(reward, ADDRESS.WETH, routes);
            }
            firstCall = false;

            await lpToken.connect(signer).approve(vault.address, amountLP);
            await vault.connect(signer)["deposit(uint256,uint256)"](PID, amountLP);
            const sharesOut = await vault.getUserShare(PID, signer.address);
            expect(sharesOut).to.eq(amountLP);
          });

          it("should succeed", async () => {
            await booster.earmarkRewards(config.convexCurveID!);
            const token = await ethers.getContractAt("IERC20", DEPLOYED_CONTRACTS.Concentrator.cvxCRV.aCRV, deployer);
            const amount = await vault.callStatic.harvest(PID, deployer.address, 0);
            const before = await token.balanceOf(vault.address);
            await vault.harvest(PID, deployer.address, 0);
            const after = await token.balanceOf(vault.address);
            console.log(
              "harvested cvxCRV:",
              ethers.utils.formatEther(amount),
              "aCRV:",
              ethers.utils.formatEther(after.sub(before))
            );
            expect(amount).gt(constants.Zero);
          });
        });
      }
    });
  };

  DEPLOYED_VAULTS.aCRV.forEach(({ name, fees }) => {
    genTests(name, fees);
  });
});

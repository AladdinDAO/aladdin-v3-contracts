/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { ACRV_IFO_VAULTS, ADDRESS, DEPLOYED_CONTRACTS, TOKENS, VAULT_CONFIG, ZAP_ROUTES } from "../../scripts/utils";
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
  silofrax: {
    fork: 15193360,
    holder: "0xabc508dda7517f195e416d77c822a4861961947a",
    amount: "1000",
    harvest: true,
  },
  tusd: {
    fork: 15193360,
    holder: "0xd34f3e85bb7c8020c7959b80a4b87a369d639dc0",
    amount: "1000",
    harvest: false,
  },
  /*susdfraxbp: {
    fork: 15193360,
    holder: "0x99F4176EE457afedFfCB1839c7aB7A030a5e4A92",
    amount: "1000",
    harvest: false,
  },
  busdfraxbp: {
    fork: 15193360,
    holder: "0xB1748C79709f4Ba2Dd82834B8c82D4a505003f27",
    amount: "1000",
    harvest: false,
  },
  alusdfraxbp: {
    fork: 15193360,
    holder: "0x5180db0237291a6449dda9ed33ad90a38787621c",
    amount: "1000",
    harvest: false,
  },
  tusdfraxbp: {
    fork: 15193360,
    holder: "0x5180db0237291a6449dda9ed33ad90a38787621c",
    amount: "1000",
    harvest: false,
  },*/
};

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const PID = 24;
const PRINT_ZAP = true;

describe("ConcentratorIFOVault.add.15193360.spec.spec", async () => {
  let deployer: SignerWithAddress;
  let signer: SignerWithAddress;
  let lpToken: IERC20;
  let vault: ConcentratorIFOVault;
  let zap: AladdinZap;
  let gateway: ConcentratorGateway;

  if (PRINT_ZAP) {
    ACRV_IFO_VAULTS.forEach(({ name, fees }) => {
      const config = VAULT_CONFIG[name];
      const holder = POOL_HOLDERS[name];
      if (holder === undefined) {
        return;
      }
      console.log(
        `add pool[${name}]:`,
        `convexId[${config.convexId}]`,
        `rewards[${config.rewards}]`,
        `withdrawFee[${fees.withdraw}]`,
        `platformFee[${fees.platform}]`,
        `harvestBounty[${fees.harvest}]`
      );
    });
    console.log("{");
    ACRV_IFO_VAULTS.forEach(({ name, fees }) => {
      const config = VAULT_CONFIG[name];
      const holder = POOL_HOLDERS[name];
      if (holder === undefined) {
        return;
      }
      console.log(`  "${name}": [`);
      Object.entries(config.deposit).forEach(([symbol, routes]) => {
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
    const config = VAULT_CONFIG[name];
    const holder = POOL_HOLDERS[name];
    if (holder === undefined) {
      return;
    }

    context(`ifo for pool: ${name}`, async () => {
      beforeEach(async () => {
        request_fork(holder.fork, [
          DEPLOYER,
          holder.holder,
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
        zap = await ethers.getContractAt("AladdinZap", DEPLOYED_CONTRACTS.AladdinZap, manager);

        // setup withdraw zap
        await zap.updatePoolTokens([ADDRESS[`${config.token}_POOL`]], [lpToken.address]);
        if (ADDRESS[`${config.token}_DEPOSIT`]) {
          await zap.updatePoolTokens([ADDRESS[`${config.token}_DEPOSIT`]], [lpToken.address]);
        }
        for (const [symbol, routes] of Object.entries(config.withdraw)) {
          await zap.updateRoute(lpToken.address, ADDRESS[symbol], routes);
        }

        gateway = await ethers.getContractAt(
          "ConcentratorGateway",
          DEPLOYED_CONTRACTS.Concentrator.ConcentratorGateway,
          deployer
        );

        vault = await ethers.getContractAt(
          "ConcentratorIFOVault",
          DEPLOYED_CONTRACTS.Concentrator.ConcentratorIFOVault,
          owner
        );
        await vault.addPool(config.convexId, config.rewards, fees.withdraw, fees.platform, fees.harvest);
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
          const etherAfter = await signer.getBalance();
          expect(etherAfter.add(receipt.gasUsed.mul(receipt.effectiveGasPrice))).gt(etherBefore);
          // zap from ETH
          const amountIn = etherAfter.add(receipt.gasUsed.mul(receipt.effectiveGasPrice)).sub(etherBefore);
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
            await booster.earmarkRewards(config.convexId);
            const token = await ethers.getContractAt("IERC20", DEPLOYED_CONTRACTS.Concentrator.aCRV, deployer);
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

  ACRV_IFO_VAULTS.forEach(({ name, fees }) => {
    genTests(name, fees);
  });
});

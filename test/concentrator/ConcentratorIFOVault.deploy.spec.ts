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
  };
} = {
  steth: {
    fork: 14927574,
    holder: "0x56c915758ad3f76fd287fff7563ee313142fb663",
    amount: "1000",
  },
  frax: {
    fork: 14927574,
    holder: "0x605b5f6549538a94bd2653d1ee67612a47039da0",
    amount: "10000",
  },
  tricrypto2: {
    fork: 14927574,
    holder: "0x51434f6502b6167abec98ff9f5fd37ef3e07e7d2",
    amount: "100",
  },
  cvxcrv: {
    fork: 14927574,
    holder: "0x52ad87832400485de7e7dc965d8ad890f4e82699",
    amount: "10000",
  },
  crveth: {
    fork: 14927574,
    holder: "0xc75441d085d73983d8659635251dcf528dfb9be2",
    amount: "100",
  },
  cvxeth: {
    fork: 14927574,
    holder: "0x38ee5f5a39c01cb43473992c12936ba1219711ab",
    amount: "100",
  },
  cvxfxs: {
    fork: 14927574,
    holder: "0xea1c95d7d7b5489d9e6da6545373c82d2c3db1e2",
    amount: "1000",
  },
  "3pool": {
    fork: 14927574,
    holder: "0x85eB61a62701be46479C913717E8d8FAD42b398d",
    amount: "10000",
  },
  ironbank: {
    fork: 14927574,
    holder: "0xd4dfbde97c93e56d1e41325bb428c18299db203f",
    amount: "100",
  },
  mim: {
    fork: 14927574,
    holder: "0xe896e539e557bc751860a7763c8dd589af1698ce",
    amount: "10000",
  },
  ren: {
    fork: 14927574,
    holder: "0x3cbe654df532c6b7e8dd6428617df7359d468e99",
    amount: "10",
  },
  pusd: {
    fork: 14927574,
    holder: "0xb8d5ed3f983ea318ffc9174078a663640139b851",
    amount: "10000",
  },
  susd: {
    fork: 14927574,
    holder: "0xfeec87662a5dfe8a159e1516af01fb9014b3ef0d",
    amount: "10000",
  },
  sbtc: {
    fork: 14927574,
    holder: "0x5ec3f59397498cee61d71399d15458ecc171b783",
    amount: "10",
  },
  seth: { fork: 14927574, holder: "0x781814773609d820ab3fff2f21624d93e9b4784a", amount: "100" },
  fraxusdc: {
    fork: 15103273,
    holder: "0xf28e1b06e00e8774c612e31ab3ac35d5a720085f",
    amount: "10000",
  },
  fpifrax: {
    fork: 15103273,
    holder: "0x36a87d1e3200225f881488e4aeedf25303febcae",
    amount: "1",
  },
  alusd: {
    fork: 14927574,
    holder: "0xc16e8f5ce96515e5ffdc198f23293d75b42c3266",
    amount: "10000",
  },
  compound: {
    fork: 14927574,
    holder: "0xfd1935fd3c8f49723deb7296c58ba4bb1a0e48e1",
    amount: "10000",
  },
  dola: {
    fork: 14927574,
    holder: "0xa83f6bec55a100ca3402245fc1d46127889354ec",
    amount: "10000",
  },
  busdv2: {
    fork: 14927574,
    holder: "0x8c3e24477c309deae96e533a2dc191d728aced9c",
    amount: "1000",
  },
  aleth: {
    fork: 14927574,
    holder: "0x084d0cd0605f47d92dc2dfd22238e9c5605023e9",
    amount: "1",
  },
  "3eur": {
    fork: 15103273,
    holder: "0x225509847509f66c9bd49cda9714f481a3a6200e",
    amount: "1",
  },
  lusd: {
    fork: 14927574,
    holder: "0xc64844d9b3db280a6e46c1431e2229cd62dd2d69",
    amount: "10000",
  },
};

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";

describe("ConcentratorIFOVault.deploy.15103273.spec", async () => {
  let deployer: SignerWithAddress;
  let signer: SignerWithAddress;
  let lpToken: IERC20;
  let vault: ConcentratorIFOVault;
  let zap: AladdinZap;
  let gateway: ConcentratorGateway;

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

    context(`ifo for pool: ${name}`, async () => {
      beforeEach(async () => {
        request_fork(holder.fork, [
          DEPLOYER,
          holder.holder,
          DEPLOYED_CONTRACTS.ManagementMultisig,
          DEPLOYED_CONTRACTS.CommunityMultisig,
        ]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(holder.holder);
        const admin = await ethers.getSigner(DEPLOYED_CONTRACTS.CommunityMultisig);
        const manager = await ethers.getSigner(DEPLOYED_CONTRACTS.ManagementMultisig);

        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });
        await deployer.sendTransaction({ to: admin.address, value: ethers.utils.parseEther("10") });
        await deployer.sendTransaction({ to: manager.address, value: ethers.utils.parseEther("10") });

        lpToken = await ethers.getContractAt("IERC20", ADDRESS[`${config.token}_TOKEN`]);

        // upgrade zap contract
        const proxyAdmin = await ethers.getContractAt("ProxyAdmin", DEPLOYED_CONTRACTS.ProxyAdmin, admin);
        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        const impl = await AladdinZap.deploy();
        await proxyAdmin.upgrade(DEPLOYED_CONTRACTS.AladdinZap, impl.address);
        zap = await ethers.getContractAt("AladdinZap", DEPLOYED_CONTRACTS.AladdinZap, manager);

        // setup withdraw zap
        await zap.updatePoolTokens([ADDRESS[`${config.token}_POOL`]], [lpToken.address]);
        if (ADDRESS[`${config.token}_DEPOSIT`]) {
          await zap.updatePoolTokens([ADDRESS[`${config.token}_DEPOSIT`]], [lpToken.address]);
        }
        for (const [symbol, routes] of Object.entries(config.withdraw)) {
          await zap.updateRoute(lpToken.address, ADDRESS[symbol], routes);
        }

        const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
        const logic = await TokenZapLogic.deploy();
        await logic.deployed();

        const ConcentratorGateway = await ethers.getContractFactory("ConcentratorGateway", deployer);
        gateway = await ConcentratorGateway.deploy(logic.address);

        const ConcentratorIFOVault = await ethers.getContractFactory("ConcentratorIFOVault", deployer);
        vault = await ConcentratorIFOVault.deploy();
        await vault.initialize(DEPLOYED_CONTRACTS.aCRV, DEPLOYED_CONTRACTS.AladdinZap, deployer.address);

        await vault.addPool(config.convexId, config.rewards, fees.withdraw, fees.platform, fees.harvest);
      });

      context("deposit", async () => {
        const amountLP = ethers.utils.parseEther(holder.amount);
        it("deposit, withdraw as ETH, deposit from ETH", async () => {
          // deposit
          await lpToken.connect(signer).approve(vault.address, amountLP);
          await vault.connect(signer)["deposit(uint256,uint256)"](0, amountLP);
          const sharesOut = await vault.getUserShare(0, signer.address);
          expect(sharesOut).to.eq(amountLP);
          // withdraw to ETH
          const etherBefore = await signer.getBalance();
          const tx = await vault.connect(signer).withdrawAndZap(0, sharesOut, constants.AddressZero, 0);
          expect(await vault.getUserShare(0, signer.address)).to.eq(constants.Zero);
          const receipt = await tx.wait();
          const etherAfter = await signer.getBalance();
          expect(etherAfter.add(receipt.gasUsed.mul(receipt.effectiveGasPrice))).gt(etherBefore);
          // zap from ETH
          const amountIn = etherAfter.add(receipt.gasUsed.mul(receipt.effectiveGasPrice)).sub(etherBefore);
          await gateway
            .connect(signer)
            .deposit(vault.address, 0, constants.AddressZero, lpToken.address, amountIn, config.deposit.WETH, 0, {
              value: amountIn,
            });
          const zapSharesOut = await vault.getUserShare(0, signer.address);
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
            await vault.connect(signer)["deposit(uint256,uint256)"](0, amountLP);
            const sharesOut = await vault.getUserShare(0, signer.address);
            expect(sharesOut).to.eq(amountLP);
            // withdraw to token
            const token = await ethers.getContractAt("IERC20", ADDRESS[symbol], signer);
            const tokenBefore = await token.balanceOf(signer.address);
            await vault.connect(signer).withdrawAndZap(0, sharesOut, token.address, 0);
            const tokenAfter = await token.balanceOf(signer.address);
            expect(tokenAfter.gt(tokenBefore));
            // zap from token
            const amountIn = tokenAfter.sub(tokenBefore);
            await token.approve(gateway.address, constants.MaxUint256);
            await gateway
              .connect(signer)
              .deposit(vault.address, 0, token.address, lpToken.address, amountIn, routes, 0);
            const zapSharesOut = await vault.getUserShare(0, signer.address);
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
          await vault.connect(signer)["deposit(uint256,uint256)"](0, amountLP);
          const sharesOut = await vault.getUserShare(0, signer.address);
          expect(sharesOut).to.eq(amountLP);
        });

        it("should succeed", async () => {
          await booster.earmarkRewards(config.convexId);
          const token = await ethers.getContractAt("IERC20", DEPLOYED_CONTRACTS.aCRV, deployer);
          const amount = await vault.callStatic.harvest(0, deployer.address, 0);
          const before = await token.balanceOf(vault.address);
          await vault.harvest(0, deployer.address, 0);
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
    });
  };

  ACRV_IFO_VAULTS.forEach(({ name, fees }) => {
    genTests(name, fees);
  });
});

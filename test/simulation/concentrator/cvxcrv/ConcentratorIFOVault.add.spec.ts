/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { MaxUint256, ZeroAddress, toBeHex } from "ethers";
import { ethers } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import { AladdinZap, ConcentratorGateway, ConcentratorIFOVault, IConvexBooster, MockERC20 } from "@/types/index";
import { ADDRESS, AVAILABLE_VAULTS, DEPLOYED_CONTRACTS, DEPLOYED_VAULTS, TOKENS, ZAP_ROUTES } from "@/utils/index";

const POOL_FORK_CONFIG: {
  [name: string]: {
    height: number;
    pid: number;
    holder: string;
    amount: string;
    harvest: boolean;
  };
} = {
  silofrax: {
    height: 15193360,
    pid: 24,
    holder: "0xabc508dda7517f195e416d77c822a4861961947a",
    amount: "1000",
    harvest: true,
  },
  tusd: {
    height: 15193360,
    pid: 24,
    holder: "0xd34f3e85bb7c8020c7959b80a4b87a369d639dc0",
    amount: "1000",
    harvest: false,
  },
  susdfraxbp: {
    height: 15193360,
    pid: 24,
    holder: "0x99F4176EE457afedFfCB1839c7aB7A030a5e4A92",
    amount: "1000",
    harvest: false,
  },
  busdfraxbp: {
    height: 15193360,
    pid: 24,
    holder: "0xB1748C79709f4Ba2Dd82834B8c82D4a505003f27",
    amount: "1000",
    harvest: false,
  },
  alusdfraxbp: {
    height: 15193360,
    pid: 24,
    holder: "0x5180db0237291a6449dda9ed33ad90a38787621c",
    amount: "1000",
    harvest: false,
  },
  tusdfraxbp: {
    height: 15193360,
    pid: 24,
    holder: "0x5180db0237291a6449dda9ed33ad90a38787621c",
    amount: "1000",
    harvest: false,
  },
  lusdfraxbp: {
    height: 15190189,
    pid: 24,
    holder: "0xb1748c79709f4ba2dd82834b8c82d4a505003f27",
    amount: "1000",
    harvest: false,
  },
  peth: {
    height: 15876065,
    pid: 31,
    holder: "0x51c2cef9efa48e08557a361b52db34061c025a1b",
    amount: "10",
    harvest: true,
  },
  cbeth: {
    height: 15876065,
    pid: 31,
    holder: "0x7a16ff8270133f063aab6c9977183d9e72835428",
    amount: "10",
    harvest: false,
  },
  frxeth: {
    height: 15876065,
    pid: 31,
    holder: "0xda035641151d42aa4a25ce51de8f6e53eae0ded7",
    amount: "10",
    harvest: false,
  },
  blusd: {
    height: 16245350,
    pid: 34,
    holder: "0xa5cd3bc3f3d34b3a716111643e19db88bfa649c7",
    amount: "10000",
    harvest: true,
  },
  sbtc2: {
    height: 16248720,
    pid: 34,
    holder: "0x7a16ff8270133f063aab6c9977183d9e72835428",
    amount: "1",
    harvest: false,
  },
  multibtc: {
    height: 16340740,
    pid: 36,
    holder: "0x6ae7bf291028ccf52991bd020d2dc121b40bce2a",
    amount: "0.00001",
    harvest: true,
  },
  clevcvx: {
    height: 16434600,
    pid: 37,
    holder: "0x1aceff73c5c3afc630c1fc8b484527a23f4eb134",
    amount: "10",
    harvest: false,
  },
  clevusd: {
    height: 16434600,
    pid: 37,
    holder: "0xb957dccaa1ccfb1eb78b495b499801d591d8a403",
    amount: "10",
    harvest: false,
  },
  "ETH/CLEV": {
    height: 16524480,
    pid: 39,
    holder: "0x0a27dab612e9f254417ea61598de46e88f3d1730",
    amount: "1",
    harvest: true,
  },
  "ETH/rETH": {
    height: 16701141,
    pid: 40,
    holder: "0x17fd68F4F3035A1b51E6e662238784001f76A8F9",
    amount: "1",
    harvest: false,
  },
  "GEAR/ETH": {
    height: 16701141,
    pid: 40,
    holder: "0x7338afb07db145220849B04A45243956f20B14d9",
    amount: "1000",
    harvest: true,
  },
  "WETH/stETH": {
    height: 16701141,
    pid: 40,
    holder: "0xD1caD198fa57088C01f2B6a8c64273ef6D1eC085",
    amount: "10",
    harvest: false,
  },
  "STG/USDC": {
    height: 16701141,
    pid: 40,
    holder: "0xA489e9daf10cEd86811d59e4D00ce1b0DEC95f5e",
    amount: "1000",
    harvest: true,
  },
  "ETH/LDO": {
    height: 16701141,
    pid: 40,
    holder: "0xdB5F9b2869Cec66382790cFE883fbBFa8a1f6B27",
    amount: "10",
    harvest: true,
  },
  "ETH/MATIC": {
    height: 16701141,
    pid: 40,
    holder: "0x3732FE38e7497Da670bd0633D565a5d80D3565e2",
    amount: "1000",
    harvest: true,
  },
  "ETH/CNC": {
    height: 16701141,
    pid: 40,
    holder: "0x4e122c62742eB4811659f6d85fdA51cC63764940",
    amount: "10",
    harvest: true,
  },
  "tBTC/crvWSBTC": {
    height: 16776780,
    pid: 47,
    holder: "0x9bC8d30d971C9e74298112803036C05db07D73e3",
    amount: "0.01",
    harvest: true,
  },
  "ETH/CTR": {
    height: 16776780,
    pid: 47,
    holder: "0xC62eECc24cb6E84dA2409e945Ddcf7386118c57a",
    amount: "100",
    harvest: false,
  },
  "USDP/3CRV": {
    height: 16889700,
    pid: 49,
    holder: "0x4e7c361be194Beb26C3666225d4A7301b917Ea87",
    amount: "1000",
    harvest: false,
  },
  "CRV/cvxCRV": {
    height: 16889700,
    pid: 49,
    holder: "0xecdED8b1c603cF21299835f1DFBE37f10F2a29Af",
    amount: "10000",
    harvest: false,
  },
  "eCFX/ETH": {
    height: 17033000,
    pid: 51,
    holder: "0x7D7a9bFC87256AfaE4186FB8fBf5c2588D12118d",
    amount: "10000",
    harvest: false,
  },
  "rETH/frxETH": {
    height: 17108720,
    pid: 52,
    holder: "0xB1748C79709f4Ba2Dd82834B8c82D4a505003f27",
    amount: "10",
    harvest: true,
  },
  "stETH/frxETH": {
    height: 17108720,
    pid: 52,
    holder: "0xB1748C79709f4Ba2Dd82834B8c82D4a505003f27",
    amount: "20",
    harvest: true,
  },
  "cbETH/frxETH": {
    height: 17108720,
    pid: 52,
    holder: "0xB1748C79709f4Ba2Dd82834B8c82D4a505003f27",
    amount: "15",
    harvest: true,
  },
  "sETH/frxETH": {
    height: 17108720,
    pid: 52,
    holder: "0xB1748C79709f4Ba2Dd82834B8c82D4a505003f27",
    amount: "15",
    harvest: true,
  },
  "FRAX/USDP": {
    height: 17108720,
    pid: 52,
    holder: "0x39E761E4F039Ed77286F393c948AD6716170F897",
    amount: "10000",
    harvest: true,
  },
  "UZD/FRAXBP": {
    height: 17252690,
    pid: 57,
    holder: "0xF9605D8c4c987d7Cb32D0d11FbCb8EeeB1B22D5d",
    amount: "100",
    harvest: true,
  },
  "ETH/wBETH": {
    height: 17252690,
    pid: 57,
    holder: "0xE6DA683076b7eD6ce7eC972f21Eb8F91e9137a17",
    amount: "0.1",
    harvest: false,
  },
  "USDT/crvUSD": {
    height: 17377350,
    pid: 59,
    holder: "0x7a16fF8270133F063aAb6C9977183D9e72835428",
    amount: "10000",
    harvest: false,
  },
  "USDP/crvUSD": {
    height: 17377350,
    pid: 59,
    holder: "0x7a16fF8270133F063aAb6C9977183D9e72835428",
    amount: "10000",
    harvest: false,
  },
  "TUSD/crvUSD": {
    height: 17377350,
    pid: 59,
    holder: "0x7a16fF8270133F063aAb6C9977183D9e72835428",
    amount: "10000",
    harvest: false,
  },
  "USDC/crvUSD": {
    height: 17377350,
    pid: 59,
    holder: "0x7a16fF8270133F063aAb6C9977183D9e72835428",
    amount: "10000",
    harvest: false,
  },
  "USDC/WBTC/ETH": {
    height: 17447590,
    pid: 63,
    holder: "0xeCb456EA5365865EbAb8a2661B0c503410e9B347",
    amount: "0.01",
    harvest: true,
  },
  "USDT/WBTC/ETH": {
    height: 17447590,
    pid: 63,
    holder: "0xeCb456EA5365865EbAb8a2661B0c503410e9B347",
    amount: "0.01",
    harvest: true,
  },
  "ETH/stETH-ng": {
    height: 17497260,
    pid: 65,
    holder: "0x0FCbf9A4398C15d6609580879681Aa5382FF8542",
    amount: "10",
    harvest: true,
  },
  "FXS/cvxFXS": {
    height: 17985810,
    pid: 66,
    holder: "0xCB16F82E5949975f9Cf229C91c3A6D43e3B32a9E",
    amount: "1000",
    harvest: true,
  },
  "WETH/frxETH": {
    height: 18925320,
    pid: 67,
    holder: "0x0c5FA111C6B2D12Aa372E963987e67A60fdE8D55",
    amount: "100",
    harvest: true,
  },
  "FRAX/PYUSD": {
    height: 18966650,
    pid: 68,
    holder: "0x5180db0237291A6449DdA9ed33aD90a38787621c",
    amount: "10",
    harvest: false,
  },
  "FRAX/sDAI": {
    height: 18966650,
    pid: 68,
    holder: "0xC6EF452b0de9E95Ccb153c2A5A7a90154aab3419",
    amount: "100",
    harvest: true,
  },
  "weETH/rswETH": {
    height: 19211234,
    pid: 70,
    holder: "0xC3f89F829CA23E85c59e9eC44a0c79e483d58be2",
    amount: "100",
    harvest: false,
  },
  "eUSD/crvUSD": {
    height: 19186812,
    pid: 70,
    holder: "0xC6625129C9df3314a4dd604845488f4bA62F9dB8",
    amount: "100",
    harvest: false,
  },
  "eUSD/mkUSD": {
    height: 19186808,
    pid: 70,
    holder: "0xC6625129C9df3314a4dd604845488f4bA62F9dB8",
    amount: "100",
    harvest: false,
  },
};

const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const PRINT_ZAP = true;
const POOLS = (process.env.POOLS || "").split(",");

describe("ConcentratorIFOVault.add.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let lpToken: MockERC20;
  let vault: ConcentratorIFOVault;
  let zap: AladdinZap;
  let gateway: ConcentratorGateway;

  if (PRINT_ZAP) {
    console.log("{");
    DEPLOYED_VAULTS.aCRV.forEach(({ name }) => {
      const config = AVAILABLE_VAULTS[name];
      const fork = POOL_FORK_CONFIG[name];
      if (fork === undefined) {
        return;
      }
      if (!POOLS.includes(name)) return;

      console.log(`  "${name}": [`);
      Object.entries(config.deposit).forEach(([symbol, routes]) => {
        if (symbol === "WETH") {
          console.log(
            `    {"symbol": "ETH", "address": "${ZeroAddress}", "routes": [${routes
              .map((x) => `"${toBeHex(x)}"`)
              .join(",")}]},`
          );
        }
        console.log(
          `    {"symbol": "${symbol}", "address": "${TOKENS[symbol].address}", "routes": [${routes
            .map((x) => `"${toBeHex(x)}"`)
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
    const fork = POOL_FORK_CONFIG[name];
    if (fork === undefined) {
      return;
    }
    if (!POOLS.includes(name)) return;

    context(`ifo for pool: ${name}`, async () => {
      beforeEach(async () => {
        request_fork(fork.height, [
          ZeroAddress,
          fork.holder,
          DEPLOYED_CONTRACTS.CommunityMultisig,
          DEPLOYED_CONTRACTS.ManagementMultisig,
          DEPLOYED_CONTRACTS.Concentrator.Treasury,
        ]);
        deployer = await ethers.getSigner(ZeroAddress);
        signer = await ethers.getSigner(fork.holder);
        const manager = await ethers.getSigner(DEPLOYED_CONTRACTS.ManagementMultisig);
        const owner = await ethers.getSigner(DEPLOYED_CONTRACTS.Concentrator.Treasury);

        await mockETHBalance(deployer.address, ethers.parseEther("10"));
        await mockETHBalance(signer.address, ethers.parseEther("10"));
        await mockETHBalance(manager.address, ethers.parseEther("10"));
        await mockETHBalance(owner.address, ethers.parseEther("10"));

        lpToken = await ethers.getContractAt("MockERC20", TOKENS[`${config.token}`].address);

        const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
        const logic = await TokenZapLogic.deploy();

        // upgrade zap contract
        const proxyAdmin = await ethers.getContractAt("ProxyAdmin", DEPLOYED_CONTRACTS.Concentrator.ProxyAdmin, owner);
        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        const impl = await AladdinZap.deploy();
        await proxyAdmin.upgrade(DEPLOYED_CONTRACTS.AladdinZap, impl.getAddress());
        zap = await ethers.getContractAt("AladdinZap", DEPLOYED_CONTRACTS.AladdinZap, manager);

        // setup withdraw zap
        await zap.updatePoolTokens([ADDRESS[`${config.token}_POOL`]], [lpToken.getAddress()]);
        await zap.updatePoolTokens([ADDRESS.CURVE_LUSD3CRV_POOL], [ADDRESS.CURVE_LUSD3CRV_TOKEN]);
        if (ADDRESS[`${config.token}_DEPOSIT`]) {
          await zap.updatePoolTokens([ADDRESS[`${config.token}_DEPOSIT`]], [lpToken.getAddress()]);
        }
        for (const [symbol, routes] of Object.entries(config.withdraw)) {
          await zap.updateRoute(lpToken.getAddress(), ADDRESS[symbol], routes);
        }

        gateway = await ethers.getContractAt(
          "ConcentratorGateway",
          DEPLOYED_CONTRACTS.Concentrator.ConcentratorGateway,
          manager
        );
        const gatewayOwner = await ethers.getSigner(await gateway.owner());
        await gateway.connect(gatewayOwner).updateLogic(logic.getAddress());

        vault = await ethers.getContractAt(
          "ConcentratorIFOVault",
          DEPLOYED_CONTRACTS.Concentrator.cvxCRV.ConcentratorIFOVault,
          owner
        );
        await vault.updateHarvester(ZeroAddress).catch((_) => {});
        await vault.addPool(config.convexCurveID!, config.rewards, fees.withdraw, fees.platform, fees.harvest);
      });

      context("deposit", async () => {
        const amountLP = ethers.parseEther(fork.amount);
        if (config.deposit.WETH !== undefined) {
          it("deposit, withdraw as ETH, deposit from ETH", async () => {
            // deposit
            await lpToken.connect(signer).approve(vault.getAddress(), amountLP);
            await vault.connect(signer)["deposit(uint256,uint256)"](fork.pid, amountLP);
            const sharesOut = await vault.getUserShare(fork.pid, signer.address);
            expect(sharesOut).to.eq(amountLP);
            // withdraw to ETH
            const etherBefore = await ethers.provider.getBalance(signer.address);
            const tx = await vault.connect(signer).withdrawAndZap(fork.pid, sharesOut, ZeroAddress, 0);
            expect(await vault.getUserShare(fork.pid, signer.address)).to.eq(0n);
            const receipt = await tx.wait();
            const etherAfter = await ethers.provider.getBalance(signer.address);
            expect(etherAfter + receipt!.gasUsed * receipt!.gasPrice).to.gt(etherBefore);
            // zap from ETH
            const amountIn = etherAfter + receipt!.gasUsed * receipt!.gasPrice - etherBefore;
            await gateway
              .connect(signer)
              .deposit(
                vault.getAddress(),
                fork.pid,
                ZeroAddress,
                lpToken.getAddress(),
                amountIn,
                config.deposit.WETH,
                0,
                {
                  value: amountIn,
                }
              );
            const zapSharesOut = await vault.getUserShare(fork.pid, signer.address);
            console.log(
              `amountLP[${ethers.formatEther(amountLP)}]`,
              `amountIn[${ethers.formatEther(amountIn)}]`,
              `zapSharesOut[${ethers.formatEther(zapSharesOut)}]`
            );
            expect(zapSharesOut).to.gt(0n);
            expect(zapSharesOut).to.closeTo(sharesOut, (sharesOut * 2n) / 100n); // 2% error
          });
        }

        Object.entries(config.deposit).forEach(([symbol, routes]) => {
          it(`deposit, withdraw as ${symbol}, deposit from ${symbol}`, async () => {
            // deposit
            await lpToken.connect(signer).approve(vault.getAddress(), amountLP);
            await vault.connect(signer)["deposit(uint256,uint256)"](fork.pid, amountLP);
            const sharesOut = await vault.getUserShare(fork.pid, signer.address);
            expect(sharesOut).to.eq(amountLP);
            // withdraw to token
            const token = await ethers.getContractAt("MockERC20", ADDRESS[symbol], signer);
            const tokenBefore = await token.balanceOf(signer.address);
            await vault.connect(signer).withdrawAndZap(fork.pid, sharesOut, token.getAddress(), 0);
            const tokenAfter = await token.balanceOf(signer.address);
            expect(tokenAfter).to.gt(tokenBefore);
            // zap from token
            const amountIn = tokenAfter - tokenBefore;
            await token.approve(gateway.getAddress(), MaxUint256);
            await gateway
              .connect(signer)
              .deposit(vault.getAddress(), fork.pid, token.getAddress(), lpToken.getAddress(), amountIn, routes, 0);
            const zapSharesOut = await vault.getUserShare(fork.pid, signer.address);
            console.log(
              `amountLP[${ethers.formatEther(amountLP)}]`,
              `amountIn[${ethers.formatUnits(amountIn, TOKENS[symbol].decimals)}]`,
              `zapSharesOut[${ethers.formatEther(zapSharesOut)}]`
            );
            expect(zapSharesOut).to.gt(0n);
            expect(zapSharesOut).to.closeTo(sharesOut, (sharesOut * 2n) / 100n); // 2% error
          });
        });

        it("should succeed when deposit LP", async () => {
          await lpToken.connect(signer).approve(vault.getAddress(), amountLP);
          await vault.connect(signer)["deposit(uint256,uint256)"](fork.pid, amountLP);
          const sharesOut = await vault.getUserShare(fork.pid, signer.address);
          expect(sharesOut).to.eq(amountLP);
        });
      });

      if (fork.harvest) {
        context("harvest", async () => {
          const amountLP = ethers.parseEther(fork.amount);
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

            await lpToken.connect(signer).approve(vault.getAddress(), amountLP);
            await vault.connect(signer)["deposit(uint256,uint256)"](fork.pid, amountLP);
            const sharesOut = await vault.getUserShare(fork.pid, signer.address);
            expect(sharesOut).to.eq(amountLP);
          });

          it("should succeed", async () => {
            await booster.earmarkRewards(config.convexCurveID!);
            const token = await ethers.getContractAt(
              "MockERC20",
              DEPLOYED_CONTRACTS.Concentrator.cvxCRV.aCRV,
              deployer
            );
            const amount = await vault.harvest.staticCall(fork.pid, deployer.address, 0);
            const before = await token.balanceOf(vault.getAddress());
            await vault.harvest(fork.pid, deployer.address, 0);
            const after = await token.balanceOf(vault.getAddress());
            console.log("harvested cvxCRV:", ethers.formatEther(amount), "aCRV:", ethers.formatEther(after - before));
            expect(amount).gt(0n);
          });
        });
      }
    });
  };

  DEPLOYED_VAULTS.aCRV.forEach(({ name, fees }) => {
    genTests(name, fees);
  });
});

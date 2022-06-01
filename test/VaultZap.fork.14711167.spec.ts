/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { ADDRESS, VAULTS, ZAP_VAULT_ROUTES } from "../scripts/config";
import { AladdinConvexVault, IConvexBooster } from "../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "./utils";

const FORK_BLOCK_NUMBER = 14711167;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const VAULT = "0xc8fF37F7d057dF1BB9Ad681b53Fa4726f268E0e8";
const OWNER = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const ZAP = "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a";
const ZAP_OWNER = "0x28c921adAC4c1072658eB01a28DA06b5F651eF62";

// pid = 10
const CURVE_REN_TOKEN = ADDRESS.CURVE_REN_TOKEN;
const CURVE_REN_POOL = ADDRESS.CURVE_REN_POOL;
const CURVE_REN_HOLDER = "0x457eBcAAb3B5b94708207481B9510A983E671517";

const WETH = ADDRESS.WETH;
const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const renBTC = ADDRESS.renBTC;
const renBTC_HOLDER = "0xcA436e14855323927d6e6264470DeD36455fC8bD";
const WBTC = ADDRESS.WBTC;
const WBTC_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const USDC = ADDRESS.USDC;
const USDC_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";

let firstCall = true;

describe("VaultZapMainnetFork.spec", async () => {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let vault: AladdinConvexVault;
  let booster: IConvexBooster;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [
      DEPLOYER,
      OWNER,
      ZAP_OWNER,
      WETH_HOLDER,
      renBTC_HOLDER,
      WBTC_HOLDER,
      USDC_HOLDER,
      CURVE_REN_HOLDER,
    ]);
    deployer = await ethers.getSigner(DEPLOYER);
    owner = await ethers.getSigner(OWNER);
    const zapOwner = await ethers.getSigner(ZAP_OWNER);

    await deployer.sendTransaction({ to: owner.address, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: zapOwner.address, value: ethers.utils.parseEther("10") });

    booster = await ethers.getContractAt("IConvexBooster", BOOSTER, deployer);
    vault = await ethers.getContractAt("AladdinConvexVault", VAULT, owner);

    const zap = await ethers.getContractAt("AladdinZap", ZAP, zapOwner);
    const { name, add: addRoutes, remove: removeRoutes } = ZAP_VAULT_ROUTES.ren;
    for (const { token, routes } of addRoutes) {
      if (firstCall) {
        console.log(
          `${token} to ${name + "_TOKEN"} zap:`,
          `from[${ADDRESS[token]}]`,
          `to[${ADDRESS[name + "_TOKEN"]}]`,
          `routes[${routes.toString()}]`
        );
      }
      await zap.updateRoute(ADDRESS[token], ADDRESS[name + "_TOKEN"], routes);
    }
    for (const { token, routes } of removeRoutes) {
      if (firstCall) {
        console.log(
          ` ${name + "_TOKEN"} to ${token} zap:`,
          `from[${ADDRESS[name + "_TOKEN"]}]`,
          `to[${ADDRESS[token]}]`,
          `routes[${routes.toString()}]`
        );
      }
      await zap.updateRoute(ADDRESS[name + "_TOKEN"], ADDRESS[token], routes);
    }
    if (firstCall) {
      console.log(`updatePoolTokens: pools[${CURVE_REN_POOL}] tokens[${CURVE_REN_TOKEN}]`);
    }
    await zap.updatePoolTokens([CURVE_REN_POOL], [CURVE_REN_TOKEN]);

    const { name: vaultNmae, convexId, rewards, withdrawFee, harvestBounty, platformFee } = VAULTS[10];
    await vault.addPool(convexId, rewards, withdrawFee, platformFee, harvestBounty);
    if (firstCall) {
      console.log(
        `add pool[${vaultNmae}]:`,
        `convexId[${convexId}]`,
        `rewards[${rewards.toString()}]`,
        `withdrawFee[${withdrawFee}]`,
        `harvestBounty[${harvestBounty}]`,
        `platformFee[${platformFee}]`
      );
    }
    firstCall = false;
  });

  context("ren pool", async () => {
    const pid = 10;

    context("deposit", async () => {
      it("should succeed, when deposit with ETH", async () => {
        const amountIn = ethers.utils.parseUnits("100", 18);
        const sharesOut = ethers.utils.parseEther("7.198090534338485767");
        const signer = await ethers.getSigner(WETH_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: amountIn.add(ethers.utils.parseEther("10")) });

        const shares = await vault
          .connect(signer)
          .callStatic.zapAndDeposit(pid, constants.AddressZero, amountIn, 0, { value: amountIn });
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, constants.AddressZero, amountIn, 0, { value: amountIn });
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with WETH", async () => {
        const amountIn = ethers.utils.parseUnits("100", 18);
        const sharesOut = ethers.utils.parseEther("7.198090534338485767");
        const signer = await ethers.getSigner(WETH_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const weth = await ethers.getContractAt("IERC20", WETH, signer);
        await weth.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, weth.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, weth.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with renBTC", async () => {
        const amountIn = ethers.utils.parseUnits("1", 8);
        const sharesOut = ethers.utils.parseEther("0.981194228107524226");
        const signer = await ethers.getSigner(renBTC_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const renbtc = await ethers.getContractAt("IERC20", renBTC, signer);
        await renbtc.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, renbtc.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, renbtc.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with WBTC", async () => {
        const amountIn = ethers.utils.parseUnits("1", 8);
        const sharesOut = ethers.utils.parseEther("0.981577613869276499");
        const signer = await ethers.getSigner(WBTC_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const wbtc = await ethers.getContractAt("IERC20", WBTC, signer);
        await wbtc.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, wbtc.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, wbtc.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with USDC", async () => {
        const amountIn = ethers.utils.parseUnits("100000", 6);
        const sharesOut = ethers.utils.parseEther("2.512616404919825352");
        const signer = await ethers.getSigner(USDC_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const usdc = await ethers.getContractAt("IERC20", USDC, signer);
        await usdc.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, usdc.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, usdc.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with LPToken", async () => {
        const amountIn = ethers.utils.parseUnits("1", 18);
        const sharesOut = ethers.utils.parseEther("1");
        const signer = await ethers.getSigner(CURVE_REN_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const rencrv = await ethers.getContractAt("IERC20", CURVE_REN_TOKEN, signer);
        await rencrv.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, rencrv.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, rencrv.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });
    });

    context("withdraw", async () => {
      let signer: SignerWithAddress;

      beforeEach(async () => {
        signer = await ethers.getSigner(CURVE_REN_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const rencrv = await ethers.getContractAt("IERC20", CURVE_REN_TOKEN, signer);
        await rencrv.approve(vault.address, constants.MaxUint256);
        await vault.connect(signer).zapAndDeposit(pid, CURVE_REN_TOKEN, ethers.utils.parseEther("1"), 0);
      });

      it("should succeed, when harvest", async () => {
        await booster.earmarkRewards(6);
        const amount = await vault.callStatic.harvest(pid, signer.address, 0);
        await vault.harvest(pid, signer.address, 0);
        console.log("rewards", amount.toString());
        expect(await ethers.provider.getBalance(vault.address)).to.eq(constants.Zero);
      });

      it("should succeed, when withdraw to lp Token", async () => {
        const amountOut = ethers.utils.parseUnits("1", 18);
        const rencrv = await ethers.getContractAt("IERC20", CURVE_REN_TOKEN);
        const before = await rencrv.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, CURVE_REN_TOKEN, amountOut);
        const after = await rencrv.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });
    });
  });
});

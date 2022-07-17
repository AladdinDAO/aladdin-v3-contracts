/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { ACRV_VAULTS, ADDRESS, VAULT_CONFIG } from "../../scripts/utils";
import { AladdinCRVConvexVault, IConvexBooster } from "../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../utils";

const FORK_BLOCK_NUMBER = 14883496;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const VAULT = "0xc8fF37F7d057dF1BB9Ad681b53Fa4726f268E0e8";
const OWNER = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const ZAP = "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a";
const ZAP_OWNER = "0x28c921adAC4c1072658eB01a28DA06b5F651eF62";

// pid = 11
const CURVE_PUSD3CRV_TOKEN = ADDRESS.CURVE_PUSD3CRV_TOKEN;
const CURVE_PUSD3CRV_POOL = ADDRESS.CURVE_PUSD3CRV_POOL;
const CURVE_PUSD3CRV_HOLDER = "0x280BF69d522BbCFb3aEb138C59D85A16e449057c";

const WETH = ADDRESS.WETH;
const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const USDC = ADDRESS.USDC;
const USDC_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const DAI = ADDRESS.DAI;
const DAI_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const USDT = ADDRESS.USDT;
const USDT_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const PUSD = ADDRESS.PUSD;
const PUSD_HOLDER = "0xB0dAfc466871c29662E5cbf4227322C96A8Ccbe9";
const TRICRV = ADDRESS.TRICRV;
const TRICRV_HOLDER = "0x5c00977a2002a3C9925dFDfb6815765F578a804f";

let firstCall = true;

describe("AladdinCRVConvexVault.add.14883496.spec", async () => {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let vault: AladdinCRVConvexVault;
  let booster: IConvexBooster;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [
      DEPLOYER,
      OWNER,
      ZAP_OWNER,
      WETH_HOLDER,
      DAI_HOLDER,
      USDT_HOLDER,
      PUSD_HOLDER,
      TRICRV_HOLDER,
      USDC_HOLDER,
      CURVE_PUSD3CRV_HOLDER,
    ]);
    deployer = await ethers.getSigner(DEPLOYER);
    owner = await ethers.getSigner(OWNER);
    const zapOwner = await ethers.getSigner(ZAP_OWNER);

    await deployer.sendTransaction({ to: owner.address, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: zapOwner.address, value: ethers.utils.parseEther("10") });

    booster = await ethers.getContractAt("IConvexBooster", BOOSTER, deployer);
    vault = await ethers.getContractAt("AladdinCRVConvexVault", VAULT, owner);

    const zap = await ethers.getContractAt("AladdinZap", ZAP, zapOwner);
    const { token: name, deposit: addRoutes, withdraw: removeRoutes } = VAULT_CONFIG.pusd;
    for (const [token, routes] of Object.entries(addRoutes)) {
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
    for (const [token, routes] of Object.entries(removeRoutes)) {
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
      console.log(`updatePoolTokens: pools[${CURVE_PUSD3CRV_POOL}] tokens[${CURVE_PUSD3CRV_TOKEN}]`);
    }
    await zap.updatePoolTokens([CURVE_PUSD3CRV_POOL], [CURVE_PUSD3CRV_TOKEN]);

    const { name: vaultNmae, fees } = ACRV_VAULTS[11];
    const { convexId, rewards } = VAULT_CONFIG[vaultNmae];
    await vault.addPool(convexId, rewards, fees.withdraw, fees.platform, fees.harvest);
    if (firstCall) {
      console.log(
        `add pool[${vaultNmae}]:`,
        `convexId[${convexId}]`,
        `rewards[${rewards.toString()}]`,
        `withdrawFee[${fees.withdraw}]`,
        `platformFee[${fees.platform}]`,
        `harvestBounty[${fees.harvest}]`
      );
    }
    firstCall = false;
  });

  context("pusd pool", async () => {
    const pid = 11;

    context("deposit", async () => {
      beforeEach(async () => {});

      it("should succeed, when deposit with pusd", async () => {
        const amountIn = ethers.utils.parseEther("10000");
        const sharesOut = ethers.utils.parseEther("10490.357856598655460261");
        const signer = await ethers.getSigner(PUSD_HOLDER);
        const pusd = await ethers.getContractAt("IERC20", PUSD, signer);
        await pusd.approve(vault.address, constants.MaxUint256);
        const shares = await vault
          .connect(signer)
          .callStatic["zapAndDeposit(uint256,address,uint256,uint256)"](pid, pusd.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer)["zapAndDeposit(uint256,address,uint256,uint256)"](pid, pusd.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with 3crv", async () => {
        const amountIn = ethers.utils.parseEther("10000");
        const sharesOut = ethers.utils.parseEther("10014.360872635885220742");
        const signer = await ethers.getSigner(TRICRV_HOLDER);
        const tricrv = await ethers.getContractAt("IERC20", TRICRV, signer);
        await tricrv.approve(vault.address, constants.MaxUint256);
        const shares = await vault
          .connect(signer)
          .callStatic["zapAndDeposit(uint256,address,uint256,uint256)"](pid, tricrv.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer)["zapAndDeposit(uint256,address,uint256,uint256)"](pid, tricrv.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with DAI", async () => {
        const amountIn = ethers.utils.parseEther("10000");
        const sharesOut = ethers.utils.parseEther("9808.403003164507043619");
        const signer = await ethers.getSigner(DAI_HOLDER);
        const dai = await ethers.getContractAt("IERC20", DAI, signer);
        await dai.approve(vault.address, constants.MaxUint256);
        const shares = await vault
          .connect(signer)
          .callStatic["zapAndDeposit(uint256,address,uint256,uint256)"](pid, dai.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer)["zapAndDeposit(uint256,address,uint256,uint256)"](pid, dai.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with USDC", async () => {
        const amountIn = ethers.utils.parseUnits("10000", 6);
        const sharesOut = ethers.utils.parseEther("9808.162154863727309042");
        const signer = await ethers.getSigner(DAI_HOLDER);
        const usdc = await ethers.getContractAt("IERC20", USDC, signer);
        await usdc.approve(vault.address, constants.MaxUint256);
        const shares = await vault
          .connect(signer)
          .callStatic["zapAndDeposit(uint256,address,uint256,uint256)"](pid, usdc.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer)["zapAndDeposit(uint256,address,uint256,uint256)"](pid, usdc.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with USDT", async () => {
        const amountIn = ethers.utils.parseUnits("10000", 6);
        const sharesOut = ethers.utils.parseEther("9799.361812680245239082");
        const signer = await ethers.getSigner(USDT_HOLDER);
        const usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await usdt.approve(vault.address, constants.MaxUint256);
        const shares = await vault
          .connect(signer)
          .callStatic["zapAndDeposit(uint256,address,uint256,uint256)"](pid, usdt.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer)["zapAndDeposit(uint256,address,uint256,uint256)"](pid, usdt.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with ETH", async () => {
        const amountIn = ethers.utils.parseUnits("100", 18);
        const sharesOut = ethers.utils.parseEther("188769.665166339566851749");
        const signer = await ethers.getSigner(WETH_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: amountIn.add(ethers.utils.parseEther("10")) });

        const shares = await vault
          .connect(signer)
          .callStatic["zapAndDeposit(uint256,address,uint256,uint256)"](pid, constants.AddressZero, amountIn, 0, {
            value: amountIn,
          });
        expect(shares).to.eq(sharesOut);
        await vault
          .connect(signer)
          ["zapAndDeposit(uint256,address,uint256,uint256)"](pid, constants.AddressZero, amountIn, 0, {
            value: amountIn,
          });
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with WETH", async () => {
        const amountIn = ethers.utils.parseUnits("100", 18);
        const sharesOut = ethers.utils.parseEther("188769.665166339566851749");
        const signer = await ethers.getSigner(WETH_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const weth = await ethers.getContractAt("IERC20", WETH, signer);
        await weth.approve(vault.address, constants.MaxUint256);
        const shares = await vault
          .connect(signer)
          .callStatic["zapAndDeposit(uint256,address,uint256,uint256)"](pid, weth.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer)["zapAndDeposit(uint256,address,uint256,uint256)"](pid, weth.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });
    });

    context("withdraw", async () => {
      let signer: SignerWithAddress;

      beforeEach(async () => {
        signer = await ethers.getSigner(CURVE_PUSD3CRV_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });
        const frax3crv = await ethers.getContractAt("IERC20", CURVE_PUSD3CRV_TOKEN, signer);
        await frax3crv.approve(vault.address, constants.MaxUint256);
        await vault
          .connect(signer)
          ["zapAndDeposit(uint256,address,uint256,uint256)"](
            pid,
            CURVE_PUSD3CRV_TOKEN,
            ethers.utils.parseEther("10000"),
            0
          );
      });

      it("should succeed, when harvest", async () => {
        await booster.earmarkRewards(32);
        const amount = await vault.callStatic.harvest(pid, signer.address, 0);
        await vault.harvest(pid, signer.address, 0);
        console.log("rewards", amount.toString());
        expect(await ethers.provider.getBalance(vault.address)).to.eq(constants.Zero);
      });

      it("should succeed, when withdraw to lp Token", async () => {
        const amountOut = ethers.utils.parseUnits("10000", 18);
        const pusdcrv = await ethers.getContractAt("IERC20", CURVE_PUSD3CRV_TOKEN);
        const before = await pusdcrv.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, CURVE_PUSD3CRV_TOKEN, amountOut);
        const after = await pusdcrv.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });
    });
  });
});

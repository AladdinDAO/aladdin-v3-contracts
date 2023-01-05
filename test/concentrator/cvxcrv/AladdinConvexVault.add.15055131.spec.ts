/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { ADDRESS, AVAILABLE_VAULTS, DEPLOYED_VAULTS } from "../../../scripts/utils";
import { AladdinCRVConvexVault, IConvexBooster } from "../../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../../utils";

const FORK_BLOCK_NUMBER = 15055131;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
// const PROXY_ADMIN = "0x12b1326459d72F2Ab081116bf27ca46cD97762A0";
const VAULT = "0xc8fF37F7d057dF1BB9Ad681b53Fa4726f268E0e8";
const OWNER = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const ZAP = "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a";
const ZAP_OWNER = "0x28c921adAC4c1072658eB01a28DA06b5F651eF62";

// pid = 15
const CURVE_FRAXUSDC_TOKEN = ADDRESS.CURVE_FRAXUSDC_TOKEN;
const CURVE_FRAXUSDC_POOL = ADDRESS.CURVE_FRAXUSDC_POOL;
const CURVE_FRAXUSDC_HOLDER = "0x4ffc5f22770ab6046c8d66dabae3a9cd1e7a03e7";

const WETH = ADDRESS.WETH;
const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const USDC = ADDRESS.USDC;
const USDC_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const FRAX = ADDRESS.FRAX;
const FRAX_HOLDER = "0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE";

let firstCall = true;

describe("AladdinCRVConvexVault.add.15055131.spec", async () => {
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
      USDC_HOLDER,
      FRAX_HOLDER,
      CURVE_FRAXUSDC_HOLDER,
    ]);
    deployer = await ethers.getSigner(DEPLOYER);
    owner = await ethers.getSigner(OWNER);
    const zapOwner = await ethers.getSigner(ZAP_OWNER);

    await deployer.sendTransaction({ to: owner.address, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: zapOwner.address, value: ethers.utils.parseEther("10") });

    booster = await ethers.getContractAt("IConvexBooster", BOOSTER, deployer);
    vault = await ethers.getContractAt("AladdinCRVConvexVault", VAULT, owner);

    // const proxyAdmin = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN, owner);
    // const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
    // const impl = await AladdinZap.deploy();
    // await proxyAdmin.upgrade(ZAP, impl.address);

    const zap = await ethers.getContractAt("AladdinZap", ZAP, zapOwner);
    for (const pool of ["fraxusdc"]) {
      const { token: name, deposit: addRoutes } = AVAILABLE_VAULTS[pool];
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
    }
    if (firstCall) {
      console.log(`updatePoolTokens: pools[${CURVE_FRAXUSDC_POOL}] tokens[${CURVE_FRAXUSDC_TOKEN}]`);
    }
    await zap.updatePoolTokens([CURVE_FRAXUSDC_POOL], [CURVE_FRAXUSDC_TOKEN]);

    for (let index = 15; index <= 15; index++) {
      const { name: vaultNmae, fees } = DEPLOYED_VAULTS.LegacyACRV[index];
      const { convexCurveID, rewards } = AVAILABLE_VAULTS[vaultNmae];
      await vault.addPool(convexCurveID!, rewards, fees.withdraw, fees.platform, fees.harvest);
      if (firstCall) {
        console.log(
          `add pool[${vaultNmae}]:`,
          `convexCurveID[${convexCurveID}]`,
          `rewards[${rewards.toString()}]`,
          `withdrawFee[${fees.withdraw}]`,
          `platformFee[${fees.platform}]`,
          `harvestBounty[${fees.harvest}]`
        );
      }
    }
    firstCall = false;
  });

  context("fraxusdc pool", async () => {
    const pid = 15;

    context("deposit", async () => {
      beforeEach(async () => {});

      it("should succeed, when deposit with FRAX", async () => {
        const amountIn = ethers.utils.parseEther("10000");
        const sharesOut = ethers.utils.parseEther("9993.399921323965251372");
        const signer = await ethers.getSigner(FRAX_HOLDER);
        const frax = await ethers.getContractAt("IERC20", FRAX, signer);
        await frax.approve(vault.address, constants.MaxUint256);
        const shares = await vault
          .connect(signer)
          .callStatic["zapAndDeposit(uint256,address,uint256,uint256)"](pid, frax.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer)["zapAndDeposit(uint256,address,uint256,uint256)"](pid, frax.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with USDC", async () => {
        const amountIn = ethers.utils.parseUnits("10000", 6);
        const sharesOut = ethers.utils.parseEther("9996.805358174515770056");
        const signer = await ethers.getSigner(USDC_HOLDER);
        const usdc = await ethers.getContractAt("IERC20", USDC, signer);
        await usdc.approve(vault.address, constants.MaxUint256);
        const shares = await vault
          .connect(signer)
          .callStatic["zapAndDeposit(uint256,address,uint256,uint256)"](pid, usdc.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer)["zapAndDeposit(uint256,address,uint256,uint256)"](pid, usdc.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with ETH", async () => {
        const amountIn = ethers.utils.parseUnits("100", 18);
        const sharesOut = ethers.utils.parseEther("105352.224338199691082856");
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
        const sharesOut = ethers.utils.parseEther("105352.224338199691082856");
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
        signer = await ethers.getSigner(CURVE_FRAXUSDC_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });
        const susdcrv = await ethers.getContractAt("IERC20", CURVE_FRAXUSDC_TOKEN, signer);
        await susdcrv.approve(vault.address, constants.MaxUint256);
        await vault
          .connect(signer)
          ["zapAndDeposit(uint256,address,uint256,uint256)"](
            pid,
            CURVE_FRAXUSDC_TOKEN,
            ethers.utils.parseEther("100"),
            0
          );
      });

      it("should succeed, when harvest", async () => {
        await booster.earmarkRewards(4);
        const amount = await vault.callStatic.harvest(pid, signer.address, 0);
        await vault.harvest(pid, signer.address, 0);
        console.log("rewards", amount.toString());
        expect(await ethers.provider.getBalance(vault.address)).to.eq(constants.Zero);
      });

      it("should succeed, when withdraw to lp Token", async () => {
        const amountOut = ethers.utils.parseUnits("100", 18);
        const susdcrv = await ethers.getContractAt("IERC20", CURVE_FRAXUSDC_TOKEN);
        const before = await susdcrv.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, CURVE_FRAXUSDC_TOKEN, amountOut);
        const after = await susdcrv.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });
    });
  });
});

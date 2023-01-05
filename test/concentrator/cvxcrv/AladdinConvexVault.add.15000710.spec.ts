/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { ADDRESS, AVAILABLE_VAULTS, DEPLOYED_VAULTS, ZAP_ROUTES } from "../../../scripts/utils";
import { AladdinCRVConvexVault, IConvexBooster } from "../../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../../utils";

const FORK_BLOCK_NUMBER = 15000710;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const PROXY_ADMIN = "0x12b1326459d72F2Ab081116bf27ca46cD97762A0";
const VAULT = "0xc8fF37F7d057dF1BB9Ad681b53Fa4726f268E0e8";
const OWNER = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const ZAP = "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a";
const ZAP_OWNER = "0x28c921adAC4c1072658eB01a28DA06b5F651eF62";

// pid = 12
const CURVE_sUSD_TOKEN = ADDRESS.CURVE_sUSD_TOKEN;
const CURVE_sUSD_POOL = ADDRESS.CURVE_sUSD_POOL;
const CURVE_sUSD_DEPOSIT = ADDRESS.CURVE_sUSD_DEPOSIT;
const CURVE_sUSD_HOLDER = "0xa2747b3135e7b3c7af80d5b76f4d15385ae33def";
// pid = 13
const CURVE_SBTC_TOKEN = ADDRESS.CURVE_SBTC_TOKEN;
const CURVE_SBTC_POOL = ADDRESS.CURVE_SBTC_POOL;
const CURVE_SBTC_HOLDER = "0x5ec3f59397498cee61d71399d15458ecc171b783";
// pid = 14
const CURVE_SETH_TOKEN = ADDRESS.CURVE_SETH_TOKEN;
const CURVE_SETH_POOL = ADDRESS.CURVE_SETH_POOL;
const CURVE_SETH_HOLDER = "0x781814773609d820ab3fff2f21624d93e9b4784a";

const WETH = ADDRESS.WETH;
const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const USDC = ADDRESS.USDC;
const USDC_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const DAI = ADDRESS.DAI;
const DAI_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const USDT = ADDRESS.USDT;
const USDT_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const sUSD = ADDRESS.sUSD;
const sUSD_HOLDER = "0x27cc4d6bc95b55a3a981bf1f1c7261cda7bb0931";

const renBTC = ADDRESS.renBTC;
const renBTC_HOLDER = "0x593c427d8c7bf5c555ed41cd7cb7cce8c9f15bb5";
const WBTC = ADDRESS.WBTC;
const WBTC_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const sBTC = ADDRESS.sBTC;
const sBTC_HOLDER = "0x70be8010b63ce50cf29450aec2c9881838234651";

const sETH = ADDRESS.sETH;
const sETH_HOLDER = "0x8291b6c7a043b19f200bad4ffc96ccb3a78caa94";

let firstCall = true;

describe("VaultZapMainnetFork.spec", async () => {
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
      USDC_HOLDER,
      sUSD_HOLDER,
      renBTC_HOLDER,
      WBTC_HOLDER,
      sBTC_HOLDER,
      sETH_HOLDER,
      CURVE_sUSD_HOLDER,
      CURVE_SBTC_HOLDER,
      CURVE_SETH_HOLDER,
    ]);
    deployer = await ethers.getSigner(DEPLOYER);
    owner = await ethers.getSigner(OWNER);
    const zapOwner = await ethers.getSigner(ZAP_OWNER);

    await deployer.sendTransaction({ to: owner.address, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: zapOwner.address, value: ethers.utils.parseEther("10") });

    booster = await ethers.getContractAt("IConvexBooster", BOOSTER, deployer);
    vault = await ethers.getContractAt("AladdinCRVConvexVault", VAULT, owner);

    const proxyAdmin = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN, owner);
    const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
    const impl = await AladdinZap.deploy();
    await proxyAdmin.upgrade(ZAP, impl.address);

    const zap = await ethers.getContractAt("AladdinZap", ZAP, zapOwner);
    for (const pool of ["susd", "sbtc", "seth"]) {
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
    const routes = ZAP_ROUTES.SNX.WETH;
    if (firstCall) {
      console.log(`SNX to WETH zap:`, `from[${ADDRESS.SNX}]`, `to[${ADDRESS.WETH}]`, `routes[${routes.toString()}]`);
    }
    await zap.updateRoute(ADDRESS.SNX, ADDRESS.WETH, routes);
    if (firstCall) {
      console.log(
        `updatePoolTokens: pools[${CURVE_sUSD_POOL}, ${CURVE_SBTC_POOL}, ${CURVE_SETH_POOL}] tokens[${CURVE_sUSD_TOKEN},${CURVE_SBTC_TOKEN},${CURVE_SETH_TOKEN}]`
      );
    }
    await zap.updatePoolTokens(
      [CURVE_sUSD_DEPOSIT, CURVE_sUSD_POOL, CURVE_SBTC_POOL, CURVE_SETH_POOL],
      [CURVE_sUSD_TOKEN, CURVE_sUSD_TOKEN, CURVE_SBTC_TOKEN, CURVE_SETH_TOKEN]
    );

    for (let index = 12; index <= 14; index++) {
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

  context("susd pool", async () => {
    const pid = 12;

    context("deposit", async () => {
      beforeEach(async () => {});

      it("should succeed, when deposit with sUSD", async () => {
        const amountIn = ethers.utils.parseEther("10000");
        const sharesOut = ethers.utils.parseEther("9540.751251271567272728");
        const signer = await ethers.getSigner(sUSD_HOLDER);
        const susd = await ethers.getContractAt("IERC20", sUSD, signer);
        await susd.approve(vault.address, constants.MaxUint256);
        const shares = await vault
          .connect(signer)
          .callStatic["zapAndDeposit(uint256,address,uint256,uint256)"](pid, susd.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer)["zapAndDeposit(uint256,address,uint256,uint256)"](pid, susd.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with DAI", async () => {
        const amountIn = ethers.utils.parseEther("10000");
        const sharesOut = ethers.utils.parseEther("9513.975959124517197407");
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
        const sharesOut = ethers.utils.parseEther("9515.674974830597911239");
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
        const sharesOut = ethers.utils.parseEther("9500.462258297561201281");
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
        const sharesOut = ethers.utils.parseEther("107276.129916408674568582");
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
        const sharesOut = ethers.utils.parseEther("107276.129916408674568582");
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
        signer = await ethers.getSigner(CURVE_sUSD_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });
        const susdcrv = await ethers.getContractAt("IERC20", CURVE_sUSD_TOKEN, signer);
        await susdcrv.approve(vault.address, constants.MaxUint256);
        await vault
          .connect(signer)
          ["zapAndDeposit(uint256,address,uint256,uint256)"](
            pid,
            CURVE_sUSD_TOKEN,
            ethers.utils.parseEther("10000"),
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
        const amountOut = ethers.utils.parseUnits("10000", 18);
        const susdcrv = await ethers.getContractAt("IERC20", CURVE_sUSD_TOKEN);
        const before = await susdcrv.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, CURVE_sUSD_TOKEN, amountOut);
        const after = await susdcrv.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });
    });
  });

  context("sbtc pool", async () => {
    const pid = 13;

    context("deposit", async () => {
      beforeEach(async () => {});

      it("should succeed, when deposit with sBTC", async () => {
        const amountIn = ethers.utils.parseEther("1");
        const sharesOut = ethers.utils.parseEther("0.988722089909926583");
        const signer = await ethers.getSigner(sBTC_HOLDER);
        const sbtc = await ethers.getContractAt("IERC20", sBTC, signer);
        await sbtc.approve(vault.address, constants.MaxUint256);
        const shares = await vault
          .connect(signer)
          .callStatic["zapAndDeposit(uint256,address,uint256,uint256)"](pid, sbtc.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer)["zapAndDeposit(uint256,address,uint256,uint256)"](pid, sbtc.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with WBTC", async () => {
        const amountIn = ethers.utils.parseUnits("1", 8);
        const sharesOut = ethers.utils.parseEther("0.987848555260277719");
        const signer = await ethers.getSigner(WBTC_HOLDER);
        const wbtc = await ethers.getContractAt("IERC20", WBTC, signer);
        await wbtc.approve(vault.address, constants.MaxUint256);
        const shares = await vault
          .connect(signer)
          .callStatic["zapAndDeposit(uint256,address,uint256,uint256)"](pid, wbtc.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer)["zapAndDeposit(uint256,address,uint256,uint256)"](pid, wbtc.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with USDC", async () => {
        const amountIn = ethers.utils.parseUnits("10000", 6);
        const sharesOut = ethers.utils.parseEther("0.475648046942155371");
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

      it("should succeed, when deposit with renBTC", async () => {
        const amountIn = ethers.utils.parseUnits("1", 8);
        const sharesOut = ethers.utils.parseEther("0.986507891778892091");
        const signer = await ethers.getSigner(renBTC_HOLDER);
        const renbtc = await ethers.getContractAt("IERC20", renBTC, signer);
        await renbtc.approve(vault.address, constants.MaxUint256);
        const shares = await vault
          .connect(signer)
          .callStatic["zapAndDeposit(uint256,address,uint256,uint256)"](pid, renbtc.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer)["zapAndDeposit(uint256,address,uint256,uint256)"](pid, renbtc.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with ETH", async () => {
        const amountIn = ethers.utils.parseUnits("100", 18);
        const sharesOut = ethers.utils.parseEther("5.383686082210396459");
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
        const sharesOut = ethers.utils.parseEther("5.383686082210396459");
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
        signer = await ethers.getSigner(CURVE_SBTC_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });
        const token = await ethers.getContractAt("IERC20", CURVE_SBTC_TOKEN, signer);
        await token.approve(vault.address, constants.MaxUint256);
        await vault
          .connect(signer)
          ["zapAndDeposit(uint256,address,uint256,uint256)"](pid, CURVE_SBTC_TOKEN, ethers.utils.parseEther("1"), 0);
      });

      it("should succeed, when harvest", async () => {
        await booster.earmarkRewards(4);
        const amount = await vault.callStatic.harvest(pid, signer.address, 0);
        await vault.harvest(pid, signer.address, 0);
        console.log("rewards", amount.toString());
        expect(await ethers.provider.getBalance(vault.address)).to.eq(constants.Zero);
      });

      it("should succeed, when withdraw to lp Token", async () => {
        const amountOut = ethers.utils.parseUnits("1", 18);
        const sbtccrv = await ethers.getContractAt("IERC20", CURVE_SBTC_TOKEN);
        const before = await sbtccrv.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, CURVE_SBTC_TOKEN, amountOut);
        const after = await sbtccrv.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });
    });
  });

  context("seth pool", async () => {
    const pid = 14;

    context("deposit", async () => {
      beforeEach(async () => {});

      it("should succeed, when deposit with sETH", async () => {
        const amountIn = ethers.utils.parseEther("1");
        const sharesOut = ethers.utils.parseEther("0.989316697852911616");
        const signer = await ethers.getSigner(sETH_HOLDER);
        const seth = await ethers.getContractAt("IERC20", sETH, signer);
        await seth.approve(vault.address, constants.MaxUint256);
        const shares = await vault
          .connect(signer)
          .callStatic["zapAndDeposit(uint256,address,uint256,uint256)"](pid, seth.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer)["zapAndDeposit(uint256,address,uint256,uint256)"](pid, seth.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with USDC", async () => {
        const amountIn = ethers.utils.parseUnits("10000", 6);
        const sharesOut = ethers.utils.parseEther("8.722221879868112790");
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

      it("should succeed, when deposit with ETH", async () => {
        const amountIn = ethers.utils.parseUnits("100", 18);
        const sharesOut = ethers.utils.parseEther("98.831251624614452730");
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
        const sharesOut = ethers.utils.parseEther("98.831251624614452730");
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
        signer = await ethers.getSigner(CURVE_SETH_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });
        const token = await ethers.getContractAt("IERC20", CURVE_SETH_TOKEN, signer);
        await token.approve(vault.address, constants.MaxUint256);
        await vault
          .connect(signer)
          ["zapAndDeposit(uint256,address,uint256,uint256)"](pid, CURVE_SETH_TOKEN, ethers.utils.parseEther("1"), 0);
      });

      it("should succeed, when harvest", async () => {
        await booster.earmarkRewards(4);
        const amount = await vault.callStatic.harvest(pid, signer.address, 0);
        await vault.harvest(pid, signer.address, 0);
        console.log("rewards", amount.toString());
        expect(await ethers.provider.getBalance(vault.address)).to.eq(constants.Zero);
      });

      it("should succeed, when withdraw to lp Token", async () => {
        const amountOut = ethers.utils.parseUnits("1", 18);
        const sethcrv = await ethers.getContractAt("IERC20", CURVE_SETH_TOKEN);
        const before = await sethcrv.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, CURVE_SETH_TOKEN, amountOut);
        const after = await sethcrv.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });
    });
  });
});

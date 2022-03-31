/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { AladdinConvexVault, IConvexBooster } from "../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "./utils";

const FORK_BLOCK_NUMBER = 14491915;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const PROXY_ADMIN = "0x12b1326459d72F2Ab081116bf27ca46cD97762A0";
const VAULT = "0xc8fF37F7d057dF1BB9Ad681b53Fa4726f268E0e8";
const OWNER = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const ZAP = "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a";

// pid = 0
const CURVE_STETH_TOKEN = "0x06325440D014e39736583c165C2963BA99fAf14E";
const CURVE_STETH_HOLDER = "0x56c915758Ad3f76Fd287FFF7563ee313142Fb663";
// pid = 1
const CURVE_FRAX3CRV_TOKEN = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B";
const CURVE_FRAX3CRV_HOLDER = "0x47Bc10781E8f71c0e7cf97B0a5a88F4CFfF21309";
// pid = 2
const CURVE_TRICRYPTO_TOKEN = "0xc4AD29ba4B3c580e6D59105FFf484999997675Ff";
const CURVE_TRICRYPTO_HOLDER = "0x7Ac249dbf24a0234986C0FE0577556426966c2C1";
// pid = 3
const CURVE_CVXCRV_TOKEN = "0x9D0464996170c6B9e75eED71c68B99dDEDf279e8";
const CURVE_CVXCRV_HOLDER = "0x52Ad87832400485DE7E7dC965D8Ad890f4e82699";
// pid = 4
const CURVE_CRVETH_TOKEN = "0xEd4064f376cB8d68F770FB1Ff088a3d0F3FF5c4d";
const CURVE_CRVETH_HOLDER = "0x279a7DBFaE376427FFac52fcb0883147D42165FF";
// pid = 5
const CURVE_CVXETH_TOKEN = "0x3A283D9c08E8b55966afb64C515f5143cf907611";
const CURVE_CVXETH_HOLDER = "0x38eE5F5A39c01cB43473992C12936ba1219711ab";
// pid = 6
const CURVE_CVXFXS_TOKEN = "0xF3A43307DcAFa93275993862Aae628fCB50dC768";
const CURVE_CVXFXS_HOLDER = "0xdc88d12721F9cA1404e9e6E6389aE0AbDd54fc6C";
// pid = 7
const CURVE_TRICRV_TOKEN = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
const CURVE_TRICRV_HOLDER = "0x5c00977a2002a3C9925dFDfb6815765F578a804f";
// pid = 8
const CURVE_UST_WORMHOLE_TOKEN = "0xCEAF7747579696A2F0bb206a14210e3c9e6fB269";
const CURVE_UST_WORMHOLE_HOLDER = "0xd4A39d219ADB43aB00739DC5D876D98Fdf0121Bf";
// pid = 9
const CURVE_ROCKETETH_TOKEN = "0x447Ddd4960d9fdBF6af9a790560d0AF76795CB08";
const CURVE_ROCKETETH_HOLDER = "0x28AC885d3D8b30BD5733151C732C5f01E18847AA";

const STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const STETH_HOLDER = "0x06920C9fC643De77B99cB7670A944AD31eaAA260";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const FRAX = "0x853d955aCEf822Db058eb8505911ED77F175b99e";
const FRAX_HOLDER = "0x10c6b61DbF44a083Aec3780aCF769C77BE747E23";
const TRICRV = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
const TRICRV_HOLDER = "0x5c00977a2002a3C9925dFDfb6815765F578a804f";
const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const DAI_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDT_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const WBTC_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const FXS = "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0";
const FXS_HOLDER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const CVXFXS = "0xFEEf77d3f69374f66429C91d732A244f074bdf74";
const CVXFXS_HOLDER = "0x5028D77B91a3754fb38B2FBB726AF02d1FE44Db6";
const CRV = "0xD533a949740bb3306d119CC777fa900bA034cd52";
const CRV_HOLDER = "0x7a16fF8270133F063aAb6C9977183D9e72835428";
const CVXCRV = "0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7";
const CVXCRV_HOLDER = "0x2612A04a4aa6f440AB32c63dBEd46cF06b0C3329";
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const CVX_HOLDER = "0x28C6c06298d514Db089934071355E5743bf21d60";
const rETH = "0xae78736Cd615f374D3085123A210448E74Fc6393";
const rETH_HOLDER = "0xEADB3840596cabF312F2bC88A4Bb0b93A4E1FF5F";
const wstETH = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";
const wstETH_HOLDER = "0x3991ADBDf461D6817734555efDC8ef056fEfBF21";
const UST_WORMHOLE = "0xa693B19d2931d498c5B318dF961919BB4aee87a5";
const UST_WORMHOLE_HOLDER = "0x54195F35c93E7CD74fA5345c179fD06223Cd9eDB";

describe("VaultZapMainnetFork.spec", async () => {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let vault: AladdinConvexVault;
  let booster: IConvexBooster;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [
      DEPLOYER,
      OWNER,
      STETH_HOLDER,
      WETH_HOLDER,
      FRAX_HOLDER,
      TRICRV_HOLDER,
      DAI_HOLDER,
      USDC_HOLDER,
      USDT_HOLDER,
      WBTC_HOLDER,
      FXS_HOLDER,
      CVXFXS_HOLDER,
      CRV_HOLDER,
      CVXCRV_HOLDER,
      CVX_HOLDER,
      CURVE_STETH_HOLDER,
      CURVE_FRAX3CRV_HOLDER,
      CURVE_TRICRYPTO_HOLDER,
      CURVE_CVXCRV_HOLDER,
      CURVE_CRVETH_HOLDER,
      CURVE_CVXETH_HOLDER,
      CURVE_TRICRV_HOLDER,
      CURVE_CVXFXS_HOLDER,
      CURVE_ROCKETETH_HOLDER,
      CURVE_UST_WORMHOLE_HOLDER,
      rETH_HOLDER,
      wstETH_HOLDER,
      UST_WORMHOLE_HOLDER,
    ]);
    deployer = await ethers.getSigner(DEPLOYER);
    owner = await ethers.getSigner(OWNER);

    await deployer.sendTransaction({ to: owner.address, value: ethers.utils.parseEther("100") });

    vault = await ethers.getContractAt("AladdinConvexVault", VAULT, owner);

    const proxyAdmin = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN, owner);

    const AladdinConvexVault = await ethers.getContractFactory("AladdinConvexVault", deployer);
    const impl = await AladdinConvexVault.deploy();
    await impl.deployed();

    await proxyAdmin.upgrade(vault.address, impl.address);

    booster = await ethers.getContractAt("IConvexBooster", BOOSTER, deployer);

    await vault.updateZap(ZAP);
  });

  context("steth", async () => {
    const pid = 0;

    context("deposit", async () => {
      beforeEach(async () => {});

      it("should succeed, when deposit with weth", async () => {
        const amountIn = ethers.utils.parseEther("1");
        const sharesOut = ethers.utils.parseEther("0.964151624903576922");
        const signer = await ethers.getSigner(WETH_HOLDER);
        const weth = await ethers.getContractAt("IERC20", WETH, signer);
        await weth.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, weth.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, weth.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with eth", async () => {
        const amountIn = ethers.utils.parseEther("1");
        const sharesOut = ethers.utils.parseEther("0.964151624903576922");
        const signer = await ethers.getSigner(WETH_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: amountIn });
        const shares = await vault
          .connect(signer)
          .callStatic.zapAndDeposit(pid, constants.AddressZero, amountIn, 0, { value: amountIn });
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, constants.AddressZero, amountIn, 0, { value: amountIn });
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with steth", async () => {
        const amountIn = ethers.utils.parseEther("1");
        const sharesOut = ethers.utils.parseEther("0.964518120425321488");
        const signer = await ethers.getSigner(STETH_HOLDER);
        const steth = await ethers.getContractAt("IERC20", STETH, signer);
        await steth.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, steth.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, steth.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });
    });

    context("withdraw", async () => {
      let signer: SignerWithAddress;

      beforeEach(async () => {
        signer = await ethers.getSigner(CURVE_STETH_HOLDER);
        const stecrv = await ethers.getContractAt("IERC20", CURVE_STETH_TOKEN, signer);
        await stecrv.approve(vault.address, constants.MaxUint256);
        await vault.connect(signer).zapAndDeposit(pid, CURVE_STETH_TOKEN, ethers.utils.parseEther("10"), 0);
      });

      it("should succeed, when harvest", async () => {
        await booster.earmarkRewards(25);
        const amount = await vault.callStatic.harvest(pid, signer.address, 0);
        await vault.harvest(pid, signer.address, 0);
        console.log("rewards", amount.toString());
        expect(await ethers.provider.getBalance(vault.address)).to.eq(constants.Zero);
      });

      it("should succeed, when withdraw to STETH", async () => {
        const amountOut = ethers.utils.parseUnits("10.358502440977633236", 18);
        const steth = await ethers.getContractAt("IERC20", STETH);
        const before = await steth.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, STETH, amountOut);
        const after = await steth.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to WETH", async () => {
        const amountOut = ethers.utils.parseUnits("10.362519529496448478", 18);
        const weth = await ethers.getContractAt("IERC20", WETH);
        const before = await weth.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, WETH, amountOut);
        const after = await weth.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to ETH", async () => {
        const amountOut = ethers.utils.parseUnits("10.362519529496448478", 18);
        const before = await signer.getBalance();
        const tx = await vault.connect(signer).withdrawAllAndZap(pid, constants.AddressZero, amountOut);
        const receipt = await tx.wait();
        const after = await signer.getBalance();
        expect(after.sub(before)).to.eq(amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)));
      });
    });
  });

  context("frax", async () => {
    const pid = 1;

    context("deposit", async () => {
      beforeEach(async () => {});

      it("should succeed, when deposit with frax", async () => {
        const amountIn = ethers.utils.parseEther("10000");
        const sharesOut = ethers.utils.parseEther("9923.360564724282919765");
        const signer = await ethers.getSigner(FRAX_HOLDER);
        const frax = await ethers.getContractAt("IERC20", FRAX, signer);
        await frax.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, frax.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, frax.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with 3crv", async () => {
        const amountIn = ethers.utils.parseEther("10000");
        const sharesOut = ethers.utils.parseEther("10129.123695390050417049");
        const signer = await ethers.getSigner(TRICRV_HOLDER);
        const tricrv = await ethers.getContractAt("IERC20", TRICRV, signer);
        await tricrv.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, tricrv.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, tricrv.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with DAI", async () => {
        const amountIn = ethers.utils.parseEther("10000");
        const sharesOut = ethers.utils.parseEther("9922.332583288178720505");
        const signer = await ethers.getSigner(DAI_HOLDER);
        const dai = await ethers.getContractAt("IERC20", DAI, signer);
        await dai.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, dai.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, dai.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with USDC", async () => {
        const amountIn = ethers.utils.parseUnits("10000", 6);
        const sharesOut = ethers.utils.parseEther("9922.388289254033526392");
        const signer = await ethers.getSigner(DAI_HOLDER);
        const usdc = await ethers.getContractAt("IERC20", USDC, signer);
        await usdc.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, usdc.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, usdc.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with USDT", async () => {
        const amountIn = ethers.utils.parseUnits("10000", 6);
        const sharesOut = ethers.utils.parseEther("9927.448913647562678108");
        const signer = await ethers.getSigner(USDT_HOLDER);
        const usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await usdt.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, usdt.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, usdt.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });
    });

    context("withdraw", async () => {
      let signer: SignerWithAddress;

      beforeEach(async () => {
        signer = await ethers.getSigner(CURVE_FRAX3CRV_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });
        const frax3crv = await ethers.getContractAt("IERC20", CURVE_FRAX3CRV_TOKEN, signer);
        await frax3crv.approve(vault.address, constants.MaxUint256);
        await vault.connect(signer).zapAndDeposit(pid, CURVE_FRAX3CRV_TOKEN, ethers.utils.parseEther("10000"), 0);
      });

      it("should succeed, when harvest", async () => {
        await booster.earmarkRewards(32);
        const amount = await vault.callStatic.harvest(pid, signer.address, 0);
        await vault.harvest(pid, signer.address, 0);
        console.log("rewards", amount.toString());
        expect(await ethers.provider.getBalance(vault.address)).to.eq(constants.Zero);
      });

      it("should succeed, when withdraw to FRAX", async () => {
        const amountOut = ethers.utils.parseUnits("10068.717150752530641256", 18);
        const frax = await ethers.getContractAt("IERC20", FRAX);
        const before = await frax.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, FRAX, amountOut);
        const after = await frax.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to 3CRV", async () => {
        const amountOut = ethers.utils.parseUnits("9863.097727649366559293", 18);
        const tricrv = await ethers.getContractAt("IERC20", TRICRV);
        const before = await tricrv.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, TRICRV, amountOut);
        const after = await tricrv.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to DAI", async () => {
        const amountOut = ethers.utils.parseUnits("10066.144800327090598955", 18);
        const dai = await ethers.getContractAt("IERC20", DAI);
        const before = await dai.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, DAI, amountOut);
        const after = await dai.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to USDC", async () => {
        const amountOut = ethers.utils.parseUnits("10066.007119", 6);
        const usdc = await ethers.getContractAt("IERC20", USDC);
        const before = await usdc.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, USDC, amountOut);
        const after = await usdc.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to USDT", async () => {
        const amountOut = ethers.utils.parseUnits("10059.506158", 6);
        const usdt = await ethers.getContractAt("IERC20", USDT);
        const before = await usdt.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, USDT, amountOut);
        const after = await usdt.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });
    });
  });

  context("tricrypto2", async () => {
    const pid = 2;

    context("deposit", async () => {
      beforeEach(async () => {});

      it("should succeed, when deposit with USDT", async () => {
        const amountIn = ethers.utils.parseUnits("30000", 6);
        const sharesOut = ethers.utils.parseEther("18.249803074116555212");
        const signer = await ethers.getSigner(USDT_HOLDER);
        const usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await usdt.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, usdt.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, usdt.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with WBTC", async () => {
        const amountIn = ethers.utils.parseUnits("1", 8);
        const sharesOut = ethers.utils.parseEther("28.622213138426384158");
        const signer = await ethers.getSigner(WBTC_HOLDER);
        const wbtc = await ethers.getContractAt("IERC20", WBTC, signer);
        await wbtc.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, wbtc.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, wbtc.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with WETH", async () => {
        const amountIn = ethers.utils.parseUnits("10", 18);
        const sharesOut = ethers.utils.parseEther("20.637415289059109666");
        const signer = await ethers.getSigner(WETH_HOLDER);
        const weth = await ethers.getContractAt("IERC20", WETH, signer);
        await weth.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, weth.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, weth.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with eth", async () => {
        const amountIn = ethers.utils.parseUnits("10", 18);
        const sharesOut = ethers.utils.parseEther("20.637415289059109666");
        const signer = await ethers.getSigner(WETH_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: amountIn });
        const shares = await vault
          .connect(signer)
          .callStatic.zapAndDeposit(pid, constants.AddressZero, amountIn, 0, { value: amountIn });
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, constants.AddressZero, amountIn, 0, { value: amountIn });
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });
    });

    context("withdraw", async () => {
      let signer: SignerWithAddress;

      beforeEach(async () => {
        signer = await ethers.getSigner(CURVE_TRICRYPTO_HOLDER);
        const tricrypto = await ethers.getContractAt("IERC20", CURVE_TRICRYPTO_TOKEN, signer);
        await tricrypto.approve(vault.address, constants.MaxUint256);
        await vault.connect(signer).zapAndDeposit(pid, CURVE_TRICRYPTO_TOKEN, ethers.utils.parseEther("10"), 0);
      });

      it("should succeed, when harvest", async () => {
        await booster.earmarkRewards(38);
        const amount = await vault.callStatic.harvest(pid, signer.address, 0);
        await vault.harvest(pid, signer.address, 0);
        console.log("rewards", amount.toString());
        expect(await ethers.provider.getBalance(vault.address)).to.eq(constants.Zero);
      });

      it("should succeed, when withdraw to USDT", async () => {
        const amountOut = ethers.utils.parseUnits("16411.397064", 6);
        const usdt = await ethers.getContractAt("IERC20", USDT);
        const before = await usdt.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, USDT, amountOut);
        const after = await usdt.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to WBTC", async () => {
        const amountOut = ethers.utils.parseUnits("0.34880701", 8);
        const wbtc = await ethers.getContractAt("IERC20", WBTC);
        const before = await wbtc.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, WBTC, amountOut);
        const after = await wbtc.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to WETH", async () => {
        const amountOut = ethers.utils.parseUnits("4.837558854243448108", 18);
        const weth = await ethers.getContractAt("IERC20", WETH);
        const before = await weth.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, WETH, amountOut);
        const after = await weth.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to ETH", async () => {
        const amountOut = ethers.utils.parseUnits("4.837558854243448108", 18);
        const before = await signer.getBalance();
        const tx = await vault.connect(signer).withdrawAllAndZap(pid, constants.AddressZero, amountOut);
        const receipt = await tx.wait();
        const after = await signer.getBalance();
        expect(after.sub(before)).to.eq(amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)));
      });
    });
  });

  context("cvxcrv", async () => {
    const pid = 3;

    context("deposit", async () => {
      beforeEach(async () => {});

      it("should succeed, when deposit with CRV", async () => {
        const amountIn = ethers.utils.parseUnits("100", 18);
        const sharesOut = ethers.utils.parseEther("99.585424506740621465");
        const signer = await ethers.getSigner(CRV_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const crv = await ethers.getContractAt("IERC20", CRV, signer);
        await crv.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, crv.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, crv.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with CVXCRV", async () => {
        const amountIn = ethers.utils.parseUnits("100", 18);
        const sharesOut = ethers.utils.parseEther("98.413465914326402663");
        const signer = await ethers.getSigner(CVXCRV_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const cvxcrv = await ethers.getContractAt("IERC20", CVXCRV, signer);
        await cvxcrv.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, cvxcrv.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, cvxcrv.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });
    });

    context("withdraw", async () => {
      let signer: SignerWithAddress;

      beforeEach(async () => {
        signer = await ethers.getSigner(CURVE_CVXCRV_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const cvxcrv = await ethers.getContractAt("IERC20", CURVE_CVXCRV_TOKEN, signer);
        await cvxcrv.approve(vault.address, constants.MaxUint256);
        await vault.connect(signer).zapAndDeposit(pid, CURVE_CVXCRV_TOKEN, ethers.utils.parseEther("100"), 0);
      });

      it("should succeed, when harvest", async () => {
        await booster.earmarkRewards(41);
        const amount = await vault.callStatic.harvest(pid, signer.address, 0);
        await vault.harvest(pid, signer.address, 0);
        console.log("rewards", amount.toString());
        expect(await ethers.provider.getBalance(vault.address)).to.eq(constants.Zero);
      });

      it("should succeed, when withdraw to CRV", async () => {
        const amountOut = ethers.utils.parseUnits("99.891639357932588068", 18);
        const crv = await ethers.getContractAt("IERC20", CRV);
        const before = await crv.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, CRV, amountOut);
        const after = await crv.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to CVXCRV", async () => {
        const amountOut = ethers.utils.parseUnits("101.161361152676576277", 18);
        const cvxcrv = await ethers.getContractAt("IERC20", CVXCRV);
        const before = await cvxcrv.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, CVXCRV, amountOut);
        const after = await cvxcrv.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });
    });
  });

  context("crveth", async () => {
    const pid = 4;

    context("deposit", async () => {
      beforeEach(async () => {});

      it("should succeed, when deposit with CRV", async () => {
        const amountIn = ethers.utils.parseUnits("100", 18);
        const sharesOut = ethers.utils.parseEther("1.442142221475370469");
        const signer = await ethers.getSigner(CRV_HOLDER);
        const crv = await ethers.getContractAt("IERC20", CRV, signer);
        await crv.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, crv.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, crv.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with WETH", async () => {
        const amountIn = ethers.utils.parseUnits("10", 18);
        const sharesOut = ethers.utils.parseEther("168.058703203334194681");
        const signer = await ethers.getSigner(WETH_HOLDER);
        const weth = await ethers.getContractAt("IERC20", WETH, signer);
        await weth.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, weth.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, weth.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with eth", async () => {
        const amountIn = ethers.utils.parseUnits("10", 18);
        const sharesOut = ethers.utils.parseEther("168.058703203334194681");
        const signer = await ethers.getSigner(WETH_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: amountIn });
        const shares = await vault
          .connect(signer)
          .callStatic.zapAndDeposit(pid, constants.AddressZero, amountIn, 0, { value: amountIn });
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, constants.AddressZero, amountIn, 0, { value: amountIn });
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });
    });

    context("withdraw", async () => {
      let signer: SignerWithAddress;

      beforeEach(async () => {
        signer = await ethers.getSigner(CURVE_CRVETH_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const crveth = await ethers.getContractAt("IERC20", CURVE_CRVETH_TOKEN, signer);
        await crveth.approve(vault.address, constants.MaxUint256);
        await vault.connect(signer).zapAndDeposit(pid, CURVE_CRVETH_TOKEN, ethers.utils.parseEther("100"), 0);
      });

      it("should succeed, when harvest", async () => {
        await booster.earmarkRewards(61);
        const amount = await vault.callStatic.harvest(pid, signer.address, 0);
        await vault.harvest(pid, signer.address, 0);
        console.log("rewards", amount.toString());
        expect(await ethers.provider.getBalance(vault.address)).to.eq(constants.Zero);
      });

      it("should succeed, when withdraw to CRV", async () => {
        const amountOut = ethers.utils.parseUnits("6869.873002818578011141", 18);
        const crv = await ethers.getContractAt("IERC20", CRV);
        const before = await crv.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, CRV, amountOut);
        const after = await crv.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to WETH", async () => {
        const amountOut = ethers.utils.parseUnits("5.894667371388433148", 18);
        const weth = await ethers.getContractAt("IERC20", WETH);
        const before = await weth.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, WETH, amountOut);
        const after = await weth.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to ETH", async () => {
        const amountOut = ethers.utils.parseUnits("5.894667371388433148", 18);
        const before = await signer.getBalance();
        const tx = await vault.connect(signer).withdrawAllAndZap(pid, constants.AddressZero, amountOut);
        const receipt = await tx.wait();
        const after = await signer.getBalance();
        expect(after.sub(before)).to.eq(amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)));
      });
    });
  });

  context("cvxeth", async () => {
    const pid = 5;

    context("deposit", async () => {
      beforeEach(async () => {});

      it("should succeed, when deposit with CVX", async () => {
        const amountIn = ethers.utils.parseUnits("100", 18);
        const sharesOut = ethers.utils.parseEther("4.655774004678767301");
        const signer = await ethers.getSigner(CVX_HOLDER);
        const cvx = await ethers.getContractAt("IERC20", CVX, signer);
        await cvx.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, cvx.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, cvx.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with WETH", async () => {
        const amountIn = ethers.utils.parseUnits("10", 18);
        const sharesOut = ethers.utils.parseEther("52.666292479247379178");
        const signer = await ethers.getSigner(WETH_HOLDER);
        const weth = await ethers.getContractAt("IERC20", WETH, signer);
        await weth.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, weth.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, weth.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with eth", async () => {
        const amountIn = ethers.utils.parseUnits("10", 18);
        const sharesOut = ethers.utils.parseEther("52.666292479247379178");
        const signer = await ethers.getSigner(WETH_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: amountIn });
        const shares = await vault
          .connect(signer)
          .callStatic.zapAndDeposit(pid, constants.AddressZero, amountIn, 0, { value: amountIn });
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, constants.AddressZero, amountIn, 0, { value: amountIn });
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });
    });

    context("withdraw", async () => {
      let signer: SignerWithAddress;

      beforeEach(async () => {
        signer = await ethers.getSigner(CURVE_CVXETH_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const cvxeth = await ethers.getContractAt("IERC20", CURVE_CVXETH_TOKEN, signer);
        await cvxeth.approve(vault.address, constants.MaxUint256);
        await vault.connect(signer).zapAndDeposit(pid, CURVE_CVXETH_TOKEN, ethers.utils.parseEther("100"), 0);
      });

      it("should succeed, when harvest", async () => {
        await booster.earmarkRewards(64);
        const amount = await vault.callStatic.harvest(pid, signer.address, 0);
        await vault.harvest(pid, signer.address, 0);
        console.log("rewards", amount.toString());
        expect(await ethers.provider.getBalance(vault.address)).to.eq(constants.Zero);
      });

      it("should succeed, when withdraw to CVX", async () => {
        const amountOut = ethers.utils.parseUnits("2133.934682427705920933", 18);
        const crv = await ethers.getContractAt("IERC20", CVX);
        const before = await crv.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, CVX, amountOut);
        const after = await crv.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to WETH", async () => {
        const amountOut = ethers.utils.parseUnits("18.863224141113195714", 18);
        const weth = await ethers.getContractAt("IERC20", WETH);
        const before = await weth.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, WETH, amountOut);
        const after = await weth.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to ETH", async () => {
        const amountOut = ethers.utils.parseUnits("18.863224141113195714", 18);
        const before = await signer.getBalance();
        const tx = await vault.connect(signer).withdrawAllAndZap(pid, constants.AddressZero, amountOut);
        const receipt = await tx.wait();
        const after = await signer.getBalance();
        expect(after.sub(before)).to.eq(amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)));
      });
    });
  });

  context("cvxfxs", async () => {
    const pid = 6;

    context("deposit", async () => {
      beforeEach(async () => {});

      it("should succeed, when deposit with FXS", async () => {
        const amountIn = ethers.utils.parseUnits("100", 18);
        const sharesOut = ethers.utils.parseEther("50.635108396010608014");
        const signer = await ethers.getSigner(FXS_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const fxs = await ethers.getContractAt("IERC20", FXS, signer);
        await fxs.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, fxs.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, fxs.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with CVXFXS", async () => {
        const amountIn = ethers.utils.parseUnits("100", 18);
        const sharesOut = ethers.utils.parseEther("49.017357766945471496");
        const signer = await ethers.getSigner(CVXFXS_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const cvxfxs = await ethers.getContractAt("IERC20", CVXFXS, signer);
        await cvxfxs.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, cvxfxs.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, cvxfxs.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });
    });

    context("withdraw", async () => {
      let signer: SignerWithAddress;

      beforeEach(async () => {
        signer = await ethers.getSigner(CURVE_CVXFXS_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const cvxfxs = await ethers.getContractAt("IERC20", CURVE_CVXFXS_TOKEN, signer);
        await cvxfxs.approve(vault.address, constants.MaxUint256);
        await vault.connect(signer).zapAndDeposit(pid, CURVE_CVXFXS_TOKEN, ethers.utils.parseEther("100"), 0);
      });

      it("should succeed, when harvest", async () => {
        await booster.earmarkRewards(72);
        const amount = await vault.callStatic.harvest(pid, signer.address, 0);
        await vault.harvest(pid, signer.address, 0);
        console.log("rewards", amount.toString());
        expect(await ethers.provider.getBalance(vault.address)).to.eq(constants.Zero);
      });

      it("should succeed, when withdraw to FXS", async () => {
        const amountOut = ethers.utils.parseUnits("196.177549261951424219", 18);
        const fxs = await ethers.getContractAt("IERC20", FXS);
        const before = await fxs.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, FXS, amountOut);
        const after = await fxs.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to CVXFXS", async () => {
        const amountOut = ethers.utils.parseUnits("202.652367022898731731", 18);
        const cvxfxs = await ethers.getContractAt("IERC20", CVXFXS);
        const before = await cvxfxs.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, CVXFXS, amountOut);
        const after = await cvxfxs.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });
    });
  });

  context("3pool", async () => {
    const pid = 7;

    context("deposit", async () => {
      beforeEach(async () => {});

      it("should succeed, when deposit with DAI", async () => {
        const amountIn = ethers.utils.parseEther("10000");
        const sharesOut = ethers.utils.parseEther("9795.845011152845994025");
        const signer = await ethers.getSigner(DAI_HOLDER);
        const dai = await ethers.getContractAt("IERC20", DAI, signer);
        await dai.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, dai.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, dai.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with USDC", async () => {
        const amountIn = ethers.utils.parseUnits("10000", 6);
        const sharesOut = ethers.utils.parseEther("9795.900006958384624112");
        const signer = await ethers.getSigner(DAI_HOLDER);
        const usdc = await ethers.getContractAt("IERC20", USDC, signer);
        await usdc.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, usdc.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, usdc.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with USDT", async () => {
        const amountIn = ethers.utils.parseUnits("10000", 6);
        const sharesOut = ethers.utils.parseEther("9800.896119133889695261");
        const signer = await ethers.getSigner(USDT_HOLDER);
        const usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await usdt.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, usdt.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, usdt.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });
    });

    context("withdraw", async () => {
      let signer: SignerWithAddress;

      beforeEach(async () => {
        signer = await ethers.getSigner(CURVE_TRICRV_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const tricrv = await ethers.getContractAt("IERC20", CURVE_TRICRV_TOKEN, signer);
        await tricrv.approve(vault.address, constants.MaxUint256);
        await vault.connect(signer).zapAndDeposit(pid, CURVE_TRICRV_TOKEN, ethers.utils.parseEther("10000"), 0);
      });

      it("should succeed, when harvest", async () => {
        await booster.earmarkRewards(9);
        const amount = await vault.callStatic.harvest(pid, signer.address, 0);
        await vault.harvest(pid, signer.address, 0);
        console.log("rewards", amount.toString());
        expect(await ethers.provider.getBalance(vault.address)).to.eq(constants.Zero);
      });

      it("should succeed, when withdraw to DAI", async () => {
        const amountOut = ethers.utils.parseUnits("10204.844830384622327171", 18);
        const dai = await ethers.getContractAt("IERC20", DAI);
        const before = await dai.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, DAI, amountOut);
        const after = await dai.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to USDC", async () => {
        const amountOut = ethers.utils.parseUnits("10204.705252", 6);
        const usdc = await ethers.getContractAt("IERC20", USDC);
        const before = await usdc.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, USDC, amountOut);
        const after = await usdc.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to USDT", async () => {
        const amountOut = ethers.utils.parseUnits("10198.114713", 6);
        const usdt = await ethers.getContractAt("IERC20", USDT);
        const before = await usdt.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, USDT, amountOut);
        const after = await usdt.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });
    });
  });

  context("ust", async () => {
    const pid = 8;

    context("deposit", async () => {
      beforeEach(async () => {});

      it("should succeed, when deposit with ust", async () => {
        const amountIn = ethers.utils.parseUnits("10000", 6);
        const sharesOut = ethers.utils.parseEther("9965.932557896626102669");
        const signer = await ethers.getSigner(UST_WORMHOLE_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });
        const ust = await ethers.getContractAt("IERC20", UST_WORMHOLE, signer);
        await ust.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, ust.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, ust.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with 3crv", async () => {
        const amountIn = ethers.utils.parseEther("10000");
        const sharesOut = ethers.utils.parseEther("10170.568717422604447509");
        const signer = await ethers.getSigner(TRICRV_HOLDER);
        const tricrv = await ethers.getContractAt("IERC20", TRICRV, signer);
        await tricrv.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, tricrv.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, tricrv.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with DAI", async () => {
        const amountIn = ethers.utils.parseEther("10000");
        const sharesOut = ethers.utils.parseEther("9962.931487578844740613");
        const signer = await ethers.getSigner(DAI_HOLDER);
        const dai = await ethers.getContractAt("IERC20", DAI, signer);
        await dai.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, dai.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, dai.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with USDC", async () => {
        const amountIn = ethers.utils.parseUnits("10000", 6);
        const sharesOut = ethers.utils.parseEther("9962.987422043870270985");
        const signer = await ethers.getSigner(DAI_HOLDER);
        const usdc = await ethers.getContractAt("IERC20", USDC, signer);
        await usdc.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, usdc.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, usdc.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with USDT", async () => {
        const amountIn = ethers.utils.parseUnits("10000", 6);
        const sharesOut = ethers.utils.parseEther("9968.068752236149645379");
        const signer = await ethers.getSigner(USDT_HOLDER);
        const usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await usdt.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, usdt.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, usdt.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });
    });

    context("withdraw", async () => {
      let signer: SignerWithAddress;

      beforeEach(async () => {
        signer = await ethers.getSigner(CURVE_UST_WORMHOLE_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });
        const ust3crv = await ethers.getContractAt("IERC20", CURVE_UST_WORMHOLE_TOKEN, signer);
        await ust3crv.approve(vault.address, constants.MaxUint256);
        await vault.connect(signer).zapAndDeposit(pid, CURVE_UST_WORMHOLE_TOKEN, ethers.utils.parseEther("10000"), 0);
      });

      it("should succeed, when harvest", async () => {
        await booster.earmarkRewards(32);
        const amount = await vault.callStatic.harvest(pid, signer.address, 0);
        await vault.harvest(pid, signer.address, 0);
        console.log("rewards", amount.toString());
        expect(await ethers.provider.getBalance(vault.address)).to.eq(constants.Zero);
      });

      it("should succeed, when withdraw to UST (wormhole)", async () => {
        const amountOut = ethers.utils.parseUnits("10030.144175", 6);
        const ust = await ethers.getContractAt("IERC20", UST_WORMHOLE);
        const before = await ust.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, UST_WORMHOLE, amountOut);
        const after = await ust.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to 3CRV", async () => {
        const amountOut = ethers.utils.parseUnits("9828.384517813530147156", 18);
        const tricrv = await ethers.getContractAt("IERC20", TRICRV);
        const before = await tricrv.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, TRICRV, amountOut);
        const after = await tricrv.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to DAI", async () => {
        const amountOut = ethers.utils.parseUnits("10030.716965572016316266", 18);
        const dai = await ethers.getContractAt("IERC20", DAI);
        const before = await dai.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, DAI, amountOut);
        const after = await dai.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to USDC", async () => {
        const amountOut = ethers.utils.parseUnits("10030.579769", 6);
        const usdc = await ethers.getContractAt("IERC20", USDC);
        const before = await usdc.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, USDC, amountOut);
        const after = await usdc.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to USDT", async () => {
        const amountOut = ethers.utils.parseUnits("10024.101688", 6);
        const usdt = await ethers.getContractAt("IERC20", USDT);
        const before = await usdt.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, USDT, amountOut);
        const after = await usdt.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });
    });
  });

  context("rocket pool", async () => {
    const pid = 9;

    context("deposit", async () => {
      beforeEach(async () => {});

      it("should succeed, when deposit with ETH", async () => {
        const amountIn = ethers.utils.parseUnits("10", 18);
        const sharesOut = ethers.utils.parseEther("9.541339521130249530");
        const signer = await ethers.getSigner(WETH_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const shares = await vault
          .connect(signer)
          .callStatic.zapAndDeposit(pid, constants.AddressZero, amountIn, 0, { value: amountIn });
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, constants.AddressZero, amountIn, 0, { value: amountIn });
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with WETH", async () => {
        const amountIn = ethers.utils.parseUnits("10", 18);
        const sharesOut = ethers.utils.parseEther("9.541339521130249530");
        const signer = await ethers.getSigner(WETH_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const weth = await ethers.getContractAt("IERC20", WETH, signer);
        await weth.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, weth.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, weth.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with rETH", async () => {
        const amountIn = ethers.utils.parseUnits("10", 18);
        const sharesOut = ethers.utils.parseEther("9.885177189131817922");
        const signer = await ethers.getSigner(rETH_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const reth = await ethers.getContractAt("IERC20", rETH, signer);
        await reth.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, reth.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, reth.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with wstETH", async () => {
        const amountIn = ethers.utils.parseUnits("10", 18);
        const sharesOut = ethers.utils.parseEther("10.174136343567079621");
        const signer = await ethers.getSigner(wstETH_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const wsteth = await ethers.getContractAt("IERC20", wstETH, signer);
        await wsteth.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, wsteth.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, wsteth.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });

      it("should succeed, when deposit with stETH", async () => {
        const amountIn = ethers.utils.parseUnits("10", 18);
        const sharesOut = ethers.utils.parseEther("9.541339521130249530");
        const signer = await ethers.getSigner(STETH_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const steth = await ethers.getContractAt("IERC20", STETH, signer);
        await steth.approve(vault.address, constants.MaxUint256);
        const shares = await vault.connect(signer).callStatic.zapAndDeposit(pid, steth.address, amountIn, 0);
        expect(shares).to.eq(sharesOut);
        await vault.connect(signer).zapAndDeposit(pid, steth.address, amountIn, 0);
        expect((await vault.userInfo(pid, signer.address)).shares).to.eq(sharesOut);
      });
    });

    context("withdraw", async () => {
      let signer: SignerWithAddress;

      beforeEach(async () => {
        signer = await ethers.getSigner(CURVE_ROCKETETH_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const rethcrv = await ethers.getContractAt("IERC20", CURVE_ROCKETETH_TOKEN, signer);
        await rethcrv.approve(vault.address, constants.MaxUint256);
        await vault.connect(signer).zapAndDeposit(pid, CURVE_ROCKETETH_TOKEN, ethers.utils.parseEther("10"), 0);
      });

      it("should succeed, when harvest", async () => {
        await booster.earmarkRewards(72);
        const amount = await vault.callStatic.harvest(pid, signer.address, 0);
        await vault.harvest(pid, signer.address, 0);
        console.log("rewards", amount.toString());
        expect(await ethers.provider.getBalance(vault.address)).to.eq(constants.Zero);
      });

      it("should succeed, when withdraw to rETH", async () => {
        const amountOut = ethers.utils.parseUnits("10.108828721142240167", 18);
        const reth = await ethers.getContractAt("IERC20", rETH);
        const before = await reth.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, rETH, amountOut);
        const after = await reth.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to wstETH", async () => {
        const amountOut = ethers.utils.parseUnits("9.817824999489552084", 18);
        const wsteth = await ethers.getContractAt("IERC20", wstETH);
        const before = await wsteth.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, wstETH, amountOut);
        const after = await wsteth.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });

      it("should succeed, when withdraw to stETH", async () => {
        const amountOut = ethers.utils.parseUnits("10.468972016920684278", 18);
        const steth = await ethers.getContractAt("IERC20", STETH);
        const before = await steth.balanceOf(signer.address);
        await vault.connect(signer).withdrawAllAndZap(pid, STETH, amountOut);
        const after = await steth.balanceOf(signer.address);
        expect(after.sub(before)).to.eq(amountOut);
      });
    });
  });
});

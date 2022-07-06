/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { ADDRESS, ZAP_ROUTES } from "../../scripts/utils";
import { AladdinZap, IERC20 } from "../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../utils";

const FORK_BLOCK_NUMBER = 14699276;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const ZAP = "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a";
const ZAP_OWNER = "0x28c921adAC4c1072658eB01a28DA06b5F651eF62";

const FXS = ADDRESS.FXS;
const FXS_HOLDER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const UST_WORMHOLE = ADDRESS.UST_WORMHOLE;
const UST_WORMHOLE_HOLDER = "0x2FAF487A4414Fe77e2327F0bf4AE2a264a776AD2";
const LDO = ADDRESS.LDO;
const LDO_HOLDER = "0xC24da173A250e9Ca5c54870639EbE5f88be5102d";
const CVX = ADDRESS.CVX;
const ALCX = ADDRESS.ALCX;
const ALCX_HOLDER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const SPELL = ADDRESS.SPELL;
const SPELL_HOLDER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const LYRA = ADDRESS.LYRA;
const LYRA_HOLDER = "0xDB5Ac83c137321Da29a59a7592232bC4ed461730";
const SNX = ADDRESS.SNX;
const SNX_HOLDER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const GRO = ADDRESS.GRO;
const GRO_HOLDER = "0x5f8cD5141B44d01c61DBd642C7f111497482523E";
const FLX = ADDRESS.FLX;
const FLX_HOLDER = "0xCa86D57519dbFE34A25EEf0923b259ab07986B71";
const ANGLE = ADDRESS.ANGLE;
const ANGLE_HOLDER = "0x2Fc443960971e53FD6223806F0114D5fAa8C7C4e";
const INV = ADDRESS.INV;
const INV_HOLDER = "0xDAe6951Fb927f40d76dA0eF1d5a1a9bee8aF944B";

let firstCall = true;

describe("VotiumRound17.spec", async () => {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let zap: AladdinZap;
  let cvx: IERC20;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [
      DEPLOYER,
      ZAP_OWNER,
      FXS_HOLDER,
      UST_WORMHOLE_HOLDER,
      LDO_HOLDER,
      ALCX_HOLDER,
      SPELL_HOLDER,
      LYRA_HOLDER,
      SNX_HOLDER,
      GRO_HOLDER,
      FLX_HOLDER,
      ANGLE_HOLDER,
      INV_HOLDER,
    ]);
    deployer = await ethers.getSigner(DEPLOYER);
    owner = await ethers.getSigner(ZAP_OWNER);

    await deployer.sendTransaction({ to: owner.address, value: ethers.utils.parseEther("10") });

    cvx = await ethers.getContractAt("IERC20", CVX, deployer);

    zap = await ethers.getContractAt("AladdinZap", ZAP, owner);

    const rewards = ["FXS", "UST_WORMHOLE", "LDO", "ALCX", "SPELL", "LYRA", "SNX", "GRO", "FLX", "ANGLE", "INV"];
    for (const from in rewards) {
      const routes = ZAP_ROUTES[from].CVX;
      if (routes !== undefined) {
        await zap.updateRoute(ADDRESS[from], CVX, routes);
        if (firstCall) {
          console.log(`${from} to CVX zap: from[${ADDRESS[from]}] to[${CVX}] routes[${routes.toString()}]`);
        }
      }
    }
    firstCall = false;
  });

  it("FXS => CVX", async () => {
    const amountIn = ethers.utils.parseUnits("1000", 18);
    const expectCVX = ethers.utils.parseUnits("900", 18);
    const signer = await ethers.getSigner(FXS_HOLDER);
    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    const fxs = await ethers.getContractAt("IERC20", FXS, signer);
    await fxs.approve(zap.address, amountIn);

    const beforeCVX = await cvx.balanceOf(signer.address);
    await zap.connect(signer).zapFrom(fxs.address, amountIn, CVX, 0);
    const afterCVX = await cvx.balanceOf(signer.address);

    expect(afterCVX.sub(beforeCVX)).gte(expectCVX);
  });

  it("UST_WORMEHOLE => CVX", async () => {
    const amountIn = ethers.utils.parseUnits("10000", 6);
    const expectCVX = ethers.utils.parseUnits("400", 18);
    const signer = await ethers.getSigner(UST_WORMHOLE_HOLDER);
    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    const ust = await ethers.getContractAt("IERC20", UST_WORMHOLE, signer);
    await ust.approve(zap.address, amountIn);

    const beforeCVX = await cvx.balanceOf(signer.address);
    await zap.connect(signer).zapFrom(ust.address, amountIn, CVX, 0);
    const afterCVX = await cvx.balanceOf(signer.address);

    expect(afterCVX.sub(beforeCVX)).gte(expectCVX);
  });

  it("LDO => CVX", async () => {
    const amountIn = ethers.utils.parseUnits("10000", 18);
    const expectCVX = ethers.utils.parseUnits("1000", 18);
    const signer = await ethers.getSigner(LDO_HOLDER);
    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    const ldo = await ethers.getContractAt("IERC20", LDO, signer);
    await ldo.approve(zap.address, amountIn);

    const beforeCVX = await cvx.balanceOf(signer.address);
    await zap.connect(signer).zapFrom(ldo.address, amountIn, CVX, 0);
    const afterCVX = await cvx.balanceOf(signer.address);

    expect(afterCVX.sub(beforeCVX)).gte(expectCVX);
  });

  it("ALCX => CVX", async () => {
    const amountIn = ethers.utils.parseUnits("300", 18);
    const expectCVX = ethers.utils.parseUnits("800", 18);
    const signer = await ethers.getSigner(ALCX_HOLDER);
    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    const alcx = await ethers.getContractAt("IERC20", ALCX, signer);
    await alcx.approve(zap.address, amountIn);

    const beforeCVX = await cvx.balanceOf(signer.address);
    await zap.connect(signer).zapFrom(alcx.address, amountIn, CVX, 0);
    const afterCVX = await cvx.balanceOf(signer.address);

    expect(afterCVX.sub(beforeCVX)).gte(expectCVX);
  });

  it("SPELL => CVX", async () => {
    const amountIn = ethers.utils.parseUnits("6000000", 18);
    const expectCVX = ethers.utils.parseUnits("800", 18);
    const signer = await ethers.getSigner(SPELL_HOLDER);
    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    const spell = await ethers.getContractAt("IERC20", SPELL, signer);
    await spell.approve(zap.address, amountIn);

    const beforeCVX = await cvx.balanceOf(signer.address);
    await zap.connect(signer).zapFrom(spell.address, amountIn, CVX, 0);
    const afterCVX = await cvx.balanceOf(signer.address);

    expect(afterCVX.sub(beforeCVX)).gte(expectCVX);
  });

  it("LYRA => CVX", async () => {
    const amountIn = ethers.utils.parseUnits("60000", 18);
    const expectCVX = ethers.utils.parseUnits("400", 18);
    const signer = await ethers.getSigner(LYRA_HOLDER);
    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    const lyra = await ethers.getContractAt("IERC20", LYRA, signer);
    await lyra.approve(zap.address, amountIn);

    const beforeCVX = await cvx.balanceOf(signer.address);
    await zap.connect(signer).zapFrom(lyra.address, amountIn, CVX, 0);
    const afterCVX = await cvx.balanceOf(signer.address);

    expect(afterCVX.sub(beforeCVX)).gte(expectCVX);
  });

  it("SNX => CVX", async () => {
    const amountIn = ethers.utils.parseUnits("6000", 18);
    const expectCVX = ethers.utils.parseUnits("1000", 18);
    const signer = await ethers.getSigner(SNX_HOLDER);
    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    const snx = await ethers.getContractAt("IERC20", SNX, signer);
    await snx.approve(zap.address, amountIn);

    const beforeCVX = await cvx.balanceOf(signer.address);
    await zap.connect(signer).zapFrom(snx.address, amountIn, CVX, 0);
    const afterCVX = await cvx.balanceOf(signer.address);

    expect(afterCVX.sub(beforeCVX)).gte(expectCVX);
  });

  it("GRO => CVX", async () => {
    const amountIn = ethers.utils.parseUnits("6000", 18);
    const expectCVX = ethers.utils.parseUnits("400", 18);
    const signer = await ethers.getSigner(GRO_HOLDER);
    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    const gro = await ethers.getContractAt("IERC20", GRO, signer);
    await gro.approve(zap.address, amountIn);

    const beforeCVX = await cvx.balanceOf(signer.address);
    await zap.connect(signer).zapFrom(gro.address, amountIn, CVX, 0);
    const afterCVX = await cvx.balanceOf(signer.address);

    expect(afterCVX.sub(beforeCVX)).gte(expectCVX);
  });

  it("FLX => CVX", async () => {
    const amountIn = ethers.utils.parseUnits("250", 18);
    const expectCVX = ethers.utils.parseUnits("600", 18);
    const signer = await ethers.getSigner(FLX_HOLDER);
    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    const flx = await ethers.getContractAt("IERC20", FLX, signer);
    await flx.approve(zap.address, amountIn);

    const beforeCVX = await cvx.balanceOf(signer.address);
    await zap.connect(signer).zapFrom(flx.address, amountIn, CVX, 0);
    const afterCVX = await cvx.balanceOf(signer.address);

    expect(afterCVX.sub(beforeCVX)).gte(expectCVX);
  });

  it("ANGLE => CVX", async () => {
    const amountIn = ethers.utils.parseUnits("100000", 18);
    const expectCVX = ethers.utils.parseUnits("500", 18);
    const signer = await ethers.getSigner(ANGLE_HOLDER);
    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    const angle = await ethers.getContractAt("IERC20", ANGLE, signer);
    await angle.approve(zap.address, amountIn);

    const beforeCVX = await cvx.balanceOf(signer.address);
    await zap.connect(signer).zapFrom(angle.address, amountIn, CVX, 0);
    const afterCVX = await cvx.balanceOf(signer.address);

    expect(afterCVX.sub(beforeCVX)).gte(expectCVX);
  });

  it("INV => CVX", async () => {
    const amountIn = ethers.utils.parseUnits("100", 18);
    const expectCVX = ethers.utils.parseUnits("800", 18);
    const signer = await ethers.getSigner(INV_HOLDER);
    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    const inv = await ethers.getContractAt("IERC20", INV, signer);
    await inv.approve(zap.address, amountIn);

    const beforeCVX = await cvx.balanceOf(signer.address);
    await zap.connect(signer).zapFrom(inv.address, amountIn, CVX, 0);
    const afterCVX = await cvx.balanceOf(signer.address);

    expect(afterCVX.sub(beforeCVX)).gte(expectCVX);
  });
});

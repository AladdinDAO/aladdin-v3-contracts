/* eslint-disable node/no-missing-import */
import { expect } from "chai";
import { ethers } from "hardhat";
// eslint-disable-next-line camelcase
import { encodePoolHint, request_fork } from "./utils";

const FORK_BLOCK_NUMBER = 14243290;
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const CVX_HOLDER = "0x28C6c06298d514Db089934071355E5743bf21d60";
const CRV = "0xD533a949740bb3306d119CC777fa900bA034cd52";
const CRV_HOLDER = "0x7a16fF8270133F063aAb6C9977183D9e72835428";
const SPELL = "0x090185f2135308BaD17527004364eBcC2D37e5F6";
const SPELL_HOLDER = "0x8C54EbDD960056d2CfF5998df5695dACA1FC0190";
const ALCX = "0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF";
const ALCX_HOLDER = "0x28C6c06298d514Db089934071355E5743bf21d60";
const LDO = "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32";
const LDO_HOLDER = "0x447f95026107aaed7472A0470931e689f51e0e42";
const FXS = "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0";
const FXS_HOLDER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";

describe("AladdinConvexVaultZap.spec", async () => {
  it("should succeed when zap ETH => CRV", async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CRV_HOLDER]);
    const deployer = await ethers.getSigner(DEPLOYER);
    const signerCRVHolder = await ethers.getSigner(CRV_HOLDER);
    const amountIn = ethers.utils.parseEther("10");
    const amountOut = ethers.utils.parseEther("10168.496581904623597691");

    const crv = await ethers.getContractAt("IERC20", CRV, signerCRVHolder);
    const AladdinConvexVaultZap = await ethers.getContractFactory("AladdinConvexVaultZap", deployer);
    const zap = await AladdinConvexVaultZap.deploy();
    await zap.updateRoute(WETH, CRV, [encodePoolHint("0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511", 4, 0, 1)]);
    await zap.deployed();
    const output = await zap.callStatic.zap(WETH, amountIn, CRV, amountOut, {
      value: amountIn,
    });
    await zap.zap(WETH, amountIn, CRV, amountOut, {
      value: amountIn,
    });
    expect(await crv.balanceOf(DEPLOYER)).to.eq(amountOut);
    expect(output).to.eq(amountOut);
  });

  it("should succeed when zap CVX => ETH", async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CVX, CVX_HOLDER]);
    const deployer = await ethers.getSigner(DEPLOYER);
    const signerCVXHolder = await ethers.getSigner(CVX_HOLDER);
    const amountIn = ethers.utils.parseEther("100000");
    const amountOut = ethers.utils.parseEther("874.755538978009491764");

    const AladdinConvexVaultZap = await ethers.getContractFactory("AladdinConvexVaultZap", deployer);
    const zap = await AladdinConvexVaultZap.deploy();
    await zap.deployed();
    const cvx = await ethers.getContractAt("IERC20", CVX, signerCVXHolder);
    await cvx.transfer(zap.address, amountIn);
    await zap.updateRoute(CVX, WETH, [encodePoolHint("0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4", 4, 1, 0)]);
    const output = await zap.callStatic.zap(CVX, amountIn, WETH, amountOut);
    const before = await ethers.provider.getBalance(DEPLOYER);
    const tx = await zap.zap(CVX, amountIn, WETH, amountOut);
    await tx.wait();
    const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
    const after = await ethers.provider.getBalance(DEPLOYER);
    expect(output).to.eq(amountOut);
    expect(after.sub(before).add(receipt.gasUsed.mul(receipt.effectiveGasPrice))).to.eq(amountOut);
  });

  it("should succeed when zap SPELL => ETH", async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, SPELL, SPELL_HOLDER]);
    const deployer = await ethers.getSigner(DEPLOYER);
    const signerSPELLHolder = await ethers.getSigner(SPELL_HOLDER);
    const amountIn = ethers.utils.parseEther("1000000");
    const amountOut = ethers.utils.parseEther("1.775584414164103989");

    const AladdinConvexVaultZap = await ethers.getContractFactory("AladdinConvexVaultZap", deployer);
    const zap = await AladdinConvexVaultZap.deploy();
    await zap.deployed();
    const spell = await ethers.getContractAt("IERC20", SPELL, signerSPELLHolder);
    await spell.transfer(zap.address, amountIn);
    await zap.updateRoute(SPELL, WETH, [encodePoolHint("0xb5De0C3753b6E1B4dBA616Db82767F17513E6d4E", 0, 0, 1)]);
    const output = await zap.callStatic.zap(SPELL, amountIn, WETH, amountOut);
    const before = await ethers.provider.getBalance(DEPLOYER);
    const tx = await zap.zap(SPELL, amountIn, WETH, amountOut);
    await tx.wait();
    const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
    const after = await ethers.provider.getBalance(DEPLOYER);
    expect(output).to.eq(amountOut);
    expect(after.sub(before).add(receipt.gasUsed.mul(receipt.effectiveGasPrice))).to.eq(amountOut);
  });

  it("should succeed when zap ALCX => ETH", async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, ALCX, ALCX_HOLDER]);
    const deployer = await ethers.getSigner(DEPLOYER);
    const signerALCXHolder = await ethers.getSigner(ALCX_HOLDER);
    const amountIn = ethers.utils.parseEther("1000");
    const amountOut = ethers.utils.parseEther("51.495099018330704251");

    const AladdinConvexVaultZap = await ethers.getContractFactory("AladdinConvexVaultZap", deployer);
    const zap = await AladdinConvexVaultZap.deploy();
    await zap.deployed();
    const alcx = await ethers.getContractAt("IERC20", ALCX, signerALCXHolder);
    await alcx.transfer(zap.address, amountIn);
    await zap.updateRoute(ALCX, WETH, [encodePoolHint("0xC3f279090a47e80990Fe3a9c30d24Cb117EF91a8", 0, 1, 0)]);
    const output = await zap.callStatic.zap(ALCX, amountIn, WETH, amountOut);
    const before = await ethers.provider.getBalance(DEPLOYER);
    const tx = await zap.zap(ALCX, amountIn, WETH, amountOut);
    await tx.wait();
    const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
    const after = await ethers.provider.getBalance(DEPLOYER);
    expect(output).to.eq(amountOut);
    expect(after.sub(before).add(receipt.gasUsed.mul(receipt.effectiveGasPrice))).to.eq(amountOut);
  });

  it("should succeed when zap LDO => ETH", async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, LDO, LDO_HOLDER]);
    const deployer = await ethers.getSigner(DEPLOYER);
    const signerLDOHolder = await ethers.getSigner(LDO_HOLDER);
    const amountIn = ethers.utils.parseEther("100000");
    const amountOut = ethers.utils.parseEther("51.234934257717356245");

    const AladdinConvexVaultZap = await ethers.getContractFactory("AladdinConvexVaultZap", deployer);
    const zap = await AladdinConvexVaultZap.deploy();
    await zap.deployed();
    const ldo = await ethers.getContractAt("IERC20", LDO, signerLDOHolder);
    await ldo.transfer(zap.address, amountIn);
    await zap.updateRoute(LDO, WETH, [encodePoolHint("0xC558F600B34A5f69dD2f0D06Cb8A88d829B7420a", 0, 0, 1)]);
    const output = await zap.callStatic.zap(LDO, amountIn, WETH, amountOut);
    const before = await ethers.provider.getBalance(DEPLOYER);
    const tx = await zap.zap(LDO, amountIn, WETH, amountOut);
    await tx.wait();
    const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
    const after = await ethers.provider.getBalance(DEPLOYER);
    expect(output).to.eq(amountOut);
    expect(after.sub(before).add(receipt.gasUsed.mul(receipt.effectiveGasPrice))).to.eq(amountOut);
  });

  it("should succeed when zap FXS => ETH", async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, FXS, FXS_HOLDER]);
    const deployer = await ethers.getSigner(DEPLOYER);
    const signerFXSHolder = await ethers.getSigner(FXS_HOLDER);
    const amountIn = ethers.utils.parseEther("1000");
    const amountOut = ethers.utils.parseEther("7.741961292003055789");

    const AladdinConvexVaultZap = await ethers.getContractFactory("AladdinConvexVaultZap", deployer);
    const zap = await AladdinConvexVaultZap.deploy();
    await zap.deployed();
    const fxs = await ethers.getContractAt("IERC20", FXS, signerFXSHolder);
    await fxs.transfer(zap.address, amountIn);
    await zap.updateRoute(FXS, WETH, [encodePoolHint("0xCD8286b48936cDAC20518247dBD310ab681A9fBf", 1, 0, 1)]);
    const output = await zap.callStatic.zap(FXS, amountIn, WETH, amountOut);
    const before = await ethers.provider.getBalance(DEPLOYER);
    const tx = await zap.zap(FXS, amountIn, WETH, amountOut);
    await tx.wait();
    const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
    const after = await ethers.provider.getBalance(DEPLOYER);
    expect(output).to.eq(amountOut);
    expect(after.sub(before).add(receipt.gasUsed.mul(receipt.effectiveGasPrice))).to.eq(amountOut);
  });
});

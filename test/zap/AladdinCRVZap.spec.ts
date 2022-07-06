/* eslint-disable node/no-missing-import */
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { TOKENS } from "../../scripts/utils";
// eslint-disable-next-line camelcase
import { request_fork } from "../utils";

const FORK_BLOCK_NUMBER = 14243290;
const THREE_CRV = TOKENS.TRICRV.address;
const THREE_CRV_HOLDER = "0x7aCAeD42fD79AAF0cdEC641a2c59E06D996b96a0";
const CVX = TOKENS.CVX.address;
const CVX_HOLDER = "0x28C6c06298d514Db089934071355E5743bf21d60";
const CRV = TOKENS.CRV.address;
const CRV_HOLDER = "0x7a16fF8270133F063aAb6C9977183D9e72835428";
const CVXCRV = TOKENS.cvxCRV.address;
const CVXCRV_HOLDER = "0xE4360E6e45F5b122586BCA3b9d7b222EA69C5568";
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";

describe("AladdinCRVZap.spec", async () => {
  it("should succeed when zap 3crv => ETH", async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, THREE_CRV, THREE_CRV_HOLDER]);
    const deployer = await ethers.getSigner(DEPLOYER);
    const signer3CRVHolder = await ethers.getSigner(THREE_CRV_HOLDER);
    const amountIn = ethers.utils.parseEther("100000");
    const amountOut = ethers.utils.parseEther("38.620512790853855785");

    const AladdinCRVZap = await ethers.getContractFactory("AladdinCRVZap", deployer);
    const zap = await AladdinCRVZap.deploy();
    await zap.deployed();
    const threeCRV = await ethers.getContractAt("IERC20", THREE_CRV, signer3CRVHolder);
    await threeCRV.transfer(zap.address, amountIn);
    const output = await zap.callStatic.zap(THREE_CRV, amountIn, constants.AddressZero, amountOut.mul(9).div(10));
    await zap.zap(THREE_CRV, amountIn, constants.AddressZero, amountOut.mul(9).div(10));
    expect(await ethers.provider.getBalance(zap.address)).to.eq(amountOut);
    expect(output).to.eq(amountOut);
  });

  it("should succeed when zap CVX => ETH", async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CVX, CVX_HOLDER]);
    const deployer = await ethers.getSigner(DEPLOYER);
    const signerCVXHolder = await ethers.getSigner(CVX_HOLDER);
    const amountIn = ethers.utils.parseEther("100000");
    const amountOut = ethers.utils.parseEther("874.755538978009491764");

    const AladdinCRVZap = await ethers.getContractFactory("AladdinCRVZap", deployer);
    const zap = await AladdinCRVZap.deploy();
    await zap.deployed();
    const cvx = await ethers.getContractAt("IERC20", CVX, signerCVXHolder);
    await cvx.transfer(zap.address, amountIn);
    const output = await zap.callStatic.zap(CVX, amountIn, constants.AddressZero, amountOut.mul(9).div(10));
    await zap.zap(CVX, amountIn, constants.AddressZero, amountOut.mul(9).div(10));
    expect(await ethers.provider.getBalance(zap.address)).to.eq(amountOut);
    expect(output).to.eq(amountOut);
  });

  it("should succeed when zap ETH => CRV", async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CRV_HOLDER]);
    const deployer = await ethers.getSigner(DEPLOYER);
    const signerCRVHolder = await ethers.getSigner(CRV_HOLDER);
    const amountIn = ethers.utils.parseEther("10");
    const amountOut = ethers.utils.parseEther("10168.496581904623597691");

    const crv = await ethers.getContractAt("IERC20", CRV, signerCRVHolder);
    const AladdinCRVZap = await ethers.getContractFactory("AladdinCRVZap", deployer);
    const zap = await AladdinCRVZap.deploy();
    await zap.deployed();
    const output = await zap.callStatic.zap(constants.AddressZero, amountIn, CRV, amountOut.mul(9).div(10), {
      value: amountIn,
    });
    await zap.zap(constants.AddressZero, amountIn, CRV, amountOut.mul(9).div(10), {
      value: amountIn,
    });
    expect(await crv.balanceOf(zap.address)).to.eq(amountOut);
    expect(output).to.eq(amountOut);
  });

  it("should succeed when zap cvxCRV => CRV", async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CVXCRV, CVXCRV_HOLDER, CRV, CRV_HOLDER]);
    const deployer = await ethers.getSigner(DEPLOYER);
    const signerCVXCRVHolder = await ethers.getSigner(CVXCRV_HOLDER);
    const signerCRVHolder = await ethers.getSigner(CRV_HOLDER);
    const amountIn = ethers.utils.parseEther("10000");
    const amountOut = ethers.utils.parseEther("9571.901164932840818032");

    const AladdinCRVZap = await ethers.getContractFactory("AladdinCRVZap", deployer);
    const zap = await AladdinCRVZap.deploy();
    await zap.deployed();
    const cvxCRV = await ethers.getContractAt("IERC20", CVXCRV, signerCVXCRVHolder);
    const crv = await ethers.getContractAt("IERC20", CRV, signerCRVHolder);
    await cvxCRV.transfer(zap.address, amountIn);
    const output = await zap.callStatic.zap(CVXCRV, amountIn, CRV, amountOut.mul(9).div(10));
    await zap.zap(CVXCRV, amountIn, CRV, amountOut.mul(9).div(10));
    expect(await crv.balanceOf(zap.address)).to.eq(amountOut);
    expect(output).to.eq(amountOut);
  });

  it("should succeed when zap cvxCRV => CVX", async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CVXCRV, CVXCRV_HOLDER, CVX, CVX_HOLDER]);
    const deployer = await ethers.getSigner(DEPLOYER);
    const signerCVXCRVHolder = await ethers.getSigner(CVXCRV_HOLDER);
    const signerCVXHolder = await ethers.getSigner(CVX_HOLDER);
    const amountIn = ethers.utils.parseEther("10000");
    const amountOut = ethers.utils.parseEther("1026.118223651829067118");

    const AladdinCRVZap = await ethers.getContractFactory("AladdinCRVZap", deployer);
    const zap = await AladdinCRVZap.deploy();
    await zap.deployed();
    const cvxCRV = await ethers.getContractAt("IERC20", CVXCRV, signerCVXCRVHolder);
    const cvx = await ethers.getContractAt("IERC20", CVX, signerCVXHolder);
    await cvxCRV.transfer(zap.address, amountIn);
    const output = await zap.callStatic.zap(CVXCRV, amountIn, CVX, amountOut.mul(9).div(10));
    await zap.zap(CVXCRV, amountIn, CVX, amountOut.mul(9).div(10));
    expect(await cvx.balanceOf(zap.address)).to.eq(amountOut);
    expect(output).to.eq(amountOut);
  });

  it("should succeed when zap cvxCRV => ETH", async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CVXCRV, CVXCRV_HOLDER]);
    const deployer = await ethers.getSigner(DEPLOYER);
    const signerCVXCRVHolder = await ethers.getSigner(CVXCRV_HOLDER);
    const amountIn = ethers.utils.parseEther("10000");
    const amountOut = ethers.utils.parseEther("9.354627894395340396");

    const AladdinCRVZap = await ethers.getContractFactory("AladdinCRVZap", deployer);
    const zap = await AladdinCRVZap.deploy();
    await zap.deployed();
    const cvxCRV = await ethers.getContractAt("IERC20", CVXCRV, signerCVXCRVHolder);
    await cvxCRV.transfer(zap.address, amountIn);
    const output = await zap.callStatic.zap(CVXCRV, amountIn, constants.AddressZero, amountOut.mul(9).div(10));
    await zap.zap(CVXCRV, amountIn, constants.AddressZero, amountOut.mul(9).div(10));
    expect(await ethers.provider.getBalance(zap.address)).to.eq(amountOut);
    expect(output).to.eq(amountOut);
  });

  it("should succeed when zap CRV => cvxCRV", async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CVXCRV, CVXCRV_HOLDER, CRV, CRV_HOLDER]);
    const deployer = await ethers.getSigner(DEPLOYER);
    const signerCVXCRVHolder = await ethers.getSigner(CVXCRV_HOLDER);
    const signerCRVHolder = await ethers.getSigner(CRV_HOLDER);
    const amountIn = ethers.utils.parseEther("10000");
    const amountOut = ethers.utils.parseEther("10415.221686790079874294");

    const AladdinCRVZap = await ethers.getContractFactory("AladdinCRVZap", deployer);
    const zap = await AladdinCRVZap.deploy();
    await zap.deployed();
    const cvxCRV = await ethers.getContractAt("IERC20", CVXCRV, signerCVXCRVHolder);
    const crv = await ethers.getContractAt("IERC20", CRV, signerCRVHolder);
    await crv.transfer(zap.address, amountIn);
    const output = await zap.callStatic.zap(CRV, amountIn, CVXCRV, amountOut.mul(9).div(10));
    await zap.zap(CRV, amountIn, CVXCRV, amountOut.mul(9).div(10));
    expect(await cvxCRV.balanceOf(zap.address)).to.eq(amountOut);
    expect(output).to.eq(amountOut);
  });
});

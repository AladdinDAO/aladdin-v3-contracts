/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { Action, encodePoolHintV2, PoolType } from "../../scripts/utils";
import { AladdinZap, IERC20 } from "../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../utils";

const FORK_BLOCK_NUMBER = 14243290;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";

describe("AladdinZap.spec", async () => {
  describe("SushiSwap ALCX/ETH pool [UniswapV2]", async () => {
    const ALCX = "0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF";
    const ALCX_HOLDER = "0x28C6c06298d514Db089934071355E5743bf21d60";
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
    const ALCX_WETH_POOL = "0xC3f279090a47e80990Fe3a9c30d24Cb117EF91a8";

    it("should succeed, when swap ALCX => ETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, ALCX_WETH_POOL, ALCX, ALCX_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(ALCX_HOLDER);
      const amountIn = ethers.utils.parseEther("1000");
      const amountOut = ethers.utils.parseEther("51.495099018330704251");

      const alcx = await ethers.getContractAt("IERC20", ALCX, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(ALCX, WETH, [encodePoolHintV2(ALCX_WETH_POOL, PoolType.UniswapV2, 2, 1, 0, Action.Swap)]);
      await zap.deployed();
      await alcx.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(ALCX, amountIn, constants.AddressZero, amountOut);
      const before = await deployer.getBalance();
      const tx = await zap.zap(ALCX, amountIn, constants.AddressZero, amountOut);
      const receipt = await tx.wait();
      const after = await deployer.getBalance();
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)));
    });

    it("should succeed, when swap ALCX => WETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, ALCX_WETH_POOL, ALCX, ALCX_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(ALCX_HOLDER);
      const amountIn = ethers.utils.parseEther("1000");
      const amountOut = ethers.utils.parseEther("51.495099018330704251");

      const alcx = await ethers.getContractAt("IERC20", ALCX, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(ALCX, WETH, [encodePoolHintV2(ALCX_WETH_POOL, PoolType.UniswapV2, 2, 1, 0, Action.Swap)]);
      await zap.deployed();
      await alcx.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(ALCX, amountIn, WETH, amountOut);
      const before = await weth.balanceOf(deployer.address);
      await zap.zap(ALCX, amountIn, WETH, amountOut);
      const after = await weth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when swap ETH => ALCX", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, ALCX_WETH_POOL]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const amountIn = ethers.utils.parseEther("51");
      const amountOut = ethers.utils.parseEther("974.326629973535940649");

      const alcx = await ethers.getContractAt("IERC20", ALCX, deployer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(WETH, ALCX, [encodePoolHintV2(ALCX_WETH_POOL, PoolType.UniswapV2, 2, 0, 1, Action.Swap)]);
      await zap.deployed();
      const output = await zap.callStatic.zap(constants.AddressZero, amountIn, ALCX, amountOut, {
        value: amountIn,
      });
      const before = await alcx.balanceOf(deployer.address);
      await zap.zap(constants.AddressZero, amountIn, ALCX, amountOut, {
        value: amountIn,
      });
      const after = await alcx.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when swap WETH => ALCX", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, ALCX_WETH_POOL, WETH, WETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(WETH_HOLDER);
      const amountIn = ethers.utils.parseEther("51");
      const amountOut = ethers.utils.parseEther("974.326629973535940649");

      const alcx = await ethers.getContractAt("IERC20", ALCX, deployer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(WETH, ALCX, [encodePoolHintV2(ALCX_WETH_POOL, PoolType.UniswapV2, 2, 0, 1, Action.Swap)]);
      await zap.deployed();
      await weth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(WETH, amountIn, ALCX, amountOut);
      const before = await alcx.balanceOf(deployer.address);
      await zap.zap(WETH, amountIn, ALCX, amountOut);
      const after = await alcx.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });
  });

  describe("UniswapV2 FXS/FRAX pool [UniswapV2]", async () => {
    const FXS = "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0";
    const FXS_HOLDER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
    const FRAX = "0x853d955aCEf822Db058eb8505911ED77F175b99e";
    const FRAX_HOLDER = "0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE";
    const FXS_FRAX_POOL = "0xE1573B9D29e2183B1AF0e743Dc2754979A40D237";

    it("should succeed, when swap FXS => FRAX", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, FXS_FRAX_POOL, FXS, FXS_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(FXS_HOLDER);
      const amountIn = ethers.utils.parseEther("1000");
      const amountOut = ethers.utils.parseEther("20426.482715012613886488");

      const fxs = await ethers.getContractAt("IERC20", FXS, signer);
      const frax = await ethers.getContractAt("IERC20", FRAX, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(FXS, FRAX, [encodePoolHintV2(FXS_FRAX_POOL, PoolType.UniswapV2, 2, 0, 1, Action.Swap)]);
      await zap.deployed();
      await fxs.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(FXS, amountIn, FRAX, amountOut);
      const before = await frax.balanceOf(deployer.address);
      await zap.zap(FXS, amountIn, FRAX, amountOut);
      const after = await frax.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when swap FRAX => FXS", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, FXS_FRAX_POOL, FRAX, FRAX_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(FRAX_HOLDER);
      const amountIn = ethers.utils.parseEther("20426");
      const amountOut = ethers.utils.parseEther("993.236385083446866442");

      const fxs = await ethers.getContractAt("IERC20", FXS, signer);
      const frax = await ethers.getContractAt("IERC20", FRAX, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(FRAX, FXS, [encodePoolHintV2(FXS_FRAX_POOL, PoolType.UniswapV2, 2, 1, 0, Action.Swap)]);
      await zap.deployed();
      await frax.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(FRAX, amountIn, FXS, amountOut);
      const before = await fxs.balanceOf(deployer.address);
      await zap.zap(FRAX, amountIn, FXS, amountOut);
      const after = await fxs.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });
  });

  describe("UniswapV3 FXS/ETH pool [UniswapV3]", async () => {
    const FXS = "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0";
    const FXS_HOLDER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
    const FXS_WETH_POOL = "0xCD8286b48936cDAC20518247dBD310ab681A9fBf";

    it("should succeed, when swap FXS => ETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, FXS_WETH_POOL, FXS, FXS_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(FXS_HOLDER);
      const amountIn = ethers.utils.parseEther("1000");
      const amountOut = ethers.utils.parseEther("7.741961292003055789");

      const fxs = await ethers.getContractAt("IERC20", FXS, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(FXS, WETH, [encodePoolHintV2(FXS_WETH_POOL, PoolType.UniswapV3, 2, 0, 1, Action.Swap)]);
      await zap.deployed();
      await fxs.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(FXS, amountIn, constants.AddressZero, amountOut);
      const before = await deployer.getBalance();
      const tx = await zap.zap(FXS, amountIn, constants.AddressZero, amountOut);
      const receipt = await tx.wait();
      const after = await deployer.getBalance();
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)));
    });

    it("should succeed, when swap FXS => WETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, FXS_WETH_POOL, FXS, FXS_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(FXS_HOLDER);
      const amountIn = ethers.utils.parseEther("1000");
      const amountOut = ethers.utils.parseEther("7.741961292003055789");

      const fxs = await ethers.getContractAt("IERC20", FXS, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(FXS, WETH, [encodePoolHintV2(FXS_WETH_POOL, PoolType.UniswapV3, 2, 0, 1, Action.Swap)]);
      await zap.deployed();
      await fxs.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(FXS, amountIn, WETH, amountOut);
      const before = await weth.balanceOf(deployer.address);
      await zap.zap(FXS, amountIn, WETH, amountOut);
      const after = await weth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when swap ETH => FXS", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, FXS_WETH_POOL]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const amountIn = ethers.utils.parseEther("6");
      const amountOut = ethers.utils.parseEther("757.393998811295210898");

      const fxs = await ethers.getContractAt("IERC20", FXS, deployer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(WETH, FXS, [encodePoolHintV2(FXS_WETH_POOL, PoolType.UniswapV3, 2, 1, 0, Action.Swap)]);
      await zap.deployed();
      const output = await zap.callStatic.zap(constants.AddressZero, amountIn, FXS, amountOut, {
        value: amountIn,
      });
      const before = await fxs.balanceOf(deployer.address);
      await zap.zap(constants.AddressZero, amountIn, FXS, amountOut, {
        value: amountIn,
      });
      const after = await fxs.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when swap WETH => FXS", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, FXS_WETH_POOL, WETH, WETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(WETH_HOLDER);
      const amountIn = ethers.utils.parseEther("6");
      const amountOut = ethers.utils.parseEther("757.393998811295210898");

      const fxs = await ethers.getContractAt("IERC20", FXS, deployer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(WETH, FXS, [encodePoolHintV2(FXS_WETH_POOL, PoolType.UniswapV3, 2, 1, 0, Action.Swap)]);
      await zap.deployed();
      await weth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(WETH, amountIn, FXS, amountOut);
      const before = await fxs.balanceOf(deployer.address);
      await zap.zap(WETH, amountIn, FXS, amountOut);
      const after = await fxs.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });
  });

  describe("BalancerV2 BAL/ETH pool [BalancerV2]", async () => {
    const BAL = "0xba100000625a3754423978a60c9317c58a424e3D";
    const BAL_HOLDER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
    const BAL_WETH_POOL = "0x5c6Ee304399DBdB9C8Ef030aB642B10820DB8F56";

    it("should succeed, when swap BAL => ETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, BAL_WETH_POOL, BAL, BAL_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(BAL_HOLDER);
      const amountIn = ethers.utils.parseEther("1000");
      const amountOut = ethers.utils.parseEther("4.764865930000778955");

      const bal = await ethers.getContractAt("IERC20", BAL, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(BAL, WETH, [encodePoolHintV2(BAL_WETH_POOL, PoolType.BalancerV2, 2, 0, 1, Action.Swap)]);
      await zap.deployed();
      await bal.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(BAL, amountIn, constants.AddressZero, amountOut);
      const before = await deployer.getBalance();
      const tx = await zap.zap(BAL, amountIn, constants.AddressZero, amountOut);
      const receipt = await tx.wait();
      const after = await deployer.getBalance();
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)));
    });

    it("should succeed, when swap BAL => WETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, BAL_WETH_POOL, BAL, BAL_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(BAL_HOLDER);
      const amountIn = ethers.utils.parseEther("1000");
      const amountOut = ethers.utils.parseEther("4.764865930000778955");

      const bal = await ethers.getContractAt("IERC20", BAL, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(BAL, WETH, [encodePoolHintV2(BAL_WETH_POOL, PoolType.BalancerV2, 2, 0, 1, Action.Swap)]);
      await zap.deployed();
      await bal.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(BAL, amountIn, WETH, amountOut);
      const before = await weth.balanceOf(deployer.address);
      await zap.zap(BAL, amountIn, WETH, amountOut);
      const after = await weth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when swap ETH => BAL", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, BAL_WETH_POOL]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const amountIn = ethers.utils.parseEther("5");
      const amountOut = ethers.utils.parseEther("1047.319488206268040465");

      const bal = await ethers.getContractAt("IERC20", BAL, deployer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(WETH, BAL, [encodePoolHintV2(BAL_WETH_POOL, PoolType.BalancerV2, 2, 1, 0, Action.Swap)]);
      await zap.deployed();
      const output = await zap.callStatic.zap(constants.AddressZero, amountIn, BAL, amountOut, {
        value: amountIn,
      });
      const before = await bal.balanceOf(deployer.address);
      await zap.zap(constants.AddressZero, amountIn, BAL, amountOut, {
        value: amountIn,
      });
      const after = await bal.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when swap WETH => BAL", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, BAL_WETH_POOL, WETH, WETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(WETH_HOLDER);
      const amountIn = ethers.utils.parseEther("5");
      const amountOut = ethers.utils.parseEther("1047.319488206268040465");

      const bal = await ethers.getContractAt("IERC20", BAL, deployer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(WETH, BAL, [encodePoolHintV2(BAL_WETH_POOL, PoolType.BalancerV2, 2, 1, 0, Action.Swap)]);
      await zap.deployed();
      await weth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(WETH, amountIn, BAL, amountOut);
      const before = await bal.balanceOf(deployer.address);
      await zap.zap(WETH, amountIn, BAL, amountOut);
      const after = await bal.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });
  });

  describe("curve steth pool [CurveETHPool]", async () => {
    const CURVE_STETH_POOL = "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022";
    const CURVE_STETH_TOKEN = "0x06325440D014e39736583c165C2963BA99fAf14E";
    const CURVE_STETH_HOLDER = "0x56c915758Ad3f76Fd287FFF7563ee313142Fb663";
    const STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
    const STETH_HOLDER = "0x06920C9fC643De77B99cB7670A944AD31eaAA260";
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";

    it("should succeed, when AddLiquidity ETH => steCRV", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_STETH_POOL]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("9.668895315773807465");

      const stecrv = await ethers.getContractAt("IERC20", CURVE_STETH_TOKEN, deployer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_STETH_POOL], [CURVE_STETH_TOKEN]);
      await zap.updateRoute(WETH, CURVE_STETH_TOKEN, [
        encodePoolHintV2(CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity),
      ]);
      await zap.deployed();
      const output = await zap.callStatic.zap(WETH, amountIn, CURVE_STETH_TOKEN, amountOut, {
        value: amountIn,
      });
      await zap.zap(WETH, amountIn, CURVE_STETH_TOKEN, amountOut, {
        value: amountIn,
      });
      expect(await stecrv.balanceOf(DEPLOYER)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when AddLiquidity WETH => steCRV", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_STETH_POOL, WETH, WETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(WETH_HOLDER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("9.668895315773807465");

      const stecrv = await ethers.getContractAt("IERC20", CURVE_STETH_TOKEN, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_STETH_POOL], [CURVE_STETH_TOKEN]);
      await zap.updateRoute(WETH, CURVE_STETH_TOKEN, [
        encodePoolHintV2(CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await weth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(WETH, amountIn, CURVE_STETH_TOKEN, amountOut);
      await zap.zap(WETH, amountIn, CURVE_STETH_TOKEN, amountOut);
      expect(await stecrv.balanceOf(DEPLOYER)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when AddLiquidity stETH => steCRV", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_STETH_POOL, STETH, STETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(STETH_HOLDER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("9.661921478612428224");

      const stecrv = await ethers.getContractAt("IERC20", CURVE_STETH_TOKEN, signer);
      const steth = await ethers.getContractAt("IERC20", STETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_STETH_POOL], [CURVE_STETH_TOKEN]);
      await zap.updateRoute(STETH, CURVE_STETH_TOKEN, [
        encodePoolHintV2(CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await steth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(STETH, amountIn, CURVE_STETH_TOKEN, amountOut);
      await zap.zap(STETH, amountIn, CURVE_STETH_TOKEN, amountOut);
      expect(await stecrv.balanceOf(DEPLOYER)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when RemoveLiquidity steCRV => ETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_STETH_POOL, CURVE_STETH_TOKEN, CURVE_STETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(CURVE_STETH_HOLDER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("10.338229483764242723");

      const stecrv = await ethers.getContractAt("IERC20", CURVE_STETH_TOKEN, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_STETH_POOL], [CURVE_STETH_TOKEN]);
      await zap.updateRoute(CURVE_STETH_TOKEN, WETH, [
        encodePoolHintV2(CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity),
      ]);
      await zap.deployed();
      await stecrv.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(CURVE_STETH_TOKEN, amountIn, constants.AddressZero, amountOut);
      const before = await deployer.getBalance();
      const tx = await zap.zap(CURVE_STETH_TOKEN, amountIn, constants.AddressZero, amountOut);
      const receipt = await tx.wait();
      const after = await deployer.getBalance();
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)));
    });

    it("should succeed, when RemoveLiquidity steCRV => WETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_STETH_POOL, CURVE_STETH_TOKEN, CURVE_STETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(CURVE_STETH_HOLDER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("10.338229483764242723");

      const stecrv = await ethers.getContractAt("IERC20", CURVE_STETH_TOKEN, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_STETH_POOL], [CURVE_STETH_TOKEN]);
      await zap.updateRoute(CURVE_STETH_TOKEN, WETH, [
        encodePoolHintV2(CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity),
      ]);
      await zap.deployed();
      await stecrv.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(CURVE_STETH_TOKEN, amountIn, WETH, amountOut);
      const before = await weth.balanceOf(deployer.address);
      await zap.zap(CURVE_STETH_TOKEN, amountIn, WETH, amountOut);
      const after = await weth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when RemoveLiquidity steCRV => stETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_STETH_POOL, CURVE_STETH_TOKEN, CURVE_STETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(CURVE_STETH_HOLDER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("10.345842327893113486");

      const stecrv = await ethers.getContractAt("IERC20", CURVE_STETH_TOKEN, signer);
      const steth = await ethers.getContractAt("IERC20", STETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_STETH_POOL], [CURVE_STETH_TOKEN]);
      await zap.updateRoute(CURVE_STETH_TOKEN, STETH, [
        encodePoolHintV2(CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.RemoveLiquidity),
      ]);
      await zap.deployed();
      await stecrv.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(CURVE_STETH_TOKEN, amountIn, STETH, amountOut);
      const before = await steth.balanceOf(deployer.address);
      await zap.zap(CURVE_STETH_TOKEN, amountIn, STETH, amountOut);
      const after = await steth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before).add(1)).to.eq(amountOut); // steth has some rounding error
    });

    it("should succeed, when Swap ETH => stETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_STETH_POOL]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("10.003284637254618581");

      const steth = await ethers.getContractAt("IERC20", STETH, deployer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(WETH, STETH, [
        encodePoolHintV2(CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 0, 1, Action.Swap),
      ]);
      await zap.deployed();
      const output = await zap.callStatic.zap(WETH, amountIn, STETH, amountOut, { value: amountIn });
      const before = await steth.balanceOf(deployer.address);
      await zap.zap(WETH, amountIn, STETH, amountOut, { value: amountIn });
      const after = await steth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before).add(1)).to.eq(amountOut); // steth has some rounding error
    });

    it("should succeed, when Swap WETH => stETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_STETH_POOL, WETH, WETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(WETH_HOLDER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("10.003284637254618581");

      const steth = await ethers.getContractAt("IERC20", STETH, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(WETH, STETH, [
        encodePoolHintV2(CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 0, 1, Action.Swap),
      ]);
      await zap.deployed();
      await weth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(WETH, amountIn, STETH, amountOut);
      const before = await steth.balanceOf(deployer.address);
      await zap.zap(WETH, amountIn, STETH, amountOut);
      const after = await steth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before).add(1)).to.eq(amountOut); // steth has some rounding error
    });

    it("should succeed, when Swap stETH => WETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_STETH_POOL, STETH, STETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(STETH_HOLDER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("9.988714151784162851");

      const steth = await ethers.getContractAt("IERC20", STETH, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(STETH, WETH, [
        encodePoolHintV2(CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 1, 0, Action.Swap),
      ]);
      await zap.deployed();
      await steth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(STETH, amountIn, WETH, amountOut);
      const before = await weth.balanceOf(deployer.address);
      await zap.zap(STETH, amountIn, WETH, amountOut);
      const after = await weth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when Swap stETH => ETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_STETH_POOL, STETH, STETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(STETH_HOLDER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("9.988714151784162851");

      const steth = await ethers.getContractAt("IERC20", STETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(STETH, WETH, [
        encodePoolHintV2(CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 1, 0, Action.Swap),
      ]);
      await zap.deployed();
      await steth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(STETH, amountIn, constants.AddressZero, amountOut);
      const before = await deployer.getBalance();
      const tx = await zap.zap(STETH, amountIn, constants.AddressZero, amountOut);
      const receipt = await tx.wait();
      const after = await deployer.getBalance();
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)));
    });
  });

  describe("curve aleth pool [CurveETHPool Factory]", async () => {
    const CURVE_ALETH_POOL = "0xC4C319E2D4d66CcA4464C0c2B32c9Bd23ebe784e";
    const CURVE_ALETH_TOKEN = "0xC4C319E2D4d66CcA4464C0c2B32c9Bd23ebe784e";
    const CURVE_ALETH_HOLDER = "0x084d0cd0605f47D92Dc2DFD22238e9c5605023E9";
    const ALETH = "0x0100546F2cD4C9D97f798fFC9755E47865FF7Ee6";
    const ALETH_HOLDER = "0x9434725eeE2d1BaD39578B7A9c749F86408C6676";
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";

    it("should succeed, when AddLiquidity ETH => Curve alETH Pool", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_ALETH_POOL]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("9.993236366681553294");

      const alethcrv = await ethers.getContractAt("IERC20", CURVE_ALETH_TOKEN, deployer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_ALETH_TOKEN], [CURVE_ALETH_TOKEN]);
      await zap.updateRoute(WETH, CURVE_ALETH_TOKEN, [
        encodePoolHintV2(CURVE_ALETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity),
      ]);
      await zap.deployed();
      const output = await zap.callStatic.zap(WETH, amountIn, CURVE_ALETH_TOKEN, amountOut, {
        value: amountIn,
      });
      const before = await alethcrv.balanceOf(deployer.address);
      await zap.zap(WETH, amountIn, CURVE_ALETH_TOKEN, amountOut, {
        value: amountIn,
      });
      const after = await alethcrv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when AddLiquidity WETH => Curve alETH Pool", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_ALETH_POOL, WETH, WETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(WETH_HOLDER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("9.993236366681553294");

      const alethcrv = await ethers.getContractAt("IERC20", CURVE_ALETH_TOKEN, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_ALETH_POOL], [CURVE_ALETH_TOKEN]);
      await zap.updateRoute(WETH, CURVE_ALETH_TOKEN, [
        encodePoolHintV2(CURVE_ALETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await weth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(WETH, amountIn, CURVE_ALETH_TOKEN, amountOut);
      const before = await alethcrv.balanceOf(deployer.address);
      await zap.zap(WETH, amountIn, CURVE_ALETH_TOKEN, amountOut);
      const after = await alethcrv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when AddLiquidity alETH => Curve alETH Pool", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_ALETH_POOL, ALETH, ALETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(ALETH_HOLDER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("9.985919951408689734");

      const alethcrv = await ethers.getContractAt("IERC20", CURVE_ALETH_TOKEN, signer);
      const aleth = await ethers.getContractAt("IERC20", ALETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_ALETH_POOL], [CURVE_ALETH_TOKEN]);
      await zap.updateRoute(ALETH, CURVE_ALETH_TOKEN, [
        encodePoolHintV2(CURVE_ALETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await aleth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(ALETH, amountIn, CURVE_ALETH_TOKEN, amountOut);
      const before = await alethcrv.balanceOf(deployer.address);
      await zap.zap(ALETH, amountIn, CURVE_ALETH_TOKEN, amountOut);
      const after = await alethcrv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when RemoveLiquidity Curve alETH Pool => ETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_ALETH_POOL, CURVE_ALETH_TOKEN, CURVE_ALETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(CURVE_ALETH_HOLDER);
      const amountIn = ethers.utils.parseEther("1");
      const amountOut = ethers.utils.parseEther("1.000261142533971640");

      const alethcrv = await ethers.getContractAt("IERC20", CURVE_ALETH_TOKEN, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_ALETH_POOL], [CURVE_ALETH_TOKEN]);
      await zap.updateRoute(CURVE_ALETH_TOKEN, WETH, [
        encodePoolHintV2(CURVE_ALETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity),
      ]);
      await zap.deployed();
      await alethcrv.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(CURVE_ALETH_TOKEN, amountIn, constants.AddressZero, amountOut);
      const before = await deployer.getBalance();
      const tx = await zap.zap(CURVE_ALETH_TOKEN, amountIn, constants.AddressZero, amountOut);
      const receipt = await tx.wait();
      const after = await deployer.getBalance();
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)));
    });

    it("should succeed, when RemoveLiquidity Curve alETH Pool => WETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_ALETH_POOL, CURVE_ALETH_TOKEN, CURVE_ALETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(CURVE_ALETH_HOLDER);
      const amountIn = ethers.utils.parseEther("1");
      const amountOut = ethers.utils.parseEther("1.000261142533971640");

      const alethcrv = await ethers.getContractAt("IERC20", CURVE_ALETH_TOKEN, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_ALETH_POOL], [CURVE_ALETH_TOKEN]);
      await zap.updateRoute(CURVE_ALETH_TOKEN, WETH, [
        encodePoolHintV2(CURVE_ALETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity),
      ]);
      await zap.deployed();
      await alethcrv.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(CURVE_ALETH_TOKEN, amountIn, WETH, amountOut);
      const before = await weth.balanceOf(deployer.address);
      await zap.zap(CURVE_ALETH_TOKEN, amountIn, WETH, amountOut);
      const after = await weth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when RemoveLiquidity Curve alETH Pool => alETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_ALETH_POOL, CURVE_ALETH_TOKEN, CURVE_ALETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(CURVE_ALETH_HOLDER);
      const amountIn = ethers.utils.parseEther("1");
      const amountOut = ethers.utils.parseEther("1.001023929173032564");

      const alethcrv = await ethers.getContractAt("IERC20", CURVE_ALETH_TOKEN, signer);
      const aleth = await ethers.getContractAt("IERC20", ALETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_ALETH_POOL], [CURVE_ALETH_TOKEN]);
      await zap.updateRoute(CURVE_ALETH_TOKEN, ALETH, [
        encodePoolHintV2(CURVE_ALETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.RemoveLiquidity),
      ]);
      await zap.deployed();
      await alethcrv.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(CURVE_ALETH_TOKEN, amountIn, ALETH, amountOut);
      const before = await aleth.balanceOf(deployer.address);
      await zap.zap(CURVE_ALETH_TOKEN, amountIn, ALETH, amountOut);
      const after = await aleth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when Swap ETH => alETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_ALETH_POOL]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("10.003455535019537062");

      const aleth = await ethers.getContractAt("IERC20", ALETH, deployer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(WETH, ALETH, [
        encodePoolHintV2(CURVE_ALETH_POOL, PoolType.CurveETHPool, 2, 0, 1, Action.Swap),
      ]);
      await zap.deployed();
      const output = await zap.callStatic.zap(WETH, amountIn, ALETH, amountOut, { value: amountIn });
      const before = await aleth.balanceOf(deployer.address);
      await zap.zap(WETH, amountIn, ALETH, amountOut, { value: amountIn });
      const after = await aleth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when Swap WETH => alETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_ALETH_POOL, WETH, WETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(WETH_HOLDER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("10.003455535019537062");

      const aleth = await ethers.getContractAt("IERC20", ALETH, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(WETH, ALETH, [
        encodePoolHintV2(CURVE_ALETH_POOL, PoolType.CurveETHPool, 2, 0, 1, Action.Swap),
      ]);
      await zap.deployed();
      await weth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(WETH, amountIn, ALETH, amountOut);
      const before = await aleth.balanceOf(deployer.address);
      await zap.zap(WETH, amountIn, ALETH, amountOut);
      const after = await aleth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when Swap alETH => WETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_ALETH_POOL, ALETH, ALETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(ALETH_HOLDER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("9.988513925726708802");

      const aleth = await ethers.getContractAt("IERC20", ALETH, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(ALETH, WETH, [
        encodePoolHintV2(CURVE_ALETH_POOL, PoolType.CurveETHPool, 2, 1, 0, Action.Swap),
      ]);
      await zap.deployed();
      await aleth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(ALETH, amountIn, WETH, amountOut);
      const before = await weth.balanceOf(deployer.address);
      await zap.zap(ALETH, amountIn, WETH, amountOut);
      const after = await weth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when Swap alETH => ETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_ALETH_POOL, ALETH, ALETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(ALETH_HOLDER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("9.988513925726708802");

      const aleth = await ethers.getContractAt("IERC20", ALETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(ALETH, WETH, [
        encodePoolHintV2(CURVE_ALETH_POOL, PoolType.CurveETHPool, 2, 1, 0, Action.Swap),
      ]);
      await zap.deployed();
      await aleth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(ALETH, amountIn, constants.AddressZero, amountOut);
      const before = await deployer.getBalance();
      const tx = await zap.zap(ALETH, amountIn, constants.AddressZero, amountOut);
      const receipt = await tx.wait();
      const after = await deployer.getBalance();
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)));
    });
  });

  describe("curve cvxeth pool [CurveCryptoPool]", async () => {
    const CURVE_CVXETH_POOL = "0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4";
    const CURVE_CVXETH_TOKEN = "0x3A283D9c08E8b55966afb64C515f5143cf907611";
    const CURVE_CVXETH_HOLDER = "0x38eE5F5A39c01cB43473992C12936ba1219711ab";
    const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
    const CVX_HOLDER = "0x28C6c06298d514Db089934071355E5743bf21d60";
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";

    it("should succeed, when AddLiquidity ETH => Curve cvxeth Pool", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXETH_POOL]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("52.098597429744947571");

      const cvxethcrv = await ethers.getContractAt("IERC20", CURVE_CVXETH_TOKEN, deployer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_CVXETH_POOL], [CURVE_CVXETH_TOKEN]);
      await zap.updateRoute(WETH, CURVE_CVXETH_TOKEN, [
        encodePoolHintV2(CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ]);
      await zap.deployed();
      const output = await zap.callStatic.zap(WETH, amountIn, CURVE_CVXETH_TOKEN, amountOut, {
        value: amountIn,
      });
      const before = await cvxethcrv.balanceOf(deployer.address);
      await zap.zap(WETH, amountIn, CURVE_CVXETH_TOKEN, amountOut, {
        value: amountIn,
      });
      const after = await cvxethcrv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when AddLiquidity WETH => Curve cvxeth Pool", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXETH_POOL, WETH, WETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(WETH_HOLDER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("52.098597429744947571");

      const cvxethcrv = await ethers.getContractAt("IERC20", CURVE_CVXETH_TOKEN, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_CVXETH_POOL], [CURVE_CVXETH_TOKEN]);
      await zap.updateRoute(WETH, CURVE_CVXETH_TOKEN, [
        encodePoolHintV2(CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await weth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(WETH, amountIn, CURVE_CVXETH_TOKEN, amountOut);
      const before = await cvxethcrv.balanceOf(deployer.address);
      await zap.zap(WETH, amountIn, CURVE_CVXETH_TOKEN, amountOut);
      const after = await cvxethcrv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when AddLiquidity CVX => Curve cvxeth Pool", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXETH_POOL, CVX, CVX_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(CVX_HOLDER);
      const amountIn = ethers.utils.parseEther("1000");
      const amountOut = ethers.utils.parseEther("47.317496740359453765");

      const cvxethcrv = await ethers.getContractAt("IERC20", CURVE_CVXETH_TOKEN, signer);
      const aleth = await ethers.getContractAt("IERC20", CVX, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_CVXETH_POOL], [CURVE_CVXETH_TOKEN]);
      await zap.updateRoute(CVX, CURVE_CVXETH_TOKEN, [
        encodePoolHintV2(CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await aleth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(CVX, amountIn, CURVE_CVXETH_TOKEN, amountOut);
      const before = await cvxethcrv.balanceOf(deployer.address);
      await zap.zap(CVX, amountIn, CURVE_CVXETH_TOKEN, amountOut);
      const after = await cvxethcrv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when RemoveLiquidity Curve cvxeth Pool => ETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXETH_POOL, CURVE_CVXETH_TOKEN, CURVE_CVXETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(CURVE_CVXETH_HOLDER);
      const amountIn = ethers.utils.parseEther("52");
      const amountOut = ethers.utils.parseEther("9.944605180946443193");

      const cvxethcrv = await ethers.getContractAt("IERC20", CURVE_CVXETH_TOKEN, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_CVXETH_POOL], [CURVE_CVXETH_TOKEN]);
      await zap.updateRoute(CURVE_CVXETH_TOKEN, WETH, [
        encodePoolHintV2(CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
      ]);
      await zap.deployed();
      await cvxethcrv.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(CURVE_CVXETH_TOKEN, amountIn, constants.AddressZero, amountOut);
      const before = await deployer.getBalance();
      const tx = await zap.zap(CURVE_CVXETH_TOKEN, amountIn, constants.AddressZero, amountOut);
      const receipt = await tx.wait();
      const after = await deployer.getBalance();
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)));
    });

    it("should succeed, when RemoveLiquidity Curve cvxeth Pool => WETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXETH_POOL, CURVE_CVXETH_TOKEN, CURVE_CVXETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(CURVE_CVXETH_HOLDER);
      const amountIn = ethers.utils.parseEther("52");
      const amountOut = ethers.utils.parseEther("9.944605180946443193");

      const cvxethcrv = await ethers.getContractAt("IERC20", CURVE_CVXETH_TOKEN, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_CVXETH_POOL], [CURVE_CVXETH_TOKEN]);
      await zap.updateRoute(CURVE_CVXETH_TOKEN, WETH, [
        encodePoolHintV2(CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
      ]);
      await zap.deployed();
      await cvxethcrv.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(CURVE_CVXETH_TOKEN, amountIn, WETH, amountOut);
      const before = await weth.balanceOf(deployer.address);
      await zap.zap(CURVE_CVXETH_TOKEN, amountIn, WETH, amountOut);
      const after = await weth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when RemoveLiquidity Curve cvxeth Pool => CVX", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXETH_POOL, CURVE_CVXETH_TOKEN, CURVE_CVXETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(CURVE_CVXETH_HOLDER);
      const amountIn = ethers.utils.parseEther("47");
      const amountOut = ethers.utils.parseEther("989.668359221021063188");

      const cvxethcrv = await ethers.getContractAt("IERC20", CURVE_CVXETH_TOKEN, signer);
      const aleth = await ethers.getContractAt("IERC20", CVX, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_CVXETH_POOL], [CURVE_CVXETH_TOKEN]);
      await zap.updateRoute(CURVE_CVXETH_TOKEN, CVX, [
        encodePoolHintV2(CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
      ]);
      await zap.deployed();
      await cvxethcrv.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(CURVE_CVXETH_TOKEN, amountIn, CVX, amountOut);
      const before = await aleth.balanceOf(deployer.address);
      await zap.zap(CURVE_CVXETH_TOKEN, amountIn, CVX, amountOut);
      const after = await aleth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when Swap ETH => CVX", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXETH_POOL]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const amountIn = ethers.utils.parseEther("874");
      const amountOut = ethers.utils.parseEther("94902.901939691913288049");

      const aleth = await ethers.getContractAt("IERC20", CVX, deployer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(WETH, CVX, [
        encodePoolHintV2(CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      ]);
      await zap.deployed();
      const output = await zap.callStatic.zap(WETH, amountIn, CVX, amountOut, {
        value: amountIn,
      });
      const before = await aleth.balanceOf(deployer.address);
      await zap.zap(WETH, amountIn, CVX, amountOut, { value: amountIn });
      const after = await aleth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when Swap WETH => CVX", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXETH_POOL, WETH, WETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(WETH_HOLDER);
      const amountIn = ethers.utils.parseEther("874");
      const amountOut = ethers.utils.parseEther("94902.901939691913288049");

      const aleth = await ethers.getContractAt("IERC20", CVX, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(WETH, CVX, [
        encodePoolHintV2(CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      ]);
      await zap.deployed();
      await weth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(WETH, amountIn, CVX, amountOut);
      const before = await aleth.balanceOf(deployer.address);
      await zap.zap(WETH, amountIn, CVX, amountOut);
      const after = await aleth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when Swap CVX => WETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXETH_POOL, CVX, CVX_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(CVX_HOLDER);
      const amountIn = ethers.utils.parseEther("100000");
      const amountOut = ethers.utils.parseEther("874.755538978009491764");

      const aleth = await ethers.getContractAt("IERC20", CVX, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(CVX, WETH, [
        encodePoolHintV2(CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      ]);
      await zap.deployed();
      await aleth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(CVX, amountIn, WETH, amountOut);
      const before = await weth.balanceOf(deployer.address);
      await zap.zap(CVX, amountIn, WETH, amountOut);
      const after = await weth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when Swap CVX => ETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXETH_POOL, CVX, CVX_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(CVX_HOLDER);
      const amountIn = ethers.utils.parseEther("100000");
      const amountOut = ethers.utils.parseEther("874.755538978009491764");

      const aleth = await ethers.getContractAt("IERC20", CVX, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(CVX, WETH, [
        encodePoolHintV2(CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      ]);
      await zap.deployed();
      await aleth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(CVX, amountIn, constants.AddressZero, amountOut);
      const before = await deployer.getBalance();
      const tx = await zap.zap(CVX, amountIn, constants.AddressZero, amountOut);
      const receipt = await tx.wait();
      const after = await deployer.getBalance();
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)));
    });
  });

  describe("curve cvxfxs pool [CurveCryptoPool Factory]", async () => {
    // override fork number, since this pool doesn't exsit at original block
    const FORK_BLOCK_NUMBER = 14386700;
    const CURVE_CVXFXS_POOL = "0xd658A338613198204DCa1143Ac3F01A722b5d94A";
    const CURVE_CVXFXS_TOKEN = "0xF3A43307DcAFa93275993862Aae628fCB50dC768";
    const CURVE_CVXFXS_HOLDER = "0x289c23Cd7cACAFD4bFee6344EF376FA14f1bF42D";
    const CVXFXS = "0xFEEf77d3f69374f66429C91d732A244f074bdf74";
    const CVXFXS_HOLDER = "0x5028D77B91a3754fb38B2FBB726AF02d1FE44Db6";
    const FXS = "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0";
    const FXS_HOLDER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";

    it("should succeed, when AddLiquidity FXS => Curve cvxfxs Pool", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXFXS_POOL, FXS, FXS_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(FXS_HOLDER);
      const amountIn = ethers.utils.parseEther("100");
      const amountOut = ethers.utils.parseEther("51.029733163247604572");

      const cvxfxscrv = await ethers.getContractAt("IERC20", CURVE_CVXFXS_TOKEN, signer);
      const fxs = await ethers.getContractAt("IERC20", FXS, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_CVXFXS_POOL], [CURVE_CVXFXS_TOKEN]);
      await zap.updateRoute(FXS, CURVE_CVXFXS_TOKEN, [
        encodePoolHintV2(CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await fxs.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(FXS, amountIn, CURVE_CVXFXS_TOKEN, amountOut);
      const before = await cvxfxscrv.balanceOf(deployer.address);
      await zap.zap(FXS, amountIn, CURVE_CVXFXS_TOKEN, amountOut);
      const after = await cvxfxscrv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when AddLiquidity CVXFXS => Curve cvxfxs Pool", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXFXS_POOL, CVXFXS, CVXFXS_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(CVXFXS_HOLDER);
      const amountIn = ethers.utils.parseEther("100");
      const amountOut = ethers.utils.parseEther("48.914033769572423682");

      const cvxfxscrv = await ethers.getContractAt("IERC20", CURVE_CVXFXS_TOKEN, signer);
      const cvxfxs = await ethers.getContractAt("IERC20", CVXFXS, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_CVXFXS_POOL], [CURVE_CVXFXS_TOKEN]);
      await zap.updateRoute(CVXFXS, CURVE_CVXFXS_TOKEN, [
        encodePoolHintV2(CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await cvxfxs.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(CVXFXS, amountIn, CURVE_CVXFXS_TOKEN, amountOut);
      const before = await cvxfxscrv.balanceOf(deployer.address);
      await zap.zap(CVXFXS, amountIn, CURVE_CVXFXS_TOKEN, amountOut);
      const after = await cvxfxscrv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when RemoveLiquidity Curve cvxfxs Pool => FXS", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXFXS_POOL, CURVE_CVXFXS_TOKEN, CURVE_CVXFXS_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(CURVE_CVXFXS_HOLDER);
      const amountIn = ethers.utils.parseEther("50");
      const amountOut = ethers.utils.parseEther("97.691736873124356606");

      const cvxfxscrv = await ethers.getContractAt("IERC20", CURVE_CVXFXS_TOKEN, signer);
      const fxs = await ethers.getContractAt("IERC20", FXS, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_CVXFXS_POOL], [CURVE_CVXFXS_TOKEN]);
      await zap.updateRoute(CURVE_CVXFXS_TOKEN, FXS, [
        encodePoolHintV2(CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
      ]);
      await zap.deployed();
      await cvxfxscrv.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(CURVE_CVXFXS_TOKEN, amountIn, FXS, amountOut);
      const before = await fxs.balanceOf(deployer.address);
      await zap.zap(CURVE_CVXFXS_TOKEN, amountIn, FXS, amountOut);
      const after = await fxs.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when RemoveLiquidity Curve cvxfxs Pool => CVXFXS", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXFXS_POOL, CURVE_CVXFXS_TOKEN, CURVE_CVXFXS_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(CURVE_CVXFXS_HOLDER);
      const amountIn = ethers.utils.parseEther("50");
      const amountOut = ethers.utils.parseEther("101.917549894100147150");

      const cvxfxscrv = await ethers.getContractAt("IERC20", CURVE_CVXFXS_TOKEN, signer);
      const cvxfxs = await ethers.getContractAt("IERC20", CVXFXS, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_CVXFXS_POOL], [CURVE_CVXFXS_TOKEN]);
      await zap.updateRoute(CURVE_CVXFXS_TOKEN, CVXFXS, [
        encodePoolHintV2(CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
      ]);
      await zap.deployed();
      await cvxfxscrv.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(CURVE_CVXFXS_TOKEN, amountIn, CVXFXS, amountOut);
      const before = await cvxfxs.balanceOf(deployer.address);
      await zap.zap(CURVE_CVXFXS_TOKEN, amountIn, CVXFXS, amountOut);
      const after = await cvxfxs.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when Swap FXS => CVXFXS", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXFXS_POOL, FXS, FXS_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(FXS_HOLDER);
      const amountIn = ethers.utils.parseEther("100");
      const amountOut = ethers.utils.parseEther("104.017141457504494199");

      const cvxfxs = await ethers.getContractAt("IERC20", CVXFXS, signer);
      const fxs = await ethers.getContractAt("IERC20", FXS, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(FXS, CVXFXS, [
        encodePoolHintV2(CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      ]);
      await zap.deployed();
      await fxs.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(FXS, amountIn, CVXFXS, amountOut);
      const before = await cvxfxs.balanceOf(deployer.address);
      await zap.zap(FXS, amountIn, CVXFXS, amountOut);
      const after = await cvxfxs.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when Swap CVXFXS => FXS", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXFXS_POOL, CVXFXS, CVXFXS_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(CVXFXS_HOLDER);
      const amountIn = ethers.utils.parseEther("100");
      const amountOut = ethers.utils.parseEther("95.570530725154749812");

      const cvxfxs = await ethers.getContractAt("IERC20", CVXFXS, signer);
      const fxs = await ethers.getContractAt("IERC20", FXS, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(CVXFXS, FXS, [
        encodePoolHintV2(CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      ]);
      await zap.deployed();
      await cvxfxs.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(CVXFXS, amountIn, FXS, amountOut);
      const before = await fxs.balanceOf(deployer.address);
      await zap.zap(CVXFXS, amountIn, FXS, amountOut);
      const after = await fxs.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });
  });

  describe("curve tricrypto2 pool [CurveTriCryptoPool]", async () => {
    const CURVE_TRICRYPTO_POOL = "0xD51a44d3FaE010294C616388b506AcdA1bfAAE46";
    const CURVE_TRICRYPTO_TOKEN = "0xc4AD29ba4B3c580e6D59105FFf484999997675Ff";
    const CURVE_TRICRYPTO_HOLDER = "0x7Ac249dbf24a0234986C0FE0577556426966c2C1";
    const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
    const USDT_HOLDER = "0xD6216fC19DB775Df9774a6E33526131dA7D19a2c";
    const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
    const WBTC_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";

    it("should succeed, when AddLiquidity USDT => tricrypto2", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_TRICRYPTO_POOL, USDT, USDT_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(USDT_HOLDER);
      const amountIn = ethers.utils.parseUnits("10000", 6);
      const amountOut = ethers.utils.parseEther("7.092397042805784081");

      const tricrypto = await ethers.getContractAt("IERC20", CURVE_TRICRYPTO_TOKEN, signer);
      const usdt = await ethers.getContractAt("IERC20", USDT, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_TRICRYPTO_POOL], [CURVE_TRICRYPTO_TOKEN]);
      await zap.updateRoute(USDT, CURVE_TRICRYPTO_TOKEN, [
        encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 0, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await usdt.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(USDT, amountIn, CURVE_TRICRYPTO_TOKEN, amountOut);
      const before = await tricrypto.balanceOf(deployer.address);
      await zap.zap(USDT, amountIn, CURVE_TRICRYPTO_TOKEN, amountOut);
      const after = await tricrypto.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when AddLiquidity WBTC => tricrypto2", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_TRICRYPTO_POOL, WBTC, WBTC_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(WBTC_HOLDER);
      const amountIn = ethers.utils.parseUnits("1", 8);
      const amountOut = ethers.utils.parseEther("27.159813870200039409");

      const tricrypto = await ethers.getContractAt("IERC20", CURVE_TRICRYPTO_TOKEN, signer);
      const wbtc = await ethers.getContractAt("IERC20", WBTC, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_TRICRYPTO_POOL], [CURVE_TRICRYPTO_TOKEN]);
      await zap.updateRoute(WBTC, CURVE_TRICRYPTO_TOKEN, [
        encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 1, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await wbtc.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(WBTC, amountIn, CURVE_TRICRYPTO_TOKEN, amountOut);
      const before = await tricrypto.balanceOf(deployer.address);
      await zap.zap(WBTC, amountIn, CURVE_TRICRYPTO_TOKEN, amountOut);
      const after = await tricrypto.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when AddLiquidity WETH => tricrypto2", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_TRICRYPTO_POOL, WETH, WETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(WETH_HOLDER);
      const amountIn = ethers.utils.parseUnits("10", 18);
      const amountOut = ethers.utils.parseEther("18.695383706538259559");

      const tricrypto = await ethers.getContractAt("IERC20", CURVE_TRICRYPTO_TOKEN, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_TRICRYPTO_POOL], [CURVE_TRICRYPTO_TOKEN]);
      await zap.updateRoute(WETH, CURVE_TRICRYPTO_TOKEN, [
        encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 2, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await weth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(WETH, amountIn, CURVE_TRICRYPTO_TOKEN, amountOut);
      const before = await tricrypto.balanceOf(deployer.address);
      await zap.zap(WETH, amountIn, CURVE_TRICRYPTO_TOKEN, amountOut);
      const after = await tricrypto.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when AddLiquidity ETH => tricrypto2", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_TRICRYPTO_POOL, WETH, WETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const amountIn = ethers.utils.parseUnits("10", 18);
      const amountOut = ethers.utils.parseEther("18.695383706538259559");

      const tricrypto = await ethers.getContractAt("IERC20", CURVE_TRICRYPTO_TOKEN, deployer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_TRICRYPTO_POOL], [CURVE_TRICRYPTO_TOKEN]);
      await zap.updateRoute(WETH, CURVE_TRICRYPTO_TOKEN, [
        encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 2, Action.AddLiquidity),
      ]);
      await zap.deployed();
      const output = await zap.callStatic.zap(constants.AddressZero, amountIn, CURVE_TRICRYPTO_TOKEN, amountOut, {
        value: amountIn,
      });
      const before = await tricrypto.balanceOf(deployer.address);
      await zap.zap(constants.AddressZero, amountIn, CURVE_TRICRYPTO_TOKEN, amountOut, { value: amountIn });
      const after = await tricrypto.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    context("RemoveLiquidity from tricrypto", async () => {
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let tricrypto: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [
          DEPLOYER,
          CURVE_TRICRYPTO_POOL,
          CURVE_TRICRYPTO_TOKEN,
          CURVE_TRICRYPTO_HOLDER,
        ]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(CURVE_TRICRYPTO_HOLDER);

        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();
        await zap.updatePoolTokens([CURVE_TRICRYPTO_POOL], [CURVE_TRICRYPTO_TOKEN]);

        tricrypto = await ethers.getContractAt("IERC20", CURVE_TRICRYPTO_TOKEN, signer);
      });

      it("should succeed, when RemoveLiquidity tricrypto => USDT", async () => {
        const amountIn = ethers.utils.parseUnits("7", 18);
        const amountOut = ethers.utils.parseUnits("9855.436716", 6);
        const usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await zap.updateRoute(CURVE_TRICRYPTO_TOKEN, USDT, [
          encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 0, Action.RemoveLiquidity),
        ]);
        await tricrypto.transfer(zap.address, amountIn);
        const output = await zap.callStatic.zap(CURVE_TRICRYPTO_TOKEN, amountIn, USDT, amountOut);
        const before = await usdt.balanceOf(deployer.address);
        await zap.zap(CURVE_TRICRYPTO_TOKEN, amountIn, USDT, amountOut);
        const after = await usdt.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when RemoveLiquidity tricrypto => WBTC", async () => {
        const amountIn = ethers.utils.parseUnits("27", 18);
        const amountOut = ethers.utils.parseUnits("0.99261587", 8);
        const wbtc = await ethers.getContractAt("IERC20", WBTC, signer);
        await zap.updateRoute(CURVE_TRICRYPTO_TOKEN, WBTC, [
          encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 1, Action.RemoveLiquidity),
        ]);
        await tricrypto.transfer(zap.address, amountIn);
        const output = await zap.callStatic.zap(CURVE_TRICRYPTO_TOKEN, amountIn, WBTC, amountOut);
        const before = await wbtc.balanceOf(deployer.address);
        await zap.zap(CURVE_TRICRYPTO_TOKEN, amountIn, WBTC, amountOut);
        const after = await wbtc.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when RemoveLiquidity tricrypto => WETH", async () => {
        const amountIn = ethers.utils.parseUnits("18", 18);
        const amountOut = ethers.utils.parseUnits("9.613835315023316648", 18);
        const weth = await ethers.getContractAt("IERC20", WETH, signer);
        await zap.updateRoute(CURVE_TRICRYPTO_TOKEN, WETH, [
          encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 2, Action.RemoveLiquidity),
        ]);
        await tricrypto.transfer(zap.address, amountIn);
        const output = await zap.callStatic.zap(CURVE_TRICRYPTO_TOKEN, amountIn, WETH, amountOut);
        const before = await weth.balanceOf(deployer.address);
        await zap.zap(CURVE_TRICRYPTO_TOKEN, amountIn, WETH, amountOut);
        const after = await weth.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when RemoveLiquidity tricrypto => ETH", async () => {
        const amountIn = ethers.utils.parseUnits("18", 18);
        const amountOut = ethers.utils.parseUnits("9.613835315023316648", 18);
        await zap.updateRoute(CURVE_TRICRYPTO_TOKEN, WETH, [
          encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 2, Action.RemoveLiquidity),
        ]);
        await tricrypto.transfer(zap.address, amountIn);
        const output = await zap.callStatic.zap(CURVE_TRICRYPTO_TOKEN, amountIn, constants.AddressZero, amountOut);
        const before = await deployer.getBalance();
        const tx = await zap.zap(CURVE_TRICRYPTO_TOKEN, amountIn, constants.AddressZero, amountOut);
        const receipt = await tx.wait();
        const after = await deployer.getBalance();
        expect(output).to.eq(amountOut);
        expect(after.sub(before)).to.eq(amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)));
      });
    });

    context("Swap from USDT", async () => {
      const amountIn = ethers.utils.parseUnits("10000", 6);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let usdt: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_TRICRYPTO_POOL, USDT, USDT_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(USDT_HOLDER);

        await deployer.sendTransaction({
          to: signer.address,
          value: ethers.utils.parseEther("10"),
        });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await usdt.transfer(zap.address, amountIn);
      });

      it("should succeed, when Swap USDT => WBTC", async () => {
        const amountOut = ethers.utils.parseUnits("0.26074910", 8);
        const wbtc = await ethers.getContractAt("IERC20", WBTC, signer);
        await zap.updateRoute(USDT, WBTC, [
          encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 1, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(USDT, amountIn, WBTC, amountOut);
        const before = await wbtc.balanceOf(deployer.address);
        await zap.zap(USDT, amountIn, WBTC, amountOut);
        const after = await wbtc.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when Swap USDT => WETH", async () => {
        const amountOut = ethers.utils.parseUnits("3.788117917040165798", 18);
        const weth = await ethers.getContractAt("IERC20", WETH, signer);
        await zap.updateRoute(USDT, WETH, [
          encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 2, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(USDT, amountIn, WETH, amountOut);
        const before = await weth.balanceOf(deployer.address);
        await zap.zap(USDT, amountIn, WETH, amountOut);
        const after = await weth.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when Swap USDT => ETH", async () => {
        const amountOut = ethers.utils.parseUnits("3.788117917040165798", 18);
        await zap.updateRoute(USDT, WETH, [
          encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 2, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(USDT, amountIn, constants.AddressZero, amountOut);
        const before = await deployer.getBalance();
        const tx = await zap.zap(USDT, amountIn, constants.AddressZero, amountOut);
        const receipt = await tx.wait();
        const after = await deployer.getBalance();
        expect(output).to.eq(amountOut);
        expect(after.sub(before)).to.eq(amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)));
      });
    });

    context("Swap from WBTC", async () => {
      const amountIn = ethers.utils.parseUnits("1", 8);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let wbtc: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_TRICRYPTO_POOL, WBTC, WBTC_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(WBTC_HOLDER);

        await deployer.sendTransaction({
          to: signer.address,
          value: ethers.utils.parseEther("10"),
        });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        wbtc = await ethers.getContractAt("IERC20", WBTC, signer);
        await wbtc.transfer(zap.address, amountIn);
      });

      it("should succeed, when Swap WBTC => USDT", async () => {
        const amountOut = ethers.utils.parseUnits("38235.556224", 6);
        const usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await zap.updateRoute(WBTC, USDT, [
          encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 0, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(WBTC, amountIn, USDT, amountOut);
        const before = await usdt.balanceOf(deployer.address);
        await zap.zap(WBTC, amountIn, USDT, amountOut);
        const after = await usdt.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when Swap WBTC => WETH", async () => {
        const amountOut = ethers.utils.parseUnits("14.505581787411502275", 18);
        const weth = await ethers.getContractAt("IERC20", WETH, signer);
        await zap.updateRoute(WBTC, WETH, [
          encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(WBTC, amountIn, WETH, amountOut);
        const before = await weth.balanceOf(deployer.address);
        await zap.zap(WBTC, amountIn, WETH, amountOut);
        const after = await weth.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when Swap WBTC => ETH", async () => {
        const amountOut = ethers.utils.parseUnits("14.505581787411502275", 18);
        await zap.updateRoute(WBTC, WETH, [
          encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(WBTC, amountIn, constants.AddressZero, amountOut);
        const before = await deployer.getBalance();
        const tx = await zap.zap(WBTC, amountIn, constants.AddressZero, amountOut);
        const receipt = await tx.wait();
        const after = await deployer.getBalance();
        expect(output).to.eq(amountOut);
        expect(after.sub(before)).to.eq(amountOut.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice)));
      });
    });

    context("Swap from WETH", async () => {
      const amountIn = ethers.utils.parseUnits("10", 18);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let weth: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_TRICRYPTO_POOL, WETH, WETH_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(WETH_HOLDER);

        await deployer.sendTransaction({
          to: signer.address,
          value: ethers.utils.parseEther("10"),
        });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        weth = await ethers.getContractAt("IERC20", WETH, signer);
        await weth.transfer(zap.address, amountIn);
      });

      it("should succeed, when Swap WETH => USDT", async () => {
        const amountOut = ethers.utils.parseUnits("26320.367274", 6);
        const usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await zap.updateRoute(WETH, USDT, [
          encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 0, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(WETH, amountIn, USDT, amountOut);
        const before = await usdt.balanceOf(deployer.address);
        await zap.zap(WETH, amountIn, USDT, amountOut);
        const after = await usdt.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when Swap WETH => WBTC", async () => {
        const amountOut = ethers.utils.parseUnits("0.68730981", 8);
        const wbtc = await ethers.getContractAt("IERC20", WBTC, signer);
        await zap.updateRoute(WETH, WBTC, [
          encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(WETH, amountIn, WBTC, amountOut);
        const before = await wbtc.balanceOf(deployer.address);
        await zap.zap(WETH, amountIn, WBTC, amountOut);
        const after = await wbtc.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });
    });

    context("Swap from ETH", async () => {
      const amountIn = ethers.utils.parseUnits("10", 18);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_TRICRYPTO_POOL]);
        deployer = await ethers.getSigner(DEPLOYER);

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();
      });

      it("should succeed, when Swap ETH => USDT", async () => {
        const amountOut = ethers.utils.parseUnits("26320.367274", 6);
        const usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await zap.updateRoute(WETH, USDT, [
          encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 0, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(constants.AddressZero, amountIn, USDT, amountOut, { value: amountIn });
        const before = await usdt.balanceOf(deployer.address);
        await zap.zap(constants.AddressZero, amountIn, USDT, amountOut, { value: amountIn });
        const after = await usdt.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when Swap ETH => WBTC", async () => {
        const amountOut = ethers.utils.parseUnits("0.68730981", 8);
        const wbtc = await ethers.getContractAt("IERC20", WBTC, signer);
        await zap.updateRoute(WETH, WBTC, [
          encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(constants.AddressZero, amountIn, WBTC, amountOut, { value: amountIn });
        const before = await wbtc.balanceOf(deployer.address);
        await zap.zap(constants.AddressZero, amountIn, WBTC, amountOut, { value: amountIn });
        const after = await wbtc.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });
    });
  });

  describe("curve ren pool [CurveBasePool, 2 tokens]", async () => {
    const CURVE_REN_POOL = "0x93054188d876f558f4a66B2EF1d97d16eDf0895B";
    const CURVE_REN_TOKEN = "0x49849C98ae39Fff122806C06791Fa73784FB3675";
    const CURVE_REN_HOLDER = "0x457eBcAAb3B5b94708207481B9510A983E671517";
    const RENBTC = "0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D";
    const RENBTC_HOLDER = "0xDAef20EA4708FcFf06204A4FE9ddf41dB056bA18";
    const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
    const WBTC_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";

    it("should succeed, when AddLiquidity RENBTC => ren", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_REN_POOL, RENBTC, RENBTC_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(RENBTC_HOLDER);
      const amountIn = ethers.utils.parseUnits("10", 8);
      const amountOut = ethers.utils.parseEther("9.816627893381051906");

      const rencrv = await ethers.getContractAt("IERC20", CURVE_REN_TOKEN, signer);
      const renbtc = await ethers.getContractAt("IERC20", RENBTC, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_REN_POOL], [CURVE_REN_TOKEN]);
      await zap.updateRoute(RENBTC, CURVE_REN_TOKEN, [
        encodePoolHintV2(CURVE_REN_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await renbtc.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(RENBTC, amountIn, CURVE_REN_TOKEN, amountOut);
      const before = await rencrv.balanceOf(deployer.address);
      await zap.zap(RENBTC, amountIn, CURVE_REN_TOKEN, amountOut);
      const after = await rencrv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when AddLiquidity WBTC => ren", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_REN_POOL, WBTC, WBTC_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(WBTC_HOLDER);
      const amountIn = ethers.utils.parseUnits("10", 8);
      const amountOut = ethers.utils.parseEther("9.818815447096551210");

      const rencrv = await ethers.getContractAt("IERC20", CURVE_REN_TOKEN, signer);
      const wbtc = await ethers.getContractAt("IERC20", WBTC, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_REN_POOL], [CURVE_REN_TOKEN]);
      await zap.updateRoute(WBTC, CURVE_REN_TOKEN, [
        encodePoolHintV2(CURVE_REN_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await wbtc.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(WBTC, amountIn, CURVE_REN_TOKEN, amountOut);
      const before = await rencrv.balanceOf(deployer.address);
      await zap.zap(WBTC, amountIn, CURVE_REN_TOKEN, amountOut);
      const after = await rencrv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    context("RemoveLiquidity from ren", async () => {
      const amountIn = ethers.utils.parseUnits("10", 18);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let rencrv: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_REN_POOL, CURVE_REN_TOKEN, CURVE_REN_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(CURVE_REN_HOLDER);

        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();
        await zap.updatePoolTokens([CURVE_REN_POOL], [CURVE_REN_TOKEN]);

        rencrv = await ethers.getContractAt("IERC20", CURVE_REN_TOKEN, signer);
        await rencrv.transfer(zap.address, amountIn);
      });

      it("should succeed, when RemoveLiquidity rencrv => RENBTC", async () => {
        const amountOut = ethers.utils.parseUnits("10.18326083", 8);
        const renbtc = await ethers.getContractAt("IERC20", RENBTC, signer);
        await zap.updateRoute(CURVE_REN_TOKEN, RENBTC, [
          encodePoolHintV2(CURVE_REN_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.RemoveLiquidity),
        ]);
        const output = await zap.callStatic.zap(CURVE_REN_TOKEN, amountIn, RENBTC, amountOut);
        const before = await renbtc.balanceOf(deployer.address);
        await zap.zap(CURVE_REN_TOKEN, amountIn, RENBTC, amountOut);
        const after = await renbtc.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when RemoveLiquidity rencrv => WBTC", async () => {
        const amountOut = ethers.utils.parseUnits("10.17990247", 8);
        const wbtc = await ethers.getContractAt("IERC20", WBTC, signer);
        await zap.updateRoute(CURVE_REN_TOKEN, WBTC, [
          encodePoolHintV2(CURVE_REN_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.RemoveLiquidity),
        ]);
        const output = await zap.callStatic.zap(CURVE_REN_TOKEN, amountIn, WBTC, amountOut);
        const before = await wbtc.balanceOf(deployer.address);
        await zap.zap(CURVE_REN_TOKEN, amountIn, WBTC, amountOut);
        const after = await wbtc.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });
    });

    context("Swap from RENBTC", async () => {
      const amountIn = ethers.utils.parseUnits("10", 8);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let renbtc: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_REN_POOL, RENBTC, RENBTC_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(RENBTC_HOLDER);

        await deployer.sendTransaction({
          to: signer.address,
          value: ethers.utils.parseEther("10"),
        });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        renbtc = await ethers.getContractAt("IERC20", RENBTC, signer);
        await renbtc.transfer(zap.address, amountIn);
      });

      it("should succeed, when Swap RENBTC => WBTC", async () => {
        const amountOut = ethers.utils.parseUnits("9.99322432", 8);
        const wbtc = await ethers.getContractAt("IERC20", WBTC, signer);
        await zap.updateRoute(RENBTC, WBTC, [
          encodePoolHintV2(CURVE_REN_POOL, PoolType.CurveBasePool, 2, 0, 1, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(RENBTC, amountIn, WBTC, amountOut);
        const before = await wbtc.balanceOf(deployer.address);
        await zap.zap(RENBTC, amountIn, WBTC, amountOut);
        const after = await wbtc.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });
    });

    context("Swap from WBTC", async () => {
      const amountIn = ethers.utils.parseUnits("10", 8);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let wbtc: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_REN_POOL, WBTC, WBTC_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(WBTC_HOLDER);

        await deployer.sendTransaction({
          to: signer.address,
          value: ethers.utils.parseEther("10"),
        });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        wbtc = await ethers.getContractAt("IERC20", WBTC, signer);
        await wbtc.transfer(zap.address, amountIn);
      });

      it("should succeed, when Swap WBTC => RENBTC", async () => {
        const amountOut = ethers.utils.parseUnits("9.99874871", 8);
        const renbtc = await ethers.getContractAt("IERC20", RENBTC, signer);
        await zap.updateRoute(WBTC, RENBTC, [
          encodePoolHintV2(CURVE_REN_POOL, PoolType.CurveBasePool, 2, 1, 0, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(WBTC, amountIn, RENBTC, amountOut);
        const before = await renbtc.balanceOf(deployer.address);
        await zap.zap(WBTC, amountIn, RENBTC, amountOut);
        const after = await renbtc.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });
    });
  });

  describe("curve 3pool pool [CurveBasePool, 3 tokens]", async () => {
    const CURVE_TRICRV_POOL = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
    const CURVE_TRICRV_TOKEN = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
    const CURVE_TRICRV_HOLDER = "0x5c00977a2002a3C9925dFDfb6815765F578a804f";
    const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
    const DAI_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
    const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const USDC_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
    const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
    const USDT_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";

    it("should succeed, when AddLiquidity DAI => 3pool", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_TRICRV_POOL, DAI, DAI_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(DAI_HOLDER);
      const amountIn = ethers.utils.parseUnits("10000", 18);
      const amountOut = ethers.utils.parseEther("9798.009178188154502567");

      const tricrv = await ethers.getContractAt("IERC20", CURVE_TRICRV_TOKEN, signer);
      const dai = await ethers.getContractAt("IERC20", DAI, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_TRICRV_POOL], [CURVE_TRICRV_TOKEN]);
      await zap.updateRoute(DAI, CURVE_TRICRV_TOKEN, [
        encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 0, 0, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await dai.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(DAI, amountIn, CURVE_TRICRV_TOKEN, amountOut);
      const before = await tricrv.balanceOf(deployer.address);
      await zap.zap(DAI, amountIn, CURVE_TRICRV_TOKEN, amountOut);
      const after = await tricrv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when AddLiquidity USDC => 3pool", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_TRICRV_POOL, USDC, USDC_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(USDC_HOLDER);
      const amountIn = ethers.utils.parseUnits("10000", 6);
      const amountOut = ethers.utils.parseEther("9798.181306202241241655");

      const tricrv = await ethers.getContractAt("IERC20", CURVE_TRICRV_TOKEN, signer);
      const usdc = await ethers.getContractAt("IERC20", USDC, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_TRICRV_POOL], [CURVE_TRICRV_TOKEN]);
      await zap.updateRoute(USDC, CURVE_TRICRV_TOKEN, [
        encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 1, 1, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await usdc.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(USDC, amountIn, CURVE_TRICRV_TOKEN, amountOut);
      const before = await tricrv.balanceOf(deployer.address);
      await zap.zap(USDC, amountIn, CURVE_TRICRV_TOKEN, amountOut);
      const after = await tricrv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when AddLiquidity USDT => 3pool", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_TRICRV_POOL, USDT, USDT_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(USDT_HOLDER);
      const amountIn = ethers.utils.parseUnits("10000", 6);
      const amountOut = ethers.utils.parseEther("9802.106951093278030160");

      const tricrv = await ethers.getContractAt("IERC20", CURVE_TRICRV_TOKEN, signer);
      const usdt = await ethers.getContractAt("IERC20", USDT, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_TRICRV_POOL], [CURVE_TRICRV_TOKEN]);
      await zap.updateRoute(USDT, CURVE_TRICRV_TOKEN, [
        encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 2, 2, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await usdt.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(USDT, amountIn, CURVE_TRICRV_TOKEN, amountOut);
      const before = await tricrv.balanceOf(deployer.address);
      await zap.zap(USDT, amountIn, CURVE_TRICRV_TOKEN, amountOut);
      const after = await tricrv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    context("RemoveLiquidity from tricrv", async () => {
      const amountIn = ethers.utils.parseUnits("10000", 18);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let tricrv: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_TRICRV_POOL, CURVE_TRICRV_TOKEN, CURVE_TRICRV_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(CURVE_TRICRV_HOLDER);

        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();
        await zap.updatePoolTokens([CURVE_TRICRV_POOL], [CURVE_TRICRV_TOKEN]);

        tricrv = await ethers.getContractAt("IERC20", CURVE_TRICRV_TOKEN, signer);
        await tricrv.transfer(zap.address, amountIn);
      });

      it("should succeed, when RemoveLiquidity tricrv => DAI", async () => {
        const amountOut = ethers.utils.parseUnits("10203.429992452974185452", 18);
        const dai = await ethers.getContractAt("IERC20", DAI, signer);
        await zap.updateRoute(CURVE_TRICRV_TOKEN, DAI, [
          encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 0, 0, Action.RemoveLiquidity),
        ]);
        await tricrv.transfer(zap.address, amountIn);
        const output = await zap.callStatic.zap(CURVE_TRICRV_TOKEN, amountIn, DAI, amountOut);
        const before = await dai.balanceOf(deployer.address);
        await zap.zap(CURVE_TRICRV_TOKEN, amountIn, DAI, amountOut);
        const after = await dai.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when RemoveLiquidity tricrv => USDC", async () => {
        const amountOut = ethers.utils.parseUnits("10203.168611", 6);
        const usdc = await ethers.getContractAt("IERC20", USDC, signer);
        await zap.updateRoute(CURVE_TRICRV_TOKEN, USDC, [
          encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 1, 1, Action.RemoveLiquidity),
        ]);
        await tricrv.transfer(zap.address, amountIn);
        const output = await zap.callStatic.zap(CURVE_TRICRV_TOKEN, amountIn, USDC, amountOut);
        const before = await usdc.balanceOf(deployer.address);
        await zap.zap(CURVE_TRICRV_TOKEN, amountIn, USDC, amountOut);
        const after = await usdc.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when RemoveLiquidity tricrv => USDT", async () => {
        const amountOut = ethers.utils.parseUnits("10198.236907", 6);
        const usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await zap.updateRoute(CURVE_TRICRV_TOKEN, USDT, [
          encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 2, 2, Action.RemoveLiquidity),
        ]);
        const output = await zap.callStatic.zap(CURVE_TRICRV_TOKEN, amountIn, USDT, amountOut);
        const before = await usdt.balanceOf(deployer.address);
        await zap.zap(CURVE_TRICRV_TOKEN, amountIn, USDT, amountOut);
        const after = await usdt.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });
    });

    context("Swap from DAI", async () => {
      const amountIn = ethers.utils.parseUnits("10000", 18);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let dai: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_TRICRV_POOL, DAI, DAI_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(DAI_HOLDER);

        await deployer.sendTransaction({
          to: signer.address,
          value: ethers.utils.parseEther("10"),
        });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        dai = await ethers.getContractAt("IERC20", DAI, signer);
        await dai.transfer(zap.address, amountIn);
      });

      it("should succeed, when Swap DAI => USDC", async () => {
        const amountOut = ethers.utils.parseUnits("9996.784114", 6);
        const usdc = await ethers.getContractAt("IERC20", USDC, signer);
        await zap.updateRoute(DAI, USDC, [
          encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 0, 1, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(DAI, amountIn, USDC, amountOut);
        const before = await usdc.balanceOf(deployer.address);
        await zap.zap(DAI, amountIn, USDC, amountOut);
        const after = await usdc.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when Swap DAI => USDT", async () => {
        const amountOut = ethers.utils.parseUnits("9992.366274", 6);
        const usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await zap.updateRoute(DAI, USDT, [
          encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 0, 2, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(DAI, amountIn, USDT, amountOut);
        const before = await usdt.balanceOf(deployer.address);
        await zap.zap(DAI, amountIn, USDT, amountOut);
        const after = await usdt.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });
    });

    context("Swap from USDC", async () => {
      const amountIn = ethers.utils.parseUnits("10000", 6);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let usdc: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_TRICRV_POOL, USDC, USDC_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(USDC_HOLDER);

        await deployer.sendTransaction({
          to: signer.address,
          value: ethers.utils.parseEther("10"),
        });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        usdc = await ethers.getContractAt("IERC20", USDC, signer);
        await usdc.transfer(zap.address, amountIn);
      });

      it("should succeed, when Swap USDC => DAI", async () => {
        const amountOut = ethers.utils.parseUnits("9997.215832754748681058", 18);
        const dai = await ethers.getContractAt("IERC20", DAI, signer);
        await zap.updateRoute(USDC, DAI, [
          encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 1, 0, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(USDC, amountIn, DAI, amountOut);
        const before = await dai.balanceOf(deployer.address);
        await zap.zap(USDC, amountIn, DAI, amountOut);
        const after = await dai.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when Swap USDC => USDT", async () => {
        const amountOut = ethers.utils.parseUnits("9992.582035", 6);
        const usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await zap.updateRoute(USDC, USDT, [
          encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 1, 2, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(USDC, amountIn, USDT, amountOut);
        const before = await usdt.balanceOf(deployer.address);
        await zap.zap(USDC, amountIn, USDT, amountOut);
        const after = await usdt.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });
    });

    context("Swap from USDT", async () => {
      const amountIn = ethers.utils.parseUnits("10000", 6);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let usdt: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_TRICRV_POOL, USDT, USDT_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(USDT_HOLDER);

        await deployer.sendTransaction({
          to: signer.address,
          value: ethers.utils.parseEther("10"),
        });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await usdt.transfer(zap.address, amountIn);
      });

      it("should succeed, when Swap USDT => DAI", async () => {
        const amountOut = ethers.utils.parseUnits("10001.635711368714231696", 18);
        const dai = await ethers.getContractAt("IERC20", DAI, signer);
        await zap.updateRoute(USDT, DAI, [
          encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 2, 0, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(USDT, amountIn, DAI, amountOut);
        const before = await dai.balanceOf(deployer.address);
        await zap.zap(USDT, amountIn, DAI, amountOut);
        const after = await dai.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when Swap USDT => USDC", async () => {
        const amountOut = ethers.utils.parseUnits("10001.419754", 6);
        const usdc = await ethers.getContractAt("IERC20", USDC, signer);
        await zap.updateRoute(USDT, USDC, [
          encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 2, 1, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(USDT, amountIn, USDC, amountOut);
        const before = await usdc.balanceOf(deployer.address);
        await zap.zap(USDT, amountIn, USDC, amountOut);
        const after = await usdc.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });
    });
  });

  describe("curve frax pool [CurveFactoryMetaPool, with 3crv]", async () => {
    const FORK_BLOCK_NUMBER = 14412700;
    const CURVE_FRAX3CRV_POOL = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B";
    const CURVE_FRAX3CRV_TOKEN = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B";
    const CURVE_FRAX3CRV_HOLDER = "0xca436e14855323927d6e6264470ded36455fc8bd";
    const FRAX = "0x853d955aCEf822Db058eb8505911ED77F175b99e";
    const FRAX_HOLDER = "0x10c6b61DbF44a083Aec3780aCF769C77BE747E23";
    const TRICRV = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
    const CURVE_TRICRV_HOLDER = "0x5c00977a2002a3C9925dFDfb6815765F578a804f";

    it("should succeed, when AddLiquidity FRAX => FRAX3CRV", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_FRAX3CRV_POOL, FRAX, FRAX_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(FRAX_HOLDER);
      const amountIn = ethers.utils.parseUnits("10000", 18);
      const amountOut = ethers.utils.parseEther("9923.863722498112354092");

      const frax3crv = await ethers.getContractAt("IERC20", CURVE_FRAX3CRV_TOKEN, signer);
      const frax = await ethers.getContractAt("IERC20", FRAX, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_FRAX3CRV_POOL], [CURVE_FRAX3CRV_TOKEN]);
      await zap.updateRoute(FRAX, CURVE_FRAX3CRV_TOKEN, [
        encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await frax.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(FRAX, amountIn, CURVE_FRAX3CRV_TOKEN, amountOut);
      const before = await frax3crv.balanceOf(deployer.address);
      await zap.zap(FRAX, amountIn, CURVE_FRAX3CRV_TOKEN, amountOut);
      const after = await frax3crv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when AddLiquidity TRICRV => FRAX3CRV", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_FRAX3CRV_POOL, TRICRV, CURVE_TRICRV_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(CURVE_TRICRV_HOLDER);
      const amountIn = ethers.utils.parseUnits("10000", 18);
      const amountOut = ethers.utils.parseEther("10128.738489162536809134");

      const frax3crv = await ethers.getContractAt("IERC20", CURVE_FRAX3CRV_TOKEN, signer);
      const tricrv = await ethers.getContractAt("IERC20", TRICRV, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_FRAX3CRV_POOL], [CURVE_FRAX3CRV_TOKEN]);
      await zap.updateRoute(TRICRV, CURVE_FRAX3CRV_TOKEN, [
        encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await tricrv.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(TRICRV, amountIn, CURVE_FRAX3CRV_TOKEN, amountOut);
      const before = await frax3crv.balanceOf(deployer.address);
      await zap.zap(TRICRV, amountIn, CURVE_FRAX3CRV_TOKEN, amountOut);
      const after = await frax3crv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    context("RemoveLiquidity from FRAX3CRV", async () => {
      const amountIn = ethers.utils.parseUnits("10000", 18);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let frax3crv: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_FRAX3CRV_POOL, CURVE_FRAX3CRV_TOKEN, CURVE_FRAX3CRV_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(CURVE_FRAX3CRV_HOLDER);

        await deployer.sendTransaction({
          to: signer.address,
          value: ethers.utils.parseEther("10"),
        });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();
        await zap.updatePoolTokens([CURVE_FRAX3CRV_POOL], [CURVE_FRAX3CRV_TOKEN]);

        frax3crv = await ethers.getContractAt("IERC20", CURVE_FRAX3CRV_TOKEN, signer);
        await frax3crv.transfer(zap.address, amountIn);
      });

      it("should succeed, when RemoveLiquidity frax3crv => FRAX", async () => {
        const amountOut = ethers.utils.parseUnits("10073.161115823482038258", 18);
        const frax = await ethers.getContractAt("IERC20", FRAX, signer);
        await zap.updateRoute(CURVE_FRAX3CRV_TOKEN, FRAX, [
          encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.RemoveLiquidity),
        ]);
        await frax3crv.transfer(zap.address, amountIn);
        const output = await zap.callStatic.zap(CURVE_FRAX3CRV_TOKEN, amountIn, FRAX, amountOut);
        const before = await frax.balanceOf(deployer.address);
        await zap.zap(CURVE_FRAX3CRV_TOKEN, amountIn, FRAX, amountOut);
        const after = await frax.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when RemoveLiquidity frax3crv => TRICRV", async () => {
        const amountOut = ethers.utils.parseUnits("9868.487528376312253157", 18);
        const tricrv = await ethers.getContractAt("IERC20", TRICRV, signer);
        await zap.updateRoute(CURVE_FRAX3CRV_TOKEN, TRICRV, [
          encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.RemoveLiquidity),
        ]);
        await frax3crv.transfer(zap.address, amountIn);
        const output = await zap.callStatic.zap(CURVE_FRAX3CRV_TOKEN, amountIn, TRICRV, amountOut);
        const before = await tricrv.balanceOf(deployer.address);
        await zap.zap(CURVE_FRAX3CRV_TOKEN, amountIn, TRICRV, amountOut);
        const after = await tricrv.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });
    });

    context("Swap from FRAX", async () => {
      const amountIn = ethers.utils.parseUnits("10000", 18);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let frax: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_FRAX3CRV_POOL, FRAX, FRAX_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(FRAX_HOLDER);

        await deployer.sendTransaction({
          to: signer.address,
          value: ethers.utils.parseEther("10"),
        });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        frax = await ethers.getContractAt("IERC20", FRAX, signer);
        await frax.transfer(zap.address, amountIn);
      });

      it("should succeed, when Swap FRAX => TRICRV", async () => {
        const amountOut = ethers.utils.parseUnits("9793.352128669244552812", 18);
        const tricrv = await ethers.getContractAt("IERC20", TRICRV, signer);
        await zap.updateRoute(FRAX, TRICRV, [
          encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 1, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(FRAX, amountIn, TRICRV, amountOut);
        const before = await tricrv.balanceOf(deployer.address);
        await zap.zap(FRAX, amountIn, TRICRV, amountOut);
        const after = await tricrv.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });
    });

    context("Swap from TRICRV", async () => {
      const amountIn = ethers.utils.parseUnits("10000", 18);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let tricrv: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_FRAX3CRV_POOL, TRICRV, CURVE_TRICRV_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(CURVE_TRICRV_HOLDER);

        await deployer.sendTransaction({
          to: signer.address,
          value: ethers.utils.parseEther("10"),
        });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        tricrv = await ethers.getContractAt("IERC20", TRICRV, signer);
        await tricrv.transfer(zap.address, amountIn);
      });

      it("should succeed, when Swap TRICRV => FRAX", async () => {
        const amountOut = ethers.utils.parseUnits("10202.841043093473386193", 18);
        const frax = await ethers.getContractAt("IERC20", FRAX, signer);
        await zap.updateRoute(TRICRV, FRAX, [
          encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 0, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(TRICRV, amountIn, FRAX, amountOut);
        const before = await frax.balanceOf(deployer.address);
        await zap.zap(TRICRV, amountIn, FRAX, amountOut);
        const after = await frax.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });
    });
  });

  describe("curve frax pool [CurveFactoryUSDMetaPoolUnderlying]", async () => {
    const FORK_BLOCK_NUMBER = 14412700;
    const CURVE_FRAX3CRV_POOL = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B";
    const CURVE_FRAX3CRV_TOKEN = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B";
    const CURVE_FRAX3CRV_HOLDER = "0xca436e14855323927d6e6264470ded36455fc8bd";
    const FRAX = "0x853d955aCEf822Db058eb8505911ED77F175b99e";
    const FRAX_HOLDER = "0x10c6b61DbF44a083Aec3780aCF769C77BE747E23";
    const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
    const DAI_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
    const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const USDC_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
    const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
    const USDT_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";

    it("should succeed, when AddLiquidity FRAX => FRAX3CRV", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_FRAX3CRV_POOL, FRAX, FRAX_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(FRAX_HOLDER);
      const amountIn = ethers.utils.parseUnits("10000", 18);
      const amountOut = ethers.utils.parseEther("9923.863722498112354092");

      const tricrv = await ethers.getContractAt("IERC20", CURVE_FRAX3CRV_TOKEN, signer);
      const frax = await ethers.getContractAt("IERC20", FRAX, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_FRAX3CRV_POOL], [CURVE_FRAX3CRV_TOKEN]);
      await zap.updateRoute(FRAX, CURVE_FRAX3CRV_TOKEN, [
        encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 0, 0, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await frax.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(FRAX, amountIn, CURVE_FRAX3CRV_TOKEN, amountOut);
      const before = await tricrv.balanceOf(deployer.address);
      await zap.zap(FRAX, amountIn, CURVE_FRAX3CRV_TOKEN, amountOut);
      const after = await tricrv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when AddLiquidity DAI => FRAX3CRV", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_FRAX3CRV_POOL, DAI, DAI_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(DAI_HOLDER);
      const amountIn = ethers.utils.parseUnits("10000", 18);
      const amountOut = ethers.utils.parseEther("9922.811372804320764078");

      const tricrv = await ethers.getContractAt("IERC20", CURVE_FRAX3CRV_TOKEN, signer);
      const dai = await ethers.getContractAt("IERC20", DAI, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_FRAX3CRV_POOL], [CURVE_FRAX3CRV_TOKEN]);
      await zap.updateRoute(DAI, CURVE_FRAX3CRV_TOKEN, [
        encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 1, 1, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await dai.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(DAI, amountIn, CURVE_FRAX3CRV_TOKEN, amountOut);
      const before = await tricrv.balanceOf(deployer.address);
      await zap.zap(DAI, amountIn, CURVE_FRAX3CRV_TOKEN, amountOut);
      const after = await tricrv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when AddLiquidity USDC => FRAX3CRV", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_FRAX3CRV_POOL, USDC, USDC_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(USDC_HOLDER);
      const amountIn = ethers.utils.parseUnits("10000", 6);
      const amountOut = ethers.utils.parseEther("9922.655813438739325194");

      const tricrv = await ethers.getContractAt("IERC20", CURVE_FRAX3CRV_TOKEN, signer);
      const usdc = await ethers.getContractAt("IERC20", USDC, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_FRAX3CRV_POOL], [CURVE_FRAX3CRV_TOKEN]);
      await zap.updateRoute(USDC, CURVE_FRAX3CRV_TOKEN, [
        encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 2, 2, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await usdc.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(USDC, amountIn, CURVE_FRAX3CRV_TOKEN, amountOut);
      const before = await tricrv.balanceOf(deployer.address);
      await zap.zap(USDC, amountIn, CURVE_FRAX3CRV_TOKEN, amountOut);
      const after = await tricrv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    it("should succeed, when AddLiquidity USDT => FRAX3CRV", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_FRAX3CRV_POOL, USDT, USDT_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(USDT_HOLDER);
      const amountIn = ethers.utils.parseUnits("10000", 6);
      const amountOut = ethers.utils.parseEther("9927.139047594986992958");

      const tricrv = await ethers.getContractAt("IERC20", CURVE_FRAX3CRV_TOKEN, signer);
      const usdt = await ethers.getContractAt("IERC20", USDT, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updatePoolTokens([CURVE_FRAX3CRV_POOL], [CURVE_FRAX3CRV_TOKEN]);
      await zap.updateRoute(USDT, CURVE_FRAX3CRV_TOKEN, [
        encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 3, 3, Action.AddLiquidity),
      ]);
      await zap.deployed();
      await usdt.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(USDT, amountIn, CURVE_FRAX3CRV_TOKEN, amountOut);
      const before = await tricrv.balanceOf(deployer.address);
      await zap.zap(USDT, amountIn, CURVE_FRAX3CRV_TOKEN, amountOut);
      const after = await tricrv.balanceOf(deployer.address);
      expect(after.sub(before)).to.eq(amountOut);
      expect(output).to.eq(amountOut);
    });

    context("RemoveLiquidity from FRAX3CRV", async () => {
      const amountIn = ethers.utils.parseUnits("10000", 18);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let frax3crv: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_FRAX3CRV_POOL, CURVE_FRAX3CRV_TOKEN, CURVE_FRAX3CRV_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(CURVE_FRAX3CRV_HOLDER);

        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();
        await zap.updatePoolTokens([CURVE_FRAX3CRV_POOL], [CURVE_FRAX3CRV_TOKEN]);

        frax3crv = await ethers.getContractAt("IERC20", CURVE_FRAX3CRV_TOKEN, signer);
        await frax3crv.transfer(zap.address, amountIn);
      });

      it("should succeed, when RemoveLiquidity FRAX3CRV => FRAX", async () => {
        const amountOut = ethers.utils.parseUnits("10073.161115823482038258", 18);
        const frax = await ethers.getContractAt("IERC20", FRAX, signer);
        await zap.updateRoute(CURVE_FRAX3CRV_TOKEN, FRAX, [
          encodePoolHintV2(
            CURVE_FRAX3CRV_POOL,
            PoolType.CurveFactoryUSDMetaPoolUnderlying,
            4,
            0,
            0,
            Action.RemoveLiquidity
          ),
        ]);
        const output = await zap.callStatic.zap(CURVE_FRAX3CRV_TOKEN, amountIn, FRAX, amountOut);
        const before = await frax.balanceOf(deployer.address);
        await zap.zap(CURVE_FRAX3CRV_TOKEN, amountIn, FRAX, amountOut);
        const after = await frax.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when RemoveLiquidity FRAX3CRV => DAI", async () => {
        const amountOut = ethers.utils.parseUnits("10070.601201457344715035", 18);
        const dai = await ethers.getContractAt("IERC20", DAI, signer);
        await zap.updateRoute(CURVE_FRAX3CRV_TOKEN, DAI, [
          encodePoolHintV2(
            CURVE_FRAX3CRV_POOL,
            PoolType.CurveFactoryUSDMetaPoolUnderlying,
            4,
            1,
            1,
            Action.RemoveLiquidity
          ),
        ]);
        const output = await zap.callStatic.zap(CURVE_FRAX3CRV_TOKEN, amountIn, DAI, amountOut);
        const before = await dai.balanceOf(deployer.address);
        await zap.zap(CURVE_FRAX3CRV_TOKEN, amountIn, DAI, amountOut);
        const after = await dai.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when RemoveLiquidity FRAX3CRV => USDC", async () => {
        const amountOut = ethers.utils.parseUnits("10070.993109", 6);
        const usdc = await ethers.getContractAt("IERC20", USDC, signer);
        await zap.updateRoute(CURVE_FRAX3CRV_TOKEN, USDC, [
          encodePoolHintV2(
            CURVE_FRAX3CRV_POOL,
            PoolType.CurveFactoryUSDMetaPoolUnderlying,
            4,
            2,
            2,
            Action.RemoveLiquidity
          ),
        ]);
        const output = await zap.callStatic.zap(CURVE_FRAX3CRV_TOKEN, amountIn, USDC, amountOut);
        const before = await usdc.balanceOf(deployer.address);
        await zap.zap(CURVE_FRAX3CRV_TOKEN, amountIn, USDC, amountOut);
        const after = await usdc.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when RemoveLiquidity FRAX3CRV => USDT", async () => {
        const amountOut = ethers.utils.parseUnits("10064.970262", 6);
        const usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await zap.updateRoute(CURVE_FRAX3CRV_TOKEN, USDT, [
          encodePoolHintV2(
            CURVE_FRAX3CRV_POOL,
            PoolType.CurveFactoryUSDMetaPoolUnderlying,
            4,
            3,
            3,
            Action.RemoveLiquidity
          ),
        ]);
        const output = await zap.callStatic.zap(CURVE_FRAX3CRV_TOKEN, amountIn, USDT, amountOut);
        const before = await usdt.balanceOf(deployer.address);
        await zap.zap(CURVE_FRAX3CRV_TOKEN, amountIn, USDT, amountOut);
        const after = await usdt.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });
    });

    context("Swap from FRAX", async () => {
      const amountIn = ethers.utils.parseUnits("10000", 18);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let frax: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_FRAX3CRV_POOL, FRAX, FRAX_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(FRAX_HOLDER);

        await deployer.sendTransaction({
          to: signer.address,
          value: ethers.utils.parseEther("10"),
        });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        frax = await ethers.getContractAt("IERC20", FRAX, signer);
        await frax.transfer(zap.address, amountIn);
      });

      it("should succeed, when Swap FRAX => DAI", async () => {
        const amountOut = ethers.utils.parseUnits("9993.926975144123080758", 18);
        const dai = await ethers.getContractAt("IERC20", DAI, signer);
        await zap.updateRoute(FRAX, DAI, [
          encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 0, 1, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(FRAX, amountIn, DAI, amountOut);
        const before = await dai.balanceOf(deployer.address);
        await zap.zap(FRAX, amountIn, DAI, amountOut);
        const after = await dai.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when Swap FRAX => USDC", async () => {
        const amountOut = ethers.utils.parseUnits("9994.315899", 6);
        const usdc = await ethers.getContractAt("IERC20", USDC, signer);
        await zap.updateRoute(FRAX, USDC, [
          encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 0, 2, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(FRAX, amountIn, USDC, amountOut);
        const before = await usdc.balanceOf(deployer.address);
        await zap.zap(FRAX, amountIn, USDC, amountOut);
        const after = await usdc.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when Swap FRAX => USDT", async () => {
        const amountOut = ethers.utils.parseUnits("9988.338908", 6);
        const usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await zap.updateRoute(FRAX, USDT, [
          encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 0, 3, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(FRAX, amountIn, USDT, amountOut);
        const before = await usdt.balanceOf(deployer.address);
        await zap.zap(FRAX, amountIn, USDT, amountOut);
        const after = await usdt.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });
    });

    context("Swap from DAI", async () => {
      const amountIn = ethers.utils.parseUnits("10000", 18);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let dai: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_FRAX3CRV_POOL, DAI, DAI_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(DAI_HOLDER);

        await deployer.sendTransaction({
          to: signer.address,
          value: ethers.utils.parseEther("10"),
        });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        dai = await ethers.getContractAt("IERC20", DAI, signer);
        await dai.transfer(zap.address, amountIn);
      });

      it("should succeed, when Swap DAI => FRAX", async () => {
        const amountOut = ethers.utils.parseUnits("9995.407349332552658494", 18);
        const frax = await ethers.getContractAt("IERC20", FRAX, signer);
        await zap.updateRoute(DAI, FRAX, [
          encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 1, 0, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(DAI, amountIn, FRAX, amountOut);
        const before = await frax.balanceOf(deployer.address);
        await zap.zap(DAI, amountIn, FRAX, amountOut);
        const after = await frax.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when Swap DAI => USDC", async () => {
        const amountOut = ethers.utils.parseUnits("9997.272869", 6);
        const usdc = await ethers.getContractAt("IERC20", USDC, signer);
        await zap.updateRoute(DAI, USDC, [
          encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 1, 2, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(DAI, amountIn, USDC, amountOut);
        const before = await usdc.balanceOf(deployer.address);
        await zap.zap(DAI, amountIn, USDC, amountOut);
        const after = await usdc.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when Swap DAI => USDT", async () => {
        const amountOut = ethers.utils.parseUnits("9992.025908", 6);
        const usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await zap.updateRoute(DAI, USDT, [
          encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 1, 3, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(DAI, amountIn, USDT, amountOut);
        const before = await usdt.balanceOf(deployer.address);
        await zap.zap(DAI, amountIn, USDT, amountOut);
        const after = await usdt.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });
    });

    context("Swap from USDC", async () => {
      const amountIn = ethers.utils.parseUnits("10000", 6);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let usdc: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_FRAX3CRV_POOL, USDC, USDC_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(USDC_HOLDER);

        await deployer.sendTransaction({
          to: signer.address,
          value: ethers.utils.parseEther("10"),
        });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        usdc = await ethers.getContractAt("IERC20", USDC, signer);
        await usdc.transfer(zap.address, amountIn);
      });

      it("should succeed, when Swap USDC => FRAX", async () => {
        const amountOut = ethers.utils.parseUnits("9995.250651971250738864", 18);
        const frax = await ethers.getContractAt("IERC20", FRAX, signer);
        await zap.updateRoute(USDC, FRAX, [
          encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 2, 0, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(USDC, amountIn, FRAX, amountOut);
        const before = await frax.balanceOf(deployer.address);
        await zap.zap(USDC, amountIn, FRAX, amountOut);
        const after = await frax.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when Swap USDC => DAI", async () => {
        const amountOut = ethers.utils.parseUnits("9996.727108968933586433", 18);
        const dai = await ethers.getContractAt("IERC20", DAI, signer);
        await zap.updateRoute(USDC, DAI, [
          encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 2, 1, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(USDC, amountIn, DAI, amountOut);
        const before = await dai.balanceOf(deployer.address);
        await zap.zap(USDC, amountIn, DAI, amountOut);
        const after = await dai.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when Swap USDC => USDT", async () => {
        const amountOut = ethers.utils.parseUnits("9991.753165", 6);
        const usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await zap.updateRoute(USDC, USDT, [
          encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 2, 3, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(USDC, amountIn, USDT, amountOut);
        const before = await usdt.balanceOf(deployer.address);
        await zap.zap(USDC, amountIn, USDT, amountOut);
        const after = await usdt.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });
    });

    context("Swap from USDT", async () => {
      const amountIn = ethers.utils.parseUnits("10000", 6);
      let deployer: SignerWithAddress;
      let signer: SignerWithAddress;
      let usdt: IERC20;
      let zap: AladdinZap;

      beforeEach(async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_FRAX3CRV_POOL, USDT, USDT_HOLDER]);
        deployer = await ethers.getSigner(DEPLOYER);
        signer = await ethers.getSigner(USDT_HOLDER);

        await deployer.sendTransaction({
          to: signer.address,
          value: ethers.utils.parseEther("10"),
        });

        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        zap = await AladdinZap.deploy();
        await zap.deployed();
        await zap.initialize();

        usdt = await ethers.getContractAt("IERC20", USDT, signer);
        await usdt.transfer(zap.address, amountIn);
      });

      it("should succeed, when Swap USDT => FRAX", async () => {
        const amountOut = ethers.utils.parseUnits("9999.766685216543622042", 18);
        const frax = await ethers.getContractAt("IERC20", FRAX, signer);
        await zap.updateRoute(USDT, FRAX, [
          encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 3, 0, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(USDT, amountIn, FRAX, amountOut);
        const before = await frax.balanceOf(deployer.address);
        await zap.zap(USDT, amountIn, FRAX, amountOut);
        const after = await frax.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when Swap USDT => DAI", async () => {
        const amountOut = ethers.utils.parseUnits("10001.976336433627877987", 18);
        const dai = await ethers.getContractAt("IERC20", DAI, signer);
        await zap.updateRoute(USDT, DAI, [
          encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 3, 1, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(USDT, amountIn, DAI, amountOut);
        const before = await dai.balanceOf(deployer.address);
        await zap.zap(USDT, amountIn, DAI, amountOut);
        const after = await dai.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when Swap USDT => USDC", async () => {
        const amountOut = ethers.utils.parseUnits("10002.249354", 6);
        const usdc = await ethers.getContractAt("IERC20", USDC, signer);
        await zap.updateRoute(USDT, USDC, [
          encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 3, 2, Action.Swap),
        ]);
        const output = await zap.callStatic.zap(USDT, amountIn, USDC, amountOut);
        const before = await usdc.balanceOf(deployer.address);
        await zap.zap(USDT, amountIn, USDC, amountOut);
        const after = await usdc.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });
    });
  });

  describe("curve cvxcrv pool [CurveFactoryPlainPool, 2 tokens]", async () => {
    describe("curve cvxcrv pool [CurveFactoryPlainPool, 2 tokens]", async () => {
      const CURVE_CVXCRV_POOL = "0x9D0464996170c6B9e75eED71c68B99dDEDf279e8";
      const CURVE_CVXCRV_TOKEN = "0x9D0464996170c6B9e75eED71c68B99dDEDf279e8";
      const CURVE_CVXCRV_HOLDER = "0x4786C6690904CBEE4a6C2b5673Bfa90BE8AbADab";
      const CRV = "0xD533a949740bb3306d119CC777fa900bA034cd52";
      const CRV_HOLDER = "0x7a16fF8270133F063aAb6C9977183D9e72835428";
      const CVXCRV = "0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7";
      const CVXCRV_HOLDER = "0x2612A04a4aa6f440AB32c63dBEd46cF06b0C3329";

      it("should succeed, when AddLiquidity CRV => CVXCRV-f", async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXCRV_POOL, CRV, CRV_HOLDER]);
        const deployer = await ethers.getSigner(DEPLOYER);
        const signer = await ethers.getSigner(CRV_HOLDER);
        const amountIn = ethers.utils.parseUnits("10", 18);
        const amountOut = ethers.utils.parseEther("10.185284747715546057");

        const cvxcrvcrv = await ethers.getContractAt("IERC20", CURVE_CVXCRV_TOKEN, signer);
        const crv = await ethers.getContractAt("IERC20", CRV, signer);
        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        const zap = await AladdinZap.deploy();
        await zap.initialize();
        await zap.updatePoolTokens([CURVE_CVXCRV_POOL], [CURVE_CVXCRV_TOKEN]);
        await zap.updateRoute(CRV, CURVE_CVXCRV_TOKEN, [
          encodePoolHintV2(CURVE_CVXCRV_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.AddLiquidity),
        ]);
        await zap.deployed();
        await crv.transfer(zap.address, amountIn);
        const output = await zap.callStatic.zap(CRV, amountIn, CURVE_CVXCRV_TOKEN, amountOut);
        const before = await cvxcrvcrv.balanceOf(deployer.address);
        await zap.zap(CRV, amountIn, CURVE_CVXCRV_TOKEN, amountOut);
        const after = await cvxcrvcrv.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      it("should succeed, when AddLiquidity CVXCRV => CVXCRV-f", async () => {
        request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXCRV_POOL, CVXCRV, CVXCRV_HOLDER]);
        const deployer = await ethers.getSigner(DEPLOYER);
        const signer = await ethers.getSigner(CVXCRV_HOLDER);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });
        const amountIn = ethers.utils.parseUnits("10", 18);
        const amountOut = ethers.utils.parseEther("9.772018616692141811");

        const cvxcrvcrv = await ethers.getContractAt("IERC20", CURVE_CVXCRV_TOKEN, signer);
        const cvxcrv = await ethers.getContractAt("IERC20", CVXCRV, signer);
        const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
        const zap = await AladdinZap.deploy();
        await zap.initialize();
        await zap.updatePoolTokens([CURVE_CVXCRV_POOL], [CURVE_CVXCRV_TOKEN]);
        await zap.updateRoute(CVXCRV, CURVE_CVXCRV_TOKEN, [
          encodePoolHintV2(CURVE_CVXCRV_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.AddLiquidity),
        ]);
        await zap.deployed();
        await cvxcrv.transfer(zap.address, amountIn);
        const output = await zap.callStatic.zap(CVXCRV, amountIn, CURVE_CVXCRV_TOKEN, amountOut);
        const before = await cvxcrvcrv.balanceOf(deployer.address);
        await zap.zap(CVXCRV, amountIn, CURVE_CVXCRV_TOKEN, amountOut);
        const after = await cvxcrvcrv.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(amountOut);
        expect(output).to.eq(amountOut);
      });

      context("RemoveLiquidity from CVXCRV-f", async () => {
        const amountIn = ethers.utils.parseUnits("10", 18);
        let deployer: SignerWithAddress;
        let signer: SignerWithAddress;
        let cvxcrvcrv: IERC20;
        let zap: AladdinZap;

        beforeEach(async () => {
          request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXCRV_POOL, CURVE_CVXCRV_TOKEN, CURVE_CVXCRV_HOLDER]);
          deployer = await ethers.getSigner(DEPLOYER);
          signer = await ethers.getSigner(CURVE_CVXCRV_HOLDER);

          await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

          const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
          zap = await AladdinZap.deploy();
          await zap.deployed();
          await zap.initialize();
          await zap.updatePoolTokens([CURVE_CVXCRV_POOL], [CURVE_CVXCRV_TOKEN]);

          cvxcrvcrv = await ethers.getContractAt("IERC20", CURVE_CVXCRV_TOKEN, signer);
          await cvxcrvcrv.transfer(zap.address, amountIn);
        });

        it("should succeed, when RemoveLiquidity CVXCRV-f => CRV", async () => {
          const amountOut = ethers.utils.parseUnits("9.795542488642659763", 18);
          const crv = await ethers.getContractAt("IERC20", CRV, signer);
          await zap.updateRoute(CURVE_CVXCRV_TOKEN, CRV, [
            encodePoolHintV2(CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.RemoveLiquidity),
          ]);
          const output = await zap.callStatic.zap(CURVE_CVXCRV_TOKEN, amountIn, CRV, amountOut);
          const before = await crv.balanceOf(deployer.address);
          await zap.zap(CURVE_CVXCRV_TOKEN, amountIn, CRV, amountOut);
          const after = await crv.balanceOf(deployer.address);
          expect(after.sub(before)).to.eq(amountOut);
          expect(output).to.eq(amountOut);
        });

        it("should succeed, when RemoveLiquidity CVXCRV-f => CVXCRV", async () => {
          const amountOut = ethers.utils.parseUnits("10.226111342280135792", 18);
          const cvxcrv = await ethers.getContractAt("IERC20", CVXCRV, signer);
          await zap.updateRoute(CURVE_CVXCRV_TOKEN, CVXCRV, [
            encodePoolHintV2(CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.RemoveLiquidity),
          ]);
          const output = await zap.callStatic.zap(CURVE_CVXCRV_TOKEN, amountIn, CVXCRV, amountOut);
          const before = await cvxcrv.balanceOf(deployer.address);
          await zap.zap(CURVE_CVXCRV_TOKEN, amountIn, CVXCRV, amountOut);
          const after = await cvxcrv.balanceOf(deployer.address);
          expect(after.sub(before)).to.eq(amountOut);
          expect(output).to.eq(amountOut);
        });
      });

      context("Swap from CRV", async () => {
        const amountIn = ethers.utils.parseUnits("10", 18);
        let deployer: SignerWithAddress;
        let signer: SignerWithAddress;
        let crv: IERC20;
        let zap: AladdinZap;

        beforeEach(async () => {
          request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXCRV_POOL, CRV, CRV_HOLDER]);
          deployer = await ethers.getSigner(DEPLOYER);
          signer = await ethers.getSigner(CRV_HOLDER);

          await deployer.sendTransaction({
            to: signer.address,
            value: ethers.utils.parseEther("10"),
          });

          const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
          zap = await AladdinZap.deploy();
          await zap.deployed();
          await zap.initialize();

          crv = await ethers.getContractAt("IERC20", CRV, signer);
          await crv.transfer(zap.address, amountIn);
        });

        it("should succeed, when Swap CRV => CVXCRV", async () => {
          const amountOut = ethers.utils.parseUnits("10.415581249204002863", 18);
          const cvxcrv = await ethers.getContractAt("IERC20", CVXCRV, signer);
          await zap.updateRoute(CRV, CVXCRV, [
            encodePoolHintV2(CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 1, Action.Swap),
          ]);
          const output = await zap.callStatic.zap(CRV, amountIn, CVXCRV, amountOut);
          const before = await cvxcrv.balanceOf(deployer.address);
          await zap.zap(CRV, amountIn, CVXCRV, amountOut);
          const after = await cvxcrv.balanceOf(deployer.address);
          expect(after.sub(before)).to.eq(amountOut);
          expect(output).to.eq(amountOut);
        });
      });

      context("Swap from CVXCRV", async () => {
        const amountIn = ethers.utils.parseUnits("10", 18);
        let deployer: SignerWithAddress;
        let signer: SignerWithAddress;
        let cvxcrv: IERC20;
        let zap: AladdinZap;

        beforeEach(async () => {
          request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CURVE_CVXCRV_POOL, CVXCRV, CVXCRV_HOLDER]);
          deployer = await ethers.getSigner(DEPLOYER);
          signer = await ethers.getSigner(CVXCRV_HOLDER);

          await deployer.sendTransaction({
            to: signer.address,
            value: ethers.utils.parseEther("10"),
          });

          const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
          zap = await AladdinZap.deploy();
          await zap.deployed();
          await zap.initialize();

          cvxcrv = await ethers.getContractAt("IERC20", CVXCRV, signer);
          await cvxcrv.transfer(zap.address, amountIn);
        });

        it("should succeed, when Swap CVXCRV => CRV", async () => {
          const amountOut = ethers.utils.parseUnits("9.572218377604806231", 18);
          const crv = await ethers.getContractAt("IERC20", CRV, signer);
          await zap.updateRoute(CVXCRV, CRV, [
            encodePoolHintV2(CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap),
          ]);
          const output = await zap.callStatic.zap(CVXCRV, amountIn, CRV, amountOut);
          const before = await crv.balanceOf(deployer.address);
          await zap.zap(CVXCRV, amountIn, CRV, amountOut);
          const after = await crv.balanceOf(deployer.address);
          expect(after.sub(before)).to.eq(amountOut);
          expect(output).to.eq(amountOut);
        });
      });
    });
  });

  // TODO: pending unit tests for the following pools
  //   + CurveMetaCryptoPool: eurtusd
  //   + CurveAPool: saave, aave
  //   + CurveAPoolUnderlying: saave, aave
  //   + CurveYPool: compound, usdt, y
  //   + CurveYPoolUnderlying: compound, usdt, y
  //   + CurveMetaPool: ust
  //   + CurveMetaPoolUnderlying: ust
  //   + CurveFactoryBTCMetaPoolUnderlying: ibbtc

  describe("ETH/stETH [LidoStake]", async () => {
    const STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";

    it("should succeed, when wrap ETH to stETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, STETH]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("9.999999999999999999"); // steth has some rounding error

      const steth = await ethers.getContractAt("IERC20", STETH, deployer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(WETH, STETH, [encodePoolHintV2(STETH, PoolType.LidoStake, 2, 0, 0, Action.AddLiquidity)]);
      await zap.deployed();
      const output = await zap.callStatic.zap(constants.AddressZero, amountIn, STETH, amountOut, {
        value: amountIn,
      });
      const before = await steth.balanceOf(deployer.address);
      await zap.zap(constants.AddressZero, amountIn, STETH, amountOut, {
        value: amountIn,
      });
      const after = await steth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before).add(1)).to.eq(amountOut); // steth has some rounding error
    });

    it("should succeed, when wrap WETH to stETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, STETH, WETH, WETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(WETH_HOLDER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("9.999999999999999999"); // steth has some rounding error

      const steth = await ethers.getContractAt("IERC20", STETH, signer);
      const weth = await ethers.getContractAt("IERC20", WETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(WETH, STETH, [encodePoolHintV2(STETH, PoolType.LidoStake, 2, 0, 0, Action.AddLiquidity)]);
      await zap.deployed();
      await weth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(WETH, amountIn, STETH, amountOut);
      const before = await steth.balanceOf(deployer.address);
      await zap.zap(WETH, amountIn, STETH, amountOut);
      const after = await steth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before).add(1)).to.eq(amountOut); // steth has some rounding error
    });
  });

  describe("stETH/wstETH [LidoWrap]", async () => {
    const STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
    const STETH_HOLDER = "0x06920C9fC643De77B99cB7670A944AD31eaAA260";
    const WSTETH = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";
    const WSTETH_HOLDER = "0xD655F6507D86203F3970AA4448d9b7873B7942a9";

    it("should succeed, when wrap stETH to wstETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, STETH, STETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(STETH_HOLDER);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("9.419555176735992187");

      const steth = await ethers.getContractAt("IERC20", STETH, signer);
      const wsteth = await ethers.getContractAt("IERC20", WSTETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(STETH, WSTETH, [encodePoolHintV2(WSTETH, PoolType.LidoWrap, 2, 0, 0, Action.AddLiquidity)]);
      await zap.deployed();
      await steth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(STETH, amountIn, WSTETH, amountOut);
      const before = await wsteth.balanceOf(deployer.address);
      await zap.zap(STETH, amountIn, WSTETH, amountOut);
      const after = await wsteth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before)).to.eq(amountOut);
    });

    it("should succeed, when unwrap wstETH to stETH", async () => {
      request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, WSTETH, WSTETH_HOLDER]);
      const deployer = await ethers.getSigner(DEPLOYER);
      const signer = await ethers.getSigner(WSTETH_HOLDER);
      await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });
      const amountIn = ethers.utils.parseEther("9.419555176735992187");
      const amountOut = ethers.utils.parseEther("9.999999999999999999"); // steth has some rounding error

      const steth = await ethers.getContractAt("IERC20", STETH, signer);
      const wsteth = await ethers.getContractAt("IERC20", WSTETH, signer);
      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const zap = await AladdinZap.deploy();
      await zap.initialize();
      await zap.updateRoute(WSTETH, STETH, [
        encodePoolHintV2(WSTETH, PoolType.LidoWrap, 2, 0, 0, Action.RemoveLiquidity),
      ]);
      await zap.deployed();
      await wsteth.transfer(zap.address, amountIn);
      const output = await zap.callStatic.zap(WSTETH, amountIn, STETH, amountOut);
      const before = await steth.balanceOf(deployer.address);
      await zap.zap(WSTETH, amountIn, STETH, amountOut);
      const after = await steth.balanceOf(deployer.address);
      expect(output).to.eq(amountOut);
      expect(after.sub(before).add(1)).to.eq(amountOut); // steth has some rounding error
    });
  });
});

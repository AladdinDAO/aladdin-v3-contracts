/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ADDRESS, DEPLOYED_CONTRACTS, ZAP_ROUTES } from "../../scripts/utils";
import {
  BalancerLPGaugeGateway,
  ConcentratorGaugeController,
  ConcentratorLiquidityGauge,
  CTR,
  CTRMinter,
  IBalancerPool,
  IBalancerVault,
  IBalancerWeightedPoolFactory,
  IERC20,
  VeCTR,
} from "../../typechain";
import { request_fork } from "../utils";

const FORK_PARAMS: {
  number: number;
  tokens: {
    [symbol: string]: {
      holder: string;
      amount: string;
    };
  };
} = {
  number: 14933540,
  tokens: {
    WETH: {
      holder: "0xc564ee9f21ed8a2d8e7e76c085740d5e4c5fafbe",
      amount: "10000",
    },
    USDC: {
      holder: "0xc564ee9f21ed8a2d8e7e76c085740d5e4c5fafbe",
      amount: "10000",
    },
    CRV: {
      holder: "0xc564ee9f21ed8a2d8e7e76c085740d5e4c5fafbe",
      amount: "10000",
    },
    CVXCRV: {
      holder: "0x94dfce828c3daaf6492f1b6f66f9a1825254d24b",
      amount: "10000",
    },
    aCRV: {
      holder: "0x488b99c4a94bb0027791e8e0eeb421187ec9a487",
      amount: "10000",
    },
  },
};

const BALANCER_POOL_FACTORY = "0x8E9aa87E45e92bad84D5F8DD1bff34Fb92637dE9";
const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";

describe("BalancerLPGaugeGateway.spec", async () => {
  let deployer: SignerWithAddress;
  let aCRV: IERC20;
  let ctr: CTR;
  let ve: VeCTR;
  let minter: CTRMinter;
  let controller: ConcentratorGaugeController;
  let gauge: ConcentratorLiquidityGauge;
  let gateway: BalancerLPGaugeGateway;
  let vault: IBalancerVault;
  let factory: IBalancerWeightedPoolFactory;
  let pool: IBalancerPool;
  let poolId: string;

  beforeEach(async () => {
    const holders = Object.values(FORK_PARAMS.tokens).map(({ holder }) => holder);
    holders.push(DEPLOYER);
    await request_fork(FORK_PARAMS.number, holders);
    deployer = await ethers.getSigner(DEPLOYER);

    aCRV = await ethers.getContractAt("AladdinCRV", DEPLOYED_CONTRACTS.Concentrator.aCRV, deployer);

    const CTR = await ethers.getContractFactory("CTR", deployer);
    ctr = await CTR.deploy("Concentrator", "CTR", 18);
    await ctr.deployed();
    await ctr.set_admin(deployer.address);

    vault = await ethers.getContractAt("IBalancerVault", BALANCER_VAULT, deployer);
    factory = await ethers.getContractAt("IBalancerWeightedPoolFactory", BALANCER_POOL_FACTORY, deployer);

    // create pool
    const signer = await ethers.getSigner(FORK_PARAMS.tokens.aCRV.holder);
    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("100") });
    const poolAddress = await factory
      .connect(signer)
      .callStatic.create(
        "X",
        "Y",
        ctr.address.toLowerCase() < DEPLOYED_CONTRACTS.Concentrator.aCRV.toLowerCase()
          ? [ctr.address, DEPLOYED_CONTRACTS.Concentrator.aCRV]
          : [DEPLOYED_CONTRACTS.Concentrator.aCRV, ctr.address],
        ctr.address.toLowerCase() < DEPLOYED_CONTRACTS.Concentrator.aCRV.toLowerCase()
          ? [ethers.utils.parseEther("0.02"), ethers.utils.parseEther("0.98")]
          : [ethers.utils.parseEther("0.98"), ethers.utils.parseEther("0.02")],
        1e12,
        signer.address
      );
    await factory
      .connect(signer)
      .create(
        "X",
        "Y",
        ctr.address.toLowerCase() < DEPLOYED_CONTRACTS.Concentrator.aCRV.toLowerCase()
          ? [ctr.address, DEPLOYED_CONTRACTS.Concentrator.aCRV]
          : [DEPLOYED_CONTRACTS.Concentrator.aCRV, ctr.address],
        ctr.address.toLowerCase() < DEPLOYED_CONTRACTS.Concentrator.aCRV.toLowerCase()
          ? [ethers.utils.parseEther("0.02"), ethers.utils.parseEther("0.98")]
          : [ethers.utils.parseEther("0.98"), ethers.utils.parseEther("0.02")],
        1e12,
        signer.address
      );
    pool = await ethers.getContractAt("IBalancerPool", poolAddress, signer);
    poolId = await pool.getPoolId();
    console.log("address:", pool.address);

    await aCRV.connect(signer).approve(vault.address, constants.MaxUint256);
    await ctr.connect(signer).approve(vault.address, constants.MaxUint256);
    await ctr.transfer(signer.address, ethers.utils.parseEther("200"));
    await vault.connect(signer).joinPool(poolId, signer.address, signer.address, {
      assets:
        ctr.address.toLowerCase() < DEPLOYED_CONTRACTS.Concentrator.aCRV.toLowerCase()
          ? [ctr.address, DEPLOYED_CONTRACTS.Concentrator.aCRV]
          : [DEPLOYED_CONTRACTS.Concentrator.aCRV, ctr.address],
      maxAmountsIn: [constants.MaxUint256, constants.MaxUint256],
      userData: defaultAbiCoder.encode(
        ["uint8", "uint256[]"],
        [
          0,
          ctr.address.toLowerCase() < DEPLOYED_CONTRACTS.Concentrator.aCRV.toLowerCase()
            ? [ethers.utils.parseEther("200"), ethers.utils.parseEther("1000")]
            : [ethers.utils.parseEther("1000"), ethers.utils.parseEther("200")],
        ]
      ),
      fromInternalBalance: false,
    });

    const veCTR = await ethers.getContractFactory("veCTR", deployer);
    ve = (await veCTR.deploy(ctr.address, "Vote Escrowed CTR", "veCTR", "veCTR_1.0.0")) as VeCTR;
    await ve.deployed();

    const ConcentratorGaugeController = await ethers.getContractFactory("ConcentratorGaugeController", deployer);
    controller = await ConcentratorGaugeController.deploy(ctr.address, ve.address);
    await controller.deployed();

    const CTRMinter = await ethers.getContractFactory("CTRMinter", deployer);
    minter = await CTRMinter.deploy(ctr.address, controller.address);
    await minter.deployed();

    const ConcentratorLiquidityGauge = await ethers.getContractFactory("ConcentratorLiquidityGauge", deployer);
    gauge = await ConcentratorLiquidityGauge.deploy(pool.address, minter.address, deployer.address);
    await gauge.deployed();

    const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
    const logic = await TokenZapLogic.deploy();
    await logic.deployed();

    const BalancerLPGaugeGateway = await ethers.getContractFactory("BalancerLPGaugeGateway", deployer);
    gateway = await BalancerLPGaugeGateway.deploy(ctr.address, gauge.address, poolId, logic.address);
    await gateway.deployed();
  });

  for (const symbol of ["WETH", "USDC", "CRV", "CVXCRV", "aCRV"]) {
    const { holder, amount } = FORK_PARAMS.tokens[symbol];
    const address = symbol === "aCRV" ? DEPLOYED_CONTRACTS.Concentrator.aCRV : ADDRESS[symbol];
    let routes: BigNumber[] = [];

    if (symbol !== "CRV" && symbol !== "CVXCRV" && symbol !== "aCRV") {
      routes = ZAP_ROUTES[symbol].CRV;
    }

    it(`should succeed, when zap from [${symbol}]`, async () => {
      const signer = await ethers.getSigner(holder);
      await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });
      const token = await ethers.getContractAt("ERC20", address, signer);
      const decimals = await token.decimals();
      const amountIn = ethers.utils.parseUnits(amount, decimals);

      await token.approve(gateway.address, amountIn);
      const lpOut = await gateway.connect(signer).callStatic.deposit(token.address, amountIn, routes, 0);
      const amountBefore = await gauge.balanceOf(signer.address);
      const tx = await gateway.connect(signer).deposit(token.address, amountIn, routes, 0);
      const receipt = await tx.wait();
      const amountAfter = await gauge.balanceOf(signer.address);
      expect(amountAfter.sub(amountBefore)).to.eq(lpOut);
      console.log("amountIn:", amount, "lpOut:", ethers.utils.formatEther(lpOut), "gas:", receipt.gasUsed.toString());
    });

    if (symbol === "WETH") {
      it(`should succeed, when zap from [ETH]`, async () => {
        const amountIn = ethers.utils.parseUnits(amount, 18);

        const lpOut = await gateway
          .connect(deployer)
          .callStatic.deposit(constants.AddressZero, amountIn, routes, 0, { value: amountIn });
        const amountBefore = await gauge.balanceOf(deployer.address);
        const tx = await gateway
          .connect(deployer)
          .deposit(constants.AddressZero, amountIn, routes, 0, { value: amountIn });
        const receipt = await tx.wait();
        const amountAfter = await gauge.balanceOf(deployer.address);
        expect(amountAfter.sub(amountBefore)).to.eq(lpOut);
        console.log("amountIn:", amount, "lpOut:", ethers.utils.formatEther(lpOut), "gas:", receipt.gasUsed.toString());
      });
    }
  }

  it(`should succeed, when zap from [CTR]`, async () => {
    const amountIn = ethers.utils.parseUnits("1000", 18);
    await ctr.connect(deployer).approve(gateway.address, amountIn);
    const lpOut = await gateway.connect(deployer).callStatic.deposit(ctr.address, amountIn, [], 0);
    const amountBefore = await gauge.balanceOf(deployer.address);
    const tx = await gateway.connect(deployer).deposit(ctr.address, amountIn, [], 0);
    const receipt = await tx.wait();
    const amountAfter = await gauge.balanceOf(deployer.address);
    expect(amountAfter.sub(amountBefore)).to.eq(lpOut);
    console.log("amountIn:", "1000", "lpOut:", ethers.utils.formatEther(lpOut), "gas:", receipt.gasUsed.toString());
  });
});

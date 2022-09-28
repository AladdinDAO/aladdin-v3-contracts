/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { AladdinCRVStrategy, CLeverGateway, CLeverToken, MetaCLever, MetaFurnace } from "../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../utils";
import { DEPLOYED_CONTRACTS, TOKENS, ZAP_ROUTES } from "../../scripts/utils";

const FORK_BLOCK_NUMBER = 15377050;
const WETH = TOKENS.WETH.address;
const WETH_HOLDER = "0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE";
const USDC = TOKENS.USDC.address;
const USDC_HOLDER = "0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE";
const CRV = TOKENS.CRV.address;
const CRV_HOLDER = "0x32d03db62e464c9168e41028ffa6e9a05d8c6451";
const cvxCRV = TOKENS.cvxCRV.address;
// eslint-disable-next-line camelcase
const cvxCRV_HOLDER = "0x2b08254f95422d7fdbfde173e453e1f7e31c405b";

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";

describe("MetaCLever.AladdinCRVStrategy.spec", async () => {
  let deployer: SignerWithAddress;

  let strategy: AladdinCRVStrategy;
  let clevCRV: CLeverToken;
  let clever: MetaCLever;
  let furnace: MetaFurnace;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [
      DEPLOYER,
      WETH_HOLDER,
      USDC_HOLDER,
      CRV_HOLDER,
      // eslint-disable-next-line camelcase
      cvxCRV_HOLDER,
    ]);
    deployer = await ethers.getSigner(DEPLOYER);

    const CLeverToken = await ethers.getContractFactory("CLeverToken", deployer);
    clevCRV = await CLeverToken.deploy("CLever CRV", "clevCRV");
    await clevCRV.deployed();

    const MetaFurnace = await ethers.getContractFactory("MetaFurnace", deployer);
    furnace = await MetaFurnace.deploy();
    await furnace.deployed();
    await furnace.initialize(CRV, clevCRV.address);

    const MetaCLever = await ethers.getContractFactory("MetaCLever", deployer);
    clever = await MetaCLever.deploy();
    await clever.deployed();
    await clever.initialize(clevCRV.address, furnace.address);

    const AladdinCRVStrategy = await ethers.getContractFactory("AladdinCRVStrategy", deployer);
    strategy = await AladdinCRVStrategy.deploy(clever.address);
    await strategy.deployed();

    await clever.addYieldStrategy(strategy.address, []);
  });

  context("zap with CLeverGateway", async () => {
    let gateway: CLeverGateway;

    beforeEach(async () => {
      const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
      const logic = await TokenZapLogic.deploy();
      await logic.deployed();

      const CLeverGateway = await ethers.getContractFactory("CLeverGateway", deployer);
      gateway = await CLeverGateway.deploy(logic.address);
      await gateway.deployed();
    });

    it("should succeed, when deposit with cvxCRV", async () => {
      const amountIn = ethers.utils.parseUnits("100", TOKENS.cvxCRV.decimals);
      const sharesOut = ethers.utils.parseUnits("86.390857312544540322", 18);
      const holder = await ethers.getSigner(cvxCRV_HOLDER);
      await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });
      const token = await ethers.getContractAt("IERC20", cvxCRV, holder);

      await token.connect(holder).approve(gateway.address, amountIn);
      await gateway
        .connect(holder)
        .deposit(clever.address, 0, cvxCRV, amountIn, DEPLOYED_CONTRACTS.Concentrator.aCRV, ZAP_ROUTES.cvxCRV.aCRV, 0);
      expect((await clever.getUserStrategyInfo(holder.address, 0))._share).to.eq(sharesOut);
    });

    it("should succeed, when deposit with CRV", async () => {
      const amountIn = ethers.utils.parseUnits("100", TOKENS.CRV.decimals);
      const sharesOut = ethers.utils.parseUnits("89.239173552975164559", 18);
      const holder = await ethers.getSigner(CRV_HOLDER);
      await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });
      const token = await ethers.getContractAt("IERC20", CRV, holder);

      await token.connect(holder).approve(gateway.address, amountIn);
      await gateway
        .connect(holder)
        .deposit(clever.address, 0, CRV, amountIn, DEPLOYED_CONTRACTS.Concentrator.aCRV, ZAP_ROUTES.CRV.aCRV, 0);
      expect((await clever.getUserStrategyInfo(holder.address, 0))._share).to.eq(sharesOut);
    });

    it("should succeed, when deposit with USDC", async () => {
      const amountIn = ethers.utils.parseUnits("100", TOKENS.USDC.decimals);
      const sharesOut = ethers.utils.parseUnits("84.351764013448694351", 18);
      const holder = await ethers.getSigner(USDC_HOLDER);
      await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });
      const token = await ethers.getContractAt("IERC20", USDC, holder);

      await token.connect(holder).approve(gateway.address, amountIn);
      await gateway.connect(holder).deposit(clever.address, 0, USDC, amountIn, CRV, ZAP_ROUTES.USDC.CRV, 0);
      expect((await clever.getUserStrategyInfo(holder.address, 0))._share).to.eq(sharesOut);
    });

    it("should succeed, when deposit with WETH", async () => {
      const amountIn = ethers.utils.parseUnits("100", TOKENS.WETH.decimals);
      const sharesOut = ethers.utils.parseUnits("137117.700713694931875165", 18);
      const holder = await ethers.getSigner(WETH_HOLDER);
      await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });
      const token = await ethers.getContractAt("IERC20", WETH, holder);

      await token.connect(holder).approve(gateway.address, amountIn);
      await gateway.connect(holder).deposit(clever.address, 0, WETH, amountIn, CRV, ZAP_ROUTES.WETH.CRV, 0);
      expect((await clever.getUserStrategyInfo(holder.address, 0))._share).to.eq(sharesOut);
    });

    it("should succeed, when deposit with ETH", async () => {
      const amountIn = ethers.utils.parseUnits("100", TOKENS.WETH.decimals);
      const sharesOut = ethers.utils.parseUnits("137117.700713694931875165", 18);
      await gateway
        .connect(deployer)
        .deposit(clever.address, 0, constants.AddressZero, amountIn, CRV, ZAP_ROUTES.WETH.CRV, 0, { value: amountIn });
      expect((await clever.getUserStrategyInfo(deployer.address, 0))._share).to.eq(sharesOut);
    });
  });
});

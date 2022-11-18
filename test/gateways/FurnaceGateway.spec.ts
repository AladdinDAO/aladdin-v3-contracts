/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { DEPLOYED_CONTRACTS, TOKENS, ZAP_ROUTES } from "../../scripts/utils";
import { Furnace, FurnaceGateway } from "../../typechain";
import { request_fork } from "../utils";

const CVX_HOLDER = "0x28C6c06298d514Db089934071355E5743bf21d60";
const USDC_HOLDER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const WETH_HOLDER = "0x57757E3D981446D585Af0D9Ae4d7DF6D64647806";

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";

const FORK_PARAMS: {
  number: number;
  tokens: {
    [symbol: string]: {
      holder: string;
      amount: string;
    };
  };
} = {
  number: 15998680,
  tokens: {
    WETH: {
      holder: WETH_HOLDER,
      amount: "100",
    },
    USDC: {
      holder: USDC_HOLDER,
      amount: "10000",
    },
    CVX: {
      holder: CVX_HOLDER,
      amount: "10000",
    },
  },
};

describe("FurnaceGateway.spec", async () => {
  let deployer: SignerWithAddress;
  let gateway: FurnaceGateway;
  let furnace: Furnace;

  beforeEach(async () => {
    await request_fork(FORK_PARAMS.number, [DEPLOYER, CVX_HOLDER, USDC_HOLDER, WETH_HOLDER]);
    deployer = await ethers.getSigner(DEPLOYER);

    furnace = await ethers.getContractAt("Furnace", DEPLOYED_CONTRACTS.CLever.CLeverCVX.FurnaceForCVX, deployer);

    const FurnaceGateway = await ethers.getContractFactory("FurnaceGateway", deployer);
    gateway = await FurnaceGateway.deploy();
    await gateway.deployed();

    await gateway.initialize(DEPLOYED_CONTRACTS.TokenZapLogic);
  });

  for (const symbol of ["WETH", "USDC", "CVX"]) {
    const { holder, amount } = FORK_PARAMS.tokens[symbol];
    const address = TOKENS[symbol].address;
    const routes = ZAP_ROUTES[symbol].clevCVX;

    it(`should succeed, when zap from [${symbol}]`, async () => {
      const signer = await ethers.getSigner(holder);
      await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });
      const token = await ethers.getContractAt("ERC20", address, signer);
      const decimals = await token.decimals();
      const amountIn = ethers.utils.parseUnits(amount, decimals);

      await token.approve(gateway.address, amountIn);
      const amountOut = await gateway
        .connect(signer)
        .callStatic.depositIntoLegacyFurnace(token.address, amountIn, routes, 0);
      const amountBefore = (await furnace.getUserInfo(signer.address)).unrealised;
      const tx = await gateway.connect(signer).depositIntoLegacyFurnace(token.address, amountIn, routes, 0);
      const receipt = await tx.wait();
      const amountAfter = (await furnace.getUserInfo(signer.address)).unrealised;
      expect(amountAfter.sub(amountBefore)).to.eq(amountOut);
      console.log(
        "amountIn:",
        amount,
        "amountOut:",
        ethers.utils.formatEther(amountOut),
        "gas:",
        receipt.gasUsed.toString()
      );
    });

    if (symbol === "WETH") {
      it(`should succeed, when zap from [ETH]`, async () => {
        const amountIn = ethers.utils.parseUnits(amount, 18);
        const amountOut = await gateway
          .connect(deployer)
          .callStatic.depositIntoLegacyFurnace(constants.AddressZero, amountIn, routes, 0, { value: amountIn });
        const amountBefore = (await furnace.getUserInfo(deployer.address)).unrealised;
        const tx = await gateway
          .connect(deployer)
          .depositIntoLegacyFurnace(constants.AddressZero, amountIn, routes, 0, { value: amountIn });
        const receipt = await tx.wait();
        const amountAfter = (await furnace.getUserInfo(deployer.address)).unrealised;
        expect(amountAfter.sub(amountBefore)).to.eq(amountOut);
        console.log(
          "amountIn:",
          amount,
          "amountOut:",
          ethers.utils.formatEther(amountOut),
          "gas:",
          receipt.gasUsed.toString()
        );
      });
    }
  }
});

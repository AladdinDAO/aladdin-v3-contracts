/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { ADDRESS } from "../../scripts/utils";
import { AladdinCRVConvexVault } from "../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../utils";

const FORK_BLOCK_NUMBER = 14628917;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const VAULT = "0xc8fF37F7d057dF1BB9Ad681b53Fa4726f268E0e8";
const OWNER = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";

const USDC = ADDRESS.USDC;
const USDC_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";

// add zap from USDC support

describe("AladdinCRVConvexVault.add.14628917.spec", async () => {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let vault: AladdinCRVConvexVault;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, OWNER, USDC_HOLDER]);
    deployer = await ethers.getSigner(DEPLOYER);
    owner = await ethers.getSigner(OWNER);

    await deployer.sendTransaction({ to: owner.address, value: ethers.utils.parseEther("10") });

    vault = await ethers.getContractAt("AladdinCRVConvexVault", VAULT, owner);
  });

  context("steth", async () => {
    const pid = 0;

    context("deposit", async () => {
      it("should succeed, when deposit with USDC", async () => {
        const amountIn = ethers.utils.parseUnits("100000", 6);
        const sharesOut = ethers.utils.parseEther("30.595727863006627303");
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
    });
  });

  context("tricrypto2", async () => {
    const pid = 2;

    context("deposit", async () => {
      it("should succeed, when deposit with USDC", async () => {
        const amountIn = ethers.utils.parseUnits("100000", 6);
        const sharesOut = ethers.utils.parseEther("64.437136551662510575");
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
    });
  });

  context("cvxcrv", async () => {
    const pid = 3;

    context("deposit", async () => {
      it("should succeed, when deposit with USDC", async () => {
        const amountIn = ethers.utils.parseUnits("100000", 6);
        const sharesOut = ethers.utils.parseEther("41298.383790468814606805");
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
    });
  });

  context("crveth", async () => {
    const pid = 4;

    context("deposit", async () => {
      it("should succeed, when deposit with USDC", async () => {
        const amountIn = ethers.utils.parseUnits("100000", 6);
        const sharesOut = ethers.utils.parseEther("567.088165560856952928");
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
    });
  });

  context("cvxeth", async () => {
    const pid = 5;

    context("deposit", async () => {
      it("should succeed, when deposit with USDC", async () => {
        const amountIn = ethers.utils.parseUnits("100000", 6);
        const sharesOut = ethers.utils.parseEther("160.776967797572345017");
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
    });
  });

  context("cvxfxs", async () => {
    const pid = 6;

    context("deposit", async () => {
      it("should succeed, when deposit with USDC", async () => {
        const amountIn = ethers.utils.parseUnits("100000", 6);
        const sharesOut = ethers.utils.parseEther("1396.426439826386680294");
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
    });
  });

  context("rocket pool", async () => {
    const pid = 9;

    context("deposit", async () => {
      it("should succeed, when deposit with USDC", async () => {
        const amountIn = ethers.utils.parseUnits("100000", 6);
        const sharesOut = ethers.utils.parseEther("30.486810244965799169");
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
    });
  });
});

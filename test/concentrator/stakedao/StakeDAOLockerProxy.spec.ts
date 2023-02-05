/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { StakeDAOLockerProxy } from "../../../typechain";
import { request_fork } from "../../utils";

const FORK_BLOCK_NUMBER = 15976790;

const SDCRV = "0xD1b5651E55D4CeeD36251c61c50C889B36F6abB5";
const SDCRV_HOLDER = "0x33f2b6e3047c97598e557fc1e8d29e1693ae5f15";
const SDCRV_GAUGE = "0x7f50786A0b15723D741727882ee99a0BF34e3466";
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const OPERATOR = "0x66c57bF505A85A74609D2C83E94Aabb26d691E1F";

describe("StakeDAOLockerProxy.spec", async () => {
  let deployer: SignerWithAddress;
  let operator: SignerWithAddress;
  let proxy: StakeDAOLockerProxy;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, OPERATOR, SDCRV_HOLDER]);
    deployer = await ethers.getSigner(DEPLOYER);
    operator = await ethers.getSigner(OPERATOR);
    await deployer.sendTransaction({ to: SDCRV_HOLDER, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: OPERATOR, value: ethers.utils.parseEther("10") });

    const StakeDAOLockerProxy = await ethers.getContractFactory("StakeDAOLockerProxy", deployer);
    proxy = await StakeDAOLockerProxy.deploy();
    await proxy.deployed();
    await proxy.initialize();
  });

  context("auth", async () => {
    context("#updateOperator", async () => {
      it("should revert, when call updateOperator and caller is not owner", async () => {
        await expect(proxy.connect(operator).updateOperator(SDCRV_GAUGE, operator.address)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await proxy.operators(SDCRV_GAUGE)).to.eq(constants.AddressZero);
        await expect(proxy.connect(deployer).updateOperator(SDCRV_GAUGE, operator.address))
          .to.emit(proxy, "UpdateOperator")
          .withArgs(SDCRV_GAUGE, operator.address);
        expect(await proxy.operators(SDCRV_GAUGE)).to.eq(operator.address);
      });
    });

    context("#updateClaimer", async () => {
      it("should revert, when call updateClaimer and caller is not owner", async () => {
        await expect(proxy.connect(operator).updateClaimer(operator.address)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await proxy.claimer()).to.eq(constants.AddressZero);
        await expect(proxy.connect(deployer).updateClaimer(operator.address))
          .to.emit(proxy, "UpdateClaimer")
          .withArgs(operator.address);
        expect(await proxy.claimer()).to.eq(operator.address);
      });
    });

    context("#delegate", async () => {
      it("should revert, when call delegate and caller is not owner", async () => {
        await expect(
          proxy.connect(operator).delegate(constants.AddressZero, constants.HashZero, constants.AddressZero)
        ).to.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  context("deposit", async () => {
    it("should revert, when non operator call deposit", async () => {
      await expect(proxy.connect(operator).deposit(SDCRV_GAUGE, SDCRV)).to.revertedWith("not operator");
    });

    it("should succeed", async () => {
      const holder = await ethers.getSigner(SDCRV_HOLDER);
      const token = await ethers.getContractAt("IERC20", SDCRV, holder);
      const gauge = await ethers.getContractAt("IERC20", SDCRV_GAUGE, deployer);
      const amount = ethers.utils.parseEther("10");

      await proxy.connect(deployer).updateOperator(SDCRV_GAUGE, operator.address);
      await token.transfer(proxy.address, amount);
      expect(await gauge.balanceOf(proxy.address)).to.eq(constants.Zero);
      await proxy.connect(operator).deposit(SDCRV_GAUGE, SDCRV);
      expect(await gauge.balanceOf(proxy.address)).to.eq(amount);
    });
  });

  context("withdraw", async () => {
    it("should revert, when non operator call withdraw", async () => {
      await expect(
        proxy.connect(operator).withdraw(SDCRV_GAUGE, SDCRV, constants.Zero, constants.AddressZero)
      ).to.revertedWith("not operator");
    });

    it("should succeed", async () => {
      const holder = await ethers.getSigner(SDCRV_HOLDER);
      const token = await ethers.getContractAt("IERC20", SDCRV, holder);
      const gauge = await ethers.getContractAt("IERC20", SDCRV_GAUGE, deployer);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("1");

      // deposit
      await proxy.connect(deployer).updateOperator(SDCRV_GAUGE, operator.address);
      await token.transfer(proxy.address, amountIn);
      expect(await gauge.balanceOf(proxy.address)).to.eq(constants.Zero);
      await proxy.connect(operator).deposit(SDCRV_GAUGE, SDCRV);
      expect(await gauge.balanceOf(proxy.address)).to.eq(amountIn);

      // withdraw
      const balanceBefore = await token.balanceOf(deployer.address);
      await proxy.connect(operator).withdraw(SDCRV_GAUGE, SDCRV, amountOut, deployer.address);
      const balanceAfter = await token.balanceOf(deployer.address);
      expect(await gauge.balanceOf(proxy.address)).to.eq(amountIn.sub(amountOut));
      expect(balanceAfter.sub(balanceBefore)).to.eq(amountOut);
    });
  });
});

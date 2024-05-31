/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import { FxUSDCompounder } from "@/types/index";
import { ADDRESS, Action, PoolTypeV3, TOKENS, encodePoolHintV3 } from "@/utils/index";

const DEPLOYER = "0x0000000000000000000000000000000000000001";
const KEEPER = "0x0000000000000000000000000000000000000002";
const FXNHolder = "0x69873461B8F29F3a3D35449e2173040e0AA1571d";
const fxUSDHolder = "0x6Da6DeE37F5e218b8137192Aa6848117354fEc41";
const wstETHHolder = "0x3c22ec75ea5D745c78fc84762F7F1E6D82a2c5BF";
const sfrxETHHolder = "0x46782D268FAD71DaC3383Ccf2dfc44C861fb4c7D";
const FORK_HEIGHT = 19917943;

describe("FxUSDCompounder.spec", async () => {
  let deployer: HardhatEthersSigner;
  let keeper: HardhatEthersSigner;

  let compounder: FxUSDCompounder;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [DEPLOYER, KEEPER, FXNHolder, fxUSDHolder, wstETHHolder, sfrxETHHolder]);
    deployer = await ethers.getSigner(DEPLOYER);
    keeper = await ethers.getSigner(KEEPER);

    await mockETHBalance(deployer.address, ethers.parseEther("100"));
    await mockETHBalance(keeper.address, ethers.parseEther("100"));

    const FxUSDCompounder = await ethers.getContractFactory("FxUSDCompounder", deployer);
    compounder = await FxUSDCompounder.deploy();
    await compounder.initialize(
      deployer.address,
      ZeroAddress,
      "0x11C907b3aeDbD863e551c37f21DD3F36b28A6784",
      TOKENS.fxUSD.address,
      "0x9aD382b028e03977D446635Ba6b8492040F829b7",
      "Aladdin f(x) USD",
      "afxUSD",
      2
    );
    await compounder.updateConvertRoutes(TOKENS.FXN.address, [
      encodePoolHintV3(ADDRESS["CURVE_ETH/FXN_POOL"], PoolTypeV3.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
    ]);
  });

  /*
  context("constructor", async () => {
    it("should succeed", async () => {
      expect(await compounder.name()).to.eq("Aladdin f(x) USD");
      expect(await compounder.symbol()).to.eq("afxUSD");
      expect(await compounder.minRebalanceProfit()).to.eq(ethers.parseUnits("0.05", 9));
      expect(await compounder.getTokensIn()).to.deep.eq([
        TOKENS.fxUSD.address,
        TOKENS.wstETH.address,
        TOKENS.sfrxETH.address,
      ]);
      expect(await compounder.getTokensOut()).to.deep.eq([TOKENS.fxUSD.address, TOKENS.wstETH.address]);

      await expect(
        compounder.initialize(ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress, "", "", 0)
      ).to.revertedWith("Initializable: contract is already initialized");
    });
  });

  context("auth", async () => {
    context("#updateConvertRoutes", async () => {
      it("should revert when non-admin call", async () => {
        await expect(compounder.connect(keeper).updateConvertRoutes(ZeroAddress, [])).to.revertedWith(
          "AccessControl: account 0x0000000000000000000000000000000000000002 is missing role 0x0000000000000000000000000000000000000000000000000000000000000000"
        );
      });

      it("should succeed", async () => {
        expect(await compounder.getConvertRoutes(ZeroAddress)).to.deep.eq([]);
        await expect(compounder.updateConvertRoutes(ZeroAddress, [1n, 2n, 3n]))
          .to.emit(compounder, "UpdateConvertRoutes")
          .withArgs(ZeroAddress, [1n, 2n, 3n]);
        expect(await compounder.getConvertRoutes(ZeroAddress)).to.deep.eq([1n, 2n, 3n]);
      });
    });

    context("#updateMinRebalanceProfit", async () => {
      it("should revert when non-admin call", async () => {
        await expect(compounder.connect(keeper).updateMinRebalanceProfit(0n)).to.revertedWith(
          "AccessControl: account 0x0000000000000000000000000000000000000002 is missing role 0x0000000000000000000000000000000000000000000000000000000000000000"
        );
      });

      it("should succeed", async () => {
        expect(await compounder.minRebalanceProfit()).to.deep.eq(ethers.parseUnits("0.05", 9));
        await expect(compounder.updateMinRebalanceProfit(ethers.parseUnits("0.5", 9)))
          .to.emit(compounder, "UpdateMinRebalanceProfit")
          .withArgs(ethers.parseUnits("0.05", 9), ethers.parseUnits("0.5", 9));
        expect(await compounder.minRebalanceProfit()).to.deep.eq(ethers.parseUnits("0.5", 9));
      });
    });
  });
  */

  const earn = async (amount: bigint): Promise<bigint> => {
    const holder = await ethers.getSigner(FXNHolder);
    await mockETHBalance(holder.address, ethers.parseEther("100"));
    const token = await ethers.getContractAt("MockERC20", TOKENS.FXN.address, holder);
    await token.transfer(compounder.getAddress(), amount);
    const before = await compounder.totalDepositedFxUSD();
    await compounder.connect(holder).harvest(holder.address, 0n, 0n);
    return (await compounder.totalDepositedFxUSD()) - before;
  };

  context("deposit", async () => {
    it("should revert when invalid token", async () => {
      await expect(compounder.deposit(deployer.address, ZeroAddress, 0n, 0n)).to.revertedWithCustomError(
        compounder,
        "ErrInvalidTokenIn"
      );
    });

    context("deposit with fxUSD", async () => {
      it("should revert when deposit zero", async () => {
        await expect(compounder.deposit(deployer.address, TOKENS.fxUSD.address, 0n, 0n)).to.revertedWithCustomError(
          compounder,
          "ErrDepositZeroAmount"
        );
      });

      it("should succeed", async () => {
        const holder = await ethers.getSigner(fxUSDHolder);
        const token = await ethers.getContractAt("MockERC20", TOKENS.fxUSD.address, holder);
        const amountIn = ethers.parseEther("1");
        await token.connect(holder).approve(compounder.getAddress(), amountIn);
        await expect(
          compounder.connect(holder).deposit(holder.address, TOKENS.fxUSD.address, amountIn, amountIn + 1n)
        ).to.revertedWithCustomError(compounder, "ErrInsufficientSharesOut");
        await expect(compounder.connect(holder).deposit(holder.address, TOKENS.fxUSD.address, amountIn, amountIn))
          .to.emit(compounder, "Deposit")
          .withArgs(holder.address, holder.address, TOKENS.fxUSD.address, amountIn, amountIn);
        expect(await compounder.balanceOf(holder.address)).to.eq(amountIn);
        expect(await compounder.totalSupply()).to.eq(amountIn);
        expect(await compounder.totalDepositedFxUSD()).to.eq(amountIn);
        expect(await compounder.totalPendingBaseToken()).to.eq(0n);
        expect(await compounder.exchangeRate()).to.eq(10n ** 18n);
        expect(await compounder.nav()).to.eq(await compounder.exchangeRate());

        const harvested = await earn(ethers.parseEther("1")); // harvest 1 FXN
        expect(await compounder.exchangeRate()).to.eq(((harvested + amountIn) * 10n ** 18n) / amountIn);
        expect(await compounder.nav()).to.eq(await compounder.exchangeRate());
        await token.connect(holder).approve(compounder.getAddress(), amountIn);
        const sharesOut = await compounder
          .connect(holder)
          .deposit.staticCall(holder.address, TOKENS.fxUSD.address, amountIn, 0n);
        expect(sharesOut).to.lt(amountIn);
        await expect(
          compounder.connect(holder).deposit(holder.address, TOKENS.fxUSD.address, amountIn, sharesOut + 1n)
        ).to.revertedWithCustomError(compounder, "ErrInsufficientSharesOut");
        await expect(compounder.connect(holder).deposit(holder.address, TOKENS.fxUSD.address, amountIn, sharesOut))
          .to.emit(compounder, "Deposit")
          .withArgs(holder.address, holder.address, TOKENS.fxUSD.address, amountIn, sharesOut);
        expect(await compounder.balanceOf(holder.address)).to.eq(amountIn + sharesOut);
        expect(await compounder.totalSupply()).to.eq(amountIn + sharesOut);
        expect(await compounder.totalDepositedFxUSD()).to.eq(amountIn * 2n + harvested);
        expect(await compounder.totalPendingBaseToken()).to.eq(0n);
        expect(await compounder.exchangeRate()).to.eq(
          ((harvested + amountIn * 2n) * 10n ** 18n) / (amountIn + sharesOut)
        );
        expect(await compounder.nav()).to.closeTo(
          await compounder.exchangeRate(),
          (await compounder.exchangeRate()) / 10000n
        );
      });
    });

    context("deposit with wstETH", async () => {
      it("should revert when deposit zero", async () => {
        await expect(compounder.deposit(deployer.address, TOKENS.wstETH.address, 0n, 0n)).to.revertedWithCustomError(
          compounder,
          "ErrDepositZeroAmount"
        );
      });

      it("should succeed", async () => {
        const holder = await ethers.getSigner(wstETHHolder);
        const token = await ethers.getContractAt("MockERC20", TOKENS.wstETH.address, holder);
        const amountIn = ethers.parseEther("1");
        await token.connect(holder).approve(compounder.getAddress(), amountIn);
        const sharesOut = await compounder
          .connect(holder)
          .deposit.staticCall(holder.address, TOKENS.wstETH.address, amountIn, 0n);
        await expect(
          compounder.connect(holder).deposit(holder.address, TOKENS.wstETH.address, amountIn, sharesOut * 2n)
        ).to.revertedWithCustomError(compounder, "ErrInsufficientSharesOut");
        await expect(
          compounder.connect(holder).deposit(holder.address, TOKENS.wstETH.address, amountIn, sharesOut)
        ).to.emit(compounder, "Deposit");
        expect(await compounder.balanceOf(holder.address)).to.closeTo(sharesOut, sharesOut / 1000n);
        expect(await compounder.totalSupply()).to.closeTo(sharesOut, sharesOut / 1000n);
        expect(await compounder.totalDepositedFxUSD()).to.closeTo(sharesOut, sharesOut / 1000n);
        expect(await compounder.totalPendingBaseToken()).to.eq(0n);
      });
    });

    context("deposit with sfrxETH", async () => {
      it("should revert when deposit zero", async () => {
        await expect(compounder.deposit(deployer.address, TOKENS.sfrxETH.address, 0n, 0n)).to.revertedWithCustomError(
          compounder,
          "ErrDepositZeroAmount"
        );
      });

      it("should succeed", async () => {
        const holder = await ethers.getSigner(sfrxETHHolder);
        const token = await ethers.getContractAt("MockERC20", TOKENS.sfrxETH.address, holder);
        const amountIn = ethers.parseEther("1");
        await token.connect(holder).approve(compounder.getAddress(), amountIn);
        const sharesOut = await compounder
          .connect(holder)
          .deposit.staticCall(holder.address, TOKENS.sfrxETH.address, amountIn, 0n);
        await expect(
          compounder.connect(holder).deposit(holder.address, TOKENS.sfrxETH.address, amountIn, sharesOut * 2n)
        ).to.revertedWithCustomError(compounder, "ErrInsufficientSharesOut");
        await expect(
          compounder.connect(holder).deposit(holder.address, TOKENS.sfrxETH.address, amountIn, sharesOut)
        ).to.emit(compounder, "Deposit");
        expect(await compounder.balanceOf(holder.address)).to.closeTo(sharesOut, sharesOut / 1000n);
        expect(await compounder.totalSupply()).to.closeTo(sharesOut, sharesOut / 1000n);
        expect(await compounder.totalDepositedFxUSD()).to.closeTo(sharesOut, sharesOut / 1000n);
        expect(await compounder.totalPendingBaseToken()).to.eq(0n);
      });
    });
  });

  context("redeem", async () => {
    beforeEach(async () => {
      const holder = await ethers.getSigner(fxUSDHolder);
      const token = await ethers.getContractAt("MockERC20", TOKENS.fxUSD.address, holder);
      const amountIn = ethers.parseEther("10000");
      await token.connect(holder).approve(compounder.getAddress(), amountIn);
      await expect(compounder.connect(holder).deposit(deployer.address, TOKENS.fxUSD.address, amountIn, amountIn))
        .to.emit(compounder, "Deposit")
        .withArgs(holder.address, deployer.address, TOKENS.fxUSD.address, amountIn, amountIn);
      expect(await compounder.balanceOf(deployer.address)).to.eq(amountIn);
      expect(await compounder.totalSupply()).to.eq(amountIn);
      expect(await compounder.totalDepositedFxUSD()).to.eq(amountIn);
      expect(await compounder.totalPendingBaseToken()).to.eq(0n);
    });

    it("should revert when invalid token", async () => {
      await expect(compounder.redeem(ZeroAddress, 0n, ZeroAddress, 0n, false)).to.revertedWithCustomError(
        compounder,
        "ErrInvalidTokenOut"
      );
      await expect(compounder.redeem(ZeroAddress, 0n, ZeroAddress, 0n, true)).to.revertedWithCustomError(
        compounder,
        "ErrInvalidTokenOut"
      );
    });

    context("redeem as fxUSD", async () => {
      it("should revert when redeem zero", async () => {
        await expect(compounder.redeem(ZeroAddress, 0n, TOKENS.fxUSD.address, 0n, false)).to.revertedWithCustomError(
          compounder,
          "ErrRedeemZeroShares"
        );
        await expect(compounder.redeem(ZeroAddress, 0n, TOKENS.fxUSD.address, 0n, true)).to.revertedWithCustomError(
          compounder,
          "ErrRedeemZeroShares"
        );
      });

      it("should succeed", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.fxUSD.address, deployer);
        const supply = await compounder.totalSupply();
        const sharesOut = ethers.parseEther("1");
        const amountOut = await compounder.redeem.staticCall(
          deployer.address,
          sharesOut,
          TOKENS.fxUSD.address,
          0n,
          false
        );
        expect(amountOut).to.eq(sharesOut);
        await expect(
          compounder.redeem(deployer.address, sharesOut, TOKENS.fxUSD.address, amountOut + 1n, false)
        ).to.revertedWithCustomError(compounder, "ErrInsufficientTokensOut");
        await expect(compounder.redeem(deployer.address, sharesOut, TOKENS.fxUSD.address, amountOut, false))
          .to.emit(compounder, "Redeem")
          .withArgs(deployer.address, deployer.address, TOKENS.fxUSD.address, sharesOut, amountOut);
        expect(await compounder.balanceOf(deployer.address)).to.eq(supply - sharesOut);
        expect(await compounder.totalSupply()).to.eq(supply - sharesOut);
        expect(await compounder.totalDepositedFxUSD()).to.eq(supply - amountOut);
        expect(await compounder.totalPendingBaseToken()).to.eq(0n);
        expect(await tokenOut.balanceOf(deployer.address)).to.eq(amountOut);

        const harvested = await earn(ethers.parseEther("1"));
        await compounder.transfer(compounder.getAddress(), sharesOut);
        const amountOut2 = await compounder.redeem.staticCall(
          deployer.address,
          sharesOut,
          TOKENS.fxUSD.address,
          0n,
          true
        );
        expect(amountOut2).to.gt(sharesOut);
        await expect(
          compounder.redeem(keeper.address, sharesOut, TOKENS.fxUSD.address, amountOut2 + 1n, true)
        ).to.revertedWithCustomError(compounder, "ErrInsufficientTokensOut");
        await expect(compounder.redeem(keeper.address, sharesOut, TOKENS.fxUSD.address, amountOut2, true))
          .to.emit(compounder, "Redeem")
          .withArgs(deployer.address, keeper.address, TOKENS.fxUSD.address, sharesOut, amountOut2);
        expect(await compounder.balanceOf(deployer.address)).to.eq(supply - sharesOut * 2n);
        expect(await compounder.totalSupply()).to.eq(supply - sharesOut * 2n);
        expect(await compounder.totalDepositedFxUSD()).to.eq(supply - amountOut - amountOut2 + harvested);
        expect(await compounder.totalPendingBaseToken()).to.eq(0n);
        expect(await tokenOut.balanceOf(keeper.address)).to.eq(amountOut2);
      });
    });

    context("redeem as wstETH", async () => {
      it("should revert when redeem zero", async () => {
        await expect(compounder.redeem(ZeroAddress, 0n, TOKENS.wstETH.address, 0n, false)).to.revertedWithCustomError(
          compounder,
          "ErrRedeemZeroShares"
        );
        await expect(compounder.redeem(ZeroAddress, 0n, TOKENS.wstETH.address, 0n, true)).to.revertedWithCustomError(
          compounder,
          "ErrRedeemZeroShares"
        );
      });

      it("should succeed", async () => {
        const tokenOut = await ethers.getContractAt("MockERC20", TOKENS.wstETH.address, deployer);
        const supply = await compounder.totalSupply();
        const sharesOut = ethers.parseEther("1");
        const amountOut = await compounder.redeem.staticCall(
          deployer.address,
          sharesOut,
          TOKENS.wstETH.address,
          0n,
          false
        );
        await expect(
          compounder.redeem(deployer.address, sharesOut, TOKENS.wstETH.address, amountOut + 1n, false)
        ).to.revertedWithCustomError(compounder, "ErrInsufficientTokensOut");
        await expect(compounder.redeem(deployer.address, sharesOut, TOKENS.wstETH.address, amountOut, false)).to.emit(
          compounder,
          "Redeem"
        );
        expect(await compounder.balanceOf(deployer.address)).to.eq(supply - sharesOut);
        expect(await compounder.totalSupply()).to.eq(supply - sharesOut);
        expect(await compounder.totalDepositedFxUSD()).to.eq(supply - sharesOut);
        expect(await compounder.totalPendingBaseToken()).to.eq(0n);
        expect(await tokenOut.balanceOf(deployer.address)).to.closeTo(amountOut, amountOut / 1000n);

        await earn(ethers.parseEther("1"));
        await compounder.transfer(compounder.getAddress(), sharesOut);
        const amountOut2 = await compounder.redeem.staticCall(
          deployer.address,
          sharesOut,
          TOKENS.wstETH.address,
          0n,
          true
        );
        await expect(
          compounder.redeem(keeper.address, sharesOut, TOKENS.wstETH.address, amountOut2 + 1n, true)
        ).to.revertedWithCustomError(compounder, "ErrInsufficientTokensOut");
        await expect(compounder.redeem(keeper.address, sharesOut, TOKENS.wstETH.address, amountOut2, true)).to.emit(
          compounder,
          "Redeem"
        );
        expect(await compounder.balanceOf(deployer.address)).to.eq(supply - sharesOut * 2n);
        expect(await compounder.totalSupply()).to.eq(supply - sharesOut * 2n);
        expect(await compounder.totalPendingBaseToken()).to.eq(0n);
        expect(await tokenOut.balanceOf(keeper.address)).to.closeTo(amountOut2, amountOut2 / 1000n);
      });
    });
  });
});

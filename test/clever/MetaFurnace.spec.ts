/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { CLeverToken, MockERC20, MetaFurnace, MockYieldStrategy } from "../../typechain";
import { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import "../utils";

describe("Furnace.spec", async () => {
  let deployer: SignerWithAddress;
  let signer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let baseToken: MockERC20;
  let debtToken: CLeverToken;
  let furnace: MetaFurnace;
  let strategy: MockYieldStrategy;

  const run = async (baseDecimals: number) => {
    const scale = BigNumber.from(10).pow(18 - baseDecimals);

    describe(`test with decimal: ${baseDecimals}`, async () => {
      beforeEach(async () => {
        [deployer, signer, alice, bob] = await ethers.getSigners();

        const CLeverToken = await ethers.getContractFactory("CLeverToken", deployer);
        debtToken = (await CLeverToken.deploy("clev X", "clevY")) as CLeverToken;
        await debtToken.deployed();

        const MockERC20 = await ethers.getContractFactory("MockERC20", signer);
        baseToken = await MockERC20.deploy("X", "Y", baseDecimals);
        await baseToken.deployed();

        await baseToken.mint(signer.address, constants.MaxUint256.div(2));

        await debtToken.updateMinters([deployer.address], true);
        await debtToken.updateCeiling(deployer.address, ethers.utils.parseEther("10000000"));

        const Furnace = await ethers.getContractFactory("MetaFurnace", deployer);
        furnace = await Furnace.deploy();
        await furnace.deployed();
        await furnace.initialize(baseToken.address, debtToken.address);

        const MockYieldStrategy = await ethers.getContractFactory("MockYieldStrategy", deployer);
        strategy = await MockYieldStrategy.deploy(baseToken.address, furnace.address);
        await strategy.deployed();

        await furnace.updateYieldInfo(50000, 0);
        await furnace.migrateStrategy(strategy.address);
        await furnace.updatePlatformInfo(deployer.address, 2e8, 5e7);
      });

      context("furnace has free baseToken", async () => {
        beforeEach(async () => {
          await baseToken.transfer(furnace.address, ethers.utils.parseUnits("1000", baseDecimals));
          expect(await furnace.totalBaseTokenInPool()).to.eq(ethers.utils.parseUnits("1000", baseDecimals));

          await debtToken.mint(alice.address, ethers.utils.parseEther("2000"));
        });

        it("should furnace all debtToken to baseToken, when having enouch baseToken in pool", async () => {
          // deposit
          await debtToken.connect(alice).approve(furnace.address, ethers.utils.parseEther("100"));
          await furnace.connect(alice).deposit(alice.address, ethers.utils.parseEther("100"));
          let [unrealised, realised] = await furnace.getUserInfo(alice.address);
          expect(realised).to.eq(ethers.utils.parseEther("100"));
          expect(unrealised).to.eq(ethers.utils.parseEther("0"));
          expect((await furnace.furnaceInfo()).totalRealised).to.eq(ethers.utils.parseEther("100"));
          expect((await furnace.furnaceInfo()).totalUnrealised).to.eq(ethers.utils.parseEther("0"));
          expect(await debtToken.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("100"));

          // claim
          const before = await baseToken.balanceOf(alice.address);
          await furnace.connect(alice).claim(alice.address);
          const after = await baseToken.balanceOf(alice.address);
          expect(after.sub(before)).to.eq(ethers.utils.parseUnits("100", baseDecimals));
          expect(await furnace.totalBaseTokenInPool()).to.eq(ethers.utils.parseUnits("900", baseDecimals));
          expect(await debtToken.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("0"));

          // query
          [unrealised, realised] = await furnace.getUserInfo(alice.address);
          expect(realised).to.eq(ethers.utils.parseEther("0"));
          expect(unrealised).to.eq(ethers.utils.parseEther("0"));
          expect((await furnace.furnaceInfo()).totalRealised).to.eq(ethers.utils.parseEther("0"));
          expect((await furnace.furnaceInfo()).totalUnrealised).to.eq(ethers.utils.parseEther("0"));
        });

        it("should furnace part debtToken to baseToken, when having insufficient baseToken in pool", async () => {
          // deposit
          await debtToken.connect(alice).approve(furnace.address, ethers.utils.parseEther("2000"));
          await furnace.connect(alice).deposit(alice.address, ethers.utils.parseEther("1500"));
          let [unrealised, realised] = await furnace.getUserInfo(alice.address);
          expect(realised).to.eq(ethers.utils.parseEther("1000"));
          expect(unrealised).to.eq(ethers.utils.parseEther("500"));
          expect((await furnace.furnaceInfo()).totalRealised).to.eq(ethers.utils.parseEther("1000"));
          expect((await furnace.furnaceInfo()).totalUnrealised).to.eq(ethers.utils.parseEther("500"));
          expect(await debtToken.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("1500"));

          // claim
          let before = await baseToken.balanceOf(alice.address);
          await furnace.connect(alice).claim(alice.address);
          let after = await baseToken.balanceOf(alice.address);
          expect(after.sub(before)).to.eq(ethers.utils.parseUnits("1000", baseDecimals));
          expect(await furnace.totalBaseTokenInPool()).to.eq(ethers.utils.parseEther("0"));
          expect(await debtToken.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("500"));

          // query
          [unrealised, realised] = await furnace.getUserInfo(alice.address);
          expect(realised).to.eq(ethers.utils.parseEther("0"));
          expect(unrealised).to.eq(ethers.utils.parseEther("500"));
          expect((await furnace.furnaceInfo()).totalRealised).to.eq(ethers.utils.parseEther("0"));
          expect((await furnace.furnaceInfo()).totalUnrealised).to.eq(ethers.utils.parseEther("500"));

          // withdraw
          before = await debtToken.balanceOf(alice.address);
          await furnace.connect(alice).withdraw(alice.address, ethers.utils.parseEther("200"));
          after = await debtToken.balanceOf(alice.address);
          expect(after.sub(before)).to.eq(ethers.utils.parseEther("200"));
          [unrealised, realised] = await furnace.getUserInfo(alice.address);
          expect(realised).to.eq(ethers.utils.parseEther("0"));
          expect(unrealised).to.eq(ethers.utils.parseEther("300"));
          expect((await furnace.furnaceInfo()).totalRealised).to.eq(ethers.utils.parseEther("0"));
          expect((await furnace.furnaceInfo()).totalUnrealised).to.eq(ethers.utils.parseEther("300"));
          expect(await debtToken.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("300"));

          // withdraw all
          before = await debtToken.balanceOf(alice.address);
          await furnace.connect(alice).withdrawAll(alice.address);
          after = await debtToken.balanceOf(alice.address);
          expect(after.sub(before)).to.eq(ethers.utils.parseEther("300"));
          [unrealised, realised] = await furnace.getUserInfo(alice.address);
          expect(realised).to.eq(ethers.utils.parseEther("0"));
          expect(unrealised).to.eq(ethers.utils.parseEther("0"));
          expect((await furnace.furnaceInfo()).totalRealised).to.eq(ethers.utils.parseEther("0"));
          expect((await furnace.furnaceInfo()).totalUnrealised).to.eq(ethers.utils.parseEther("0"));
          expect(await debtToken.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("0"));
        });
      });

      context("furnace has no baseToken", async () => {
        beforeEach(async () => {
          await furnace.updateWhitelists([deployer.address], true);
          await baseToken.approve(furnace.address, constants.MaxUint256);

          await debtToken.mint(alice.address, ethers.utils.parseEther("2000"));
          await debtToken.mint(bob.address, ethers.utils.parseEther("2000"));
        });

        it("should distribute correctly, when only one user", async () => {
          // deposit 100 debtToken
          await debtToken.connect(alice).approve(furnace.address, ethers.utils.parseEther("100"));
          await furnace.connect(alice).deposit(alice.address, ethers.utils.parseEther("100"));
          let [unrealised, realised] = await furnace.getUserInfo(alice.address);
          expect(realised).to.closeToBn(ethers.utils.parseEther("0"), 0);
          expect(unrealised).to.closeToBn(ethers.utils.parseEther("100"), 0);
          expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("100"));
          expect((await furnace.furnaceInfo()).totalRealised).to.eq(ethers.utils.parseEther("0"));
          expect((await furnace.furnaceInfo()).totalUnrealised).to.eq(ethers.utils.parseEther("100"));
          expect(await debtToken.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("100"));

          // distribute 3 baseToken
          await baseToken.transfer(furnace.address, ethers.utils.parseUnits("3", baseDecimals));
          await furnace.distribute(signer.address, baseToken.address, ethers.utils.parseUnits("3", baseDecimals));
          [unrealised, realised] = await furnace.getUserInfo(alice.address);
          expect(realised).to.closeToBn(ethers.utils.parseEther("3"), 10);
          expect(unrealised).to.closeToBn(ethers.utils.parseEther("97"), 10);
          expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("100"));
          expect((await furnace.furnaceInfo()).totalRealised).to.eq(ethers.utils.parseEther("3"));
          expect((await furnace.furnaceInfo()).totalUnrealised).to.eq(ethers.utils.parseEther("97"));
          expect(await debtToken.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("100"));

          // distribute another 6 baseToken
          await baseToken.transfer(furnace.address, ethers.utils.parseUnits("6", baseDecimals));
          await furnace.distribute(signer.address, baseToken.address, ethers.utils.parseUnits("6", baseDecimals));
          [unrealised, realised] = await furnace.getUserInfo(alice.address);
          expect(realised).to.closeToBn(ethers.utils.parseEther("9"), 10);
          expect(unrealised).to.closeToBn(ethers.utils.parseEther("91"), 10);
          expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("100"));
          expect((await furnace.furnaceInfo()).totalRealised).to.eq(ethers.utils.parseEther("9"));
          expect((await furnace.furnaceInfo()).totalUnrealised).to.eq(ethers.utils.parseEther("91"));
          expect(await debtToken.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("100"));

          // claim 9 baseToken and query
          let before = await baseToken.balanceOf(alice.address);
          await furnace.connect(alice).claim(alice.address);
          let after = await baseToken.balanceOf(alice.address);
          expect(after.sub(before)).to.closeToBn(ethers.utils.parseUnits("9", baseDecimals), 10);
          [unrealised, realised] = await furnace.getUserInfo(alice.address);
          expect(realised).to.closeToBn(ethers.utils.parseEther("0"), 0);
          expect(unrealised).to.closeToBn(ethers.utils.parseEther("91"), 10);
          expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("91"));
          expect((await furnace.furnaceInfo()).totalRealised).to.eq(ethers.utils.parseEther("0"));
          expect((await furnace.furnaceInfo()).totalUnrealised).to.eq(ethers.utils.parseEther("91"));
          expect(await debtToken.balanceOf(furnace.address)).to.eq(
            ethers.utils.parseEther("100").sub(after.sub(before).mul(scale))
          );

          // deposit 9 debtToken
          await debtToken.connect(alice).approve(furnace.address, ethers.utils.parseEther("9"));
          await furnace.connect(alice).deposit(alice.address, ethers.utils.parseEther("9"));
          [unrealised, realised] = await furnace.getUserInfo(alice.address);
          expect(realised).to.closeToBn(ethers.utils.parseEther("0"), 0);
          expect(unrealised).to.closeToBn(ethers.utils.parseEther("100"), 10);
          expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("100"));
          expect((await furnace.furnaceInfo()).totalRealised).to.eq(ethers.utils.parseEther("0"));
          expect((await furnace.furnaceInfo()).totalUnrealised).to.eq(ethers.utils.parseEther("100"));

          // distribute 100 baseToken to pay all debt
          await baseToken.transfer(furnace.address, ethers.utils.parseUnits("100", baseDecimals));
          await furnace.distribute(signer.address, baseToken.address, ethers.utils.parseUnits("100", baseDecimals));
          [unrealised, realised] = await furnace.getUserInfo(alice.address);
          expect(realised).to.closeToBn(ethers.utils.parseEther("100"), 10);
          expect(unrealised).to.closeToBn(ethers.utils.parseEther("0"), 10);
          expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("100"));
          expect((await furnace.furnaceInfo()).totalRealised).to.eq(ethers.utils.parseEther("100"));
          expect((await furnace.furnaceInfo()).totalUnrealised).to.eq(ethers.utils.parseEther("0"));

          // deposit 10 debtToken
          await debtToken.connect(alice).approve(furnace.address, ethers.utils.parseEther("10"));
          await furnace.connect(alice).deposit(alice.address, ethers.utils.parseEther("10"));
          [unrealised, realised] = await furnace.getUserInfo(alice.address);
          expect(realised).to.closeToBn(ethers.utils.parseEther("100"), 0);
          expect(unrealised).to.closeToBn(ethers.utils.parseEther("10"), 10);
          expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("110"));
          expect((await furnace.furnaceInfo()).totalRealised).to.eq(ethers.utils.parseEther("100"));
          expect((await furnace.furnaceInfo()).totalUnrealised).to.eq(ethers.utils.parseEther("10"));

          // distribute another 10 baseToken to pay all debt
          await baseToken.transfer(furnace.address, ethers.utils.parseUnits("10", baseDecimals));
          await furnace.distribute(signer.address, baseToken.address, ethers.utils.parseUnits("10", baseDecimals));
          [unrealised, realised] = await furnace.getUserInfo(alice.address);
          expect(realised).to.closeToBn(ethers.utils.parseEther("110"), 10);
          expect(unrealised).to.closeToBn(ethers.utils.parseEther("0"), 10);
          expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("110"));
          expect((await furnace.furnaceInfo()).totalRealised).to.eq(ethers.utils.parseEther("110"));
          expect((await furnace.furnaceInfo()).totalUnrealised).to.eq(ethers.utils.parseEther("0"));

          // claim all baseToken
          before = await baseToken.balanceOf(alice.address);
          await furnace.connect(alice).claim(alice.address);
          after = await baseToken.balanceOf(alice.address);
          expect(after.sub(before)).to.closeToBn(ethers.utils.parseUnits("110", baseDecimals), 10);
          [unrealised, realised] = await furnace.getUserInfo(alice.address);
          expect(realised).to.closeToBn(ethers.utils.parseEther("0"), 0);
          expect(unrealised).to.closeToBn(ethers.utils.parseEther("0"), 0);
          expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("0"));
          expect((await furnace.furnaceInfo()).totalRealised).to.eq(ethers.utils.parseEther("0"));
          expect((await furnace.furnaceInfo()).totalUnrealised).to.eq(ethers.utils.parseEther("0"));
          expect(await debtToken.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("0"));

          // distribute another 100 baseToken
          await baseToken.transfer(furnace.address, ethers.utils.parseUnits("100", baseDecimals));
          await furnace.distribute(signer.address, baseToken.address, ethers.utils.parseUnits("100", baseDecimals));
          [unrealised, realised] = await furnace.getUserInfo(alice.address);
          expect(realised).to.closeToBn(ethers.utils.parseEther("0"), 0);
          expect(unrealised).to.closeToBn(ethers.utils.parseEther("0"), 0);
          expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("0"));
          expect((await furnace.furnaceInfo()).totalRealised).to.eq(ethers.utils.parseEther("0"));
          expect((await furnace.furnaceInfo()).totalUnrealised).to.eq(ethers.utils.parseEther("0"));
          expect(await debtToken.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("0"));
          // 50% should be deposited into baseTokenRewardPool
          expect(await furnace.totalBaseTokenInPool()).to.eq(ethers.utils.parseUnits("100", baseDecimals));
          expect(await baseToken.balanceOf(furnace.address)).to.eq(ethers.utils.parseUnits("50", baseDecimals));

          // harvest
          await furnace.connect(alice).harvest(bob.address, 0);
          [unrealised, realised] = await furnace.getUserInfo(alice.address);
          expect(realised).to.closeToBn(ethers.utils.parseEther("0"), 0);
          expect(unrealised).to.closeToBn(ethers.utils.parseEther("0"), 0);
          expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("0"));
          expect((await furnace.furnaceInfo()).totalRealised).to.eq(ethers.utils.parseEther("0"));
          expect((await furnace.furnaceInfo()).totalUnrealised).to.eq(ethers.utils.parseEther("0"));
          expect(await debtToken.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("0"));
          // 50% should be deposited into baseTokenRewardPool
          expect(await furnace.totalBaseTokenInPool()).to.gte(ethers.utils.parseUnits("100", baseDecimals));
          expect(await baseToken.balanceOf(furnace.address)).to.gte(ethers.utils.parseUnits("50", baseDecimals));
        });

        // TODO: test on two or more users
      });
    });
  };

  run(6);
  run(18);
});

/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { CLeverToken, IERC20, Furnace } from "../../typechain";
import { request_fork } from "../utils";
import { ethers } from "hardhat";
import { expect } from "chai";
import { constants } from "ethers";
import { ZAP_ROUTES } from "../../scripts/utils";

const FORK_BLOCK_NUMBER = 14386700;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const CVX_HOLDER = "0x28C6c06298d514Db089934071355E5743bf21d60";
const PLATFORM = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const PLATFORM_FEE_PERCENTAGE = 2.5e7; // 2.5%
const HARVEST_BOUNTY_PERCENTAGE = 2.5e7; // 2.5%
const CVXCRV = "0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7";

describe("Furnace.spec", async () => {
  let deployer: SignerWithAddress;
  let signer: SignerWithAddress;
  let clevCVX: CLeverToken;
  let cvx: IERC20;
  let furnace: Furnace;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CVX_HOLDER]);
    deployer = await ethers.getSigner(DEPLOYER);
    signer = await ethers.getSigner(CVX_HOLDER);

    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    const CLeverToken = await ethers.getContractFactory("CLeverToken", deployer);
    clevCVX = (await CLeverToken.deploy("CLever CVX", "clevCVX")) as CLeverToken;
    await clevCVX.deployed();

    cvx = await ethers.getContractAt("IERC20", CVX, signer);

    await clevCVX.updateMinters([deployer.address], true);
    await clevCVX.updateCeiling(deployer.address, ethers.utils.parseEther("10000000"));

    const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
    const zap = await AladdinZap.deploy();
    await zap.deployed();
    await zap.initialize();

    // 1. cvxcrv ==> crv with CurveFactoryPlainPool
    // 2. crv ==> eth with CurveCryptoPool
    // 3. eth ==> cvx with UniswapV2
    await zap.updateRoute(CVXCRV, CVX, ZAP_ROUTES.cvxCRV.CVX);

    const Furnace = await ethers.getContractFactory("Furnace", deployer);
    furnace = await Furnace.deploy();
    await furnace.deployed();
    await furnace.initialize(
      deployer.address,
      clevCVX.address,
      zap.address,
      PLATFORM,
      PLATFORM_FEE_PERCENTAGE,
      HARVEST_BOUNTY_PERCENTAGE
    );
  });

  context("furnace has free CVX", async () => {
    let alice: SignerWithAddress;

    beforeEach(async () => {
      [alice] = await ethers.getSigners();
      await cvx.transfer(furnace.address, ethers.utils.parseEther("1000"));
      expect(await furnace.totalCVXInPool()).to.eq(ethers.utils.parseEther("1000"));

      await clevCVX.mint(alice.address, ethers.utils.parseEther("2000"));
    });

    it("should furnace all clevCVX to CVX, when having enouch CVX in pool", async () => {
      // deposit
      await clevCVX.connect(alice).approve(furnace.address, ethers.utils.parseEther("100"));
      await furnace.connect(alice).deposit(ethers.utils.parseEther("100"));
      let [unrealised, realised] = await furnace.getUserInfo(alice.address);
      expect(realised).to.eq(ethers.utils.parseEther("100"));
      expect(unrealised).to.eq(ethers.utils.parseEther("0"));
      expect(await furnace.totalRealised()).to.eq(ethers.utils.parseEther("100"));
      expect(await furnace.totalUnrealised()).to.eq(ethers.utils.parseEther("0"));
      expect(await clevCVX.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("100"));

      // claim
      const before = await cvx.balanceOf(alice.address);
      await furnace.connect(alice).claim(alice.address);
      const after = await cvx.balanceOf(alice.address);
      expect(after.sub(before)).to.eq(ethers.utils.parseEther("100"));
      expect(await furnace.totalCVXInPool()).to.eq(ethers.utils.parseEther("900"));
      expect(await clevCVX.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("0"));

      // query
      [unrealised, realised] = await furnace.getUserInfo(alice.address);
      expect(realised).to.eq(ethers.utils.parseEther("0"));
      expect(unrealised).to.eq(ethers.utils.parseEther("0"));
      expect(await furnace.totalRealised()).to.eq(ethers.utils.parseEther("0"));
      expect(await furnace.totalUnrealised()).to.eq(ethers.utils.parseEther("0"));
    });

    it("should furnace part clevCVX to CVX, when having insufficient CVX in pool", async () => {
      // deposit
      await clevCVX.connect(alice).approve(furnace.address, ethers.utils.parseEther("2000"));
      await furnace.connect(alice).deposit(ethers.utils.parseEther("1500"));
      let [unrealised, realised] = await furnace.getUserInfo(alice.address);
      expect(realised).to.eq(ethers.utils.parseEther("1000"));
      expect(unrealised).to.eq(ethers.utils.parseEther("500"));
      expect(await furnace.totalRealised()).to.eq(ethers.utils.parseEther("1000"));
      expect(await furnace.totalUnrealised()).to.eq(ethers.utils.parseEther("500"));
      expect(await clevCVX.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("1500"));

      // claim
      let before = await cvx.balanceOf(alice.address);
      await furnace.connect(alice).claim(alice.address);
      let after = await cvx.balanceOf(alice.address);
      expect(after.sub(before)).to.eq(ethers.utils.parseEther("1000"));
      expect(await furnace.totalCVXInPool()).to.eq(ethers.utils.parseEther("0"));
      expect(await clevCVX.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("500"));

      // query
      [unrealised, realised] = await furnace.getUserInfo(alice.address);
      expect(realised).to.eq(ethers.utils.parseEther("0"));
      expect(unrealised).to.eq(ethers.utils.parseEther("500"));
      expect(await furnace.totalRealised()).to.eq(ethers.utils.parseEther("0"));
      expect(await furnace.totalUnrealised()).to.eq(ethers.utils.parseEther("500"));

      // withdraw
      before = await clevCVX.balanceOf(alice.address);
      await furnace.connect(alice).withdraw(alice.address, ethers.utils.parseEther("200"));
      after = await clevCVX.balanceOf(alice.address);
      expect(after.sub(before)).to.eq(ethers.utils.parseEther("200"));
      [unrealised, realised] = await furnace.getUserInfo(alice.address);
      expect(realised).to.eq(ethers.utils.parseEther("0"));
      expect(unrealised).to.eq(ethers.utils.parseEther("300"));
      expect(await furnace.totalRealised()).to.eq(ethers.utils.parseEther("0"));
      expect(await furnace.totalUnrealised()).to.eq(ethers.utils.parseEther("300"));
      expect(await clevCVX.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("300"));

      // withdraw all
      before = await clevCVX.balanceOf(alice.address);
      await furnace.connect(alice).withdrawAll(alice.address);
      after = await clevCVX.balanceOf(alice.address);
      expect(after.sub(before)).to.eq(ethers.utils.parseEther("300"));
      [unrealised, realised] = await furnace.getUserInfo(alice.address);
      expect(realised).to.eq(ethers.utils.parseEther("0"));
      expect(unrealised).to.eq(ethers.utils.parseEther("0"));
      expect(await furnace.totalRealised()).to.eq(ethers.utils.parseEther("0"));
      expect(await furnace.totalUnrealised()).to.eq(ethers.utils.parseEther("0"));
      expect(await clevCVX.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("0"));
    });
  });

  context("furnace has no CVX", async () => {
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    beforeEach(async () => {
      [alice, bob] = await ethers.getSigners();

      await furnace.updateWhitelists([deployer.address], true);
      await furnace.updateStakePercentage(5e8);
      await cvx.approve(furnace.address, constants.MaxUint256);

      await clevCVX.mint(alice.address, ethers.utils.parseEther("2000"));
      await clevCVX.mint(bob.address, ethers.utils.parseEther("2000"));
    });

    it("should distribute correctly, when only one user", async () => {
      // deposit 100 clevCVX
      await clevCVX.connect(alice).approve(furnace.address, ethers.utils.parseEther("100"));
      await furnace.connect(alice).deposit(ethers.utils.parseEther("100"));
      let [unrealised, realised] = await furnace.getUserInfo(alice.address);
      expect(realised).to.closeToBn(ethers.utils.parseEther("0"), 0);
      expect(unrealised).to.closeToBn(ethers.utils.parseEther("100"), 0);
      expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("100"));
      expect(await furnace.totalRealised()).to.eq(ethers.utils.parseEther("0"));
      expect(await furnace.totalUnrealised()).to.eq(ethers.utils.parseEther("100"));
      expect(await clevCVX.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("100"));

      // distribute 3 CVX
      await furnace.distribute(signer.address, ethers.utils.parseEther("3"));
      [unrealised, realised] = await furnace.getUserInfo(alice.address);
      expect(realised).to.closeToBn(ethers.utils.parseEther("3"), 10);
      expect(unrealised).to.closeToBn(ethers.utils.parseEther("97"), 10);
      expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("100"));
      expect(await furnace.totalRealised()).to.eq(ethers.utils.parseEther("3"));
      expect(await furnace.totalUnrealised()).to.eq(ethers.utils.parseEther("97"));
      expect(await clevCVX.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("100"));

      // distribute another 6 CVX
      await furnace.distribute(signer.address, ethers.utils.parseEther("6"));
      [unrealised, realised] = await furnace.getUserInfo(alice.address);
      expect(realised).to.closeToBn(ethers.utils.parseEther("9"), 10);
      expect(unrealised).to.closeToBn(ethers.utils.parseEther("91"), 10);
      expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("100"));
      expect(await furnace.totalRealised()).to.eq(ethers.utils.parseEther("9"));
      expect(await furnace.totalUnrealised()).to.eq(ethers.utils.parseEther("91"));
      expect(await clevCVX.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("100"));

      // claim 9 CVX and query
      let before = await cvx.balanceOf(alice.address);
      await furnace.connect(alice).claim(alice.address);
      let after = await cvx.balanceOf(alice.address);
      expect(after.sub(before)).to.closeToBn(ethers.utils.parseEther("9"), 10);
      [unrealised, realised] = await furnace.getUserInfo(alice.address);
      expect(realised).to.closeToBn(ethers.utils.parseEther("0"), 0);
      expect(unrealised).to.closeToBn(ethers.utils.parseEther("91"), 10);
      expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("91"));
      expect(await furnace.totalRealised()).to.eq(ethers.utils.parseEther("0"));
      expect(await furnace.totalUnrealised()).to.eq(ethers.utils.parseEther("91"));
      expect(await clevCVX.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("100").sub(after.sub(before)));

      // deposit 9 clevCVX
      await clevCVX.connect(alice).approve(furnace.address, ethers.utils.parseEther("9"));
      await furnace.connect(alice).deposit(ethers.utils.parseEther("9"));
      [unrealised, realised] = await furnace.getUserInfo(alice.address);
      expect(realised).to.closeToBn(ethers.utils.parseEther("0"), 0);
      expect(unrealised).to.closeToBn(ethers.utils.parseEther("100"), 10);
      expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("100"));
      expect(await furnace.totalRealised()).to.eq(ethers.utils.parseEther("0"));
      expect(await furnace.totalUnrealised()).to.eq(ethers.utils.parseEther("100"));

      // distribute 100 CVX to pay all debt
      await furnace.distribute(signer.address, ethers.utils.parseEther("100"));
      [unrealised, realised] = await furnace.getUserInfo(alice.address);
      expect(realised).to.closeToBn(ethers.utils.parseEther("100"), 10);
      expect(unrealised).to.closeToBn(ethers.utils.parseEther("0"), 10);
      expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("100"));
      expect(await furnace.totalRealised()).to.eq(ethers.utils.parseEther("100"));
      expect(await furnace.totalUnrealised()).to.eq(ethers.utils.parseEther("0"));

      // deposit 10 clevCVX
      await clevCVX.connect(alice).approve(furnace.address, ethers.utils.parseEther("10"));
      await furnace.connect(alice).deposit(ethers.utils.parseEther("10"));
      [unrealised, realised] = await furnace.getUserInfo(alice.address);
      expect(realised).to.closeToBn(ethers.utils.parseEther("100"), 0);
      expect(unrealised).to.closeToBn(ethers.utils.parseEther("10"), 10);
      expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("110"));
      expect(await furnace.totalRealised()).to.eq(ethers.utils.parseEther("100"));
      expect(await furnace.totalUnrealised()).to.eq(ethers.utils.parseEther("10"));

      // distribute another 10 CVX to pay all debt
      await furnace.distribute(signer.address, ethers.utils.parseEther("10"));
      [unrealised, realised] = await furnace.getUserInfo(alice.address);
      expect(realised).to.closeToBn(ethers.utils.parseEther("110"), 10);
      expect(unrealised).to.closeToBn(ethers.utils.parseEther("0"), 10);
      expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("110"));
      expect(await furnace.totalRealised()).to.eq(ethers.utils.parseEther("110"));
      expect(await furnace.totalUnrealised()).to.eq(ethers.utils.parseEther("0"));

      // claim all CVX
      before = await cvx.balanceOf(alice.address);
      await furnace.connect(alice).claim(alice.address);
      after = await cvx.balanceOf(alice.address);
      expect(after.sub(before)).to.closeToBn(ethers.utils.parseEther("110"), 10);
      [unrealised, realised] = await furnace.getUserInfo(alice.address);
      expect(realised).to.closeToBn(ethers.utils.parseEther("0"), 0);
      expect(unrealised).to.closeToBn(ethers.utils.parseEther("0"), 0);
      expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("0"));
      expect(await furnace.totalRealised()).to.eq(ethers.utils.parseEther("0"));
      expect(await furnace.totalUnrealised()).to.eq(ethers.utils.parseEther("0"));
      expect(await clevCVX.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("0"));

      // distribute another 100 CVX
      await furnace.distribute(signer.address, ethers.utils.parseEther("100"));
      [unrealised, realised] = await furnace.getUserInfo(alice.address);
      expect(realised).to.closeToBn(ethers.utils.parseEther("0"), 0);
      expect(unrealised).to.closeToBn(ethers.utils.parseEther("0"), 0);
      expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("0"));
      expect(await furnace.totalRealised()).to.eq(ethers.utils.parseEther("0"));
      expect(await furnace.totalUnrealised()).to.eq(ethers.utils.parseEther("0"));
      expect(await clevCVX.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("0"));
      // 50% should be deposited into CVXRewardPool
      expect(await furnace.totalCVXInPool()).to.eq(ethers.utils.parseEther("100"));
      expect(await cvx.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("50"));

      // harvest
      await furnace.connect(alice).harvest(bob.address, 0);
      [unrealised, realised] = await furnace.getUserInfo(alice.address);
      expect(realised).to.closeToBn(ethers.utils.parseEther("0"), 0);
      expect(unrealised).to.closeToBn(ethers.utils.parseEther("0"), 0);
      expect(unrealised.add(realised)).to.eq(ethers.utils.parseEther("0"));
      expect(await furnace.totalRealised()).to.eq(ethers.utils.parseEther("0"));
      expect(await furnace.totalUnrealised()).to.eq(ethers.utils.parseEther("0"));
      expect(await clevCVX.balanceOf(furnace.address)).to.eq(ethers.utils.parseEther("0"));
      // 50% should be deposited into CVXRewardPool
      expect(await furnace.totalCVXInPool()).to.gt(ethers.utils.parseEther("100"));
      expect(await cvx.balanceOf(furnace.address)).to.gt(ethers.utils.parseEther("50"));
    });

    // TODO: test on two or more users
  });
});

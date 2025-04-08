/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { MaxUint256, solidityPackedKeccak256, ZeroAddress } from "ethers";
import { ethers, network } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import { IMultiMerkleStash, SdPendleCompounder, SdPendleGaugeStrategy } from "@/types/index";
import { CONVERTER_ROUTRS, TOKENS } from "@/utils/index";

const DEPLOYER = "0x1000000000000000000000000000000000000001";
const OPERATOR = "0x2000000000000000000000000000000000000002";
const OWNER_ALADDIN = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const OWNER_CONCENTRATOR = "0xA0FB1b11ccA5871fb0225B64308e249B97804E99";
const MERKLE_OWNER = "0x2f18e001B44DCc1a1968553A2F32ab8d45B12195";

const SdPendleGauge = "0x50DC9aE51f78C593d4138263da7088A973b8184E";
const PendleHolder = "0x131b2070814623CeE8DE6054240c9158c007c0a5";
const SdPendleHolder = "0x44eE3BC492449497221a82031880a345a8f790a0";
const SdPendleGaugeHolder = "0xb20179E162Ec6403d0884C904D54b6A5AF0d43FC";
const Locker = "0x1c0D72a330F2768dAF718DEf8A19BAb019EEAd09";

const FORK_HEIGHT = 22116250;

describe("SdPendleCompounder.spec", async () => {
  let deployer: HardhatEthersSigner;
  let holderPendle: HardhatEthersSigner;
  let holderSdPendle: HardhatEthersSigner;
  let holderSdPendleGauge: HardhatEthersSigner;

  let strategy: SdPendleGaugeStrategy;
  let compounder: SdPendleCompounder;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [
      DEPLOYER,
      PendleHolder,
      SdPendleHolder,
      SdPendleGaugeHolder,
      OWNER_ALADDIN,
      OWNER_CONCENTRATOR,
      MERKLE_OWNER,
      OPERATOR,
    ]);
    const ownerAladdin = await ethers.getSigner(OWNER_ALADDIN);
    const ownerConcentrator = await ethers.getSigner(OWNER_CONCENTRATOR);
    deployer = await ethers.getSigner(DEPLOYER);
    holderPendle = await ethers.getSigner(PendleHolder);
    holderSdPendle = await ethers.getSigner(SdPendleHolder);
    holderSdPendleGauge = await ethers.getSigner(SdPendleGaugeHolder);

    await mockETHBalance(ownerAladdin.address, ethers.parseEther("100"));
    await mockETHBalance(ownerConcentrator.address, ethers.parseEther("100"));
    await mockETHBalance(deployer.address, ethers.parseEther("100"));
    await mockETHBalance(holderPendle.address, ethers.parseEther("100"));
    await mockETHBalance(holderSdPendle.address, ethers.parseEther("100"));
    await mockETHBalance(holderSdPendleGauge.address, ethers.parseEther("100"));

    const locker = await ethers.getContractAt("ConcentratorStakeDAOLocker", Locker, ownerConcentrator);
    const registry = await ethers.getContractAt(
      "ConverterRegistry",
      "0x997B6F43c1c1e8630d03B8E3C11B60E98A1beA90",
      ownerAladdin
    );
    const converter = await ethers.getContractAt(
      "GeneralTokenConverter",
      "0x11C907b3aeDbD863e551c37f21DD3F36b28A6784",
      ownerAladdin
    );

    const StakeDAOBribeClaimer = await ethers.getContractFactory("StakeDAOBribeClaimer", deployer);
    const claimer = await StakeDAOBribeClaimer.deploy();

    const SdPendleCompounder = await ethers.getContractFactory("SdPendleCompounder", deployer);
    compounder = await SdPendleCompounder.deploy(86400 * 7, claimer.getAddress());

    const SdPendleGaugeStrategy = await ethers.getContractFactory("SdPendleGaugeStrategy", deployer);
    strategy = await SdPendleGaugeStrategy.deploy(compounder.getAddress());
    const stash = await strategy.stash();

    const SdPendleBribeBurner = await ethers.getContractFactory("SdPendleBribeBurner", deployer);
    const burner = await SdPendleBribeBurner.deploy(compounder.getAddress());

    await compounder.initialize(
      "Aladdin sdPENDLE",
      "asdPENDLE",
      deployer.address,
      deployer.address,
      converter.getAddress(),
      strategy.getAddress(),
      burner.getAddress()
    );
    await locker.updateClaimer(claimer.getAddress());
    await locker.updateOperator(SdPendleGauge, strategy.getAddress());
    await locker.updateGaugeRewardReceiver(SdPendleGauge, stash);
    await registry.updateRoute(TOKENS.WETH.address, TOKENS.PENDLE.address, CONVERTER_ROUTRS.WETH.PENDLE);
    await claimer.grantRole(await claimer.BRIBE_RECEIVER_ROLE(), compounder.getAddress());
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      // from ConcentratorBaseV2
      expect(await compounder.treasury()).to.eq(deployer.address);
      expect(await compounder.harvester()).to.eq(deployer.address);
      expect(await compounder.converter()).to.eq("0x11C907b3aeDbD863e551c37f21DD3F36b28A6784");
      expect(await compounder.getExpenseRatio()).to.eq(0n);
      expect(await compounder.getHarvesterRatio()).to.eq(0n);
      expect(await compounder.getWithdrawFeePercentage()).to.eq(0n);

      // from LinearRewardDistributor
      expect(await compounder.periodLength()).to.eq(86400 * 7);
      expect(await compounder.rewardData()).to.deep.eq([0n, 0n, 0n, 0n]);
      expect(await compounder.rewardToken()).to.eq(TOKENS.sdPENDLE.address);
      expect(await compounder.pendingRewards()).to.deep.eq([0n, 0n]);

      // from ERC20Upgradeable
      expect(await compounder.name()).to.eq("Aladdin sdPENDLE");
      expect(await compounder.symbol()).to.eq("asdPENDLE");
      expect(await compounder.decimals()).to.eq(18);
      expect(await compounder.totalSupply()).to.eq(0n);

      // from ConcentratorCompounderBase
      expect(await compounder.totalAssets()).to.eq(0n);
      expect(await compounder.strategy()).to.eq(await strategy.getAddress());
      expect(await compounder.asset()).to.eq(TOKENS.sdPENDLE.address);
      expect(await compounder.maxDeposit(ZeroAddress)).to.eq(MaxUint256);
      expect(await compounder.maxMint(ZeroAddress)).to.eq(MaxUint256);
      expect(await compounder.maxRedeem(ZeroAddress)).to.eq(MaxUint256);
      expect(await compounder.maxWithdraw(ZeroAddress)).to.eq(MaxUint256);

      // reinitialize
      await expect(
        compounder.initialize("XX", "YY", ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress)
      ).to.revertedWith("Initializable: contract is already initialized");
    });
  });

  context("#depositWithPENDLE", async () => {
    beforeEach(async () => {
      const pool = await ethers.getContractAt(
        "ICurvePlainPool",
        "0x26f3f26F46cBeE59d1F8860865e13Aa39e36A8c0",
        holderSdPendle
      );
      const sdPENDLE = await ethers.getContractAt("MockERC20", TOKENS.sdPENDLE.address, holderSdPendle);
      const pendleBalance = await pool["balances(uint256)"](0);
      const sdPendleBalance = await pool["balances(uint256)"](1);
      await sdPENDLE.approve(pool.getAddress(), MaxUint256);
      if (sdPendleBalance < (pendleBalance * 11n) / 10n) {
        await pool.exchange(1, 0, ((pendleBalance * 11n) / 10n - sdPendleBalance) * 2n, 0);
      }
      expect(await pool.get_dy(0, 1, ethers.parseEther("1"))).to.gt(ethers.parseEther("1"));
      expect(await pool.get_dy(0, 1, ethers.parseEther("1000000"))).to.lt(ethers.parseEther("1000000"));
    });

    it("should revert, when insufficient shares", async () => {
      const token = await ethers.getContractAt("MockERC20", TOKENS.PENDLE.address, holderPendle);
      const gauge = await ethers.getContractAt("MockERC20", SdPendleGauge, holderPendle);
      const amount = ethers.parseEther("1"); // will use curve

      await token.approve(compounder.getAddress(), amount);
      expect(await gauge.balanceOf(Locker)).to.eq(0n);
      const shares = await compounder
        .connect(holderPendle)
        .depositWithPENDLE.staticCall(amount, holderPendle.address, 0);
      await expect(
        compounder.connect(holderPendle).depositWithPENDLE(amount, holderPendle.address, shares + 1n)
      ).to.revertedWithCustomError(compounder, "InsufficientShares");
    });

    it("should succeed when deposit some to self", async () => {
      const token = await ethers.getContractAt("MockERC20", TOKENS.PENDLE.address, holderPendle);
      const gauge = await ethers.getContractAt("MockERC20", SdPendleGauge, holderPendle);
      const amount = ethers.parseEther("1"); // will use curve

      await token.approve(compounder.getAddress(), amount);
      expect(await gauge.balanceOf(Locker)).to.eq(0n);
      const shares = await compounder
        .connect(holderPendle)
        .depositWithPENDLE.staticCall(amount, holderPendle.address, 0);
      await expect(compounder.connect(holderPendle).depositWithPENDLE(amount, holderPendle.address, shares)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await gauge.balanceOf(Locker)).to.gt(amount);
      expect(await compounder.balanceOf(holderPendle.address)).to.gt(amount);
    });

    it("should succeed when deposit some to other", async () => {
      const token = await ethers.getContractAt("MockERC20", TOKENS.PENDLE.address, holderPendle);
      const gauge = await ethers.getContractAt("MockERC20", SdPendleGauge, holderPendle);
      const amount = ethers.parseEther("1"); // will use curve

      await token.approve(compounder.getAddress(), amount);
      expect(await gauge.balanceOf(Locker)).to.eq(0n);
      const shares = await compounder
        .connect(holderPendle)
        .depositWithPENDLE.staticCall(amount, holderPendle.address, 0);
      await expect(compounder.connect(holderPendle).depositWithPENDLE(amount, deployer.address, shares)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await gauge.balanceOf(Locker)).to.gt(amount);
      expect(await compounder.balanceOf(deployer.address)).to.gt(amount);
    });

    it("should succeed when deposit all to self", async () => {
      const token = await ethers.getContractAt("MockERC20", TOKENS.PENDLE.address, holderPendle);
      const gauge = await ethers.getContractAt("MockERC20", SdPendleGauge, holderPendle);
      const amount = await token.balanceOf(holderPendle.getAddress()); // use stake dao

      await token.approve(compounder.getAddress(), amount);
      expect(await gauge.balanceOf(Locker)).to.eq(0n);
      await expect(compounder.connect(holderPendle).depositWithPENDLE(MaxUint256, holderPendle.address, 0)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await gauge.balanceOf(Locker)).to.eq(amount);
      expect(await compounder.balanceOf(holderPendle.address)).to.eq(amount);
    });

    it("should succeed when deposit all to other", async () => {
      const token = await ethers.getContractAt("MockERC20", TOKENS.PENDLE.address, holderPendle);
      const gauge = await ethers.getContractAt("MockERC20", SdPendleGauge, holderPendle);
      const amount = await token.balanceOf(holderPendle.getAddress()); // use stake dao

      await token.approve(compounder.getAddress(), amount);
      expect(await gauge.balanceOf(Locker)).to.eq(0n);
      await expect(compounder.connect(holderPendle).depositWithPENDLE(MaxUint256, deployer.address, 0)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await gauge.balanceOf(Locker)).to.eq(amount);
      expect(await compounder.balanceOf(deployer.address)).to.eq(amount);
    });
  });

  context("#depositWithGauge", async () => {
    it("should succeed when deposit some to self", async () => {
      const token = await ethers.getContractAt("MockERC20", SdPendleGauge, holderSdPendleGauge);
      const gauge = await ethers.getContractAt("MockERC20", SdPendleGauge, holderSdPendleGauge);
      const amount = ethers.parseEther("1000");

      await token.approve(compounder.getAddress(), amount);
      expect(await gauge.balanceOf(strategy.getAddress())).to.eq(0n);
      const shares = await compounder
        .connect(holderSdPendleGauge)
        .depositWithGauge.staticCall(amount, holderSdPendleGauge.address);
      expect(shares).to.eq(amount);
      await expect(
        compounder.connect(holderSdPendleGauge).depositWithGauge(amount, holderSdPendleGauge.address)
      ).to.emit(compounder, "Deposit");
      expect(await gauge.balanceOf(Locker)).to.eq(amount);
      expect(await compounder.balanceOf(holderSdPendleGauge.address)).to.eq(amount);
    });

    it("should succeed when deposit some to other", async () => {
      const token = await ethers.getContractAt("MockERC20", SdPendleGauge, holderSdPendleGauge);
      const gauge = await ethers.getContractAt("MockERC20", SdPendleGauge, holderSdPendleGauge);
      const amount = ethers.parseEther("1");

      await token.approve(compounder.getAddress(), amount);
      expect(await gauge.balanceOf(strategy.getAddress())).to.eq(0n);
      const shares = await compounder
        .connect(holderSdPendleGauge)
        .depositWithGauge.staticCall(amount, deployer.address);
      expect(shares).to.eq(amount);
      await expect(compounder.connect(holderSdPendleGauge).depositWithGauge(amount, deployer.address)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await gauge.balanceOf(Locker)).to.eq(amount);
      expect(await compounder.balanceOf(deployer.address)).to.eq(amount);
    });

    it("should succeed when deposit all to self", async () => {
      const token = await ethers.getContractAt("MockERC20", SdPendleGauge, holderSdPendleGauge);
      const gauge = await ethers.getContractAt("MockERC20", SdPendleGauge, holderSdPendleGauge);
      const amount = await token.balanceOf(holderSdPendleGauge.getAddress());

      await token.approve(compounder.getAddress(), amount);
      expect(await gauge.balanceOf(strategy.getAddress())).to.eq(0n);
      await expect(
        compounder.connect(holderSdPendleGauge).depositWithGauge(MaxUint256, holderSdPendleGauge.address)
      ).to.emit(compounder, "Deposit");
      expect(await gauge.balanceOf(Locker)).to.eq(amount);
      expect(await compounder.balanceOf(holderSdPendleGauge.address)).to.eq(amount);
    });

    it("should succeed when deposit all to other", async () => {
      const token = await ethers.getContractAt("MockERC20", SdPendleGauge, holderSdPendleGauge);
      const gauge = await ethers.getContractAt("MockERC20", SdPendleGauge, holderSdPendleGauge);
      const amount = await token.balanceOf(holderSdPendleGauge.getAddress());

      await token.approve(compounder.getAddress(), amount);
      expect(await gauge.balanceOf(Locker)).to.eq(0n);
      await expect(compounder.connect(holderSdPendleGauge).depositWithGauge(MaxUint256, deployer.address)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await gauge.balanceOf(Locker)).to.eq(amount);
      expect(await compounder.balanceOf(deployer.address)).to.eq(amount);
    });
  });

  context("#harvest", async () => {
    it("should succeed", async () => {
      const token = await ethers.getContractAt("MockERC20", TOKENS.sdPENDLE.address, holderSdPendle);
      const gauge = await ethers.getContractAt("MockERC20", SdPendleGauge, holderSdPendleGauge);
      const amount = ethers.parseEther("1000");
      expect(await gauge.balanceOf(Locker)).to.eq(0n);
      await token.approve(compounder.getAddress(), amount);
      await compounder.connect(holderSdPendle).deposit(amount, deployer.address);
      expect(await gauge.balanceOf(Locker)).to.eq(amount);

      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      // make sure 7 days passed, then the rewards will not increase anymore.
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      await network.provider.send("evm_mine");

      const harvested = await compounder.connect(deployer).harvest.staticCall(deployer.address, 0n);
      expect(harvested).to.gt(0n);
      const before = await gauge.balanceOf(Locker);
      await compounder.connect(deployer).harvest(deployer.address, 0n);
      const after = await gauge.balanceOf(Locker);
      expect(after - before).to.eq(harvested);
      console.log("harvested:", ethers.formatUnits(harvested, 18));
    });
  });

  context("#harvestBribe", async () => {
    let merkle: IMultiMerkleStash;

    beforeEach(async () => {
      const merkleOwner = await ethers.getSigner(MERKLE_OWNER);
      await mockETHBalance(merkleOwner.address, ethers.parseEther("10"));
      merkle = await ethers.getContractAt(
        "IMultiMerkleStash",
        "0x03E34b085C52985F6a5D27243F20C84bDdc01Db4",
        merkleOwner
      );

      await compounder.updateTreasury(OPERATOR);
      await compounder.updateExpenseRatio(2e8); // 20% platform
      await compounder.updateHarvesterRatio(1e8); // 10% bounty
      await compounder.updateBoosterRatio(2e8); // 20% booster
    });

    it("should revert when bribe is not sdPENDLE", async () => {
      await expect(
        compounder.harvestBribe({
          token: TOKENS.SDT.address,
          index: 0n,
          amount: 0n,
          merkleProof: [],
        })
      ).to.revertedWithCustomError(compounder, "ErrorInvalidBribeToken");
    });

    it("should succeed when bribe is sdPENDLE", async () => {
      const amount = ethers.parseEther("100");
      const sdPendle = await ethers.getContractAt("MockERC20", TOKENS.sdPENDLE.address, deployer);
      const root = solidityPackedKeccak256(["uint256", "address", "uint256"], [0n, Locker, amount]);
      await merkle.updateMerkleRoot(TOKENS.sdPENDLE.address, root);

      const before = await sdPendle.balanceOf(compounder.bribeBurner());
      const tx = await compounder.harvestBribe({
        token: TOKENS.sdPENDLE.address,
        index: 0n,
        amount,
        merkleProof: [],
      });
      expect(await sdPendle.balanceOf(compounder.bribeBurner())).eq(before + amount);
      expect(tx)
        .to.emit(compounder, "HarvestBribe")
        .withArgs(TOKENS.sdPENDLE.address, amount, (amount * 2n) / 10n, (amount * 2n) / 10n);
    });
  });
});

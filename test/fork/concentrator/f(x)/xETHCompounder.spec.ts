/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { MaxUint256, ZeroAddress, ZeroHash } from "ethers";
import { ethers } from "hardhat";

import { ConverterDeployment } from "@/contracts/Converter";
import { MultisigDeployment } from "@/contracts/Multisig";
import { mockETHBalance, request_fork } from "@/test/utils";
import { XETHCompounder, GeneralTokenConverter, ConcentratorPlainStrategy, LeveragedToken } from "@/types/index";
import { TOKENS, selectDeployments } from "@/utils/index";

const DEPLOYER = "0x1111111111111111111111111111111111111111";
const xETHHolder = "0x488b99c4A94BB0027791E8e0eEB421187EC9a487";
const FORK_HEIGHT = 18783460;

const CONVERTER = selectDeployments("mainnet", "Converter").toObject() as ConverterDeployment;
const MULTISIG = selectDeployments("mainnet", "Multisig").toObject() as MultisigDeployment;

describe("xETHCompounder.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let converter: GeneralTokenConverter;

  let token: LeveragedToken;
  let strategy: ConcentratorPlainStrategy;
  let compounder: XETHCompounder;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [DEPLOYER, xETHHolder]);
    deployer = await ethers.getSigner(DEPLOYER);
    signer = await ethers.getSigner(xETHHolder);

    await mockETHBalance(deployer.address, ethers.parseEther("10"));
    await mockETHBalance(signer.address, ethers.parseEther("10"));

    token = await ethers.getContractAt("LeveragedToken", TOKENS.xETH.address, signer);
    converter = await ethers.getContractAt("GeneralTokenConverter", CONVERTER.GeneralTokenConverter, deployer);

    const XETHCompounder = await ethers.getContractFactory("xETHCompounder", deployer);
    compounder = (await XETHCompounder.deploy(0)) as XETHCompounder;

    const ConcentratorPlainStrategy = await ethers.getContractFactory("ConcentratorPlainStrategy", deployer);
    strategy = await ConcentratorPlainStrategy.deploy(compounder.getAddress(), TOKENS.xETH.address);
    expect(await strategy.name()).to.eq("ConcentratorPlainStrategy");

    await compounder.initialize(
      "Aladdin xETH",
      "axETH",
      MULTISIG.Concentrator,
      deployer.address,
      converter.getAddress(),
      strategy.getAddress()
    );
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      // from ConcentratorBaseV2
      expect(await compounder.treasury()).to.eq(MULTISIG.Concentrator);
      expect(await compounder.harvester()).to.eq(deployer.address);
      expect(await compounder.converter()).to.eq(await converter.getAddress());
      expect(await compounder.getExpenseRatio()).to.eq(0n);
      expect(await compounder.getHarvesterRatio()).to.eq(0n);
      expect(await compounder.getWithdrawFeePercentage()).to.eq(0n);

      // from LinearRewardDistributor
      expect(await compounder.periodLength()).to.eq(0);
      expect(await compounder.rewardData()).to.deep.eq([0n, 0n, 0n, 0n]);
      expect(await compounder.rewardToken()).to.eq(TOKENS.xETH.address);
      expect(await compounder.pendingRewards()).to.deep.eq([0n, 0n]);

      // from ERC20Upgradeable
      expect(await compounder.name()).to.eq("Aladdin xETH");
      expect(await compounder.symbol()).to.eq("axETH");
      expect(await compounder.decimals()).to.eq(18);
      expect(await compounder.totalSupply()).to.eq(0n);

      // from AccessControlUpgradeable
      expect(await compounder.hasRole(ZeroHash, deployer.address)).to.eq(true);

      // from ConcentratorCompounderBase
      expect(await compounder.totalAssets()).to.eq(0n);
      expect(await compounder.strategy()).to.eq(await strategy.getAddress());
      expect(await compounder.asset()).to.eq(TOKENS.xETH.address);
      expect(await compounder.maxDeposit(ZeroAddress)).to.eq(MaxUint256);
      expect(await compounder.maxMint(ZeroAddress)).to.eq(MaxUint256);
      expect(await compounder.maxRedeem(ZeroAddress)).to.eq(MaxUint256);
      expect(await compounder.maxWithdraw(ZeroAddress)).to.eq(MaxUint256);

      // reinitialize
      await expect(
        compounder.initialize("XX", "YY", ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress)
      ).to.revertedWith("Initializable: contract is already initialized");
    });
  });

  context("#deposit", async () => {
    const initialSupply = ethers.parseEther("1");

    beforeEach(async () => {
      await token.connect(signer).approve(compounder.getAddress(), initialSupply);
      await compounder.connect(signer).deposit(initialSupply, deployer.address);
    });

    it("should succeed when deposit to self", async () => {
      const amount = ethers.parseEther("100");
      await token.connect(signer).approve(compounder.getAddress(), amount);
      expect(await compounder.balanceOf(signer.address)).to.eq(0n);
      expect(await compounder.totalSupply()).to.eq(initialSupply);
      expect(await compounder.connect(signer).deposit.staticCall(amount, signer.address)).to.eq(amount);
      await expect(compounder.connect(signer).deposit(amount, signer.address))
        .to.emit(compounder, "Deposit")
        .withArgs(signer.address, signer.address, amount, amount);
      expect(await compounder.balanceOf(signer.address)).to.eq(amount);
      expect(await compounder.totalSupply()).to.eq(amount + initialSupply);

      expect(await token.balanceOf(strategy.getAddress())).to.eq(amount + initialSupply);
    });
  });

  context("#redeem", async () => {
    const initialSupply = ethers.parseEther("12345");

    beforeEach(async () => {
      await token.connect(signer).approve(compounder.getAddress(), initialSupply);
      await compounder.connect(signer).deposit(initialSupply, deployer.address);
    });

    it("should succeed when redeem self to self", async () => {
      const shares = ethers.parseEther("100");
      const assetsWithFee = shares;
      const assets = assetsWithFee;

      expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply);
      expect(await compounder.redeem.staticCall(shares, deployer.address, deployer.address)).to.eq(assets);
      await expect(compounder.redeem(shares, deployer.address, deployer.address))
        .to.emit(compounder, "Withdraw")
        .withArgs(deployer.address, deployer.address, deployer.address, assets, shares);
      expect(await compounder.balanceOf(deployer.address)).to.eq(initialSupply - shares);
      expect(await compounder.totalSupply()).to.eq(initialSupply - shares);
      expect(await compounder.totalAssets()).to.eq(initialSupply - assets);
      expect(await token.balanceOf(strategy.getAddress())).to.eq(initialSupply - assets);
      expect(await token.balanceOf(deployer.address)).to.eq(assets);
    });
  });
});

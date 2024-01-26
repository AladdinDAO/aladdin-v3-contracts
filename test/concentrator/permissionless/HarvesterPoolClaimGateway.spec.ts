import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, network } from "hardhat";
import { expect } from "chai";
import { MaxUint256, ZeroAddress } from "ethers";

import {
  MockERC20,
  MockConcentratorHarvesterPool,
  MockConcentratorCompounderBase,
  MockConcentratorStrategy,
  HarvesterPoolClaimGateway,
} from "@/types/index";

describe("HarvesterPoolClaimGateway.spec", async () => {
  const Week = 86400 * 7;

  let deployer: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
  let harvester: HardhatEthersSigner;
  let converter: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let stakingToken: MockERC20;
  let rewardToken: MockERC20;

  let compounderStrategy: MockConcentratorStrategy;
  let compounder: MockConcentratorCompounderBase;
  let poolStrategy0: MockConcentratorStrategy;
  let pool0: MockConcentratorHarvesterPool;
  let poolStrategy1: MockConcentratorStrategy;
  let pool1: MockConcentratorHarvesterPool;

  let gateway: HarvesterPoolClaimGateway;

  beforeEach(async () => {
    [deployer, signer, treasury, harvester, converter] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    const MockConcentratorStrategy = await ethers.getContractFactory("MockConcentratorStrategy", deployer);
    const MockConcentratorCompounderBase = await ethers.getContractFactory("MockConcentratorCompounderBase", deployer);
    const MockConcentratorHarvesterPool = await ethers.getContractFactory("MockConcentratorHarvesterPool", deployer);

    stakingToken = await MockERC20.deploy("Staking Token", "ST", 18);
    rewardToken = await MockERC20.deploy("Reward Token", "RT", 18);
    compounder = await MockConcentratorCompounderBase.deploy(Week, rewardToken.getAddress());
    compounderStrategy = await MockConcentratorStrategy.deploy(
      compounder.getAddress(),
      rewardToken.getAddress(),
      rewardToken.getAddress()
    );

    pool0 = await MockConcentratorHarvesterPool.deploy(Week);
    pool1 = await MockConcentratorHarvesterPool.deploy(Week);
    poolStrategy0 = await MockConcentratorStrategy.deploy(
      pool0.getAddress(),
      stakingToken.getAddress(),
      rewardToken.getAddress()
    );
    poolStrategy1 = await MockConcentratorStrategy.deploy(
      pool1.getAddress(),
      stakingToken.getAddress(),
      rewardToken.getAddress()
    );

    await compounder.initialize(
      "X",
      "Y",
      deployer.address,
      deployer.address,
      deployer.address,
      compounderStrategy.getAddress()
    );
    await pool0.initialize(
      compounder.getAddress(),
      stakingToken.getAddress(),
      treasury.address,
      harvester.address,
      converter.address,
      poolStrategy0.getAddress()
    );
    await pool1.initialize(
      compounder.getAddress(),
      stakingToken.getAddress(),
      treasury.address,
      harvester.address,
      converter.address,
      poolStrategy1.getAddress()
    );

    const HarvesterPoolClaimGateway = await ethers.getContractFactory("HarvesterPoolClaimGateway", deployer);
    gateway = await HarvesterPoolClaimGateway.deploy(converter.address);

    await pool0.updateClaimer(gateway.getAddress());
    await pool1.updateClaimer(gateway.getAddress());
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      expect(await gateway.converter()).to.eq(converter.address);
    });
  });

  context("auth", async () => {
    context("#updateConverter", async () => {
      it("should revert, when non-admin call", async () => {
        await expect(gateway.connect(signer).updateConverter(ZeroAddress)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await gateway.converter()).to.eq(converter.address);
        await expect(gateway.updateConverter(deployer.address))
          .to.emit(gateway, "UpdateConverter")
          .withArgs(converter.address, deployer.address);
        expect(await gateway.converter()).to.eq(deployer.address);
      });
    });
  });

  context("claimRewards", async () => {
    it("should succeed, when caller is claimer", async () => {
      await stakingToken.mint(signer.address, ethers.parseEther("10000"));
      await stakingToken.connect(signer).approve(pool0.getAddress(), MaxUint256);
      await pool0.connect(signer)["deposit(uint256)"](ethers.parseEther("10000"));
      await stakingToken.mint(signer.address, ethers.parseEther("10000"));
      await stakingToken.connect(signer).approve(pool1.getAddress(), MaxUint256);
      await pool1.connect(signer)["deposit(uint256)"](ethers.parseEther("10000"));

      await rewardToken.connect(deployer).approve(poolStrategy0.getAddress(), MaxUint256);
      await rewardToken.mint(deployer.address, ethers.parseEther("10000"));
      await poolStrategy0.connect(deployer).setHarvested(ethers.parseEther("10000"));
      await rewardToken.connect(deployer).approve(poolStrategy1.getAddress(), MaxUint256);
      await rewardToken.mint(deployer.address, ethers.parseEther("10000"));
      await poolStrategy1.connect(deployer).setHarvested(ethers.parseEther("10000"));

      await pool0.connect(harvester).harvest(deployer.address, 0n);
      await pool1.connect(harvester).harvest(deployer.address, 0n);

      // 3 day passes
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 3]);
      await pool0.checkpoint(signer.address);
      await pool1.checkpoint(signer.address);

      expect(await compounder.balanceOf(signer)).to.eq(0n);
      expect(await pool0.claimable(signer.address)).to.closeTo(
        (ethers.parseEther("10000") * 3n) / 7n,
        ethers.parseEther("0.1")
      );
      expect(await pool1.claimable(signer.address)).to.closeTo(
        (ethers.parseEther("10000") * 3n) / 7n,
        ethers.parseEther("0.1")
      );
      await expect(gateway.connect(signer).claimRewards([await pool0.getAddress(), pool1.getAddress()]))
        .to.emit(pool0, "Claim")
        .to.emit(pool1, "Claim");
      expect(await pool0.claimable(signer.address)).to.eq(0n);
      expect(await pool1.claimable(signer.address)).to.eq(0n);
      expect(await compounder.balanceOf(signer)).to.closeTo(
        ((ethers.parseEther("10000") * 3n) / 7n) * 2n,
        ethers.parseEther("0.1")
      );
    });
  });
});

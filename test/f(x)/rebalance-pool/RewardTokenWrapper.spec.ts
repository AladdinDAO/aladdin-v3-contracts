import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress, id } from "ethers";
import { ethers } from "hardhat";

import { MockERC20, RebalancePool, RewardTokenWrapper } from "@/types/index";

describe("RewardTokenWrapper.spec", async () => {
  const scale = 10n ** 10n;

  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let token8: MockERC20;
  let wrapper8: RewardTokenWrapper;
  let pool: RebalancePool;

  beforeEach(async () => {
    [deployer, signer] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    token8 = await MockERC20.deploy("X", "Y", 8);

    const RewardTokenWrapper = await ethers.getContractFactory("RewardTokenWrapper", deployer);
    wrapper8 = await RewardTokenWrapper.deploy();
    await wrapper8.initialize(token8.getAddress());

    const Treasury = await ethers.getContractFactory("Treasury", deployer);
    const treasury = await Treasury.deploy(ethers.parseEther("0.5"));
    const Market = await ethers.getContractFactory("Market", deployer);
    const market = await Market.deploy();

    const RebalancePool = await ethers.getContractFactory("RebalancePool", deployer);
    pool = await RebalancePool.deploy();
    await pool.initialize(treasury.getAddress(), market.getAddress());
    await pool.addReward(wrapper8.getAddress(), deployer.address, 86400);

    await wrapper8.grantRole(id("DISTRIBUTOR_ROLE"), deployer.address);
    await wrapper8.grantRole(id("REWARD_POOL_ROLE"), pool.getAddress());
  });

  context("constructor", async () => {
    it("should succeed", async () => {
      expect(await wrapper8.token()).to.eq(await token8.getAddress());
      expect(await wrapper8.scale()).to.eq(10n ** 10n);
      expect(await wrapper8.name()).to.eq(await token8.name());
      expect(await wrapper8.symbol()).to.eq(await token8.symbol());
      expect(await wrapper8.decimals()).to.eq(18);

      await expect(wrapper8.initialize(ZeroAddress)).to.revertedWith("Initializable: contract is already initialized");
    });
  });

  context("#mint", async () => {
    it("should revert, when no access", async () => {
      await expect(wrapper8.connect(signer).mint(deployer.address, 1)).to.revertedWith(
        "AccessControl: account " +
          signer.address.toLowerCase() +
          " is missing role 0xfbd454f36a7e1a388bd6fc3ab10d434aa4578f811acbbcf33afb1c697486313c"
      );
    });

    it("should succeed", async () => {
      await token8.mint(deployer.address, 2000);
      expect(await wrapper8.totalSupply()).to.eq(0n);
      expect(await wrapper8.balanceOf(deployer.address)).to.eq(0n);
      expect(await wrapper8.balanceOf(signer.address)).to.eq(0n);
      await token8.approve(wrapper8.getAddress(), 500);
      await wrapper8.mint(deployer.address, 500);
      expect(await wrapper8.totalSupply()).to.eq(500n * scale);
      expect(await wrapper8.balanceOf(deployer.address)).to.eq(500n * scale);
      expect(await wrapper8.balanceOf(signer.address)).to.eq(0n);
      await token8.approve(wrapper8.getAddress(), 1500);
      await wrapper8.mint(signer.address, 1500);
      expect(await wrapper8.totalSupply()).to.eq(2000n * scale);
      expect(await wrapper8.balanceOf(deployer.address)).to.eq(500n * scale);
      expect(await wrapper8.balanceOf(signer.address)).to.eq(1500n * scale);
    });
  });

  context("#transfer", async () => {
    it("should succeed, when normal transfer", async () => {
      await token8.mint(deployer.address, 2000n);
      await token8.approve(wrapper8.getAddress(), 2000n);
      await wrapper8.mint(signer.address, 2000n);

      expect(await wrapper8.balanceOf(signer.address)).to.eq(2000n * scale);
      expect(await wrapper8.balanceOf(deployer.address)).to.eq(0n);
      expect(await wrapper8.totalSupply()).to.eq(2000n * scale);
      await wrapper8.connect(signer).transfer(deployer.address, 500n * scale);
      expect(await wrapper8.totalSupply()).to.eq(2000n * scale);
      expect(await wrapper8.balanceOf(signer.address)).to.eq(1500n * scale);
      expect(await wrapper8.balanceOf(deployer.address)).to.eq(500n * scale);
    });

    it("should succeed, when transfer by reward pool", async () => {
      await token8.mint(deployer.address, 2000n);
      await token8.approve(wrapper8.getAddress(), 2000n);
      await wrapper8.mint(signer.address, 2000n);
      await wrapper8.grantRole(id("REWARD_POOL_ROLE"), signer.address);

      expect(await wrapper8.balanceOf(signer.address)).to.eq(2000n * scale);
      expect(await wrapper8.balanceOf(deployer.address)).to.eq(0n);
      expect(await wrapper8.totalSupply()).to.eq(2000n * scale);
      expect(await token8.balanceOf(deployer.address)).to.eq(0n);
      await wrapper8.connect(signer).transfer(deployer.address, 500n * scale);
      expect(await wrapper8.totalSupply()).to.eq(1500n * scale);
      expect(await wrapper8.balanceOf(signer.address)).to.eq(1500n * scale);
      expect(await wrapper8.balanceOf(deployer.address)).to.eq(0n);
      expect(await token8.balanceOf(deployer.address)).to.eq(500n);
    });
  });

  it("should work with rebalance pool", async () => {
    await token8.mint(deployer.address, 10000n);
    await token8.approve(wrapper8.getAddress(), 10000n);
    await wrapper8.mint(deployer.address, 10000n);

    await wrapper8.approve(pool.getAddress(), 10000n * scale);
    await pool.depositReward(wrapper8.getAddress(), 10000n * scale);
    expect(await wrapper8.balanceOf(pool.getAddress())).to.eq(10000n * scale);
  });
});

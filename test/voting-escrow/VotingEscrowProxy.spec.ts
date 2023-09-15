import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MockERC20, VotingEscrow, VotingEscrowBoost, VotingEscrowProxy } from "@typechain/index";
import { expect } from "chai";
import { MaxUint256, ZeroAddress } from "ethers";
import { ethers, network } from "hardhat";

describe("VotingEscrowProxy.spec", async () => {
  const Week = 86400 * 7;

  let deployer: HardhatEthersSigner;
  let holder: HardhatEthersSigner;

  let token: MockERC20;
  let ve: VotingEscrow;
  let boost: VotingEscrowBoost;
  let proxy: VotingEscrowProxy;

  beforeEach(async () => {
    [deployer, holder] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow", deployer);
    const VotingEscrowBoost = await ethers.getContractFactory("VotingEscrowBoost", deployer);
    const VotingEscrowProxy = await ethers.getContractFactory("VotingEscrowProxy", deployer);

    token = await MockERC20.deploy("X", "X", 18);
    ve = await VotingEscrow.deploy();
    boost = await VotingEscrowBoost.deploy(await ve.getAddress());
    proxy = await VotingEscrowProxy.deploy(await ve.getAddress());
    await ve.initialize(deployer.address, await token.getAddress(), "VotingEscrow X", "veX", "1");

    await token.mint(deployer.address, ethers.parseEther("1000000000"));
    await token.mint(holder.address, ethers.parseEther("1000000000"));
    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    await token.approve(await ve.getAddress(), MaxUint256);
    await ve.create_lock(ethers.parseEther("10000"), timestamp + 86400 * 365 * 4);
    await token.connect(holder).approve(await ve.getAddress(), MaxUint256);
    await ve.connect(holder).create_lock(ethers.parseEther("456"), timestamp + 86400 * 365 * 4);
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      expect(await proxy.ve()).to.eq(await ve.getAddress());
    });
  });

  context("#updateVeBoost", async () => {
    it("should revert, when caller is not owner", async () => {
      await expect(proxy.connect(holder).updateVeBoost(ZeroAddress)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when ve boost is random contract", async () => {
      await expect(proxy.updateVeBoost(ZeroAddress)).to.revertedWithoutReason();
      await expect(proxy.updateVeBoost(deployer.address)).to.revertedWithoutReason();
    });

    it("should succeed", async () => {
      expect(await proxy.veBoost()).to.eq(ZeroAddress);
      await expect(proxy.updateVeBoost(await boost.getAddress()))
        .to.emit(proxy, "UpdateVeBoost")
        .withArgs(ZeroAddress, await boost.getAddress());
      expect(await proxy.veBoost()).to.eq(await boost.getAddress());
    });
  });

  context("#resetVeBoost", async () => {
    it("should revert, when caller is not owner", async () => {
      await expect(proxy.connect(holder).resetVeBoost()).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should succeed", async () => {
      expect(await proxy.veBoost()).to.eq(ZeroAddress);
      await expect(proxy.updateVeBoost(await boost.getAddress()))
        .to.emit(proxy, "UpdateVeBoost")
        .withArgs(ZeroAddress, await boost.getAddress());
      expect(await proxy.veBoost()).to.eq(await boost.getAddress());
      await expect(proxy.resetVeBoost())
        .to.emit(proxy, "UpdateVeBoost")
        .withArgs(await boost.getAddress(), ZeroAddress);
      expect(await proxy.veBoost()).to.eq(ZeroAddress);
    });
  });

  context("#adjustedVeBalance", async () => {
    it("should succeed", async () => {
      const t0 = (await ethers.provider.getBlock("latest"))!.timestamp;
      const s1 = t0 + Week;
      const e1 = Math.floor(t0 / Week) * Week + Week * 52;
      await network.provider.send("evm_setNextBlockTimestamp", [s1]);
      await boost.boost(holder.address, ethers.parseEther("100"), e1);

      expect(await proxy.adjustedVeBalance(holder.address)).to.eq(await ve["balanceOf(address)"](holder.address));
      expect(await proxy.adjustedVeBalance(deployer.address)).to.eq(await ve["balanceOf(address)"](deployer.address));
      await proxy.updateVeBoost(await boost.getAddress());
      expect(await proxy.adjustedVeBalance(holder.address)).to.not.eq(await ve["balanceOf(address)"](holder.address));
      expect(await proxy.adjustedVeBalance(deployer.address)).to.not.eq(
        await ve["balanceOf(address)"](deployer.address)
      );
      expect(await proxy.adjustedVeBalance(holder.address)).to.eq(await boost.adjustedVeBalance(holder.address));
      expect(await proxy.adjustedVeBalance(deployer.address)).to.eq(await boost.adjustedVeBalance(deployer.address));
    });
  });
});

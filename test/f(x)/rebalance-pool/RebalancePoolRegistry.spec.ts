import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { MockERC20, RebalancePoolRegistry } from "@/types/index";

describe("RebalancePoolRegistry.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let registry: RebalancePoolRegistry;
  let tokens: MockERC20[];

  beforeEach(async () => {
    [deployer, signer] = await ethers.getSigners();

    const RebalancePoolRegistry = await ethers.getContractFactory("RebalancePoolRegistry", deployer);
    registry = await RebalancePoolRegistry.deploy();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    tokens = [];
    for (let i = 0; i < 4; ++i) {
      tokens.push(await MockERC20.deploy("X", "Y", 18));
      await tokens[i].mint(deployer.address, ethers.parseEther((i + 1).toString()));
    }
  });

  context("auth", async () => {
    context("#registerRebalancePool", async () => {
      it("should revert when caller is not owner", async () => {
        await expect(registry.connect(signer).registerRebalancePool(ZeroAddress)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert when already added", async () => {
        await registry.registerRebalancePool(tokens[0].getAddress());
        await expect(registry.registerRebalancePool(tokens[0].getAddress())).to.revertedWithCustomError(
          registry,
          "ErrorPoolAlreadyAdded"
        );
      });

      it("should succeed", async () => {
        expect(await registry.getPools()).to.deep.eq([]);
        expect(await registry.totalSupply()).to.eq(0n);
        await expect(registry.registerRebalancePool(tokens[0].getAddress()))
          .to.emit(registry, "RegisterPool")
          .withArgs(await tokens[0].getAddress());
        expect(await registry.getPools()).to.deep.eq([await tokens[0].getAddress()]);
        expect(await registry.totalSupply()).to.eq(ethers.parseEther("1"));
        await expect(registry.registerRebalancePool(tokens[1].getAddress()))
          .to.emit(registry, "RegisterPool")
          .withArgs(await tokens[1].getAddress());
        expect(await registry.getPools()).to.deep.eq([await tokens[0].getAddress(), await tokens[1].getAddress()]);
        expect(await registry.totalSupply()).to.eq(ethers.parseEther("3"));
        await expect(registry.registerRebalancePool(tokens[2].getAddress()))
          .to.emit(registry, "RegisterPool")
          .withArgs(await tokens[2].getAddress());
        expect(await registry.getPools()).to.deep.eq([
          await tokens[0].getAddress(),
          await tokens[1].getAddress(),
          await tokens[2].getAddress(),
        ]);
        expect(await registry.totalSupply()).to.eq(ethers.parseEther("6"));
        await expect(registry.registerRebalancePool(tokens[3].getAddress()))
          .to.emit(registry, "RegisterPool")
          .withArgs(await tokens[3].getAddress());
        expect(await registry.getPools()).to.deep.eq([
          await tokens[0].getAddress(),
          await tokens[1].getAddress(),
          await tokens[2].getAddress(),
          await tokens[3].getAddress(),
        ]);
        expect(await registry.totalSupply()).to.eq(ethers.parseEther("10"));
      });
    });

    context("#deregisterRebalancePool", async () => {
      beforeEach(async () => {
        for (let i = 0; i < 4; ++i) {
          await registry.registerRebalancePool(await tokens[i].getAddress());
        }
      });

      it("should revert when caller is not owner", async () => {
        await expect(registry.connect(signer).deregisterRebalancePool(ZeroAddress)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert when not added", async () => {
        await expect(registry.deregisterRebalancePool(ZeroAddress)).to.revertedWithCustomError(
          registry,
          "ErrorPoolNotAdded"
        );
      });

      it("should succeed", async () => {
        expect(await registry.getPools()).to.deep.eq([
          await tokens[0].getAddress(),
          await tokens[1].getAddress(),
          await tokens[2].getAddress(),
          await tokens[3].getAddress(),
        ]);
        expect(await registry.totalSupply()).to.eq(ethers.parseEther("10"));
        await expect(registry.deregisterRebalancePool(tokens[3].getAddress()))
          .to.emit(registry, "DeregisterPool")
          .withArgs(await tokens[3].getAddress());
        expect(await registry.getPools()).to.deep.eq([
          await tokens[0].getAddress(),
          await tokens[1].getAddress(),
          await tokens[2].getAddress(),
        ]);
        expect(await registry.totalSupply()).to.eq(ethers.parseEther("6"));
        await expect(registry.deregisterRebalancePool(tokens[2].getAddress()))
          .to.emit(registry, "DeregisterPool")
          .withArgs(await tokens[2].getAddress());
        expect(await registry.getPools()).to.deep.eq([await tokens[0].getAddress(), await tokens[1].getAddress()]);
        expect(await registry.totalSupply()).to.eq(ethers.parseEther("3"));
      });
      await expect(registry.deregisterRebalancePool(tokens[1].getAddress()))
        .to.emit(registry, "DeregisterPool")
        .withArgs(await tokens[1].getAddress());
      expect(await registry.getPools()).to.deep.eq([await tokens[0].getAddress()]);
      expect(await registry.totalSupply()).to.eq(ethers.parseEther("1"));
      await expect(registry.deregisterRebalancePool(tokens[0].getAddress()))
        .to.emit(registry, "DeregisterPool")
        .withArgs(await tokens[0].getAddress());
      expect(await registry.getPools()).to.deep.eq([]);
      expect(await registry.totalSupply()).to.eq(0n);
    });
  });
});

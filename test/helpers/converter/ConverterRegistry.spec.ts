import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { ConverterRegistry } from "@/types/index";

describe("ConverterRegistry.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let registry: ConverterRegistry;

  beforeEach(async () => {
    [deployer, signer] = await ethers.getSigners();

    const ConverterRegistry = await ethers.getContractFactory("ConverterRegistry", deployer);
    registry = await ConverterRegistry.deploy();
  });

  context("#register", async () => {
    it("should revert, when non-owner call", async () => {
      await expect(registry.connect(signer).register(0, deployer.address)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should succeed", async () => {
      expect(await registry.getConverter(0)).to.eq(ZeroAddress);
      await registry.register(0, deployer.address);
      expect(await registry.getConverter(0)).to.eq(deployer.address);
    });
  });

  context("withdrawFund", async () => {
    it("should revert, when non-owner call", async () => {
      await expect(registry.connect(signer).withdrawFund(ZeroAddress, ZeroAddress, ZeroAddress)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    for (const name of ["GeneralTokenConverter", "LidoConverter"]) {
      it(`should revert when withdraw ETH from ${name} and receiver is bad`, async () => {
        const factory = await ethers.getContractFactory(name, deployer);
        const converter = await factory.deploy(registry.getAddress());

        await expect(registry.withdrawFund(converter.getAddress(), ZeroAddress, registry.getAddress())).to.revertedWith(
          "withdraw ETH failed"
        );
      });

      it(`should succeed withdraw ETH from ${name}`, async () => {
        const factory = await ethers.getContractFactory(name, deployer);
        const converter = await factory.deploy(registry.getAddress());
        const amount = ethers.parseEther("1");
        await deployer.sendTransaction({ to: converter.getAddress(), value: amount });

        expect(await ethers.provider.getBalance(converter.getAddress())).to.eq(amount);
        const before = await ethers.provider.getBalance(signer.address);
        await registry.withdrawFund(converter.getAddress(), ZeroAddress, signer.address);
        expect(await ethers.provider.getBalance(converter.getAddress())).to.eq(0n);
        const after = await ethers.provider.getBalance(signer.address);
        expect(after - before).to.eq(amount);
      });

      it(`should succeed withdraw token from ${name}`, async () => {
        const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
        const token = await MockERC20.deploy("X", "Y", 18);
        const factory = await ethers.getContractFactory(name, deployer);
        const converter = await factory.deploy(registry.getAddress());
        const amount = ethers.parseEther("1000");
        await token.mint(converter.getAddress(), amount);

        expect(await token.balanceOf(converter.getAddress())).to.eq(amount);
        expect(await token.balanceOf(deployer.address)).to.eq(0n);
        await registry.withdrawFund(converter.getAddress(), token.getAddress(), deployer.address);
        expect(await token.balanceOf(converter.getAddress())).to.eq(0n);
        expect(await token.balanceOf(deployer.address)).to.eq(amount);
      });
    }
  });
});

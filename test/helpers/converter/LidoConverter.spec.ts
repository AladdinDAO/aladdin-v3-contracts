import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { ConverterRegistry, LidoConverter } from "@/types/index";
import { Action, PoolTypeV3, encodePoolHintV3, TOKENS } from "@/utils/index";

describe("LidoConverter.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let registry: ConverterRegistry;
  let converter: LidoConverter;

  beforeEach(async () => {
    [deployer, signer] = await ethers.getSigners();

    const ConverterRegistry = await ethers.getContractFactory("ConverterRegistry", deployer);
    registry = await ConverterRegistry.deploy();

    const LidoConverter = await ethers.getContractFactory("LidoConverter", deployer);
    converter = await LidoConverter.deploy(registry.getAddress());
  });

  context("reverts", async () => {
    it("should revert, when type is not 10", async () => {
      for (let i = 0; i < 20; ++i) {
        if (i === 10) continue;
        await expect(converter.getTokenPair(i)).to.revertedWith("unsupported poolType");
        await expect(converter.queryConvert(i, 0)).to.revertedWith("unsupported poolType");
        await expect(converter.convert(i, 0, ZeroAddress)).to.revertedWith("unsupported poolType");
      }
    });

    it("should revert, when action is invalid", async () => {
      await expect(
        converter.getTokenPair(encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Swap, {}))
      ).to.revertedWith("unsupported action");
      await expect(
        converter.getTokenPair(encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove, {}))
      ).to.revertedWith("unsupported action");
      await expect(
        converter.getTokenPair(encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Swap, {}))
      ).to.revertedWith("unsupported action");

      await expect(
        converter.queryConvert(encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Swap, {}), 0)
      ).to.revertedWith("unsupported action");
      await expect(
        converter.queryConvert(encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove, {}), 0)
      ).to.revertedWith("unsupported action");
      await expect(
        converter.queryConvert(encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Swap, {}), 0)
      ).to.revertedWith("unsupported action");

      await expect(
        converter.convert(
          encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Swap, {}),
          0,
          ZeroAddress
        )
      ).to.revertedWith("unsupported action");
      await expect(
        converter.convert(
          encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove, {}),
          0,
          ZeroAddress
        )
      ).to.revertedWith("unsupported action");
      await expect(
        converter.convert(
          encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Swap, {}),
          0,
          ZeroAddress
        )
      ).to.revertedWith("unsupported action");
    });

    it("should revert, when pool is invalid", async () => {
      await expect(
        converter.getTokenPair(encodePoolHintV3(ZeroAddress, PoolTypeV3.Lido, 2, 0, 0, Action.Swap, {}))
      ).to.revertedWith("unsupported pool");
      await expect(
        converter.queryConvert(encodePoolHintV3(ZeroAddress, PoolTypeV3.Lido, 2, 0, 0, Action.Swap, {}), 0)
      ).to.revertedWith("unsupported pool");
      await expect(
        converter.convert(encodePoolHintV3(ZeroAddress, PoolTypeV3.Lido, 2, 0, 0, Action.Swap, {}), 0, ZeroAddress)
      ).to.revertedWith("unsupported pool");
    });
  });

  context("#withdrawFund", async () => {
    it("should revert, when non-registry call", async () => {
      await expect(converter.connect(signer).withdrawFund(ZeroAddress, ZeroAddress)).to.revertedWith("only registry");
    });

    it("should revert when withdraw ETH and receiver is bad", async () => {
      await expect(registry.withdrawFund(converter.getAddress(), ZeroAddress, registry.getAddress())).to.revertedWith(
        "withdraw ETH failed"
      );
    });

    it(`should succeed withdraw ETH`, async () => {
      const amount = ethers.parseEther("1");
      await deployer.sendTransaction({ to: converter.getAddress(), value: amount });

      expect(await ethers.provider.getBalance(converter.getAddress())).to.eq(amount);
      const before = await ethers.provider.getBalance(signer.address);
      await registry.withdrawFund(converter.getAddress(), ZeroAddress, signer.address);
      expect(await ethers.provider.getBalance(converter.getAddress())).to.eq(0n);
      const after = await ethers.provider.getBalance(signer.address);
      expect(after - before).to.eq(amount);
    });

    it(`should succeed withdraw token`, async () => {
      const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
      const token = await MockERC20.deploy("X", "Y", 18);
      const amount = ethers.parseEther("1000");
      await token.mint(converter.getAddress(), amount);

      expect(await token.balanceOf(converter.getAddress())).to.eq(amount);
      expect(await token.balanceOf(deployer.address)).to.eq(0n);
      await registry.withdrawFund(converter.getAddress(), token.getAddress(), deployer.address);
      expect(await token.balanceOf(converter.getAddress())).to.eq(0n);
      expect(await token.balanceOf(deployer.address)).to.eq(amount);
    });
  });
});

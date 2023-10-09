import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { ConverterRegistry, GeneralTokenConverter } from "@/types/index";
import { Action, PoolTypeV3, encodePoolHintV3 } from "@/utils/codec";

describe("GeneralTokenConverter.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let registry: ConverterRegistry;
  let converter: GeneralTokenConverter;

  beforeEach(async () => {
    [deployer, signer] = await ethers.getSigners();

    const ConverterRegistry = await ethers.getContractFactory("ConverterRegistry", deployer);
    registry = await ConverterRegistry.deploy();

    const GeneralTokenConverter = await ethers.getContractFactory("GeneralTokenConverter", deployer);
    converter = await GeneralTokenConverter.deploy(registry.getAddress());
  });

  it("should revert when invalid action", async () => {
    for (let i = 0; i < 10; i++) {
      await expect(
        converter.queryConvert(encodePoolHintV3(ZeroAddress, i as PoolTypeV3, 2, 0, 1, 3 as Action, { fee_num: 1 }), 0n)
      ).to.revertedWith("invalid action");
      await expect(
        converter.convert(
          encodePoolHintV3(ZeroAddress, i as PoolTypeV3, 2, 0, 1, 3 as Action, { fee_num: 1 }),
          0n,
          ZeroAddress
        )
      ).to.revertedWith("invalid action");
    }
  });

  it("should revert when invalid poolType", async () => {
    // UniswapV2, UniswapV3, BalancerV1, BalancerV2 has no Add or Remove
    for (const poolType of [PoolTypeV3.UniswapV2, PoolTypeV3.UniswapV3, PoolTypeV3.BalancerV1, PoolTypeV3.BalancerV2]) {
      for (const action of [Action.Add, Action.Remove]) {
        expect(
          await converter.queryConvert.staticCall(
            encodePoolHintV3(ZeroAddress, poolType, 2, 0, 1, action, { fee_num: 1 }),
            0n
          )
        ).to.eq(0n);
        expect(
          await converter.getTokenPair(encodePoolHintV3(ZeroAddress, poolType, 2, 0, 1, action, { fee_num: 1 }))
        ).to.deep.eq([ZeroAddress, ZeroAddress]);
        await expect(
          converter.convert(encodePoolHintV3(ZeroAddress, poolType, 2, 0, 1, action, { fee_num: 1 }), 0n, ZeroAddress)
        ).to.reverted;
      }
    }

    // ERC4626 has no Swap
    expect(
      await converter.queryConvert.staticCall(
        encodePoolHintV3(ZeroAddress, PoolTypeV3.ERC4626, 2, 0, 1, Action.Swap, { fee_num: 1 }),
        0n
      )
    ).to.eq(0n);
    expect(
      await converter.getTokenPair(
        encodePoolHintV3(ZeroAddress, PoolTypeV3.ERC4626, 2, 0, 1, Action.Swap, { fee_num: 1 })
      )
    ).to.deep.eq([ZeroAddress, ZeroAddress]);
    await expect(
      converter.convert(
        encodePoolHintV3(ZeroAddress, PoolTypeV3.ERC4626, 2, 0, 1, Action.Swap, { fee_num: 1 }),
        0n,
        ZeroAddress
      )
    ).to.reverted;
  });

  context("#updateSupportedPoolTypes", async () => {
    it("should revert, when non-owner call", async () => {
      await expect(converter.connect(signer).updateSupportedPoolTypes(0)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should succeed", async () => {
      expect(await converter.supportedPoolTypes()).to.eq(1023n);
      await converter.updateSupportedPoolTypes(512);
      expect(await converter.supportedPoolTypes()).to.eq(512n);
    });
  });

  context("#updateTokenMinter", async () => {
    it("should revert, when non-owner call", async () => {
      await expect(converter.connect(signer).updateTokenMinter([], [])).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should succeed", async () => {
      expect(await converter.tokenMinter(ZeroAddress)).to.eq(ZeroAddress);
      await converter.updateTokenMinter([ZeroAddress], [deployer.address]);
      expect(await converter.tokenMinter(ZeroAddress)).to.eq(deployer.address);
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

import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { FxVault, MockERC20, MockTokenWrapper } from "@/types/index";
import { ZeroAddress } from "ethers";

describe("FxVault.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let src: MockERC20;
  let dst: MockERC20;
  let wrapper: MockTokenWrapper;
  let vault: FxVault;

  for (const fxRatio of ["0", "20", "50", "80", "100"]) {
    const expectedFxAmount = ethers.parseEther(fxRatio);
    const expectedLpAmount = ethers.parseEther("100") - ethers.parseEther(fxRatio);
    const expectedInitialShare = fxRatio === "0" ? expectedLpAmount : expectedFxAmount;

    context(`run with fxRatio = ${fxRatio}%`, async () => {
      beforeEach(async () => {
        [deployer, signer] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
        src = await MockERC20.deploy("src", "src", 18);
        dst = await MockERC20.deploy("dst", "dst", 18);

        const MockTokenWrapper = await ethers.getContractFactory("MockTokenWrapper", deployer);
        wrapper = await MockTokenWrapper.deploy();

        const FxVault = await ethers.getContractFactory("FxVault", deployer);
        vault = await FxVault.deploy();

        await src.mint(deployer.address, ethers.parseEther("1000000"));
        await dst.mint(deployer.address, ethers.parseEther("1000000"));
        await wrapper.set(await src.getAddress(), await dst.getAddress());
        await expect(
          vault.initialize(
            await src.getAddress(),
            await dst.getAddress(),
            await wrapper.getAddress(),
            ethers.parseEther(fxRatio) / 100n
          )
        )
          .to.emit(vault, "UpdateWrapper")
          .withArgs(ZeroAddress, await wrapper.getAddress())
          .to.emit(vault, "UpdateFxRatio")
          .withArgs(0n, ethers.parseEther(fxRatio) / 100n);
      });

      context("auth", async () => {
        let newWrapper: MockTokenWrapper;

        context("#updateWrapper", async () => {
          beforeEach(async () => {
            const MockTokenWrapper = await ethers.getContractFactory("MockTokenWrapper", deployer);
            newWrapper = await MockTokenWrapper.deploy();
          });

          it("should revert, when non-owner call", async () => {
            await expect(vault.connect(signer).updateWrapper(await newWrapper.getAddress())).to.revertedWith(
              "Ownable: caller is not the owner"
            );
          });

          it("should revert, when src mismatch", async () => {
            await newWrapper.set(ZeroAddress, await dst.getAddress());
            await expect(vault.updateWrapper(await newWrapper.getAddress())).to.revertedWith("src mismatch");
          });

          it("should revert, when dst mismatch", async () => {
            await newWrapper.set(await src.getAddress(), ZeroAddress);
            await expect(vault.updateWrapper(await newWrapper.getAddress())).to.revertedWith("dst mismatch");
          });

          it("should succeed", async () => {
            await newWrapper.set(await src.getAddress(), await dst.getAddress());
            await expect(vault.updateWrapper(await newWrapper.getAddress()))
              .to.emit(vault, "UpdateWrapper")
              .withArgs(await wrapper.getAddress(), await newWrapper.getAddress());
            expect(await vault.wrapper()).to.eq(await newWrapper.getAddress());
          });
        });
      });

      it("should initialize correctly", async () => {
        expect(await vault.name()).to.eq("f(x) Balancer FX/ETH&FX");
        expect(await vault.symbol()).to.eq("FXVault");
        expect(await vault.owner()).to.eq(deployer.address);
        expect(await vault.fxToken()).to.eq(await src.getAddress());
        expect(await vault.lpToken()).to.eq(await dst.getAddress());
        expect(await vault.wrapper()).to.eq(await wrapper.getAddress());
        expect(await vault.fxRatio()).to.eq(ethers.parseEther(fxRatio) / 100n);
      });

      context("deposit in the first time", async () => {
        it("should revert, when deposit zero amount", async () => {
          await expect(vault.deposit(0n, 0n, deployer.address)).to.revertedWith("deposit zero amount");
        });

        it("should revert, when mint zero share", async () => {
          if (fxRatio === "100") {
            await expect(vault.deposit(0, 1, deployer.address)).to.revertedWith("mint zero share");
          } else {
            await expect(vault.deposit(1, 0, deployer.address)).to.revertedWith("mint zero share");
          }
        });

        it("should succeed, when deposit with equal ratio", async () => {
          await src.approve(await vault.getAddress(), expectedFxAmount);
          await dst.approve(await vault.getAddress(), expectedLpAmount);

          const fxBalanceBefore = await src.balanceOf(deployer.address);
          const lpBalanceBefore = await dst.balanceOf(deployer.address);
          await expect(vault.deposit(expectedFxAmount, expectedLpAmount, signer.address))
            .to.emit(vault, "Deposit")
            .withArgs(deployer.address, signer.address, expectedFxAmount, expectedLpAmount, expectedInitialShare);
          const fxBalanceAfter = await src.balanceOf(deployer.address);
          const lpBalanceAfter = await dst.balanceOf(deployer.address);
          expect(fxBalanceBefore - fxBalanceAfter).to.eq(expectedFxAmount);
          expect(lpBalanceBefore - lpBalanceAfter).to.eq(expectedLpAmount);
          expect(await vault.totalSupply()).to.eq(expectedInitialShare);
          expect(await vault.balanceOf(signer.address)).to.eq(expectedInitialShare);
          expect(await src.balanceOf(await vault.getAddress())).to.eq(expectedFxAmount);
          expect(await dst.balanceOf(await vault.getAddress())).to.eq(expectedLpAmount);
          expect(await vault.totalFxToken()).to.eq(expectedFxAmount);
          expect(await vault.totalLpToken()).to.eq(expectedLpAmount);
        });

        if (fxRatio !== "100") {
          it("should succeed, when deposit with more FX token", async () => {
            await src.approve(await vault.getAddress(), expectedFxAmount);
            await dst.approve(await vault.getAddress(), expectedLpAmount);

            const fxBalanceBefore = await src.balanceOf(deployer.address);
            const lpBalanceBefore = await dst.balanceOf(deployer.address);
            await vault.deposit(expectedFxAmount + ethers.parseEther("1"), expectedLpAmount, signer.address);
            const fxBalanceAfter = await src.balanceOf(deployer.address);
            const lpBalanceAfter = await dst.balanceOf(deployer.address);
            expect(fxBalanceBefore - fxBalanceAfter).to.eq(expectedFxAmount);
            expect(lpBalanceBefore - lpBalanceAfter).to.eq(expectedLpAmount);
            expect(await vault.totalSupply()).to.eq(expectedInitialShare);
            expect(await vault.balanceOf(signer.address)).to.eq(expectedInitialShare);
            expect(await src.balanceOf(await vault.getAddress())).to.eq(expectedFxAmount);
            expect(await dst.balanceOf(await vault.getAddress())).to.eq(expectedLpAmount);
            expect(await vault.totalFxToken()).to.eq(expectedFxAmount);
            expect(await vault.totalLpToken()).to.eq(expectedLpAmount);
          });
        }

        if (fxRatio !== "0") {
          it("should succeed, when deposit with more LP token", async () => {
            await src.approve(await vault.getAddress(), expectedFxAmount);
            await dst.approve(await vault.getAddress(), expectedLpAmount);

            const fxBalanceBefore = await src.balanceOf(deployer.address);
            const lpBalanceBefore = await dst.balanceOf(deployer.address);
            await vault.deposit(expectedFxAmount, expectedLpAmount + ethers.parseEther("1"), signer.address);
            const fxBalanceAfter = await src.balanceOf(deployer.address);
            const lpBalanceAfter = await dst.balanceOf(deployer.address);
            expect(fxBalanceBefore - fxBalanceAfter).to.eq(expectedFxAmount);
            expect(lpBalanceBefore - lpBalanceAfter).to.eq(expectedLpAmount);
            expect(await vault.totalSupply()).to.eq(expectedInitialShare);
            expect(await vault.balanceOf(signer.address)).to.eq(expectedInitialShare);
            expect(await src.balanceOf(await vault.getAddress())).to.eq(expectedFxAmount);
            expect(await dst.balanceOf(await vault.getAddress())).to.eq(expectedLpAmount);
            expect(await vault.totalFxToken()).to.eq(expectedFxAmount);
            expect(await vault.totalLpToken()).to.eq(expectedLpAmount);
          });
        }
      });

      context("deposit multiple times", async () => {
        beforeEach(async () => {
          await src.approve(await vault.getAddress(), expectedFxAmount);
          await dst.approve(await vault.getAddress(), expectedLpAmount);

          const fxBalanceBefore = await src.balanceOf(deployer.address);
          const lpBalanceBefore = await dst.balanceOf(deployer.address);
          await vault.deposit(expectedFxAmount, expectedLpAmount, deployer.address);
          const fxBalanceAfter = await src.balanceOf(deployer.address);
          const lpBalanceAfter = await dst.balanceOf(deployer.address);
          expect(fxBalanceBefore - fxBalanceAfter).to.eq(expectedFxAmount);
          expect(lpBalanceBefore - lpBalanceAfter).to.eq(expectedLpAmount);
          expect(await vault.totalSupply()).to.eq(expectedInitialShare);
          expect(await vault.balanceOf(deployer.address)).to.eq(expectedInitialShare);
          expect(await src.balanceOf(await vault.getAddress())).to.eq(expectedFxAmount);
          expect(await dst.balanceOf(await vault.getAddress())).to.eq(expectedLpAmount);
          expect(await vault.totalFxToken()).to.eq(expectedFxAmount);
          expect(await vault.totalLpToken()).to.eq(expectedLpAmount);
        });

        it("should succeed, when deposit with equal ratio", async () => {
          await src.approve(await vault.getAddress(), expectedFxAmount);
          await dst.approve(await vault.getAddress(), expectedLpAmount);

          const fxBalanceBefore = await src.balanceOf(deployer.address);
          const lpBalanceBefore = await dst.balanceOf(deployer.address);
          await vault.deposit(expectedFxAmount, expectedLpAmount, signer.address);
          const fxBalanceAfter = await src.balanceOf(deployer.address);
          const lpBalanceAfter = await dst.balanceOf(deployer.address);
          expect(fxBalanceBefore - fxBalanceAfter).to.eq(expectedFxAmount);
          expect(lpBalanceBefore - lpBalanceAfter).to.eq(expectedLpAmount);
          expect(await vault.totalSupply()).to.eq(expectedInitialShare * 2n);
          expect(await vault.balanceOf(signer.address)).to.eq(expectedInitialShare);
          expect(await src.balanceOf(await vault.getAddress())).to.eq(expectedFxAmount * 2n);
          expect(await dst.balanceOf(await vault.getAddress())).to.eq(expectedLpAmount * 2n);
          expect(await vault.totalFxToken()).to.eq(expectedFxAmount * 2n);
          expect(await vault.totalLpToken()).to.eq(expectedLpAmount * 2n);
        });

        if (fxRatio !== "100") {
          it("should succeed, when deposit with more FX token", async () => {
            await src.approve(await vault.getAddress(), expectedFxAmount);
            await dst.approve(await vault.getAddress(), expectedLpAmount);

            const fxBalanceBefore = await src.balanceOf(deployer.address);
            const lpBalanceBefore = await dst.balanceOf(deployer.address);
            await vault.deposit(expectedFxAmount + ethers.parseEther("1"), expectedLpAmount, signer.address);
            const fxBalanceAfter = await src.balanceOf(deployer.address);
            const lpBalanceAfter = await dst.balanceOf(deployer.address);
            expect(fxBalanceBefore - fxBalanceAfter).to.eq(expectedFxAmount);
            expect(lpBalanceBefore - lpBalanceAfter).to.eq(expectedLpAmount);
            expect(await vault.totalSupply()).to.eq(expectedInitialShare * 2n);
            expect(await vault.balanceOf(signer.address)).to.eq(expectedInitialShare);
            expect(await src.balanceOf(await vault.getAddress())).to.eq(expectedFxAmount * 2n);
            expect(await dst.balanceOf(await vault.getAddress())).to.eq(expectedLpAmount * 2n);
            expect(await vault.totalFxToken()).to.eq(expectedFxAmount * 2n);
            expect(await vault.totalLpToken()).to.eq(expectedLpAmount * 2n);
          });
        }

        if (fxRatio !== "0") {
          it("should succeed, when deposit with more LP token", async () => {
            await src.approve(await vault.getAddress(), expectedFxAmount);
            await dst.approve(await vault.getAddress(), expectedLpAmount);

            const fxBalanceBefore = await src.balanceOf(deployer.address);
            const lpBalanceBefore = await dst.balanceOf(deployer.address);
            await vault.deposit(expectedFxAmount, expectedLpAmount + ethers.parseEther("1"), signer.address);
            const fxBalanceAfter = await src.balanceOf(deployer.address);
            const lpBalanceAfter = await dst.balanceOf(deployer.address);
            expect(fxBalanceBefore - fxBalanceAfter).to.eq(expectedFxAmount);
            expect(lpBalanceBefore - lpBalanceAfter).to.eq(expectedLpAmount);
            expect(await vault.totalSupply()).to.eq(expectedInitialShare * 2n);
            expect(await vault.balanceOf(signer.address)).to.eq(expectedInitialShare);
            expect(await src.balanceOf(await vault.getAddress())).to.eq(expectedFxAmount * 2n);
            expect(await dst.balanceOf(await vault.getAddress())).to.eq(expectedLpAmount * 2n);
            expect(await vault.totalFxToken()).to.eq(expectedFxAmount * 2n);
            expect(await vault.totalLpToken()).to.eq(expectedLpAmount * 2n);
          });
        }
      });

      context("redeem", async () => {
        beforeEach(async () => {
          await src.approve(await vault.getAddress(), expectedFxAmount * 100n);
          await dst.approve(await vault.getAddress(), expectedLpAmount * 100n);

          const fxBalanceBefore = await src.balanceOf(deployer.address);
          const lpBalanceBefore = await dst.balanceOf(deployer.address);
          await vault.deposit(expectedFxAmount * 100n, expectedLpAmount * 100n, deployer.address);
          const fxBalanceAfter = await src.balanceOf(deployer.address);
          const lpBalanceAfter = await dst.balanceOf(deployer.address);
          expect(fxBalanceBefore - fxBalanceAfter).to.eq(expectedFxAmount * 100n);
          expect(lpBalanceBefore - lpBalanceAfter).to.eq(expectedLpAmount * 100n);
          expect(await vault.totalSupply()).to.eq(expectedInitialShare * 100n);
          expect(await vault.balanceOf(deployer.address)).to.eq(expectedInitialShare * 100n);
          expect(await src.balanceOf(await vault.getAddress())).to.eq(expectedFxAmount * 100n);
          expect(await dst.balanceOf(await vault.getAddress())).to.eq(expectedLpAmount * 100n);
          expect(await vault.totalFxToken()).to.eq(expectedFxAmount * 100n);
          expect(await vault.totalLpToken()).to.eq(expectedLpAmount * 100n);
        });

        it("should revert, when redeem zero share", async () => {
          await expect(vault.redeem(0n, ZeroAddress, ZeroAddress)).to.revertedWith("redeem zero share");
        });

        it("should revert, when redeem exceeds allowance", async () => {
          await expect(vault.redeem(1n, ZeroAddress, signer.address)).to.revertedWith("redeem exceeds allowance");
        });

        it("should succeed", async () => {
          const fxBalanceBefore = await src.balanceOf(signer.address);
          const lpBalanceBefore = await dst.balanceOf(signer.address);
          await expect(vault.redeem(expectedInitialShare, signer.address, deployer.address))
            .to.emit(vault, "Withdraw")
            .withArgs(
              deployer.address,
              signer.address,
              deployer.address,
              expectedFxAmount,
              expectedLpAmount,
              expectedInitialShare
            );
          const fxBalanceAfter = await src.balanceOf(signer.address);
          const lpBalanceAfter = await dst.balanceOf(signer.address);
          expect(fxBalanceAfter - fxBalanceBefore).to.eq(expectedFxAmount);
          expect(lpBalanceAfter - lpBalanceBefore).to.eq(expectedLpAmount);
          expect(await vault.totalSupply()).to.eq(expectedInitialShare * 99n);
          expect(await vault.balanceOf(deployer.address)).to.eq(expectedInitialShare * 99n);
          expect(await src.balanceOf(await vault.getAddress())).to.eq(expectedFxAmount * 99n);
          expect(await dst.balanceOf(await vault.getAddress())).to.eq(expectedLpAmount * 99n);
          expect(await vault.totalFxToken()).to.eq(expectedFxAmount * 99n);
          expect(await vault.totalLpToken()).to.eq(expectedLpAmount * 99n);
        });
      });
    });
  }

  context("rebalance from 0% to 20% to 50% to 80% to 100%", async () => {
    beforeEach(async () => {
      [deployer, signer] = await ethers.getSigners();

      const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
      src = await MockERC20.deploy("src", "src", 18);
      dst = await MockERC20.deploy("dst", "dst", 18);

      const MockTokenWrapper = await ethers.getContractFactory("MockTokenWrapper", deployer);
      wrapper = await MockTokenWrapper.deploy();

      const FxVault = await ethers.getContractFactory("FxVault", deployer);
      vault = await FxVault.deploy();

      await src.mint(deployer.address, ethers.parseEther("1000000"));
      await dst.mint(deployer.address, ethers.parseEther("1000000"));
      await wrapper.set(await src.getAddress(), await dst.getAddress());
      await vault.initialize(await src.getAddress(), await dst.getAddress(), await wrapper.getAddress(), 0n);

      await dst.approve(await vault.getAddress(), ethers.parseEther("100"));
      await vault.deposit(0n, ethers.parseEther("100"), deployer.address);
    });

    it("should revert, when non-owner call", async () => {
      await expect(vault.connect(signer).rebalance(0n, 0n, 0n)).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert, when fxRatio out of bound", async () => {
      await expect(vault.rebalance(ethers.parseEther("1") + 1n, 0n, 0n)).to.revertedWith("fxRatio out of bound");
    });

    it("should revert, when insufficient LP token", async () => {
      await expect(vault.rebalance(1, ethers.parseEther("100") + 1n, 0n)).to.revertedWith("insufficient LP token");
    });

    it("should revert, when insufficient output", async () => {
      await wrapper.setSrcAmount(ethers.parseEther("100"));
      await src.mint(await wrapper.getAddress(), ethers.parseEther("100"));
      await expect(
        vault.rebalance(ethers.parseEther("1"), ethers.parseEther("100"), ethers.parseEther("100") + 1n)
      ).to.revertedWith("insufficient output");
    });

    it("should succeed", async () => {
      // 0 => 20%
      await wrapper.setSrcAmount(ethers.parseEther("20"));
      await src.mint(await wrapper.getAddress(), ethers.parseEther("20"));
      await expect(vault.rebalance(ethers.parseEther("0.2"), ethers.parseEther("20"), ethers.parseEther("20")))
        .to.emit(vault, "Rebalance")
        .withArgs(ethers.parseEther("20"), ethers.parseEther("80"))
        .to.emit(vault, "UpdateFxRatio")
        .withArgs(0, ethers.parseEther("0.2"));
      expect(await vault.totalFxToken()).to.eq(ethers.parseEther("20"));
      expect(await vault.totalLpToken()).to.eq(ethers.parseEther("80"));
      expect(await vault.fxRatio()).to.eq(ethers.parseEther("0.2"));
      // 20% => 50%
      await wrapper.setSrcAmount(ethers.parseEther("30"));
      await src.mint(await wrapper.getAddress(), ethers.parseEther("30"));
      await expect(vault.rebalance(ethers.parseEther("0.5"), ethers.parseEther("30"), ethers.parseEther("30")))
        .to.emit(vault, "Rebalance")
        .withArgs(ethers.parseEther("50"), ethers.parseEther("50"))
        .to.emit(vault, "UpdateFxRatio")
        .withArgs(ethers.parseEther("0.2"), ethers.parseEther("0.5"));
      expect(await vault.totalFxToken()).to.eq(ethers.parseEther("50"));
      expect(await vault.totalLpToken()).to.eq(ethers.parseEther("50"));
      expect(await vault.fxRatio()).to.eq(ethers.parseEther("0.5"));
      // 50% => 80%
      await wrapper.setSrcAmount(ethers.parseEther("30"));
      await src.mint(await wrapper.getAddress(), ethers.parseEther("30"));
      await expect(vault.rebalance(ethers.parseEther("0.8"), ethers.parseEther("30"), ethers.parseEther("30")))
        .to.emit(vault, "Rebalance")
        .withArgs(ethers.parseEther("80"), ethers.parseEther("20"))
        .to.emit(vault, "UpdateFxRatio")
        .withArgs(ethers.parseEther("0.5"), ethers.parseEther("0.8"));
      expect(await vault.totalFxToken()).to.eq(ethers.parseEther("80"));
      expect(await vault.totalLpToken()).to.eq(ethers.parseEther("20"));
      expect(await vault.fxRatio()).to.eq(ethers.parseEther("0.8"));
      // 80% => 100%
      await wrapper.setSrcAmount(ethers.parseEther("20"));
      await src.mint(await wrapper.getAddress(), ethers.parseEther("20"));
      await expect(vault.rebalance(ethers.parseEther("1"), ethers.parseEther("20"), ethers.parseEther("20")))
        .to.emit(vault, "Rebalance")
        .withArgs(ethers.parseEther("100"), ethers.parseEther("0"))
        .to.emit(vault, "UpdateFxRatio")
        .withArgs(ethers.parseEther("0.8"), ethers.parseEther("1"));
      expect(await vault.totalFxToken()).to.eq(ethers.parseEther("100"));
      expect(await vault.totalLpToken()).to.eq(ethers.parseEther("0"));
      expect(await vault.fxRatio()).to.eq(ethers.parseEther("1"));
    });
  });

  context("rebalance from 100% to 80% to 50% to 20% to 0%", async () => {
    beforeEach(async () => {
      [deployer, signer] = await ethers.getSigners();

      const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
      src = await MockERC20.deploy("src", "src", 18);
      dst = await MockERC20.deploy("dst", "dst", 18);

      const MockTokenWrapper = await ethers.getContractFactory("MockTokenWrapper", deployer);
      wrapper = await MockTokenWrapper.deploy();

      const FxVault = await ethers.getContractFactory("FxVault", deployer);
      vault = await FxVault.deploy();

      await src.mint(deployer.address, ethers.parseEther("1000000"));
      await dst.mint(deployer.address, ethers.parseEther("1000000"));
      await wrapper.set(await src.getAddress(), await dst.getAddress());
      await vault.initialize(
        await src.getAddress(),
        await dst.getAddress(),
        await wrapper.getAddress(),
        ethers.parseEther("1")
      );

      await src.approve(await vault.getAddress(), ethers.parseEther("100"));
      await vault.deposit(ethers.parseEther("100"), 0n, deployer.address);
    });

    it("should revert, when non-owner call", async () => {
      await expect(vault.connect(signer).rebalance(0n, 0n, 0n)).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert, when fxRatio out of bound", async () => {
      await expect(vault.rebalance(ethers.parseEther("1") + 1n, 0n, 0n)).to.revertedWith("fxRatio out of bound");
    });

    it("should revert, when insufficient FX token", async () => {
      await expect(vault.rebalance(0, ethers.parseEther("100") + 1n, 0n)).to.revertedWith("insufficient FX token");
    });

    it("should revert, when insufficient output", async () => {
      await wrapper.setDstAmount(ethers.parseEther("100"));
      await dst.mint(await wrapper.getAddress(), ethers.parseEther("100"));
      await expect(vault.rebalance(0, ethers.parseEther("100"), ethers.parseEther("100") + 1n)).to.revertedWith(
        "insufficient output"
      );
    });

    it("should succeed", async () => {
      // 100% => 80%
      await wrapper.setDstAmount(ethers.parseEther("20"));
      await dst.mint(await wrapper.getAddress(), ethers.parseEther("20"));
      await expect(vault.rebalance(ethers.parseEther("0.8"), ethers.parseEther("20"), ethers.parseEther("20")))
        .to.emit(vault, "Rebalance")
        .withArgs(ethers.parseEther("80"), ethers.parseEther("20"))
        .to.emit(vault, "UpdateFxRatio")
        .withArgs(ethers.parseEther("1"), ethers.parseEther("0.8"));
      expect(await vault.totalFxToken()).to.eq(ethers.parseEther("80"));
      expect(await vault.totalLpToken()).to.eq(ethers.parseEther("20"));
      expect(await vault.fxRatio()).to.eq(ethers.parseEther("0.8"));
      // 80% => 50%
      await wrapper.setDstAmount(ethers.parseEther("30"));
      await dst.mint(await wrapper.getAddress(), ethers.parseEther("30"));
      await expect(vault.rebalance(ethers.parseEther("0.5"), ethers.parseEther("30"), ethers.parseEther("30")))
        .to.emit(vault, "Rebalance")
        .withArgs(ethers.parseEther("50"), ethers.parseEther("50"))
        .to.emit(vault, "UpdateFxRatio")
        .withArgs(ethers.parseEther("0.8"), ethers.parseEther("0.5"));
      expect(await vault.totalFxToken()).to.eq(ethers.parseEther("50"));
      expect(await vault.totalLpToken()).to.eq(ethers.parseEther("50"));
      expect(await vault.fxRatio()).to.eq(ethers.parseEther("0.5"));
      // 50% => 20%
      await wrapper.setDstAmount(ethers.parseEther("30"));
      await dst.mint(await wrapper.getAddress(), ethers.parseEther("30"));
      await expect(vault.rebalance(ethers.parseEther("0.2"), ethers.parseEther("30"), ethers.parseEther("30")))
        .to.emit(vault, "Rebalance")
        .withArgs(ethers.parseEther("20"), ethers.parseEther("80"))
        .to.emit(vault, "UpdateFxRatio")
        .withArgs(ethers.parseEther("0.5"), ethers.parseEther("0.2"));
      expect(await vault.totalFxToken()).to.eq(ethers.parseEther("20"));
      expect(await vault.totalLpToken()).to.eq(ethers.parseEther("80"));
      expect(await vault.fxRatio()).to.eq(ethers.parseEther("0.2"));
      // 20% => 0%
      await wrapper.setDstAmount(ethers.parseEther("20"));
      await dst.mint(await wrapper.getAddress(), ethers.parseEther("20"));
      await expect(vault.rebalance(ethers.parseEther("0"), ethers.parseEther("20"), ethers.parseEther("20")))
        .to.emit(vault, "Rebalance")
        .withArgs(ethers.parseEther("0"), ethers.parseEther("100"))
        .to.emit(vault, "UpdateFxRatio")
        .withArgs(ethers.parseEther("0.2"), ethers.parseEther("0"));
      expect(await vault.totalFxToken()).to.eq(ethers.parseEther("0"));
      expect(await vault.totalLpToken()).to.eq(ethers.parseEther("100"));
      expect(await vault.fxRatio()).to.eq(ethers.parseEther("0"));
    });
  });
});

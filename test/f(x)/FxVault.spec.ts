/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { FxVault, MockERC20, MockTokenWrapper } from "../../typechain";
import { constants } from "ethers";

describe("FxVault.spec", async () => {
  let deployer: SignerWithAddress;
  let signer: SignerWithAddress;

  let src: MockERC20;
  let dst: MockERC20;
  let wrapper: MockTokenWrapper;
  let vault: FxVault;

  for (const fxRatio of ["0", "20", "50", "80", "100"]) {
    const expectedFxAmount = ethers.utils.parseEther(fxRatio);
    const expectedLpAmount = ethers.utils.parseEther("100").sub(ethers.utils.parseEther(fxRatio));
    const expectedInitialShare = fxRatio === "0" ? expectedLpAmount : expectedFxAmount;

    context(`run with fxRatio = ${fxRatio}%`, async () => {
      beforeEach(async () => {
        [deployer, signer] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
        src = await MockERC20.deploy("src", "src", 18);
        await src.deployed();
        dst = await MockERC20.deploy("dst", "dst", 18);
        await dst.deployed();

        const MockTokenWrapper = await ethers.getContractFactory("MockTokenWrapper", deployer);
        wrapper = await MockTokenWrapper.deploy();
        await wrapper.deployed();

        const FxVault = await ethers.getContractFactory("FxVault", deployer);
        vault = await FxVault.deploy();

        await src.mint(deployer.address, ethers.utils.parseEther("1000000"));
        await dst.mint(deployer.address, ethers.utils.parseEther("1000000"));
        await wrapper.set(src.address, dst.address);
        await expect(
          vault.initialize(src.address, dst.address, wrapper.address, ethers.utils.parseEther(fxRatio).div(100))
        )
          .to.emit(vault, "UpdateWrapper")
          .withArgs(constants.AddressZero, wrapper.address)
          .to.emit(vault, "UpdateFxRatio")
          .withArgs(constants.Zero, ethers.utils.parseEther(fxRatio).div(100));
      });

      context("auth", async () => {
        let newWrapper: MockTokenWrapper;

        context("#updateWrapper", async () => {
          beforeEach(async () => {
            const MockTokenWrapper = await ethers.getContractFactory("MockTokenWrapper", deployer);
            newWrapper = await MockTokenWrapper.deploy();
            await newWrapper.deployed();
          });

          it("should revert, when non-owner call", async () => {
            await expect(vault.connect(signer).updateWrapper(newWrapper.address)).to.revertedWith(
              "Ownable: caller is not the owner"
            );
          });

          it("should revert, when src mismatch", async () => {
            await newWrapper.set(constants.AddressZero, dst.address);
            await expect(vault.updateWrapper(newWrapper.address)).to.revertedWith("src mismatch");
          });

          it("should revert, when dst mismatch", async () => {
            await newWrapper.set(src.address, constants.AddressZero);
            await expect(vault.updateWrapper(newWrapper.address)).to.revertedWith("dst mismatch");
          });

          it("should succeed", async () => {
            await newWrapper.set(src.address, dst.address);
            await expect(vault.updateWrapper(newWrapper.address))
              .to.emit(vault, "UpdateWrapper")
              .withArgs(wrapper.address, newWrapper.address);
            expect(await vault.wrapper()).to.eq(newWrapper.address);
          });
        });
      });

      it("should initialize correctly", async () => {
        expect(await vault.name()).to.eq("f(x) Balancer FX/ETH&FX");
        expect(await vault.symbol()).to.eq("FXVault");
        expect(await vault.owner()).to.eq(deployer.address);
        expect(await vault.fxToken()).to.eq(src.address);
        expect(await vault.lpToken()).to.eq(dst.address);
        expect(await vault.wrapper()).to.eq(wrapper.address);
        expect(await vault.fxRatio()).to.eq(ethers.utils.parseEther(fxRatio).div(100));
      });

      context("deposit in the first time", async () => {
        it("should revert, when deposit zero amount", async () => {
          await expect(vault.deposit(constants.Zero, constants.Zero, deployer.address)).to.revertedWith(
            "deposit zero amount"
          );
        });

        it("should revert, when mint zero share", async () => {
          if (fxRatio === "100") {
            await expect(vault.deposit(0, 1, deployer.address)).to.revertedWith("mint zero share");
          } else {
            await expect(vault.deposit(1, 0, deployer.address)).to.revertedWith("mint zero share");
          }
        });

        it("should succeed, when deposit with equal ratio", async () => {
          await src.approve(vault.address, expectedFxAmount);
          await dst.approve(vault.address, expectedLpAmount);

          const fxBalanceBefore = await src.balanceOf(deployer.address);
          const lpBalanceBefore = await dst.balanceOf(deployer.address);
          await expect(vault.deposit(expectedFxAmount, expectedLpAmount, signer.address))
            .to.emit(vault, "Deposit")
            .withArgs(deployer.address, signer.address, expectedFxAmount, expectedLpAmount, expectedInitialShare);
          const fxBalanceAfter = await src.balanceOf(deployer.address);
          const lpBalanceAfter = await dst.balanceOf(deployer.address);
          expect(fxBalanceBefore.sub(fxBalanceAfter)).to.eq(expectedFxAmount);
          expect(lpBalanceBefore.sub(lpBalanceAfter)).to.eq(expectedLpAmount);
          expect(await vault.totalSupply()).to.eq(expectedInitialShare);
          expect(await vault.balanceOf(signer.address)).to.eq(expectedInitialShare);
          expect(await src.balanceOf(vault.address)).to.eq(expectedFxAmount);
          expect(await dst.balanceOf(vault.address)).to.eq(expectedLpAmount);
          expect(await vault.totalFxToken()).to.eq(expectedFxAmount);
          expect(await vault.totalLpToken()).to.eq(expectedLpAmount);
        });

        if (fxRatio !== "100") {
          it("should succeed, when deposit with more FX token", async () => {
            await src.approve(vault.address, expectedFxAmount);
            await dst.approve(vault.address, expectedLpAmount);

            const fxBalanceBefore = await src.balanceOf(deployer.address);
            const lpBalanceBefore = await dst.balanceOf(deployer.address);
            await vault.deposit(expectedFxAmount.add(ethers.utils.parseEther("1")), expectedLpAmount, signer.address);
            const fxBalanceAfter = await src.balanceOf(deployer.address);
            const lpBalanceAfter = await dst.balanceOf(deployer.address);
            expect(fxBalanceBefore.sub(fxBalanceAfter)).to.eq(expectedFxAmount);
            expect(lpBalanceBefore.sub(lpBalanceAfter)).to.eq(expectedLpAmount);
            expect(await vault.totalSupply()).to.eq(expectedInitialShare);
            expect(await vault.balanceOf(signer.address)).to.eq(expectedInitialShare);
            expect(await src.balanceOf(vault.address)).to.eq(expectedFxAmount);
            expect(await dst.balanceOf(vault.address)).to.eq(expectedLpAmount);
            expect(await vault.totalFxToken()).to.eq(expectedFxAmount);
            expect(await vault.totalLpToken()).to.eq(expectedLpAmount);
          });
        }

        if (fxRatio !== "0") {
          it("should succeed, when deposit with more LP token", async () => {
            await src.approve(vault.address, expectedFxAmount);
            await dst.approve(vault.address, expectedLpAmount);

            const fxBalanceBefore = await src.balanceOf(deployer.address);
            const lpBalanceBefore = await dst.balanceOf(deployer.address);
            await vault.deposit(expectedFxAmount, expectedLpAmount.add(ethers.utils.parseEther("1")), signer.address);
            const fxBalanceAfter = await src.balanceOf(deployer.address);
            const lpBalanceAfter = await dst.balanceOf(deployer.address);
            expect(fxBalanceBefore.sub(fxBalanceAfter)).to.eq(expectedFxAmount);
            expect(lpBalanceBefore.sub(lpBalanceAfter)).to.eq(expectedLpAmount);
            expect(await vault.totalSupply()).to.eq(expectedInitialShare);
            expect(await vault.balanceOf(signer.address)).to.eq(expectedInitialShare);
            expect(await src.balanceOf(vault.address)).to.eq(expectedFxAmount);
            expect(await dst.balanceOf(vault.address)).to.eq(expectedLpAmount);
            expect(await vault.totalFxToken()).to.eq(expectedFxAmount);
            expect(await vault.totalLpToken()).to.eq(expectedLpAmount);
          });
        }
      });

      context("deposit multiple times", async () => {
        beforeEach(async () => {
          await src.approve(vault.address, expectedFxAmount);
          await dst.approve(vault.address, expectedLpAmount);

          const fxBalanceBefore = await src.balanceOf(deployer.address);
          const lpBalanceBefore = await dst.balanceOf(deployer.address);
          await vault.deposit(expectedFxAmount, expectedLpAmount, deployer.address);
          const fxBalanceAfter = await src.balanceOf(deployer.address);
          const lpBalanceAfter = await dst.balanceOf(deployer.address);
          expect(fxBalanceBefore.sub(fxBalanceAfter)).to.eq(expectedFxAmount);
          expect(lpBalanceBefore.sub(lpBalanceAfter)).to.eq(expectedLpAmount);
          expect(await vault.totalSupply()).to.eq(expectedInitialShare);
          expect(await vault.balanceOf(deployer.address)).to.eq(expectedInitialShare);
          expect(await src.balanceOf(vault.address)).to.eq(expectedFxAmount);
          expect(await dst.balanceOf(vault.address)).to.eq(expectedLpAmount);
          expect(await vault.totalFxToken()).to.eq(expectedFxAmount);
          expect(await vault.totalLpToken()).to.eq(expectedLpAmount);
        });

        it("should succeed, when deposit with equal ratio", async () => {
          await src.approve(vault.address, expectedFxAmount);
          await dst.approve(vault.address, expectedLpAmount);

          const fxBalanceBefore = await src.balanceOf(deployer.address);
          const lpBalanceBefore = await dst.balanceOf(deployer.address);
          await vault.deposit(expectedFxAmount, expectedLpAmount, signer.address);
          const fxBalanceAfter = await src.balanceOf(deployer.address);
          const lpBalanceAfter = await dst.balanceOf(deployer.address);
          expect(fxBalanceBefore.sub(fxBalanceAfter)).to.eq(expectedFxAmount);
          expect(lpBalanceBefore.sub(lpBalanceAfter)).to.eq(expectedLpAmount);
          expect(await vault.totalSupply()).to.eq(expectedInitialShare.mul(2));
          expect(await vault.balanceOf(signer.address)).to.eq(expectedInitialShare);
          expect(await src.balanceOf(vault.address)).to.eq(expectedFxAmount.mul(2));
          expect(await dst.balanceOf(vault.address)).to.eq(expectedLpAmount.mul(2));
          expect(await vault.totalFxToken()).to.eq(expectedFxAmount.mul(2));
          expect(await vault.totalLpToken()).to.eq(expectedLpAmount.mul(2));
        });

        if (fxRatio !== "100") {
          it("should succeed, when deposit with more FX token", async () => {
            await src.approve(vault.address, expectedFxAmount);
            await dst.approve(vault.address, expectedLpAmount);

            const fxBalanceBefore = await src.balanceOf(deployer.address);
            const lpBalanceBefore = await dst.balanceOf(deployer.address);
            await vault.deposit(expectedFxAmount.add(ethers.utils.parseEther("1")), expectedLpAmount, signer.address);
            const fxBalanceAfter = await src.balanceOf(deployer.address);
            const lpBalanceAfter = await dst.balanceOf(deployer.address);
            expect(fxBalanceBefore.sub(fxBalanceAfter)).to.eq(expectedFxAmount);
            expect(lpBalanceBefore.sub(lpBalanceAfter)).to.eq(expectedLpAmount);
            expect(await vault.totalSupply()).to.eq(expectedInitialShare.mul(2));
            expect(await vault.balanceOf(signer.address)).to.eq(expectedInitialShare);
            expect(await src.balanceOf(vault.address)).to.eq(expectedFxAmount.mul(2));
            expect(await dst.balanceOf(vault.address)).to.eq(expectedLpAmount.mul(2));
            expect(await vault.totalFxToken()).to.eq(expectedFxAmount.mul(2));
            expect(await vault.totalLpToken()).to.eq(expectedLpAmount.mul(2));
          });
        }

        if (fxRatio !== "0") {
          it("should succeed, when deposit with more LP token", async () => {
            await src.approve(vault.address, expectedFxAmount);
            await dst.approve(vault.address, expectedLpAmount);

            const fxBalanceBefore = await src.balanceOf(deployer.address);
            const lpBalanceBefore = await dst.balanceOf(deployer.address);
            await vault.deposit(expectedFxAmount, expectedLpAmount.add(ethers.utils.parseEther("1")), signer.address);
            const fxBalanceAfter = await src.balanceOf(deployer.address);
            const lpBalanceAfter = await dst.balanceOf(deployer.address);
            expect(fxBalanceBefore.sub(fxBalanceAfter)).to.eq(expectedFxAmount);
            expect(lpBalanceBefore.sub(lpBalanceAfter)).to.eq(expectedLpAmount);
            expect(await vault.totalSupply()).to.eq(expectedInitialShare.mul(2));
            expect(await vault.balanceOf(signer.address)).to.eq(expectedInitialShare);
            expect(await src.balanceOf(vault.address)).to.eq(expectedFxAmount.mul(2));
            expect(await dst.balanceOf(vault.address)).to.eq(expectedLpAmount.mul(2));
            expect(await vault.totalFxToken()).to.eq(expectedFxAmount.mul(2));
            expect(await vault.totalLpToken()).to.eq(expectedLpAmount.mul(2));
          });
        }
      });

      context("redeem", async () => {
        beforeEach(async () => {
          await src.approve(vault.address, expectedFxAmount.mul(100));
          await dst.approve(vault.address, expectedLpAmount.mul(100));

          const fxBalanceBefore = await src.balanceOf(deployer.address);
          const lpBalanceBefore = await dst.balanceOf(deployer.address);
          await vault.deposit(expectedFxAmount.mul(100), expectedLpAmount.mul(100), deployer.address);
          const fxBalanceAfter = await src.balanceOf(deployer.address);
          const lpBalanceAfter = await dst.balanceOf(deployer.address);
          expect(fxBalanceBefore.sub(fxBalanceAfter)).to.eq(expectedFxAmount.mul(100));
          expect(lpBalanceBefore.sub(lpBalanceAfter)).to.eq(expectedLpAmount.mul(100));
          expect(await vault.totalSupply()).to.eq(expectedInitialShare.mul(100));
          expect(await vault.balanceOf(deployer.address)).to.eq(expectedInitialShare.mul(100));
          expect(await src.balanceOf(vault.address)).to.eq(expectedFxAmount.mul(100));
          expect(await dst.balanceOf(vault.address)).to.eq(expectedLpAmount.mul(100));
          expect(await vault.totalFxToken()).to.eq(expectedFxAmount.mul(100));
          expect(await vault.totalLpToken()).to.eq(expectedLpAmount.mul(100));
        });

        it("should revert, when redeem zero share", async () => {
          await expect(vault.redeem(constants.Zero, constants.AddressZero, constants.AddressZero)).to.revertedWith(
            "redeem zero share"
          );
        });

        it("should revert, when redeem exceeds allowance", async () => {
          await expect(vault.redeem(constants.One, constants.AddressZero, signer.address)).to.revertedWith(
            "redeem exceeds allowance"
          );
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
          expect(fxBalanceAfter.sub(fxBalanceBefore)).to.eq(expectedFxAmount);
          expect(lpBalanceAfter.sub(lpBalanceBefore)).to.eq(expectedLpAmount);
          expect(await vault.totalSupply()).to.eq(expectedInitialShare.mul(99));
          expect(await vault.balanceOf(deployer.address)).to.eq(expectedInitialShare.mul(99));
          expect(await src.balanceOf(vault.address)).to.eq(expectedFxAmount.mul(99));
          expect(await dst.balanceOf(vault.address)).to.eq(expectedLpAmount.mul(99));
          expect(await vault.totalFxToken()).to.eq(expectedFxAmount.mul(99));
          expect(await vault.totalLpToken()).to.eq(expectedLpAmount.mul(99));
        });
      });
    });
  }

  context("rebalance from 0% to 20% to 50% to 80% to 100%", async () => {
    beforeEach(async () => {
      [deployer, signer] = await ethers.getSigners();

      const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
      src = await MockERC20.deploy("src", "src", 18);
      await src.deployed();
      dst = await MockERC20.deploy("dst", "dst", 18);
      await dst.deployed();

      const MockTokenWrapper = await ethers.getContractFactory("MockTokenWrapper", deployer);
      wrapper = await MockTokenWrapper.deploy();
      await wrapper.deployed();

      const FxVault = await ethers.getContractFactory("FxVault", deployer);
      vault = await FxVault.deploy();

      await src.mint(deployer.address, ethers.utils.parseEther("1000000"));
      await dst.mint(deployer.address, ethers.utils.parseEther("1000000"));
      await wrapper.set(src.address, dst.address);
      await vault.initialize(src.address, dst.address, wrapper.address, constants.Zero);

      await dst.approve(vault.address, ethers.utils.parseEther("100"));
      await vault.deposit(constants.Zero, ethers.utils.parseEther("100"), deployer.address);
    });

    it("should revert, when non-owner call", async () => {
      await expect(vault.connect(signer).rebalance(constants.Zero, constants.Zero, constants.Zero)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when fxRatio out of bound", async () => {
      await expect(
        vault.rebalance(ethers.utils.parseEther("1").add(1), constants.Zero, constants.Zero)
      ).to.revertedWith("fxRatio out of bound");
    });

    it("should revert, when insufficient LP token", async () => {
      await expect(vault.rebalance(1, ethers.utils.parseEther("100").add(1), constants.Zero)).to.revertedWith(
        "insufficient LP token"
      );
    });

    it("should revert, when insufficient output", async () => {
      await wrapper.setSrcAmount(ethers.utils.parseEther("100"));
      await src.mint(wrapper.address, ethers.utils.parseEther("100"));
      await expect(
        vault.rebalance(
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("100"),
          ethers.utils.parseEther("100").add(1)
        )
      ).to.revertedWith("insufficient output");
    });

    it("should succeed", async () => {
      // 0 => 20%
      await wrapper.setSrcAmount(ethers.utils.parseEther("20"));
      await src.mint(wrapper.address, ethers.utils.parseEther("20"));
      await expect(
        vault.rebalance(ethers.utils.parseEther("0.2"), ethers.utils.parseEther("20"), ethers.utils.parseEther("20"))
      )
        .to.emit(vault, "Rebalance")
        .withArgs(ethers.utils.parseEther("20"), ethers.utils.parseEther("80"))
        .to.emit(vault, "UpdateFxRatio")
        .withArgs(0, ethers.utils.parseEther("0.2"));
      expect(await vault.totalFxToken()).to.eq(ethers.utils.parseEther("20"));
      expect(await vault.totalLpToken()).to.eq(ethers.utils.parseEther("80"));
      expect(await vault.fxRatio()).to.eq(ethers.utils.parseEther("0.2"));
      // 20% => 50%
      await wrapper.setSrcAmount(ethers.utils.parseEther("30"));
      await src.mint(wrapper.address, ethers.utils.parseEther("30"));
      await expect(
        vault.rebalance(ethers.utils.parseEther("0.5"), ethers.utils.parseEther("30"), ethers.utils.parseEther("30"))
      )
        .to.emit(vault, "Rebalance")
        .withArgs(ethers.utils.parseEther("50"), ethers.utils.parseEther("50"))
        .to.emit(vault, "UpdateFxRatio")
        .withArgs(ethers.utils.parseEther("0.2"), ethers.utils.parseEther("0.5"));
      expect(await vault.totalFxToken()).to.eq(ethers.utils.parseEther("50"));
      expect(await vault.totalLpToken()).to.eq(ethers.utils.parseEther("50"));
      expect(await vault.fxRatio()).to.eq(ethers.utils.parseEther("0.5"));
      // 50% => 80%
      await wrapper.setSrcAmount(ethers.utils.parseEther("30"));
      await src.mint(wrapper.address, ethers.utils.parseEther("30"));
      await expect(
        vault.rebalance(ethers.utils.parseEther("0.8"), ethers.utils.parseEther("30"), ethers.utils.parseEther("30"))
      )
        .to.emit(vault, "Rebalance")
        .withArgs(ethers.utils.parseEther("80"), ethers.utils.parseEther("20"))
        .to.emit(vault, "UpdateFxRatio")
        .withArgs(ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.8"));
      expect(await vault.totalFxToken()).to.eq(ethers.utils.parseEther("80"));
      expect(await vault.totalLpToken()).to.eq(ethers.utils.parseEther("20"));
      expect(await vault.fxRatio()).to.eq(ethers.utils.parseEther("0.8"));
      // 80% => 100%
      await wrapper.setSrcAmount(ethers.utils.parseEther("20"));
      await src.mint(wrapper.address, ethers.utils.parseEther("20"));
      await expect(
        vault.rebalance(ethers.utils.parseEther("1"), ethers.utils.parseEther("20"), ethers.utils.parseEther("20"))
      )
        .to.emit(vault, "Rebalance")
        .withArgs(ethers.utils.parseEther("100"), ethers.utils.parseEther("0"))
        .to.emit(vault, "UpdateFxRatio")
        .withArgs(ethers.utils.parseEther("0.8"), ethers.utils.parseEther("1"));
      expect(await vault.totalFxToken()).to.eq(ethers.utils.parseEther("100"));
      expect(await vault.totalLpToken()).to.eq(ethers.utils.parseEther("0"));
      expect(await vault.fxRatio()).to.eq(ethers.utils.parseEther("1"));
    });
  });

  context("rebalance from 100% to 80% to 50% to 20% to 0%", async () => {
    beforeEach(async () => {
      [deployer, signer] = await ethers.getSigners();

      const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
      src = await MockERC20.deploy("src", "src", 18);
      await src.deployed();
      dst = await MockERC20.deploy("dst", "dst", 18);
      await dst.deployed();

      const MockTokenWrapper = await ethers.getContractFactory("MockTokenWrapper", deployer);
      wrapper = await MockTokenWrapper.deploy();
      await wrapper.deployed();

      const FxVault = await ethers.getContractFactory("FxVault", deployer);
      vault = await FxVault.deploy();

      await src.mint(deployer.address, ethers.utils.parseEther("1000000"));
      await dst.mint(deployer.address, ethers.utils.parseEther("1000000"));
      await wrapper.set(src.address, dst.address);
      await vault.initialize(src.address, dst.address, wrapper.address, ethers.utils.parseEther("1"));

      await src.approve(vault.address, ethers.utils.parseEther("100"));
      await vault.deposit(ethers.utils.parseEther("100"), constants.Zero, deployer.address);
    });

    it("should revert, when non-owner call", async () => {
      await expect(vault.connect(signer).rebalance(constants.Zero, constants.Zero, constants.Zero)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when fxRatio out of bound", async () => {
      await expect(
        vault.rebalance(ethers.utils.parseEther("1").add(1), constants.Zero, constants.Zero)
      ).to.revertedWith("fxRatio out of bound");
    });

    it("should revert, when insufficient FX token", async () => {
      await expect(vault.rebalance(0, ethers.utils.parseEther("100").add(1), constants.Zero)).to.revertedWith(
        "insufficient FX token"
      );
    });

    it("should revert, when insufficient output", async () => {
      await wrapper.setDstAmount(ethers.utils.parseEther("100"));
      await dst.mint(wrapper.address, ethers.utils.parseEther("100"));
      await expect(
        vault.rebalance(0, ethers.utils.parseEther("100"), ethers.utils.parseEther("100").add(1))
      ).to.revertedWith("insufficient output");
    });

    it("should succeed", async () => {
      // 100% => 80%
      await wrapper.setDstAmount(ethers.utils.parseEther("20"));
      await dst.mint(wrapper.address, ethers.utils.parseEther("20"));
      await expect(
        vault.rebalance(ethers.utils.parseEther("0.8"), ethers.utils.parseEther("20"), ethers.utils.parseEther("20"))
      )
        .to.emit(vault, "Rebalance")
        .withArgs(ethers.utils.parseEther("80"), ethers.utils.parseEther("20"))
        .to.emit(vault, "UpdateFxRatio")
        .withArgs(ethers.utils.parseEther("1"), ethers.utils.parseEther("0.8"));
      expect(await vault.totalFxToken()).to.eq(ethers.utils.parseEther("80"));
      expect(await vault.totalLpToken()).to.eq(ethers.utils.parseEther("20"));
      expect(await vault.fxRatio()).to.eq(ethers.utils.parseEther("0.8"));
      // 80% => 50%
      await wrapper.setDstAmount(ethers.utils.parseEther("30"));
      await dst.mint(wrapper.address, ethers.utils.parseEther("30"));
      await expect(
        vault.rebalance(ethers.utils.parseEther("0.5"), ethers.utils.parseEther("30"), ethers.utils.parseEther("30"))
      )
        .to.emit(vault, "Rebalance")
        .withArgs(ethers.utils.parseEther("50"), ethers.utils.parseEther("50"))
        .to.emit(vault, "UpdateFxRatio")
        .withArgs(ethers.utils.parseEther("0.8"), ethers.utils.parseEther("0.5"));
      expect(await vault.totalFxToken()).to.eq(ethers.utils.parseEther("50"));
      expect(await vault.totalLpToken()).to.eq(ethers.utils.parseEther("50"));
      expect(await vault.fxRatio()).to.eq(ethers.utils.parseEther("0.5"));
      // 50% => 20%
      await wrapper.setDstAmount(ethers.utils.parseEther("30"));
      await dst.mint(wrapper.address, ethers.utils.parseEther("30"));
      await expect(
        vault.rebalance(ethers.utils.parseEther("0.2"), ethers.utils.parseEther("30"), ethers.utils.parseEther("30"))
      )
        .to.emit(vault, "Rebalance")
        .withArgs(ethers.utils.parseEther("20"), ethers.utils.parseEther("80"))
        .to.emit(vault, "UpdateFxRatio")
        .withArgs(ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.2"));
      expect(await vault.totalFxToken()).to.eq(ethers.utils.parseEther("20"));
      expect(await vault.totalLpToken()).to.eq(ethers.utils.parseEther("80"));
      expect(await vault.fxRatio()).to.eq(ethers.utils.parseEther("0.2"));
      // 20% => 0%
      await wrapper.setDstAmount(ethers.utils.parseEther("20"));
      await dst.mint(wrapper.address, ethers.utils.parseEther("20"));
      await expect(
        vault.rebalance(ethers.utils.parseEther("0"), ethers.utils.parseEther("20"), ethers.utils.parseEther("20"))
      )
        .to.emit(vault, "Rebalance")
        .withArgs(ethers.utils.parseEther("0"), ethers.utils.parseEther("100"))
        .to.emit(vault, "UpdateFxRatio")
        .withArgs(ethers.utils.parseEther("0.2"), ethers.utils.parseEther("0"));
      expect(await vault.totalFxToken()).to.eq(ethers.utils.parseEther("0"));
      expect(await vault.totalLpToken()).to.eq(ethers.utils.parseEther("100"));
      expect(await vault.fxRatio()).to.eq(ethers.utils.parseEther("0"));
    });
  });
});

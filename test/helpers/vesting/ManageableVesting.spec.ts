import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress, ZeroHash, toBigInt } from "ethers";
import { ethers, network } from "hardhat";

import { ManageableVesting, MockERC20, MockVestingManager } from "@/types/index";

describe("ManageableVesting.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let token: MockERC20;
  let reward: MockERC20;
  let manager: MockVestingManager;
  let vesting: ManageableVesting;

  beforeEach(async () => {
    [deployer, signer] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    token = await MockERC20.deploy("X", "Y", 18);
    reward = await MockERC20.deploy("XX", "YY", 18);

    const MockVestingManager = await ethers.getContractFactory("MockVestingManager", deployer);
    manager = await MockVestingManager.deploy(token.getAddress(), reward.getAddress());

    const ManageableVesting = await ethers.getContractFactory("ManageableVesting", deployer);
    vesting = await ManageableVesting.deploy(token.getAddress());
  });

  it("should initialize correctly", async () => {
    expect(await vesting.token()).to.eq(await token.getAddress());
    expect(await vesting.implementation()).to.not.eq(ZeroAddress);
    expect(await vesting.plainVestingManager()).to.not.eq(ZeroAddress);
    expect(await vesting.plainVestingManager()).to.eq(await vesting.managers(0));

    await expect(vesting.managers(1)).to.reverted;
    expect(await vesting.hasRole(ZeroHash, deployer.address));
  });

  context("auth", async () => {
    context("#newVesting", async () => {
      it("should revert, when no access", async () => {
        await expect(vesting.newVesting(ZeroAddress, 0, 0, 1)).to.revertedWith(
          "AccessControl: account " +
            deployer.address.toLowerCase() +
            " is missing role " +
            (await vesting.VESTING_CREATOR_ROLE())
        );
      });

      it("should revert, when zero amount", async () => {
        await vesting.grantRole(await vesting.VESTING_CREATOR_ROLE(), deployer.address);
        await expect(vesting.newVesting(deployer.address, 0, 1, 2)).to.revertedWithCustomError(
          vesting,
          "ErrorVestZeroAmount"
        );
      });

      it("should revert, when invalid timestamp", async () => {
        await vesting.grantRole(await vesting.VESTING_CREATOR_ROLE(), deployer.address);
        await expect(vesting.newVesting(deployer.address, 1, 1, 1)).to.revertedWithCustomError(
          vesting,
          "ErrorInvalidTimestamp"
        );
        await expect(vesting.newVesting(deployer.address, 1, 2, 1)).to.revertedWithCustomError(
          vesting,
          "ErrorInvalidTimestamp"
        );
      });

      it("should succeed", async () => {
        await vesting.grantRole(await vesting.VESTING_CREATOR_ROLE(), deployer.address);
        expect(await vesting.proxy(deployer.address)).to.eq(ZeroAddress);

        // first one
        await token.mint(deployer.address, 100000n);
        await token.approve(vesting.getAddress(), 100000n);
        const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
        await expect(vesting.newVesting(signer.address, 100000n, timestamp, timestamp + 100))
          .to.emit(vesting, "Vest")
          .withArgs(signer.address, 0, 100000n, timestamp, timestamp + 100);

        const proxy = await ethers.getContractAt("VestingManagerProxy", await vesting.proxy(signer.address), signer);
        expect(await proxy.vesting()).to.eq(await vesting.getAddress());
        expect(await token.balanceOf(proxy.getAddress())).to.eq(100000n);
        expect(await vesting.vesting(signer.address, 0)).to.deep.eq([100000n, timestamp, timestamp + 100, 0, 0, 0]);

        // second one
        await token.mint(deployer.address, 100000n);
        await token.approve(vesting.getAddress(), 100000n);
        await expect(vesting.newVesting(signer.address, 100000n, timestamp + 50, timestamp + 150))
          .to.emit(vesting, "Vest")
          .withArgs(signer.address, 1, 100000n, timestamp + 50, timestamp + 150);
        expect(await vesting.proxy(signer.address)).to.eq(await proxy.getAddress());
        expect(await token.balanceOf(proxy.getAddress())).to.eq(200000n);
        expect(await vesting.vesting(signer.address, 0)).to.deep.eq([100000n, timestamp, timestamp + 100, 0, 0, 0]);
        expect(await vesting.vesting(signer.address, 1)).to.deep.eq([
          100000n,
          timestamp + 50,
          timestamp + 150,
          0,
          0,
          0,
        ]);

        expect(await vesting.getUserVest(signer.address)).to.deep.eq([
          [100000n, timestamp, timestamp + 100, 0, 0, 0],
          [100000n, timestamp + 50, timestamp + 150, 0, 0, 0],
        ]);
      });
    });

    context("#cancel", async () => {
      it("should revert, when no access", async () => {
        await expect(vesting.connect(signer).cancel(signer.address, 0)).to.revertedWith(
          "AccessControl: account " +
            signer.address.toLowerCase() +
            " is missing role " +
            (await vesting.DEFAULT_ADMIN_ROLE())
        );
      });

      it("should revert, when cancel twice", async () => {
        await vesting.grantRole(await vesting.VESTING_CREATOR_ROLE(), deployer.address);
        await token.mint(deployer.address, ethers.parseEther("3000"));
        await token.approve(vesting.getAddress(), ethers.parseEther("3000"));
        const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
        await vesting.newVesting(signer.address, ethers.parseEther("1000"), timestamp + 1000, timestamp + 100000);
        await vesting.newVesting(signer.address, ethers.parseEther("2000"), timestamp + 10000, timestamp + 200000);

        await vesting.cancel(signer.address, 0);
        await expect(vesting.cancel(signer.address, 0)).to.revertedWithCustomError(
          vesting,
          "ErrorVestingAlreadyCancelled"
        );
      });

      for (const delta of [100, 1000, 2000, 50000]) {
        it(`should succeed when cancel after ${delta} seconds`, async () => {
          await vesting.grantRole(await vesting.VESTING_CREATOR_ROLE(), deployer.address);
          await token.mint(deployer.address, ethers.parseEther("3000"));
          await token.approve(vesting.getAddress(), ethers.parseEther("3000"));
          const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
          await vesting.newVesting(signer.address, ethers.parseEther("1000"), timestamp + 1000, timestamp + 100000);
          await vesting.newVesting(signer.address, ethers.parseEther("2000"), timestamp + 10000, timestamp + 200000);

          const vested0 = (toBigInt(Math.max(0, delta - 1000)) * ethers.parseEther("1000")) / (100000n - 1000n);
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + delta]);
          await expect(vesting.cancel(signer.address, 0))
            .to.emit(vesting, "Cancel")
            .withArgs(signer.address, 0, ethers.parseEther("1000") - vested0, timestamp + delta);
          expect(await token.balanceOf(deployer.address)).to.eq(ethers.parseEther("1000") - vested0);
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + delta + 1]);
          const vested1 = (toBigInt(Math.max(0, delta + 1 - 10000)) * ethers.parseEther("2000")) / (200000n - 10000n);
          await expect(vesting.cancel(signer.address, 1))
            .to.emit(vesting, "Cancel")
            .withArgs(signer.address, 1, ethers.parseEther("2000") - vested1, timestamp + delta + 1);
          expect(await token.balanceOf(deployer.address)).to.eq(ethers.parseEther("3000") - vested0 - vested1);
        });
      }
    });

    context("#addVestingManager", async () => {
      it("should revert, when no access", async () => {
        await expect(vesting.connect(signer).addVestingManager(manager.getAddress())).to.revertedWith(
          "AccessControl: account " +
            signer.address.toLowerCase() +
            " is missing role " +
            (await vesting.DEFAULT_ADMIN_ROLE())
        );
      });

      it("should succeed", async () => {
        await expect(vesting.managers(1)).to.reverted;
        await expect(vesting.addVestingManager(manager.getAddress()))
          .to.emit(vesting, "UpdateVestingManager")
          .withArgs(1, ZeroAddress, await manager.getAddress());
        expect(await vesting.managers(1)).to.eq(await manager.getAddress());
      });
    });

    context("#updateVestingManager", async () => {
      it("should revert, when no access", async () => {
        await expect(vesting.connect(signer).updateVestingManager(1, manager.getAddress())).to.revertedWith(
          "AccessControl: account " +
            signer.address.toLowerCase() +
            " is missing role " +
            (await vesting.DEFAULT_ADMIN_ROLE())
        );
      });

      it("should revert, when invalid index", async () => {
        await expect(vesting.updateVestingManager(0, manager.getAddress())).to.revertedWithCustomError(
          vesting,
          "ErrorInvalidManagerIndex"
        );
        await vesting.addVestingManager(manager.getAddress());
        await expect(vesting.updateVestingManager(2, manager.getAddress())).to.revertedWithCustomError(
          vesting,
          "ErrorInvalidManagerIndex"
        );
      });

      it("should succeed", async () => {
        await vesting.addVestingManager(manager.getAddress());
        expect(await vesting.managers(1)).to.eq(await manager.getAddress());
        await expect(vesting.updateVestingManager(1, deployer.address))
          .to.emit(vesting, "UpdateVestingManager")
          .withArgs(1, await manager.getAddress(), deployer.address);
        expect(await vesting.managers(1)).to.eq(await deployer.getAddress());
      });
    });
  });

  context("#locked/vested", async () => {
    let timestamp: number;

    beforeEach(async () => {
      await vesting.grantRole(await vesting.VESTING_CREATOR_ROLE(), deployer.address);
      await token.mint(deployer.address, ethers.parseEther("3000"));
      await token.approve(vesting.getAddress(), ethers.parseEther("3000"));
      timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;

      await vesting.newVesting(signer.address, ethers.parseEther("1000"), timestamp + 1000, timestamp + 100000);
      await vesting.newVesting(signer.address, ethers.parseEther("2000"), timestamp + 10000, timestamp + 200000);
    });

    for (const delta of [100, 1000, 2000, 50000]) {
      it(`should correct after ${delta} seconds`, async () => {
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + delta]);
        await network.provider.send("evm_mine", []);
        const vested0 = (toBigInt(Math.max(0, delta - 1000)) * ethers.parseEther("1000")) / (100000n - 1000n);
        const vested1 = (toBigInt(Math.max(0, delta - 10000)) * ethers.parseEther("2000")) / (200000n - 10000n);

        expect(await vesting.vested(signer.address)).to.eq(vested0 + vested1);
        expect(await vesting.locked(signer.address)).to.eq(ethers.parseEther("3000") - vested0 - vested1);
      });
    }
  });

  context("#claim", async () => {
    let timestamp: number;

    beforeEach(async () => {
      await vesting.grantRole(await vesting.VESTING_CREATOR_ROLE(), deployer.address);
      await token.mint(deployer.address, ethers.parseEther("3000"));
      await token.approve(vesting.getAddress(), ethers.parseEther("3000"));
      timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;

      await vesting.newVesting(signer.address, ethers.parseEther("1000"), timestamp + 1000, timestamp + 100000);
      await vesting.newVesting(signer.address, ethers.parseEther("2000"), timestamp + 10000, timestamp + 200000);
      await vesting.addVestingManager(manager.getAddress());
    });

    for (const delta of [100, 1000, 2000, 50000]) {
      it(`should succeed to claim after ${delta} seconds, with no manager`, async () => {
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + delta]);
        const vested0 = (toBigInt(Math.max(0, delta - 1000)) * ethers.parseEther("1000")) / (100000n - 1000n);
        const vested1 = (toBigInt(Math.max(0, delta - 10000)) * ethers.parseEther("2000")) / (200000n - 10000n);
        await expect(vesting.connect(signer)["claim()"]())
          .to.emit(vesting, "Claim")
          .withArgs(signer.address, vested0 + vested1);
        expect(await token.balanceOf(signer.address)).to.eq(vested0 + vested1);
        expect(await token.balanceOf(await vesting.proxy(signer.address))).to.eq(
          ethers.parseEther("3000") - vested0 - vested1
        );
      });

      it(`should succeed to claim after ${delta} seconds, with manager`, async () => {
        await vesting.connect(signer).manage([0], 1);
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + delta]);
        const vested0 = (toBigInt(Math.max(0, delta - 1000)) * ethers.parseEther("1000")) / (100000n - 1000n);
        await expect(vesting.connect(signer)["claim(uint32)"](1))
          .to.emit(vesting, "Claim")
          .withArgs(signer.address, vested0);
        const vested1 = (toBigInt(Math.max(0, delta + 1 - 10000)) * ethers.parseEther("2000")) / (200000n - 10000n);
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + delta + 1]);
        await expect(vesting.connect(signer)["claim(uint32)"](0))
          .to.emit(vesting, "Claim")
          .withArgs(signer.address, vested1);
        expect(await token.balanceOf(signer.address)).to.eq(vested0 + vested1);
        expect(await token.balanceOf(await vesting.proxy(signer.address))).to.eq(
          ethers.parseEther("3000") - vested0 - vested1
        );
      });
    }

    it("should succeed when claim canceled", async () => {
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 50000]);
      await vesting.cancel(signer.address, 0);
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 50001]);
      await vesting.cancel(signer.address, 1);
      const vested0 = (toBigInt(Math.max(0, 50000 - 1000)) * ethers.parseEther("1000")) / (100000n - 1000n);
      const vested1 = (toBigInt(Math.max(0, 50001 - 10000)) * ethers.parseEther("2000")) / (200000n - 10000n);
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 60000]);
      await expect(vesting.connect(signer)["claim()"]())
        .to.emit(vesting, "Claim")
        .withArgs(signer.address, vested0 + vested1);
      expect(await token.balanceOf(signer.address)).to.eq(vested0 + vested1);
      expect(await token.balanceOf(await vesting.proxy(signer.address))).to.eq(0n);
      expect(await vesting.activeVestingIndex(signer.address)).to.eq(2);
    });

    it("should succeed when claim expired", async () => {
      const vested0 = ethers.parseEther("1000");
      const vested1 = ethers.parseEther("2000");
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 300000]);
      await expect(vesting.connect(signer)["claim()"]())
        .to.emit(vesting, "Claim")
        .withArgs(signer.address, vested0 + vested1);
      expect(await token.balanceOf(signer.address)).to.eq(vested0 + vested1);
      expect(await token.balanceOf(await vesting.proxy(signer.address))).to.eq(0n);
      expect(await vesting.activeVestingIndex(signer.address)).to.eq(2);
    });
  });

  context("#manage", async () => {
    let timestamp: number;

    beforeEach(async () => {
      await vesting.grantRole(await vesting.VESTING_CREATOR_ROLE(), deployer.address);
      await token.mint(deployer.address, ethers.parseEther("3000"));
      await token.approve(vesting.getAddress(), ethers.parseEther("3000"));
      timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;

      await vesting.newVesting(signer.address, ethers.parseEther("1000"), timestamp + 1000, timestamp + 100000);
      await vesting.newVesting(signer.address, ethers.parseEther("2000"), timestamp + 10000, timestamp + 200000);
      await vesting.addVestingManager(manager.getAddress());
    });

    it("should revert, when invalid index", async () => {
      await expect(vesting.manage([], 0)).to.revertedWithCustomError(vesting, "ErrorInvalidManagerIndex");
      await expect(vesting.manage([], 2)).to.revertedWithCustomError(vesting, "ErrorInvalidManagerIndex");
    });

    it("should revert, when manage twice", async () => {
      await vesting.connect(signer).manage([0], 1);
      await expect(vesting.connect(signer).manage([0], 1)).to.revertedWithCustomError(
        vesting,
        "ErrorVesingAlreadyManaged"
      );
      await expect(vesting.connect(signer).manage([1, 0], 1)).to.revertedWithCustomError(
        vesting,
        "ErrorVesingAlreadyManaged"
      );
    });

    for (const delta of [100, 1000, 2000, 50000]) {
      it(`should manage after ${delta} seconds`, async () => {
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + delta]);
        await expect(vesting.connect(signer).manage([0, 1], 1))
          .to.emit(vesting, "Manage")
          .withArgs(1, ethers.parseEther("3000"));
        expect((await vesting.vesting(signer.address, 0)).managerIndex).to.eq(1);
        expect((await vesting.vesting(signer.address, 1)).managerIndex).to.eq(1);
        expect(await manager.balanceOf(await vesting.proxy(signer.address))).to.eq(ethers.parseEther("3000"));
      });
    }
  });

  context("#getReward", async () => {
    let timestamp: number;

    beforeEach(async () => {
      await vesting.grantRole(await vesting.VESTING_CREATOR_ROLE(), deployer.address);
      await token.mint(deployer.address, ethers.parseEther("3000"));
      await token.approve(vesting.getAddress(), ethers.parseEther("3000"));
      timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;

      await vesting.newVesting(signer.address, ethers.parseEther("1000"), timestamp + 1000, timestamp + 100000);
      await vesting.newVesting(signer.address, ethers.parseEther("2000"), timestamp + 10000, timestamp + 200000);
      await vesting.addVestingManager(manager.getAddress());
      await vesting.connect(signer).manage([0, 1], 1);
    });

    it("should succeed, when claim to self", async () => {
      await reward.mint(await vesting.proxy(signer.address), ethers.parseEther("123"));
      expect(await reward.balanceOf(signer.address)).to.eq(0n);
      await vesting.connect(signer).getReward(1, signer.address);
      expect(await reward.balanceOf(signer.address)).to.eq(ethers.parseEther("123"));
    });

    it("should succeed, when claim to other", async () => {
      await reward.mint(await vesting.proxy(signer.address), ethers.parseEther("123"));
      expect(await reward.balanceOf(deployer.address)).to.eq(0n);
      await vesting.connect(signer).getReward(1, deployer.address);
      expect(await reward.balanceOf(deployer.address)).to.eq(ethers.parseEther("123"));
    });
  });
});

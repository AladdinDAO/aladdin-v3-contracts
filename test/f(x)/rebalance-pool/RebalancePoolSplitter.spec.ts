import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress, id, toBigInt } from "ethers";
import { ethers } from "hardhat";

import { MockERC20, RebalancePool, RebalancePoolSplitter, RewardTokenWrapper } from "@/types/index";

describe("RebalancePoolSplitter.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let token: MockERC20;
  let token8: MockERC20;
  let wrapper8: RewardTokenWrapper;
  let splitter: RebalancePoolSplitter;
  let pools: RebalancePool[];

  beforeEach(async () => {
    [deployer, signer] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    token = await MockERC20.deploy("X", "Y", 18);
    token8 = await MockERC20.deploy("X", "Y", 8);

    const RewardTokenWrapper = await ethers.getContractFactory("RewardTokenWrapper", deployer);
    wrapper8 = await RewardTokenWrapper.deploy();
    await wrapper8.initialize(token8.getAddress());

    const RebalancePoolSplitter = await ethers.getContractFactory("RebalancePoolSplitter", deployer);
    splitter = await RebalancePoolSplitter.deploy();

    const Treasury = await ethers.getContractFactory("Treasury", deployer);
    const treasury = await Treasury.deploy(ethers.parseEther("0.5"));
    const Market = await ethers.getContractFactory("Market", deployer);
    const market = await Market.deploy();

    const RebalancePool = await ethers.getContractFactory("RebalancePool", deployer);
    pools = [];
    for (let i = 0; i < 4; ++i) {
      pools.push(await RebalancePool.deploy());
      await pools[i].initialize(treasury.getAddress(), market.getAddress());
      await pools[i].addReward(token.getAddress(), splitter.getAddress(), 86400);
      await pools[i].addReward(wrapper8.getAddress(), splitter.getAddress(), 86400);
    }
  });

  context("auth", async () => {
    context("#setSplitter", async () => {
      it("should revert when caller is not owner", async () => {
        await expect(splitter.connect(signer).setSplitter(ZeroAddress, ZeroAddress)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await splitter.splitter(token.getAddress())).to.eq(ZeroAddress);
        await expect(splitter.setSplitter(token.getAddress(), deployer.address))
          .to.emit(splitter, "UpdateSplitter")
          .withArgs(await token.getAddress(), ZeroAddress, deployer.address);
        expect(await splitter.splitter(token.getAddress())).to.eq(deployer.address);
        await expect(splitter.setSplitter(token.getAddress(), ZeroAddress))
          .to.emit(splitter, "UpdateSplitter")
          .withArgs(await token.getAddress(), deployer.address, ZeroAddress);
        expect(await splitter.splitter(token.getAddress())).to.eq(ZeroAddress);
      });
    });

    context("#updateTokenWrapper", async () => {
      it("should revert when caller is not owner", async () => {
        await expect(splitter.connect(signer).updateTokenWrapper(ZeroAddress, ZeroAddress)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await splitter.tokenWrapper(token8.getAddress())).to.eq(ZeroAddress);
        await expect(splitter.updateTokenWrapper(token8.getAddress(), wrapper8.getAddress()))
          .to.emit(splitter, "UpdateTokenWrapper")
          .withArgs(await token8.getAddress(), ZeroAddress, await wrapper8.getAddress());
        expect(await splitter.tokenWrapper(token8.getAddress())).to.eq(await wrapper8.getAddress());
        await expect(splitter.updateTokenWrapper(token8.getAddress(), ZeroAddress))
          .to.emit(splitter, "UpdateTokenWrapper")
          .withArgs(await token8.getAddress(), await wrapper8.getAddress(), ZeroAddress);
        expect(await splitter.tokenWrapper(token8.getAddress())).to.eq(ZeroAddress);
      });
    });

    context("#registerReceiver", async () => {
      it("should revert when caller is not owner", async () => {
        await expect(splitter.connect(signer).registerReceiver(ZeroAddress, ZeroAddress, [])).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert when already added", async () => {
        await splitter.registerReceiver(token.getAddress(), deployer.address, [1e9]);
        await expect(splitter.registerReceiver(token.getAddress(), deployer.address, [1e9])).to.revertedWithCustomError(
          splitter,
          "ErrorReceiverAlreadyAdded"
        );
      });

      it("should revert, when length mismatch", async () => {
        await expect(splitter.registerReceiver(token.getAddress(), deployer.address, [])).to.revertedWithCustomError(
          splitter,
          "ErrorLengthMismatch"
        );
      });

      it("should revert, when ratio too large", async () => {
        await expect(
          splitter.registerReceiver(token.getAddress(), deployer.address, [1e9 + 1])
        ).to.revertedWithCustomError(splitter, "ErrorSplitRatioTooLarge");
      });

      it("should revert, when ratio sum mismatch", async () => {
        await expect(splitter.registerReceiver(token.getAddress(), deployer.address, [1e8])).to.revertedWithCustomError(
          splitter,
          "ErrorSplitRatioSumMismatch"
        );
      });

      it("should succeed", async () => {
        expect((await splitter.getReceivers(token.getAddress()))._receivers).to.deep.eq([]);
        expect((await splitter.getReceivers(token.getAddress()))._ratios).to.deep.eq([]);
        await expect(splitter.registerReceiver(token.getAddress(), deployer.address, [1e9]))
          .to.emit(splitter, "RegisterReceiver")
          .withArgs(await token.getAddress(), deployer.address)
          .to.emit(splitter, "UpdateSplitRatios")
          .withArgs(await token.getAddress(), [1e9]);
        expect((await splitter.getReceivers(token.getAddress()))._receivers).to.deep.eq([deployer.address]);
        expect((await splitter.getReceivers(token.getAddress()))._ratios).to.deep.eq([1e9]);
        await expect(splitter.registerReceiver(token.getAddress(), signer.address, [1e8, 9e8]))
          .to.emit(splitter, "RegisterReceiver")
          .withArgs(await token.getAddress(), signer.address)
          .to.emit(splitter, "UpdateSplitRatios")
          .withArgs(await token.getAddress(), [1e8, 9e8]);
        expect((await splitter.getReceivers(token.getAddress()))._receivers).to.deep.eq([
          deployer.address,
          signer.address,
        ]);
        expect((await splitter.getReceivers(token.getAddress()))._ratios).to.deep.eq([1e8, 9e8]);
      });
    });

    context("#deregisterReceiver", async () => {
      beforeEach(async () => {
        await splitter.registerReceiver(token.getAddress(), deployer.address, [1e9]);
        await splitter.registerReceiver(token.getAddress(), signer.address, [1e8, 9e8]);
      });

      it("should revert when caller is not owner", async () => {
        await expect(splitter.connect(signer).deregisterReceiver(ZeroAddress, ZeroAddress, [])).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert when not added", async () => {
        await expect(splitter.deregisterReceiver(token.getAddress(), ZeroAddress, [1e9])).to.revertedWithCustomError(
          splitter,
          "ErrorUnknownReceiver"
        );
      });

      it("should revert, when length mismatch", async () => {
        await expect(splitter.deregisterReceiver(token.getAddress(), deployer.address, [])).to.revertedWithCustomError(
          splitter,
          "ErrorLengthMismatch"
        );
      });

      it("should revert, when ratio too large", async () => {
        await expect(
          splitter.deregisterReceiver(token.getAddress(), deployer.address, [1e9 + 1])
        ).to.revertedWithCustomError(splitter, "ErrorSplitRatioTooLarge");
      });

      it("should revert, when ratio sum mismatch", async () => {
        await expect(
          splitter.deregisterReceiver(token.getAddress(), deployer.address, [1e8])
        ).to.revertedWithCustomError(splitter, "ErrorSplitRatioSumMismatch");
      });

      it("should succeed", async () => {
        expect((await splitter.getReceivers(token.getAddress()))._receivers).to.deep.eq([
          deployer.address,
          signer.address,
        ]);
        expect((await splitter.getReceivers(token.getAddress()))._ratios).to.deep.eq([1e8, 9e8]);
        await expect(splitter.deregisterReceiver(token.getAddress(), deployer.address, [1e9]))
          .to.emit(splitter, "DeregisterReceiver")
          .withArgs(await token.getAddress(), deployer.address)
          .to.emit(splitter, "UpdateSplitRatios")
          .withArgs(await token.getAddress(), [1e9]);
        expect((await splitter.getReceivers(token.getAddress()))._receivers).to.deep.eq([signer.address]);
        expect((await splitter.getReceivers(token.getAddress()))._ratios).to.deep.eq([1e9]);
        await expect(splitter.deregisterReceiver(token.getAddress(), signer.address, []))
          .to.emit(splitter, "DeregisterReceiver")
          .withArgs(await token.getAddress(), signer.address)
          .to.emit(splitter, "UpdateSplitRatios")
          .withArgs(await token.getAddress(), []);
        expect((await splitter.getReceivers(token.getAddress()))._receivers).to.deep.eq([]);
        expect((await splitter.getReceivers(token.getAddress()))._ratios).to.deep.eq([]);
      });
    });

    context("#updateSplitRatios", async () => {
      beforeEach(async () => {
        await splitter.registerReceiver(token.getAddress(), deployer.address, [1e9]);
        await splitter.registerReceiver(token.getAddress(), signer.address, [1e8, 9e8]);
      });

      it("should revert when caller is not owner", async () => {
        await expect(splitter.connect(signer).updateSplitRatios(ZeroAddress, [])).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when length mismatch", async () => {
        await expect(splitter.updateSplitRatios(token.getAddress(), [])).to.revertedWithCustomError(
          splitter,
          "ErrorLengthMismatch"
        );
        await expect(splitter.updateSplitRatios(token.getAddress(), [1])).to.revertedWithCustomError(
          splitter,
          "ErrorLengthMismatch"
        );
        await expect(splitter.updateSplitRatios(token.getAddress(), [1, 2, 3])).to.revertedWithCustomError(
          splitter,
          "ErrorLengthMismatch"
        );
      });

      it("should revert, when ratio too large", async () => {
        await expect(splitter.updateSplitRatios(token.getAddress(), [1e9 + 1, 0])).to.revertedWithCustomError(
          splitter,
          "ErrorSplitRatioTooLarge"
        );
      });

      it("should revert, when ratio sum mismatch", async () => {
        await expect(splitter.updateSplitRatios(token.getAddress(), [1e8, 1e8])).to.revertedWithCustomError(
          splitter,
          "ErrorSplitRatioSumMismatch"
        );
      });

      it("should succeed", async () => {
        expect((await splitter.getReceivers(token.getAddress()))._receivers).to.deep.eq([
          deployer.address,
          signer.address,
        ]);
        expect((await splitter.getReceivers(token.getAddress()))._ratios).to.deep.eq([1e8, 9e8]);
        await expect(splitter.updateSplitRatios(token.getAddress(), [1e9, 0]))
          .to.emit(splitter, "UpdateSplitRatios")
          .withArgs(await token.getAddress(), [1e9, 0]);
        expect((await splitter.getReceivers(token.getAddress()))._receivers).to.deep.eq([
          deployer.address,
          signer.address,
        ]);
        expect((await splitter.getReceivers(token.getAddress()))._ratios).to.deep.eq([1e9, 0]);
        await expect(splitter.updateSplitRatios(token.getAddress(), [2e8, 8e8]))
          .to.emit(splitter, "UpdateSplitRatios")
          .withArgs(await token.getAddress(), [2e8, 8e8]);
        expect((await splitter.getReceivers(token.getAddress()))._receivers).to.deep.eq([
          deployer.address,
          signer.address,
        ]);
        expect((await splitter.getReceivers(token.getAddress()))._ratios).to.deep.eq([2e8, 8e8]);
      });
    });

    context("#withdrawFund", async () => {
      it("should revert when caller is not owner", async () => {
        await expect(splitter.connect(signer).withdrawFund(ZeroAddress, ZeroAddress)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when token is protected", async () => {
        await splitter.setSplitter(token.getAddress(), deployer.address);
        await expect(splitter.withdrawFund(token.getAddress(), deployer.address)).to.revertedWithCustomError(
          splitter,
          "ErrorWithdrawTokenWithSplitter"
        );
      });

      it("should succeed", async () => {
        await token.mint(splitter.getAddress(), 1000n);
        expect(await token.balanceOf(splitter.getAddress())).to.eq(1000n);
        expect(await token.balanceOf(signer.address)).to.eq(0n);
        await splitter.withdrawFund(token.getAddress(), signer.address);
        expect(await token.balanceOf(signer.address)).to.eq(1000n);
        expect(await token.balanceOf(splitter.getAddress())).to.eq(0n);
      });
    });
  });

  context("split, decimal = 18", async () => {
    it("should revert, when caller is not splitter", async () => {
      await expect(splitter.split(ZeroAddress)).to.revertedWithCustomError(splitter, "ErrorCallerIsNotSplitter");
    });

    for (let numPool = 1; numPool <= 4; ++numPool) {
      it(`should succeed when split between ${numPool} pools`, async () => {
        await splitter.setSplitter(token.getAddress(), deployer.address);
        const sum = (toBigInt(numPool) * toBigInt(1 + numPool)) / 2n;
        let left = 10n ** 9n;
        const ratios = [];
        for (let i = 1; i < numPool; ++i) {
          ratios.push((toBigInt(i) * 10n ** 9n) / sum);
          left -= ratios[i - 1];
        }
        ratios.push(left);
        for (let i = 0; i < numPool - 1; ++i) {
          const ratios = new Array(i + 1);
          ratios.fill(0);
          ratios[0] = 1e9;
          await splitter.registerReceiver(token.getAddress(), pools[i].getAddress(), ratios);
        }
        await splitter.registerReceiver(token.getAddress(), pools[numPool - 1].getAddress(), ratios);

        await token.mint(splitter.getAddress(), 10n * 10n ** 18n);
        await splitter.split(token.getAddress());
        for (let i = 0; i < numPool; ++i) {
          expect(await token.balanceOf(pools[i].getAddress())).to.eq((10n * 10n ** 18n * ratios[i]) / 10n ** 9n);
        }
      });
    }
  });

  context("split, decimal = 8", async () => {
    for (let numPool = 1; numPool <= 4; ++numPool) {
      it(`should succeed when split between ${numPool} pools`, async () => {
        await splitter.setSplitter(token8.getAddress(), deployer.address);
        await splitter.updateTokenWrapper(token8.getAddress(), wrapper8.getAddress());
        await wrapper8.grantRole(id("DISTRIBUTOR_ROLE"), splitter.getAddress());
        const sum = (toBigInt(numPool) * toBigInt(1 + numPool)) / 2n;
        let left = 10n ** 9n;
        const ratios = [];
        for (let i = 1; i < numPool; ++i) {
          ratios.push((toBigInt(i) * 10n ** 9n) / sum);
          left -= ratios[i - 1];
        }
        ratios.push(left);
        for (let i = 0; i < numPool - 1; ++i) {
          const ratios = new Array(i + 1);
          ratios.fill(0);
          ratios[0] = 1e9;
          await splitter.registerReceiver(token8.getAddress(), pools[i].getAddress(), ratios);
        }
        await splitter.registerReceiver(token8.getAddress(), pools[numPool - 1].getAddress(), ratios);

        await token8.mint(splitter.getAddress(), 10n * 10n ** 8n);
        await splitter.split(token8.getAddress());
        for (let i = 0; i < numPool; ++i) {
          expect(await wrapper8.balanceOf(pools[i].getAddress())).to.eq((10n * 10n ** 18n * ratios[i]) / 10n ** 9n);
        }
      });
    }
  });
});

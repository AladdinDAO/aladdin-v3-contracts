/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";

import { request_fork } from "@/test/utils";
import {
  FundraisingGaugeFx,
  GaugeController,
  GovernanceToken,
  MockTreasuryForClaimer,
  RebalancePoolGaugeClaimer,
  RebalancePoolSplitter,
} from "@/types/index";
import { MaxUint256, ZeroAddress, ZeroHash, concat, toBigInt } from "ethers";

const FOKR_HEIGHT = 18613440;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const FXN_HOLDER = "0x3A45468c2B85A969Ab3999f9b286da9bab226709";
const ADMIN = "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF";

async function minimalProxyDeploy(deployer: HardhatEthersSigner, implementation: string): Promise<string> {
  const tx = await deployer.sendTransaction({
    data: concat(["0x3d602d80600a3d3981f3363d3d373d3d3d363d73", implementation, "0x5af43d82803e903d91602b57fd5bf3"]),
  });
  const receipt = await tx.wait();
  return receipt!.contractAddress!;
}

describe("FxTokenBalancerV2Wrapper.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;
  let admin: HardhatEthersSigner;

  let fxn: GovernanceToken;
  let controller: GaugeController;
  let gauge: FundraisingGaugeFx;

  let treasury: MockTreasuryForClaimer;
  let splitter: RebalancePoolSplitter;
  let claimer: RebalancePoolGaugeClaimer;

  beforeEach(async () => {
    request_fork(FOKR_HEIGHT, [DEPLOYER, FXN_HOLDER, ADMIN]);
    deployer = await ethers.getSigner(DEPLOYER);
    signer = await ethers.getSigner(FXN_HOLDER);
    admin = await ethers.getSigner(ADMIN);
    await deployer.sendTransaction({ to: admin.address, value: ethers.parseEther("10") });
    await deployer.sendTransaction({ to: signer.address, value: ethers.parseEther("10") });

    fxn = await ethers.getContractAt("GovernanceToken", "0x365AccFCa291e7D3914637ABf1F7635dB165Bb09", deployer);
    controller = await ethers.getContractAt("GaugeController", "0xe60eB8098B34eD775ac44B1ddE864e098C6d7f37", deployer);

    const RebalancePoolSplitter = await ethers.getContractFactory("RebalancePoolSplitter", deployer);
    splitter = await RebalancePoolSplitter.deploy();

    const MockTreasuryForClaimer = await ethers.getContractFactory("MockTreasuryForClaimer", deployer);
    treasury = await MockTreasuryForClaimer.deploy();

    const FundraisingGaugeFx = await ethers.getContractFactory("FundraisingGaugeFx", deployer);
    const gaugeImpl = await FundraisingGaugeFx.deploy(admin.address);
    const gaugeAddr = await minimalProxyDeploy(deployer, await gaugeImpl.getAddress());
    gauge = await ethers.getContractAt("FundraisingGaugeFx", gaugeAddr, deployer);

    const RebalancePoolGaugeClaimer = await ethers.getContractFactory("RebalancePoolGaugeClaimer", deployer);
    claimer = await RebalancePoolGaugeClaimer.deploy(
      deployer.address,
      treasury.getAddress(),
      gauge.getAddress(),
      splitter.getAddress()
    );

    await gauge.initialize(claimer.getAddress(), MaxUint256);
    await controller.connect(admin)["add_type(string,uint256)"]("RebalancePool", ethers.parseEther("0.3"));
    await controller.connect(admin)["add_gauge(address,int128,uint256)"](gauge.getAddress(), 0, ethers.parseEther("1"));
    await splitter.setSplitter(fxn.getAddress(), claimer.getAddress());

    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
    await network.provider.send("evm_mine");
  });

  context("auth", async () => {
    context("#updateIncentiveRatio", async () => {
      it("should revert when caller is not owner", async () => {
        await expect(claimer.connect(signer).updateIncentiveRatio(0n)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when too large", async () => {
        await expect(claimer.updateIncentiveRatio(1e8 + 1)).to.revertedWithCustomError(
          claimer,
          "ErrorIncentiveRatioTooLarge"
        );
      });

      it("should succeed", async () => {
        expect(await claimer.incentiveRatio()).to.eq(10000000n);
        await expect(claimer.updateIncentiveRatio(100000000n))
          .to.emit(claimer, "UpdateIncentiveRatio")
          .withArgs(10000000n, 100000000n);
        expect(await claimer.incentiveRatio()).to.eq(100000000n);
        await expect(claimer.updateIncentiveRatio(0n))
          .to.emit(claimer, "UpdateIncentiveRatio")
          .withArgs(100000000n, 0n);
        expect(await claimer.incentiveRatio()).to.eq(0n);
      });
    });

    context("#updateSplitterRatioParameters", async () => {
      it("should revert when caller is not owner", async () => {
        await expect(claimer.connect(signer).updateSplitterRatioParameters(0n, 0n, 0n)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when invalid lower bound", async () => {
        await expect(claimer.updateSplitterRatioParameters(1.3e9 - 1, 3e9, 666666666)).to.revertedWithCustomError(
          claimer,
          "ErrorInvalidLeverageRatioLowerBound"
        );
        await expect(claimer.updateSplitterRatioParameters(2e9 + 1, 3e9, 666666666)).to.revertedWithCustomError(
          claimer,
          "ErrorInvalidLeverageRatioLowerBound"
        );
      });

      it("should revert, when invalid upper bound", async () => {
        await expect(claimer.updateSplitterRatioParameters(2000000000, 2e9 - 1, 666666666)).to.revertedWithCustomError(
          claimer,
          "ErrorInvalidLeverageRatioUpperBound"
        );
        await expect(claimer.updateSplitterRatioParameters(2000000000, 5e9 + 1, 666666666)).to.revertedWithCustomError(
          claimer,
          "ErrorInvalidLeverageRatioUpperBound"
        );
      });

      it("should revert, when invalid min ratio", async () => {
        await expect(claimer.updateSplitterRatioParameters(2000000000, 3e9, 5e8 - 1)).to.revertedWithCustomError(
          claimer,
          "ErrorInvalidMinSplitRatio"
        );
        await expect(claimer.updateSplitterRatioParameters(2000000000, 3e9, 1e9 + 1)).to.revertedWithCustomError(
          claimer,
          "ErrorInvalidMinSplitRatio"
        );
      });

      it("should succeed", async () => {
        expect(await claimer.params()).to.deep.eq([2e9, 3e9, 666666666]);
        for (const lower of [1.3e9, 2e9]) {
          for (const upper of [2e9, 5e9]) {
            for (const ratio of [5e8, 1e9]) {
              await expect(claimer.updateSplitterRatioParameters(lower, upper, ratio))
                .to.emit(claimer, "UpdateSplitterRatio")
                .withArgs(lower, upper, ratio);
              expect(await claimer.params()).to.deep.eq([lower, upper, ratio]);
            }
          }
        }
      });
    });
  });

  context("getSplitterRatio", async () => {
    it("should return max when leverage <= lower bound", async () => {
      await treasury.setLeverageRatio(2e9);
      expect(await claimer.getSplitterRatio()).to.eq(1e9);
      await treasury.setLeverageRatio(2e9 - 1);
      expect(await claimer.getSplitterRatio()).to.eq(1e9);
    });

    it("should return min when leverage >= upper bound", async () => {
      await treasury.setLeverageRatio(3e9);
      expect(await claimer.getSplitterRatio()).to.eq(666666666);
      await treasury.setLeverageRatio(3e9 + 1);
      expect(await claimer.getSplitterRatio()).to.eq(666666666);
    });

    it("should succeed in middle", async () => {
      await treasury.setLeverageRatio(2.5e9);
      expect(await claimer.getSplitterRatio()).to.eq(833333333);
    });
  });

  context("claim", async () => {
    for (const [leverage, ratio] of [
      [2e9, 1000000000n],
      [2.5e9, 833333333n],
      [3e9, 666666666n],
    ]) {
      for (const extra of [0n, ethers.parseEther("1")]) {
        for (const incentiveRatio of [0n, 10000000n]) {
          it(`should succeed, when leverage is ${ethers.formatUnits(leverage, 9)} extra is ${ethers.formatEther(
            extra
          )}`, async () => {
            await treasury.setLeverageRatio(leverage);
            await claimer.updateIncentiveRatio(incentiveRatio);
            expect(await claimer.getSplitterRatio()).to.eq(ratio);
            if (extra > 0n) {
              await fxn.connect(signer).transfer(claimer.getAddress(), extra);
            }
            await gauge.user_checkpoint(ZeroAddress);
            const minMinted = await gauge.claimable_tokens_write.staticCall(claimer.getAddress());
            expect(minMinted).to.gt(0n);
            const reserveBefore = await fxn.balanceOf(deployer.address);
            const splitterBefore = await fxn.balanceOf(splitter.getAddress());
            const adminBefore = await fxn.balanceOf(admin.address);
            const tx = await claimer.claim(admin.address);
            const receipt = await tx.wait();
            let minted: bigint = 0n;
            for (const log of receipt!.logs) {
              if (
                log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" &&
                log.topics[1] === ZeroHash
              ) {
                minted = toBigInt(log.data);
              }
            }
            expect(minted).to.gt(minMinted);
            const incentivePart = (minted * incentiveRatio) / 1000000000n;
            const splitterPart = ((minted - incentivePart + extra) * toBigInt(ratio)) / 1000000000n;
            const reservePart = minted + extra - incentivePart - splitterPart;
            expect(await fxn.balanceOf(claimer.getAddress())).to.eq(0n);
            const adminAfter = await fxn.balanceOf(admin.address);
            const splitterAfter = await fxn.balanceOf(splitter.getAddress());
            const reserveAfter = await fxn.balanceOf(deployer.address);
            expect(adminAfter - adminBefore).to.eq(incentivePart);
            expect(splitterAfter - splitterBefore).to.eq(splitterPart);
            expect(reserveAfter - reserveBefore).to.eq(reservePart);
          });
        }
      }
    }
  });
});

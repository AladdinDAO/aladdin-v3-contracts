import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress, ZeroHash, id } from "ethers";
import { ethers, network } from "hardhat";

import { GaugeController, GaugeControllerOwner, GovernanceToken, TokenMinter, VotingEscrow } from "@/types/index";

describe("GaugeControllerOwner.spec", async () => {
  const Week = 86400 * 7;

  let deployer: HardhatEthersSigner;
  let gauge0: HardhatEthersSigner;
  let gauge1: HardhatEthersSigner;
  let gauge2: HardhatEthersSigner;
  let gauge3: HardhatEthersSigner;

  let gov: GovernanceToken;
  let ve: VotingEscrow;
  let controller: GaugeController;
  let owner: GaugeControllerOwner;
  let minter: TokenMinter;

  beforeEach(async () => {
    [deployer, gauge0, gauge1, gauge2, gauge3] = await ethers.getSigners();

    const GovernanceToken = await ethers.getContractFactory("GovernanceToken", deployer);
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow", deployer);
    const GaugeController = await ethers.getContractFactory("GaugeController", deployer);
    const TokenMinter = await ethers.getContractFactory("TokenMinter", deployer);

    gov = await GovernanceToken.deploy();
    ve = await VotingEscrow.deploy();
    controller = await GaugeController.deploy();
    minter = await TokenMinter.deploy();

    await gov.initialize(
      ethers.parseEther("1020000"), // initial supply
      ethers.parseEther("98000") / (86400n * 365n), // initial rate, 10%,
      1111111111111111111n, // rate reduction coefficient, 1/0.9 * 1e18,
      deployer.address,
      "Governance Token",
      "GOV"
    );
    await ve.initialize(deployer.address, gov.getAddress(), "Voting Escrow GOV", "veGOV", "1.0");
    await controller.initialize(deployer.address, gov.getAddress(), ve.getAddress());
    await minter.initialize(gov.getAddress(), controller.getAddress());
    await gov.set_minter(minter.getAddress());
    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400]);
    await gov.update_mining_parameters();

    await controller["add_type(string)"]("1");
    await controller["add_type(string)"]("2");
    await controller["add_type(string)"]("3");
    await controller["add_type(string)"]("4");
    await controller["add_gauge(address,int128)"](gauge0.address, 0);
    await controller["add_gauge(address,int128)"](gauge1.address, 1);
    await controller["add_gauge(address,int128)"](gauge2.address, 2);
    await controller["add_gauge(address,int128)"](gauge3.address, 3);

    const GaugeControllerOwner = await ethers.getContractFactory("GaugeControllerOwner", deployer);
    owner = await GaugeControllerOwner.deploy(controller.getAddress());
    await controller.commit_transfer_ownership(owner.getAddress());
    await controller.apply_transfer_ownership();
  });

  context("constructor", async () => {
    it("should succeed", async () => {
      expect(await owner.controller()).to.eq(await controller.getAddress());
      expect(await owner.getGauges()).to.deep.eq([]);
    });
  });

  context("auth", async () => {
    context("#updateRelativeWeight", async () => {
      it("should revert, when non-admin call", async () => {
        await expect(owner.connect(gauge0).updateRelativeWeight(ZeroAddress, 0n)).to.revertedWith(
          "AccessControl: account " + gauge0.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert when weight too large", async () => {
        await expect(owner.updateRelativeWeight(ZeroAddress, 10n ** 18n + 1n)).to.revertedWithCustomError(
          owner,
          "ErrorWeightTooLarge"
        );
      });

      it("should succeed", async () => {
        // add one by one
        expect(await owner.getGauges()).to.deep.eq([]);
        expect(await owner.weights(gauge0.address)).to.eq(0n);
        await expect(owner.updateRelativeWeight(gauge0.address, 1n))
          .to.emit(owner, "UpdateRelativeWeight")
          .withArgs(gauge0.address, 0n, 1n);
        expect(await owner.weights(gauge0.address)).to.eq(1n);
        expect(await owner.getGauges()).to.deep.eq([gauge0.address]);
        expect(await owner.weights(gauge1.address)).to.eq(0n);
        await expect(owner.updateRelativeWeight(gauge1.address, 2n))
          .to.emit(owner, "UpdateRelativeWeight")
          .withArgs(gauge1.address, 0n, 2n);
        expect(await owner.weights(gauge1.address)).to.eq(2n);
        expect(await owner.getGauges()).to.deep.eq([gauge0.address, gauge1.address]);
        expect(await owner.weights(gauge2.address)).to.eq(0n);
        await expect(owner.updateRelativeWeight(gauge2.address, 3n))
          .to.emit(owner, "UpdateRelativeWeight")
          .withArgs(gauge2.address, 0n, 3n);
        expect(await owner.weights(gauge2.address)).to.eq(3n);
        expect(await owner.getGauges()).to.deep.eq([gauge0.address, gauge1.address, gauge2.address]);
        expect(await owner.weights(gauge3.address)).to.eq(0n);
        await expect(owner.updateRelativeWeight(gauge3.address, 4n))
          .to.emit(owner, "UpdateRelativeWeight")
          .withArgs(gauge3.address, 0n, 4n);
        expect(await owner.weights(gauge3.address)).to.eq(4n);
        expect(await owner.getGauges()).to.deep.eq([gauge0.address, gauge1.address, gauge2.address, gauge3.address]);
        // remove one by one
        await expect(owner.updateRelativeWeight(gauge3.address, 0n))
          .to.emit(owner, "UpdateRelativeWeight")
          .withArgs(gauge3.address, 4n, 0n);
        expect(await owner.weights(gauge3.address)).to.eq(0n);
        expect(await owner.getGauges()).to.deep.eq([gauge0.address, gauge1.address, gauge2.address]);
        await expect(owner.updateRelativeWeight(gauge2.address, 0n))
          .to.emit(owner, "UpdateRelativeWeight")
          .withArgs(gauge2.address, 3n, 0n);
        expect(await owner.weights(gauge2.address)).to.eq(0n);
        expect(await owner.getGauges()).to.deep.eq([gauge0.address, gauge1.address]);
        await expect(owner.updateRelativeWeight(gauge1.address, 0n))
          .to.emit(owner, "UpdateRelativeWeight")
          .withArgs(gauge1.address, 2n, 0n);
        expect(await owner.weights(gauge1.address)).to.eq(0n);
        expect(await owner.getGauges()).to.deep.eq([gauge0.address]);
        await expect(owner.updateRelativeWeight(gauge0.address, 0n))
          .to.emit(owner, "UpdateRelativeWeight")
          .withArgs(gauge0.address, 1n, 0n);
        expect(await owner.weights(gauge0.address)).to.eq(0n);
        expect(await owner.getGauges()).to.deep.eq([]);
      });
    });

    context("#commitTransferOwnership", async () => {
      it("should revert, when non-admin call", async () => {
        await expect(owner.connect(gauge0).commitTransferOwnership(ZeroAddress)).to.revertedWith(
          "AccessControl: account " + gauge0.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should succeed", async () => {
        expect(await controller.future_admin()).to.eq(await owner.getAddress());
        await owner.commitTransferOwnership(deployer.address);
        expect(await controller.future_admin()).to.eq(deployer.address);
      });
    });

    context("#applyTransferOwnership", async () => {
      it("should revert, when non-admin call", async () => {
        await expect(owner.connect(gauge0).applyTransferOwnership()).to.revertedWith(
          "AccessControl: account " + gauge0.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should succeed", async () => {
        expect(await controller.future_admin()).to.eq(await owner.getAddress());
        await owner.commitTransferOwnership(deployer.address);
        expect(await controller.future_admin()).to.eq(deployer.address);
        expect(await controller.admin()).to.eq(await owner.getAddress());
        await owner.applyTransferOwnership();
        expect(await controller.admin()).to.eq(deployer.address);
      });
    });

    context("#addGauge", async () => {
      it("should revert, when non-admin call", async () => {
        await expect(owner.connect(gauge0)["addGauge(address,int128)"](ZeroAddress, 0n)).to.revertedWith(
          "AccessControl: account " + gauge0.address.toLowerCase() + " is missing role " + ZeroHash
        );
        await expect(owner.connect(gauge0)["addGauge(address,int128,uint256)"](ZeroAddress, 0n, 0n)).to.revertedWith(
          "AccessControl: account " + gauge0.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should succeed without weight", async () => {
        await expect(controller.gauge_types(deployer.address)).to.reverted;
        expect(await controller.get_gauge_weight(deployer.address)).to.eq(0n);
        await owner["addGauge(address,int128)"](deployer.address, 0n);
        expect(await controller.gauge_types(deployer.address)).to.eq(0n);
        expect(await controller.get_gauge_weight(deployer.address)).to.eq(0n);
      });

      it("should succeed with weight", async () => {
        await expect(controller.gauge_types(deployer.address)).to.reverted;
        expect(await controller.get_gauge_weight(deployer.address)).to.eq(0n);
        await owner["addGauge(address,int128,uint256)"](deployer.address, 0n, 111n);
        expect(await controller.gauge_types(deployer.address)).to.eq(0n);
        expect(await controller.get_gauge_weight(deployer.address)).to.eq(111n);
      });
    });

    context("#addType", async () => {
      it("should revert, when non-admin call", async () => {
        await expect(owner.connect(gauge0)["addType(string)"]("")).to.revertedWith(
          "AccessControl: account " + gauge0.address.toLowerCase() + " is missing role " + ZeroHash
        );
        await expect(owner.connect(gauge0)["addType(string,uint256)"]("", 0n)).to.revertedWith(
          "AccessControl: account " + gauge0.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should succeed without weight", async () => {
        expect(await controller.gauge_type_names(4n)).to.eq("");
        expect(await controller.get_type_weight(4n)).to.eq(0n);
        await owner["addType(string)"]("5");
        expect(await controller.gauge_type_names(4n)).to.eq("5");
        expect(await controller.get_type_weight(4n)).to.eq(0n);
      });

      it("should succeed with weight", async () => {
        expect(await controller.gauge_type_names(4n)).to.eq("");
        expect(await controller.get_type_weight(4n)).to.eq(0n);
        await owner["addType(string,uint256)"]("5", 123n);
        expect(await controller.gauge_type_names(4n)).to.eq("5");
        expect(await controller.get_type_weight(4n)).to.eq(123n);
      });
    });

    context("#changeTypeWeight", async () => {
      it("should revert, when non-admin call", async () => {
        await expect(owner.connect(gauge0).changeTypeWeight(0n, 0n)).to.revertedWith(
          "AccessControl: account " + gauge0.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should succeed", async () => {
        expect(await controller.get_type_weight(0n)).to.eq(0n);
        await owner.changeTypeWeight(0n, 1n);
        expect(await controller.get_type_weight(0n)).to.eq(1n);
      });
    });

    context("#changeGaugeWeight", async () => {
      it("should revert, when non-admin call", async () => {
        await expect(owner.connect(gauge0).changeGaugeWeight(ZeroAddress, 0n)).to.revertedWith(
          "AccessControl: account " + gauge0.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should succeed", async () => {
        expect(await controller.get_gauge_weight(gauge0.address)).to.eq(0n);
        await owner.changeGaugeWeight(gauge0.address, 123n);
        expect(await controller.get_gauge_weight(gauge0.address)).to.eq(123n);
      });
    });
  });

  context("#normalizeGaugeWeight", async () => {
    beforeEach(async () => {
      await owner.changeTypeWeight(0, ethers.parseEther("1"));
      await owner.changeTypeWeight(1, ethers.parseEther("2"));
      await owner.changeTypeWeight(2, ethers.parseEther("3"));
      await owner.changeTypeWeight(3, ethers.parseEther("4"));
    });

    it("should revert, when non-normalizer call", async () => {
      await expect(owner.normalizeGaugeWeight()).to.revertedWith(
        "AccessControl: account " + deployer.address.toLowerCase() + " is missing role " + id("WEIGHT_NORMALIZER_ROLE")
      );
    });

    it("should revert when no solution", async () => {
      // total weight is zero and sum < 1
      await owner.grantRole(id("WEIGHT_NORMALIZER_ROLE"), deployer.address);
      await owner.updateRelativeWeight(gauge0.address, ethers.parseEther("0.5"));
      await owner.updateRelativeWeight(gauge1.address, ethers.parseEther("0.4"));
      await expect(owner.normalizeGaugeWeight()).to.revertedWithCustomError(owner, "ErrorNoSolution");
      // total weight is zero and sum > 1
      await owner.updateRelativeWeight(gauge0.address, ethers.parseEther("0.5"));
      await owner.updateRelativeWeight(gauge1.address, ethers.parseEther("0.6"));
      await expect(owner.normalizeGaugeWeight()).to.revertedWithCustomError(owner, "ErrorNoSolution");
      // total weight is not zero and sum > 1
      await owner.changeGaugeWeight(gauge2.address, ethers.parseEther("0.1"));
      await owner.updateRelativeWeight(gauge0.address, ethers.parseEther("0.5"));
      await owner.updateRelativeWeight(gauge1.address, ethers.parseEther("0.6"));
      await expect(owner.normalizeGaugeWeight()).to.revertedWithCustomError(owner, "ErrorInvalidSolution");
    });

    it("should succeed when total weight is zero", async () => {
      await owner.grantRole(id("WEIGHT_NORMALIZER_ROLE"), deployer.address);
      await owner.updateRelativeWeight(gauge0.address, ethers.parseEther("0.4"));
      await owner.updateRelativeWeight(gauge1.address, ethers.parseEther("0.6"));
      await owner.normalizeGaugeWeight();
      expect(await controller["gauge_relative_weight(address)"](gauge0.address)).to.eq(0n);
      expect(await controller["gauge_relative_weight(address)"](gauge1.address)).to.eq(0n);
      const week = Math.floor((await ethers.provider.getBlock("latest"))!.timestamp / Week) * Week + Week;
      await network.provider.send("evm_setNextBlockTimestamp", [week]);
      await network.provider.send("evm_mine", []);
      expect(await controller["gauge_relative_weight(address)"](gauge0.address)).to.eq(ethers.parseEther("0.4"));
      expect(await controller["gauge_relative_weight(address)"](gauge1.address)).to.eq(ethers.parseEther("0.6"));
    });

    it("should succeed when total weight is non-zero", async () => {
      await owner.grantRole(id("WEIGHT_NORMALIZER_ROLE"), deployer.address);
      let week = 0;

      // case 1
      await owner.changeGaugeWeight(gauge0.address, ethers.parseEther("0.321"));
      await owner.updateRelativeWeight(gauge1.address, ethers.parseEther("0.35"));
      await owner.normalizeGaugeWeight();
      week = Math.floor((await ethers.provider.getBlock("latest"))!.timestamp / Week) * Week + Week;
      await network.provider.send("evm_setNextBlockTimestamp", [week]);
      await network.provider.send("evm_mine", []);
      expect(await controller["gauge_relative_weight(address)"](gauge0.address)).to.closeTo(
        ethers.parseEther("0.65"),
        100n
      );
      expect(await controller["gauge_relative_weight(address)"](gauge1.address)).to.closeTo(
        ethers.parseEther("0.35"),
        100n
      );

      // case 2
      await owner.changeGaugeWeight(gauge0.address, ethers.parseEther("0.213"));
      await owner.updateRelativeWeight(gauge1.address, ethers.parseEther("0.4"));
      await owner.updateRelativeWeight(gauge2.address, ethers.parseEther("0.5"));
      await owner.normalizeGaugeWeight();
      week = Math.floor((await ethers.provider.getBlock("latest"))!.timestamp / Week) * Week + Week;
      await network.provider.send("evm_setNextBlockTimestamp", [week]);
      await network.provider.send("evm_mine", []);
      expect(await controller["gauge_relative_weight(address)"](gauge0.address)).to.closeTo(
        ethers.parseEther("0.1"),
        100n
      );
      expect(await controller["gauge_relative_weight(address)"](gauge1.address)).to.closeTo(
        ethers.parseEther("0.4"),
        100n
      );
      expect(await controller["gauge_relative_weight(address)"](gauge2.address)).to.closeTo(
        ethers.parseEther("0.5"),
        100n
      );

      // case 3
      await owner.changeGaugeWeight(gauge0.address, ethers.parseEther("0.427"));
      await owner.updateRelativeWeight(gauge1.address, ethers.parseEther("0.3"));
      await owner.updateRelativeWeight(gauge2.address, ethers.parseEther("0.4"));
      await owner.updateRelativeWeight(gauge3.address, ethers.parseEther("0.1"));
      await owner.normalizeGaugeWeight();
      week = Math.floor((await ethers.provider.getBlock("latest"))!.timestamp / Week) * Week + Week;
      await network.provider.send("evm_setNextBlockTimestamp", [week]);
      await network.provider.send("evm_mine", []);
      expect(await controller["gauge_relative_weight(address)"](gauge0.address)).to.closeTo(
        ethers.parseEther("0.2"),
        100n
      );
      expect(await controller["gauge_relative_weight(address)"](gauge1.address)).to.closeTo(
        ethers.parseEther("0.3"),
        100n
      );
      expect(await controller["gauge_relative_weight(address)"](gauge2.address)).to.closeTo(
        ethers.parseEther("0.4"),
        100n
      );
      expect(await controller["gauge_relative_weight(address)"](gauge3.address)).to.closeTo(
        ethers.parseEther("0.1"),
        100n
      );
    });
  });
});

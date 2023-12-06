/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress, ZeroHash, solidityPackedKeccak256 } from "ethers";
import { ethers, network } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import { ConcentratorStakeDAOLocker, IMultiMerkleStash } from "@/types/index";
import { TOKENS } from "@/utils/index";

const FORK_BLOCK_NUMBER = 15976790;

const SDCRV = "0xD1b5651E55D4CeeD36251c61c50C889B36F6abB5";
const SDCRV_HOLDER = "0x33f2b6e3047c97598e557fc1e8d29e1693ae5f15";
const SDCRV_GAUGE = "0x7f50786A0b15723D741727882ee99a0BF34e3466";
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const OPERATOR = "0x66c57bF505A85A74609D2C83E94Aabb26d691E1F";
const MERKLE_OWNER = "0x2f18e001B44DCc1a1968553A2F32ab8d45B12195";

describe("ConcentratorStakeDAOLocker.spec", async () => {
  let deployer: HardhatEthersSigner;
  let operator: HardhatEthersSigner;

  let locker: ConcentratorStakeDAOLocker;

  beforeEach(async () => {
    await request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, OPERATOR, SDCRV_HOLDER, MERKLE_OWNER]);
    deployer = await ethers.getSigner(DEPLOYER);
    operator = await ethers.getSigner(OPERATOR);

    await mockETHBalance(SDCRV_HOLDER, ethers.parseEther("10"));
    await mockETHBalance(OPERATOR, ethers.parseEther("10"));

    const ConcentratorStakeDAOLocker = await ethers.getContractFactory("ConcentratorStakeDAOLocker", deployer);
    locker = await ConcentratorStakeDAOLocker.deploy();
    await locker.initialize();
  });

  context("auth", async () => {
    context("#updateOperator", async () => {
      it("should revert, when call updateOperator and caller is not owner", async () => {
        await expect(locker.connect(operator).updateOperator(SDCRV_GAUGE, operator.address)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await locker.operators(SDCRV_GAUGE)).to.eq(ZeroAddress);
        await expect(locker.connect(deployer).updateOperator(SDCRV_GAUGE, operator.address))
          .to.emit(locker, "UpdateOperator")
          .withArgs(SDCRV_GAUGE, operator.address);
        expect(await locker.operators(SDCRV_GAUGE)).to.eq(operator.address);
      });
    });

    context("#updateGaugeRewardReceiver", async () => {
      it("should revert, when call delegate and caller is not owner", async () => {
        await expect(locker.connect(operator).updateGaugeRewardReceiver(SDCRV_GAUGE, ZeroAddress)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        const gauge = await ethers.getContractAt("ICurveGauge", SDCRV_GAUGE, deployer);
        expect(await gauge.rewards_receiver(locker.getAddress())).to.eq(ZeroAddress);
        await expect(locker.updateGaugeRewardReceiver(SDCRV_GAUGE, deployer.address))
          .to.emit(locker, "UpdateGaugeRewardReceiver")
          .withArgs(SDCRV_GAUGE, ZeroAddress, deployer.address);
        expect(await gauge.rewards_receiver(locker.getAddress())).to.eq(deployer.address);
        await expect(locker.updateGaugeRewardReceiver(SDCRV_GAUGE, ZeroAddress))
          .to.emit(locker, "UpdateGaugeRewardReceiver")
          .withArgs(SDCRV_GAUGE, deployer.address, ZeroAddress);
        expect(await gauge.rewards_receiver(locker.getAddress())).to.eq(ZeroAddress);
      });
    });

    context("#updateExecutor", async () => {
      it("should revert, when call delegate and caller is not owner", async () => {
        await expect(locker.connect(operator).updateExecutor(ZeroAddress, false)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
        await expect(locker.connect(operator).updateExecutor(ZeroAddress, true)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await locker.executors(deployer.address)).to.eq(false);
        await expect(locker.updateExecutor(deployer.address, true))
          .to.emit(locker, "UpdateExecutor")
          .withArgs(deployer.address, true);
        expect(await locker.executors(deployer.address)).to.eq(true);
        await expect(locker.updateExecutor(deployer.address, false))
          .to.emit(locker, "UpdateExecutor")
          .withArgs(deployer.address, false);
        expect(await locker.executors(deployer.address)).to.eq(false);
      });
    });

    context("#updateClaimer", async () => {
      it("should revert, when call updateClaimer and caller is not owner", async () => {
        await expect(locker.connect(operator).updateClaimer(operator.address)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await locker.claimer()).to.eq(ZeroAddress);
        await expect(locker.connect(deployer).updateClaimer(operator.address))
          .to.emit(locker, "UpdateClaimer")
          .withArgs(operator.address);
        expect(await locker.claimer()).to.eq(operator.address);
      });
    });

    context("#delegate", async () => {
      it("should revert, when call delegate and caller is not owner", async () => {
        await expect(locker.connect(operator).delegate(ZeroAddress, ZeroHash, ZeroAddress)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        const registry = await ethers.getContractAt(
          "ISnapshotDelegateRegistry",
          "0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446",
          deployer
        );
        const id = "0x617065636f696e2e657468000000000000000000000000000000000000000000";
        expect(await registry.delegation(locker.getAddress(), id)).to.eq(ZeroAddress);
        await locker.delegate(registry.getAddress(), id, deployer.address);
        expect(await registry.delegation(locker.getAddress(), id)).to.eq(deployer.address);
      });
    });

    context("#updateVerifier", async () => {
      it("should revert, when call delegate and caller is not owner", async () => {
        await expect(locker.connect(operator).updateVerifier(ZeroAddress)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await locker.verifier()).to.eq(ZeroAddress);
        await locker.updateVerifier(deployer.address);
        expect(await locker.verifier()).to.eq(deployer.address);
      });
    });
  });

  context("execute", async () => {
    beforeEach(async () => {
      await locker.updateExecutor(deployer.address, true);
    });

    it("should revert when caller is not executor", async () => {
      await expect(locker.connect(operator).execute(ZeroAddress, 0n, "0x")).to.revertedWith("not executor");
    });

    it("should succeed", async () => {
      const holder = await ethers.getSigner(SDCRV_HOLDER);
      const token = await ethers.getContractAt("MockERC20", SDCRV, holder);
      const gauge = await ethers.getContractAt("MockERC20", SDCRV_GAUGE, deployer);
      const amount = ethers.parseEther("10");

      await locker.connect(deployer).updateOperator(SDCRV_GAUGE, operator.address);
      await token.transfer(locker.getAddress(), amount);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(0n);
      await locker.connect(operator).deposit(SDCRV_GAUGE, SDCRV);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(amount);

      const crv = await ethers.getContractAt("MockERC20", TOKENS.CRV.address, deployer);
      expect(await crv.balanceOf(locker.getAddress())).to.eq(0n);
      await locker.execute(SDCRV_GAUGE, 0n, "0xe6f1daf2");
      expect(await crv.balanceOf(locker.getAddress())).to.gt(0n);
    });
  });

  context("claimBribeRewards", async () => {
    const amount = ethers.parseEther("100");

    let root: string;
    let merkle: IMultiMerkleStash;

    beforeEach(async () => {
      const merkleOwner = await ethers.getSigner(MERKLE_OWNER);
      await network.provider.send("hardhat_setBalance", [MERKLE_OWNER, "0x" + ethers.parseEther("10").toString(16)]);
      merkle = await ethers.getContractAt(
        "IMultiMerkleStash",
        "0x03E34b085C52985F6a5D27243F20C84bDdc01Db4",
        merkleOwner
      );

      root = solidityPackedKeccak256(["uint256", "address", "uint256"], [0n, await locker.getAddress(), amount]);
      await merkle.updateMerkleRoot(TOKENS.SDT.address, root);

      await locker.updateClaimer(deployer.address);
    });

    it("should revert when caller is not claimer", async () => {
      await expect(
        locker.connect(operator).claimBribeRewards(
          [
            {
              token: TOKENS.SDT.address,
              index: 0n,
              amount,
              merkleProof: [],
            },
          ],
          deployer.address
        )
      ).to.revertedWith("only bribe claimer");
    });

    it("should revert when invalid merkle proof", async () => {
      await locker.claimBribeRewards(
        [
          {
            token: TOKENS.SDT.address,
            index: 0n,
            amount,
            merkleProof: [],
          },
        ],
        deployer.address
      );
      await expect(
        locker.claimBribeRewards(
          [
            {
              token: TOKENS.SDT.address,
              index: 0n,
              amount: amount + 1n,
              merkleProof: [],
            },
          ],
          deployer.address
        )
      ).to.revertedWith("invalid merkle proof");
    });

    it("should revert when bribe rewards claimed", async () => {
      await locker.claimBribeRewards(
        [
          {
            token: TOKENS.SDT.address,
            index: 0n,
            amount,
            merkleProof: [],
          },
        ],
        deployer.address
      );
      await expect(
        locker.claimBribeRewards(
          [
            {
              token: TOKENS.SDT.address,
              index: 0n,
              amount: amount,
              merkleProof: [],
            },
          ],
          deployer.address
        )
      ).to.revertedWith("bribe rewards claimed");
    });

    it("should succeed claim by self", async () => {
      const sdt = await ethers.getContractAt("MockERC20", TOKENS.SDT.address, deployer);
      const before = await sdt.balanceOf(deployer.address);
      expect(await locker.claimed(TOKENS.SDT.address, root)).to.eq(false);
      await locker.claimBribeRewards(
        [
          {
            token: TOKENS.SDT.address,
            index: 0n,
            amount,
            merkleProof: [],
          },
        ],
        deployer.address
      );
      expect(await sdt.balanceOf(deployer.address)).to.eq(before + amount);
      expect(await locker.claimed(TOKENS.SDT.address, root)).to.eq(true);
    });

    it("should succeed when someone else claim for", async () => {
      const sdt = await ethers.getContractAt("MockERC20", TOKENS.SDT.address, deployer);
      await merkle.claim(TOKENS.SDT.address, 0n, locker.getAddress(), amount, []);
      const before = await sdt.balanceOf(deployer.address);
      expect(await locker.claimed(TOKENS.SDT.address, root)).to.eq(false);
      await locker.claimBribeRewards(
        [
          {
            token: TOKENS.SDT.address,
            index: 0n,
            amount,
            merkleProof: [],
          },
        ],
        deployer.address
      );
      expect(await sdt.balanceOf(deployer.address)).to.eq(before + amount);
      expect(await locker.claimed(TOKENS.SDT.address, root)).to.eq(true);
    });
  });

  context("deposit", async () => {
    it("should revert, when non operator call deposit", async () => {
      await expect(locker.connect(operator).deposit(SDCRV_GAUGE, SDCRV)).to.revertedWith("not operator");
    });

    it("should succeed", async () => {
      const holder = await ethers.getSigner(SDCRV_HOLDER);
      const token = await ethers.getContractAt("MockERC20", SDCRV, holder);
      const gauge = await ethers.getContractAt("MockERC20", SDCRV_GAUGE, deployer);
      const amount = ethers.parseEther("10");

      await locker.connect(deployer).updateOperator(SDCRV_GAUGE, operator.address);
      await token.transfer(locker.getAddress(), amount);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(0n);
      await locker.connect(operator).deposit(SDCRV_GAUGE, SDCRV);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(amount);
    });
  });

  context("withdraw", async () => {
    it("should revert, when non operator call withdraw", async () => {
      await expect(locker.connect(operator).withdraw(SDCRV_GAUGE, SDCRV, 0n, ZeroAddress)).to.revertedWith(
        "not operator"
      );
    });

    it("should succeed", async () => {
      const holder = await ethers.getSigner(SDCRV_HOLDER);
      const token = await ethers.getContractAt("MockERC20", SDCRV, holder);
      const gauge = await ethers.getContractAt("MockERC20", SDCRV_GAUGE, deployer);
      const amountIn = ethers.parseEther("10");
      const amountOut = ethers.parseEther("1");

      // deposit
      await locker.connect(deployer).updateOperator(SDCRV_GAUGE, operator.address);
      await token.transfer(locker.getAddress(), amountIn);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(0n);
      await locker.connect(operator).deposit(SDCRV_GAUGE, SDCRV);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(amountIn);

      // withdraw
      const balanceBefore = await token.balanceOf(deployer.address);
      await locker.connect(operator).withdraw(SDCRV_GAUGE, SDCRV, amountOut, deployer.address);
      const balanceAfter = await token.balanceOf(deployer.address);
      expect(await gauge.balanceOf(locker.getAddress())).to.eq(amountIn - amountOut);
      expect(balanceAfter - balanceBefore).to.eq(amountOut);
    });
  });
});

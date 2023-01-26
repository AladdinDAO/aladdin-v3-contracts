/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers, network } from "hardhat";
import { TOKENS } from "../../scripts/utils";
import { CurveLockerProxy, ICurveFeeDistributor } from "../../typechain";
import { request_fork } from "../utils";

const FORK_BLOCK_NUMBER = 16489300;

const veCRV = "0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2";
const CRV = "0xD533a949740bb3306d119CC777fa900bA034cd52";
const CRV_HOLDER = "0x32d03db62e464c9168e41028ffa6e9a05d8c6451";

const THREE_CRV = "0x6c3f90f043a72fa612cbac8115ee7e52bde6e490";
const THREE_CRV_HOLDER = "0x4486083589a063ddef47ee2e4467b5236c508fde";

const FRAXUSDC = "0x3175df0976dfa876431c2e9ee6bc45b65d3473cc";
const FRAXUSDC_HOLDER = "0x2815c10740f4d738b20fdc13167c865380156623";
const FRAXUSDC_GAUGE = "0xCFc25170633581Bf896CB6CDeE170e3E3Aa59503";

const STECRV = "0x06325440d014e39736583c165c2963ba99faf14e";
const STECRV_HOLDER = "0x5ad00b0db3019e1ab09c25179e27a42e9315e050";
const STECRV_GAUGE = "0x182b723a58739a9c974cfdb385ceadb237453c28";

const LDOETH = "0xb79565c01b7ae53618d9b847b9443aaf4f9011e7";
const LDOETH_HOLDER = "0xf91dc62ecb1d2cfc6ee72e1e7a27288c20bb5486";
const LDOETH_GAUGE = "0xe5d5aa1bbe72f68df42432813485ca1fc998de32";

const CURVE_DAO = "0x40907540d8a6C65c637785e8f8B742ae6b0b9968";
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const OPERATOR = "0x66c57bF505A85A74609D2C83E94Aabb26d691E1F";

describe("CurveLockerProxy.spec", async () => {
  let deployer: SignerWithAddress;
  let operator: SignerWithAddress;
  let proxy: CurveLockerProxy;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [
      DEPLOYER,
      OPERATOR,
      FRAXUSDC_HOLDER,
      THREE_CRV_HOLDER,
      CRV_HOLDER,
      STECRV_HOLDER,
      LDOETH_HOLDER,
      CURVE_DAO,
    ]);
    deployer = await ethers.getSigner(DEPLOYER);
    operator = await ethers.getSigner(OPERATOR);
    await deployer.sendTransaction({ to: FRAXUSDC_HOLDER, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: THREE_CRV_HOLDER, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: CRV_HOLDER, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: STECRV_HOLDER, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: LDOETH_HOLDER, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: CURVE_DAO, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: OPERATOR, value: ethers.utils.parseEther("10") });

    const CurveLockerProxy = await ethers.getContractFactory("CurveLockerProxy", deployer);
    proxy = await CurveLockerProxy.deploy();
    await proxy.deployed();
  });

  context("auth", async () => {
    context("#updateOperator", async () => {
      it("should revert, when call updateOperator and caller is not owner", async () => {
        await expect(proxy.connect(operator).updateOperator(FRAXUSDC_GAUGE, operator.address)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await proxy.operators(FRAXUSDC_GAUGE)).to.eq(constants.AddressZero);
        await expect(proxy.connect(deployer).updateOperator(FRAXUSDC_GAUGE, operator.address))
          .to.emit(proxy, "UpdateOperator")
          .withArgs(FRAXUSDC_GAUGE, operator.address);
        expect(await proxy.operators(FRAXUSDC_GAUGE)).to.eq(operator.address);
      });
    });

    context("#updateExecutor", async () => {
      it("should revert, when call updateExecutor and caller is not owner", async () => {
        await expect(proxy.connect(operator).updateExecutor(operator.address, true)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await proxy.executors(operator.address)).to.eq(false);
        await expect(proxy.connect(deployer).updateExecutor(operator.address, true))
          .to.emit(proxy, "UpdateExecutor")
          .withArgs(operator.address, true);
        expect(await proxy.executors(operator.address)).to.eq(true);
        await expect(proxy.connect(deployer).updateExecutor(operator.address, false))
          .to.emit(proxy, "UpdateExecutor")
          .withArgs(operator.address, false);
        expect(await proxy.executors(operator.address)).to.eq(false);
      });
    });

    context("#updateLocker", async () => {
      it("should revert, when call updateLocker and caller is not owner", async () => {
        await expect(proxy.connect(operator).updateLocker(operator.address)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await proxy.locker()).to.eq(constants.AddressZero);
        await expect(proxy.connect(deployer).updateLocker(operator.address))
          .to.emit(proxy, "UpdateLocker")
          .withArgs(operator.address);
        expect(await proxy.locker()).to.eq(operator.address);
      });
    });

    context("#updateVoter", async () => {
      it("should revert, when call updateVoter and caller is not owner", async () => {
        await expect(proxy.connect(operator).updateVoter(operator.address)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await proxy.voter()).to.eq(constants.AddressZero);
        await expect(proxy.connect(deployer).updateVoter(operator.address))
          .to.emit(proxy, "UpdateVoter")
          .withArgs(operator.address);
        expect(await proxy.voter()).to.eq(operator.address);
      });
    });
  });

  context("deposit", async () => {
    it("should revert, when non operator call deposit", async () => {
      await expect(proxy.connect(operator).deposit(FRAXUSDC_GAUGE, FRAXUSDC, constants.Zero)).to.revertedWith(
        "not operator"
      );
    });

    it("should revert, when balance not enough", async () => {
      const amount = ethers.utils.parseEther("10");
      await proxy.connect(deployer).updateOperator(FRAXUSDC_GAUGE, operator.address);
      await expect(proxy.connect(operator).deposit(FRAXUSDC_GAUGE, FRAXUSDC, amount)).to.revertedWith(
        "balance not enough"
      );
    });

    it("should succeed", async () => {
      const holder = await ethers.getSigner(FRAXUSDC_HOLDER);
      const token = await ethers.getContractAt("IERC20", FRAXUSDC, holder);
      const gauge = await ethers.getContractAt("IERC20", FRAXUSDC_GAUGE, deployer);
      const amount = ethers.utils.parseEther("10");

      await proxy.connect(deployer).updateOperator(FRAXUSDC_GAUGE, operator.address);
      await token.transfer(proxy.address, amount);
      expect(await gauge.balanceOf(proxy.address)).to.eq(constants.Zero);
      await proxy.connect(operator).deposit(FRAXUSDC_GAUGE, FRAXUSDC, amount);
      expect(await gauge.balanceOf(proxy.address)).to.eq(amount);
      expect(await proxy.balanceOf(FRAXUSDC_GAUGE)).to.eq(amount);
    });
  });

  context("withdraw", async () => {
    it("should revert, when non operator call withdraw", async () => {
      await expect(
        proxy.connect(operator).withdraw(FRAXUSDC_GAUGE, FRAXUSDC, constants.Zero, constants.AddressZero)
      ).to.revertedWith("not operator");
    });

    it("should succeed", async () => {
      const holder = await ethers.getSigner(FRAXUSDC_HOLDER);
      const token = await ethers.getContractAt("IERC20", FRAXUSDC, holder);
      const gauge = await ethers.getContractAt("IERC20", FRAXUSDC_GAUGE, deployer);
      const amountIn = ethers.utils.parseEther("10");
      const amountOut = ethers.utils.parseEther("1");

      // deposit
      await proxy.connect(deployer).updateOperator(FRAXUSDC_GAUGE, operator.address);
      await token.transfer(proxy.address, amountIn);
      expect(await gauge.balanceOf(proxy.address)).to.eq(constants.Zero);
      await proxy.connect(operator).deposit(FRAXUSDC_GAUGE, FRAXUSDC, amountIn);
      expect(await gauge.balanceOf(proxy.address)).to.eq(amountIn);
      expect(await proxy.balanceOf(FRAXUSDC_GAUGE)).to.eq(amountIn);

      // withdraw
      const balanceBefore = await token.balanceOf(deployer.address);
      await proxy.connect(operator).withdraw(FRAXUSDC_GAUGE, FRAXUSDC, amountOut, deployer.address);
      const balanceAfter = await token.balanceOf(deployer.address);
      expect(await gauge.balanceOf(proxy.address)).to.eq(amountIn.sub(amountOut));
      expect(balanceAfter.sub(balanceBefore)).to.eq(amountOut);
      expect(await proxy.balanceOf(FRAXUSDC_GAUGE)).to.eq(amountIn.sub(amountOut));
    });
  });

  context("claimCRV", async () => {
    it("should revert, when non operator call claimCRV", async () => {
      await expect(proxy.connect(operator).claimCRV(FRAXUSDC_GAUGE, constants.AddressZero)).to.revertedWith(
        "not operator"
      );
    });

    it("should succeed, when no CRV in contract", async () => {
      const holder = await ethers.getSigner(FRAXUSDC_HOLDER);
      const crvHolder = await ethers.getSigner(CRV_HOLDER);
      const token = await ethers.getContractAt("IERC20", FRAXUSDC, holder);
      const crv = await ethers.getContractAt("IERC20", CRV, crvHolder);
      const amount = ethers.utils.parseEther("50000");

      await proxy.connect(deployer).updateOperator(FRAXUSDC_GAUGE, operator.address);
      await token.transfer(proxy.address, amount);
      await proxy.connect(operator).deposit(FRAXUSDC_GAUGE, FRAXUSDC, amount);
      expect(await proxy.balanceOf(FRAXUSDC_GAUGE)).to.eq(amount);

      expect(await crv.balanceOf(proxy.address)).to.eq(constants.Zero);
      const before = await crv.balanceOf(deployer.address);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      await proxy.connect(operator).claimCRV(FRAXUSDC_GAUGE, deployer.address);
      expect(await crv.balanceOf(proxy.address)).to.eq(constants.Zero);
      const after = await crv.balanceOf(deployer.address);
      expect(after).gt(before);
    });

    it("should succeed, when some CRV in contract", async () => {
      const holder = await ethers.getSigner(FRAXUSDC_HOLDER);
      const crvHolder = await ethers.getSigner(CRV_HOLDER);
      const token = await ethers.getContractAt("IERC20", FRAXUSDC, holder);
      const crv = await ethers.getContractAt("IERC20", CRV, crvHolder);
      const amount = ethers.utils.parseEther("50000");

      await proxy.connect(deployer).updateOperator(FRAXUSDC_GAUGE, operator.address);
      await token.transfer(proxy.address, amount);
      await proxy.connect(operator).deposit(FRAXUSDC_GAUGE, FRAXUSDC, amount);
      expect(await proxy.balanceOf(FRAXUSDC_GAUGE)).to.eq(amount);

      await crv.transfer(proxy.address, amount);
      expect(await crv.balanceOf(proxy.address)).to.eq(amount);
      const before = await crv.balanceOf(deployer.address);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      await proxy.connect(operator).claimCRV(FRAXUSDC_GAUGE, deployer.address);
      expect(await crv.balanceOf(proxy.address)).to.eq(amount);
      const after = await crv.balanceOf(deployer.address);
      expect(after).gt(before);
    });
  });

  context("claimGaugeRewards", async () => {
    it("should revert, when non operator call claimGaugeRewards", async () => {
      await expect(
        proxy.connect(operator).claimGaugeRewards(FRAXUSDC_GAUGE, [], constants.AddressZero)
      ).to.revertedWith("not operator");
    });

    it("should succeed, when claim for old gauge", async () => {
      const holder = await ethers.getSigner(STECRV_HOLDER);
      const token = await ethers.getContractAt("IERC20", STECRV, holder);
      const ldo = await ethers.getContractAt("IERC20", TOKENS.LDO.address, deployer);
      const amount = ethers.utils.parseEther("10000");

      await proxy.connect(deployer).updateOperator(STECRV_GAUGE, operator.address);
      await token.transfer(proxy.address, amount);
      await proxy.connect(operator).deposit(STECRV_GAUGE, STECRV, amount);
      expect(await proxy.balanceOf(STECRV_GAUGE)).to.eq(amount);

      const before = await ldo.balanceOf(deployer.address);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      await proxy.connect(operator).claimGaugeRewards(STECRV_GAUGE, [TOKENS.LDO.address], deployer.address);
      const after = await ldo.balanceOf(deployer.address);
      expect(after).gt(before);
      expect(await proxy.claimed(STECRV_GAUGE, TOKENS.LDO.address)).to.eq(constants.Zero);
    });

    it("should succeed, when claim for new gauge", async () => {
      const holder = await ethers.getSigner(LDOETH_HOLDER);
      const token = await ethers.getContractAt("IERC20", LDOETH, holder);
      const gauge = await ethers.getContractAt("ICurveGauge", LDOETH_GAUGE, deployer);
      const ldo = await ethers.getContractAt("IERC20", TOKENS.LDO.address, deployer);
      const amount = ethers.utils.parseEther("100");

      await proxy.connect(deployer).updateOperator(LDOETH_GAUGE, operator.address);
      await token.transfer(proxy.address, amount);
      await proxy.connect(operator).deposit(LDOETH_GAUGE, LDOETH, amount);
      expect(await proxy.balanceOf(LDOETH_GAUGE)).to.eq(amount);

      // first time claim
      let timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400]);
      let before = await ldo.balanceOf(deployer.address);
      await proxy.connect(operator).claimGaugeRewards(LDOETH_GAUGE, [TOKENS.LDO.address], deployer.address);
      let after = await ldo.balanceOf(deployer.address);
      expect(after).gt(before);
      const claimed1 = after.sub(before);
      expect(await proxy.claimed(LDOETH_GAUGE, TOKENS.LDO.address)).to.eq(claimed1);

      // second time claim for
      timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400]);
      before = await ldo.balanceOf(proxy.address);
      await gauge["claim_rewards(address)"](proxy.address);
      after = await ldo.balanceOf(proxy.address);
      expect(after).gt(before);
      before = await ldo.balanceOf(deployer.address);
      await proxy.connect(operator).claimGaugeRewards(LDOETH_GAUGE, [TOKENS.LDO.address], deployer.address);
      after = await ldo.balanceOf(deployer.address);
      expect(after).gt(before);
      expect(await proxy.claimed(LDOETH_GAUGE, TOKENS.LDO.address)).to.eq(after.sub(before).add(claimed1));
      expect(await ldo.balanceOf(proxy.address)).to.eq(constants.Zero);
    });
  });

  context("vecrv", async () => {
    beforeEach(async () => {
      const dao = await ethers.getSigner(CURVE_DAO);
      const checker = await ethers.getContractAt(
        "SmartWalletWhitelist",
        "0xca719728Ef172d0961768581fdF35CB116e0B7a4",
        dao
      );
      await checker.approveWallet(proxy.address);
    });

    context("createLock", async () => {
      it("should revert, when caller is not owner or locker", async () => {
        await expect(proxy.connect(operator).createLock(0, 0)).to.revertedWith("not owner or locker");
      });

      it("should succeed, when operator call", async () => {
        await proxy.updateLocker(operator.address);

        const holder = await ethers.getSigner(CRV_HOLDER);
        const crv = await ethers.getContractAt("IERC20", CRV, holder);
        const vecrv = await ethers.getContractAt("ICurveVoteEscrow", veCRV, holder);
        const amount = ethers.utils.parseEther("1000");

        await crv.transfer(proxy.address, amount);
        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        await proxy.connect(operator).createLock(amount, timestamp + 86400 * 14);
        expect((await vecrv.locked(proxy.address)).amount).to.eq(amount);
        expect((await vecrv.locked(proxy.address)).end).to.eq(
          Math.floor(timestamp / 86400 / 7) * 86400 * 7 + 86400 * 14
        );
      });

      it("should succeed, when owner call", async () => {
        const holder = await ethers.getSigner(CRV_HOLDER);
        const crv = await ethers.getContractAt("IERC20", CRV, holder);
        const vecrv = await ethers.getContractAt("ICurveVoteEscrow", veCRV, holder);
        const amount = ethers.utils.parseEther("1000");

        await crv.transfer(proxy.address, amount);
        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        await proxy.createLock(amount, timestamp + 86400 * 14);
        expect((await vecrv.locked(proxy.address)).amount).to.eq(amount);
        expect((await vecrv.locked(proxy.address)).end).to.eq(
          Math.floor(timestamp / 86400 / 7) * 86400 * 7 + 86400 * 14
        );
      });
    });

    context("increaseAmount", async () => {
      const initialAmount = ethers.utils.parseEther("1000");

      beforeEach(async () => {
        const holder = await ethers.getSigner(CRV_HOLDER);
        const crv = await ethers.getContractAt("IERC20", CRV, holder);
        const vecrv = await ethers.getContractAt("ICurveVoteEscrow", veCRV, holder);

        await crv.transfer(proxy.address, initialAmount);
        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        await proxy.createLock(initialAmount, timestamp + 86400 * 14);
        expect((await vecrv.locked(proxy.address)).amount).to.eq(initialAmount);
        expect((await vecrv.locked(proxy.address)).end).to.eq(
          Math.floor(timestamp / 86400 / 7) * 86400 * 7 + 86400 * 14
        );
      });

      it("should revert, when caller is not owner or locker", async () => {
        await expect(proxy.connect(operator).increaseAmount(0)).to.revertedWith("not owner or locker");
      });

      it("should succeed, when operator call", async () => {
        await proxy.updateLocker(operator.address);

        const holder = await ethers.getSigner(CRV_HOLDER);
        const crv = await ethers.getContractAt("IERC20", CRV, holder);
        const vecrv = await ethers.getContractAt("ICurveVoteEscrow", veCRV, holder);
        const amount = ethers.utils.parseEther("1000");

        await crv.transfer(proxy.address, amount);
        await proxy.connect(operator).increaseAmount(amount);
        expect((await vecrv.locked(proxy.address)).amount).to.eq(amount.add(initialAmount));
      });

      it("should succeed, when owner call", async () => {
        const holder = await ethers.getSigner(CRV_HOLDER);
        const crv = await ethers.getContractAt("IERC20", CRV, holder);
        const vecrv = await ethers.getContractAt("ICurveVoteEscrow", veCRV, holder);
        const amount = ethers.utils.parseEther("1000");

        await crv.transfer(proxy.address, amount);
        await proxy.increaseAmount(amount);
        expect((await vecrv.locked(proxy.address)).amount).to.eq(amount.add(initialAmount));
      });
    });

    context("increaseTime", async () => {
      const initialAmount = ethers.utils.parseEther("1000");

      beforeEach(async () => {
        const holder = await ethers.getSigner(CRV_HOLDER);
        const crv = await ethers.getContractAt("IERC20", CRV, holder);
        const vecrv = await ethers.getContractAt("ICurveVoteEscrow", veCRV, holder);

        await crv.transfer(proxy.address, initialAmount);
        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        await proxy.createLock(initialAmount, timestamp + 86400 * 14);
        expect((await vecrv.locked(proxy.address)).amount).to.eq(initialAmount);
        expect((await vecrv.locked(proxy.address)).end).to.eq(
          Math.floor(timestamp / 86400 / 7) * 86400 * 7 + 86400 * 14
        );
      });

      it("should revert, when caller is not owner or locker", async () => {
        await expect(proxy.connect(operator).increaseTime(0)).to.revertedWith("not owner or locker");
      });

      it("should succeed, when operator call", async () => {
        await proxy.updateLocker(operator.address);
        const vecrv = await ethers.getContractAt("ICurveVoteEscrow", veCRV, deployer);

        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        await proxy.connect(operator).increaseTime(timestamp + 86400 * 21);
        expect((await vecrv.locked(proxy.address)).end).to.eq(
          Math.floor(timestamp / 86400 / 7) * 86400 * 7 + 86400 * 21
        );
      });

      it("should succeed, when owner call", async () => {
        await proxy.updateLocker(operator.address);
        const vecrv = await ethers.getContractAt("ICurveVoteEscrow", veCRV, deployer);

        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        await proxy.increaseTime(timestamp + 86400 * 21);
        expect((await vecrv.locked(proxy.address)).end).to.eq(
          Math.floor(timestamp / 86400 / 7) * 86400 * 7 + 86400 * 21
        );
      });
    });

    context("release", async () => {
      const initialAmount = ethers.utils.parseEther("1000");

      beforeEach(async () => {
        const holder = await ethers.getSigner(CRV_HOLDER);
        const crv = await ethers.getContractAt("IERC20", CRV, holder);
        const vecrv = await ethers.getContractAt("ICurveVoteEscrow", veCRV, holder);

        await crv.transfer(proxy.address, initialAmount);
        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        await proxy.createLock(initialAmount, timestamp + 86400 * 14);
        expect((await vecrv.locked(proxy.address)).amount).to.eq(initialAmount);
        expect((await vecrv.locked(proxy.address)).end).to.eq(
          Math.floor(timestamp / 86400 / 7) * 86400 * 7 + 86400 * 14
        );
      });

      it("should revert, when caller is not owner or locker", async () => {
        await expect(proxy.connect(operator).release()).to.revertedWith("not owner or locker");
      });

      it("should succeed, when operator call", async () => {
        await proxy.updateLocker(operator.address);
        const vecrv = await ethers.getContractAt("ICurveVoteEscrow", veCRV, deployer);
        const crv = await ethers.getContractAt("IERC20", CRV, deployer);

        const timestamp = (await vecrv.locked(proxy.address)).end;
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp.toNumber()]);
        expect(await crv.balanceOf(proxy.address)).to.eq(constants.Zero);
        await proxy.connect(operator).release();
        expect(await crv.balanceOf(proxy.address)).to.eq(initialAmount);
      });

      it("should succeed, when owner call", async () => {
        await proxy.updateLocker(operator.address);
        const vecrv = await ethers.getContractAt("ICurveVoteEscrow", veCRV, deployer);
        const crv = await ethers.getContractAt("IERC20", CRV, deployer);

        const timestamp = (await vecrv.locked(proxy.address)).end;
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp.toNumber()]);
        expect(await crv.balanceOf(proxy.address)).to.eq(constants.Zero);
        await proxy.release();
        expect(await crv.balanceOf(proxy.address)).to.eq(initialAmount);
      });
    });

    context("voteGaugeWeight", async () => {
      const initialAmount = ethers.utils.parseEther("1000");

      beforeEach(async () => {
        const holder = await ethers.getSigner(CRV_HOLDER);
        const crv = await ethers.getContractAt("IERC20", CRV, holder);
        const vecrv = await ethers.getContractAt("ICurveVoteEscrow", veCRV, holder);

        await crv.transfer(proxy.address, initialAmount);
        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        await proxy.createLock(initialAmount, timestamp + 86400 * 364);
        expect((await vecrv.locked(proxy.address)).amount).to.eq(initialAmount);
        expect((await vecrv.locked(proxy.address)).end).to.eq(
          Math.floor(timestamp / 86400 / 7) * 86400 * 7 + 86400 * 364
        );

        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 14]);
        await network.provider.send("evm_mine");
      });

      it("should revert, when caller is not voter", async () => {
        await expect(proxy.connect(operator).voteGaugeWeight(FRAXUSDC_GAUGE, 100)).to.revertedWith("not voter");
      });

      it("should succeed", async () => {
        await proxy.updateVoter(operator.address);
        await proxy.connect(operator).voteGaugeWeight(FRAXUSDC_GAUGE, 100);
      });
    });

    context("vote", async () => {
      const initialAmount = ethers.utils.parseEther("1000");

      beforeEach(async () => {
        const holder = await ethers.getSigner(CRV_HOLDER);
        const crv = await ethers.getContractAt("IERC20", CRV, holder);
        const vecrv = await ethers.getContractAt("ICurveVoteEscrow", veCRV, holder);

        await crv.transfer(proxy.address, initialAmount);
        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        await proxy.createLock(initialAmount, timestamp + 86400 * 364);
        expect((await vecrv.locked(proxy.address)).amount).to.eq(initialAmount);
        expect((await vecrv.locked(proxy.address)).end).to.eq(
          Math.floor(timestamp / 86400 / 7) * 86400 * 7 + 86400 * 364
        );
      });

      it("should revert, when caller is not voter", async () => {
        await expect(
          proxy.connect(operator).vote(264, "0xe478de485ad2fe566d49342cbd03e49ed7db3356", true)
        ).to.revertedWith("not voter");
      });
    });

    context("claimFees", async () => {
      const initialAmount = ethers.utils.parseEther("100000");
      let distributor: ICurveFeeDistributor;

      beforeEach(async () => {
        const holder = await ethers.getSigner(CRV_HOLDER);
        const crv = await ethers.getContractAt("IERC20", CRV, holder);
        distributor = await ethers.getContractAt(
          "ICurveFeeDistributor",
          "0xA464e6DCda8AC41e03616F95f4BC98a13b8922Dc",
          deployer
        );

        await crv.transfer(proxy.address, initialAmount);
        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        await proxy.createLock(initialAmount, timestamp + 86400 * 365 * 4);
      });

      it("should revert, when caller is not locker", async () => {
        await expect(
          proxy.connect(operator).claimFees(distributor.address, THREE_CRV, deployer.address)
        ).to.revertedWith("not locker");
      });

      it("should succeed, when claim by self", async () => {
        const holder = await ethers.getSigner(THREE_CRV_HOLDER);
        const token = await ethers.getContractAt("IERC20", THREE_CRV, holder);
        const amount = ethers.utils.parseEther("1000");
        await proxy.updateLocker(operator.address);

        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
        await network.provider.send("evm_mine");
        await token.transfer(distributor.address, amount);

        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7 * 2]);
        await network.provider.send("evm_mine");

        const before = await token.balanceOf(deployer.address);
        await proxy.connect(operator).claimFees(distributor.address, THREE_CRV, deployer.address);
        const after = await token.balanceOf(deployer.address);
        expect(after).gt(before);
      });

      it("should succeed, when claim by other", async () => {
        const holder = await ethers.getSigner(THREE_CRV_HOLDER);
        const token = await ethers.getContractAt("IERC20", THREE_CRV, holder);
        const amount = ethers.utils.parseEther("1000");
        await proxy.updateLocker(operator.address);

        const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
        await network.provider.send("evm_mine");
        await token.transfer(distributor.address, amount);

        await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7 * 2]);
        await network.provider.send("evm_mine");

        await distributor["claim(address)"](proxy.address);
        const claimed = await token.balanceOf(proxy.address);
        expect(claimed).to.gt(constants.Zero);

        const before = await token.balanceOf(deployer.address);
        await proxy.connect(operator).claimFees(distributor.address, THREE_CRV, deployer.address);
        const after = await token.balanceOf(deployer.address);
        expect(after.sub(before)).to.eq(claimed);
      });
    });
  });

  context("execute", async () => {
    it("should revert, when non-executor call execute", async () => {
      await expect(proxy.connect(operator).execute(constants.AddressZero, 0, [])).to.revertedWith("not executor");
    });

    it("should succeed, when executor call", async () => {
      await proxy.updateExecutor(operator.address, true);
      const token = await ethers.getContractAt("MockERC20", CRV, deployer);

      const [status, result] = await proxy
        .connect(operator)
        .callStatic.execute(token.address, 0, token.interface.encodeFunctionData("decimals"));
      await proxy.connect(operator).execute(token.address, 0, token.interface.encodeFunctionData("decimals"));
      expect(status).to.eq(true);
      const [decimal] = ethers.utils.defaultAbiCoder.decode(["uint256"], result);
      expect(decimal).to.eq(BigNumber.from("18"));
    });
  });
});

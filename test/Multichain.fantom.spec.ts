/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IERC20, Layer2CRVDepositor, FantomCRVDepositor } from "../typechain";
import { CrossChainCallProxy } from "../typechain/CrossChainCallProxy";
import { IAnyCallProxy } from "../typechain/IAnyCallProxy";
import { IAnyswapRouter } from "../typechain/IAnyswapRouter";
import { request_fork } from "./utils";

const FORK_BLOCK_NUMBER = 36980537;
const CRV = "0x1E4F97b9f9F913c46F1632781732927B9019C68b";
const CRV_HOLDER = "0xBdcF8597B9Bd00E6E3D92F0a51B732985d4a063C";
const DEPLOYER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const aCRV = "0x666a3776b3e82F171CB1dFF7428B6808D2Cd7d02";
const aCRV_HOLDER = "0x40A8007297466ec52b96a05082Baeb3B9166e11C";
const ANYCALL_PROXY = "0x37414a8662bC1D25be3ee51Fb27C2686e2490A89";
const ANYCALL_MPC = "0x7FF2C8Fd909A0F0EaB4611343A2197083c524734";
const ANYSWAP_ROUTER_V4 = "0xb576C9403f39829565BD6051695E2AC7Ecf850E2";
const ANYSWAP_ROUTER_V4_MPC = "0x647dC1366Da28f8A64EB831fC8E9F05C90d1EA5a";

describe("Multichain.ploygon.spec", async () => {
  let deployer: SignerWithAddress;
  let anycallMpc: SignerWithAddress;
  let routerMpc: SignerWithAddress;
  let signerCRV: SignerWithAddress;
  let signerACRV: SignerWithAddress;
  let acrv: IERC20;
  let anycall: IAnyCallProxy;
  let crv: IERC20;
  let router: IAnyswapRouter;
  let crossChainCallProxy: CrossChainCallProxy;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, aCRV_HOLDER, CRV_HOLDER, ANYCALL_MPC, ANYSWAP_ROUTER_V4_MPC], "fantom");
    deployer = await ethers.getSigner(DEPLOYER);
    anycallMpc = await ethers.getSigner(ANYCALL_MPC);
    routerMpc = await ethers.getSigner(ANYSWAP_ROUTER_V4_MPC);
    signerCRV = await ethers.getSigner(CRV_HOLDER);
    signerACRV = await ethers.getSigner(aCRV_HOLDER);

    await deployer.sendTransaction({ to: anycallMpc.address, value: ethers.utils.parseEther("100") });
    await deployer.sendTransaction({ to: routerMpc.address, value: ethers.utils.parseEther("100") });
    await deployer.sendTransaction({ to: signerCRV.address, value: ethers.utils.parseEther("100") });

    acrv = await ethers.getContractAt("IERC20", aCRV, signerACRV);
    crv = await ethers.getContractAt("IERC20", CRV, signerCRV);
    anycall = (await ethers.getContractAt("IAnyCallProxy", ANYCALL_PROXY, anycallMpc)) as IAnyCallProxy;
    router = (await ethers.getContractAt("IAnyswapRouter", ANYSWAP_ROUTER_V4, routerMpc)) as IAnyswapRouter;

    const CrossChainCallProxy = await ethers.getContractFactory("CrossChainCallProxy", deployer);
    crossChainCallProxy = (await CrossChainCallProxy.deploy(anycall.address)) as CrossChainCallProxy;
    await crossChainCallProxy.deployed();
  });

  context("CrossChainCallProxy", async () => {
    let alice: SignerWithAddress;
    beforeEach(async () => {
      [alice] = await ethers.getSigners();
    });

    it("should revert, when non-owner withdraw fund", async () => {
      await expect(crossChainCallProxy.connect(alice).withdraw(0)).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert, when non-owner update anycall proxy", async () => {
      await expect(crossChainCallProxy.connect(alice).updateAnyCallProxy(anycall.address)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when non-owner update whitelist", async () => {
      await expect(crossChainCallProxy.connect(alice).updateWhitelist([], true)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when non-owner execute", async () => {
      await expect(crossChainCallProxy.connect(alice).execute(constants.AddressZero, 0, [])).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should succeed, when owner withdraw fund", async () => {
      await anycall.connect(deployer).deposit(crossChainCallProxy.address, { value: ethers.utils.parseEther("1") });
      const balanceBefore = await deployer.getBalance();
      const tx = await crossChainCallProxy.withdraw(ethers.utils.parseEther("1"));
      const receipt = await tx.wait();
      const balanceAfter = await deployer.getBalance();
      expect(balanceAfter.sub(balanceBefore).add(receipt.gasUsed.mul(receipt.effectiveGasPrice))).to.eq(
        ethers.utils.parseEther("1")
      );
    });

    it("should revert, when owner update anycall proxy to zero", async () => {
      await expect(crossChainCallProxy.updateAnyCallProxy(constants.AddressZero)).to.revertedWith(
        "CrossChainCallProxy: zero address"
      );
    });

    it("should succeed, when owner update anycall proxy", async () => {
      expect(await crossChainCallProxy.anyCallProxy()).to.eq(anycall.address);
      await expect(crossChainCallProxy.updateAnyCallProxy(router.address))
        .to.emit(crossChainCallProxy, "UpdateAnyCallProxy")
        .withArgs(router.address);
      expect(await crossChainCallProxy.anyCallProxy()).to.eq(router.address);
    });

    it("should succeed, when owner update whitelist", async () => {
      expect(await crossChainCallProxy.whitelist(deployer.address)).to.eq(false);
      await expect(crossChainCallProxy.updateWhitelist([deployer.address], true))
        .to.emit(crossChainCallProxy, "UpdateWhitelist")
        .withArgs(deployer.address, true);
      expect(await crossChainCallProxy.whitelist(deployer.address)).to.eq(true);
      await expect(crossChainCallProxy.updateWhitelist([deployer.address], false))
        .to.emit(crossChainCallProxy, "UpdateWhitelist")
        .withArgs(deployer.address, false);
      expect(await crossChainCallProxy.whitelist(deployer.address)).to.eq(false);
    });

    it("should succeed, when owner execute", async () => {
      await deployer.sendTransaction({ to: crossChainCallProxy.address, value: ethers.utils.parseEther("1") });
      const balanceBefore = await alice.getBalance();
      await crossChainCallProxy.execute(alice.address, ethers.utils.parseEther("1"), []);
      const balanceAfter = await alice.getBalance();
      expect(balanceAfter.sub(balanceBefore)).to.eq(ethers.utils.parseEther("1"));
    });

    it("should revert, when non-whitelist call", async () => {
      await expect(
        crossChainCallProxy
          .connect(alice)
          .crossChainCall(
            crv.address,
            crv.interface.encodeFunctionData("balanceOf", [deployer.address]),
            deployer.address,
            2
          )
      ).to.revertedWith("CrossChainCallProxy: only whitelist");
    });

    it("should succeed, when whitelist call", async () => {
      await anycall.setWhitelist(crossChainCallProxy.address, crv.address, 2, true);
      await crossChainCallProxy.updateWhitelist([alice.address], true);
      await crossChainCallProxy
        .connect(alice)
        .crossChainCall(
          crv.address,
          crv.interface.encodeFunctionData("balanceOf", [deployer.address]),
          deployer.address,
          2
        );
    });
  });

  context("Layer2CRVDepositor", async () => {
    let alice: SignerWithAddress;
    let layer1: SignerWithAddress;
    let depositor: Layer2CRVDepositor;

    beforeEach(async () => {
      [alice, layer1] = await ethers.getSigners();

      const Layer2CRVDepositor = await ethers.getContractFactory("Layer2CRVDepositor", deployer);
      depositor = await Layer2CRVDepositor.deploy();
      await depositor.initialize(
        anycall.address,
        router.address,
        crossChainCallProxy.address,
        deployer.address,
        crv.address,
        acrv.address,
        layer1.address
      );
    });

    it("should revert, when non-owner update anycall proxy", async () => {
      await expect(depositor.connect(alice).updateAnyCallProxy(anycall.address)).to.revertedWith(
        "CrossChainCallBase: only owner"
      );
    });

    it("should revert, when non-owner update cross chain call proxy", async () => {
      await expect(depositor.connect(alice).updateCrossChainCallProxy(anycall.address)).to.revertedWith(
        "CrossChainCallBase: only owner"
      );
    });

    it("should revert, when non-owner transfer ownership", async () => {
      await expect(depositor.connect(alice).transferOwnership(anycall.address)).to.revertedWith(
        "CrossChainCallBase: only owner"
      );
    });

    it("should revert, when non-owner execute", async () => {
      await expect(depositor.connect(alice).execute(constants.AddressZero, 0, [])).to.revertedWith(
        "CrossChainCallBase: only owner"
      );
    });

    it("should succeed, when owner update anycall proxy to zero", async () => {
      await expect(depositor.updateAnyCallProxy(constants.AddressZero)).to.revertedWith(
        "CrossChainCallBase: zero address"
      );
    });

    it("should succeed, when owner update anycall proxy", async () => {
      expect(await depositor.anyCallProxy()).to.eq(anycall.address);
      await expect(depositor.updateAnyCallProxy(deployer.address))
        .to.emit(depositor, "UpdateAnyCallProxy")
        .withArgs(deployer.address);
      expect(await depositor.anyCallProxy()).to.eq(deployer.address);
    });

    it("should revert, when owner update cross chain call proxy to zero", async () => {
      await expect(depositor.updateCrossChainCallProxy(constants.AddressZero)).to.revertedWith(
        "CrossChainCallBase: zero address"
      );
    });

    it("should revert, when owner update cross chain call proxy", async () => {
      expect(await depositor.crossChainCallProxy()).to.eq(crossChainCallProxy.address);
      await expect(depositor.updateCrossChainCallProxy(deployer.address))
        .to.emit(depositor, "UpdateCrossChainCallProxy")
        .withArgs(deployer.address);
      expect(await depositor.crossChainCallProxy()).to.eq(deployer.address);
    });

    it("should revert, when owner transfer ownership to zero", async () => {
      await expect(depositor.transferOwnership(constants.AddressZero)).to.revertedWith(
        "CrossChainCallBase: zero address"
      );
    });

    it("should succeed, when owner transfer ownership", async () => {
      expect(await depositor.owner()).to.eq(deployer.address);
      await expect(depositor.transferOwnership(alice.address))
        .to.emit(depositor, "OwnershipTransferred")
        .withArgs(deployer.address, alice.address);
      expect(await depositor.owner()).to.eq(alice.address);
    });

    it("should succeed, when owner execute", async () => {
      await deployer.sendTransaction({ to: depositor.address, value: ethers.utils.parseEther("1") });
      const balanceBefore = await alice.getBalance();
      await depositor.execute(alice.address, ethers.utils.parseEther("1"), []);
      const balanceAfter = await alice.getBalance();
      expect(balanceAfter.sub(balanceBefore)).to.eq(ethers.utils.parseEther("1"));
    });

    it("should revert, when non-owner update anyswap router", async () => {
      await expect(depositor.connect(alice).updateAnyswapRouter(anycall.address)).to.revertedWith(
        "CrossChainCallBase: only owner"
      );
    });

    it("should revert, when owner update anyswap router to zero", async () => {
      await expect(depositor.updateAnyswapRouter(constants.AddressZero)).to.revertedWith(
        "Layer2CRVDepositor: zero address"
      );
    });

    it("should succeed, when owner update anyswap router", async () => {
      expect(await depositor.anyswapRouter()).to.eq(router.address);
      await expect(depositor.updateAnyswapRouter(deployer.address))
        .to.emit(depositor, "UpdateAnyswapRouter")
        .withArgs(deployer.address);
      expect(await depositor.anyswapRouter()).to.eq(deployer.address);
    });

    it("should revert, when non-owner update cross chain info", async () => {
      await expect(
        depositor.connect(alice).updateCrossChainInfo(anycall.address, {
          feePercentage: 0,
          minCrossChainFee: 0,
          maxCrossChainFee: 0,
          minCrossChainAmount: 0,
          maxCrossChainAmount: 0,
        })
      ).to.revertedWith("CrossChainCallBase: only owner");
    });

    it("should revert, when owner update invalid cross chain info", async () => {
      await expect(
        depositor.updateCrossChainInfo(anycall.address, {
          feePercentage: 0,
          minCrossChainFee: 0,
          maxCrossChainFee: 0,
          minCrossChainAmount: 0,
          maxCrossChainAmount: 0,
        })
      ).to.revertedWith("Layer2CRVDepositor: invalid token");
      await expect(
        depositor.updateCrossChainInfo(crv.address, {
          feePercentage: BigNumber.from("1000000001"),
          minCrossChainFee: 0,
          maxCrossChainFee: 0,
          minCrossChainAmount: 0,
          maxCrossChainAmount: 0,
        })
      ).to.revertedWith("Layer2CRVDepositor: fee percentage too large");
      await expect(
        depositor.updateCrossChainInfo(crv.address, {
          feePercentage: 0,
          minCrossChainFee: 1,
          maxCrossChainFee: 0,
          minCrossChainAmount: 0,
          maxCrossChainAmount: 0,
        })
      ).to.revertedWith("Layer2CRVDepositor: invalid cross chain fee");
      await expect(
        depositor.updateCrossChainInfo(crv.address, {
          feePercentage: 0,
          minCrossChainFee: 0,
          maxCrossChainFee: 0,
          minCrossChainAmount: 1,
          maxCrossChainAmount: 0,
        })
      ).to.revertedWith("Layer2CRVDepositor: invalid cross chain amount");
    });

    it("should succeed, when owner update cross chain info", async () => {
      await depositor.updateCrossChainInfo(crv.address, {
        feePercentage: ethers.utils.parseUnits("0.001", 9),
        minCrossChainFee: 1,
        maxCrossChainFee: 2,
        minCrossChainAmount: 3,
        maxCrossChainAmount: 4,
      });
      expect(await depositor.CRVCrossChainInfo()).to.deep.eq([
        1000000,
        BigNumber.from(1),
        BigNumber.from(2),
        BigNumber.from(3),
        BigNumber.from(4),
      ]);
      await depositor.updateCrossChainInfo(acrv.address, {
        feePercentage: ethers.utils.parseUnits("0.002", 9),
        minCrossChainFee: 5,
        maxCrossChainFee: 6,
        minCrossChainAmount: 7,
        maxCrossChainAmount: 8,
      });
      expect(await depositor.aCRVCrossChainInfo()).to.deep.eq([
        2000000,
        BigNumber.from(5),
        BigNumber.from(6),
        BigNumber.from(7),
        BigNumber.from(8),
      ]);
    });

    it("should revert, when non-owner update layer1 proxy", async () => {
      await expect(depositor.connect(alice).updateLayer1Proxy(anycall.address)).to.revertedWith(
        "CrossChainCallBase: only owner"
      );
    });

    it("should revert, when non-owner update whitelist", async () => {
      await expect(depositor.connect(alice).updateWhitelist([anycall.address], true)).to.revertedWith(
        "CrossChainCallBase: only owner"
      );
    });

    it("should revert, when non-owner update fee data", async () => {
      await expect(depositor.connect(alice).updateFeeData(anycall.address, 0, 0)).to.revertedWith(
        "CrossChainCallBase: only owner"
      );
    });

    it("should revert, when owner update layer1 proxy to zero", async () => {
      await expect(depositor.updateLayer1Proxy(constants.AddressZero)).to.revertedWith(
        "Layer2CRVDepositor: zero address"
      );
    });

    it("should succeed, when owner update layer1 proxy", async () => {
      expect(await depositor.layer1Proxy()).to.eq(layer1.address);
      await expect(depositor.updateLayer1Proxy(deployer.address))
        .to.emit(depositor, "UpdateLayer1Proxy")
        .withArgs(deployer.address);
      expect(await depositor.layer1Proxy()).to.eq(deployer.address);
    });

    it("should succeed, when owner update whitelist", async () => {
      expect(await depositor.whitelist(deployer.address)).to.eq(false);
      await expect(depositor.updateWhitelist([deployer.address], true))
        .to.emit(depositor, "UpdateWhitelist")
        .withArgs(deployer.address, true);
      expect(await depositor.whitelist(deployer.address)).to.eq(true);
      await expect(depositor.updateWhitelist([deployer.address], false))
        .to.emit(depositor, "UpdateWhitelist")
        .withArgs(deployer.address, false);
      expect(await depositor.whitelist(deployer.address)).to.eq(false);
    });

    it("should revert, when owner update invalid fee data", async () => {
      await expect(depositor.updateFeeData(constants.AddressZero, 1, 1)).to.revertedWith(
        "Layer2CRVDepositor: zero address"
      );
      await expect(depositor.updateFeeData(deployer.address, 1e8 + 1, 1)).to.revertedWith(
        "Layer2CRVDepositor: fee too large"
      );
      await expect(depositor.updateFeeData(deployer.address, 1, 1e8 + 1)).to.revertedWith(
        "Layer2CRVDepositor: fee too large"
      );
    });

    it("should succeed, when owner update fee data", async () => {
      expect(await depositor.fees()).to.deep.eq([constants.AddressZero, 0, 0]);
      await expect(depositor.updateFeeData(deployer.address, 10, 20))
        .to.emit(depositor, "UpdateFeeData")
        .withArgs(deployer.address, 10, 20);
      expect(await depositor.fees()).to.deep.eq([deployer.address, 10, 20]);
    });

    context("deposit", async () => {
      it("should revert, when deposit zero", async () => {
        await expect(depositor.connect(signerCRV).deposit(0)).to.revertedWith(
          "Layer2CRVDepositor: deposit zero amount"
        );
      });

      it("should succeed, when deposit", async () => {
        await crv.connect(signerCRV).approve(depositor.address, constants.MaxUint256);
        await expect(depositor.connect(signerCRV).deposit(ethers.utils.parseEther("1")))
          .to.emit(depositor, "Deposit")
          .withArgs(signerCRV.address, 0, ethers.utils.parseEther("1"));
        expect(await depositor.depositOperation()).to.deep.eq([ethers.utils.parseEther("1"), constants.Zero, 0]);
        expect(await depositor.abortable(signerCRV.address)).to.deep.eq([constants.Zero, ethers.utils.parseEther("1")]);
      });

      it("should succeed, when deposit 2 times", async () => {
        await crv.connect(signerCRV).approve(depositor.address, constants.MaxUint256);
        await expect(depositor.connect(signerCRV).deposit(ethers.utils.parseEther("1")))
          .to.emit(depositor, "Deposit")
          .withArgs(signerCRV.address, 0, ethers.utils.parseEther("1"));
        expect(await depositor.depositOperation()).to.deep.eq([ethers.utils.parseEther("1"), constants.Zero, 0]);
        expect(await depositor.abortable(signerCRV.address)).to.deep.eq([constants.Zero, ethers.utils.parseEther("1")]);
        await expect(depositor.connect(signerCRV).deposit(ethers.utils.parseEther("1")))
          .to.emit(depositor, "Deposit")
          .withArgs(signerCRV.address, 0, ethers.utils.parseEther("1"));
        expect(await depositor.depositOperation()).to.deep.eq([ethers.utils.parseEther("2"), constants.Zero, 0]);
        expect(await depositor.abortable(signerCRV.address)).to.deep.eq([constants.Zero, ethers.utils.parseEther("2")]);
      });
    });

    context("abort deposit", async () => {
      beforeEach(async () => {
        await depositor.updateWhitelist([deployer.address], true);
        await crv.connect(signerCRV).approve(depositor.address, constants.MaxUint256);
        await expect(depositor.connect(signerCRV).deposit(ethers.utils.parseEther("100")))
          .to.emit(depositor, "Deposit")
          .withArgs(signerCRV.address, 0, ethers.utils.parseEther("100"));
        expect(await depositor.depositOperation()).to.deep.eq([ethers.utils.parseEther("100"), constants.Zero, 0]);
        expect(await depositor.abortable(signerCRV.address)).to.deep.eq([
          constants.Zero,
          ethers.utils.parseEther("100"),
        ]);
        await depositor.updateFeeData(alice.address, 1000000, 1000000);
      });

      it("should revert, when abort zero", async () => {
        await expect(depositor.connect(signerCRV).abortDeposit(0)).to.revertedWith(
          "Layer2CRVDepositor: abort zero amount"
        );
      });

      it("should revert, when amount insufficient", async () => {
        await expect(depositor.connect(signerCRV).abortDeposit(ethers.utils.parseEther("100").add(1))).to.revertedWith(
          "Layer2CRVDepositor: insufficient amount to abort"
        );
      });

      it("should succeed, when abort 40%", async () => {
        const balanceBefore = await crv.balanceOf(signerCRV.address);
        await expect(depositor.connect(signerCRV).abortDeposit(ethers.utils.parseEther("40")))
          .to.emit(depositor, "AbortDeposit")
          .withArgs(signerCRV.address, 0, ethers.utils.parseEther("40"));
        const balanceAfter = await crv.balanceOf(signerCRV.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(ethers.utils.parseEther("40"));
        expect(await depositor.depositOperation()).to.deep.eq([ethers.utils.parseEther("60"), constants.Zero, 0]);
        expect(await depositor.abortable(signerCRV.address)).to.deep.eq([
          constants.Zero,
          ethers.utils.parseEther("60"),
        ]);
      });

      it("should succeed, when abort 100%", async () => {
        const balanceBefore = await crv.balanceOf(signerCRV.address);
        await expect(depositor.connect(signerCRV).abortDeposit(ethers.utils.parseEther("100")))
          .to.emit(depositor, "AbortDeposit")
          .withArgs(signerCRV.address, 0, ethers.utils.parseEther("100"));
        const balanceAfter = await crv.balanceOf(signerCRV.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(ethers.utils.parseEther("100"));
        expect(await depositor.depositOperation()).to.deep.eq([ethers.utils.parseEther("0"), constants.Zero, 0]);
        expect(await depositor.abortable(signerCRV.address)).to.deep.eq([constants.Zero, constants.Zero]);
      });

      it("should succeed, when abort pending with ongoing exists", async () => {
        await depositor.prepareAsyncDeposit();
        expect(await depositor.depositOperation()).to.deep.eq([constants.Zero, ethers.utils.parseEther("100"), 0]);
        expect(await depositor.abortable(signerCRV.address)).to.deep.eq([constants.Zero, constants.Zero]);

        await expect(depositor.connect(signerCRV).deposit(ethers.utils.parseEther("200")))
          .to.emit(depositor, "Deposit")
          .withArgs(signerCRV.address, 1, ethers.utils.parseEther("200"));
        expect(await depositor.depositOperation()).to.deep.eq([
          ethers.utils.parseEther("200"),
          ethers.utils.parseEther("100"),
          0,
        ]);
        expect(await depositor.abortable(signerCRV.address)).to.deep.eq([
          constants.Zero,
          ethers.utils.parseEther("200"),
        ]);

        const balanceBefore = await crv.balanceOf(signerCRV.address);
        await expect(depositor.connect(signerCRV).abortDeposit(ethers.utils.parseEther("150")))
          .to.emit(depositor, "AbortDeposit")
          .withArgs(signerCRV.address, 1, ethers.utils.parseEther("150"));
        const balanceAfter = await crv.balanceOf(signerCRV.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(ethers.utils.parseEther("150"));
        expect(await depositor.depositOperation()).to.deep.eq([
          ethers.utils.parseEther("50"),
          ethers.utils.parseEther("100"),
          0,
        ]);
        expect(await depositor.abortable(signerCRV.address)).to.deep.eq([
          constants.Zero,
          ethers.utils.parseEther("50"),
        ]);
      });
    });

    context("redeem", async () => {
      it("should revert, when redeem zero", async () => {
        await expect(depositor.connect(signerACRV).redeem(0)).to.revertedWith("Layer2CRVDepositor: redeem zero amount");
      });

      it("should succeed, when redeem", async () => {
        await acrv.connect(signerACRV).approve(depositor.address, constants.MaxUint256);
        await expect(depositor.connect(signerACRV).redeem(ethers.utils.parseEther("1")))
          .to.emit(depositor, "Redeem")
          .withArgs(signerACRV.address, 0, ethers.utils.parseEther("1"));
        expect(await depositor.redeemOperation()).to.deep.eq([ethers.utils.parseEther("1"), constants.Zero, 0]);
        expect(await depositor.abortable(signerACRV.address)).to.deep.eq([
          ethers.utils.parseEther("1"),
          constants.Zero,
        ]);
      });

      it("should succeed, when redeem 2 times", async () => {
        await acrv.connect(signerACRV).approve(depositor.address, constants.MaxUint256);
        await expect(depositor.connect(signerACRV).redeem(ethers.utils.parseEther("1")))
          .to.emit(depositor, "Redeem")
          .withArgs(signerACRV.address, 0, ethers.utils.parseEther("1"));
        expect(await depositor.redeemOperation()).to.deep.eq([ethers.utils.parseEther("1"), constants.Zero, 0]);
        expect(await depositor.abortable(signerACRV.address)).to.deep.eq([
          ethers.utils.parseEther("1"),
          constants.Zero,
        ]);
        await expect(depositor.connect(signerACRV).redeem(ethers.utils.parseEther("1")))
          .to.emit(depositor, "Redeem")
          .withArgs(signerACRV.address, 0, ethers.utils.parseEther("1"));
        expect(await depositor.redeemOperation()).to.deep.eq([ethers.utils.parseEther("2"), constants.Zero, 0]);
        expect(await depositor.abortable(signerACRV.address)).to.deep.eq([
          ethers.utils.parseEther("2"),
          constants.Zero,
        ]);
      });
    });

    context("abort redeem", async () => {
      const acrvAmount = ethers.utils.parseEther("50");
      const acrvAmount40 = ethers.utils.parseEther("50").mul(4).div(10);
      const acrvAmount60 = ethers.utils.parseEther("50").mul(6).div(10);

      beforeEach(async () => {
        await depositor.updateWhitelist([deployer.address], true);
        await acrv.connect(signerACRV).approve(depositor.address, constants.MaxUint256);
        await expect(depositor.connect(signerACRV).redeem(acrvAmount))
          .to.emit(depositor, "Redeem")
          .withArgs(signerACRV.address, 0, acrvAmount);
        expect(await depositor.redeemOperation()).to.deep.eq([acrvAmount, constants.Zero, 0]);
        expect(await depositor.abortable(signerACRV.address)).to.deep.eq([acrvAmount, constants.Zero]);
        await depositor.updateFeeData(alice.address, 1000000, 1000000);
        await depositor.updateCrossChainInfo(acrv.address, {
          feePercentage: 1000000,
          minCrossChainFee: 0,
          maxCrossChainFee: 0,
          minCrossChainAmount: ethers.utils.parseEther("0"),
          maxCrossChainAmount: ethers.utils.parseEther("10000"),
        });
      });

      it("should revert, when abort zero", async () => {
        await expect(depositor.connect(signerACRV).abortRedeem(0)).to.revertedWith(
          "Layer2CRVDepositor: abort zero amount"
        );
      });

      it("should revert, when amount insufficient", async () => {
        await expect(depositor.connect(signerACRV).abortRedeem(acrvAmount.add(1))).to.revertedWith(
          "Layer2CRVDepositor: insufficient amount to abort"
        );
      });

      it("should succeed, when abort 40%", async () => {
        const balanceBefore = await acrv.balanceOf(signerACRV.address);
        await expect(depositor.connect(signerACRV).abortRedeem(acrvAmount40))
          .to.emit(depositor, "AbortRedeem")
          .withArgs(signerACRV.address, 0, acrvAmount40);
        const balanceAfter = await acrv.balanceOf(signerACRV.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(acrvAmount40);
        expect(await depositor.redeemOperation()).to.deep.eq([acrvAmount60, constants.Zero, 0]);
        expect(await depositor.abortable(signerACRV.address)).to.deep.eq([acrvAmount60, constants.Zero]);
      });

      it("should succeed, when abort 100%", async () => {
        const balanceBefore = await acrv.balanceOf(signerACRV.address);
        await expect(depositor.connect(signerACRV).abortRedeem(acrvAmount))
          .to.emit(depositor, "AbortRedeem")
          .withArgs(signerACRV.address, 0, acrvAmount);
        const balanceAfter = await acrv.balanceOf(signerACRV.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(acrvAmount);
        expect(await depositor.redeemOperation()).to.deep.eq([ethers.utils.parseEther("0"), constants.Zero, 0]);
        expect(await depositor.abortable(signerACRV.address)).to.deep.eq([constants.Zero, constants.Zero]);
      });

      it("should succeed, when abort pending with ongoing exists", async () => {
        const newACRVAmount = ethers.utils.parseEther("2");
        await depositor.prepareAsyncRedeem();
        expect(await depositor.redeemOperation()).to.deep.eq([constants.Zero, acrvAmount, 0]);
        expect(await depositor.abortable(signerACRV.address)).to.deep.eq([constants.Zero, constants.Zero]);

        await expect(depositor.connect(signerACRV).redeem(newACRVAmount))
          .to.emit(depositor, "Redeem")
          .withArgs(signerACRV.address, 1, newACRVAmount);
        expect(await depositor.redeemOperation()).to.deep.eq([newACRVAmount, acrvAmount, 0]);
        expect(await depositor.abortable(signerACRV.address)).to.deep.eq([newACRVAmount, constants.Zero]);

        const balanceBefore = await acrv.balanceOf(signerACRV.address);
        await expect(depositor.connect(signerACRV).abortRedeem(ethers.utils.parseEther("1.5")))
          .to.emit(depositor, "AbortRedeem")
          .withArgs(signerACRV.address, 1, ethers.utils.parseEther("1.5"));
        const balanceAfter = await acrv.balanceOf(signerACRV.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(ethers.utils.parseEther("1.5"));
        expect(await depositor.redeemOperation()).to.deep.eq([ethers.utils.parseEther("0.5"), acrvAmount, 0]);
        expect(await depositor.abortable(signerACRV.address)).to.deep.eq([
          ethers.utils.parseEther("0.5"),
          constants.Zero,
        ]);
      });
    });

    context("cross chain redeem", async () => {
      const acrvAmount = ethers.utils.parseEther("50");

      beforeEach(async () => {
        await depositor.updateWhitelist([deployer.address], true);
        await acrv.connect(signerACRV).approve(depositor.address, constants.MaxUint256);
        await expect(depositor.connect(signerACRV).redeem(acrvAmount))
          .to.emit(depositor, "Redeem")
          .withArgs(signerACRV.address, 0, acrvAmount);
        expect(await depositor.redeemOperation()).to.deep.eq([acrvAmount, constants.Zero, 0]);
        expect(await depositor.abortable(signerACRV.address)).to.deep.eq([acrvAmount, constants.Zero]);
        await depositor.updateFeeData(alice.address, 1000000, 1000000);
        await depositor.updateCrossChainInfo(acrv.address, {
          feePercentage: 2000000, // 0.2%,
          minCrossChainFee: ethers.utils.parseEther("10"),
          maxCrossChainFee: ethers.utils.parseEther("1000"),
          minCrossChainAmount: ethers.utils.parseEther("10"),
          maxCrossChainAmount: ethers.utils.parseEther("10000"),
        });
        await anycall.connect(deployer).deposit(crossChainCallProxy.address, { value: ethers.utils.parseEther("100") });
        await anycall.connect(anycallMpc).setWhitelist(crossChainCallProxy.address, layer1.address, 1, true);
        await crossChainCallProxy.updateWhitelist([depositor.address], true);
      });

      // non-whitelist
      it("should revert, when non-whitelist call prepareAsyncRedeem", async () => {
        await expect(depositor.connect(alice).prepareAsyncRedeem()).to.revertedWith(
          "Layer2CRVDepositor: only whitelist"
        );
      });

      it("should revert, when non-whitelist call asyncRedeem", async () => {
        await expect(depositor.connect(alice).asyncRedeem(0)).to.revertedWith("Layer2CRVDepositor: only whitelist");
      });

      it("should revert, when non anycall proxy call finalizeRedeem", async () => {
        await expect(depositor.connect(alice).finalizeRedeem(0, 0, 0, 0)).to.revertedWith(
          "CrossChainCallBase: only AnyCallProxy"
        );
      });

      // prepareAsyncRedeem
      it("should revert, when no pending async redeem exists", async () => {
        await depositor.connect(signerACRV).abortRedeem(acrvAmount);
        await expect(depositor.prepareAsyncRedeem()).to.revertedWith("Layer2CRVDepositor: no pending redeem");
      });

      it("should revert, when ongoing async redeem exists", async () => {
        await depositor.prepareAsyncRedeem();
        await expect(depositor.prepareAsyncRedeem()).to.revertedWith("Layer2CRVDepositor: has ongoing redeem");
      });

      it("should revert, when insufficient cross chain amount", async () => {
        await depositor.updateCrossChainInfo(acrv.address, {
          feePercentage: 2000000, // 0.2%,
          minCrossChainFee: ethers.utils.parseEther("10"),
          maxCrossChainFee: ethers.utils.parseEther("1000"),
          minCrossChainAmount: ethers.utils.parseEther("10000"),
          maxCrossChainAmount: ethers.utils.parseEther("10000"),
        });
        await expect(depositor.prepareAsyncRedeem()).to.revertedWith(
          "Layer2CRVDepositor: insufficient cross chain amount"
        );
      });

      it("should succeed, when prepareAsyncRedeem", async () => {
        expect(await depositor.asyncRedeemStatus()).to.eq(0);
        await expect(depositor.prepareAsyncRedeem())
          .to.emit(depositor, "PrepareRedeem")
          .withArgs(0, acrvAmount, acrvAmount.mul(1).div(1000), ethers.utils.parseEther("10"));
        expect(await depositor.redeemOperation()).to.deep.eq([constants.Zero, acrvAmount, 0]);
        expect(await depositor.abortable(signerACRV.address)).to.deep.eq([constants.Zero, constants.Zero]);
        expect(await depositor.asyncRedeemStatus()).to.eq(1);
      });

      // asyncRedeem
      it("should revert, when pending redeem", async () => {
        await expect(depositor.asyncRedeem(0)).to.revertedWith("Layer2CRVDepositor: no pending redeem");
      });

      it("should revert, when redeem is already ongoing", async () => {
        await depositor.prepareAsyncRedeem();
        await depositor.asyncRedeem(0);
        await expect(depositor.asyncRedeem(0)).to.revertedWith(
          "Layer2CRVDepositor: no pending redeem or has ongoing redeem"
        );
      });

      it("should succeed, when call asyncRedeem", async () => {
        expect(await depositor.asyncRedeemStatus()).to.eq(0);
        await expect(depositor.prepareAsyncRedeem())
          .to.emit(depositor, "PrepareRedeem")
          .withArgs(0, acrvAmount, acrvAmount.mul(1).div(1000), ethers.utils.parseEther("10"));
        expect(await depositor.redeemOperation()).to.deep.eq([constants.Zero, acrvAmount, 0]);
        expect(await depositor.abortable(signerACRV.address)).to.deep.eq([constants.Zero, constants.Zero]);
        expect(await depositor.asyncRedeemStatus()).to.eq(1);

        await expect(depositor.asyncRedeem(0))
          .to.emit(depositor, "AsyncRedeem")
          .withArgs(0, 1)
          .to.emit(anycall, "LogAnyCall")
          .withArgs(
            crossChainCallProxy.address,
            layer1.address,
            "0x3eb0e35b" +
              defaultAbiCoder
                .encode(
                  ["uint256", "uint256", "address", "uint256", "uint256", "address"],
                  [0, 1, depositor.address, acrvAmount, 0, depositor.address]
                )
                .slice(2),
            depositor.address,
            1
          );
        expect(await depositor.asyncRedeemStatus()).to.eq(2);
      });

      // finalizeRedeem
      it("should revert, when no ongoing redeem", async () => {
        const data = depositor.interface.encodeFunctionData("finalizeRedeem", [
          0,
          ethers.utils.parseEther("200"),
          ethers.utils.parseEther("150"),
          ethers.utils.parseEther("1"),
        ]);
        await expect(
          anycall
            .connect(anycallMpc)
            .anyExec(crossChainCallProxy.address, depositor.address, data, constants.AddressZero, 1)
        )
          .to.emit(anycall, "LogAnyExec")
          .withArgs(
            crossChainCallProxy.address,
            depositor.address,
            data,
            false,
            "0x08c379a0" + defaultAbiCoder.encode(["string"], ["Layer2CRVDepositor: no ongoing redeem"]).slice(2),
            constants.AddressZero,
            1
          );
      });

      it("should revert, when execution id mismatch", async () => {
        await depositor.prepareAsyncRedeem();
        await depositor.asyncRedeem(0);
        const data = depositor.interface.encodeFunctionData("finalizeRedeem", [
          1,
          ethers.utils.parseEther("200"),
          ethers.utils.parseEther("150"),
          ethers.utils.parseEther("1"),
        ]);
        await expect(
          anycall
            .connect(anycallMpc)
            .anyExec(crossChainCallProxy.address, depositor.address, data, constants.AddressZero, 1)
        )
          .to.emit(anycall, "LogAnyExec")
          .withArgs(
            crossChainCallProxy.address,
            depositor.address,
            data,
            false,
            "0x08c379a0" + defaultAbiCoder.encode(["string"], ["Layer2CRVDepositor: execution id mismatch"]).slice(2),
            constants.AddressZero,
            1
          );
      });

      it("should succeed, when finalizeRedeem", async () => {
        await depositor.prepareAsyncRedeem();
        await depositor.asyncRedeem(0);
        const data = depositor.interface.encodeFunctionData("finalizeRedeem", [
          0,
          ethers.utils.parseEther("200"),
          ethers.utils.parseEther("150"),
          ethers.utils.parseEther("1"),
        ]);
        expect(await depositor.finialzedRedeemState(0)).to.deep.eq([constants.Zero, constants.Zero]);
        await expect(
          anycall
            .connect(anycallMpc)
            .anyExec(crossChainCallProxy.address, depositor.address, data, constants.AddressZero, 1)
        )
          .to.emit(anycall, "LogAnyExec")
          .withArgs(crossChainCallProxy.address, depositor.address, data, true, "0x", constants.AddressZero, 1)
          .to.emit(depositor, "FinalizeRedeem")
          .withArgs(0, ethers.utils.parseEther("200"), ethers.utils.parseEther("150"), ethers.utils.parseEther("1"));
        expect(await depositor.finialzedRedeemState(0)).to.deep.eq([acrvAmount, ethers.utils.parseEther("149")]);
        expect(await depositor.asyncDepositStatus()).to.eq(0);
        expect(await depositor.redeemOperation()).to.deep.eq([constants.Zero, constants.Zero, 1]);
        expect(await depositor.claimable(signerACRV.address)).to.deep.eq([
          constants.Zero,
          ethers.utils.parseEther("149"),
        ]);

        await crv.connect(signerCRV).transfer(depositor.address, ethers.utils.parseEther("149"));
        const balanceBefore = await crv.balanceOf(signerACRV.address);
        await expect(depositor.connect(signerACRV).claim())
          .to.emit(depositor, "Claim")
          .withArgs(signerACRV.address, constants.Zero, ethers.utils.parseEther("149"));
        const balanceAfter = await crv.balanceOf(signerACRV.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(ethers.utils.parseEther("149"));
        expect(await depositor.claimable(signerACRV.address)).to.deep.eq([constants.Zero, constants.Zero]);
      });
    });
  });

  context("FantomCRVDepositor", async () => {
    let alice: SignerWithAddress;
    let depositor: FantomCRVDepositor;

    beforeEach(async () => {
      [alice] = await ethers.getSigners();

      const FantomCRVDepositor = await ethers.getContractFactory("FantomCRVDepositor", deployer);
      depositor = await FantomCRVDepositor.deploy();
      await depositor.initialize(
        anycall.address,
        router.address,
        crossChainCallProxy.address,
        deployer.address,
        crv.address,
        acrv.address,
        depositor.address
      );
    });

    context("cross chain deposit", async () => {
      beforeEach(async () => {
        await depositor.updateWhitelist([deployer.address], true);
        await crv.connect(signerCRV).approve(depositor.address, constants.MaxUint256);
        await expect(depositor.connect(signerCRV).deposit(ethers.utils.parseEther("100")))
          .to.emit(depositor, "Deposit")
          .withArgs(signerCRV.address, 0, ethers.utils.parseEther("100"));
        expect(await depositor.depositOperation()).to.deep.eq([ethers.utils.parseEther("100"), constants.Zero, 0]);
        expect(await depositor.abortable(signerCRV.address)).to.deep.eq([
          constants.Zero,
          ethers.utils.parseEther("100"),
        ]);
        await depositor.updateFeeData(alice.address, 1000000, 1000000);
        await depositor.updateCrossChainInfo(crv.address, {
          feePercentage: 2000000, // 0.2%,
          minCrossChainFee: ethers.utils.parseEther("10"),
          maxCrossChainFee: ethers.utils.parseEther("1000"),
          minCrossChainAmount: ethers.utils.parseEther("10"),
          maxCrossChainAmount: ethers.utils.parseEther("10000"),
        });
        await anycall.connect(deployer).deposit(crossChainCallProxy.address, { value: ethers.utils.parseEther("100") });
        await anycall.connect(anycallMpc).setWhitelist(crossChainCallProxy.address, depositor.address, 1, true);
        await crossChainCallProxy.updateWhitelist([depositor.address], true);
      });

      // non-whitelist
      it("should revert, when non-whitelist call prepareAsyncDeposit", async () => {
        await expect(depositor.connect(alice).prepareAsyncDeposit()).to.revertedWith(
          "Layer2CRVDepositor: only whitelist"
        );
      });

      it("should revert, when non-whitelist call asyncDeposit", async () => {
        await expect(depositor.connect(alice).asyncDeposit()).to.revertedWith("Layer2CRVDepositor: only whitelist");
      });

      it("should revert, when non anycall proxy call finalizeDeposit", async () => {
        await expect(depositor.connect(alice).finalizeDeposit(0, 0, 0, 0)).to.revertedWith(
          "CrossChainCallBase: only AnyCallProxy"
        );
      });

      // prepareAsyncDeposit
      it("should revert, when no pending async deposit exists", async () => {
        await depositor.connect(signerCRV).abortDeposit(ethers.utils.parseEther("100"));
        await expect(depositor.prepareAsyncDeposit()).to.revertedWith("Layer2CRVDepositor: no pending deposit");
      });

      it("should revert, when ongoing async deposit exists", async () => {
        await depositor.prepareAsyncDeposit();
        await expect(depositor.prepareAsyncDeposit()).to.revertedWith("Layer2CRVDepositor: has ongoing deposit");
      });

      it("should revert, when insufficient cross chain amount", async () => {
        await depositor.updateCrossChainInfo(crv.address, {
          feePercentage: 2000000, // 0.2%,
          minCrossChainFee: ethers.utils.parseEther("10"),
          maxCrossChainFee: ethers.utils.parseEther("1000"),
          minCrossChainAmount: ethers.utils.parseEther("10000"),
          maxCrossChainAmount: ethers.utils.parseEther("10000"),
        });
        await expect(depositor.prepareAsyncDeposit()).to.revertedWith(
          "FantomCRVDepositor: insufficient cross chain amount"
        );
      });

      it("should succeed, when prepareAsyncDeposit", async () => {
        expect(await depositor.asyncDepositStatus()).to.eq(0);
        await expect(depositor.prepareAsyncDeposit())
          .to.emit(depositor, "PrepareDeposit")
          .withArgs(0, ethers.utils.parseEther("100"), ethers.utils.parseEther("0.1"), ethers.utils.parseEther("10"));
        expect(await depositor.depositOperation()).to.deep.eq([constants.Zero, ethers.utils.parseEther("100"), 0]);
        expect(await depositor.abortable(signerCRV.address)).to.deep.eq([constants.Zero, constants.Zero]);
        expect(await depositor.asyncDepositStatus()).to.eq(1);
      });

      // asyncDeposit
      it("should revert, when pending deposit", async () => {
        await expect(depositor.asyncDeposit()).to.revertedWith("Layer2CRVDepositor: no pending deposit");
      });

      it("should revert, when deposit is already ongoing", async () => {
        await depositor.prepareAsyncDeposit();
        await depositor.asyncDeposit();
        await expect(depositor.asyncDeposit()).to.revertedWith(
          "Layer2CRVDepositor: no pending deposit or has ongoing deposit"
        );
      });

      it("should succeed, when call asyncDeposit", async () => {
        expect(await depositor.asyncDepositStatus()).to.eq(0);
        await expect(depositor.prepareAsyncDeposit())
          .to.emit(depositor, "PrepareDeposit")
          .withArgs(0, ethers.utils.parseEther("100"), ethers.utils.parseEther("0.1"), ethers.utils.parseEther("10"));
        expect(await depositor.depositOperation()).to.deep.eq([constants.Zero, ethers.utils.parseEther("100"), 0]);
        expect(await depositor.abortable(signerCRV.address)).to.deep.eq([constants.Zero, constants.Zero]);
        expect(await depositor.asyncDepositStatus()).to.eq(1);

        await expect(depositor.asyncDeposit())
          .to.emit(depositor, "AsyncDeposit")
          .withArgs(0, 1)
          .to.emit(anycall, "LogAnyCall")
          .withArgs(
            crossChainCallProxy.address,
            depositor.address,
            "0x187dcb85" +
              defaultAbiCoder
                .encode(
                  ["uint256", "uint256", "address", "uint256", "address"],
                  [0, 1, depositor.address, ethers.utils.parseEther("100"), depositor.address]
                )
                .slice(2),
            depositor.address,
            1
          );
        expect(await depositor.asyncDepositStatus()).to.eq(2);
      });

      // finalizeDeposit
      it("should revert, when no ongoing deposit", async () => {
        const data = depositor.interface.encodeFunctionData("finalizeDeposit", [
          0,
          ethers.utils.parseEther("200"),
          ethers.utils.parseEther("150"),
          ethers.utils.parseEther("1"),
        ]);
        await expect(
          anycall
            .connect(anycallMpc)
            .anyExec(crossChainCallProxy.address, depositor.address, data, constants.AddressZero, 1)
        )
          .to.emit(anycall, "LogAnyExec")
          .withArgs(
            crossChainCallProxy.address,
            depositor.address,
            data,
            false,
            "0x08c379a0" + defaultAbiCoder.encode(["string"], ["Layer2CRVDepositor: no ongoing deposit"]).slice(2),
            constants.AddressZero,
            1
          );
      });

      it("should revert, when execution id mismatch", async () => {
        await depositor.prepareAsyncDeposit();
        await depositor.asyncDeposit();
        const data = depositor.interface.encodeFunctionData("finalizeDeposit", [
          1,
          ethers.utils.parseEther("200"),
          ethers.utils.parseEther("150"),
          ethers.utils.parseEther("1"),
        ]);
        await expect(
          anycall
            .connect(anycallMpc)
            .anyExec(crossChainCallProxy.address, depositor.address, data, constants.AddressZero, 1)
        )
          .to.emit(anycall, "LogAnyExec")
          .withArgs(
            crossChainCallProxy.address,
            depositor.address,
            data,
            false,
            "0x08c379a0" + defaultAbiCoder.encode(["string"], ["Layer2CRVDepositor: execution id mismatch"]).slice(2),
            constants.AddressZero,
            1
          );
      });

      it("should succeed, when finalizeDeposit", async () => {
        const acrvAmount = ethers.utils.parseEther("40");
        const acrvFee = ethers.utils.parseEther("1");
        await depositor.prepareAsyncDeposit();
        await depositor.asyncDeposit();
        const data = depositor.interface.encodeFunctionData("finalizeDeposit", [
          0,
          ethers.utils.parseEther("200"),
          acrvAmount,
          acrvFee,
        ]);
        expect(await depositor.finialzedDepositState(0)).to.deep.eq([constants.Zero, constants.Zero]);
        await expect(
          anycall
            .connect(anycallMpc)
            .anyExec(crossChainCallProxy.address, depositor.address, data, constants.AddressZero, 1)
        )
          .to.emit(anycall, "LogAnyExec")
          .withArgs(crossChainCallProxy.address, depositor.address, data, true, "0x", constants.AddressZero, 1)
          .to.emit(depositor, "FinalizeDeposit")
          .withArgs(0, ethers.utils.parseEther("200"), acrvAmount, acrvFee);
        expect(await depositor.finialzedDepositState(0)).to.deep.eq([
          ethers.utils.parseEther("100"),
          acrvAmount.sub(acrvFee),
        ]);
        expect(await depositor.asyncDepositStatus()).to.eq(0);
        expect(await depositor.depositOperation()).to.deep.eq([constants.Zero, constants.Zero, 1]);
        expect(await depositor.claimable(signerCRV.address)).to.deep.eq([acrvAmount.sub(acrvFee), constants.Zero]);

        await acrv.connect(signerACRV).transfer(depositor.address, acrvAmount.sub(acrvFee));
        const balanceBefore = await acrv.balanceOf(signerCRV.address);
        await expect(depositor.connect(signerCRV).claim())
          .to.emit(depositor, "Claim")
          .withArgs(signerCRV.address, acrvAmount.sub(acrvFee), constants.Zero);
        const balanceAfter = await acrv.balanceOf(signerCRV.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(acrvAmount.sub(acrvFee));
        expect(await depositor.claimable(signerCRV.address)).to.deep.eq([constants.Zero, constants.Zero]);
      });
    });
  });
});

/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AladdinCRV, FantomACRVProxy, Layer1ACRVProxy, IERC20, PolygonACRVProxy } from "../typechain";
import { CrossChainCallProxy } from "../typechain/CrossChainCallProxy";
import { IAnyCallProxy } from "../typechain/IAnyCallProxy";
import { IAnyswapRouter } from "../typechain/IAnyswapRouter";
import { request_fork } from "./utils";

const FORK_BLOCK_NUMBER = 14652424;
const CRV = "0xD533a949740bb3306d119CC777fa900bA034cd52";
const CRV_HOLDER = "0x7a16fF8270133F063aAb6C9977183D9e72835428";
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const aCRV = "0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884";
const ANYCALL_PROXY = "0x37414a8662bC1D25be3ee51Fb27C2686e2490A89";
const ANYCALL_MPC = "0x7FF2C8Fd909A0F0EaB4611343A2197083c524734";
const ANYSWAP_ROUTER_V4 = "0x765277EebeCA2e31912C9946eAe1021199B39C61";
const ANYSWAP_ROUTER_V4_MPC = "0x647dC1366Da28f8A64EB831fC8E9F05C90d1EA5a";

describe("Multichain.ethereum.spec", async () => {
  let deployer: SignerWithAddress;
  let anycallMpc: SignerWithAddress;
  let routerMpc: SignerWithAddress;
  let signerCRV: SignerWithAddress;
  let acrv: AladdinCRV;
  let anycall: IAnyCallProxy;
  let crv: IERC20;
  let router: IAnyswapRouter;
  let crossChainCallProxy: CrossChainCallProxy;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CRV_HOLDER, ANYCALL_MPC, ANYSWAP_ROUTER_V4_MPC]);
    deployer = await ethers.getSigner(DEPLOYER);
    anycallMpc = await ethers.getSigner(ANYCALL_MPC);
    routerMpc = await ethers.getSigner(ANYSWAP_ROUTER_V4_MPC);
    signerCRV = await ethers.getSigner(CRV_HOLDER);

    await deployer.sendTransaction({ to: anycallMpc.address, value: ethers.utils.parseEther("100") });
    await deployer.sendTransaction({ to: routerMpc.address, value: ethers.utils.parseEther("100") });
    await deployer.sendTransaction({ to: signerCRV.address, value: ethers.utils.parseEther("100") });

    acrv = await ethers.getContractAt("AladdinCRV", aCRV, deployer);
    crv = await ethers.getContractAt("IERC20", CRV, deployer);
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

  context("Layer1ACRVProxy", async () => {
    const CHAIN_ID = 123;
    const EXECUTION_ID = 1;

    let alice: SignerWithAddress;
    let aCRVProxy: Layer1ACRVProxy;

    beforeEach(async () => {
      [alice] = await ethers.getSigners();

      const Layer1ACRVProxy = await ethers.getContractFactory("Layer1ACRVProxy", deployer);
      aCRVProxy = await Layer1ACRVProxy.deploy();
      await aCRVProxy.initialize(
        CHAIN_ID,
        anycall.address,
        router.address,
        crossChainCallProxy.address,
        deployer.address
      );
      expect(await aCRVProxy.targetChain()).to.eq(CHAIN_ID);
    });

    it("should revert, when non-owner update anycall proxy", async () => {
      await expect(aCRVProxy.connect(alice).updateAnyCallProxy(anycall.address)).to.revertedWith(
        "CrossChainCallBase: only owner"
      );
    });

    it("should revert, when non-owner update cross chain call proxy", async () => {
      await expect(aCRVProxy.connect(alice).updateCrossChainCallProxy(anycall.address)).to.revertedWith(
        "CrossChainCallBase: only owner"
      );
    });

    it("should revert, when non-owner transfer ownership", async () => {
      await expect(aCRVProxy.connect(alice).transferOwnership(anycall.address)).to.revertedWith(
        "CrossChainCallBase: only owner"
      );
    });

    it("should revert, when non-owner execute", async () => {
      await expect(aCRVProxy.connect(alice).execute(constants.AddressZero, 0, [])).to.revertedWith(
        "CrossChainCallBase: only owner"
      );
    });

    it("should succeed, when owner update anycall proxy to zero", async () => {
      await expect(aCRVProxy.updateAnyCallProxy(constants.AddressZero)).to.revertedWith(
        "CrossChainCallBase: zero address"
      );
    });

    it("should succeed, when owner update anycall proxy", async () => {
      expect(await aCRVProxy.anyCallProxy()).to.eq(anycall.address);
      await expect(aCRVProxy.updateAnyCallProxy(deployer.address))
        .to.emit(aCRVProxy, "UpdateAnyCallProxy")
        .withArgs(deployer.address);
      expect(await aCRVProxy.anyCallProxy()).to.eq(deployer.address);
    });

    it("should revert, when owner update cross chain call proxy to zero", async () => {
      await expect(aCRVProxy.updateCrossChainCallProxy(constants.AddressZero)).to.revertedWith(
        "CrossChainCallBase: zero address"
      );
    });

    it("should revert, when owner update cross chain call proxy", async () => {
      expect(await aCRVProxy.crossChainCallProxy()).to.eq(crossChainCallProxy.address);
      await expect(aCRVProxy.updateCrossChainCallProxy(deployer.address))
        .to.emit(aCRVProxy, "UpdateCrossChainCallProxy")
        .withArgs(deployer.address);
      expect(await aCRVProxy.crossChainCallProxy()).to.eq(deployer.address);
    });

    it("should revert, when owner transfer ownership to zero", async () => {
      await expect(aCRVProxy.transferOwnership(constants.AddressZero)).to.revertedWith(
        "CrossChainCallBase: zero address"
      );
    });

    it("should succeed, when owner transfer ownership", async () => {
      expect(await aCRVProxy.owner()).to.eq(deployer.address);
      await expect(aCRVProxy.transferOwnership(alice.address))
        .to.emit(aCRVProxy, "OwnershipTransferred")
        .withArgs(deployer.address, alice.address);
      expect(await aCRVProxy.owner()).to.eq(alice.address);
    });

    it("should succeed, when owner execute", async () => {
      await deployer.sendTransaction({ to: aCRVProxy.address, value: ethers.utils.parseEther("1") });
      const balanceBefore = await alice.getBalance();
      await aCRVProxy.execute(alice.address, ethers.utils.parseEther("1"), []);
      const balanceAfter = await alice.getBalance();
      expect(balanceAfter.sub(balanceBefore)).to.eq(ethers.utils.parseEther("1"));
    });

    it("should revert, when non-owner update anyswap router", async () => {
      await expect(aCRVProxy.connect(alice).updateAnyswapRouter(anycall.address)).to.revertedWith(
        "CrossChainCallBase: only owner"
      );
    });

    it("should revert, when owner update anyswap router to zero", async () => {
      await expect(aCRVProxy.updateAnyswapRouter(constants.AddressZero)).to.revertedWith(
        "Layer1ACRVDefaultProxy: zero address"
      );
    });

    it("should succeed, when owner update anyswap router", async () => {
      expect(await aCRVProxy.anyswapRouter()).to.eq(router.address);
      await expect(aCRVProxy.updateAnyswapRouter(deployer.address))
        .to.emit(aCRVProxy, "UpdateAnyswapRouter")
        .withArgs(deployer.address);
      expect(await aCRVProxy.anyswapRouter()).to.eq(deployer.address);
    });

    it("should revert, when non-owner update cross chain info", async () => {
      await expect(
        aCRVProxy.connect(alice).updateCrossChainInfo(anycall.address, {
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
        aCRVProxy.updateCrossChainInfo(anycall.address, {
          feePercentage: 0,
          minCrossChainFee: 0,
          maxCrossChainFee: 0,
          minCrossChainAmount: 0,
          maxCrossChainAmount: 0,
        })
      ).to.revertedWith("Layer1ACRVDefaultProxy: invalid token");
      await expect(
        aCRVProxy.updateCrossChainInfo(crv.address, {
          feePercentage: BigNumber.from("1000000001"),
          minCrossChainFee: 0,
          maxCrossChainFee: 0,
          minCrossChainAmount: 0,
          maxCrossChainAmount: 0,
        })
      ).to.revertedWith("Layer1ACRVDefaultProxy: fee percentage too large");
      await expect(
        aCRVProxy.updateCrossChainInfo(crv.address, {
          feePercentage: 0,
          minCrossChainFee: 1,
          maxCrossChainFee: 0,
          minCrossChainAmount: 0,
          maxCrossChainAmount: 0,
        })
      ).to.revertedWith("Layer1ACRVDefaultProxy: invalid cross chain fee");
      await expect(
        aCRVProxy.updateCrossChainInfo(crv.address, {
          feePercentage: 0,
          minCrossChainFee: 0,
          maxCrossChainFee: 0,
          minCrossChainAmount: 1,
          maxCrossChainAmount: 0,
        })
      ).to.revertedWith("Layer1ACRVDefaultProxy: invalid cross chain amount");
    });

    it("should succeed, when owner update cross chain info", async () => {
      await aCRVProxy.updateCrossChainInfo(crv.address, {
        feePercentage: ethers.utils.parseUnits("0.001", 9),
        minCrossChainFee: 1,
        maxCrossChainFee: 2,
        minCrossChainAmount: 3,
        maxCrossChainAmount: 4,
      });
      expect(await aCRVProxy.CRVCrossChainInfo()).to.deep.eq([
        1000000,
        BigNumber.from(1),
        BigNumber.from(2),
        BigNumber.from(3),
        BigNumber.from(4),
      ]);
      await aCRVProxy.updateCrossChainInfo(acrv.address, {
        feePercentage: ethers.utils.parseUnits("0.002", 9),
        minCrossChainFee: 5,
        maxCrossChainFee: 6,
        minCrossChainAmount: 7,
        maxCrossChainAmount: 8,
      });
      expect(await aCRVProxy.aCRVCrossChainInfo()).to.deep.eq([
        2000000,
        BigNumber.from(5),
        BigNumber.from(6),
        BigNumber.from(7),
        BigNumber.from(8),
      ]);
    });

    context("cross chain deposit", async () => {
      beforeEach(async () => {
        await anycall.setWhitelist(crossChainCallProxy.address, deployer.address, CHAIN_ID, true);
        await anycall.setWhitelist(crossChainCallProxy.address, deployer.address, CHAIN_ID + 1, true);
        await anycall.connect(deployer).deposit(crossChainCallProxy.address, { value: ethers.utils.parseEther("100") });
        await aCRVProxy.updateCrossChainInfo(acrv.address, {
          feePercentage: 1000000, // 0.1%,
          minCrossChainFee: ethers.utils.parseEther("10"),
          maxCrossChainFee: ethers.utils.parseEther("100"),
          minCrossChainAmount: ethers.utils.parseEther("100"),
          maxCrossChainAmount: ethers.utils.parseEther("1000"),
        });
        await crossChainCallProxy.updateWhitelist([aCRVProxy.address], true);
      });

      it("should revert, when non anycall proxy call", async () => {
        await expect(aCRVProxy.deposit(EXECUTION_ID, CHAIN_ID, deployer.address, 1, deployer.address)).to.revertedWith(
          "CrossChainCallBase: only AnyCallProxy"
        );
      });

      it("should revert, when non deposit zero amount", async () => {
        await expect(
          anycall.anyExec(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("deposit", [
              EXECUTION_ID,
              CHAIN_ID,
              deployer.address,
              0,
              deployer.address,
            ]),
            deployer.address,
            CHAIN_ID
          )
        )
          .to.emit(anycall, "LogAnyExec")
          .withArgs(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("deposit", [
              EXECUTION_ID,
              CHAIN_ID,
              deployer.address,
              0,
              deployer.address,
            ]),
            false,
            "0x08c379a0" + defaultAbiCoder.encode(["string"], ["Layer1ACRVProxy: deposit zero amount"]).slice(2),
            deployer.address,
            CHAIN_ID
          );
      });

      it("should revert, when target chain mismatch", async () => {
        await expect(
          anycall.anyExec(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("deposit", [
              EXECUTION_ID,
              CHAIN_ID + 1,
              deployer.address,
              1,
              deployer.address,
            ]),
            deployer.address,
            CHAIN_ID + 1
          )
        )
          .to.emit(anycall, "LogAnyExec")
          .withArgs(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("deposit", [
              EXECUTION_ID,
              CHAIN_ID + 1,
              deployer.address,
              1,
              deployer.address,
            ]),
            false,
            "0x08c379a0" + defaultAbiCoder.encode(["string"], ["Layer1ACRVProxy: target chain mismatch"]).slice(2),
            deployer.address,
            CHAIN_ID + 1
          );
      });

      it("should revert, when crv insufficient", async () => {
        await expect(
          anycall.anyExec(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("deposit", [
              EXECUTION_ID,
              CHAIN_ID,
              deployer.address,
              1,
              deployer.address,
            ]),
            deployer.address,
            CHAIN_ID
          )
        )
          .to.emit(anycall, "LogAnyExec")
          .withArgs(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("deposit", [
              EXECUTION_ID,
              CHAIN_ID,
              deployer.address,
              1,
              deployer.address,
            ]),
            false,
            "0x08c379a0" +
              defaultAbiCoder.encode(["string"], ["Layer1ACRVProxy: insufficient CRV to deposit"]).slice(2),
            deployer.address,
            CHAIN_ID
          );
      });

      it("should revert, when cross chain amount insufficient", async () => {
        await crv.connect(signerCRV).transfer(aCRVProxy.address, ethers.utils.parseEther("1"));
        await expect(
          anycall.anyExec(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("deposit", [
              EXECUTION_ID,
              CHAIN_ID,
              deployer.address,
              ethers.utils.parseEther("1"),
              deployer.address,
            ]),
            deployer.address,
            CHAIN_ID
          )
        )
          .to.emit(anycall, "LogAnyExec")
          .withArgs(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("deposit", [
              EXECUTION_ID,
              CHAIN_ID,
              deployer.address,
              ethers.utils.parseEther("1"),
              deployer.address,
            ]),
            false,
            "0x08c379a0" +
              defaultAbiCoder.encode(["string"], ["Layer1ACRVDefaultProxy: insufficient cross chain amount"]).slice(2),
            deployer.address,
            CHAIN_ID
          );
      });

      it("should succeed, when cross chain deposit crv", async () => {
        await crv.connect(signerCRV).transfer(aCRVProxy.address, ethers.utils.parseEther("200"));
        await expect(
          anycall.anyExec(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("deposit", [
              EXECUTION_ID,
              CHAIN_ID,
              deployer.address,
              ethers.utils.parseEther("200"),
              deployer.address,
            ]),
            deployer.address,
            CHAIN_ID
          )
        )
          .to.emit(anycall, "LogAnyExec") // anyexec called by mpc
          .withArgs(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("deposit", [
              EXECUTION_ID,
              CHAIN_ID,
              deployer.address,
              ethers.utils.parseEther("200"),
              deployer.address,
            ]),
            true,
            "0x",
            deployer.address,
            CHAIN_ID
          )
          .to.emit(aCRVProxy, "Deposit") // deposit successfully
          .withArgs(
            EXECUTION_ID,
            CHAIN_ID,
            deployer.address,
            ethers.utils.parseEther("200"),
            ethers.utils.parseEther("191.261038898534232577"),
            ethers.utils.parseEther("10")
          )
          .to.emit(anycall, "LogAnyCall") // callback to notify
          .withArgs(
            crossChainCallProxy.address,
            deployer.address,
            "0x9a01ce59" +
              defaultAbiCoder
                .encode(
                  ["uint256", "uint256", "uint256", "uint256"],
                  [
                    1,
                    ethers.utils.parseEther("200"),
                    ethers.utils.parseEther("191.261038898534232577"),
                    ethers.utils.parseEther("10"),
                  ]
                )
                .slice(2),
            constants.AddressZero,
            CHAIN_ID
          );
      });
    });
  });

  context("FantomACRVProxy", async () => {
    const CHAIN_ID = 250;
    const EXECUTION_ID = 1;

    let aCRVProxy: FantomACRVProxy;

    beforeEach(async () => {
      const FantomACRVProxy = await ethers.getContractFactory("FantomACRVProxy", deployer);
      aCRVProxy = await FantomACRVProxy.deploy();
      await aCRVProxy.initialize(
        CHAIN_ID,
        anycall.address,
        router.address,
        crossChainCallProxy.address,
        deployer.address
      );
      expect(await aCRVProxy.targetChain()).to.eq(CHAIN_ID);
    });

    context("cross chain redeem", async () => {
      beforeEach(async () => {
        await anycall.setWhitelist(crossChainCallProxy.address, deployer.address, CHAIN_ID, true);
        await anycall.setWhitelist(crossChainCallProxy.address, deployer.address, CHAIN_ID + 1, true);
        await anycall.connect(deployer).deposit(crossChainCallProxy.address, { value: ethers.utils.parseEther("100") });
        await aCRVProxy.updateCrossChainInfo(crv.address, {
          feePercentage: 1000000, // 0.1%,
          minCrossChainFee: ethers.utils.parseEther("10"),
          maxCrossChainFee: ethers.utils.parseEther("100"),
          minCrossChainAmount: ethers.utils.parseEther("100"),
          maxCrossChainAmount: ethers.utils.parseEther("1000"),
        });
        await crossChainCallProxy.updateWhitelist([aCRVProxy.address], true);
      });

      it("should revert, when non anycall proxy call", async () => {
        await expect(
          aCRVProxy.redeem(EXECUTION_ID, CHAIN_ID, deployer.address, 1, 0, deployer.address)
        ).to.revertedWith("CrossChainCallBase: only AnyCallProxy");
      });

      it("should revert, when non redeem zero amount", async () => {
        await expect(
          anycall.anyExec(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [
              EXECUTION_ID,
              CHAIN_ID,
              deployer.address,
              0,
              0,
              deployer.address,
            ]),
            deployer.address,
            CHAIN_ID
          )
        )
          .to.emit(anycall, "LogAnyExec")
          .withArgs(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [
              EXECUTION_ID,
              CHAIN_ID,
              deployer.address,
              0,
              0,
              deployer.address,
            ]),
            false,
            "0x08c379a0" + defaultAbiCoder.encode(["string"], ["Layer1ACRVProxy: redeem zero amount"]).slice(2),
            deployer.address,
            CHAIN_ID
          );
      });

      it("should revert, when target chain mismatch", async () => {
        await expect(
          anycall.anyExec(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [
              EXECUTION_ID,
              CHAIN_ID + 1,
              deployer.address,
              1,
              0,
              deployer.address,
            ]),
            deployer.address,
            CHAIN_ID + 1
          )
        )
          .to.emit(anycall, "LogAnyExec")
          .withArgs(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [
              EXECUTION_ID,
              CHAIN_ID + 1,
              deployer.address,
              1,
              0,
              deployer.address,
            ]),
            false,
            "0x08c379a0" + defaultAbiCoder.encode(["string"], ["Layer1ACRVProxy: target chain mismatch"]).slice(2),
            deployer.address,
            CHAIN_ID + 1
          );
      });

      it("should revert, when acrv insufficient", async () => {
        await expect(
          anycall.anyExec(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [
              EXECUTION_ID,
              CHAIN_ID,
              deployer.address,
              1,
              0,
              deployer.address,
            ]),
            deployer.address,
            CHAIN_ID
          )
        )
          .to.emit(anycall, "LogAnyExec")
          .withArgs(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [
              EXECUTION_ID,
              CHAIN_ID,
              deployer.address,
              1,
              0,
              deployer.address,
            ]),
            false,
            "0x08c379a0" +
              defaultAbiCoder.encode(["string"], ["Layer1ACRVProxy: insufficient aCRV to redeem"]).slice(2),
            deployer.address,
            CHAIN_ID
          );
      });

      it("should revert, when not bridge to self", async () => {
        await crv.connect(signerCRV).approve(acrv.address, constants.MaxUint256);
        await acrv.connect(signerCRV).depositWithCRV(signerCRV.address, ethers.utils.parseEther("10"));
        await acrv.connect(signerCRV).transfer(aCRVProxy.address, ethers.utils.parseEther("1"));
        await expect(
          anycall.anyExec(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [
              EXECUTION_ID,
              CHAIN_ID,
              signerCRV.address,
              ethers.utils.parseEther("1"),
              0,
              deployer.address,
            ]),
            deployer.address,
            CHAIN_ID
          )
        )
          .to.emit(anycall, "LogAnyExec")
          .withArgs(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [
              EXECUTION_ID,
              CHAIN_ID,
              signerCRV.address,
              ethers.utils.parseEther("1"),
              0,
              deployer.address,
            ]),
            false,
            "0x08c379a0" + defaultAbiCoder.encode(["string"], ["FantomACRVProxy: only bridge to self"]).slice(2),
            deployer.address,
            CHAIN_ID
          );
      });

      it("should succeed, when cross chain redeem aCRV", async () => {
        await crv.connect(signerCRV).approve(acrv.address, constants.MaxUint256);
        await acrv.connect(signerCRV).depositWithCRV(signerCRV.address, ethers.utils.parseEther("1000"));
        await acrv.connect(signerCRV).transfer(aCRVProxy.address, ethers.utils.parseEther("200"));
        await expect(
          anycall.anyExec(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [
              EXECUTION_ID,
              CHAIN_ID,
              aCRVProxy.address,
              ethers.utils.parseEther("200"),
              0,
              deployer.address,
            ]),
            deployer.address,
            CHAIN_ID
          )
        )
          .to.emit(anycall, "LogAnyExec") // anyexec called by mpc
          .withArgs(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [
              EXECUTION_ID,
              CHAIN_ID,
              aCRVProxy.address,
              ethers.utils.parseEther("200"),
              0,
              deployer.address,
            ]),
            true,
            "0x",
            deployer.address,
            CHAIN_ID
          )
          .to.emit(aCRVProxy, "Redeem") // redeem successfully
          .withArgs(
            EXECUTION_ID,
            CHAIN_ID,
            aCRVProxy.address,
            ethers.utils.parseEther("200"),
            ethers.utils.parseEther("207.990190580309405688"),
            ethers.utils.parseEther("0")
          )
          .to.emit(anycall, "LogAnyCall") // callback to notify
          .withArgs(
            crossChainCallProxy.address,
            deployer.address,
            "0x3a9ac7b9" +
              defaultAbiCoder
                .encode(
                  ["uint256", "uint256", "uint256", "uint256"],
                  [
                    EXECUTION_ID,
                    ethers.utils.parseEther("200"),
                    ethers.utils.parseEther("207.990190580309405688"),
                    ethers.utils.parseEther("0"),
                  ]
                )
                .slice(2),
            constants.AddressZero,
            CHAIN_ID
          )
          .to.emit(crv, "Transfer")
          .withArgs(
            aCRVProxy.address,
            "0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE",
            ethers.utils.parseEther("207.990190580309405688")
          );
      });
    });
  });

  context("PolygonACRVProxy", async () => {
    const CHAIN_ID = 137;
    const EXECUTION_ID = 1;

    let aCRVProxy: PolygonACRVProxy;

    beforeEach(async () => {
      const PolygonACRVProxy = await ethers.getContractFactory("PolygonACRVProxy", deployer);
      aCRVProxy = await PolygonACRVProxy.deploy();
      await aCRVProxy.initialize(
        CHAIN_ID,
        anycall.address,
        router.address,
        crossChainCallProxy.address,
        deployer.address
      );
      expect(await aCRVProxy.targetChain()).to.eq(CHAIN_ID);
    });

    context("cross chain redeem", async () => {
      beforeEach(async () => {
        await anycall.setWhitelist(crossChainCallProxy.address, deployer.address, CHAIN_ID, true);
        await anycall.setWhitelist(crossChainCallProxy.address, deployer.address, CHAIN_ID + 1, true);
        await anycall.connect(deployer).deposit(crossChainCallProxy.address, { value: ethers.utils.parseEther("100") });
        await aCRVProxy.updateCrossChainInfo(crv.address, {
          feePercentage: 1000000, // 0.1%,
          minCrossChainFee: ethers.utils.parseEther("10"),
          maxCrossChainFee: ethers.utils.parseEther("100"),
          minCrossChainAmount: ethers.utils.parseEther("100"),
          maxCrossChainAmount: ethers.utils.parseEther("1000"),
        });
        await crossChainCallProxy.updateWhitelist([aCRVProxy.address], true);
      });

      it("should revert, when non anycall proxy call", async () => {
        await expect(aCRVProxy.redeem(1, CHAIN_ID, deployer.address, 1, 0, deployer.address)).to.revertedWith(
          "CrossChainCallBase: only AnyCallProxy"
        );
      });

      it("should revert, when non redeem zero amount", async () => {
        await expect(
          anycall.anyExec(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [
              EXECUTION_ID,
              CHAIN_ID,
              deployer.address,
              0,
              0,
              deployer.address,
            ]),
            deployer.address,
            CHAIN_ID
          )
        )
          .to.emit(anycall, "LogAnyExec")
          .withArgs(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [
              EXECUTION_ID,
              CHAIN_ID,
              deployer.address,
              0,
              0,
              deployer.address,
            ]),
            false,
            "0x08c379a0" + defaultAbiCoder.encode(["string"], ["Layer1ACRVProxy: redeem zero amount"]).slice(2),
            deployer.address,
            CHAIN_ID
          );
      });

      it("should revert, when target chain mismatch", async () => {
        await expect(
          anycall.anyExec(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [
              EXECUTION_ID,
              CHAIN_ID + 1,
              deployer.address,
              1,
              0,
              deployer.address,
            ]),
            deployer.address,
            CHAIN_ID + 1
          )
        )
          .to.emit(anycall, "LogAnyExec")
          .withArgs(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [
              EXECUTION_ID,
              CHAIN_ID + 1,
              deployer.address,
              1,
              0,
              deployer.address,
            ]),
            false,
            "0x08c379a0" + defaultAbiCoder.encode(["string"], ["Layer1ACRVProxy: target chain mismatch"]).slice(2),
            deployer.address,
            CHAIN_ID + 1
          );
      });

      it("should revert, when acrv insufficient", async () => {
        await expect(
          anycall.anyExec(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [1, CHAIN_ID, deployer.address, 1, 0, deployer.address]),
            deployer.address,
            CHAIN_ID
          )
        )
          .to.emit(anycall, "LogAnyExec")
          .withArgs(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [1, CHAIN_ID, deployer.address, 1, 0, deployer.address]),
            false,
            "0x08c379a0" +
              defaultAbiCoder.encode(["string"], ["Layer1ACRVProxy: insufficient aCRV to redeem"]).slice(2),
            deployer.address,
            CHAIN_ID
          );
      });

      it("should succeed, when cross chain redeem aCRV", async () => {
        await crv.connect(signerCRV).approve(acrv.address, constants.MaxUint256);
        await acrv.connect(signerCRV).depositWithCRV(signerCRV.address, ethers.utils.parseEther("1000"));
        await acrv.connect(signerCRV).transfer(aCRVProxy.address, ethers.utils.parseEther("200"));
        await expect(
          anycall.anyExec(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [
              EXECUTION_ID,
              CHAIN_ID,
              aCRVProxy.address,
              ethers.utils.parseEther("200"),
              0,
              deployer.address,
            ]),
            deployer.address,
            CHAIN_ID
          )
        )
          .to.emit(anycall, "LogAnyExec") // anyexec called by mpc
          .withArgs(
            crossChainCallProxy.address,
            aCRVProxy.address,
            aCRVProxy.interface.encodeFunctionData("redeem", [
              EXECUTION_ID,
              CHAIN_ID,
              aCRVProxy.address,
              ethers.utils.parseEther("200"),
              0,
              deployer.address,
            ]),
            true,
            "0x",
            deployer.address,
            CHAIN_ID
          )
          .to.emit(aCRVProxy, "Redeem") // redeem successfully
          .withArgs(
            EXECUTION_ID,
            CHAIN_ID,
            aCRVProxy.address,
            ethers.utils.parseEther("200"),
            ethers.utils.parseEther("207.990190580309405688"),
            ethers.utils.parseEther("0")
          )
          .to.emit(anycall, "LogAnyCall") // callback to notify
          .withArgs(
            crossChainCallProxy.address,
            deployer.address,
            "0x3a9ac7b9" +
              defaultAbiCoder
                .encode(
                  ["uint256", "uint256", "uint256", "uint256"],
                  [
                    EXECUTION_ID,
                    ethers.utils.parseEther("200"),
                    ethers.utils.parseEther("207.990190580309405688"),
                    ethers.utils.parseEther("0"),
                  ]
                )
                .slice(2),
            constants.AddressZero,
            CHAIN_ID
          )
          .to.emit(crv, "Transfer")
          .withArgs(
            aCRVProxy.address,
            "0x40ec5B33f54e0E8A33A975908C5BA1c14e5BbbDf",
            ethers.utils.parseEther("207.990190580309405688")
          );
      });
    });
  });
});

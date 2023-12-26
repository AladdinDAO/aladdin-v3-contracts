/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress, ZeroHash } from "ethers";
import { ethers } from "hardhat";

import { ConcentratorStakeDAODeployment } from "@/contracts/ConcentratorStakeDAO";
import { ConverterDeployment } from "@/contracts/Converter";
import { MultisigDeployment } from "@/contracts/Multisig";
import { ProxyAdminDeployment } from "@/contracts/ProxyAdmin";
import { mockETHBalance, request_fork } from "@/test/utils";
import {
  SdCrvCompounder,
  LegacyCompounderStash,
  MultiPathConverter,
  ConcentratorStakeDAOGaugeWrapper,
  MockERC20,
} from "@/types/index";
import { ADDRESS, Action, PoolTypeV3, TOKENS, encodePoolHintV3, selectDeployments } from "@/utils/index";

const FORK_BLOCK_NUMBER = 18725800;

const CRV_HOLDER = "0x9B44473E223f8a3c047AD86f387B80402536B029";
const SDCRV_HOLDER = "0x25431341A5800759268a6aC1d3CD91C029D7d9CA";
const SDT_HOLDER = "0x25431341A5800759268a6aC1d3CD91C029D7d9CA";
const TRICRV_HOLDER = "0xe74b28c2eAe8679e3cCc3a94d5d0dE83CCB84705";

const SDCRV_GAUGE = "0x7f50786A0b15723D741727882ee99a0BF34e3466";
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const OPERATOR = "0x66c57bF505A85A74609D2C83E94Aabb26d691E1F";

const CONVERTER = selectDeployments("mainnet", "Converter").toObject() as ConverterDeployment;
const MULTISIG = selectDeployments("mainnet", "Multisig").toObject() as MultisigDeployment;
const PROXY_ADMIN = selectDeployments("mainnet", "ProxyAdmin").toObject() as ProxyAdminDeployment;
const DEPLOYMENT = selectDeployments("mainnet", "Concentrator.StakeDAO").toObject() as ConcentratorStakeDAODeployment;

describe("LegacyCompounderStash.spec", async () => {
  let deployer: HardhatEthersSigner;
  let operator: HardhatEthersSigner;

  let owner: HardhatEthersSigner;

  let stash: LegacyCompounderStash;
  let compounder: SdCrvCompounder;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [
      DEPLOYER,
      OPERATOR,
      CRV_HOLDER,
      SDCRV_HOLDER,
      TRICRV_HOLDER,
      MULTISIG.Concentrator,
    ]);
    deployer = await ethers.getSigner(DEPLOYER);
    operator = await ethers.getSigner(OPERATOR);
    owner = await ethers.getSigner(MULTISIG.Concentrator);
    await mockETHBalance(MULTISIG.Concentrator, ethers.parseEther("10"));
    await mockETHBalance(OPERATOR, ethers.parseEther("10"));

    const admin = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN.Concentrator, owner);
    const locker = await ethers.getContractAt(
      "ConcentratorStakeDAOLocker",
      DEPLOYMENT.ConcentratorStakeDAOLocker.proxy,
      deployer
    );
    const delegation = await ethers.getContractAt("VeSDTDelegation", DEPLOYMENT.VeSDTDelegation.proxy, deployer);
    const legacyVault = await ethers.getContractAt("StakeDAOCRVVault", DEPLOYMENT.StakeDAOCRVVault.proxy, deployer);

    // upgrade ConcentratorStakeDAOLocker
    {
      const ConcentratorStakeDAOLocker = await ethers.getContractFactory("ConcentratorStakeDAOLocker", deployer);
      const impl = await ConcentratorStakeDAOLocker.deploy();
      await admin.upgrade(locker.getAddress(), impl.getAddress());
    }

    const ConcentratorSdCrvGaugeWrapper = await ethers.getContractFactory("ConcentratorSdCrvGaugeWrapper", deployer);
    const wrapper = await ConcentratorSdCrvGaugeWrapper.deploy(
      SDCRV_GAUGE,
      locker.getAddress(),
      delegation.getAddress()
    );

    const SdCRVBribeBurnerV2 = await ethers.getContractFactory("SdCRVBribeBurnerV2", deployer);
    const burner = await SdCRVBribeBurnerV2.deploy(wrapper.getAddress());

    await locker.connect(owner).updateOperator(SDCRV_GAUGE, wrapper.getAddress());
    await wrapper.initialize(MULTISIG.Concentrator, burner.getAddress());
    await locker.connect(owner).updateGaugeRewardReceiver(SDCRV_GAUGE, await wrapper.stash());
    await locker.connect(owner).updateClaimer(wrapper.getAddress());

    const SdCrvCompounder = await ethers.getContractFactory("SdCrvCompounder", deployer);
    const compounderImpl = await SdCrvCompounder.deploy(legacyVault.getAddress(), wrapper.getAddress());

    compounder = await ethers.getContractAt("SdCrvCompounder", DEPLOYMENT.SdCrvCompounder.proxy);
    const asdcrv = await ethers.getContractAt("AladdinSdCRV", DEPLOYMENT.SdCrvCompounder.proxy);

    const LegacyCompounderStash = await ethers.getContractFactory("LegacyCompounderStash", deployer);
    stash = await LegacyCompounderStash.deploy(asdcrv.getAddress());

    await admin.upgrade(compounder.getAddress(), compounderImpl.getAddress());
    await compounder.initializeV2(stash.getAddress());
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      expect(await stash.compounder()).to.eq(await compounder.getAddress());
      expect(await stash.asset()).to.eq(TOKENS.sdCRV.address);
    });
  });

  context("auth", async () => {
    context("#execute", async () => {
      it("should revert when non-admin call", async () => {
        await expect(stash.connect(operator).execute(ZeroAddress, 0n, "0x")).to.revertedWith(
          "AccessControl: account " + operator.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should succeed", async () => {
        const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
        const token = await MockERC20.deploy("X", "Y", 18);
        await token.mint(stash.getAddress(), 100000n);
        expect(await token.balanceOf(deployer.address)).to.eq(0n);
        expect(await token.balanceOf(stash.getAddress())).to.eq(100000n);
        await stash.execute(
          token.getAddress(),
          0n,
          token.interface.encodeFunctionData("transfer", [deployer.address, 100000n])
        );
        expect(await token.balanceOf(deployer.address)).to.eq(100000n);
        expect(await token.balanceOf(stash.getAddress())).to.eq(0n);
      });
    });
  });

  context("convert", async () => {
    let converter: MultiPathConverter;
    let sdcrv: MockERC20;
    let wrapper: ConcentratorStakeDAOGaugeWrapper;

    beforeEach(async () => {
      const MultiPathConverter = await ethers.getContractFactory("MultiPathConverter", deployer);
      converter = await MultiPathConverter.deploy(CONVERTER.GeneralTokenConverter);
      await stash.grantRole(await stash.HARVESTER_ROLE(), deployer.address);

      wrapper = await ethers.getContractAt("ConcentratorStakeDAOGaugeWrapper", await compounder.wrapper(), deployer);
      sdcrv = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, deployer);
    });

    it("should revert when non-harvester call", async () => {
      const role = await stash.HARVESTER_ROLE();
      await expect(stash.connect(operator).convert([], [], ZeroAddress, 0n)).to.revertedWith(
        "AccessControl: account " + operator.address.toLowerCase() + " is missing role " + role
      );
    });

    it("should revert, when length mismatch", async () => {
      await expect(stash.convert([ZeroAddress], [], ZeroAddress, 0n)).to.revertedWithCustomError(
        stash,
        "ErrorLengthMismatch"
      );
    });

    it("should revert, when with sdCRV and sdCRV not in first", async () => {
      await expect(
        stash.convert(
          [TOKENS.SDT.address, TOKENS.sdCRV.address],
          [
            { target: ZeroAddress, data: "0x" },
            { target: ZeroAddress, data: "0x" },
          ],
          deployer.address,
          0n
        )
      ).to.revertedWithCustomError(stash, "ErrorAssetIndexNotZero");
    });

    const check = async (convertParams: LegacyCompounderStash.ConvertParamsStruct, src: string) => {
      const amountOut = await stash.convert.staticCall([src], [convertParams], deployer.address, 0n);
      expect(amountOut).to.gt(0n);
      await expect(stash.convert([src], [convertParams], deployer.address, amountOut + 1n)).to.revertedWithCustomError(
        stash,
        "ErrorInsufficientHarvestedAssets"
      );
      const compounderBalanceBefore = await wrapper.balanceOf(compounder.getAddress());
      const treasuryBalanceBefore = await sdcrv.balanceOf((await compounder.feeInfo()).platform);
      const harvesterBalanceBefore = await sdcrv.balanceOf(deployer.address);
      await stash.convert([src], [convertParams], deployer.address, amountOut);
      const compounderBalanceAfter = await wrapper.balanceOf(compounder.getAddress());
      const treasuryBalanceAfter = await sdcrv.balanceOf((await compounder.feeInfo()).platform);
      const harvesterBalanceAfter = await sdcrv.balanceOf(deployer.address);
      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.eq(amountOut / 10n); // 10%
      expect(harvesterBalanceAfter - harvesterBalanceBefore).to.eq(amountOut / 50n); // 2%
      expect(compounderBalanceAfter - compounderBalanceBefore).to.eq(amountOut - amountOut / 10n - amountOut / 50n); // 88%
    };

    it("should succeed on sdCRV", async () => {
      const signer = await ethers.getSigner(SDCRV_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("10"));
      const token = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, signer);
      await token.transfer(stash.getAddress(), ethers.parseEther("100"));
      const amountOut = await stash.convert.staticCall(
        [TOKENS.sdCRV.address],
        [{ target: ZeroAddress, data: "0x" }],
        deployer.address,
        0n
      );
      expect(amountOut).to.eq(ethers.parseEther("100"));
      await check({ target: ZeroAddress, data: "0x" }, TOKENS.sdCRV.address);
      expect(await token.balanceOf(stash.getAddress())).to.eq(0n);
    });

    it("should succeed on SDT", async () => {
      const amountIn = ethers.parseEther("10000");
      const signer = await ethers.getSigner(SDT_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("10"));
      const token = await ethers.getContractAt("MockERC20", TOKENS.SDT.address, signer);
      await token.transfer(stash.getAddress(), amountIn);
      const convertParams = {
        target: await converter.getAddress(),
        data: converter.interface.encodeFunctionData("convert", [
          TOKENS.SDT.address,
          amountIn,
          1048575n + (3n << 20n),
          [
            encodePoolHintV3(ADDRESS["CURVE_ETH/SDT_POOL"], PoolTypeV3.CurveCryptoPool, 2, 1, 0, Action.Swap),
            encodePoolHintV3(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolTypeV3.CurveCryptoPool, 3, 1, 2, Action.Swap),
            encodePoolHintV3(ADDRESS["CURVE_CRV/sdCRV_V2_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
          ],
        ]),
      };
      await check(convertParams, TOKENS.SDT.address);
      expect(await token.balanceOf(stash.getAddress())).to.eq(0n);
    });

    it("should succeed on CRV", async () => {
      const amountIn = ethers.parseEther("1000");
      const signer = await ethers.getSigner(CRV_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("10"));
      const token = await ethers.getContractAt("MockERC20", TOKENS.CRV.address, signer);
      await token.transfer(stash.getAddress(), amountIn);
      const convertParams = {
        target: await converter.getAddress(),
        data: converter.interface.encodeFunctionData("convert", [
          TOKENS.CRV.address,
          amountIn,
          1048575n + (1n << 20n),
          [encodePoolHintV3(ADDRESS["CURVE_CRV/sdCRV_V2_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap)],
        ]),
      };
      await check(convertParams, TOKENS.CRV.address);
      expect(await token.balanceOf(stash.getAddress())).to.eq(0n);
    });

    it("should succeed on 3CRV", async () => {
      const amountIn = ethers.parseEther("1000");
      const signer = await ethers.getSigner(TRICRV_HOLDER);
      await mockETHBalance(signer.address, ethers.parseEther("10"));
      const token = await ethers.getContractAt("MockERC20", TOKENS.TRICRV.address, signer);
      await token.transfer(stash.getAddress(), amountIn);
      const convertParams = {
        target: await converter.getAddress(),
        data: converter.interface.encodeFunctionData("convert", [
          TOKENS.TRICRV.address,
          amountIn,
          1048575n + (4n << 20n),
          [
            encodePoolHintV3(ADDRESS.CURVE_TRICRV_POOL, PoolTypeV3.CurvePlainPool, 3, 2, 2, Action.Remove),
            encodePoolHintV3(ADDRESS.CURVE_TRICRYPTO_POOL, PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap),
            encodePoolHintV3(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolTypeV3.CurveCryptoPool, 3, 1, 2, Action.Swap),
            encodePoolHintV3(ADDRESS["CURVE_CRV/sdCRV_V2_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
          ],
        ]),
      };
      await check(convertParams, TOKENS.TRICRV.address);
      expect(await token.balanceOf(stash.getAddress())).to.eq(0n);
    });
  });
});

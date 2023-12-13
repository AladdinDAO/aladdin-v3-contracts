/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { ConverterDeployment } from "@/contracts/Converter";
import { mockETHBalance, request_fork } from "@/test/utils";
import {
  GeneralTokenConverter,
  HarvesterPoolClaimGateway,
  HarvesterPoolEntryPoint,
  UpgradeableBeacon,
  XETHCompounder,
  XETHConvexCurveStrategy,
  XETHHarvesterPool,
  XETHHarvesterPoolFactory,
} from "@/types/index";
import { TOKENS, selectDeployments } from "@/utils/index";
import { ZeroAddress } from "ethers";
import { MultisigDeployment } from "@/contracts/Multisig";

const FORK_BLOCK_NUMBER = 18783460;
const DEPLOYER = "0x1111111111111111111111111111111111111111";
const SIGNER = "0x1111111111111111111111111111111111111112";

interface ITestCase {
  name: string;
  token: string;
  gauge: string;
  rewarder: string;
  rewards: Array<string>;
}

const TestCases: Array<ITestCase> = [
  {
    name: "MIM/3CRV",
    token: "0x5a6A4D54456819380173272A5E8E9B9904BdF41B",
    gauge: "0xd8b712d29381748dB89c36BCa0138d7c75866ddF",
    rewarder: "0xFd5AbF66b003881b88567EB9Ed9c651F14Dc4771",
    rewards: [TOKENS.CRV.address, TOKENS.SPELL.address, TOKENS.CVX.address],
  },
  {
    name: "ETH/CNC",
    token: "0xF9835375f6b268743Ea0a54d742Aa156947f8C06",
    gauge: "0x5A8fa46ebb404494D718786e55c4E043337B10bF",
    rewarder: "0x1A3c8B2F89B1C2593fa46C30ADA0b4E3D0133fF8",
    rewards: [TOKENS.CRV.address, TOKENS.CNC.address, TOKENS.CVX.address],
  },
];

const MULTISIG = selectDeployments("mainnet", "Multisig").toObject() as MultisigDeployment;
const CONVERTER = selectDeployments("mainnet", "Converter").toObject() as ConverterDeployment;

describe("xETHHarvesterPoolFactory.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let converter: GeneralTokenConverter;
  let compounder: XETHCompounder;
  let strategyTemplate: XETHConvexCurveStrategy;
  let poolBeacon: UpgradeableBeacon;
  let entryPoint: HarvesterPoolEntryPoint;
  let factory: XETHHarvesterPoolFactory;
  let claimer: HarvesterPoolClaimGateway;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, SIGNER]);
    deployer = await ethers.getSigner(DEPLOYER);
    signer = await ethers.getSigner(SIGNER);

    await mockETHBalance(deployer.address, ethers.parseEther("10"));
    await mockETHBalance(signer.address, ethers.parseEther("10"));

    converter = await ethers.getContractAt("GeneralTokenConverter", CONVERTER.GeneralTokenConverter, deployer);

    const xETHCompounder = await ethers.getContractFactory("xETHCompounder", deployer);
    compounder = (await xETHCompounder.deploy(0)) as XETHCompounder;

    const ConcentratorPlainStrategy = await ethers.getContractFactory("ConcentratorPlainStrategy", deployer);
    const compounderStrategy = await ConcentratorPlainStrategy.deploy(compounder.getAddress(), TOKENS.xETH.address);
    await compounder.initialize(
      "Aladdin xETH",
      "axETH",
      MULTISIG.Concentrator,
      deployer.address,
      converter.getAddress(),
      compounderStrategy.getAddress()
    );

    const xETHConvexCurveStrategy = await ethers.getContractFactory("xETHConvexCurveStrategy", deployer);
    strategyTemplate = (await xETHConvexCurveStrategy.deploy()) as XETHConvexCurveStrategy;

    const xETHHarvesterPool = await ethers.getContractFactory("xETHHarvesterPool", deployer);
    const poolImpl = await xETHHarvesterPool.deploy(compounder.getAddress(), 86400 * 7);

    const UpgradeableBeacon = await ethers.getContractFactory("UpgradeableBeacon", deployer);
    poolBeacon = await UpgradeableBeacon.deploy(poolImpl.getAddress());

    const HarvesterPoolEntryPoint = await ethers.getContractFactory("HarvesterPoolEntryPoint", deployer);
    entryPoint = await HarvesterPoolEntryPoint.deploy();
    await entryPoint.initialize();

    const HarvesterPoolClaimGateway = await ethers.getContractFactory("HarvesterPoolClaimGateway", deployer);
    claimer = await HarvesterPoolClaimGateway.deploy(converter.getAddress());

    const xETHHarvesterPoolFactory = await ethers.getContractFactory("xETHHarvesterPoolFactory", deployer);
    factory = (await xETHHarvesterPoolFactory.deploy(
      compounder.getAddress(),
      poolBeacon.getAddress(),
      entryPoint.getAddress(),
      strategyTemplate.getAddress(),
      claimer.getAddress()
    )) as XETHHarvesterPoolFactory;

    await entryPoint.grantRole(await entryPoint.POOL_FACTORY_ROLE(), factory.getAddress());
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      expect(await factory.compounder()).to.eq(await compounder.getAddress());
      expect(await factory.poolBeacon()).to.eq(await poolBeacon.getAddress());
      expect(await factory.entryPoint()).to.eq(await entryPoint.getAddress());
      expect(await factory.strategyTemplate()).to.eq(await strategyTemplate.getAddress());
      expect(await factory.treasury()).to.eq("0x32366846354DB5C08e92b4Ab0D2a510b2a2380C8");
      expect(await factory.harvester()).to.eq("0xfa86aa141e45da5183B42792d99Dede3D26Ec515");
      expect(await factory.converter()).to.eq(await converter.getAddress());
      expect(await factory.claimer()).to.eq(await claimer.getAddress());
    });
  });

  context("#updateTreasury", async () => {
    it("should revert, when non-admin call", async () => {
      await expect(factory.connect(signer).updateTreasury(ZeroAddress)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when treasury is zero", async () => {
      await expect(factory.updateTreasury(ZeroAddress)).to.revertedWithCustomError(factory, "ErrorZeroAddress");
    });

    it("should succeed", async () => {
      expect(await factory.treasury()).to.eq("0x32366846354DB5C08e92b4Ab0D2a510b2a2380C8");
      await expect(factory.updateTreasury(deployer.address))
        .to.emit(factory, "UpdateTreasury")
        .withArgs("0x32366846354DB5C08e92b4Ab0D2a510b2a2380C8", deployer.address);
      expect(await factory.treasury()).to.eq(deployer.address);
    });
  });

  context("#updateStrategyTemplate", async () => {
    it("should revert, when non-admin call", async () => {
      await expect(factory.connect(signer).updateStrategyTemplate(ZeroAddress)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when address is zero", async () => {
      await expect(factory.updateStrategyTemplate(ZeroAddress)).to.revertedWithCustomError(factory, "ErrorZeroAddress");
    });

    it("should succeed", async () => {
      expect(await factory.strategyTemplate()).to.eq(await strategyTemplate.getAddress());
      await expect(factory.updateStrategyTemplate(deployer.address))
        .to.emit(factory, "UpdateStrategyTemplate")
        .withArgs(await strategyTemplate.getAddress(), deployer.address);
      expect(await factory.strategyTemplate()).to.eq(deployer.address);
    });
  });

  context("#updateHarvester", async () => {
    it("should revert, when non-admin call", async () => {
      await expect(factory.connect(signer).updateHarvester(ZeroAddress)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should succeed", async () => {
      expect(await factory.harvester()).to.eq("0xfa86aa141e45da5183B42792d99Dede3D26Ec515");
      await expect(factory.updateHarvester(deployer.address))
        .to.emit(factory, "UpdateHarvester")
        .withArgs("0xfa86aa141e45da5183B42792d99Dede3D26Ec515", deployer.address);
      expect(await factory.harvester()).to.eq(deployer.address);
    });
  });

  context("#updateConverter", async () => {
    it("should revert, when non-admin call", async () => {
      await expect(factory.connect(signer).updateConverter(ZeroAddress)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when converter is zero", async () => {
      await expect(factory.updateConverter(ZeroAddress)).to.revertedWithCustomError(factory, "ErrorZeroAddress");
    });

    it("should succeed", async () => {
      expect(await factory.converter()).to.eq(await converter.getAddress());
      await expect(factory.updateConverter(deployer.address))
        .to.emit(factory, "UpdateConverter")
        .withArgs(await converter.getAddress(), deployer.address);
      expect(await factory.converter()).to.eq(deployer.address);
    });
  });

  context("#updateClaimer", async () => {
    it("should revert, when non-admin call", async () => {
      await expect(factory.connect(signer).updateClaimer(ZeroAddress)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when claimer is zero", async () => {
      await expect(factory.updateClaimer(ZeroAddress)).to.revertedWithCustomError(factory, "ErrorZeroAddress");
    });

    it("should succeed", async () => {
      expect(await factory.claimer()).to.eq(await claimer.getAddress());
      await expect(factory.updateClaimer(deployer.address))
        .to.emit(factory, "UpdateClaimer")
        .withArgs(await claimer.getAddress(), deployer.address);
      expect(await factory.claimer()).to.eq(deployer.address);
    });
  });

  context("#create", async () => {
    const check = async (testcase: ITestCase) => {
      const rewarder = await ethers.getContractAt("IConvexBasicRewards", testcase.rewarder, deployer);
      const poolAddress = await factory.getPoolByAsset(testcase.gauge);
      const pool = (await ethers.getContractAt("xETHHarvesterPool", poolAddress, deployer)) as any as XETHHarvesterPool;
      const strategy = (await ethers.getContractAt(
        "xETHConvexCurveStrategy",
        await pool.strategy(),
        deployer
      )) as any as XETHConvexCurveStrategy;

      const token = await ethers.getContractAt("MockERC20", testcase.token, deployer);

      // check strategy
      // from ConcentratorStrategyBase
      expect(await strategy.pendingOwner()).to.eq(deployer.address);
      await strategy.connect(deployer).acceptOwnership();
      expect(await strategy.operator()).to.eq(await pool.getAddress());
      for (let i = 0; i < testcase.rewards.length; ++i) {
        expect(await strategy.rewards(i)).to.eq(testcase.rewards[i]);
        expect(await strategy.isTokenProtected(testcase.rewards[i])).to.eq(true);
      }
      await expect(strategy.rewards(testcase.rewards.length)).to.reverted;
      expect(await strategy.isTokenProtected(testcase.token)).to.eq(true);

      // from ConcentratorConvexCurveStrategy
      expect(await strategy.staker()).to.eq(testcase.rewarder);
      expect(await strategy.pid()).to.eq(await rewarder.pid());
      expect(await strategy.token()).to.eq(testcase.token);

      // from xETHConvexCurveStrategy
      expect(await strategy.name()).to.eq("xETHConvexCurveStrategy");

      // revert when initialize again
      await expect(strategy.initialize(ZeroAddress, ZeroAddress, ZeroAddress)).to.revertedWith(
        "Initializable: contract is already initialized"
      );

      // check pool
      // from ConcentratorBaseV2
      expect(await pool.treasury()).to.eq("0x32366846354DB5C08e92b4Ab0D2a510b2a2380C8");
      expect(await pool.harvester()).to.eq("0xfa86aa141e45da5183B42792d99Dede3D26Ec515");
      expect(await pool.converter()).to.eq(await converter.getAddress());
      expect(await pool.getExpenseRatio()).to.eq(100000000n);
      expect(await pool.getHarvesterRatio()).to.eq(20000000n);
      expect(await pool.getWithdrawFeePercentage()).to.eq(0n);

      // from LinearRewardDistributor
      expect(await pool.periodLength()).to.eq(86400n * 7n);
      expect(await pool.rewardData()).to.deep.eq([0n, 0n, 0n, 0n]);
      expect(await pool.rewardToken()).to.eq(await compounder.getAddress());
      expect(await pool.pendingRewards()).to.deep.eq([0n, 0n]);

      // from ERC20Upgradeable
      expect(await pool.name()).to.eq((await token.name()) + " xETH Harvester");
      expect(await pool.symbol()).to.eq((await token.symbol()) + "-xETH-harvester");
      expect(await compounder.decimals()).to.eq(18);
      expect(await compounder.totalSupply()).to.eq(0n);

      // from ConcentratorHarvesterPoolBase
      expect(await pool.totalSupply()).to.eq(0n);
      expect(await pool.strategy()).to.eq(await strategy.getAddress());
      expect(await pool.stakingToken()).to.eq(testcase.token);
      expect(await pool.incentive()).to.eq(0n);
      expect(await pool.withdrawFeeAccumulated()).to.eq(0n);
      expect(await pool.claimer()).to.eq(await claimer.getAddress());
      expect(await pool.isActive()).to.eq(true);

      // reinitialize
      await expect(pool.initialize(ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress)).to.revertedWith(
        "Initializable: contract is already initialized"
      );
    };

    for (const testcase of TestCases) {
      it(`should succeed create one pool: ${testcase.name}`, async () => {
        const rewarder = await ethers.getContractAt("IConvexBasicRewards", testcase.rewarder, deployer);
        const pid = await rewarder.pid();

        const poolAddress = await factory.create.staticCall(pid);
        await expect(factory.create(pid)).to.emit(factory, "NewPool").withArgs(0n, testcase.gauge, poolAddress);

        await check(testcase);
      });
    }

    it("should succeed to create multiple pool", async () => {
      let poolId = 0n;
      const pools = [];
      for (const testcase of TestCases) {
        const rewarder = await ethers.getContractAt("IConvexBasicRewards", testcase.rewarder, deployer);
        const pid = await rewarder.pid();

        const poolAddress = await factory.create.staticCall(pid);
        await expect(factory.create(pid)).to.emit(factory, "NewPool").withArgs(poolId, testcase.gauge, poolAddress);
        await expect(factory.create(pid)).to.revertedWithCustomError(factory, "ErrorPoolForAssetExisted");
        expect(await factory.getPoolByIndex(poolId)).to.eq(poolAddress);
        expect(await factory.getPoolByAsset(testcase.gauge)).to.eq(poolAddress);
        pools.push(poolAddress);
        await check(testcase);

        poolId += 1n;
      }
      expect(await factory.getAllPools()).to.deep.eq(pools);
    });
  });
});

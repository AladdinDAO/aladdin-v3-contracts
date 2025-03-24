/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import { MultiPathConverter, SdPendleBribeBurner, SdPendleCompounder, VeSDTDelegation } from "@/types/index";
import { ADDRESS, Action, PoolTypeV3, TOKENS, encodePoolHintV3 } from "@/utils/index";

const FORK_BLOCK_NUMBER = 22116250;

const DEPLOYER = "0x1000000000000000000000000000000000000001";
const OPERATOR = "0x2000000000000000000000000000000000000002";
const OWNER_CONCENTRATOR = "0xA0FB1b11ccA5871fb0225B64308e249B97804E99";

const SdPendleGauge = "0x50DC9aE51f78C593d4138263da7088A973b8184E";
const PendleHolder = "0x131b2070814623CeE8DE6054240c9158c007c0a5";
const SdPendleHolder = "0x44eE3BC492449497221a82031880a345a8f790a0";
const Locker = "0x1c0D72a330F2768dAF718DEf8A19BAb019EEAd09";

describe("SdPendleBribeBurner.spec", async () => {
  let deployer: HardhatEthersSigner;
  let operator: HardhatEthersSigner;

  let delegation: VeSDTDelegation;
  let converter: MultiPathConverter;
  let compounder: SdPendleCompounder;
  let burner: SdPendleBribeBurner;

  beforeEach(async () => {
    await request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, OPERATOR, PendleHolder, SdPendleHolder, OWNER_CONCENTRATOR]);
    deployer = await ethers.getSigner(DEPLOYER);
    operator = await ethers.getSigner(OPERATOR);
    const owner = await ethers.getSigner(OWNER_CONCENTRATOR);
    await mockETHBalance(owner.address, ethers.parseEther("10"));
    await mockETHBalance(operator.address, ethers.parseEther("10"));
    await mockETHBalance(deployer.address, ethers.parseEther("10"));

    const locker = await ethers.getContractAt("ConcentratorStakeDAOLocker", Locker, owner);
    delegation = await ethers.getContractAt("VeSDTDelegation", "0x6037Bb1BBa598bf88D816cAD90A28cC00fE3ff64", deployer);

    const MultiPathConverter = await ethers.getContractFactory("MultiPathConverter", deployer);
    converter = await MultiPathConverter.deploy("0x11C907b3aeDbD863e551c37f21DD3F36b28A6784");

    /*
    converter = await ethers.getContractAt(
      "MultiPathConverter",
      "0x0c439DB9b9f11E7F2D4624dE6d0f8FfC23DCd1f8",
      deployer
    );
    */

    const StakeDAOBribeClaimer = await ethers.getContractFactory("StakeDAOBribeClaimer", deployer);
    const claimer = await StakeDAOBribeClaimer.deploy();

    const SdPendleCompounder = await ethers.getContractFactory("SdPendleCompounder", deployer);
    compounder = await SdPendleCompounder.deploy(86400 * 7, claimer.getAddress());

    const SdPendleGaugeStrategy = await ethers.getContractFactory("SdPendleGaugeStrategy", deployer);
    const strategy = await SdPendleGaugeStrategy.deploy(compounder.getAddress());

    const StakeDAOGaugeWrapperStash = await ethers.getContractFactory("StakeDAOGaugeWrapperStash", deployer);
    const stash = await StakeDAOGaugeWrapperStash.deploy(strategy.getAddress());

    const SdPendleBribeBurner = await ethers.getContractFactory("SdPendleBribeBurner", deployer);
    burner = await SdPendleBribeBurner.deploy(compounder.getAddress());
    await locker.updateOperator(SdPendleGauge, strategy.getAddress());
    await locker.updateClaimer(claimer.getAddress());
    await locker.updateGaugeRewardReceiver(SdPendleGauge, stash.getAddress());

    await compounder.initialize(
      "Aladdin sdPENDLE",
      "asdPENDLE",
      operator.address,
      deployer.address,
      converter.getAddress(),
      strategy.getAddress(),
      burner.getAddress()
    );

    const REWARD_DEPOSITOR_ROLE = await compounder.REWARD_DEPOSITOR_ROLE();
    await compounder.grantRole(REWARD_DEPOSITOR_ROLE, burner.getAddress());
    await compounder.updateExpenseRatio(1e8); // 10% platform
    await compounder.updateBoosterRatio(2e8); // 20% booster

    await burner.grantRole(await burner.WHITELIST_BURNER_ROLE(), operator.address);
  });

  it("should initialize correctly", async () => {
    expect(await burner.compounder()).to.eq(await compounder.getAddress());
  });

  it("should revert when caller is not whitelisted", async () => {
    const role = await burner.WHITELIST_BURNER_ROLE();
    await expect(burner.burn({ target: ZeroAddress, data: "0x", minOut: 0n })).to.revertedWith(
      "AccessControl: account " + deployer.address.toLowerCase() + " is missing role " + role
    );
  });

  it("should succeed", async () => {
    const signer = await ethers.getSigner(SdPendleHolder);
    await mockETHBalance(signer.address, ethers.parseEther("10"));
    const sdPendle = await ethers.getContractAt("MockERC20", TOKENS.sdPENDLE.address, signer);
    const sdt = await ethers.getContractAt("MockERC20", TOKENS.SDT.address, signer);
    const gauge = await ethers.getContractAt("MockERC20", SdPendleGauge, signer);
    const amount = ethers.parseEther("1000");
    await sdPendle.transfer(burner.getAddress(), amount);

    const routeSDT = [
      encodePoolHintV3(ADDRESS["CRV_P_PENDLE/sdPENDLE_306_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["UniV3_PENDLE/WETH_3000"], PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, {
        fee_num: 3000,
      }),
      encodePoolHintV3(ADDRESS["CURVE_ETH/SDT_POOL"], PoolTypeV3.CurveCryptoPool, 2, 0, 1, Action.Swap, {
        use_eth: true,
      }),
    ];

    const lastUpdate = (await compounder.rewardData()).lastUpdate;
    const delegatorBefore = await sdt.balanceOf(delegation.getAddress());
    const lockerBefore = await gauge.balanceOf(Locker);
    const platformBefore = await sdPendle.balanceOf(operator.address);
    await burner.connect(operator).burn({
      target: await converter.getAddress(),
      data: converter.interface.encodeFunctionData("convert", [
        TOKENS.sdPENDLE.address,
        (amount * 2n) / 10n,
        1048575n + (3n << 20n),
        routeSDT,
      ]),
      minOut: 0n,
    });
    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    expect(await sdPendle.balanceOf(operator.getAddress())).to.eq(platformBefore + (amount * 1n) / 10n);
    expect(await gauge.balanceOf(Locker)).to.eq(lockerBefore + (amount * 7n) / 10n);
    expect(await sdt.balanceOf(delegation.getAddress())).to.gt(delegatorBefore);
    expect(await sdPendle.balanceOf(burner.getAddress())).to.eq(0n);
    expect((await compounder.rewardData()).lastUpdate).to.eq(timestamp);
    expect((await compounder.rewardData()).lastUpdate).to.gt(lastUpdate);
  });
});

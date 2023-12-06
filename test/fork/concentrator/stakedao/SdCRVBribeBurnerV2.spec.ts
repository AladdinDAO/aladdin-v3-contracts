/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { MultisigDeployment } from "@/contracts/Multisig";
import { mockETHBalance, request_fork } from "@/test/utils";
import { ConcentratorSdCrvGaugeWrapper, MockERC20, MultiPathConverter, SdCRVBribeBurnerV2 } from "@/types/index";
import { ADDRESS, Action, PoolTypeV3, TOKENS, encodePoolHintV3, selectDeployments } from "@/utils/index";
import { ConcentratorStakeDAODeployment } from "@/contracts/ConcentratorStakeDAO";
import { ConverterDeployment } from "@/contracts/Converter";

const FORK_BLOCK_NUMBER = 18725800;

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const OPERATOR = "0x66c57bF505A85A74609D2C83E94Aabb26d691E1F";

const SDCRV_GAUGE = "0x7f50786A0b15723D741727882ee99a0BF34e3466";
const SDT_HOLDER = "0xC5d3D004a223299C4F95Bb702534C14A32e8778c";
const CRV_HOLDER = "0x9B44473E223f8a3c047AD86f387B80402536B029";
const SDCRV_HOLDER = "0x25431341A5800759268a6aC1d3CD91C029D7d9CA";

const MULTISIG = selectDeployments("mainnet", "Multisig").toObject() as MultisigDeployment;
const CONVERTER = selectDeployments("mainnet", "Converter").toObject() as ConverterDeployment;
const DEPLOYMENT = selectDeployments("mainnet", "Concentrator.StakeDAO").toObject() as ConcentratorStakeDAODeployment;

describe("SdCRVBribeBurnerV2.spec", async () => {
  let deployer: HardhatEthersSigner;
  let operator: HardhatEthersSigner;

  let sdt: MockERC20;
  let sdcrv: MockERC20;
  let crv: MockERC20;

  let converter: MultiPathConverter;
  let wrapper: ConcentratorSdCrvGaugeWrapper;
  let burner: SdCRVBribeBurnerV2;

  beforeEach(async () => {
    await request_fork(FORK_BLOCK_NUMBER, [
      DEPLOYER,
      OPERATOR,
      SDCRV_HOLDER,
      SDT_HOLDER,
      CRV_HOLDER,
      MULTISIG.Concentrator,
    ]);
    deployer = await ethers.getSigner(DEPLOYER);
    operator = await ethers.getSigner(OPERATOR);
    const owner = await ethers.getSigner(MULTISIG.Concentrator);
    await mockETHBalance(owner.address, ethers.parseEther("10"));
    await mockETHBalance(operator.address, ethers.parseEther("10"));

    const locker = await ethers.getContractAt(
      "ConcentratorStakeDAOLocker",
      DEPLOYMENT.ConcentratorStakeDAOLocker.proxy,
      deployer
    );
    const delegation = await ethers.getContractAt("VeSDTDelegation", DEPLOYMENT.VeSDTDelegation.proxy, deployer);

    const ConcentratorSdCrvGaugeWrapper = await ethers.getContractFactory("ConcentratorSdCrvGaugeWrapper", deployer);
    wrapper = await ConcentratorSdCrvGaugeWrapper.deploy(SDCRV_GAUGE, locker.getAddress(), delegation.getAddress());

    const MultiPathConverter = await ethers.getContractFactory("MultiPathConverter", deployer);
    converter = await MultiPathConverter.deploy(CONVERTER.GeneralTokenConverter);

    const SdCRVBribeBurnerV2 = await ethers.getContractFactory("SdCRVBribeBurnerV2", deployer);
    burner = await SdCRVBribeBurnerV2.deploy(wrapper.getAddress());
    await locker.connect(owner).updateOperator(SDCRV_GAUGE, wrapper.getAddress());
    await wrapper.initialize(operator.address, burner.getAddress());

    const REWARD_MANAGER_ROLE = await wrapper.REWARD_MANAGER_ROLE();
    await wrapper.grantRole(REWARD_MANAGER_ROLE, deployer.address);
    await wrapper.updateRewardDistributor(TOKENS.sdCRV.address, burner.getAddress());
    await wrapper.updateRewardDistributor(TOKENS.CRV.address, burner.getAddress());

    await wrapper.updateExpenseRatio(1e8); // 10% platform
    await wrapper.updateBoosterRatio(2e8); // 20% booster

    sdcrv = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, await ethers.getSigner(SDCRV_HOLDER));
    crv = await ethers.getContractAt("MockERC20", TOKENS.CRV.address, await ethers.getSigner(CRV_HOLDER));
    sdt = await ethers.getContractAt("MockERC20", TOKENS.SDT.address, await ethers.getSigner(SDT_HOLDER));

    await burner.grantRole(await burner.WHITELIST_BURNER_ROLE(), operator.address);
  });

  it("should initialize correctly", async () => {
    expect(await burner.wrapper()).to.eq(await wrapper.getAddress());
  });

  it("should revert when caller is not whitelisted", async () => {
    const role = await burner.WHITELIST_BURNER_ROLE();
    await expect(
      burner.burn(
        ZeroAddress,
        { target: ZeroAddress, data: "0x", minOut: 0n },
        { target: ZeroAddress, data: "0x", minOut: 0n }
      )
    ).to.revertedWith("AccessControl: account " + deployer.address.toLowerCase() + " is missing role " + role);
  });

  it("should succeed when token is sdCRV", async () => {
    const signer = await ethers.getSigner(SDCRV_HOLDER);
    await mockETHBalance(signer.address, ethers.parseEther("10"));
    const token = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, signer);
    const amount = ethers.parseEther("1000");
    await token.transfer(burner.getAddress(), amount);

    const routeSDT = [
      encodePoolHintV3(ADDRESS["CURVE_CRV/sdCRV_V2_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 1, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_ETH/SDT_POOL"], PoolTypeV3.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ];

    const lastUpdate = (await wrapper.rewardData(sdcrv.getAddress())).lastUpdate;
    const delegatorBefore = await sdt.balanceOf(DEPLOYMENT.VeSDTDelegation.proxy);
    const wrapperBefore = await sdcrv.balanceOf(wrapper.getAddress());
    const platformBefore = await sdcrv.balanceOf(operator.address);
    await burner.connect(operator).burn(
      TOKENS.sdCRV.address,
      {
        target: await converter.getAddress(),
        data: converter.interface.encodeFunctionData("convert", [
          TOKENS.sdCRV.address,
          (amount * 2n) / 10n,
          1048575n + (3n << 20n),
          routeSDT,
        ]),
        minOut: 0n,
      },
      { target: ZeroAddress, data: "0x", minOut: 0n }
    );
    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    expect(await sdcrv.balanceOf(operator.getAddress())).to.eq(platformBefore + (amount * 1n) / 10n);
    expect(await sdcrv.balanceOf(wrapper.getAddress())).to.eq(wrapperBefore + (amount * 7n) / 10n);
    expect(await sdt.balanceOf(DEPLOYMENT.VeSDTDelegation.proxy)).to.gt(delegatorBefore);
    expect(await sdcrv.balanceOf(burner.getAddress())).to.eq(0n);
    expect((await wrapper.rewardData(sdcrv.getAddress())).lastUpdate).to.eq(timestamp);
    expect((await wrapper.rewardData(sdcrv.getAddress())).lastUpdate).to.gt(lastUpdate);
  });

  it("should succeed when token is CRV", async () => {
    const signer = await ethers.getSigner(CRV_HOLDER);
    await mockETHBalance(signer.address, ethers.parseEther("10"));
    const token = await ethers.getContractAt("MockERC20", TOKENS.CRV.address, signer);
    const amount = ethers.parseEther("1000");
    await token.transfer(burner.getAddress(), amount);

    const routeSDT = [
      encodePoolHintV3(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 1, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_ETH/SDT_POOL"], PoolTypeV3.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ];

    const lastUpdate = (await wrapper.rewardData(crv.getAddress())).lastUpdate;
    const delegatorBefore = await sdt.balanceOf(DEPLOYMENT.VeSDTDelegation.proxy);
    const wrapperBefore = await crv.balanceOf(wrapper.getAddress());
    const platformBefore = await crv.balanceOf(operator.address);
    await burner.connect(operator).burn(
      TOKENS.CRV.address,
      {
        target: await converter.getAddress(),
        data: converter.interface.encodeFunctionData("convert", [
          TOKENS.CRV.address,
          (amount * 2n) / 10n,
          1048575n + (2n << 20n),
          routeSDT,
        ]),
        minOut: 0n,
      },
      { target: ZeroAddress, data: "0x", minOut: 0n }
    );
    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    expect(await crv.balanceOf(operator.getAddress())).to.eq(platformBefore + (amount * 1n) / 10n);
    expect(await crv.balanceOf(wrapper.getAddress())).to.eq(wrapperBefore + (amount * 7n) / 10n);
    expect(await sdt.balanceOf(DEPLOYMENT.VeSDTDelegation.proxy)).to.gt(delegatorBefore);
    expect(await crv.balanceOf(burner.getAddress())).to.eq(0n);
    expect((await wrapper.rewardData(crv.getAddress())).lastUpdate).to.eq(timestamp);
    expect((await wrapper.rewardData(crv.getAddress())).lastUpdate).to.gt(lastUpdate);
  });

  it("should succeed when token is SDT", async () => {
    const signer = await ethers.getSigner(SDT_HOLDER);
    await mockETHBalance(signer.address, ethers.parseEther("10"));
    const token = await ethers.getContractAt("MockERC20", TOKENS.SDT.address, signer);
    const amount = ethers.parseEther("1000");
    await token.transfer(burner.getAddress(), amount);

    const routeCRV = [
      encodePoolHintV3(ADDRESS["CURVE_ETH/SDT_POOL"], PoolTypeV3.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolTypeV3.CurveCryptoPool, 3, 1, 2, Action.Swap),
    ];

    const lastUpdate = (await wrapper.rewardData(crv.getAddress())).lastUpdate;
    const delegatorBefore = await sdt.balanceOf(DEPLOYMENT.VeSDTDelegation.proxy);
    const wrapperBefore = await crv.balanceOf(wrapper.getAddress());
    const platformBefore = await sdt.balanceOf(operator.address);
    await burner.connect(operator).burn(
      TOKENS.SDT.address,
      { target: ZeroAddress, data: "0x", minOut: 0n },
      {
        target: await converter.getAddress(),
        data: converter.interface.encodeFunctionData("convert", [
          TOKENS.SDT.address,
          (amount * 2n) / 10n,
          1048575n + (2n << 20n),
          routeCRV,
        ]),
        minOut: 0n,
      }
    );
    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    expect(await sdt.balanceOf(operator.getAddress())).to.eq(platformBefore + (amount * 1n) / 10n);
    expect(await crv.balanceOf(wrapper.getAddress())).to.gt(wrapperBefore);
    expect(await sdt.balanceOf(DEPLOYMENT.VeSDTDelegation.proxy)).to.eq(delegatorBefore + (amount * 2n) / 10n);
    expect(await crv.balanceOf(burner.getAddress())).to.eq(0n);
    expect((await wrapper.rewardData(crv.getAddress())).lastUpdate).to.eq(timestamp);
    expect((await wrapper.rewardData(crv.getAddress())).lastUpdate).to.gt(lastUpdate);
  });
});

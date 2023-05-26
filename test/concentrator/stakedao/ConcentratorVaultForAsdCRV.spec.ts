/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { expect } from "chai";
import { AladdinSdCRV, ConcentratorVaultForAsdCRV, IConvexBasicRewards, IConvexBooster } from "../../../typechain";
import { request_fork } from "../../utils";
import { ethers } from "hardhat";
import { ADDRESS, DEPLOYED_CONTRACTS, TOKENS } from "../../../scripts/utils";
import { constants } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const FORK_BLOCK_NUMBER = 17341500;

const HOLDER = "0xC5d3D004a223299C4F95Bb702534C14A32e8778c";

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const REWARDER = "0xA7FC7e90c45C2657A9069CA99011894a76eaB82D";

const PLATFORM = "0x07dA2d30E26802ED65a52859a50872cfA615bD0A";
const PLATFORM_FEE_PERCENTAGE = 2e8; // 20%
const HARVEST_BOUNTY_PERCENTAGE = 5e7; // 5%

const strategies: {
  factory: string;
  impls: { [name: string]: string };
} = {
  factory: "0x23384DD4380b3677b829C6c88c0Ea9cc41C099bb",
  impls: {
    AutoCompoundingConvexFraxStrategy: "0x6Cc546cE582b0dD106c231181f7782C79Ef401da",
    AutoCompoundingConvexCurveStrategy: constants.AddressZero,
    ManualCompoundingConvexCurveStrategy: "0xE25f0E29060AeC19a0559A2EF8366a5AF086222e",
    CLeverGaugeStrategy: constants.AddressZero,
    AMOConvexCurveStrategy: "0x2be5B652836C630E15c3530bf642b544ae901239",
  },
};

describe("ConcentratorGeneralVault.asdCRV.deploy.spec", async () => {
  let deployer: SignerWithAddress;
  let signer: SignerWithAddress;

  let asdcrv: AladdinSdCRV;
  let vault: ConcentratorVaultForAsdCRV;

  // eslint-disable-next-line no-unused-vars
  let booster: IConvexBooster;
  // eslint-disable-next-line no-unused-vars
  let rewarder: IConvexBasicRewards;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, HOLDER]);

    deployer = await ethers.getSigner(DEPLOYER);
    signer = await ethers.getSigner(HOLDER);

    booster = await ethers.getContractAt("IConvexBooster", BOOSTER, deployer);
    rewarder = await ethers.getContractAt("IConvexBasicRewards", REWARDER, deployer);

    asdcrv = await ethers.getContractAt(
      "AladdinSdCRV",
      DEPLOYED_CONTRACTS.Concentrator.StakeDAO.sdCRV.asdCRV,
      deployer
    );

    const ConcentratorVaultForAsdCRV = await ethers.getContractFactory("ConcentratorVaultForAsdCRV", deployer);
    vault = await ConcentratorVaultForAsdCRV.deploy();
    await vault.deployed();

    const factory = await ethers.getContractAt("ConcentratorStrategyFactory", strategies.factory, deployer);
    const strategyAddress = await factory.callStatic.createStrategy(
      strategies.impls.ManualCompoundingConvexCurveStrategy
    );
    await factory.createStrategy(strategies.impls.ManualCompoundingConvexCurveStrategy);
    const strategyContract = await ethers.getContractAt(
      "ManualCompoundingConvexCurveStrategy",
      strategyAddress,
      deployer
    );
    const underlying = ADDRESS["CURVE_CRV/sdCRV_TOKEN"];

    await strategyContract.initialize(vault.address, underlying, REWARDER, [TOKENS.CVX.address, TOKENS.CRV.address]);
    await vault.initialize(asdcrv.address, DEPLOYED_CONTRACTS.AladdinZap, PLATFORM);
    await vault.addPool(underlying, strategyContract.address, 0, PLATFORM_FEE_PERCENTAGE, HARVEST_BOUNTY_PERCENTAGE);
  });

  it("should initialize correctly", async () => {
    expect(await vault.rewardToken()).to.eq(asdcrv.address);
    expect(await vault.platform()).to.eq(PLATFORM);
    expect(await vault.zap()).to.eq(DEPLOYED_CONTRACTS.AladdinZap);
  });

  it("should succeed, when deposit", async () => {
    const amountIn = ethers.utils.parseEther("1");
    const token = await ethers.getContractAt("IERC20", ADDRESS["CURVE_CRV/sdCRV_TOKEN"], signer);
    await token.approve(vault.address, constants.MaxUint256);

    await vault.connect(signer).deposit(0, signer.address, amountIn);
    expect(await vault.getTotalShare(0)).to.eq(amountIn);
    expect(await vault.getTotalUnderlying(0)).to.eq(amountIn);
    expect(await vault.getUserShare(0, signer.address)).to.eq(amountIn);
  });

  it("should succeed, when harvest", async () => {
    const amountIn = ethers.utils.parseEther("10000");
    const token = await ethers.getContractAt("IERC20", ADDRESS["CURVE_CRV/sdCRV_TOKEN"], signer);
    await token.approve(vault.address, constants.MaxUint256);
    await vault.connect(signer).deposit(0, signer.address, amountIn);

    await booster.earmarkRewards(93);

    const before = await asdcrv.balanceOf(vault.address);
    await vault.harvest(0, deployer.address, 0);
    const after = await asdcrv.balanceOf(vault.address);
    console.log("harvested aCRV:", ethers.utils.formatEther(after.sub(before)));

    expect(await asdcrv.balanceOf(signer.address)).to.eq(constants.Zero);
    await vault.connect(signer).claim(0, signer.address, 0, asdcrv.address);
    expect(await asdcrv.balanceOf(signer.address)).to.gt(constants.Zero);
  });
});

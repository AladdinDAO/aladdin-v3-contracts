/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { ADDRESS, DEPLOYED_CONTRACTS, VAULT_CONFIG } from "../../../scripts/utils";
import { ConcentratorStrategy, CurveBasePoolChecker, CurveMetaPoolChecker, MockERC20 } from "../../../typechain";
import { request_fork } from "../../utils";

const FORK_BLOCK_NUMBER = 16125960;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const TUSDFRAXBP = ADDRESS.CURVE_TUSDFRAXBP_TOKEN;
const TUSDFRAXBP_HOLDER = "0x87839e0378c62d8962c76726cfdd932a97ef626a";
const LUSDFRAXBP = ADDRESS.CURVE_LUSDFRAXBP_TOKEN;
const LUSDFRAXBP_HOLDER = "0x5ae9f3d885c41d42b2d575de59f6eb2108d76a23";
const FRAXBP = ADDRESS.CURVE_FRAXUSDC_TOKEN;
const FRAXBP_HOLDER = "0xAAc0aa431c237C2C0B5f041c8e59B3f1a43aC78F";

describe("ConcentratorStrategy.spec", async () => {
  let deployer: SignerWithAddress;
  let tusdSigner: SignerWithAddress;
  let lusdSigner: SignerWithAddress;
  let fraxbpSigner: SignerWithAddress;
  let tusd: MockERC20;
  let lusd: MockERC20;
  let fraxbp: MockERC20;
  let frax: MockERC20;
  let fraxbpStrategy: ConcentratorStrategy;
  let tusdStrategy: ConcentratorStrategy;
  let lusdStrategy: ConcentratorStrategy;
  let baseChecker: CurveBasePoolChecker;
  let metaChecker: CurveMetaPoolChecker;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [
      DEPLOYED_CONTRACTS.ManagementMultisig,
      DEPLOYED_CONTRACTS.Concentrator.Treasury,
      DEPLOYER,
      TUSDFRAXBP_HOLDER,
      LUSDFRAXBP_HOLDER,
      FRAXBP_HOLDER,
    ]);

    deployer = await ethers.getSigner(DEPLOYER);
    tusdSigner = await ethers.getSigner(TUSDFRAXBP_HOLDER);
    lusdSigner = await ethers.getSigner(LUSDFRAXBP_HOLDER);
    fraxbpSigner = await ethers.getSigner(FRAXBP_HOLDER);
    const proxyOwner = await ethers.getSigner(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    const zapOwner = await ethers.getSigner(DEPLOYED_CONTRACTS.ManagementMultisig);

    await deployer.sendTransaction({ to: tusdSigner.address, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: lusdSigner.address, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: fraxbpSigner.address, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: proxyOwner.address, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: zapOwner.address, value: ethers.utils.parseEther("10") });

    const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
    const impl = await AladdinZap.deploy();
    await impl.deployed();

    const zap = await ethers.getContractAt("AladdinZap", DEPLOYED_CONTRACTS.AladdinZap, zapOwner);
    const proxyAdmin = await ethers.getContractAt("ProxyAdmin", DEPLOYED_CONTRACTS.Concentrator.ProxyAdmin, proxyOwner);
    await proxyAdmin.upgrade(zap.address, impl.address);

    await zap.updateRoute(FRAXBP, ADDRESS.FRAX, VAULT_CONFIG.fraxusdc.withdraw.FRAX);
    await zap.updateRoute(TUSDFRAXBP, ADDRESS.FRAX, VAULT_CONFIG.tusdfraxbp.withdraw.FRAX);
    await zap.updateRoute(LUSDFRAXBP, ADDRESS.FRAX, VAULT_CONFIG.lusdfraxbp.withdraw.FRAX);
    await zap.updatePoolTokens(
      [ADDRESS.CURVE_TUSDFRAXBP_POOL, ADDRESS.CURVE_LUSDFRAXBP_POOL],
      [ADDRESS.CURVE_TUSDFRAXBP_TOKEN, ADDRESS.CURVE_LUSDFRAXBP_TOKEN]
    );

    console.log(
      `pools[${[ADDRESS.CURVE_TUSDFRAXBP_POOL, ADDRESS.CURVE_LUSDFRAXBP_POOL]}]`,
      `tokens[${[ADDRESS.CURVE_TUSDFRAXBP_TOKEN, ADDRESS.CURVE_LUSDFRAXBP_TOKEN]}]`
    );

    tusd = await ethers.getContractAt("MockERC20", TUSDFRAXBP, tusdSigner);
    lusd = await ethers.getContractAt("MockERC20", LUSDFRAXBP, lusdSigner);
    fraxbp = await ethers.getContractAt("MockERC20", FRAXBP, fraxbpSigner);
    frax = await ethers.getContractAt("MockERC20", ADDRESS.FRAX, deployer);

    const CurveBasePoolChecker = await ethers.getContractFactory("CurveBasePoolChecker", deployer);
    baseChecker = await CurveBasePoolChecker.deploy(4000000000); // at most 4x
    await baseChecker.deployed();

    const CurveMetaPoolChecker = await ethers.getContractFactory("CurveMetaPoolChecker", deployer);
    metaChecker = await CurveMetaPoolChecker.deploy(9000000000, baseChecker.address); // at most 9x
    await metaChecker.deployed();

    const ConcentratorStrategy = await ethers.getContractFactory("ConcentratorStrategy", deployer);
    tusdStrategy = await ConcentratorStrategy.deploy(
      DEPLOYED_CONTRACTS.AladdinZap,
      DEPLOYED_CONTRACTS.Concentrator.cvxCRV.ConcentratorIFOVault,
      29,
      1000000000,
      ADDRESS.CURVE_TUSDFRAXBP_POOL,
      ADDRESS.CURVE_TUSDFRAXBP_TOKEN,
      ADDRESS.FRAX,
      tusdSigner.address
    );
    await tusdStrategy.deployed();

    lusdStrategy = await ConcentratorStrategy.deploy(
      DEPLOYED_CONTRACTS.AladdinZap,
      DEPLOYED_CONTRACTS.Concentrator.cvxCRV.ConcentratorIFOVault,
      30,
      1000000000,
      ADDRESS.CURVE_LUSDFRAXBP_POOL,
      ADDRESS.CURVE_LUSDFRAXBP_TOKEN,
      ADDRESS.FRAX,
      lusdSigner.address
    );
    await lusdStrategy.deployed();

    fraxbpStrategy = await ConcentratorStrategy.deploy(
      DEPLOYED_CONTRACTS.AladdinZap,
      DEPLOYED_CONTRACTS.Concentrator.cvxCRV.ConcentratorIFOVault,
      15,
      1000000000,
      ADDRESS.CURVE_FRAXUSDC_POOL,
      ADDRESS.CURVE_FRAXUSDC_TOKEN,
      ADDRESS.FRAX,
      fraxbpSigner.address
    );
    await fraxbpStrategy.deployed();

    await fraxbpStrategy.updateChecker(baseChecker.address);
    await tusdStrategy.updateChecker(metaChecker.address);
    await lusdStrategy.updateChecker(metaChecker.address);
  });

  it("should ok when deposit and withdraw lusd/fraxbp", async () => {
    const amount = ethers.utils.parseEther("1");
    await lusd.transfer(lusdStrategy.address, amount);
    await lusdStrategy.connect(lusdSigner).deposit(deployer.address, amount, false);
    const before = await frax.balanceOf(deployer.address);
    await lusdStrategy.connect(lusdSigner).withdraw(deployer.address, amount, true);
    const after = await frax.balanceOf(deployer.address);
    expect(after).to.gt(before);
  });

  it("should ok when deposit and withdraw tusd/fraxbp", async () => {
    const amount = ethers.utils.parseEther("1");
    await tusd.transfer(tusdStrategy.address, amount);
    await tusdStrategy.connect(tusdSigner).deposit(deployer.address, amount, false);
    const before = await frax.balanceOf(deployer.address);
    await tusdStrategy.connect(tusdSigner).withdraw(deployer.address, amount, true);
    const after = await frax.balanceOf(deployer.address);
    expect(after).to.gt(before);
  });

  it("should ok when deposit and withdraw fraxbp", async () => {
    const amount = ethers.utils.parseEther("1");
    await fraxbp.transfer(fraxbpStrategy.address, amount);
    await fraxbpStrategy.connect(fraxbpSigner).deposit(deployer.address, amount, false);
    const before = await frax.balanceOf(deployer.address);
    await fraxbpStrategy.connect(fraxbpSigner).withdraw(deployer.address, amount, true);
    const after = await frax.balanceOf(deployer.address);
    expect(after).to.gt(before);
  });
});

/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import { AladdinSdCRV, IVotiumMultiMerkleStash, SdCRVBribeBurner, StakeDAOCRVVault } from "../../../typechain";
import { request_fork } from "../../utils";
import { DEPLOYED_CONTRACTS, TOKENS, ZAP_ROUTES } from "../../../scripts/utils";

const FORK_BLOCK_NUMBER = 17978170;

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";

const claimParam: IVotiumMultiMerkleStash.ClaimParamStruct = {
  token: TOKENS.sdCRV.address,
  index: 382,
  amount: "81940777581000000000000",
  merkleProof: [
    "0xfcb068159de57cbb3c9fc8f248e8c319ee0264ae8ce0103e5206f54a3ca737af",
    "0x19fb54c903795dac218e737ee5bbdc490fa07e2b3a310c96ebb4d97fbb24b743",
    "0x19ca39c534e5f7bcac74cbb9904ac59ba3fee74ecb6400418d43ed34a1bb7a52",
    "0x93d1a2fe7b5d3b5cedf4efaa2f0723e110971a77c43c566f4c4b4538d97d8691",
    "0x33a6baa813856383bfa608cd82b3caa237437ea2b6f00f92c333709221d3578c",
    "0xeaf947788c25c0d379319f6ab3ae27e2cd6edd4d3afafea40b8418f580939aa8",
    "0x7ad1a410a0e0373bf288cbcddf5033d291034c50b6e713bc9c4e03ce5534d9e8",
    "0x42392bd4d25d7b132d0c19d8440a833cd1137112e546d3336a5d2090dea88eb5",
  ],
};

describe("AladdinSdCRV.upgrade.spec", async () => {
  let deployer: SignerWithAddress;

  let vault: StakeDAOCRVVault;
  let burner: SdCRVBribeBurner;
  let asdCRV: AladdinSdCRV;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYED_CONTRACTS.Concentrator.Treasury, DEPLOYER]);
    deployer = await ethers.getSigner(DEPLOYER);
    const owner = await ethers.getSigner(DEPLOYED_CONTRACTS.Concentrator.Treasury);

    await deployer.sendTransaction({ to: owner.address, value: ethers.utils.parseEther("10") });

    const proxyAdmin = await ethers.getContractAt("ProxyAdmin", DEPLOYED_CONTRACTS.Concentrator.ProxyAdmin, owner);

    vault = await ethers.getContractAt(
      "StakeDAOCRVVault",
      DEPLOYED_CONTRACTS.Concentrator.StakeDAO.sdCRV.StakeDAOCRVVault,
      owner
    );

    asdCRV = await ethers.getContractAt("AladdinSdCRV", DEPLOYED_CONTRACTS.Concentrator.StakeDAO.sdCRV.asdCRV, owner);

    const StakeDAOCRVVault = await ethers.getContractFactory("StakeDAOCRVVault", deployer);
    const valutImpl = await StakeDAOCRVVault.deploy(
      DEPLOYED_CONTRACTS.Concentrator.StakeDAO.StakeDAOLockerProxy,
      DEPLOYED_CONTRACTS.Concentrator.StakeDAO.VeSDTDelegation
    );
    await valutImpl.deployed();

    const AladdinSdCRV = await ethers.getContractFactory("AladdinSdCRV", deployer);
    const asdCRVImpl = await AladdinSdCRV.deploy(vault.address);
    await asdCRVImpl.deployed();

    const SdCRVBribeBurner = await ethers.getContractFactory("SdCRVBribeBurner", deployer);
    burner = await SdCRVBribeBurner.deploy(DEPLOYED_CONTRACTS.TokenZapLogic);
    await burner.deployed();

    await vault.updateBribeBurner(burner.address);
    await asdCRV.updateHarvester(constants.AddressZero);
    await proxyAdmin.upgrade(vault.address, valutImpl.address);
    await proxyAdmin.upgrade(asdCRV.address, asdCRVImpl.address);
    await burner.updateWhitelist(deployer.address, true);
  });

  it("should succeed claim sdCRV", async () => {
    const sdCRV = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, deployer);

    await vault.harvestBribes([claimParam]);
    await burner.burn(sdCRV.address, ZAP_ROUTES.sdCRV.SDT, 0, ZAP_ROUTES.sdCRV.CRV, 0);

    const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
    await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
    await hre.network.provider.send("evm_mine");

    const sdt = await ethers.getContractAt("MockERC20", TOKENS.SDT.address, deployer);
    const tricrv = await ethers.getContractAt("MockERC20", TOKENS.TRICRV.address, deployer);
    const crv = await ethers.getContractAt("MockERC20", TOKENS.CRV.address, deployer);

    const balance = await sdCRV.balanceOf(asdCRV.address);
    expect(await sdt.balanceOf(asdCRV.address)).to.eq(constants.Zero);
    expect(await tricrv.balanceOf(asdCRV.address)).to.eq(constants.Zero);
    expect(await crv.balanceOf(asdCRV.address)).to.eq(constants.Zero);
    await asdCRV.harvest(deployer.address, 0);
    expect(await sdCRV.balanceOf(asdCRV.address)).to.eq(balance);
    expect(await sdt.balanceOf(asdCRV.address)).to.eq(constants.Zero);
    expect(await tricrv.balanceOf(asdCRV.address)).to.eq(constants.Zero);
    expect(await crv.balanceOf(asdCRV.address)).to.eq(constants.Zero);
  });
});

/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";

import { request_fork } from "@/test/utils";
import { AladdinSdCRV, IMultiMerkleStash, SdCRVBribeBurner, StakeDAOCRVVault } from "@/types/index";
import { DEPLOYED_CONTRACTS, TOKENS, ZAP_ROUTES } from "@/utils/index";
import { ZeroAddress } from "ethers";

const FORK_BLOCK_NUMBER = 17978170;

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";

const claimParam: IMultiMerkleStash.ClaimParamStruct = {
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
  let deployer: HardhatEthersSigner;

  let vault: StakeDAOCRVVault;
  let burner: SdCRVBribeBurner;
  let asdCRV: AladdinSdCRV;

  beforeEach(async () => {
    await request_fork(FORK_BLOCK_NUMBER, [DEPLOYED_CONTRACTS.Concentrator.Treasury, DEPLOYER]);
    deployer = await ethers.getSigner(DEPLOYER);
    const owner = await ethers.getSigner(DEPLOYED_CONTRACTS.Concentrator.Treasury);

    await deployer.sendTransaction({ to: owner.address, value: ethers.parseEther("10") });

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

    const AladdinSdCRV = await ethers.getContractFactory("AladdinSdCRV", deployer);
    const asdCRVImpl = await AladdinSdCRV.deploy(vault.getAddress());

    const SdCRVBribeBurner = await ethers.getContractFactory("SdCRVBribeBurner", deployer);
    burner = await SdCRVBribeBurner.deploy(DEPLOYED_CONTRACTS.TokenZapLogic);

    await vault.updateBribeBurner(burner.getAddress());
    await asdCRV.updateHarvester(ZeroAddress);
    await proxyAdmin.upgrade(vault.getAddress(), valutImpl.getAddress());
    await proxyAdmin.upgrade(asdCRV.getAddress(), asdCRVImpl.getAddress());
    await burner.updateWhitelist(deployer.address, true);
  });

  it("should succeed claim sdCRV", async () => {
    const sdCRV = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, deployer);

    await vault.harvestBribes([claimParam]);
    await burner.burn(sdCRV.getAddress(), ZAP_ROUTES.sdCRV.SDT, 0, ZAP_ROUTES.sdCRV.CRV, 0);

    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
    await network.provider.send("evm_mine");

    const sdt = await ethers.getContractAt("MockERC20", TOKENS.SDT.address, deployer);
    const tricrv = await ethers.getContractAt("MockERC20", TOKENS.TRICRV.address, deployer);
    const crv = await ethers.getContractAt("MockERC20", TOKENS.CRV.address, deployer);

    const balance = await sdCRV.balanceOf(asdCRV.getAddress());
    expect(await sdt.balanceOf(asdCRV.getAddress())).to.eq(0n);
    expect(await tricrv.balanceOf(asdCRV.getAddress())).to.eq(0n);
    expect(await crv.balanceOf(asdCRV.getAddress())).to.eq(0n);
    await asdCRV.harvest(deployer.address, 0);
    expect(await sdCRV.balanceOf(asdCRV.getAddress())).to.eq(balance);
    expect(await sdt.balanceOf(asdCRV.getAddress())).to.eq(0n);
    expect(await tricrv.balanceOf(asdCRV.getAddress())).to.eq(0n);
    expect(await crv.balanceOf(asdCRV.getAddress())).to.eq(0n);
  });
});

/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { MaxUint256, toBigInt } from "ethers";
import { ethers, network } from "hardhat";

import { request_fork } from "@/test/utils";
import { IMultiMerkleStash, SdCRVBribeBurner, StakeDAOCRVVault } from "@/types/index";
import { DEPLOYED_CONTRACTS, TOKENS, ZAP_ROUTES } from "@/utils/index";

const FORK_BLOCK_NUMBER = 17978170;

const sdCRV_HOLDER = "0x25431341A5800759268a6aC1d3CD91C029D7d9CA";
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

describe("StakeDAOCRVVault.upgrade.spec", async () => {
  let deployer: HardhatEthersSigner;

  let vault: StakeDAOCRVVault;
  let burner: SdCRVBribeBurner;

  beforeEach(async () => {
    await request_fork(FORK_BLOCK_NUMBER, [DEPLOYED_CONTRACTS.Concentrator.Treasury, DEPLOYER, sdCRV_HOLDER]);
    deployer = await ethers.getSigner(DEPLOYER);
    const owner = await ethers.getSigner(DEPLOYED_CONTRACTS.Concentrator.Treasury);

    await deployer.sendTransaction({ to: owner.address, value: ethers.parseEther("10") });

    const proxyAdmin = await ethers.getContractAt("ProxyAdmin", DEPLOYED_CONTRACTS.Concentrator.ProxyAdmin, owner);

    vault = await ethers.getContractAt(
      "StakeDAOCRVVault",
      DEPLOYED_CONTRACTS.Concentrator.StakeDAO.sdCRV.StakeDAOCRVVault,
      owner
    );

    const StakeDAOCRVVault = await ethers.getContractFactory("StakeDAOCRVVault", deployer);
    const impl = await StakeDAOCRVVault.deploy(
      DEPLOYED_CONTRACTS.Concentrator.StakeDAO.StakeDAOLockerProxy,
      DEPLOYED_CONTRACTS.Concentrator.StakeDAO.VeSDTDelegation
    );

    const SdCRVBribeBurner = await ethers.getContractFactory("SdCRVBribeBurner", deployer);
    burner = await SdCRVBribeBurner.deploy(DEPLOYED_CONTRACTS.TokenZapLogic);

    await vault.updateBribeBurner(burner.getAddress());
    await proxyAdmin.upgrade(vault.getAddress(), impl.getAddress());
    await burner.updateWhitelist(deployer.address, true);
  });

  it("should succeed claim sdCRV", async () => {
    const holder = await ethers.getSigner(sdCRV_HOLDER);
    await deployer.sendTransaction({ to: holder.address, value: ethers.parseEther("10") });

    const sdCRV = await ethers.getContractAt("MockERC20", TOKENS.sdCRV.address, holder);
    await sdCRV.approve(vault.getAddress(), MaxUint256);
    await vault.connect(holder).deposit(ethers.parseEther("10000"), holder.address);

    await vault.harvestBribes([claimParam]);
    expect(await sdCRV.balanceOf(burner.getAddress())).to.eq(toBigInt(claimParam.amount));

    const sdt = await ethers.getContractAt("MockERC20", TOKENS.SDT.address, deployer);
    const delegationBefore = await sdt.balanceOf(DEPLOYED_CONTRACTS.Concentrator.StakeDAO.VeSDTDelegation);
    const treasuryBefore = await sdCRV.balanceOf(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    await burner.burn(sdCRV.getAddress(), ZAP_ROUTES.sdCRV.SDT, 0, ZAP_ROUTES.sdCRV.CRV, 0);
    expect(await sdCRV.balanceOf(burner.getAddress())).to.eq(0n);
    const delegationAfter = await sdt.balanceOf(DEPLOYED_CONTRACTS.Concentrator.StakeDAO.VeSDTDelegation);
    const treasuryAfter = await sdCRV.balanceOf(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    expect(delegationAfter).to.gt(delegationBefore);
    expect(treasuryAfter).to.gt(treasuryBefore);

    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
    await network.provider.send("evm_mine");

    const sdCRVBefore = await sdCRV.balanceOf(holder.address);
    await vault.claim(holder.address, holder.address);
    const sdCRVAfter = await sdCRV.balanceOf(holder.address);
    expect(sdCRVAfter).to.gt(sdCRVBefore);
  });
});

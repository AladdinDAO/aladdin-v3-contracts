import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { Interface, ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { IDiamond, Diamond, TokenConvertManagementFacet } from "@/types/index";

describe("TokenConvertManagementFacet.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let diamond: Diamond;
  let facet: TokenConvertManagementFacet;

  const getAllSignatures = (e: Interface): string[] => {
    const sigs: string[] = [];
    e.forEachFunction((func, _) => {
      sigs.push(func.selector);
    });
    return sigs;
  };

  beforeEach(async () => {
    [deployer, signer] = await ethers.getSigners();

    const diamondCuts: IDiamond.FacetCutStruct[] = [];
    for (const name of ["DiamondCutFacet", "DiamondLoupeFacet", "OwnershipFacet", "TokenConvertManagementFacet"]) {
      const Contract = await ethers.getContractFactory(name, deployer);
      const facet = await Contract.deploy();
      diamondCuts.push({
        facetAddress: await facet.getAddress(),
        action: 0,
        functionSelectors: getAllSignatures(facet.interface),
      });
    }

    const Diamond = await ethers.getContractFactory("Diamond", deployer);
    diamond = await Diamond.deploy(diamondCuts, {
      owner: deployer.address,
      init: ZeroAddress,
      initCalldata: "0x",
    });
    facet = await ethers.getContractAt("TokenConvertManagementFacet", await diamond.getAddress(), deployer);
  });

  context("approveTarget", async () => {
    it("should revert when caller is not owner", async () => {
      await expect(facet.connect(signer).approveTarget(ZeroAddress, ZeroAddress))
        .to.revertedWithCustomError(facet, "NotContractOwner")
        .withArgs(signer.address, deployer.address);
    });

    it("should succeed", async () => {
      expect(await facet.getSpender(deployer.address)).to.eq(deployer.address);
      expect(await facet.getApprovedTargets()).to.deep.eq([]);
      await facet.approveTarget(deployer.address, signer.address);
      expect(await facet.getSpender(deployer.address)).to.eq(signer.address);
      expect(await facet.getApprovedTargets()).to.deep.eq([deployer.address]);
    });
  });

  context("removeTarget", async () => {
    it("should revert when caller is not owner", async () => {
      await expect(facet.connect(signer).removeTarget(ZeroAddress))
        .to.revertedWithCustomError(facet, "NotContractOwner")
        .withArgs(signer.address, deployer.address);
    });

    it("should succeed", async () => {
      expect(await facet.getSpender(deployer.address)).to.eq(deployer.address);
      expect(await facet.getApprovedTargets()).to.deep.eq([]);
      await facet.approveTarget(deployer.address, signer.address);
      expect(await facet.getSpender(deployer.address)).to.eq(signer.address);
      expect(await facet.getApprovedTargets()).to.deep.eq([deployer.address]);
      await facet.removeTarget(deployer.address);
      expect(await facet.getApprovedTargets()).to.deep.eq([]);
    });
  });
});

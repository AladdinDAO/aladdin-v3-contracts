import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { expect } from "chai";

import { MockConcentratorHarvesterPoolFactory, HarvesterPoolEntryPoint } from "@/types/index";
import { ZeroAddress, ZeroHash } from "ethers";

describe("HarvesterPoolEntryPoint.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let factory1: MockConcentratorHarvesterPoolFactory;
  let factory2: MockConcentratorHarvesterPoolFactory;

  let entryPoint: HarvesterPoolEntryPoint;

  beforeEach(async () => {
    [deployer, signer] = await ethers.getSigners();

    const MockConcentratorHarvesterPoolFactory = await ethers.getContractFactory(
      "MockConcentratorHarvesterPoolFactory",
      deployer
    );
    const HarvesterPoolEntryPoint = await ethers.getContractFactory("HarvesterPoolEntryPoint", deployer);

    entryPoint = await HarvesterPoolEntryPoint.deploy();
    factory1 = await MockConcentratorHarvesterPoolFactory.deploy("F1", entryPoint.getAddress());
    factory2 = await MockConcentratorHarvesterPoolFactory.deploy("F2", entryPoint.getAddress());

    await entryPoint.initialize();
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      expect(await entryPoint.hasRole(ZeroHash, deployer.address)).to.eq(true);

      // revert
      await expect(entryPoint.initialize()).to.revertedWith("Initializable: contract is already initialized");
    });
  });

  context("#registerConvexCurvePool", async () => {
    it("should revert when non factory role", async () => {
      const role = await entryPoint.POOL_FACTORY_ROLE();
      await expect(entryPoint.connect(signer).registerConvexCurvePool(ZeroAddress)).to.revertedWith(
        "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + role
      );
    });

    it("should succeed", async () => {
      const role = await entryPoint.POOL_FACTORY_ROLE();
      await entryPoint.grantRole(role, factory1.getAddress());
      await entryPoint.grantRole(role, factory2.getAddress());

      await factory1.register(ZeroAddress, deployer.address);
      await factory2.register(ZeroAddress, signer.address);

      const [pools, names] = await entryPoint.getConvexCurveHarvesterPools(ZeroAddress);
      expect(pools).to.deep.eq([deployer.address, signer.address]);
      expect(names).to.deep.eq(["F1", "F2"]);
    });
  });
});

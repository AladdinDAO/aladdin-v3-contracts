/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { DEPLOYED_CONTRACTS } from "../../../scripts/utils";
import { AladdinFXSConvexVault } from "../../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../../utils";

const FORK_HEIGHT = 17985730;

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";

describe("AladdinFXSConvexVault.upgrade.spec", async () => {
  let deployer: SignerWithAddress;
  let vault: AladdinFXSConvexVault;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [DEPLOYER, DEPLOYED_CONTRACTS.Concentrator.Treasury]);

    deployer = await ethers.getSigner(DEPLOYER);
    const admin = await ethers.getSigner(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    const manager = await ethers.getSigner(DEPLOYED_CONTRACTS.ManagementMultisig);

    await deployer.sendTransaction({ to: admin.address, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: manager.address, value: ethers.utils.parseEther("10") });

    const proxyAdmin = await ethers.getContractAt("ProxyAdmin", DEPLOYED_CONTRACTS.Concentrator.ProxyAdmin, admin);
    vault = await ethers.getContractAt(
      "AladdinFXSConvexVault",
      DEPLOYED_CONTRACTS.Concentrator.cvxFXS.AladdinFXSConvexVault,
      admin
    );

    vault.updateHarvester(constants.AddressZero);

    const AladdinFXSConvexVault = await ethers.getContractFactory("AladdinFXSConvexVault", deployer);
    const implAladdinFXSConvexVault = await AladdinFXSConvexVault.deploy();
    await implAladdinFXSConvexVault.deployed();

    await proxyAdmin.upgrade(vault.address, implAladdinFXSConvexVault.address);
  });

  it("should succeed", async () => {
    const numPools = await vault.poolLength();
    for (let i = 0; i < numPools.toNumber(); i++) {
      const info = await vault.poolInfo(i);
      if (info.totalUnderlying.gt(constants.Zero)) {
        const harvested = await vault.callStatic.harvest(i, deployer.address, 0);
        console.log(`harvest pool[${i}] token[${info.lpToken}] harvested[${ethers.utils.formatEther(harvested)}]`);
        await vault.harvest(i, deployer.address, 0);
      }
    }
  });
});

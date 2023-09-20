/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { TOKENS, ZAP_ROUTES } from "../../../../scripts/utils";
import { CvxCompounder, AladdinZap, CvxStakingStrategy, ICvxRewardPool, MockERC20 } from "../../../../typechain";
import { request_fork } from "../../../utils";

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const CVX_REWARD_POOL = "0xCF50b810E57Ac33B91dCF525C6ddd9881B139332";
const HOLDER = "0xf584F8728B874a6a5c7A8d4d387C9aae9172D621";
const FORK_HEIGHT = 18178555;

describe("CvxCompounder.spec", async () => {
  let deployer: HardhatEthersSigner;
  let holder: HardhatEthersSigner;

  let compounder: CvxCompounder;

  let zap: AladdinZap;
  let strategy: CvxStakingStrategy;
  let staker: ICvxRewardPool;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [DEPLOYER, HOLDER]);
    deployer = await ethers.getSigner(DEPLOYER);
    holder = await ethers.getSigner(HOLDER);

    await deployer.sendTransaction({ to: holder.address, value: ethers.parseEther("10") });

    staker = await ethers.getContractAt("ICvxRewardPool", CVX_REWARD_POOL, deployer);

    const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
    zap = await AladdinZap.deploy();
    await zap.initialize();

    const CvxCompounder = await ethers.getContractFactory("CvxCompounder", deployer);
    compounder = await CvxCompounder.deploy();

    const CvxStakingStrategy = await ethers.getContractFactory("CvxStakingStrategy", deployer);
    strategy = await CvxStakingStrategy.deploy(await compounder.getAddress(), await staker.getAddress());

    await compounder.initialize(await zap.getAddress(), await strategy.getAddress(), "aCVX", "aCVX");
  });

  context("harvest", async () => {
    let token: MockERC20;

    beforeEach(async () => {
      token = await ethers.getContractAt("MockERC20", TOKENS.CVX.address, holder);

      const amount = ethers.parseUnits("100000", 18);
      await token.approve(await compounder.getAddress(), amount);
      await compounder.connect(holder).deposit(amount, holder.address);
    });

    it(`should succeed`, async () => {
      await zap.updateRoute(TOKENS.cvxCRV.address, TOKENS.WETH.address, ZAP_ROUTES.cvxCRV.WETH);
      await zap.updateRoute(TOKENS.WETH.address, TOKENS.CVX.address, ZAP_ROUTES.WETH.CVX);

      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      // make sure 7 days passed, then the rewards will not increase anymore.
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      await network.provider.send("evm_mine");

      const harvested = await compounder.harvest.staticCall(deployer.address, 0);
      expect(harvested).to.gt(0n);

      const before = await staker.balanceOf(await strategy.getAddress());
      await compounder.harvest(deployer.address, 0);
      const after = await staker.balanceOf(await strategy.getAddress());
      expect(after - before).to.eq(harvested);
      console.log("harvested:", ethers.formatUnits(harvested, 18));
    });
  });
});

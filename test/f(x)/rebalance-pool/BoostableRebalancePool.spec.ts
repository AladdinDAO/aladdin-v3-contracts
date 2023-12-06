import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { MaxUint256, ZeroAddress, concat } from "ethers";
import { ethers, network } from "hardhat";

import {
  FractionalToken,
  LeveragedToken,
  Market,
  MockTokenWrapper,
  MockTwapOracle,
  BoostableRebalancePool,
  Treasury,
  WETH9,
  GovernanceToken,
  VotingEscrow,
  GaugeController,
  TokenMinter,
  FundraisingGaugeV1,
} from "@/types/index";

async function minimalProxyDeploy(deployer: HardhatEthersSigner, implementation: string): Promise<string> {
  const tx = await deployer.sendTransaction({
    data: concat(["0x3d602d80600a3d3981f3363d3d373d3d3d363d73", implementation, "0x5af43d82803e903d91602b57fd5bf3"]),
  });
  const receipt = await tx.wait();
  return receipt!.contractAddress!;
}

describe("BoostableRebalancePool.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;
  let platform: HardhatEthersSigner;
  let liquidator: HardhatEthersSigner;
  // let userA: HardhatEthersSigner;
  // let userB: HardhatEthersSigner;

  let fxn: GovernanceToken;
  let ve: VotingEscrow;
  let controller: GaugeController;
  let minter: TokenMinter;

  let weth: WETH9;
  let oracle: MockTwapOracle;
  let fToken: FractionalToken;
  let xToken: LeveragedToken;
  let treasury: Treasury;
  let market: Market;
  let gauge: FundraisingGaugeV1;
  let rebalancePool: BoostableRebalancePool;
  let wrapper: MockTokenWrapper;

  beforeEach(async () => {
    [deployer, signer, platform, liquidator] = await ethers.getSigners();

    const GovernanceToken = await ethers.getContractFactory("GovernanceToken", deployer);
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow", deployer);
    const GaugeController = await ethers.getContractFactory("GaugeController", deployer);
    const TokenMinter = await ethers.getContractFactory("TokenMinter", deployer);

    fxn = await GovernanceToken.deploy();
    ve = await VotingEscrow.deploy();
    controller = await GaugeController.deploy();
    minter = await TokenMinter.deploy();

    await fxn.initialize(
      ethers.parseEther("1020000"), // initial supply
      ethers.parseEther("98000") / (86400n * 365n), // initial rate, 10%,
      1111111111111111111n, // rate reduction coefficient, 1/0.9 * 1e18,
      deployer.address,
      "Governance Token",
      "GOV"
    );
    await ve.initialize(deployer.address, fxn.getAddress(), "Voting Escrow GOV", "veGOV", "1.0");
    await controller.initialize(deployer.address, fxn.getAddress(), ve.getAddress());
    await minter.initialize(fxn.getAddress(), controller.getAddress());
    await fxn.set_minter(minter.getAddress());
    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400]);
    await fxn.update_mining_parameters();

    const FundraisingGaugeV1 = await ethers.getContractFactory("FundraisingGaugeV1", deployer);
    const gaugeImpl = await FundraisingGaugeV1.deploy(
      deployer.address,
      fxn.getAddress(),
      controller.getAddress(),
      minter.getAddress()
    );
    const gaugeAddr = await minimalProxyDeploy(deployer, await gaugeImpl.getAddress());
    gauge = await ethers.getContractAt("FundraisingGaugeV1", gaugeAddr, deployer);

    const WETH9 = await ethers.getContractFactory("WETH9", deployer);
    weth = await WETH9.deploy();

    const MockTokenWrapper = await ethers.getContractFactory("MockTokenWrapper", deployer);
    wrapper = await MockTokenWrapper.deploy();

    const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
    oracle = await MockTwapOracle.deploy();

    const FractionalToken = await ethers.getContractFactory("FractionalToken", deployer);
    fToken = await FractionalToken.deploy();

    const LeveragedToken = await ethers.getContractFactory("LeveragedToken", deployer);
    xToken = await LeveragedToken.deploy();

    const Treasury = await ethers.getContractFactory("Treasury", deployer);
    treasury = await Treasury.deploy(ethers.parseEther("0.5"));

    const Market = await ethers.getContractFactory("Market", deployer);
    market = await Market.deploy();

    const BoostableRebalancePool = await ethers.getContractFactory("BoostableRebalancePool", deployer);
    rebalancePool = await BoostableRebalancePool.deploy(fxn.getAddress(), ve.getAddress(), minter.getAddress());

    await fToken.initialize(treasury.getAddress(), "Fractional ETH", "fETH");
    await xToken.initialize(treasury.getAddress(), fToken.getAddress(), "Leveraged ETH", "xETH");

    await treasury.initialize(
      market.getAddress(),
      weth.getAddress(),
      fToken.getAddress(),
      xToken.getAddress(),
      oracle.getAddress(),
      ethers.parseEther("0.1"),
      MaxUint256,
      ZeroAddress
    );
    await treasury.initializeV2(60 * 15);

    await market.initialize(treasury.getAddress(), platform.address);
    await market.updateMarketConfig(
      ethers.parseEther("1.3"),
      ethers.parseEther("1.2"),
      ethers.parseEther("1.14"),
      ethers.parseEther("1")
    );

    await rebalancePool.initialize(treasury.getAddress(), market.getAddress(), gauge.getAddress());
    await rebalancePool.grantRole(await rebalancePool.REWARD_MANAGER_ROLE(), deployer.address);
    await rebalancePool.registerRewardToken(await fxn.getAddress(), deployer.address);
    await rebalancePool.registerRewardToken(await weth.getAddress(), deployer.address);
    await gauge.initialize(rebalancePool.getAddress(), MaxUint256);
    await controller["add_type(string,uint256)"]("RebalancePool", ethers.parseEther("0.3"));
    await controller["add_gauge(address,int128,uint256)"](gauge.getAddress(), 0, ethers.parseEther("1"));
  });

  context("auth", async () => {
    it("should revert, when intialize again", async () => {
      await expect(
        rebalancePool.initialize(treasury.getAddress(), market.getAddress(), gauge.getAddress())
      ).to.revertedWith("Initializable: contract is already initialized");
    });

    it("should initialize correctly", async () => {
      expect(await rebalancePool.treasury()).to.eq(await treasury.getAddress());
      expect(await rebalancePool.market()).to.eq(await market.getAddress());
      expect(await rebalancePool.asset()).to.eq(await fToken.getAddress());
      expect(await rebalancePool.wrapper()).to.eq(await rebalancePool.getAddress());
    });

    context("#updateWrapper", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(rebalancePool.connect(signer).updateWrapper(ZeroAddress)).to.revertedWith(
          "AccessControl: account " +
            signer.address.toLowerCase() +
            " is missing role 0x0000000000000000000000000000000000000000000000000000000000000000"
        );
      });

      it("should revert, when src mismatch", async () => {
        await expect(rebalancePool.updateWrapper(wrapper.getAddress())).to.revertedWithCustomError(
          rebalancePool,
          "ErrorWrapperSrcMismatch"
        );
      });

      it("should revert, when dst mismatch", async () => {
        await wrapper.set(weth.getAddress(), weth.getAddress());
        await rebalancePool.updateWrapper(wrapper.getAddress());

        const MockTokenWrapper = await ethers.getContractFactory("MockTokenWrapper", deployer);
        const newWrapper = await MockTokenWrapper.deploy();
        await newWrapper.set(weth.getAddress(), liquidator.address);

        await expect(rebalancePool.updateWrapper(newWrapper.getAddress())).to.revertedWithCustomError(
          rebalancePool,
          "ErrorWrapperDstMismatch"
        );
      });

      it("should succeed", async () => {
        await wrapper.set(weth.getAddress(), weth.getAddress());
        expect(await rebalancePool.wrapper()).to.eq(await rebalancePool.getAddress());
        await expect(rebalancePool.updateWrapper(wrapper.getAddress()))
          .to.emit(rebalancePool, "UpdateWrapper")
          .withArgs(await rebalancePool.getAddress(), await wrapper.getAddress());
        expect(await rebalancePool.wrapper()).to.eq(await wrapper.getAddress());
      });
    });

    context("#updateLiquidatableCollateralRatio", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(rebalancePool.connect(signer).updateLiquidatableCollateralRatio(0)).to.revertedWith(
          "AccessControl: account " +
            signer.address.toLowerCase() +
            " is missing role 0x0000000000000000000000000000000000000000000000000000000000000000"
        );
      });

      it("should succeed", async () => {
        expect(await rebalancePool.liquidatableCollateralRatio()).to.eq(0n);
        await expect(rebalancePool.updateLiquidatableCollateralRatio(1))
          .to.emit(rebalancePool, "UpdateLiquidatableCollateralRatio")
          .withArgs(0, 1);
        expect(await rebalancePool.liquidatableCollateralRatio()).to.eq(1);
      });
    });
  });

  context("deposit and claim", async () => {
    beforeEach(async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await weth.deposit({ value: ethers.parseEther("100") });

      await weth.approve(market.getAddress(), MaxUint256);
      await market.mint(ethers.parseEther("100"), deployer.address, 0, 0);
    });

    it("should revert, when deposit zero amount", async () => {
      await expect(rebalancePool.deposit(ZeroAddress, deployer.address)).to.revertedWithCustomError(
        rebalancePool,
        "DepositZeroAmount"
      );
    });

    it("should succeed, when single deposit", async () => {
      await fToken.approve(rebalancePool.getAddress(), MaxUint256);
      const amountIn = ethers.parseEther("200");

      const balanceBefore = await fToken.balanceOf(deployer.address);
      await expect(rebalancePool.deposit(amountIn, signer.address))
        .to.emit(rebalancePool, "Deposit")
        .withArgs(deployer.address, signer.address, amountIn)
        .to.emit(rebalancePool, "UserDepositChange")
        .withArgs(signer.address, amountIn, 0);
      const balanceAfter = await fToken.balanceOf(deployer.address);

      expect(balanceBefore - balanceAfter).to.eq(amountIn);
      expect(await rebalancePool.totalSupply()).to.eq(amountIn);
      expect(await rebalancePool.balanceOf(signer.address)).to.eq(amountIn);
    });

    it("should succeed, when single deposit and liquidate", async () => {
      await fToken.approve(rebalancePool.getAddress(), MaxUint256);
      const amountIn = ethers.parseEther("10000");

      // deposit
      await rebalancePool.deposit(amountIn, signer.address);

      // current collateral ratio is 200%, make 300% as liquidatable
      await rebalancePool.updateLiquidatableCollateralRatio(ethers.parseEther("3"));
      await rebalancePool.grantRole(await rebalancePool.LIQUIDATOR_ROLE(), liquidator.address);

      // liquidate
      await expect(rebalancePool.connect(liquidator).liquidate(ethers.parseEther("200"), 0))
        .to.emit(rebalancePool, "Liquidate")
        .withArgs(ethers.parseEther("200"), ethers.parseEther("0.2"));
      expect(await rebalancePool.totalSupply()).to.eq(amountIn - ethers.parseEther("200"));
      expect(await rebalancePool.balanceOf(signer.address)).to.closeTo(amountIn - ethers.parseEther("200"), 1e6);
      // expect((await rebalancePool.epochState()).prod).to.closeTo(ethers.parseEther("0.98"), 100);
      // expect((await rebalancePool.epochState()).epoch).to.eq(0);
      // expect((await rebalancePool.epochState()).scale).to.eq(0);

      expect(await rebalancePool.claimable(signer.address, weth.getAddress())).to.closeTo(
        ethers.parseEther("0.2"),
        1000000
      );

      // deposit again
      await expect(rebalancePool.deposit(ethers.parseEther("100"), signer.address)).to.emit(
        rebalancePool,
        "UserDepositChange"
      );
      expect(await rebalancePool.totalSupply()).to.eq(amountIn - ethers.parseEther("100"));
      expect(await rebalancePool.balanceOf(signer.address)).to.closeTo(amountIn - ethers.parseEther("100"), 1e6);
      expect(await rebalancePool.claimable(signer.address, weth.getAddress())).to.closeTo(
        ethers.parseEther("0.2"),
        1000000
      );

      // claim
      await expect(rebalancePool.connect(signer)["claim()"]()).to.emit(rebalancePool, "Claim");
      expect(await weth.balanceOf(signer.address)).to.closeTo(ethers.parseEther("0.2"), 100000);
      expect(await rebalancePool.claimable(signer.address, weth.getAddress())).to.eq(0n);
    });

    it("should succed, when multiple deposit and liquidate", async () => {
      await fToken.approve(rebalancePool.getAddress(), MaxUint256);
      const amountIn1 = ethers.parseEther("10000");
      const amountIn2 = ethers.parseEther("1000");

      // deposit to signer
      await rebalancePool.deposit(amountIn1, signer.address);
      // deposit to self
      await rebalancePool.deposit(amountIn2, deployer.address);

      // current collateral ratio is 200%, make 300% as liquidatable
      await rebalancePool.updateLiquidatableCollateralRatio(ethers.parseEther("3"));
      await rebalancePool.grantRole(await rebalancePool.LIQUIDATOR_ROLE(), liquidator.address);

      // liquidate
      await expect(rebalancePool.connect(liquidator).liquidate(ethers.parseEther("200"), 0))
        .to.emit(rebalancePool, "Liquidate")
        .withArgs(ethers.parseEther("200"), ethers.parseEther("0.2"));
      expect(await rebalancePool.totalSupply()).to.eq(amountIn1 + amountIn2 - ethers.parseEther("200"));
      expect(await rebalancePool.balanceOf(signer.address)).to.closeTo(
        amountIn1 - (ethers.parseEther("200") * amountIn1) / (amountIn1 + amountIn2),
        1e6
      );
      expect(await rebalancePool.balanceOf(deployer.address)).to.closeTo(
        amountIn2 - (ethers.parseEther("200") * amountIn2) / (amountIn1 + amountIn2),
        1e6
      );
      /*
      expect((await rebalancePool.epochState()).prod).to.closeTo(
        ethers.parseEther("0.981818181818181818"), // 108/110
        100
      );
      expect((await rebalancePool.epochState()).epoch).to.eq(0);
      expect((await rebalancePool.epochState()).scale).to.eq(0);
      */

      expect(await rebalancePool.claimable(signer.address, weth.getAddress())).to.closeTo(
        (ethers.parseEther("0.2") * amountIn1) / (amountIn1 + amountIn2),
        1000000
      );
      expect(await rebalancePool.claimable(deployer.address, weth.getAddress())).to.closeTo(
        (ethers.parseEther("0.2") * amountIn2) / (amountIn1 + amountIn2),
        1000000
      );
    });
  });

  /*
  context("deposit, unlock and liquidate and withdraw", async () => {
    beforeEach(async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await weth.deposit({ value: ethers.parseEther("100") });

      await weth.approve(market.getAddress(), MaxUint256);
      await market.mint(ethers.parseEther("100"), deployer.address, 0, 0);
    });

    it("should succeed, when single deposit, unlock half, liquidate partial, withdraw", async () => {
      await fToken.approve(rebalancePool.getAddress(), MaxUint256);
      const amountIn = ethers.parseEther("10000");
      const unlockAmount = ethers.parseEther("2000");

      // deposit
      await rebalancePool.deposit(amountIn, signer.address);

      // unlock
      await rebalancePool.connect(signer).unlock(unlockAmount);
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      expect(await rebalancePool.balanceOf(signer.address)).to.eq(amountIn - unlockAmount);
      expect(await rebalancePool.unlockedBalanceOf(signer.address)).to.eq(0n);
      expect((await rebalancePool.unlockingBalanceOf(signer.address))._balance).to.eq(unlockAmount);
      expect((await rebalancePool.unlockingBalanceOf(signer.address))._unlockAt).to.eq(timestamp + 86400 * 14);
      expect(await rebalancePool.totalSupply()).to.eq(amountIn - unlockAmount);
      expect(await rebalancePool.totalUnlocking()).to.eq(unlockAmount);

      // 14 days later
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 14]);
      await network.provider.send("evm_mine", []);
      expect(await rebalancePool.unlockedBalanceOf(signer.address)).to.eq(unlockAmount);
      expect((await rebalancePool.unlockingBalanceOf(signer.address))._balance).to.eq(ZeroAddress);

      // current collateral ratio is 200%, make 300% as liquidatable
      await rebalancePool.updateLiquidatableCollateralRatio(ethers.parseEther("3"));
      await rebalancePool.grantRole(await rebalancePool.LIQUIDATOR_ROLE(), liquidator.address);

      // liquidate
      await expect(rebalancePool.connect(liquidator).liquidate(ethers.parseEther("200"), 0))
        .to.emit(rebalancePool, "Liquidate")
        .withArgs(ethers.parseEther("200"), ethers.parseEther("0.2"));
      expect(await rebalancePool.totalSupply()).to.closeTo(((amountIn - unlockAmount) * 98n) / 100n, 1e6);
      expect(await rebalancePool.totalUnlocking()).to.closeTo((unlockAmount * 98n) / 100n, 1e6);
      expect(await rebalancePool.balanceOf(signer.address)).to.closeTo(((amountIn - unlockAmount) * 98n) / 100n, 1e6);
      expect(await rebalancePool.unlockedBalanceOf(signer.address)).to.closeTo((unlockAmount * 98n) / 100n, 1e6);
      expect((await rebalancePool.epochState()).prod).to.closeTo(ethers.parseEther("0.98"), 100);
      expect((await rebalancePool.epochState()).epoch).to.eq(0);
      expect((await rebalancePool.epochState()).scale).to.eq(0);

      expect(await rebalancePool.claimable(signer.address, weth.getAddress())).to.closeTo(
        ethers.parseEther("0.2"),
        1000000
      );

      // claim
      await expect(rebalancePool.connect(signer)["claim(address,bool)"](weth.getAddress(), false)).to.emit(
        rebalancePool,
        "Claim"
      );
      expect(await weth.balanceOf(signer.address)).to.closeTo(ethers.parseEther("0.2"), 100000);
      expect(await rebalancePool.claimable(signer.address, weth.getAddress())).to.eq(0n);

      // withdraw unlocked
      await expect(rebalancePool.connect(signer).withdrawUnlocked(false, false)).to.emit(
        rebalancePool,
        "WithdrawUnlocked"
      );
      expect(await fToken.balanceOf(signer.address)).to.closeTo((unlockAmount * 98n) / 100n, 1e6);
      expect(await rebalancePool.totalUnlocking()).to.closeTo(0n, 1e6);
      expect(await rebalancePool.unlockedBalanceOf(signer.address)).to.closeTo(0n, 1e6);
    });

    it("should succeed, when multiple deposit, unlock half, liquidate partial", async () => {
      await fToken.approve(rebalancePool.getAddress(), MaxUint256);
      const amountInA = ethers.parseEther("11000");
      const unlockAmountA = ethers.parseEther("2000");
      const amountInB = ethers.parseEther("9000");
      const unlockAmountB = ethers.parseEther("7000");

      // deposit
      await rebalancePool.deposit(amountInA, userA.address);
      await rebalancePool.deposit(amountInB, userB.address);

      // A unlock
      await rebalancePool.connect(userA).unlock(unlockAmountA);
      const timestampA = (await ethers.provider.getBlock("latest"))!.timestamp;
      expect(await rebalancePool.balanceOf(userA.address)).to.eq(amountInA - unlockAmountA);
      expect(await rebalancePool.unlockedBalanceOf(userA.address)).to.eq(0n);
      expect((await rebalancePool.unlockingBalanceOf(userA.address))._balance).to.eq(unlockAmountA);
      expect((await rebalancePool.unlockingBalanceOf(userA.address))._unlockAt).to.eq(timestampA + 86400 * 14);
      expect(await rebalancePool.totalSupply()).to.eq(amountInA + amountInB - unlockAmountA);
      expect(await rebalancePool.totalUnlocking()).to.eq(unlockAmountA);

      // B unlock
      await rebalancePool.connect(userB).unlock(unlockAmountB);
      const timestampB = (await ethers.provider.getBlock("latest"))!.timestamp;
      expect(await rebalancePool.balanceOf(userB.address)).to.eq(amountInB - unlockAmountB);
      expect(await rebalancePool.unlockedBalanceOf(userB.address)).to.eq(0n);
      expect((await rebalancePool.unlockingBalanceOf(userB.address))._balance).to.eq(unlockAmountB);
      expect((await rebalancePool.unlockingBalanceOf(userB.address))._unlockAt).to.eq(timestampB + 86400 * 14);
      expect(await rebalancePool.totalSupply()).to.eq(amountInA + amountInB - unlockAmountA - unlockAmountB);
      expect(await rebalancePool.totalUnlocking()).to.eq(unlockAmountA + unlockAmountB);

      // 14 days later
      await network.provider.send("evm_setNextBlockTimestamp", [timestampB + 86400 * 14]);
      await network.provider.send("evm_mine", []);
      expect(await rebalancePool.unlockedBalanceOf(userA.address)).to.eq(unlockAmountA);
      expect((await rebalancePool.unlockingBalanceOf(userA.address))._balance).to.eq(ZeroAddress);
      expect(await rebalancePool.unlockedBalanceOf(userB.address)).to.eq(unlockAmountB);
      expect((await rebalancePool.unlockingBalanceOf(userB.address))._balance).to.eq(ZeroAddress);

      // current collateral ratio is 200%, make 300% as liquidatable
      await rebalancePool.updateLiquidatableCollateralRatio(ethers.parseEther("3"));
      await rebalancePool.grantRole(await rebalancePool.LIQUIDATOR_ROLE(), liquidator.address);

      // liquidate
      await expect(rebalancePool.connect(liquidator).liquidate(ethers.parseEther("200"), 0))
        .to.emit(rebalancePool, "Liquidate")
        .withArgs(ethers.parseEther("200"), ethers.parseEther("0.2"));
      expect(await rebalancePool.totalSupply()).to.closeTo(
        ((amountInA + amountInB - unlockAmountA - unlockAmountB) * 99n) / 100n,
        1e6
      );
      expect(await rebalancePool.totalUnlocking()).to.closeTo(((unlockAmountA + unlockAmountB) * 99n) / 100n, 1e6);
      expect(await rebalancePool.balanceOf(userA.address)).to.closeTo(((amountInA - unlockAmountA) * 99n) / 100n, 1e6);
      expect(await rebalancePool.balanceOf(userB.address)).to.closeTo(((amountInB - unlockAmountB) * 99n) / 100n, 1e6);
      expect(await rebalancePool.unlockedBalanceOf(userA.address)).to.closeTo((unlockAmountA * 99n) / 100n, 1e6);
      expect(await rebalancePool.unlockedBalanceOf(userB.address)).to.closeTo((unlockAmountB * 99n) / 100n, 1e6);
      expect((await rebalancePool.epochState()).prod).to.closeTo(ethers.parseEther("0.99"), 100);
      expect((await rebalancePool.epochState()).epoch).to.eq(0);
      expect((await rebalancePool.epochState()).scale).to.eq(0);

      expect(await rebalancePool.claimable(userA.address, weth.getAddress())).to.closeTo(
        (ethers.parseEther("0.2") * 11n) / 20n,
        1000000
      );
      expect(await rebalancePool.claimable(userB.address, weth.getAddress())).to.closeTo(
        (ethers.parseEther("0.2") * 9n) / 20n,
        1000000
      );
    });
  });
  */
});

// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IAccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/IAccessControlUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { Test } from "forge-std/Test.sol";

import { IMultipleRewardAccumulator } from "../../../contracts/common/rewards/accumulator/IMultipleRewardAccumulator.sol";
import { FxUSDShareableRebalancePoolWindDown } from "../../../contracts/f(x)/wind-down/FxUSDShareableRebalancePoolWindDown.sol";
import { WrappedTokenTreasuryV2WindDown } from "../../../contracts/f(x)/wind-down/WrappedTokenTreasuryV2WindDown.sol";
import { FxUSD } from "../../../contracts/f(x)/v2/FxUSD.sol";
import { MarketV2 } from "../../../contracts/f(x)/v2/MarketV2.sol";
import { TreasuryV2 } from "../../../contracts/f(x)/v2/TreasuryV2.sol";
import { IFxBoostableRebalancePool } from "../../../contracts/interfaces/f(x)/IFxBoostableRebalancePool.sol";
import { IFxFractionalTokenV2 } from "../../../contracts/interfaces/f(x)/IFxFractionalTokenV2.sol";
import { IFxLeveragedTokenV2 } from "../../../contracts/interfaces/f(x)/IFxLeveragedTokenV2.sol";
import { IFxTreasuryV2 } from "../../../contracts/interfaces/f(x)/IFxTreasuryV2.sol";
import { IFxUSD } from "../../../contracts/interfaces/f(x)/IFxUSD.sol";

interface IWindDownPool {
  function windDown(uint256 expectedAssetBalance, uint256 minBaseOut)
    external
    returns (uint256 liquidated, uint256 baseOut);
}

contract EzETHWindDownForkTest is Test {
  string internal constant DEFAULT_MAINNET_RPC_URL = "https://eth.rpc.blxrbdn.com";

  bytes32 internal constant DEFAULT_ADMIN_ROLE = bytes32(0);
  bytes32 internal constant IMPLEMENTATION_SLOT =
    0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

  address internal constant FX_MULTISIG = 0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF;

  address internal constant EZETH = 0xbf5495Efe5DB9ce00f80364C8B423567e58d2110;
  address internal constant EZ_TREASURY = 0x38965311507D4E54973F81475a149c09376e241e;
  address internal constant EZ_MARKET = 0x69518D1D70AD537C41401303BDf96032338E40dE;
  address internal constant FEZETH = 0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9;
  address internal constant XEZETH = 0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5;
  address internal constant EZ_REBALANCE_POOL = 0xf58c499417e36714e99803Cb135f507a95ae7169;
  address internal constant XEZ_REBALANCE_POOL = 0xBa947cba270D30967369Bf1f73884Be2533d7bDB;
  address internal constant RUSD = 0x65D72AA8DA931F047169112fcf34f52DbaAE7D18;

  address internal constant WEETH = 0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee;
  address internal constant WEETH_TREASURY = 0x781BA968d5cc0b40EB592D5c8a9a3A4000063885;
  address internal constant FEETH = 0x9216272158F563488FfC36AFB877acA2F265C560;
  address internal constant XEETH = 0xACB3604AaDF26e6C0bb8c720420380629A328d2C;

  address internal constant POOL_DEPOSITOR_A = 0x000000000000000000000000000000000000a001;
  address internal constant POOL_DEPOSITOR_B = 0x000000000000000000000000000000000000B002;

  uint256 internal constant TEST_FTOKEN_AMOUNT = 1 ether;
  uint256 internal constant TEST_XTOKEN_AMOUNT = 1 ether;

  function setUp() public {
    string memory rpcUrl = vm.envOr("MAINNET_RPC_URL", DEFAULT_MAINNET_RPC_URL);
    uint256 forkBlock = vm.envOr("EZETH_WINDDOWN_FORK_BLOCK", uint256(0));
    if (forkBlock == 0) vm.createSelectFork(rpcUrl);
    else vm.createSelectFork(rpcUrl, forkBlock);
  }

  function testFork_EzETHWindDownTreasuryAndPools() public {
    assertEq(IFxBoostableRebalancePool(EZ_REBALANCE_POOL).asset(), FEZETH, "ez pool asset");
    assertEq(IFxBoostableRebalancePool(XEZ_REBALANCE_POOL).asset(), FEZETH, "xez pool current asset");
    assertTrue(
      FxUSDShareableRebalancePoolWindDown(XEZ_REBALANCE_POOL).wrapper() != XEZ_REBALANCE_POOL,
      "xez pool wrapper configured"
    );

    address oldFxUsdImpl = _implementation(RUSD);
    address oldMarketImpl = _implementation(EZ_MARKET);
    address oldTreasuryImpl = _implementation(EZ_TREASURY);
    address oldWeEthTreasuryImpl = _implementation(WEETH_TREASURY);
    address oldEzPoolImpl = _implementation(EZ_REBALANCE_POOL);
    address oldXezPoolImpl = _implementation(XEZ_REBALANCE_POOL);

    _fundUserAndDepositToPools();
    _upgradeFxUsdAndWindDownContracts();
    _assertImplementationScope(
      oldFxUsdImpl,
      oldMarketImpl,
      oldTreasuryImpl,
      oldWeEthTreasuryImpl,
      oldEzPoolImpl,
      oldXezPoolImpl
    );
    _assertBeforeInitGuards();
    _setMarketRedeemFeesZero();
    _initializeWindDownWithNavWeights();
    _replaceEzEthRUsdBackingWithWeEth();
    _removeEzEthMarketAndPools();
    _assertWindDownGuards();
    _redeemUserFToken();
    _redeemUserXToken();
    _windDownEzPoolAndClaim();
    _windDownXezPoolAndClaim();
    _redeemRemainingTotalSupplyFromMarket();

    assertLe(
      WrappedTokenTreasuryV2WindDown(EZ_TREASURY).windDownBaseClaimed(),
      WrappedTokenTreasuryV2WindDown(EZ_TREASURY).windDownBaseBalance(),
      "claim cap"
    );
    _finalizeWindDownAndAdminClaim();
  }

  function _assertImplementationScope(
    address oldFxUsdImpl,
    address oldMarketImpl,
    address oldTreasuryImpl,
    address oldWeEthTreasuryImpl,
    address oldEzPoolImpl,
    address oldXezPoolImpl
  ) internal view {
    assertTrue(_implementation(RUSD) != oldFxUsdImpl, "rUSD impl changed");
    assertTrue(_implementation(EZ_TREASURY) != oldTreasuryImpl, "treasury impl changed");
    assertTrue(_implementation(EZ_REBALANCE_POOL) != oldEzPoolImpl, "ez pool impl changed");
    assertTrue(_implementation(XEZ_REBALANCE_POOL) != oldXezPoolImpl, "xez pool impl changed");
    assertEq(_implementation(EZ_MARKET), oldMarketImpl, "market impl unchanged");
    assertEq(_implementation(WEETH_TREASURY), oldWeEthTreasuryImpl, "weETH treasury impl unchanged");
  }

  function _fundUserAndDepositToPools() internal {
    uint256 fSupplyBefore = IERC20Upgradeable(FEZETH).totalSupply();
    uint256 xSupplyBefore = IERC20Upgradeable(XEZETH).totalSupply();

    _moveTokenBalanceWithDeal(FEZETH, EZ_REBALANCE_POOL, address(this), TEST_FTOKEN_AMOUNT * 2);
    deal(XEZETH, address(this), TEST_XTOKEN_AMOUNT * 2, false);

    assertEq(IERC20Upgradeable(FEZETH).totalSupply(), fSupplyBefore, "deal f supply unchanged");
    assertEq(IERC20Upgradeable(XEZETH).totalSupply(), xSupplyBefore, "deal x supply unchanged");

    _fundAndDepositToPool(EZ_REBALANCE_POOL, POOL_DEPOSITOR_A);
    _fundAndDepositToPool(EZ_REBALANCE_POOL, POOL_DEPOSITOR_B);
    _fundAndDepositToPool(XEZ_REBALANCE_POOL, POOL_DEPOSITOR_A);
    _fundAndDepositToPool(XEZ_REBALANCE_POOL, POOL_DEPOSITOR_B);
    assertEq(IERC20Upgradeable(FEZETH).totalSupply(), fSupplyBefore, "pool deposits f supply unchanged");
    assertEq(IERC20Upgradeable(XEZETH).totalSupply(), xSupplyBefore, "pool deposits x supply unchanged");
  }

  function _fundAndDepositToPool(address _pool, address _depositor) internal {
    _moveTokenBalanceWithDeal(FEZETH, _pool, _depositor, TEST_FTOKEN_AMOUNT);
    vm.startPrank(_depositor);
    IERC20Upgradeable(FEZETH).approve(_pool, TEST_FTOKEN_AMOUNT);
    IFxBoostableRebalancePool(_pool).deposit(TEST_FTOKEN_AMOUNT, _depositor);
    vm.stopPrank();
  }

  function _moveTokenBalanceWithDeal(
    address _token,
    address _from,
    address _to,
    uint256 _amount
  ) internal {
    uint256 supplyBefore = IERC20Upgradeable(_token).totalSupply();
    uint256 fromBalance = IERC20Upgradeable(_token).balanceOf(_from);
    uint256 toBalance = IERC20Upgradeable(_token).balanceOf(_to);

    assertGe(fromBalance, _amount, "deal source balance");

    deal(_token, _from, fromBalance - _amount, false);
    deal(_token, _to, toBalance + _amount, false);
    assertEq(IERC20Upgradeable(_token).totalSupply(), supplyBefore, "deal supply unchanged");
  }

  function _assertWindDownGuards() internal {
    WrappedTokenTreasuryV2WindDown treasury = WrappedTokenTreasuryV2WindDown(EZ_TREASURY);
    assertEq(uint256(treasury.windDownStatus()), 1, "treasury wind-down status");

    vm.prank(EZ_MARKET);
    vm.expectRevert();
    treasury.mintFToken(1, address(this));

    IERC20Upgradeable(FEZETH).approve(EZ_REBALANCE_POOL, 1);
    vm.expectRevert();
    IFxBoostableRebalancePool(EZ_REBALANCE_POOL).deposit(1, address(this));
  }

  function _assertBeforeInitGuards() internal {
    WrappedTokenTreasuryV2WindDown treasury = WrappedTokenTreasuryV2WindDown(EZ_TREASURY);
    assertEq(uint256(treasury.windDownStatus()), 0, "treasury before-init status");

    vm.prank(EZ_MARKET);
    vm.expectRevert(WrappedTokenTreasuryV2WindDown.ErrorWindDownNotAllowed.selector);
    treasury.mintFToken(1, address(this));

    IERC20Upgradeable(FEZETH).approve(EZ_MARKET, 1);
    vm.expectRevert(WrappedTokenTreasuryV2WindDown.ErrorWindDownNotStarted.selector);
    MarketV2(EZ_MARKET).redeemFToken(1, address(this), 0);
  }

  function _redeemUserFToken() internal {
    WrappedTokenTreasuryV2WindDown treasury = WrappedTokenTreasuryV2WindDown(EZ_TREASURY);
    uint256 expectedUserOut = treasury.windDownPreviewRedeem(TEST_FTOKEN_AMOUNT, 0);
    uint256 userBaseBefore = IERC20Upgradeable(EZETH).balanceOf(address(this));

    IERC20Upgradeable(FEZETH).approve(EZ_MARKET, TEST_FTOKEN_AMOUNT * 2);
    (uint256 firstUserOut, ) = MarketV2(EZ_MARKET).redeemFToken(
      TEST_FTOKEN_AMOUNT,
      address(this),
      expectedUserOut
    );
    (uint256 secondUserOut, ) = MarketV2(EZ_MARKET).redeemFToken(
      TEST_FTOKEN_AMOUNT,
      address(this),
      expectedUserOut
    );

    assertEq(firstUserOut, expectedUserOut, "first user redeem fixed rate");
    assertEq(secondUserOut, firstUserOut, "second user redeem same rate");
    assertEq(
      IERC20Upgradeable(EZETH).balanceOf(address(this)) - userBaseBefore,
      firstUserOut + secondUserOut,
      "user ezETH received"
    );
  }

  function _redeemUserXToken() internal {
    WrappedTokenTreasuryV2WindDown treasury = WrappedTokenTreasuryV2WindDown(EZ_TREASURY);
    uint256 expectedUserOut = treasury.windDownPreviewRedeem(0, TEST_XTOKEN_AMOUNT);
    uint256 userBaseBefore = IERC20Upgradeable(EZETH).balanceOf(address(this));

    IERC20Upgradeable(XEZETH).approve(EZ_MARKET, TEST_XTOKEN_AMOUNT * 2);
    uint256 firstUserOut = MarketV2(EZ_MARKET).redeemXToken(TEST_XTOKEN_AMOUNT, address(this), expectedUserOut);
    uint256 secondUserOut = MarketV2(EZ_MARKET).redeemXToken(TEST_XTOKEN_AMOUNT, address(this), expectedUserOut);

    assertEq(firstUserOut, expectedUserOut, "first user x redeem fixed rate");
    assertEq(secondUserOut, firstUserOut, "second user x redeem same rate");
    assertEq(
      IERC20Upgradeable(EZETH).balanceOf(address(this)) - userBaseBefore,
      firstUserOut + secondUserOut,
      "user x redeem ezETH received"
    );
  }

  function _windDownEzPoolAndClaim() internal {
    WrappedTokenTreasuryV2WindDown treasury = WrappedTokenTreasuryV2WindDown(EZ_TREASURY);
    uint256 ezPoolAsset = IERC20Upgradeable(FEZETH).balanceOf(EZ_REBALANCE_POOL);
    uint256 ezPoolExpectedOut = treasury.windDownPreviewRedeem(ezPoolAsset, 0);
    uint256 ezPoolBaseBefore = IERC20Upgradeable(EZETH).balanceOf(EZ_REBALANCE_POOL);

    vm.prank(FX_MULTISIG);
    (uint256 ezLiquidated, uint256 ezBaseOut) = IWindDownPool(EZ_REBALANCE_POOL).windDown(
      ezPoolAsset,
      ezPoolExpectedOut
    );

    assertEq(ezLiquidated, ezPoolAsset, "ez pool liquidated");
    assertEq(ezBaseOut, ezPoolExpectedOut, "ez pool base out");
    assertEq(IERC20Upgradeable(FEZETH).balanceOf(EZ_REBALANCE_POOL), 0, "ez pool asset cleared");
    assertEq(
      IERC20Upgradeable(EZETH).balanceOf(EZ_REBALANCE_POOL) - ezPoolBaseBefore,
      ezPoolExpectedOut,
      "ez pool reward"
    );
    uint256 firstClaim = _claimPoolReward(EZ_REBALANCE_POOL, POOL_DEPOSITOR_A);
    uint256 secondClaim = _claimPoolReward(EZ_REBALANCE_POOL, POOL_DEPOSITOR_B);
    assertEq(secondClaim, firstClaim, "ez pool second claim same rate");
  }

  function _windDownXezPoolAndClaim() internal {
    WrappedTokenTreasuryV2WindDown treasury = WrappedTokenTreasuryV2WindDown(EZ_TREASURY);
    uint256 xPoolAsset = IERC20Upgradeable(FEZETH).balanceOf(XEZ_REBALANCE_POOL);
    uint256 xPoolExpectedOut = treasury.windDownPreviewRedeem(xPoolAsset, 0);
    uint256 xPoolBaseBefore = IERC20Upgradeable(EZETH).balanceOf(XEZ_REBALANCE_POOL);
    uint256 xPoolXTokenBefore = IERC20Upgradeable(XEZETH).balanceOf(XEZ_REBALANCE_POOL);

    vm.prank(FX_MULTISIG);
    (uint256 xLiquidated, uint256 xBaseOut) = IWindDownPool(XEZ_REBALANCE_POOL).windDown(
      xPoolAsset,
      xPoolExpectedOut
    );

    assertEq(xLiquidated, xPoolAsset, "x pool liquidated");
    assertEq(xBaseOut, xPoolExpectedOut, "x pool base out");
    assertEq(IERC20Upgradeable(FEZETH).balanceOf(XEZ_REBALANCE_POOL), 0, "x pool asset cleared");
    assertEq(
      IERC20Upgradeable(XEZETH).balanceOf(XEZ_REBALANCE_POOL),
      xPoolXTokenBefore,
      "x pool wrapper bypassed"
    );
    assertEq(
      IERC20Upgradeable(EZETH).balanceOf(XEZ_REBALANCE_POOL) - xPoolBaseBefore,
      xPoolExpectedOut,
      "x pool ezETH reward"
    );

    uint256 firstClaim = _claimPoolReward(XEZ_REBALANCE_POOL, POOL_DEPOSITOR_A);
    uint256 secondClaim = _claimPoolReward(XEZ_REBALANCE_POOL, POOL_DEPOSITOR_B);
    assertEq(secondClaim, firstClaim, "x pool second claim same rate");
  }

  function _redeemRemainingTotalSupplyFromMarket() internal {
    WrappedTokenTreasuryV2WindDown treasury = WrappedTokenTreasuryV2WindDown(EZ_TREASURY);
    uint256 xSupply = IERC20Upgradeable(XEZETH).totalSupply();
    uint256 expectedXOut = treasury.windDownPreviewRedeem(0, xSupply);
    uint256 userBaseBefore = IERC20Upgradeable(EZETH).balanceOf(address(this));

    assertGt(xSupply, 0, "remaining x supply");

    deal(XEZETH, address(this), xSupply, false);
    assertEq(IERC20Upgradeable(XEZETH).totalSupply(), xSupply, "deal x full supply unchanged");

    IERC20Upgradeable(XEZETH).approve(EZ_MARKET, xSupply);
    uint256 xOut = MarketV2(EZ_MARKET).redeemXToken(xSupply, address(this), expectedXOut);

    uint256 fSupply = IERC20Upgradeable(FEZETH).totalSupply();
    uint256 fOut;
    if (fSupply == 0) {
      assertEq(fSupply, 0, "f supply already fully redeemed");
    } else {
      uint256 expectedFOut = treasury.windDownPreviewRedeem(fSupply, 0);
      deal(FEZETH, address(this), fSupply, false);
      assertEq(IERC20Upgradeable(FEZETH).totalSupply(), fSupply, "deal f full supply unchanged");

      IERC20Upgradeable(FEZETH).approve(EZ_MARKET, fSupply);
      (fOut, ) = MarketV2(EZ_MARKET).redeemFToken(fSupply, address(this), expectedFOut);
      assertEq(fOut, expectedFOut, "remaining f supply redeem fixed rate");
      assertEq(IERC20Upgradeable(FEZETH).totalSupply(), 0, "f supply fully redeemed");
    }

    assertEq(xOut, expectedXOut, "remaining x supply redeem fixed rate");
    assertEq(IERC20Upgradeable(XEZETH).totalSupply(), 0, "x supply fully redeemed");
    assertEq(
      IERC20Upgradeable(EZETH).balanceOf(address(this)) - userBaseBefore,
      xOut + fOut,
      "remaining supply ezETH received"
    );
  }

  function _finalizeWindDownAndAdminClaim() internal {
    uint256 treasuryBaseBalance = IERC20Upgradeable(EZETH).balanceOf(EZ_TREASURY);
    uint256 adminBaseBefore = IERC20Upgradeable(EZETH).balanceOf(FX_MULTISIG);

    vm.startPrank(FX_MULTISIG);
    WrappedTokenTreasuryV2WindDown(EZ_TREASURY).finalizeWindDown();
    WrappedTokenTreasuryV2WindDown(EZ_TREASURY).adminClaim();
    vm.stopPrank();

    assertEq(uint256(WrappedTokenTreasuryV2WindDown(EZ_TREASURY).windDownStatus()), 2, "treasury finalized");
    assertEq(IERC20Upgradeable(EZETH).balanceOf(EZ_TREASURY), 0, "treasury base swept");
    assertEq(
      IERC20Upgradeable(EZETH).balanceOf(FX_MULTISIG),
      adminBaseBefore + treasuryBaseBalance,
      "admin receives treasury base"
    );

    uint256 ezPoolClaimed = _adminClaimPoolRewardBalances(EZ_REBALANCE_POOL);
    uint256 xezPoolClaimed = _adminClaimPoolRewardBalances(XEZ_REBALANCE_POOL);

    assertGt(ezPoolClaimed, 0, "ez pool admin claim");
    assertGt(xezPoolClaimed, 0, "x pool admin claim");
  }

  function _adminClaimPoolRewardBalances(address _pool) internal returns (uint256 totalClaimed) {
    address[] memory activeRewardTokens = FxUSDShareableRebalancePoolWindDown(_pool).getActiveRewardTokens();
    address[] memory historicalRewardTokens = FxUSDShareableRebalancePoolWindDown(_pool).getHistoricalRewardTokens();
    address[] memory rewardTokens = new address[](activeRewardTokens.length + historicalRewardTokens.length);
    uint256[] memory poolBalances = new uint256[](rewardTokens.length);
    uint256[] memory adminBalances = new uint256[](rewardTokens.length);

    for (uint256 i = 0; i < activeRewardTokens.length; i++) {
      rewardTokens[i] = activeRewardTokens[i];
    }
    for (uint256 i = 0; i < historicalRewardTokens.length; i++) {
      rewardTokens[activeRewardTokens.length + i] = historicalRewardTokens[i];
    }

    for (uint256 i = 0; i < rewardTokens.length; i++) {
      poolBalances[i] = IERC20Upgradeable(rewardTokens[i]).balanceOf(_pool);
      adminBalances[i] = IERC20Upgradeable(rewardTokens[i]).balanceOf(FX_MULTISIG);
      totalClaimed += poolBalances[i];
    }

    vm.prank(FX_MULTISIG);
    FxUSDShareableRebalancePoolWindDown(_pool).adminClaim();

    for (uint256 i = 0; i < rewardTokens.length; i++) {
      assertEq(IERC20Upgradeable(rewardTokens[i]).balanceOf(_pool), 0, "pool reward swept");
      assertEq(
        IERC20Upgradeable(rewardTokens[i]).balanceOf(FX_MULTISIG),
        adminBalances[i] + poolBalances[i],
        "admin receives pool reward"
      );
    }
  }

  function _upgradeFxUsdAndWindDownContracts() internal {
    assertTrue(IAccessControlUpgradeable(RUSD).hasRole(DEFAULT_ADMIN_ROLE, FX_MULTISIG), "fx multisig rUSD admin");
    assertTrue(
      IAccessControlUpgradeable(EZ_TREASURY).hasRole(DEFAULT_ADMIN_ROLE, FX_MULTISIG),
      "fx multisig treasury admin"
    );
    assertTrue(
      IAccessControlUpgradeable(EZ_REBALANCE_POOL).hasRole(DEFAULT_ADMIN_ROLE, FX_MULTISIG),
      "fx multisig ez pool admin"
    );
    assertTrue(
      IAccessControlUpgradeable(XEZ_REBALANCE_POOL).hasRole(DEFAULT_ADMIN_ROLE, FX_MULTISIG),
      "fx multisig xez pool admin"
    );

    FxUSDShareableRebalancePoolWindDown ezPool = FxUSDShareableRebalancePoolWindDown(EZ_REBALANCE_POOL);
    FxUSDShareableRebalancePoolWindDown xezPool = FxUSDShareableRebalancePoolWindDown(XEZ_REBALANCE_POOL);
    FxUSD fxUsdImpl = new FxUSD();
    WrappedTokenTreasuryV2WindDown treasuryImpl = new WrappedTokenTreasuryV2WindDown(EZETH, FEZETH, XEZETH);
    FxUSDShareableRebalancePoolWindDown poolImpl = new FxUSDShareableRebalancePoolWindDown(
      ezPool.fxn(),
      ezPool.ve(),
      ezPool.veHelper(),
      ezPool.minter()
    );

    assertEq(ezPool.fxn(), xezPool.fxn(), "pool fxn immutable");
    assertEq(ezPool.ve(), xezPool.ve(), "pool ve immutable");
    assertEq(ezPool.veHelper(), xezPool.veHelper(), "pool helper immutable");
    assertEq(ezPool.minter(), xezPool.minter(), "pool minter immutable");

    _setImplementation(RUSD, address(fxUsdImpl));
    _setImplementation(EZ_TREASURY, address(treasuryImpl));
    _setImplementation(EZ_REBALANCE_POOL, address(poolImpl));
    _setImplementation(XEZ_REBALANCE_POOL, address(poolImpl));
  }

  function _setMarketRedeemFeesZero() internal {
    assertTrue(
      IAccessControlUpgradeable(EZ_MARKET).hasRole(DEFAULT_ADMIN_ROLE, FX_MULTISIG),
      "fx multisig market admin"
    );

    vm.startPrank(FX_MULTISIG);
    MarketV2(EZ_MARKET).updateRedeemFeeRatio(0, 0, true);
    MarketV2(EZ_MARKET).updateRedeemFeeRatio(0, 0, false);
    vm.stopPrank();
  }

  function _initializeWindDownWithNavWeights() internal {
    uint256 baseBalance = IERC20Upgradeable(EZETH).balanceOf(EZ_TREASURY);
    uint256 fSupply = IERC20Upgradeable(FEZETH).totalSupply();
    uint256 xSupply = IERC20Upgradeable(XEZETH).totalSupply();
    uint256 fWeight = (fSupply * IFxFractionalTokenV2(FEZETH).nav()) / 1 ether;
    uint256 xWeight = (xSupply * IFxLeveragedTokenV2(XEZETH).nav()) / 1 ether;

    vm.prank(FX_MULTISIG);
    WrappedTokenTreasuryV2WindDown(EZ_TREASURY).initializeWindDown(baseBalance, fSupply, xSupply, fWeight, xWeight);

    assertEq(WrappedTokenTreasuryV2WindDown(EZ_TREASURY).windDownBaseBalance(), baseBalance, "snapshot base");
    assertEq(WrappedTokenTreasuryV2WindDown(EZ_TREASURY).windDownFSupply(), fSupply, "snapshot f supply");
    assertEq(WrappedTokenTreasuryV2WindDown(EZ_TREASURY).windDownXSupply(), xSupply, "snapshot x supply");
    assertEq(WrappedTokenTreasuryV2WindDown(EZ_TREASURY).windDownFWeight(), fWeight, "snapshot f weight");
    assertEq(WrappedTokenTreasuryV2WindDown(EZ_TREASURY).windDownXWeight(), xWeight, "snapshot x weight");
  }

  function _replaceEzEthRUsdBackingWithWeEth() internal {
    uint256 ezManaged = _managedRUsdFToken(EZETH);
    uint256 weEthManagedBefore = _managedRUsdFToken(WEETH);
    uint256 rusdFTokenBefore = IERC20Upgradeable(FEZETH).balanceOf(RUSD);
    uint256 userEzEthBefore = IERC20Upgradeable(EZETH).balanceOf(address(this));
    uint256 expectedEzEthOut = WrappedTokenTreasuryV2WindDown(EZ_TREASURY).windDownPreviewRedeem(ezManaged, 0);

    assertGt(ezManaged, 0, "rUSD ezETH managed before");
    assertGe(rusdFTokenBefore, ezManaged, "rUSD FEZETH balance covers managed");

    uint256 minted = _mintRUsdFromWeEth(ezManaged);
    assertGe(minted, ezManaged, "weETH rUSD minted");
    assertEq(_managedRUsdFToken(WEETH), weEthManagedBefore + minted, "rUSD weETH managed increased");

    (uint256 ezEthOut, ) = FxUSD(RUSD).redeem(EZETH, ezManaged, address(this), expectedEzEthOut);

    assertEq(ezEthOut, expectedEzEthOut, "rUSD ezETH redeem fixed rate");
    assertEq(
      IERC20Upgradeable(EZETH).balanceOf(address(this)) - userEzEthBefore,
      ezEthOut,
      "ezETH received"
    );
    assertEq(_managedRUsdFToken(EZETH), 0, "rUSD ezETH managed cleared");
    assertEq(IERC20Upgradeable(FEZETH).balanceOf(RUSD), rusdFTokenBefore - ezManaged, "rUSD FEZETH dust");
  }

  function _mintRUsdFromWeEth(uint256 _minRUsdOut) internal returns (uint256 _minted) {
    uint256 amountIn = _estimateWeEthIn(_minRUsdOut);
    (, , , uint256 mintCap, ) = FxUSD(RUSD).markets(WEETH);
    assertGe(mintCap, IERC20Upgradeable(FEETH).totalSupply() + _minRUsdOut, "weETH mint cap");
    _ensureWeEthTreasuryCap(amountIn);

    uint256 snapshotId = vm.snapshotState();
    deal(WEETH, address(this), amountIn, false);
    IERC20Upgradeable(WEETH).approve(RUSD, amountIn);
    _minted = FxUSD(RUSD).mint(WEETH, amountIn, address(this), 0);
    assertTrue(vm.revertToState(snapshotId), "revert weETH dry run");
    assertGt(_minted, 0, "weETH dry mint output");

    if (_minted < _minRUsdOut) {
      amountIn = (amountIn * _minRUsdOut) / _minted;
      amountIn = (amountIn * 10001) / 10000 + 1;
      _ensureWeEthTreasuryCap(amountIn);
    }

    deal(WEETH, address(this), amountIn, false);
    IERC20Upgradeable(WEETH).approve(RUSD, amountIn);
    _minted = FxUSD(RUSD).mint(WEETH, amountIn, address(this), _minRUsdOut);
  }

  function _estimateWeEthIn(uint256 _rusdOut) internal view returns (uint256) {
    uint256 oneWeEthUnderlying = IFxTreasuryV2(WEETH_TREASURY).getUnderlyingValue(1 ether);
    uint256 weEthFTokenOut = (oneWeEthUnderlying * IFxTreasuryV2(WEETH_TREASURY).currentBaseTokenPrice()) / 1 ether;
    return ((_rusdOut * 1 ether) + weEthFTokenOut - 1) / weEthFTokenOut;
  }

  function _ensureWeEthTreasuryCap(uint256 _weEthIn) internal {
    uint256 requiredCap = IFxTreasuryV2(WEETH_TREASURY).totalBaseToken() +
      IFxTreasuryV2(WEETH_TREASURY).getUnderlyingValue(_weEthIn);
    uint256 currentCap = TreasuryV2(WEETH_TREASURY).baseTokenCap();
    if (requiredCap <= currentCap) return;

    assertTrue(
      IAccessControlUpgradeable(WEETH_TREASURY).hasRole(DEFAULT_ADMIN_ROLE, FX_MULTISIG),
      "fx multisig weETH treasury admin"
    );
    vm.prank(FX_MULTISIG);
    TreasuryV2(WEETH_TREASURY).updateBaseTokenCap(requiredCap);
  }

  function _removeEzEthMarketAndPools() internal {
    assertEq(_managedRUsdFToken(EZETH), 0, "remove requires no managed ezETH");

    address[] memory pools = new address[](2);
    pools[0] = EZ_REBALANCE_POOL;
    pools[1] = XEZ_REBALANCE_POOL;

    uint256 rusdFTokenDust = IERC20Upgradeable(FEZETH).balanceOf(RUSD);
    uint256 adminFTokenBefore = IERC20Upgradeable(FEZETH).balanceOf(FX_MULTISIG);

    vm.startPrank(FX_MULTISIG);
    FxUSD(RUSD).removeMarket(EZETH);
    FxUSD(RUSD).removeRebalancePools(pools);
    vm.stopPrank();

    assertEq(IERC20Upgradeable(FEZETH).balanceOf(RUSD), 0, "rUSD FEZETH dust cleared");
    assertEq(
      IERC20Upgradeable(FEZETH).balanceOf(FX_MULTISIG),
      adminFTokenBefore + rusdFTokenDust,
      "admin receives FEZETH dust"
    );
    assertEq(_managedRUsdFToken(EZETH), 0, "removed market data cleared");
    assertFalse(_contains(FxUSD(RUSD).getMarkets(), EZETH), "ezETH market removed");
    assertFalse(_contains(FxUSD(RUSD).getRebalancePools(), EZ_REBALANCE_POOL), "ez pool removed");
    assertFalse(_contains(FxUSD(RUSD).getRebalancePools(), XEZ_REBALANCE_POOL), "xez pool removed");

    vm.expectRevert(IFxUSD.ErrorUnsupportedMarket.selector);
    FxUSD(RUSD).wrap(EZETH, 1, address(this));
    vm.expectRevert(IFxUSD.ErrorUnsupportedRebalancePool.selector);
    FxUSD(RUSD).earn(EZ_REBALANCE_POOL, 1, address(this));
  }

  function _managedRUsdFToken(address _baseToken) internal view returns (uint256 managed) {
    (, , , , managed) = FxUSD(RUSD).markets(_baseToken);
  }

  function _claimPoolReward(address _pool, address _depositor) internal returns (uint256 claimed) {
    uint256 claimable = IMultipleRewardAccumulator(_pool).claimable(_depositor, EZETH);
    uint256 balanceBefore = IERC20Upgradeable(EZETH).balanceOf(_depositor);

    assertGt(claimable, 0, "depositor claimable ezETH");

    vm.prank(_depositor);
    IMultipleRewardAccumulator(_pool).claim(_depositor, _depositor);

    claimed = IERC20Upgradeable(EZETH).balanceOf(_depositor) - balanceBefore;
    assertEq(claimed, claimable, "depositor claimed ezETH");
  }

  function _contains(address[] memory _values, address _target) internal pure returns (bool) {
    for (uint256 i = 0; i < _values.length; ++i) {
      if (_values[i] == _target) return true;
    }
    return false;
  }

  function _implementation(address proxy) internal view returns (address) {
    return address(uint160(uint256(vm.load(proxy, IMPLEMENTATION_SLOT))));
  }

  function _setImplementation(address proxy, address implementation_) internal {
    vm.store(proxy, IMPLEMENTATION_SLOT, bytes32(uint256(uint160(implementation_))));
  }
}

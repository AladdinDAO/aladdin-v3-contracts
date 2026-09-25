// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { IMultipleRewardAccumulator } from "../../../contracts/common/rewards/accumulator/IMultipleRewardAccumulator.sol";
import { EzETHWindDownForkTest } from "./EzETHWindDownFork.t.sol";

interface IPoolIntrospect {
  function totalSupply() external view returns (uint256);
  function numTotalSupplyHistory() external view returns (uint256);
  function totalSupplyHistory(uint256) external view returns (uint112 product, uint104 amount, uint40 updateAt);
  function getStakerVoteOwner(address) external view returns (address);
  function balanceOf(address) external view returns (uint256);
  function checkpoint(address) external;
  function windDown(uint256, uint256) external returns (uint256, uint256);
}

/// @dev Extends the repo's own fork test. Reuses its helpers verbatim and only adds assertions.
contract EzETHWindDownRealDepositorsTest is EzETHWindDownForkTest {
  address[6] internal EZ_VAULTS = [
    0x4A036ab673722468a8e1fCC0F74A2dD5914FD1c1,
    0x4c75A7349B20745DAf37E6C348b85E8a03F72F9A,
    0x0Fa286332b2d1bBB0c7637CD63BA742a050b5AAd,
    0x7DCe6D8752A0e2fCF3cE92e9CeAdf9857F920ACc,
    0xCbE9e9E80b5301956c12FbB40742b144f98d4e63,
    0x492550DDcc5349940A879cAf4d3CFFfaa1Ab0F64
  ];
  address[4] internal XEZ_VAULTS = [
    0xC68A2AE2b932C472Fd4Ad4367FF6e093E4E3Da8f,
    0x3b0c2E02b0F3a4f507bA8F39aB3Ea93BF4863a90,
    0x9af69159D25e213a35A2b6E7274023Da2D2bdaC6,
    0x1090988Cf5569cc811756220AC3160aA028988AA
  ];

  function _epochOf(address pool) internal view returns (uint256) {
    IPoolIntrospect p = IPoolIntrospect(pool);
    uint256 n = p.numTotalSupplyHistory();
    (uint112 product, , ) = p.totalSupplyHistory(n - 1);
    return uint256(product) >> 88;
  }

  /// @notice The repo test's own setup makes pool asset balance < pool totalSupply,
  ///         so windDown() takes the partial-loss branch and never bumps the epoch.
  function testFork_1_RepoSetupAvoidsTheFullWipeBranch() public {
    uint256 supplyBefore = IPoolIntrospect(EZ_REBALANCE_POOL).totalSupply();
    uint256 assetBefore = IERC20Upgradeable(FEZETH).balanceOf(EZ_REBALANCE_POOL);
    emit log_named_decimal_uint("production: ezPool totalSupply ", supplyBefore, 18);
    emit log_named_decimal_uint("production: ezPool fezETH bal  ", assetBefore, 18);
    assertEq(assetBefore, supplyBefore, "production: asset balance == totalSupply");

    _fundUserAndDepositToPools();

    uint256 supplyAfter = IPoolIntrospect(EZ_REBALANCE_POOL).totalSupply();
    uint256 assetAfter = IERC20Upgradeable(FEZETH).balanceOf(EZ_REBALANCE_POOL);
    emit log_named_decimal_uint("after repo setup: totalSupply ", supplyAfter, 18);
    emit log_named_decimal_uint("after repo setup: fezETH bal  ", assetAfter, 18);
    assertLt(assetAfter, supplyAfter, "repo setup: asset balance is now BELOW totalSupply");

    _upgradeFxUsdAndWindDownContracts();
    _setMarketRedeemFeesZero();
    _initializeWindDownWithNavWeights();

    uint256 epochBefore = _epochOf(EZ_REBALANCE_POOL);
    vm.prank(FX_MULTISIG);
    IPoolIntrospect(EZ_REBALANCE_POOL).windDown(assetAfter, 0);
    uint256 epochAfter = _epochOf(EZ_REBALANCE_POOL);

    emit log_named_uint("epoch before windDown", epochBefore);
    emit log_named_uint("epoch after  windDown", epochAfter);
    assertEq(epochAfter, epochBefore, "repo setup: epoch NOT bumped -> partial-loss branch");
  }

  /// @notice Production sequence (no synthetic deposits): epoch bumps and only one real depositor can claim.
  function testFork_2_RealDepositorsCannotClaim() public {
    _upgradeFxUsdAndWindDownContracts();
    _setMarketRedeemFeesZero();
    _initializeWindDownWithNavWeights();

    for (uint256 i = 0; i < EZ_VAULTS.length; i++) {
      assertTrue(
        IPoolIntrospect(EZ_REBALANCE_POOL).getStakerVoteOwner(EZ_VAULTS[i]) != address(0),
        "real depositor shares a vote owner"
      );
    }
    assertEq(
      IERC20Upgradeable(FEZETH).balanceOf(EZ_REBALANCE_POOL),
      IPoolIntrospect(EZ_REBALANCE_POOL).totalSupply(),
      "production: asset balance == totalSupply"
    );

    uint256 epochBefore = _epochOf(EZ_REBALANCE_POOL);
    uint256 poolAsset = IERC20Upgradeable(FEZETH).balanceOf(EZ_REBALANCE_POOL);
    vm.prank(FX_MULTISIG);
    IPoolIntrospect(EZ_REBALANCE_POOL).windDown(poolAsset, 0);
    uint256 epochAfter = _epochOf(EZ_REBALANCE_POOL);
    emit log_named_uint("epoch before windDown", epochBefore);
    emit log_named_uint("epoch after  windDown", epochAfter);
    assertEq(epochAfter, epochBefore + 1, "production: epoch bumped -> full-wipe branch");

    uint256 ok = 0;
    for (uint256 i = 0; i < EZ_VAULTS.length; i++) {
      try IMultipleRewardAccumulator(EZ_REBALANCE_POOL).claim(EZ_VAULTS[i], address(0)) {
        ok++;
        emit log_named_address("claim OK    ", EZ_VAULTS[i]);
      } catch {
        emit log_named_address("claim REVERT", EZ_VAULTS[i]);
      }
    }
    emit log_named_uint("ezPool real depositors able to claim", ok);
    emit log_named_decimal_uint("ezETH stranded in ezPool", IERC20Upgradeable(EZETH).balanceOf(EZ_REBALANCE_POOL), 18);
    assertEq(ok, EZ_VAULTS.length, "ALL real ezPool depositors can claim");
  }

  /// @notice Same production sequence, with checkpoint() before windDown.
  function testFork_3_WithCheckpointsAllCanClaim() public {
    _upgradeFxUsdAndWindDownContracts();
    _setMarketRedeemFeesZero();
    _initializeWindDownWithNavWeights();

    for (uint256 i = 0; i < EZ_VAULTS.length; i++) IPoolIntrospect(EZ_REBALANCE_POOL).checkpoint(EZ_VAULTS[i]);
    uint256 ezAsset = IERC20Upgradeable(FEZETH).balanceOf(EZ_REBALANCE_POOL);
    vm.prank(FX_MULTISIG);
    IPoolIntrospect(EZ_REBALANCE_POOL).windDown(ezAsset, 0);

    uint256 ok = 0;
    for (uint256 i = 0; i < EZ_VAULTS.length; i++) {
      uint256 c = IMultipleRewardAccumulator(EZ_REBALANCE_POOL).claimable(EZ_VAULTS[i], EZETH);
      uint256 b0 = IERC20Upgradeable(EZETH).balanceOf(EZ_VAULTS[i]);
      IMultipleRewardAccumulator(EZ_REBALANCE_POOL).claim(EZ_VAULTS[i], address(0));
      assertEq(IERC20Upgradeable(EZETH).balanceOf(EZ_VAULTS[i]) - b0, c, "received == claimable");
      ok++;
    }
    assertEq(ok, EZ_VAULTS.length, "all real ezPool depositors claimed");

    for (uint256 i = 0; i < XEZ_VAULTS.length; i++) IPoolIntrospect(XEZ_REBALANCE_POOL).checkpoint(XEZ_VAULTS[i]);
    uint256 xezAsset = IERC20Upgradeable(FEZETH).balanceOf(XEZ_REBALANCE_POOL);
    vm.prank(FX_MULTISIG);
    IPoolIntrospect(XEZ_REBALANCE_POOL).windDown(xezAsset, 0);
    for (uint256 i = 0; i < XEZ_VAULTS.length; i++) {
      uint256 c = IMultipleRewardAccumulator(XEZ_REBALANCE_POOL).claimable(XEZ_VAULTS[i], EZETH);
      uint256 b0 = IERC20Upgradeable(EZETH).balanceOf(XEZ_VAULTS[i]);
      IMultipleRewardAccumulator(XEZ_REBALANCE_POOL).claim(XEZ_VAULTS[i], address(0));
      assertEq(IERC20Upgradeable(EZETH).balanceOf(XEZ_VAULTS[i]) - b0, c, "received == claimable");
    }
  }
}

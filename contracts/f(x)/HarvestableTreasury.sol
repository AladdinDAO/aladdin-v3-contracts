// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import { StableCoinMath } from "./StableCoinMath.sol";
import { Treasury } from "./Treasury.sol";

// solhint-disable const-name-snakecase
// solhint-disable contract-name-camelcase
// solhint-disable no-empty-blocks

abstract contract HarvestableTreasury is Treasury {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using SafeMathUpgradeable for uint256;

  /**********
   * Events *
   **********/

  /// @notice Emitted when someone harvest pending stETH rewards.
  /// @param caller The address of caller.
  /// @param totalRewards The amount of total harvested rewards.
  /// @param rebalancePoolRewards The amount of harvested rewards distributed to stability pool.
  /// @param harvestBounty The amount of harvested rewards distributed to caller as harvest bounty.
  event Harvest(address indexed caller, uint256 totalRewards, uint256 rebalancePoolRewards, uint256 harvestBounty);

  /// @notice Emitted when the reward distribute ratio is updated.
  /// @param rebalancePoolRatio The new ratio of rewards given to stability pool.
  /// @param harvestBountyRatio The new ratio of rewards given to harvester.
  event UpdateRewardRatio(uint256 rebalancePoolRatio, uint256 harvestBountyRatio);

  /// @notice Emitted when the address of platform contract is updated.
  /// @param platform The new address of platform contract.
  event UpdatePlatform(address platform);

  /// @notice Emitted when the address of stability pool contract is updated.
  /// @param rebalancePool The new address of stability pool contract.
  event UpdateRebalancePool(address rebalancePool);

  /*************
   * Constants *
   *************/

  /// @dev The maximum ratio for harvest bounty.
  uint256 private constant MAX_HARVEST_BOUNTY = 1e17; // at most 10%

  /*************
   * Variables *
   *************/

  /// @notice The address platform contract.
  address public platform;

  /// @notice The address of RebalancePool contract.
  address public rebalancePool;

  /// @notice The ratio of rewards given to harvester.
  uint128 public harvestBountyRatio;

  /// @notice The ratio of rewards given to stability pool.
  uint128 public rebalancePoolRatio;

  /// @dev Slots for future use.
  uint256[46] private _gap;

  /***************
   * Constructor *
   ***************/

  constructor(uint256 _initialMintRatio) Treasury(_initialMintRatio) {}

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Harvest pending rewards to stability pool.
  function harvest() external {
    StableCoinMath.SwapState memory _state = _loadSwapState(SwapKind.None);
    _updateEMALeverageRatio(_state);

    address _baseToken = baseToken;

    uint256 _totalRewards = IERC20Upgradeable(_baseToken).balanceOf(address(this)).sub(
      convertToWrapped(totalBaseToken)
    );
    uint256 _harvestBounty = (harvestBountyRatio * _totalRewards) / PRECISION;
    uint256 _rebalancePoolRewards = (rebalancePoolRatio * _totalRewards) / PRECISION;

    emit Harvest(msg.sender, _totalRewards, _rebalancePoolRewards, _harvestBounty);

    if (_harvestBounty > 0) {
      _totalRewards = _totalRewards - _harvestBounty;

      IERC20Upgradeable(_baseToken).safeTransfer(msg.sender, _harvestBounty);
    }

    if (_rebalancePoolRewards > 0) {
      _totalRewards = _totalRewards - _rebalancePoolRewards;

      _distributeRebalancePoolRewards(_baseToken, _rebalancePoolRewards);
    }

    if (_totalRewards > 0) {
      IERC20Upgradeable(_baseToken).safeTransfer(platform, _totalRewards);
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the address of stability pool.
  /// @param _rebalancePool The address of new stability pool.
  function updateRebalancePool(address _rebalancePool) external onlyOwner {
    require(_rebalancePool != address(0), "zero stability pool");
    rebalancePool = _rebalancePool;

    emit UpdateRebalancePool(_rebalancePool);
  }

  /// @notice Update the address of platform contract.
  /// @param _platform The address of new platform contract.
  function updatePlatform(address _platform) external onlyOwner {
    require(_platform != address(0), "zero platform");
    platform = _platform;

    emit UpdatePlatform(_platform);
  }

  /// @notice Update the reward distribution ratio.
  /// @param _rebalancePoolRatio The new stability pool ratio.
  /// @param _harvestBountyRatio The new harvest bounty ratio.
  function updateRewardRatio(uint128 _rebalancePoolRatio, uint128 _harvestBountyRatio) external onlyOwner {
    require(_harvestBountyRatio + _rebalancePoolRatio <= PRECISION, "ratio sum too large");
    require(_harvestBountyRatio <= MAX_HARVEST_BOUNTY, "ratio too large");

    harvestBountyRatio = _harvestBountyRatio;
    rebalancePoolRatio = _rebalancePoolRatio;

    emit UpdateRewardRatio(_rebalancePoolRatio, _harvestBountyRatio);
  }

  /**********************
   * Internal Functions *
   **********************/

  function _distributeRebalancePoolRewards(address _token, uint256 _amount) internal virtual;

  function _approve(
    address _token,
    address _spender,
    uint256 _amount
  ) internal {
    IERC20Upgradeable(_token).safeApprove(_spender, 0);
    IERC20Upgradeable(_token).safeApprove(_spender, _amount);
  }
}

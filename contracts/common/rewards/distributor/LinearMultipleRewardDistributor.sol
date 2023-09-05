// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/utils/structs/EnumerableSetUpgradeable.sol";

import { IMultipleRewardDistributor } from "./IMultipleRewardDistributor.sol";
import { LinearReward } from "./LinearReward.sol";

// solhint-disable not-rely-on-time

abstract contract LinearMultipleRewardDistributor is AccessControlUpgradeable, IMultipleRewardDistributor {
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  using LinearReward for LinearReward.RewardData;

  /*************
   * Constants *
   *************/

  /// @notice The role used to manage rewards.
  bytes32 public constant REWARD_MANAGER_ROLE = keccak256("REWARD_MANAGER_ROLE");

  /// @notice The length of reward period in seconds.
  /// @dev If the value is zero, the reward will be distributed immediately.
  uint256 public immutable periodLength;

  /*************
   * Variables *
   *************/

  /// @inheritdoc IMultipleRewardDistributor
  mapping(address => address) public override distributors;

  /// @notice Mapping from reward token address to linear distribution reward data.
  mapping(address => LinearReward.RewardData) public rewardData;

  /// @dev The list of active reward tokens.
  EnumerableSetUpgradeable.AddressSet private activeRewardTokens;

  /// @dev The list of historical reward tokens.
  EnumerableSetUpgradeable.AddressSet private historicalRewardTokens;

  /// @dev reserved slots.
  uint256[46] private __gap;

  /***************
   * Constructor *
   ***************/

  constructor(uint256 _periodLength) {
    periodLength = _periodLength;
  }

  // solhint-disable-next-line func-name-mixedcase
  function __LinearMultipleRewardDistributor_init() internal onlyInitializing {}

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IMultipleRewardDistributor
  function getActiveRewardTokens() public view override returns (address[] memory _rewardTokens) {
    uint256 _length = activeRewardTokens.length();
    _rewardTokens = new address[](_length);

    for (uint256 i = 0; i < _length; i++) {
      _rewardTokens[i] = activeRewardTokens.at(i);
    }
  }

  /// @inheritdoc IMultipleRewardDistributor
  function getHistoricalRewardTokens() public view override returns (address[] memory _rewardTokens) {
    uint256 _length = historicalRewardTokens.length();
    _rewardTokens = new address[](_length);

    for (uint256 i = 0; i < _length; i++) {
      _rewardTokens[i] = historicalRewardTokens.at(i);
    }
  }

  /// @inheritdoc IMultipleRewardDistributor
  function pendingRewards(address token) public view override returns (uint256) {
    return rewardData[token].pending();
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IMultipleRewardDistributor
  function depositReward(address _token, uint256 _amount) external override {
    address _distributor = _msgSender();
    if (!activeRewardTokens.contains(_token)) revert NotActiveRewardToken();
    if (distributors[_token] != _distributor) revert NotRewardDistributor();

    if (_amount > 0) {
      IERC20Upgradeable(_token).safeTransferFrom(_distributor, address(this), _amount);
    }

    _distributePendingReward();

    _notifyReward(_token, _amount);

    emit DepositReward(_token, _amount);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Register a new reward token.
  /// @dev Make sure no fee on transfer token is added as reward token.
  ///
  /// @param _token The address of reward token.
  /// @param _distributor The address of reward distributor.
  function registerRewardToken(address _token, address _distributor) external onlyRole(REWARD_MANAGER_ROLE) {
    if (activeRewardTokens.contains(_token)) revert DuplicatedRewardToken();

    activeRewardTokens.add(_token);
    distributors[_token] = _distributor;
    historicalRewardTokens.remove(_token);

    emit RegisterRewardToken(_token, _distributor);
  }

  /// @notice Update the distributor for reward token.
  ///
  /// @param _token The address of reward token.
  /// @param _newDistributor The address of new reward distributor.
  function updateRewardDistributor(address _token, address _newDistributor) external onlyRole(REWARD_MANAGER_ROLE) {
    if (!activeRewardTokens.contains(_token)) revert NotActiveRewardToken();

    address _oldDistributor = distributors[_token];
    distributors[_token] = _newDistributor;

    emit UpdateRewardDistributor(_token, _oldDistributor, _newDistributor);
  }

  /// @notice Unregister an existing reward token.
  ///
  /// @param _token The address of reward token.
  function unregisterRewardToken(address _token) external onlyRole(REWARD_MANAGER_ROLE) {
    if (!activeRewardTokens.contains(_token)) revert NotActiveRewardToken();

    LinearReward.RewardData memory _data = rewardData[_token];
    if (_data.queued > 0 || _data.pending() > 0) revert RewardDistributionNotFinished();

    activeRewardTokens.remove(_token);
    historicalRewardTokens.add(_token);

    emit UnregisterRewardToken(_token);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to notify new rewards.
  ///
  /// @param _token The address of token.
  /// @param _amount The amount of new rewards.
  function _notifyReward(address _token, uint256 _amount) internal {
    if (periodLength == 0) {
      _accumulateReward(_token, _amount);
    } else {
      LinearReward.RewardData memory _data = rewardData[_token];
      _data.increase(periodLength, _amount);
      rewardData[_token] = _data;
    }
  }

  /// @dev Internal function to distribute all pending reward tokens.
  function _distributePendingReward() internal {
    if (periodLength == 0 || activeRewardTokens.length() == 0) return;

    address[] memory _activeRewardTokens = getActiveRewardTokens();
    for (uint256 i = 0; i < _activeRewardTokens.length; i++) {
      address _token = _activeRewardTokens[i];
      uint256 _pending = pendingRewards(_token);
      rewardData[_token].lastUpdate = uint40(block.timestamp);

      if (_pending > 0) {
        _accumulateReward(_token, _pending);
      }
    }
  }

  /// @dev Internal function to accumulate distributed rewards.
  ///
  /// @param _token The address of token.
  /// @param _amount The amount of rewards to accumulate.
  function _accumulateReward(address _token, uint256 _amount) internal virtual;
}

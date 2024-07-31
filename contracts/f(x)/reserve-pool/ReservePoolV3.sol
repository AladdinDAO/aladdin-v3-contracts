// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;
pragma abicoder v2;

import { AccessControl } from "@openzeppelin/contracts-v4/access/AccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import { EnumerableSet } from "@openzeppelin/contracts-v4/utils/structs/EnumerableSet.sol";
import { Address } from "@openzeppelin/contracts-v4/utils/Address.sol";

import { IFxBasePool } from "../../interfaces/f(x)/omni-vault/IFxBasePool.sol";
import { IFxReservePoolV3 } from "../../interfaces/f(x)/IFxReservePool.sol";

/// @title ReservePoolV3
/// @notice This contract combines `ReservePoolV2` and `RebalancePoolRegistry` to reduce gas costs.
contract ReservePoolV3 is AccessControl, IFxReservePoolV3 {
  using EnumerableSet for EnumerableSet.AddressSet;
  using SafeERC20 for IERC20;

  /**********
   * Errors *
   **********/

  /// @dev Thrown the bonus ratio is too large.
  error ErrorRatioTooLarge();

  /// @dev Thrown when add an already added rebalance pool.
  error ErrorRebalancePoolAlreadyAdded();

  /// @dev Thrown when remove an unknown rebalance pool.
  error ErrorRebalancePoolNotAdded();

  /// @dev Thrown when the caller is not `FxOmniVault`.
  error ErrorCallerNotVault();

  /*************
   * Constants *
   *************/

  /// @dev The precision use to calculation.
  uint256 private constant PRECISION = 1e18;

  /// @dev The address of `FxOmniVault` contract.
  address public immutable vault;

  /*************
   * Variables *
   *************/

  /// @notice Mapping from market address to bonus ratio.
  mapping(address => uint256) private bonusRatio;

  /// @dev The list of registered RebalancePool.
  mapping(address => EnumerableSet.AddressSet) private rebalancePools;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _vault,
    address[] memory tokens,
    uint256[] memory ratios
  ) {
    vault = _vault;

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

    for (uint256 i = 0; i < tokens.length; ++i) {
      _updateBonusRatio(tokens[i], ratios[i]);
    }
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxReservePoolV3
  function getPools(address market) external view returns (address[] memory _pools) {
    EnumerableSet.AddressSet storage cachedPools = rebalancePools[market];

    uint256 _length = cachedPools.length();
    _pools = new address[](_length);
    for (uint256 i = 0; i < _length; i++) {
      _pools[i] = cachedPools.at(i);
    }
  }

  /// @inheritdoc IFxReservePoolV3
  function isPoolRegistered(address market, address pool) external view returns (bool) {
    return rebalancePools[market].contains(pool);
  }

  /// @inheritdoc IFxReservePoolV3
  function getMarketBonusRatio(address market) external view returns (uint256 ratio) {
    ratio = bonusRatio[market];
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  // solhint-disable-next-line no-empty-blocks
  receive() external payable {}

  /// @inheritdoc IFxReservePoolV3
  function requestBonus(
    address _market,
    address _recipient,
    uint256 _eligibleAmount
  ) external returns (uint256) {
    if (_msgSender() != vault) revert ErrorCallerNotVault();

    // make sure rebalance pools are empty
    EnumerableSet.AddressSet storage pools = rebalancePools[_market];
    uint256 length = pools.length();
    for (uint256 i = 0; i < length; ++i) {
      if (IERC20(pools.at(i)).totalSupply() > 0) return 0;
    }

    address _token = IFxBasePool(_market).getBaseToken();
    uint256 _bonus = (_eligibleAmount * bonusRatio[_market]) / PRECISION;
    uint256 _balance = _getBalance(_token);

    if (_bonus > _balance) {
      _bonus = _balance;
    }
    if (_bonus > 0) {
      _transferToken(_token, _recipient, _bonus);

      emit RequestBonus(_market, _token, _recipient, _eligibleAmount, _bonus);
    }

    return _bonus;
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the bonus ratio for the market.
  /// @param _market The address of the market.
  /// @param _newRatio The new ratio, multiplied by 1e18.
  function updateBonusRatio(address _market, uint256 _newRatio) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateBonusRatio(_market, _newRatio);
  }

  /// @notice Add a list of RebalancePool.
  /// @param market The address of market.
  /// @param poolsToAdd The list of addresses of RebalancePool to add.
  function addRebalancePool(address market, address[] memory poolsToAdd) external onlyRole(DEFAULT_ADMIN_ROLE) {
    for (uint256 i = 0; i < poolsToAdd.length; ++i) {
      _addRebalancePool(market, poolsToAdd[i]);
    }
  }

  /// @notice Remove a list of existing RebalancePool.
  /// @param market The address of market.
  /// @param poolsToRemove The list of addresses of RebalancePool to remove.
  function removeRebalancePool(address market, address[] memory poolsToRemove) external onlyRole(DEFAULT_ADMIN_ROLE) {
    for (uint256 i = 0; i < poolsToRemove.length; ++i) {
      _removeRebalancePool(market, poolsToRemove[i]);
    }
  }

  /// @notice Withdraw dust assets in this contract.
  /// @param _token The address of token to withdraw.
  /// @param _recipient The address of token receiver.
  function withdrawFund(address _token, address _recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _transferToken(_token, _recipient, _getBalance(_token));
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to update the bonus ratio for the market.
  /// @param market The address of the market.
  /// @param newRatio The new ratio, multiplied by 1e18.
  function _updateBonusRatio(address market, uint256 newRatio) private {
    if (newRatio > PRECISION) revert ErrorRatioTooLarge();

    uint256 oldRatio = bonusRatio[market];
    bonusRatio[market] = newRatio;

    emit UpdateBonusRatio(market, oldRatio, newRatio);
  }

  /// @dev Internal function to add a RebalancePool to the market.
  /// @param market The address of market.
  /// @param poolToAdd The address of RebalancePool to add.
  function _addRebalancePool(address market, address poolToAdd) private {
    EnumerableSet.AddressSet storage pools = rebalancePools[market];

    if (!pools.add(poolToAdd)) {
      revert ErrorRebalancePoolAlreadyAdded();
    }

    emit RegisterRebalancePool(market, poolToAdd);
  }

  /// @dev Internal function to remove an existing RebalancePool to the market.
  /// @param market The address of market.
  /// @param poolToRemove The address of RebalancePool to remove.
  function _removeRebalancePool(address market, address poolToRemove) private {
    EnumerableSet.AddressSet storage pools = rebalancePools[market];
    if (!pools.remove(poolToRemove)) {
      revert ErrorRebalancePoolNotAdded();
    }

    emit DeregisterRebalancePool(market, poolToRemove);
  }

  /// @dev Internal function to return the balance of the token in this contract.
  /// @param _token The address of token to query.
  function _getBalance(address _token) internal view returns (uint256) {
    if (_token == address(0)) {
      return address(this).balance;
    } else {
      return IERC20(_token).balanceOf(address(this));
    }
  }

  /// @dev Internal function to transfer ETH or ERC20 tokens to some `_receiver`.
  ///
  /// @param _token The address of token to transfer, user `_token=address(0)` if transfer ETH.
  /// @param _receiver The address of token receiver.
  /// @param _amount The amount of token to transfer.
  function _transferToken(
    address _token,
    address _receiver,
    uint256 _amount
  ) internal {
    if (_token == address(0)) {
      Address.sendValue(payable(_receiver), _amount);
    } else {
      IERC20(_token).safeTransfer(_receiver, _amount);
    }
  }
}

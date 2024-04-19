// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;
pragma abicoder v2;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IFxRebalancePoolSplitter } from "../../interfaces/f(x)/IFxRebalancePoolSplitter.sol";
import { IFxRateProvider } from "../../interfaces/f(x)/IFxRateProvider.sol";
import { IFxTreasuryV2 } from "../../interfaces/f(x)/IFxTreasuryV2.sol";

import { TreasuryV2 } from "./TreasuryV2.sol";

contract WrappedTokenTreasuryV2 is TreasuryV2 {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the rate provider contract is updated.
  /// @param oldRateProvider The address of previous rate provider.
  /// @param newRateProvider The address of current rate provider.
  event UpdateRateProvider(address indexed oldRateProvider, address indexed newRateProvider);

  /*************
   * Variables *
   *************/

  /// @notice The address of rate provider contract.
  address public rateProvider;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _baseToken,
    address _fToken,
    address _xToken
  ) TreasuryV2(_baseToken, _fToken, _xToken) {}

  function initialize(
    address _platform,
    address _rebalancePoolSplitter,
    address _rateProvider,
    address _priceOracle,
    uint256 _baseTokenCap,
    uint24 sampleInterval
  ) external initializer {
    __Context_init();
    __ERC165_init();
    __AccessControl_init();

    __TreasuryV2_init(_platform, _rebalancePoolSplitter, _priceOracle, _baseTokenCap, sampleInterval);

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

    _updateRateProvider(_rateProvider);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxTreasuryV2
  function getWrapppedValue(uint256 _amount) public view virtual override returns (uint256) {
    return (_amount * PRECISION) / IFxRateProvider(rateProvider).getRate();
  }

  /// @inheritdoc IFxTreasuryV2
  function getUnderlyingValue(uint256 _amount) public view virtual override returns (uint256) {
    return (_amount * IFxRateProvider(rateProvider).getRate()) / PRECISION;
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Change address of price oracle contract.
  /// @param _rateProvider The new address of price oracle contract.
  function updateRateProvider(address _rateProvider) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateRateProvider(_rateProvider);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to change the address of rate provider contract.
  /// @param _newRateProvider The new address of rate provider contract.
  function _updateRateProvider(address _newRateProvider) internal {
    if (_newRateProvider == address(0)) revert ErrorZeroAddress();

    address _oldRateProvider = rateProvider;
    rateProvider = _newRateProvider;

    emit UpdateRateProvider(_oldRateProvider, _newRateProvider);
  }
}

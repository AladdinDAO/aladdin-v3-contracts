// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "../../interfaces/clever/ICLeverYieldStrategy.sol";

/// @title YieldStrategyBase for CLever and Furnace.
abstract contract YieldStrategyBase is ICLeverYieldStrategy {
  using SafeERC20 for IERC20;

  /// @inheritdoc ICLeverYieldStrategy
  address public immutable override yieldToken;

  /// @inheritdoc ICLeverYieldStrategy
  address public immutable override underlyingToken;

  /// @notice The address of operator.
  address public immutable operator;

  modifier onlyOperator() {
    require(msg.sender == operator, "YieldStrategy: only operator");
    _;
  }

  constructor(
    address _yieldToken,
    address _underlyingToken,
    address _operator
  ) {
    require(_yieldToken != address(0), "YieldStrategy: zero address");
    require(_underlyingToken != address(0), "YieldStrategy: zero address");
    require(_operator != address(0), "YieldStrategy: zero address");

    yieldToken = _yieldToken;
    underlyingToken = _underlyingToken;
    operator = _operator;
  }

  /// @inheritdoc ICLeverYieldStrategy
  function migrate(address _strategy) external virtual override onlyOperator returns (uint256 _yieldAmount) {
    address _yieldToken = yieldToken;
    _yieldAmount = IERC20(_yieldToken).balanceOf(address(this));
    IERC20(_yieldToken).safeTransfer(_strategy, _yieldAmount);
  }

  /// @inheritdoc ICLeverYieldStrategy
  // solhint-disable-next-line no-empty-blocks
  function onMigrateFinished(uint256 _yieldAmount) external virtual override onlyOperator {}

  /// @inheritdoc ICLeverYieldStrategy
  function execute(
    address _to,
    uint256 _value,
    bytes calldata _data
  ) external payable override onlyOperator returns (bool, bytes memory) {
    // solhint-disable-next-line avoid-low-level-calls
    (bool success, bytes memory result) = _to.call{ value: _value }(_data);
    return (success, result);
  }
}

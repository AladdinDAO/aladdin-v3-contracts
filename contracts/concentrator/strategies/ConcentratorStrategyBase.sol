// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Ownable2Step } from "@openzeppelin/contracts-v4/access/Ownable2Step.sol";
import { Initializable } from "@openzeppelin/contracts-v4/proxy/utils/Initializable.sol";
import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import { Address } from "@openzeppelin/contracts-v4/utils/Address.sol";

import { IConcentratorStrategy } from "../../interfaces/concentrator/IConcentratorStrategy.sol";

// solhint-disable func-name-mixedcase
// solhint-disable no-empty-blocks

abstract contract ConcentratorStrategyBase is Initializable, Ownable2Step, IConcentratorStrategy {
  using SafeERC20 for IERC20;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the caller is not operator.
  error CallerIsNotOperator();

  /// @dev Thrown when sweep protected tokens.
  error TokenIsProtected();

  /// @dev Thrown when the reward tokens is zero address.
  error RewardTokenIsZero();

  /// @dev Thrown when the reward tokens are duplicated.
  error DuplicatedRewardToken();

  /*************
   * Variables *
   *************/

  /// @notice The address of operator.
  address public operator;

  /// @notice The list of rewards token.
  address[] public rewards;

  /// @notice The address of rewards stash contract..
  address public stash;

  /// @notice Mapping the address of token to the protected status.
  mapping(address => bool) public isTokenProtected;

  /// @dev reserved slots.
  uint256[46] private __gap;

  /*************
   * Modifiers *
   *************/

  modifier onlyOperator() {
    if (operator != _msgSender()) revert CallerIsNotOperator();
    _;
  }

  /***************
   * Constructor *
   ***************/

  function __ConcentratorStrategyBase_init(address _operator, address[] memory _rewards) internal onlyInitializing {
    _transferOwnership(_msgSender());

    _checkRewards(_rewards);

    operator = _operator;
    rewards = _rewards;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  // fallback function to receive eth.
  receive() external payable {}

  /// @inheritdoc IConcentratorStrategy
  function updateRewards(address[] memory _rewards) public virtual override onlyOperator {
    _checkRewards(_rewards);

    delete rewards;
    rewards = _rewards;
  }

  /// @inheritdoc IConcentratorStrategy
  function execute(
    address _to,
    uint256 _value,
    bytes calldata _data
  ) external payable override onlyOperator returns (bool, bytes memory) {
    // solhint-disable-next-line avoid-low-level-calls
    (bool success, bytes memory result) = _to.call{ value: _value }(_data);
    return (success, result);
  }

  /// @inheritdoc IConcentratorStrategy
  function prepareMigrate(address _newStrategy) external virtual override onlyOperator {}

  /// @inheritdoc IConcentratorStrategy
  function finishMigrate(address _newStrategy) external virtual override onlyOperator {}

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Sweep non-protected tokens from this contract.
  ///
  /// @param _tokens The list of tokens to sweep.
  function sweepToken(address[] memory _tokens) external onlyOwner {
    for (uint256 i = 0; i < _tokens.length; i++) {
      if (isTokenProtected[_tokens[i]]) revert TokenIsProtected();
    }
    _sweepToken(_tokens);
  }

  /// @notice Update the address of stash contract.
  ///
  /// @param _newStash The address of new stash contract.
  function updateStash(address _newStash) external onlyOwner {
    stash = _newStash;
  }

  /// @notice Protect token from sweep.
  function protectToken(address token) external onlyOwner {
    isTokenProtected[token] = true;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to validate rewards list.
  /// @param _rewards The address list of reward tokens.
  function _checkRewards(address[] memory _rewards) internal pure {
    for (uint256 i = 0; i < _rewards.length; i++) {
      if (_rewards[i] == address(0)) revert RewardTokenIsZero();

      for (uint256 j = 0; j < i; j++) {
        if (_rewards[i] == _rewards[j]) revert DuplicatedRewardToken();
      }
    }
  }

  /// @dev Internal function to sweep tokens from this contract.
  ///
  /// @param _tokens The list of tokens to sweep.
  function _sweepToken(address[] memory _tokens) internal {
    address _stash = stash;
    for (uint256 i = 0; i < _tokens.length; i++) {
      address _token = _tokens[i];
      uint256 _balance = IERC20(_token).balanceOf(address(this));
      if (_balance > 0) {
        _transferToken(_token, _stash, _balance);
      }
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

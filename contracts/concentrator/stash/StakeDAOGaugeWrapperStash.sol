// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";

contract StakeDAOGaugeWrapperStash {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when call is not wrapper contract.
  error ErrorCallerIsNotWrapper();

  /*************
   * Constants *
   *************/

  /// @notice The address of wrapper contract.
  address public immutable wrapper;

  /***************
   * Constructor *
   ***************/

  constructor(address _wrapper) {
    wrapper = _wrapper;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Withdraw tokens from this contract.
  /// @param _tokens The address lists of the tokens.
  /// @return _balances The amount of tokens transfered to wrapper.
  function withdrawTokens(address[] memory _tokens) external returns (uint256[] memory _balances) {
    if (msg.sender != wrapper) revert ErrorCallerIsNotWrapper();

    _balances = new uint256[](_tokens.length);
    for (uint256 i = 0; i < _tokens.length; ++i) {
      address _token = _tokens[i];
      uint256 _balance = IERC20Upgradeable(_token).balanceOf(address(this));
      if (_balance > 0) {
        IERC20Upgradeable(_token).safeTransfer(wrapper, _balance);
      }
      _balances[i] = _balance;
    }
  }
}

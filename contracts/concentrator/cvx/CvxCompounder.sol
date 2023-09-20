// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "../AladdinCompounderWithStrategy.sol";

contract CvxCompounder is AladdinCompounderWithStrategy {
  /// @dev The address of CVX token.
  address private constant CVX = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;

  /// @dev The address of WETH token.
  address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  function initialize(
    address _zap,
    address _strategy,
    string memory _name,
    string memory _symbol
  ) external initializer {
    AladdinCompounderWithStrategy._initialize(_zap, _strategy, _name, _symbol);
  }

  /********************************** View Functions **********************************/

  /// @inheritdoc IAladdinCompounder
  function asset() public pure override returns (address) {
    return CVX;
  }

  /// @inheritdoc AladdinCompounderWithStrategy
  function _intermediate() internal pure override returns (address) {
    return WETH;
  }
}

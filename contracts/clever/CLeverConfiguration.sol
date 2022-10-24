// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract CLeverConfiguration is OwnableUpgradeable {
  /// @notice Emitted when the burn ratio is updated.
  /// @param _token The address of token updated.
  /// @param _burnRatio The burn ratio updated.
  event UpdateBurnRatio(address _token, uint256 _burnRatio);

  /// @notice Mapping from token to burn ratio for corresponding clever token.
  /// @dev The precision is 1e9.
  mapping(address => uint256) public burnRatio;

  function initialize() external initializer {
    OwnableUpgradeable.__Ownable_init();
  }

  /// @notice Update the burn ratio
  /// @param _token The address of token to update.
  /// @param _burnRatio The burn ratio to update.
  function updateBurnRatio(address _token, uint256 _burnRatio) external onlyOwner {
    burnRatio[_token] = _burnRatio;

    emit UpdateBurnRatio(_token, _burnRatio);
  }
}

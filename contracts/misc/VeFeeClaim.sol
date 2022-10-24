// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IVeFeeDistributor {
  function claim(address _addr) external returns (uint256);
}

contract VeFeeClaim {
  /// @notice claim pending ve rewards from many distributors.
  /// @param _user The address of _user to claim.
  /// @param _distributors The list of addresses for distributors.
  function claim(address _user, address[] memory _distributors) external {
    for (uint256 i = 0; i < _distributors.length; i++) {
      IVeFeeDistributor(_distributors[i]).claim(_user);
    }
  }
}

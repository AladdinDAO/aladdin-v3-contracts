// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// solhint-disable func-name-mixedcase

interface IVotingEscrow {
  function token() external view returns (address);

  function user_point_epoch(address addr) external view returns (uint256);

  function locked__end(address addr) external view returns (uint256);

  function user_point_history__ts(address addr, uint256 epoch) external view returns (uint256);

  function totalSupply() external view returns (uint256);

  function balanceOf(address addr) external view returns (uint256);
}

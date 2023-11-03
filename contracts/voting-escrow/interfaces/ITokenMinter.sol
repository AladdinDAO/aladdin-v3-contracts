// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// solhint-disable func-name-mixedcase

interface ITokenMinter {
  function token() external view returns (address);

  function controller() external view returns (address);

  function minted(address user, address gauge) external view returns (uint256);

  function mint(address gauge_addr) external;

  function mint_many(address[8] memory gauges) external;

  function mint_for(address gauge, address _for) external;

  function toggle_approve_mint(address _user) external;
}

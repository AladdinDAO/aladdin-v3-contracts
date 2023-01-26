// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

// solhint-disable func-name-mixedcase

interface ICurveMinter {
  function mint(address gauge_addr) external;
}

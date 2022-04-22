// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface ILayer2CRVDepositor {
  function anyFallback(address _to, bytes memory _data) external;

  function finalizeDeposit(
    uint256 _exectionId,
    uint256 _crvAmount,
    uint256 _acrvAmount,
    uint256 _acrvFee
  ) external;

  function finalizeWithdraw(
    uint256 _exectionId,
    uint256 _acrvAmount,
    uint256 _crvAmount,
    uint256 _crvFee
  ) external;
}

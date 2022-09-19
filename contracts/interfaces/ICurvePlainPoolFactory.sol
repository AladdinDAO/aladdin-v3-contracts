// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

// solhint-disable func-name-mixedcase, var-name-mixedcase

interface ICurvePlainPoolFactory {
  function deploy_plain_pool(
    string memory _name,
    string memory _symbol,
    address[4] memory _coins,
    uint256 _A,
    uint256 _fee,
    uint256 _asset_type,
    uint256 _implementation_idx
  ) external returns (address);
}

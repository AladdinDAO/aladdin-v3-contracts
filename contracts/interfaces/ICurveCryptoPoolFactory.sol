// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

// solhint-disable func-name-mixedcase, var-name-mixedcase

interface ICurveCryptoPoolFactory {
  function deploy_pool(
    string memory _name,
    string memory _symbol,
    address[2] memory _coins,
    uint256 A,
    uint256 gamma,
    uint256 mid_fee,
    uint256 out_fee,
    uint256 allowed_extra_profit,
    uint256 fee_gamma,
    uint256 adjustment_step,
    uint256 admin_fee,
    uint256 ma_half_time,
    uint256 initial_price
  ) external returns (address);
}

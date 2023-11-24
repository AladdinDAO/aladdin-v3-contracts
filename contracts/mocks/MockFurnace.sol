// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/clever/ICLeverToken.sol";
import "../interfaces/clever/IMetaFurnace.sol";

// solhint-disable reason-string, no-empty-blocks

contract MockFurnace is IMetaFurnace {
  /// @inheritdoc IMetaFurnace
  address public override baseToken;

  /// @inheritdoc IMetaFurnace
  address public override debtToken;

  constructor(address _debtToken) {
    debtToken = _debtToken;
  }

  /********************************** View Functions **********************************/

  /// @inheritdoc IMetaFurnace
  function getUserInfo(address) external view override returns (uint256, uint256) {}

  /// @notice Return the total amount of free baseToken in this contract, including staked in YieldStrategy.
  function totalBaseTokenInPool() public view returns (uint256) {}

  /********************************** Mutated Functions **********************************/

  /// @inheritdoc IMetaFurnace
  function deposit(address _recipient, uint256 _amount) external override {
    // transfer token into contract
    IERC20(debtToken).transferFrom(msg.sender, address(this), _amount);

    emit Deposit(_recipient, _amount);
  }

  /// @inheritdoc IMetaFurnace
  function withdraw(address, uint256) external override {}

  /// @inheritdoc IMetaFurnace
  function withdrawAll(address) external override {}

  /// @inheritdoc IMetaFurnace
  function claim(address) external override {}

  /// @inheritdoc IMetaFurnace
  function exit(address) external override {}

  /// @inheritdoc IMetaFurnace
  function distribute(
    address,
    address,
    uint256
  ) external override {}

  function harvest(address, uint256) external returns (uint256) {}
}

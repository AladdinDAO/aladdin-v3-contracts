// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/utils/structs/EnumerableSetUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { ITokenConverter } from "../../helpers/converter/ITokenConverter.sol";

library LibGatewayRouter {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

  /**********
   * Errors *
   **********/

  error ErrorTargetNotApproved();

  error ErrorMsgValueMismatch();

  error ErrorInsufficientOutput();

  /*************
   * Constants *
   *************/

  /// @dev The storage slot for gateway storage.
  bytes32 private constant GATEWAY_STORAGE_POSITION = keccak256("diamond.gateway.storage");

  /***********
   * Structs *
   ***********/

  /// @param spenders Mapping from target address to token spender address.
  /// @param approvedTargets The list of approved target contracts.
  struct GatewayStorage {
    mapping(address => address) spenders;
    EnumerableSetUpgradeable.AddressSet approvedTargets;
  }

  /// @notice The struct for input token convert parameters.
  ///
  /// @param src The address of source token.
  /// @param amount The amount of source token.
  /// @param target The address of converter contract.
  /// @param data The calldata passing to the target contract.
  /// @param minOut The minimum amount of output token should receive.
  struct ConvertInParams {
    address src;
    uint256 amount;
    address target;
    bytes data;
    uint256 minOut;
  }

  /// @notice The struct for output token convert parameters.
  /// @param converter The address of converter contract.
  /// @param minOut The minimum amount of output token should receive.
  /// @param routes The convert route encodings.
  struct ConvertOutParams {
    address converter;
    uint256 minOut;
    uint256[] routes;
  }

  /**********************
   * Internal Functions *
   **********************/

  function gatewayStorage() internal pure returns (GatewayStorage storage gs) {
    bytes32 position = GATEWAY_STORAGE_POSITION;
    assembly {
      gs.slot := position
    }
  }

  function approveTarget(address target, address spender) internal {
    GatewayStorage storage gs = gatewayStorage();

    if (gs.approvedTargets.add(target) && target != spender) {
      gs.spenders[target] = spender;
    }
  }

  function removeTarget(address target) internal {
    GatewayStorage storage gs = gatewayStorage();

    if (gs.approvedTargets.remove(target)) {
      delete gs.spenders[target];
    }
  }

  function transferInAndConvert(ConvertInParams memory _params, address tokenOut) internal returns (uint256 amountOut) {
    GatewayStorage storage gs = gatewayStorage();
    if (!gs.approvedTargets.contains(_params.target)) revert ErrorTargetNotApproved();

    amountOut = IERC20Upgradeable(tokenOut).balanceOf(address(this));
    transferTokenIn(_params.src, address(this), _params.amount);

    bool _success;
    if (_params.src == address(0)) {
      (_success, ) = _params.target.call{ value: _params.amount }(_params.data);
    } else {
      address _spender = gs.spenders[_params.target];
      if (_spender == address(0)) _spender = _params.target;

      IERC20Upgradeable(_params.src).safeApprove(_spender, 0);
      IERC20Upgradeable(_params.src).safeApprove(_spender, _params.amount);
      (_success, ) = _params.target.call(_params.data);
    }

    // below lines will propagate inner error up
    if (!_success) {
      // solhint-disable-next-line no-inline-assembly
      assembly {
        let ptr := mload(0x40)
        let size := returndatasize()
        returndatacopy(ptr, 0, size)
        revert(ptr, size)
      }
    }

    amountOut = IERC20Upgradeable(tokenOut).balanceOf(address(this)) - amountOut;
  }

  function convertAndTransferOut(
    ConvertOutParams memory _params,
    address tokenIn,
    uint256 amountIn,
    address receiver
  ) internal returns (uint256 amountOut) {
    amountOut = amountIn;
    if (_params.routes.length == 0) {
      IERC20Upgradeable(tokenIn).safeTransfer(receiver, amountOut);
    } else {
      IERC20Upgradeable(tokenIn).safeTransfer(_params.converter, amountOut);
    }
    for (uint256 i = 0; i < _params.routes.length; i++) {
      address _recipient = i == _params.routes.length - 1 ? receiver : _params.converter;
      amountOut = ITokenConverter(_params.converter).convert(_params.routes[i], amountOut, _recipient);
    }
    if (amountOut < _params.minOut) revert ErrorInsufficientOutput();
  }

  /// @dev Internal function to transfer token to this contract.
  /// @param _token The address of token to transfer.
  /// @param _amount The amount of token to transfer.
  /// @return uint256 The amount of token transfered.
  function transferTokenIn(
    address _token,
    address _receiver,
    uint256 _amount
  ) internal returns (uint256) {
    if (_token == address(0)) {
      if (msg.value != _amount) revert ErrorMsgValueMismatch();
    } else {
      IERC20Upgradeable(_token).safeTransferFrom(msg.sender, _receiver, _amount);
    }
    return _amount;
  }

  /// @dev Internal function to refund extra token.
  /// @param _token The address of token to refund.
  /// @param _recipient The address of the token receiver.
  function refundERC20(address _token, address _recipient) internal {
    uint256 _balance = IERC20Upgradeable(_token).balanceOf(address(this));
    if (_balance > 0) {
      IERC20Upgradeable(_token).safeTransfer(_recipient, _balance);
    }
  }

  function approve(
    address token,
    address spender,
    uint256 amount
  ) internal {
    IERC20Upgradeable(token).safeApprove(spender, 0);
    IERC20Upgradeable(token).safeApprove(spender, amount);
  }
}

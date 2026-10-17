// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/utils/structs/EnumerableSetUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { ECDSA } from "@openzeppelin/contracts-v4/utils/cryptography/ECDSA.sol";

import { ITokenConverter } from "../../helpers/converter/ITokenConverter.sol";

import { LibEIP712 } from "./LibEIP712.sol";

library LibGatewayRouter {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when use unapproved target contract.
  error ErrorTargetNotApproved();

  /// @dev Thrown when msg.value is different from amount.
  error ErrorMsgValueMismatch();

  /// @dev Thrown when the output token is not enough.
  error ErrorInsufficientOutput();

  /// @dev Thrown when the whitelisted account type is incorrect.
  error ErrorNotWhitelisted(WhitelistKind expected, WhitelistKind found);

  error ErrorInvalidSignature();

  /*************
   * Constants *
   *************/

  /// @dev The storage slot for gateway storage.
  bytes32 private constant GATEWAY_STORAGE_POSITION = keccak256("diamond.gateway.storage");

  // solhint-disable-next-line var-name-mixedcase
  bytes32 private constant _CONVERT_IN_TYPEHASH =
    keccak256("ConvertIn(address src,uint256 amount,address target,bytes data,uint256 minOut,uint256 deadline)");

  // solhint-disable-next-line var-name-mixedcase
  bytes32 private constant _CONVERT_OUT_TYPEHASH =
    keccak256("ConvertOut(address converter,bytes routes,uint256 minOut,uint256 deadline)");

  /*********
   * Enums *
   *********/

  enum WhitelistKind {
    None,
    DexAggregator,
    FxMarket,
    FxInitialFundVault,
    FxRebalancePool,
    FxUSD,
    ERC4626Compounder,
    ERC5115Compounder
  }

  /***********
   * Structs *
   ***********/

  /// @param spenders Mapping from target address to token spender address.
  /// @param approvedTargets The list of approved target contracts.
  struct GatewayStorage {
    mapping(address => address) spenders;
    EnumerableSetUpgradeable.AddressSet approvedTargets;
    mapping(address => WhitelistKind) whitelisted;
    EnumerableSetUpgradeable.AddressSet signers;
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
    uint256 deadline;
    bytes signature;
  }

  /// @notice The struct for output token convert parameters.
  /// @param converter The address of converter contract.
  /// @param minOut The minimum amount of output token should receive.
  /// @param routes The convert route encodings.
  struct ConvertOutParams {
    address converter;
    uint256[] routes;
    uint256 minOut;
    uint256 deadline;
    bytes signature;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Return the GatewayStorage reference.
  function gatewayStorage() internal pure returns (GatewayStorage storage gs) {
    bytes32 position = GATEWAY_STORAGE_POSITION;
    assembly {
      gs.slot := position
    }
  }

  /// @dev Approve contract to be used in token converting.
  function approveTarget(address target, address spender) internal {
    GatewayStorage storage gs = gatewayStorage();

    if (gs.approvedTargets.add(target) && target != spender) {
      gs.spenders[target] = spender;
    }
  }

  /// @dev Remove approve contract in token converting.
  function removeTarget(address target) internal {
    GatewayStorage storage gs = gatewayStorage();

    if (gs.approvedTargets.remove(target)) {
      delete gs.spenders[target];
    }
  }

  /// @dev Update the status of signers.
  function updateSigner(address account, bool status) internal {
    GatewayStorage storage gs = gatewayStorage();
    if (status) gs.signers.add(account);
    else gs.signers.remove(account);
  }

  /// @dev Whitelist account with type.
  function updateWhitelist(address account, WhitelistKind kind) internal {
    GatewayStorage storage gs = gatewayStorage();

    gs.whitelisted[account] = kind;
  }

  /// @dev Check whether the account is whitelisted with specific type.
  function ensureWhitelisted(address account, WhitelistKind kind) internal view {
    GatewayStorage storage gs = gatewayStorage();

    WhitelistKind cachedKind = gs.whitelisted[account];
    if (cachedKind == WhitelistKind.None || cachedKind != kind) {
      revert ErrorNotWhitelisted(kind, cachedKind);
    }
  }

  /// @dev Transfer token into this contract and convert to `tokenOut`.
  /// @param params The parameters used in token converting.
  /// @param tokenOut The address of final converted token.
  /// @return amountOut The amount of token received.
  function transferInAndConvert(ConvertInParams memory params, address tokenOut) internal returns (uint256 amountOut) {
    GatewayStorage storage gs = gatewayStorage();
    if (!gs.approvedTargets.contains(params.target)) revert ErrorTargetNotApproved();
    verifyConvertInParams(params);

    transferTokenIn(params.src, address(this), params.amount);

    amountOut = IERC20Upgradeable(tokenOut).balanceOf(address(this));
    bool _success;
    if (params.src == address(0)) {
      (_success, ) = params.target.call{ value: params.amount }(params.data);
    } else {
      address _spender = gs.spenders[params.target];
      if (_spender == address(0)) _spender = params.target;

      IERC20Upgradeable(params.src).safeApprove(_spender, 0);
      IERC20Upgradeable(params.src).safeApprove(_spender, params.amount);
      (_success, ) = params.target.call(params.data);
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

  /// @dev Convert `tokenIn` to other token and transfer out.
  /// @param params The parameters used in token converting.
  /// @param tokenIn The address of token to convert.
  /// @param amountIn The amount of token to convert.
  /// @return amountOut The amount of token received.
  function convertAndTransferOut(
    ConvertOutParams memory params,
    address tokenIn,
    uint256 amountIn,
    address receiver
  ) internal returns (uint256 amountOut) {
    GatewayStorage storage gs = gatewayStorage();
    if (!gs.approvedTargets.contains(params.converter)) revert ErrorTargetNotApproved();
    verifyConvertOutParams(params);

    if (amountIn == 0) return 0;

    amountOut = amountIn;
    if (params.routes.length == 0) {
      IERC20Upgradeable(tokenIn).safeTransfer(receiver, amountOut);
    } else {
      IERC20Upgradeable(tokenIn).safeTransfer(params.converter, amountOut);
    }
    for (uint256 i = 0; i < params.routes.length; i++) {
      address _recipient = i == params.routes.length - 1 ? receiver : params.converter;
      amountOut = ITokenConverter(params.converter).convert(params.routes[i], amountOut, _recipient);
    }
    if (amountOut < params.minOut) revert ErrorInsufficientOutput();
  }

  /// @dev Internal function to transfer token to this contract.
  /// @param token The address of token to transfer.
  /// @param amount The amount of token to transfer.
  /// @return uint256 The amount of token transferred.
  function transferTokenIn(
    address token,
    address receiver,
    uint256 amount
  ) internal returns (uint256) {
    if (token == address(0)) {
      if (msg.value != amount) revert ErrorMsgValueMismatch();
    } else {
      IERC20Upgradeable(token).safeTransferFrom(msg.sender, receiver, amount);
    }
    return amount;
  }

  /// @dev Internal function to refund extra token.
  /// @param token The address of token to refund.
  /// @param recipient The address of the token receiver.
  function refundERC20(address token, address recipient) internal {
    uint256 _balance = IERC20Upgradeable(token).balanceOf(address(this));
    if (_balance > 0) {
      IERC20Upgradeable(token).safeTransfer(recipient, _balance);
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

  function verifyConvertInParams(ConvertInParams memory params) private view {
    bytes32 structHash = keccak256(
      abi.encode(
        _CONVERT_IN_TYPEHASH,
        params.src,
        params.amount,
        params.target,
        keccak256(params.data),
        params.minOut,
        params.deadline
      )
    );
    bytes32 hash = LibEIP712.hashTypedDataV4(structHash);

    address signer = ECDSA.recover(hash, params.signature);
    if (!gatewayStorage().signers.contains(signer)) revert ErrorInvalidSignature();
  }

  function verifyConvertOutParams(ConvertOutParams memory params) private view {
    bytes32 structHash = keccak256(
      abi.encode(
        _CONVERT_OUT_TYPEHASH,
        params.converter,
        keccak256(abi.encode(params.routes)),
        params.minOut,
        params.deadline
      )
    );
    bytes32 hash = LibEIP712.hashTypedDataV4(structHash);

    address signer = ECDSA.recover(hash, params.signature);
    if (!gatewayStorage().signers.contains(signer)) revert ErrorInvalidSignature();
  }
}

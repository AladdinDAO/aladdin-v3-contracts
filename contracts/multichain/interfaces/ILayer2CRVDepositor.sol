// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface ILayer2CRVDepositor {
  enum AsyncOperationStatus {
    None,
    Pending,
    OnGoing,
    Failed
  }

  event Deposit(address indexed _sender, uint256 indexed _executionId, uint256 _amount);
  event Redeem(address indexed _sender, uint256 indexed _executionId, uint256 _amount);
  event AbortDeposit(address indexed _sender, uint256 indexed _executionId, uint256 _amount);
  event AbortRedeem(address indexed _sender, uint256 indexed _executionId, uint256 _amount);
  event Claim(address indexed _sender, uint256 _acrvAmount, uint256 _crvAmount);

  event FinalizeDeposit(uint256 indexed _executionId, uint256 _crvAmount, uint256 _acrvAmount, uint256 _acrvFee);
  event FinalizeRedeem(uint256 indexed _executionId, uint256 _acrvAmount, uint256 _crvAmount, uint256 _crvFee);

  event PrepareDeposit(uint256 indexed _executionId, uint256 _amount, uint256 _depositFee, uint256 _bridgeFee);
  event PrepareRedeem(uint256 indexed _executionId, uint256 _amount, uint256 _redeemFee, uint256 _bridgeFee);

  event AsyncDeposit(uint256 indexed _executionId, AsyncOperationStatus _prevStatus);
  event AsyncRedeem(uint256 indexed _executionId, AsyncOperationStatus _prevStatus);

  event AsyncDepositFailed(uint256 indexed _executionId);
  event AsyncRedeemFailed(uint256 indexed _executionId);

  /// @notice Deposit CRV for aCRV asynchronously in this contract.
  /// @param _amount The amount of CRV to deposit.
  function deposit(uint256 _amount) external;

  /// @notice Abort current deposit and take CRV back.
  /// @dev Will revert if the CRV is already bridged to Layer 1.
  /// @param _amount The amount of CRV to abort.
  function abortDeposit(uint256 _amount) external;

  /// @notice Redeem aCRV for CRV asynchronously in this contract.
  /// @param _amount The amount of aCRV to redeem.
  function redeem(uint256 _amount) external;

  /// @notice Abort current redeem and take aCRV back.
  /// @dev Will revert if the aCRV is already bridged to Layer 1.
  /// @param _amount The amount of aCRV to abort.
  function abortRedeem(uint256 _amount) external;

  /// @notice Claim executed aCRV/CRV on asynchronous deposit/redeem.
  function claim() external;

  /// @notice Callback function called on failure in AnyswapCall.
  /// @dev This function can only called by AnyCallProxy.
  /// @param _to The target address in original call.
  /// @param _data The calldata pass to target address in original call.
  function anyFallback(address _to, bytes memory _data) external;

  /// @notice Callback function called on success in `deposit`.
  /// @dev This function can only called by AnyCallProxy.
  /// @param _executionId An unique id to keep track on the deposit operation.
  /// @param _crvAmount The acutal amount of CRV deposited in Layer 1.
  /// @param _acrvAmount The acutal amount of aCRV received in Layer 1.
  /// @param _acrvFee The fee charged on cross chain.
  function finalizeDeposit(
    uint256 _executionId,
    uint256 _crvAmount,
    uint256 _acrvAmount,
    uint256 _acrvFee
  ) external;

  /// @notice Callback function called on success in `redeem`.
  /// @dev This function can only called by AnyCallProxy.
  /// @param _executionId An unique id to keep track on the redeem operation.
  /// @param _acrvAmount The acutal amount of aCRV to redeem in Layer 1.
  /// @param _crvAmount The acutal amount of CRV received in Layer 1.
  /// @param _crvFee The fee charged on cross chain.
  function finalizeRedeem(
    uint256 _executionId,
    uint256 _acrvAmount,
    uint256 _crvAmount,
    uint256 _crvFee
  ) external;
}

// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "../CrossChainCallBase.sol";

import "../interfaces/ILayer2CRVDepositor.sol";

abstract contract Layer2CRVDepositorBase is CrossChainCallBase, ILayer2CRVDepositor {
  /// @dev The denominator used to calculate cross chain fee.
  uint256 internal constant FEE_DENOMINATOR = 1e9;
  /// @dev The maximum deposit fee percentage.
  uint256 private constant MAX_DEPOSIT_FEE_PERCENTAGE = 1e8; // 10%
  /// @dev The maximum withdraw fee percentage.
  uint256 private constant MAX_WITHDRAW_FEE_PERCENTAGE = 1e8; // 10%

  struct FeeData {
    // The address of platform, used to receive deposit/withdraw fee.
    address platform;
    // The deposit fee percentage in $CRV charged on each deposit.
    uint32 depositFeePercentage;
    // The withdraw fee percentage in $aCRV charged on each withdraw.
    uint32 withdrawFeePercentage;
  }

  struct CrossChainOperationData {
    // The amount of CRV/aCRV is waiting for deposit/withdraw.
    uint112 pending;
    // The amount of CRV/aCRV is depositing/withdrawing.
    uint112 ongoing;
    // The current execution id.
    uint32 executionId;
  }

  struct FinalizedOperationState {
    // The amount of CRV/aCRV provided before asynchronous deposit/withdraw.
    uint128 provideAmount;
    // The amount of aCRV/CRV received after asynchronous deposit/withdraw.
    uint128 executedAmount;
  }

  struct AccountOperation {
    // The current execution id.
    uint32 executionId;
    // The amount of CRV/aCRV provided after fee deduction.
    uint224 amount;
  }

  struct AccountOperationState {
    // Keep track of claimed aCRV/CRV.
    uint256 claimIndex;
    // The list of user operations group by execution id.
    AccountOperation[] operations;
  }

  /// @notice The address of CRV in Layer 2.
  address public crv;
  /// @notice The address of aCRV in Layer 2.
  address public acrv;
  /// @notice Fee data on deposit/withdraw.
  FeeData public fees;
  /// @notice The data for CRV deposit operation.
  CrossChainOperationData public crvOpetation;
  /// @notice The data for aCRV withdraw operation.
  CrossChainOperationData public acrvOpetation;

  mapping(uint256 => FinalizedOperationState) public finialzedDepositState;
  mapping(uint256 => FinalizedOperationState) public finialzedWithdrawState;
  mapping(address => AccountOperationState) public accountDepositState;
  mapping(address => AccountOperationState) public accountWithdrawState;

  mapping(address => bool) public whitelist;

  function _initialize(
    address _anyCallProxy,
    address _crossChainCallProxy,
    address _owner,
    address _crv,
    address _acrv
  ) internal {
    // solhint-disable-next-line reason-string
    require(_crv != address(0), "Layer2CRVDepositor: zero address");
    // solhint-disable-next-line reason-string
    require(_acrv != address(0), "Layer2CRVDepositor: zero address");

    CrossChainCallBase._initialize(_anyCallProxy, _crossChainCallProxy, _owner);

    crv = _crv;
    acrv = _acrv;
  }

  modifier onlyWhitelist() {
    // solhint-disable-next-line reason-string
    require(whitelist[msg.sender], "Layer2CRVDepositor: only whitelist");
    _;
  }

  /********************************** View Functions **********************************/

  function claimable(address _account) external view returns (uint256, uint256) {}

  /********************************** Mutated Functions **********************************/

  /// @notice See {ILayer2CRVDepositor-deposit}
  function deposit(uint256 _amount) external override {}

  /// @notice See {ILayer2CRVDepositor-withdraw}
  function withdraw(uint256 _amount) external override {}

  /// @notice Prepare asyncDeposit, bridge CRV to Layer1.
  /// @dev This function can only called by whitelisted addresses.
  function prepareAsyncDeposit() external onlyWhitelist {}

  /// @notice Prepare asyncWithdraw, bridge aCRV to Layer1.
  /// @dev This function can only called by whitelisted addresses.
  function prepareAsyncWithdraw() external onlyWhitelist {}

  /// @notice Deposit CRV in this contract to Layer 1 aCRV contract asynchronously.
  /// @dev This function can only called by whitelisted addresses.
  function asyncDeposit() external onlyWhitelist {}

  /// @notice Withdraw aCRV in this contract to Layer 1 aCRV contract asynchronously.
  /// @dev This function can only called by whitelisted addresses.
  function asyncWithdraw() external onlyWhitelist {}

  /// @notice See {ILayer2CRVDepositor-claimACRV}
  function claimACRV() external override {}

  /// @notice See {ILayer2CRVDepositor-claimCRV}
  function claimCRV() external override {}

  /// @notice See {ILayer2CRVDepositor-anyFallback}
  function anyFallback(address _to, bytes memory _data) external override onlyAnyCallProxy {}

  /// @notice See {ILayer2CRVDepositor-finalizeDeposit}
  function finalizeDeposit(
    uint256 _exectionId,
    uint256 _crvAmount,
    uint256 _acrvAmount,
    uint256 _acrvFee
  ) external override onlyAnyCallProxy {}

  /// @notice See {ILayer2CRVDepositor-finalizeWithdraw}
  function finalizeWithdraw(
    uint256 _exectionId,
    uint256 _acrvAmount,
    uint256 _crvAmount,
    uint256 _crvFee
  ) external override onlyAnyCallProxy {}

  /********************************** Restricted Functions **********************************/

  /// @notice Update whitelist contract can call `crossChainCall`.
  /// @param _whitelist The list of whitelist address to update.
  /// @param _status The status to update.
  function updateWhitelist(address[] memory _whitelist, bool _status) external onlyOwner {
    for (uint256 i = 0; i < _whitelist.length; i++) {
      whitelist[_whitelist[i]] = _status;
    }
  }

  /// @dev Update fee data
  /// @param _platform The address of platform to update.
  /// @param _depositFeePercentage The deposit fee percentage to update.
  /// @param _withdrawFeePercentage The withdraw fee percentage to update.
  function updateFeeData(
    address _platform,
    uint256 _depositFeePercentage,
    uint256 _withdrawFeePercentage
  ) external onlyOwner {
    // solhint-disable-next-line reason-string
    require(_platform != address(0), "Layer2CRVDepositor: zero address");
    // solhint-disable-next-line reason-string
    require(_depositFeePercentage <= MAX_DEPOSIT_FEE_PERCENTAGE, "Layer2CRVDepositor: fee too large");
    // solhint-disable-next-line reason-string
    require(_withdrawFeePercentage <= MAX_WITHDRAW_FEE_PERCENTAGE, "Layer2CRVDepositor: fee too large");

    fees = FeeData(_platform, uint32(_depositFeePercentage), uint32(_withdrawFeePercentage));
  }

  /********************************** Internal Functions **********************************/

  /// @dev Internal function to bridge aCRV to Layer 1.
  /// @param _recipient The address of recipient will receive the aCRV.
  /// @param _totalAmount The total amount of aCRV to bridge.
  /// @return _bridgeAmount The total amount of aCRV bridged, fees are included.
  /// @return _totalFee The total amount of aCRV fee charged by Bridge.
  function _bridgeACRV(address _recipient, uint256 _totalAmount)
    internal
    virtual
    returns (uint256 _bridgeAmount, uint256 _totalFee)
  {}

  /// @dev Internal function to bridge CRV to Layer 1.
  /// @param _recipient The address of recipient will receive the CRV.
  /// @param _totalAmount The total amount of CRV to bridge.
  /// @return _bridgeAmount The total amount of CRV bridged, fees are included.
  /// @return _totalFee The total amount of CRV fee charged by Bridge.
  function _bridgeCRV(address _recipient, uint256 _totalAmount)
    internal
    virtual
    returns (uint256 _bridgeAmount, uint256 _totalFee)
  {}
}

// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "../CrossChainCallBase.sol";

import "../interfaces/IAnyCallProxy.sol";
import "../interfaces/ICrossChainCallProxy.sol";
import "../interfaces/ILayer2CRVDepositor.sol";
import "../interfaces/ILayer1ACRVProxy.sol";

abstract contract Layer2CRVDepositorBase is CrossChainCallBase, ILayer2CRVDepositor {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  event UpdateWhitelist(address indexed _account, bool _status);
  event UpdateLayer1Proxy(address indexed _layer1Proxy);
  event UpdateFeeData(address indexed _platform, uint32 _depositFeePercentage, uint32 _redeemFeePercentage);

  /// @dev The denominator used to calculate cross chain fee.
  uint256 internal constant FEE_DENOMINATOR = 1e9;
  /// @dev The maximum deposit fee percentage.
  uint256 private constant MAX_DEPOSIT_FEE_PERCENTAGE = 1e8; // 10%
  /// @dev The maximum redeem fee percentage.
  uint256 private constant MAX_WITHDRAW_FEE_PERCENTAGE = 1e8; // 10%

  struct FeeData {
    // The address of platform, used to receive deposit/redeem fee.
    address platform;
    // The deposit fee percentage in $CRV charged on each deposit.
    uint32 depositFeePercentage;
    // The redeem fee percentage in $aCRV charged on each redeem.
    uint32 redeemFeePercentage;
  }

  struct CrossChainOperationData {
    // The amount of CRV/aCRV is waiting for deposit/redeem.
    uint112 pending;
    // The amount of CRV/aCRV is depositing/redeeming.
    uint112 ongoing;
    // The current execution id, will increase after deposit/redeem is finialzed.
    uint32 executionId;
  }

  struct FinalizedOperationState {
    // The amount of CRV/aCRV provided before asynchronous deposit/redeem.
    uint128 providedAmount;
    // The amount of aCRV/CRV received after asynchronous deposit/redeem.
    uint128 executedAmount;
  }

  struct AccountOperation {
    // The current execution id.
    uint32 executionId;
    // The amount of CRV/aCRV provided after fee deduction.
    uint224 amount;
  }

  struct AccountOperationList {
    // Keep track of claimed aCRV/CRV.
    uint256 claimIndex;
    // The list of user operations group by execution id.
    AccountOperation[] operations;
  }

  /// @notice The address of CRV in Layer 2.
  address public crv;
  /// @notice The address of aCRV in Layer 2.
  address public acrv;
  /// @notice The address of Layer1ACRVProxy contract.
  address public layer1Proxy;
  /// @notice Fee data on deposit/redeem.
  FeeData public fees;

  /// @notice The status for async deposit.
  AsyncOperationStatus public asyncDepositStatus;
  /// @notice The data for CRV deposit operation.
  CrossChainOperationData public depositOperation;

  /// @notice The status for async redeem.
  AsyncOperationStatus public asyncRedeemStatus;
  /// @notice The data for aCRV redeem operation.
  CrossChainOperationData public redeemOperation;

  /// @notice Mapping from execution id to finalized deposit state.
  mapping(uint256 => FinalizedOperationState) public finialzedDepositState;
  /// @notice Mapping from execution id to finalized redeem state.
  mapping(uint256 => FinalizedOperationState) public finialzedRedeemState;

  /// @notice Mapping from account address to deposit operations.
  mapping(address => AccountOperationList) public accountDepositOperations;
  /// @notice Mapping from account address to redeem operations.
  mapping(address => AccountOperationList) public accountRedeemOperations;

  /// @notice Keep track of a list of whitelist addresses.
  mapping(address => bool) public whitelist;

  uint256 private constant _NOT_ENTERED = 1;
  uint256 private constant _ENTERED = 2;
  uint256 private _enterStatus;

  /// @dev Prevents a contract from calling itself, directly or indirectly.
  /// Calling a `nonReentrant` function from another `nonReentrant`
  /// function is not supported. It is possible to prevent this from happening
  /// by making the `nonReentrant` function external, and make it call a
  /// `private` function that does the actual work.
  modifier nonReentrant() {
    // On the first call to nonReentrant, _notEntered will be true
    require(_enterStatus != _ENTERED, "ReentrancyGuard: reentrant call");

    // Any calls to nonReentrant after this point will fail
    _enterStatus = _ENTERED;

    _;

    // By storing the original value once again, a refund is triggered (see
    // https://eips.ethereum.org/EIPS/eip-2200)
    _enterStatus = _NOT_ENTERED;
  }

  function _initialize(
    address _anyCallProxy,
    address _crossChainCallProxy,
    address _owner,
    address _crv,
    address _acrv,
    address _layer1Proxy
  ) internal {
    // solhint-disable-next-line reason-string
    require(_crv != address(0), "Layer2CRVDepositor: zero address");
    // solhint-disable-next-line reason-string
    require(_acrv != address(0), "Layer2CRVDepositor: zero address");
    // solhint-disable-next-line reason-string
    require(_layer1Proxy != address(0), "Layer2CRVDepositor: zero address");

    CrossChainCallBase._initialize(_anyCallProxy, _crossChainCallProxy, _owner);

    crv = _crv;
    acrv = _acrv;
    layer1Proxy = _layer1Proxy;

    // for ReentrancyGuard
    _enterStatus = _NOT_ENTERED;
  }

  modifier onlyWhitelist() {
    // solhint-disable-next-line reason-string
    require(whitelist[msg.sender], "Layer2CRVDepositor: only whitelist");
    _;
  }

  /********************************** View Functions **********************************/

  /// @notice Get the amount of aCRV/CRV claimable.
  /// @param _account The address of account to query.
  function claimable(address _account) external view returns (uint256 _acrvAmount, uint256 _crvAmount) {
    (, _acrvAmount) = _getClaimable(accountDepositOperations[_account], finialzedDepositState);
    (, _crvAmount) = _getClaimable(accountRedeemOperations[_account], finialzedRedeemState);
  }

  /// @notice Get the amount of aCRV/CRV abortable.
  /// @param _account The address of account to query.
  function abortable(address _account) external view returns (uint256 _acrvAmount, uint256 _crvAmount) {
    _acrvAmount = _getAbortable(false, _account);
    _crvAmount = _getAbortable(true, _account);
  }

  /********************************** Mutated Functions **********************************/

  /// @notice See {ILayer2CRVDepositor-deposit}
  function deposit(uint256 _amount) external override nonReentrant {
    // solhint-disable-next-line reason-string
    require(_amount > 0, "Layer2CRVDepositor: deposit zero amount");

    uint256 _executionId = _operateDepositOrRedeem(true, msg.sender, _amount);

    emit Deposit(msg.sender, _executionId, _amount);
  }

  /// @notice See {ILayer2CRVDepositor-abortDeposit}
  function abortDeposit(uint256 _amount) external override nonReentrant {
    // solhint-disable-next-line reason-string
    require(_amount > 0, "Layer2CRVDepositor: abort zero amount");

    uint256 _executionId = _abortDepositOrRedeem(true, msg.sender, _amount);

    emit AbortDeposit(msg.sender, _executionId, _amount);
  }

  /// @notice See {ILayer2CRVDepositor-redeem}
  function redeem(uint256 _amount) external override nonReentrant {
    // solhint-disable-next-line reason-string
    require(_amount > 0, "Layer2CRVDepositor: redeem zero amount");

    uint256 _executionId = _operateDepositOrRedeem(false, msg.sender, _amount);

    emit Redeem(msg.sender, _executionId, _amount);
  }

  /// @notice See {ILayer2CRVDepositor-abortRedeem}
  function abortRedeem(uint256 _amount) external override nonReentrant {
    // solhint-disable-next-line reason-string
    require(_amount > 0, "Layer2CRVDepositor: abort zero amount");

    uint256 _executionId = _abortDepositOrRedeem(false, msg.sender, _amount);

    emit AbortRedeem(msg.sender, _executionId, _amount);
  }

  /// @notice See {ILayer2CRVDepositor-claim}
  function claim() external override nonReentrant {
    uint256 _acrvAmount = _claim(accountDepositOperations[msg.sender], finialzedDepositState);
    IERC20(acrv).safeTransfer(msg.sender, _acrvAmount);

    uint256 _crvAmount = _claim(accountRedeemOperations[msg.sender], finialzedRedeemState);
    IERC20(crv).safeTransfer(msg.sender, _crvAmount);

    emit Claim(msg.sender, _acrvAmount, _crvAmount);
  }

  /// @notice Prepare asyncDeposit, bridge CRV to Layer1.
  /// @dev This function can only called by whitelisted addresses.
  function prepareAsyncDeposit() external virtual onlyWhitelist {
    CrossChainOperationData memory _operation = depositOperation;
    // solhint-disable-next-line reason-string
    require(_operation.ongoing == 0, "Layer2CRVDepositor: has ongoing deposit");
    // solhint-disable-next-line reason-string
    require(_operation.pending > 0, "Layer2CRVDepositor: no pending deposit");

    FeeData memory _fees = fees;
    uint256 _totalAmount = _operation.pending;
    uint256 _depositFee = (_totalAmount * _fees.depositFeePercentage) / FEE_DENOMINATOR;
    _totalAmount -= _depositFee;
    _operation.ongoing = _operation.pending;
    _operation.pending = 0;

    asyncDepositStatus = AsyncOperationStatus.Pending;
    depositOperation = _operation;
    IERC20(crv).safeTransfer(_fees.platform, _depositFee);

    (, uint256 _bridgeFee) = _bridgeACRV(layer1Proxy, _totalAmount);

    emit PrepareDeposit(_operation.executionId, _operation.ongoing, _depositFee, _bridgeFee);
  }

  /// @notice Prepare asyncRedeem, bridge aCRV to Layer1.
  /// @dev This function can only called by whitelisted addresses.
  function prepareAsyncRedeem() external virtual onlyWhitelist {
    CrossChainOperationData memory _operation = redeemOperation;
    // solhint-disable-next-line reason-string
    require(_operation.ongoing == 0, "Layer2CRVDepositor: has ongoing redeem");
    // solhint-disable-next-line reason-string
    require(_operation.pending > 0, "Layer2CRVDepositor: no pending redeem");

    FeeData memory _fees = fees;
    uint256 _totalAmount = _operation.pending;
    uint256 _redeemFee = (_totalAmount * _fees.redeemFeePercentage) / FEE_DENOMINATOR;
    _totalAmount -= _redeemFee;
    _operation.ongoing = _operation.pending;
    _operation.pending = 0;

    asyncRedeemStatus = AsyncOperationStatus.Pending;
    redeemOperation = _operation;
    IERC20(acrv).safeTransfer(_fees.platform, _redeemFee);

    (, uint256 _bridgeFee) = _bridgeACRV(layer1Proxy, _totalAmount);

    emit PrepareRedeem(_operation.executionId, _operation.ongoing, _redeemFee, _bridgeFee);
  }

  /// @notice Deposit CRV in this contract to Layer 1 aCRV contract asynchronously.
  /// @dev This function can only called by whitelisted addresses.
  function asyncDeposit() external payable virtual onlyWhitelist SponsorCrossCallFee {
    CrossChainOperationData memory _operation = depositOperation;
    // solhint-disable-next-line reason-string
    require(_operation.ongoing > 0, "Layer2CRVDepositor: no ongoing deposit");
    AsyncOperationStatus _status = asyncDepositStatus;
    // solhint-disable-next-line reason-string
    require(
      _status == AsyncOperationStatus.Pending || _status == AsyncOperationStatus.Failed,
      "Layer2CRVDepositor: no deposit or has ongoing deposit"
    );

    asyncDepositStatus = AsyncOperationStatus.OnGoing;

    // cross chain call deposit
    bytes memory _data = abi.encodeWithSelector(
      ILayer1ACRVProxy.deposit.selector,
      uint256(_operation.executionId),
      uint256(1),
      address(this),
      uint256(_operation.ongoing),
      address(this)
    );
    ICrossChainCallProxy(crossChainCallProxy).crossChainCall(layer1Proxy, _data, address(this), 1);

    emit AsyncDeposit(_operation.executionId, _status);
  }

  /// @notice Redeem aCRV in this contract to Layer 1 aCRV contract asynchronously.
  /// @dev This function can only called by whitelisted addresses.
  function asyncRedeem(uint256 _minCRVAmount) external payable virtual onlyWhitelist SponsorCrossCallFee {
    CrossChainOperationData memory _operation = redeemOperation;
    // solhint-disable-next-line reason-string
    require(_operation.ongoing > 0, "Layer2CRVDepositor: no ongoing redeem");
    AsyncOperationStatus _status = asyncRedeemStatus;
    // solhint-disable-next-line reason-string
    require(
      _status == AsyncOperationStatus.Pending || _status == AsyncOperationStatus.Failed,
      "Layer2CRVDepositor: no redeem or has ongoing redeem"
    );

    asyncRedeemStatus = AsyncOperationStatus.OnGoing;

    // cross chain call redeem
    bytes memory _data = abi.encodeWithSelector(
      ILayer1ACRVProxy.redeem.selector,
      uint256(_operation.executionId),
      uint256(1),
      address(this),
      uint256(_operation.ongoing),
      _minCRVAmount,
      address(this)
    );
    ICrossChainCallProxy(crossChainCallProxy).crossChainCall(layer1Proxy, _data, address(this), 1);

    emit AsyncRedeem(_operation.executionId, _status);
  }

  /// @notice See {ILayer2CRVDepositor-anyFallback}
  function anyFallback(address _to, bytes calldata _data) external virtual override onlyAnyCallProxy {
    bytes4 _selector;
    // solhint-disable-next-line no-inline-assembly
    assembly {
      _selector := calldataload(_data.offset)
    }
    if (_selector == ILayer1ACRVProxy.deposit.selector) {
      (uint256 _executionId, , , , ) = abi.decode(_data[4:], (uint256, uint256, address, uint256, address));
      CrossChainOperationData memory _operation = depositOperation;
      // solhint-disable-next-line reason-string
      require(_operation.executionId == _executionId, "Layer2CRVDepositor: execution id mismatch");
      // solhint-disable-next-line reason-string
      require(asyncDepositStatus == AsyncOperationStatus.OnGoing, "Layer2CRVDepositor: no ongoing deposit");
      asyncDepositStatus = AsyncOperationStatus.Failed;

      emit AsyncDepositFailed(_executionId);
    } else if (_selector == ILayer1ACRVProxy.redeem.selector) {
      (uint256 _executionId, , , , , ) = abi.decode(_data[4:], (uint256, uint256, address, uint256, uint256, address));
      CrossChainOperationData memory _operation = redeemOperation;
      // solhint-disable-next-line reason-string
      require(_operation.executionId == _executionId, "Layer2CRVDepositor: execution id mismatch");
      // solhint-disable-next-line reason-string
      require(asyncRedeemStatus == AsyncOperationStatus.OnGoing, "Layer2CRVDepositor: no ongoing redeem");
      asyncRedeemStatus = AsyncOperationStatus.Failed;

      emit AsyncRedeemFailed(_executionId);
    } else {
      _customFallback(_to, _data);
    }
  }

  /// @notice See {ILayer2CRVDepositor-finalizeDeposit}
  function finalizeDeposit(
    uint256 _executionId,
    uint256 _crvAmount,
    uint256 _acrvAmount,
    uint256 _acrvFee
  ) external virtual override onlyAnyCallProxy {
    // solhint-disable-next-line reason-string
    require(asyncDepositStatus == AsyncOperationStatus.OnGoing, "Layer2CRVDepositor: no ongoing deposit");

    CrossChainOperationData memory _operation = depositOperation;
    // solhint-disable-next-line reason-string
    require(_operation.executionId == _executionId, "Layer2CRVDepositor: execution id mismatch");

    finialzedDepositState[_executionId] = FinalizedOperationState(
      uint128(_operation.ongoing),
      uint128(_acrvAmount - _acrvFee)
    );
    asyncDepositStatus = AsyncOperationStatus.None;
    _operation.ongoing = 0;
    _operation.executionId += 1;
    depositOperation = _operation;

    emit FinalizeDeposit(_executionId, _crvAmount, _acrvAmount, _acrvFee);
  }

  /// @notice See {ILayer2CRVDepositor-finalizeRedeem}
  function finalizeRedeem(
    uint256 _executionId,
    uint256 _acrvAmount,
    uint256 _crvAmount,
    uint256 _crvFee
  ) external virtual override onlyAnyCallProxy {
    // solhint-disable-next-line reason-string
    require(asyncRedeemStatus == AsyncOperationStatus.OnGoing, "Layer2CRVDepositor: no ongoing redeem");

    CrossChainOperationData memory _operation = redeemOperation;
    // solhint-disable-next-line reason-string
    require(_operation.executionId == _executionId, "Layer2CRVDepositor: execution id mismatch");

    finialzedRedeemState[_executionId] = FinalizedOperationState(
      uint128(_operation.ongoing),
      uint128(_crvAmount - _crvFee)
    );
    asyncRedeemStatus = AsyncOperationStatus.None;
    _operation.ongoing = 0;
    _operation.executionId += 1;
    redeemOperation = _operation;

    emit FinalizeRedeem(_executionId, _acrvAmount, _crvAmount, _crvFee);
  }

  /********************************** Restricted Functions **********************************/

  /// @notice Update the address of Layer1ACRVProxy contract.
  /// @param _layer1Proxy The address to update.
  function updateLayer1Proxy(address _layer1Proxy) external onlyOwner {
    // solhint-disable-next-line reason-string
    require(_layer1Proxy != address(0), "Layer2CRVDepositor: zero address");

    layer1Proxy = _layer1Proxy;

    emit UpdateLayer1Proxy(_layer1Proxy);
  }

  /// @notice Update whitelist contract can call `crossChainCall`.
  /// @param _whitelist The list of whitelist address to update.
  /// @param _status The status to update.
  function updateWhitelist(address[] memory _whitelist, bool _status) external onlyOwner {
    for (uint256 i = 0; i < _whitelist.length; i++) {
      whitelist[_whitelist[i]] = _status;

      emit UpdateWhitelist(_whitelist[i], _status);
    }
  }

  /// @dev Update fee data
  /// @param _platform The address of platform to update.
  /// @param _depositFeePercentage The deposit fee percentage to update.
  /// @param _redeemFeePercentage The redeem fee percentage to update.
  function updateFeeData(
    address _platform,
    uint32 _depositFeePercentage,
    uint32 _redeemFeePercentage
  ) external onlyOwner {
    // solhint-disable-next-line reason-string
    require(_platform != address(0), "Layer2CRVDepositor: zero address");
    // solhint-disable-next-line reason-string
    require(_depositFeePercentage <= MAX_DEPOSIT_FEE_PERCENTAGE, "Layer2CRVDepositor: fee too large");
    // solhint-disable-next-line reason-string
    require(_redeemFeePercentage <= MAX_WITHDRAW_FEE_PERCENTAGE, "Layer2CRVDepositor: fee too large");

    fees = FeeData(_platform, _depositFeePercentage, _redeemFeePercentage);

    emit UpdateFeeData(_platform, _depositFeePercentage, _redeemFeePercentage);
  }

  /********************************** Internal Functions **********************************/

  /// @dev Internal function to get current aCRV/CRV execution id.
  function _getExecutionId(CrossChainOperationData memory _operation) private pure returns (uint256) {
    if (_operation.ongoing > 0) {
      return _operation.executionId + 1;
    } else {
      return _operation.executionId;
    }
  }

  function _isExecutionOngoing(CrossChainOperationData memory _operation, uint256 _executionId)
    private
    pure
    returns (bool)
  {
    if (_operation.ongoing > 0) {
      return _operation.executionId == _executionId;
    } else {
      return false;
    }
  }

  function _operateDepositOrRedeem(
    bool isDeposit,
    address _account,
    uint256 _amount
  ) private returns (uint256 _executionId) {
    // 1. transfer from msg.sender
    address _token = isDeposit ? crv : acrv;
    IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);

    // 2. update global state
    CrossChainOperationData memory _operation = isDeposit ? depositOperation : redeemOperation;
    _executionId = _getExecutionId(_operation);
    {
      uint256 _newPending = _amount.add(_operation.pending);
      require(_newPending <= uint112(-1), "Layer2CRVDepositor: overflow");
      _operation.pending = uint112(_newPending);
      if (isDeposit) {
        depositOperation = _operation;
      } else {
        redeemOperation = _operation;
      }
    }

    // 3. update user state
    AccountOperationList storage _operations = isDeposit
      ? accountDepositOperations[_account]
      : accountRedeemOperations[_account];
    uint256 _length = _operations.operations.length;
    if (_length > 0 && _operations.operations[_length - 1].executionId == _executionId) {
      _operations.operations[_length - 1].amount += uint224(_amount); // addition is safe
    } else {
      _operations.operations.push(AccountOperation(uint32(_executionId), uint224(_amount)));
    }
  }

  function _abortDepositOrRedeem(
    bool isDeposit,
    address _account,
    uint256 _amount
  ) private returns (uint256 _executionId) {
    // 1. check global last operation status
    CrossChainOperationData memory _operation = isDeposit ? depositOperation : redeemOperation;
    _executionId = _getExecutionId(_operation);
    // solhint-disable-next-line reason-string
    require(!_isExecutionOngoing(_operation, _executionId), "Layer2CRVDepositor: execution is ongoing");

    // 2. check and update user last operation
    AccountOperationList storage _operations = isDeposit
      ? accountDepositOperations[_account]
      : accountRedeemOperations[_account];
    uint256 _length = _operations.operations.length;
    if (_length > 0 && _operations.operations[_length - 1].executionId == _executionId) {
      AccountOperation memory _accountOperation = _operations.operations[_length - 1];
      // solhint-disable-next-line reason-string
      require(_accountOperation.amount >= _amount, "Layer2CRVDepositor: insufficient amount to abort");
      _operations.operations[_length - 1].amount -= uint224(_amount);
    } else {
      // solhint-disable-next-line reason-string
      revert("Layer2CRVDepositor: insufficient amount to abort");
    }

    // 3. update last global operation
    _operation.pending -= uint112(_amount);
    if (isDeposit) {
      depositOperation = _operation;
    } else {
      redeemOperation = _operation;
    }

    // transfer token to user
    address _token = isDeposit ? crv : acrv;
    IERC20(_token).safeTransfer(_account, _amount);
  }

  function _claim(
    AccountOperationList storage _operations,
    mapping(uint256 => FinalizedOperationState) storage _finalized
  ) private returns (uint256 _claimable) {
    uint256 _claimIndex;
    (_claimIndex, _claimable) = _getClaimable(_operations, _finalized);

    _operations.claimIndex = _claimIndex;
  }

  function _getClaimable(
    AccountOperationList storage _operations,
    mapping(uint256 => FinalizedOperationState) storage _finalized
  ) private view returns (uint256 _claimIndex, uint256 _claimable) {
    uint256 _length = _operations.operations.length;
    _claimIndex = _operations.claimIndex;
    AccountOperation memory _operation;
    FinalizedOperationState memory _finalizedState;
    while (_claimIndex < _length) {
      _operation = _operations.operations[_claimIndex];
      _finalizedState = _finalized[_operation.executionId];

      if (_finalizedState.providedAmount == 0) break;

      _claimable += (uint256(_operation.amount) * _finalizedState.executedAmount) / _finalizedState.providedAmount;
      _claimIndex += 1;
    }
  }

  function _getAbortable(bool isDeposit, address _account) private view returns (uint256) {
    CrossChainOperationData memory _operation = isDeposit ? depositOperation : redeemOperation;
    uint256 _executionId = _getExecutionId(_operation);
    if (!_isExecutionOngoing(_operation, _executionId)) return 0;

    AccountOperationList storage _operations = isDeposit
      ? accountDepositOperations[_account]
      : accountRedeemOperations[_account];
    uint256 _length = _operations.operations.length;
    if (_length > 0 && _operations.operations[_length - 1].executionId == _executionId) {
      AccountOperation memory _accountOperation = _operations.operations[_length - 1];
      return _accountOperation.amount;
    } else {
      return 0;
    }
  }

  /// @dev Internal function to handle failure fallback except deposit and redeem.
  /// @param _to The target address in original call.
  /// @param _data The calldata pass to target address in original call.
  function _customFallback(address _to, bytes memory _data) internal virtual {}
}

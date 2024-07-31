// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { AccessControlEnumerable } from "@openzeppelin/contracts-v4/access/AccessControlEnumerable.sol";
import { Clones } from "@openzeppelin/contracts-v4/proxy/Clones.sol";
import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IVesting } from "./IVesting.sol";
import { IVestingManager } from "./IVestingManager.sol";

import { PlainVestingManager } from "./management/PlainVestingManager.sol";
import { VestingManagerProxy } from "./VestingManagerProxy.sol";

// solhint-disable not-rely-on-time

contract ManageableVesting is AccessControlEnumerable, IVesting {
  using SafeERC20 for IERC20;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the address of vesting manager is updated.
  /// @param index The index of vesting manager updated.
  /// @param oldManager The address of previous vesting manager.
  /// @param newManager The address of current vesting manager.
  event UpdateVestingManager(uint256 indexed index, address indexed oldManager, address indexed newManager);

  /// @notice Emitted when vesting token is managed.
  /// @param index The index of vesting manager used.
  /// @param amount The amount of token managed.
  event Manage(uint256 indexed index, uint256 amount);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when vesting amount is zero.
  error ErrorVestZeroAmount();

  /// @dev Thrown when the vesting timestamp is invalid.
  error ErrorInvalidTimestamp();

  /// @dev Thrown when cancel/manage a cancelled vesting.
  error ErrorVestingAlreadyCancelled();

  /// @dev Thrown when a vesting is already managed by manager.
  error ErrorVesingAlreadyManaged();

  /// @dev Thrown when the manager index is invalid.
  error ErrorInvalidManagerIndex();

  /*************
   * Constants *
   *************/

  /// @notice The role for vesting creater.
  bytes32 public constant VESTING_CREATOR_ROLE = keccak256("VESTING_CREATOR_ROLE");

  /// @notice The address of token to vest.
  address public immutable token;

  /// @notice The address of VestingManagerProxy implementation.
  address public immutable implementation;

  /// @dev The address of PlainVestingManager contract.
  address public immutable plainVestingManager;

  /***********
   * Structs *
   ***********/

  /// @dev Compiler will pack this into single `uint256`.
  struct VestState {
    // The total amount of vesting token.
    uint96 vestingAmount;
    // The start timestamp of this vesting.
    uint32 startTime;
    // The finish timestamp of this vesting.
    uint32 finishTime;
    // The cancel timestamp of this vesting.
    uint32 cancelTime;
    // The last claim timestamp of this vesting.
    uint32 lastClaimTime;
    // The index of manager for this vesting.
    uint32 managerIndex;
  }

  /*************
   * Variables *
   *************/

  /// @notice Mapping from user address to vesting list.
  mapping(address => VestState[]) public vesting;

  /// @notice Mapping from user address to active index in the vesting list.
  mapping(address => uint256) public activeVestingIndex;

  /// @notice Mapping from user address to VestingManagerProxy contract.
  mapping(address => address) public proxy;

  /// @notice The list of VestingManager contract.
  address[] public managers;

  /***************
   * Constructor *
   ***************/

  constructor(address _token) {
    token = _token;
    implementation = address(new VestingManagerProxy(address(this)));
    plainVestingManager = address(new PlainVestingManager(_token));

    managers.push(plainVestingManager);
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the vesting list for some user.
  /// @param _recipient The address of user to query.
  function getUserVest(address _recipient) external view returns (VestState[] memory) {
    return vesting[_recipient];
  }

  /// @inheritdoc IVesting
  function vested(address _recipient) external view override returns (uint256 _vested) {
    uint256 _length = vesting[_recipient].length;
    uint32 _nowTime = uint32(block.timestamp);
    for (uint256 i = activeVestingIndex[_recipient]; i < _length; i++) {
      _vested += _getVested(vesting[_recipient][i], _nowTime);
    }
    return _vested;
  }

  /// @inheritdoc IVesting
  function locked(address _recipient) external view override returns (uint256 _unvested) {
    uint256 _length = vesting[_recipient].length;
    uint32 _nowTime = uint32(block.timestamp);
    for (uint256 i = activeVestingIndex[_recipient]; i < _length; i++) {
      VestState memory _state = vesting[_recipient][i];
      _unvested += _state.vestingAmount - _getVested(_state, _nowTime);
    }
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IVesting
  function claim() external override returns (uint256 _claimable) {
    _claimable = claim(0);
  }

  /// @notice Claim pending tokens
  /// @param _managerIndex The index of manager to claim.
  /// @return _claimable The amount of token will receive in this claim.
  function claim(uint32 _managerIndex) public returns (uint256 _claimable) {
    address _sender = _msgSender();
    uint32 _nowTime = uint32(block.timestamp);
    uint256 _length = vesting[_sender].length;
    uint256 _activeIndex = activeVestingIndex[_sender];
    for (uint256 i = _activeIndex; i < _length; i++) {
      VestState memory _state = vesting[_sender][i];
      // ignore mismatched mananger index
      if (_state.managerIndex != _managerIndex) continue;

      // update active index if current one is expired or cancelled.
      if (i == _activeIndex && (_nowTime >= _state.finishTime || _state.cancelTime > 0)) {
        _activeIndex += 1;
      }

      uint256 _claimed = _getVested(_state, _state.lastClaimTime);
      uint256 _vested = _getVested(_state, _nowTime);
      _claimable += _vested - _claimed;

      _state.lastClaimTime = _nowTime;
      vesting[_sender][i] = _state;
    }
    activeVestingIndex[_sender] = _activeIndex;

    VestingManagerProxy(proxy[_sender]).execute(
      _managerIndex == 0 ? plainVestingManager : managers[_managerIndex],
      abi.encodeCall(IVestingManager.withdraw, (_claimable, _msgSender()))
    );

    emit Claim(_sender, _claimable);
  }

  /// @notice Manage a list of vestings
  /// @param _indices The list of vesting indices.
  /// @param _managerIndex The index of VestingManager.
  function manage(uint256[] memory _indices, uint256 _managerIndex) external {
    if (_managerIndex == 0 || _managerIndex >= managers.length) revert ErrorInvalidManagerIndex();

    address _sender = _msgSender();
    VestState[] storage lists = vesting[_sender];

    uint256 _amount;
    for (uint256 i = 0; i < _indices.length; i++) {
      VestState memory _state = lists[_indices[i]];
      if (_state.managerIndex != 0) revert ErrorVesingAlreadyManaged();
      _state.managerIndex = uint32(_managerIndex);
      lists[_indices[i]] = _state;

      uint256 _claimed = _getVested(_state, _state.lastClaimTime);
      _amount += uint256(_state.vestingAmount) - _claimed;
    }

    // manage the asset through VestingManagerProxy
    VestingManagerProxy(proxy[_sender]).execute(
      managers[_managerIndex],
      abi.encodeCall(IVestingManager.manage, (_amount, _sender))
    );

    emit Manage(_managerIndex, _amount);
  }

  /// @notice Claim rewards from manager.
  /// @param _managerIndex The index of VestingManager.
  /// @param _receiver The address of reward token recipient.
  function getReward(uint256 _managerIndex, address _receiver) external {
    VestingManagerProxy(proxy[_msgSender()]).execute(
      managers[_managerIndex],
      abi.encodeCall(IVestingManager.getReward, (_receiver))
    );
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @inheritdoc IVesting
  function newVesting(
    address _recipient,
    uint96 _amount,
    uint32 _startTime,
    uint32 _finishTime
  ) external override onlyRole(VESTING_CREATOR_ROLE) {
    if (_amount == 0) revert ErrorVestZeroAmount();
    if (_startTime >= _finishTime) revert ErrorInvalidTimestamp();

    // create proxy if not exists
    address _proxy = proxy[_recipient];
    if (_proxy == address(0)) {
      _proxy = Clones.clone(implementation);
      proxy[_recipient] = _proxy;
    }

    // token is transfered to proxy directly
    IERC20(token).safeTransferFrom(_msgSender(), _proxy, _amount);

    uint256 _index = vesting[_recipient].length;
    vesting[_recipient].push(
      VestState({
        vestingAmount: _amount,
        startTime: _startTime,
        finishTime: _finishTime,
        cancelTime: 0,
        lastClaimTime: 0,
        managerIndex: 0
      })
    );

    emit Vest(_recipient, _index, _amount, _startTime, _finishTime);
  }

  /// @inheritdoc IVesting
  function cancel(address _user, uint256 _index) external override onlyRole(DEFAULT_ADMIN_ROLE) {
    VestState memory _state = vesting[_user][_index];
    if (_state.cancelTime > 0) revert ErrorVestingAlreadyCancelled();

    uint32 _nowTime = uint32(block.timestamp);
    uint256 _vestedAmount = _getVested(_state, _nowTime);
    uint256 _unvested = _state.vestingAmount - _vestedAmount;
    if (_unvested == 0) return; // no need to cancel

    _state.cancelTime = _nowTime;
    vesting[_user][_index] = _state;

    // withdraw unvested to token to admin
    VestingManagerProxy(proxy[_user]).execute(
      managers[_state.managerIndex],
      abi.encodeCall(IVestingManager.withdraw, (_unvested, _msgSender()))
    );

    emit Cancel(_user, _index, _unvested, block.timestamp);
  }

  /// @notice Add a new VestingManager contract.
  /// @param _manager The address of the new VestingManager contract.
  function addVestingManager(address _manager) external onlyRole(DEFAULT_ADMIN_ROLE) {
    uint256 _managerIndex = managers.length;
    managers.push(_manager);

    emit UpdateVestingManager(_managerIndex, address(0), _manager);
  }

  /// @notice Update the address of an existing VestingManager contract.
  /// @param _managerIndex The index of the manager to update.
  /// @param _newManager The address of the new VestingManager contract.
  function updateVestingManager(uint256 _managerIndex, address _newManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_managerIndex == 0 || _managerIndex >= managers.length) revert ErrorInvalidManagerIndex();

    address _oldManager = managers[_managerIndex];
    managers[_managerIndex] = _newManager;

    emit UpdateVestingManager(_managerIndex, _oldManager, _newManager);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to calculate vested token amount for a single vest.
  /// @param _state The vest state.
  /// @param _claimTime The timestamp in second when someone claim vested token.
  function _getVested(VestState memory _state, uint32 _claimTime) internal pure returns (uint256) {
    // This vest is canceld before, so we take minimum between claimTime and cancelTime.
    if (_state.cancelTime != 0 && _state.cancelTime < _claimTime) {
      _claimTime = _state.cancelTime;
    }

    if (_claimTime < _state.startTime) {
      return 0;
    } else if (_claimTime >= _state.finishTime) {
      return _state.vestingAmount;
    } else {
      return
        (uint256(_state.vestingAmount) * uint256(_claimTime - _state.startTime)) /
        uint256(_state.finishTime - _state.startTime);
    }
  }
}

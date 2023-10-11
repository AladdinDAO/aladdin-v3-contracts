// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IVesting } from "./IVesting.sol";

// solhint-disable not-rely-on-time

contract Vesting is Ownable, IVesting {
  using SafeERC20 for IERC20;

  /// @notice The address of token to vest.
  address public immutable token;

  struct VestState {
    uint128 vestingAmount;
    uint128 claimedAmount;
    uint64 startTime;
    uint64 endTime;
    uint64 cancleTime;
  }

  /// @notice Mapping from user address to vesting list.
  mapping(address => VestState[]) public vesting;

  /// @notice The list of whilelist address.
  mapping(address => bool) public isWhitelist;

  constructor(address _token) {
    require(_token != address(0), "Vesting: zero address token");

    token = _token;
  }

  /// @notice Return the vesting list for some user.
  /// @param _recipient The address of user to query.
  function getUserVest(address _recipient) external view returns (VestState[] memory) {
    return vesting[_recipient];
  }

  /// @inheritdoc IVesting
  function vested(address _recipient) external view override returns (uint256 _vested) {
    uint256 _length = vesting[_recipient].length;
    for (uint256 i = 0; i < _length; i++) {
      _vested += _getVested(vesting[_recipient][i], block.timestamp);
    }
    return _vested;
  }

  /// @inheritdoc IVesting
  function locked(address _recipient) external view override returns (uint256 _unvested) {
    uint256 _length = vesting[_recipient].length;
    for (uint256 i = 0; i < _length; i++) {
      VestState memory _state = vesting[_recipient][i];
      _unvested += _state.vestingAmount - _getVested(_state, block.timestamp);
    }
  }

  /// @inheritdoc IVesting
  function claim() external override returns (uint256 _claimable) {
    uint256 _length = vesting[msg.sender].length;
    for (uint256 i = 0; i < _length; i++) {
      VestState memory _state = vesting[msg.sender][i];

      uint256 _vested = _getVested(_state, block.timestamp);
      vesting[msg.sender][i].claimedAmount = uint128(_vested);

      _claimable += _vested - _state.claimedAmount;
    }

    IERC20(token).safeTransfer(msg.sender, _claimable);

    emit Claim(msg.sender, _claimable);
  }

  /// @inheritdoc IVesting
  function newVesting(
    address _recipient,
    uint96 _amount,
    uint32 _startTime,
    uint32 _endTime
  ) external override {
    require(_startTime < _endTime, "Vesting: invalid timestamp");
    require(isWhitelist[msg.sender], "Vesting: caller not whitelisted");

    IERC20(token).safeTransferFrom(msg.sender, address(this), _amount);

    uint256 _index = vesting[_recipient].length;
    vesting[_recipient].push(
      VestState({ vestingAmount: _amount, claimedAmount: 0, startTime: _startTime, endTime: _endTime, cancleTime: 0 })
    );

    emit Vest(_recipient, _index, _amount, _startTime, _endTime);
  }

  /// @inheritdoc IVesting
  function cancle(address _user, uint256 _index) external override onlyOwner {
    VestState memory _state = vesting[_user][_index];
    require(_state.cancleTime == 0, "already cancled");

    uint256 _vestedAmount = _getVested(_state, block.timestamp);
    uint256 _unvested = _state.vestingAmount - _vestedAmount;
    IERC20(token).safeTransfer(msg.sender, _unvested);

    vesting[_user][_index].cancleTime = uint64(block.timestamp);

    emit Cancle(_user, _index, _unvested, block.timestamp);
  }

  /// @notice Update the whitelist status of given accounts.
  /// @param _accounts The list of accounts to update.
  /// @param _status The status to update.
  function updateWhitelist(address[] memory _accounts, bool _status) external onlyOwner {
    for (uint256 i = 0; i < _accounts.length; i++) {
      isWhitelist[_accounts[i]] = _status;
    }
  }

  /// @dev Internal function to calculate vested token amount for a single vest.
  /// @param _state The vest state.
  /// @param _claimTime The timestamp in second when someone claim vested token.
  function _getVested(VestState memory _state, uint256 _claimTime) internal pure returns (uint256) {
    // This vest is cancled before, so we take minimum between claimTime and cancleTime.
    if (_state.cancleTime != 0 && _state.cancleTime < _claimTime) {
      _claimTime = _state.cancleTime;
    }

    if (_claimTime < _state.startTime) {
      return 0;
    } else if (_claimTime >= _state.endTime) {
      return _state.vestingAmount;
    } else {
      // safe math is not needed, since all amounts are valid.
      return (uint256(_state.vestingAmount) * (_claimTime - _state.startTime)) / (_state.endTime - _state.startTime);
    }
  }
}

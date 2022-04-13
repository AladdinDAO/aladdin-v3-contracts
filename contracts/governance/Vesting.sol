// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract Vesting is Ownable {
  using SafeERC20 for IERC20;

  event Vest(address indexed _recipient, uint256 _amount, uint256 _startTime, uint256 _endTime);
  event Claim(address indexed _recipient, uint256 _amount);

  address public immutable token;

  struct VestState {
    uint128 vestedAmount;
    uint128 claimedAmount;
    uint64 startTime;
    uint64 endTime;
  }

  mapping(address => VestState) public vesting;

  constructor(address _token) {
    require(_token != address(0), "Vesting: zero address token");

    token = _token;
  }

  function vested(address _recipient) external view returns (uint256) {
    // solhint-disable-next-line not-rely-on-time
    return _vested(_recipient, block.timestamp);
  }

  function locked(address _recipient) external view returns (uint256) {
    // solhint-disable-next-line not-rely-on-time
    return vesting[_recipient].vestedAmount - _vested(_recipient, block.timestamp);
  }

  function claim() external {
    uint256 _claimed = vesting[msg.sender].claimedAmount;
    // solhint-disable-next-line not-rely-on-time
    uint256 _claimable = _vested(msg.sender, block.timestamp) - vesting[msg.sender].claimedAmount;
    vesting[msg.sender].claimedAmount = uint128(_claimed + _claimable);

    IERC20(token).safeTransfer(msg.sender, _claimable);

    emit Claim(msg.sender, _claimable);
  }

  function newVesting(
    address _recipient,
    uint256 _amount,
    uint256 _startTime,
    uint256 _endTime
  ) external {
    require(vesting[_recipient].vestedAmount == 0, "Vesting: already vested");
    require(_startTime < _endTime && _endTime < uint64(-1), "Vesting: invalid timestamp");

    IERC20(token).safeTransferFrom(msg.sender, address(this), _amount);

    vesting[_recipient] = VestState({
      vestedAmount: uint128(_amount),
      claimedAmount: 0,
      startTime: uint64(_startTime),
      endTime: uint64(_endTime)
    });

    emit Vest(_recipient, _amount, _startTime, _endTime);
  }

  function _vested(address _recipient, uint256 _time) internal view returns (uint256) {
    VestState memory _state = vesting[_recipient];

    if (_time < _state.startTime) {
      return 0;
    } else if (_time >= _state.endTime) {
      return _state.vestedAmount;
    } else {
      // safe math is not needed, since all amounts are valid.
      return (uint256(_state.vestedAmount) * (_time - _state.startTime)) / (_state.endTime - _state.startTime);
    }
  }
}

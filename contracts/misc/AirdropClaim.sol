// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

interface IVotingEscrow {}

interface IVesting {
  function newVesting(
    address _recipient,
    uint256 _amount,
    uint256 _startTime,
    uint256 _endTime
  ) external;
}

contract AirdropClaim {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  /// @notice The address of airdrop token.
  address public immutable token;

  /// @notice The address of Vesting contract.
  address public immutable vesting;

  /// @notice The address of Voting Escrow contract.
  address public immutable ve;

  /// @notice The minimum lock or vest duration.
  uint256 public immutable minDuration;

  /// @notice Mapping from user address to the amount of token claimable.
  mapping(address => uint256) public balances;

  modifier onlyClaimable(uint256 _duration) {
    require(balances[msg.sender] > 0, "nothing to claim");
    require(_duration >= minDuration, "vest/lock duration too small");
    _;
    balances[msg.sender] = 0;
  }

  constructor(
    address _token,
    address _vesting,
    address _ve,
    uint256 _minDuration
  ) {
    token = _token;
    vesting = _vesting;
    ve = _ve;
    minDuration = _minDuration;

    IERC20(_token).safeApprove(_vesting, uint256(-1));
    IERC20(_token).safeApprove(_ve, uint256(-1));
  }

  function lock(uint256 _duration) external onlyClaimable(_duration) {}

  /// @notice Vest the airdrop token to Vesting contract.
  /// @param _duration The number of seconds to vest, must >= `minDuration`.
  function vest(uint256 _duration) external onlyClaimable(_duration) {
    // solhint-disable-next-line not-rely-on-time
    IVesting(vesting).newVesting(msg.sender, balances[msg.sender], block.timestamp, _duration.add(block.timestamp));
  }
}

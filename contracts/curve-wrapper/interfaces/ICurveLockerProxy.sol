// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface ICurveLockerProxy {
  /// @notice Return the amout of token staked in gauge.
  /// @param _gauge The address of gauge.
  function balanceOf(address _gauge) external view returns (uint256);

  /// @notice Create a veCRV lock.
  /// @param _value The amount of CRV to lock.
  /// @param _unlockTime The unlock timetamp in second.
  function createLock(uint256 _value, uint256 _unlockTime) external;

  /// @notice Increase veCRV lock amount without modifying the unlock time.
  /// @param _value The amount of CRV to lock.
  function increaseAmount(uint256 _value) external;

  /// @notice Extend veCRV lock time.
  /// @param _unlockTime The new unlock timetamp in second.
  function increaseTime(uint256 _unlockTime) external;

  /// @notice Withdraw all unlocked CRV.
  function release() external;

  /// @notice Allocate voting power for changing pool weights
  /// @param _gauge The address of gauge to vote.
  /// @param _weight Weight for a gauge in bps (units of 0.01%). Minimal is 0.01%. Ignored if 0
  function voteGaugeWeight(address _gauge, uint256 _weight) external;

  /// @notice Vote curve governance proposals.
  /// @param _voteId The proposal id.
  /// @param _votingAddress The address of governance voting contract.
  /// @param _support Whether voter supports the vote.
  function vote(
    uint256 _voteId,
    address _votingAddress,
    bool _support
  ) external;

  /// @notice Deposit staked token to Curve gauge.
  /// @dev The caller should make sure the token is already transfered to the contract.
  /// @param _gauge The address of gauge.
  /// @param _token The address token to deposit.
  function deposit(
    address _gauge,
    address _token,
    uint256 _amount
  ) external;

  /// @notice Withdraw staked token from Curve gauge.
  /// @param _gauge The address of gauge.
  /// @param _token The address token to withdraw.
  /// @param _amount The amount of token to withdraw.
  /// @param _recipient The address of recipient who will receive the staked token.
  function withdraw(
    address _gauge,
    address _token,
    uint256 _amount,
    address _recipient
  ) external;

  /// @notice Claim pending CRV rewards from Curve gauge.
  /// @param _gauge The address of gauge to claim.
  /// @param _recipient The address of recipient who will receive the CRV.
  /// @return _amount The amount of CRV claimed.
  function claimCRV(address _gauge, address _recipient) external returns (uint256 _amount);

  /// @notice Claim pending rewards from Curve gauge.
  /// @param _gauge The address of gauge to claim.
  /// @param _tokens The list of reward tokens to claim.
  /// @param _recipient The address of recipient who will receive the rewards.
  /// @return _amounts The list of amount of rewards claim for corresponding tokens.
  function claimGaugeRewards(
    address _gauge,
    address[] calldata _tokens,
    address _recipient
  ) external returns (uint256[] memory _amounts);

  /// @notice Claim pending veCRV fees.
  /// @param _distributor The address of fee distributor.
  /// @param _token The address of fee token.
  /// @param _recipient The address of recipient who will receive the fee token.
  /// @return _amount The amount of token claimed.
  function claimFees(
    address _distributor,
    address _token,
    address _recipient
  ) external returns (uint256 _amount);

  /// @notice External function to execute anycall.
  /// @param _to The address of target contract to call.
  /// @param _value The value passed to the target contract.
  /// @param _data The calldata pseed to the target contract.
  function execute(
    address _to,
    uint256 _value,
    bytes calldata _data
  ) external returns (bool, bytes memory);
}

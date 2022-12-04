// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

abstract contract RewardClaimable {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /// @notice Emitted when someone claim pending rewards.
  /// @param token The address of reward token.
  /// @param owner The address of reward token owner.
  /// @param recipient The address of reward token recipient.
  /// @param amount The amount of reward token claimed.
  event Claim(address indexed token, address indexed owner, address indexed recipient, uint256 amount);

  struct AccountRewardInfo {
    uint256 pending;
    uint256 rewardPerSharePaid;
  }

  /// @dev The precision used to compute reward tokens.
  uint256 internal constant REWARD_PRECISION = 1e18;

  /// @notice The list of rewards token.
  address[] public rewards;

  /// @notice Mapping from reward token address to reward per share.
  mapping(address => uint256) public rewardPerShare;

  /// @dev Mapping from account address to reward token address to reward info.
  mapping(address => mapping(address => AccountRewardInfo)) private accountRewards;

  function _initialize(address[] memory _rewards) internal {
    rewards = _rewards;
  }

  /// @notice Return the list amount of claimable reward tokens.
  function claimable(address _user) external view returns (uint256[] memory) {
    uint256 _length = rewards.length;
    uint256 _share = _getShares(_user);
    uint256[] memory _amounts = new uint256[](_length);
    for (uint256 i = 0; i < _length; i++) {
      address _token = rewards[i];
      AccountRewardInfo memory _info = accountRewards[_user][_token];

      _amounts[i] = _info.pending + ((rewardPerShare[_token] - _info.rewardPerSharePaid) * _share) / REWARD_PRECISION;
    }
    return _amounts;
  }

  /// @notice claim pending rewards from the contract.
  /// @dev If `_user` is not the caller, `_user` and `_recipient` should be the same.
  /// @param _user The address of account to claim.
  /// @param _recipient The address recipient who will receive the pending rewards.
  function claim(address _user, address _recipient) external {
    if (_user != msg.sender) {
      require(_user == _recipient, "forbid claim other to other");
    }

    _checkpointUser(_user);

    uint256 _length = rewards.length;
    for (uint256 i = 0; i < _length; i++) {
      address _token = rewards[i];
      uint256 _pending = accountRewards[_user][_token].pending;
      accountRewards[_user][_token].pending = 0;
      if (_pending > 0) {
        IERC20Upgradeable(_token).safeTransfer(_recipient, _pending);
      }

      emit Claim(_token, _user, _recipient, _pending);
    }
  }

  /// @notice External call to checkpoint user state.
  /// @param _user The address of user to update.
  function checkpointUser(address _user) external {
    _checkpointUser(_user);
  }

  /// @dev Internal function to checkpoint user state change.
  /// @param _user The address of user to update.
  function _checkpointUser(address _user) internal {
    uint256 _share = _getShares(_user);
    uint256 _length = rewards.length;
    for (uint256 i = 0; i < _length; i++) {
      address _token = rewards[i];
      uint256 _rewardPerShare = rewardPerShare[_token];
      AccountRewardInfo memory _info = accountRewards[_user][_token];

      _info.pending += ((_rewardPerShare - _info.rewardPerSharePaid) * _share) / REWARD_PRECISION;
      _info.rewardPerSharePaid = _rewardPerShare;
      accountRewards[_user][_token] = _info;
    }
  }

  /// @dev Internal function to return user shares.
  /// @param _user The address of user to query.
  function _getShares(address _user) internal view virtual returns (uint256);
}

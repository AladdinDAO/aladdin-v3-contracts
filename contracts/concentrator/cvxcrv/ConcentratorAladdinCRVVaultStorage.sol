// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import "../interfaces/IConcentratorGeneralVault.sol";
import "../interfaces/IMigratableConcentratorVault.sol";

// solhint-disable reason-string
// solhint-disable no-empty-blocks

/// @title ConcentratorAladdinCRVVaultStorage
/// @dev The storage layout is exactly the same as ConcentratorIFOVault contract.
abstract contract ConcentratorAladdinCRVVaultStorage is
  OwnableUpgradeable,
  ReentrancyGuardUpgradeable,
  IConcentratorGeneralVault,
  IMigratableConcentratorVault
{
  /// @notice Emitted when the platform address is updated.
  /// @param _platform The new platform address.
  event UpdatePlatform(address indexed _platform);

  /// @notice Emitted when the zap contract is updated.
  /// @param _zap The address of the zap contract.
  event UpdateZap(address indexed _zap);

  /******************** Storage entries from AladdinCRVConvexVault ********************/

  struct LegacyPoolInfo {
    // The amount of total deposited token.
    uint128 totalUnderlying;
    // The amount of total deposited shares.
    uint128 totalShare;
    // The accumulated acrv reward per share, with 1e18 precision.
    uint256 accRewardPerShare;
    // The pool id in Convex Booster.
    uint256 convexPoolId;
    // The address of deposited token.
    address lpToken;
    // The address of Convex reward contract.
    address crvRewards;
    // The withdraw fee percentage, with 1e9 precision.
    uint256 withdrawFeePercentage;
    // The platform fee percentage, with 1e9 precision.
    uint256 platformFeePercentage;
    // The harvest bounty percentage, with 1e9 precision.
    uint256 harvestBountyPercentage;
    // Whether deposit for the pool is paused.
    bool pauseDeposit;
    // Whether withdraw for the pool is paused.
    bool pauseWithdraw;
    // The list of addresses of convex reward tokens.
    address[] convexRewardTokens;
  }

  struct UserInfo {
    // The amount of shares the user deposited.
    uint128 shares;
    // The amount of current accrued rewards.
    uint128 rewards;
    // The reward per share already paid for the user, with 1e18 precision.
    uint256 rewardPerSharePaid;
  }

  /// @dev The list of all supported pool.
  LegacyPoolInfo[] internal legacyPoolInfo;

  /// @notice Mapping from pool id to account address to user share info.
  mapping(uint256 => mapping(address => UserInfo)) public userInfo;

  /// @notice The address of AladdinCRV token.
  address public aladdinCRV;

  /// @notice The address of ZAP contract, will be used to swap tokens.
  address public zap;

  /// @notice The address of recipient of platform fee
  address public platform;

  /// @notice The list of available migrators.
  mapping(address => bool) public migrators;

  /******************** Entra storage entries from ConcentratorIFOVault ********************/

  /// @notice Mapping from pool id to accumulated cont reward per share, with 1e18 precision.
  mapping(uint256 => uint256) public accCTRPerShare;

  /// @dev Mapping from pool id to account address to pending cont rewards.
  mapping(uint256 => mapping(address => uint256)) internal userCTRRewards;

  /// @dev Mapping from pool id to account address to reward per share
  /// already paid for the user, with 1e18 precision.
  mapping(uint256 => mapping(address => uint256)) internal userCTRPerSharePaid;

  /// @notice The address of $CTR token.
  address public ctr;

  /// @notice The start timestamp in seconds.
  uint64 public startTime;

  /// @notice The end timestamp in seconds.
  uint64 public endTime;

  /// @notice The amount of $CTR token mined so far.
  uint128 public ctrMined;

  // fallback function to receive eth.
  receive() external payable {}

  /********************************** Restricted Functions **********************************/

  /// @notice Update the recipient for platform fee.
  /// @param _platform The address of new platform.
  function updatePlatform(address _platform) external onlyOwner {
    require(_platform != address(0), "Concentrator: zero platform address");
    platform = _platform;

    emit UpdatePlatform(_platform);
  }

  /// @dev Update the zap contract
  function updateZap(address _zap) external onlyOwner {
    require(_zap != address(0), "Concentrator: zero zap address");
    zap = _zap;

    emit UpdateZap(_zap);
  }
}

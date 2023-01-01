// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";

import "../interfaces/IConcentratorGeneralVault.sol";
import "../interfaces/IMigratableConcentratorVault.sol";

/// @title ConcentratorAladdinFXSVaultStorage
/// @dev The storage layout is exactly the same as AladdinFXSConvexVault contract.
abstract contract ConcentratorAladdinFXSVaultStorage is
  OwnableUpgradeable,
  ReentrancyGuardUpgradeable,
  IConcentratorGeneralVault,
  IMigratableConcentratorVault
{
  /******************** Storage entries from ConcentratorConvexVault ********************/
  /// @dev Compiler will pack this into single `uint256`.
  struct LegacyRewardInfo {
    // The current reward rate per second.
    uint128 rate;
    // The length of reward period in seconds.
    // If the value is zero, the reward will be distributed immediately.
    uint32 periodLength;
    // The timesamp in seconds when reward is updated.
    uint48 lastUpdate;
    // The finish timestamp in seconds of current reward period.
    uint48 finishAt;
  }

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
    // mapping from spender to allowance.
    mapping(address => uint256) allowances;
  }

  /// @dev The precision used to calculate accumulated rewards.
  uint256 internal constant REWARD_PRECISION = 1e18;

  /// @dev The fee denominator used for percentage calculation.
  uint256 internal constant FEE_DENOMINATOR = 1e9;

  /// @dev The maximum percentage of withdraw fee.
  uint256 internal constant MAX_WITHDRAW_FEE = 1e8; // 10%

  /// @dev The maximum percentage of platform fee.
  uint256 internal constant MAX_PLATFORM_FEE = 2e8; // 20%

  /// @dev The maximum percentage of harvest bounty.
  uint256 internal constant MAX_HARVEST_BOUNTY = 1e8; // 10%

  /// @dev The number of seconds in one week.
  uint256 internal constant WEEK = 86400 * 7;

  /// @dev The address of Convex Booster Contract
  address private constant BOOSTER = 0xF403C135812408BFbE8713b5A23a04b3D48AAE31;

  /// @notice The list of all supported pool.
  LegacyPoolInfo[] public poolInfo;

  /// @notice The list of reward info for all supported pool.
  LegacyRewardInfo[] public rewardInfo;

  /// @notice Mapping from pool id to account address to user share info.
  mapping(uint256 => mapping(address => UserInfo)) public userInfo;

  /// @notice The address of recipient of platform fee
  address public platform;

  /******************** Extra storage entries from AladdinFXSConvexVault ********************/

  /// @dev The address of Curve cvxfxs pool.
  address private constant CURVE_cvxFXS_POOL = 0xd658A338613198204DCa1143Ac3F01A722b5d94A;

  /// @dev The address of Curve cvxfxs pool token.
  address private constant CURVE_cvxFXS_TOKEN = 0xF3A43307DcAFa93275993862Aae628fCB50dC768;

  /// @dev The address of FXS token.
  address private constant FXS = 0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0;

  /// @dev The address of cvxFXS token.
  // solhint-disable-next-line const-name-snakecase
  address private constant cvxFXS = 0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0;

  /// @notice The address of AladdinFXS token.
  address public aladdinFXS;

  /// @notice The address of ZAP contract, will be used to swap tokens.
  address public zap;
}

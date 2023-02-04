// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/BeaconProxy.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";

import "./interfaces/ICurveGaugeLiquidityStaking.sol";
import "./interfaces/ICrvLockerLiquidityStaking.sol";
import "./interfaces/ICurveLockerProxy.sol";
import "./interfaces/ILiquidityStaking.sol";
import "../interfaces/IZap.sol";

// solhint-disable reason-string

contract CurveBooster is Ownable {
  using EnumerableSet for EnumerableSet.AddressSet;
  using SafeERC20 for IERC20;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the platform address is updated.
  /// @param _platform The new platform address.
  event UpdatePlatform(address indexed _platform);

  /// @notice Emitted when the zap contract is updated.
  /// @param _zap The address of the zap contract.
  event UpdateZap(address indexed _zap);

  /// @notice Emitted when pool incentive ratios are updated.
  /// @param platformFeeRatio The new platform fee ratio updated.
  /// @param harvestBountyRatio The new harvest bounty ratio updated.
  /// @param lockerFeeRatio The new locker fee ratio updated.
  event UpdateIncentiveFeeRatio(uint32 platformFeeRatio, uint32 harvestBountyRatio, uint32 lockerFeeRatio);

  /// @notice Emitted when 3CRV fees are harvested.
  /// @param rewards The amount of CRV harvested.
  event HarvestFees(uint256 rewards);

  /// @notice Emitted when gauge rewards are harvested.
  /// @param caller The address of caller.
  /// @param rewards The amount of CRV harvested.
  /// @param platformFee The incentive for Aladdin Treasury.
  /// @param harvestBounty The incentive for caller.
  /// @param lockerFee The incentive for CRV locker.
  event HarvestRewards(address caller, uint256 rewards, uint256 platformFee, uint256 harvestBounty, uint256 lockerFee);

  /// @notice Emitted when a new gauge reward is added.
  /// @param gauge The address of gauge.
  /// @param token The address of reward token.
  event AddRewards(address gauge, address token);

  /*************
   * Constants *
   *************/

  /// @dev The fee precision.
  uint256 public constant FEE_PRECISION = 1e9;

  /// @dev The maximum percentage of locker fee.
  uint256 internal constant MAX_LOCKER_FEE = 2e8; // 20%

  /// @dev The maximum percentage of platform fee.
  uint256 internal constant MAX_PLATFORM_FEE = 2e8; // 20%

  /// @dev The maximum percentage of harvest bounty.
  uint256 internal constant MAX_HARVEST_BOUNTY = 1e8; // 10%

  /// @dev The address of veCRV Fee Distributor contract.
  address public constant FEE_DISTRIBUTOR = 0xA464e6DCda8AC41e03616F95f4BC98a13b8922Dc;

  /// @dev The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @dev The address of 3CRV token.
  address public constant THREE_CRV = 0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490;

  /// @dev The address of Curve Gauge Controller contract.
  address private constant GAUGE_CONTROLLER = 0x2F50D538606Fa9EDD2B11E2446BEb18C9D5846bB;

  /// @notice The address of CurveLockerProxy contract.
  address public immutable proxy;

  /// @notice The address of AldVeCRVLiquidityStaking contract.
  address public immutable lockStaker;

  /***********
   * Structs *
   ***********/

  /// @dev Compiler will pack this into single `uint256`.
  struct IncentiveConfig {
    // Incentive to Aladdin Treasury.
    uint32 platformFeeRatio;
    // Incentive to harvest caller.
    uint32 harvestBountyRatio;
    // Incentive to aldveCRV staker.
    uint32 lockerFeeRatio;
  }

  /*************
   * Variables *
   *************/

  /// @notice The address of zap contract.
  address public zap;

  /// @notice The address of platform.
  address public platform;

  /// @notice The incentive config used in harvest.
  IncentiveConfig public incentiveConfig;

  /// @notice The address of implementation of CurveGaugeLiquidityStaking.
  address public curveGaugeLiquidityStakingBeacon;

  /// @notice Mapping from gauge address to CurveGaugeLiquidityStaking contract.
  mapping(address => address) public liquidityStakers;

  /// @notice Mapping from gauge address to staking token.
  mapping(address => address) public stakingTokens;

  /// @dev Mapping from gauge address to list of extra rewards.
  mapping(address => EnumerableSet.AddressSet) private extraGaugeRewardLists;

  /***************
   * Constructor *
   ***************/

  constructor(address _proxy, address _lockStaker) {
    proxy = _proxy;
    lockStaker = _lockStaker;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit token into the given gauge.
  /// @param _gauge The address of curve gauge.
  /// @param _amount The amount of token to deposit.
  /// @param _recipient The address of recipient.
  function deposit(
    address _gauge,
    uint256 _amount,
    address _recipient
  ) external {
    address _staker = liquidityStakers[_gauge];
    require(_staker != address(0), "CurveBooster: gauge not deployed");
    address _token = stakingTokens[_gauge];

    if (_amount == uint256(-1)) {
      _amount = IERC20(_token).balanceOf(msg.sender);
    }

    IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);

    IERC20(_token).safeApprove(_staker, 0);
    IERC20(_token).safeApprove(_staker, _amount);
    ICurveGaugeLiquidityStaking(_staker).deposit(_amount, _recipient);
  }

  /// @notice Deploy a gauge to Aladdin Curve Booster.
  /// @param _gauge The address of curve gauge.
  function deployGauge(address _gauge) external {
    require(liquidityStakers[_gauge] == address(0), "CurveBooster: gauge already deployed");

    // @todo check gauge controller

    address _proxy = address(new BeaconProxy(curveGaugeLiquidityStakingBeacon, new bytes(0)));
    ICurveGaugeLiquidityStaking(_proxy).initialize(_gauge);

    liquidityStakers[_gauge] = _proxy;
    stakingTokens[_gauge] = ICurveGaugeLiquidityStaking(_proxy).stakingToken();
  }

  /// @notice Harvest 3CRV fee and distribute to aldveCRV staking contract.
  /// @param _minOut The minimum amount of CRV should harvested.
  function harvestFees(uint256 _minOut) external returns (uint256) {
    // claim 3CRV
    uint256 _amount = ICrvLockerLiquidityStaking(lockStaker).claimFees(FEE_DISTRIBUTOR, THREE_CRV);

    // burn 3CRV as CRV
    _amount = _swapToCRV(THREE_CRV, _amount);
    require(_amount >= _minOut, "CurveBooster: insufficient output");

    emit HarvestFees(_amount);

    // queue rewards in aldveCRV staking contract.
    IERC20(CRV).safeTransfer(lockStaker, _amount);
    ILiquidityStaking(lockStaker).queueNewRewards(_amount);

    return _amount;
  }

  /// @notice harvest gauge rewards and distribute to corresponding staking contract.
  /// @param _gauge The address of gauge to harvest.
  /// @param _minOut The minimum amount of CRV should harvested.
  function harvestRewards(address _gauge, uint256 _minOut) external returns (uint256) {
    address _staker = liquidityStakers[_gauge];
    require(_staker != address(0), "CurveBooster: gauge not deployed");

    // claim rewards
    uint256 _amountCRV;
    {
      EnumerableSet.AddressSet storage _list = extraGaugeRewardLists[_gauge];
      uint256 _length = _list.length();
      address[] memory _tokens = new address[](_length);
      uint256[] memory _amounts;
      for (uint256 i = 0; i < _length; i++) {
        _tokens[i] = _list.at(i);
      }
      (_amountCRV, _amounts) = ICurveGaugeLiquidityStaking(_staker).claimRewards(_tokens);

      // burn rewards to CRV
      for (uint256 i = 0; i < _length; i++) {
        _amountCRV += _swapToCRV(_tokens[i], _amounts[i]);
      }
      require(_amountCRV >= _minOut, "CurveBooster: insufficient output");
    }

    // distribute incentives.
    IncentiveConfig memory _config = incentiveConfig;
    uint256 _platformFee;
    uint256 _harvestBounty;
    uint256 _lockerFee;
    if (_config.platformFeeRatio > 0) {
      _platformFee = (_amountCRV * _config.platformFeeRatio) / FEE_PRECISION;
      IERC20(CRV).safeTransfer(platform, _platformFee);
    }
    if (_config.harvestBountyRatio > 0) {
      _harvestBounty = (_amountCRV * _config.harvestBountyRatio) / FEE_PRECISION;
      IERC20(CRV).safeTransfer(msg.sender, _harvestBounty);
    }
    if (_config.lockerFeeRatio > 0) {
      _lockerFee = (_amountCRV * _config.lockerFeeRatio) / FEE_PRECISION;
      IERC20(CRV).safeTransfer(lockStaker, _lockerFee);
      ILiquidityStaking(lockStaker).queueNewRewards(_lockerFee);
    }

    emit HarvestRewards(msg.sender, _amountCRV, _platformFee, _harvestBounty, _lockerFee);

    // queue rewards in staker contract.
    uint256 _rewards = _amountCRV - _platformFee - _harvestBounty - _lockerFee;
    IERC20(CRV).safeTransfer(_staker, _rewards);
    ILiquidityStaking(_staker).queueNewRewards(_rewards);

    return _amountCRV;
  }

  /*******************************
   * Public Restricted Functions *
   *******************************/

  /// @notice Update the pool incentive ratios.
  /// @param _platformFeeRatio The platform fee ratio to update.
  /// @param _harvestBountyRatio The harvest bounty fee ratio to update.
  /// @param _lockerFeeRatio The withdraw fee ratio to update.
  function updatePoolFeeRatio(
    uint32 _platformFeeRatio,
    uint32 _harvestBountyRatio,
    uint32 _lockerFeeRatio
  ) external onlyOwner {
    require(_platformFeeRatio <= MAX_PLATFORM_FEE, "CurveBooster: platform fee too large");
    require(_harvestBountyRatio <= MAX_HARVEST_BOUNTY, "CurveBooster: harvest bounty too large");
    require(_lockerFeeRatio <= MAX_LOCKER_FEE, "CurveBooster: locker fee too large");

    incentiveConfig = IncentiveConfig({
      platformFeeRatio: _platformFeeRatio,
      harvestBountyRatio: _harvestBountyRatio,
      lockerFeeRatio: _lockerFeeRatio
    });

    emit UpdateIncentiveFeeRatio(_platformFeeRatio, _harvestBountyRatio, _lockerFeeRatio);
  }

  /// @notice Update the recipient for platform fee.
  /// @param _platform The address of new platform.
  function updatePlatform(address _platform) external onlyOwner {
    require(_platform != address(0), "CurveBooster: zero platform address");
    platform = _platform;

    emit UpdatePlatform(_platform);
  }

  /// @notice Update the zap contract
  /// @param _zap The address of new zap contract.
  function updateZap(address _zap) external onlyOwner {
    require(_zap != address(0), "CurveBooster: zero zap address");
    zap = _zap;

    emit UpdateZap(_zap);
  }

  /// @notice Enable the curve gauge.
  /// @param _gauge The address of curve gauge.
  function enableGauge(address _gauge) external onlyOwner {
    address _staker = liquidityStakers[_gauge];
    require(_staker != address(0), "gauge not deployed");

    ICurveGaugeLiquidityStaking(_staker).enable();
  }

  /// @notice Migrate staking token from one gauge to another.
  /// @param _srcGauge The address of source gauge.
  /// @param _dstGauge The address of destination gauge.
  function migrateGauge(address _srcGauge, address _dstGauge) external onlyOwner {
    // check whether src gauge is deployed
    address _srcStaker = liquidityStakers[_srcGauge];
    require(_srcStaker != address(0), "CurveBooster: src gauge not deployed");

    // check whether dst gauge is not deployed or not enabled
    address _dstStaker = liquidityStakers[_dstGauge];
    if (_dstStaker != address(0)) {
      require(!ICurveGaugeLiquidityStaking(_dstStaker).enabled(), "CurveBooster: dst gauge enabled");
    }

    // migrate assets
    ICurveGaugeLiquidityStaking(_srcStaker).migrateGauge(_dstGauge);

    liquidityStakers[_dstGauge] = _srcStaker;
  }

  /// @notice Add extra reward to the gauge.
  /// @param _gauge The address of curve gauge.
  /// @param _tokens The address list of rewards tokens.
  function addExtraGaugeReward(address _gauge, address[] memory _tokens) external onlyOwner {
    for (uint256 i = 0; i < _tokens.length; i++) {
      bool _added = extraGaugeRewardLists[_gauge].add(_tokens[i]);
      if (_added) {
        emit AddRewards(_gauge, _tokens[i]);
      }
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to swap token to CRV.
  /// @param _token The address of tokens to swap.
  /// @param _amount The amount of token to swap.
  function _swapToCRV(address _token, uint256 _amount) internal returns (uint256) {
    if (_token == CRV) return _amount;
    else if (_amount > 0) {
      address _zap = zap;
      if (_token == address(0)) {
        return IZap(_zap).zap{ value: _amount }(_token, _amount, CRV, 0);
      } else {
        IERC20(_token).safeTransfer(_zap, _amount);
        return IZap(_zap).zap(_token, _amount, CRV, 0);
      }
    } else {
      return 0;
    }
  }
}

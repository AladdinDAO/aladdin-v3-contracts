// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import "../../interfaces/concentrator/IAladdinCRV.sol";
import "../../interfaces/concentrator/IAladdinCompounder.sol";
import "../../interfaces/concentrator/IConcentratorStrategy.sol";
import "../../interfaces/IConvexBasicRewards.sol";
import "../../interfaces/IConvexCRVDepositor.sol";
import "../../interfaces/ICurveFactoryPlainPool.sol";
import "../../interfaces/ICvxCrvStakingWrapper.sol";
import "../../interfaces/IZap.sol";

import "../../common/fees/FeeCustomization.sol";
import "../ConcentratorBase.sol";

// solhint-disable no-empty-blocks, reason-string
contract AladdinCRVV2 is
  ERC20Upgradeable,
  OwnableUpgradeable,
  ReentrancyGuardUpgradeable,
  FeeCustomization,
  ConcentratorBase,
  IAladdinCRV,
  IAladdinCompounder
{
  using SafeMathUpgradeable for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /// @notice Emitted when pool assets migrated.
  /// @param _oldStrategy The address of old strategy.
  /// @param _newStrategy The address of current strategy.
  event MigrateStrategy(address _oldStrategy, address _newStrategy);

  /// @dev The type for withdraw fee, used in FeeCustomization.
  bytes32 internal constant WITHDRAW_FEE_TYPE = keccak256("AladdinCRV.WithdrawFee");

  /// @dev The maximum percentage of withdraw fee.
  uint256 private constant MAX_WITHDRAW_FEE = 1e8; // 10%

  /// @dev The maximum percentage of platform fee.
  uint256 private constant MAX_PLATFORM_FEE = 2e8; // 20%

  /// @dev The maximum percentage of harvest bounty.
  uint256 private constant MAX_HARVEST_BOUNTY = 1e8; // 10%

  /// @dev The address of cvxCRV token.
  address private constant CVXCRV = 0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7;

  /// @dev The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @dev The address of CVX token.
  address private constant CVX = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;

  /// @dev The address of Convex cvxCRV Staking Contract.
  address private constant CVXCRV_STAKING = 0x3Fe65692bfCD0e6CF84cB1E7d24108E434A7587e;

  /// @dev The address of Convex CRV => cvxCRV Contract.
  address private constant CRV_DEPOSITOR = 0x8014595F2AB54cD7c604B00E9fb932176fDc86Ae;

  /// @dev The address of Curve cvxCRV/CRV pool.
  address private immutable curveCvxCrvPool;

  /// @dev The token index for CRV in Curve cvxCRV/CRV pool.
  int128 private immutable poolIndexCRV;

  /// @dev The address of CvxCrvStakingWrapper contract.
  address private immutable wrapper;

  /// @notice The address of ZAP contract, will be used to swap tokens.
  address public zap;

  /// @notice The percentage of token to take on withdraw
  uint256 public withdrawFeePercentage;

  /// @notice The percentage of rewards to take for platform on harvest
  uint256 public platformFeePercentage;

  /// @notice The percentage of rewards to take for caller on harvest
  uint256 public harvestBountyPercentage;

  /// @notice The address of recipient of platform fee
  address public platform;

  /// @inheritdoc IAladdinCRV
  uint256 public override totalUnderlying;

  /// @notice The address of strategy.
  address public strategy;

  /// @notice The address of rewards depositor.
  address public depositor;

  receive() external payable {}

  constructor(address _curveCvxCrvPool, address _wrapper) {
    curveCvxCrvPool = _curveCvxCrvPool;
    address _token0 = ICurveFactoryPlainPool(_curveCvxCrvPool).coins(0);
    poolIndexCRV = _token0 == CRV ? 0 : 1;
    wrapper = _wrapper;
  }

  function initializeV2(address _strategy) external {
    require(strategy == address(0), "initialized");
    strategy = _strategy;

    // make sure harvest is called before upgrade.
    require(IConvexBasicRewards(CVXCRV_STAKING).earned(address(this)) == 0, "not harvested");

    // withdraw all cvxCRV from staking contract
    uint256 _totalUnderlying = IConvexBasicRewards(CVXCRV_STAKING).balanceOf(address(this));
    IConvexBasicRewards(CVXCRV_STAKING).withdraw(_totalUnderlying, false);

    // transfer all cvxCRV to strategy contract.
    IERC20Upgradeable(CVXCRV).safeTransfer(_strategy, _totalUnderlying);
    IConcentratorStrategy(_strategy).deposit(address(0), _totalUnderlying);
    totalUnderlying = _totalUnderlying;

    // approves
    IERC20Upgradeable(CRV).safeApprove(curveCvxCrvPool, uint256(-1));
    IERC20Upgradeable(CRV).safeApprove(CRV_DEPOSITOR, uint256(-1));
  }

  /********************************** View Functions **********************************/

  /// @inheritdoc IAladdinCRV
  /// @dev deprecated.
  function balanceOfUnderlying(address _user) external view override returns (uint256) {
    uint256 _totalSupply = totalSupply();
    if (_totalSupply == 0) return 0;
    uint256 _balance = balanceOf(_user);
    return _balance.mul(totalUnderlying) / _totalSupply;
  }

  /// @inheritdoc IAladdinCompounder
  function asset() external pure override returns (address) {
    return CVXCRV;
  }

  /// @inheritdoc IAladdinCompounder
  function totalAssets() public view override returns (uint256) {
    return totalUnderlying;
  }

  /// @inheritdoc IAladdinCompounder
  function convertToShares(uint256 _assets) public view override returns (uint256 shares) {
    uint256 _totalAssets = totalAssets();
    if (_totalAssets == 0) return _assets;

    uint256 _totalShares = totalSupply();
    return _totalShares.mul(_assets) / _totalAssets;
  }

  /// @inheritdoc IAladdinCompounder
  function convertToAssets(uint256 _shares) public view override returns (uint256) {
    uint256 _totalShares = totalSupply();
    if (_totalShares == 0) return _shares;

    uint256 _totalAssets = totalAssets();
    return _totalAssets.mul(_shares) / _totalShares;
  }

  /// @inheritdoc IAladdinCompounder
  function maxDeposit(address) external pure override returns (uint256) {
    return uint256(-1);
  }

  /// @inheritdoc IAladdinCompounder
  function previewDeposit(uint256 _assets) external view override returns (uint256) {
    return convertToShares(_assets);
  }

  /// @inheritdoc IAladdinCompounder
  function maxMint(address) external pure override returns (uint256) {
    return uint256(-1);
  }

  /// @inheritdoc IAladdinCompounder
  function previewMint(uint256 _shares) external view override returns (uint256) {
    return convertToAssets(_shares);
  }

  /// @inheritdoc IAladdinCompounder
  function maxWithdraw(address) external pure override returns (uint256) {
    return uint256(-1);
  }

  /// @inheritdoc IAladdinCompounder
  function previewWithdraw(uint256 _assets) external view override returns (uint256) {
    uint256 _totalAssets = totalAssets();
    require(_assets <= _totalAssets, "exceed total assets");
    uint256 _shares = convertToShares(_assets);
    if (_assets == _totalAssets) {
      return _shares;
    } else {
      return _shares.mul(FEE_PRECISION).div(FEE_PRECISION - withdrawFeePercentage);
    }
  }

  /// @inheritdoc IAladdinCompounder
  function maxRedeem(address) external pure override returns (uint256) {
    return uint256(-1);
  }

  /// @inheritdoc IAladdinCompounder
  function previewRedeem(uint256 _shares) external view override returns (uint256) {
    uint256 _totalSupply = totalSupply();
    require(_shares <= _totalSupply, "exceed total supply");

    uint256 _assets = convertToAssets(_shares);
    if (_shares == totalSupply()) {
      return _assets;
    } else {
      uint256 _withdrawFee = _assets.mul(withdrawFeePercentage) / FEE_PRECISION;
      return _assets - _withdrawFee;
    }
  }

  /********************************** Mutated Functions **********************************/

  /// @inheritdoc IAladdinCompounder
  function deposit(uint256 _assets, address _receiver) public override nonReentrant returns (uint256) {
    if (_assets == uint256(-1)) {
      _assets = IERC20Upgradeable(CVXCRV).balanceOf(msg.sender);
    }

    address _strategy = strategy;
    IERC20Upgradeable(CVXCRV).safeTransferFrom(msg.sender, _strategy, _assets);
    IConcentratorStrategy(_strategy).deposit(_receiver, _assets);

    return _deposit(_receiver, _assets);
  }

  /// @inheritdoc IAladdinCompounder
  function mint(uint256 _shares, address _receiver) external override nonReentrant returns (uint256) {
    uint256 _assets = convertToAssets(_shares);
    deposit(_assets, _receiver);
    return _assets;
  }

  /// @inheritdoc IAladdinCompounder
  function withdraw(
    uint256 _assets,
    address _receiver,
    address _owner
  ) external override nonReentrant returns (uint256) {
    if (_assets == uint256(-1)) {
      _assets = convertToAssets(balanceOf(_owner));
    }

    uint256 _totalAssets = totalAssets();
    require(_assets <= _totalAssets, "exceed total assets");

    uint256 _shares = convertToShares(_assets);
    if (_assets < _totalAssets) {
      uint256 _withdrawPercentage = getFeeRate(WITHDRAW_FEE_TYPE, _owner);
      _shares = _shares.mul(FEE_PRECISION).div(FEE_PRECISION - _withdrawPercentage);
    }

    if (msg.sender != _owner) {
      uint256 _allowance = allowance(_owner, msg.sender);
      require(_allowance >= _shares, "withdraw exceeds allowance");
      if (_allowance != uint256(-1)) {
        // decrease allowance if it is not max
        _approve(_owner, msg.sender, _allowance - _shares);
      }
    }

    _withdraw(_shares, _receiver, _owner);
    return _shares;
  }

  /// @inheritdoc IAladdinCompounder
  function redeem(
    uint256 _shares,
    address _receiver,
    address _owner
  ) public override nonReentrant returns (uint256) {
    if (_shares == uint256(-1)) {
      _shares = balanceOf(_owner);
    }

    if (msg.sender != _owner) {
      uint256 _allowance = allowance(_owner, msg.sender);
      require(_allowance >= _shares, "redeem exceeds allowance");
      if (_allowance != uint256(-1)) {
        // decrease allowance if it is not max
        _approve(_owner, msg.sender, _allowance - _shares);
      }
    }

    return _withdraw(_shares, _receiver, _owner);
  }

  /// @inheritdoc IAladdinCRV
  /// @dev deprecated.
  function deposit(address _recipient, uint256 _amount) public override returns (uint256) {
    return deposit(_amount, _recipient);
  }

  /// @inheritdoc IAladdinCRV
  /// @dev deprecated.
  function depositAll(address _recipient) external override returns (uint256) {
    return deposit(uint256(-1), _recipient);
  }

  /// @inheritdoc IAladdinCRV
  function depositWithCRV(address _recipient, uint256 _amount) public override nonReentrant returns (uint256) {
    if (_amount == uint256(-1)) {
      _amount = IERC20Upgradeable(CRV).balanceOf(msg.sender);
    }
    IERC20Upgradeable(CRV).safeTransferFrom(msg.sender, address(this), _amount);

    address _strategy = strategy;
    _amount = _swapCRVToCvxCRV(_amount, _strategy);
    IConcentratorStrategy(_strategy).deposit(_recipient, _amount);

    return _deposit(_recipient, _amount);
  }

  /// @inheritdoc IAladdinCRV
  /// @dev deprecated.
  function depositAllWithCRV(address _recipient) external override returns (uint256) {
    return depositWithCRV(_recipient, uint256(-1));
  }

  /// @notice Deposit cvxCRV staking wrapper token to this contract
  /// @param _recipient - The address who will receive the aCRV token.
  /// @param _amount - The amount of cvxCRV staking wrapper to deposit.
  /// @return share - The amount of aCRV received.
  function depositWithWrapper(address _recipient, uint256 _amount) external returns (uint256) {
    if (_amount == uint256(-1)) {
      _amount = IERC20Upgradeable(wrapper).balanceOf(msg.sender);
    }
    IERC20Upgradeable(wrapper).safeTransferFrom(msg.sender, strategy, _amount);
    return _deposit(_recipient, _amount);
  }

  /// @inheritdoc IAladdinCRV
  /// @dev deprecated.
  function withdraw(
    address _recipient,
    uint256 _shares,
    uint256 _minimumOut,
    WithdrawOption _option
  ) public override nonReentrant returns (uint256 _withdrawed) {
    if (_shares == uint256(-1)) {
      _shares = balanceOf(msg.sender);
    }

    if (_option == WithdrawOption.Withdraw) {
      _withdrawed = _withdraw(_shares, _recipient, msg.sender);
      require(_withdrawed >= _minimumOut, "AladdinCRV: insufficient output");
    } else {
      _withdrawed = _withdraw(_shares, address(this), msg.sender);
      _withdrawed = _withdrawAs(_recipient, _withdrawed, _minimumOut, _option);
    }

    // legacy event from IAladdinCRV
    emit Withdraw(msg.sender, _recipient, _shares, _option);
  }

  /// @inheritdoc IAladdinCRV
  /// @dev deprecated.
  function withdrawAll(
    address _recipient,
    uint256 _minimumOut,
    WithdrawOption _option
  ) external override returns (uint256) {
    return withdraw(_recipient, uint256(-1), _minimumOut, _option);
  }

  /// @inheritdoc IAladdinCompounder
  function harvest(address _recipient, uint256 _minimumOut)
    public
    override(IAladdinCRV, IAladdinCompounder)
    nonReentrant
    returns (uint256)
  {
    ensureCallerIsHarvester();

    return _harvest(_recipient, _minimumOut);
  }

  /// @notice Deposit and notify new rewards.
  /// @param _amount The amount of rewards to deposit.
  function depositReward(uint256 _amount) external {
    require(depositor == msg.sender, "only reward depositor");

    address _strategy = strategy;
    IERC20Upgradeable(CVXCRV).safeTransferFrom(msg.sender, _strategy, _amount);
    IConcentratorStrategy(_strategy).deposit(address(this), _amount);

    totalUnderlying += _amount;
  }

  /********************************** Restricted Functions **********************************/

  /// @notice Update the withdraw fee percentage.
  /// @param _feePercentage - The fee percentage to update.
  function updateWithdrawFeePercentage(uint256 _feePercentage) external onlyOwner {
    require(_feePercentage <= MAX_WITHDRAW_FEE, "AladdinCRV: fee too large");
    withdrawFeePercentage = _feePercentage;

    emit UpdateWithdrawalFeePercentage(_feePercentage);
  }

  /// @notice Update the platform fee percentage.
  /// @param _feePercentage - The fee percentage to update.
  function updatePlatformFeePercentage(uint256 _feePercentage) external onlyOwner {
    require(_feePercentage <= MAX_PLATFORM_FEE, "AladdinCRV: fee too large");
    platformFeePercentage = _feePercentage;

    emit UpdatePlatformFeePercentage(_feePercentage);
  }

  /// @notice Update the harvest bounty percentage.
  /// @param _percentage - The fee percentage to update.
  function updateHarvestBountyPercentage(uint256 _percentage) external onlyOwner {
    require(_percentage <= MAX_HARVEST_BOUNTY, "AladdinCRV: fee too large");
    harvestBountyPercentage = _percentage;

    emit UpdateHarvestBountyPercentage(_percentage);
  }

  /// @notice Update the recipient
  function updatePlatform(address _platform) external onlyOwner {
    require(_platform != address(0), "AladdinCRV: zero platform address");
    platform = _platform;

    emit UpdatePlatform(_platform);
  }

  /// @notice Update the zap contract
  function updateZap(address _zap) external onlyOwner {
    require(_zap != address(0), "AladdinCRV: zero zap address");
    zap = _zap;

    emit UpdateZap(_zap);
  }

  /// @notice Update the harvester contract
  /// @param _harvester The address of the harvester contract.
  function updateHarvester(address _harvester) external onlyOwner {
    _updateHarvester(_harvester);
  }

  /// @notice Update the address of reward depositor.
  /// @param _depositor The address of reward depositor.
  function updateDepositor(address _depositor) external onlyOwner {
    depositor = _depositor;
  }

  /// @notice Migrate pool assets to new strategy.
  /// @param _newStrategy The address of new strategy.
  function migrateStrategy(address _newStrategy) external onlyOwner {
    require(_newStrategy != address(0), "AladdinCRV: zero new strategy address");

    uint256 _totalUnderlying = totalUnderlying;
    address _oldStrategy = strategy;
    strategy = _newStrategy;

    IConcentratorStrategy(_oldStrategy).prepareMigrate(_newStrategy);
    IConcentratorStrategy(_oldStrategy).withdraw(_newStrategy, _totalUnderlying);
    IConcentratorStrategy(_oldStrategy).finishMigrate(_newStrategy);

    IConcentratorStrategy(_newStrategy).deposit(address(this), _totalUnderlying);

    emit MigrateStrategy(_oldStrategy, _newStrategy);
  }

  /// @notice Update withdraw fee for certain user.
  /// @param _user The address of user to update.
  /// @param _percentage The withdraw fee percentage to be updated, multipled by 1e9.
  function setWithdrawFeeForUser(address _user, uint32 _percentage) external onlyOwner {
    require(_percentage <= MAX_WITHDRAW_FEE, "withdraw fee too large");

    _setFeeCustomization(WITHDRAW_FEE_TYPE, _user, _percentage);
  }

  /********************************** Internal Functions **********************************/

  function _deposit(address _recipient, uint256 _amount) internal returns (uint256) {
    require(_amount > 0, "AladdinCRV: zero amount deposit");
    uint256 _totalUnderlying = totalUnderlying;
    uint256 _totalSupply = totalSupply();

    uint256 _shares;
    if (_totalSupply == 0) {
      _shares = _amount;
    } else {
      _shares = _amount.mul(_totalSupply) / _totalUnderlying;
    }
    _mint(_recipient, _shares);
    totalUnderlying = _totalUnderlying + _amount;

    // legacy event from IAladdinCRV
    emit Deposit(msg.sender, _recipient, _amount);

    emit Deposit(msg.sender, _recipient, _amount, _shares);
    return _shares;
  }

  function _withdraw(
    uint256 _shares,
    address _receiver,
    address _owner
  ) internal returns (uint256 _withdrawable) {
    require(_shares > 0, "AladdinCRV: zero share withdraw");
    require(_shares <= balanceOf(_owner), "AladdinCRV: shares not enough");
    uint256 _totalUnderlying = totalUnderlying;
    uint256 _amount = _shares.mul(_totalUnderlying) / totalSupply();
    _burn(_owner, _shares);

    if (totalSupply() == 0) {
      // If user is last to withdraw, harvest before exit
      // The first parameter is actually not used.
      _harvest(msg.sender, 0);
      _totalUnderlying = totalUnderlying; // `totalUnderlying` is updated in `_harvest`.
      _withdrawable = _totalUnderlying;
      IConcentratorStrategy(strategy).withdraw(_receiver, _withdrawable);
    } else {
      // Otherwise compute share and unstake
      _withdrawable = _amount;
      // Substract a small withdrawal fee to prevent users "timing"
      // the harvests. The fee stays staked and is therefore
      // redistributed to all remaining participants.
      uint256 _withdrawFeePercentage = getFeeRate(WITHDRAW_FEE_TYPE, _owner);
      uint256 _withdrawFee = (_withdrawable * _withdrawFeePercentage) / FEE_PRECISION;
      _withdrawable = _withdrawable - _withdrawFee; // never overflow here
      IConcentratorStrategy(strategy).withdraw(_receiver, _withdrawable);
    }
    totalUnderlying = _totalUnderlying - _withdrawable;

    emit Withdraw(msg.sender, _receiver, _owner, _withdrawable, _shares);

    return _withdrawable;
  }

  function _withdrawAs(
    address _recipient,
    uint256 _amount,
    uint256 _minimumOut,
    WithdrawOption _option
  ) internal returns (uint256) {
    if (_option == WithdrawOption.WithdrawAndStake) {
      // simply stake the cvxCRV for _recipient
      require(_amount >= _minimumOut, "AladdinCRV: insufficient output");
      IERC20Upgradeable(CVXCRV).safeApprove(wrapper, 0);
      IERC20Upgradeable(CVXCRV).safeApprove(wrapper, _amount);
      ICvxCrvStakingWrapper(wrapper).stakeFor(_recipient, _amount);
    } else {
      address _toToken;
      if (_option == WithdrawOption.WithdrawAsCRV) _toToken = CRV;
      else if (_option == WithdrawOption.WithdrawAsETH) _toToken = address(0);
      else if (_option == WithdrawOption.WithdrawAsCVX) _toToken = CVX;
      else revert("AladdinCRV: unsupported option");

      address _zap = zap;
      IERC20Upgradeable(CVXCRV).safeTransfer(_zap, _amount);
      _amount = IZap(_zap).zap(CVXCRV, _amount, _toToken, _minimumOut);

      if (_toToken == address(0)) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = _recipient.call{ value: _amount }("");
        require(success, "AladdinCRV: ETH transfer failed");
      } else {
        IERC20Upgradeable(_toToken).safeTransfer(_recipient, _amount);
      }
    }
    return _amount;
  }

  function _harvest(address _recipient, uint256 _minimumOut) internal returns (uint256) {
    address _strategy = strategy;

    // harvest CRV from strategy
    uint256 _amountCRV = IConcentratorStrategy(_strategy).harvest(zap, CRV);
    // swap CRV to cvxCRV
    uint256 _amount = _swapCRVToCvxCRV(_amountCRV, _strategy);
    require(_amount >= _minimumOut, "AladdinCRV: insufficient rewards");
    // send back to strategy
    IConcentratorStrategy(_strategy).deposit(address(0), _amount);

    // legacy event from IAladdinCRV
    emit Harvest(msg.sender, _amount);

    // distribute fee and bounty
    uint256 _totalSupply = totalSupply();
    uint256 _platformFee = platformFeePercentage;
    uint256 _harvestBounty = harvestBountyPercentage;
    if (_platformFee > 0) {
      _platformFee = (_platformFee * _amount) / FEE_PRECISION;
    }
    if (_harvestBounty > 0) {
      _harvestBounty = (_harvestBounty * _amount) / FEE_PRECISION;
    }
    uint256 _stakeAmount = _amount - _platformFee - _harvestBounty; // never overflow here
    // This is the amount of underlying after staking harvested rewards.
    uint256 _underlying = totalUnderlying + _stakeAmount;
    // This is the share for platform fee.
    _platformFee = (_platformFee * _totalSupply) / _underlying;
    // This is the share for harvest bounty.
    _harvestBounty = (_harvestBounty * _totalSupply) / _underlying;

    emit Harvest(msg.sender, _recipient, _amount, _platformFee, _harvestBounty);

    _mint(platform, _platformFee);
    _mint(_recipient, _harvestBounty);

    totalUnderlying += _amount;
    return _amount;
  }

  /// @dev Internal function to swap CRV to cvxCRV
  /// @param _amountIn The amount of CRV to swap.
  /// @param _recipient The address of recipient who will recieve the cvxCRV.
  function _swapCRVToCvxCRV(uint256 _amountIn, address _recipient) internal returns (uint256) {
    // CRV swap to CVXCRV or stake to CVXCRV
    // CRV swap to CVXCRV or stake to CVXCRV
    uint256 _amountOut = ICurveFactoryPlainPool(curveCvxCrvPool).get_dy(poolIndexCRV, 1 - poolIndexCRV, _amountIn);
    bool useCurve = _amountOut > _amountIn;

    if (useCurve) {
      IERC20Upgradeable(CRV).safeApprove(curveCvxCrvPool, 0);
      IERC20Upgradeable(CRV).safeApprove(curveCvxCrvPool, _amountIn);
      _amountOut = ICurveFactoryPlainPool(curveCvxCrvPool).exchange(
        poolIndexCRV,
        1 - poolIndexCRV,
        _amountIn,
        0,
        _recipient
      );
    } else {
      uint256 _lockIncentive = IConvexCRVDepositor(CRV_DEPOSITOR).lockIncentive();
      // if use `lock = false`, will possible take fee
      // if use `lock = true`, some incentive will be given
      _amountOut = IERC20Upgradeable(CVXCRV).balanceOf(address(this));
      if (_lockIncentive == 0) {
        // no lock incentive, use `lock = false`
        IConvexCRVDepositor(CRV_DEPOSITOR).deposit(_amountIn, false, address(0));
      } else {
        // no lock incentive, use `lock = true`
        IConvexCRVDepositor(CRV_DEPOSITOR).deposit(_amountIn, true, address(0));
      }
      _amountOut = IERC20Upgradeable(CVXCRV).balanceOf(address(this)) - _amountOut; // never overflow here
      if (_recipient != address(this)) {
        IERC20Upgradeable(CVXCRV).safeTransfer(_recipient, _amountOut);
      }
    }
    return _amountOut;
  }

  /// @inheritdoc FeeCustomization
  function _defaultFeeRate(bytes32) internal view override returns (uint256) {
    return withdrawFeePercentage;
  }
}

// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";

import "../../interfaces/IConvexBasicRewards.sol";
import "../../interfaces/IConvexToken.sol";
import "../../interfaces/ICvxCrvStakingWrapper.sol";
import "../../price-oracle/interfaces/IPriceOracle.sol";

// solhint-disable const-name-snakecase
// solhint-disable not-rely-on-time

contract CvxCrvWeightAdjuster is Ownable {
  /*************
   * Constants *
   *************/

  /// @dev The address of cvxCRV token.
  address private constant cvxCRV = 0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7;

  /// @dev The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @dev The address of CVX token.
  address private constant CVX = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;

  /// @dev The address of 3CRV token.
  address private constant THREE_CRV = 0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490;

  /// @dev The address of stkCvxCrv token
  address private constant stkCvxCrv = 0xaa0C3f5F7DFD688C6E646F66CD2a6B66ACdbE434;

  /// @dev The address of CRV rewards contract for cvxCRV staking.
  address private constant CRV_REWARDS = 0x3Fe65692bfCD0e6CF84cB1E7d24108E434A7587e;

  /// @dev The address of 3CRV rewards contract for cvxCRV staking.
  address private constant THREE_CRV_REWARDS = 0x7091dbb7fcbA54569eF1387Ac89Eb2a5C9F6d2EA;

  /// @dev The address of extra CVX rewards contract for cvxCRV staking.
  address private constant EXTRA_CVX_REWARDS = 0x449f2fd99174e1785CF2A1c79E665Fec3dD1DdC6;

  /// @dev The maximum supply of CVX token.
  uint256 private constant CVX_MAX_SUPPLY = 100 * 1000000 * 1e18;

  uint256 private constant PRICE_PRECISION = 1e18;

  uint256 private constant WEIGHT_PRECISION = 10000;

  /// @dev The address of price oracle contract.
  address private immutable oracle;

  /// @dev The address of weight.
  address private immutable strategy;

  /*************
   * Variables *
   *************/

  /// @notice The status of permissioned adjusters.
  mapping(address => bool) public adjusters;

  /// @notice Whether the call to `adjust` is permissioned.
  bool public isPermissioned;

  /***************
   * Constructor *
   ***************/

  constructor(address _oracle, address _strategy) {
    oracle = _oracle;
    strategy = _strategy;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the current daily APR.
  function getCurrentDailyAPR() external view returns (uint256) {
    uint256 _reward0USD;
    uint256 _reward1USD;
    {
      uint256 _amountCRV = _getDailyRewards(CRV_REWARDS);
      uint256 _amount3CRV = _getDailyRewards(THREE_CRV_REWARDS);
      uint256 _amountCVX = _getDailyRewards(EXTRA_CVX_REWARDS) + _getCVXRewards(_amountCRV);
      uint256 _priceCRV = IPriceOracle(oracle).price(CRV);
      uint256 _price3CRV = IPriceOracle(oracle).price(THREE_CRV);
      uint256 _priceCVX = IPriceOracle(oracle).price(CVX);

      _reward0USD = (_amountCRV * _priceCRV + _amountCVX * _priceCVX) / PRICE_PRECISION;
      _reward1USD = (_amount3CRV * _price3CRV) / PRICE_PRECISION;
    }

    uint256 _balanceUSD;
    uint256 _balance;
    {
      uint256 _priceCvxCrv = IPriceOracle(oracle).price(cvxCRV);

      _balance = ICvxCrvStakingWrapper(stkCvxCrv).balanceOf(strategy);
      _balanceUSD = (_balance * _priceCvxCrv) / PRICE_PRECISION;
    }

    uint256 _supply0 = ICvxCrvStakingWrapper(stkCvxCrv).rewardSupply(0);
    uint256 _supply1 = ICvxCrvStakingWrapper(stkCvxCrv).rewardSupply(1);
    uint256 _weight = ICvxCrvStakingWrapper(stkCvxCrv).userRewardWeight(strategy);
    uint256 _balance0 = (_balance * (WEIGHT_PRECISION - _weight)) / WEIGHT_PRECISION;
    uint256 _balance1 = (_balance * _weight) / WEIGHT_PRECISION;

    uint256 _dailyRewardUSD = (_reward0USD * _balance0) / _supply0 + (_reward1USD * _balance1) / _supply1;
    return (_dailyRewardUSD * 1e18) / _balanceUSD;
  }

  /// @notice Return the optimal daily APR and corresponding weight.
  /// @dev See the comments in `CvxCrvStakingWrapperStrategy` for more details.
  function getOptimalDailyAPR() public view returns (uint256, uint256) {
    uint256 _reward0USD;
    uint256 _reward1USD;
    {
      uint256 _amountCRV = _getDailyRewards(CRV_REWARDS);
      uint256 _amount3CRV = _getDailyRewards(THREE_CRV_REWARDS);
      uint256 _amountCVX = _getDailyRewards(EXTRA_CVX_REWARDS) + _getCVXRewards(_amountCRV);
      uint256 _priceCRV = IPriceOracle(oracle).price(CRV);
      uint256 _price3CRV = IPriceOracle(oracle).price(THREE_CRV);
      uint256 _priceCVX = IPriceOracle(oracle).price(CVX);

      _reward0USD = (_amountCRV * _priceCRV + _amountCVX * _priceCVX) / PRICE_PRECISION;
      _reward1USD = (_amount3CRV * _price3CRV) / PRICE_PRECISION;
    }

    uint256 _balanceUSD;
    uint256 _balance;
    {
      uint256 _priceCvxCrv = IPriceOracle(oracle).price(cvxCRV);

      _balance = ICvxCrvStakingWrapper(stkCvxCrv).balanceOf(strategy);
      _balanceUSD = (_balance * _priceCvxCrv) / PRICE_PRECISION;
    }

    uint256 _supply0 = ICvxCrvStakingWrapper(stkCvxCrv).rewardSupply(0);
    uint256 _supply1 = ICvxCrvStakingWrapper(stkCvxCrv).rewardSupply(1);
    uint256 _balance0 = ICvxCrvStakingWrapper(stkCvxCrv).userRewardBalance(strategy, 0);
    uint256 _balance1 = ICvxCrvStakingWrapper(stkCvxCrv).userRewardBalance(strategy, 1);
    _supply0 -= _balance0;
    _supply1 -= _balance1;

    uint256 k = sqrt((_reward1USD * _supply1 * 1e18) / (_reward0USD * _supply0));
    uint256 w = k * (_balance + _supply0);
    if (w < _supply1) w = 0;
    else {
      w = (w - _supply1) / ((1e9 + k) * _balance);
      if (w >= 1e9) w = 1e9;
    }

    _balance0 = (_balance * (1e9 - w)) / 1e9;
    _balance1 = (_balance * w) / 1e9;
    _supply0 += _balance0;
    _supply1 += _balance1;

    uint256 _dailyRewardUSD = (_reward0USD * _balance0) / _supply0 + (_reward1USD * _balance1) / _supply1;
    return ((_dailyRewardUSD * 1e18) / _balanceUSD, w / 1e5);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice adjust the weight.
  function adjust(uint256 _minDailyAPR) external returns (uint256, uint256) {
    if (isPermissioned) {
      require(adjusters[msg.sender], "not allowed");
    }

    (uint256 _dailyAPR, uint256 _weight) = getOptimalDailyAPR();
    require(_dailyAPR >= _minDailyAPR, "insufficient daily APR");

    ICvxCrvStakingWrapper(strategy).setRewardWeight(_weight);

    return (_dailyAPR, _weight);
  }

  /*******************************
   * Public Restricted Functions *
   *******************************/

  /// @notice Change the weight adjuster for strategy contract.
  /// @param _adjuster The address of new adjuster.
  function switchWeightAdjuster(address _adjuster) external onlyOwner {
    CvxCrvWeightAdjuster(strategy).transferOwnership(_adjuster);
  }

  /// @notice Change the permission status of the contract.
  /// @param _status The status to update.
  function setPermissioned(bool _status) external onlyOwner {
    isPermissioned = _status;
  }

  /// @notice Change the status of a list of adjusters.
  /// @param _accounts The address list of adjusters to update.
  /// @param _status The status to update.
  function setAdjusters(address[] memory _accounts, bool _status) external onlyOwner {
    for (uint256 i = 0; i < _accounts.length; i++) {
      adjusters[_accounts[i]] = _status;
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Return the amount of daily reward from the reward pool.
  /// @param _rewardPool The address of reward pool.
  function _getDailyRewards(address _rewardPool) internal view returns (uint256) {
    uint256 _periodFinish = IConvexBasicRewards(_rewardPool).periodFinish();
    uint256 _rewardRate = IConvexBasicRewards(_rewardPool).rewardRate();
    uint256 _totalSupply = IConvexBasicRewards(_rewardPool).totalSupply();
    uint256 _balance = IConvexBasicRewards(_rewardPool).balanceOf(stkCvxCrv);

    if (_periodFinish <= block.timestamp) return 0;
    return (_rewardRate * 86400 * _balance) / _totalSupply;
  }

  /// @dev Return the amount CVX rewards based the amount of CRV rewards.
  /// @param _amountCRV The amount of CRV rewards.
  function _getCVXRewards(uint256 _amountCRV) internal view returns (uint256) {
    uint256 _supply = IConvexToken(CVX).totalSupply();
    uint256 _reductionPerCliff = IConvexToken(CVX).reductionPerCliff();
    uint256 _totalCliffs = IConvexToken(CVX).totalCliffs();

    if (_supply == 0) return _amountCRV;

    uint256 _amountCVX;
    //use current supply to gauge cliff
    //this will cause a bit of overflow into the next cliff range
    //but should be within reasonable levels.
    //requires a max supply check though
    uint256 _cliff = _supply / _reductionPerCliff;
    //mint if below total cliffs
    if (_cliff < _totalCliffs) {
      //for reduction% take inverse of current cliff
      uint256 _reduction = _totalCliffs - _cliff;
      //reduce
      _amountCVX = (_amountCRV * _reduction) / _totalCliffs;

      //supply cap check
      uint256 _amtTillMax = CVX_MAX_SUPPLY - _supply;
      if (_amountCVX > _amtTillMax) {
        _amountCVX = _amtTillMax;
      }
    }
    return _amountCVX;
  }

  // babylonian method (https://en.wikipedia.org/wiki/Methods_of_computing_square_roots#Babylonian_method)
  function sqrt(uint256 y) internal pure returns (uint256 z) {
    if (y > 3) {
      z = y;
      uint256 x = y / 2 + 1;
      while (x < z) {
        z = x;
        x = (y / x + x) / 2;
      }
    } else if (y != 0) {
      z = 1;
    }
  }
}

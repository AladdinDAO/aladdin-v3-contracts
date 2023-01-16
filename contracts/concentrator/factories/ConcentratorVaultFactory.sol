// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "../interfaces/IConcentratorGeneralVault.sol";
import "../../interfaces/IConvexBasicRewards.sol";
import "../../interfaces/IConvexBooster.sol";

import "../strategies/ManualCompoundingConvexCurveStrategy.sol";

contract ConcentratorVaultFactory is Ownable {
  /// @dev The address of Convex Booster.
  address private constant BOOSTER = 0xF403C135812408BFbE8713b5A23a04b3D48AAE31;

  /// @dev The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @dev The address of CVX token.
  address private constant CVX = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;

  address public convexCurveStrategyImpl;

  mapping(address => uint32) public harvestBountyRatio;

  mapping(address => uint32) public platformFeeRatio;

  function deployConvexCurvePool(address _vault, uint256 _pid) external {
    IConvexBooster.PoolInfo memory _info = IConvexBooster(BOOSTER).poolInfo(_pid);

    require(!_isDeployed(_vault, _info.lptoken), "already deployed");

    address _strategy = Clones.clone(convexCurveStrategyImpl);

    uint256 _rewardsLength = IConvexBasicRewards(_info.crvRewards).extraRewardsLength() + 2;
    address[] memory _rewards = new address[](_rewardsLength);
    _rewards[0] = CRV;
    _rewards[1] = CVX;
    for (uint256 i = 0; i < _rewardsLength; i++) {
      _rewards[i + 2] = IConvexBasicRewards(_info.crvRewards).extraRewards(i);
    }

    ManualCompoundingConvexCurveStrategy(payable(_strategy)).initialize(
      _vault,
      _info.lptoken,
      _info.crvRewards,
      _rewards
    );

    IConcentratorGeneralVault(_vault).addPool(
      _info.lptoken,
      _strategy,
      0,
      platformFeeRatio[_vault],
      harvestBountyRatio[_vault]
    );
  }

  function updateConvexCurveStrategyImpl(address _impl) external onlyOwner {
    convexCurveStrategyImpl = _impl;
  }

  function updatePlatformFeeRatio(address _vault, uint32 _ratio) external onlyOwner {
    platformFeeRatio[_vault] = _ratio;
  }

  function updateHarvestBountyRatio(address _vault, uint32 _ratio) external onlyOwner {
    harvestBountyRatio[_vault] = _ratio;
  }

  function _isDeployed(address _vault, address _token) internal view returns (bool) {
    uint256 _length = IConcentratorGeneralVault(_vault).poolLength();
    for (uint256 i = 0; i < _length; i++) {
      address _underlying = IConcentratorGeneralVault(_vault).underlying(i);
      if (_underlying == _token) return true;
    }
    return false;
  }
}

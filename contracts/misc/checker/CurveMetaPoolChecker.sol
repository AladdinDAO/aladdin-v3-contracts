// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../../interfaces/ICurveBasePool.sol";
import "../../interfaces/ICurvePoolRegistry.sol";
import "../../interfaces/IERC20Metadata.sol";
import "./IPriceChecker.sol";

contract CurveMetaPoolChecker is Ownable, IPriceChecker {
  using SafeMath for uint256;

  event UpdateMaxMultiple(uint256 _maxMultiple);

  address private constant REGISTRY = 0x90E00ACe148ca3b23Ac1bC8C240C2a7Dd9c2d7f5;

  uint256 private constant PRECISION = 1e9;

  uint256 public maxMultiple;

  address public immutable baseChecker;

  constructor(uint256 _maxMultiple, address _baseChecker) {
    maxMultiple = _maxMultiple;
    baseChecker = _baseChecker;

    emit UpdateMaxMultiple(_maxMultiple);
  }

  function check(address _token) external view override returns (bool) {
    // find pool address
    address _pool = ICurvePoolRegistry(REGISTRY).get_pool_from_lp_token(_token);
    if (_pool == address(0)) {
      _pool = _token;
    }

    // check base pool
    if (!IPriceChecker(baseChecker).check(ICurveBasePool(_pool).coins(uint256(1)))) {
      return false;
    }

    // find min/max balance
    uint256 _maxBalance = 0;
    uint256 _minBalance = uint256(-1);
    for (uint256 i = 0; i < 2; i++) {
      uint256 _balance = ICurveBasePool(_pool).balances(i);
      _token = ICurveBasePool(_pool).coins(i);
      uint256 _decimals = IERC20Metadata(_token).decimals();
      require(_decimals <= 18, "unsupported decimals");
      _balance *= 10**(18 - _decimals);
      if (_balance > _maxBalance) _maxBalance = _balance;
      if (_balance < _minBalance) _minBalance = _balance;
    }

    // _maxBalance / _minBalance <= maxMultiple / PRECISION
    return _maxBalance.mul(PRECISION) <= maxMultiple.mul(_minBalance);
  }

  function updateMaxMultiple(uint256 _maxMultiple) external onlyOwner {
    maxMultiple = _maxMultiple;

    emit UpdateMaxMultiple(_maxMultiple);
  }
}

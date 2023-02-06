// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IPriceOracle.sol";
import "../interfaces/ICurveBasePool.sol";
import "../interfaces/ICurveCryptoPool.sol";

contract CurveV2PriceOracle is Ownable, IPriceOracle {
  /*************
   * Constants *
   *************/

  /// @dev The address of ETH token.
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  /// @dev The address of WETH token.
  address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  /// @dev The price oracle for base token.
  address private immutable baseOracle;

  /// @dev The address of base token.
  address private immutable base;

  /***********
   * Structs *
   ***********/

  struct PoolInfo {
    // The address of curve v2 pool.
    address pool;
    // The pool index of base token.
    uint8 baseIndex;
  }

  /*************
   * Variables *
   *************/

  /// @notice Mapping from token address to curve crypto pool information.
  mapping(address => PoolInfo) public pools;

  /***************
   * Constructor *
   ***************/

  constructor(address _baseOracle, address _base) {
    baseOracle = _baseOracle;
    base = _base;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IPriceOracle
  function price(address _token) external view override returns (uint256) {
    PoolInfo memory _info = pools[_token];
    require(_info.pool != address(0), "token not registered");

    uint256 _poolOraclePrice = ICurveCryptoPool(_info.pool).price_oracle();
    if (_info.baseIndex != 0) {
      _poolOraclePrice = 1e36 / _poolOraclePrice;
    }
    return (_poolOraclePrice * IPriceOracle(baseOracle).price(base)) / 1e18;
  }

  /*******************************
   * Public Restricted Functions *
   *******************************/

  /// @notice Set the curve v2 pool.
  /// @param _tokens The address list of tokens to set.
  /// @param _pools The corresponding address list of curve pool.
  function setPools(address[] memory _tokens, address[] memory _pools) external onlyOwner {
    require(_tokens.length == _pools.length, "length mismatch");
    for (uint256 i = 0; i < _tokens.length; i++) {
      address _coin0 = ICurveCryptoPool(_pools[i]).coins(0);
      address _coin1 = ICurveCryptoPool(_pools[i]).coins(1);
      if (_coin0 == address(0) || _coin0 == ETH) _coin0 = WETH;
      if (_coin1 == address(0) || _coin1 == ETH) _coin1 = WETH;

      require(_coin0 == _tokens[i] || _coin1 == _tokens[i], "token not available");
      require(_coin0 == base || _coin1 == base, "base not available");
      pools[_tokens[i]] = PoolInfo(_pools[i], _coin0 == base ? 0 : 1);
    }
  }
}

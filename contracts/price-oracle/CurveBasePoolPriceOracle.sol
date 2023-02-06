// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IPriceOracle.sol";
import "../interfaces/ICurveBasePool.sol";

contract CurveBasePoolPriceOracle is Ownable, IPriceOracle {
  /*************
   * Constants *
   *************/

  /// @dev The address of ETH token.
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  /// @dev The address of WETH token.
  address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  /// @dev The price oracle for base token.
  address private immutable baseOracle;

  /*************
   * Variables *
   *************/

  /// @notice Mapping from token address to curve base pool information.
  mapping(address => address) public pools;

  /// @notice Mapping from token address to list of underlying tokens.
  mapping(address => address[]) public underlyings;

  /***************
   * Constructor *
   ***************/

  constructor(address _baseOracle) {
    baseOracle = _baseOracle;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IPriceOracle
  function price(address _token) external view override returns (uint256) {
    address _pool = pools[_token];
    require(_pool != address(0), "token not registered");

    address[] storage _underlyings = underlyings[_token];
    uint256 n = _underlyings.length;
    uint256 minPx = uint256(-1);
    for (uint256 i = 0; i < n; i++) {
      uint256 _price = IPriceOracle(baseOracle).price(_underlyings[i]);
      if (_price < minPx) minPx = _price;
    }

    return (minPx * ICurveBasePool(_pool).get_virtual_price()) / 1e18;
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
      address _token = _tokens[i];
      if (pools[_token] != address(0)) {
        delete underlyings[_token];
      }
      pools[_token] = _pools[i];
      for (uint256 j = 0; ; j++) {
        try ICurveBasePool(_pools[i]).coins(j) returns (address _underlying) {
          underlyings[_token].push(_underlying);
        } catch {
          break;
        }
      }
    }
  }
}

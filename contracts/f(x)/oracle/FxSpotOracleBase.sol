// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { Ownable2Step } from "@openzeppelin/contracts-v4/access/Ownable2Step.sol";

import { AggregatorV3Interface } from "../../price-oracle/interfaces/AggregatorV3Interface.sol";
import { ISpotPriceOracle } from "../../price-oracle/interfaces/ISpotPriceOracle.sol";

abstract contract FxSpotOracleBase is Ownable2Step {
  /**********
   * Errors *
   **********/

  /// @dev Thrown when the given encodings are invalid.
  error ErrorInvalidEncodings();

  /*************
   * Constants *
   *************/

  /// @dev The precision for oracle price.
  uint256 internal constant PRECISION = 1e18;

  /// @dev The address of `SpotPriceOracle` contract.
  address immutable spotPriceOracle;

  /***************
   * Constructor *
   ***************/

  constructor(address _spotPriceOracle) {
    spotPriceOracle = _spotPriceOracle;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev The encoding is below.
  /// ```text
  /// |  32 bits  | 64 bits |  160 bits  |
  /// | heartbeat |  scale  | price_feed |
  /// |low                          high |
  /// ```
  function _readSpotPriceByChainlink(bytes32 encoding) internal view returns (uint256) {
    address aggregator;
    uint256 scale;
    uint256 heartbeat;
    assembly {
      aggregator := shr(96, encoding)
      scale := and(shr(32, encoding), 0xffffffffffffffff)
      heartbeat := and(encoding, 0xffffffff)
    }
    (, int256 answer, , uint256 updatedAt, ) = AggregatorV3Interface(aggregator).latestRoundData();
    if (answer < 0) revert("invalid");
    if (block.timestamp - updatedAt > heartbeat) revert("expired");
    return uint256(answer) * scale;
  }

  /// @dev Internal function to calculate spot price by encodings.
  ///
  /// The details of the encoding is below
  /// ```text
  /// |   1 byte   |    ...    |    ...    | ... |    ...    |
  /// | num_source | source[0] | source[1] | ... | source[n] |
  ///
  /// source encoding:
  /// |  1 byte  | 32 bytes | 32 bytes | ... | 32 bytes |
  /// | num_pool |  pool[0] |  pool[1] | ... |  pool[n] |
  /// 1 <= num_pool <= 3
  ///
  /// The encoding of each pool can be found in `SpotPriceOracle` contract.
  /// ```
  /// @return prices The list of prices of each source, multiplied by 1e18.
  function _getSpotPriceByEncoding(bytes memory encodings) internal view returns (uint256[] memory prices) {
    uint256 ptr;
    uint256 length;
    assembly {
      ptr := add(encodings, 0x21)
      length := byte(0, mload(sub(ptr, 1)))
    }
    prices = new uint256[](length);
    for (uint256 i = 0; i < length; i++) {
      uint256 encoding1;
      uint256 encoding2;
      uint256 encoding3;
      assembly {
        let cnt := byte(0, mload(ptr))
        ptr := add(ptr, 0x01)
        if gt(cnt, 0) {
          encoding1 := mload(ptr)
          ptr := add(ptr, 0x20)
        }
        if gt(cnt, 1) {
          encoding2 := mload(ptr)
          ptr := add(ptr, 0x20)
        }
        if gt(cnt, 2) {
          encoding3 := mload(ptr)
          ptr := add(ptr, 0x20)
        }
      }
      if (encoding1 == 0) {
        revert ErrorInvalidEncodings();
      } else if (encoding2 == 0) {
        prices[i] = _readSpotPrice(encoding1);
      } else if (encoding3 == 0) {
        prices[i] = _readSpotPrice(encoding1, encoding2);
      } else {
        prices[i] = _readSpotPrice(encoding1, encoding2, encoding3);
      }
    }
  }

  /// @dev Internal function to calculate spot price of single pool.
  /// @param encoding The encoding for the pool.
  /// @return price The spot price of the source, multiplied by 1e18.
  function _readSpotPrice(uint256 encoding) private view returns (uint256 price) {
    price = ISpotPriceOracle(spotPriceOracle).getSpotPrice(encoding);
  }

  /// @dev Internal function to calculate spot price of two pools.
  /// @param encoding1 The encoding for the first pool.
  /// @param encoding2 The encoding for the second pool.
  /// @return price The spot price of the source, multiplied by 1e18.
  function _readSpotPrice(uint256 encoding1, uint256 encoding2) private view returns (uint256 price) {
    unchecked {
      price = (_readSpotPrice(encoding1) * _readSpotPrice(encoding2)) / PRECISION;
    }
  }

  /// @dev Internal function to calculate spot price of three pools.
  /// @param encoding1 The encoding for the first pool.
  /// @param encoding2 The encoding for the second pool.
  /// @param encoding3 The encoding for the third pool.
  /// @return price The spot price of the source, multiplied by 1e18.
  function _readSpotPrice(
    uint256 encoding1,
    uint256 encoding2,
    uint256 encoding3
  ) private view returns (uint256 price) {
    unchecked {
      price = (_readSpotPrice(encoding1, encoding2) * _readSpotPrice(encoding3)) / PRECISION;
    }
  }
}

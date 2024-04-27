// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { Ownable2Step } from "@openzeppelin/contracts-v4/access/Ownable2Step.sol";

import { AggregatorV3Interface } from "../../price-oracle/interfaces/AggregatorV3Interface.sol";
import { ISpotPriceOracle } from "../../price-oracle/interfaces/ISpotPriceOracle.sol";

abstract contract FxSpotOracleBase is Ownable2Step {
  /*************
   * Constants *
   *************/

  uint256 internal constant PRECISION = 1e18;

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
  /// |  160 bits  | 64 bits |  32  bits  |
  /// | price_feed |  scale  | heartbeat |
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
    if (block.timestamp - updatedAt > heartbeat) revert("expired");
    return uint256(answer) * scale;
  }

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
        revert();
      } else if (encoding2 == 0) {
        prices[i] = _readSpotPrice(encoding1);
      } else if (encoding3 == 0) {
        prices[i] = _readSpotPrice(encoding1, encoding2);
      } else {
        prices[i] = _readSpotPrice(encoding1, encoding2, encoding3);
      }
    }
  }

  function _readSpotPrice(uint256 encoding) private view returns (uint256) {
    return ISpotPriceOracle(spotPriceOracle).getSpotPrice(encoding);
  }

  function _readSpotPrice(uint256 encoding1, uint256 encoding2) private view returns (uint256) {
    return (_readSpotPrice(encoding1) * _readSpotPrice(encoding2)) / PRECISION;
  }

  function _readSpotPrice(
    uint256 encoding1,
    uint256 encoding2,
    uint256 encoding3
  ) private view returns (uint256) {
    return (_readSpotPrice(encoding1, encoding2) * _readSpotPrice(encoding3)) / PRECISION;
  }
}

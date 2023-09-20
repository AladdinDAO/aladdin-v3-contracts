// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "../interfaces/AggregatorV3Interface.sol";
import "../interfaces/ITwapOracle.sol";

// This contract is almost a copy from https://github.com/tranchess/contract-core/blob/main/contracts/oracle/ChainlinkTwapOracleV3.sol

// solhint-disable not-rely-on-time
// solhint-disable reason-string

contract ChainlinkTwapOracleV3 is ITwapOracle, Ownable {
  using SafeMath for uint256;

  uint256 private constant EPOCH = 30 minutes;
  uint256 private constant MAX_ITERATION = 500;

  event Update(uint256 timestamp, uint256 price);

  /// @notice Chainlink aggregator used as the data source.
  address public immutable chainlinkAggregator;

  /// @notice Minimum number of Chainlink rounds required in an epoch.
  uint256 public immutable chainlinkMinMessageCount;

  /// @notice Maximum gap between an epoch start and a previous Chainlink round for the round
  ///         to be used in TWAP calculation.
  uint256 public immutable chainlinkMessageExpiration;

  /// @dev A multipler that normalizes price from the Chainlink aggregator to 18 decimal places.
  uint256 private immutable _chainlinkPriceMultiplier;

  string public symbol;

  /// @dev Mapping of epoch end timestamp => TWAP
  mapping(uint256 => uint256) private _ownerUpdatedPrices;

  constructor(
    address chainlinkAggregator_,
    uint256 chainlinkMinMessageCount_,
    uint256 chainlinkMessageExpiration_,
    string memory symbol_
  ) {
    chainlinkAggregator = chainlinkAggregator_;
    require(chainlinkMinMessageCount_ > 0);
    chainlinkMinMessageCount = chainlinkMinMessageCount_;
    chainlinkMessageExpiration = chainlinkMessageExpiration_;
    uint256 decimal = AggregatorV3Interface(chainlinkAggregator_).decimals();
    _chainlinkPriceMultiplier = 10**(uint256(18).sub(decimal));
    symbol = symbol_;
  }

  /// @inheritdoc ITwapOracle
  function getLatest() external view override returns (uint256) {
    (, int256 answer, , uint256 updatedAt, ) = AggregatorV3Interface(chainlinkAggregator).latestRoundData();
    require(updatedAt >= block.timestamp - chainlinkMessageExpiration, "Stale price oracle");
    return uint256(answer).mul(_chainlinkPriceMultiplier);
  }

  /// @inheritdoc ITwapOracle
  function getTwap(uint256 timestamp) external view override returns (uint256) {
    uint256 twap = _getTwapFromChainlink(timestamp);
    if (twap == 0) {
      // owner only update price at the end of every epoch.
      twap = _ownerUpdatedPrices[(timestamp / EPOCH) * EPOCH];
    }
    return twap;
  }

  /// @notice Search for the last round before the given timestamp. Zeros are returned
  ///         if the search fails.
  function findLastRoundBefore(uint256 timestamp)
    public
    view
    returns (
      uint80 roundID,
      int256 answer,
      uint256 updatedAt
    )
  {
    (roundID, answer, , updatedAt, ) = AggregatorV3Interface(chainlinkAggregator).latestRoundData();
    if (updatedAt < timestamp + EPOCH) {
      // Fast path: sequentially check each round when the target epoch is in the near past.
      for (uint256 i = 0; i < MAX_ITERATION && updatedAt >= timestamp && answer != 0; i++) {
        roundID--;
        (, answer, , updatedAt, ) = _getChainlinkRoundData(roundID);
      }
    } else {
      // Slow path: binary search. During the search, the `roundID` round is always updated
      // at or after the given timestamp, and the `leftRoundID` round is either invalid or
      // updated before the given timestamp.
      uint80 step = 1;
      uint80 leftRoundID = 0;
      while (step <= roundID) {
        leftRoundID = roundID - step;
        (, answer, , updatedAt, ) = _getChainlinkRoundData(leftRoundID);
        if (updatedAt < timestamp || answer == 0) {
          break;
        }
        step <<= 1;
        roundID = leftRoundID;
      }
      while (leftRoundID + 1 < roundID) {
        uint80 midRoundID = (leftRoundID + roundID) / 2;
        (, answer, , updatedAt, ) = _getChainlinkRoundData(midRoundID);
        if (updatedAt < timestamp || answer == 0) {
          leftRoundID = midRoundID;
        } else {
          roundID = midRoundID;
        }
      }
      roundID = leftRoundID;
      (, answer, , updatedAt, ) = _getChainlinkRoundData(roundID);
    }
    if (updatedAt >= timestamp || answer == 0) {
      // The last round before the epoch end is not found, due to either incontinuous
      // round IDs caused by a phase change or abnormal `updatedAt` timestamps.
      return (0, 0, 0);
    }
  }

  /// @dev Calculate TWAP of the given epoch from the Chainlink oracle.
  /// @param timestamp End timestamp of the epoch to be updated
  /// @return TWAP of the epoch calculated from Chainlink, or zero if there's no sufficient data
  function _getTwapFromChainlink(uint256 timestamp) private view returns (uint256) {
    require(block.timestamp >= timestamp, "Too soon");
    (uint80 roundID, int256 answer, uint256 updatedAt) = findLastRoundBefore(timestamp);
    if (answer == 0) {
      return 0;
    }
    uint256 sum = 0;
    uint256 sumTimestamp = timestamp;
    uint256 messageCount = 1;
    for (uint256 i = 0; i < MAX_ITERATION && updatedAt >= timestamp - EPOCH; i++) {
      sum = sum.add(uint256(answer).mul(sumTimestamp - updatedAt));
      sumTimestamp = updatedAt;
      if (roundID == 0) {
        break;
      }
      roundID--;
      (, int256 newAnswer, , uint256 newUpdatedAt, ) = _getChainlinkRoundData(roundID);
      if (newAnswer == 0 || newUpdatedAt > updatedAt || newUpdatedAt < timestamp - EPOCH - chainlinkMessageExpiration) {
        break; // Stop if the previous round is invalid
      }
      answer = newAnswer;
      updatedAt = newUpdatedAt;
      messageCount++;
    }
    if (messageCount >= chainlinkMinMessageCount) {
      sum = sum.add(uint256(answer).mul(sumTimestamp - (timestamp - EPOCH)));
      return sum.mul(_chainlinkPriceMultiplier) / EPOCH;
    } else {
      return 0;
    }
  }

  /// @dev Call `chainlinkAggregator.getRoundData(roundID)`. Return zero if the call reverts.
  function _getChainlinkRoundData(uint80 roundID)
    private
    view
    returns (
      uint80,
      int256,
      uint256,
      uint256,
      uint80
    )
  {
    (bool success, bytes memory returnData) = chainlinkAggregator.staticcall(
      abi.encodePacked(AggregatorV3Interface.getRoundData.selector, abi.encode(roundID))
    );
    if (success) {
      return abi.decode(returnData, (uint80, int256, uint256, uint256, uint80));
    } else {
      return (roundID, 0, 0, 0, roundID);
    }
  }

  /// @notice Submit a TWAP with 18 decimal places by the owner.
  ///         This is allowed only when a epoch cannot be updated by either Chainlink or Uniswap.
  function updateTwapFromOwner(uint256 timestamp, uint256 price) external onlyOwner {
    require(timestamp % EPOCH == 0, "Unaligned timestamp");
    require(timestamp <= block.timestamp - EPOCH * 2, "Not ready for owner");
    require(_ownerUpdatedPrices[timestamp] == 0, "Owner cannot update an existing epoch");

    uint256 chainlinkTwap = _getTwapFromChainlink(timestamp);
    require(chainlinkTwap == 0, "Owner cannot overwrite Chainlink result");

    _ownerUpdatedPrices[timestamp] = price;
    emit Update(timestamp, price);
  }
}

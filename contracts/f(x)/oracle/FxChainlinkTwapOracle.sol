// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";

import { AggregatorV3Interface } from "../../price-oracle/interfaces/AggregatorV3Interface.sol";
import { ITwapOracle } from "../../price-oracle/interfaces/ITwapOracle.sol";

// solhint-disable not-rely-on-time
// solhint-disable reason-string

contract FxChainlinkTwapOracle is ITwapOracle {
  using SafeMath for uint256;

  uint256 private constant MAX_ITERATION = 500;

  /// @notice The twap duration.
  uint256 public immutable epoch;

  /// @notice Chainlink aggregator used as the data source.
  address public immutable chainlinkAggregator;

  /// @notice Minimum number of Chainlink rounds required in an epoch.
  uint256 public immutable chainlinkMinMessageCount;

  /// @notice Maximum gap between an epoch start and a previous Chainlink round for the round
  ///         to be used in TWAP calculation.
  /// @dev This should at least be equal to Chainlink's heartbeat duration.
  uint256 public immutable chainlinkMessageExpiration;

  /// @dev A multiplier that normalizes price from the Chainlink aggregator to 18 decimal places.
  uint256 private immutable _chainlinkPriceMultiplier;

  string public symbol;

  constructor(
    uint256 epoch_,
    address chainlinkAggregator_,
    uint256 chainlinkMinMessageCount_,
    uint256 chainlinkMessageExpiration_,
    string memory symbol_
  ) {
    require(chainlinkMinMessageCount_ > 0);

    epoch = epoch_;
    chainlinkAggregator = chainlinkAggregator_;
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
    return _getTwapFromChainlink(timestamp);
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
    if (updatedAt < timestamp + epoch) {
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
      // The last round before the epoch end is not found, due to either discontinuous
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
    for (uint256 i = 0; i < MAX_ITERATION && updatedAt >= timestamp - epoch; i++) {
      sum = sum.add(uint256(answer).mul(sumTimestamp - updatedAt));
      sumTimestamp = updatedAt;
      if (roundID == 0) {
        break;
      }
      roundID--;
      (, int256 newAnswer, , uint256 newUpdatedAt, ) = _getChainlinkRoundData(roundID);
      if (newAnswer == 0 || newUpdatedAt > updatedAt || newUpdatedAt < timestamp - epoch - chainlinkMessageExpiration) {
        break; // Stop if the previous round is invalid
      }
      answer = newAnswer;
      updatedAt = newUpdatedAt;
      messageCount++;
    }
    if (messageCount >= chainlinkMinMessageCount) {
      // the only update is expired.
      if (messageCount == 1 && updatedAt < timestamp - chainlinkMessageExpiration) return 0;

      sum = sum.add(uint256(answer).mul(sumTimestamp - (timestamp - epoch)));
      return sum.mul(_chainlinkPriceMultiplier) / epoch;
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
}

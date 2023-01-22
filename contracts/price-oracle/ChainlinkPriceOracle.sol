// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/AggregatorV3Interface.sol";
import "./interfaces/IPriceOracle.sol";

contract ChainlinkPriceOracle is Ownable, IPriceOracle {
  /***********
   * Structs *
   ***********/

  struct FeedInfo {
    // The address of chainlink price feed.
    address feed;
    // The decimal used by the feed.
    uint8 decimal;
  }

  /*************
   * Variables *
   *************/

  /// @notice Mapping from token address to chainlink feed information.
  mapping(address => FeedInfo) public feeds;

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IPriceOracle
  function price(address _token) external view override returns (uint256) {
    FeedInfo memory _info = feeds[_token];
    require(_info.feed != address(0), "token not registered");

    (, int256 _answer, , , ) = AggregatorV3Interface(_info.feed).latestRoundData();
    if (_answer <= 0) return 0;
    if (_info.decimal < 18) _answer *= int256(10)**(18 - _info.decimal);
    else _answer /= int256(10)**(_info.decimal - 18);

    return uint256(_answer);
  }

  /*******************************
   * Public Restricted Functions *
   *******************************/

  /// @notice Set the chainlink price feeds.
  /// @param _tokens The address list of tokens to set.
  /// @param _feeds The corresponding address list of feeds.
  function setFeeds(address[] memory _tokens, address[] memory _feeds) external onlyOwner {
    require(_tokens.length == _feeds.length, "length mismatch");
    for (uint256 i = 0; i < _tokens.length; i++) {
      uint8 _decimal = AggregatorV3Interface(_feeds[i]).decimals();
      feeds[_tokens[i]] = FeedInfo(_feeds[i], _decimal);
    }
  }
}

// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IPriceOracle.sol";

contract AladdinPriceOracle is Ownable, IPriceOracle {
  /*************
   * Variables *
   *************/

  mapping(address => address) public sources;

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IPriceOracle
  function price(address _token) external view override returns (uint256) {
    address _source = sources[_token];
    return IPriceOracle(_source).price(_token);
  }

  /*******************************
   * Public Restricted Functions *
   *******************************/

  /// @notice Set the price oracle sources
  /// @param _tokens The address list of tokens to set.
  /// @param _sources The corresponding address list of sources.
  function setSources(address[] memory _tokens, address[] memory _sources) external onlyOwner {
    require(_tokens.length == _sources.length, "length mismatch");
    for (uint256 i = 0; i < _tokens.length; i++) {
      sources[_tokens[i]] = _sources[i];
    }
  }
}

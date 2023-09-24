// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/EnumerableSet.sol";

import { IRebalancePool } from "./interfaces/IRebalancePool.sol";
import { IRebalancePoolSplitter } from "./interfaces/IRebalancePoolSplitter.sol";

contract RebalancePoolSplitter is Ownable, IRebalancePoolSplitter {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.AddressSet;

  /*************
   * Constants *
   *************/

  /// @dev The split ratio precision.
  uint256 private constant PRECISION = 1e9;

  /*************
   * Variables *
   *************/

  /// @inheritdoc IRebalancePoolSplitter
  mapping(address => address) public override splitter;

  /// @dev Mapping from token address to a list of receivers.
  /// The number of receivers should not exceed 10.
  mapping(address => EnumerableSet.AddressSet) private receivers;

  /// @dev Mapping from token address to split ratio encoding for each receivers.
  /// The ratio of the `i`-th receiver is encoded in bits `[i * 32, i * 32 + 32)`.
  mapping(address => uint256) private ratioEncoding;

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IRebalancePoolSplitter
  function getReceivers(address _token)
    external
    view
    override
    returns (address[] memory _receivers, uint256[] memory _ratios)
  {
    EnumerableSet.AddressSet storage _cache = receivers[_token];
    uint256 _encoding = ratioEncoding[_token];

    uint256 _length = _cache.length();
    _receivers = new address[](_length);
    _ratios = new uint256[](_length);
    for (uint256 i = 0; i < _length; i++) {
      _receivers[i] = _cache.at(i);
      _ratios[i] = _encoding & 0xffffffff;
      _encoding = _encoding >> 32;
    }
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IRebalancePoolSplitter
  function split(address _token) external override {
    require(splitter[_token] == msg.sender, "caller is not splitter");

    uint256 _balance = IERC20(_token).balanceOf(address(this));
    EnumerableSet.AddressSet storage _receivers = receivers[_token];
    uint256 _encoding = ratioEncoding[_token];

    uint256 _length = _receivers.length();
    for (uint256 i = 0; i < _length; i++) {
      address _receiver = _receivers.at(i);
      uint256 _ratio = _encoding & 0xffffffff;
      uint256 _amount = (_balance * _ratio) / PRECISION;

      IERC20(_token).safeApprove(_receiver, 0);
      IERC20(_token).safeApprove(_receiver, _amount);
      IRebalancePool(_receiver).depositReward(_token, _amount);

      _encoding = _encoding >> 32;
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Change the splitter of the given token.
  /// @param _token The address of token.
  /// @param _newSplitter The address of the new splitter.
  function setSplitter(address _token, address _newSplitter) external onlyOwner {
    address _oldSplitter = splitter[_token];
    splitter[_token] = _newSplitter;

    emit UpdateSplitter(_token, _oldSplitter, _newSplitter);
  }

  /// @notice Add a receiver to the list.
  /// @param _token The address of token.
  /// @param _receiver The address of receiver to add.
  /// @param _ratios The new split ratio list.
  function registerReceiver(
    address _token,
    address _receiver,
    uint256[] memory _ratios
  ) external onlyOwner {
    EnumerableSet.AddressSet storage _receivers = receivers[_token];
    require(_receivers.add(_receiver), "receiver already added");

    emit RegisterReceiver(_token, _receiver);

    _updateSplitRatios(_token, _ratios);
  }

  /// @notice Remove an exsiting receiver.
  /// @param _token The address of token.
  /// @param _receiver The address of receiver to remove.
  /// @param _ratios The new split ratio list.
  function deregisterReceiver(
    address _token,
    address _receiver,
    uint256[] memory _ratios
  ) external onlyOwner {
    EnumerableSet.AddressSet storage _receivers = receivers[_token];
    require(_receivers.remove(_receiver), "receiver not added before");

    emit DeregisterReceiver(_token, _receiver);

    _updateSplitRatios(_token, _ratios);
  }

  /// @notice Update the split ratios for the token.
  /// @param _token The address of token.
  /// @param _ratios The new split ratio list.
  function updateSplitRatios(address _token, uint256[] memory _ratios) external onlyOwner {
    _updateSplitRatios(_token, _ratios);
  }

  /// @notice Withdraw dust assets in this contract.
  /// @param _token The address of token to withdraw.
  /// @param _recipient The address of token receiver.
  function withdrawFund(address _token, address _recipient) external onlyOwner {
    require(splitter[_token] == address(0), "withdraw token with splitter");

    uint256 _balance = IERC20(_token).balanceOf(address(this));
    IERC20(_token).safeTransfer(_recipient, _balance);
  }

  /************************
   * Internal Functions *
   ************************/

  /// @dev Internal function to update the split ratios for the token.
  /// @param _token The address of token.
  /// @param _ratios The new split ratio list.
  function _updateSplitRatios(address _token, uint256[] memory _ratios) private {
    EnumerableSet.AddressSet storage _receivers = receivers[_token];
    uint256 _length = _receivers.length();
    require(_length == _ratios.length, "length mismtach");

    uint256 _sum;
    uint256 _encoding;
    for (uint256 i = 0; i < _length; i++) {
      require(_ratios[i] <= PRECISION, "split ratio too large");
      _sum += _ratios[i];
      _encoding |= _ratios[i] << (i * 32);
    }
    require(_length == 0 || _sum == PRECISION, "sum not 10^9");

    ratioEncoding[_token] = _encoding;

    emit UpdateSplitRatios(_token, _ratios);
  }
}

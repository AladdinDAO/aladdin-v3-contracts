// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { Ownable2Step } from "@openzeppelin/contracts-v4/access/Ownable2Step.sol";
import { IERC20 } from "@openzeppelin/contracts-v4/interfaces/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts-v4/interfaces/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import { EnumerableSet } from "@openzeppelin/contracts-v4/utils/structs/EnumerableSet.sol";

import { IFxRebalancePool } from "../../interfaces/f(x)/IFxRebalancePool.sol";
import { IFxRebalancePoolSplitter } from "../../interfaces/f(x)/IFxRebalancePoolSplitter.sol";

interface IRewardTokenWrapper {
  function mint(address to, uint256 amount) external;
}

contract RebalancePoolSplitter is Ownable2Step, IFxRebalancePoolSplitter {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.AddressSet;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when caller is not splitter.
  error ErrorCallerIsNotSplitter();

  /// @dev Thrown when add an already added receiver.
  error ErrorReceiverAlreadyAdded();

  /// @dev Thrown when remove an unknown receiver.
  error ErrorUnknownReceiver();

  /// @dev Thrown when try to withdraw protected token.
  error ErrorWithdrawTokenWithSplitter();

  /// @dev Thrown when then length of `receivers` and `ratios` are mismatched.
  error ErrorLengthMismatch();

  /// @dev Thrown when the split ratio is larger then 1e9.
  error ErrorSplitRatioTooLarge();

  /// @dev Thrown when the sum of all split ratios is not 1e9.
  error ErrorSplitRatioSumMismatch();

  /*************
   * Constants *
   *************/

  /// @dev The split ratio precision.
  uint256 private constant PRECISION = 1e9;

  /*************
   * Variables *
   *************/

  /// @inheritdoc IFxRebalancePoolSplitter
  mapping(address => address) public override splitter;

  /// @dev Mapping from token address to a list of receivers.
  /// The number of receivers should not exceed 10.
  mapping(address => EnumerableSet.AddressSet) private receivers;

  /// @dev Mapping from token address to split ratio encoding for each receivers.
  /// The ratio of the `i`-th receiver is encoded in bits `[i * 32, i * 32 + 32)`.
  mapping(address => uint256) private ratioEncoding;

  /// @notice Mapping from reward token address to reward token wrapper.
  mapping(address => address) public tokenWrapper;

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxRebalancePoolSplitter
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

  /// @inheritdoc IFxRebalancePoolSplitter
  function split(address _token) external override {
    if (splitter[_token] != _msgSender()) revert ErrorCallerIsNotSplitter();

    uint256 _balance = IERC20(_token).balanceOf(address(this));
    EnumerableSet.AddressSet storage _receivers = receivers[_token];
    uint256 _encoding = ratioEncoding[_token];
    uint256 decimals = IERC20Metadata(_token).decimals();
    if (decimals < 18) {
      address wrapper = tokenWrapper[_token];
      IERC20(_token).safeApprove(wrapper, 0);
      IERC20(_token).safeApprove(wrapper, _balance);
      IRewardTokenWrapper(wrapper).mint(address(this), _balance);
      _token = wrapper;
      _balance *= 10**(18 - decimals);
    }

    uint256 _length = _receivers.length();
    for (uint256 i = 0; i < _length; i++) {
      address _receiver = _receivers.at(i);
      uint256 _ratio = _encoding & 0xffffffff;
      uint256 _amount = (_balance * _ratio) / PRECISION;

      IERC20(_token).safeApprove(_receiver, 0);
      IERC20(_token).safeApprove(_receiver, _amount);
      IFxRebalancePool(_receiver).depositReward(_token, _amount);

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

  /// @notice Update the reward token wrapper.
  /// @param _token The address of token.
  /// @param _newWrapper The address of reward token wrapper.
  function updateTokenWrapper(address _token, address _newWrapper) external onlyOwner {
    address _oldWrapper = tokenWrapper[_token];
    tokenWrapper[_token] = _newWrapper;

    emit UpdateTokenWrapper(_token, _oldWrapper, _newWrapper);
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
    if (!_receivers.add(_receiver)) revert ErrorReceiverAlreadyAdded();

    emit RegisterReceiver(_token, _receiver);

    _updateSplitRatios(_token, _ratios);
  }

  /// @notice Remove an existing receiver.
  /// @param _token The address of token.
  /// @param _receiver The address of receiver to remove.
  /// @param _ratios The new split ratio list.
  function deregisterReceiver(
    address _token,
    address _receiver,
    uint256[] memory _ratios
  ) external onlyOwner {
    EnumerableSet.AddressSet storage _receivers = receivers[_token];
    if (!_receivers.remove(_receiver)) revert ErrorUnknownReceiver();

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
    if (splitter[_token] != address(0)) revert ErrorWithdrawTokenWithSplitter();

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
    if (_length != _ratios.length) revert ErrorLengthMismatch();

    uint256 _sum;
    uint256 _encoding;
    for (uint256 i = 0; i < _length; i++) {
      if (_ratios[i] > PRECISION) revert ErrorSplitRatioTooLarge();
      _sum += _ratios[i];
      _encoding |= _ratios[i] << (i * 32);
    }
    if (_length > 0 && _sum != PRECISION) revert ErrorSplitRatioSumMismatch();

    ratioEncoding[_token] = _encoding;

    emit UpdateSplitRatios(_token, _ratios);
  }
}

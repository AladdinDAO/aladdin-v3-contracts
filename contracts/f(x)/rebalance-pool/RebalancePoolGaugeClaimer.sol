// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IFxRebalancePoolSplitter } from "../../interfaces/f(x)/IFxRebalancePoolSplitter.sol";
import { ICurveTokenMinter } from "../../interfaces/ICurveTokenMinter.sol";

contract RebalancePoolGaugeClaimer is Ownable {
  using SafeERC20 for IERC20;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the incentive ratio is updated.
  /// @param oldIncentiveRatio The value of previous incentive ratio, multiplied by 1e9.
  /// @param newIncentiveRatio The value of current incentive ratio, multiplied by 1e9.
  event UpdateIncentiveRatio(uint256 oldIncentiveRatio, uint256 newIncentiveRatio);

  /*************
   * Constants *
   *************/

  /// @dev The incentive ratio precision.
  uint256 private constant PRECISION = 1e9;

  /// @dev The maximum value of incentive ratio.
  uint256 private constant MAX_INCENTIVE_RATIO = 1e8; // 10%

  /// @dev The address of FXN token.
  address private constant FXN = 0xC8b194925D55d5dE9555AD1db74c149329F71DeF;

  /// @dev The address of FXN token minter.
  address private constant TOKEN_MINTER = 0xC8b194925D55d5dE9555AD1db74c149329F71DeF;

  /// @notice The address of FXN reserve pool.
  address public immutable reservePool;

  /// @notice The address of Treasury contract.
  address public immutable treasury;

  /***********
   * Structs *
   ***********/

  struct Leverage {
    uint256 maxLeverage;
    uint256 minLeverage;
    uint256 minSplitterRatio;
  }

  /*************
   * Variables *
   *************/

  /// @notice Mapping from Fundraising Gauge address to corresponding RebalancePoolSplitter.
  mapping(address => address) public splitters;

  /// @notice The incentive ratio for caller of `claim`.
  uint256 public incentiveRatio;

  /***************
   * Constructor *
   ***************/

  constructor(address _reservePool, address _treasury) {
    reservePool = _reservePool;
    treasury = _treasury;

    _updateIncentiveRatio(1e7);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Claim pending FXN from gauge and split to rebalance pools.
  /// @param _receiver The address of incentive receiver.
  /// @param _gauge The address of Fundraising Gauge contract.
  function claim(address _receiver, address _gauge) public {
    uint256 _balance = IERC20(FXN).balanceOf(address(this));
    ICurveTokenMinter(TOKEN_MINTER).mint(_gauge);
    uint256 _minted = IERC20(FXN).balanceOf(address(this)) - _balance;
    uint256 _incentive = (_minted * incentiveRatio) / PRECISION;

    if (_incentive > 0) {
      IERC20(FXN).safeTransfer(_receiver, _incentive);
      _minted -= _incentive;
    }

    if (_minted > 0) {
      address _splitter = splitters[_gauge];
      // deposit rewards to rebalance pool splitter
      IERC20(FXN).safeTransfer(_splitter, _minted);
      IFxRebalancePoolSplitter(_splitter).split(FXN);
    }
  }

  function claimMulti(address _receiver, address[] memory _gauges) external {
    uint256 _balance = IERC20(FXN).balanceOf(address(this));
    for (uint256 i = 0; i < _gauges.length; i++) {
      ICurveTokenMinter(TOKEN_MINTER).mint(_gauges[i]);
      uint256 _minted = IERC20(FXN).balanceOf(address(this)) - _balance;
      uint256 _incentive = (_minted * incentiveRatio) / PRECISION;

      if (_incentive > 0) {
        IERC20(FXN).safeTransfer(_receiver, _incentive);
        _minted -= _incentive;
      }

      if (_minted > 0) {
        address _splitter = splitters[_gauges[i]];
        // deposit rewards to rebalance pool splitter
        IERC20(FXN).safeTransfer(_splitter, _minted);
        IFxRebalancePoolSplitter(_splitter).split(FXN);
      }
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the incentive ratio.
  /// @param _newIncentiveRatio The new incentive ratio to claim caller, multiplied by 1e9.
  function updateIncentiveRatio(uint256 _newIncentiveRatio) external onlyOwner {
    _updateIncentiveRatio(_newIncentiveRatio);
  }

  /************************
   * Internal Functions *
   ************************/

  /// @dev Internal function to update the incentive ratio.
  /// @param _newIncentiveRatio The new incentive ratio to claim caller, multiplied by 1e9.
  function _updateIncentiveRatio(uint256 _newIncentiveRatio) internal {
    require(_newIncentiveRatio <= MAX_INCENTIVE_RATIO, "incentive ratio too large");

    uint256 _oldIncentiveRatio = incentiveRatio;
    incentiveRatio = _newIncentiveRatio;

    emit UpdateIncentiveRatio(_oldIncentiveRatio, _newIncentiveRatio);
  }
}

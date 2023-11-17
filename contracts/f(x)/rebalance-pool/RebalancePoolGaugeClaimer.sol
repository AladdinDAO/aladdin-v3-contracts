// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IFxRebalancePoolSplitter } from "../../interfaces/f(x)/IFxRebalancePoolSplitter.sol";
import { IFxTreasury } from "../../interfaces/f(x)/IFxTreasury.sol";
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

  /// @dev The minimum value of `leveratio_raio_min`.
  uint256 private constant MIN_MINIMUM_LEVERAGE_RATIO = 13e8; // 1.3

  /// @dev The maximum value of `leveratio_raio_min`.
  uint256 private constant MAX_MINIMUM_LEVERAGE_RATIO = 2e9; // 2

  /// @dev The minimum value of `leveratio_raio_max`.
  uint256 private constant MIN_MAXIMUM_LEVERAGE_RATIO = 2e9; // 2

  /// @dev The maximum value of `leveratio_raio_max`.
  uint256 private constant MAX_MAXIMUM_LEVERAGE_RATIO = 5e9; // 5

  /// @dev The minimum value of `splitter_raio_min`.
  uint256 private constant MIN_MINIMUM_SPLITTER_RATIO = 5e8; // 0.5

  /// @dev The maximum value of `splitter_raio_max`.
  uint256 private constant MAX_MINIMUM_SPLITTER_RATIO = 1e9; // 1

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

  struct SplitterRatio {
    uint64 minLeverageRatio;
    uint64 maxLeverageRatio;
    uint64 minSplitterRatio;
  }

  /*************
   * Variables *
   *************/

  /// @notice Mapping from Fundraising Gauge address to corresponding RebalancePoolSplitter.
  mapping(address => address) public splitters;

  /// @notice The parameters used to compute splitter ratio.
  SplitterRatio public ratio;

  /// @notice The incentive ratio for caller of `claim`.
  uint256 public incentiveRatio;

  /***************
   * Constructor *
   ***************/

  constructor(address _reservePool, address _treasury) {
    reservePool = _reservePool;
    treasury = _treasury;

    _updateSplitterRatio(2000000000, 3000000000, 666666666);
    _updateIncentiveRatio(1e7);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Compute the current splitter ratio, multiplied by 1e9.
  function getSplitterRatio() external view returns (uint256) {
    return _computeSplitterRatio();
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Claim pending FXN from gauge and split to rebalance pools.
  /// @param _receiver The address of incentive receiver.
  /// @param _gauge The address of Fundraising Gauge contract.
  function claim(address _receiver, address _gauge) public {
    // @note We allow donating FXN to this contract, the incentive should only consider minted FXN.
    uint256 _balance = IERC20(FXN).balanceOf(address(this));
    ICurveTokenMinter(TOKEN_MINTER).mint(_gauge);
    uint256 _minted = IERC20(FXN).balanceOf(address(this)) - _balance;
    uint256 _incentive = (_minted * incentiveRatio) / PRECISION;

    if (_incentive > 0) {
      IERC20(FXN).safeTransfer(_receiver, _incentive);
      _balance -= _incentive;
    }

    if (_balance > 0) {
      address _splitter = splitters[_gauge];
      uint256 _ratio = _computeSplitterRatio();
      uint256 _splitterFXN = (_balance * _ratio) / PRECISION;
      // deposit rewards to rebalance pool splitter
      IERC20(FXN).safeTransfer(_splitter, _splitterFXN);
      // transfer extra FXN to reserve pool
      IERC20(FXN).safeTransfer(reservePool, _balance - _splitterFXN);
      // split rewards
      IFxRebalancePoolSplitter(_splitter).split(FXN);
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

  /// @notice Update the splitter ratio parameters.
  /// @param _minLeverage The minimum leverage ratio, multiplied by 1e9.
  /// @param _maxLeverage The maximum leverage ratio, multiplied by 1e9.
  /// @param _minRatio The minimum splitter ratio, multiplied by 1e9.
  function updateSplitterRatio(
    uint64 _minLeverage,
    uint64 _maxLeverage,
    uint64 _minRatio
  ) external onlyOwner {
    _updateSplitterRatio(_minLeverage, _maxLeverage, _minRatio);
  }

  /************************
   * Internal Functions *
   ************************/

  /// @dev Internal function to compute current splitter ratio.
  /// @return _splitterRatio The current splitter ratio, multiplied by 1e9.
  function _computeSplitterRatio() internal view returns (uint256 _splitterRatio) {
    SplitterRatio memory _ratio = ratio;
    uint256 _leverageRatio = IFxTreasury(treasury).leverageRatio();
    if (_leverageRatio > _ratio.maxLeverageRatio) {
      _splitterRatio = _ratio.minSplitterRatio;
    } else if (_leverageRatio < _ratio.minLeverageRatio) {
      _splitterRatio = PRECISION;
    } else {
      _splitterRatio =
        (uint256(_ratio.minSplitterRatio) *
          (_leverageRatio - _ratio.minLeverageRatio) +
          (_ratio.maxLeverageRatio - _leverageRatio)) /
        (_ratio.maxLeverageRatio - _ratio.minLeverageRatio);
    }
  }

  /// @dev Internal function to update the incentive ratio.
  /// @param _newIncentiveRatio The new incentive ratio to claim caller, multiplied by 1e9.
  function _updateIncentiveRatio(uint256 _newIncentiveRatio) internal {
    require(_newIncentiveRatio <= MAX_INCENTIVE_RATIO, "incentive ratio too large");

    uint256 _oldIncentiveRatio = incentiveRatio;
    incentiveRatio = _newIncentiveRatio;

    emit UpdateIncentiveRatio(_oldIncentiveRatio, _newIncentiveRatio);
  }

  /// @dev Internal function to update the splitter ratio parameters.
  /// @param _minLeverageRatio The minimum leverage ratio, multiplied by 1e9.
  /// @param _maxLeverageRatio The maximum leverage ratio, multiplied by 1e9.
  /// @param _minSplitterRatio The minimum splitter ratio, multiplied by 1e9.
  function _updateSplitterRatio(
    uint64 _minLeverageRatio,
    uint64 _maxLeverageRatio,
    uint64 _minSplitterRatio
  ) internal {
    require(
      MIN_MINIMUM_LEVERAGE_RATIO <= _minLeverageRatio && _minLeverageRatio <= MAX_MINIMUM_LEVERAGE_RATIO,
      "invalid min leverage ratio"
    );
    require(
      MIN_MAXIMUM_LEVERAGE_RATIO <= _maxLeverageRatio && _maxLeverageRatio <= MAX_MAXIMUM_LEVERAGE_RATIO,
      "invalid max leverage ratio"
    );
    require(
      MIN_MINIMUM_SPLITTER_RATIO <= _minSplitterRatio && _minSplitterRatio <= MAX_MINIMUM_SPLITTER_RATIO,
      "invalid min split ratio"
    );

    ratio = SplitterRatio(_minLeverageRatio, _maxLeverageRatio, _minSplitterRatio);
  }
}

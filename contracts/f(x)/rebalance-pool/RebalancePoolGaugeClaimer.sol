// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { Ownable2Step } from "@openzeppelin/contracts-v4/access/Ownable2Step.sol";
import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IFxRebalancePoolSplitter } from "../../interfaces/f(x)/IFxRebalancePoolSplitter.sol";
import { IFxTreasury } from "../../interfaces/f(x)/IFxTreasury.sol";
import { ICurveTokenMinter } from "../../interfaces/ICurveTokenMinter.sol";

contract RebalancePoolGaugeClaimer is Ownable2Step {
  using SafeERC20 for IERC20;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the incentive ratio is updated.
  /// @param oldIncentiveRatio The value of previous incentive ratio, multiplied by 1e18.
  /// @param newIncentiveRatio The value of current incentive ratio, multiplied by 1e18.
  event UpdateIncentiveRatio(uint256 oldIncentiveRatio, uint256 newIncentiveRatio);

  /// @notice Emitted when the splitter ratio parameter is updated.
  /// @param leverageRatioLowerBound The current lower bound of leverage ratio, multiplied by 1e18.
  /// @param leverageRatioUpperBound The current upper bound of leverage ratio, multiplied by 1e18.
  /// @param minSplitterRatio The current minimum splitter ratio, multiplied by 1e18.
  event UpdateSplitterRatio(uint256 leverageRatioLowerBound, uint256 leverageRatioUpperBound, uint256 minSplitterRatio);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the incentive ratio is too large.
  error ErrorIncentiveRatioTooLarge();

  /// @dev Thrown when the leverage ratio lower bound is out of bound.
  error ErrorInvalidLeverageRatioLowerBound();

  /// @dev Thrown when the leverage ratio upper bound is out of bound.
  error ErrorInvalidLeverageRatioUpperBound();

  /// @dev Thrown when the min splitter ratio is out of bound.
  error ErrorInvalidMinSplitRatio();

  /*************
   * Constants *
   *************/

  /// @dev The incentive ratio precision.
  uint256 private constant PRECISION = 1e18;

  /// @dev The maximum value of incentive ratio.
  uint256 private constant MAX_INCENTIVE_RATIO = 1e17; // 10%

  /// @dev The minimum value of `leveratio_raio_min`.
  uint256 private constant MIN_LEVERAGE_RATIO_LOWER_BOUND = 13e17; // 1.3

  /// @dev The maximum value of `leveratio_raio_min`.
  uint256 private constant MAX_LEVERAGE_RATIO_LOWER_BOUND = 2e18; // 2

  /// @dev The minimum value of `leveratio_raio_max`.
  uint256 private constant MIN_LEVERAGE_RATIO_UPPER_BOUND = 2e18; // 2

  /// @dev The maximum value of `leveratio_raio_max`.
  uint256 private constant MAX_LEVERAGE_RATIO_UPPER_BOUND = 5e18; // 5

  /// @dev The minimum value of `splitter_raio_min`.
  uint256 private constant MIN_MINIMUM_SPLITTER_RATIO = 5e17; // 0.5

  /// @dev The maximum value of `splitter_raio_max`.
  uint256 private constant MAX_MINIMUM_SPLITTER_RATIO = 1e18; // 1

  /// @dev The address of FXN token.
  address private constant FXN = 0x365AccFCa291e7D3914637ABf1F7635dB165Bb09;

  /// @dev The address of FXN token minter.
  address private constant TOKEN_MINTER = 0xC8b194925D55d5dE9555AD1db74c149329F71DeF;

  /// @notice The address of FXN reserve pool.
  address public immutable reservePool;

  /// @notice The address of Treasury contract.
  address public immutable treasury;

  /// @notice The address of gauge contract.
  address public immutable gauge;

  /// @notice The address of RebalancePoolSplitter contract.
  address public immutable splitter;

  /***********
   * Structs *
   ***********/

  /// @param leverageRatioLowerBound The lower bound value of leverage ratio.
  /// @param leverageRatioUpperBound The upper bound value of leverage ratio.
  /// @param minSplitterRatio The minimum value of splitter ratio.
  struct SplitterRatioParameters {
    uint64 leverageRatioLowerBound;
    uint64 leverageRatioUpperBound;
    uint64 minSplitterRatio;
  }

  /*************
   * Variables *
   *************/

  /// @notice The parameters used to compute splitter ratio.
  SplitterRatioParameters public params;

  /// @notice The incentive ratio for caller of `claim`.
  uint256 public incentiveRatio;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _reservePool,
    address _treasury,
    address _gauge,
    address _splitter
  ) {
    reservePool = _reservePool;
    treasury = _treasury;
    gauge = _gauge;
    splitter = _splitter;

    _updateSplitterRatioParameters(2 * 10**18, 3 * 10**18, 666666666666666666);
    _updateIncentiveRatio(10**16);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Compute the current splitter ratio, multiplied by 1e18.
  function getSplitterRatio() external view returns (uint256) {
    return _computeSplitterRatio();
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Claim pending FXN from gauge and split to rebalance pools.
  /// @param _receiver The address of incentive receiver.
  function claim(address _receiver) external {
    unchecked {
      // @note We allow donating FXN to this contract, the incentive should only consider minted FXN.
      uint256 _balance = IERC20(FXN).balanceOf(address(this));
      ICurveTokenMinter(TOKEN_MINTER).mint(gauge);
      uint256 _minted = IERC20(FXN).balanceOf(address(this)) - _balance;
      uint256 _incentive = (_minted * incentiveRatio) / PRECISION;
      _balance += _minted;

      if (_incentive > 0) {
        IERC20(FXN).safeTransfer(_receiver, _incentive);
        _balance -= _incentive;
      }

      if (_balance > 0) {
        uint256 _ratio = _computeSplitterRatio();
        uint256 _splitterFXN = (_balance * _ratio) / PRECISION;
        // deposit rewards to rebalance pool splitter
        IERC20(FXN).safeTransfer(splitter, _splitterFXN);
        // transfer extra FXN to reserve pool
        IERC20(FXN).safeTransfer(reservePool, _balance - _splitterFXN);
        // split rewards
        IFxRebalancePoolSplitter(splitter).split(FXN);
      }
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the incentive ratio.
  /// @param _newIncentiveRatio The new incentive ratio to claim caller, multiplied by 1e18.
  function updateIncentiveRatio(uint256 _newIncentiveRatio) external onlyOwner {
    _updateIncentiveRatio(_newIncentiveRatio);
  }

  /// @notice Update the splitter ratio parameters.
  /// @param _minLeverage The minimum leverage ratio, multiplied by 1e18.
  /// @param _maxLeverage The maximum leverage ratio, multiplied by 1e18.
  /// @param _minRatio The minimum splitter ratio, multiplied by 1e18.
  function updateSplitterRatioParameters(
    uint64 _minLeverage,
    uint64 _maxLeverage,
    uint64 _minRatio
  ) external onlyOwner {
    _updateSplitterRatioParameters(_minLeverage, _maxLeverage, _minRatio);
  }

  /************************
   * Internal Functions *
   ************************/

  /// @dev Internal function to compute current splitter ratio.
  /// @return _splitterRatio The current splitter ratio, multiplied by 1e18.
  function _computeSplitterRatio() internal view returns (uint256 _splitterRatio) {
    SplitterRatioParameters memory _params = params;
    uint256 _leverageRatio = IFxTreasury(treasury).leverageRatio();
    if (_leverageRatio > _params.leverageRatioUpperBound) {
      _splitterRatio = _params.minSplitterRatio;
    } else if (_leverageRatio < _params.leverageRatioLowerBound) {
      _splitterRatio = PRECISION;
    } else {
      // a = (leverageRatioLowerBound * minSplitterRatio - leverageRatioUpperBound) / c
      // b = (1 - minSplitterRatio) / c
      // c = leverageRatioLowerBound - leverageRatioUpperBound
      // a + b * leverageRatio
      //   = leverageRatioLowerBound * minSplitterRatio - leverageRatioUpperBound + (1 - minSplitterRatio) * leverageRatio
      //   = minSplitterRatio * (leverageRatioLowerBound - leverageRatio) + leverageRatio - leverageRatioUpperBound
      unchecked {
        _splitterRatio =
          (uint256(_params.minSplitterRatio) *
            (_leverageRatio - uint256(_params.leverageRatioLowerBound)) +
            (uint256(_params.leverageRatioUpperBound) - _leverageRatio) *
            PRECISION) /
          uint256(_params.leverageRatioUpperBound - _params.leverageRatioLowerBound);
      }
    }
  }

  /// @dev Internal function to update the incentive ratio.
  /// @param _newIncentiveRatio The new incentive ratio to claim caller, multiplied by 1e18.
  function _updateIncentiveRatio(uint256 _newIncentiveRatio) internal {
    if (_newIncentiveRatio > MAX_INCENTIVE_RATIO) {
      revert ErrorIncentiveRatioTooLarge();
    }

    uint256 _oldIncentiveRatio = incentiveRatio;
    incentiveRatio = _newIncentiveRatio;

    emit UpdateIncentiveRatio(_oldIncentiveRatio, _newIncentiveRatio);
  }

  /// @dev Internal function to update the splitter ratio parameters.
  /// @param _leverageRatioLowerBound The lower bound of leverage ratio, multiplied by 1e18.
  /// @param _leverageRatioUpperBound The upper bound of leverage ratio, multiplied by 1e18.
  /// @param _minSplitterRatio The minimum splitter ratio, multiplied by 1e18.
  function _updateSplitterRatioParameters(
    uint64 _leverageRatioLowerBound,
    uint64 _leverageRatioUpperBound,
    uint64 _minSplitterRatio
  ) internal {
    if (
      _leverageRatioLowerBound < MIN_LEVERAGE_RATIO_LOWER_BOUND ||
      _leverageRatioLowerBound > MAX_LEVERAGE_RATIO_LOWER_BOUND
    ) {
      revert ErrorInvalidLeverageRatioLowerBound();
    }
    if (
      _leverageRatioUpperBound < MIN_LEVERAGE_RATIO_UPPER_BOUND ||
      _leverageRatioUpperBound > MAX_LEVERAGE_RATIO_UPPER_BOUND
    ) {
      revert ErrorInvalidLeverageRatioUpperBound();
    }
    if (_minSplitterRatio < MIN_MINIMUM_SPLITTER_RATIO || _minSplitterRatio > MAX_MINIMUM_SPLITTER_RATIO) {
      revert ErrorInvalidMinSplitRatio();
    }

    params = SplitterRatioParameters(_leverageRatioLowerBound, _leverageRatioUpperBound, _minSplitterRatio);

    emit UpdateSplitterRatio(_leverageRatioLowerBound, _leverageRatioUpperBound, _minSplitterRatio);
  }
}

// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { Ownable } from "@openzeppelin/contracts-v4/access/Ownable.sol";

import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import { IZap } from "../../interfaces/IZap.sol";

interface ILegacyCompounder {
  /// @dev Compiler will pack this into single `uint256`.
  struct FeeInfo {
    // The address of recipient of platform fee
    address platform;
    // The percentage of rewards to take for platform on harvest, multipled by 1e9.
    uint32 platformPercentage;
    // The percentage of rewards to take for caller on harvest, multipled by 1e9.
    uint32 bountyPercentage;
    // The percentage of withdraw fee, multipled by 1e9.
    uint32 withdrawPercentage;
  }

  function asset() external view returns (address);

  function zap() external view returns (address);

  function feeInfo() external view returns (FeeInfo memory);

  /// @notice Deposit new rewards to this contract.
  ///
  /// @param amount The amount of new rewards.
  function depositReward(uint256 amount) external;
}

contract LegacyCompounderStash is Ownable {
  using SafeERC20 for IERC20;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the caller is not harvester.
  error CallerNotHarvester();

  /// @dev Thrown when the harvested assets is not enough compared to off-chain computation.
  error InsufficientHarvestedAssets();

  /*************
   * Constants *
   *************/

  /// @notice The address of comounder.
  address public immutable compounder;

  /// @notice The address of underlying asset for the compounder.
  address public immutable asset;

  /// @notice The address of harvester contract.
  address public immutable harvester;

  /// @dev The fee denominator used for rate calculation.
  uint256 internal constant FEE_PRECISION = 1e9;

  /***************
   * Constructor *
   ***************/

  constructor(address _compounder, address _harvester) {
    address _asset = ILegacyCompounder(_compounder).asset();
    IERC20(_asset).safeApprove(_compounder, type(uint256).max);

    compounder = _compounder;
    asset = _asset;
    harvester = _harvester;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Batch convert stashed reward tokens to underlying assets.
  ///
  /// @dev All the tokens should be converted to intermediate token first and then to underlying asset.
  ///
  /// @param _tokens The address list of tokens to convert.
  /// @param _intermediateToken The address of intermediate token.
  /// @param _receiver The address of harvester bounty recipient.
  /// @param _minAsset The minimum amount of underlying assets should be converted, used as slippage control.
  /// @return _assets The amount of underlying assets converted.
  function processBatch(
    address[] memory _tokens,
    address _intermediateToken,
    address _receiver,
    uint256 _minAsset
  ) external returns (uint256 _assets) {
    if (harvester != msg.sender) revert CallerNotHarvester();

    address _zap = ILegacyCompounder(compounder).zap();

    uint256 _length = _tokens.length;
    uint256 _imAmount;
    for (uint256 i = 0; i < _length; i++) {
      if (_tokens[i] == asset) {
        _assets = IERC20(_tokens[i]).balanceOf(address(this));
      } else {
        uint256 _amount = IERC20(_tokens[i]).balanceOf(address(this));
        if (_amount > 0) {
          IERC20(_tokens[i]).safeTransfer(_zap, _amount);
          if (_intermediateToken == asset) {
            _imAmount += IZap(_zap).zap(_tokens[i], _amount, _intermediateToken, 0);
          } else {
            _assets += IZap(_zap).zap(_tokens[i], _amount, asset, 0);
          }
        }
      }
    }
    if (_imAmount > 0) {
      IERC20(_intermediateToken).safeTransfer(_zap, _imAmount);
      _assets += IZap(_zap).zap(_intermediateToken, _imAmount, asset, 0);
    }

    _distribute(_assets, _minAsset, _receiver);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Emergency function to execute arbitrary call.
  /// @dev This function should be only used in case of emergency. It should never be called explicitly
  ///  in any contract in normal case.
  ///
  /// @param _to The address of target contract to call.
  /// @param _value The value passed to the target contract.
  /// @param _data The calldata pseed to the target contract.
  function execute(
    address _to,
    uint256 _value,
    bytes calldata _data
  ) external payable onlyOwner returns (bool, bytes memory) {
    // solhint-disable-next-line avoid-low-level-calls
    (bool success, bytes memory result) = _to.call{ value: _value }(_data);
    return (success, result);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to distribute converted assets.
  ///
  /// @param _assets The amount of asset to distribute.
  /// @param _minAsset The minimum amount of underlying assets should be converted, used as slippage control.
  /// @param _receiver The address of harvester bounty recipient.
  function _distribute(
    uint256 _assets,
    uint256 _minAsset,
    address _receiver
  ) internal virtual {
    if (_assets < _minAsset) revert InsufficientHarvestedAssets();

    ILegacyCompounder.FeeInfo memory _feeInfo = ILegacyCompounder(compounder).feeInfo();

    // incentive to harvester
    uint256 _harvesterBounty;
    if (_feeInfo.bountyPercentage > 0) {
      _harvesterBounty = (_assets * uint256(_feeInfo.bountyPercentage)) / FEE_PRECISION;
      IERC20(asset).safeTransfer(_receiver, _harvesterBounty);
    }

    // incentive to treasury
    uint256 _performanceFee;
    if (_feeInfo.platformPercentage > 0) {
      _performanceFee = (_assets * uint256(_feeInfo.platformPercentage)) / FEE_PRECISION;
      IERC20(asset).safeTransfer(_feeInfo.platform, _performanceFee);
    }

    // rest for compunder
    unchecked {
      ILegacyCompounder(compounder).depositReward(_assets - _harvesterBounty - _performanceFee);
    }
  }
}

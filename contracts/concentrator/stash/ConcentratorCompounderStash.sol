// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import { IConcentratorCompounder } from "../../interfaces/concentrator/IConcentratorCompounder.sol";

import { ConcentratorStashBase } from "./ConcentratorStashBase.sol";

contract ConcentratorCompounderStash is ConcentratorStashBase {
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

  /// @notice The address of Concentrator Compounder.
  address public immutable compounder;

  /// @notice The address of underlying asset for the compounder.
  address public immutable asset;

  /*************
   * Modifiers *
   *************/

  modifier onlyHarvester() {
    if (IConcentratorCompounder(compounder).harvester() != msg.sender) revert CallerNotHarvester();
    _;
  }

  /***************
   * Constructor *
   ***************/

  constructor(address _compounder) {
    address _asset = IConcentratorCompounder(_compounder).asset();
    IERC20(_asset).safeApprove(_compounder, type(uint256).max);

    compounder = _compounder;
    asset = _asset;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Convert stashed reward tokens to underlying assets.
  ///
  /// @param _token The address of token to convert.
  /// @param _routes The list of route encodings used for converting.
  /// @param _receiver The address of harvester bounty recipient.
  /// @param _minAsset The minimum amount of underlying assets should be converted, used as slippage control.
  /// @return _assets The amount of underlying assets converted.
  function process(
    address _token,
    uint256[] memory _routes,
    address _receiver,
    uint256 _minAsset
  ) external onlyHarvester returns (uint256 _assets) {
    if (_token == asset) {
      _assets = IERC20(_token).balanceOf(address(this));
    } else {
      address _converter = IConcentratorCompounder(compounder).converter();
      _assets = _transfer(_token, _converter);
      _assets = _convert(_converter, _assets, _routes, address(this));
    }

    _distribute(_assets, _minAsset, _receiver);
  }

  /// @notice Batch convert stashed reward tokens to underlying assets.
  ///
  /// @dev All the tokens should be converted to intermediate token first and then to underlying asset.
  ///
  /// @param _tokens The address list of tokens to convert.
  /// @param _partialRoutes The corresponding routes to convert to intermediate token.
  /// @param _intermediateToken The address of intermediate token.
  /// @param _finalRoute The list of route encodings used to convert intermediate token to underlying asset.
  /// @param _receiver The address of harvester bounty recipient.
  /// @param _minAsset The minimum amount of underlying assets should be converted, used as slippage control.
  /// @return _assets The amount of underlying assets converted.
  function processBatch(
    address[] memory _tokens,
    uint256[][] memory _partialRoutes,
    address _intermediateToken,
    uint256[] memory _finalRoute,
    address _receiver,
    uint256 _minAsset
  ) external onlyHarvester returns (uint256 _assets) {
    address _converter = IConcentratorCompounder(compounder).converter();

    uint256 _length = _tokens.length;
    uint256 _imAmount;
    for (uint256 i = 0; i < _length; i++) {
      if (_tokens[i] == asset) {
        _assets = IERC20(_tokens[i]).balanceOf(address(this));
      } else {
        uint256 _amount = _transfer(_tokens[i], _converter);
        if (_amount > 0) {
          if (_intermediateToken == asset) {
            _imAmount += _convert(_converter, _assets, _partialRoutes[i], _converter);
          } else {
            _assets += _convert(_converter, _assets, _partialRoutes[i], address(this));
          }
        }
      }
    }
    if (_imAmount > 0) {
      _assets += _convert(_converter, _imAmount, _finalRoute, address(this));
    }

    _distribute(_assets, _minAsset, _receiver);
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
  ) internal {
    if (_assets < _minAsset) revert InsufficientHarvestedAssets();

    // incentive to harvester
    uint256 _harvesterBounty;
    uint256 _harvesterRatio = IConcentratorCompounder(compounder).getHarvesterRatio();
    if (_harvesterRatio > 0) {
      _harvesterBounty = (_assets * _harvesterRatio) / FEE_PRECISION;
      IERC20(asset).safeTransfer(_receiver, _harvesterBounty);
    }

    // incentive to treasury
    uint256 _performanceFee;
    uint256 _expenseRatio = IConcentratorCompounder(compounder).getExpenseRatio();
    if (_expenseRatio > 0) {
      _performanceFee = (_assets * _expenseRatio) / FEE_PRECISION;
      IERC20(asset).safeTransfer(IConcentratorCompounder(compounder).treasury(), _performanceFee);
    }

    // rest for compunder
    unchecked {
      IConcentratorCompounder(compounder).depositReward(_assets - _harvesterBounty - _performanceFee);
    }
  }
}

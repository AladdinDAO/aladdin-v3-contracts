// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import { ILegacyCompounder, LegacyCompounderStash } from "./LegacyCompounderStash.sol";

interface ICvxCrvCompounder {
  function platformFeePercentage() external view returns (uint256);

  function harvestBountyPercentage() external view returns (uint256);

  function platform() external view returns (address);
}

contract CvxCrvCompounderStash is LegacyCompounderStash {
  using SafeERC20 for IERC20;

  /***************
   * Constructor *
   ***************/

  constructor() LegacyCompounderStash(0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884) {}

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
  ) internal virtual override {
    if (_assets < _minAsset) revert ErrorInsufficientHarvestedAssets();

    // incentive to harvester
    uint256 _harvesterBounty;
    uint256 _bountyPercentage = ICvxCrvCompounder(compounder).harvestBountyPercentage();
    if (_bountyPercentage > 0) {
      _harvesterBounty = (_assets * _bountyPercentage) / FEE_PRECISION;
      IERC20(asset).safeTransfer(_receiver, _harvesterBounty);
    }

    // incentive to treasury
    uint256 _performanceFee;
    uint256 _platformPercentage = ICvxCrvCompounder(compounder).platformFeePercentage();
    if (_platformPercentage > 0) {
      _performanceFee = (_assets * _platformPercentage) / FEE_PRECISION;
      IERC20(asset).safeTransfer(ICvxCrvCompounder(compounder).platform(), _performanceFee);
    }

    // rest for compunder
    unchecked {
      ILegacyCompounder(compounder).depositReward(_assets - _harvesterBounty - _performanceFee);
    }
  }
}

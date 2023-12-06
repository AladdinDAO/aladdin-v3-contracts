// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { AccessControl } from "@openzeppelin/contracts-v4/access/AccessControl.sol";

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

  function feeInfo() external view returns (FeeInfo memory);

  /// @notice Deposit new rewards to this contract.
  ///
  /// @param amount The amount of new rewards.
  function depositReward(uint256 amount) external;
}

contract LegacyCompounderStash is AccessControl {
  using SafeERC20 for IERC20;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the harvested assets is not enough compared to off-chain computation.
  error ErrorInsufficientHarvestedAssets();

  /// @dev Thrown when the length of arrays mismatch.
  error ErrorLengthMismatch();

  /// @dev Thrown when asset is not in the first entry of the array.
  error ErrorAssetIndexNotZero();

  /*************
   * Constants *
   *************/

  /// @notice The role for harvester burner.
  bytes32 public constant HARVESTER_ROLE = keccak256("HARVESTER_ROLE");

  /// @notice The address of comounder.
  address public immutable compounder;

  /// @notice The address of underlying asset for the compounder.
  address public immutable asset;

  /// @dev The fee denominator used for rate calculation.
  uint256 internal constant FEE_PRECISION = 1e9;

  /*************
   * Structs *
   *************/

  /// @notice The struct for convert parameters.
  ///
  /// @param target The address of converter contract.
  /// @param data The calldata passing to the target contract.
  struct ConvertParams {
    address target;
    bytes data;
  }

  /***************
   * Constructor *
   ***************/

  constructor(address _compounder) {
    address _asset = ILegacyCompounder(_compounder).asset();
    IERC20(_asset).safeApprove(_compounder, type(uint256).max);

    compounder = _compounder;
    asset = _asset;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Convert stashed reward tokens to underlying assets.
  ///
  /// @dev All the tokens should be converted to intermediate token first and then to underlying asset.
  ///
  /// @param _tokens The address list of tokens to convert.
  /// @param _params The address of intermediate token.
  /// @param _receiver The address of harvester bounty recipient.
  /// @param _minAsset The minimum amount of underlying assets should be converted, used as slippage control.
  /// @return _assets The amount of underlying assets converted.
  function convert(
    address[] memory _tokens,
    ConvertParams[] memory _params,
    address _receiver,
    uint256 _minAsset
  ) external onlyRole(HARVESTER_ROLE) returns (uint256 _assets) {
    if (_tokens.length != _params.length) revert ErrorLengthMismatch();

    uint256 _length = _tokens.length;
    for (uint256 i = 0; i < _length; i++) {
      address _token = _tokens[i];
      uint256 _balance = IERC20(_token).balanceOf(address(this));
      if (_token == asset) {
        if (i != 0) revert ErrorAssetIndexNotZero();
        _assets = _balance;
      } else if (_balance > 0) {
        _assets += _convert(_token, asset, _balance, _params[i]);
      }
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
  ) external payable onlyRole(DEFAULT_ADMIN_ROLE) returns (bool, bytes memory) {
    // solhint-disable-next-line avoid-low-level-calls
    (bool success, bytes memory result) = _to.call{ value: _value }(_data);
    return (success, result);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to convert token with routes.
  /// @param _srcToken The address of source token.
  /// @param _dstToken The address of destination token.
  /// @param _amountIn The amount of input token.
  /// @param _params The token converting paramaters.
  /// @return _amountOut The amount of output token received.
  function _convert(
    address _srcToken,
    address _dstToken,
    uint256 _amountIn,
    ConvertParams memory _params
  ) internal returns (uint256 _amountOut) {
    if (_srcToken == _dstToken) return _amountIn;

    _amountOut = IERC20(_dstToken).balanceOf(address(this));

    IERC20(_srcToken).safeApprove(_params.target, 0);
    IERC20(_srcToken).safeApprove(_params.target, _amountIn);

    // solhint-disable-next-line avoid-low-level-calls
    (bool _success, ) = _params.target.call(_params.data);
    // below lines will propagate inner error up
    if (!_success) {
      // solhint-disable-next-line no-inline-assembly
      assembly {
        let ptr := mload(0x40)
        let size := returndatasize()
        returndatacopy(ptr, 0, size)
        revert(ptr, size)
      }
    }

    _amountOut = IERC20(_dstToken).balanceOf(address(this)) - _amountOut;
  }

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
    if (_assets < _minAsset) revert ErrorInsufficientHarvestedAssets();

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

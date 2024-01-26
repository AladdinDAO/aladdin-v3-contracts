// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { Ownable2Step } from "@openzeppelin/contracts-v4/access/Ownable2Step.sol";
import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import { Address } from "@openzeppelin/contracts-v4/utils/Address.sol";

import { IConverterRegistry } from "../../helpers/converter/IConverterRegistry.sol";
import { ITokenConverter } from "../../helpers/converter/ITokenConverter.sol";
import { IConcentratorHarvesterPool } from "../../interfaces/concentrator/IConcentratorHarvesterPool.sol";
import { IWETH } from "../../interfaces/IWETH.sol";

contract HarvesterPoolClaimGateway is Ownable2Step {
  using SafeERC20 for IERC20;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the converter contract is updated.
  ///
  /// @param oldConverter The address of the previous converter contract.
  /// @param newConverter The address of the current converter contract.
  event UpdateConverter(address indexed oldConverter, address indexed newConverter);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the address of converter contract is zero.
  error ConverterIsZero();

  /// @dev Thrown when the converted assets is not enough compared to off-chain computation.
  error ErrorInsufficientConvertedAssets();

  /*************
   * Constants *
   *************/

  // The address of WETH token.
  address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  /*************
   * Variables *
   *************/

  /// @notice The address of converter contract.
  address public converter;

  /***************
   * Constructor *
   ***************/

  constructor(address _conveter) {
    _updateConverter(_conveter);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  // receive ETH from WETH
  receive() external payable {}

  /// @notice Claim rewards for a list of Concentrator harvester pool.
  /// @param pools The address list of Concentrator harvester pools.
  function claimRewards(address[] memory pools) external {
    address caller = _msgSender();
    uint256 length = pools.length;
    for (uint256 i = 0; i < length; ++i) {
      IConcentratorHarvesterPool(pools[i]).claimFor(caller, caller);
    }
  }

  /// @notice Claim rewards for a list of Concentrator harvester pool.
  /// @dev Here we assume the reward token for all the pools are the same.
  ///   And `targetToken` is not the same as reward token.
  /// @param pools The address list of Concentrator harvester pools.
  /// @param targetToken The address of target token.
  /// @param minOut The minimum amount of target token should receive.
  /// @return amountOut The amount of target token received.
  function claimRewardsAs(
    address[] memory pools,
    address targetToken,
    uint256 minOut
  ) external returns (uint256 amountOut) {
    address caller = _msgSender();
    uint256 length = pools.length;
    address sourceToken = IConcentratorHarvesterPool(pools[0]).rewardToken();
    address _converter = converter;
    for (uint256 i = 0; i < length; ++i) {
      IConcentratorHarvesterPool(pools[i]).claimFor(caller, _converter);
    }
    amountOut = IERC20(sourceToken).balanceOf(_converter);

    address _registry = ITokenConverter(_converter).registry();
    uint256[] memory routes = IConverterRegistry(_registry).getRoutes(
      sourceToken,
      targetToken == address(0) ? WETH : targetToken
    );

    length = routes.length - 1;
    for (uint256 i = 0; i < length; i++) {
      amountOut = ITokenConverter(_converter).convert(routes[i], amountOut, _converter);
    }
    if (targetToken == address(0)) {
      amountOut = ITokenConverter(_converter).convert(routes[length], amountOut, address(this));
      IWETH(WETH).withdraw(amountOut);
      Address.sendValue(payable(caller), amountOut);
    } else {
      amountOut = ITokenConverter(_converter).convert(routes[length], amountOut, caller);
    }

    if (amountOut < minOut) revert ErrorInsufficientConvertedAssets();
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the address of converter contract.
  ///
  /// @param _newConverter The address of the new converter contract.
  function updateConverter(address _newConverter) external onlyOwner {
    _updateConverter(_newConverter);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to update the address of converter contract.
  ///
  /// @param _newConverter The address of the new converter contract.
  function _updateConverter(address _newConverter) private {
    if (_newConverter == address(0)) revert ConverterIsZero();

    address _oldConverter = converter;
    converter = _newConverter;

    emit UpdateConverter(_oldConverter, _newConverter);
  }
}

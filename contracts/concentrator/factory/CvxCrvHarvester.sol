// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { LinearRewardDistributor } from "../../common/rewards/distributor/LinearRewardDistributor.sol";
import { ConcentratorHarvesterBase } from "./ConcentratorHarvesterBase.sol";

import { IConcentratorCompounder } from "../../interfaces/concentrator/IConcentratorCompounder.sol";

// solhint-disable const-name-snakecase
// solhint-disable no-empty-blocks

contract CvxCrvHarvester is ConcentratorHarvesterBase {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /*************
   * Constants *
   *************/

  // @dev The address of cvxCRV token.
  address private constant cvxCRV = 0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7;

  // @dev The address of aCRV token.
  address private constant aCRV = 0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884;

  /***************
   * Constructor *
   ***************/

  constructor(uint40 _periodLength) LinearRewardDistributor(_periodLength) {}

  function initialize(
    address _stakingToken,
    address _treasury,
    address _harvester,
    address _converter,
    address _strategy
  ) external initializer {
    string memory _name = string(
      abi.encodePacked(IERC20MetadataUpgradeable(_stakingToken).name(), " cvxCRV Harvester")
    );
    string memory _symbol = string(
      abi.encodePacked(IERC20MetadataUpgradeable(_stakingToken).symbol(), "-cvxCRV-harvester")
    );

    __Context_init(); // from ContextUpgradeable
    __ERC20_init(_name, _symbol); // from ERC20Upgradeable
    __ERC20Permit_init(_name); // from ERC20PermitUpgradeable
    __ReentrancyGuard_init(); // from ReentrancyGuardUpgradeable
    __ERC165_init(); // from ERC165Upgradeable
    __AccessControl_init(); // from AccessControlUpgradeable

    __ConcentratorBaseV2_init(_treasury, _harvester, _converter); // from ConcentratorBaseV2
    __RewardAccumulator_init(aCRV); // from RewardAccumulator
    __ConcentratorHarvesterBase_init(_stakingToken, _strategy); // from ConcentratorHarvesterBase

    // access control
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

    // approval
    IERC20Upgradeable(cvxCRV).safeApprove(aCRV, type(uint256).max);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc ConcentratorHarvesterBase
  function _convertToCompounder(uint256 _imAmount) internal virtual override returns (uint256) {
    return IConcentratorCompounder(compounder()).deposit(_imAmount, address(this));
  }

  /// @inheritdoc ConcentratorHarvesterBase
  function _getIntermediateToken() internal view virtual override returns (address) {
    return cvxCRV;
  }
}

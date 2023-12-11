// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { LinearRewardDistributor } from "../../common/rewards/distributor/LinearRewardDistributor.sol";
import { ConcentratorCompounderBase } from "../ConcentratorCompounderBase.sol";

// solhint-disable const-name-snakecase
// solhint-disable no-empty-blocks

contract xETHCompounder is ConcentratorCompounderBase {
  /*************
   * Constants *
   *************/

  /// @dev The address of xETH token.
  address private constant xETH = 0xe063F04f280c60aECa68b38341C2eEcBeC703ae2;

  /***************
   * Constructor *
   ***************/

  constructor(uint40 _periodLength) LinearRewardDistributor(_periodLength) {}

  function initialize(
    string memory _name,
    string memory _symbol,
    address _treasury,
    address _harvester,
    address _converter,
    address _strategy
  ) external initializer {
    __Context_init(); // from ContextUpgradeable
    __ERC165_init(); // from ERC165Upgradeable
    __AccessControl_init(); // from AccessControlUpgradeable
    __ReentrancyGuard_init(); // from ReentrancyGuardUpgradeable
    __ERC20_init(_name, _symbol); // from ERC20Upgradeable
    __ERC20Permit_init(_name); // from ERC20PermitUpgradeable

    __ConcentratorBaseV2_init(_treasury, _harvester, _converter); // from ConcentratorBaseV2
    __LinearRewardDistributor_init(xETH); // from LinearRewardDistributor
    __ConcentratorCompounderBase_init(_strategy); // from ConcentratorCompounderBase

    // access control
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc ConcentratorCompounderBase
  function _getAsset() internal view virtual override returns (address) {
    return xETH;
  }

  /// @inheritdoc ConcentratorCompounderBase
  function _getIntermediateToken() internal view virtual override returns (address) {
    return xETH;
  }
}

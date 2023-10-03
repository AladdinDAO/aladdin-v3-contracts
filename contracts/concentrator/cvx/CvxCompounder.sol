// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { LinearRewardDistributor } from "../../common/rewards/distributor/LinearRewardDistributor.sol";
import { ConcentratorCompounderBase } from "../ConcentratorCompounderBase.sol";

// solhint-disable no-empty-blocks

contract CvxCompounder is ConcentratorCompounderBase {
  /// @dev The address of CVX token.
  address private constant CVX = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;

  /// @dev The address of WETH token.
  address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

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
    __AccessControl_init(); // from AccessControlUpgradeable
    __ReentrancyGuard_init(); // from ReentrancyGuardUpgradeable
    __ERC20_init(_name, _symbol); // from ERC20Upgradeable
    __ERC20Permit_init(_name); // from ERC20PermitUpgradeable

    __ConcentratorBaseV2_init(_treasury, _harvester, _converter); // from ConcentratorBaseV2
    __LinearRewardDistributor_init(CVX); // from LinearRewardDistributor
    __ConcentratorCompounderBase_init(_strategy); // from ConcentratorCompounderBase

    // access control
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc ConcentratorCompounderBase
  function _getAsset() internal view virtual override returns (address) {
    return CVX;
  }

  /// @inheritdoc ConcentratorCompounderBase
  function _getIntermediateToken() internal view virtual override returns (address) {
    return WETH;
  }
}

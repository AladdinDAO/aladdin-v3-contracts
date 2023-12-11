// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { IMarket } from "../../f(x)/interfaces/IMarket.sol";
import { IConcentratorCompounder } from "../../interfaces/concentrator/IConcentratorCompounder.sol";
import { IConcentratorHarvesterPool } from "../../interfaces/concentrator/IConcentratorHarvesterPool.sol";

import { LinearRewardDistributor } from "../../common/rewards/distributor/LinearRewardDistributor.sol";
import { ConcentratorHarvesterPoolBase } from "../permissionless/ConcentratorHarvesterPoolBase.sol";

contract xETHHarvesterPool is ConcentratorHarvesterPoolBase {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /*************
   * Constants *
   *************/

  /// @dev The address of xETH compounder.
  address private immutable axETH;

  /// @dev The address of xETH token.
  address private constant xETH = 0xe063F04f280c60aECa68b38341C2eEcBeC703ae2;

  /// @dev The address of Lido's stETH token.
  address private constant stETH = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;

  /// @dev The address of Fx stETH Market contract.
  address private constant market = 0xe7b9c7c9cA85340b8c06fb805f7775e3015108dB;

  /***************
   * Constructor *
   ***************/

  constructor(address _axETH, uint40 _periodLength) LinearRewardDistributor(_periodLength) {
    axETH = _axETH;
  }

  function initialize(
    address _stakingToken,
    address _treasury,
    address _harvester,
    address _converter,
    address _strategy
  ) external initializer {
    string memory _name = string(abi.encodePacked(IERC20MetadataUpgradeable(_stakingToken).name(), " xETH Harvester"));
    string memory _symbol = string(
      abi.encodePacked(IERC20MetadataUpgradeable(_stakingToken).symbol(), "-xETH-harvester")
    );

    __Context_init(); // from ContextUpgradeable
    __ERC20_init(_name, _symbol); // from ERC20Upgradeable
    __ERC20Permit_init(_name); // from ERC20PermitUpgradeable
    __ReentrancyGuard_init(); // from ReentrancyGuardUpgradeable
    __ERC165_init(); // from ERC165Upgradeable
    __AccessControl_init(); // from AccessControlUpgradeable

    __ConcentratorBaseV2_init(_treasury, _harvester, _converter); // from ConcentratorBaseV2
    __RewardAccumulator_init(axETH); // from RewardAccumulator
    __ConcentratorHarvesterBase_init(_stakingToken, _strategy); // from ConcentratorHarvesterBase

    // access control
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

    // approval
    IERC20Upgradeable(stETH).safeApprove(market, type(uint256).max);
    IERC20Upgradeable(xETH).safeApprove(axETH, type(uint256).max);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IConcentratorHarvesterPool
  function compounder() public view override returns (address) {
    return axETH;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc ConcentratorHarvesterPoolBase
  function _convertToCompounder(uint256 _imAmount) internal virtual override returns (uint256) {
    // convert stETH to xETH
    (uint256 _amount, uint256 _bonus) = IMarket(market).mintXToken(_imAmount, address(this), 0);
    if (_bonus > 0) {
      // send to strategy
      IERC20Upgradeable(stETH).safeTransfer(strategy, _bonus);
    }

    // deposit xETH to axETH
    return IConcentratorCompounder(axETH).deposit(_amount, address(this));
  }

  /// @inheritdoc ConcentratorHarvesterPoolBase
  function _getIntermediateToken() internal view virtual override returns (address) {
    return stETH;
  }
}

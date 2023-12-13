// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { IMarket } from "../../f(x)/interfaces/IMarket.sol";
import { IConcentratorCompounder } from "../../interfaces/concentrator/IConcentratorCompounder.sol";
import { IConcentratorHarvesterPool } from "../../interfaces/concentrator/IConcentratorHarvesterPool.sol";

import { LinearRewardDistributor } from "../../common/rewards/distributor/LinearRewardDistributor.sol";
import { ConcentratorHarvesterPoolBase } from "../../concentrator/permissionless/ConcentratorHarvesterPoolBase.sol";

contract MockConcentratorHarvesterPool is ConcentratorHarvesterPoolBase {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  constructor(uint40 _periodLength) LinearRewardDistributor(_periodLength) {}

  function initialize(
    address _compounder,
    address _stakingToken,
    address _treasury,
    address _harvester,
    address _converter,
    address _strategy
  ) external initializer {
    string memory _name = string(abi.encodePacked(IERC20MetadataUpgradeable(_stakingToken).name(), " Harvester"));
    string memory _symbol = string(abi.encodePacked(IERC20MetadataUpgradeable(_stakingToken).symbol(), "-harvester"));

    __Context_init(); // from ContextUpgradeable
    __ERC20_init(_name, _symbol); // from ERC20Upgradeable
    __ERC20Permit_init(_name); // from ERC20PermitUpgradeable
    __ReentrancyGuard_init(); // from ReentrancyGuardUpgradeable
    __ERC165_init(); // from ERC165Upgradeable
    __AccessControl_init(); // from AccessControlUpgradeable

    __ConcentratorBaseV2_init(_treasury, _harvester, _converter); // from ConcentratorBaseV2
    __RewardAccumulator_init(_compounder); // from RewardAccumulator
    __ConcentratorHarvesterPoolBase_init(_stakingToken, _strategy); // from ConcentratorHarvesterPoolBase

    // grant role
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

    // approval
    IERC20Upgradeable(_getIntermediateToken()).safeApprove(_compounder, type(uint256).max);
  }

  function reinitialize() external {
    __ConcentratorHarvesterPoolBase_init(address(0), address(0));
  }

  function reentrant(address _target, bytes calldata _data) external nonReentrant {
    (bool _success, ) = _target.call(_data);
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
  }
}

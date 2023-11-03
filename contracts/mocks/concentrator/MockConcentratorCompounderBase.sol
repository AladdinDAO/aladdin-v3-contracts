// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { LinearRewardDistributor } from "../../common/rewards/distributor/LinearRewardDistributor.sol";
import { ConcentratorCompounderBase } from "../../concentrator/ConcentratorCompounderBase.sol";

contract MockConcentratorCompounderBase is ConcentratorCompounderBase {
  address private immutable token;

  constructor(uint40 period, address _token) LinearRewardDistributor(period) {
    token = _token;
  }

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
    __LinearRewardDistributor_init(token); // from LinearRewardDistributor
    __ConcentratorCompounderBase_init(_strategy); // from ConcentratorCompounderBase

    // access control
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  function reinitialize() external {
    __ConcentratorCompounderBase_init(address(0));
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

  function _getAsset() internal view virtual override returns (address) {
    return token;
  }

  function _getIntermediateToken() internal view virtual override returns (address) {
    return address(0);
  }
}

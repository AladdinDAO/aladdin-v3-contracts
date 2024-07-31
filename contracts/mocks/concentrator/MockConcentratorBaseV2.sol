// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { ConcentratorBaseV2 } from "../../concentrator/ConcentratorBaseV2.sol";

contract MockConcentratorBaseV2 is ConcentratorBaseV2 {
  function initialize(
    address _treasury,
    address _harvester,
    address _converter
  ) external initializer {
    __Context_init();
    __ERC165_init();
    __AccessControl_init();

    __ConcentratorBaseV2_init(_treasury, _harvester, _converter);

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  function reinitialize() external {
    __ConcentratorBaseV2_init(address(0), address(0), address(0));
  }
}

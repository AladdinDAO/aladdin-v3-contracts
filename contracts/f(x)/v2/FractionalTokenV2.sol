// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { ERC20PermitUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/ERC20PermitUpgradeable.sol";

import { IFxFractionalTokenV2 } from "../../interfaces/f(x)/IFxFractionalTokenV2.sol";
import { IFxTreasuryV2 } from "../../interfaces/f(x)/IFxTreasuryV2.sol";

contract FractionalTokenV2 is ERC20PermitUpgradeable, IFxFractionalTokenV2 {
  /*************
   * Constants *
   *************/

  /// @notice The address of Treasury contract.
  address public immutable treasury;

  /// @dev The precision used to compute nav.
  uint256 private constant PRECISION = 1e18;

  /*************
   * Variables *
   *************/

  /*************
   * Modifiers *
   *************/

  modifier onlyTreasury() {
    if (msg.sender != treasury) revert ErrorCallerIsNotTreasury();
    _;
  }

  /***************
   * Constructor *
   ***************/

  constructor(address _treasury) {
    treasury = _treasury;
  }

  function initialize(string memory _name, string memory _symbol) external initializer {
    __Context_init();
    __ERC20_init(_name, _symbol);
    __ERC20Permit_init(_name);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxFractionalTokenV2
  function nav() external view override returns (uint256) {
    uint256 _fSupply = totalSupply();
    if (_fSupply > 0 && IFxTreasuryV2(treasury).isUnderCollateral()) {
      // under collateral
      uint256 baseNav = IFxTreasuryV2(treasury).currentBaseTokenPrice();
      uint256 baseSupply = IFxTreasuryV2(treasury).totalBaseToken();
      return (baseNav * baseSupply) / _fSupply;
    } else {
      return PRECISION;
    }
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxFractionalTokenV2
  function mint(address _to, uint256 _amount) external override onlyTreasury {
    _mint(_to, _amount);
  }

  /// @inheritdoc IFxFractionalTokenV2
  function burn(address _from, uint256 _amount) external override onlyTreasury {
    _burn(_from, _amount);
  }
}

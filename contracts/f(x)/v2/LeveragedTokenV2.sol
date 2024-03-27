// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { ERC20PermitUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { IFxFractionalTokenV2 } from "../../interfaces/f(x)/IFxFractionalTokenV2.sol";
import { IFxLeveragedTokenV2 } from "../../interfaces/f(x)/IFxLeveragedTokenV2.sol";
import { IFxTreasuryV2 } from "../../interfaces/f(x)/IFxTreasuryV2.sol";

contract LeveragedTokenV2 is ERC20PermitUpgradeable, IFxLeveragedTokenV2 {
  /*************
   * Constants *
   *************/

  /// @notice The address of Treasury contract.
  address public immutable treasury;

  /// @notice The address of Fractional Token contract.
  address public immutable fToken;

  /// @dev The precision used to compute nav.
  uint256 private constant PRECISION = 1e18;

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

  constructor(address _treasury, address _fToken) {
    treasury = _treasury;
    fToken = _fToken;
  }

  function initialize(string memory _name, string memory _symbol) external initializer {
    __Context_init();
    __ERC20_init(_name, _symbol);
    __ERC20Permit_init(_name);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxLeveragedTokenV2
  /// @dev The nav may not correct when the oracle price is invalid.
  /// Be sure to check `IFxTreasuryV2(treasury).isBaseTokenPriceValid()` when using the nav.
  function nav() external view override returns (uint256) {
    uint256 _xSupply = totalSupply();
    if (IFxTreasuryV2(treasury).isUnderCollateral()) {
      return 0;
    } else if (_xSupply == 0) {
      return PRECISION;
    } else {
      uint256 baseNav = IFxTreasuryV2(treasury).currentBaseTokenPrice();
      uint256 baseSupply = IFxTreasuryV2(treasury).totalBaseToken();
      uint256 fSupply = IERC20Upgradeable(fToken).totalSupply();
      return (baseNav * baseSupply - fSupply * PRECISION) / _xSupply;
    }
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxLeveragedTokenV2
  function mint(address _to, uint256 _amount) external override onlyTreasury {
    _mint(_to, _amount);
  }

  /// @inheritdoc IFxLeveragedTokenV2
  function burn(address _from, uint256 _amount) external override onlyTreasury {
    _burn(_from, _amount);
  }
}

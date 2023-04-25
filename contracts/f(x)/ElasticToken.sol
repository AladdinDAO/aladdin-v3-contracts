// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import { IElasticToken } from "./interfaces/IElasticToken.sol";

contract ElasticToken is ERC20Upgradeable, IElasticToken {
  using SafeMathUpgradeable for uint256;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the net asset value for the token is updated.
  /// @param oldNav The net asset value before update.
  /// @param newNav The net asset value after update.
  event UpdateNav(uint256 oldNav, uint256 newNav);

  /*************
   * Constants *
   *************/

  /// @dev The precision used to compute nav.
  uint256 private constant PRECISION = 1e18;

  /*************
   * Variables *
   *************/

  /// @notice The address of Treasury contract.
  address public treasury;

  /// @inheritdoc IElasticToken
  uint256 public override nav;

  /*************
   * Modifiers *
   *************/

  modifier onlyTreasury() {
    require(msg.sender == treasury, "Only treasury");
    _;
  }

  /***************
   * Constructor *
   ***************/

  function initialize(
    address _treasury,
    string memory _name,
    string memory _symbol
  ) external initializer {
    ERC20Upgradeable.__ERC20_init(_name, _symbol);

    treasury = _treasury;
    nav = PRECISION;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IElasticToken
  /// @dev Normally `multiple/1e18` should be in the range `(-1, 1e18)`.
  function updateNav(int256 multiple) external override onlyTreasury returns (uint256) {
    if (multiple < 0) {
      require(uint256(-multiple) < PRECISION, "multiple too small");
    } else {
      require(uint256(multiple) < PRECISION * PRECISION, "multiple too large");
    }

    uint256 _oldNav = nav;
    uint256 _newNav = _oldNav.mul(uint256(int256(PRECISION) + multiple)).div(PRECISION);
    nav = _newNav;

    emit UpdateNav(_oldNav, _newNav);

    return _newNav;
  }

  /// @inheritdoc IElasticToken
  function setNav(uint256 _newNav) external override onlyTreasury {
    uint256 _oldNav = nav;
    nav = _newNav;

    emit UpdateNav(_oldNav, _newNav);
  }

  /// @inheritdoc IElasticToken
  function mint(address _to, uint256 _amount) external override onlyTreasury {
    _mint(_to, _amount);
  }

  /// @inheritdoc IElasticToken
  function burn(address _from, uint256 _amount) external override onlyTreasury {
    _burn(_from, _amount);
  }
}

// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";
import { ERC20PermitUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/ERC20PermitUpgradeable.sol";

import { IFxBasePool } from "../../../interfaces/f(x)/omni-vault/IFxBasePool.sol";
import { IFxFractionalToken } from "../../../interfaces/f(x)/omni-vault/IFxFractionalToken.sol";
import { IFxInternalToken } from "../../../interfaces/f(x)/omni-vault/IFxInternalToken.sol";

/// @dev It has the same storage layout with `contracts/f(x)/v2/FractionalTokenV2.sol` contract.
contract FractionalTokenStable is ERC20PermitUpgradeable, AccessControlUpgradeable, IFxFractionalToken {
  /**********
   * Errors *
   **********/

  /// @dev Thrown when caller is not `FxOmniVault` contract.
  error ErrorCallerIsNotVault();

  /*************
   * Constants *
   *************/

  /// @dev The address of `FxOmniVault` contract.
  address private immutable vault;

  /*************
   * Variables *
   *************/

  /// @dev The address of pool contract.
  address private pool;

  /// @dev Slots for future use.
  uint256[49] private _gap;

  /*************
   * Modifiers *
   *************/

  modifier onlyVault() {
    if (_msgSender() != vault) revert ErrorCallerIsNotVault();
    _;
  }

  /***************
   * Constructor *
   ***************/

  constructor(address _vault) {
    vault = _vault;
  }

  function initialize(string memory _name, string memory _symbol) external initializer {
    __Context_init();
    __ERC20_init(_name, _symbol);
    __ERC20Permit_init(_name);
  }

  function initializeV2(address _pool) external reinitializer(2) {
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

    pool = _pool;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxInternalToken
  function getVault() external view returns (address) {
    return vault;
  }

  /// @inheritdoc IFxFractionalToken
  function getPool() external view returns (address) {
    return pool;
  }

  /// @inheritdoc IFxFractionalToken
  function nav() external view returns (uint256) {
    return IFxBasePool(pool).getNetAssetValue(address(this));
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxInternalToken
  function mint(address _to, uint256 _amount) external onlyVault {
    _mint(_to, _amount);
  }

  /// @inheritdoc IFxInternalToken
  function burn(address _from, uint256 _amount) external onlyVault {
    _burn(_from, _amount);
  }
}

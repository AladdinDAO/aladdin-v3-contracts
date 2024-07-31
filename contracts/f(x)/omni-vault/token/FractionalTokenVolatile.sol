// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.7.6;

import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import { IFxBasePool } from "../../../interfaces/f(x)/omni-vault/IFxBasePool.sol";
import { IFxFractionalToken } from "../../../interfaces/f(x)/omni-vault/IFxFractionalToken.sol";
import { IFxInternalToken } from "../../../interfaces/f(x)/omni-vault/IFxInternalToken.sol";

/// @dev It has the same storage layout with `contracts/f(x)/v1/FractionalToken.sol` contract.
contract FractionalTokenVolatile is ERC20Upgradeable, IFxFractionalToken {
  /*************
   * Constants *
   *************/

  /// @dev The address of `FxOmniVault` contract.
  address private immutable vault;

  /*************
   * Variables *
   *************/

  /// @dev deprecated slot, previous used as `treasury` in `contracts/f(x)/v1/FractionalToken.sol`.
  address private __deprecated__treasury;

  /// @dev deprecated slot, previous used as `nav` in `contracts/f(x)/v1/FractionalToken.sol`.
  uint256 private __deprecated__nav;

  /// @dev The address of pool contract.
  address private pool;

  /// @dev Slots for future use.
  uint256[47] private _gap;

  /*************
   * Modifiers *
   *************/

  modifier onlyVault() {
    require(_msgSender() == vault, "caller not vault");
    _;
  }

  /***************
   * Constructor *
   ***************/

  constructor(address _vault) {
    vault = _vault;
  }

  function initialize(string memory _name, string memory _symbol) external initializer {
    ERC20Upgradeable.__ERC20_init(_name, _symbol);
  }

  function initializeV2(address _pool) external {
    require(pool == address(0), "initialized");

    pool = _pool;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxInternalToken
  function getVault() external view override returns (address) {
    return vault;
  }

  /// @inheritdoc IFxFractionalToken
  function getPool() external view override returns (address) {
    return pool;
  }

  /// @inheritdoc IFxFractionalToken
  function nav() external view override returns (uint256) {
    return IFxBasePool(pool).getNetAssetValue(address(this));
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxInternalToken
  function mint(address _to, uint256 _amount) external override onlyVault {
    _mint(_to, _amount);
  }

  /// @inheritdoc IFxInternalToken
  function burn(address _from, uint256 _amount) external override onlyVault {
    _burn(_from, _amount);
  }
}

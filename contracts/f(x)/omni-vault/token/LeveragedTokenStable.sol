// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";
import { ERC20PermitUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/ERC20Upgradeable.sol";

import { IFxBasePool } from "../../../interfaces/f(x)/omni-vault/IFxBasePool.sol";
import { IFxLeveragedToken } from "../../../interfaces/f(x)/omni-vault/IFxLeveragedToken.sol";
import { IFxInternalToken } from "../../../interfaces/f(x)/omni-vault/IFxInternalToken.sol";

/// @dev It has the same storage layout with `contracts/f(x)/v2/LeveragedTokenV2.sol` contract.
contract LeveragedTokenStable is ERC20PermitUpgradeable, AccessControlUpgradeable, IFxLeveragedToken {
  /**********
   * Errors *
   **********/

  /// @dev Thrown when caller is not `FxOmniVault` contract.
  error ErrorCallerIsNotVault();

  /// @dev Thrown when users try to transfer token before cooling-off period.
  error ErrorTransferBeforeCoolingOffPeriod();

  /// @dev Thrown when the updated `coolingOffPeriod` is larger than `MAX_COOLING_OFF_PERIOD`.
  error ErrorCoolingOffPeriodTooLarge();

  /// @dev Thrown when update some parameters to the same value.
  error ErrorParameterUnchanged();

  /*************
   * Constants *
   *************/

  /// @dev The maximum value of `coolingOffPeriod`.
  uint256 private constant MAX_COOLING_OFF_PERIOD = 1 days;

  /// @notice The role for third party minter, such as CoW Swap, 1inch.
  bytes32 public constant THIRD_PARTY_MINTER_ROLE = keccak256("THIRD_PARTY_MINTER_ROLE");

  /// @dev The address of `FxOmniVault` contract.
  address private immutable vault;

  /*************
   * Variables *
   *************/

  /// @notice The minimum hold seconds after minting.
  uint256 public coolingOffPeriod;

  /// @notice Mapping from account address of latest token mint timestamp.
  mapping(address => uint256) public mintAt;

  /// @dev The address of pool contract.
  address private pool;

  /// @dev Slots for future use.
  uint256[47] private _gap;

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

  function initializeV2(uint256 _coolingOffPeriod) external reinitializer(2) {
    _updateCoolingOffPeriod(_coolingOffPeriod);

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  function initializeV3(address _pool) external reinitializer(3) {
    pool = _pool;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxInternalToken
  function getVault() external view returns (address) {
    return vault;
  }

  /// @inheritdoc IFxLeveragedToken
  function getPool() external view returns (address) {
    return pool;
  }

  /// @inheritdoc IFxLeveragedToken
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

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the cooling-off period.
  /// @param _coolingOffPeriod The value of new cooling-off period.
  function updateCoolingOffPeriod(uint256 _coolingOffPeriod) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateCoolingOffPeriod(_coolingOffPeriod);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to update cooling-off period.
  /// @param _newCoolingOffPeriod The value of new cooling-off period.
  function _updateCoolingOffPeriod(uint256 _newCoolingOffPeriod) private {
    if (_newCoolingOffPeriod > MAX_COOLING_OFF_PERIOD) {
      revert ErrorCoolingOffPeriodTooLarge();
    }
    uint256 oldCoolingOffPeriod = coolingOffPeriod;
    if (_newCoolingOffPeriod == oldCoolingOffPeriod) {
      revert ErrorParameterUnchanged();
    }

    coolingOffPeriod = _newCoolingOffPeriod;

    emit UpdateCoolingOffPeriod(oldCoolingOffPeriod, _newCoolingOffPeriod);
  }

  /// @inheritdoc ERC20Upgradeable
  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 /*amount*/
  ) internal virtual override {
    // when mint to third-party minter, we don't add `CoolingOffPeriod` check.
    // when transfer from third-party minter, we apply `mintAt`.
    // otherwise, we do `CoolingOffPeriod` check.
    if (from == address(0)) {
      if (!hasRole(THIRD_PARTY_MINTER_ROLE, to)) {
        mintAt[to] = block.timestamp;
      }
    } else if (hasRole(THIRD_PARTY_MINTER_ROLE, from)) {
      mintAt[to] = block.timestamp;
    } else if (block.timestamp - mintAt[from] < coolingOffPeriod) {
      revert ErrorTransferBeforeCoolingOffPeriod();
    }
  }
}

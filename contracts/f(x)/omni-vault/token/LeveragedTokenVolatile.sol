// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.7.6;

import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";

import { AccessControl } from "../../../common/utils/v7/AccessControl.sol";
import { IFxBasePool } from "../../../interfaces/f(x)/omni-vault/IFxBasePool.sol";
import { IFxLeveragedToken } from "../../../interfaces/f(x)/omni-vault/IFxLeveragedToken.sol";
import { IFxInternalToken } from "../../../interfaces/f(x)/omni-vault/IFxInternalToken.sol";

/// @dev It has the same storage layout with `contracts/f(x)/v1/LeveragedToken.sol` contract.
contract LeveragedTokenVolatile is ERC20Upgradeable, AccessControl, IFxLeveragedToken {
  using SafeMathUpgradeable for uint256;
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

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

  /// @dev deprecated slot, previous used as `treasury` in `contracts/f(x)/v1/LeveragedToken.sol`.
  address private __deprecated__treasury;

  /// @dev deprecated slot, previous used as `fToken` in `contracts/f(x)/v1/LeveragedToken.sol`.
  address private __deprecated__fToken;

  /// @notice The minimum hold seconds after minting.
  uint256 public coolingOffPeriod;

  /// @notice Mapping from account address of latest token mint timestamp.
  mapping(address => uint256) public mintAt;

  /// @dev The address of pool contract.
  address private pool;

  /// @dev Slots for future use.
  uint256[45] private _gap;

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

  function initializeV2(uint256 _coolingOffPeriod, address _pool) external {
    require(pool == address(0), "initialized");

    _updateCoolingOffPeriod(_coolingOffPeriod);
    pool = _pool;

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxInternalToken
  function getVault() external view override returns (address) {
    return vault;
  }

  /// @inheritdoc IFxLeveragedToken
  function getPool() external view override returns (address) {
    return pool;
  }

  /// @inheritdoc IFxLeveragedToken
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
    require(_newCoolingOffPeriod <= MAX_COOLING_OFF_PERIOD, "period too large");
    uint256 oldCoolingOffPeriod = coolingOffPeriod;
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
      revert("transfer before cooling off period");
    }
  }
}

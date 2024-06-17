// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";
import { ERC20PermitUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/ERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { IFxFractionalTokenV2 } from "../../interfaces/f(x)/IFxFractionalTokenV2.sol";
import { IFxLeveragedTokenV2 } from "../../interfaces/f(x)/IFxLeveragedTokenV2.sol";
import { IFxTreasuryV2 } from "../../interfaces/f(x)/IFxTreasuryV2.sol";

contract LeveragedTokenV2 is ERC20PermitUpgradeable, AccessControlUpgradeable, IFxLeveragedTokenV2 {
  /**********
   * Events *
   **********/

  /// @notice Emitted when the cooling-off period is updated.
  /// @param oldValue The value of the previous cooling-off period.
  /// @param newValue The value of the current cooling-off period.
  event UpdateCoolingOffPeriod(uint256 oldValue, uint256 newValue);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when users try to transfer token before cooling-off period.
  error ErrorTransferBeforeCoolingOffPeriod();

  /// @dev Thrown when the updated `coolingOffPeriod` is larger than `MAX_COOLING_OFF_PERIOD`.
  error ErrorCoolingOffPeriodTooLarge();

  /*************
   * Constants *
   *************/

  /// @notice The address of Treasury contract.
  address public immutable treasury;

  /// @notice The address of Fractional Token contract.
  address public immutable fToken;

  /// @dev The precision used to compute nav.
  uint256 private constant PRECISION = 1e18;

  /// @dev The maximum value of `coolingOffPeriod`.
  uint256 private constant MAX_COOLING_OFF_PERIOD = 1 days;

  /// @notice The minimum hold seconds after minting.
  uint256 public coolingOffPeriod;

  /// @notice Mapping from account address of latest token mint timestamp.
  mapping(address => uint256) public mintAt;

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

  function initializeV2(uint256 _coolingOffPeriod) external reinitializer(2) {
    _updateCoolingOffPeriod(_coolingOffPeriod);

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxLeveragedTokenV2
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
    coolingOffPeriod = _newCoolingOffPeriod;

    emit UpdateCoolingOffPeriod(oldCoolingOffPeriod, _newCoolingOffPeriod);
  }

  /// @inheritdoc ERC20Upgradeable
  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 /*amount*/
  ) internal virtual override {
    if (from == address(0)) {
      mintAt[to] = block.timestamp;
    } else if (block.timestamp - mintAt[from] < coolingOffPeriod) {
      revert ErrorTransferBeforeCoolingOffPeriod();
    }
  }
}

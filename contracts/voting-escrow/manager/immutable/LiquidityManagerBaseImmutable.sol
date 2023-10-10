// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Ownable2Step } from "@openzeppelin/contracts-v4/access/Ownable2Step.sol";

import { WordCodec } from "../../../common/codec/WordCodec.sol";

import { ILiquidityManager } from "../../interfaces/ILiquidityManager.sol";

abstract contract LiquidityManagerBaseImmutable is Ownable2Step, ILiquidityManager {
  using WordCodec for bytes32;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when try to kill the manager more than once.
  error AlreadyKilled();

  /// @dev Thrown when the call is not operator.
  error CallerIsNotOperator();

  /*************
   * Constants *
   *************/

  /// @dev The offset of active flag in `_miscData`.
  uint256 private constant ACTIVE_FLAG_OFFSET = 0;

  /// @dev The offset of manager ratio in `_miscData`.
  uint256 private constant MANAGER_RATIO_OFFSET = 1;

  /// @dev The offset of harvester ratio in `_miscData`.
  uint256 private constant HARVESTER_RATIO_OFFSET = 31;

  /// @dev The maximum manager ratio.
  uint256 private constant MAX_MANAGER_RATIO = 5e8; // 20%

  /// @dev The maximum harvester ratio.
  uint256 private constant MAX_HARVESTER_RATIO = 1e8; // 20%

  /// @dev The fee denominator used for rate calculation.
  uint256 internal constant FEE_PRECISION = 1e9;

  /// @notice The address of operator, usually the `LiquidityGauge` contract.
  address public immutable operator;

  /// @notice The address of managed token.
  address public immutable token;

  /*************
   * Variables *
   *************/

  /// @notice Mapping from reward token address to the amount of incentive for manager.
  mapping(address => uint256) public incentive;

  /// @dev `_miscData` is a storage slot that can be used to store unrelated pieces of information.
  /// All LiquidityManagerBase store the *active flag*, *manager ratio* and *harvester ratio*, but
  /// the `miscData`can be extended to store more pieces of information.
  ///
  /// The *active flag* is stored in the first bit, and the *manager ratio* is stored in the next most
  /// significant 30 bits, and the *harvester ratio* is stored in the next most significant 30 bits,
  /// leaving the remaining 195 bits free to store any other information derived pools might need.
  ///
  /// - The *expense ratio* and *harvester ratio* are charged each time when harvester harvest the pool revenue.
  /// - The *withdraw fee percentage* is charged each time when user try to withdraw assets from the pool.
  ///
  /// [ active flag | manager ratio | harvester ratio | available ]
  /// [    1 bit    |    30 bits    |     30 bits     |  195 bits ]
  /// [ MSB                                                   LSB ]
  bytes32 internal _miscData;

  /// @dev reserved slots.
  uint256[46] private __gap;

  /*************
   * Modifiers *
   *************/

  modifier onlyOperator() {
    if (_msgSender() != operator) {
      revert CallerIsNotOperator();
    }
    _;
  }

  /***************
   * Constructor *
   ***************/

  constructor(address _operator, address _token) {
    operator = _operator;
    token = _token;

    // Set active
    _miscData = _miscData.insertBool(true, ACTIVE_FLAG_OFFSET);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc ILiquidityManager
  function isActive() public view override returns (bool) {
    return _miscData.decodeBool(ACTIVE_FLAG_OFFSET);
  }

  /// @inheritdoc ILiquidityManager
  function getManagerRatio() public view override returns (uint256) {
    return _miscData.decodeUint(MANAGER_RATIO_OFFSET, 30);
  }

  /// @inheritdoc ILiquidityManager
  function getHarvesterRatio() public view override returns (uint256) {
    return _miscData.decodeUint(HARVESTER_RATIO_OFFSET, 30);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ILiquidityManager
  function deposit(
    address _receiver,
    uint256 _amount,
    bool _manage
  ) external onlyOperator {
    _deposit(_receiver, _amount, _manage);
  }

  /// @inheritdoc ILiquidityManager
  function withdraw(address _receiver, uint256 _amount) external onlyOperator {
    _withdraw(_receiver, _amount);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @inheritdoc ILiquidityManager
  function execute(
    address _to,
    uint256 _value,
    bytes calldata _data
  ) external payable onlyOwner returns (bool, bytes memory) {
    // solhint-disable-next-line avoid-low-level-calls
    (bool success, bytes memory result) = _to.call{ value: _value }(_data);
    return (success, result);
  }

  /// @notice Kill the liquidity manager and withdraw all token back to operator.
  function kill() external onlyOwner {
    if (!isActive()) {
      revert AlreadyKilled();
    }
    _miscData = _miscData.insertBool(false, ACTIVE_FLAG_OFFSET);

    // Send all funds back to operator
    uint256 _balance = _managedBalance();
    _withdraw(operator, _balance);
  }

  /// @notice Update the fee ratio distributed to treasury.
  /// @param _newRatio The new ratio to update, multipled by 1e9.
  function updateExpenseRatio(uint32 _newRatio) external onlyOwner {
    if (uint256(_newRatio) > MAX_MANAGER_RATIO) {
      revert ManagerRatioTooLarge();
    }

    bytes32 _data = _miscData;
    uint256 _oldRatio = _miscData.decodeUint(MANAGER_RATIO_OFFSET, 30);
    _miscData = _data.insertUint(_newRatio, MANAGER_RATIO_OFFSET, 30);

    emit UpdateManagerRatio(_oldRatio, _newRatio);
  }

  /// @notice Update the fee ratio distributed to harvester.
  /// @param _newRatio The new ratio to update, multipled by 1e9.
  function updateHarvesterRatio(uint32 _newRatio) external onlyOwner {
    if (uint256(_newRatio) > MAX_HARVESTER_RATIO) {
      revert HarvesterRatioTooLarge();
    }

    bytes32 _data = _miscData;
    uint256 _oldRatio = _miscData.decodeUint(HARVESTER_RATIO_OFFSET, 30);
    _miscData = _data.insertUint(_newRatio, HARVESTER_RATIO_OFFSET, 30);

    emit UpdateHarvesterRatio(_oldRatio, _newRatio);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to return all managed tokens.
  function _managedBalance() internal view virtual returns (uint256);

  /// @dev Internal function to deposit token.
  ///
  /// @param _receiver The address of recipient who will receive the share.
  /// @param _amount The amount of token to deposit.
  /// @param _manage Whether to deposit the token to underlying strategy.
  function _deposit(
    address _receiver,
    uint256 _amount,
    bool _manage
  ) internal virtual;

  /// @dev Internal function to withdraw token.
  ///
  /// @param _receiver The address of recipient who will receive the token.
  /// @param _amount The amount of token to withdraw.
  function _withdraw(address _receiver, uint256 _amount) internal virtual;
}

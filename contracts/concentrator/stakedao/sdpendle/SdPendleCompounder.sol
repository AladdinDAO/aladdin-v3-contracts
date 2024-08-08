// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { IConcentratorSdPendleGaugeWrapper } from "../../../interfaces/concentrator/IConcentratorSdPendleGaugeWrapper.sol";
import { ISdPendleCompounder } from "../../../interfaces/concentrator/ISdPendleCompounder.sol";
import { IMultiMerkleStash } from "../../../interfaces/IMultiMerkleStash.sol";

import { WordCodec } from "../../../common/codec/WordCodec.sol";
import { LinearRewardDistributor } from "../../../common/rewards/distributor/LinearRewardDistributor.sol";
import { ConcentratorCompounderBase } from "../../ConcentratorCompounderBase.sol";
import { StakeDAOBribeClaimer } from "../StakeDAOBribeClaimer.sol";
import { SdPendleHelper } from "./SdPendleHelper.sol";

// solhint-disable const-name-snakecase
// solhint-disable no-empty-blocks

contract SdPendleCompounder is ConcentratorCompounderBase, ISdPendleCompounder {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using WordCodec for bytes32;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the booster ratio exceeds `MAX_BOOSTER_RATIO`.
  error ErrorBoosterRatioTooLarge();

  /// @dev Thrown when the bribe token is not sdPENDLE.
  error ErrorInvalidBribeToken();

  /*************
   * Constants *
   *************/

  /// @dev The offset of booster ratio in `_miscData`.
  uint256 private constant BOOSTER_RATIO_OFFSET = 90;

  /// @dev The maximum booster ratio.
  uint256 private constant MAX_BOOSTER_RATIO = 2e8; // 20%

  /// @dev The address of `StakeDAOBribeClaimer` contract.
  address public immutable bribeClaimer;

  /*************
   * Variables *
   *************/

  /// @notice The address of `SdPendleBribeBurner` contract.
  address public bribeBurner;

  /***************
   * Constructor *
   ***************/

  constructor(uint40 _periodLength, address _bribeClaimer) LinearRewardDistributor(_periodLength) {
    bribeClaimer = _bribeClaimer;
  }

  function initialize(
    string memory _name,
    string memory _symbol,
    address _treasury,
    address _harvester,
    address _converter,
    address _strategy,
    address _bribeBurner
  ) external initializer {
    __Context_init(); // from ContextUpgradeable
    __ERC165_init(); // from ERC165Upgradeable
    __AccessControl_init(); // from AccessControlUpgradeable
    __ReentrancyGuard_init(); // from ReentrancyGuardUpgradeable
    __ERC20_init(_name, _symbol); // from ERC20Upgradeable
    __ERC20Permit_init(_name); // from ERC20PermitUpgradeable

    __ConcentratorBaseV2_init(_treasury, _harvester, _converter); // from ConcentratorBaseV2
    __LinearRewardDistributor_init(SdPendleHelper.sdPENDLE); // from LinearRewardDistributor
    __ConcentratorCompounderBase_init(_strategy); // from ConcentratorCompounderBase

    // access control
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

    // approval
    IERC20Upgradeable(SdPendleHelper.PENDLE).safeApprove(SdPendleHelper.DEPOSITOR, type(uint256).max);
    IERC20Upgradeable(SdPendleHelper.PENDLE).safeApprove(SdPendleHelper.CURVE_POOL, type(uint256).max);

    _updateBribeBurner(_bribeBurner);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc ISdPendleCompounder
  function getBoosterRatio() public view returns (uint256) {
    return _miscData.decodeUint(BOOSTER_RATIO_OFFSET, 30);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ISdPendleCompounder
  function depositWithGauge(uint256 _assets, address _receiver) external override returns (uint256 _shares) {
    _distributePendingReward();

    if (_assets == type(uint256).max) {
      _assets = IERC20Upgradeable(SdPendleHelper.SD_PENDLE_GAUGE).balanceOf(_msgSender());
    }
    IERC20Upgradeable(SdPendleHelper.SD_PENDLE_GAUGE).safeTransferFrom(_msgSender(), SdPendleHelper.LOCKER, _assets);

    _shares = _deposit(_assets, _receiver, address(0));
  }

  /// @inheritdoc ISdPendleCompounder
  ///
  /// @dev If the caller wants to deposit all held tokens, use `_assets=type(uint256).max`.
  function depositWithPENDLE(
    uint256 _assets,
    address _receiver,
    uint256 _minShares
  ) external override nonReentrant returns (uint256 _shares) {
    _distributePendingReward();

    address _sender = _msgSender();
    if (_assets == type(uint256).max) {
      _assets = IERC20Upgradeable(SdPendleHelper.PENDLE).balanceOf(_sender);
    }
    IERC20Upgradeable(SdPendleHelper.PENDLE).safeTransferFrom(_sender, address(this), _assets);

    address _strategy = strategy;
    _assets = SdPendleHelper.swapPendleToSdPendle(_assets, _strategy);

    _shares = _deposit(_assets, _receiver, _strategy);
    if (_shares < _minShares) revert InsufficientShares();
  }

  /// @inheritdoc ISdPendleCompounder
  function harvestBribe(IMultiMerkleStash.claimParam memory _claim) external {
    if (_claim.token != SdPendleHelper.sdPENDLE) revert ErrorInvalidBribeToken();

    // claim token to converter, and it will do the rest parts.
    IMultiMerkleStash.claimParam[] memory _claims = new IMultiMerkleStash.claimParam[](1);
    _claims[0] = _claim;
    StakeDAOBribeClaimer(bribeClaimer).claim(_claims, bribeBurner);

    uint256 _amount = _claim.amount;
    uint256 _expenseRatio = getExpenseRatio();
    uint256 _boosterRatio = getBoosterRatio();
    uint256 _performanceFee = (_amount * _expenseRatio) / RATE_PRECISION;
    uint256 _boosterFee = (_amount * _boosterRatio) / RATE_PRECISION;

    emit HarvestBribe(SdPendleHelper.sdPENDLE, _amount, _performanceFee, _boosterFee);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the fee ratio distributed to veSDT booster.
  /// @param _newRatio The new ratio to update, multiplied by 1e9.
  function updateBoosterRatio(uint32 _newRatio) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (uint256(_newRatio) > MAX_BOOSTER_RATIO) {
      revert ErrorBoosterRatioTooLarge();
    }

    bytes32 _data = _miscData;
    uint256 _oldRatio = _miscData.decodeUint(BOOSTER_RATIO_OFFSET, 30);
    _miscData = _data.insertUint(_newRatio, BOOSTER_RATIO_OFFSET, 30);

    emit UpdateBoosterRatio(_oldRatio, _newRatio);
  }

  /// @notice Update the address of bribe burner contract.
  ///
  /// @param _newBurner The address of the new bribe burner contract.
  function updateBribeBurner(address _newBurner) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateBribeBurner(_newBurner);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc ConcentratorCompounderBase
  function _getAsset() internal view virtual override returns (address) {
    return SdPendleHelper.sdPENDLE;
  }

  /// @inheritdoc ConcentratorCompounderBase
  function _getIntermediateToken() internal view virtual override returns (address) {
    return SdPendleHelper.PENDLE;
  }

  /// @dev Internal function to update the address of bribe burner contract.
  ///
  /// @param _newBurner The address of the new bribe burner contract.
  function _updateBribeBurner(address _newBurner) private {
    address _oldBurner = bribeBurner;
    bribeBurner = _newBurner;

    emit UpdateBribeBurner(_oldBurner, _newBurner);
  }
}

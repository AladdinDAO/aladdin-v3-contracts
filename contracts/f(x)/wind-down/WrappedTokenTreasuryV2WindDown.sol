// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;
pragma abicoder v2;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IFxFractionalTokenV2 } from "../../interfaces/f(x)/IFxFractionalTokenV2.sol";
import { IFxLeveragedTokenV2 } from "../../interfaces/f(x)/IFxLeveragedTokenV2.sol";
import { IFxRateProvider } from "../../interfaces/f(x)/IFxRateProvider.sol";
import { IFxTreasuryV2 } from "../../interfaces/f(x)/IFxTreasuryV2.sol";

import { WrappedTokenTreasuryV2 } from "../v2/WrappedTokenTreasuryV2.sol";

contract WrappedTokenTreasuryV2WindDown is WrappedTokenTreasuryV2 {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the treasury enters wind-down mode.
  event InitializeWindDown(
    uint256 baseBalance,
    uint256 fSupply,
    uint256 xSupply,
    uint256 fWeight,
    uint256 xWeight,
    uint256 fBaseBalance,
    uint256 xBaseBalance
  );

  /// @notice Emitted when wind-down mode is finalized.
  event FinalizeWindDown(uint256 baseClaimed, uint256 baseRemaining);

  /// @notice Emitted when finalized residual base token is swept by admin.
  event AdminClaim(address indexed token, uint256 amount);

  /// @notice Emitted when a wind-down redemption happens.
  event WindDownRedeem(
    address indexed caller,
    address indexed owner,
    uint256 fTokenIn,
    uint256 xTokenIn,
    uint256 baseOut,
    uint256 baseClaimed
  );

  /**********
   * Errors *
   **********/

  error ErrorWindDownInitialized();
  error ErrorWindDownNotStarted();
  error ErrorWindDownFinalized();
  error ErrorWindDownUnexpectedBaseBalance();
  error ErrorWindDownUnexpectedFSupply();
  error ErrorWindDownUnexpectedXSupply();
  error ErrorWindDownInvalidWeights();
  error ErrorWindDownInvalidRedeemInput();
  error ErrorWindDownNotAllowed();
  error ErrorWindDownZeroBaseOutput();
  error ErrorWindDownExceedBaseBalance();
  error ErrorWindDownInsufficientBaseToken();
  error ErrorWindDownRateRoundTrip();

  /*********
   * Enums *
   *********/

  enum WindDownStatus {
    WindDownBeforeInit,
    WindDown,
    Finalized
  }

  /*************
   * Variables *
   *************/

  /// @notice Current wind-down status.
  WindDownStatus public windDownStatus;

  /// @notice The fixed amount of actual base token distributable in wind-down.
  uint256 public windDownBaseBalance;

  /// @notice fToken total supply fixed at wind-down initialization.
  uint256 public windDownFSupply;

  /// @notice xToken total supply fixed at wind-down initialization.
  uint256 public windDownXSupply;

  /// @notice fToken distribution weight fixed at wind-down initialization.
  uint256 public windDownFWeight;

  /// @notice xToken distribution weight fixed at wind-down initialization.
  uint256 public windDownXWeight;

  /// @notice Actual base token pool assigned to fToken.
  uint256 public windDownFBaseBalance;

  /// @notice Actual base token pool assigned to xToken.
  uint256 public windDownXBaseBalance;

  /// @notice Actual base token claimed through wind-down redemption.
  uint256 public windDownBaseClaimed;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _baseToken,
    address _fToken,
    address _xToken
  ) WrappedTokenTreasuryV2(_baseToken, _fToken, _xToken) {
    _disableInitializers();
  }

  /// @notice Preview actual base token out in wind-down mode.
  function windDownPreviewRedeem(uint256 _fTokenIn, uint256 _xTokenIn) public view returns (uint256 _baseOut) {
    if (windDownStatus != WindDownStatus.WindDown) revert ErrorWindDownNotStarted();
    if ((_fTokenIn == 0 && _xTokenIn == 0) || (_fTokenIn > 0 && _xTokenIn > 0)) {
      revert ErrorWindDownInvalidRedeemInput();
    }

    if (_fTokenIn > 0) {
      if (windDownFSupply == 0) revert ErrorWindDownInvalidRedeemInput();
      _baseOut = (_fTokenIn * windDownFBaseBalance) / windDownFSupply;
    } else {
      if (windDownXSupply == 0) revert ErrorWindDownInvalidRedeemInput();
      _baseOut = (_xTokenIn * windDownXBaseBalance) / windDownXSupply;
    }
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxTreasuryV2
  function mintFToken(uint256, address) external pure override returns (uint256) {
    revert ErrorWindDownNotAllowed();
  }

  /// @inheritdoc IFxTreasuryV2
  function mintXToken(uint256, address) external pure override returns (uint256) {
    revert ErrorWindDownNotAllowed();
  }

  /// @inheritdoc IFxTreasuryV2
  function redeem(
    uint256 _fTokenIn,
    uint256 _xTokenIn,
    address _owner
  ) external override onlyRole(FX_MARKET_ROLE) returns (uint256 _baseOut) {
    if (windDownStatus == WindDownStatus.Finalized) revert ErrorWindDownFinalized();

    uint256 _baseTokenOut = windDownPreviewRedeem(_fTokenIn, _xTokenIn);
    if (_baseTokenOut == 0) revert ErrorWindDownZeroBaseOutput();

    uint256 _newClaimed = windDownBaseClaimed + _baseTokenOut;
    if (_newClaimed > windDownBaseBalance) revert ErrorWindDownExceedBaseBalance();
    if (IERC20Upgradeable(baseToken).balanceOf(address(this)) < _baseTokenOut) {
      revert ErrorWindDownInsufficientBaseToken();
    }
    windDownBaseClaimed = _newClaimed;

    if (_fTokenIn > 0) {
      IFxFractionalTokenV2(fToken).burn(_owner, _fTokenIn);
    } else {
      IFxLeveragedTokenV2(xToken).burn(_owner, _xTokenIn);
    }

    _baseOut = _getUnderlyingValueRoundUp(_baseTokenOut);
    // Defensive guard: with ezETH rate >= 1 this should round-trip exactly.
    if (getWrapppedValue(_baseOut) != _baseTokenOut) revert ErrorWindDownRateRoundTrip();
    if (_baseOut >= totalBaseToken) totalBaseToken = 0;
    else totalBaseToken = totalBaseToken - _baseOut;

    IERC20Upgradeable(baseToken).safeTransfer(msg.sender, _baseTokenOut);

    emit WindDownRedeem(msg.sender, _owner, _fTokenIn, _xTokenIn, _baseTokenOut, _newClaimed);
  }

  /// @inheritdoc IFxTreasuryV2
  function settle() external pure override {
    revert ErrorWindDownNotAllowed();
  }

  /// @inheritdoc IFxTreasuryV2
  function transferToStrategy(uint256) external pure override {
    revert ErrorWindDownNotAllowed();
  }

  /// @notice Harvest pending rewards to stability pool.
  function harvest() external pure override {
    revert ErrorWindDownNotAllowed();
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @inheritdoc IFxTreasuryV2
  function initializeProtocol(uint256) external pure override returns (uint256, uint256) {
    revert ErrorWindDownNotAllowed();
  }

  /// @notice Initialize irreversible wind-down parameters.
  function initializeWindDown(
    uint256 _expectedBaseBalance,
    uint256 _expectedFSupply,
    uint256 _expectedXSupply,
    uint256 _fWeight,
    uint256 _xWeight
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (windDownStatus != WindDownStatus.WindDownBeforeInit) revert ErrorWindDownInitialized();

    if (IERC20Upgradeable(baseToken).balanceOf(address(this)) != _expectedBaseBalance) {
      revert ErrorWindDownUnexpectedBaseBalance();
    }
    if (IERC20Upgradeable(fToken).totalSupply() != _expectedFSupply) revert ErrorWindDownUnexpectedFSupply();
    if (IERC20Upgradeable(xToken).totalSupply() != _expectedXSupply) revert ErrorWindDownUnexpectedXSupply();
    if (
      _expectedBaseBalance == 0 ||
      _fWeight + _xWeight == 0 ||
      (_expectedFSupply == 0 && _fWeight > 0) ||
      (_expectedXSupply == 0 && _xWeight > 0)
    ) {
      revert ErrorWindDownInvalidWeights();
    }

    uint256 _fBaseBalance;
    if (_xWeight == 0) _fBaseBalance = _expectedBaseBalance;
    else if (_fWeight > 0) _fBaseBalance = (_expectedBaseBalance * _fWeight) / (_fWeight + _xWeight);

    windDownStatus = WindDownStatus.WindDown;
    windDownBaseBalance = _expectedBaseBalance;
    windDownFSupply = _expectedFSupply;
    windDownXSupply = _expectedXSupply;
    windDownFWeight = _fWeight;
    windDownXWeight = _xWeight;
    windDownFBaseBalance = _fBaseBalance;
    windDownXBaseBalance = _expectedBaseBalance - _fBaseBalance;

    emit InitializeWindDown(
      _expectedBaseBalance,
      _expectedFSupply,
      _expectedXSupply,
      _fWeight,
      _xWeight,
      windDownFBaseBalance,
      windDownXBaseBalance
    );
  }

  /// @notice Mark wind-down as finalized after public claiming is closed.
  function finalizeWindDown() external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (windDownStatus != WindDownStatus.WindDown) revert ErrorWindDownNotStarted();
    windDownStatus = WindDownStatus.Finalized;

    emit FinalizeWindDown(windDownBaseClaimed, IERC20Upgradeable(baseToken).balanceOf(address(this)));
  }

  /// @notice Sweep remaining base token after public wind-down redemption is finalized.
  function adminClaim() external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (windDownStatus != WindDownStatus.Finalized) revert ErrorWindDownNotStarted();

    uint256 _balance = IERC20Upgradeable(baseToken).balanceOf(address(this));
    if (_balance != 0) IERC20Upgradeable(baseToken).safeTransfer(_msgSender(), _balance);

    emit AdminClaim(baseToken, _balance);
  }

  /// @notice Change address of strategy contract.
  function updateStrategy(address) external pure override {
    revert ErrorWindDownNotAllowed();
  }

  /// @notice Change address of price oracle contract.
  function updatePriceOracle(address) external pure override {
    revert ErrorWindDownNotAllowed();
  }

  /// @notice Update the base token cap.
  function updateBaseTokenCap(uint256) external pure override {
    revert ErrorWindDownNotAllowed();
  }

  /// @notice Update the EMA sample interval.
  function updateEMASampleInterval(uint24) external pure override {
    revert ErrorWindDownNotAllowed();
  }

  /// @notice Change address of RebalancePoolSplitter contract.
  function updateRebalancePoolSplitter(address) external pure override {
    revert ErrorWindDownNotAllowed();
  }

  /// @notice Change address of rate provider contract.
  function updateRateProvider(address) external pure override {
    revert ErrorWindDownNotAllowed();
  }

  /**********************
   * Internal Functions *
   **********************/

  function _getUnderlyingValueRoundUp(uint256 _amount) internal view returns (uint256) {
    uint256 _rate = IFxRateProvider(rateProvider).getRate();
    return (_amount * _rate + PRECISION - 1) / PRECISION;
  }

}

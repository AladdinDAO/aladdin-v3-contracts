// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { AccessControl } from "@openzeppelin/contracts-v4/access/AccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IFxMarketV2 } from "../../interfaces/f(x)/IFxMarketV2.sol";
import { IFxTreasuryV2 } from "../../interfaces/f(x)/IFxTreasuryV2.sol";
import { IFxUSD } from "../../interfaces/f(x)/IFxUSD.sol";

contract FxInitialFund is AccessControl {
  using SafeERC20 for IERC20;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the status of `fxWithdrawalEnabled` is updated.
  event ToggleFxWithdrawalStatus();

  /**********
   * Errors *
   **********/

  /// @dev Thrown when try to withdraw both fxUSD and xToken.
  error ErrorFxWithdrawalNotEnabled();

  /// @dev Thrown when the amount of base token is not enough.
  error ErrorInsufficientBaseToken();

  /// @dev Thrown when deposit after initialization.
  error ErrorInitialized();

  /// @dev Thrown when withdraw before initialization.
  error ErrorNotInitialized();

  /*************
   * Constants *
   *************/

  /// @notice The role for minter.
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

  /// @notice The address of market contract.
  address public immutable market;

  /// @notice The address of treasury contract.
  address public immutable treasury;

  /// @notice The address of base token.
  address public immutable baseToken;

  /// @notice The address of fToken token.
  address public immutable fToken;

  /// @notice The address of xToken token.
  address public immutable xToken;

  /// @notice The address of fxUSD token.
  address public immutable fxUSD;

  /*************
   * Variables *
   *************/

  /// @notice Mapping from user address to pool shares.
  mapping(address => uint256) public shares;

  /// @notice The total amount of pool shares.
  uint256 public totalShares;

  /// @notice The total amount of fxUSD minted.
  uint256 public totalFToken;

  /// @notice The total amount of xToken minted.
  uint256 public totalXToken;

  /// @notice Whether the pool is initialized.
  bool public initialized;

  /// @notice Whether withdraw both fxUSD and xToken is enabled.
  bool public fxWithdrawalEnabled;

  /***************
   * Constructor *
   ***************/

  constructor(address _market, address _fxUSD) {
    address _treasury = IFxMarketV2(_market).treasury();

    market = _market;
    treasury = _treasury;
    baseToken = IFxTreasuryV2(_treasury).baseToken();
    fToken = IFxTreasuryV2(_treasury).fToken();
    xToken = IFxTreasuryV2(_treasury).xToken();
    fxUSD = _fxUSD;

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit base token to this contract.
  /// @param amount The amount of token to deposit.
  /// @param receiver The address of pool share recipient.
  function deposit(uint256 amount, address receiver) external {
    if (initialized) revert ErrorInitialized();

    IERC20(baseToken).safeTransferFrom(_msgSender(), address(this), amount);
    shares[receiver] += amount;
    totalShares += amount;
  }

  /// @notice Withdraw base token from this contract.
  /// @param receiver The address of base token recipient.
  /// @param minBaseOut The minimum amount of base token should receive.
  /// @return baseOut The amount of base token received.
  function withdrawBaseToken(address receiver, uint256 minBaseOut) external returns (uint256 baseOut) {
    if (!initialized) revert ErrorNotInitialized();

    uint256 _share = shares[_msgSender()];
    shares[_msgSender()] = 0;
    uint256 _totalShares = totalShares;
    uint256 _fAmount = (_share * totalFToken) / _totalShares;
    uint256 _xAmount = (_share * totalXToken) / _totalShares;

    (uint256 _fBaseOut, ) = IFxUSD(fxUSD).redeem(baseToken, _fAmount, receiver, 0);
    // No need to approve xToken to market
    uint256 _xBaseOut = IFxMarketV2(market).redeemXToken(_xAmount, receiver, 0);

    baseOut = _xBaseOut + _fBaseOut;
    if (baseOut < minBaseOut) revert ErrorInsufficientBaseToken();
  }

  /// @notice Withdraw fxUSD and xToken from this contract.
  /// @param receiver The address of token recipient.
  function withdraw(address receiver) external {
    if (!initialized) revert ErrorNotInitialized();
    if (!fxWithdrawalEnabled) revert ErrorFxWithdrawalNotEnabled();

    uint256 _share = shares[_msgSender()];
    shares[_msgSender()] = 0;
    uint256 _totalShares = totalShares;
    uint256 _fAmount = (_share * totalFToken) / _totalShares;
    uint256 _xAmount = (_share * totalXToken) / _totalShares;

    IERC20(fxUSD).safeTransfer(receiver, _fAmount);
    IERC20(xToken).safeTransfer(receiver, _xAmount);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Initialize treasury with base token in this contract.
  function mint() external onlyRole(MINTER_ROLE) {
    if (initialized) revert ErrorInitialized();

    uint256 _balance = IERC20(baseToken).balanceOf(address(this));
    IERC20(baseToken).safeTransfer(treasury, _balance);
    (uint256 _totalFToken, uint256 _totalXToken) = IFxTreasuryV2(treasury).initializeProtocol(
      IFxTreasuryV2(treasury).getUnderlyingValue(_balance)
    );

    IERC20(fToken).safeApprove(fxUSD, _totalFToken);
    IFxUSD(fxUSD).wrap(baseToken, _totalFToken, address(this));

    totalFToken = _totalFToken;
    totalXToken = _totalXToken;
    initialized = true;
  }

  /// @notice Change the status of `fxWithdrawalEnabled`.
  function toggleFxWithdrawalStatus() external onlyRole(DEFAULT_ADMIN_ROLE) {
    fxWithdrawalEnabled = !fxWithdrawalEnabled;

    emit ToggleFxWithdrawalStatus();
  }
}

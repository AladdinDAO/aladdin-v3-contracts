// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/security/ReentrancyGuardUpgradeable.sol";
import { ERC20PermitUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { IFxUSD } from "../../interfaces/f(x)/IFxUSD.sol";
import { IFxShareableRebalancePool } from "../../interfaces/f(x)/IFxShareableRebalancePool.sol";
import { IFxTreasuryV2 } from "../../interfaces/f(x)/IFxTreasuryV2.sol";
import { IFxPriceOracleV2 } from "../../interfaces/f(x)/IFxPriceOracleV2.sol";
import { IStandardizedYield } from "../../interfaces/pendle/IStandardizedYield.sol";

import { FxUSD } from "../../f(x)/v2/FxUSD.sol";
import { ConcentratorBaseV2 } from "../ConcentratorBaseV2.sol";

abstract contract FxUSDStandardizedYieldBase is
  ERC20PermitUpgradeable,
  ReentrancyGuardUpgradeable,
  ConcentratorBaseV2,
  IStandardizedYield
{
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the deposited amount is zero.
  error ErrDepositZeroAmount();

  /// @dev Thrown when the pool has been liquidated and not rebalanced.
  error ErrHasLiquidation();

  /// @dev Thrown when the minted shares are not enough.
  error ErrInsufficientSharesOut();

  /// @dev Thrown when the redeemed tokens are not enough.
  error ErrInsufficientTokensOut();

  /// @dev Thrown the input token in invalid.
  error ErrInvalidTokenIn();

  /// @dev Thrown the output token in invalid.
  error ErrInvalidTokenOut();

  /// @dev Thrown when the redeemed shares is zero.
  error ErrRedeemZeroShares();

  /*************
   * Constants *
   *************/

  /// @dev The exchange rate precision.
  uint256 internal constant PRECISION = 1e18;

  /*************
   * Variables *
   *************/

  /// @inheritdoc IStandardizedYield
  /// @dev This is also the address of FxUSD token.
  address public yieldToken;

  /// @notice The address of rebalance pool.
  address internal pool;

  /// @notice The address of the corresponding base token with the rebalance pool.
  address internal baseToken;

  /// @dev The total amount of yield token deposited
  uint256 internal totalDepositedFxUSD;

  /// @dev reserved slots.
  uint256[46] private __gap;

  /***************
   * Constructor *
   ***************/

  function __FxUSDStandardizedYieldBase_init(
    address _fxUSD,
    address _pool,
    string memory _name,
    string memory _symbol
  ) internal onlyInitializing {
    __ERC20_init(_name, _symbol);
    __ERC20Permit_init(_name);

    yieldToken = _fxUSD;
    pool = _pool;
    baseToken = IFxShareableRebalancePool(_pool).baseToken();
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return whether the pool has been liquidated or not.
  function liquidated() external view returns (bool) {
    return _liquidated();
  }

  /// @inheritdoc IStandardizedYield
  function getTokensIn() public view override returns (address[] memory res) {
    address fxUSD = yieldToken;
    address[] memory markets = IFxUSD(fxUSD).getMarkets();
    res = new address[](markets.length + 1);
    res[0] = fxUSD;
    for (uint256 i = 0; i < markets.length; i++) {
      res[i + 1] = markets[i];
    }
  }

  /// @inheritdoc IStandardizedYield
  function getTokensOut() external view override returns (address[] memory res) {
    res = new address[](2);
    res[0] = yieldToken;
    res[1] = baseToken;
  }

  /// @inheritdoc IStandardizedYield
  function isValidTokenIn(address token) public view override returns (bool) {
    address fxUSD = yieldToken;
    if (token == fxUSD) return true;
    (address _fToken, , , , ) = FxUSD(fxUSD).markets(token);
    return _fToken != address(0);
  }

  /// @inheritdoc IStandardizedYield
  function isValidTokenOut(address token) public view override returns (bool) {
    return token == yieldToken || token == baseToken;
  }

  /// @inheritdoc IStandardizedYield
  /// @dev This function use lots of gas, not recommended to use on chain.
  /// This function won't return correct data when there is a liquidation.
  function previewDeposit(address tokenIn, uint256 amountTokenToDeposit)
    external
    view
    override
    returns (uint256 amountSharesOut)
  {
    if (!isValidTokenIn(tokenIn)) revert ErrInvalidTokenIn();

    address fxUSD = yieldToken;
    uint256 amountFxUSD;
    if (tokenIn == fxUSD) {
      amountFxUSD = amountTokenToDeposit;
    } else {
      (, address _treasury, , , ) = FxUSD(fxUSD).markets(tokenIn);
      address oracle = IFxTreasuryV2(_treasury).priceOracle();
      (, , uint256 price, ) = IFxPriceOracleV2(oracle).getPrice();
      amountTokenToDeposit = IFxTreasuryV2(_treasury).getUnderlyingValue(amountTokenToDeposit);
      amountFxUSD = (amountTokenToDeposit * price) / PRECISION;
    }

    uint256 _totalSupply = totalSupply();
    if (_totalSupply == 0) {
      amountSharesOut = amountFxUSD;
    } else {
      amountSharesOut = (amountFxUSD * _totalSupply) / totalDepositedFxUSD;
    }
  }

  /// @inheritdoc IStandardizedYield
  /// @dev This function use lots of gas, not recommended to use on chain.
  /// This function won't return correct data when there is a liquidation.
  function previewRedeem(address tokenOut, uint256 amountSharesToRedeem)
    external
    view
    override
    returns (uint256 amountTokenOut)
  {
    if (!isValidTokenOut(tokenOut)) revert ErrInvalidTokenOut();

    amountTokenOut = (amountSharesToRedeem * totalDepositedFxUSD) / totalSupply();
    // tokenOut is fxUSD or baseToken
    if (tokenOut != yieldToken) {
      address _treasury = IFxShareableRebalancePool(pool).treasury();
      address oracle = IFxTreasuryV2(_treasury).priceOracle();
      (, , , uint256 price) = IFxPriceOracleV2(oracle).getPrice();
      amountTokenOut = (amountTokenOut * PRECISION) / price;
      amountTokenOut = IFxTreasuryV2(_treasury).getWrapppedValue(amountTokenOut);
    }
  }

  /// @inheritdoc IStandardizedYield
  function assetInfo()
    external
    view
    override
    returns (
      AssetType assetType,
      address assetAddress,
      uint8 assetDecimals
    )
  {
    assetType = AssetType.TOKEN;
    assetAddress = yieldToken;
    assetDecimals = 18;
  }

  /// @inheritdoc IStandardizedYield
  /// @dev The value can be manipulated to increase to any larger value. Lending protocols should use it carefully.
  function exchangeRate() public view override returns (uint256 res) {
    uint256 cachedTotalSupply = totalSupply();
    if (cachedTotalSupply == 0) {
      res = PRECISION;
    } else {
      res = (totalDepositedFxUSD * PRECISION) / cachedTotalSupply;
    }
  }

  /// @inheritdoc IStandardizedYield
  function accruedRewards(
    address /*user*/
  ) external view virtual override returns (uint256[] memory rewardAmounts) {
    rewardAmounts = new uint256[](0);
  }

  /// @inheritdoc IStandardizedYield
  function rewardIndexesCurrent() external virtual override returns (uint256[] memory indexes) {
    indexes = new uint256[](0);
  }

  /// @inheritdoc IStandardizedYield
  function rewardIndexesStored() external view virtual override returns (uint256[] memory indexes) {
    indexes = new uint256[](0);
  }

  /// @inheritdoc IStandardizedYield
  function getRewardTokens() external view virtual override returns (address[] memory rewardTokens) {
    rewardTokens = new address[](0);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IStandardizedYield
  function deposit(
    address receiver,
    address tokenIn,
    uint256 amountTokenToDeposit,
    uint256 minSharesOut
  ) external payable override returns (uint256 amountSharesOut) {
    if (!isValidTokenIn(tokenIn)) revert ErrInvalidTokenIn();
    if (amountTokenToDeposit == 0) revert ErrDepositZeroAmount();
    if (_liquidated()) revert ErrHasLiquidation();

    // we are very sure every token is normal token, so no fot check here.
    IERC20Upgradeable(tokenIn).safeTransferFrom(_msgSender(), address(this), amountTokenToDeposit);

    amountSharesOut = _deposit(tokenIn, amountTokenToDeposit);
    if (amountSharesOut < minSharesOut) revert ErrInsufficientSharesOut();

    _mint(receiver, amountSharesOut);

    emit Deposit(_msgSender(), receiver, tokenIn, amountTokenToDeposit, amountSharesOut);
  }

  /// @inheritdoc IStandardizedYield
  function redeem(
    address receiver,
    uint256 amountSharesToRedeem,
    address tokenOut,
    uint256 minTokenOut,
    bool burnFromInternalBalance
  ) external override returns (uint256 amountTokenOut) {
    if (!isValidTokenOut(tokenOut)) revert ErrInvalidTokenOut();
    if (amountSharesToRedeem == 0) revert ErrRedeemZeroShares();

    if (burnFromInternalBalance) {
      _burn(address(this), amountSharesToRedeem);
    } else {
      _burn(_msgSender(), amountSharesToRedeem);
    }

    amountTokenOut = _redeem(receiver, tokenOut, amountSharesToRedeem);
    if (amountTokenOut < minTokenOut) revert ErrInsufficientTokensOut();

    emit Redeem(_msgSender(), receiver, tokenOut, amountSharesToRedeem, amountTokenOut);
  }

  /// @inheritdoc IStandardizedYield
  function claimRewards(
    address /*user*/
  ) external virtual override returns (uint256[] memory rewardAmounts) {
    rewardAmounts = new uint256[](0);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to do token approval.
  /// @param token The address of token to approve.
  /// @param spender The address of token spender.
  /// @param amount The expected amount of token to approve.
  function _doApprove(
    address token,
    address spender,
    uint256 amount
  ) internal {
    IERC20Upgradeable(token).safeApprove(spender, 0);
    IERC20Upgradeable(token).safeApprove(spender, amount);
  }

  /// @dev Internal function to check whether the deposited FxUSD is liquidated.
  function _liquidated() internal view virtual returns (bool);

  /// @dev mint shares based on the deposited base tokens
  /// @param tokenIn base token address used to mint shares
  /// @param amountDeposited amount of base tokens deposited
  /// @return amountSharesOut amount of shares minted
  function _deposit(address tokenIn, uint256 amountDeposited) internal virtual returns (uint256 amountSharesOut);

  /// @dev redeems base tokens based on amount of shares to be burned
  /// @param tokenOut address of the base token to be redeemed
  /// @param amountSharesToRedeem amount of shares to be burned
  /// @return amountTokenOut amount of base tokens redeemed
  function _redeem(
    address receiver,
    address tokenOut,
    uint256 amountSharesToRedeem
  ) internal virtual returns (uint256 amountTokenOut);
}

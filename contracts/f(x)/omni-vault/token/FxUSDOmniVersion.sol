// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";
import { ERC20PermitUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/utils/structs/EnumerableSetUpgradeable.sol";

import { IFxBasePool } from "../../../interfaces/f(x)/omni-vault/IFxBasePool.sol";
import { IFxFractionalToken } from "../../../interfaces/f(x)/omni-vault/IFxFractionalToken.sol";
import { IFxInternalToken } from "../../../interfaces/f(x)/omni-vault/IFxInternalToken.sol";
import { IFxOmniVault } from "../../../interfaces/f(x)/omni-vault/IFxOmniVault.sol";
import { IFxUSDOmniVersion } from "../../../interfaces/f(x)/omni-vault/IFxUSDOmniVersion.sol";
import { IFxReservePoolV3 } from "../../../interfaces/f(x)/IFxReservePool.sol";
import { IFxShareableRebalancePool } from "../../../interfaces/f(x)/IFxShareableRebalancePool.sol";
import { IFxUSD } from "../../../interfaces/f(x)/IFxUSD.sol";

import { WordCodec } from "../../../common/codec/WordCodec.sol";

/// @dev It has the same storage layout with `contracts/f(x)/v2/FxUSD.sol` contract.
contract FxUSDOmniVersion is AccessControlUpgradeable, ERC20PermitUpgradeable, IFxUSDOmniVersion {
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using WordCodec for bytes32;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the caller is not `FxOmniVault` contract.
  error ErrorCallerIsNotVault();

  /*************
   * Constants *
   *************/

  /// @dev The precision used to compute nav.
  uint256 private constant PRECISION = 1e18;

  /// @dev The offset of supply amount in `fxPoolToSupply`.
  uint256 private constant SUPPLY_AMOUNT_OFFSET = 0;

  /// @dev The offset of supply capacity in `fxPoolToSupply`.
  uint256 private constant SUPPLY_CAPACITY_OFFSET = 128;

  /// @dev The address of `FxOmniVault` contract.
  address private immutable vault;

  /***********
   * Structs *
   ***********/

  /// @param fToken The address of Fractional Token.
  /// @param treasury The address of treasury contract.
  /// @param market The address of market contract.
  /// @param mintCap The maximum amount of fToken can be minted.
  /// @param managed The amount of fToken managed in this contract.
  struct FxMarketStruct {
    address fToken;
    address treasury;
    address market;
    uint256 mintCap;
    uint256 managed;
  }

  /*************
   * Variables *
   *************/

  /// @dev deprecated slot, previous used as `markets` in `contracts/f(x)/v2/FxUSD.sol`.
  mapping(address => FxMarketStruct) private __deprecated_markets;

  /// @dev deprecated slot, previous used as `supportedBaseTokens` in `contracts/f(x)/v2/FxUSD.sol`.
  EnumerableSetUpgradeable.AddressSet private __deprecated_supportedBaseTokens;

  /// @dev deprecated slot, previous used as `supportedRebalancePools` in `contracts/f(x)/v2/FxUSD.sol`.
  EnumerableSetUpgradeable.AddressSet private __deprecated_supportedRebalancePools;

  /// @dev Mapping from base token to default FxPool.
  mapping(address => address) private baseTokenToFxPool;

  /// @dev Mapping from pool address to the amount of fractional tokens supplied by it.
  mapping(address => bytes32) private fxPoolToSupply;

  /*************
   * Modifiers *
   *************/

  modifier onlySupportedRebalancePool(address rebalancePool) {
    address reservePool = IFxOmniVault(vault).getReservePool();
    if (!IFxReservePoolV3(reservePool).isPoolRegistered(address(this), rebalancePool)) {
      revert ErrorUnsupportedRebalancePool();
    }
    _;
  }

  modifier isAboveCollateral() {
    if (isUnderCollateral()) revert ErrorUnderCollateral();
    _;
  }

  /************
   * Modifier *
   ************/

  modifier onlyVault() {
    if (_msgSender() != vault) {
      revert ErrorCallerIsNotVault();
    }
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
    __ERC165_init();
    __AccessControl_init();
    __ERC20_init(_name, _symbol);
    __ERC20Permit_init(_name);

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  function initializeV2() external reinitializer(2) {
    address[] memory pools = IFxOmniVault(vault).getFxUSDPools(address(this));
    for (uint256 i = 0; i < pools.length; ++i) {
      address cachedPool = pools[i];
      address baseToken = IFxBasePool(cachedPool).getBaseToken();
      fxPoolToSupply[pools[i]] = fxPoolToSupply[pools[i]].insertUint(
        __deprecated_markets[baseToken].managed,
        SUPPLY_CAPACITY_OFFSET,
        128
      );
    }
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxUSD
  /// @dev deprecated
  function getMarkets() external view override returns (address[] memory _tokens) {
    uint256 _numMarkets = __deprecated_supportedBaseTokens.length();
    _tokens = new address[](_numMarkets);
    for (uint256 i = 0; i < _numMarkets; ++i) {
      _tokens[i] = __deprecated_supportedBaseTokens.at(i);
    }
  }

  /// @inheritdoc IFxUSD
  function getRebalancePools() external view override returns (address[] memory pools) {
    address reservePool = IFxOmniVault(vault).getReservePool();
    pools = IFxReservePoolV3(reservePool).getPools(address(this));
  }

  /// @inheritdoc IFxUSD
  function nav() external view override returns (uint256 _nav) {
    uint256 _supply = totalSupply();
    if (_supply == 0) return PRECISION;

    address[] memory pools = IFxOmniVault(vault).getFxUSDPools(address(this));
    for (uint256 i = 0; i < pools.length; ++i) {
      address pool = pools[i];
      address fractionalToken = IFxBasePool(pool).getFractionalToken();
      uint256 fractionalTokenNav = IFxBasePool(pool).getNetAssetValue(fractionalToken);
      _nav += fractionalTokenNav * getFxPoolSupply(pool);
    }

    _nav /= _supply;
  }

  /// @inheritdoc IFxUSD
  function isUnderCollateral() public view override returns (bool) {
    address[] memory pools = IFxOmniVault(vault).getFxUSDPools(address(this));
    for (uint256 i = 0; i < pools.length; ++i) {
      address pool = pools[i];
      uint256 collateralRatio = IFxBasePool(pool).getCollateralRatio();
      if (collateralRatio <= PRECISION) return true;
    }
    return false;
  }

  /// @inheritdoc IFxInternalToken
  function getVault() external view override returns (address) {
    return vault;
  }

  /// @inheritdoc IFxUSDOmniVersion
  function getFxPoolSupply(address pool) public view override returns (uint256) {
    return fxPoolToSupply[pool].decodeUint(SUPPLY_AMOUNT_OFFSET, 128);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxUSD
  function wrap(
    address baseToken,
    uint256 amount,
    address receiver
  ) external override isAboveCollateral {
    // @note if `baseToken` is invalid, the following line will revert.
    address fxPool = baseTokenToFxPool[baseToken];
    address fractionalToken = IFxBasePool(fxPool).getFractionalToken();
    IERC20Upgradeable(fractionalToken).safeTransferFrom(_msgSender(), address(this), amount);

    _increaseSupply(fxPool, amount);
    _mint(receiver, amount);
  }

  /// @inheritdoc IFxUSD
  function wrapFrom(
    address rebalancePool,
    uint256 amount,
    address receiver
  ) external override onlySupportedRebalancePool(rebalancePool) isAboveCollateral {
    // we assume `baseToken` is valid, since we have checked `rebalancePool`.
    address baseToken = IFxShareableRebalancePool(rebalancePool).baseToken();
    address fxPool = baseTokenToFxPool[baseToken];
    IFxShareableRebalancePool(rebalancePool).withdrawFrom(_msgSender(), amount, address(this));

    _increaseSupply(fxPool, amount);
    _mint(receiver, amount);
  }

  /// @inheritdoc IFxUSD
  /// @dev We don't check collateral ratio here, since it will be check in `IFxOmniVault(vault).swap`.
  function mint(
    address _baseToken,
    uint256 _amountIn,
    address _receiver,
    uint256 _minOut
  ) external override returns (uint256 _amountOut) {
    address sender = _msgSender();
    IERC20Upgradeable(_baseToken).safeTransferFrom(sender, address(this), _amountIn);

    IFxOmniVault.SingleSwap memory swap;
    swap.pool = baseTokenToFxPool[_baseToken];
    swap.assetIn = _baseToken;
    swap.assetOut = address(this);
    swap.amount = _amountIn;

    IERC20Upgradeable(_baseToken).safeApprove(vault, 0);
    IERC20Upgradeable(_baseToken).safeApprove(vault, _amountIn);
    (_amountOut, ) = IFxOmniVault(vault).swap(_receiver, swap, _minOut, block.timestamp);
  }

  /// @inheritdoc IFxUSD
  function earn(
    address rebalancePool,
    uint256 amount,
    address receiver
  ) external override onlySupportedRebalancePool(rebalancePool) isAboveCollateral {
    address baseToken = IFxShareableRebalancePool(rebalancePool).baseToken();
    address fxPool = baseTokenToFxPool[baseToken];

    _decreaseSupply(fxPool, amount);
    _burn(_msgSender(), amount);

    _depositIntoRebalancePool(IFxBasePool(fxPool).getFractionalToken(), rebalancePool, receiver, amount);
  }

  /// @inheritdoc IFxUSD
  function mintAndEarn(
    address rebalancePool,
    uint256 amountIn,
    address receiver,
    uint256 minOut
  ) external override onlySupportedRebalancePool(rebalancePool) returns (uint256 amountOut) {
    address sender = _msgSender();
    address baseToken = IFxShareableRebalancePool(rebalancePool).baseToken();
    IERC20Upgradeable(baseToken).safeTransferFrom(sender, address(this), amountIn);

    // mint fractional token
    address fxPool = baseTokenToFxPool[baseToken];
    IFxOmniVault.SingleSwap memory swap;
    swap.pool = fxPool;
    swap.assetIn = baseToken;
    swap.assetOut = address(this);
    swap.amount = amountIn;

    IERC20Upgradeable(baseToken).safeApprove(vault, 0);
    IERC20Upgradeable(baseToken).safeApprove(vault, amountIn);
    (amountOut, ) = IFxOmniVault(vault).swap(receiver, swap, minOut, block.timestamp);

    // deposit fractional token to rebalance pool
    _depositIntoRebalancePool(IFxBasePool(fxPool).getFractionalToken(), rebalancePool, receiver, amountOut);
  }

  /// @inheritdoc IFxUSD
  function redeem(
    address _baseToken,
    uint256 _amountIn,
    address _receiver,
    uint256 _minOut
  ) external override returns (uint256 _amountOut, uint256 _bonusOut) {
    address fxPool = baseTokenToFxPool[_baseToken];
    address fractionalToken = IFxBasePool(fxPool).getFractionalToken();

    IFxOmniVault.SingleSwap memory swap;
    swap.pool = fxPool;
    swap.assetIn = fractionalToken;
    swap.assetOut = _baseToken;
    swap.amount = _amountIn;

    uint256 balance = IERC20Upgradeable(fractionalToken).balanceOf(address(this));
    (_amountOut, _bonusOut) = IFxOmniVault(vault).swap(_receiver, swap, _minOut, block.timestamp);
    // the real amount of fractional tokens redeemed
    _amountIn = balance - IERC20Upgradeable(fractionalToken).balanceOf(address(this));

    _burn(_msgSender(), _amountIn);
  }

  /// @inheritdoc IFxUSD
  function redeemFrom(
    address rebalancePool,
    uint256 amountIn,
    address receiver,
    uint256 minOut
  ) external override onlySupportedRebalancePool(rebalancePool) returns (uint256 amountOut, uint256 bonusOut) {
    address baseToken = IFxShareableRebalancePool(rebalancePool).baseToken();
    address fxPool = baseTokenToFxPool[baseToken];
    address fractionalToken = IFxBasePool(fxPool).getFractionalToken();

    // calculate the actual amount of fractional token withdrawn from rebalance pool.
    uint256 balance = IERC20Upgradeable(fractionalToken).balanceOf(address(this));
    IFxShareableRebalancePool(rebalancePool).withdrawFrom(_msgSender(), amountIn, address(this));
    amountIn = IERC20Upgradeable(fractionalToken).balanceOf(address(this)) - balance;

    // increase the supply, will be decreased later in `IFxOmniVault(vault).swap`.
    _increaseSupply(fxPool, amountIn);

    // redeem fractional token as base token, assume all tokens will be redeemed for simplicity
    IFxOmniVault.SingleSwap memory swap;
    swap.pool = fxPool;
    swap.assetIn = fractionalToken;
    swap.assetOut = baseToken;
    swap.amount = amountIn;
    (amountOut, bonusOut) = IFxOmniVault(vault).swap(receiver, swap, minOut, block.timestamp);
  }

  /// @inheritdoc IFxUSD
  function autoRedeem(
    uint256 amountIn,
    address receiver,
    uint256[] memory minOuts
  )
    external
    override
    returns (
      address[] memory baseTokens,
      uint256[] memory amountOuts,
      uint256[] memory bonusOuts
    )
  {
    address[] memory pools = IFxOmniVault(vault).getFxUSDPools(address(this));
    uint256 numPools = pools.length;
    if (minOuts.length != numPools) revert ErrorLengthMismatch();

    baseTokens = new address[](numPools);
    amountOuts = new uint256[](numPools);
    bonusOuts = new uint256[](numPools);
    uint256[] memory supplies = new uint256[](numPools);

    for (uint256 i = 0; i < numPools; i++) {
      baseTokens[i] = IFxBasePool(pools[i]).getBaseToken();
      supplies[i] = getFxPoolSupply(pools[i]);
    }

    uint256 cachedTotalSupply = totalSupply();

    // assume all tokens will be redeemed for simplicity
    _burn(_msgSender(), amountIn);

    if (isUnderCollateral()) {
      // redeem proportionally
      for (uint256 i = 0; i < numPools; i++) {
        amountOuts[i] = (supplies[i] * amountIn) / cachedTotalSupply;
      }
    } else {
      // redeem by sorted fToken amounts
      while (amountIn > 0) {
        unchecked {
          uint256 maxSupply = supplies[0];
          uint256 maxIndex = 0;
          for (uint256 i = 1; i < numPools; i++) {
            if (supplies[i] > maxSupply) {
              maxSupply = supplies[i];
              maxIndex = i;
            }
          }
          if (amountIn > maxSupply) amountOuts[maxIndex] = maxSupply;
          else amountOuts[maxIndex] = amountIn;
          supplies[maxIndex] -= amountOuts[maxIndex];
          amountIn -= amountOuts[maxIndex];
        }
      }
    }

    // construct batch swap step
    uint256 numSwaps;
    unchecked {
      for (uint256 i = 0; i < numPools; i++) {
        if (amountOuts[i] > 0) numSwaps += 1;
      }
    }
    address[] memory assets = new address[](numSwaps * 2);
    int256[] memory deltas = new int256[](numSwaps * 2);
    IFxOmniVault.BatchSwapStep[] memory steps = new IFxOmniVault.BatchSwapStep[](numSwaps);
    {
      IFxOmniVault.BatchSwapStep memory step;
      numSwaps = 0;
      for (uint256 i = 0; i < numPools; ++i) {
        if (amountOuts[i] == 0) continue;
        step = steps[numSwaps];
        step.pool = pools[i];
        step.assetInIndex = numSwaps * 2;
        step.assetOutIndex = numSwaps * 2 + 1;
        step.amount = amountOuts[i];
        numSwaps += 1;

        deltas[numSwaps * 2] = type(int256).max;
        deltas[numSwaps * 2 + 1] = -int256(minOuts[i]);
        assets[numSwaps * 2] = IFxBasePool(pools[i]).getFractionalToken();
        assets[numSwaps * 2 + 1] = baseTokens[i];
      }
    }

    // do batch swap
    uint256[] memory tmpBonusOuts;
    (deltas, tmpBonusOuts) = IFxOmniVault(vault).batchSwap(receiver, steps, assets, deltas, block.timestamp);
    numSwaps = 0;
    for (uint256 i = 0; i < numPools; i++) {
      if (amountOuts[i] > 0) {
        amountOuts[i] = uint256(-deltas[numSwaps * 2 + 1]);
        bonusOuts[i] = tmpBonusOuts[numSwaps];
        numSwaps += 1;
      }
    }
  }

  /// @inheritdoc IFxUSDOmniVersion
  function increaseSupply(address pool, uint256 amount) external onlyVault {
    _increaseSupply(pool, amount);
  }

  /// @inheritdoc IFxUSDOmniVersion
  function decreaseSupply(address pool, uint256 amount) external onlyVault {
    _decreaseSupply(pool, amount);
  }

  /// @inheritdoc IFxInternalToken
  function mint(address to, uint256 amount) external onlyVault {
    _mint(to, amount);
  }

  /// @inheritdoc IFxInternalToken
  function burn(address from, uint256 amount) external onlyVault {
    _burn(from, amount);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the mint capacity of the fx pool.
  /// @param pool The address of fx pool.
  /// @param newCapacity The value of current mint capacity.
  function updateSupplyCapacity(address pool, uint128 newCapacity) external onlyRole(DEFAULT_ADMIN_ROLE) {
    bytes32 cachedSupply = fxPoolToSupply[pool];
    uint256 oldCapacity = cachedSupply.decodeUint(SUPPLY_CAPACITY_OFFSET, 128);
    fxPoolToSupply[pool] = cachedSupply.insertUint(newCapacity, SUPPLY_CAPACITY_OFFSET, 128);

    emit UpdateMintCap(pool, oldCapacity, newCapacity);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to deposit fToken to rebalance pool.
  /// @param fractionalToken the address of fractional token.
  /// @param rebalancePool The address of rebalance pool.
  /// @param receiver The address of rebalance pool share recipient.
  /// @param amount The amount of fToken to deposit.
  function _depositIntoRebalancePool(
    address fractionalToken,
    address rebalancePool,
    address receiver,
    uint256 amount
  ) internal {
    IERC20Upgradeable(fractionalToken).safeApprove(rebalancePool, 0);
    IERC20Upgradeable(fractionalToken).safeApprove(rebalancePool, amount);
    IFxShareableRebalancePool(rebalancePool).deposit(amount, receiver);
  }

  function _increaseSupply(address pool, uint256 amount) internal {
    emit IncreasePoolSupply(pool, amount);

    bytes32 cachedSupply = fxPoolToSupply[pool];
    amount += cachedSupply.decodeUint(SUPPLY_AMOUNT_OFFSET, 128);
    fxPoolToSupply[pool] = cachedSupply.insertUint(amount, SUPPLY_AMOUNT_OFFSET, 128);
  }

  function _decreaseSupply(address pool, uint256 amount) internal {
    emit DecreasePoolSupply(pool, amount);

    bytes32 cachedSupply = fxPoolToSupply[pool];
    amount = cachedSupply.decodeUint(SUPPLY_AMOUNT_OFFSET, 128) - amount;
    fxPoolToSupply[pool] = cachedSupply.insertUint(amount, SUPPLY_AMOUNT_OFFSET, 128);
  }
}

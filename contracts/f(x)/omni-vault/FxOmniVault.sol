// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/utils/structs/EnumerableSetUpgradeable.sol";

import { IFxBasePool } from "../../interfaces/f(x)/omni-vault/IFxBasePool.sol";
import { IFxInternalToken } from "../../interfaces/f(x)/omni-vault/IFxInternalToken.sol";
import { IFxOmniVault } from "../../interfaces/f(x)/omni-vault/IFxOmniVault.sol";
import { IFxUSDOmniVersion } from "../../interfaces/f(x)/omni-vault/IFxUSDOmniVersion.sol";
import { IFxRebalancePoolSplitter } from "../../interfaces/f(x)/IFxRebalancePoolSplitter.sol";
import { IFxReservePoolV3 } from "../../interfaces/f(x)/IFxReservePool.sol";

import { FlashLoans } from "./FlashLoans.sol";
import { FxUSDHelpers } from "./FxUSDHelpers.sol";
import { PoolHarvester } from "./PoolHarvester.sol";

/// @dev This is inspired from Balancer V2: https://github.com/balancer/balancer-v2-monorepo/blob/master/pkg/vault/contracts/Vault.sol
contract FxOmniVault is PoolHarvester, FlashLoans, FxUSDHelpers {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

  /*************
   * Constants *
   *************/

  /***********
   * Structs *
   ***********/

  struct SwapRequest {
    IERC20Upgradeable tokenIn;
    IERC20Upgradeable tokenOut;
    uint256 amount;
    // Misc data
    address pool;
    address from;
    address to;
    bytes userData;
  }

  /*************
   * Variables *
   *************/

  /// @notice The address of reserve pool contract.
  address private reservePool;

  /*************
   * Modifiers *
   *************/

  modifier notExpired(uint256 deadline) {
    if (block.timestamp > deadline) revert();
    _;
  }

  /***************
   * Constructor *
   ***************/

  function initialize(
    uint256 _expenseRatio,
    uint256 _harvesterRatio,
    uint256 _flashLoanFeeRatio,
    address _platform,
    address _reservePool
  ) external initializer {
    __FeeManagement_init(_expenseRatio, _harvesterRatio, _flashLoanFeeRatio, _platform);
    __PoolManagers_init();
    __PoolBalances_init();
    __PoolHarvester_init();
    __FlashLoans_init();

    _updateReservePool(_reservePool);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxOmniVault
  function getReservePool() external view returns (address) {
    return reservePool;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxOmniVault
  function joinPool(
    address pool,
    address recipient,
    bytes calldata userData,
    uint256 deadline
  ) external notExpired(deadline) onlyValidPool(pool) returns (uint256[] memory amountsOut) {
    address sender = _msgSender();
    uint256 amountIn;
    uint256 dueProtocolFeeAmount;
    // currently we only support pool initial, so make `balances` empty
    (amountIn, amountsOut, dueProtocolFeeAmount, ) = IFxBasePool(pool).onPoolMint(
      sender,
      recipient,
      new uint256[](3),
      userData
    );

    unchecked {
      _accumulatePoolFee(pool, dueProtocolFeeAmount);
      _changeBaseBalance(pool, int256(amountIn - dueProtocolFeeAmount));
      _changeFractionalSupply(pool, int256(amountsOut[0]));
      _changeLeveragedSupply(pool, int256(amountsOut[1]));
    }

    _transferTokenIn(IFxBasePool(pool).getBaseToken(), sender, amountIn);
    _transferTokenOut(IFxBasePool(pool).getFractionalToken(), recipient, amountsOut[0]);
    _transferTokenOut(IFxBasePool(pool).getLeveragedToken(), recipient, amountsOut[1]);
  }

  /// @inheritdoc IFxOmniVault
  function swap(
    address recipient,
    SingleSwap memory singleSwap,
    uint256 minOut,
    uint256 deadline
  ) external notExpired(deadline) nonReentrant returns (uint256 amountOut, uint256 bonus) {
    if (singleSwap.amount == 0) revert();
    if (singleSwap.assetIn == singleSwap.assetOut) revert();
    if (singleSwap.assetIn == address(0)) revert();
    if (singleSwap.assetOut == address(0)) revert();
    address sender = _msgSender();

    SwapRequest memory request;
    request.pool = singleSwap.pool;
    request.tokenIn = IERC20Upgradeable(singleSwap.assetIn);
    request.tokenOut = IERC20Upgradeable(singleSwap.assetOut);
    request.amount = singleSwap.amount;
    request.userData = singleSwap.userData;
    request.from = sender;
    request.to = recipient;

    uint256 amountIn;
    (amountIn, amountOut, bonus) = _swapWithPool(request);
    if (amountOut < minOut) revert();

    _transferTokenIn(singleSwap.assetIn, sender, amountIn);
    _transferTokenOut(singleSwap.assetOut, recipient, amountOut);

    _clearAllPriceAndRateCache();
  }

  /// @inheritdoc IFxOmniVault
  function batchSwap(
    address recipient,
    BatchSwapStep[] memory swaps,
    address[] memory assets,
    int256[] memory limits,
    uint256 deadline
  ) external notExpired(deadline) nonReentrant returns (int256[] memory deltas, uint256[] memory bonusAmounts) {
    if (block.timestamp > deadline) revert();
    if (assets.length != limits.length) revert();
    address sender = _msgSender();

    // Perform the swaps, updating the Pool token balances and computing the net Vault asset deltas.
    (deltas, bonusAmounts) = _swapWithPools(sender, recipient, swaps, assets);

    // Process asset deltas, by either transferring assets from the sender (for positive deltas) or to the recipient
    // (for negative deltas).
    for (uint256 i = 0; i < assets.length; ++i) {
      address asset = assets[i];
      int256 delta = deltas[i];
      if (deltas[i] > limits[i]) revert();

      if (delta > 0) {
        _transferTokenIn(asset, sender, uint256(delta));
        // _receiveAsset(asset, toReceive, funds.sender, funds.fromInternalBalance);
      } else if (delta < 0) {
        _transferTokenOut(asset, recipient, uint256(-delta));
      }
    }

    _clearAllPriceAndRateCache();
  }

  /// @inheritdoc IFxOmniVault
  /// @dev This function is not marked as `nonReentrant` because the underlying mechanism relies on reentrancy
  function queryBatchSwap(BatchSwapStep[] memory swaps, address[] memory assets)
    external
    override
    returns (int256[] memory deltas)
  {
    // In order to accurately 'simulate' swaps, this function actually does perform the swaps, including calling the
    // Pool hooks and updating balances in storage. However, once it computes the final Vault Deltas, it
    // reverts unconditionally, returning this array as the revert data.
    //
    // By wrapping this reverting call, we can decode the deltas 'returned' and return them as a normal Solidity
    // function would. The only caveat is the function becomes non-view, but off-chain clients can still call it
    // via eth_call to get the expected result.
    //
    // This technique was inspired by the work from the Gnosis team in the Gnosis Safe contract:
    // https://github.com/gnosis/safe-contracts/blob/v1.2.0/contracts/GnosisSafe.sol#L265
    //
    // Most of this function is implemented using inline assembly, as the actual work it needs to do is not
    // significant, and Solidity is not particularly well-suited to generate this behavior, resulting in a large
    // amount of generated bytecode.

    if (msg.sender != address(this)) {
      // We perform an external call to ourselves, forwarding the same calldata. In this call, the else clause of
      // the preceding if statement will be executed instead.

      // solhint-disable-next-line avoid-low-level-calls
      (bool success, ) = address(this).call(msg.data);

      // solhint-disable-next-line no-inline-assembly
      assembly {
        // This call should always revert to decode the actual asset deltas from the revert reason
        switch success
        case 0 {
          // Note we are manually writing the memory slot 0. We can safely overwrite whatever is
          // stored there as we take full control of the execution and then immediately return.

          // We copy the first 4 bytes to check if it matches with the expected signature, otherwise
          // there was another revert reason and we should forward it.
          returndatacopy(0, 0, 0x04)
          let error := and(mload(0), 0xffffffff00000000000000000000000000000000000000000000000000000000)

          // If the first 4 bytes don't match with the expected signature, we forward the revert reason.
          if eq(eq(error, 0xfa61cc1200000000000000000000000000000000000000000000000000000000), 0) {
            returndatacopy(0, 0, returndatasize())
            revert(0, returndatasize())
          }

          // The returndata contains the signature, followed by the raw memory representation of an array:
          // length + data. We need to return an ABI-encoded representation of this array.
          // An ABI-encoded array contains an additional field when compared to its raw memory
          // representation: an offset to the location of the length. The offset itself is 32 bytes long,
          // so the smallest value we  can use is 32 for the data to be located immediately after it.
          mstore(0, 32)

          // We now copy the raw memory array from returndata into memory. Since the offset takes up 32
          // bytes, we start copying at address 0x20. We also get rid of the error signature, which takes
          // the first four bytes of returndata.
          let size := sub(returndatasize(), 0x04)
          returndatacopy(0x20, 0x04, size)

          // We finally return the ABI-encoded array, which has a total length equal to that of the array
          // (returndata), plus the 32 bytes for the offset.
          return(0, add(size, 32))
        }
        default {
          // This call should always revert, but we fail nonetheless if that didn't happen
          invalid()
        }
      }
    } else {
      (deltas, ) = _swapWithPools(address(0), address(0), swaps, assets);

      // solhint-disable-next-line no-inline-assembly
      assembly {
        // We will return a raw representation of the array in memory, which is composed of a 32 byte length,
        // followed by the 32 byte int256 values. Because revert expects a size in bytes, we multiply the array
        // length (stored at `deltas`) by 32.
        let size := mul(mload(deltas), 32)

        // We send one extra value for the error signature "QueryError(int256[])" which is 0xfa61cc12.
        // We store it in the previous slot to the `deltas` array. We know there will be at least one available
        // slot due to how the memory scratch space works.
        // We can safely overwrite whatever is stored in this slot as we will revert immediately after that.
        mstore(sub(deltas, 0x20), 0x00000000000000000000000000000000000000000000000000000000fa61cc12)
        let start := sub(deltas, 0x04)

        // When copying from `deltas` into returndata, we copy an additional 36 bytes to also return the array's
        // length and the error signature.
        revert(start, add(size, 36))
      }
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Change address of reserve pool contract.
  /// @param _newReservePool The new address of reserve pool contract.
  function updateReservePool(address _newReservePool) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateReservePool(_newReservePool);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to change the address of reserve pool contract.
  /// @param newReservePool The new address of reserve pool contract.
  function _updateReservePool(address newReservePool) private {
    if (newReservePool == address(0)) revert ErrorZeroAddress();

    address oldReservePool = reservePool;
    reservePool = newReservePool;

    emit UpdateReservePool(oldReservePool, newReservePool);
  }

  /// we add some fxUSD logic here to save some gas, though it will make the code a little more complicated.
  function _swapWithPool(SwapRequest memory request)
    private
    onlyValidPool(request.pool)
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 bonus
    )
  {
    // since the price and rate for each pool won't change during the call in this contract, it is safe to
    // cache the price and rate before each swap and clear them all together right before leaving this contract.
    _cachePriceAndRateForPool(request.pool);

    address baseToken = IFxBasePool(request.pool).getBaseToken();
    address fractionalToken = IFxBasePool(request.pool).getFractionalToken();
    address leveragedToken = IFxBasePool(request.pool).getLeveragedToken();
    address tokenIn = address(request.tokenIn);
    address tokenOut = address(request.tokenOut);

    if (tokenIn == leveragedToken || tokenOut == leveragedToken) {
      // baseToken to leveragedToken, mint
      // leveragedToken to baseToken, redeem
      if (tokenIn == baseToken && tokenOut == leveragedToken) {
        (amountIn, amountOut, bonus) = _processLeveragedTokenMint(request);
      } else if (tokenIn == leveragedToken && tokenOut == baseToken) {
        (amountIn, amountOut) = _processLeveragedTokenRedeem(request);
      } else {
        revert();
      }
    } else {
      address fxUSD = IFxBasePool(request.pool).getFxUSD();
      if (fxUSD != address(0)) {
        (amountIn, amountOut, bonus) = _swapWithPoolFxUSD(fxUSD, request, baseToken, fractionalToken);
      } else {
        // baseToken to fractionalToken, mint
        // fractionalToken to baseToken, redeem
        if (tokenIn == baseToken && tokenOut == fractionalToken) {
          (amountIn, amountOut) = _processFractionalTokenMint(request);
        } else if (tokenIn == fractionalToken && tokenOut == baseToken) {
          (amountIn, amountOut, bonus) = _processFractionalTokenRedeem(request);
        } else {
          revert();
        }
      }
    }
  }

  function _swapWithPools(
    address sender,
    address recipient,
    BatchSwapStep[] memory swaps,
    address[] memory assets
  ) private returns (int256[] memory assetDeltas, uint256[] memory bonusAmounts) {
    assetDeltas = new int256[](assets.length);
    bonusAmounts = new uint256[](swaps.length);

    // These variables could be declared inside the loop, but that causes the compiler to allocate memory on each
    // loop iteration, increasing gas costs.
    BatchSwapStep memory step;
    SwapRequest memory request;

    // These store data about the previous swap here to implement multihop logic across swaps.
    address previousTokenOut;
    uint256 previousAmountOut;

    for (uint256 i = 0; i < swaps.length; ++i) {
      step = swaps[i];
      if (step.assetInIndex >= assets.length || step.assetOutIndex >= assets.length) revert();

      address tokenIn = assets[step.assetInIndex];
      address tokenOut = assets[step.assetOutIndex];
      if (tokenIn == tokenOut) revert();

      // Sentinel value for multihop logic
      if (step.amount == 0) {
        // When the amount given is zero, we use the calculated amount for the previous swap, as long as the
        // current swap's given token is the previous calculated token. This makes it possible to swap a
        // given amount of token A for token B, and then use the resulting token B amount to swap for token C.
        if (i == 0) revert();
        if (tokenIn != previousTokenOut) revert();
        step.amount = previousAmountOut;
      }

      // Initializing each struct field one-by-one uses less gas than setting all at once
      request.pool = step.pool;
      request.tokenIn = IERC20Upgradeable(tokenIn);
      request.tokenOut = IERC20Upgradeable(tokenOut);
      request.amount = step.amount;
      request.userData = step.userData;
      request.from = sender;
      request.to = recipient;

      uint256 amountIn;
      (amountIn, previousAmountOut, bonusAmounts[i]) = _swapWithPool(request);

      // Accumulate Vault deltas across swaps
      assetDeltas[step.assetInIndex] += int256(amountIn);
      assetDeltas[step.assetOutIndex] -= int256(previousAmountOut);
    }
  }

  function _swapWithPoolFxUSD(
    address fxUSD,
    SwapRequest memory request,
    address baseToken,
    address fractionalToken
  )
    private
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 bonus
    )
  {
    _cachePriceAndRateForFxUSD(fxUSD);

    address tokenIn = address(request.tokenIn);
    address tokenOut = address(request.tokenOut);
    if (tokenIn == baseToken && tokenOut == fxUSD) {
      // check under collateral and pool in stability mode
      _checkFxUSDStatus(fxUSD, request.pool);

      (amountIn, amountOut) = _processFractionalTokenMint(request);

      // increase pool supply and mint fractional token first, actual fxUSD.mint is done at last.
      IFxUSDOmniVersion(fxUSD).increaseSupply(request.pool, amountOut);
      IFxInternalToken(fractionalToken).mint(fxUSD, amountIn);
    } else if ((tokenIn == fxUSD || (tokenIn == fractionalToken && fxUSD == _msgSender())) && tokenOut == baseToken) {
      // we also allow fxUSD to redeem from fractional token
      // check under collateral
      _checkFxUSDStatus(fxUSD, address(0));

      (amountIn, amountOut, bonus) = _processFractionalTokenRedeem(request);

      // decrease pool supply and burn fractional token first, actual fxUSD.burn is done at last.
      // @note if `tokenIn` is fractional token, the actual fxUSD.burn is done in FxUSD contract.
      IFxUSDOmniVersion(fxUSD).decreaseSupply(request.pool, amountIn);

      // if `tokenIn` is fractional token, we do it later.
      if (tokenIn != fractionalToken) {
        IFxInternalToken(fractionalToken).burn(fxUSD, amountIn);
      }
    } else {
      revert();
    }
  }

  function _processFractionalTokenMint(SwapRequest memory request)
    private
    returns (uint256 amountIn, uint256 amountOut)
  {
    address pool = request.pool;
    uint256[] memory balances = getPoolBalances(pool);
    uint256 dueProtocolFeeAmount;
    (amountIn, amountOut, dueProtocolFeeAmount, ) = IFxBasePool(pool).onPoolSwap(
      request.from,
      request.to,
      balances,
      request.amount,
      0,
      1,
      request.userData
    );
    unchecked {
      _accumulatePoolFee(pool, dueProtocolFeeAmount);
      _changeBaseBalance(pool, int256(amountIn - dueProtocolFeeAmount));
      _changeFractionalSupply(pool, int256(amountOut));
    }
  }

  function _processLeveragedTokenMint(SwapRequest memory request)
    private
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 bonus
    )
  {
    address pool = request.pool;
    uint256[] memory balances = getPoolBalances(pool);
    uint256 dueProtocolFeeAmount;
    (amountIn, amountOut, dueProtocolFeeAmount, bonus) = IFxBasePool(pool).onPoolSwap(
      request.from,
      request.to,
      balances,
      request.amount,
      0,
      2,
      request.userData
    );
    if (bonus > 0) {
      bonus = IFxReservePoolV3(reservePool).requestBonus(pool, request.to, bonus);
    }
    unchecked {
      _accumulatePoolFee(pool, dueProtocolFeeAmount);
      _changeBaseBalance(pool, int256(amountIn - dueProtocolFeeAmount));
      _changeLeveragedSupply(pool, int256(amountOut));
    }
  }

  function _processFractionalTokenRedeem(SwapRequest memory request)
    private
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 bonus
    )
  {
    address pool = request.pool;
    uint256[] memory balances = getPoolBalances(pool);
    uint256 dueProtocolFeeAmount;
    (amountIn, amountOut, dueProtocolFeeAmount, bonus) = IFxBasePool(pool).onPoolSwap(
      request.from,
      request.to,
      balances,
      request.amount,
      1,
      0,
      request.userData
    );
    if (bonus > 0) {
      bonus = IFxReservePoolV3(reservePool).requestBonus(pool, request.to, bonus);
    }

    unchecked {
      _accumulatePoolFee(pool, dueProtocolFeeAmount);
      _changeBaseBalance(pool, -int256(amountOut + dueProtocolFeeAmount));
      _changeFractionalSupply(pool, int256(amountIn));
    }
  }

  function _processLeveragedTokenRedeem(SwapRequest memory request)
    private
    returns (uint256 amountIn, uint256 amountOut)
  {
    address pool = request.pool;
    uint256[] memory balances = getPoolBalances(pool);
    uint256 dueProtocolFeeAmount;
    (amountIn, amountOut, dueProtocolFeeAmount, ) = IFxBasePool(pool).onPoolSwap(
      request.from,
      request.to,
      balances,
      request.amount,
      2,
      0,
      request.userData
    );

    unchecked {
      _accumulatePoolFee(pool, dueProtocolFeeAmount);
      _changeBaseBalance(pool, -int256(amountOut + dueProtocolFeeAmount));
      _changeLeveragedSupply(pool, -int256(amountIn));
    }
  }
}

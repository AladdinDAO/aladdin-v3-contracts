// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";
import { ERC20PermitUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/utils/structs/EnumerableSetUpgradeable.sol";

import { IFxFractionalTokenV2 } from "../../interfaces/f(x)/IFxFractionalTokenV2.sol";
import { IFxMarketV2 } from "../../interfaces/f(x)/IFxMarketV2.sol";
import { IFxTreasuryV2 } from "../../interfaces/f(x)/IFxTreasuryV2.sol";
import { IFxUSD } from "../../interfaces/f(x)/IFxUSD.sol";
import { IFxShareableRebalancePool } from "../../interfaces/f(x)/IFxShareableRebalancePool.sol";

contract FxUSD is AccessControlUpgradeable, ERC20PermitUpgradeable, IFxUSD {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

  /*************
   * Constants *
   *************/

  /// @dev The precision used to compute nav.
  uint256 private constant PRECISION = 1e18;

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

  /// @notice Mapping from base token address to metadata.
  mapping(address => FxMarketStruct) public markets;

  /// @dev The list of supported base tokens.
  EnumerableSetUpgradeable.AddressSet private supportedTokens;

  /// @dev The list of supported rebalance pools.
  EnumerableSetUpgradeable.AddressSet private supportedPools;

  /*************
   * Modifiers *
   *************/

  modifier onlySupportedMarket(address _baseToken) {
    _checkBaseToken(_baseToken);
    _;
  }

  modifier onlySupportedPool(address _pool) {
    if (!supportedPools.contains(_pool)) revert ErrorUnsupportedRebalancePool();
    _;
  }

  modifier onlyMintableMarket(address _baseToken, bool isMint) {
    _checkMarketMintable(_baseToken, isMint);
    _;
  }

  /***************
   * Constructor *
   ***************/

  function initialize(string memory _name, string memory _symbol) external initializer {
    __Context_init();
    __ERC165_init();
    __AccessControl_init();
    __ERC20_init(_name, _symbol);
    __ERC20Permit_init(_name);

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxUSD
  function getMarkets() external view override returns (address[] memory _tokens) {
    uint256 _numMarkets = supportedTokens.length();
    _tokens = new address[](_numMarkets);
    for (uint256 i = 0; i < _numMarkets; ++i) {
      _tokens[i] = supportedTokens.at(i);
    }
  }

  /// @inheritdoc IFxUSD
  function getRebalancePools() external view override returns (address[] memory _pools) {
    uint256 _numPools = supportedPools.length();
    _pools = new address[](_numPools);
    for (uint256 i = 0; i < _numPools; ++i) {
      _pools[i] = supportedPools.at(i);
    }
  }

  /// @inheritdoc IFxUSD
  function nav() external view override returns (uint256 _nav) {
    uint256 _numMarkets = supportedTokens.length();
    uint256 _supply = totalSupply();
    if (_supply == 0) return PRECISION;

    for (uint256 i = 0; i < _numMarkets; i++) {
      address _baseToken = supportedTokens.at(i);
      address _fToken = markets[_baseToken].fToken;
      uint256 _fnav = IFxFractionalTokenV2(_fToken).nav();
      _nav += _fnav * markets[_baseToken].managed;
    }
    _nav /= _supply;
  }

  /// @inheritdoc IFxUSD
  function isUnderCollateral() public view override returns (bool) {
    return isUnderCollateral(IFxTreasuryV2.Action.None);
  }

  /// @inheritdoc IFxUSD
  function isUnderCollateral(IFxTreasuryV2.Action action) public view override returns (bool) {
    uint256 _numMarkets = supportedTokens.length();
    for (uint256 i = 0; i < _numMarkets; i++) {
      address _baseToken = supportedTokens.at(i);
      address _treasury = markets[_baseToken].treasury;
      if (IFxTreasuryV2(_treasury).isUnderCollateral(action)) return true;
    }
    return false;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxUSD
  function wrap(
    address _baseToken,
    uint256 _amount,
    address _receiver
  ) external override onlySupportedMarket(_baseToken) onlyMintableMarket(_baseToken, false) {
    // we just wrap, use `Action.None`
    if (isUnderCollateral()) revert ErrorUnderCollateral();

    address _fToken = markets[_baseToken].fToken;
    IERC20Upgradeable(_fToken).safeTransferFrom(_msgSender(), address(this), _amount);

    _mintShares(_baseToken, _receiver, _amount);

    emit Wrap(_baseToken, _msgSender(), _receiver, _amount);
  }

  /// @inheritdoc IFxUSD
  function wrapFrom(
    address _pool,
    uint256 _amount,
    address _receiver
  ) external override onlySupportedPool(_pool) {
    // we just wrap, use `Action.None`
    if (isUnderCollateral()) revert ErrorUnderCollateral();

    address _baseToken = IFxShareableRebalancePool(_pool).baseToken();
    _checkBaseToken(_baseToken);
    _checkMarketMintable(_baseToken, false);

    IFxShareableRebalancePool(_pool).withdrawFrom(_msgSender(), _amount, address(this));
    _mintShares(_baseToken, _receiver, _amount);

    emit Wrap(_baseToken, _msgSender(), _receiver, _amount);
  }

  /// @inheritdoc IFxUSD
  function mint(
    address _baseToken,
    uint256 _amountIn,
    address _receiver,
    uint256 _minOut
  )
    external
    override
    onlySupportedMarket(_baseToken)
    onlyMintableMarket(_baseToken, true)
    returns (uint256 _amountOut)
  {
    // we mint fToken, use `Action.MintFToken`
    if (isUnderCollateral(IFxTreasuryV2.Action.MintFToken)) revert ErrorUnderCollateral();

    address _fToken = markets[_baseToken].fToken;
    _amountOut = _mintFToken(_baseToken, _fToken, _amountIn, _minOut);
    _mintShares(_baseToken, _receiver, _amountOut);

    emit Wrap(_baseToken, _msgSender(), _receiver, _amountOut);
  }

  /// @inheritdoc IFxUSD
  function earn(
    address _pool,
    uint256 _amount,
    address _receiver
  ) external override onlySupportedPool(_pool) {
    // we just unwrap, use `Action.None`
    if (isUnderCollateral()) revert ErrorUnderCollateral();

    address _baseToken = IFxShareableRebalancePool(_pool).baseToken();
    _checkBaseToken(_baseToken);

    _burnShares(_baseToken, _msgSender(), _amount);
    emit Unwrap(_baseToken, _msgSender(), _receiver, _amount);

    _deposit(markets[_baseToken].fToken, _pool, _receiver, _amount);
  }

  /// @inheritdoc IFxUSD
  function mintAndEarn(
    address _pool,
    uint256 _amountIn,
    address _receiver,
    uint256 _minOut
  ) external override onlySupportedPool(_pool) returns (uint256 _amountOut) {
    // we mint fToken, use `Action.MintFToken`
    if (isUnderCollateral(IFxTreasuryV2.Action.MintFToken)) revert ErrorUnderCollateral();

    address _baseToken = IFxShareableRebalancePool(_pool).baseToken();
    _checkBaseToken(_baseToken);
    _checkMarketMintable(_baseToken, true);

    address _fToken = markets[_baseToken].fToken;
    _amountOut = _mintFToken(_baseToken, _fToken, _amountIn, _minOut);
    _deposit(_fToken, _pool, _receiver, _amountOut);
  }

  /// @inheritdoc IFxUSD
  function redeem(
    address _baseToken,
    uint256 _amountIn,
    address _receiver,
    uint256 _minOut
  ) external override onlySupportedMarket(_baseToken) returns (uint256 _amountOut, uint256 _bonusOut) {
    // we redeem fToken, use `Action.RedeemFToken`
    if (isUnderCollateral(IFxTreasuryV2.Action.RedeemFToken)) revert ErrorUnderCollateral();

    address _market = markets[_baseToken].market;
    address _fToken = markets[_baseToken].fToken;

    uint256 _balance = IERC20Upgradeable(_fToken).balanceOf(address(this));
    (_amountOut, _bonusOut) = IFxMarketV2(_market).redeemFToken(_amountIn, _receiver, _minOut);
    // the real amount of fToken redeemed
    _amountIn = _balance - IERC20Upgradeable(_fToken).balanceOf(address(this));

    _burnShares(_baseToken, _msgSender(), _amountIn);
    emit Unwrap(_baseToken, _msgSender(), _receiver, _amountIn);
  }

  /// @inheritdoc IFxUSD
  function redeemFrom(
    address _pool,
    uint256 _amountIn,
    address _receiver,
    uint256 _minOut
  ) external override onlySupportedPool(_pool) returns (uint256 _amountOut, uint256 _bonusOut) {
    address _baseToken = IFxShareableRebalancePool(_pool).baseToken();
    address _market = markets[_baseToken].market;
    address _fToken = markets[_baseToken].fToken;

    // calculate the actual amount of fToken withdrawn from rebalance pool.
    _amountOut = IERC20Upgradeable(_fToken).balanceOf(address(this));
    IFxShareableRebalancePool(_pool).withdrawFrom(_msgSender(), _amountIn, address(this));
    _amountOut = IERC20Upgradeable(_fToken).balanceOf(address(this)) - _amountOut;

    // redeem fToken as base token
    // assume all fToken will be redeem for simplicity
    (_amountOut, _bonusOut) = IFxMarketV2(_market).redeemFToken(_amountOut, _receiver, _minOut);
  }

  /// @inheritdoc IFxUSD
  function autoRedeem(
    uint256 _amountIn,
    address _receiver,
    uint256[] memory _minOuts
  )
    external
    override
    returns (
      address[] memory _baseTokens,
      uint256[] memory _amountOuts,
      uint256[] memory _bonusOuts
    )
  {
    uint256 _numMarkets = supportedTokens.length();
    if (_minOuts.length != _numMarkets) revert ErrorLengthMismatch();

    _baseTokens = new address[](_numMarkets);
    _amountOuts = new uint256[](_numMarkets);
    _bonusOuts = new uint256[](_numMarkets);
    uint256[] memory _supplies = new uint256[](_numMarkets);

    bool _isUnderCollateral = false;
    for (uint256 i = 0; i < _numMarkets; i++) {
      _baseTokens[i] = supportedTokens.at(i);
      _supplies[i] = markets[_baseTokens[i]].managed;
      address _treasury = markets[_baseTokens[i]].treasury;
      // we redeem fToken, use `Action.RedeemFToken`
      if (IFxTreasuryV2(_treasury).isUnderCollateral(IFxTreasuryV2.Action.RedeemFToken)) _isUnderCollateral = true;
    }

    uint256 _supply = totalSupply();
    _burn(_msgSender(), _amountIn);

    if (_isUnderCollateral) {
      // redeem proportionally
      for (uint256 i = 0; i < _numMarkets; i++) {
        _amountOuts[i] = (_supplies[i] * _amountIn) / _supply;
      }
    } else {
      // redeem by sorted fToken amounts
      while (_amountIn > 0) {
        unchecked {
          uint256 maxSupply = _supplies[0];
          uint256 maxIndex = 0;
          for (uint256 i = 1; i < _numMarkets; i++) {
            if (_supplies[i] > maxSupply) {
              maxSupply = _supplies[i];
              maxIndex = i;
            }
          }
          if (_amountIn > maxSupply) _amountOuts[maxIndex] = maxSupply;
          else _amountOuts[maxIndex] = _amountIn;
          _supplies[maxIndex] -= _amountOuts[maxIndex];
          _amountIn -= _amountOuts[maxIndex];
        }
      }
    }

    for (uint256 i = 0; i < _numMarkets; i++) {
      if (_amountOuts[i] == 0) continue;
      emit Unwrap(_baseTokens[i], _msgSender(), _receiver, _amountOuts[i]);

      markets[_baseTokens[i]].managed -= _amountOuts[i];
      address _market = markets[_baseTokens[i]].market;
      (_amountOuts[i], _bonusOuts[i]) = IFxMarketV2(_market).redeemFToken(_amountOuts[i], _receiver, _minOuts[i]);
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the mint capacity of the base token.
  /// @param _baseToken The address of base token of the market.
  /// @param _newCap The value of current mint capacity.
  function updateMintCap(address _baseToken, uint256 _newCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (!supportedTokens.contains(_baseToken)) revert ErrorUnsupportedMarket();

    uint256 _oldCap = markets[_baseToken].mintCap;
    markets[_baseToken].mintCap = _newCap;

    emit UpdateMintCap(_baseToken, _oldCap, _newCap);
  }

  /// @notice Add a new market to fxUSD.
  /// @param _market The address of market contract.
  /// @param _mintCap The mint capacity of the market.
  function addMarket(address _market, uint256 _mintCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
    address _baseToken = IFxMarketV2(_market).baseToken();
    address _treasury = IFxMarketV2(_market).treasury();
    address _fToken = IFxMarketV2(_market).fToken();
    if (supportedTokens.contains(_baseToken)) revert ErrorMarketAlreadySupported();

    supportedTokens.add(_baseToken);
    markets[_baseToken] = FxMarketStruct(_fToken, _treasury, _market, _mintCap, 0);
    IERC20Upgradeable(_baseToken).safeApprove(_market, type(uint256).max);

    emit AddMarket(_baseToken, _mintCap);
  }

  /// @notice Add new supported rebalance pools to fxUSD.
  /// @param _pools The list of rebalance pools.
  function addRebalancePools(address[] memory _pools) external onlyRole(DEFAULT_ADMIN_ROLE) {
    for (uint256 i = 0; i < _pools.length; ++i) {
      address _baseToken = IFxShareableRebalancePool(_pools[i]).baseToken();
      _checkBaseToken(_baseToken);
      if (supportedPools.add(_pools[i])) {
        emit AddRebalancePool(_baseToken, _pools[i]);
      }
    }
  }

  /// @notice Add new supported rebalance pools to fxUSD.
  /// @param _pools The list of rebalance pools.
  function removeRebalancePools(address[] memory _pools) external onlyRole(DEFAULT_ADMIN_ROLE) {
    for (uint256 i = 0; i < _pools.length; ++i) {
      address _baseToken = IFxShareableRebalancePool(_pools[i]).baseToken();
      if (supportedPools.remove(_pools[i])) {
        emit RemoveRebalancePool(_baseToken, _pools[i]);
      }
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to check base token.
  /// @param _baseToken The address of the base token.
  function _checkBaseToken(address _baseToken) private view {
    if (!supportedTokens.contains(_baseToken)) revert ErrorUnsupportedMarket();
  }

  /// @dev Internal function to check market.
  /// @param _baseToken The address of the base token.
  /// @param _checkCollateralRatio Whether to check collateral ratio.
  function _checkMarketMintable(address _baseToken, bool _checkCollateralRatio) private view {
    address _treasury = markets[_baseToken].treasury;
    if (_checkCollateralRatio) {
      // we mint fToken, use `Action.MintFToken`
      uint256 _collateralRatio = IFxTreasuryV2(_treasury).collateralRatio(IFxTreasuryV2.Action.MintFToken);
      uint256 _stabilityRatio = IFxMarketV2(markets[_baseToken].market).stabilityRatio();
      // not allow to mint when collateral ratio <= stability ratio
      if (_collateralRatio <= _stabilityRatio) revert ErrorMarketInStabilityMode();
    }
    // not allow to mint when price is invalid
    if (!IFxTreasuryV2(_treasury).isBaseTokenPriceValid()) revert ErrorMarketWithInvalidPrice();
  }

  /// @dev Internal function to mint fToken.
  /// @param _baseToken The address of the base token.
  /// @param _fToken The address of the corresponding fToken.
  /// @param _amountIn The amount of base token to use.
  /// @param _minOut The minimum amount of fxUSD should receive.
  /// @return _amountOut The amount of fxUSD received by the receiver.
  function _mintFToken(
    address _baseToken,
    address _fToken,
    uint256 _amountIn,
    uint256 _minOut
  ) private returns (uint256 _amountOut) {
    address _market = markets[_baseToken].market;
    uint256 _mintCap = markets[_baseToken].mintCap;
    IERC20Upgradeable(_baseToken).safeTransferFrom(_msgSender(), address(this), _amountIn);
    uint256 _balance = IERC20Upgradeable(_baseToken).balanceOf(address(this));
    // @note approved in `addMarket`.
    _amountOut = IFxMarketV2(_market).mintFToken(_amountIn, address(this), _minOut);

    if (IERC20Upgradeable(_fToken).totalSupply() > _mintCap) revert ErrorExceedMintCap();

    // refund exceeding base token
    uint256 _baseTokenUsed = _balance - IERC20Upgradeable(_baseToken).balanceOf(address(this));
    if (_baseTokenUsed < _amountIn) {
      unchecked {
        IERC20Upgradeable(_baseToken).safeTransfer(_msgSender(), _amountIn - _baseTokenUsed);
      }
    }
  }

  /// @dev Internal function to mint fxUSD.
  /// @param _baseToken The address of the base token.
  /// @param _receiver The address of fxUSD recipient.
  /// @param _amount The amount of fxUSD to mint.
  function _mintShares(
    address _baseToken,
    address _receiver,
    uint256 _amount
  ) private {
    unchecked {
      markets[_baseToken].managed += _amount;
    }

    _mint(_receiver, _amount);
  }

  /// @dev Internal function to burn fxUSD.
  /// @param _baseToken The address of the base token.
  /// @param _owner The address of fxUSD owner.
  /// @param _amount The amount of fxUSD to burn.
  function _burnShares(
    address _baseToken,
    address _owner,
    uint256 _amount
  ) private {
    uint256 _managed = markets[_baseToken].managed;
    if (_amount > _managed) revert ErrorInsufficientLiquidity();
    unchecked {
      markets[_baseToken].managed -= _amount;
    }

    _burn(_owner, _amount);
  }

  /// @dev Internal function to deposit fToken to rebalance pool.
  /// @param _fToken the address of fToken.
  /// @param _pool The address of rebalance pool.
  /// @param _receiver The address of rebalance pool share recipient.
  /// @param _amount The amount of fToken to deposit.
  function _deposit(
    address _fToken,
    address _pool,
    address _receiver,
    uint256 _amount
  ) internal {
    IERC20Upgradeable(_fToken).safeApprove(_pool, 0);
    IERC20Upgradeable(_fToken).safeApprove(_pool, _amount);
    IFxShareableRebalancePool(_pool).deposit(_amount, _receiver);
  }
}

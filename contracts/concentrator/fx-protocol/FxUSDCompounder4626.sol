// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/interfaces/IERC20MetadataUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/interfaces/IERC20Upgradeable.sol";
import { IERC4626Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/interfaces/IERC4626Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { ERC20PermitUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/ERC20PermitUpgradeable.sol";

import { IStandardizedYield } from "../../interfaces/pendle/IStandardizedYield.sol";
import { IFxUSDCompounder } from "../../interfaces/concentrator/IFxUSDCompounder.sol";

contract FxUSDCompounder4626 is ERC20PermitUpgradeable, IERC4626Upgradeable {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /**********
   * Events *
   **********/

  event WithdrawToBaseToken(
    address indexed sender,
    address indexed receiver,
    address indexed owner,
    uint256 assets,
    uint256 shares
  );

  /*************
   * Variables *
   *************/

  /// @inheritdoc IERC4626Upgradeable
  address public override asset;

  /// @notice The address of FxUSDCompounder contract.
  address public compounder;

  /// @notice The address of base token.
  address public baseToken;

  /***************
   * Constructor *
   ***************/

  function initialize(address _compounder) external initializer {
    string memory _name = IERC20MetadataUpgradeable(_compounder).name();
    __ERC20_init(_name, IERC20MetadataUpgradeable(_compounder).symbol());
    __ERC20Permit_init(_name);

    address cachedAsset = IStandardizedYield(_compounder).yieldToken();
    IERC20Upgradeable(cachedAsset).safeApprove(_compounder, type(uint256).max);

    asset = cachedAsset;
    compounder = _compounder;
    baseToken = IFxUSDCompounder(_compounder).getBaseToken();
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IERC4626Upgradeable
  function totalAssets() external view override returns (uint256 totalManagedAssets) {
    totalManagedAssets = IFxUSDCompounder(compounder).getTotalAssets();
  }

  /// @inheritdoc IERC4626Upgradeable
  function convertToShares(uint256 assets) public view override returns (uint256 shares) {
    shares = IStandardizedYield(compounder).previewDeposit(asset, assets);
  }

  /// @inheritdoc IERC4626Upgradeable
  function convertToAssets(uint256 shares) public view override returns (uint256 assets) {
    assets = IStandardizedYield(compounder).previewRedeem(asset, shares);
  }

  /// @inheritdoc IERC4626Upgradeable
  function maxDeposit(address) external pure override returns (uint256 maxAssets) {
    maxAssets = type(uint256).max;
  }

  /// @inheritdoc IERC4626Upgradeable
  function previewDeposit(uint256 assets) external view override returns (uint256 shares) {
    shares = convertToShares(assets);
  }

  /// @inheritdoc IERC4626Upgradeable
  function maxMint(address) external pure override returns (uint256 maxShares) {
    maxShares = type(uint256).max;
  }

  /// @inheritdoc IERC4626Upgradeable
  function previewMint(uint256 shares) external view override returns (uint256 assets) {
    assets = convertToAssets(shares);
  }

  /// @inheritdoc IERC4626Upgradeable
  function maxWithdraw(address owner) external view override returns (uint256 maxAssets) {
    maxAssets = convertToAssets(balanceOf(owner));
  }

  /// @inheritdoc IERC4626Upgradeable
  function previewWithdraw(uint256 assets) external view override returns (uint256 shares) {
    shares = convertToShares(assets);
  }

  /// @inheritdoc IERC4626Upgradeable
  function maxRedeem(address owner) external view override returns (uint256 maxShares) {
    maxShares = balanceOf(owner);
  }

  /// @inheritdoc IERC4626Upgradeable
  function previewRedeem(uint256 shares) external view override returns (uint256 assets) {
    assets = convertToAssets(shares);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IERC4626Upgradeable
  function deposit(uint256 assets, address receiver) public override returns (uint256 shares) {
    // we are sure this is not fee on transfer token
    address cachedAsset = asset;
    IERC20Upgradeable(cachedAsset).safeTransferFrom(_msgSender(), address(this), assets);
    shares = IStandardizedYield(compounder).deposit(address(this), cachedAsset, assets, 0);
    _mint(receiver, shares);

    emit Deposit(_msgSender(), receiver, assets, shares);
  }

  /// @inheritdoc IERC4626Upgradeable
  function redeem(
    uint256 shares,
    address receiver,
    address owner
  ) public override returns (uint256 assets) {
    address sender = _msgSender();
    if (sender != owner) {
      _spendAllowance(owner, sender, shares);
    }

    _burn(owner, shares);
    assets = IStandardizedYield(compounder).redeem(receiver, shares, asset, 0, false);

    emit Withdraw(sender, receiver, owner, assets, shares);
  }

  /// @inheritdoc IERC4626Upgradeable
  function mint(uint256 shares, address receiver) external override returns (uint256 assets) {
    assets = convertToAssets(shares);

    deposit(assets, receiver);
  }

  /// @inheritdoc IERC4626Upgradeable
  function withdraw(
    uint256 assets,
    address receiver,
    address owner
  ) external override returns (uint256 shares) {
    shares = convertToShares(assets);

    redeem(shares, receiver, owner);
  }

  /// @notice Wrap FxUSDCompounder.
  /// @param shares The amount of token to wrap.
  /// @param receiver The address token receiver.
  function wrap(uint256 shares, address receiver) external {
    IERC20Upgradeable(compounder).safeTransferFrom(_msgSender(), address(this), shares);
    _mint(receiver, shares);
  }

  /// @notice Unwrap as FxUSDCompounder.
  /// @param shares The amount of token to unwrap.
  /// @param receiver The address token receiver.
  function unwrap(uint256 shares, address receiver) external {
    _burn(_msgSender(), shares);

    IERC20Upgradeable(compounder).safeTransfer(receiver, shares);
  }

  /// @notice Burns exactly shares from owner and sends assets of base token to receiver.
  /// @param shares The amount of pool shares to burn.
  /// @param receiver The address of token receiver.
  /// @param owner The address of pool share owner.
  /// @param minOut The minimum amount of base token should receive.
  /// @return assets The amount of base token received.
  function redeemToBaseToken(
    uint256 shares,
    address receiver,
    address owner,
    uint256 minOut
  ) external returns (uint256 assets) {
    address sender = _msgSender();
    if (sender != owner) {
      _spendAllowance(owner, sender, shares);
    }

    _burn(owner, shares);
    assets = IStandardizedYield(compounder).redeem(receiver, shares, baseToken, minOut, false);

    emit WithdrawToBaseToken(sender, receiver, owner, assets, shares);
  }
}

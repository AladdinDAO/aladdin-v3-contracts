// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "./interfaces/IStakeDAOCRVVault.sol";

import "../AladdinCompounder.sol";
import "./SdCRVLocker.sol";

// solhint-disable reason-string

contract AladdinSdCRV is AladdinCompounder, SdCRVLocker {
  using SafeMathUpgradeable for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /// @dev The address of CRV Token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @dev The address of legacy sdveCRV Token.
  address private constant SD_VE_CRV = 0x478bBC744811eE8310B461514BDc29D03739084D;

  /// @dev The address of sdCRV Token.
  // solhint-disable-next-line const-name-snakecase
  address private constant sdCRV = 0xD1b5651E55D4CeeD36251c61c50C889B36F6abB5;

  /// @dev The address of StakeDAOCRVVault contract.
  address private immutable vault;

  constructor(address _vault) {
    vault = _vault;
  }

  function initialize(address _zap) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
    ERC20Upgradeable.__ERC20_init("Aladdin sdCRV", "asdCRV");

    require(_zap != address(0), "zero zap address");

    IERC20Upgradeable(CRV).safeApprove(vault, uint256(-1));
    IERC20Upgradeable(SD_VE_CRV).safeApprove(vault, uint256(-1));
    IERC20Upgradeable(sdCRV).safeApprove(vault, uint256(-1));
  }

  /// @inheritdoc IAladdinCompounder
  function asset() public pure override returns (address) {
    return sdCRV;
  }

  /// @inheritdoc SdCRVLocker
  function withdrawLockTime() public view override returns (uint256) {
    return SdCRVLocker(vault).withdrawLockTime();
  }

  function depositWithCRV(
    uint256 _assets,
    address _receiver,
    uint256 _minOut
  ) external returns (uint256) {
    _distributePendingReward();

    if (_assets == uint256(-1)) {
      _assets = IERC20Upgradeable(CRV).balanceOf(msg.sender);
    }
    IERC20Upgradeable(CRV).safeTransferFrom(msg.sender, address(this), _assets);

    _assets = IStakeDAOCRVVault(vault).depositWithCRV(_assets, address(this), _minOut);

    return _mintShare(_assets, _receiver);
  }

  function depositWithSdVeCRV(uint256 _assets, address _receiver) external nonReentrant returns (uint256) {
    _distributePendingReward();

    if (_assets == uint256(-1)) {
      _assets = IERC20Upgradeable(SD_VE_CRV).balanceOf(msg.sender);
    }
    IERC20Upgradeable(SD_VE_CRV).safeTransferFrom(msg.sender, address(this), _assets);

    IStakeDAOCRVVault(vault).depositWithSdVeCRV(_assets, address(this));

    return _mintShare(_assets, _receiver);
  }

  /// @inheritdoc IAladdinCompounder
  function harvest(address _recipient, uint256 _minAssets) external override returns (uint256 assets) {
    // SDT, CRV, 3CRV
  }

  /// @inheritdoc AladdinCompounder
  function _deposit(uint256 _assets, address _receiver) internal override returns (uint256) {
    IStakeDAOCRVVault(vault).deposit(_assets, address(this));

    return _mintShare(_assets, _receiver);
  }

  /// @dev Internal function to mint share to user.
  /// @param _assets The amount of asset to deposit.
  /// @param _receiver The address of account who will receive the pool share.
  /// @return Return the amount of pool shares to be received.
  function _mintShare(uint256 _assets, address _receiver) internal returns (uint256) {
    require(_assets > 0, "asdCRV: deposit zero amount");

    uint256 _totalAssets = totalAssetsStored; // the value is correct
    uint256 _totalShare = totalSupply();
    uint256 _shares;
    if (_totalAssets == 0) _shares = _assets;
    else _shares = _assets.mul(_totalShare) / _totalAssets;

    _mint(_receiver, _shares);

    totalAssetsStored = _totalAssets + _assets;
    return _shares;
  }

  /// @inheritdoc AladdinCompounder
  function _withdraw(
    uint256 _shares,
    address _receiver,
    address _owner
  ) internal override returns (uint256) {
    require(_shares > 0, "asdCRV: withdraw zero share");
    require(_shares <= balanceOf(_owner), "asdCRV: insufficient owner shares");
    uint256 _totalAssets = totalAssetsStored; // the value is correct
    uint256 _totalShare = totalSupply();
    uint256 _amount = _shares.mul(_totalAssets) / _totalShare;
    _burn(_owner, _shares);

    if (_totalShare != _shares) {
      // take withdraw fee if it is not the last user.
      uint256 _withdrawFee = (_amount * feeInfo.withdrawPercentage) / FEE_DENOMINATOR;
      _amount = _amount - _withdrawFee; // never overflow here
    } else {
      // @note If it is the last user, some extra rewards still pending.
      // We just ignore it for now.
    }

    totalAssetsStored = _totalAssets - _amount; // never overflow here

    _lockToken(_amount, _receiver);

    emit Withdraw(msg.sender, _receiver, _owner, _amount, _shares);

    return _amount;
  }

  /// @inheritdoc SdCRVLocker
  function _unlockToken(uint256 _amount, address _recipient) internal override {
    SdCRVLocker(vault).withdrawExpired(address(this), address(this));
    IERC20Upgradeable(sdCRV).safeTransfer(_recipient, _amount);
  }
}

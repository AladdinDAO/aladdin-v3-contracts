// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import { IAladdinCompounder } from "../../interfaces/concentrator/IAladdinCompounder.sol";
import { ISdCrvCompounder } from "../../interfaces/concentrator/ISdCrvCompounder.sol";
import { IZap } from "../../interfaces/IZap.sol";

import { AladdinCompounder } from "../AladdinCompounder.sol";
import { SdCRVLocker } from "./SdCRVLocker.sol";

// solhint-disable contract-name-camelcase

// Since the `IConcentratorSdCrvGaugeWrapper` won't compile with `0.7.6`, we create a simple interface.
interface IWrapper_SdCrvCompounder {
  /// @notice Return the list of active reward tokens.
  function getActiveRewardTokens() external view returns (address[] memory);

  /// @notice Deposit some staking token to the contract.
  ///
  /// @param amount The amount of staking token to deposit.
  /// @param receiver The address of recipient who will receive the deposited staking token.
  function deposit(uint256 amount, address receiver) external;

  /// @notice Deposit some gauge token to the contract.
  ///
  /// @param amount The amount of gauge token to deposit.
  /// @param receiver The address of recipient who will receive the deposited gauge token.
  function depositWithGauge(uint256 amount, address receiver) external;

  /// @notice Deposit some CRV to the contract.
  ///
  /// @param amount The amount of staking token to deposit.
  /// @param receiver The address of recipient who will receive the deposited staking token.
  /// @param minOut The minimum amount of sdCRV should received.
  /// @return amountOut The amount of sdCRV received.
  function depositWithCRV(
    uint256 amount,
    address receiver,
    uint256 minOut
  ) external returns (uint256 amountOut);

  /// @notice Deposit some CRV to the contract.
  ///
  /// @param amount The amount of staking token to deposit.
  /// @param receiver The address of recipient who will receive the deposited staking token.
  function depositWithSdVeCRV(uint256 amount, address receiver) external;

  /// @notice Withdraw some staking token from the contract.
  ///
  /// @param amount The amount of staking token to withdraw.
  /// @param receiver The address of recipient who will receive the withdrawn staking token.
  function withdraw(uint256 amount, address receiver) external;

  /// @notice Set the default reward receiver for the caller.
  /// @dev When set to address(0), rewards are sent to the caller.
  /// @param _newReceiver The new receiver address for any rewards claimed via `claim`.
  function setRewardReceiver(address _newReceiver) external;

  /// @notice Claim pending rewards of all active tokens for the user and transfer to others.
  /// @param account The address of the user.
  /// @param receiver The address of the recipient.
  function claim(address account, address receiver) external;
}

// solhint-disable no-empty-blocks
// solhint-disable reason-string

contract SdCrvCompounder is AladdinCompounder, SdCRVLocker, ISdCrvCompounder {
  using SafeMathUpgradeable for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the address of stash contract is updated.
  /// @param oldStash The address of the previous stash contract.
  /// @param newStash The address of the current stash contract.
  event UpdateStash(address indexed oldStash, address indexed newStash);

  /*************
   * Constants *
   *************/

  /// @dev The address of CRV Token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @dev The address of SDT Token.
  address private constant SDT = 0x73968b9a57c6E53d41345FD57a6E6ae27d6CDB2F;

  // The address of 3CRV token.
  address private constant THREE_CRV = 0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490;

  /// @dev The address of legacy sdveCRV Token.
  address private constant SD_VE_CRV = 0x478bBC744811eE8310B461514BDc29D03739084D;

  /// @dev The address of legacy sdveCRV Token.
  address private constant SDCRV_GAUGE = 0x7f50786A0b15723D741727882ee99a0BF34e3466;

  /// @dev The address of sdCRV Token.
  // solhint-disable-next-line const-name-snakecase
  address private constant sdCRV = 0xD1b5651E55D4CeeD36251c61c50C889B36F6abB5;

  /// @dev The address of StakeDAOCRVVault contract.
  address private immutable legacyVault;

  /// @notice The address of ConcentratorSdCrvGaugeWrapper contract.
  address public immutable wrapper;

  /*************
   * Variables *
   *************/

  /// @notice The address of ZAP contract, will be used to swap tokens.
  address public zap;

  /// @notice The address of stash contract for holding extra rewards.
  address public stash;

  /***************
   * Constructor *
   ***************/

  constructor(address _legacyVault, address _wrapper) {
    legacyVault = _legacyVault;
    wrapper = _wrapper;
  }

  function initializeV2(address _stash) external {
    if (stash != address(0)) revert("asdCRV: v2 initialized");

    _updateStash(_stash);

    IERC20Upgradeable(CRV).safeApprove(wrapper, uint256(-1));
    IERC20Upgradeable(SDCRV_GAUGE).safeApprove(wrapper, uint256(-1));
    IERC20Upgradeable(SD_VE_CRV).safeApprove(wrapper, uint256(-1));
    IERC20Upgradeable(sdCRV).safeApprove(wrapper, uint256(-1));
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IAladdinCompounder
  function asset() public pure override(AladdinCompounder) returns (address) {
    return sdCRV;
  }

  /// @inheritdoc SdCRVLocker
  /// @dev deprecated now.
  function withdrawLockTime() public pure override returns (uint256) {
    return 0;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  // receive ETH from zap
  receive() external payable {}

  /// @inheritdoc ISdCrvCompounder
  function depositWithGauge(uint256 _assets, address _receiver) external override returns (uint256 _shares) {
    _distributePendingReward();

    if (_assets == uint256(-1)) {
      _assets = IERC20Upgradeable(SDCRV_GAUGE).balanceOf(msg.sender);
    }
    IERC20Upgradeable(SDCRV_GAUGE).safeTransferFrom(msg.sender, address(this), _assets);

    IWrapper_SdCrvCompounder(wrapper).depositWithGauge(_assets, address(this));

    _shares = _mintShare(_assets, _receiver);
  }

  /// @inheritdoc ISdCrvCompounder
  ///
  /// @dev Use `_assets=uint256(-1)` if you want to deposit all CRV.
  function depositWithCRV(
    uint256 _assets,
    address _receiver,
    uint256 _minShareOut
  ) external override nonReentrant returns (uint256 _shares) {
    _distributePendingReward();

    if (_assets == uint256(-1)) {
      _assets = IERC20Upgradeable(CRV).balanceOf(msg.sender);
    }
    IERC20Upgradeable(CRV).safeTransferFrom(msg.sender, address(this), _assets);

    _assets = IWrapper_SdCrvCompounder(wrapper).depositWithCRV(_assets, address(this), 0);

    _shares = _mintShare(_assets, _receiver);
    require(_shares >= _minShareOut, "asdCRV: insufficient share received");
  }

  /// @inheritdoc ISdCrvCompounder
  ///
  /// @dev Use `_assets=uint256(-1)` if you want to deposit all SdVeCRV.
  function depositWithSdVeCRV(uint256 _assets, address _receiver)
    external
    override
    nonReentrant
    returns (uint256 _shares)
  {
    _distributePendingReward();

    if (_assets == uint256(-1)) {
      _assets = IERC20Upgradeable(SD_VE_CRV).balanceOf(msg.sender);
    }
    IERC20Upgradeable(SD_VE_CRV).safeTransferFrom(msg.sender, address(this), _assets);

    IWrapper_SdCrvCompounder(wrapper).depositWithSdVeCRV(_assets, address(this));

    _shares = _mintShare(_assets, _receiver);
  }

  /// @inheritdoc IAladdinCompounder
  function harvest(address _recipient, uint256 _minAssets) external override nonReentrant returns (uint256 assets) {
    ensureCallerIsHarvester();

    _distributePendingReward();

    uint256 _amountCRV;
    uint256 _amountSdCRV;
    uint256 _amountETH;
    address _zap = zap;
    // 1.1 claim pending rewards
    {
      // We are prettier sure that all tokens are active
      address[] memory _tokens = IWrapper_SdCrvCompounder(wrapper).getActiveRewardTokens();
      uint256[] memory _balances = new uint256[](_tokens.length);
      for (uint256 i = 0; i < _balances.length; ++i) {
        _balances[i] = IERC20Upgradeable(_tokens[i]).balanceOf(address(this));
      }
      // some rewards are still in legacy vault
      IWrapper_SdCrvCompounder(legacyVault).claim(address(this), address(this));
      IWrapper_SdCrvCompounder(wrapper).claim(address(this), address(this));
      for (uint256 i = 0; i < _balances.length; i++) {
        address _token = _tokens[i];
        uint256 _amount = IERC20Upgradeable(_tokens[i]).balanceOf(address(this)) - _balances[i];
        if (_token == CRV) {
          _amountCRV += _amount;
        } else if (_token == sdCRV) {
          _amountSdCRV += _amount;
        } else {
          // convert to ETH
          IERC20Upgradeable(_token).safeTransfer(_zap, _amount);
          _amountETH += IZap(zap).zap(_token, _amount, address(0), 0);
        }
      }
    }
    // 1.2 convert ETH to CRV
    if (_amountETH > 0) {
      _amountCRV += IZap(_zap).zap{ value: _amountETH }(address(0), _amountETH, CRV, 0);
    }
    // 1.3 deposit CRV as sdCRV
    assets = IWrapper_SdCrvCompounder(wrapper).depositWithCRV(_amountCRV, address(this), 0);
    // 1.4 deposit sdCRV to vault
    if (_amountSdCRV > 0) {
      IWrapper_SdCrvCompounder(wrapper).deposit(_amountSdCRV, address(this));
      assets = assets + _amountSdCRV;
    }
    require(assets >= _minAssets, "asdCRV: insufficient harvested sdCRV");

    // 2. calculate fee and distribute
    FeeInfo memory _fee = feeInfo;
    uint256 _totalAssets = totalAssetsStored; // the value is correct
    uint256 _totalShare = totalSupply();
    uint256 _platformFee = _fee.platformPercentage;
    if (_platformFee > 0) {
      _platformFee = (_platformFee * assets) / FEE_PRECISION;
      // share will be a little more than the actual percentage since minted before distribute rewards
      _mint(_fee.platform, _platformFee.mul(_totalShare) / _totalAssets);
    }
    uint256 _harvestBounty = _fee.bountyPercentage;
    if (_harvestBounty > 0) {
      _harvestBounty = (_harvestBounty * assets) / FEE_PRECISION;
      // share will be a little more than the actual percentage since minted before distribute rewards
      _mint(_recipient, _harvestBounty.mul(_totalShare) / _totalAssets);
    }
    totalAssetsStored = _totalAssets.add(_platformFee).add(_harvestBounty);

    emit Harvest(msg.sender, _recipient, assets, _platformFee, _harvestBounty);

    _notifyHarvestedReward(assets - _platformFee - _harvestBounty);
  }

  /// @notice Deposit extra rewards from stash contract.
  /// @param token The address of token, must be sdCRV.
  /// @param amount The amount of token to deposit.
  function depositReward(address token, uint256 amount) external {
    require(token == sdCRV, "asdCRV: deposit non-sdCRV token");
    require(msg.sender == stash, "asdCRV: caller not stash");

    _distributePendingReward();

    IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), amount);
    IWrapper_SdCrvCompounder(wrapper).deposit(amount, address(this));

    _notifyHarvestedReward(amount);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the zap contract
  /// @param _zap The address of the zap contract.
  function updateZap(address _zap) external onlyOwner {
    require(_zap != address(0), "asdCRV: zero zap address");
    zap = _zap;

    emit UpdateZap(_zap);
  }

  /// @notice Update the stash contract
  /// @param _stash The address of the zap contract.
  function updateStash(address _stash) external onlyOwner {
    _updateStash(_stash);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc AladdinCompounder
  function _deposit(uint256 _assets, address _receiver) internal override returns (uint256) {
    IWrapper_SdCrvCompounder(wrapper).deposit(_assets, address(this));

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

    emit Deposit(msg.sender, _receiver, _assets, _shares);

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

    // @note If it is the last user, some extra rewards still pending.
    // We just ignore it for now.

    totalAssetsStored = _totalAssets - _amount; // never overflow here

    IWrapper_SdCrvCompounder(wrapper).withdraw(_amount, _receiver);

    emit Withdraw(msg.sender, _receiver, _owner, _amount, _shares);

    return _amount;
  }

  /// @inheritdoc SdCRVLocker
  function _unlockToken(uint256 _amount, address _recipient) internal override {
    // the expired sdCRV already transfered to this contract.
    IERC20Upgradeable(sdCRV).safeTransfer(_recipient, _amount);
  }

  /// @dev Internal function to update the address of stash contract.
  /// @param _newStash The address of the new stash contract.
  function _updateStash(address _newStash) internal {
    require(_newStash != address(0), "asdCRV: zero stash address");

    address _oldStash = stash;
    stash = _newStash;
    emit UpdateStash(_oldStash, _newStash);

    IWrapper_SdCrvCompounder(wrapper).setRewardReceiver(_newStash);
  }
}

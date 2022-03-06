// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import "../interfaces/IAladdinCRV.sol";
import "../interfaces/IConvexBasicRewards.sol";
import "../interfaces/IConvexCRVDepositor.sol";
import "../interfaces/IConvexVirtualBalanceRewardPool.sol";
import "../interfaces/ICVXMining.sol";
import "../interfaces/IEllipsisMerkleDistributor.sol";

// solhint-disable no-empty-blocks, reason-string
contract AladdinCRV is ERC20Upgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable, IAladdinCRV {
  using SafeMathUpgradeable for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  uint256 private constant FEE_DENOMINATOR = 1e9;
  uint256 private constant MAX_WITHDRAW_FEE = 1e8; // 10%
  uint256 private constant MAX_PLATFORM_FEE = 2e8; // 20%
  uint256 private constant MAX_HARVEST_BOUNTY = 1e8; // 10%

  // The address of cvxCRV token.
  address private constant CVXCRV = 0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7;
  // The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;
  // The address of CVX token.
  address private constant CVX = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;
  // The address of 3CRV token.
  address private constant THREE_CRV = 0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490;
  // The address of Convex cvxCRV Staking Contract.
  address private constant CVXCRV_STAKING = 0x3Fe65692bfCD0e6CF84cB1E7d24108E434A7587e;
  // The address of Convex CVX Mining Contract.
  address private constant CVX_MINING = 0x3c75BFe6FbfDa3A94E7E7E8c2216AFc684dE5343;
  // The address of Convex 3CRV Rewards Contract.
  address private constant THREE_CRV_REWARDS = 0x7091dbb7fcbA54569eF1387Ac89Eb2a5C9F6d2EA;

  /// @dev The address of ZAP contract, will be used to swap tokens.
  address public zap;

  /// @dev The percentage of token to take on withdraw
  uint256 public withdrawFeePercentage;
  /// @dev The percentage of rewards to take for platform on harvest
  uint256 public platformFeePercentage;
  /// @dev The percentage of rewards to take for caller on harvest
  uint256 public harvestBountyPercentage;
  /// @dev The address of recipient of platform fee
  address public platform;

  function initialize(
    address _zap,
    address _platform,
    uint256 _withdrawFeePercentage,
    uint256 _platformFeePercentage,
    uint256 _harvestBountyPercentage
  ) external initializer {
    ERC20Upgradeable.__ERC20_init("Aladdin cvxCRV", "aCRV");
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();

    require(_zap != address(0), "AladdinCRV: zero zap address");
    require(_platform != address(0), "AladdinCRV: zero platform address");
    require(_withdrawFeePercentage <= MAX_WITHDRAW_FEE, "AladdinCRV: fee too large");
    require(_platformFeePercentage <= MAX_PLATFORM_FEE, "AladdinCRV: fee too large");
    require(_harvestBountyPercentage <= MAX_HARVEST_BOUNTY, "AladdinCRV: fee too large");

    zap = _zap;
    platform = _platform;
    withdrawFeePercentage = _withdrawFeePercentage;
    platformFeePercentage = _platformFeePercentage;
    harvestBountyPercentage = _harvestBountyPercentage;
  }

  /********************************** View Functions **********************************/

  /// @dev Return the total amount of cvxCRV staked.
  function totalUnderlying() public view override returns (uint256) {
    // TODO: stakeFor exists in CVXCRV_STAKING, maybe we need maintain correct underlying balance here.
    return IConvexBasicRewards(CVXCRV_STAKING).balanceOf(address(this));
  }

  /// @dev Return the amount of cvxCRV staked for user
  /// @param _user - The address of the account
  function balanceOfUnderlying(address _user) external view override returns (uint256) {
    uint256 _totalSupply = totalSupply();
    if (_totalSupply == 0) return 0;
    uint256 _balance = balanceOf(_user);
    return _balance.mul(totalUnderlying()) / _totalSupply;
  }

  /// @dev Return the amount of pending CRV rewards
  function pendingCRVRewards() public view returns (uint256) {
    return IConvexBasicRewards(CVXCRV_STAKING).earned(address(this));
  }

  /// @dev Return the amount of pending CVX rewards
  function pendingCVXRewards() external view returns (uint256) {
    return ICVXMining(CVX_MINING).ConvertCrvToCvx(pendingCRVRewards());
  }

  /// @dev Return the amount of pending 3CRV rewards
  function pending3CRVRewards() external view returns (uint256) {
    return IConvexVirtualBalanceRewardPool(THREE_CRV_REWARDS).earned(address(this));
  }

  /********************************** Mutated Functions **********************************/

  /// @dev Deposit cvxCRV token to this contract
  /// @param _recipient - The address who will receive the aCRV token.
  /// @param _amount - The amount of cvxCRV to deposit.
  /// @return share - The amount of aCRV received.
  function deposit(address _recipient, uint256 _amount) public override nonReentrant returns (uint256 share) {
    require(_amount > 0, "AladdinCRV: zero amount deposit");
    uint256 _before = IERC20Upgradeable(CVXCRV).balanceOf(address(this));
    IERC20Upgradeable(CVXCRV).safeTransferFrom(msg.sender, address(this), _amount);
    _amount = IERC20Upgradeable(CVXCRV).balanceOf(address(this)).sub(_before);
    return _deposit(_recipient, _amount);
  }

  /// @dev Deposit all cvxCRV token of the sender to this contract
  /// @param _recipient The address who will receive the aCRV token.
  /// @return share - The amount of aCRV received.
  function depositAll(address _recipient) external override returns (uint256 share) {
    uint256 _balance = IERC20Upgradeable(CVXCRV).balanceOf(msg.sender);
    return deposit(_recipient, _balance);
  }

  /// @dev Deposit CRV token to this contract
  /// @param _recipient - The address who will receive the aCRV token.
  /// @param _amount - The amount of CRV to deposit.
  /// @return share - The amount of aCRV received.
  function depositWithCRV(address _recipient, uint256 _amount) public override nonReentrant returns (uint256 share) {
    uint256 _before = IERC20Upgradeable(CRV).balanceOf(address(this));
    IERC20Upgradeable(CRV).safeTransferFrom(msg.sender, address(this), _amount);
    _amount = IERC20Upgradeable(CRV).balanceOf(address(this)).sub(_before);

    _amount = _zapToken(_amount, CRV, _amount, CVXCRV);
    return _deposit(_recipient, _amount);
  }

  /// @dev Deposit all CRV token of the sender to this contract
  /// @param _recipient The address who will receive the aCRV token.
  /// @return share - The amount of aCRV received.
  function depositAllWithCRV(address _recipient) external override returns (uint256 share) {
    uint256 _balance = IERC20Upgradeable(CRV).balanceOf(msg.sender);
    return depositWithCRV(_recipient, _balance);
  }

  /// @dev Withdraw cvxCRV in proportion to the amount of shares sent
  /// @param _recipient - The address who will receive the withdrawn token.
  /// @param _shares - The amount of aCRV to send.
  /// @param _minimumOut - The minimum amount of token should be received.
  /// @param _option - The withdraw option (as cvxCRV or CRV or CVX or ETH or stake to convex).
  /// @return withdrawn - The amount of token returned to the user.
  function withdraw(
    address _recipient,
    uint256 _shares,
    uint256 _minimumOut,
    WithdrawOption _option
  ) public override nonReentrant returns (uint256 withdrawn) {
    uint256 _withdrawed = _withdraw(_shares);
    if (_option == WithdrawOption.Withdraw) {
      require(_withdrawed >= _minimumOut, "AladdinCRV: insufficient output");
      IERC20Upgradeable(CVXCRV).safeTransfer(_recipient, _withdrawed);
    } else {
      _withdrawed = _withdrawAs(_recipient, _withdrawed, _minimumOut, _option);
    }

    emit Withdraw(msg.sender, _recipient, _shares, _option);
    return _withdrawed;
  }

  /// @dev Withdraw all cvxCRV in proportion to the amount of shares sent
  /// @param _recipient - The address who will receive the withdrawn token.
  /// @param _minimumOut - The minimum amount of token should be received.
  /// @param _option - The withdraw option (as cvxCRV or CRV or CVX or ETH or stake to convex).
  /// @return withdrawn - The amount of token returned to the user.
  function withdrawAll(
    address _recipient,
    uint256 _minimumOut,
    WithdrawOption _option
  ) external override returns (uint256) {
    uint256 _shares = balanceOf(msg.sender);
    return withdraw(_recipient, _shares, _minimumOut, _option);
  }

  /// @dev Harvest the pending reward and convert to cvxCRV.
  /// @param _recipient - The address of account to receive harvest bounty.
  /// @param _minimumOut - The minimum amount of cvxCRV should get.
  function harvest(address _recipient, uint256 _minimumOut) public override nonReentrant returns (uint256) {
    return _harvest(_recipient, _minimumOut);
  }

  /********************************** Restricted Functions **********************************/

  /// @dev Update the withdraw fee percentage.
  /// @param _feePercentage - The fee percentage to update.
  function updateWithdrawFeePercentage(uint256 _feePercentage) external onlyOwner {
    require(_feePercentage <= MAX_WITHDRAW_FEE, "AladdinCRV: fee too large");
    withdrawFeePercentage = _feePercentage;

    emit UpdateWithdrawalFeePercentage(_feePercentage);
  }

  /// @dev Update the platform fee percentage.
  /// @param _feePercentage - The fee percentage to update.
  function updatePlatformFeePercentage(uint256 _feePercentage) external onlyOwner {
    require(_feePercentage <= MAX_PLATFORM_FEE, "AladdinCRV: fee too large");
    platformFeePercentage = _feePercentage;

    emit UpdatePlatformFeePercentage(_feePercentage);
  }

  /// @dev Update the harvest bounty percentage.
  /// @param _percentage - The fee percentage to update.
  function updateHarvestBountyPercentage(uint256 _percentage) external onlyOwner {
    require(_percentage <= MAX_HARVEST_BOUNTY, "AladdinCRV: fee too large");
    harvestBountyPercentage = _percentage;

    emit UpdateHarvestBountyPercentage(_percentage);
  }

  /// @dev Update the recipient
  function updatePlatform(address _platform) external onlyOwner {
    require(_platform != address(0), "AladdinCRV: zero platform address");
    platform = _platform;

    emit UpdatePlatform(_platform);
  }

  /// @dev Update the zap contract
  function updateZap(address _zap) external onlyOwner {
    require(_zap != address(0), "AladdinCRV: zero zap address");
    zap = _zap;

    emit UpdateZap(_zap);
  }

  /// @dev Claim EPS airdrop, only used in BSC.
  function claimEPS(
    address _distributor,
    address _recipient,
    uint256 merkleIndex,
    uint256 index,
    uint256 amount,
    bytes32[] calldata merkleProof
  ) external onlyOwner {
    address eps = 0xA7f552078dcC247C2684336020c03648500C6d9F;
    IEllipsisMerkleDistributor(_distributor).claim(merkleIndex, index, amount, merkleProof);
    IERC20Upgradeable(eps).safeTransfer(_recipient, IERC20Upgradeable(eps).balanceOf(address(this)));
  }

  /********************************** Internal Functions **********************************/

  function _deposit(address _recipient, uint256 _amount) internal returns (uint256) {
    require(_amount > 0, "AladdinCRV: zero amount deposit");
    uint256 _underlying = totalUnderlying();
    uint256 _totalSupply = totalSupply();

    IERC20Upgradeable(CVXCRV).safeApprove(CVXCRV_STAKING, 0);
    IERC20Upgradeable(CVXCRV).safeApprove(CVXCRV_STAKING, _amount);
    IConvexBasicRewards(CVXCRV_STAKING).stake(_amount);

    uint256 _shares;
    if (_totalSupply == 0) {
      _shares = _amount;
    } else {
      _shares = _amount.mul(_totalSupply) / _underlying;
    }
    _mint(_recipient, _shares);

    emit Deposit(msg.sender, _recipient, _amount);
    return _shares;
  }

  function _withdraw(uint256 _shares) internal returns (uint256 _withdrawable) {
    require(_shares > 0, "AladdinCRV: zero share withdraw");
    require(_shares <= balanceOf(msg.sender), "AladdinCRV: shares not enough");
    uint256 _amount = _shares.mul(totalUnderlying()) / totalSupply();
    _burn(msg.sender, _shares);

    if (totalSupply() == 0) {
      // If user is last to withdraw, harvest before exit
      // The first parameter is actually not used.
      _harvest(msg.sender, 0);
      IConvexBasicRewards(CVXCRV_STAKING).withdraw(totalUnderlying(), false);
      _withdrawable = IERC20Upgradeable(CVXCRV).balanceOf(address(this));
    } else {
      // Otherwise compute share and unstake
      _withdrawable = _amount;
      // Substract a small withdrawal fee to prevent users "timing"
      // the harvests. The fee stays staked and is therefore
      // redistributed to all remaining participants.
      uint256 _withdrawFee = (_withdrawable * withdrawFeePercentage) / FEE_DENOMINATOR;
      _withdrawable = _withdrawable - _withdrawFee; // never overflow here
      IConvexBasicRewards(CVXCRV_STAKING).withdraw(_withdrawable, false);
    }
    return _withdrawable;
  }

  function _withdrawAs(
    address _recipient,
    uint256 _amount,
    uint256 _minimumOut,
    WithdrawOption _option
  ) internal returns (uint256) {
    if (_option == WithdrawOption.WithdrawAndStake) {
      // simply stake the cvxCRV for _recipient
      require(_amount >= _minimumOut, "AladdinCRV: insufficient output");
      IERC20Upgradeable(CVXCRV).safeApprove(CVXCRV_STAKING, 0);
      IERC20Upgradeable(CVXCRV).safeApprove(CVXCRV_STAKING, _amount);
      require(IConvexBasicRewards(CVXCRV_STAKING).stakeFor(_recipient, _amount), "AladdinCRV: stakeFor failed");
    } else if (_option == WithdrawOption.WithdrawAsCRV) {
      _amount = _zapToken(_amount, CVXCRV, _minimumOut, CRV);
      IERC20Upgradeable(CRV).safeTransfer(_recipient, _amount);
    } else if (_option == WithdrawOption.WithdrawAsETH) {
      _amount = _zapToken(_amount, CVXCRV, _minimumOut, address(0));

      // solhint-disable-next-line avoid-low-level-calls
      (bool success, ) = _recipient.call{ value: _amount }("");
      require(success, "AladdinCRV: ETH transfer failed");
    } else if (_option == WithdrawOption.WithdrawAsCVX) {
      _amount = _zapToken(_amount, CVXCRV, _minimumOut, CVX);
      IERC20Upgradeable(CVX).safeTransfer(_recipient, _amount);
    } else {
      revert("AladdinCRV: unsupported option");
    }
    return _amount;
  }

  function _harvest(address _recipient, uint256 _minimumOut) internal returns (uint256) {
    IConvexBasicRewards(CVXCRV_STAKING).getReward();
    // 1. CVX => ETH
    uint256 _amount = _zapToken(IERC20Upgradeable(CVX).balanceOf(address(this)), CVX, 0, address(0));
    // 2. 3CRV => USDT => ETH
    _amount += _zapToken(IERC20Upgradeable(THREE_CRV).balanceOf(address(this)), THREE_CRV, 0, address(0));
    // 3. ETH => CRV
    _amount = _zapToken(_amount, address(0), 0, CRV);
    // 3. CRV => cvxCRV (stake or swap)
    _zapToken(_amount, CRV, _amount, CVXCRV);

    _amount = IERC20Upgradeable(CVXCRV).balanceOf(address(this));
    require(_amount >= _minimumOut, "AladdinCRV: insufficient rewards");

    emit Harvest(msg.sender, _amount);

    uint256 _totalSupply = totalSupply();
    if (_amount > 0 && _totalSupply > 0) {
      uint256 _stakeAmount = _amount;
      uint256 _platformFee = platformFeePercentage;
      uint256 _harvestBounty = harvestBountyPercentage;
      if (_platformFee > 0) {
        _platformFee = (_platformFee * _stakeAmount) / FEE_DENOMINATOR;
        _stakeAmount = _stakeAmount - _platformFee; // never overflow here
      }
      if (_harvestBounty > 0) {
        _harvestBounty = (_harvestBounty * _stakeAmount) / FEE_DENOMINATOR;
        _stakeAmount = _stakeAmount - _harvestBounty; // never overflow here
      }
      // This is the amount of underlying after staking harvested rewards.
      uint256 _underlying = totalUnderlying() + _stakeAmount;
      // This is the share for platform fee.
      _platformFee = (_platformFee * _totalSupply) / _underlying;
      // This is the share for harvest bounty.
      _harvestBounty = (_harvestBounty * _totalSupply) / _underlying;

      IERC20Upgradeable(CVXCRV).safeApprove(CVXCRV_STAKING, 0);
      IERC20Upgradeable(CVXCRV).safeApprove(CVXCRV_STAKING, _amount);
      IConvexBasicRewards(CVXCRV_STAKING).stake(_amount);
      _mint(platform, _platformFee);
      _mint(_recipient, _harvestBounty);
    }
    return _amount;
  }

  function _zapToken(
    uint256 _amount,
    address _fromToken,
    uint256 _minimumOut,
    address _toToken
  ) internal returns (uint256) {
    if (_amount == 0) return 0;

    // solhint-disable-next-line avoid-low-level-calls
    (bool success, bytes memory data) = zap.delegatecall(
      abi.encodeWithSignature("zap(address,uint256,address,uint256)", _fromToken, _amount, _toToken, _minimumOut)
    );
    require(success, "AladdinCRV: zap failed");
    return abi.decode(data, (uint256));
  }

  receive() external payable {}
}

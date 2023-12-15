// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { LiquidityGauge } from "./LiquidityGauge.sol";

import { ISharedLiquidityGauge } from "../../../interfaces/voting-escrow/ISharedLiquidityGauge.sol";
import { IVotingEscrow } from "../../../interfaces/voting-escrow/IVotingEscrow.sol";
import { IVotingEscrowProxy } from "../../../interfaces/voting-escrow/IVotingEscrowProxy.sol";

contract SharedLiquidityGauge is LiquidityGauge, ISharedLiquidityGauge {
  /*************
   * Constants *
   *************/

  /// @notice The address of `VotingEscrowProxy` contract.
  address public immutable veProxy;

  /*************
   * Variables *
   *************/

  /// @inheritdoc ISharedLiquidityGauge
  mapping(address => uint256) public override sharedBalanceOf;

  /// @notice Mapping from owner address to staker address to the vote sharing status.
  mapping(address => mapping(address => bool)) public isStakerAllowed;

  /// @notice Mapping from owner address to the number of stakers who accepts the sharing.
  mapping(address => uint256) public numAcceptedStakers;

  /// @notice Mapping from staker address to owner address.
  mapping(address => address) private _stakerVoteOwner;

  constructor(address _minter, address _veProxy) LiquidityGauge(_minter) {
    veProxy = _veProxy;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc ISharedLiquidityGauge
  function getStakerVoteOwner(address _account) external view override returns (address) {
    return _stakerVoteOwner[_account];
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ISharedLiquidityGauge
  function toggleVoteSharing(address _staker) external override {
    address _owner = _msgSender();
    if (_staker == _owner) {
      revert SelfSharingIsNotAllowed();
    }
    if (_stakerVoteOwner[_owner] != address(0)) {
      revert CascadedSharingIsNotAllowed();
    }

    if (isStakerAllowed[_owner][_staker]) {
      isStakerAllowed[_owner][_staker] = false;

      emit CancelShareVote(_owner, _staker);
    } else {
      isStakerAllowed[_owner][_staker] = true;

      emit ShareVote(_owner, _staker);
    }

    if (_stakerVoteOwner[_staker] == _owner) {
      unchecked {
        sharedBalanceOf[_owner] -= balanceOf(_staker);
        numAcceptedStakers[_owner] -= 1;
      }
      _stakerVoteOwner[_staker] = address(0);

      emit AcceptSharedVote(_staker, _owner, address(0));
    }
  }

  /// @inheritdoc ISharedLiquidityGauge
  function acceptSharedVote(address _newOwner) external override {
    address _staker = _msgSender();
    if (!isStakerAllowed[_newOwner][_staker]) {
      revert VoteShareNotAllowed();
    }

    if (numAcceptedStakers[_staker] > 0) {
      revert CascadedSharingIsNotAllowed();
    }

    address _oldOwner = _stakerVoteOwner[_staker];
    uint256 _balance = balanceOf(_staker);
    if (_oldOwner != address(0)) {
      unchecked {
        sharedBalanceOf[_oldOwner] -= _balance;
        numAcceptedStakers[_oldOwner] -= 1;
      }
    }
    unchecked {
      sharedBalanceOf[_newOwner] += _balance;
      numAcceptedStakers[_newOwner] += 1;
    }
    _stakerVoteOwner[_staker] = _newOwner;

    emit AcceptSharedVote(_staker, _oldOwner, _newOwner);
  }

  /// @inheritdoc ISharedLiquidityGauge
  function rejectSharedVote() external override {
    address _staker = _msgSender();
    address _owner = _stakerVoteOwner[_staker];
    if (_owner == address(0)) revert NoAcceptedSharedVote();

    unchecked {
      sharedBalanceOf[_owner] -= balanceOf(_staker);
      numAcceptedStakers[_owner] -= 1;
    }
    _stakerVoteOwner[_staker] = address(0);

    emit AcceptSharedVote(_staker, _owner, address(0));
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc LiquidityGauge
  function _beforeTokenTransfer(
    address _from,
    address _to,
    uint256 _amount
  ) internal virtual override {
    if (_from != address(0) && _amount > 0) {
      address _ownerFrom = _stakerVoteOwner[_from];
      if (_ownerFrom != address(0)) {
        unchecked {
          sharedBalanceOf[_ownerFrom] -= _amount;
        }
      }
    }

    if (_to != address(0) && _amount > 0) {
      address _ownerTo = _stakerVoteOwner[_to];
      if (_ownerTo != address(0)) {
        unchecked {
          sharedBalanceOf[_ownerTo] += _amount;
        }
      }
    }

    // no need to checkpoint on mint or burn or transfer to self
    if (_from == address(0) || _to == address(0) || _from == _to || _amount == 0) return;

    // check reentrancy on transfer or transferFrom
    require(!_reentrancyGuardEntered(), "ReentrancyGuard: reentrant call");

    _checkpoint(_from);
    _checkpoint(_to);
  }

  /// @inheritdoc LiquidityGauge
  function _getUserVeBalance(address _account) internal view virtual override returns (uint256) {
    return IVotingEscrowProxy(veProxy).adjustedVeBalance(_account);
  }

  /// @inheritdoc LiquidityGauge
  function _computeWorkingBalance(address _account) internal view virtual override returns (uint256) {
    address _owner = _stakerVoteOwner[_account];
    uint256 _veSupply = IVotingEscrow(ve).totalSupply();

    uint256 _balance = balanceOf(_account);
    uint256 _supply = totalSupply();

    if (_owner == address(0)) _owner = _account;
    uint256 _veBalance = _getUserVeBalance(_owner);
    uint256 _combinedBalance = balanceOf(_owner) + sharedBalanceOf[_owner];
    uint256 _workingBalance = (_combinedBalance * TOKENLESS_PRODUCTION) / 100;
    if (_veSupply > 0) {
      _workingBalance += (((_supply * _veBalance) / _veSupply) * (100 - TOKENLESS_PRODUCTION)) / 100;
    }
    if (_combinedBalance > 0) {
      _workingBalance = (_workingBalance * _balance) / _combinedBalance;
    }
    if (_workingBalance > _balance) {
      _workingBalance = _balance;
    }

    return _workingBalance;
  }
}

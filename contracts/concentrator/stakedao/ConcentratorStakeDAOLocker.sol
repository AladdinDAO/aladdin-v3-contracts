// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { MerkleProofUpgradeable } from "@openzeppelin/contracts-upgradeable/cryptography/MerkleProofUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import { IConcentratorStakeDAOLocker } from "../../interfaces/concentrator/IConcentratorStakeDAOLocker.sol";
import { ICurveGauge } from "../../interfaces/ICurveGauge.sol";
import { IMultiMerkleStash } from "../../interfaces/IMultiMerkleStash.sol";
import { ISnapshotDelegateRegistry } from "../../interfaces/ISnapshotDelegateRegistry.sol";
import { ISignatureVerifier } from "../../voting/ISignatureVerifier.sol";

/// @title ConcentratorStakeDAOLocker
/// @notice This contract is the main entry for stake tokens in StakeDAO.
contract ConcentratorStakeDAOLocker is OwnableUpgradeable, IConcentratorStakeDAOLocker {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the operator for gauge is updated.
  /// @param _gauge The address of gauge updated.
  /// @param _operator The address of operator updated.
  event UpdateOperator(address _gauge, address _operator);

  /// @notice Emitted when the status of executor is updated.
  /// @param _executor The address of executor updated.
  /// @param _status The status of executor updated.
  event UpdateExecutor(address _executor, bool _status);

  /// @notice Emitted when claimer for sdCRV bribe rewards is updated.
  /// @param _claimer The address of claimer updated.
  event UpdateClaimer(address _claimer);

  /// @notice Emitted when the reward receiver is updated.
  event UpdateGaugeRewardReceiver(address indexed gauge, address indexed oldReceiver, address indexed newReceiver);

  /*************
   * Constants *
   *************/

  /// @dev The address of StakeDAO MultiMerkleStash contract.
  address private constant MULTI_MERKLE_STASH = 0x03E34b085C52985F6a5D27243F20C84bDdc01Db4;

  /*************
   * Variables *
   *************/

  /// @notice Mapping from gauge address to operator address.
  mapping(address => address) public operators;

  /// @notice Whether the address is an executor.
  mapping(address => bool) public executors;

  /// @notice The address of sdCRV bribe rewards claimer.
  address public claimer;

  /// @notice The sdCRV bribe claim status for token => merkleRoot mapping.
  mapping(address => mapping(bytes32 => bool)) public claimed;

  /// @notice The address of SignatureVerifier contract.
  ISignatureVerifier public verifier;

  /*************
   * Modifiers *
   *************/

  modifier onlyOperator(address _gauge) {
    require(operators[_gauge] == msg.sender, "not operator");
    _;
  }

  modifier onlyExecutor() {
    require(executors[msg.sender], "not executor");
    _;
  }

  /***************
   * Constructor *
   ***************/

  function initialize() external initializer {
    OwnableUpgradeable.__Ownable_init();
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Should return whether the signature provided is valid for the provided hash
  /// @dev See https://eips.ethereum.org/EIPS/eip-1271 for more details.
  /// @param _hash      Hash of the data to be signed
  /// @param _signature Signature byte array associated with _hash
  ///
  /// MUST return the bytes4 magic value 0x1626ba7e when function passes.
  /// MUST NOT modify state (using STATICCALL for solc < 0.5, view modifier for solc > 0.5)
  /// MUST allow external calls
  function isValidSignature(bytes32 _hash, bytes calldata _signature) external view returns (bytes4) {
    // Validate signatures
    if (verifier.verifySignature(_hash, _signature) == true) {
      return 0x1626ba7e;
    } else {
      return 0xffffffff;
    }
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IConcentratorStakeDAOLocker
  function deposit(address _gauge, address _token) external override onlyOperator(_gauge) returns (uint256 _amount) {
    _amount = IERC20Upgradeable(_token).balanceOf(address(this));
    if (_amount > 0) {
      IERC20Upgradeable(_token).safeApprove(_gauge, 0);
      IERC20Upgradeable(_token).safeApprove(_gauge, _amount);
      // deposit without claiming rewards
      ICurveGauge(_gauge).deposit(_amount);
    }
  }

  /// @inheritdoc IConcentratorStakeDAOLocker
  function withdraw(
    address _gauge,
    address _token,
    uint256 _amount,
    address _recipient
  ) external override onlyOperator(_gauge) {
    uint256 _balance = IERC20Upgradeable(_token).balanceOf(address(this));
    if (_balance < _amount) {
      // withdraw without claiming rewards
      ICurveGauge(_gauge).withdraw(_amount - _balance);
    }
    IERC20Upgradeable(_token).safeTransfer(_recipient, _amount);
  }

  /// @inheritdoc IConcentratorStakeDAOLocker
  function claimRewards(address _gauge, address[] calldata _tokens)
    external
    override
    onlyOperator(_gauge)
    returns (uint256[] memory _amounts)
  {
    uint256 _length = _tokens.length;
    _amounts = new uint256[](_length);
    // record balances before to make sure only claimed delta tokens will be transfered.
    for (uint256 i = 0; i < _length; i++) {
      _amounts[i] = IERC20Upgradeable(_tokens[i]).balanceOf(address(this));
    }
    // This will claim all rewards including SDT.
    ICurveGauge(_gauge).claim_rewards();
    for (uint256 i = 0; i < _length; i++) {
      _amounts[i] = IERC20Upgradeable(_tokens[i]).balanceOf(address(this)) - _amounts[i];
      if (_amounts[i] > 0) {
        IERC20Upgradeable(_tokens[i]).safeTransfer(msg.sender, _amounts[i]);
      }
    }
  }

  /// @inheritdoc IConcentratorStakeDAOLocker
  function claimBribeRewards(IMultiMerkleStash.claimParam[] memory _claims, address _recipient) external override {
    require(msg.sender == claimer, "only bribe claimer");
    uint256 _length = _claims.length;
    // 1. claim bribe rewards from StakeDAOMultiMerkleStash
    for (uint256 i = 0; i < _length; i++) {
      // in case someone has claimed the reward for this contract, we can still call this function to process reward.
      if (!IMultiMerkleStash(MULTI_MERKLE_STASH).isClaimed(_claims[i].token, _claims[i].index)) {
        IMultiMerkleStash(MULTI_MERKLE_STASH).claim(
          _claims[i].token,
          _claims[i].index,
          address(this),
          _claims[i].amount,
          _claims[i].merkleProof
        );
      } else {
        bytes32 root = IMultiMerkleStash(MULTI_MERKLE_STASH).merkleRoot(_claims[i].token);
        bytes32 node = keccak256(abi.encodePacked(_claims[i].index, address(this), _claims[i].amount));
        require(MerkleProofUpgradeable.verify(_claims[i].merkleProof, root, node), "invalid merkle proof");
      }
    }

    // 2. transfer bribe rewards to _recipient
    for (uint256 i = 0; i < _length; i++) {
      address _token = _claims[i].token;
      bytes32 _root = IMultiMerkleStash(MULTI_MERKLE_STASH).merkleRoot(_token);
      require(!claimed[_token][_root], "bribe rewards claimed");

      IERC20Upgradeable(_token).safeTransfer(_recipient, _claims[i].amount);
      claimed[_token][_root] = true;
    }
  }

  /// @notice External function to execute anycall.
  /// @param _to The address of target contract to call.
  /// @param _value The value passed to the target contract.
  /// @param _data The calldata pseed to the target contract.
  function execute(
    address _to,
    uint256 _value,
    bytes calldata _data
  ) external onlyExecutor returns (bool, bytes memory) {
    // solhint-disable avoid-low-level-calls
    (bool success, bytes memory result) = _to.call{ value: _value }(_data);
    return (success, result);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the operator for StakeDAO gauge.
  /// @param _gauge The address of gauge to update.
  /// @param _operator The address of operator to update.
  function updateOperator(address _gauge, address _operator) external onlyOwner {
    operators[_gauge] = _operator;

    emit UpdateOperator(_gauge, _operator);
  }

  /// @notice Update the reward receiver for the given gauge.
  /// @param _gauge The address of gauge to update.
  /// @param _newReceiver The address of reward receiver to update.
  function updateGaugeRewardReceiver(address _gauge, address _newReceiver) external onlyOwner {
    address _oldReceiver = ICurveGauge(_gauge).rewards_receiver(address(this));
    ICurveGauge(_gauge).set_rewards_receiver(_newReceiver);

    emit UpdateGaugeRewardReceiver(_gauge, _oldReceiver, _newReceiver);
  }

  /// @notice Update the executor.
  /// @param _executor The address of executor to update.
  /// @param _status The status of executor to update.
  function updateExecutor(address _executor, bool _status) external onlyOwner {
    executors[_executor] = _status;

    emit UpdateExecutor(_executor, _status);
  }

  /// @notice Update the claimer for StakeDAO sdCRV bribe rewards.
  /// @param _claimer The address of claimer to update.
  function updateClaimer(address _claimer) external onlyOwner {
    claimer = _claimer;

    emit UpdateClaimer(_claimer);
  }

  /// @dev delegate sdCRV voting power.
  /// @param _registry The address of Snapshot Delegate Registry.
  /// @param _id The id for which the delegate should be set.
  /// @param _delegate The address of the delegate.
  function delegate(
    address _registry,
    bytes32 _id,
    address _delegate
  ) external onlyOwner {
    ISnapshotDelegateRegistry(_registry).setDelegate(_id, _delegate);
  }

  /// @notice Update the address of SignatureVerifier contract.
  /// @param _verifier The address of new SignatureVerifier contract.
  function updateVerifier(address _verifier) external onlyOwner {
    verifier = ISignatureVerifier(_verifier);
  }
}

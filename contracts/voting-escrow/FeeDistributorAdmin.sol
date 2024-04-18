// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { AccessControl } from "@openzeppelin/contracts-v4/access/AccessControl.sol";

import { IFeeDistributor } from "../interfaces/voting-escrow/IFeeDistributor.sol";

contract FeeDistributorAdmin is AccessControl {
  /*************
   * Constants *
   *************/

  /// @notice The role for fee distributor
  bytes32 public constant FEE_DISTRIBUTOR_ROLE = keccak256("FEE_DISTRIBUTOR_ROLE");

  /// @notice The role for checkpoint caller.
  bytes32 public constant CHECKPOINT_ROLE = keccak256("CHECKPOINT_ROLE");

  /***************
   * Constructor *
   ***************/

  constructor() {
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Update the token checkpoint
  function checkpoint(address _distributor) external onlyRole(CHECKPOINT_ROLE) {
    IFeeDistributor(_distributor).checkpoint_token();
  }

  /// @notice Commit transfer of ownership
  /// @param _newAdmin New admin address
  function transferAdmin(address _distributor, address _newAdmin) external onlyRole(DEFAULT_ADMIN_ROLE) {
    IFeeDistributor(_distributor).commit_admin(_newAdmin);
    IFeeDistributor(_distributor).apply_admin();
  }

  /// @notice Toggle permission for checkpointing by any account
  function toggleAllowCheckpointToken(address _distributor) external onlyRole(DEFAULT_ADMIN_ROLE) {
    IFeeDistributor(_distributor).toggle_allow_checkpoint_token();
  }

  /// @notice Kill the contract
  /// @dev Killing transfers the entire 3CRV balance to the emergency return address
  ///      and blocks the ability to claim or burn. The contract cannot be unkilled.
  function killDistributor(address _distributor) external onlyRole(DEFAULT_ADMIN_ROLE) {
    IFeeDistributor(_distributor).kill_me();
  }

  /// @notice Recover ERC20 tokens from this contract
  /// @dev Tokens are sent to the emergency return address.
  /// @param _coin Token address
  /// @return bool success
  function recoverBalance(address _distributor, address _coin) external onlyRole(DEFAULT_ADMIN_ROLE) returns (bool) {
    return IFeeDistributor(_distributor).recover_balance(_coin);
  }
}

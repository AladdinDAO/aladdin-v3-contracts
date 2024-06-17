// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { Ownable2Step } from "@openzeppelin/contracts-v4/access/Ownable2Step.sol";

import { IVotingEscrow } from "../interfaces/voting-escrow/IVotingEscrow.sol";
import { IVotingEscrowBoost } from "../interfaces/voting-escrow/IVotingEscrowBoost.sol";
import { IVotingEscrowProxy } from "../interfaces/voting-escrow/IVotingEscrowProxy.sol";

contract VotingEscrowProxy is Ownable2Step, IVotingEscrowProxy {
  /*************
   * Constants *
   *************/

  /// @notice The address of VotingEscrow contract.
  address public immutable ve;

  /*************
   * Variables *
   *************/

  /// @inheritdoc IVotingEscrowProxy
  address public override veBoost;

  /***************
   * Constructor *
   ***************/

  constructor(address _ve) {
    ve = _ve;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IVotingEscrowProxy
  function adjustedVeBalance(address _account) external view override returns (uint256) {
    address _veBoost = veBoost;
    if (_veBoost == address(0)) {
      return IVotingEscrow(ve).balanceOf(_account);
    } else {
      return IVotingEscrowBoost(_veBoost).balanceOf(_account);
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the address of VotingEscrowBoost contract.
  /// @param _newVeBoost The address of new VotingEscrowBoost contract.
  function updateVeBoost(address _newVeBoost) external onlyOwner {
    // call `balanceOf` to make sure it works
    IVotingEscrowBoost(_newVeBoost).balanceOf(msg.sender);

    address _oldVeBoost = veBoost;
    veBoost = _newVeBoost;

    emit UpdateVeBoost(_oldVeBoost, _newVeBoost);
  }

  /// @notice Reset the address VotingEscrowBoost contract.
  function resetVeBoost() external onlyOwner {
    address _oldVeBoost = veBoost;
    veBoost = address(0);

    emit UpdateVeBoost(_oldVeBoost, address(0));
  }
}

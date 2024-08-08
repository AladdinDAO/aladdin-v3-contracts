// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { AccessControl } from "@openzeppelin/contracts-v4/access/AccessControl.sol";

import { IConcentratorStakeDAOLocker } from "../../interfaces/concentrator/IConcentratorStakeDAOLocker.sol";
import { IMultiMerkleStash } from "../../interfaces/IMultiMerkleStash.sol";

contract StakeDAOBribeClaimer is AccessControl {
  bytes32 public constant BRIBE_RECEIVER_ROLE = keccak256("BRIBE_RECEIVER_ROLE");

  /// @notice The address of `StakeDAOLockerProxy` contract.
  address private constant LOCKER = 0x1c0D72a330F2768dAF718DEf8A19BAb019EEAd09;

  constructor() {
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  function claim(IMultiMerkleStash.claimParam[] memory claims, address receiver)
    external
    onlyRole(BRIBE_RECEIVER_ROLE)
  {
    IConcentratorStakeDAOLocker(LOCKER).claimBribeRewards(claims, receiver);
  }
}

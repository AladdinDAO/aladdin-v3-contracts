// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/cryptography/ECDSA.sol";

// solhint-disable reason-string

/// @dev modify from https://etherscan.io/address/0xc9c7C0eAE2d6c6244814467f7718407e2571487D
contract SignatureVerifier is Ownable {
  mapping(address => bool) public approvedTeam;

  constructor() {
    approvedTeam[msg.sender] = true;
  }

  function modifyTeam(address _member, bool _approval) public onlyOwner {
    approvedTeam[_member] = _approval;
  }

  function verifySignature(bytes32 _hash, bytes memory _signature) public view returns (bool) {
    address signer = ECDSA.recover(_hash, _signature);
    return approvedTeam[signer];
  }
}

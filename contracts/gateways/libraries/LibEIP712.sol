// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { ECDSA } from "@openzeppelin/contracts-v4/utils/cryptography/ECDSA.sol";

library LibEIP712 {
  /*************
   * Constants *
   *************/

  bytes32 private constant _TYPE_HASH =
    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

  /// @dev The storage slot for gateway storage.
  bytes32 private constant GATEWAY_STORAGE_POSITION = keccak256("diamond.eip712.storage");

  /***********
   * Structs *
   ***********/

  struct EIP712Storage {
    string name;
    string version;
    bytes32 hashedName;
    bytes32 hashedVersion;
    bytes32 domainSeparator;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Return the EIP712Storage reference.
  function eip712Storage() internal pure returns (EIP712Storage storage es) {
    bytes32 position = GATEWAY_STORAGE_POSITION;
    assembly {
      es.slot := position
    }
  }

  function initialize(string memory name, string memory version) internal {
    bytes32 _hashedName = keccak256(bytes(name));
    bytes32 _hashedVersion = keccak256(bytes(version));

    EIP712Storage storage es = eip712Storage();
    es.name = name;
    es.version = version;
    es.hashedName = _hashedName;
    es.hashedVersion = _hashedVersion;
    es.domainSeparator = keccak256(abi.encode(_TYPE_HASH, _hashedName, _hashedVersion, block.chainid, address(this)));
  }

  /// @dev Returns the domain separator for the current chain.
  function domainSeparatorV4() internal view returns (bytes32) {
    return eip712Storage().domainSeparator;
  }

  /// @dev Given an already https://eips.ethereum.org/EIPS/eip-712#definition-of-hashstruct[hashed struct], this
  /// function returns the hash of the fully encoded EIP712 message for this domain.
  ///
  /// This hash can be used together with {ECDSA-recover} to obtain the signer of a message. For example:
  ///
  /// ```solidity
  /// bytes32 digest = hashTypedDataV4(keccak256(abi.encode(
  ///     keccak256("Mail(address to,string contents)"),
  ///     mailTo,
  ///     keccak256(bytes(mailContents))
  /// )));
  /// address signer = ECDSA.recover(digest, signature);
  /// ```
  function hashTypedDataV4(bytes32 structHash) internal view returns (bytes32) {
    return ECDSA.toTypedDataHash(domainSeparatorV4(), structHash);
  }

  /// @dev See {EIP-5267}.
  function eip712Domain()
    internal
    view
    returns (
      bytes1 fields,
      string memory name,
      string memory version,
      uint256 chainId,
      address verifyingContract,
      bytes32 salt,
      uint256[] memory extensions
    )
  {
    EIP712Storage storage es = eip712Storage();
    // If the hashed name and version in storage are zero, the contract hasn't been properly initialized
    // and the EIP712 domain is not reliable, as it will be missing name and version.
    require(es.hashedName != 0 && es.hashedVersion != 0, "EIP712: Uninitialized");

    return (
      hex"0f", // 01111
      es.name,
      es.version,
      block.chainid,
      address(this),
      bytes32(0),
      new uint256[](0)
    );
  }
}

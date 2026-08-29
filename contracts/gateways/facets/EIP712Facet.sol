// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { LibDiamond } from "../../common/EIP2535/libraries/LibDiamond.sol";
import { LibEIP712 } from "../libraries/LibEIP712.sol";

contract EIP712Facet {
  /*************************
   * Public View Functions *
   *************************/

  /// @dev See {EIP-5267}.
  function eip712Domain()
    external
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
    return LibEIP712.eip712Domain();
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  function initializeEIP712(string memory name, string memory version) external {
    LibDiamond.enforceIsContractOwner();
    LibEIP712.initialize(name, version);
  }
}

// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CLeverVeCRV is ERC20 {
  /*************
   * Variables *
   *************/

  address public minter;

  /**********************
   * Function Modifiers *
   **********************/

  modifier onlyMinter() {
    require(msg.sender == minter, "not minter");
    _;
  }

  /***************
   * Constructor *
   ***************/

  constructor() ERC20("CLever veCRV", "cveCRV") {
    minter = msg.sender;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Update the address of minter.
  /// @param _minter The address of new minter.
  function setMinter(address _minter) external onlyMinter {
    minter = _minter;
  }

  /// @notice Mint some token to some user.
  /// @param _to The address of user.
  /// @param _amount The amount of token to mint.
  function mint(address _to, uint256 _amount) external onlyMinter {
    _mint(_to, _amount);
  }

  /// @notice Burn some token from some user.
  /// @param _from The address of user.
  /// @param _amount The amount of token to burn.
  function burn(address _from, uint256 _amount) external onlyMinter {
    _burn(_from, _amount);
  }
}

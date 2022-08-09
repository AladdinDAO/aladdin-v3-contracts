// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockYieldToken is ERC20 {
  address public token;

  constructor(
    address _token,
    string memory _name,
    string memory _symbol
  ) ERC20(_name, _symbol) {
    token = _token;
  }

  function deposit(uint256 _amount) external returns (uint256) {
    address _token = token;
    uint256 _supply = totalSupply();
    uint256 _balance = IERC20(_token).balanceOf(address(this));
    uint256 _scale = 10**(18 - ERC20(_token).decimals());

    IERC20(_token).transferFrom(msg.sender, address(this), _amount);

    uint256 _share;
    if (_supply == 0) {
      _share = _amount * _scale;
    } else {
      _share = (_amount * _supply) / _balance;
    }

    _mint(msg.sender, _share);

    return _share;
  }

  function withdraw(uint256 _share) external returns (uint256) {
    address _token = token;
    uint256 _supply = totalSupply();
    uint256 _balance = IERC20(_token).balanceOf(address(this));
    uint256 _amount = (_share * _balance) / _supply;

    _burn(msg.sender, _share);
    IERC20(_token).transfer(msg.sender, _amount);
    return _amount;
  }
}

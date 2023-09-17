// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";

interface SmartWalletChecker {
  function check(address) external view returns (bool);
}

// copy from https://etherscan.io/address/0xca719728ef172d0961768581fdf35cb116e0b7a4
contract SmartWalletWhitelist is Ownable {
  mapping(address => bool) public wallets;
  address public checker;
  address public future_checker;

  event ApproveWallet(address);
  event RevokeWallet(address);

  constructor() {}

  function commitSetChecker(address _checker) external onlyOwner {
    future_checker = _checker;
  }

  function applySetChecker() external onlyOwner {
    checker = future_checker;
  }

  function approveWallet(address _wallet) public onlyOwner {
    wallets[_wallet] = true;

    emit ApproveWallet(_wallet);
  }

  function revokeWallet(address _wallet) external onlyOwner {
    wallets[_wallet] = false;

    emit RevokeWallet(_wallet);
  }

  function check(address _wallet) external view returns (bool) {
    bool _check = wallets[_wallet];
    if (_check) {
      return _check;
    } else {
      if (checker != address(0)) {
        return SmartWalletChecker(checker).check(_wallet);
      }
    }
    return false;
  }
}

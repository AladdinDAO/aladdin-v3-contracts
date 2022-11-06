// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./interfaces/IStakeDAOBoostDelegation.sol";

contract VeSDTDelegation is OwnableUpgradeable {
  /// @dev The address of StakeDAO Vote-Escrowed Boost contract.
  address private constant veSDT_BOOST = 0x47B3262C96BB55A8D2E4F8E3Fed29D2eAB6dB6e9;

  /// @notice The address of StakeDaoLockerProxy contract.
  address public immutable stakeDAOProxy;

  /********************************** Constructor **********************************/

  constructor(address _stakeDAOProxy) {
    stakeDAOProxy = _stakeDAOProxy;
  }

  function boost(uint256 _amount, uint256 _endtime) public {
    IStakeDAOBoostDelegation(veSDT_BOOST).boost(stakeDAOProxy, _amount, _endtime, msg.sender);

    // @todo record information for reward distribution
  }

  function boostPermit(
    uint256 _amount,
    uint256 _endtime,
    uint256 _deadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external {
    // set allowance
    IStakeDAOBoostDelegation(veSDT_BOOST).permit(msg.sender, stakeDAOProxy, _amount, _deadline, _v, _r, _s);

    // do delegation
    boost(_amount, _endtime);
  }

  function claim() external {}
}

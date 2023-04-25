// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IGovernanceToken {
  function initialize(
    uint256 _initSupply,
    uint256 _initRate,
    uint256 _rateReductionCoefficient,
    address _admin,
    string memory _name,
    string memory _symbol
  ) external;
}

interface IGaugeController {
  function initialize(
    address _admin,
    address _token,
    address _ve
  ) external;
}

interface IMinter {
  function initialize(address _token, address _controller) external;
}

interface IVotingEscrow {
  function initialize(
    address _admin,
    address _token,
    string memory _name,
    string memory _symbol,
    string memory _version
  ) external;
}

contract VotingEscrowFactory is Ownable {
  function admin() external view returns (address) {
    return owner();
  }

  function deploy(
    uint256 _initSupply,
    uint256 _initRate,
    uint256 _rateReductionCoefficient,
    string memory _name,
    string memory _symbol
  ) external {}

  function deployLiquidityGauge() external {}
}

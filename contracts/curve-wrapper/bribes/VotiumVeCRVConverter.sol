// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./interfaces/IVotiumMultiMerkleStash.sol";
import "../interfaces/ICurveLockerProxy.sol";
import "../../interfaces/IZap.sol";

import "./BaseBribeConverter.sol";

contract VotiumVeCRVConverter is BaseBribeConverter {
  using SafeERC20 for IERC20;

  /*************
   * Variables *
   *************/
  /// @notice The address of Votium MultiMerkleStash contract.
  /// @dev Example: https://etherscan.io/address/0x34590960981f98b55d236b70e8b4d9929ad89c9c
  address public stash;

  /// @notice The votium bribe claim status for token => claimPeriod mapping.
  mapping(address => mapping(uint256 => bool)) public claimed;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _proxy,
    address _keeper,
    address _zap,
    address _stash
  ) BaseBribeConverter(_proxy, _keeper, _zap) {
    stash = _stash;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Convert bribe rewards to CRV.
  /// @dev Make sure that the `reward_recipient` for `proxy` in yBribe is set to this contract.
  /// @param _claims List of ClaimParams struct data to claim
  /// @return _amountCRV The amount of CRV converted.
  function convert(IVotiumMultiMerkleStash.ClaimParam[] calldata _claims, uint256 _minOut)
    external
    onlyKeeper
    returns (uint256 _amountCRV)
  {
    uint256 _length = _claims.length;
    address _stash = stash;
    for (uint256 i = 0; i < _length; i++) {
      IVotiumMultiMerkleStash.ClaimParam memory _claim = _claims[i];
      if (!IVotiumMultiMerkleStash(_stash).isClaimed(_claim.token, _claim.index)) {
        IVotiumMultiMerkleStash(_stash).claim(_claim.token, _claim.index, proxy, _claim.amount, _claim.merkleProof);
      }

      // use local bitmap to avoid request mutiple rewards from proxy.
      uint256 _claimPeriod = IVotiumMultiMerkleStash(_stash).update(_claim.token);
      if (claimed[_claim.token][_claimPeriod]) continue;
      claimed[_claim.token][_claimPeriod] = true;

      (bool _success, ) = ICurveLockerProxy(proxy).execute(
        _claim.token,
        0,
        abi.encodeWithSelector(IERC20.transfer.selector, address(this), _claim.amount)
      );
      require(_success, "transfer from proxy failed");
    }

    address _zap = zap;
    for (uint256 i = 0; i < _length; i++) {
      address _token = _claims[i].token;

      uint256 _claimed = IERC20(_token).balanceOf(address(this));
      if (_token == CRV) _amountCRV += _claimed;
      else if (_claimed > 0) {
        IERC20(_token).safeTransfer(_zap, _claimed);
        _amountCRV += IZap(_zap).zap(_token, _claimed, CRV, 0);
      }
    }
    require(_amountCRV >= _minOut, "insufficient CRV output");

    IERC20(CRV).safeTransfer(distributor, _amountCRV);

    return _amountCRV;
  }

  /*******************************
   * Public Restricted Functions *
   *******************************/

  /// @notice Update the address of Votium Multi Merkle Stash.
  /// @param _stash The address of new Votium Multi Merkle Stash contract.
  function updateStash(address _stash) external onlyOwner {
    stash = _stash;
  }
}

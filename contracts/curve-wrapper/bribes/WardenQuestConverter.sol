// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./interfaces/IWardenQuestDistributor.sol";
import "../interfaces/ICurveLockerProxy.sol";
import "../../interfaces/IZap.sol";

import "./BaseBribeConverter.sol";

contract WardenQuestConverter is BaseBribeConverter {
  using SafeERC20 for IERC20;

  /*************
   * Variables *
   *************/

  /// @notice The address of Warden Quest Multi Merkle Distributor contract.
  /// @dev Example: https://etherscan.io/address/0x3682518b529e4404fb05250F9ad590C3218E5F9f
  address public wardenDistributor;

  /// @notice The votium bribe claim status for QuestID => period mapping.
  mapping(uint256 => mapping(uint256 => bool)) public claimed;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _proxy,
    address _keeper,
    address _zap,
    address _wardenDistributor
  ) BaseBribeConverter(_proxy, _keeper, _zap) {
    wardenDistributor = _wardenDistributor;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Convert bribe rewards to CRV.
  /// @dev Make sure that the `reward_recipient` for `proxy` in yBribe is set to this contract.
  /// @param _claims List of ClaimParams struct data to claim
  /// @param _tokens The address list of reward tokens.
  /// @return _amountCRV The amount of CRV converted.
  function convert(
    IWardenQuestDistributor.ClaimParams[] calldata _claims,
    address[] calldata _tokens,
    uint256 _minOut
  ) external onlyKeeper returns (uint256 _amountCRV) {
    uint256 _length = _claims.length;
    address _wardenDistributor = wardenDistributor;
    for (uint256 i = 0; i < _length; i++) {
      IWardenQuestDistributor.ClaimParams memory _claim = _claims[i];
      if (!IWardenQuestDistributor(_wardenDistributor).isClaimed(_claim.questID, _claim.period, _claim.index)) {
        IWardenQuestDistributor(_wardenDistributor).claim(
          _claim.questID,
          _claim.period,
          _claim.index,
          proxy,
          _claim.amount,
          _claim.merkleProof
        );
      }

      // use local bitmap to avoid request mutiple rewards from proxy.
      if (claimed[_claim.questID][_claim.period]) continue;
      claimed[_claim.questID][_claim.period] = true;

      address _token = IWardenQuestDistributor(_wardenDistributor).questRewardToken(_claim.questID);
      (bool _success, ) = ICurveLockerProxy(proxy).execute(
        _token,
        0,
        abi.encodeWithSelector(IERC20.transfer.selector, address(this), _claim.amount)
      );
      require(_success, "transfer from proxy failed");
    }

    _length = _tokens.length;
    address _zap = zap;
    for (uint256 i = 0; i < _length; i++) {
      address _token = _tokens[i];

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

  /// @notice Update the address of Warden Quest Multi Merkle Distributor.
  /// @param _wardenDistributor The address of new Warden Quest Multi Merkle Distributor contract.
  function updateWardenDistributor(address _wardenDistributor) external onlyOwner {
    wardenDistributor = _wardenDistributor;
  }
}

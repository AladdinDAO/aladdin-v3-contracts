// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { AccessControl } from "@openzeppelin/contracts-v4/access/AccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IMultipleRewardDistributor } from "../../../common/rewards/distributor/IMultipleRewardDistributor.sol";
import { IConcentratorSdCrvGaugeWrapper } from "../../../interfaces/concentrator/IConcentratorSdCrvGaugeWrapper.sol";

// solhint-disable const-name-snakecase

contract SdCRVBribeBurnerV2 is AccessControl {
  using SafeERC20 for IERC20;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the amount of output token is not enough.
  ///
  /// @param token The address of the token.
  error InsufficientOutputToken(address token);

  /*************
   * Constants *
   *************/

  /// @notice The role for whitelist burner.
  bytes32 public constant WHITELIST_BURNER_ROLE = keccak256("WHITELIST_BURNER_ROLE");

  /// @dev The fee denominator used for rate calculation.
  uint256 internal constant RATE_PRECISION = 1e9;

  /// @dev The address of CRV Token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @dev The address of sdCRV Token.
  address private constant sdCRV = 0xD1b5651E55D4CeeD36251c61c50C889B36F6abB5;

  /// @dev The address of Stake DAO: SDT Token.
  address private constant SDT = 0x73968b9a57c6E53d41345FD57a6E6ae27d6CDB2F;

  /// @dev The address of VeSDTDelegation contract.
  address private constant delegator = 0x6037Bb1BBa598bf88D816cAD90A28cC00fE3ff64;

  /// @notice The address of `ConcentratorSdCrvGaugeWrapper` contract.
  address public immutable wrapper;

  /*************
   * Structs *
   *************/

  /// @notice The struct for convert parameters.
  ///
  /// @param target The address of converter contract.
  /// @param data The calldata passing to the target contract.
  /// @param minOut The minimum amount of output token should receive.
  struct ConvertParams {
    address target;
    bytes data;
    uint256 minOut;
  }

  /***************
   * Constructor *
   ***************/
  constructor(address _wrapper) {
    wrapper = _wrapper;

    // approval
    IERC20(CRV).safeApprove(_wrapper, type(uint256).max);
    IERC20(sdCRV).safeApprove(_wrapper, type(uint256).max);

    // grant role
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Burn token and send to StakeDAOCRVVault and VeSDTDelegation contract.
  /// @param token The amount of token to burn.
  /// @param convertSDT The route to convert token as SDT.
  /// @param convertCRV The route to convert token as CRV.
  function burn(
    address token,
    ConvertParams memory convertSDT,
    ConvertParams memory convertCRV
  ) external onlyRole(WHITELIST_BURNER_ROLE) {
    uint256 _balance = IERC20(token).balanceOf(address(this));
    address _platform = IConcentratorSdCrvGaugeWrapper(wrapper).treasury();
    uint256 _platformFee = IConcentratorSdCrvGaugeWrapper(wrapper).getExpenseRatio();
    uint256 _boostFee = IConcentratorSdCrvGaugeWrapper(wrapper).getBoosterRatio();

    uint256 _rewards = _balance;
    if (_platformFee > 0) {
      _platformFee = (_platformFee * _balance) / RATE_PRECISION;
      _rewards -= _platformFee;

      IERC20(token).safeTransfer(_platform, _platformFee);
    }

    if (_boostFee > 0) {
      _boostFee = (_boostFee * _balance) / RATE_PRECISION;
      _rewards -= _boostFee;

      _boostFee = _convert(token, SDT, _boostFee, convertSDT);
      IERC20(SDT).safeTransfer(delegator, _boostFee);
    }

    if (_rewards > 0) {
      // don't convert sdCRV for gas saving.
      if (token != sdCRV) {
        _rewards = _convert(token, CRV, _rewards, convertCRV);
        token = CRV;
      }
      IConcentratorSdCrvGaugeWrapper(wrapper).depositReward(token, _rewards);
    }
  }

  // solhint-disable-next-line no-empty-blocks
  receive() external payable {}

  /*******************************
   * Public Restricted Functions *
   *******************************/

  /// @notice Emergency function
  function execute(
    address _to,
    uint256 _value,
    bytes calldata _data
  ) external payable onlyRole(DEFAULT_ADMIN_ROLE) returns (bool, bytes memory) {
    // solhint-disable-next-line avoid-low-level-calls
    (bool success, bytes memory result) = _to.call{ value: _value }(_data);
    return (success, result);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to convert token with routes.
  /// @param _srcToken The address of source token.
  /// @param _dstToken The address of destination token.
  /// @param _amountIn The amount of input token.
  /// @param _params The token converting paramaters.
  /// @return _amountOut The amount of output token received.
  function _convert(
    address _srcToken,
    address _dstToken,
    uint256 _amountIn,
    ConvertParams memory _params
  ) internal returns (uint256 _amountOut) {
    if (_srcToken == _dstToken) return _amountIn;

    _amountOut = IERC20(_dstToken).balanceOf(address(this));

    IERC20(_srcToken).safeApprove(_params.target, 0);
    IERC20(_srcToken).safeApprove(_params.target, _amountIn);

    // solhint-disable-next-line avoid-low-level-calls
    (bool _success, ) = _params.target.call(_params.data);
    // below lines will propagate inner error up
    if (!_success) {
      // solhint-disable-next-line no-inline-assembly
      assembly {
        let ptr := mload(0x40)
        let size := returndatasize()
        returndatacopy(ptr, 0, size)
        revert(ptr, size)
      }
    }

    _amountOut = IERC20(_dstToken).balanceOf(address(this)) - _amountOut;
    if (_amountOut < _params.minOut) revert InsufficientOutputToken(_dstToken);
  }
}

// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

abstract contract BaseBribeConverter is Ownable {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @dev The address of CRV token.
  address internal constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @notice The address of CurveLockerProxy contract.
  address public immutable proxy;

  /*************
   * Variables *
   *************/

  /// @notice The address of keeper, which can do bribes conversion.
  address public keeper;

  /// @notice The address of zap contract.
  address public zap;

  /// @notice The address of CRV distribute contract.
  address public distributor;

  /**********************
   * Function Modifiers *
   **********************/

  modifier onlyKeeper() {
    require(msg.sender == keeper, "not keeper");
    _;
  }

  /***************
   * Constructor *
   ***************/

  constructor(
    address _proxy,
    address _keeper,
    address _zap
  ) {
    proxy = _proxy;
    keeper = _keeper;
    zap = _zap;
  }

  /*******************************
   * Public Restricted Functions *
   *******************************/

  /// @notice Update the address of keeper.
  /// @param _keeper The address of new keeper.
  function updateKeeper(address _keeper) external onlyOwner {
    keeper = _keeper;
  }

  /// @notice Update the zap contract
  /// @param _zap The address of new zap contract.
  function updateZap(address _zap) external onlyOwner {
    zap = _zap;
  }

  /// @notice Update the CRV distributor contract
  /// @param _distributor The address of new CRV distributor contract.
  function updateDistributor(address _distributor) external onlyOwner {
    distributor = _distributor;
  }

  /// @notice Rescue tokens from this contract.
  /// @param _tokens The address list of tokens to rescue.
  /// @param _recipient The address of recipient.
  function rescue(address[] memory _tokens, address _recipient) external onlyOwner {
    for (uint256 i = 0; i < _tokens.length; i++) {
      IERC20(_tokens[i]).safeTransfer(_recipient, IERC20(_tokens[i]).balanceOf(address(this)));
    }
  }
}

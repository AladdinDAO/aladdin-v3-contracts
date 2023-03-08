// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./StakeDAOCRVVault.sol";

contract SdCRVBribeBurner is Ownable {
  using SafeERC20 for IERC20;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the zap logic contract is updated.
  /// @param _oldLogic The old logic address.
  /// @param _newLogic The new logic address.
  event UpdateLogic(address _oldLogic, address _newLogic);

  /*************
   * Constants *
   *************/

  /// @notice The address of StakeDAOCRVVault contract.
  address public immutable vault;

  /// @dev The address of CRV Token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @dev The address of Stake DAO: SDT Token.
  address private constant SDT = 0x73968b9a57c6E53d41345FD57a6E6ae27d6CDB2F;

  /*************
   * Variables *
   *************/

  /// @notice Check whether an account is whitelisted.
  mapping(address => bool) public isWhitelist;

  /// @notice The address of TokenZapLogic contract.
  address public logic;

  /***************
   * Constructor *
   ***************/
  constructor(address _vault, address _logic) {
    vault = _vault;
    logic = _logic;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Burn token and send to StakeDAOCRVVault and VeSDTDelegation contract.
  /// @param token The amount of token to burn.
  /// @param routeSDT The route to convert token as SDT.
  /// @param routeCRV The route to convert token as CRV.
  function burn(
    address token,
    uint256[] memory routeSDT,
    uint256 minSDT,
    uint256[] memory routeCRV,
    uint256 minCRV
  ) external {
    require(isWhitelist[msg.sender], "only whitelist");

    uint256 _balance = IERC20(token).balanceOf(address(this));
    (address _platform, uint256 _platformPercentage, , uint256 _boostPercentage, ) = StakeDAOCRVVault(vault).feeInfo();
    if (_platformPercentage > 0) {}
  }

  // solhint-disable-next-line no-empty-blocks
  receive() external payable {}

  /*******************************
   * Public Restricted Functions *
   *******************************/

  function updateWhitelist(address _account, bool _status) external onlyOwner {
    isWhitelist[_account] = _status;
  }

  /// @notice Update zap logic contract.
  /// @param _newLogic The address to update.
  function updateLogic(address _newLogic) external onlyOwner {
    address _oldLogic = logic;
    logic = _newLogic;

    emit UpdateLogic(_oldLogic, _newLogic);
  }

  /// @notice Emergency function
  function execute(
    address _to,
    uint256 _value,
    bytes calldata _data
  ) external payable onlyOwner returns (bool, bytes memory) {
    // solhint-disable-next-line avoid-low-level-calls
    (bool success, bytes memory result) = _to.call{ value: _value }(_data);
    return (success, result);
  }

  /**********************
   * Internal Functions *
   **********************/

  function _convert(
    address _token,
    uint256 _amount,
    uint256[] memory _route
  ) internal returns (uint256) {
    if (_route.length == 0) return _amount;
  }
}

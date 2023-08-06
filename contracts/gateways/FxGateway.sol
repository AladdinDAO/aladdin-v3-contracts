// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IMarket } from "../f(x)/interfaces/IMarket.sol";

// solhint-disable contract-name-camelcase

contract FxGateway is Ownable {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @notice The address of base token.
  address public immutable baseToken;

  /// @notice The address of Fractional Token.
  address public immutable fToken;

  /// @notice The address of Leveraged Token.
  address public immutable xToken;

  /// @notice The address of Market.
  address public immutable market;

  /***********
   * Structs *
   ***********/

  struct ZapCall {
    address src;
    uint256 amount;
    address target;
    bytes data;
  }

  /*************
   * Variables *
   *************/

  /// @notice The list of approved target contracts.
  mapping(address => bool) public approvedTargets;

  /************
   * Modifier *
   ************/

  modifier zapToken(ZapCall memory _call) {
    require(approvedTargets[_call.target], "target not approved");
    _transferTokenIn(_call.src, _call.amount);

    bool _success;
    if (_call.src == address(0)) {
      (_success, ) = _call.target.call{ value: _call.amount }(_call.data);
    } else {
      IERC20(_call.src).safeApprove(_call.target, 0);
      IERC20(_call.src).safeApprove(_call.target, _call.amount);
      (_success, ) = _call.target.call(_call.data);
    }

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

    _;
  }

  /***************
   * Constructor *
   ***************/

  constructor(
    address _market,
    address _baseToken,
    address _fToken,
    address _xToken
  ) {
    baseToken = _baseToken;
    fToken = _fToken;
    xToken = _xToken;
    market = _market;

    IERC20(_baseToken).safeApprove(_market, uint256(-1));
    IERC20(_fToken).safeApprove(_market, uint256(-1));
    IERC20(_xToken).safeApprove(_market, uint256(-1));
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Mint some fToken with some ETH.
  /// @param _minFTokenMinted The minimum amount of fToken should be received.
  /// @return _fTokenMinted The amount of fToken should be received.
  function mintFToken(ZapCall memory _call, uint256 _minFTokenMinted)
    external
    payable
    zapToken(_call)
    returns (uint256 _fTokenMinted)
  {
    uint256 _amount = IERC20(baseToken).balanceOf(address(this));
    _fTokenMinted = IMarket(market).mintFToken(_amount, msg.sender, _minFTokenMinted);

    _refund(baseToken, msg.sender);
  }

  /// @notice Mint some xToken with some ETH.
  /// @param _minXTokenMinted The minimum amount of xToken should be received.
  /// @return _xTokenMinted The amount of xToken should be received.
  function mintXToken(ZapCall memory _call, uint256 _minXTokenMinted)
    external
    payable
    zapToken(_call)
    returns (uint256 _xTokenMinted)
  {
    uint256 _amount = IERC20(baseToken).balanceOf(address(this));
    _xTokenMinted = IMarket(market).mintXToken(_amount, msg.sender, _minXTokenMinted);

    _refund(baseToken, msg.sender);
  }

  /// @notice Mint some xToken by add some ETH as collateral.
  /// @param _minXTokenMinted The minimum amount of xToken should be received.
  /// @return _xTokenMinted The amount of xToken should be received.
  function addBaseToken(ZapCall memory _call, uint256 _minXTokenMinted)
    external
    payable
    zapToken(_call)
    returns (uint256 _xTokenMinted)
  {
    uint256 _amount = IERC20(baseToken).balanceOf(address(this));
    _xTokenMinted = IMarket(market).addBaseToken(_amount, msg.sender, _minXTokenMinted);

    _refund(baseToken, msg.sender);
  }

  // solhint-disable-next-line no-empty-blocks
  receive() external payable {}

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the status of a target contract.
  /// @param _target The address of target contract.
  /// @param _status The status to update.
  function updateTargetStatus(address _target, bool _status) external onlyOwner {
    approvedTargets[_target] = _status;
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

  /// @dev Internal function to transfer token to this contract.
  /// @param _token The address of token to transfer.
  /// @param _amount The amount of token to transfer.
  /// @return uint256 The amount of token transfered.
  function _transferTokenIn(address _token, uint256 _amount) internal returns (uint256) {
    if (_token == address(0)) {
      require(msg.value == _amount, "msg.value mismatch");
      return _amount;
    }

    if (_amount == uint256(-1)) {
      _amount = IERC20(_token).balanceOf(msg.sender);
    }

    if (_amount > 0) {
      IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
    }

    return _amount;
  }

  /// @dev Internal function to refund extra token.
  /// @param _token The address of token to refund.
  /// @param _recipient The address of the token receiver.
  function _refund(address _token, address _recipient) internal {
    uint256 _balance = IERC20(_token).balanceOf(address(this));

    IERC20(_token).safeTransfer(_recipient, _balance);
  }
}

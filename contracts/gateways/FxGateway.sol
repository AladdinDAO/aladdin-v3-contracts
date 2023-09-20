// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IMarket } from "../f(x)/interfaces/IMarket.sol";
import { ITokenConverter } from "../helpers/converter/ITokenConverter.sol";

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

  struct ZapInCall {
    address src;
    uint256 amount;
    address target;
    bytes data;
  }

  struct ZapOutCall {
    address converter;
    uint256[] routes;
  }

  /*************
   * Variables *
   *************/

  /// @notice The list of approved target contracts.
  mapping(address => bool) public approvedTargets;

  /************
   * Modifier *
   ************/

  modifier zapInToken(ZapInCall memory _call) {
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
  /// @return _fTokenMinted The amount of fToken received.
  function mintFToken(ZapInCall memory _call, uint256 _minFTokenMinted)
    external
    payable
    zapInToken(_call)
    returns (uint256 _fTokenMinted)
  {
    uint256 _amount = IERC20(baseToken).balanceOf(address(this));
    _fTokenMinted = IMarket(market).mintFToken(_amount, msg.sender, _minFTokenMinted);

    _refund(baseToken, msg.sender);
  }

  /// @notice Mint some xToken with some ETH.
  /// @param _minXTokenMinted The minimum amount of xToken should be received.
  /// @return _xTokenMinted The amount of xToken received.
  /// @return _bonus The amount of bonus base token received.
  function mintXToken(ZapInCall memory _call, uint256 _minXTokenMinted)
    external
    payable
    zapInToken(_call)
    returns (uint256 _xTokenMinted, uint256 _bonus)
  {
    uint256 _amount = IERC20(baseToken).balanceOf(address(this));
    (_xTokenMinted, _bonus) = IMarket(market).mintXToken(_amount, msg.sender, _minXTokenMinted);

    _refund(baseToken, msg.sender);
  }

  /// @notice Mint some xToken by add some ETH as collateral.
  /// @param _minXTokenMinted The minimum amount of xToken should be received.
  /// @return _xTokenMinted The amount of xToken received.
  function addBaseToken(ZapInCall memory _call, uint256 _minXTokenMinted)
    external
    payable
    zapInToken(_call)
    returns (uint256 _xTokenMinted)
  {
    uint256 _amount = IERC20(baseToken).balanceOf(address(this));
    _xTokenMinted = IMarket(market).addBaseToken(_amount, msg.sender, _minXTokenMinted);

    _refund(baseToken, msg.sender);
  }

  /// @notice Redeem and convert to some other token.
  /// @param _fTokenIn the amount of fToken to redeem, use `uint256(-1)` to redeem all fToken.
  /// @param _xTokenIn the amount of xToken to redeem, use `uint256(-1)` to redeem all xToken.
  /// @param _minBaseToken The minimum amount of base token should be received.
  /// @param _minDstToken The minimum amount of dst token should be received.
  /// @return _baseOut The amount of base token received.
  /// @return _dstOut The amount of dst token received.
  function redeem(
    ZapOutCall memory _call,
    uint256 _fTokenIn,
    uint256 _xTokenIn,
    uint256 _minBaseToken,
    uint256 _minDstToken
  ) external returns (uint256 _baseOut, uint256 _dstOut) {
    require(_call.routes.length > 0, "no routes");

    if (_xTokenIn == 0) {
      _fTokenIn = _transferTokenIn(fToken, _fTokenIn);
    } else {
      _xTokenIn = _transferTokenIn(xToken, _xTokenIn);
      _fTokenIn = 0;
    }

    _baseOut = IMarket(market).redeem(_fTokenIn, _xTokenIn, _call.converter, _minBaseToken);
    require(_baseOut >= _minBaseToken, "insufficient base token");

    _dstOut = _baseOut;
    for (uint256 i = 0; i < _call.routes.length; i++) {
      address _recipient = i == _call.routes.length - 1 ? msg.sender : _call.converter;
      _dstOut = ITokenConverter(_call.converter).convert(_call.routes[i], _dstOut, _recipient);
    }
    require(_dstOut >= _minDstToken, "insufficient dst token");

    if (_fTokenIn > 0) {
      _refund(fToken, msg.sender);
    }
    if (_xTokenIn > 0) {
      _refund(xToken, msg.sender);
    }
  }

  /// @notice Swap between fToken and xToken
  /// @param _amountIn The amount of input token.
  /// @param _fTokenForXToken Whether swap fToken for xToken.
  /// @param _minOut The minimum amount of token should be received.
  /// @return _amountOut The amount of token received.
  function swap(
    uint256 _amountIn,
    bool _fTokenForXToken,
    uint256 _minOut
  ) external returns (uint256 _amountOut) {
    if (_fTokenForXToken) {
      _amountIn = _transferTokenIn(fToken, _amountIn);
      uint256 _baseOut = IMarket(market).redeem(_amountIn, 0, address(this), 0);
      (_amountOut, ) = IMarket(market).mintXToken(_baseOut, msg.sender, 0);
      _refund(fToken, msg.sender);
    } else {
      _amountIn = _transferTokenIn(xToken, _amountIn);
      uint256 _baseOut = IMarket(market).redeem(0, _amountIn, address(this), 0);
      _amountOut = IMarket(market).mintFToken(_baseOut, msg.sender, 0);
      _refund(xToken, msg.sender);
    }
    require(_amountOut >= _minOut, "insufficient output");

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

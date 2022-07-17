// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../interfaces/IZap.sol";
import "../interfaces/IWETH.sol";

import "./TokenZapLogic.sol";

// solhint-disable reason-string, const-name-snakecase

/// @dev This is a general zap contract for Furnace and AladdinCVXLocker.
contract AladdinZap is OwnableUpgradeable, TokenZapLogic, IZap {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  event UpdateRoute(address indexed _fromToken, address indexed _toToken, uint256[] route);

  /// @notice Mapping from tokenIn to tokenOut to routes.
  /// @dev See {TokenZapLogic-swap} for the meaning.
  mapping(address => mapping(address => uint256[])) public routes;

  mapping(address => address) public pool2token;

  function initialize() external initializer {
    OwnableUpgradeable.__Ownable_init();
  }

  /********************************** View Functions **********************************/

  function getCurvePoolToken(PoolType, address _pool) public view override returns (address) {
    return pool2token[_pool];
  }

  /********************************** Mutated Functions **********************************/

  function zapFrom(
    address _fromToken,
    uint256 _amountIn,
    address _toToken,
    uint256 _minOut
  ) external payable returns (uint256) {
    if (_isETH(_fromToken)) {
      require(_amountIn == msg.value, "AladdinZap: amount mismatch");
    } else {
      uint256 before = IERC20Upgradeable(_fromToken).balanceOf(address(this));
      IERC20Upgradeable(_fromToken).safeTransferFrom(msg.sender, address(this), _amountIn);
      _amountIn = IERC20Upgradeable(_fromToken).balanceOf(address(this)) - before;
    }

    return zap(_fromToken, _amountIn, _toToken, _minOut);
  }

  /// @dev zap function, assume from token is already in contract.
  function zap(
    address _fromToken,
    uint256 _amountIn,
    address _toToken,
    uint256 _minOut
  ) public payable override returns (uint256) {
    uint256[] memory _routes = routes[_isETH(_fromToken) ? WETH : _fromToken][_isETH(_toToken) ? WETH : _toToken];
    require(_routes.length > 0, "AladdinZap: route unavailable");

    uint256 _amount = _amountIn;
    for (uint256 i = 0; i < _routes.length; i++) {
      _amount = swap(_routes[i], _amount);
    }
    require(_amount >= _minOut, "AladdinZap: insufficient output");
    if (_isETH(_toToken)) {
      _unwrapIfNeeded(_amount);
      // solhint-disable-next-line avoid-low-level-calls
      (bool success, ) = msg.sender.call{ value: _amount }("");
      require(success, "AladdinZap: ETH transfer failed");
    } else {
      _wrapTokenIfNeeded(_toToken, _amount);
      IERC20Upgradeable(_toToken).safeTransfer(msg.sender, _amount);
    }
    return _amount;
  }

  /********************************** Restricted Functions **********************************/

  function updateRoute(
    address _fromToken,
    address _toToken,
    uint256[] memory _routes
  ) external onlyOwner {
    delete routes[_fromToken][_toToken];

    routes[_fromToken][_toToken] = _routes;

    emit UpdateRoute(_fromToken, _toToken, _routes);
  }

  function updatePoolTokens(address[] memory _pools, address[] memory _tokens) external onlyOwner {
    require(_pools.length == _tokens.length, "AladdinZap: length mismatch");

    for (uint256 i = 0; i < _pools.length; i++) {
      pool2token[_pools[i]] = _tokens[i];
    }
  }

  function rescue(address[] memory _tokens, address _recipient) external onlyOwner {
    for (uint256 i = 0; i < _tokens.length; i++) {
      IERC20Upgradeable(_tokens[i]).safeTransfer(_recipient, IERC20Upgradeable(_tokens[i]).balanceOf(address(this)));
    }
  }
}

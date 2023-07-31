// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import { ITokenWrapper } from "./interfaces/ITokenWrapper.sol";

contract FxVault is ERC20Upgradeable, OwnableUpgradeable {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using SafeMathUpgradeable for uint256;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the address of wrapper is updated.
  /// @param oldWrapper The address of the old token wrapper.
  /// @param newWrapper The address of the new token wrapper.
  event UpdateWrapper(address indexed oldWrapper, address indexed newWrapper);

  /// @notice Emitted when the fx ratio is updated due to rebalance.
  /// @param oldFxRatio The old fx ratio, multipled by 1e18.
  /// @param newFxRatio The new fx ratio, multipled by 1e18.
  event UpdateFxRatio(uint256 oldFxRatio, uint256 newFxRatio);

  /// @notice Emitted when someone deposit tokens into this contract.
  /// @param owner The address who sends underlying asset.
  /// @param receiver The address who will receive the pool shares.
  /// @param fxAmount The amount of FX token deposited.
  /// @param lpAmount The amount of LP token deposited.
  /// @param shares The amount of vault share minted.
  event Deposit(address indexed owner, address indexed receiver, uint256 fxAmount, uint256 lpAmount, uint256 shares);

  /// @notice Emitted when someone withdraw asset from this contract.
  /// @param sender The address who call the function.
  /// @param receiver The address who will receive the assets.
  /// @param owner The address who owns the assets.
  /// @param shares The amounf of pool shares to withdraw.
  /// @param fxAmount The amount of FX token withdrawn.
  /// @param lpAmount The amount of LP token withdrawn.
  event Withdraw(
    address indexed sender,
    address indexed receiver,
    address indexed owner,
    uint256 fxAmount,
    uint256 lpAmount,
    uint256 shares
  );

  /// @notice Emitted when pool rebalance happens.
  /// @param fxBalance The total amount of FX token after rebalance.
  /// @param lpBalance The total amount of LP token after rebalance.
  event Rebalance(uint256 fxBalance, uint256 lpBalance);

  /*************
   * Constants *
   *************/

  uint256 private constant PRECISION = 1e18;

  /*************
   * Variables *
   *************/

  /// @notice The address of FX token.
  address public fxToken;

  /// @notice The address of LP token.
  address public lpToken;

  /// @notice The address of FX token and LP token wrapper contract.
  address public wrapper;

  /// @notice The ratio of FX token, multiplied by 1e18.
  /// @dev fxRatio:1-fxRatio = totalFxToken:totalLpToken.
  uint256 public fxRatio;

  /// @notice The total amount of FX token managed in this contract.
  uint256 public totalFxToken;

  /// @notice The total amount of LP token managed in this contract.
  uint256 public totalLpToken;

  /// @dev reserved slots for future usage.
  uint256[44] private __gap;

  /***************
   * Constructor *
   ***************/

  function initialize(
    address _fxToken,
    address _lpToken,
    address _wrapper,
    uint256 _fxRatio
  ) external initializer {
    require(_fxRatio <= PRECISION, "fxRatio out of bound");

    __Context_init();
    __ERC20_init("f(x) Balancer FX/ETH&FX", "FXVault");
    __Ownable_init();

    fxToken = _fxToken;
    lpToken = _lpToken;

    _updateWrapper(_wrapper);

    fxRatio = _fxRatio;
    emit UpdateFxRatio(0, _fxRatio);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit assets into this contract.
  /// @dev Make sure that the `fxToken` and `lpToken` are not fee on transfer token.
  /// @param _fxAmount The amount of FX token to deposit. Use `uint256(-1)` if user want to deposit all FX token.
  /// @param _lpAmount The amount of LP token to deposit. Use `uint256(-1)` if user want to deposit all LP token.
  /// @param _receiver The address of account who will receive the pool share.
  /// @return _shares The amount of pool shares received.
  function deposit(
    uint256 _fxAmount,
    uint256 _lpAmount,
    address _receiver
  ) external returns (uint256 _shares) {
    if (_fxAmount == uint256(-1)) {
      _fxAmount = IERC20Upgradeable(fxToken).balanceOf(msg.sender);
    }
    if (_lpAmount == uint256(-1)) {
      _lpAmount = IERC20Upgradeable(lpToken).balanceOf(msg.sender);
    }
    require(_fxAmount > 0 || _lpAmount > 0, "deposit zero amount");

    uint256 _totalSupply = totalSupply();
    uint256 _fxBalance = totalFxToken;
    uint256 _lpBalance = totalLpToken;

    if (_totalSupply == 0) {
      // use fxRatio to compute shares, fxRatio : 1 - fxRatio = fxAmount : lpAmount
      uint256 _fxRatio = fxRatio;
      if (_fxRatio == 0) {
        _shares = _lpAmount;
        _fxAmount = 0;
      } else if (_fxRatio == 1) {
        _shares = _fxAmount;
        _lpAmount = 0;
      } else {
        if (_fxAmount.mul(PRECISION - _fxRatio) <= _lpAmount.mul(_fxRatio)) {
          _lpAmount = _fxAmount.mul(PRECISION - _fxRatio).div(_fxRatio);
        } else {
          _fxAmount = _lpAmount.mul(_fxRatio).div(PRECISION - _fxRatio);
        }
        // use fx amount as initial share
        _shares = _fxAmount;
      }
    } else {
      // use existed balances to compute shares
      if (_fxBalance == 0) {
        _shares = _lpAmount.mul(_totalSupply).div(_lpBalance);
        _fxAmount = 0;
      } else if (_lpBalance == 0) {
        _shares = _fxAmount.mul(_totalSupply).div(_fxBalance);
        _lpAmount = 0;
      } else {
        uint256 _fxShares = _fxAmount.mul(_totalSupply).div(_fxBalance);
        uint256 _lpShares = _lpAmount.mul(_totalSupply).div(_lpBalance);
        if (_fxShares < _lpShares) {
          _shares = _fxShares;
          _lpAmount = _shares.mul(_lpBalance).div(_totalSupply);
        } else {
          _shares = _lpShares;
          _fxAmount = _shares.mul(_fxBalance).div(_totalSupply);
        }
      }
    }
    require(_shares > 0, "mint zero share");

    if (_fxAmount > 0) {
      totalFxToken = _fxBalance.add(_fxAmount);
    }
    if (_lpAmount > 0) {
      totalLpToken = _lpBalance.add(_lpAmount);
    }
    _mint(_receiver, _shares);

    emit Deposit(msg.sender, _receiver, _fxAmount, _lpAmount, _shares);

    _depositFxToken(msg.sender, _fxAmount);
    _depositLpToken(msg.sender, _lpAmount);
  }

  /// @notice Redeem assets from this contract.
  /// @param _shares The amount of pool shares to burn.  Use `uint256(-1)` if user want to redeem all pool shares.
  /// @param _receiver The address of account who will receive the assets.
  /// @param _owner The address of user to withdraw from.
  /// @return _fxAmount The amount of FX token withdrawn.
  /// @return _lpAmount The amount of LP token withdrawn.
  function redeem(
    uint256 _shares,
    address _receiver,
    address _owner
  ) external returns (uint256 _fxAmount, uint256 _lpAmount) {
    if (_shares == uint256(-1)) {
      _shares = balanceOf(_owner);
    }
    require(_shares > 0, "redeem zero share");

    if (msg.sender != _owner) {
      uint256 _allowance = allowance(_owner, msg.sender);
      require(_allowance >= _shares, "redeem exceeds allowance");
      if (_allowance != uint256(-1)) {
        // decrease allowance if it is not max
        _approve(_owner, msg.sender, _allowance - _shares);
      }
    }

    uint256 _totalSupply = totalSupply();
    uint256 _fxBalance = totalFxToken;
    uint256 _lpBalance = totalLpToken;

    _burn(msg.sender, _shares);

    _fxAmount = _fxBalance.mul(_shares).div(_totalSupply);
    _lpAmount = _lpBalance.mul(_shares).div(_totalSupply);

    if (_fxAmount > 0) {
      totalFxToken = _fxBalance.sub(_fxAmount);
    }
    if (_lpAmount > 0) {
      totalLpToken = _lpBalance.sub(_lpAmount);
    }

    emit Withdraw(msg.sender, _receiver, _owner, _fxAmount, _lpAmount, _shares);

    _withdrawFxToken(_fxAmount, _receiver);
    _withdrawLpToken(_lpAmount, _receiver);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Rebalance the FX token and LP token to target ratio.
  /// @param _targetFxRatio The expected target FX token ratio.
  /// @param _amount The amount of FX token to wrap or LP token to unwrap.
  /// @param _minOut The minimum amount of wrapped/unwrapped token.
  /// @return _amountOut The actual amount of wrapped/unwrapped token.
  function rebalance(
    uint256 _targetFxRatio,
    uint256 _amount,
    uint256 _minOut
  ) external onlyOwner returns (uint256 _amountOut) {
    require(_targetFxRatio <= PRECISION, "fxRatio out of bound");

    address _wrapper = wrapper;
    uint256 _oldFxRatio = fxRatio;
    uint256 _fxBalance = totalFxToken;
    uint256 _lpBalance = totalLpToken;

    if (_oldFxRatio < _targetFxRatio) {
      // we need to unwrap some LP token
      require(_amount <= _lpBalance, "insufficient LP token");
      _withdrawLpToken(_amount, _wrapper);
      _amountOut = ITokenWrapper(_wrapper).unwrap(_amount);
      _depositFxToken(address(this), _amountOut);

      _fxBalance = _fxBalance.add(_amountOut);
      _lpBalance = _lpBalance - _amount;
    } else {
      // we need to wrap some FX token
      require(_amount <= _fxBalance, "insufficient FX token");
      _withdrawFxToken(_amount, _wrapper);
      _amountOut = ITokenWrapper(_wrapper).wrap(_amount);
      _depositLpToken(address(this), _amountOut);

      _fxBalance = _fxBalance - _amount;
      _lpBalance = _lpBalance.add(_amountOut);
    }
    require(_amountOut >= _minOut, "insufficient output");

    totalFxToken = _fxBalance;
    totalLpToken = _lpBalance;

    _targetFxRatio = _fxBalance.mul(PRECISION).div(_fxBalance.add(_lpBalance));
    fxRatio = _targetFxRatio;

    emit Rebalance(_fxBalance, _lpBalance);

    emit UpdateFxRatio(_oldFxRatio, _targetFxRatio);
  }

  /// @notice Update the address of token wrapper contract.
  /// @param _newWrapper The address of new token wrapper contract.
  function updateWrapper(address _newWrapper) external onlyOwner {
    _updateWrapper(_newWrapper);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to update the wrapper contract.
  /// @param _newWrapper The address of new token wrapper contract.
  function _updateWrapper(address _newWrapper) internal {
    require(fxToken == ITokenWrapper(_newWrapper).src(), "src mismatch");
    require(lpToken == ITokenWrapper(_newWrapper).dst(), "dst mismatch");

    address _oldWrapper = wrapper;
    wrapper = _newWrapper;

    emit UpdateWrapper(_oldWrapper, _newWrapper);
  }

  /// @dev Internal function to deposit FX token to this contract.
  /// @param _sender The address of token sender.
  /// @param _amount The amount of FX token to deposit.
  function _depositFxToken(address _sender, uint256 _amount) internal virtual {
    if (_sender != address(this)) {
      IERC20Upgradeable(fxToken).safeTransferFrom(_sender, address(this), _amount);
    }
  }

  /// @dev Internal function to deposit LP token to this contract.
  /// @param _sender The address of token sender.
  /// @param _amount The amount of LP token to deposit.
  function _depositLpToken(address _sender, uint256 _amount) internal virtual {
    if (_sender != address(this)) {
      IERC20Upgradeable(lpToken).safeTransferFrom(_sender, address(this), _amount);
    }
  }

  /// @dev Internal function to withdraw FX token.
  /// @param _amount The amount of FX token to withdraw.
  /// @param _receiver The address of recipient of the FX token.
  function _withdrawFxToken(uint256 _amount, address _receiver) internal virtual {
    IERC20Upgradeable(fxToken).safeTransfer(_receiver, _amount);
  }

  /// @dev Internal function to withdraw LP token.
  /// @param _amount The amount of LP token to withdraw.
  /// @param _receiver The address of recipient of the LP token.
  function _withdrawLpToken(uint256 _amount, address _receiver) internal virtual {
    IERC20Upgradeable(lpToken).safeTransfer(_receiver, _amount);
  }
}

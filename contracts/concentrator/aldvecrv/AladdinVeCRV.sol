// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "../AladdinCompounderWithStrategy.sol";

contract AladdinVeCRV is AladdinCompounderWithStrategy {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /*************
   * Constants *
   *************/

  /// @dev The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @notice The address of AldVeCRVLiquidityStaking contract.
  address public immutable crvDepositor;

  /// @notice The address of aldveCRV token.
  address public immutable aldveCRV;

  /***************
   * Constructor *
   ***************/

  constructor(address _aldveCRV, address _crvDepositor) {
    aldveCRV = _aldveCRV;
    crvDepositor = _crvDepositor;
  }

  function initialize(
    address _zap,
    address _strategy,
    string memory _name,
    string memory _symbol
  ) external initializer {
    AladdinCompounderWithStrategy._initialize(_zap, _strategy, _name, _symbol);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IAladdinCompounder
  function asset() public view override returns (address) {
    return aldveCRV;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  function depositWithCRV(uint256 _assets, address _receiver) public returns (uint256) {
    if (_assets == uint256(-1)) {
      _assets = IERC20Upgradeable(CRV).balanceOf(msg.sender);
    }

    _distributePendingReward();

    IERC20Upgradeable(CRV).safeTransferFrom(msg.sender, address(this), _assets);

    // @todo swap or directly lock.

    return _deposit(_assets, _receiver);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc AladdinCompounderWithStrategy
  function _intermediate() internal pure override returns (address) {
    return CRV;
  }
}

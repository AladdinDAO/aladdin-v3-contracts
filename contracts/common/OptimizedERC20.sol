// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

// solhint-disable no-empty-blocks
// solhint-disable reason-string

abstract contract OptimizedERC20 is IERC20Upgradeable {
  /*************
   * Constants *
   *************/

  /// @notice The number of decimals used to get its user representation.
  // solhint-disable-next-line const-name-snakecase
  uint8 public constant decimals = 18;

  /*************
   * Variables *
   *************/

  /// @notice The name of the token.
  string public name;

  /// @notice The symbol of the token.
  string public symbol;

  /// @inheritdoc IERC20Upgradeable
  uint256 public override totalSupply;

  /// @inheritdoc IERC20Upgradeable
  mapping(address => uint256) public override balanceOf;

  /// @inheritdoc IERC20Upgradeable
  mapping(address => mapping(address => uint256)) public override allowance;

  uint256[45] private __gap;

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IERC20Upgradeable
  function approve(address spender, uint256 amount) external override returns (bool) {
    allowance[msg.sender][spender] = amount;

    emit Approval(msg.sender, spender, amount);

    return true;
  }

  /// @inheritdoc IERC20Upgradeable
  function transfer(address to, uint256 amount) external override returns (bool) {
    _transfer(msg.sender, to, amount);

    return true;
  }

  /// @inheritdoc IERC20Upgradeable
  function transferFrom(
    address from,
    address to,
    uint256 amount
  ) public override returns (bool) {
    uint256 allowed = allowance[from][msg.sender]; // Saves gas for limited approvals.
    require(amount <= allowed, "ERC20: transfer amount exceeds allowance");

    if (allowed != uint256(-1)) {
      allowance[from][msg.sender] = allowed - amount;
    }

    _transfer(from, to, amount);

    return true;
  }

  /**********************
   * Internal Functions *
   **********************/

  /**
   * @dev Hook that is called before any transfer of tokens. This includes
   * minting and burning.
   *
   * Calling conditions:
   *
   * - when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
   * will be to transferred to `to`.
   * - when `from` is zero, `amount` tokens will be minted for `to`.
   * - when `to` is zero, `amount` of ``from``'s tokens will be burned.
   * - `from` and `to` are never both zero.
   *
   * To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks].
   */
  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 amount
  ) internal virtual {}

  /**
   * @dev Moves tokens `amount` from `sender` to `recipient`.
   *
   * This is internal function is equivalent to {transfer}, and can be used to
   * e.g. implement automatic token fees, slashing mechanisms, etc.
   *
   * Emits a {Transfer} event.
   *
   * Requirements:
   *
   * - `sender` cannot be the zero address.
   * - `recipient` cannot be the zero address.
   * - `sender` must have a balance of at least `amount`.
   */
  function _transfer(
    address sender,
    address recipient,
    uint256 amount
  ) internal virtual {
    require(sender != address(0), "ERC20: transfer from the zero address");
    require(recipient != address(0), "ERC20: transfer to the zero address");

    _beforeTokenTransfer(sender, recipient, amount);

    uint256 senderBalance = balanceOf[sender];
    require(amount <= senderBalance, "ERC20: transfer amount exceeds balance");

    balanceOf[sender] = senderBalance - amount;
    balanceOf[recipient] += amount;

    emit Transfer(sender, recipient, amount);
  }

  /** @dev Creates `amount` tokens and assigns them to `account`, increasing
   * the total supply.
   *
   * Emits a {Transfer} event with `from` set to the zero address.
   *
   * Requirements:
   *
   * - `to` cannot be the zero address.
   */
  function _mint(address to, uint256 amount) internal virtual {
    require(to != address(0), "ERC20: mint to the zero address");

    _beforeTokenTransfer(address(0), to, amount);

    totalSupply += amount;
    balanceOf[to] += amount;

    emit Transfer(address(0), to, amount);
  }

  /**
   * @dev Destroys `amount` tokens from `account`, reducing the
   * total supply.
   *
   * Emits a {Transfer} event with `to` set to the zero address.
   *
   * Requirements:
   *
   * - `account` cannot be the zero address.
   * - `account` must have at least `amount` tokens.
   */
  function _burn(address from, uint256 amount) internal virtual {
    _beforeTokenTransfer(from, address(0), amount);

    uint256 _balance = balanceOf[from];
    require(amount <= _balance, "ERC20: burn amount exceeds balance");

    balanceOf[from] = _balance - amount;
    totalSupply -= amount;

    emit Transfer(from, address(0), amount);
  }
}

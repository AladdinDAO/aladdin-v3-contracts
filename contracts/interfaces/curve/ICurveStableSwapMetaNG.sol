// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface ICurveStableSwapMetaNG {
  /*************************
   * Public View Functions *
   *************************/

  function coins(uint256 index) external view returns (address);

  function last_price(uint256 index) external view returns (uint256);

  function ema_price(uint256 index) external view returns (uint256);

  function get_p(uint256 index) external view returns (uint256);

  function price_oracle(uint256 index) external view returns (uint256);

  function D_oracle() external view returns (uint256);

  function A() external view returns (uint256);

  function A_precise() external view returns (uint256);

  /// @notice Calculate the current input dx given output dy
  /// @dev Index values can be found via the `coins` public getter method
  /// @param i Index value for the coin to send
  /// @param j Index value of the coin to receive
  /// @param dy Amount of `j` being received after exchange
  /// @return Amount of `i` predicted
  function get_dx(
    int128 i,
    int128 j,
    uint256 dy
  ) external view returns (uint256);

  /// @notice Calculate the current input dx given output dy
  /// @dev Swap involves base pool tokens (either i or j should be 0);
  ///      If not, this method reverts.
  /// @param i Index value for the coin to send
  /// @param j Index value of the coin to receive
  /// @param dy Amount of `j` being received after exchange
  /// @return Amount of `i` predicted
  function get_dx_underlying(
    int128 i,
    int128 j,
    uint256 dy
  ) external view returns (uint256);

  /// @notice Calculate the current output dy given input dx
  /// @dev Index values can be found via the `coins` public getter method
  /// @param i Index value for the coin to send
  /// @param j Index value of the coin to receive
  /// @param dx Amount of `i` being exchanged
  /// @return Amount of `j` predicted
  function get_dy(
    int128 i,
    int128 j,
    uint256 dx
  ) external view returns (uint256);

  /// @notice Calculate the current output dy given input dx
  /// @dev Swap involves base pool tokens (either i or j should be 0);
  ///      If not, this method reverts.
  /// @param i Index value for the coin to send
  /// @param j Index value of the coin to receive
  /// @param dx Amount of `i` being exchanged
  /// @return Amount of `j` predicted
  function get_dy_underlying(
    int128 i,
    int128 j,
    uint256 dx
  ) external view returns (uint256);

  /// @notice Calculate the amount received when withdrawing a single coin
  /// @param burn_amount Amount of LP tokens to burn in the withdrawal
  /// @param i Index value of the coin to withdraw
  /// @return Amount of coin received
  function calc_withdraw_one_coin(uint256 burn_amount, int128 i) external view returns (uint256);

  /// @notice The current virtual price of the pool LP token
  /// @dev Useful for calculating profits.
  ///      The method may be vulnerable to donation-style attacks if implementation
  ///      contains rebasing tokens. For integrators, caution is advised.
  /// @return LP token virtual price normalized to 1e18
  function get_virtual_price() external view returns (uint256);

  /// @notice Calculate addition or reduction in token supply from a deposit or withdrawal
  /// @param amounts Amount of each coin being deposited
  /// @param is_deposit set True for deposits, False for withdrawals
  /// @return Expected amount of LP tokens received
  function calc_token_amount(uint256[2] calldata amounts, bool is_deposit) external view returns (uint256);

  /// @notice Get the current balance of a coin within the
  ///         pool, less the accrued admin fees
  /// @param i Index value for the coin to query balance of
  /// @return Token balance
  function balances(uint256 i) external view returns (uint256);

  function get_balances() external view returns (uint256[] memory);

  function stored_rates() external view returns (uint256[] memory);

  /// @notice Return the fee for swapping between `i` and `j`
  /// @param i Index value for the coin to send
  /// @param j Index value of the coin to receive
  /// @return Swap fee expressed as an integer with 1e10 precision
  function dynamic_fee(int128 i, int128 j) external view returns (uint256);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Perform an exchange between two coins
  /// @dev Index values can be found via the `coins` public getter method
  /// @param i Index value for the coin to send
  /// @param j Index value of the coin to receive
  /// @param dx Amount of `i` being exchanged
  /// @param min_dy Minimum amount of `j` to receive
  /// @return Actual amount of `j` received
  function exchange(
    int128 i,
    int128 j,
    uint256 dx,
    uint256 min_dy
  ) external returns (uint256);

  /// @notice Perform an exchange between two coins
  /// @dev Index values can be found via the `coins` public getter method
  /// @param i Index value for the coin to send
  /// @param j Index value of the coin to receive
  /// @param dx Amount of `i` being exchanged
  /// @param min_dy Minimum amount of `j` to receive
  /// @param receiver Address that receives `j`
  /// @return Actual amount of `j` received
  function exchange(
    int128 i,
    int128 j,
    uint256 dx,
    uint256 min_dy,
    address receiver
  ) external returns (uint256);

  /// @notice Perform an exchange between two coins without transferring token in
  /// @dev The contract swaps tokens based on a change in balance of coin[i]. The
  ///      dx = ERC20(coin[i]).balanceOf(self) - self.stored_balances[i]. Users of
  ///      this method are dex aggregators, arbitrageurs, or other users who do not
  ///      wish to grant approvals to the contract: they would instead send tokens
  ///      directly to the contract and call `exchange_received`.
  ///      Note: This is disabled if pool contains rebasing tokens.
  /// @param i Index value for the coin to send
  /// @param j Index value of the coin to receive
  /// @param dx Amount of `i` being exchanged
  /// @param min_dy Minimum amount of `j` to receive
  /// @return Actual amount of `j` received
  function exchange_received(
    int128 i,
    int128 j,
    uint256 dx,
    uint256 min_dy
  ) external returns (uint256);

  /// @notice Perform an exchange between two coins without transferring token in
  /// @dev The contract swaps tokens based on a change in balance of coin[i]. The
  ///      dx = ERC20(coin[i]).balanceOf(self) - self.stored_balances[i]. Users of
  ///      this method are dex aggregators, arbitrageurs, or other users who do not
  ///      wish to grant approvals to the contract: they would instead send tokens
  ///      directly to the contract and call `exchange_received`.
  ///      Note: This is disabled if pool contains rebasing tokens.
  /// @param i Index value for the coin to send
  /// @param j Index value of the coin to receive
  /// @param dx Amount of `i` being exchanged
  /// @param min_dy Minimum amount of `j` to receive
  /// @param receiver Address that receives `j`
  /// @return Actual amount of `j` received
  function exchange_received(
    int128 i,
    int128 j,
    uint256 dx,
    uint256 min_dy,
    address receiver
  ) external returns (uint256);

  /// @notice Perform an exchange between two underlying coins
  /// @param i Index value for the underlying coin to send
  /// @param j Index value of the underlying coin to receive
  /// @param dx Amount of `i` being exchanged
  /// @param min_dy Minimum amount of `j` to receive
  /// @return Actual amount of `j` received
  function exchange_underlying(
    int128 i,
    int128 j,
    uint256 dx,
    uint256 min_dy
  ) external returns (uint256);

  /// @notice Perform an exchange between two underlying coins
  /// @param i Index value for the underlying coin to send
  /// @param j Index value of the underlying coin to receive
  /// @param dx Amount of `i` being exchanged
  /// @param min_dy Minimum amount of `j` to receive
  /// @param receiver Address that receives `j`
  /// @return Actual amount of `j` received
  function exchange_underlying(
    int128 i,
    int128 j,
    uint256 dx,
    uint256 min_dy,
    address receiver
  ) external returns (uint256);

  /// @notice Deposit coins into the pool
  /// @param amounts List of amounts of coins to deposit
  /// @param min_mint_amount Minimum amount of LP tokens to mint from the deposit
  /// @return Amount of LP tokens received by depositing
  function add_liquidity(uint256[2] calldata amounts, uint256 min_mint_amount) external returns (uint256);

  /// @notice Deposit coins into the pool
  /// @param amounts List of amounts of coins to deposit
  /// @param min_mint_amount Minimum amount of LP tokens to mint from the deposit
  /// @param receiver Address that owns the minted LP tokens
  /// @return Amount of LP tokens received by depositing
  function add_liquidity(
    uint256[2] calldata amounts,
    uint256 min_mint_amount,
    address receiver
  ) external returns (uint256);

  /// @notice Withdraw a single coin from the pool
  /// @param burn_amount Amount of LP tokens to burn in the withdrawal
  /// @param i Index value of the coin to withdraw
  /// @param min_received Minimum amount of coin to receive
  /// @return Amount of coin received
  function remove_liquidity_one_coin(
    uint256 burn_amount,
    int128 i,
    uint256 min_received
  ) external returns (uint256);

  /// @notice Withdraw a single coin from the pool
  /// @param burn_amount Amount of LP tokens to burn in the withdrawal
  /// @param i Index value of the coin to withdraw
  /// @param min_received Minimum amount of coin to receive
  /// @param receiver Address that receives the withdrawn coins
  /// @return Amount of coin received
  function remove_liquidity_one_coin(
    uint256 burn_amount,
    int128 i,
    uint256 min_received,
    address receiver
  ) external returns (uint256);

  /// @notice Withdraw coins from the pool in an imbalanced amount
  /// @param amounts List of amounts of underlying coins to withdraw
  /// @param max_burn_amount Maximum amount of LP token to burn in the withdrawal
  /// @return Actual amount of the LP token burned in the withdrawal
  function remove_liquidity_imbalance(uint256[2] calldata amounts, uint256 max_burn_amount) external returns (uint256);

  /// @notice Withdraw coins from the pool in an imbalanced amount
  /// @param amounts List of amounts of underlying coins to withdraw
  /// @param max_burn_amount Maximum amount of LP token to burn in the withdrawal
  /// @param receiver Address that receives the withdrawn coins
  /// @return Actual amount of the LP token burned in the withdrawal
  function remove_liquidity_imbalance(
    uint256[2] calldata amounts,
    uint256 max_burn_amount,
    address receiver
  ) external returns (uint256);

  /// @notice Withdraw coins from the pool
  /// @dev Withdrawal amounts are based on current deposit ratios
  /// @param burn_amount Quantity of LP tokens to burn in the withdrawal
  /// @param min_amounts Minimum amounts of underlying coins to receive
  /// @return List of amounts of coins that were withdrawn
  function remove_liquidity(uint256 burn_amount, uint256[2] calldata min_amounts) external returns (uint256[] memory);

  /// @notice Withdraw coins from the pool
  /// @dev Withdrawal amounts are based on current deposit ratios
  /// @param burn_amount Quantity of LP tokens to burn in the withdrawal
  /// @param min_amounts Minimum amounts of underlying coins to receive
  /// @param receiver Address that receives the withdrawn coins
  /// @return List of amounts of coins that were withdrawn
  function remove_liquidity(
    uint256 burn_amount,
    uint256[] calldata min_amounts,
    address receiver
  ) external returns (uint256[] memory);

  /// @notice Withdraw coins from the pool
  /// @dev Withdrawal amounts are based on current deposit ratios
  /// @param burn_amount Quantity of LP tokens to burn in the withdrawal
  /// @param min_amounts Minimum amounts of underlying coins to receive
  /// @param receiver Address that receives the withdrawn coins
  /// @return List of amounts of coins that were withdrawn
  function remove_liquidity(
    uint256 burn_amount,
    uint256[] calldata min_amounts,
    address receiver,
    bool claim_admin_fees
  ) external returns (uint256[] memory);

  /// @notice Claim admin fees. Callable by anyone.
  function withdraw_admin_fees() external;
}

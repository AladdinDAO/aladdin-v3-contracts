// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

/// @dev from: https://etherscan.io/address/0xd664b74274dfeb538d9bac494f3a4760828b02b0
interface IPirexEthMinter {
  // Configurable fees
  enum Fees {
    // Fee type for deposit
    Deposit,
    // Fee type for redemption
    Redemption,
    // Fee type for instant redemption
    InstantRedemption
  }

  /// @notice Return the fee percentage, with precision 1e6.
  /// @param   f representing the fee type.
  function fees(Fees f) external view returns (uint32);

  /**
   * @notice Handle pxETH minting in return for ETH deposits
   * @dev    This function handles the minting of pxETH in return for ETH deposits.
   * @param  receiver        address  Receiver of the minted pxETH or apxEth
   * @param  shouldCompound  bool     Whether to also compound into the vault
   * @return postFeeAmount   uint256  pxETH minted for the receiver
   * @return feeAmount       uint256  pxETH distributed as fees
   */
  function deposit(address receiver, bool shouldCompound)
    external
    payable
    returns (uint256 postFeeAmount, uint256 feeAmount);

  /**
   * @notice Initiate redemption by burning pxETH in return for upxETH
   * @dev    This function is used to initiate redemption by burning pxETH and receiving upxETH.
   * @param  _assets                      uint256  If caller is AutoPxEth then apxETH; pxETH otherwise.
   * @param  _receiver                    address  Receiver for upxETH.
   * @param  _shouldTriggerValidatorExit  bool     Whether the initiation should trigger voluntary exit.
   * @return postFeeAmount                uint256  pxETH burnt for the receiver.
   * @return feeAmount                    uint256  pxETH distributed as fees.
   */
  function initiateRedemption(
    uint256 _assets,
    address _receiver,
    bool _shouldTriggerValidatorExit
  ) external returns (uint256 postFeeAmount, uint256 feeAmount);

  /**
   * @notice Bulk redeem back ETH using a set of upxEth identifiers
   * @dev    This function allows the bulk redemption of ETH using upxEth tokens.
   * @param  _tokenIds  uint256[]  Redeem batch identifiers
   * @param  _amounts   uint256[]  Amounts of ETH to redeem for each identifier
   * @param  _receiver  address    Address of the ETH receiver
   */
  function bulkRedeemWithUpxEth(
    uint256[] calldata _tokenIds,
    uint256[] calldata _amounts,
    address _receiver
  ) external;

  /**
   * @notice Redeem back ETH using a single upxEth identifier
   * @dev    This function allows the redemption of ETH using upxEth tokens.
   * @param  _tokenId  uint256  Redeem batch identifier
   * @param  _assets   uint256  Amount of ETH to redeem
   * @param  _receiver  address  Address of the ETH receiver
   */
  function redeemWithUpxEth(
    uint256 _tokenId,
    uint256 _assets,
    address _receiver
  ) external;

  /**
   * @notice Instant redeem back ETH using pxETH
   * @dev    This function burns pxETH, calculates fees, and transfers ETH to the receiver.
   * @param  _assets        uint256   Amount of pxETH to redeem.
   * @param  _receiver      address   Address of the ETH receiver.
   * @return postFeeAmount  uint256   Post-fee amount for the receiver.
   * @return feeAmount      uinit256  Fee amount sent to the PirexFees.
   */
  function instantRedeemWithPxEth(uint256 _assets, address _receiver)
    external
    returns (uint256 postFeeAmount, uint256 feeAmount);
}

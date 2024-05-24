// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";
import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/interfaces/IERC20MetadataUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/interfaces/IERC20Upgradeable.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/ERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";

contract RewardTokenWrapper is AccessControlUpgradeable, ERC20Upgradeable {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /*************
   * Constants *
   *************/

  /// @notice The role for reward pool.
  bytes32 public constant REWARD_POOL_ROLE = keccak256("REWARD_POOL_ROLE");

  /// @notice The role for reward token distributor.
  bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");

  /*************
   * Variables *
   *************/

  /// @notice The address of reward token.
  address public token;

  /// @notice The token scale to 18 decimals.
  uint256 public scale;

  /***************
   * Constructor *
   ***************/

  function initialize(address _token) external initializer {
    __Context_init();
    __AccessControl_init();
    __ERC20_init(IERC20MetadataUpgradeable(_token).name(), IERC20MetadataUpgradeable(_token).symbol());

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

    token = _token;
    scale = 10**(18 - ERC20Upgradeable(_token).decimals());
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ERC20Upgradeable
  function transfer(address to, uint256 amount) public virtual override returns (bool) {
    address owner = _msgSender();

    if (hasRole(REWARD_POOL_ROLE, owner)) {
      _burn(owner, amount);

      IERC20Upgradeable(token).safeTransfer(to, amount / scale);
    } else {
      _transfer(owner, to, amount);
    }
    return true;
  }

  /// @notice Mint token
  function mint(address to, uint256 amount) external onlyRole(DISTRIBUTOR_ROLE) {
    IERC20Upgradeable(token).safeTransferFrom(_msgSender(), address(this), amount);

    _mint(to, amount * scale);
  }
}

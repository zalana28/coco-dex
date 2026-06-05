// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title CocoStableLP
 * @notice ERC20 LP token for the CocoStablePool V1 prototype.
 * @dev Only the pool address set at construction can mint or burn LP tokens.
 */
contract CocoStableLP is ERC20 {
    address public immutable pool;

    error OnlyPool();
    error ZeroPool();

    modifier onlyPool() {
        if (msg.sender != pool) revert OnlyPool();
        _;
    }

    constructor(address pool_) ERC20("Coco Stable LP", "cSLP") {
        if (pool_ == address(0)) revert ZeroPool();
        pool = pool_;
    }

    function mint(address to, uint256 amount) external onlyPool {
        _mint(to, amount);
    }

    function burnFrom(address from, uint256 amount) external onlyPool {
        _burn(from, amount);
    }
}

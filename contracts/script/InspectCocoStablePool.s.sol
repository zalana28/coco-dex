// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "forge-std/Script.sol";

import "../stable/CocoStablePool.sol";

/**
 * @title InspectCocoStablePool
 * @notice Read-only diagnostics for a deployed CocoStablePool V1 instance.
 * @dev Reads COCO_STABLE_POOL and prints pool configuration and balances. No writes.
 */
contract InspectCocoStablePool is Script {
    function run() external view {
        address poolAddress = vm.envAddress("COCO_STABLE_POOL");
        CocoStablePool pool = CocoStablePool(poolAddress);

        (address token0, address token1) = pool.getTokens();
        (uint256 balance0, uint256 balance1) = pool.getBalances();
        address lpToken = pool.lpToken();

        console.log("=== CocoStablePool V1 inspection ===");
        console.log("Chain ID:", block.chainid);
        console.log("Pool:", poolAddress);
        console.log("Token0:", token0);
        console.log("Token1:", token1);
        console.log("LP token:", lpToken);
        console.log("Balance0:", balance0);
        console.log("Balance1:", balance1);
        console.log("Fee bps:", pool.feeBps());
        console.log("A:", pool.amplificationParameter());
        console.log("Paused:", pool.paused());
        console.log("Total LP supply:", IERC20(lpToken).totalSupply());
    }
}

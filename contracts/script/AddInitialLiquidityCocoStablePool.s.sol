// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "forge-std/Script.sol";

import "../stable/CocoStablePool.sol";

/**
 * @title AddInitialLiquidityCocoStablePool
 * @notice Safe dry-run/broadcast script for initial CocoStablePool V1 liquidity.
 * @dev Running without --broadcast performs a Foundry simulation only. Running
 *      with --broadcast approves token spend if needed and calls addLiquidity.
 *      This script never writes addresses or deployment results to source files.
 */
contract AddInitialLiquidityCocoStablePool is Script {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;

    struct LiquidityConfig {
        uint256 deployerPrivateKey;
        address deployer;
        address poolAddress;
        address expectedToken0;
        address expectedToken1;
        uint256 amount0;
        uint256 amount1;
        uint256 minLpOut;
        address configuredRecipient;
        address recipient;
    }

    struct PoolSnapshot {
        address token0;
        address token1;
        address lpToken;
        uint256 deployerBalance0;
        uint256 deployerBalance1;
        uint256 allowance0;
        uint256 allowance1;
        bool needsApproval0;
        bool needsApproval1;
    }

    function run() external {
        LiquidityConfig memory config = _loadConfig();
        _validateConfig(config);

        CocoStablePool pool = CocoStablePool(config.poolAddress);
        PoolSnapshot memory snapshot = _loadAndValidatePool(pool, config);

        _printPlan(config, snapshot);
        _execute(config, pool, snapshot);
        _printPostState(pool, config.recipient);
    }

    function _loadConfig() internal view returns (LiquidityConfig memory config) {
        config.deployerPrivateKey = vm.envOr("COCO_DEPLOYER_PRIVATE_KEY", uint256(0));
        require(config.deployerPrivateKey != 0, "AddInitialLiquidity: COCO_DEPLOYER_PRIVATE_KEY missing");

        config.deployer = vm.addr(config.deployerPrivateKey);
        config.poolAddress = vm.envOr("COCO_STABLE_POOL", address(0));
        config.expectedToken0 = vm.envOr("COCO_STABLE_TOKEN0", address(0));
        config.expectedToken1 = vm.envOr("COCO_STABLE_TOKEN1", address(0));
        config.amount0 = vm.envOr("COCO_STABLE_INITIAL_AMOUNT0", uint256(0));
        config.amount1 = vm.envOr("COCO_STABLE_INITIAL_AMOUNT1", uint256(0));
        config.minLpOut = vm.envOr("COCO_STABLE_MIN_LP_OUT", uint256(0));
        config.configuredRecipient = vm.envOr("COCO_STABLE_LP_RECIPIENT", address(0));
        config.recipient = config.configuredRecipient == address(0) ? config.deployer : config.configuredRecipient;
    }

    function _validateConfig(LiquidityConfig memory config) internal view {
        require(block.chainid == ARC_TESTNET_CHAIN_ID, "AddInitialLiquidity: ARC_TESTNET_ONLY");
        require(config.poolAddress != address(0), "AddInitialLiquidity: COCO_STABLE_POOL missing");
        require(config.expectedToken0 != address(0), "AddInitialLiquidity: COCO_STABLE_TOKEN0 missing");
        require(config.expectedToken1 != address(0), "AddInitialLiquidity: COCO_STABLE_TOKEN1 missing");
        require(config.amount0 > 0, "AddInitialLiquidity: COCO_STABLE_INITIAL_AMOUNT0 must be > 0");
        require(config.amount1 > 0, "AddInitialLiquidity: COCO_STABLE_INITIAL_AMOUNT1 must be > 0");
        require(config.minLpOut > 0, "AddInitialLiquidity: COCO_STABLE_MIN_LP_OUT must be explicit and > 0");
        require(config.recipient != address(0), "AddInitialLiquidity: LP recipient is zero");
    }

    function _loadAndValidatePool(CocoStablePool pool, LiquidityConfig memory config)
        internal
        view
        returns (PoolSnapshot memory snapshot)
    {
        (snapshot.token0, snapshot.token1) = pool.getTokens();
        require(snapshot.token0 == config.expectedToken0, "AddInitialLiquidity: token0 mismatch");
        require(snapshot.token1 == config.expectedToken1, "AddInitialLiquidity: token1 mismatch");
        require(!pool.paused(), "AddInitialLiquidity: pool is paused");

        snapshot.lpToken = pool.lpToken();
        snapshot.deployerBalance0 = IERC20(snapshot.token0).balanceOf(config.deployer);
        snapshot.deployerBalance1 = IERC20(snapshot.token1).balanceOf(config.deployer);
        snapshot.allowance0 = IERC20(snapshot.token0).allowance(config.deployer, config.poolAddress);
        snapshot.allowance1 = IERC20(snapshot.token1).allowance(config.deployer, config.poolAddress);
        snapshot.needsApproval0 = snapshot.allowance0 < config.amount0;
        snapshot.needsApproval1 = snapshot.allowance1 < config.amount1;

        require(snapshot.deployerBalance0 >= config.amount0, "AddInitialLiquidity: insufficient token0 balance");
        require(snapshot.deployerBalance1 >= config.amount1, "AddInitialLiquidity: insufficient token1 balance");
    }

    function _printPlan(LiquidityConfig memory config, PoolSnapshot memory snapshot) internal view {
        console.log("=== CocoStablePool V1 initial liquidity ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", config.deployer);
        console.log("Pool:", config.poolAddress);
        console.log("Token0:", snapshot.token0);
        console.log("Token1:", snapshot.token1);
        console.log("Amount0:", config.amount0);
        console.log("Amount1:", config.amount1);
        console.log("Min LP out:", config.minLpOut);
        console.log("LP recipient:", config.recipient);
        if (config.configuredRecipient == address(0)) {
            console.log("LP recipient source: COCO_STABLE_LP_RECIPIENT missing or zero; defaulting to deployer.");
        } else {
            console.log("LP recipient source: COCO_STABLE_LP_RECIPIENT.");
        }
        console.log("Pre deployer token0 balance:", snapshot.deployerBalance0);
        console.log("Pre deployer token1 balance:", snapshot.deployerBalance1);
        console.log("Pre token0 allowance:", snapshot.allowance0);
        console.log("Pre token1 allowance:", snapshot.allowance1);
        console.log("Token0 approval needed:", snapshot.needsApproval0);
        console.log("Token1 approval needed:", snapshot.needsApproval1);
        console.log("No frontend, router, analytics, or address config files will be updated.");
    }

    function _execute(
        LiquidityConfig memory config,
        CocoStablePool pool,
        PoolSnapshot memory snapshot
    ) internal {
        vm.startBroadcast(config.deployerPrivateKey);
        if (snapshot.needsApproval0) {
            require(
                IERC20(snapshot.token0).approve(config.poolAddress, config.amount0),
                "AddInitialLiquidity: token0 approve failed"
            );
        }
        if (snapshot.needsApproval1) {
            require(
                IERC20(snapshot.token1).approve(config.poolAddress, config.amount1),
                "AddInitialLiquidity: token1 approve failed"
            );
        }
        pool.addLiquidity(config.amount0, config.amount1, config.minLpOut, config.recipient);
        vm.stopBroadcast();
    }

    function _printPostState(CocoStablePool pool, address recipient) internal view {
        (uint256 postPoolBalance0, uint256 postPoolBalance1) = pool.getBalances();
        console.log("Post pool balance0:", postPoolBalance0);
        console.log("Post pool balance1:", postPoolBalance1);
        console.log("Post LP recipient balance:", IERC20(pool.lpToken()).balanceOf(recipient));
    }
}

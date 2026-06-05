// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

import "../stable/CocoStablePool.sol";

/**
 * @title DeployCocoStablePool
 * @notice Safe local deployment script for the CocoStablePool V1 Arc Testnet prototype.
 * @dev This script does not write deployed addresses to source files. Running without
 *      --broadcast performs a Foundry simulation only.
 */
contract DeployCocoStablePool is Script {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;
    uint256 internal constant DEFAULT_FEE_BPS = 4;
    uint256 internal constant DEFAULT_A = 100;
    uint256 internal constant MAX_FEE_BPS = 30;
    uint256 internal constant MAX_A = 10_000;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("COCO_DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        address token0 = vm.envAddress("COCO_STABLE_TOKEN0");
        address token1 = vm.envAddress("COCO_STABLE_TOKEN1");
        uint256 feeBps = vm.envOr("COCO_STABLE_FEE_BPS", DEFAULT_FEE_BPS);
        uint256 amplificationParameter = vm.envOr("COCO_STABLE_A", DEFAULT_A);
        address configuredOwner = vm.envOr("COCO_STABLE_OWNER", address(0));
        address owner = configuredOwner == address(0) ? deployer : configuredOwner;

        _validateInputs(token0, token1, feeBps, amplificationParameter, owner);

        console.log("=== CocoStablePool V1 deploy simulation ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Token0:", token0);
        console.log("Token1:", token1);
        console.log("Fee bps:", feeBps);
        console.log("A:", amplificationParameter);
        if (configuredOwner == address(0)) {
            console.log("Owner:", owner);
            console.log("Owner source: COCO_STABLE_OWNER missing or zero; defaulting to deployer.");
        } else {
            console.log("Owner:", owner);
            console.log("Owner source: COCO_STABLE_OWNER.");
        }

        vm.startBroadcast(deployerPrivateKey);
        CocoStablePool pool = new CocoStablePool(token0, token1, amplificationParameter, feeBps, owner);
        vm.stopBroadcast();

        console.log("Pool address:", address(pool));
        console.log("LP token address:", pool.lpToken());
        console.log("No frontend, router, analytics, or address config files were updated.");
    }

    function _validateInputs(
        address token0,
        address token1,
        uint256 feeBps,
        uint256 amplificationParameter,
        address owner
    ) internal view {
        require(block.chainid == ARC_TESTNET_CHAIN_ID, "DeployCocoStablePool: ARC_TESTNET_ONLY");
        require(token0 != address(0), "DeployCocoStablePool: TOKEN0_ZERO");
        require(token1 != address(0), "DeployCocoStablePool: TOKEN1_ZERO");
        require(token0 != token1, "DeployCocoStablePool: IDENTICAL_TOKENS");
        require(owner != address(0), "DeployCocoStablePool: OWNER_ZERO");
        require(feeBps <= MAX_FEE_BPS, "DeployCocoStablePool: FEE_TOO_HIGH");
        require(
            amplificationParameter > 0 && amplificationParameter <= MAX_A,
            "DeployCocoStablePool: INVALID_A"
        );
    }
}

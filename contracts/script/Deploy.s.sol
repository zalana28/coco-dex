// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/CocoFactory.sol";
import "../src/CocoRouter.sol";

/**
 * @title DeployScript
 * @notice Deployment script for Coco DEX on Arc Testnet.
 *
 * @dev Arc Testnet details:
 *      - Chain ID: 5042002
 *      - RPC: https://rpc.testnet.arc.network
 *      - Explorer: https://testnet.arcscan.app
 *      - Native gas: USDC at 18 decimals (EVM wei)
 *      - ERC-20 USDC: 0x3600000000000000000000000000000000000000 (6 decimals)
 *      - ERC-20 EURC: 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a (6 decimals)
 *
 * Usage:
 *   1. Set environment variables:
 *      export ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
 *      export DEPLOYER_PRIVATE_KEY=<your_private_key>
 *
 *   2. Dry run (simulation):
 *      forge script script/Deploy.s.sol --rpc-url $ARC_TESTNET_RPC_URL
 *
 *   3. Deploy (broadcast):
 *      forge script script/Deploy.s.sol --rpc-url $ARC_TESTNET_RPC_URL --broadcast
 *
 * DO NOT commit private keys to version control.
 */
contract DeployScript is Script {
    // Arc Testnet token addresses
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Factory
        CocoFactory factory = new CocoFactory(deployer);
        console.log("CocoFactory deployed at:", address(factory));

        // 2. Deploy Router
        CocoRouter router = new CocoRouter(address(factory));
        console.log("CocoRouter deployed at:", address(router));

        // 3. Create USDC/EURC pair
        address pair = factory.createPair(USDC, EURC);
        console.log("USDC/EURC pair created at:", pair);

        vm.stopBroadcast();

        // Summary
        console.log("");
        console.log("=== DEPLOYMENT SUMMARY ===");
        console.log("Factory:", address(factory));
        console.log("Router:", address(router));
        console.log("USDC/EURC Pair:", pair);
        console.log("");
        console.log("Next steps:");
        console.log("1. Update frontend src/config/contracts.ts with these addresses");
        console.log("2. Approve USDC and EURC for the router");
        console.log("3. Add initial liquidity via router.addLiquidity()");
    }
}

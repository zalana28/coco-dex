// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CocoFactory} from "../src/CocoFactory.sol";
import {CocoRouter} from "../src/CocoRouter.sol";

/// @notice Deploys only CocoRouter for an existing Arc Testnet factory.
contract DeployArcClassicV2Router is Script {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;

    function run() external {
        require(block.chainid == ARC_TESTNET_CHAIN_ID, "DeployArcClassicV2Router: ARC_TESTNET_ONLY");
        uint256 deployerKey = vm.envUint("ARC_TESTNET_DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address factory = vm.envAddress("ARC_TESTNET_FACTORY_ADDRESS");
        address existingRouter = vm.envOr("ARC_TESTNET_ROUTER_ADDRESS", address(0));
        address expectedFeeToSetter = vm.envOr("ARC_TESTNET_FEE_TO_SETTER", deployer);

        require(factory.code.length != 0, "DeployArcClassicV2Router: FACTORY_NOT_CONTRACT");
        require(
            CocoFactory(factory).feeToSetter() == expectedFeeToSetter,
            "DeployArcClassicV2Router: FEE_TO_SETTER_MISMATCH"
        );

        if (existingRouter != address(0)) {
            require(existingRouter.code.length != 0, "DeployArcClassicV2Router: ROUTER_NOT_CONTRACT");
            CocoRouter probe = new CocoRouter(factory);
            require(existingRouter.codehash == address(probe).codehash, "DeployArcClassicV2Router: BYTECODE_MISMATCH");
            require(CocoRouter(existingRouter).factory() == factory, "DeployArcClassicV2Router: FACTORY_MISMATCH");
            console2.log("Reusing CocoRouter:", existingRouter);
            return;
        }

        console2.log("Chain ID:", block.chainid);
        console2.log("Deployer:", deployer);
        console2.log("Factory:", factory);
        console2.log("Constructor arguments:");
        console2.logBytes(abi.encode(factory));

        vm.startBroadcast(deployerKey);
        CocoRouter router = new CocoRouter(factory);
        vm.stopBroadcast();

        require(router.factory() == factory, "DeployArcClassicV2Router: VALIDATION_FAILED");
        console2.log("CocoRouter:", address(router));
    }
}

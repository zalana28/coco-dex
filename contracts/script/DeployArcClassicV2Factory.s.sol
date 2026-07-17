// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CocoFactory} from "../src/CocoFactory.sol";

/// @notice Deploys only CocoFactory on Arc Testnet. Manual --broadcast is required for a live transaction.
contract DeployArcClassicV2Factory is Script {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;

    function run() external {
        require(block.chainid == ARC_TESTNET_CHAIN_ID, "DeployArcClassicV2Factory: ARC_TESTNET_ONLY");
        uint256 deployerKey = vm.envUint("ARC_TESTNET_DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address feeToSetter = vm.envOr("ARC_TESTNET_FEE_TO_SETTER", deployer);
        address existingFactory = vm.envOr("ARC_TESTNET_FACTORY_ADDRESS", address(0));
        require(feeToSetter != address(0), "DeployArcClassicV2Factory: FEE_TO_SETTER_ZERO");

        if (existingFactory != address(0)) {
            require(existingFactory.code.length != 0, "DeployArcClassicV2Factory: FACTORY_NOT_CONTRACT");
            CocoFactory probe = new CocoFactory(feeToSetter);
            require(existingFactory.codehash == address(probe).codehash, "DeployArcClassicV2Factory: BYTECODE_MISMATCH");
            require(
                CocoFactory(existingFactory).feeToSetter() == feeToSetter,
                "DeployArcClassicV2Factory: FEE_TO_SETTER_MISMATCH"
            );
            console2.log("Reusing CocoFactory:", existingFactory);
            return;
        }

        console2.log("Chain ID:", block.chainid);
        console2.log("Deployer:", deployer);
        console2.log("Fee-to setter:", feeToSetter);
        console2.log("Constructor arguments:");
        console2.logBytes(abi.encode(feeToSetter));

        vm.startBroadcast(deployerKey);
        CocoFactory factory = new CocoFactory(feeToSetter);
        vm.stopBroadcast();

        require(factory.feeToSetter() == feeToSetter, "DeployArcClassicV2Factory: VALIDATION_FAILED");
        console2.log("CocoFactory:", address(factory));
    }
}

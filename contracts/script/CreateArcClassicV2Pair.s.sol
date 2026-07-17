// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CocoFactory} from "../src/CocoFactory.sol";
import {CocoRouter} from "../src/CocoRouter.sol";

/// @notice Creates the configured pair only when it is absent from an existing Arc Testnet factory.
contract CreateArcClassicV2Pair is Script {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;
    address internal constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;
    address internal constant ARC_TESTNET_EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;

    function run() external {
        require(block.chainid == ARC_TESTNET_CHAIN_ID, "CreateArcClassicV2Pair: ARC_TESTNET_ONLY");
        uint256 deployerKey = vm.envUint("ARC_TESTNET_DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address factoryAddress = vm.envAddress("ARC_TESTNET_FACTORY_ADDRESS");
        address routerAddress = vm.envAddress("ARC_TESTNET_ROUTER_ADDRESS");
        address expectedFeeToSetter = vm.envOr("ARC_TESTNET_FEE_TO_SETTER", deployer);
        address tokenA = vm.envOr("ARC_TESTNET_TOKEN_A", ARC_TESTNET_USDC);
        address tokenB = vm.envOr("ARC_TESTNET_TOKEN_B", ARC_TESTNET_EURC);

        require(factoryAddress.code.length != 0, "CreateArcClassicV2Pair: FACTORY_NOT_CONTRACT");
        require(routerAddress.code.length != 0, "CreateArcClassicV2Pair: ROUTER_NOT_CONTRACT");
        require(tokenA != address(0) && tokenB != address(0), "CreateArcClassicV2Pair: TOKEN_ZERO");
        require(tokenA != tokenB, "CreateArcClassicV2Pair: IDENTICAL_TOKENS");
        require(tokenA.code.length != 0 && tokenB.code.length != 0, "CreateArcClassicV2Pair: TOKEN_NOT_CONTRACT");
        require(
            CocoFactory(factoryAddress).feeToSetter() == expectedFeeToSetter,
            "CreateArcClassicV2Pair: FEE_TO_SETTER_MISMATCH"
        );
        require(
            CocoRouter(routerAddress).factory() == factoryAddress, "CreateArcClassicV2Pair: ROUTER_FACTORY_MISMATCH"
        );

        CocoFactory factory = CocoFactory(factoryAddress);
        address pair = factory.getPair(tokenA, tokenB);
        if (pair == address(0)) {
            vm.startBroadcast(deployerKey);
            pair = factory.createPair(tokenA, tokenB);
            vm.stopBroadcast();
            console2.log("Pair created:", pair);
        } else {
            console2.log("Pair already exists; no transaction needed:", pair);
        }

        require(pair.code.length != 0, "CreateArcClassicV2Pair: PAIR_NOT_CONTRACT");
        require(factory.getPair(tokenB, tokenA) == pair, "CreateArcClassicV2Pair: REVERSE_PAIR_MISMATCH");
        console2.log("Chain ID:", block.chainid);
        console2.log("Factory:", factoryAddress);
        console2.log("Router:", routerAddress);
        console2.log("Token A:", tokenA);
        console2.log("Token B:", tokenB);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CocoFactory} from "../src/CocoFactory.sol";
import {CocoRouter} from "../src/CocoRouter.sol";
import {CocoPair} from "../src/CocoPair.sol";

/**
 * @title VerifyArcClassicV2Testnet
 * @notice Read-only post-deployment checks for classic Coco V2 on Arc Testnet.
 * @dev This script never starts a broadcast and cannot send transactions.
 */
contract VerifyArcClassicV2Testnet is Script {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;

    function run() external view {
        require(block.chainid == ARC_TESTNET_CHAIN_ID, "VerifyArcClassicV2: ARC_TESTNET_ONLY");

        address expectedFeeToSetter = vm.envAddress("ARC_TESTNET_FEE_TO_SETTER");
        address factoryAddress = vm.envAddress("ARC_TESTNET_FACTORY_ADDRESS");
        address routerAddress = vm.envAddress("ARC_TESTNET_ROUTER_ADDRESS");
        address tokenA = vm.envAddress("ARC_TESTNET_TOKEN_A");
        address tokenB = vm.envAddress("ARC_TESTNET_TOKEN_B");
        bytes32 expectedFactoryCodeHash = vm.envBytes32("ARC_TESTNET_FACTORY_CODE_HASH");
        bytes32 expectedRouterCodeHash = vm.envBytes32("ARC_TESTNET_ROUTER_CODE_HASH");
        bytes32 expectedPairCodeHash = vm.envBytes32("ARC_TESTNET_PAIR_CODE_HASH");

        require(factoryAddress.code.length != 0, "VerifyArcClassicV2: FACTORY_NOT_CONTRACT");
        require(routerAddress.code.length != 0, "VerifyArcClassicV2: ROUTER_NOT_CONTRACT");
        require(factoryAddress.codehash == expectedFactoryCodeHash, "VerifyArcClassicV2: FACTORY_BYTECODE_MISMATCH");
        require(routerAddress.codehash == expectedRouterCodeHash, "VerifyArcClassicV2: ROUTER_BYTECODE_MISMATCH");
        require(tokenA != address(0) && tokenB != address(0), "VerifyArcClassicV2: TOKEN_ZERO");
        require(tokenA != tokenB, "VerifyArcClassicV2: IDENTICAL_TOKENS");

        CocoFactory factory = CocoFactory(factoryAddress);
        CocoRouter router = CocoRouter(routerAddress);

        require(factory.feeToSetter() == expectedFeeToSetter, "VerifyArcClassicV2: FEE_TO_SETTER_MISMATCH");
        require(router.factory() == factoryAddress, "VerifyArcClassicV2: ROUTER_FACTORY_MISMATCH");

        address pair = factory.getPair(tokenA, tokenB);
        require(pair != address(0) && pair.code.length != 0, "VerifyArcClassicV2: PAIR_NOT_FOUND");
        require(pair.codehash == expectedPairCodeHash, "VerifyArcClassicV2: PAIR_BYTECODE_MISMATCH");
        require(factory.getPair(tokenB, tokenA) == pair, "VerifyArcClassicV2: REVERSE_PAIR_MISMATCH");
        require(_pairFor(factoryAddress, tokenA, tokenB) == pair, "VerifyArcClassicV2: CREATE2_MISMATCH");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(CocoPair(pair).factory() == factoryAddress, "VerifyArcClassicV2: PAIR_FACTORY_MISMATCH");
        require(CocoPair(pair).token0() == token0, "VerifyArcClassicV2: TOKEN0_MISMATCH");
        require(CocoPair(pair).token1() == token1, "VerifyArcClassicV2: TOKEN1_MISMATCH");

        console2.log("=== Classic Coco V2 Arc Testnet verification ===");
        console2.log("Chain ID:", block.chainid);
        console2.log("Factory:", factoryAddress);
        console2.log("Router:", routerAddress);
        console2.log("Fee-to setter:", expectedFeeToSetter);
        console2.log("Pair:", pair);
        console2.log("All read-only post-deployment checks passed.");
    }

    function _pairFor(address factory, address tokenA, address tokenB) internal pure returns (address pair) {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        pair = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex"ff",
                            factory,
                            keccak256(abi.encodePacked(token0, token1)),
                            keccak256(type(CocoPair).creationCode)
                        )
                    )
                )
            )
        );
    }
}

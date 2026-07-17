// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CocoFactory} from "../src/CocoFactory.sol";
import {CocoRouter} from "../src/CocoRouter.sol";
import {CocoPair} from "../src/CocoPair.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/**
 * @title  ArcClassicV2TestnetDeployment
 * @notice Idempotent deployment script for the updated classic Coco V2 on Arc Testnet only.
 * @dev    Never runs automatically. The operator executes this script with a private key
 *         and RPC URL provided via environment variables. No production chain is configured.
 *
 * Environment variables:
 *   - ARC_TESTNET_RPC_URL          (required; used by --rpc-url / foundry.toml)
 *   - ARC_TESTNET_DEPLOYER_PRIVATE_KEY (required)
 *   - ARC_TESTNET_FEE_TO_SETTER    (optional, defaults to deployer)
 *   - ARC_TESTNET_FACTORY_ADDRESS  (optional; skip factory deployment if set)
 *   - ARC_TESTNET_ROUTER_ADDRESS   (optional; skip router deployment if set)
 *   - ARC_TESTNET_MOCK_TOKEN_A     (optional; skip mock token A deployment if set)
 *   - ARC_TESTNET_MOCK_TOKEN_B     (optional; skip mock token B deployment if set)
 *   - ARC_TESTNET_OUTPUT_FILE      (optional, defaults to ./deployments/classic-v2-arc-testnet.json)
 *
 * Run:
 *   cd contracts
 *   source .env
 *   forge script script/ArcClassicV2TestnetDeployment.s.sol \
 *     --rpc-url $ARC_TESTNET_RPC_URL \
 *     --broadcast \
 *     --verify \
 *     --verifier-url https://testnet.arcscan.app/api \
 *     -vvvv
 */
contract ArcClassicV2TestnetDeployment is Script {
    /// @notice Arc Testnet chain ID.
    uint256 public constant ARC_TESTNET_CHAIN_ID = 5042002;

    /// @notice Deployment metadata persisted to disk.
    struct Deployment {
        uint256 chainId;
        address deployer;
        address feeToSetter;
        address factory;
        address router;
        address mockTokenA;
        address mockTokenB;
        address pair;
        bytes32 pairInitCodeHash;
        uint256 factoryBlock;
        uint256 routerBlock;
        uint256 createPairBlock;
        bytes constructorArgsFactory;
        bytes constructorArgsRouter;
        string note;
    }

    function run() external {
        require(block.chainid == ARC_TESTNET_CHAIN_ID, "ArcClassicV2TestnetDeployment: wrong chain");

        uint256 deployerKey = vm.envUint("ARC_TESTNET_DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address feeToSetter = vm.envOr("ARC_TESTNET_FEE_TO_SETTER", deployer);

        string memory outputFile =
            vm.envOr("ARC_TESTNET_OUTPUT_FILE", string("./deployments/classic-v2-arc-testnet.json"));

        console2.log("Deployer:", deployer);
        console2.log("FeeToSetter:", feeToSetter);
        console2.log("Chain ID:", block.chainid);

        Deployment memory deployment;
        deployment.chainId = block.chainid;
        deployment.deployer = deployer;
        deployment.feeToSetter = feeToSetter;
        deployment.pairInitCodeHash = keccak256(type(CocoPair).creationCode);
        deployment.note = "Arc Testnet only. No production deployment. Old contracts remain live and unchanged.";

        vm.startBroadcast(deployerKey);

        // 1. Deploy CocoFactory unless an existing address is provided.
        address factoryAddr = vm.envOr("ARC_TESTNET_FACTORY_ADDRESS", address(0));
        if (factoryAddr == address(0)) {
            CocoFactory newFactory = new CocoFactory(feeToSetter);
            factoryAddr = address(newFactory);
            deployment.factoryBlock = block.number;
            console2.log("Factory deployed at:", factoryAddr);
        } else {
            console2.log("Using existing factory:", factoryAddr);
        }
        deployment.factory = factoryAddr;
        deployment.constructorArgsFactory = abi.encode(feeToSetter);

        // 2. Deploy CocoRouter with the new factory address unless an existing address is provided.
        address routerAddr = vm.envOr("ARC_TESTNET_ROUTER_ADDRESS", address(0));
        if (routerAddr == address(0)) {
            CocoRouter newRouter = new CocoRouter(factoryAddr);
            routerAddr = address(newRouter);
            deployment.routerBlock = block.number;
            console2.log("Router deployed at:", routerAddr);
        } else {
            require(
                CocoRouter(routerAddr).factory() == factoryAddr,
                "ArcClassicV2TestnetDeployment: existing router points to a different factory"
            );
            console2.log("Using existing router:", routerAddr);
        }
        deployment.router = routerAddr;
        deployment.constructorArgsRouter = abi.encode(factoryAddr);

        // 3. Deploy mock tokens only when they are not already supplied.
        //    These are test-only ERC-20s with 18 decimals so verification tests can add liquidity
        //    and swap without needing real Arc Testnet balances or approvals.
        address tokenA = vm.envOr("ARC_TESTNET_MOCK_TOKEN_A", address(0));
        if (tokenA == address(0)) {
            tokenA = address(new MockERC20("Coco Mock Token A", "COCO-A", 18));
            console2.log("Mock Token A deployed at:", tokenA);
        } else {
            console2.log("Using existing Mock Token A:", tokenA);
        }
        deployment.mockTokenA = tokenA;

        address tokenB = vm.envOr("ARC_TESTNET_MOCK_TOKEN_B", address(0));
        if (tokenB == address(0)) {
            tokenB = address(new MockERC20("Coco Mock Token B", "COCO-B", 18));
            console2.log("Mock Token B deployed at:", tokenB);
        } else {
            console2.log("Using existing Mock Token B:", tokenB);
        }
        deployment.mockTokenB = tokenB;

        // 4. Create the first pair if it does not yet exist.
        CocoFactory factory = CocoFactory(factoryAddr);
        address existingPair = factory.getPair(tokenA, tokenB);
        if (existingPair == address(0)) {
            address pair = factory.createPair(tokenA, tokenB);
            deployment.pair = pair;
            deployment.createPairBlock = block.number;
            console2.log("Pair created at:", pair);
        } else {
            deployment.pair = existingPair;
            console2.log("Using existing pair:", existingPair);
        }

        vm.stopBroadcast();

        // 5. Validate the deployed pair address matches the deterministic CREATE2 formula.
        address predictedPair = _pairFor(factoryAddr, tokenA, tokenB);
        require(predictedPair == deployment.pair, "ArcClassicV2TestnetDeployment: pair address mismatch");

        _writeDeployment(outputFile, deployment);
        console2.log("Deployment record written to:", outputFile);
    }

    /// @dev Predicts a pair address using the same CREATE2 formula as CocoFactory.
    function _pairFor(address factory, address tokenA, address tokenB) internal pure returns (address pair) {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        bytes32 initCodeHash = keccak256(type(CocoPair).creationCode);
        pair = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(hex"ff", factory, keccak256(abi.encodePacked(token0, token1)), initCodeHash)
                    )
                )
            )
        );
    }

    /// @dev Writes the deployment record to a JSON file in two chunks to avoid stack depth issues.
    function _writeDeployment(string memory outputFile, Deployment memory d) internal {
        string memory base = string.concat(
            '{"chainId":',
            vm.toString(d.chainId),
            ',"deployer":"',
            vm.toString(d.deployer),
            '","feeToSetter":"',
            vm.toString(d.feeToSetter),
            '","factory":"',
            vm.toString(d.factory),
            '","router":"',
            vm.toString(d.router),
            '","mockTokenA":"',
            vm.toString(d.mockTokenA),
            '","mockTokenB":"',
            vm.toString(d.mockTokenB),
            '","pair":"',
            vm.toString(d.pair),
            '","pairInitCodeHash":"',
            vm.toString(d.pairInitCodeHash),
            '"}'
        );

        string memory appended = string.concat(
            ',"factoryBlock":',
            vm.toString(d.factoryBlock),
            ',"routerBlock":',
            vm.toString(d.routerBlock),
            ',"createPairBlock":',
            vm.toString(d.createPairBlock),
            ',"constructorArgsFactory":"',
            vm.toString(d.constructorArgsFactory),
            '","constructorArgsRouter":"',
            vm.toString(d.constructorArgsRouter),
            '","note":"',
            d.note,
            '"}'
        );

        vm.writeFile(outputFile, _replaceTail(base, appended));
    }

    /// @dev Replaces the trailing `}` of a JSON object with new fields and a closing brace.
    function _replaceTail(string memory base, string memory tail) internal pure returns (string memory) {
        bytes memory b = bytes(base);
        bytes memory t = bytes(tail);
        bytes memory out = new bytes(b.length - 1 + t.length);

        for (uint256 i = 0; i < b.length - 1; i++) {
            out[i] = b[i];
        }
        for (uint256 i = 0; i < t.length; i++) {
            out[b.length - 1 + i] = t[i];
        }
        return string(out);
    }
}

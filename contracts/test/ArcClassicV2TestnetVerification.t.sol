// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CocoFactory} from "../src/CocoFactory.sol";
import {CocoRouter} from "../src/CocoRouter.sol";
import {CocoPair} from "../src/CocoPair.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/**
 * @title  ArcClassicV2TestnetVerification
 * @notice Functional and fork-based post-deployment verification for classic Coco V2.
 * @dev By default setUp deploys contracts locally. Set ARC_TESTNET_VERIFY_FORK=true plus the
 *      RPC URL and deployed addresses to run the same state-changing checks against an isolated
 *      Arc Testnet fork. Fork mode never broadcasts transactions to Arc Testnet.
 */
contract ArcClassicV2TestnetVerification is Test {
    CocoFactory internal factory;
    CocoRouter internal router;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;

    address internal deployer = makeAddr("deployer");
    address internal user = makeAddr("user");
    uint256 internal constant DEADLINE = type(uint256).max;
    bool internal forkMode;

    function setUp() public {
        forkMode = vm.envOr("ARC_TESTNET_VERIFY_FORK", false);
        if (forkMode) {
            vm.createSelectFork(vm.envString("ARC_TESTNET_RPC_URL"));
            require(block.chainid == 5_042_002, "verification fork must be Arc Testnet");
            factory = CocoFactory(vm.envAddress("ARC_TESTNET_FACTORY_ADDRESS"));
            router = CocoRouter(vm.envAddress("ARC_TESTNET_ROUTER_ADDRESS"));
            deployer = vm.envAddress("ARC_TESTNET_FEE_TO_SETTER");
        } else {
            factory = new CocoFactory(deployer);
            router = new CocoRouter(address(factory));
        }

        // Fresh local test tokens make state-changing checks deterministic. In fork mode these
        // exist only inside Foundry's local fork and never alter the live Arc Testnet deployment.
        tokenA = new MockERC20("Coco Verification Token A", "VERIFY-A", 18);
        tokenB = new MockERC20("Coco Verification Token B", "VERIFY-B", 18);

        tokenA.mint(user, 1_000_000_000 ether);
        tokenB.mint(user, 1_000_000_000 ether);

        vm.startPrank(user);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function testFactoryFeeToSetterIsCorrect() public view {
        assertEq(factory.feeToSetter(), deployer, "factory feeToSetter mismatch");
    }

    function testRouterFactoryIsCorrect() public view {
        assertEq(router.factory(), address(factory), "router factory mismatch");
    }

    function testCreatePairSucceeds() public {
        address pair = factory.createPair(address(tokenA), address(tokenB));
        assertNotEq(pair, address(0), "pair is zero");

        CocoPair cp = CocoPair(pair);
        assertEq(cp.factory(), address(factory), "pair factory mismatch");
        assertTrue(cp.token0() < cp.token1(), "token0 not less than token1");
    }

    function testGetPairWorksInBothTokenOrders() public {
        address pair = factory.createPair(address(tokenA), address(tokenB));
        assertEq(factory.getPair(address(tokenA), address(tokenB)), pair, "forward getPair mismatch");
        assertEq(factory.getPair(address(tokenB), address(tokenA)), pair, "reverse getPair mismatch");
    }

    function testFirstAddLiquidityThroughRouterSucceeds() public {
        vm.startPrank(user);
        (uint256 amountA, uint256 amountB, uint256 liquidity) = router.addLiquidity(
            address(tokenA), address(tokenB), 10_000 ether, 20_000 ether, 10_000 ether, 20_000 ether, user, DEADLINE
        );
        vm.stopPrank();

        assertEq(amountA, 10_000 ether, "amountA mismatch");
        assertEq(amountB, 20_000 ether, "amountB mismatch");
        assertGt(liquidity, 0, "no liquidity minted");

        address pair = factory.getPair(address(tokenA), address(tokenB));
        assertNotEq(pair, address(0), "pair not created");
        assertEq(CocoPair(pair).balanceOf(user), liquidity, "LP balance mismatch");
    }

    function testExactInputSwapSucceeds() public {
        _addLiquidity(100_000 ether, 100_000 ether);

        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);

        uint256 balanceBefore = tokenB.balanceOf(user);
        vm.prank(user);
        uint256[] memory amounts = router.swapExactTokensForTokens(1_000 ether, 1, path, user, DEADLINE);
        uint256 balanceAfter = tokenB.balanceOf(user);

        assertEq(balanceAfter - balanceBefore, amounts[1], "output amount mismatch");
        assertGt(amounts[1], 0, "zero output");
        assertLt(amounts[1], 1_000 ether, "output should be less than input");
    }

    function testRemoveLiquiditySucceeds() public {
        _addLiquidity(10_000 ether, 20_000 ether);
        address pair = factory.getPair(address(tokenA), address(tokenB));
        uint256 liquidity = CocoPair(pair).balanceOf(user);

        uint256 balanceABefore = tokenA.balanceOf(user);
        uint256 balanceBBefore = tokenB.balanceOf(user);

        vm.startPrank(user);
        CocoPair(pair).approve(address(router), liquidity);
        (uint256 amountA, uint256 amountB) =
            router.removeLiquidity(address(tokenA), address(tokenB), liquidity, 0, 0, user, DEADLINE);
        vm.stopPrank();

        assertGt(amountA, 0, "amountA is zero");
        assertGt(amountB, 0, "amountB is zero");
        assertEq(tokenA.balanceOf(user) - balanceABefore, amountA, "amountA balance mismatch");
        assertEq(tokenB.balanceOf(user) - balanceBBefore, amountB, "amountB balance mismatch");
        assertEq(CocoPair(pair).balanceOf(user), 0, "LP not burned");
    }

    function testInvalidInputsStillRevert() public {
        // --- These checks do not require an existing pair. ---

        // Identical tokens.
        vm.prank(user);
        vm.expectRevert("CocoLibrary: IDENTICAL_ADDRESSES");
        router.addLiquidity(address(tokenA), address(tokenA), 1_000, 1_000, 0, 0, user, DEADLINE);

        // Zero address token.
        vm.prank(user);
        vm.expectRevert("CocoLibrary: ZERO_ADDRESS");
        router.addLiquidity(address(0), address(tokenB), 1_000, 1_000, 0, 0, user, DEADLINE);

        // Expired deadline.
        vm.prank(user);
        vm.expectRevert("CocoRouter: EXPIRED");
        router.addLiquidity(address(tokenA), address(tokenB), 1_000, 1_000, 0, 0, user, block.timestamp - 1);

        // Zero recipient.
        vm.prank(user);
        vm.expectRevert("CocoRouter: INVALID_TO");
        router.addLiquidity(address(tokenA), address(tokenB), 1_000, 1_000, 0, 0, address(0), DEADLINE);

        // Empty swap path.
        address[] memory emptyPath = new address[](0);
        vm.prank(user);
        vm.expectRevert("CocoRouter: INVALID_PATH");
        router.swapExactTokensForTokens(1_000, 0, emptyPath, user, DEADLINE);

        // Single-hop path.
        address[] memory shortPath = new address[](1);
        shortPath[0] = address(tokenA);
        vm.prank(user);
        vm.expectRevert("CocoRouter: INVALID_PATH");
        router.swapExactTokensForTokens(1_000, 0, shortPath, user, DEADLINE);

        // Swap with zero amount.
        address[] memory path = _path(address(tokenA), address(tokenB));
        vm.prank(user);
        vm.expectRevert("CocoRouter: INSUFFICIENT_INPUT_AMOUNT");
        router.swapExactTokensForTokens(0, 0, path, user, DEADLINE);

        // Swap with nonexistent pair.
        vm.prank(user);
        vm.expectRevert("CocoLibrary: PAIR_NOT_FOUND");
        router.swapExactTokensForTokens(1_000, 0, path, user, DEADLINE);

        // --- These checks require a funded pair. ---

        _addLiquidity(10_000 ether, 20_000 ether);

        // Remove zero liquidity.
        vm.prank(user);
        vm.expectRevert("CocoRouter: INSUFFICIENT_LIQUIDITY");
        router.removeLiquidity(address(tokenA), address(tokenB), 0, 0, 0, user, DEADLINE);
    }

    function testCreatePairEmitsOrderedEventAndPairCount() public {
        address token0;
        address token1;
        if (address(tokenA) < address(tokenB)) {
            token0 = address(tokenA);
            token1 = address(tokenB);
        } else {
            token0 = address(tokenB);
            token1 = address(tokenA);
        }

        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        address predictedPair = vm.computeCreate2Address(salt, keccak256(type(CocoPair).creationCode), address(factory));

        vm.expectEmit(true, true, false, true, address(factory));
        emit CocoFactory.PairCreated(token0, token1, predictedPair, 1);
        address createdPair = factory.createPair(address(tokenA), address(tokenB));
        assertEq(factory.allPairsLength(), 1, "pair count mismatch");
        assertEq(createdPair, predictedPair, "created pair mismatch");
    }

    function _addLiquidity(uint256 amountA, uint256 amountB) internal {
        vm.prank(user);
        router.addLiquidity(address(tokenA), address(tokenB), amountA, amountB, amountA, amountB, user, DEADLINE);
    }

    function _path(address a, address b) internal pure returns (address[] memory p) {
        p = new address[](2);
        p[0] = a;
        p[1] = b;
    }
}

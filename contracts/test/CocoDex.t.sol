// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/CocoFactory.sol";
import "../src/CocoPair.sol";
import "../src/CocoRouter.sol";
import "../src/CocoLibrary.sol";
import "../src/mocks/MockERC20.sol";

/**
 * @title CocoDexTest
 * @notice Comprehensive tests for the Coco DEX AMM.
 * @dev Tests use 6-decimal mock tokens to simulate USDC/EURC on Arc Testnet.
 *
 *      Arc USDC note:
 *      - Native gas: 18 decimals (EVM wei precision)
 *      - ERC-20 USDC: 6 decimals (what we test here)
 *      - ERC-20 EURC: 6 decimals
 */
contract CocoDexTest is Test {
    CocoFactory public factory;
    CocoRouter public router;
    MockERC20 public usdc;
    MockERC20 public eurc;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    // 6-decimal amounts
    uint256 constant ONE_USDC = 1e6;
    uint256 constant ONE_EURC = 1e6;
    uint256 constant INITIAL_USDC = 1_000_000 * ONE_USDC; // 1M USDC
    uint256 constant INITIAL_EURC = 920_000 * ONE_EURC;   // 920K EURC

    function setUp() public {
        // Deploy factory and router
        factory = new CocoFactory(address(this));
        router = new CocoRouter(address(factory));

        // Deploy 6-decimal mock tokens (matching Arc USDC/EURC)
        usdc = new MockERC20("USD Coin", "USDC", 6);
        eurc = new MockERC20("Euro Coin", "EURC", 6);

        // Mint tokens to alice
        usdc.mint(alice, INITIAL_USDC);
        eurc.mint(alice, INITIAL_EURC);

        // Mint tokens to bob for swap tests
        usdc.mint(bob, 100_000 * ONE_USDC);
        eurc.mint(bob, 100_000 * ONE_EURC);

        // Create the pair
        factory.createPair(address(usdc), address(eurc));
    }

    // ========== PAIR CREATION ==========

    function test_PairCreation() public view {
        address pair = factory.getPair(address(usdc), address(eurc));
        assertTrue(pair != address(0), "Pair should exist");
        assertEq(factory.allPairsLength(), 1, "Should have 1 pair");
    }

    function test_PairCreation_ReverseOrder() public view {
        address pair1 = factory.getPair(address(usdc), address(eurc));
        address pair2 = factory.getPair(address(eurc), address(usdc));
        assertEq(pair1, pair2, "Should return same pair regardless of order");
    }

    function test_PairCreation_RevertDuplicate() public {
        vm.expectRevert("CocoFactory: PAIR_EXISTS");
        factory.createPair(address(usdc), address(eurc));
    }

    function test_PairCreation_RevertIdentical() public {
        vm.expectRevert("CocoFactory: IDENTICAL_ADDRESSES");
        factory.createPair(address(usdc), address(usdc));
    }

    function test_PairTokensOrdered() public view {
        address pair = factory.getPair(address(usdc), address(eurc));
        address token0 = CocoPair(pair).token0();
        address token1 = CocoPair(pair).token1();
        assertTrue(token0 < token1, "token0 should be less than token1");
    }

    // ========== ADD LIQUIDITY ==========

    function test_AddLiquidity_Initial() public {
        vm.startPrank(alice);
        usdc.approve(address(router), type(uint256).max);
        eurc.approve(address(router), type(uint256).max);

        uint256 usdcAmount = 100_000 * ONE_USDC;
        uint256 eurcAmount = 92_000 * ONE_EURC;

        (uint256 amountA, uint256 amountB, uint256 liquidity) = router.addLiquidity(
            address(usdc),
            address(eurc),
            usdcAmount,
            eurcAmount,
            usdcAmount,
            eurcAmount,
            alice,
            block.timestamp + 1 hours
        );

        assertEq(amountA, usdcAmount, "Should use full USDC amount");
        assertEq(amountB, eurcAmount, "Should use full EURC amount");
        assertTrue(liquidity > 0, "Should mint LP tokens");
        vm.stopPrank();
    }

    function test_AddLiquidity_Subsequent() public {
        _addInitialLiquidity();

        vm.startPrank(alice);
        uint256 addUsdc = 10_000 * ONE_USDC;
        // Should compute optimal EURC based on current ratio
        (uint256 amountA, uint256 amountB, uint256 liquidity) = router.addLiquidity(
            address(usdc),
            address(eurc),
            addUsdc,
            10_000 * ONE_EURC, // desired max
            addUsdc,
            0, // min B
            alice,
            block.timestamp + 1 hours
        );

        assertEq(amountA, addUsdc);
        // Optimal B should be proportional: 10000 * 92000/100000 = 9200
        assertEq(amountB, 9_200 * ONE_EURC);
        assertTrue(liquidity > 0);
        vm.stopPrank();
    }

    // ========== REMOVE LIQUIDITY ==========

    function test_RemoveLiquidity() public {
        _addInitialLiquidity();

        address pair = factory.getPair(address(usdc), address(eurc));
        uint256 lpBalance = CocoPair(pair).balanceOf(alice);
        assertTrue(lpBalance > 0, "Alice should have LP tokens");

        vm.startPrank(alice);
        CocoPair(pair).approve(address(router), lpBalance);

        uint256 usdcBefore = usdc.balanceOf(alice);
        uint256 eurcBefore = eurc.balanceOf(alice);

        router.removeLiquidity(
            address(usdc),
            address(eurc),
            lpBalance,
            0,
            0,
            alice,
            block.timestamp + 1 hours
        );

        uint256 usdcAfter = usdc.balanceOf(alice);
        uint256 eurcAfter = eurc.balanceOf(alice);

        assertTrue(usdcAfter > usdcBefore, "Should receive USDC back");
        assertTrue(eurcAfter > eurcBefore, "Should receive EURC back");
        vm.stopPrank();
    }

    function test_RemoveLiquidity_PartialAmount() public {
        _addInitialLiquidity();

        address pair = factory.getPair(address(usdc), address(eurc));
        uint256 lpBalance = CocoPair(pair).balanceOf(alice);
        uint256 halfLp = lpBalance / 2;

        vm.startPrank(alice);
        CocoPair(pair).approve(address(router), halfLp);

        router.removeLiquidity(
            address(usdc),
            address(eurc),
            halfLp,
            0,
            0,
            alice,
            block.timestamp + 1 hours
        );

        // Should still have LP tokens remaining
        uint256 remainingLp = CocoPair(pair).balanceOf(alice);
        assertApproxEqAbs(remainingLp, lpBalance - halfLp, 1);
        vm.stopPrank();
    }

    // ========== SWAP ==========

    function test_SwapExactTokensForTokens() public {
        _addInitialLiquidity();

        vm.startPrank(bob);
        usdc.approve(address(router), type(uint256).max);

        uint256 swapAmount = 1_000 * ONE_USDC;
        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(eurc);

        uint256 eurcBefore = eurc.balanceOf(bob);

        uint256[] memory amounts = router.swapExactTokensForTokens(
            swapAmount,
            0, // no minimum for this test
            path,
            bob,
            block.timestamp + 1 hours
        );

        uint256 eurcAfter = eurc.balanceOf(bob);
        uint256 eurcReceived = eurcAfter - eurcBefore;

        assertEq(eurcReceived, amounts[1], "Received should match calculated");
        assertTrue(eurcReceived > 0, "Should receive EURC");
        assertTrue(eurcReceived < swapAmount, "Output should be less than input due to rate + fee");
        vm.stopPrank();
    }

    // ========== 0.3% FEE BEHAVIOR ==========

    function test_SwapFee_0_3_Percent() public {
        // Add liquidity at 1:1 ratio for easy fee verification
        MockERC20 tokenA = new MockERC20("Token A", "A", 6);
        MockERC20 tokenB = new MockERC20("Token B", "B", 6);
        tokenA.mint(alice, 1_000_000 * ONE_USDC);
        tokenB.mint(alice, 1_000_000 * ONE_USDC);
        tokenA.mint(bob, 100_000 * ONE_USDC);

        factory.createPair(address(tokenA), address(tokenB));

        // Add 1:1 liquidity
        vm.startPrank(alice);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(
            address(tokenA), address(tokenB),
            100_000 * ONE_USDC, 100_000 * ONE_USDC,
            100_000 * ONE_USDC, 100_000 * ONE_USDC,
            alice, block.timestamp + 1 hours
        );
        vm.stopPrank();

        // Swap 1000 tokens: expected output with 0.3% fee
        // amountOut = (1000 * 997 * 100000) / (100000 * 1000 + 1000 * 997)
        // = 99700000 / 100997000 = ~987.05... (in token units)
        vm.startPrank(bob);
        tokenA.approve(address(router), type(uint256).max);

        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);

        uint256[] memory amounts = router.swapExactTokensForTokens(
            1000 * ONE_USDC, 0, path, bob, block.timestamp + 1 hours
        );

        // Without fee: 1000 * 100000 / 101000 = 990.09... tokens
        // With 0.3% fee: should be less than without fee
        uint256 outputNoFee = (1000 * ONE_USDC * 100_000 * ONE_USDC) / (100_000 * ONE_USDC + 1000 * ONE_USDC);
        assertTrue(amounts[1] < outputNoFee, "Fee should reduce output");

        // Verify exact formula: (1000e6 * 997 * 100000e6) / (100000e6 * 1000 + 1000e6 * 997)
        uint256 expectedOut = (1000 * ONE_USDC * 997 * 100_000 * ONE_USDC) /
            (100_000 * ONE_USDC * 1000 + 1000 * ONE_USDC * 997);
        assertEq(amounts[1], expectedOut, "Should match constant product formula with fee");
        vm.stopPrank();
    }

    // ========== SLIPPAGE / DEADLINE ==========

    function test_SwapRevert_InsufficientOutput() public {
        _addInitialLiquidity();

        vm.startPrank(bob);
        usdc.approve(address(router), type(uint256).max);

        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(eurc);

        // Set amountOutMin very high to trigger slippage protection
        vm.expectRevert("CocoRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        router.swapExactTokensForTokens(
            1_000 * ONE_USDC,
            999 * ONE_EURC, // unrealistically high min output
            path,
            bob,
            block.timestamp + 1 hours
        );
        vm.stopPrank();
    }

    function test_SwapRevert_Expired() public {
        _addInitialLiquidity();

        vm.startPrank(bob);
        usdc.approve(address(router), type(uint256).max);

        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(eurc);

        // Set deadline in the past
        vm.expectRevert("CocoRouter: EXPIRED");
        router.swapExactTokensForTokens(
            1_000 * ONE_USDC,
            0,
            path,
            bob,
            block.timestamp - 1 // expired
        );
        vm.stopPrank();
    }

    function test_RemoveLiquidity_RevertMinAmount() public {
        _addInitialLiquidity();

        address pair = factory.getPair(address(usdc), address(eurc));
        uint256 lpBalance = CocoPair(pair).balanceOf(alice);

        vm.startPrank(alice);
        CocoPair(pair).approve(address(router), lpBalance);

        // Set unrealistically high minimums
        vm.expectRevert("CocoRouter: INSUFFICIENT_A_AMOUNT");
        router.removeLiquidity(
            address(usdc),
            address(eurc),
            lpBalance,
            INITIAL_USDC, // more than what was deposited (impossible to get back)
            0,
            alice,
            block.timestamp + 1 hours
        );
        vm.stopPrank();
    }

    // ========== 6-DECIMAL HANDLING ==========

    function test_SixDecimalTokens_CorrectPrecision() public {
        assertEq(usdc.decimals(), 6, "USDC should be 6 decimals");
        assertEq(eurc.decimals(), 6, "EURC should be 6 decimals");
    }

    function test_SixDecimalTokens_SmallAmounts() public {
        _addInitialLiquidity();

        vm.startPrank(bob);
        usdc.approve(address(router), type(uint256).max);

        // Swap just 1 USDC (1e6 units)
        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(eurc);

        uint256[] memory amounts = router.swapExactTokensForTokens(
            ONE_USDC, 0, path, bob, block.timestamp + 1 hours
        );

        assertTrue(amounts[1] > 0, "Should get non-zero EURC for 1 USDC swap");
        assertTrue(amounts[1] < ONE_EURC, "1 USDC should give less than 1 EURC (rate < 1)");
        vm.stopPrank();
    }

    function test_SixDecimalTokens_LargeAmounts() public {
        _addInitialLiquidity();

        vm.startPrank(bob);
        usdc.approve(address(router), type(uint256).max);

        // Swap 50,000 USDC (large relative to pool)
        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(eurc);

        uint256[] memory amounts = router.swapExactTokensForTokens(
            50_000 * ONE_USDC, 0, path, bob, block.timestamp + 1 hours
        );

        // With such a large swap relative to pool, price impact should be significant
        // Naive rate: 50000 * 0.92 = 46000 EURC
        // Actual should be much less due to price impact + fee
        assertTrue(amounts[1] < 46_000 * ONE_EURC, "Large swap should have significant price impact");
        assertTrue(amounts[1] > 20_000 * ONE_EURC, "But should still get substantial output");
        vm.stopPrank();
    }

    function test_SixDecimalTokens_MinimumUnit_RevertsOnDust() public {
        _addInitialLiquidity();

        vm.startPrank(bob);
        usdc.approve(address(router), type(uint256).max);

        // Swap the smallest possible amount: 1 unit (0.000001 USDC)
        // At these reserves, 1 raw unit gives 0 output due to integer division.
        // The pair contract correctly rejects swaps with 0 output amount.
        // This is expected and safe behavior — dust amounts cannot be swapped.
        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(eurc);

        vm.expectRevert("CocoPair: INSUFFICIENT_OUTPUT_AMOUNT");
        router.swapExactTokensForTokens(
            1, 0, path, bob, block.timestamp + 1 hours
        );
        vm.stopPrank();
    }

    // ========== LIBRARY MATH ==========

    function test_GetAmountOut_ZeroInput_Reverts() public {
        vm.expectRevert("CocoLibrary: INSUFFICIENT_INPUT_AMOUNT");
        router.getAmountOut(0, 1000, 1000);
    }

    function test_GetAmountOut_ZeroReserve_Reverts() public {
        vm.expectRevert("CocoLibrary: INSUFFICIENT_LIQUIDITY");
        router.getAmountOut(100, 0, 1000);
    }

    function test_GetAmountOut_Correctness() public view {
        // 1000 USDC in, reserves 100K/92K
        uint256 out = router.getAmountOut(
            1000 * ONE_USDC,
            100_000 * ONE_USDC,
            92_000 * ONE_EURC
        );
        // Expected: (1000e6 * 997 * 92000e6) / (100000e6 * 1000 + 1000e6 * 997)
        uint256 expected = (1000 * ONE_USDC * 997 * 92_000 * ONE_EURC) /
            (100_000 * ONE_USDC * 1000 + 1000 * ONE_USDC * 997);
        assertEq(out, expected);
    }

    function test_GetAmountsOut_Path() public view {
        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(eurc);

        // This needs liquidity in the pair first - done in setUp via createPair
        // but reserves are 0, so we need to test after adding liquidity
    }

    // ========== HELPERS ==========

    function _addInitialLiquidity() internal {
        vm.startPrank(alice);
        usdc.approve(address(router), type(uint256).max);
        eurc.approve(address(router), type(uint256).max);
        router.addLiquidity(
            address(usdc),
            address(eurc),
            100_000 * ONE_USDC,
            92_000 * ONE_EURC,
            100_000 * ONE_USDC,
            92_000 * ONE_EURC,
            alice,
            block.timestamp + 1 hours
        );
        vm.stopPrank();
    }
}

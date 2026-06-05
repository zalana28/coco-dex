// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

import "../src/mocks/MockERC20.sol";
import "../stable/CocoStableLP.sol";
import "../stable/CocoStablePool.sol";

contract CocoStablePoolFuzzTest is Test {
    CocoStablePool public pool;
    CocoStableLP public lp;
    MockERC20 public usdc;
    MockERC20 public eurc;
    MockERC20 public unsupported;

    address public owner = makeAddr("owner");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    uint256 public constant ONE = 1e6;
    uint256 public constant AMP = 100;
    uint256 public constant FEE_BPS = 4;
    uint256 public constant MIN_FUZZ_AMOUNT = 1e3;
    uint256 public constant MAX_FUZZ_AMOUNT = 1e12;
    uint256 public constant INITIAL_LIQUIDITY = 1_000_000 * ONE;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        eurc = new MockERC20("Euro Coin", "EURC", 6);
        unsupported = new MockERC20("Unsupported", "BAD", 6);

        pool = new CocoStablePool(address(usdc), address(eurc), AMP, FEE_BPS, owner);
        lp = CocoStableLP(pool.lpToken());

        usdc.mint(alice, 10_000_000 * ONE);
        eurc.mint(alice, 10_000_000 * ONE);
        usdc.mint(bob, 10_000_000 * ONE);
        eurc.mint(bob, 10_000_000 * ONE);

        _approvePool(alice);
        _approvePool(bob);
    }

    function testFuzz_AddLiquidityMintsLpAndUpdatesBalances(uint256 amount0Seed, uint256 amount1Seed) public {
        uint256 amount0 = bound(amount0Seed, MIN_FUZZ_AMOUNT, MAX_FUZZ_AMOUNT);
        uint256 amount1 = bound(amount1Seed, MIN_FUZZ_AMOUNT, MAX_FUZZ_AMOUNT);

        (uint256 balance0Before, uint256 balance1Before) = pool.getBalances();
        uint256 supplyBefore = lp.totalSupply();

        vm.prank(alice);
        uint256 lpMinted = pool.addLiquidity(amount0, amount1, 0, alice);

        assertGt(lpMinted, 0, "successful deposit should mint LP");
        assertEq(lp.totalSupply(), supplyBefore + lpMinted, "LP supply should increase by minted amount");
        assertEq(lp.balanceOf(alice), lpMinted, "recipient should receive minted LP");
        _assertBalances(balance0Before + amount0, balance1Before + amount1);
    }

    function testFuzz_AddLiquidityRejectsZeroAmounts(uint256 nonzeroSeed) public {
        uint256 nonzero = bound(nonzeroSeed, MIN_FUZZ_AMOUNT, MAX_FUZZ_AMOUNT);

        vm.startPrank(alice);
        vm.expectRevert(CocoStablePool.ZeroAmount.selector);
        pool.addLiquidity(0, nonzero, 0, alice);

        vm.expectRevert(CocoStablePool.ZeroAmount.selector);
        pool.addLiquidity(nonzero, 0, 0, alice);
        vm.stopPrank();
    }

    function testFuzz_AddLiquidityMinLpOutProtection(uint256 amount0Seed, uint256 amount1Seed) public {
        uint256 amount0 = bound(amount0Seed, MIN_FUZZ_AMOUNT, MAX_FUZZ_AMOUNT);
        uint256 amount1 = bound(amount1Seed, MIN_FUZZ_AMOUNT, MAX_FUZZ_AMOUNT);
        uint256 expectedLp = _sqrt(amount0 * amount1);

        vm.prank(alice);
        vm.expectRevert(CocoStablePool.InsufficientLpOut.selector);
        pool.addLiquidity(amount0, amount1, expectedLp + 1, alice);
    }

    function testFuzz_RemoveLiquidityBurnsLpAndReturnsTokens(uint256 lpSeed) public {
        _addBalancedLiquidity(alice, INITIAL_LIQUIDITY);

        uint256 aliceLpBefore = lp.balanceOf(alice);
        uint256 lpAmount = bound(lpSeed, 1, aliceLpBefore);
        (uint256 balance0Before, uint256 balance1Before) = pool.getBalances();
        uint256 supplyBefore = lp.totalSupply();

        uint256 expected0 = (lpAmount * balance0Before) / supplyBefore;
        uint256 expected1 = (lpAmount * balance1Before) / supplyBefore;

        vm.prank(alice);
        (uint256 amount0, uint256 amount1) = pool.removeLiquidity(lpAmount, 0, 0, alice);

        assertEq(amount0, expected0, "token0 out should be proportional");
        assertEq(amount1, expected1, "token1 out should be proportional");
        assertEq(lp.totalSupply(), supplyBefore - lpAmount, "LP supply should decrease by burned amount");
        assertEq(lp.balanceOf(alice), aliceLpBefore - lpAmount, "LP holder balance should decrease");
        _assertBalances(balance0Before - amount0, balance1Before - amount1);
    }

    function testFuzz_RemoveLiquidityMinOutputProtection(uint256 lpSeed) public {
        _addBalancedLiquidity(alice, INITIAL_LIQUIDITY);

        uint256 lpAmount = bound(lpSeed, 1, lp.balanceOf(alice));
        (uint256 balance0Before,) = pool.getBalances();
        uint256 expected0 = (lpAmount * balance0Before) / lp.totalSupply();

        vm.prank(alice);
        vm.expectRevert(CocoStablePool.InsufficientAmountOut.selector);
        pool.removeLiquidity(lpAmount, expected0 + 1, 0, alice);
    }

    function testFuzz_SwapUsdcToEurcMatchesQuoteAndKeepsReservesSafe(uint256 amountSeed) public {
        _addBalancedLiquidity(alice, INITIAL_LIQUIDITY);
        uint256 amountIn = bound(amountSeed, MIN_FUZZ_AMOUNT, INITIAL_LIQUIDITY / 20);

        _assertSwapMatchesQuote(address(usdc), amountIn);
    }

    function testFuzz_SwapEurcToUsdcMatchesQuoteAndKeepsReservesSafe(uint256 amountSeed) public {
        _addBalancedLiquidity(alice, INITIAL_LIQUIDITY);
        uint256 amountIn = bound(amountSeed, MIN_FUZZ_AMOUNT, INITIAL_LIQUIDITY / 20);

        _assertSwapMatchesQuote(address(eurc), amountIn);
    }

    function testFuzz_SwapMinAmountOutProtection(uint256 amountSeed) public {
        _addBalancedLiquidity(alice, INITIAL_LIQUIDITY);
        uint256 amountIn = bound(amountSeed, MIN_FUZZ_AMOUNT, INITIAL_LIQUIDITY / 20);
        uint256 quote = pool.getAmountOut(address(usdc), amountIn);

        vm.prank(bob);
        vm.expectRevert(CocoStablePool.InsufficientAmountOut.selector);
        pool.swap(address(usdc), amountIn, quote + 1, bob);
    }

    function testFuzz_SwapFeeIsBounded(uint256 amountSeed) public view {
        uint256 amountIn = bound(amountSeed, MIN_FUZZ_AMOUNT, MAX_FUZZ_AMOUNT);
        uint256 feeAmount = (amountIn * pool.feeBps()) / pool.BPS_DENOMINATOR();

        if (amountIn >= 2_500) {
            assertGt(feeAmount, 0, "4 bps fee should be nonzero above 2500 base units");
        }
        assertLe(feeAmount, amountIn, "fee should never exceed amount in");
    }

    function testFuzz_RoundTripDoesNotCreateFreeProfit(uint256 amountSeed) public {
        _addBalancedLiquidity(alice, INITIAL_LIQUIDITY);
        uint256 amountIn = bound(amountSeed, 10 * ONE, INITIAL_LIQUIDITY / 100);

        uint256 bobUsdcBefore = usdc.balanceOf(bob);
        uint256 token1Out = pool.getAmountOut(address(usdc), amountIn);

        vm.prank(bob);
        uint256 firstOut = pool.swap(address(usdc), amountIn, 0, bob);
        assertEq(firstOut, token1Out, "first swap should match quote");

        uint256 token0Out = pool.getAmountOut(address(eurc), firstOut);
        vm.prank(bob);
        uint256 secondOut = pool.swap(address(eurc), firstOut, 0, bob);

        assertEq(secondOut, token0Out, "second swap should match quote");
        assertLe(usdc.balanceOf(bob), bobUsdcBefore, "round trip should not create profit");

        // The simplified curve may round tiny amounts to near-neutral, but fees and slippage
        // should keep a realistic round trip from returning more than the starting amount.
        assertLe(secondOut, amountIn, "round trip output should be at most the starting input");
    }

    function testFuzz_EdgeCaseSmallDeposits(uint256 amount0Seed, uint256 amount1Seed) public {
        uint256 amount0 = bound(amount0Seed, 1, MIN_FUZZ_AMOUNT);
        uint256 amount1 = bound(amount1Seed, 1, MIN_FUZZ_AMOUNT);

        vm.prank(alice);
        uint256 lpMinted = pool.addLiquidity(amount0, amount1, 0, alice);

        assertGt(lpMinted, 0, "small nonzero deposit should mint nonzero LP when sqrt is nonzero");
        _assertBalances(amount0, amount1);
    }

    function testFuzz_EdgeCaseSmallSwaps(uint256 amountSeed) public {
        _addBalancedLiquidity(alice, INITIAL_LIQUIDITY);
        uint256 amountIn = bound(amountSeed, MIN_FUZZ_AMOUNT, 10 * MIN_FUZZ_AMOUNT);

        uint256 quote = pool.getAmountOut(address(usdc), amountIn);
        assertGt(quote, 0, "small swap quote should be nonzero in a funded pool");

        vm.prank(bob);
        uint256 amountOut = pool.swap(address(usdc), amountIn, 0, bob);

        assertEq(amountOut, quote);
    }

    function testFuzz_EdgeCaseDustSwapCanRoundToZero(uint256 amountSeed) public {
        _addBalancedLiquidity(alice, INITIAL_LIQUIDITY);
        uint256 amountIn = bound(amountSeed, 1, MIN_FUZZ_AMOUNT - 1);
        uint256 quote = pool.getAmountOut(address(usdc), amountIn);

        if (quote == 0) {
            vm.prank(bob);
            vm.expectRevert(CocoStablePool.InsufficientAmountOut.selector);
            pool.swap(address(usdc), amountIn, 1, bob);
        } else {
            vm.prank(bob);
            uint256 amountOut = pool.swap(address(usdc), amountIn, quote, bob);
            assertEq(amountOut, quote);
        }
    }

    function testFuzz_EdgeCaseHighlyImbalancedLiquidity(uint256 smallSeed, uint256 largeSeed) public {
        uint256 smallAmount = bound(smallSeed, MIN_FUZZ_AMOUNT, 10 * ONE);
        uint256 largeAmount = bound(largeSeed, 100_000 * ONE, MAX_FUZZ_AMOUNT);

        vm.prank(alice);
        uint256 lpMinted = pool.addLiquidity(largeAmount, smallAmount, 0, alice);

        assertGt(lpMinted, 0, "imbalanced deposit should still mint LP in prototype");
        _assertBalances(largeAmount, smallAmount);
    }

    function testFuzz_EdgeCaseNearDrainQuoteIsSafe(uint256 amountSeed) public {
        _addBalancedLiquidity(alice, INITIAL_LIQUIDITY);
        uint256 amountIn = bound(amountSeed, INITIAL_LIQUIDITY, 1_000_000_000 * ONE);
        uint256 reserveOut = eurc.balanceOf(address(pool));

        uint256 quote = pool.getAmountOut(address(usdc), amountIn);

        assertLt(quote, reserveOut, "quote should be strictly less than available output reserve");
    }

    function _assertSwapMatchesQuote(address tokenIn, uint256 amountIn) internal {
        address tokenOut = tokenIn == address(usdc) ? address(eurc) : address(usdc);
        (uint256 balance0Before, uint256 balance1Before) = pool.getBalances();
        uint256 reserveOutBefore = MockERC20(tokenOut).balanceOf(address(pool));
        uint256 quote = pool.getAmountOut(tokenIn, amountIn);
        uint256 feeAmount = (amountIn * pool.feeBps()) / pool.BPS_DENOMINATOR();

        assertGt(quote, 0, "quote should be nonzero");
        assertLt(quote, reserveOutBefore, "quote should not drain output reserve");
        assertLe(feeAmount, amountIn, "fee should not exceed amount in");

        vm.prank(bob);
        uint256 amountOut = pool.swap(tokenIn, amountIn, quote, bob);

        assertEq(amountOut, quote, "swap should match read quote exactly");

        if (tokenIn == address(usdc)) {
            _assertBalances(balance0Before + amountIn, balance1Before - amountOut);
        } else {
            _assertBalances(balance0Before - amountOut, balance1Before + amountIn);
        }
    }

    function _addBalancedLiquidity(address provider, uint256 amount) internal {
        vm.prank(provider);
        pool.addLiquidity(amount, amount, 0, provider);
    }

    function _approvePool(address account) internal {
        vm.startPrank(account);
        usdc.approve(address(pool), type(uint256).max);
        eurc.approve(address(pool), type(uint256).max);
        vm.stopPrank();
    }

    function _assertBalances(uint256 expected0, uint256 expected1) internal view {
        (uint256 balance0, uint256 balance1) = pool.getBalances();
        assertEq(balance0, expected0, "reported token0 balance mismatch");
        assertEq(balance1, expected1, "reported token1 balance mismatch");
        assertEq(usdc.balanceOf(address(pool)), expected0, "actual token0 balance mismatch");
        assertEq(eurc.balanceOf(address(pool)), expected1, "actual token1 balance mismatch");
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}

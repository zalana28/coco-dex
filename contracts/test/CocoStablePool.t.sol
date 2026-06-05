// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

import "../src/mocks/MockERC20.sol";
import "../stable/CocoStableLP.sol";
import "../stable/CocoStablePool.sol";

contract CocoStablePoolTest is Test {
    CocoStablePool public pool;
    CocoStableLP public lp;
    MockERC20 public usdc;
    MockERC20 public eurc;
    MockERC20 public unsupported;

    address public owner = makeAddr("owner");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public carol = makeAddr("carol");

    uint256 public constant ONE = 1e6;
    uint256 public constant AMP = 100;
    uint256 public constant FEE_BPS = 4;

    event LiquidityAdded(
        address indexed provider,
        address indexed to,
        uint256 amount0,
        uint256 amount1,
        uint256 lpMinted
    );
    event LiquidityRemoved(
        address indexed provider,
        address indexed to,
        uint256 lpBurned,
        uint256 amount0,
        uint256 amount1
    );
    event Swap(
        address indexed sender,
        address indexed to,
        address indexed tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feeAmount
    );
    event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        eurc = new MockERC20("Euro Coin", "EURC", 6);
        unsupported = new MockERC20("Unsupported", "BAD", 6);

        pool = new CocoStablePool(address(usdc), address(eurc), AMP, FEE_BPS, owner);
        lp = CocoStableLP(pool.lpToken());

        usdc.mint(alice, 1_000_000 * ONE);
        eurc.mint(alice, 1_000_000 * ONE);
        usdc.mint(bob, 1_000_000 * ONE);
        eurc.mint(bob, 1_000_000 * ONE);
        unsupported.mint(alice, 10_000 * ONE);
    }

    function test_DeploymentStoresConfig() public view {
        (address token0, address token1) = pool.getTokens();
        assertEq(token0, address(usdc));
        assertEq(token1, address(eurc));
        assertEq(pool.feeBps(), FEE_BPS);
        assertEq(pool.amplificationParameter(), AMP);
        assertEq(pool.owner(), owner);
        assertEq(lp.pool(), address(pool));
        assertEq(lp.name(), "Coco Stable LP");
        assertEq(lp.symbol(), "cSLP");
        assertEq(lp.decimals(), 18);
    }

    function test_DeploymentRejectsZeroToken() public {
        vm.expectRevert(CocoStablePool.ZeroAddress.selector);
        new CocoStablePool(address(0), address(eurc), AMP, FEE_BPS, owner);

        vm.expectRevert(CocoStablePool.ZeroAddress.selector);
        new CocoStablePool(address(usdc), address(0), AMP, FEE_BPS, owner);
    }

    function test_DeploymentRejectsZeroOwner() public {
        vm.expectRevert();
        new CocoStablePool(address(usdc), address(eurc), AMP, FEE_BPS, address(0));
    }

    function test_DeploymentRejectsSameToken() public {
        vm.expectRevert(CocoStablePool.IdenticalTokens.selector);
        new CocoStablePool(address(usdc), address(usdc), AMP, FEE_BPS, owner);
    }

    function test_DeploymentRejectsFeeAboveCap() public {
        vm.expectRevert(CocoStablePool.FeeTooHigh.selector);
        new CocoStablePool(address(usdc), address(eurc), AMP, 31, owner);
    }

    function test_DeploymentRejectsInvalidAmplification() public {
        vm.expectRevert(CocoStablePool.InvalidAmplification.selector);
        new CocoStablePool(address(usdc), address(eurc), 0, FEE_BPS, owner);

        vm.expectRevert(CocoStablePool.InvalidAmplification.selector);
        new CocoStablePool(address(usdc), address(eurc), 10_001, FEE_BPS, owner);
    }

    function test_DeploymentRejectsMismatchedDecimals() public {
        MockERC20 token18 = new MockERC20("Token 18", "T18", 18);

        vm.expectRevert(CocoStablePool.DecimalMismatch.selector);
        new CocoStablePool(address(usdc), address(token18), AMP, FEE_BPS, owner);
    }

    function test_LpTokenOnlyPoolCanMintAndBurn() public {
        vm.startPrank(alice);
        vm.expectRevert(CocoStableLP.OnlyPool.selector);
        lp.mint(alice, ONE);

        vm.expectRevert(CocoStableLP.OnlyPool.selector);
        lp.burnFrom(alice, ONE);
        vm.stopPrank();
    }

    function test_AddLiquidityFirstBalancedDepositMintsLpAndEmits() public {
        _approvePool(alice);

        uint256 amount0 = 100_000 * ONE;
        uint256 amount1 = 100_000 * ONE;
        uint256 expectedLp = 100_000 * ONE;

        vm.expectEmit(true, true, false, true, address(pool));
        emit LiquidityAdded(alice, alice, amount0, amount1, expectedLp);

        vm.prank(alice);
        uint256 lpMinted = pool.addLiquidity(amount0, amount1, expectedLp, alice);

        assertEq(lpMinted, expectedLp);
        assertEq(lp.balanceOf(alice), expectedLp);
        _assertBalances(amount0, amount1);
    }

    function test_AddLiquiditySecondBalancedDepositMintsLp() public {
        _addInitialLiquidity(alice);

        uint256 supplyBefore = lp.totalSupply();
        vm.prank(alice);
        uint256 lpMinted = pool.addLiquidity(10_000 * ONE, 10_000 * ONE, 0, alice);

        assertEq(lpMinted, 10_000 * ONE);
        assertEq(lp.totalSupply(), supplyBefore + lpMinted);
        _assertBalances(110_000 * ONE, 110_000 * ONE);
    }

    function test_AddLiquidityImbalancedDepositWorksWithPenalty() public {
        _addInitialLiquidity(alice);

        vm.prank(alice);
        uint256 lpMinted = pool.addLiquidity(10_000 * ONE, 1_000 * ONE, 0, alice);

        assertGt(lpMinted, 0);
        assertLt(lpMinted, 10_000 * ONE);
        _assertBalances(110_000 * ONE, 101_000 * ONE);
    }

    function test_AddLiquidityMinLpOutTooHighReverts() public {
        _approvePool(alice);

        vm.prank(alice);
        vm.expectRevert(CocoStablePool.InsufficientLpOut.selector);
        pool.addLiquidity(100_000 * ONE, 100_000 * ONE, 100_000 * ONE + 1, alice);
    }

    function test_AddLiquidityZeroAmountsRevert() public {
        _approvePool(alice);

        vm.startPrank(alice);
        vm.expectRevert(CocoStablePool.ZeroAmount.selector);
        pool.addLiquidity(0, 1, 0, alice);

        vm.expectRevert(CocoStablePool.ZeroAmount.selector);
        pool.addLiquidity(1, 0, 0, alice);
        vm.stopPrank();
    }

    function test_AddLiquidityZeroRecipientReverts() public {
        _approvePool(alice);

        vm.prank(alice);
        vm.expectRevert(CocoStablePool.ZeroRecipient.selector);
        pool.addLiquidity(1, 1, 0, address(0));
    }

    function test_AddLiquidityInsufficientAllowanceReverts() public {
        vm.prank(alice);
        vm.expectRevert("MockERC20: INSUFFICIENT_ALLOWANCE");
        pool.addLiquidity(100_000 * ONE, 100_000 * ONE, 0, alice);
    }

    function test_AddLiquidityInsufficientBalanceReverts() public {
        _approvePool(carol);

        vm.prank(carol);
        vm.expectRevert("MockERC20: INSUFFICIENT_BALANCE");
        pool.addLiquidity(100_000 * ONE, 100_000 * ONE, 0, carol);
    }

    function test_RemoveLiquidityPartialReturnsProportionalTokensAndEmits() public {
        _addInitialLiquidity(alice);

        uint256 lpAmount = lp.balanceOf(alice) / 4;
        uint256 expectedAmount = 25_000 * ONE;

        vm.expectEmit(true, true, false, true, address(pool));
        emit LiquidityRemoved(alice, alice, lpAmount, expectedAmount, expectedAmount);

        vm.prank(alice);
        (uint256 amount0, uint256 amount1) = pool.removeLiquidity(lpAmount, expectedAmount, expectedAmount, alice);

        assertEq(amount0, expectedAmount);
        assertEq(amount1, expectedAmount);
        assertEq(lp.balanceOf(alice), 75_000 * ONE);
        _assertBalances(75_000 * ONE, 75_000 * ONE);
    }

    function test_RemoveLiquidityFullReturnsTokens() public {
        _addInitialLiquidity(alice);

        uint256 aliceUsdcBefore = usdc.balanceOf(alice);
        uint256 aliceEurcBefore = eurc.balanceOf(alice);
        uint256 lpAmount = lp.balanceOf(alice);

        vm.prank(alice);
        (uint256 amount0, uint256 amount1) = pool.removeLiquidity(lpAmount, 0, 0, alice);

        assertEq(amount0, 100_000 * ONE);
        assertEq(amount1, 100_000 * ONE);
        assertEq(lp.totalSupply(), 0);
        assertEq(usdc.balanceOf(alice), aliceUsdcBefore + amount0);
        assertEq(eurc.balanceOf(alice), aliceEurcBefore + amount1);
        _assertBalances(0, 0);
    }

    function test_RemoveLiquidityMinOutputsTooHighRevert() public {
        _addInitialLiquidity(alice);
        uint256 lpAmount = lp.balanceOf(alice) / 2;

        vm.expectRevert(CocoStablePool.InsufficientAmountOut.selector);
        vm.prank(alice);
        pool.removeLiquidity(lpAmount, 100_000 * ONE, 0, alice);
    }

    function test_RemoveLiquidityZeroLpAmountReverts() public {
        _addInitialLiquidity(alice);

        vm.prank(alice);
        vm.expectRevert(CocoStablePool.ZeroAmount.selector);
        pool.removeLiquidity(0, 0, 0, alice);
    }

    function test_RemoveLiquidityZeroRecipientReverts() public {
        _addInitialLiquidity(alice);

        vm.prank(alice);
        vm.expectRevert(CocoStablePool.ZeroRecipient.selector);
        pool.removeLiquidity(1, 0, 0, address(0));
    }

    function test_RemoveLiquidityWithoutLpReverts() public {
        _addInitialLiquidity(alice);

        vm.prank(bob);
        vm.expectRevert();
        pool.removeLiquidity(1, 0, 0, bob);
    }

    function test_SwapUsdcToEurcWorksAndMatchesQuote() public {
        _addInitialLiquidity(alice);
        _approvePool(bob);

        uint256 amountIn = 1_000 * ONE;
        uint256 quote = pool.getAmountOut(address(usdc), amountIn);
        uint256 feeAmount = (amountIn * FEE_BPS) / 10_000;

        vm.expectEmit(true, true, true, true, address(pool));
        emit Swap(bob, bob, address(usdc), address(eurc), amountIn, quote, feeAmount);

        vm.prank(bob);
        uint256 amountOut = pool.swap(address(usdc), amountIn, quote, bob);

        assertEq(amountOut, quote);
        assertEq(eurc.balanceOf(bob), 1_000_000 * ONE + quote);
        _assertBalances(101_000 * ONE, 100_000 * ONE - quote);
    }

    function test_SwapEurcToUsdcWorks() public {
        _addInitialLiquidity(alice);
        _approvePool(bob);

        uint256 amountIn = 1_000 * ONE;
        uint256 quote = pool.getAmountOut(address(eurc), amountIn);

        vm.prank(bob);
        uint256 amountOut = pool.swap(address(eurc), amountIn, quote, bob);

        assertEq(amountOut, quote);
        assertEq(usdc.balanceOf(bob), 1_000_000 * ONE + quote);
        _assertBalances(100_000 * ONE - quote, 101_000 * ONE);
    }

    function test_SwapMinAmountOutTooHighReverts() public {
        _addInitialLiquidity(alice);
        _approvePool(bob);

        uint256 amountIn = 1_000 * ONE;
        uint256 quote = pool.getAmountOut(address(usdc), amountIn);

        vm.prank(bob);
        vm.expectRevert(CocoStablePool.InsufficientAmountOut.selector);
        pool.swap(address(usdc), amountIn, quote + 1, bob);
    }

    function test_SwapZeroAmountReverts() public {
        _addInitialLiquidity(alice);

        vm.prank(bob);
        vm.expectRevert(CocoStablePool.ZeroAmount.selector);
        pool.swap(address(usdc), 0, 0, bob);
    }

    function test_SwapUnsupportedTokenReverts() public {
        _addInitialLiquidity(alice);

        vm.prank(bob);
        vm.expectRevert(CocoStablePool.UnsupportedToken.selector);
        pool.swap(address(unsupported), ONE, 0, bob);
    }

    function test_SwapZeroRecipientReverts() public {
        _addInitialLiquidity(alice);

        vm.prank(bob);
        vm.expectRevert(CocoStablePool.ZeroRecipient.selector);
        pool.swap(address(usdc), ONE, 0, address(0));
    }

    function test_SwapInsufficientAllowanceReverts() public {
        _addInitialLiquidity(alice);

        vm.prank(bob);
        vm.expectRevert("MockERC20: INSUFFICIENT_ALLOWANCE");
        pool.swap(address(usdc), ONE, 0, bob);
    }

    function test_SwapInsufficientBalanceReverts() public {
        _addInitialLiquidity(alice);
        _approvePool(carol);

        vm.prank(carol);
        vm.expectRevert("MockERC20: INSUFFICIENT_BALANCE");
        pool.swap(address(usdc), ONE, 0, carol);
    }

    function test_SwapFeeChargedInQuote() public {
        _addInitialLiquidity(alice);

        uint256 amountIn = 1_000 * ONE;
        uint256 quoteWithFee = pool.getAmountOut(address(usdc), amountIn);

        CocoStablePool noFeePool = new CocoStablePool(address(usdc), address(eurc), AMP, 0, owner);
        vm.startPrank(alice);
        usdc.approve(address(noFeePool), type(uint256).max);
        eurc.approve(address(noFeePool), type(uint256).max);
        noFeePool.addLiquidity(100_000 * ONE, 100_000 * ONE, 0, alice);
        vm.stopPrank();

        uint256 quoteNoFee = noFeePool.getAmountOut(address(usdc), amountIn);
        assertLt(quoteWithFee, quoteNoFee);
    }

    function test_RepeatedSwapsDoNotBreakAccounting() public {
        _addInitialLiquidity(alice);
        _approvePool(bob);

        for (uint256 i = 0; i < 5; i++) {
            vm.prank(bob);
            pool.swap(address(usdc), 1_000 * ONE, 0, bob);

            vm.prank(bob);
            pool.swap(address(eurc), 500 * ONE, 0, bob);
        }

        (uint256 balance0, uint256 balance1) = pool.getBalances();
        assertEq(balance0, usdc.balanceOf(address(pool)));
        assertEq(balance1, eurc.balanceOf(address(pool)));
        assertGt(balance0, 0);
        assertGt(balance1, 0);
    }

    function test_PoolNeverTransfersMoreThanAvailableBalance() public {
        _addInitialLiquidity(alice);
        _approvePool(bob);

        uint256 reserveOutBefore = eurc.balanceOf(address(pool));
        uint256 quote = pool.getAmountOut(address(usdc), 10_000_000 * ONE);

        assertLt(quote, reserveOutBefore);
    }

    function test_TotalLpSupplyChangesCorrectly() public {
        _addInitialLiquidity(alice);
        uint256 supplyAfterAdd = lp.totalSupply();
        uint256 lpAmount = lp.balanceOf(alice) / 2;

        vm.prank(alice);
        pool.removeLiquidity(lpAmount, 0, 0, alice);

        assertEq(lp.totalSupply(), supplyAfterAdd / 2);
    }

    function test_PauseBlocksAddRemoveAndSwap() public {
        _addInitialLiquidity(alice);
        _approvePool(bob);

        vm.prank(owner);
        pool.pause();
        assertTrue(pool.paused());

        vm.prank(alice);
        vm.expectRevert();
        pool.addLiquidity(1, 1, 0, alice);

        vm.prank(alice);
        vm.expectRevert();
        pool.removeLiquidity(1, 0, 0, alice);

        vm.prank(bob);
        vm.expectRevert();
        pool.swap(address(usdc), 1, 0, bob);

        vm.prank(owner);
        pool.unpause();
        assertFalse(pool.paused());
    }

    function test_OnlyOwnerCanPauseAndUpdateFee() public {
        vm.prank(alice);
        vm.expectRevert();
        pool.pause();

        vm.prank(alice);
        vm.expectRevert();
        pool.updateFee(5);
    }

    function test_UpdateFeeRespectsCapAndEmits() public {
        vm.expectEmit(false, false, false, true, address(pool));
        emit FeeUpdated(FEE_BPS, 5);

        vm.prank(owner);
        pool.updateFee(5);

        assertEq(pool.feeBps(), 5);

        vm.prank(owner);
        vm.expectRevert(CocoStablePool.FeeTooHigh.selector);
        pool.updateFee(31);
    }

    function test_RescueTokensCannotRescuePoolTokens() public {
        vm.startPrank(owner);
        vm.expectRevert(CocoStablePool.PoolTokenRescueForbidden.selector);
        pool.rescueTokens(address(usdc), owner, 1);

        vm.expectRevert(CocoStablePool.PoolTokenRescueForbidden.selector);
        pool.rescueTokens(address(eurc), owner, 1);
        vm.stopPrank();
    }

    function test_RescueTokensCanRecoverNonPoolTokens() public {
        vm.prank(alice);
        unsupported.transfer(address(pool), 100 * ONE);

        uint256 ownerBalanceBefore = unsupported.balanceOf(owner);
        vm.prank(owner);
        pool.rescueTokens(address(unsupported), owner, 100 * ONE);

        assertEq(unsupported.balanceOf(owner), ownerBalanceBefore + 100 * ONE);
    }

    function test_RescueTokensZeroRecipientReverts() public {
        vm.prank(owner);
        vm.expectRevert(CocoStablePool.ZeroRecipient.selector);
        pool.rescueTokens(address(unsupported), address(0), 1);
    }

    function _addInitialLiquidity(address provider) internal {
        _approvePool(provider);

        vm.prank(provider);
        pool.addLiquidity(100_000 * ONE, 100_000 * ONE, 0, provider);
    }

    function _approvePool(address account) internal {
        vm.startPrank(account);
        usdc.approve(address(pool), type(uint256).max);
        eurc.approve(address(pool), type(uint256).max);
        vm.stopPrank();
    }

    function _assertBalances(uint256 expected0, uint256 expected1) internal view {
        (uint256 balance0, uint256 balance1) = pool.getBalances();
        assertEq(balance0, expected0);
        assertEq(balance1, expected1);
        assertEq(usdc.balanceOf(address(pool)), expected0);
        assertEq(eurc.balanceOf(address(pool)), expected1);
    }
}

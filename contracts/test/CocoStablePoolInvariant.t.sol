// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/StdInvariant.sol";
import "forge-std/Test.sol";

import "../src/mocks/MockERC20.sol";
import "../stable/CocoStableLP.sol";
import "../stable/CocoStablePool.sol";

contract CocoStablePoolHandler is Test {
    CocoStablePool public pool;
    CocoStableLP public lp;
    MockERC20 public usdc;
    MockERC20 public eurc;

    address[] public actors;

    uint256 public constant ONE = 1e6;
    uint256 public constant MIN_AMOUNT = 1e3;
    uint256 public constant MAX_DEPOSIT = 1e12;
    uint256 public constant MAX_SWAP = 5e10;

    uint256 public successfulAdds;
    uint256 public successfulRemoves;
    uint256 public successfulSwaps;

    constructor(CocoStablePool pool_, MockERC20 usdc_, MockERC20 eurc_) {
        pool = pool_;
        lp = CocoStableLP(pool_.lpToken());
        usdc = usdc_;
        eurc = eurc_;

        actors.push(makeAddr("invariant-alice"));
        actors.push(makeAddr("invariant-bob"));
        actors.push(makeAddr("invariant-carol"));
        actors.push(makeAddr("invariant-dave"));
        actors.push(makeAddr("invariant-erin"));

        for (uint256 i = 0; i < actors.length; i++) {
            _mintAndApprove(actors[i], 10_000_000_000 * ONE);
        }
    }

    function addLiquidity(uint256 actorSeed, uint256 amount0Seed, uint256 amount1Seed) external {
        if (pool.paused()) return;

        address actor = _actor(actorSeed);
        uint256 amount0 = bound(amount0Seed, MIN_AMOUNT, MAX_DEPOSIT);
        uint256 amount1 = bound(amount1Seed, MIN_AMOUNT, MAX_DEPOSIT);
        uint256 supplyBefore = lp.totalSupply();

        vm.prank(actor);
        try pool.addLiquidity(amount0, amount1, 0, actor) returns (uint256 lpMinted) {
            assertGt(lpMinted, 0, "add should mint LP");
            assertGe(lp.totalSupply(), supplyBefore, "add should not burn LP");
            successfulAdds++;
        } catch {}
    }

    function removeLiquidity(uint256 actorSeed, uint256 lpSeed) external {
        if (pool.paused()) return;

        address actor = _actor(actorSeed);
        uint256 actorLp = lp.balanceOf(actor);
        if (actorLp == 0) return;

        uint256 lpAmount = bound(lpSeed, 1, actorLp);
        uint256 supplyBefore = lp.totalSupply();

        vm.prank(actor);
        try pool.removeLiquidity(lpAmount, 0, 0, actor) returns (uint256, uint256) {
            assertEq(lp.totalSupply(), supplyBefore - lpAmount, "remove should burn exact LP amount");
            successfulRemoves++;
        } catch {}
    }

    function swap(uint256 actorSeed, uint256 amountSeed, bool zeroForOne) external {
        if (pool.paused()) return;

        (uint256 balance0, uint256 balance1) = pool.getBalances();
        if (balance0 == 0 || balance1 == 0) return;

        address actor = _actor(actorSeed);
        address tokenIn = zeroForOne ? address(usdc) : address(eurc);
        uint256 reserveIn = zeroForOne ? balance0 : balance1;
        uint256 reserveOut = zeroForOne ? balance1 : balance0;
        uint256 maxAmount = _min(_min(MAX_SWAP, reserveIn / 5), reserveOut / 5);
        if (maxAmount < MIN_AMOUNT) return;

        uint256 amountIn = bound(amountSeed, MIN_AMOUNT, maxAmount);

        vm.prank(actor);
        try pool.swap(tokenIn, amountIn, 0, actor) returns (uint256 amountOut) {
            assertGt(amountOut, 0, "swap should return nonzero output");
            assertLt(amountOut, reserveOut, "swap should not drain output reserve");
            successfulSwaps++;
        } catch {}
    }

    function setPaused(bool paused_) external {
        if (paused_ && !pool.paused()) {
            pool.pause();
        } else if (!paused_ && pool.paused()) {
            pool.unpause();
        }
    }

    function sumKnownActorLpBalances() external view returns (uint256 total) {
        for (uint256 i = 0; i < actors.length; i++) {
            total += lp.balanceOf(actors[i]);
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _mintAndApprove(address actor, uint256 amount) internal {
        usdc.mint(actor, amount);
        eurc.mint(actor, amount);

        vm.startPrank(actor);
        usdc.approve(address(pool), type(uint256).max);
        eurc.approve(address(pool), type(uint256).max);
        vm.stopPrank();
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}

contract CocoStablePoolInvariantTest is StdInvariant, Test {
    CocoStablePool public pool;
    CocoStableLP public lp;
    MockERC20 public usdc;
    MockERC20 public eurc;
    MockERC20 public unsupported;
    CocoStablePoolHandler public handler;

    address public owner;

    uint256 public constant ONE = 1e6;
    uint256 public constant AMP = 100;
    uint256 public constant FEE_BPS = 4;
    uint256 public constant MAX_LP_SUPPLY_SANITY_BOUND = 1e30;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        eurc = new MockERC20("Euro Coin", "EURC", 6);
        unsupported = new MockERC20("Unsupported", "BAD", 6);

        owner = address(this);
        pool = new CocoStablePool(address(usdc), address(eurc), AMP, FEE_BPS, owner);
        lp = CocoStableLP(pool.lpToken());
        handler = new CocoStablePoolHandler(pool, usdc, eurc);
        pool.transferOwnership(address(handler));

        targetContract(address(handler));
    }

    function invariant_PoolBalancesMatchTokenBalances() public view {
        (uint256 balance0, uint256 balance1) = pool.getBalances();

        assertEq(balance0, usdc.balanceOf(address(pool)), "reported token0 balance must match actual");
        assertEq(balance1, eurc.balanceOf(address(pool)), "reported token1 balance must match actual");
        assertGe(usdc.balanceOf(address(pool)), balance0, "actual token0 must cover reported balance");
        assertGe(eurc.balanceOf(address(pool)), balance1, "actual token1 must cover reported balance");
    }

    function invariant_LpSupplyMatchesKnownActorsAndLiquidityState() public view {
        (uint256 balance0, uint256 balance1) = pool.getBalances();
        uint256 totalSupply = lp.totalSupply();

        assertLe(totalSupply, MAX_LP_SUPPLY_SANITY_BOUND, "LP supply should stay within sanity bound");
        assertEq(totalSupply, handler.sumKnownActorLpBalances(), "LP supply should equal tracked actor balances");

        if (totalSupply == 0) {
            assertEq(balance0, 0, "token0 liquidity should be zero when LP supply is zero");
            assertEq(balance1, 0, "token1 liquidity should be zero when LP supply is zero");
        } else {
            assertGt(balance0, 0, "token0 liquidity should exist when LP supply exists");
            assertGt(balance1, 0, "token1 liquidity should exist when LP supply exists");
        }
    }

    function invariant_QuoteAndFeeConfigurationRemainSafe() public {
        (uint256 balance0, uint256 balance1) = pool.getBalances();

        assertLe(pool.feeBps(), pool.MAX_FEE_BPS(), "fee should stay within cap");
        assertEq(pool.amplificationParameter(), AMP, "amplification should remain immutable");

        vm.expectRevert(CocoStablePool.UnsupportedToken.selector);
        pool.getAmountOut(address(unsupported), ONE);

        if (balance0 > 0 && balance1 > 0) {
            uint256 amountIn = _min(ONE, balance0);
            if (amountIn > 0) {
                uint256 quote0 = pool.getAmountOut(address(usdc), amountIn);
                assertLt(quote0, balance1, "token0 quote should be less than output balance");
            }

            amountIn = _min(ONE, balance1);
            if (amountIn > 0) {
                uint256 quote1 = pool.getAmountOut(address(eurc), amountIn);
                assertLt(quote1, balance0, "token1 quote should be less than output balance");
            }
        }
    }

    function invariant_PausedStateBlocksWritesAndAllowsReads() public {
        if (!pool.paused()) return;

        pool.getBalances();
        pool.getTokens();
        pool.feeBps();
        pool.amplificationParameter();

        address actor = address(0xBEEF);
        usdc.mint(actor, 10 * ONE);
        eurc.mint(actor, 10 * ONE);

        vm.startPrank(actor);
        usdc.approve(address(pool), type(uint256).max);
        eurc.approve(address(pool), type(uint256).max);

        vm.expectRevert();
        pool.addLiquidity(ONE, ONE, 0, actor);

        vm.expectRevert();
        pool.removeLiquidity(1, 0, 0, actor);

        vm.expectRevert();
        pool.swap(address(usdc), ONE, 0, actor);
        vm.stopPrank();
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}

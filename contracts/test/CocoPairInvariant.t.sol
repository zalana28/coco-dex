// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";
import "../src/CocoPair.sol";
import "../src/mocks/MockERC20.sol";

contract CocoPairHandler is Test {
    CocoPair internal immutable pair;
    MockERC20 internal immutable token0;
    MockERC20 internal immutable token1;

    constructor(CocoPair _pair, MockERC20 _token0, MockERC20 _token1) {
        pair = _pair;
        token0 = _token0;
        token1 = _token1;
    }

    function donateAndSync(uint112 amount0, uint112 amount1) external {
        amount0 = uint112(bound(amount0, 0, 1e24));
        amount1 = uint112(bound(amount1, 0, 1e24));
        token0.mint(address(pair), amount0);
        token1.mint(address(pair), amount1);
        pair.sync();
    }

    function addLiquidity(uint112 amount0, uint112 amount1) external {
        amount0 = uint112(bound(amount0, 1e6, 1e24));
        amount1 = uint112(bound(amount1, 1e6, 1e24));
        token0.mint(address(pair), amount0);
        token1.mint(address(pair), amount1);
        pair.mint(address(this));
    }

    function swap0For1(uint112 amountIn) external {
        amountIn = uint112(bound(amountIn, 1, 1e24));
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        uint256 amountOut = (uint256(amountIn) * 997 * reserve1) / (uint256(reserve0) * 1000 + uint256(amountIn) * 997);
        if (amountOut == 0) return;
        token0.mint(address(pair), amountIn);
        pair.swap(0, amountOut, address(this));
    }

    function swap1For0(uint112 amountIn) external {
        amountIn = uint112(bound(amountIn, 1, 1e24));
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        uint256 amountOut = (uint256(amountIn) * 997 * reserve0) / (uint256(reserve1) * 1000 + uint256(amountIn) * 997);
        if (amountOut == 0) return;
        token1.mint(address(pair), amountIn);
        pair.swap(amountOut, 0, address(this));
    }
}

contract CocoPairInvariantTest is StdInvariant, Test {
    CocoPair internal pair;
    MockERC20 internal token0;
    MockERC20 internal token1;
    CocoPairHandler internal handler;

    function setUp() public {
        token0 = new MockERC20("Token 0", "T0", 18);
        token1 = new MockERC20("Token 1", "T1", 18);
        pair = new CocoPair();
        pair.initialize(address(token0), address(token1));
        token0.mint(address(pair), 1e24);
        token1.mint(address(pair), 1e24);
        pair.mint(address(this));

        handler = new CocoPairHandler(pair, token0, token1);
        targetContract(address(handler));
    }

    function invariantReservesMatchTokenBalances() public view {
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        assertEq(reserve0, token0.balanceOf(address(pair)));
        assertEq(reserve1, token1.balanceOf(address(pair)));
    }

    function invariantLpSupplyEqualsTrackedBalances() public view {
        assertEq(
            pair.totalSupply(),
            pair.balanceOf(address(0xdead)) + pair.balanceOf(address(this)) + pair.balanceOf(address(handler))
        );
        assertEq(pair.balanceOf(address(0xdead)), pair.MINIMUM_LIQUIDITY());
    }

    function invariantConstantProductNeverFallsBelowInitialLiquidity() public view {
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        assertGe(uint256(reserve0) * uint256(reserve1), 1e48);
    }
}

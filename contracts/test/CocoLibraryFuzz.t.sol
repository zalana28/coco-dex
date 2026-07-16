// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/CocoLibrary.sol";

contract CocoLibraryHarness {
    function sortTokens(address tokenA, address tokenB) external pure returns (address token0, address token1) {
        return CocoLibrary.sortTokens(tokenA, tokenB);
    }

    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) external pure returns (uint256 amountB) {
        return CocoLibrary.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) external pure returns (uint256) {
        return CocoLibrary.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) external pure returns (uint256) {
        return CocoLibrary.getAmountIn(amountOut, reserveIn, reserveOut);
    }
}

contract CocoLibraryFuzzTest is Test {
    CocoLibraryHarness internal harness;

    function setUp() public {
        harness = new CocoLibraryHarness();
    }

    function testFuzzSortTokensOrdersDistinctNonzeroAddresses(address tokenA, address tokenB) public view {
        vm.assume(tokenA != address(0) && tokenB != address(0) && tokenA != tokenB);
        (address token0, address token1) = harness.sortTokens(tokenA, tokenB);
        assertLt(uint160(token0), uint160(token1));
        assertTrue((token0 == tokenA && token1 == tokenB) || (token0 == tokenB && token1 == tokenA));
    }

    function testFuzzQuoteMatchesRatio(uint128 amountA, uint128 reserveA, uint128 reserveB) public view {
        amountA = uint128(bound(amountA, 1, type(uint112).max));
        reserveA = uint128(bound(reserveA, 1, type(uint112).max));
        reserveB = uint128(bound(reserveB, 1, type(uint112).max));
        assertEq(harness.quote(amountA, reserveA, reserveB), uint256(amountA) * reserveB / reserveA);
    }

    function testFuzzGetAmountOutIsPositiveAndBelowReserve(uint128 amountIn, uint128 reserveIn, uint128 reserveOut)
        public
        view
    {
        amountIn = uint128(bound(amountIn, 1, type(uint112).max));
        reserveIn = uint128(bound(reserveIn, 1, type(uint112).max));
        reserveOut = uint128(bound(reserveOut, 2, type(uint112).max));
        uint256 amountOut = harness.getAmountOut(amountIn, reserveIn, reserveOut);
        assertLt(amountOut, reserveOut);
        uint256 amountInWithFee = uint256(amountIn) * 997;
        assertEq(amountOut, amountInWithFee * reserveOut / (uint256(reserveIn) * 1000 + amountInWithFee));
    }

    function testFuzzGetAmountInFundsRequestedOutput(uint128 amountOut, uint128 reserveIn, uint128 reserveOut)
        public
        view
    {
        reserveIn = uint128(bound(reserveIn, 1, type(uint112).max));
        reserveOut = uint128(bound(reserveOut, 2, type(uint112).max));
        amountOut = uint128(bound(amountOut, 1, uint256(reserveOut) - 1));
        uint256 amountIn = harness.getAmountIn(amountOut, reserveIn, reserveOut);
        assertGe(harness.getAmountOut(amountIn, reserveIn, reserveOut), amountOut);
        if (amountIn > 1) assertLt(harness.getAmountOut(amountIn - 1, reserveIn, reserveOut), amountOut);
    }
}

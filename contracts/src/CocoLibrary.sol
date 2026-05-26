// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import "./CocoPair.sol";

/**
 * @title CocoLibrary
 * @notice Helper library for Coco DEX AMM calculations.
 * @dev All math operates on ERC-20 token amounts (6 decimals for USDC/EURC on Arc).
 *      NEVER pass native gas amounts (18 decimals) to these functions.
 *
 *      Arc USDC note:
 *      - Native gas: 18 decimals (EVM wei)
 *      - ERC-20 USDC (0x360...000): 6 decimals
 *      - ERC-20 EURC (0x89B...72a): 6 decimals
 */
library CocoLibrary {
    /**
     * @notice Sort two token addresses.
     */
    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "CocoLibrary: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "CocoLibrary: ZERO_ADDRESS");
    }

    /**
     * @notice Get the pair address for two tokens from the factory.
     */
    function pairFor(address factory, address tokenA, address tokenB) internal view returns (address pair) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = ICocoFactory(factory).getPair(token0, token1);
        require(pair != address(0), "CocoLibrary: PAIR_NOT_FOUND");
    }

    /**
     * @notice Get reserves for a pair, ordered by tokenA/tokenB input order.
     */
    function getReserves(
        address factory,
        address tokenA,
        address tokenB
    ) internal view returns (uint256 reserveA, uint256 reserveB) {
        (address token0,) = sortTokens(tokenA, tokenB);
        (uint112 reserve0, uint112 reserve1,) = CocoPair(pairFor(factory, tokenA, tokenB)).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (uint256(reserve0), uint256(reserve1)) : (uint256(reserve1), uint256(reserve0));
    }

    /**
     * @notice Given an input amount and reserves, calculate the output amount.
     * @dev Implements constant product formula with 0.3% fee:
     *      amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
     */
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        require(amountIn > 0, "CocoLibrary: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "CocoLibrary: INSUFFICIENT_LIQUIDITY");
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 1000 + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /**
     * @notice Given an output amount and reserves, calculate the required input.
     */
    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountIn) {
        require(amountOut > 0, "CocoLibrary: INSUFFICIENT_OUTPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "CocoLibrary: INSUFFICIENT_LIQUIDITY");
        uint256 numerator = reserveIn * amountOut * 1000;
        uint256 denominator = (reserveOut - amountOut) * 997;
        amountIn = numerator / denominator + 1;
    }

    /**
     * @notice Calculate output amounts for a multi-hop path.
     */
    function getAmountsOut(
        address factory,
        uint256 amountIn,
        address[] memory path
    ) internal view returns (uint256[] memory amounts) {
        require(path.length >= 2, "CocoLibrary: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 0; i < path.length - 1; i++) {
            (uint256 reserveIn, uint256 reserveOut) = getReserves(factory, path[i], path[i + 1]);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    /**
     * @notice Calculate input amounts for a multi-hop path.
     */
    function getAmountsIn(
        address factory,
        uint256 amountOut,
        address[] memory path
    ) internal view returns (uint256[] memory amounts) {
        require(path.length >= 2, "CocoLibrary: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;
        for (uint256 i = path.length - 1; i > 0; i--) {
            (uint256 reserveIn, uint256 reserveOut) = getReserves(factory, path[i - 1], path[i]);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
        }
    }

    /**
     * @notice Given a desired amount of one token, compute the equivalent amount of the other.
     */
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) internal pure returns (uint256 amountB) {
        require(amountA > 0, "CocoLibrary: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "CocoLibrary: INSUFFICIENT_LIQUIDITY");
        amountB = (amountA * reserveB) / reserveA;
    }
}

interface ICocoFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

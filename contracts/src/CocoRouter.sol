// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import "./CocoLibrary.sol";
import "./CocoPair.sol";

/**
 * @title CocoRouter
 * @notice Router contract for Coco DEX — ERC-20 to ERC-20 swaps and liquidity ONLY.
 * @dev This router deliberately excludes all ETH/WETH/native-token operations:
 *      - NO addLiquidityETH
 *      - NO swapExactETHForTokens
 *      - NO swapExactTokensForETH
 *      - NO payable functions
 *      - NO WETH wrapping/unwrapping
 *
 *      On Arc Testnet, the native gas token is USDC at 18 decimals.
 *      For DeFi operations, USDC is accessed via its ERC-20 interface at
 *      0x3600000000000000000000000000000000000000 with 6 decimals.
 *      This router works exclusively with ERC-20 token balances.
 */
contract CocoRouter {
    address public immutable factory;

    // Deadline is a user-provided Unix timestamp. Comparing against block.timestamp
    // is intentional — it allows users to set transaction expiry to protect against
    // delayed inclusion. Validator manipulation of block.timestamp by a few seconds
    // is acceptable for this use case (same design as Uniswap V2).
    // forge-lint: disable-next-line(block-timestamp)
    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "CocoRouter: EXPIRED");
        _;
    }

    constructor(address _factory) {
        require(_factory != address(0), "CocoRouter: ZERO_FACTORY");
        factory = _factory;
    }

    // ========== LIQUIDITY ==========

    /**
     * @notice Add liquidity to an ERC-20/ERC-20 pool.
     * @dev Computes optimal amounts based on current reserves, transfers tokens to pair, and mints LP.
     */
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        CocoLibrary.sortTokens(tokenA, tokenB);
        require(to != address(0), "CocoRouter: INVALID_TO");
        require(amountADesired > 0 && amountBDesired > 0, "CocoRouter: INSUFFICIENT_DESIRED_AMOUNT");

        address pair = ICocoFactory(factory).getPair(tokenA, tokenB);
        // Compute optimal amounts
        (amountA, amountB) =
            _calculateLiquidityAmounts(pair, tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);

        if (pair == address(0)) pair = ICocoFactory(factory).createPair(tokenA, tokenB);
        _safeTransferFrom(tokenA, msg.sender, pair, amountA);
        _safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = CocoPair(pair).mint(to);
    }

    /**
     * @notice Remove liquidity from an ERC-20/ERC-20 pool.
     * @dev Transfers LP tokens to pair, burns them, and returns underlying tokens.
     */
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        require(to != address(0), "CocoRouter: INVALID_TO");
        require(liquidity > 0, "CocoRouter: INSUFFICIENT_LIQUIDITY");
        address pair = CocoLibrary.pairFor(factory, tokenA, tokenB);
        // Transfer LP tokens to the pair (check return value for safety)
        require(CocoPair(pair).transferFrom(msg.sender, pair, liquidity), "CocoRouter: LP_TRANSFER_FAILED");
        // Burn and receive tokens
        (uint256 amount0, uint256 amount1) = CocoPair(pair).burn(to);
        (address token0,) = CocoLibrary.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, "CocoRouter: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "CocoRouter: INSUFFICIENT_B_AMOUNT");
    }

    // ========== SWAP ==========

    /**
     * @notice Swap an exact input amount for as many output tokens as possible.
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(amountIn > 0, "CocoRouter: INSUFFICIENT_INPUT_AMOUNT");
        require(to != address(0), "CocoRouter: INVALID_TO");
        _validatePath(path);
        amounts = CocoLibrary.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "CocoRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        address pair = CocoLibrary.pairFor(factory, path[0], path[1]);
        _safeTransferFrom(path[0], msg.sender, pair, amounts[0]);
        _swap(amounts, path, to);
    }

    /**
     * @notice Swap tokens for an exact output amount.
     */
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(amountOut > 0, "CocoRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        require(amountInMax > 0, "CocoRouter: INSUFFICIENT_INPUT_AMOUNT");
        require(to != address(0), "CocoRouter: INVALID_TO");
        _validatePath(path);
        amounts = CocoLibrary.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, "CocoRouter: EXCESSIVE_INPUT_AMOUNT");
        address pair = CocoLibrary.pairFor(factory, path[0], path[1]);
        _safeTransferFrom(path[0], msg.sender, pair, amounts[0]);
        _swap(amounts, path, to);
    }

    // ========== VIEW FUNCTIONS ==========

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        external
        pure
        returns (uint256 amountOut)
    {
        return CocoLibrary.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts) {
        return CocoLibrary.getAmountsOut(factory, amountIn, path);
    }

    function getAmountsIn(uint256 amountOut, address[] calldata path) external view returns (uint256[] memory amounts) {
        return CocoLibrary.getAmountsIn(factory, amountOut, path);
    }

    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) external pure returns (uint256 amountB) {
        return CocoLibrary.quote(amountA, reserveA, reserveB);
    }

    // ========== INTERNAL ==========

    function _calculateLiquidityAmounts(
        address pair,
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal view returns (uint256 amountA, uint256 amountB) {
        if (pair == address(0)) {
            require(amountADesired >= amountAMin, "CocoRouter: INSUFFICIENT_A_AMOUNT");
            require(amountBDesired >= amountBMin, "CocoRouter: INSUFFICIENT_B_AMOUNT");
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            (uint256 reserveA, uint256 reserveB) = CocoLibrary.getReserves(factory, tokenA, tokenB);
            if (reserveA == 0 && reserveB == 0) {
                require(amountADesired >= amountAMin, "CocoRouter: INSUFFICIENT_A_AMOUNT");
                require(amountBDesired >= amountBMin, "CocoRouter: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (amountADesired, amountBDesired);
            } else {
                uint256 amountBOptimal = CocoLibrary.quote(amountADesired, reserveA, reserveB);
                if (amountBOptimal <= amountBDesired) {
                    require(amountBOptimal >= amountBMin, "CocoRouter: INSUFFICIENT_B_AMOUNT");
                    (amountA, amountB) = (amountADesired, amountBOptimal);
                } else {
                    uint256 amountAOptimal = CocoLibrary.quote(amountBDesired, reserveB, reserveA);
                    require(amountAOptimal <= amountADesired, "CocoRouter: EXCESSIVE_A_AMOUNT");
                    require(amountAOptimal >= amountAMin, "CocoRouter: INSUFFICIENT_A_AMOUNT");
                    (amountA, amountB) = (amountAOptimal, amountBDesired);
                }
            }
        }

        require(amountA >= amountAMin, "CocoRouter: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "CocoRouter: INSUFFICIENT_B_AMOUNT");
    }

    function _swap(uint256[] memory amounts, address[] memory path, address _to) internal {
        for (uint256 i = 0; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = CocoLibrary.sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) =
                input == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
            address to = i < path.length - 2 ? CocoLibrary.pairFor(factory, output, path[i + 2]) : _to;
            CocoPair(CocoLibrary.pairFor(factory, input, output)).swap(amount0Out, amount1Out, to);
        }
    }

    function _validatePath(address[] calldata path) private pure {
        require(path.length >= 2, "CocoRouter: INVALID_PATH");
        for (uint256 i = 0; i < path.length; i++) {
            require(path[i] != address(0), "CocoRouter: ZERO_ADDRESS");
            if (i > 0) require(path[i - 1] != path[i], "CocoRouter: IDENTICAL_ADDRESSES");
        }
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) private {
        (bool success, bytes memory data) =
            token.call(
                abi.encodeWithSelector(0x23b872dd, from, to, value) // transferFrom(address,address,uint256)
            );
        require(success && _didTransferSucceed(data), "CocoRouter: TRANSFER_FAILED");
    }

    function _didTransferSucceed(bytes memory data) private pure returns (bool succeeded) {
        if (data.length == 0) return true;
        if (data.length < 32) return false;
        assembly ("memory-safe") {
            succeeded := eq(mload(add(data, 32)), 1)
        }
    }
}

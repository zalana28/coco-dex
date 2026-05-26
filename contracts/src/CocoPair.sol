// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import "./CocoERC20.sol";

/**
 * @title CocoPair
 * @notice Uniswap V2-style constant product AMM pair for ERC-20 tokens.
 * @dev Designed for Arc Testnet where:
 *      - Native gas token is USDC at 18 decimals (EVM wei precision)
 *      - ERC-20 USDC uses 6 decimals (0x3600000000000000000000000000000000000000)
 *      - ERC-20 EURC uses 6 decimals (0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a)
 *
 *      This contract handles ERC-20 token amounts ONLY.
 *      It does NOT interact with native gas / payable flows.
 *      All reserve and balance math uses the token's own decimal precision (6 for USDC/EURC).
 *
 *      Fee model: 0.3% swap fee (identical to Uniswap V2).
 *      LP token: 18 decimals (standard for LP regardless of underlying).
 *
 * @dev Architecture inspired by Uniswap V2. Clean implementation, not a direct copy.
 */
contract CocoPair is CocoERC20 {
    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    address public factory;
    address public token0;
    address public token1;

    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    uint256 private unlocked = 1;

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    modifier lock() {
        require(unlocked == 1, "CocoPair: LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor() {
        factory = msg.sender;
    }

    /**
     * @notice Initialize the pair with two token addresses. Called once by factory.
     */
    function initialize(address _token0, address _token1) external {
        require(msg.sender == factory, "CocoPair: FORBIDDEN");
        token0 = _token0;
        token1 = _token1;
    }

    /**
     * @notice Get current reserves and last block timestamp.
     */
    function getReserves() public view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    /**
     * @notice Mint LP tokens proportional to liquidity added.
     * @dev Tokens must be transferred to this contract before calling mint.
     */
    function mint(address to) external lock returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        uint256 balance0 = _balanceOf(token0);
        uint256 balance1 = _balanceOf(token1);
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        uint256 _totalSupply = totalSupply;
        if (_totalSupply == 0) {
            liquidity = _sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0xdead), MINIMUM_LIQUIDITY); // permanently lock minimum liquidity
        } else {
            liquidity = _min(
                (amount0 * _totalSupply) / _reserve0,
                (amount1 * _totalSupply) / _reserve1
            );
        }
        require(liquidity > 0, "CocoPair: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);

        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1);
    }

    /**
     * @notice Burn LP tokens and return proportional underlying tokens.
     * @dev LP tokens must be transferred to this contract before calling burn.
     */
    function burn(address to) external lock returns (uint256 amount0, uint256 amount1) {
        uint256 balance0 = _balanceOf(token0);
        uint256 balance1 = _balanceOf(token1);
        uint256 liquidity = balanceOf[address(this)];

        uint256 _totalSupply = totalSupply;
        require(_totalSupply > 0, "CocoPair: NO_LIQUIDITY");
        amount0 = (liquidity * balance0) / _totalSupply;
        amount1 = (liquidity * balance1) / _totalSupply;
        require(amount0 > 0 && amount1 > 0, "CocoPair: INSUFFICIENT_LIQUIDITY_BURNED");

        _burn(address(this), liquidity);
        _safeTransfer(token0, to, amount0);
        _safeTransfer(token1, to, amount1);

        balance0 = _balanceOf(token0);
        balance1 = _balanceOf(token1);
        _update(balance0, balance1);

        emit Burn(msg.sender, amount0, amount1, to);
    }

    /**
     * @notice Execute a swap. At least one of amount0Out/amount1Out must be > 0.
     * @dev Validates the constant product invariant (with 0.3% fee) after the swap.
     *      Tokens to pay for the swap must be transferred before calling this function.
     */
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external lock {
        require(amount0Out > 0 || amount1Out > 0, "CocoPair: INSUFFICIENT_OUTPUT_AMOUNT");
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        require(amount0Out < _reserve0 && amount1Out < _reserve1, "CocoPair: INSUFFICIENT_LIQUIDITY");
        require(to != token0 && to != token1, "CocoPair: INVALID_TO");

        if (amount0Out > 0) _safeTransfer(token0, to, amount0Out);
        if (amount1Out > 0) _safeTransfer(token1, to, amount1Out);

        uint256 balance0 = _balanceOf(token0);
        uint256 balance1 = _balanceOf(token1);

        // Calculate input amounts
        uint256 amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "CocoPair: INSUFFICIENT_INPUT_AMOUNT");

        // Verify constant product with 0.3% fee:
        // (balance0 * 1000 - amount0In * 3) * (balance1 * 1000 - amount1In * 3) >= reserve0 * reserve1 * 1000^2
        {
            uint256 balance0Adjusted = balance0 * 1000 - amount0In * 3;
            uint256 balance1Adjusted = balance1 * 1000 - amount1In * 3;
            require(
                balance0Adjusted * balance1Adjusted >= uint256(_reserve0) * uint256(_reserve1) * 1000000,
                "CocoPair: K"
            );
        }

        _update(balance0, balance1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    /**
     * @notice Force reserves to match current balances.
     */
    function sync() external lock {
        _update(_balanceOf(token0), _balanceOf(token1));
    }

    // --- Internal helpers ---

    function _update(uint256 balance0, uint256 balance1) private {
        require(balance0 <= type(uint112).max && balance1 <= type(uint112).max, "CocoPair: OVERFLOW");
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = uint32(block.timestamp % 2**32);
        emit Sync(reserve0, reserve1);
    }

    function _balanceOf(address token) private view returns (uint256) {
        (bool success, bytes memory data) = token.staticcall(
            abi.encodeWithSelector(0x70a08231, address(this)) // balanceOf(address)
        );
        require(success && data.length >= 32, "CocoPair: BALANCE_CALL_FAILED");
        return abi.decode(data, (uint256));
    }

    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(0xa9059cbb, to, value) // transfer(address,uint256)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "CocoPair: TRANSFER_FAILED");
    }

    function _sqrt(uint256 y) private pure returns (uint256 z) {
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

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}

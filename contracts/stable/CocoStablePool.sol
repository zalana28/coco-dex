// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./CocoStableLP.sol";

/**
 * @title CocoStablePool
 * @notice Testnet-only prototype for a fixed two-token Coco stable pool.
 * @dev This is a simplified stable-swap inspired prototype. It is not Curve-equivalent
 *      production math. The amplification parameter adds virtual liquidity around
 *      balanced reserves to reduce slippage in tests, but final math needs deeper
 *      review, fuzzing, and invariant testing before any production claim.
 */
contract CocoStablePool is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_FEE_BPS = 30;
    uint256 public constant MAX_AMPLIFICATION = 10_000;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    address public immutable token0;
    address public immutable token1;
    address public immutable lpToken;
    uint8 public immutable tokenDecimals;

    uint256 public immutable amplificationParameter;
    uint256 public feeBps;

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

    error ZeroAddress();
    error IdenticalTokens();
    error UnsupportedToken();
    error FeeTooHigh();
    error ZeroAmount();
    error ZeroRecipient();
    error InvalidAmplification();
    error InvalidDecimals();
    error DecimalMismatch();
    error InsufficientLpOut();
    error InsufficientAmountOut();
    error InsufficientLiquidity();
    error PoolTokenRescueForbidden();

    constructor(
        address token0_,
        address token1_,
        uint256 amplificationParameter_,
        uint256 feeBps_,
        address owner_
    ) Ownable(owner_) {
        if (token0_ == address(0) || token1_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        if (token0_ == token1_) revert IdenticalTokens();
        if (amplificationParameter_ == 0 || amplificationParameter_ > MAX_AMPLIFICATION) {
            revert InvalidAmplification();
        }
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();

        uint8 decimals0 = _readDecimals(token0_);
        uint8 decimals1 = _readDecimals(token1_);
        if (decimals0 != decimals1) revert DecimalMismatch();

        token0 = token0_;
        token1 = token1_;
        tokenDecimals = decimals0;
        amplificationParameter = amplificationParameter_;
        feeBps = feeBps_;

        CocoStableLP stableLp = new CocoStableLP(address(this));
        lpToken = address(stableLp);
    }

    function addLiquidity(
        uint256 amount0,
        uint256 amount1,
        uint256 minLpOut,
        address to
    ) external nonReentrant whenNotPaused returns (uint256 lpMinted) {
        if (amount0 == 0 || amount1 == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroRecipient();

        (uint256 balance0Before, uint256 balance1Before) = getBalances();
        uint256 supply = CocoStableLP(lpToken).totalSupply();

        IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0);
        IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1);

        uint256 invariantBefore = _liquidityInvariant(balance0Before, balance1Before);
        uint256 invariantAfter = _liquidityInvariant(balance0Before + amount0, balance1Before + amount1);

        if (supply == 0) {
            lpMinted = _sqrt(amount0 * amount1);
        } else {
            uint256 invariantDelta = invariantAfter - invariantBefore;
            lpMinted = (invariantDelta * supply) / invariantBefore;
        }

        if (lpMinted < minLpOut) revert InsufficientLpOut();
        if (lpMinted == 0) revert InsufficientLpOut();

        CocoStableLP(lpToken).mint(to, lpMinted);
        emit LiquidityAdded(msg.sender, to, amount0, amount1, lpMinted);
    }

    function removeLiquidity(
        uint256 lpAmount,
        uint256 minAmount0Out,
        uint256 minAmount1Out,
        address to
    ) external nonReentrant whenNotPaused returns (uint256 amount0, uint256 amount1) {
        if (lpAmount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroRecipient();

        uint256 supply = CocoStableLP(lpToken).totalSupply();
        if (supply == 0) revert InsufficientLiquidity();

        (uint256 balance0, uint256 balance1) = getBalances();
        amount0 = (lpAmount * balance0) / supply;
        amount1 = (lpAmount * balance1) / supply;

        if (amount0 < minAmount0Out || amount1 < minAmount1Out) revert InsufficientAmountOut();
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidity();

        CocoStableLP(lpToken).burnFrom(msg.sender, lpAmount);
        IERC20(token0).safeTransfer(to, amount0);
        IERC20(token1).safeTransfer(to, amount1);

        emit LiquidityRemoved(msg.sender, to, lpAmount, amount0, amount1);
    }

    function swap(
        address tokenIn,
        uint256 amountIn,
        uint256 minAmountOut,
        address to
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroRecipient();

        (address tokenOut, uint256 reserveIn, uint256 reserveOut) = _swapContext(tokenIn);
        uint256 feeAmount = (amountIn * feeBps) / BPS_DENOMINATOR;
        amountOut = _getAmountOut(reserveIn, reserveOut, amountIn);

        if (amountOut < minAmountOut) revert InsufficientAmountOut();
        if (amountOut == 0 || amountOut >= reserveOut) revert InsufficientLiquidity();

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(to, amountOut);

        emit Swap(msg.sender, to, tokenIn, tokenOut, amountIn, amountOut, feeAmount);
    }

    function getAmountOut(address tokenIn, uint256 amountIn) external view returns (uint256) {
        if (amountIn == 0) revert ZeroAmount();
        (, uint256 reserveIn, uint256 reserveOut) = _swapContext(tokenIn);
        return _getAmountOut(reserveIn, reserveOut, amountIn);
    }

    function getBalances() public view returns (uint256 balance0, uint256 balance1) {
        balance0 = IERC20(token0).balanceOf(address(this));
        balance1 = IERC20(token1).balanceOf(address(this));
    }

    function getTokens() external view returns (address, address) {
        return (token0, token1);
    }

    function updateFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        uint256 oldFeeBps = feeBps;
        feeBps = newFeeBps;
        emit FeeUpdated(oldFeeBps, newFeeBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        if (token == token0 || token == token1) revert PoolTokenRescueForbidden();
        if (to == address(0)) revert ZeroRecipient();
        IERC20(token).safeTransfer(to, amount);
    }

    function _swapContext(address tokenIn)
        internal
        view
        returns (address tokenOut, uint256 reserveIn, uint256 reserveOut)
    {
        (uint256 balance0, uint256 balance1) = getBalances();
        if (tokenIn == token0) return (token1, balance0, balance1);
        if (tokenIn == token1) return (token0, balance1, balance0);
        revert UnsupportedToken();
    }

    function _getAmountOut(uint256 reserveIn, uint256 reserveOut, uint256 amountIn)
        internal
        view
        returns (uint256)
    {
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();

        uint256 feeAmount = (amountIn * feeBps) / BPS_DENOMINATOR;
        uint256 amountInAfterFee = amountIn - feeAmount;
        uint256 virtualLiquidity = _virtualLiquidity(reserveIn, reserveOut);

        uint256 numerator = amountInAfterFee * (reserveOut + virtualLiquidity);
        uint256 denominator = reserveIn + virtualLiquidity + amountInAfterFee;
        uint256 amountOut = numerator / denominator;

        if (amountOut >= reserveOut) return reserveOut - 1;
        return amountOut;
    }

    function _virtualLiquidity(uint256 reserveIn, uint256 reserveOut) internal view returns (uint256) {
        uint256 smallerReserve = reserveIn < reserveOut ? reserveIn : reserveOut;
        return smallerReserve * (amplificationParameter - 1);
    }

    function _liquidityInvariant(uint256 balance0, uint256 balance1) internal view returns (uint256) {
        uint256 smallerBalance = balance0 < balance1 ? balance0 : balance1;
        uint256 largerBalance = balance0 < balance1 ? balance1 : balance0;

        // Balance receives amplified weight while excess imbalance is counted at face value.
        return (smallerBalance * amplificationParameter * 2) + (largerBalance - smallerBalance);
    }

    function _readDecimals(address token) internal view returns (uint8) {
        try IERC20Metadata(token).decimals() returns (uint8 decimals_) {
            if (decimals_ > 18) revert InvalidDecimals();
            return decimals_;
        } catch {
            revert InvalidDecimals();
        }
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

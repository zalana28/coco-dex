// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/CocoPair.sol";
import "../src/mocks/MockERC20.sol";
import "../src/mocks/TransferBehaviorERC20.sol";

contract CocoPairTest is Test {
    CocoPair internal pair;
    MockERC20 internal token0;
    MockERC20 internal token1;
    address internal lp = makeAddr("lp");
    address internal trader = makeAddr("trader");

    function setUp() public {
        token0 = new MockERC20("Token 0", "T0", 18);
        token1 = new MockERC20("Token 1", "T1", 18);
        pair = new CocoPair();
        pair.initialize(address(token0), address(token1));
    }

    function testInitializeIsFactoryOnly() public {
        CocoPair uninitialized = new CocoPair();
        vm.prank(trader);
        vm.expectRevert("CocoPair: FORBIDDEN");
        uninitialized.initialize(address(token0), address(token1));
    }

    function testInitializeOnlyOnce() public {
        vm.expectRevert("CocoPair: ALREADY_INITIALIZED");
        pair.initialize(address(token0), address(token1));
    }

    function testInitializeRejectsInvalidTokens() public {
        CocoPair zeroPair = new CocoPair();
        vm.expectRevert("CocoPair: ZERO_ADDRESS");
        zeroPair.initialize(address(0), address(token1));

        CocoPair identicalPair = new CocoPair();
        vm.expectRevert("CocoPair: IDENTICAL_ADDRESSES");
        identicalPair.initialize(address(token0), address(token0));
    }

    function testMinimumLiquidityIsPermanentlyLocked() public {
        _seed(10_000, 10_000);
        uint256 liquidity = pair.mint(lp);
        assertEq(pair.balanceOf(address(0xdead)), pair.MINIMUM_LIQUIDITY());
        assertEq(pair.balanceOf(lp), liquidity);
        assertEq(pair.totalSupply(), 10_000);
        assertEq(liquidity, 9_000);
    }

    function testMintRejectsLiquidityAtOrBelowMinimum() public {
        _seed(1_000, 1_000);
        vm.expectRevert("CocoPair: INSUFFICIENT_LIQUIDITY_MINTED");
        pair.mint(lp);
    }

    function testMintAndBurnUpdateReserves() public {
        _seed(10_000, 20_000);
        uint256 liquidity = pair.mint(lp);
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        assertEq(reserve0, 10_000);
        assertEq(reserve1, 20_000);

        vm.prank(lp);
        assertTrue(pair.transfer(address(pair), liquidity));
        (uint256 amount0, uint256 amount1) = pair.burn(lp);
        assertGt(amount0, 0);
        assertGt(amount1, 0);
        (reserve0, reserve1,) = pair.getReserves();
        assertEq(reserve0, token0.balanceOf(address(pair)));
        assertEq(reserve1, token1.balanceOf(address(pair)));
        assertEq(pair.totalSupply(), pair.MINIMUM_LIQUIDITY());
    }

    function testSwapMaintainsFeeAdjustedInvariantAndUpdatesReserves() public {
        _seedAndMint(100_000, 100_000);
        uint256 amountIn = 1_000;
        uint256 amountOut = (amountIn * 997 * 100_000) / (100_000 * 1000 + amountIn * 997);
        token0.mint(address(pair), amountIn);
        pair.swap(0, amountOut, trader);

        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        assertEq(reserve0, 101_000);
        assertEq(reserve1, 100_000 - amountOut);
        assertGe(uint256(reserve0) * uint256(reserve1), 100_000 * 100_000);
        assertEq(token1.balanceOf(trader), amountOut);
    }

    function testSwapRejectsInvalidOutputsAndRecipient() public {
        _seedAndMint(100_000, 100_000);
        vm.expectRevert("CocoPair: INSUFFICIENT_OUTPUT_AMOUNT");
        pair.swap(0, 0, trader);
        vm.expectRevert("CocoPair: INSUFFICIENT_LIQUIDITY");
        pair.swap(100_000, 0, trader);
        vm.expectRevert("CocoPair: INSUFFICIENT_LIQUIDITY");
        pair.swap(0, 100_001, trader);
        vm.expectRevert("CocoPair: INVALID_TO");
        pair.swap(0, 1, address(0));
        vm.expectRevert("CocoPair: INVALID_TO");
        pair.swap(0, 1, address(token0));
    }

    function testSwapRejectsInsufficientInputAndInvariantViolation() public {
        _seedAndMint(100_000, 100_000);
        vm.expectRevert("CocoPair: INSUFFICIENT_INPUT_AMOUNT");
        pair.swap(0, 1_000, trader);

        token0.mint(address(pair), 1);
        vm.expectRevert("CocoPair: K");
        pair.swap(0, 1_000, trader);
    }

    function testSafeTransferAcceptsNoReturnData() public {
        TransferBehaviorERC20 special = new TransferBehaviorERC20();
        MockERC20 other = new MockERC20("Other", "O", 18);
        CocoPair specialPair = new CocoPair();
        specialPair.initialize(address(special), address(other));
        special.mint(address(specialPair), 10_000);
        other.mint(address(specialPair), 10_000);
        specialPair.mint(lp);
        special.setTransferBehavior(TransferBehaviorERC20.Behavior.ReturnNoData);
        special.mint(address(specialPair), 1_000);
        specialPair.swap(0, 900, trader);
    }

    function testSafeTransferRejectsFalseAndRevert() public {
        _assertFailedTransfer(TransferBehaviorERC20.Behavior.ReturnFalse);
        _assertFailedTransfer(TransferBehaviorERC20.Behavior.RevertCall);
    }

    function _assertFailedTransfer(TransferBehaviorERC20.Behavior behavior) private {
        TransferBehaviorERC20 special = new TransferBehaviorERC20();
        MockERC20 other = new MockERC20("Other", "O", 18);
        CocoPair specialPair = new CocoPair();
        specialPair.initialize(address(special), address(other));
        special.mint(address(specialPair), 10_000);
        other.mint(address(specialPair), 10_000);
        specialPair.mint(lp);
        special.setTransferBehavior(behavior);
        other.mint(address(specialPair), 1_000);
        vm.expectRevert("CocoPair: TRANSFER_FAILED");
        specialPair.swap(900, 0, trader);
    }

    function _seed(uint256 amount0, uint256 amount1) private {
        token0.mint(address(pair), amount0);
        token1.mint(address(pair), amount1);
    }

    function _seedAndMint(uint256 amount0, uint256 amount1) private {
        _seed(amount0, amount1);
        pair.mint(lp);
    }
}

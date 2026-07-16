// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/CocoFactory.sol";
import "../src/CocoPair.sol";
import "../src/CocoRouter.sol";
import "../src/mocks/MockERC20.sol";
import "../src/mocks/TransferBehaviorERC20.sol";

contract CocoRouterCorrectnessTest is Test {
    CocoFactory internal factory;
    CocoRouter internal router;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;

    address internal user = makeAddr("user");
    uint256 internal constant DEADLINE = type(uint256).max;

    function setUp() public {
        factory = new CocoFactory(address(this));
        router = new CocoRouter(address(factory));
        tokenA = new MockERC20("Token A", "A", 18);
        tokenB = new MockERC20("Token B", "B", 18);
        tokenA.mint(user, 1_000_000 ether);
        tokenB.mint(user, 1_000_000 ether);

        vm.startPrank(user);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function testInitialLiquidityCreatesMissingPair() public {
        assertEq(factory.getPair(address(tokenA), address(tokenB)), address(0));

        vm.prank(user);
        (uint256 amountA, uint256 amountB, uint256 liquidity) = router.addLiquidity(
            address(tokenA), address(tokenB), 10_000 ether, 20_000 ether, 10_000 ether, 20_000 ether, user, DEADLINE
        );

        address pair = factory.getPair(address(tokenA), address(tokenB));
        assertNotEq(pair, address(0));
        assertEq(factory.getPair(address(tokenB), address(tokenA)), pair);
        assertEq(amountA, 10_000 ether);
        assertEq(amountB, 20_000 ether);
        assertGt(liquidity, 0);
        assertEq(CocoPair(pair).balanceOf(user), liquidity);
    }

    function testInitialLiquidityValidatesMinimumsBeforeCreatingPair() public {
        vm.startPrank(user);
        vm.expectRevert("CocoRouter: INSUFFICIENT_A_AMOUNT");
        router.addLiquidity(address(tokenA), address(tokenB), 10_000, 20_000, 10_001, 20_000, user, DEADLINE);
        assertEq(factory.getPair(address(tokenA), address(tokenB)), address(0));
        vm.expectRevert("CocoRouter: INSUFFICIENT_B_AMOUNT");
        router.addLiquidity(address(tokenA), address(tokenB), 10_000, 20_000, 10_000, 20_001, user, DEADLINE);
        assertEq(factory.getPair(address(tokenA), address(tokenB)), address(0));
        vm.stopPrank();
    }

    function testInitialLiquidityRejectsZeroDesiredBeforeCreatingPair() public {
        vm.startPrank(user);
        vm.expectRevert("CocoRouter: INSUFFICIENT_DESIRED_AMOUNT");
        router.addLiquidity(address(tokenA), address(tokenB), 0, 20_000, 0, 0, user, DEADLINE);
        vm.expectRevert("CocoRouter: INSUFFICIENT_DESIRED_AMOUNT");
        router.addLiquidity(address(tokenA), address(tokenB), 10_000, 0, 0, 0, user, DEADLINE);
        vm.stopPrank();
        assertEq(factory.getPair(address(tokenA), address(tokenB)), address(0));
    }

    function testExistingPairUsesOptimalAmountsAndReversedOrdering() public {
        _addLiquidity(address(tokenA), address(tokenB), 10_000 ether, 20_000 ether);
        vm.prank(user);
        (uint256 amountA, uint256 amountB,) = router.addLiquidity(
            address(tokenB), address(tokenA), 10_000 ether, 10_000 ether, 10_000 ether, 5_000 ether, user, DEADLINE
        );
        assertEq(amountA, 10_000 ether);
        assertEq(amountB, 5_000 ether);

        vm.prank(user);
        vm.expectRevert("CocoRouter: INSUFFICIENT_B_AMOUNT");
        router.addLiquidity(
            address(tokenB), address(tokenA), 10_000 ether, 10_000 ether, 10_000 ether, 5_001 ether, user, DEADLINE
        );
    }

    function testExistingPairEnforcesBothMinimumAmountsInEachOptimalBranch() public {
        _addLiquidity(address(tokenA), address(tokenB), 10_000 ether, 20_000 ether);

        vm.startPrank(user);
        vm.expectRevert("CocoRouter: INSUFFICIENT_A_AMOUNT");
        router.addLiquidity(
            address(tokenA), address(tokenB), 10_000 ether, 20_000 ether, 10_001 ether, 20_000 ether, user, DEADLINE
        );

        vm.expectRevert("CocoRouter: INSUFFICIENT_B_AMOUNT");
        router.addLiquidity(
            address(tokenA), address(tokenB), 10_000 ether, 10_000 ether, 5_000 ether, 10_001 ether, user, DEADLINE
        );
        vm.stopPrank();
    }

    function testFuzzExistingPairOptimalLiquidity(uint112 reserveA, uint112 reserveB, uint112 desiredA) public {
        reserveA = uint112(bound(reserveA, 1e12, 1e24));
        reserveB = uint112(bound(reserveB, 1e12, 1e24));
        desiredA = uint112(bound(desiredA, 1e6, 1e24));
        uint256 desiredB = uint256(desiredA) * reserveB / reserveA;
        vm.assume(desiredB > 0 && desiredB <= 1e24);

        tokenA.mint(user, reserveA);
        tokenB.mint(user, reserveB + desiredB);
        _addLiquidity(address(tokenA), address(tokenB), reserveA, reserveB);

        vm.prank(user);
        (uint256 amountA, uint256 amountB,) = router.addLiquidity(
            address(tokenA), address(tokenB), desiredA, desiredB, desiredA, desiredB, user, DEADLINE
        );
        assertEq(amountA, desiredA);
        assertEq(amountB, desiredB);
    }

    function testRemoveLiquiditySupportsReversedOrdering() public {
        _addLiquidity(address(tokenA), address(tokenB), 10_000 ether, 20_000 ether);
        address pair = factory.getPair(address(tokenA), address(tokenB));
        uint256 liquidity = CocoPair(pair).balanceOf(user);
        vm.startPrank(user);
        CocoPair(pair).approve(address(router), liquidity);
        (uint256 amountB, uint256 amountA) =
            router.removeLiquidity(address(tokenB), address(tokenA), liquidity, 0, 0, user, DEADLINE);
        vm.stopPrank();
        assertGt(amountA, 0);
        assertGt(amountB, 0);
    }

    function testRouterRejectsExpiredDeadlineZeroRecipientAndInvalidTokens() public {
        vm.startPrank(user);
        vm.expectRevert("CocoRouter: EXPIRED");
        router.addLiquidity(address(tokenA), address(tokenB), 10_000, 10_000, 0, 0, user, block.timestamp - 1);
        vm.expectRevert("CocoRouter: INVALID_TO");
        router.addLiquidity(address(tokenA), address(tokenB), 10_000, 10_000, 0, 0, address(0), DEADLINE);
        vm.expectRevert("CocoLibrary: ZERO_ADDRESS");
        router.addLiquidity(address(0), address(tokenB), 10_000, 10_000, 0, 0, user, DEADLINE);
        vm.expectRevert("CocoLibrary: IDENTICAL_ADDRESSES");
        router.addLiquidity(address(tokenA), address(tokenA), 10_000, 10_000, 0, 0, user, DEADLINE);
        vm.stopPrank();
    }

    function testRouterRejectsZeroRecipientAndZeroAmountsAcrossEntryPoints() public {
        _addLiquidity(address(tokenA), address(tokenB), 10_000 ether, 20_000 ether);
        address pair = factory.getPair(address(tokenA), address(tokenB));
        uint256 liquidity = CocoPair(pair).balanceOf(user);
        address[] memory path = _path(address(tokenA), address(tokenB));

        vm.startPrank(user);
        CocoPair(pair).approve(address(router), liquidity);
        vm.expectRevert("CocoRouter: INVALID_TO");
        router.removeLiquidity(address(tokenA), address(tokenB), liquidity, 0, 0, address(0), DEADLINE);
        vm.expectRevert("CocoRouter: INSUFFICIENT_LIQUIDITY");
        router.removeLiquidity(address(tokenA), address(tokenB), 0, 0, 0, user, DEADLINE);
        vm.expectRevert("CocoRouter: INVALID_TO");
        router.swapExactTokensForTokens(1, 0, path, address(0), DEADLINE);
        vm.expectRevert("CocoRouter: INSUFFICIENT_INPUT_AMOUNT");
        router.swapExactTokensForTokens(0, 0, path, user, DEADLINE);
        vm.expectRevert("CocoRouter: INVALID_TO");
        router.swapTokensForExactTokens(1, 1, path, address(0), DEADLINE);
        vm.expectRevert("CocoRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        router.swapTokensForExactTokens(0, 1, path, user, DEADLINE);
        vm.expectRevert("CocoRouter: INSUFFICIENT_INPUT_AMOUNT");
        router.swapTokensForExactTokens(1, 0, path, user, DEADLINE);
        vm.stopPrank();
    }

    function testSwapRejectsMalformedPathsAndNonexistentPair() public {
        address[] memory shortPath = new address[](1);
        shortPath[0] = address(tokenA);
        vm.prank(user);
        vm.expectRevert("CocoRouter: INVALID_PATH");
        router.swapExactTokensForTokens(1, 0, shortPath, user, DEADLINE);

        vm.prank(user);
        vm.expectRevert("CocoRouter: IDENTICAL_ADDRESSES");
        router.swapExactTokensForTokens(1, 0, _path(address(tokenA), address(tokenA)), user, DEADLINE);
        vm.prank(user);
        vm.expectRevert("CocoRouter: ZERO_ADDRESS");
        router.swapExactTokensForTokens(1, 0, _path(address(tokenA), address(0)), user, DEADLINE);
        vm.prank(user);
        vm.expectRevert("CocoLibrary: PAIR_NOT_FOUND");
        router.swapExactTokensForTokens(1, 0, _path(address(tokenA), address(tokenB)), user, DEADLINE);
    }

    function testExactInputSwapAndInsufficientOutput() public {
        _addLiquidity(address(tokenA), address(tokenB), 100_000 ether, 100_000 ether);
        address[] memory path = _path(address(tokenA), address(tokenB));
        uint256 beforeBalance = tokenB.balanceOf(user);
        vm.prank(user);
        uint256[] memory amounts = router.swapExactTokensForTokens(1_000 ether, 1, path, user, DEADLINE);
        assertEq(tokenB.balanceOf(user) - beforeBalance, amounts[1]);
        vm.prank(user);
        vm.expectRevert("CocoRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        router.swapExactTokensForTokens(1_000 ether, 2_000 ether, path, user, DEADLINE);
    }

    function testExactOutputRejectsReserveOrMore() public {
        _addLiquidity(address(tokenA), address(tokenB), 100_000 ether, 100_000 ether);
        address[] memory path = _path(address(tokenA), address(tokenB));
        vm.startPrank(user);
        vm.expectRevert("CocoLibrary: INSUFFICIENT_LIQUIDITY");
        router.swapTokensForExactTokens(100_000 ether, type(uint256).max, path, user, DEADLINE);
        vm.expectRevert("CocoLibrary: INSUFFICIENT_LIQUIDITY");
        router.swapTokensForExactTokens(100_001 ether, type(uint256).max, path, user, DEADLINE);
        vm.stopPrank();
    }

    function testTransferFromAcceptsNoDataAndRejectsFalseOrRevert() public {
        TransferBehaviorERC20 special = new TransferBehaviorERC20();
        MockERC20 other = new MockERC20("Other", "O", 18);
        special.mint(user, 100_000);
        other.mint(user, 100_000);
        vm.startPrank(user);
        special.approve(address(router), type(uint256).max);
        other.approve(address(router), type(uint256).max);
        special.setTransferFromBehavior(TransferBehaviorERC20.Behavior.ReturnNoData);
        router.addLiquidity(address(special), address(other), 10_000, 10_000, 0, 0, user, DEADLINE);
        vm.stopPrank();
        _assertRouterTransferFromFailure(TransferBehaviorERC20.Behavior.ReturnFalse);
        _assertRouterTransferFromFailure(TransferBehaviorERC20.Behavior.RevertCall);
        _assertRouterTransferFromFailure(TransferBehaviorERC20.Behavior.ReturnShort);
        _assertRouterTransferFromFailure(TransferBehaviorERC20.Behavior.ReturnMalformedBool);
    }

    function _assertRouterTransferFromFailure(TransferBehaviorERC20.Behavior behavior) private {
        TransferBehaviorERC20 special = new TransferBehaviorERC20();
        MockERC20 other = new MockERC20("Other", "O", 18);
        special.mint(user, 100_000);
        other.mint(user, 100_000);
        vm.startPrank(user);
        special.approve(address(router), type(uint256).max);
        other.approve(address(router), type(uint256).max);
        special.setTransferFromBehavior(behavior);
        vm.expectRevert("CocoRouter: TRANSFER_FAILED");
        router.addLiquidity(address(special), address(other), 10_000, 10_000, 0, 0, user, DEADLINE);
        vm.stopPrank();
        assertEq(factory.getPair(address(special), address(other)), address(0));
    }

    function _addLiquidity(address first, address second, uint256 firstAmount, uint256 secondAmount) private {
        vm.prank(user);
        router.addLiquidity(first, second, firstAmount, secondAmount, 0, 0, user, DEADLINE);
    }

    function _path(address first, address second) private pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = first;
        path[1] = second;
    }
}

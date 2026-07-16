// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/CocoFactory.sol";
import "../src/CocoPair.sol";
import "../src/mocks/MockERC20.sol";

contract CocoFactoryTest is Test {
    CocoFactory internal factory;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairCount);

    function setUp() public {
        factory = new CocoFactory(address(this));
        tokenA = new MockERC20("Token A", "A", 18);
        tokenB = new MockERC20("Token B", "B", 18);
    }

    function testCreatePairStoresSymmetricMappingsAndAllPairs() public {
        address pair = factory.createPair(address(tokenA), address(tokenB));
        assertNotEq(pair, address(0));
        assertEq(factory.getPair(address(tokenA), address(tokenB)), pair);
        assertEq(factory.getPair(address(tokenB), address(tokenA)), pair);
        assertEq(factory.allPairs(0), pair);
        assertEq(factory.allPairsLength(), 1);

        (address token0, address token1) =
            address(tokenA) < address(tokenB) ? (address(tokenA), address(tokenB)) : (address(tokenB), address(tokenA));
        assertEq(CocoPair(pair).token0(), token0);
        assertEq(CocoPair(pair).token1(), token1);
        assertEq(CocoPair(pair).factory(), address(factory));
    }

    function testCreatePairEmitsOrderedEvent() public {
        (address token0, address token1) =
            address(tokenA) < address(tokenB) ? (address(tokenA), address(tokenB)) : (address(tokenB), address(tokenA));
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        address expectedPair = vm.computeCreate2Address(salt, keccak256(type(CocoPair).creationCode), address(factory));

        vm.expectEmit(true, true, false, true, address(factory));
        emit PairCreated(token0, token1, expectedPair, 1);
        assertEq(factory.createPair(address(tokenA), address(tokenB)), expectedPair);
    }

    function testCreatePairRejectsDuplicateBothOrders() public {
        factory.createPair(address(tokenA), address(tokenB));
        vm.expectRevert("CocoFactory: PAIR_EXISTS");
        factory.createPair(address(tokenA), address(tokenB));
        vm.expectRevert("CocoFactory: PAIR_EXISTS");
        factory.createPair(address(tokenB), address(tokenA));
        assertEq(factory.allPairsLength(), 1);
    }

    function testCreatePairRejectsZeroAddressBothOrders() public {
        vm.expectRevert("CocoFactory: ZERO_ADDRESS");
        factory.createPair(address(0), address(tokenA));
        vm.expectRevert("CocoFactory: ZERO_ADDRESS");
        factory.createPair(address(tokenA), address(0));
    }

    function testCreatePairRejectsIdenticalTokens() public {
        vm.expectRevert("CocoFactory: IDENTICAL_ADDRESSES");
        factory.createPair(address(tokenA), address(tokenA));
    }

    function testFeeToSettingsAreAuthorizedButInactive() public {
        address recipient = makeAddr("feeRecipient");
        factory.setFeeTo(recipient);
        assertEq(factory.feeTo(), recipient);

        vm.prank(makeAddr("unauthorized"));
        vm.expectRevert("CocoFactory: FORBIDDEN");
        factory.setFeeTo(makeAddr("otherRecipient"));
    }

    function testFuzzPairMappingIsSymmetric(address first, address second) public {
        vm.assume(first != address(0) && second != address(0) && first != second);
        vm.assume(first.code.length == 0 && second.code.length == 0);
        address pair = factory.createPair(first, second);
        assertEq(factory.getPair(first, second), pair);
        assertEq(factory.getPair(second, first), pair);
        assertEq(factory.allPairsLength(), 1);
    }
}

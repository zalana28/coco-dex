// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import "./CocoPair.sol";

/**
 * @title CocoFactory
 * @notice Factory contract for creating Coco DEX trading pairs.
 * @dev Creates CocoPair instances using CREATE2 for deterministic addresses.
 *      Inspired by Uniswap V2 Factory design. Clean implementation for Coco DEX.
 */
contract CocoFactory {
    /// @notice Reserved protocol-fee recipient setting. Classic Coco V2 pairs do not
    /// currently read this value or mint protocol LP fees, so changing it has no effect.
    address public feeTo;
    address public feeToSetter;

    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairCount);

    constructor(address _feeToSetter) {
        feeToSetter = _feeToSetter;
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    /**
     * @notice Create a new trading pair for two ERC-20 tokens.
     * @dev Tokens are sorted so that token0 < token1 (by address).
     *      Uses CREATE2 with salt = keccak256(token0, token1) for deterministic addressing.
     */
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "CocoFactory: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "CocoFactory: ZERO_ADDRESS");
        require(getPair[token0][token1] == address(0), "CocoFactory: PAIR_EXISTS");

        // Deploy pair using CREATE2
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        CocoPair newPair = new CocoPair{salt: salt}();
        newPair.initialize(token0, token1);

        pair = address(newPair);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // populate mapping in both directions
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function setFeeTo(address _feeTo) external {
        require(msg.sender == feeToSetter, "CocoFactory: FORBIDDEN");
        feeTo = _feeTo;
    }

    function setFeeToSetter(address _feeToSetter) external {
        require(msg.sender == feeToSetter, "CocoFactory: FORBIDDEN");
        feeToSetter = _feeToSetter;
    }
}

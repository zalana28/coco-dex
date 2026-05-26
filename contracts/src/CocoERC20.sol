// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

/**
 * @title CocoERC20
 * @notice Minimal ERC-20 implementation for Coco DEX LP tokens.
 * @dev Inspired by Uniswap V2's UniswapV2ERC20. Written from scratch for Coco DEX.
 *      LP tokens use 18 decimals regardless of the underlying pair token decimals.
 */
contract CocoERC20 {
    string public constant name = "Coco DEX LP";
    string public constant symbol = "COCO-LP";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function approve(address spender, uint256 value) external returns (bool) {
        _approve(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= value, "CocoERC20: INSUFFICIENT_ALLOWANCE");
            allowance[from][msg.sender] = currentAllowance - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function _approve(address owner, address spender, uint256 value) internal {
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(from != address(0), "CocoERC20: TRANSFER_FROM_ZERO");
        require(to != address(0), "CocoERC20: TRANSFER_TO_ZERO");
        require(balanceOf[from] >= value, "CocoERC20: INSUFFICIENT_BALANCE");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function _mint(address to, uint256 value) internal {
        require(to != address(0), "CocoERC20: MINT_TO_ZERO");
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint256 value) internal {
        require(balanceOf[from] >= value, "CocoERC20: INSUFFICIENT_BALANCE");
        balanceOf[from] -= value;
        totalSupply -= value;
        emit Transfer(from, address(0), value);
    }
}

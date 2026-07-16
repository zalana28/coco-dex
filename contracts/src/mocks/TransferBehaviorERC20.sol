// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract TransferBehaviorERC20 {
    enum Behavior {
        ReturnTrue,
        ReturnNoData,
        ReturnFalse,
        RevertCall
    }

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    Behavior public transferBehavior;
    Behavior public transferFromBehavior;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function setTransferBehavior(Behavior behavior) external {
        transferBehavior = behavior;
    }

    function setTransferFromBehavior(Behavior behavior) external {
        transferFromBehavior = behavior;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _applyBehavior(transferBehavior);
        _transfer(msg.sender, to, amount);
        if (transferBehavior == Behavior.ReturnNoData) {
            assembly ("memory-safe") {
                return(0, 0)
            }
        }
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        _applyBehavior(transferFromBehavior);
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "TransferBehaviorERC20: INSUFFICIENT_ALLOWANCE");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        if (transferFromBehavior == Behavior.ReturnNoData) {
            assembly ("memory-safe") {
                return(0, 0)
            }
        }
        return true;
    }

    function _applyBehavior(Behavior behavior) private pure {
        if (behavior == Behavior.ReturnFalse) {
            assembly ("memory-safe") {
                mstore(0, 0)
                return(0, 32)
            }
        }
        require(behavior != Behavior.RevertCall, "TransferBehaviorERC20: REVERTED");
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(to != address(0), "TransferBehaviorERC20: ZERO_TO");
        require(balanceOf[from] >= amount, "TransferBehaviorERC20: INSUFFICIENT_BALANCE");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

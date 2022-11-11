// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./interfaces/IPool.sol";

/**
 * @title Pool
 * @dev ETH pool; funds can only be transferred by Exchange or Swap
 */
contract Pool is IPool, OwnableUpgradeable, UUPSUpgradeable {
    // required by the OZ UUPS module
    function _authorizeUpgrade(address) internal override onlyOwner {}

    address private constant EXCHANGE = 0x707531c9999AaeF9232C8FEfBA31FBa4cB78d84a;
    // TODO: set proper address before deployment
    address private constant SWAP = 0x707531c9999AaeF9232C8FEfBA31FBa4cB78d84a;

    mapping(address => uint256) private _balances;

    event Transfer(address indexed from, address indexed to, uint256 amount);

    /**
     * @dev receive deposit function
     */
    receive() external payable {
        deposit();
    }

    /**
     * @dev deposit ETH into pool
     */
    function deposit() public payable {
        _balances[msg.sender] += msg.value;
        emit Transfer(msg.sender, address(0), msg.value);
    }

    /**
     * @dev withdraw ETH from pool
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 amount) public {
        require(_balances[msg.sender] >= amount);
        _balances[msg.sender] -= amount;
        (bool success,) = payable(msg.sender).call{value: amount}("");
        require(success);
        emit Transfer(address(0), msg.sender, amount);
    }

    /**
     * @dev transferFrom Transfer balances within pool; only callable by Swap and Exchange
     * @param from Pool fund sender
     * @param to Pool fund recipient
     * @param amount Amount to transfer
     */
    function transferFrom(address from, address to, uint256 amount)
        public
        returns (bool)
    {
        if (msg.sender != EXCHANGE && msg.sender != SWAP) {
            revert('Caller is not authorized to transfer');
        }
        _transfer(from, to, amount);

        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(_balances[from] >= amount);
        require(to != address(0));
        _balances[from] -= amount;
        _balances[to] += amount;

        emit Transfer(from, to, amount);
    }

    function balanceOf(address user) public view returns (uint256) {
        return _balances[user];
    }

    function totalSupply() public view returns (uint256) {
        return address(this).balance;
    }
}

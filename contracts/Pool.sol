// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract Pool is OwnableUpgradeable, UUPSUpgradeable {
    // required by the OZ UUPS module
    function _authorizeUpgrade(address) internal override onlyOwner {}

    constructor() {
      _disableInitializers();
    }

    address private constant EXCHANGE = 0x000000000000Ad05Ccc4F10045630fb830B95127;
    address private constant SWAP = 0x39da41747a83aeE658334415666f3EF92DD0D541;

    event Transfer(address indexed from, address indexed to, uint256 amount);

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) public allowance;

    fallback() external payable {
        deposit();
    }
    function deposit() public payable {
        _balances[msg.sender] += msg.value;
        emit Transfer(msg.sender, address(0), msg.value);
    }

    function withdraw(uint256 amount) public {
        require(_balances[msg.sender] >= amount);
        _balances[msg.sender] -= amount;
        (bool success,) = payable(msg.sender).call{value: amount}("");
        require(success);
        emit Transfer(address(0), msg.sender, amount);
    }

    function balanceOf(address user) public view returns (uint256) {
        return _balances[user];
    }

    function totalSupply() public view returns (uint256) {
        return address(this).balance;
    }

    function transferFrom(address from, address to, uint256 amount)
        public
        returns (bool)
    {
        if (msg.sender != EXCHANGE && msg.sender != SWAP) {
            revert('Caller is not authorized');
        }
        _transfer(from, to, amount);

        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(_balances[from] >= amount);
        _balances[from] -= amount;
        _balances[to] += amount;

        emit Transfer(from, to, amount);
    }
}

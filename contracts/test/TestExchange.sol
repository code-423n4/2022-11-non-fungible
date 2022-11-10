// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../Exchange.sol";

contract TestExchange is Exchange {
    function validateOrderParameters(Order calldata order, bytes32 hash)
        external
        view
        returns (bool)
    {
        return _validateOrderParameters(order, hash);
    }

    function canMatchOrders(Order calldata sell, Order calldata buy)
        external
        view
        returns (uint256 price, uint256 tokenId, uint256 amount, AssetType assetType)
    {
        return _canMatchOrders(sell, buy);
    }

    function validateSignatures(Input calldata order, bytes32 orderHash)
        external
        view
        returns (bool)
    {
        return _validateSignatures(order, orderHash);
    }
}

# Non Fungible Trading contest details
- Total Prize Pool: $36,500 USDC
  - HM awards: $25,500 USDC
  - QA report awards: $3,000 USDC
  - Gas report awards: $1,500 USDC
  - Judge + presort awards: $6,000 USDC
  - Scout awards: $500 USDC
- Join [C4 Discord](https://discord.gg/code4rena) to register
- Submit findings [using the C4 form](https://code4rena.com/contests/2022-11-non-fungible-trading-contest/submit)
- [Read our guidelines for more details](https://docs.code4rena.com/roles/wardens)
- Starts November 11, 2022 20:00 UTC
- Ends November 14, 2022 20:00 UTC

## C4udit / Publicly Known Issues

The C4audit output for the contest can be found [here](https://gist.github.com/Picodes/b6a69e8605531f4ce59b00009b73e68b).

*Note for C4 wardens: Anything included in the C4udit output is considered a publicly known issue and is ineligible for awards.*

# Overview
The Exchange is a single token exchange enabling transfers of ERC721/ERC1155 for ETH/WETH. It uses a ERC1967 proxy pattern and consists of main components (1) [Exchange](https://github.com/code-423n4/2022-11-non-fungible/blob/main/contracts/Exchange.sol), (2) [MatchingPolicy](https://github.com/code-423n4/2022-11-non-fungible/blob/main/contracts/PolicyManager.sol), (3) [ExecutionDelegate](https://github.com/code-423n4/2022-11-non-fungible/blob/main/contracts/ExecutionDelegate.sol).

The base protocol has been already audited, this audit includes the following upgrades:
  - Add bulk execute function; attempted executions that fail should be bypassed
  - Implement the `Pool` feature, allowing users to pre-deposit approved funds to be used when a seller takes a bid
The previous version of `Exchange.sol` is included in the repo as well as `Exchange_old.sol` for reference.

Although the protocol can be called and used by anyone, we maintain the main orderbook for valid orders.

The domain version is intentionally not updated as there is no major change to the matching logic, thus all current orders should remain valid.

### Execution
Order matching can be executed by any party as long as valid signatures are included. There is an `execute` method for single orders and a `bulkExecute` method for multiple orders. This method of implementation requires a public `_execute` method which should not be called directly, it should only be called from `execute` and `bulkExecute`. There is a protective modifier `internalCall` which checks an `isInternal` parameter set by `execute` and `bulkExecute`. Additionally, the two execution methods set `remainingETH` at the beginning of the call to properly track the amount of ETH sent in the transaction as it gets used to fill orders.

### Signature Authentication

#### User Signatures
The exchange accepts two types of signature authentication determined by a `signatureVersion` parameter - single or bulk. Single listings are authenticated via a signature of the order hash.
  
##### Bulk Listing
To bulk list, the user will produce a merkle tree from the order hashes and sign the root. To verify, the respective merkle path for the order will be packed in `extraSignature`, the merkle root will be reconstructed from the order and merkle path, and the signature will be validated.

#### Oracle Signatures
This feature allows a user to opt-in to require an authorized oracle signature of the order with a recent block number. This enables an off-chain cancellation method where the oracle can continue to provide signatures to potential takers, until the user requests the oracle to stop. After some period of time, the old oracle signatures will expire.

To opt-in, the user has to set the first byte in `extraParams` to 1. In order to fulfill the order, the oracle signature has to be packed in `extraSignature` and the `blockNumber` set to what was signed by the oracle.


### Order matching - [PolicyManager](https://github.com/code-423n4/2022-11-non-fungible/blob/main/contracts/PolicyManager.sol)
In order to maintain flexibility with the types of orders and methods of matching that the exchange is able to execute, the order matching logic is separated to a set of whitelisted matching policies. The responsibility of each policy is to assert the criteria for a valid match are met and return the parameters for proper execution -
  - `price` - matching price
  - `tokenId` - NFT token id to transfer
  - `amount` - (for erc1155) amount of the token to transfer
  - `assetType` - `ERC721` or `ERC1155`

Currently, we only support standard orders for ERC721 tokens. But have plans for additional order types including collection bids.

Note: we are aware that determining the maker/taker order is able to manipulated by changing the listing time. However, we don't believe there are vulnerabilities associated with this and will ensure non are presented in future matching policies.


### Transfer approvals - [ExecutionDelegate](https://github.com/code-423n4/2022-11-non-fungible/blob/main/contracts/ExecutionDelegate.sol)
Ultimately, token approval is only needed for calling transfer functions on `ERC721`, `ERC1155`, or `ERC20`. The `ExecutionDelegate` is a shared transfer proxy that can only call these transfer functions. There are additional safety features to ensure the proxy approval cannot be used maliciously.

#### Safety features
  - The calling contract must be approved on the `ExecutionDelegate`
  - Users have the ability to revoke approval from the `ExecutionDelegate` without having to individually calling every token contract.

### Cancellations
**On-chain methods**
  - `cancelOrder(Order order)` - must be called from `trader`; records order hash in `cancelledOrFilled` mapping that's checked when validating orders
  - `cancelOrders(Order[] orders)` - must be called from `trader`; calls `cancelOrder` for each order
  - `incrementNonce()` - increments the nonce of the `msg.sender`; all orders signed with the previous nonce are invalid

**Off-chain methods**
  - Oracle cancellations - if the order is signed with an `expirationTime` of 0, a user can request an oracle to stop producing authorization signatures; without a recent signature, the order will not be able to be matched

## Smart Contracts
### Exchange.sol
Core exchange contract responsible for coordinating the matching of orders and execution of the transfers.

It calls 4 external contracts
  - `PolicyManager`
  - `ExecutionDelegate`
  - Matching Policy
  - `Pool`

It uses 1 library
  - `MerkleVerifier`

It inherits the following contracts

#### EIP712.sol (134 sloc)
Contract containing all EIP712 compliant order hashing functions

#### ERC1967Proxy.sol (12 sloc)
Standard ERC1967 Proxy implementation

#### OrderStructs.sol (32 sloc)
Contains all necessary structs and enums for the Exchange

#### ReentrancyGuarded.sol (10 sloc)
Modifier for reentrancy protection

#### MerkleVerifier.sol (38 sloc)
Library for Merkle tree computations

### Pool.sol (51 sloc)
The pool allows user to predeposit ETH so that it can be used when a seller takes their bid. It uses an ERC1967 proxy pattern and only the exchange contract is permitted to make transfers.

### ExecutionDelegate.sol
Approved proxy to execute ERC721, ERC1155, and ERC20 transfers

Includes safety functions to allow for easy management of approvals by users

It calls 3 external contract interfaces
  - ERC721
  - ERC20
  - ERC1155

#### PolicyManager.sol
Contract responsible for maintaining a whitelist for matching policies

#### StandardPolicyERC721.sol
Matching policy for standard fixed price sale of an ERC721 token


# Scope
All the contracts in this section are to be reviewed. Any contracts not in this list are to be ignored for this contest.

## Files in scope
| Contract | SLOC | Purpose | Libraries used |  
| ----------- | ----------- | ----------- | ----------- |
| contracts/Exchange.sol | 437 | Core exchange contract responsible for coordinating the matching of orders and execution of the transfers. | [`@openzeppelin/*`](<(https://openzeppelin.com/contracts/)>) |
| contracts/Pool.sol | 437 | The pool allows user to predeposit ETH so that it can be used when a seller takes their bid. | |

## Out of Scope
  - `Exchange_old.sol` (for reference as the current implementation)
  - `ExecutionDelegate.sol`
  - `PolicyManager.sol`
  - `StandardPolicyERC721.sol`
  - `lib/*`
  - `interfaces/*`


# Development Documentation
Node version v16

- Setup - `yarn setup`
- Install packages - `yarn`
- Compile contracts - `yarn compile`
- Test coverage - `yarn coverage`
- Run tests - `yarn test`

Or use these builds command to run the tests

- ```rm -Rf 2022-11-non-fungible || true && git clone https://github.com/code-423n4/2022-11-non-fungible.git && cd 2022-11-non-fungible && yarn setup```

- Only add an `INFURA_API_KEY` to `.env`. Do not edit the rest.

- ```nvm install 16.0 && yarn && yarn compile && REPORT_GAS=true yarn test```

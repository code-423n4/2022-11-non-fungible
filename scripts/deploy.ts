import { Contract } from 'ethers';
import hre from 'hardhat';
import { getAddress, getContract, updateAddresses } from './utils';
import { deploy, waitForTx, task } from '../web3-utils';

async function deployPart1(): Promise<{
  executionDelegate: Contract;
}> {
  const executionDelegate = await deploy('ExecutionDelegate');
  await waitForTx(
    executionDelegate.approveContract(
      '0x000000000000ad05ccc4f10045630fb830b95127',
    ),
  );
  return { executionDelegate };
}

async function deployPart2(exchangeName = 'Exchange'): Promise<{
  exchangeImpl: Contract;
  policyManager: Contract;
  merkleVerifier: Contract;
}> {
  const policyManager = await deploy('PolicyManager');

  const merkleVerifier = await deploy('MerkleVerifier', []);
  const exchangeImpl = await deploy(
    exchangeName,
    [],
    { libraries: { MerkleVerifier: merkleVerifier.address } },
    'ExchangeImpl',
  );
  return { exchangeImpl, policyManager, merkleVerifier };
}

async function deployPart3(
  executionDelegate: Contract,
  policyManagerAddress: string,
  oracleAddress: string,
  blockRange: number,
  exchangeImplAddress: string,
): Promise<{
  exchangeProxy: Contract;
}> {
  const initializeInterface = new hre.ethers.utils.Interface([
    'function initialize(address, address, address, uint256)',
  ]);
  const initialize = initializeInterface.encodeFunctionData('initialize', [
    executionDelegate.address, // _executionDelegate
    policyManagerAddress, // _policyManager
    oracleAddress, // _oracle
    blockRange, // _blockRange
  ]);
  const exchangeProxy = await deploy(
    'ERC1967Proxy',
    [exchangeImplAddress, initialize],
    {},
    'Exchange',
  );
  return { exchangeProxy };
}

export async function deployPool(): Promise<Contract> {
  const poolImpl = await deploy('Pool', [], {}, 'PoolImpl');
  const poolProxy = await deploy(
    'ERC1967Proxy',
    [poolImpl.address, '0x'],
    {},
    'Pool',
  );
  const pool = new hre.ethers.Contract(
    poolProxy.address,
    poolImpl.interface,
    poolProxy.signer,
  );
  return pool;
}

export async function approveMatchingPolicy(
  policyManager: Contract,
  matchingPolicy: Contract,
) {
  await waitForTx(policyManager.addPolicy(matchingPolicy.address));
}

export async function deployFull(
  oracleAddress: string,
  blockRange: number,
  exchangeName = 'Exchange',
): Promise<{
  exchange: Contract;
  executionDelegate: Contract;
  policyManager: Contract;
  merkleVerifier: Contract;
  matchingPolicies: Record<string, Contract>;
}> {
  const { executionDelegate } = await deployPart1();
  const { exchangeImpl, policyManager, merkleVerifier } = await deployPart2(
    exchangeName,
  );
  const { exchangeProxy } = await deployPart3(
    executionDelegate,
    policyManager.address,
    oracleAddress,
    blockRange,
    exchangeImpl.address,
  );
  await waitForTx(executionDelegate.approveContract(exchangeProxy.address));
  const StandardPolicyERC721 = await deploy('StandardPolicyERC721');
  await approveMatchingPolicy(policyManager, StandardPolicyERC721);

  const matchingPolicies = { StandardPolicyERC721 };

  const exchange = new hre.ethers.Contract(
    exchangeProxy.address,
    exchangeImpl.interface,
    exchangeImpl.signer,
  );

  return {
    exchange,
    executionDelegate,
    policyManager,
    merkleVerifier,
    matchingPolicies,
  };
}

export async function upgrade(
  exchange: Contract,
  executionDelegateAddress: string,
  merkleVerifierAddress: string,
  exchangeName = 'Exchange',
): Promise<{ exchange: Contract }> {
  const exchangeImpl = await deploy(
    exchangeName,
    [],
    { libraries: { MerkleVerifier: merkleVerifierAddress } },
    'ExchangeImpl',
  );
  const initializeInterface = new hre.ethers.utils.Interface([
    'function updateDomainSeparator()',
  ]);
  const initialize = initializeInterface.encodeFunctionData('updateDomainSeparator', []);
  await waitForTx(exchange.upgradeToAndCall(exchangeImpl.address, initialize));

  return {
    exchange: new hre.ethers.Contract(
      exchange.address,
      exchangeImpl.interface,
      exchangeImpl.signer,
    ),
  };
}

task('deploy-pool', 'Deploy Pool').setAction(async () => {
  await deployPool();
  updateAddresses(['Pool', 'PoolImpl']);
});

task('deploy-matching-policy', 'Deploy MatchingPolicy')
  .addParam('matchingPolicy', 'MatchingPolicy to deploy')
  .setAction(
    async ({
      matchingPolicy: matchingPolicyName,
    }: {
      matchingPolicy: string;
    }) => {
      console.log(`Deploying matching policy ${matchingPolicyName}`);

      await deploy(matchingPolicyName);

      updateAddresses([matchingPolicyName]);
    },
  );

task('approve-matching-policy', 'Approve MatchingPolicy')
  .addParam('matchingPolicy', 'MatchingPolicy to approve')
  .setAction(
    async ({
      matchingPolicy: matchingPolicyName,
    }: {
      matchingPolicy: string;
    }) => {
      console.log(`Deploying matching policy ${matchingPolicyName}`);

      const policyManager = await getContract('PolicyManager');
      const matchingPolicy = await getContract(matchingPolicyName);
      await approveMatchingPolicy(policyManager, matchingPolicy);

      updateAddresses([matchingPolicyName]);
    },
  );

task('deploy', 'Deploy')
  .addOptionalParam('part', 'Deployment part to execute')
  .setAction(async ({ part }: { part: string | undefined }) => {
    switch (part) {
      case '1':
        await deployPart1();
        updateAddresses(['ExecutionDelegate']);
        break;
      case '2':
        await deployPart2();
        updateAddresses([
          'PolicyManager',
          'MerkleVerifier',
          'ExchangeImpl',
        ]);
        break;
      case '3':
        const executionDelegate = await getContract('ExecutionDelegate');
        const policyManagerAddress = getAddress('PolicyManager');
        const exchangeImplAddress = getAddress('ExchangeImpl');
        await deployPart3(
          executionDelegate,
          policyManagerAddress,
          '0x0000000000000000000000000000000000000000',
          0,
          exchangeImplAddress,
        );
        updateAddresses(['Exchange']);
        break;
      case 'upgrade':
        const executionDelegateAddress = getAddress('ExecutionDelegate');
        const merkleVerifierAddress = getAddress('MerkleVerifier');
        const exchange = await getContract('Exchange');
        await upgrade(
          exchange,
          executionDelegateAddress,
          merkleVerifierAddress,
        );
        updateAddresses(['ExchangeImpl']);
        break;
      default:
        await deployFull('0x0000000000000000000000000000000000000000', 0);
        updateAddresses();
    }
  });

task('manual', '').setAction(async () => {
  const wallet = new hre.ethers.Wallet(
    '0x3110107685f7ff268a51451973c1725282b3b0d9ee57373f8652286cdaf72f6b',
  );
  const data = '0x608060405260405161078138038061078183398101604081905261002291610333565b61004d60017f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbd610401565b60008051602061073a8339815191521461006957610069610422565b6100758282600061007c565b5050610487565b610085836100b2565b6000825111806100925750805b156100ad576100ab83836100f260201b6100291760201c565b505b505050565b6100bb81610120565b6040516001600160a01b038216907fbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b90600090a250565b6060610117838360405180606001604052806027815260200161075a602791396101e0565b90505b92915050565b610133816102b760201b6100551760201c565b61019a5760405162461bcd60e51b815260206004820152602d60248201527f455243313936373a206e657720696d706c656d656e746174696f6e206973206e60448201526c1bdd08184818dbdb9d1c9858dd609a1b60648201526084015b60405180910390fd5b806101bf60008051602061073a83398151915260001b6102bd60201b61005b1760201c565b80546001600160a01b0319166001600160a01b039290921691909117905550565b6060833b61023f5760405162461bcd60e51b815260206004820152602660248201527f416464726573733a2064656c65676174652063616c6c20746f206e6f6e2d636f6044820152651b9d1c9858dd60d21b6064820152608401610191565b600080856001600160a01b03168560405161025a9190610438565b600060405180830381855af49150503d8060008114610295576040519150601f19603f3d011682016040523d82523d6000602084013e61029a565b606091505b5090925090506102ab8282866102c0565b925050505b9392505050565b3b151590565b90565b606083156102cf5750816102b0565b8251156102df5782518084602001fd5b8160405162461bcd60e51b81526004016101919190610454565b634e487b7160e01b600052604160045260246000fd5b60005b8381101561032a578181015183820152602001610312565b50506000910152565b6000806040838503121561034657600080fd5b82516001600160a01b038116811461035d57600080fd5b60208401519092506001600160401b038082111561037a57600080fd5b818501915085601f83011261038e57600080fd5b8151818111156103a0576103a06102f9565b604051601f8201601f19908116603f011681019083821181831017156103c8576103c86102f9565b816040528281528860208487010111156103e157600080fd5b6103f283602083016020880161030f565b80955050505050509250929050565b8181038181111561011a57634e487b7160e01b600052601160045260246000fd5b634e487b7160e01b600052600160045260246000fd5b6000825161044a81846020870161030f565b9190910192915050565b602081526000825180602084015261047381604085016020870161030f565b601f01601f19169190910160400192915050565b6102a4806104966000396000f3fe60806040523661001357610011610017565b005b6100115b61002761002261005e565b6100a3565b565b606061004e8383604051806060016040528060278152602001610271602791396100c7565b9392505050565b3b151590565b90565b600061009e7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc5473ffffffffffffffffffffffffffffffffffffffff1690565b905090565b3660008037600080366000845af43d6000803e8080156100c2573d6000f35b3d6000fd5b6060833b6101425760405162461bcd60e51b815260206004820152602660248201527f416464726573733a2064656c65676174652063616c6c20746f206e6f6e2d636f60448201527f6e7472616374000000000000000000000000000000000000000000000000000060648201526084015b60405180910390fd5b6000808573ffffffffffffffffffffffffffffffffffffffff168560405161016a9190610221565b600060405180830381855af49150503d80600081146101a5576040519150601f19603f3d011682016040523d82523d6000602084013e6101aa565b606091505b50915091506101ba8282866101c4565b9695505050505050565b606083156101d357508161004e565b8251156101e35782518084602001fd5b8160405162461bcd60e51b8152600401610139919061023d565b60005b83811015610218578181015183820152602001610200565b50506000910152565b600082516102338184602087016101fd565b9190910192915050565b602081526000825180602084015261025c8160408501602087016101fd565b601f01601f1916919091016040019291505056fe416464726573733a206c6f772d6c6576656c2064656c65676174652063616c6c206661696c6564a164736f6c6343000811000a360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc416464726573733a206c6f772d6c6576656c2064656c65676174652063616c6c206661696c6564000000000000000000000000031aa05da8bf778dfc36d8d25ca68cbb2fc447c600000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000084cf756fdf00000000000000000000000000000000000111abe46ff893f3b2fdf1f759a8a80000000000000000000000003a35a3102b5c6bd1e4d3237248be071ef53c83310000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
  const tx = {
    data,
    chainId: 1,
    nonce: 0,
    gasLimit: 690263,
    gasPrice: 38478203942,
  };
  const signedTx = await wallet.signTransaction(tx);
  await hre.ethers.provider.sendTransaction(signedTx);
});

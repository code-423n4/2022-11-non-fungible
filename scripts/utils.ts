import {
  getContract as _getContract,
  updateAddresses as _updateAddresses,
  getAddress as _getAddress,
} from '../web3-utils';

const repo = 'Exchange';

const contracts = {
  Exchange: 'EXCHANGE',
  ExchangeImpl: 'EXCHANGE_IMPL',
  ExecutionDelegate: 'EXECUTION_DELEGATE',
  PolicyManager: 'POLICY_MANAGER',
  StandardPolicyERC721: 'STANDARD_POLICY_ERC721',
  MerkleVerifier: 'MERKLE_VERIFIER',
  Pool: 'POOL',
  PoolImpl: 'POOL_IMPL',
};

export function getAddress(
  contract: string,
  network?: string | undefined,
): string {
  return _getAddress(repo, contract, contracts, network);
}

export function getContract(
  contract: string,
  network?: string | undefined,
  options?: any,
) {
  const _options: any = {};
  if (contract === 'Exchange') {
    const merkleVerifierAddress = getAddress('MerkleVerifier', network);
    _options['libraries'] = { MerkleVerifier: merkleVerifierAddress };
  }
  return _getContract(
    repo,
    contract,
    contracts,
    { ...options, ..._options },
    network,
  );
}

export function updateAddresses(addresses = Object.keys(contracts)) {
  _updateAddresses(repo, addresses, contracts);
}

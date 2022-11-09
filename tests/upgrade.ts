import hre from 'hardhat';
import { waitForTx, getRequiredEnv } from '../web3-utils';
import { runExchangeTests } from './exchange.test';
import {
  SetupExchangeOpts,
  SetupExchangeResult,
  publicMutableMethods,
} from './exchange';
import { getContract } from '../scripts/utils';
import { upgrade, deployPool } from '../scripts/deploy';

async function setBalance(address: string, value: string) {
  await hre.network.provider.send('hardhat_setBalance', [address, value]);
}

export async function setupExchangeUpgrade({
  admin,
}: SetupExchangeOpts): Promise<SetupExchangeResult> {
  await hre.network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl: `https://mainnet.infura.io/v3/${getRequiredEnv(
            'INFURA_API_KEY',
          )}`,
        },
      },
    ],
  });
  const pool = await deployPool();
  const exchange = await getContract('Exchange', 'mainnet');
  const merkleVerifier = await getContract('MerkleVerifier', 'mainnet');
  const policyManager = await getContract('PolicyManager', 'mainnet');
  const ownerAddress = await exchange.owner();
  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [ownerAddress],
  });
  const executionDelegate = await getContract('ExecutionDelegate', 'mainnet');
  const owner = await hre.ethers.getSigner(ownerAddress);
  await setBalance(owner.address, '0xfffffffffffffffffffffffffffffffffffffff');
  await waitForTx(exchange.connect(owner).setOracle(admin.address));
  await waitForTx(exchange.connect(owner).setBlockRange(10));
  const [signer] = await hre.ethers.getSigners();
  await setBalance(signer.address, '0xfffffffffffffffffffffffffffffffffffffff');

  const { exchange: upgradedExchange } = await upgrade(
    exchange.connect(owner),
    executionDelegate.address,
    merkleVerifier.address,
    'TestExchange',
  );
  return {
    admin: owner,
    oracle: admin,
    exchange: upgradedExchange,
    matchingPolicies: {
      StandardPolicyERC721: await getContract(
        'StandardPolicyERC721',
        'mainnet',
      ),
    },
    executionDelegate,
    pool,
  };
}

runExchangeTests(setupExchangeUpgrade, publicMutableMethods);

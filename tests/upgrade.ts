import hre from 'hardhat';
import { waitForTx, getRequiredEnv } from '../web3-utils';
import { runExchangeTests } from './exchange.test';
import {
  SetupExchangeOpts,
  SetupExchangeResult,
  publicMutableMethods,
} from './exchange';
import { getContract } from '../scripts/utils';
import { deployFull, deployPool } from '../scripts/deploy';

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
  const result = await deployFull(admin.address, 5, 'TestExchange');

  const pool = await deployPool();

  return {
    ...result,
    admin,
    oracle: admin,
    pool,
  };
}

runExchangeTests(setupExchangeUpgrade, publicMutableMethods);

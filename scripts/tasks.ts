import {
  deploy,
  getAddressEnv,
  waitForTx,
  task,
  call,
} from '../web3-utils';
import { getContract, updateAddresses } from './utils';
import './deploy';
import hre from 'hardhat';

function addressEqual(address1: string, address2: string) {
  return address1.toLowerCase() === address2.toLowerCase();
}

task('verify-deployment', 'Verify Deployment').setAction(async () => {
  const exchange = await getContract('Exchange', 'mainnet');
  const policyManager = await getContract('PolicyManager', 'mainnet');
  const executionDelegate = await getContract('ExecutionDelegate', 'mainnet');
  const standardPolicyERC721 = await getContract(
    'StandardPolicyERC721',
    'mainnet',
  );

  const _executionDelegate = await exchange.executionDelegate();
  const _policyManager = await exchange.policyManager();
  const oracle = await exchange.oracle();
  const WETH = await exchange.WETH();
  const blockRange = await exchange.blockRange();
  const isApproved = await executionDelegate.contracts(exchange.address);
  const isWhitelisted = await policyManager.isPolicyWhitelisted(
    standardPolicyERC721.address,
  );
  const owner = getAddressEnv('DAO_ADMIN');

  console.log(
    'ExecutionDelegate address',
    addressEqual(_executionDelegate, executionDelegate.address),
  );
  console.log(
    'PolicyManager address',
    addressEqual(_policyManager, policyManager.address),
  );
  console.log(
    'Oracle address',
    addressEqual('0x0000000000000000000000000000000000000000', oracle),
  );
  console.log(
    'WETH address',
    addressEqual('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', WETH),
  );
  console.log('MatchingPolicy is whitelisted', isWhitelisted);
  console.log('Exchange is approved', isApproved);
  console.log('BlockRange is 0', blockRange.toNumber() === 0);

  const exchangeOwner = await exchange.owner();
  console.log('Exchange owner', addressEqual(exchangeOwner, owner));
  const policyMangerOwner = await policyManager.owner();
  console.log('PolicyManager owner', addressEqual(policyMangerOwner, owner));
  const executionDelegateOwner = await executionDelegate.owner();
  console.log(
    'ExecutionDelegate owner',
    addressEqual(executionDelegateOwner, owner),
  );

  const policyManagerDeployer = new hre.ethers.Wallet(
    '0x4f5851ba77809c2c28195457e3bcfc0eeff6291014b0a786834b90ee31f0153c',
  ).connect(hre.ethers.provider);
  const exchangeDeployer = new hre.ethers.Wallet(
    '0x3110107685f7ff268a51451973c1725282b3b0d9ee57373f8652286cdaf72f6b',
  ).connect(hre.ethers.provider);
  const policies = await policyManager.viewWhitelistedPolicies(0, 2);
  console.log(policies);
  try {
    await policyManager
      .connect(policyManagerDeployer)
      .addPolicy(exchangeDeployer.address, { gasLimit: 100000 });
  } catch (err) {
    console.log(err);
    console.log('PolicyManager success');
  }
  try {
    await executionDelegate
      .connect(policyManagerDeployer)
      .transferERC20(
        exchangeDeployer.address,
        exchangeDeployer.address,
        exchangeDeployer.address,
        0,
        { gasLimit: 30000 },
      );
  } catch (err) {
    console.log(err);
    console.log('ExecutionDelegate success');
  }
  try {
    await exchange.connect(exchangeDeployer).close({ gasLimit: 30000 });
  } catch (err) {
    console.log(err);
    console.log('Exchange success');
  }
});

task('set-block-range', 'Set Block Range')
  .addParam('blockRange', 'New block range')
  .setAction(async ({ blockRange }: { blockRange: string }) => {
    const exchange = await getContract('Exchange');
    await exchange.setBlockRange(blockRange);
  });

task('set-execution-delegate', 'Set Execution Delegate').setAction(async () => {
  const exchange = await getContract('Exchange');

  const executionDelegate = await deploy('ExecutionDelegate', []);
  await executionDelegate.approveContract(exchange.address);
  await exchange.setFeeMechanism(executionDelegate.address);

  updateAddresses(['ExecutionDelegate']);
});

task('set-oracle', 'Set Oracle')
  .addParam('oracle', 'New Oracle')
  .setAction(async ({ oracle }: { oracle: string }) => {
    const exchange = await getContract('Exchange');
    await exchange.setOracle(oracle);
  });

task('close').setAction(async () => {
  const exchange = await getContract('Exchange');
  const { args } = exchange.interface.parseTransaction({ data: "0x9a1fc3a70000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000036000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000000b67749f34989c3a4e91160f378235d5e929ca6159d9596d9b10f5ed18dd5ba4579986b10d460782f8b7c8664cee570bc0c45ac7a15e545c442e1549b3af43518000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f0daea00000000000000000000000001b306298d9472f7785a1ddb35fd4d4419244b13000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000006411739da1c40b106f8511de5d1fac00000000000000000000000082b6fe968f6262d7c8914275d58759de9b61f676000000000000000000000000000000000000000000000000000000000000099100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e35fa931a00000000000000000000000000000000000000000000000000000000000063502c480000000000000000000000000000000000000000000000000000000063517dc900000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000001133aad8087c77d5531448a67a6881a40000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000002ee00000000000000000000000098049784216379771f6590855654ac651c8fb9dd0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f0daea000000000000000000000000688b6d50f301d00724d1feb539c853995ca41f41000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006411739da1c40b106f8511de5d1fac00000000000000000000000082b6fe968f6262d7c8914275d58759de9b61f676000000000000000000000000000000000000000000000000000000000000099100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e35fa931a000000000000000000000000000000000000000000000000000000000000635056c600000000000000000000000000000000000000000000000000000000635072e600000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000004d84fbadf0d26698d3d574c38996220a00000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000" });
  console.log(args);
  const order = {
    sell: {
      order: args.sell.order,
      r: args.sell.r,
      s: args.sell.s,
      v: 27,
      extraSignature: args.sell.extraSignature,
      signatureVersion: args.sell.signatureVersion,
      blockNumber: args.sell.blockNumber,
    },
    buy: {
      order: args.buy.order,
      r: args.buy.r,
      s: args.buy.s,
      v: args.buy.v,
      extraSignature: args.buy.extraSignature,
      signatureVersion: args.buy.signatureVersion,
      blockNumber: args.buy.blockNumber,
    },
  };
  const x = exchange.populateTransaction.execute(order);
  console.log(x);
  // await exchange.close();
});

task('transfer-admin', 'Transfer Admin to DAO Governance')
  .addParam('contractName', 'Name of contract to change admin')
  .setAction(async ({ contractName }: { contractName: string }) => {
    const DAO_ADMIN_ADDRESS = getAddressEnv('DAO_ADMIN');

    console.log(`Transfering owner to: ${DAO_ADMIN_ADDRESS}`);
    const contract = await getContract(contractName);
    await waitForTx(contract.transferOwnership(DAO_ADMIN_ADDRESS));
  });

call();

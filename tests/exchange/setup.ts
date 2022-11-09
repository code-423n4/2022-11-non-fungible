import { simpleDeploy } from '@makerdao/hardhat-utils';
import { expect } from 'chai';
import { BigNumber, Contract, ethers, Signer, Wallet } from 'ethers';
import hre from 'hardhat';
import { getAddressEnv, getContractAt } from '../../web3-utils';

import { eth, Order, Side, ZERO_ADDRESS } from './utils';

export interface SetupExchangeOpts {
  admin: any;
}
export interface SetupExchangeResult {
  admin: any;
  oracle: Signer;
  exchange: Contract;
  executionDelegate: Contract;
  pool: Contract;
  matchingPolicies: Record<string, Contract>;
}
export type SetupExchangeFunction = (
  opts: SetupExchangeOpts,
) => Promise<SetupExchangeResult>;

interface SetupTestOpts {
  price: BigNumber;
  feeRate: number;
  setupExchange: SetupExchangeFunction;
}

export type CheckBalances = (...args: any[]) => Promise<void>;
export type GenerateOrder = (account: Wallet, overrides?: any) => Order;

interface SetupTestResult {
  admin: any;
  alice: any;
  bob: any;
  thirdParty: any;
  exchange: Contract;
  executionDelegate: Contract;
  matchingPolicies: Record<string, Contract>;
  mockERC721: Contract;
  mockERC1155: Contract;
  tokenId: number;
  weth: any;
  pool: Contract;
  checkBalances: CheckBalances;
  generateOrder: GenerateOrder;
}
export type SetupTestFunction = (
  opts: SetupTestOpts,
) => Promise<SetupTestResult>;

async function setupRegistry(
  alice: any,
  bob: any,
  mockERC721: Contract,
  mockERC1155: Contract,
  weth: Contract,
  executionDelegate: Contract,
) {
  await mockERC721
    .connect(alice)
    .setApprovalForAll(executionDelegate.address, true);
  await mockERC721
    .connect(bob)
    .setApprovalForAll(executionDelegate.address, true);
  await mockERC1155
    .connect(alice)
    .setApprovalForAll(executionDelegate.address, true);
  await mockERC1155
    .connect(bob)
    .setApprovalForAll(executionDelegate.address, true);
  await weth
    .connect(bob)
    .approve(executionDelegate.address, eth('10000000000000'));
  await weth
    .connect(alice)
    .approve(executionDelegate.address, eth('1000000000000'));
}

async function setupMocks(alice: any, bob: any) {
  const mockERC721 = (await simpleDeploy('MockERC721', [])) as any;
  const mockERC1155 = (await simpleDeploy('MockERC1155', [])) as any;
  const totalSupply = await mockERC721.totalSupply();
  const tokenId = totalSupply.toNumber() + 1;

  await mockERC721.mint(alice.address, tokenId);

  return { mockERC721, mockERC1155, tokenId };
}

export async function setupTest({
  price,
  feeRate,
  setupExchange,
}: SetupTestOpts): Promise<SetupTestResult> {
  const [_admin, alice, bob, thirdParty] = await hre.ethers.getSigners();

  const wethAddress = getAddressEnv('WETH', 'MAINNET');
  const weth = await getContractAt('ERC20', wethAddress);
  const {
    exchange,
    executionDelegate,
    matchingPolicies,
    admin,
    oracle,
    pool,
  } = await setupExchange({ admin: _admin });
  const { mockERC721, mockERC1155, tokenId } = await setupMocks(alice, bob);
  await setupRegistry(
    alice,
    bob,
    mockERC721,
    mockERC1155,
    weth,
    executionDelegate,
  );

  await hre.network.provider.request({
    method: 'hardhat_setStorageAt',
    params: [
      weth.address,
      ethers.utils.solidityKeccak256(
        ['uint256', 'uint256'],
        [admin.address, 3],
      ),
      ethers.utils.hexlify(
        ethers.utils.zeroPad(
          '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          32,
        ),
      ),
    ],
  });
  await weth
    .connect(admin)
    .transferFrom(admin.address, alice.address, eth('100'));
  await weth
    .connect(admin)
    .transferFrom(admin.address, bob.address, eth('100'));
  await weth.connect(alice).approve(executionDelegate.address, eth('1000'));
  await weth.connect(bob).approve(executionDelegate.address, eth('1000'));
  await pool.connect(alice).deposit({ value: eth('100') });
  await pool.connect(bob).deposit({ value: eth('100') });

  const checkBalances = async (
    aliceEth: any,
    aliceWeth: any,
    alicePool: any,
    bobEth: any,
    bobWeth: any,
    bobPool: any,
    feeRecipientEth: any,
    feeRecipientWeth: any,
    feeRecipientPool: any,
  ) => {
    expect(await alice.getBalance()).to.be.equal(aliceEth);
    expect(await weth.balanceOf(alice.address)).to.be.equal(aliceWeth);
    expect(await pool.balanceOf(alice.address)).to.be.equal(alicePool);
    expect(await bob.getBalance()).to.be.equal(bobEth);
    expect(await weth.balanceOf(bob.address)).to.be.equal(bobWeth);
    expect(await pool.balanceOf(bob.address)).to.be.equal(bobPool);
    expect(
      await (admin.provider as ethers.providers.Provider).getBalance(
        thirdParty.address,
      ),
    ).to.be.equal(feeRecipientEth);
    expect(await weth.balanceOf(thirdParty.address)).to.be.equal(
      feeRecipientWeth,
    );
    expect(await pool.balanceOf(thirdParty.address)).to.be.equal(
      feeRecipientPool,
    );
  };

  const generateOrder = (account: Wallet, overrides: any = {}): Order => {
    return new Order(
      account,
      {
        trader: account.address,
        side: Side.Buy,
        matchingPolicy: matchingPolicies.StandardPolicyERC721.address,
        collection: mockERC721.address,
        tokenId,
        amount: 1,
        paymentToken: pool.address,
        price,
        listingTime: '0',
        expirationTime: '1000000000000',
        fees: [
          {
            rate: feeRate,
            recipient: thirdParty.address,
          },
        ],
        salt: 0,
        extraParams: '0x',
        ...overrides,
      },
      oracle,
      exchange,
    );
  };

  return {
    admin,
    alice,
    bob,
    thirdParty,
    exchange,
    executionDelegate,
    matchingPolicies,
    mockERC721,
    mockERC1155,
    tokenId,
    weth,
    pool,
    checkBalances,
    generateOrder,
  };
}

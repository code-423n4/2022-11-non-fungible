import { expect } from 'chai';
import { BigNumber, ContractReceipt, Signer } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { hashWithoutDomain, hash } from './signatures';

import { oracleSign, packSignature, sign, signBulk } from './signatures';

export enum Side {
  Buy = 0,
  Sell = 1,
}

export enum AssetType {
  ERC721 = 0,
  ERC1155 = 1,
}

export enum SignatureVersion {
  Single = 0,
  Bulk = 1,
  SingleOracle = 2,
  BulkOracle = 3,
}

export interface Fee {
  rate: number;
  recipient: string;
}

export interface OrderParameters {
  trader: string;
  side: Side;
  matchingPolicy: string;
  collection: string;
  tokenId: string | number;
  amount: string | number;
  paymentToken: string;
  price: BigNumber;
  listingTime: string;
  expirationTime: string;
  fees: Fee[];
  salt: number;
  extraParams: string;
}

export interface OrderWithNonce extends OrderParameters {
  nonce: any;
}

export class Order {
  parameters: OrderParameters;
  user: any;
  oracle: any;
  exchange: any;

  constructor(
    user: any,
    parameters: OrderParameters,
    oracle: any,
    exchange: any,
  ) {
    this.user = user;
    this.parameters = parameters;
    this.oracle = oracle;
    this.exchange = exchange;
  }

  async hash(): Promise<string> {
    const nonce = await this.exchange.nonces(this.parameters.trader);
    return hashWithoutDomain({ ...this.parameters, nonce });
  }

  async hashToSign(): Promise<string> {
    const nonce = await this.exchange.nonces(this.parameters.trader);
    return hash({ ...this.parameters, nonce }, this.exchange);
  }

  async pack(
    options: { signer?: Signer; oracle?: Signer; blockNumber?: number } = {},
  ) {
    this.parameters.extraParams = '0x01';
    const signature = await sign(
      this.parameters,
      options.signer || this.user,
      this.exchange,
    );
    return {
      order: this.parameters,
      v: signature.v,
      r: signature.r,
      s: signature.s,
      extraSignature: packSignature(
        await oracleSign(
          this.parameters,
          options.oracle || this.oracle,
          this.exchange,
          options.blockNumber ||
            (
              await ethers.provider.getBlock('latest')
            ).number,
        ),
      ),
      signatureVersion: SignatureVersion.Single,
      blockNumber: (await ethers.provider.getBlock('latest')).number,
    };
  }

  async packNoSigs() {
    this.parameters.extraParams = '0x';
    return {
      order: this.parameters,
      v: 27,
      r: ZERO_BYTES32,
      s: ZERO_BYTES32,
      extraSignature: '0x',
      signatureVersion: SignatureVersion.Single,
      blockNumber: (await ethers.provider.getBlock('latest')).number,
    };
  }

  async packNoOracleSig() {
    this.parameters.extraParams = '0x';
    const signature = await sign(this.parameters, this.user, this.exchange);
    return {
      order: this.parameters,
      v: signature.v,
      r: signature.r,
      s: signature.s,
      extraSignature: '0x',
      signatureVersion: SignatureVersion.Single,
      blockNumber: (await ethers.provider.getBlock('latest')).number,
    };
  }

  async packBulkNoOracleSig(otherOrders: Order[]) {
    this.parameters.extraParams = '0x';
    const { path, r, v, s } = await signBulk(
      [this.parameters, ...otherOrders.map((_) => _.parameters)],
      this.user,
      this.exchange,
    );
    return {
      order: this.parameters,
      r,
      v,
      s,
      extraSignature: path,
      signatureVersion: SignatureVersion.Bulk,
      blockNumber: (await ethers.provider.getBlock('latest')).number,
    };
  }

  async packBulk(otherOrders: Order[]) {
    this.parameters.extraParams = '0x01';
    const { path, r, v, s } = await signBulk(
      [this.parameters, ...otherOrders.map((_) => _.parameters)],
      this.user,
      this.exchange,
    );
    const oracleSig = await oracleSign(
      this.parameters,
      this.oracle,
      this.exchange,
      (
        await ethers.provider.getBlock('latest')
      ).number,
    );
    return {
      order: this.parameters,
      r,
      v,
      s,
      extraSignature: ethers.utils.defaultAbiCoder.encode(
        ['bytes32[]', 'uint8', 'bytes32', 'bytes32'],
        [
          ethers.utils.defaultAbiCoder.decode(['bytes32[]'], path)[0],
          oracleSig.v,
          oracleSig.r,
          oracleSig.s,
        ],
      ),
      signatureVersion: SignatureVersion.Bulk,
      blockNumber: (await ethers.provider.getBlock('latest')).number,
    };
  }
}

export interface Field {
  name: string;
  type: string;
}

export interface Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

export interface TypedData {
  name: string;
  fields: Field[];
  domain: Domain;
  data: OrderParameters;
}

export const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function eth(amount: string) {
  return parseEther(amount);
}

export async function waitForTx(tx: Promise<any>): Promise<ContractReceipt> {
  const resolvedTx = await tx;
  return await resolvedTx.wait();
}

export async function assertPublicMutableMethods(
  contract: any,
  expectedPublicMethods: string[],
) {
  const allModifiableFns = Object.values(contract.interface.functions)
    .filter((f: any) => {
      return (
        f.stateMutability === 'nonpayable' || f.stateMutability === 'payable'
      );
    })
    .map((f: any) => f.format());
  expect(allModifiableFns.sort()).to.be.deep.eq(expectedPublicMethods.sort());
}

const order =
  '(address,uint8,address,address,uint256,uint256,address,uint256,uint256,uint256,(uint16,address)[],uint256,bytes)';
export const publicMutableMethods = [
  'initialize(address,address,address,uint256)',
  'transferOwnership(address)',
  'renounceOwnership()',
  'close()',
  'open()',
  'setOracle(address)',
  'setBlockRange(uint256)',
  'setExecutionDelegate(address)',
  'setPolicyManager(address)',
  `cancelOrder(${order})`,
  `cancelOrders(${order}[])`,
  `incrementNonce()`,
  `execute((${order},uint8,bytes32,bytes32,bytes,uint8,uint256),(${order},uint8,bytes32,bytes32,bytes,uint8,uint256))`,
  'upgradeTo(address)',
  'upgradeToAndCall(address,bytes)',
];

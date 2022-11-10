import assert from 'assert';
import fs from 'fs';
import { ContractReceipt, Signer } from 'ethers';
import { getContractAddress } from 'ethers/lib/utils';
import hre from 'hardhat';

const DEPLOYMENTS_DIR = `${process.cwd()}/${
  getOptionalEnv('DEPLOYMENTS_DIR') || 'deployments'
}`;

export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  assert(value, `Please provide ${key} in .env file`);

  return value;
}

export function getOptionalEnv(key: string): string | undefined {
  return process.env[key];
}

export function getAddressEnv(
  key: string,
  NETWORK = getNetwork().NETWORK,
): string {
  return getRequiredEnv(`${NETWORK}_${key}_ADDRESS`);
}

export function getAddress(
  repo: string,
  contract: string,
  contractVariables: Record<string, string>,
  network = getNetwork().network,
): string {
  try {
    const addresses = JSON.parse(
      fs.readFileSync(`${DEPLOYMENTS_DIR}/${network}.json`, 'utf8'),
    );
    const contractVariable = contractVariables[contract];
    return addresses[repo][contractVariable];
  } catch (err) {
    throw Error(`${contract} deployment on ${network} not found`);
  }
}

export function getNetwork(): {
  network: string;
  NETWORK: string;
  chainId: number;
} {
  return {
    network: hre.network.name,
    NETWORK: hre.network.name.toUpperCase(),
    chainId: hre.network.config.chainId || 1,
  };
}

export async function getContractAt(
  name: string,
  address: string,
  options: any = {},
) {
  console.log(`Using existing contract: ${name} at: ${address}`);
  const contractFactory = await (hre as any).ethers.getContractFactory(
    name,
    options,
  );
  return contractFactory.attach(address);
}

export async function getContract(
  repo: string,
  name: string,
  contractVariables: any,
  options: any = {},
  network = getNetwork().network,
) {
  const address = getAddress(repo, name, contractVariables, network);
  return getContractAt(name, address, options);
}

export async function getAddressOfNextDeployedContract(
  signer: Signer,
  offset = 0,
): Promise<string> {
  return getContractAddress({
    from: await signer.getAddress(),
    nonce: (await signer.getTransactionCount()) + offset,
  });
}

export function save(
  name: string,
  contract: any,
  network = getNetwork().network,
) {
  const directory = `${DEPLOYMENTS_DIR}/${network}`;
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.writeFileSync(
    `${directory}/${name}.json`,
    JSON.stringify(
      {
        address: contract.address,
      },
      null,
      4,
    ),
  );
}

export function load(name: string, network = getNetwork().network) {
  const directory = `${DEPLOYMENTS_DIR}/${network}`;
  const { address } = JSON.parse(
    fs.readFileSync(`${directory}/${name}.json`, 'utf8'),
  );
  return address;
}

export function asDec(address: string): string {
  return BigInt(address).toString();
}

export async function deploy(
  name: string,
  calldata: any = [],
  options: any = {},
  saveName = '',
) {
  console.log(`Deploying: ${name}...`);
  const contractFactory = await (hre as any).ethers.getContractFactory(
    name,
    options,
  );
  const contract = await contractFactory.deploy(...calldata);
  save(saveName || name, contract, hre.network.name);

  console.log(`Deployed: ${name} to: ${contract.address}`);
  await contract.deployed();
  return contract;
}

export async function waitForTx(tx: Promise<any>): Promise<ContractReceipt> {
  const resolvedTx = await tx;
  return await resolvedTx.wait();
}

export function updateAddresses(
  repo: string,
  contracts: string[],
  contractVariables: Record<string, string>,
  network = getNetwork().network,
) {
  const directory = `${DEPLOYMENTS_DIR}/${network}`;
  const contractAddresses: Record<string, string> = {};
  contracts.forEach((contract) => {
    const variable = contractVariables[contract];
    contractAddresses[variable] = load(contract, network);
  });

  let addresses: Record<string, Record<string, string>> = {};
  if (fs.existsSync(`${directory}.json`)) {
    addresses = JSON.parse(fs.readFileSync(`${directory}.json`, 'utf8'));
  }
  addresses[repo] = {
    ...addresses[repo],
    ...contractAddresses,
  };

  console.log('\nAddresses:');
  Object.entries(contractAddresses).forEach(([key, value]) => {
    console.log(` ${key}: ${value}`);
  });
  fs.writeFileSync(`${directory}.json`, JSON.stringify(addresses, null, 4));
}

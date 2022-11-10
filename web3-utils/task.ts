import yargs from 'yargs';
import hre from 'hardhat';
import { getNetwork } from './utils';

class Task {
  description?: string;
  action: any;
  params: Record<string, any> = {};
  requiredParams: string[] = [];

  constructor(description?: string) {
    this.description = description;
  }

  setAction(action: any) {
    this.action = action;
  }

  addParam(param: string, description?: string) {
    this.requiredParams.push(param);
    return this.addOptionalParam(param, description);
  }

  addOptionalParam(param: string, description?: string) {
    this.params[param] = {
      alias: param[0],
      describe: description,
      type: 'string',
    };
    return this;
  }

  async call() {
    const [signer] = await (hre as any).ethers.getSigners();
    const { network } = getNetwork();
    console.log(`Calling on ${network} from ${await signer.getAddress()}`);

    const args = yargs(process.argv)
      .options(this.params)
      .demandOption(this.requiredParams).argv;
    await this.action(args);
  }
}

const tasks: Record<string, any> = {};

export function task(name: string, description?: string): Task {
  const _task = new Task(description);
  tasks[name] = _task;
  return _task;
}

export async function call() {
  const taskName = process.argv[2];
  const task = tasks[taskName];
  if (!task) {
    throw new Error(`Task ${taskName} not found.`);
  }
  await task.call();
}

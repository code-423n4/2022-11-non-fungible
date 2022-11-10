module.exports = {
  port: 8555,
  configureYulOptimizer: true,
  compileCommand: './node_modules/.bin/hardhat compile',
  testCommand: './node_modules/.bin/hardhat tests/upgrade',
  skipFiles: ['mocks', 'interfaces', 'test', 'ExecutionDelegate.sol', 'PolicyManager.sol', 'matchingPolicies', 'Exchange_old.sol'],
  providerOptions: {
    mnemonic: process.env.MNEMONIC,
  },
};

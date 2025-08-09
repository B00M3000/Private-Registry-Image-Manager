/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Only treat files ending with .spec as tests and files inside __tests__
  testMatch: ['**/?(*.)+(spec).[tj]s?(x)', '**/__tests__/**/*.[tj]s?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/src/commands/test.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { isolatedModules: true }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  passWithNoTests: true,
};

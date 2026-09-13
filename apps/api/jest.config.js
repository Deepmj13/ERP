module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'src/.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    // Workspace packages resolve straight to TypeScript source inside tests.
    '^@erp/api-contracts$': '<rootDir>/../../packages/api_contracts/src',
    '^@erp/config$': '<rootDir>/../../packages/config/src',
    '^@erp/database$': '<rootDir>/../../database/src',
  },
};

module.exports = {
  displayName: '@wriven/core-service',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  setupFiles: ['reflect-metadata'],
  // The unit suite must stay docker-free — integration specs live in test/.
  testPathIgnorePatterns: ['<rootDir>/test/'],
  coverageDirectory: 'test-output/jest/coverage',
};

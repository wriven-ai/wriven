module.exports = {
  displayName: '@wriven/auth-service',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  setupFiles: ['reflect-metadata'],
  coverageDirectory: 'test-output/jest/coverage',
  // Integration specs live under test/ and need Docker — keep the unit suite docker-free.
  testPathIgnorePatterns: ['<rootDir>/test/'],
};

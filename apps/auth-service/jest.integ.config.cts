module.exports = {
  displayName: '@wriven/auth-service-integration',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  setupFiles: ['reflect-metadata'],
  // Only the integration tree — the unit suite must stay docker-free.
  testMatch: ['<rootDir>/test/integration/**/*.integ.spec.ts'],
  transform: {
    '^.+\\.(ts|js|mts|mjs|cts|cjs|html)$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.integration.json' },
    ],
  },
  // Docker side effects are never cacheable.
  cache: false,
};

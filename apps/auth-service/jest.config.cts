module.exports = {
  displayName: '@wriven/auth-service',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  setupFiles: ['reflect-metadata'],
  // Always-on coverage with a ratcheted floor — keeps naked modules visible
  // in every run (local + CI) instead of relying on a separate coverage job.
  collectCoverage: true,
  // Whole src tree — a module with NO spec must drag the number down, not
  // vanish from the denominator.
  collectCoverageFrom: ['src/**/*.ts', '!src/testing/**', '!src/**/*.spec.ts', '!src/main.ts'],
  coverageThreshold: {
    global: {
      lines: 85,
      branches: 78,
    },
  },
  coverageReporters: ['text-summary', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
  // Integration specs live under test/ and need Docker — keep the unit suite docker-free.
  testPathIgnorePatterns: ['<rootDir>/test/'],
};

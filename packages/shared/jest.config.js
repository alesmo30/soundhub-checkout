export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': '@swc/jest',
  },
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  coverageReporters: ['text', 'json-summary'],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    },
  },
};

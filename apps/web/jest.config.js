export default {
  testEnvironment: 'jest-fixed-jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  transform: {
    '^.+\\.m?(t|j)sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          transform: { react: { runtime: 'automatic' } },
        },
      },
    ],
  },
  testMatch: ['<rootDir>/src/**/*.spec.{ts,tsx}'],
  // msw pulls in a deep tree of ESM-only packages (@mswjs/*, @open-draft/*,
  // until-async, rettime, ...) with no CommonJS build. Rather than
  // allowlisting each one, transform all of node_modules with @swc/jest.
  transformIgnorePatterns: [],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/src/test/style-mock.ts',
    '\\.(png|jpe?g|gif|svg|webp|woff2?)$': '<rootDir>/src/test/file-mock.ts',
    '^@checkout/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  coverageReporters: ['text', 'json-summary'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/src/main.tsx',
    '<rootDir>/src/mocks/browser.ts',
    '<rootDir>/src/test/',
    '<rootDir>/src/config/env.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
};

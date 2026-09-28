import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  rootDir: '.',
  setupFiles: ['reflect-metadata', '<rootDir>/jest.setup-env.ts'],
  transform: {
    '^.+\\.[tj]s$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2022',
        },
        module: { type: 'commonjs' },
      },
    ],
  },
  // @nestjs/* ships ESM-only; transpile it to CommonJS for Jest too. pnpm
  // nests real packages under node_modules/.pnpm/<name>@<version>/..., so the
  // pattern must anchor on that segment, not on the outer node_modules/.
  transformIgnorePatterns: ['/node_modules/\\.pnpm/(?!@nestjs)'],
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  // Without this, Jest only measures files some test happens to import,
  // silently excluding untouched files (and their 0% coverage) from the
  // aggregate entirely.
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/**/*.spec.ts',
    '!<rootDir>/src/**/*.int-spec.ts',
  ],
  coverageReporters: ['text', 'json-summary'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/src/main.ts',
    '<rootDir>/src/lambda.ts',
    '<rootDir>/src/workers/migrator.handler.ts',
    '<rootDir>/src/workers/reconcile-once.cli.ts',
    '<rootDir>/src/workers/reconciler.handler.ts',
    '<rootDir>/src/workers/email-preview.ts',
    '<rootDir>/src/shared/infrastructure/persistence/migrations/',
    '<rootDir>/src/shared/infrastructure/persistence/seeds/',
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

export default config;

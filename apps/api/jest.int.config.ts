import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  rootDir: '.',
  setupFiles: ['reflect-metadata'],
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
  testMatch: ['<rootDir>/src/**/*.int-spec.ts'],
  // Every raw SQL statement gets tested against the real docker-compose
  // database; running serially avoids cross-test interference on shared tables.
  maxWorkers: 1,
  globalSetup: '<rootDir>/src/shared/infrastructure/persistence/int-global-setup.ts',
};

export default config;

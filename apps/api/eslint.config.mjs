import { defineConfig } from 'eslint/config';
import rootConfig from '../../eslint.config.js';

const MODULES = [
  'catalog',
  'locations',
  'pricing',
  'customers',
  'transactions',
  'deliveries',
  'notifications',
];

const DOMAIN_PATTERNS = [
  {
    group: ['@nestjs/*'],
    message: 'domain/ must stay framework-free (see references/layering.md).',
  },
  {
    group: ['**/infrastructure/**'],
    message: 'domain/ must not depend on infrastructure/ (see references/layering.md).',
  },
  {
    group: ['**/application/**'],
    message: 'domain/ must not depend on application/ (see references/layering.md).',
  },
];
const DOMAIN_PATHS = [
  { name: 'typeorm', message: 'domain/ must stay framework-free (see references/layering.md).' },
];

const APPLICATION_PATTERNS = [
  {
    group: ['**/infrastructure/**'],
    message: 'application/ depends on ports, not adapters (see references/layering.md).',
  },
];
const APPLICATION_PATHS = [
  {
    name: 'typeorm',
    message: 'application/ depends on ports, not adapters (see references/layering.md).',
  },
];

const PERSISTENCE_PATTERNS = [
  {
    group: ['**/*payment-gateway*'],
    message:
      'No network call while a database transaction holds row locks (see references/layering.md).',
  },
];
const PERSISTENCE_PATHS = ['undici', 'axios', 'node:http', 'node:https'];

function crossModulePatterns(moduleName) {
  return MODULES.filter((other) => other !== moduleName).map((other) => ({
    group: [`**/${other}/**`],
    message: `A module talks to '${other}' only through its index.ts (see references/layering.md).`,
  }));
}

// A *.module.ts file (Nest's composition root for a module) may import a
// sibling module's Module class directly — that's how NestJS shares a DI
// tree (e.g. PricingModule needs `imports: [CatalogModule]` to resolve
// PRODUCT_REPOSITORY for GetQuoteUseCase; sibling modules under AppModule
// don't share exported providers on their own). This is a different concern
// from application/domain code reaching into another module's internals, so
// it still blocks domain/application/infrastructure, just not the sibling
// Module class or its index.ts.
function crossModulePatternsForModuleFile(moduleName) {
  return MODULES.filter((other) => other !== moduleName).map((other) => ({
    group: [`**/${other}/domain/**`, `**/${other}/application/**`, `**/${other}/infrastructure/**`],
    message: `A module talks to '${other}' only through its index.ts or its Module class (see references/layering.md).`,
  }));
}

const moduleConfigs = MODULES.flatMap((moduleName) => {
  const cross = crossModulePatterns(moduleName);
  const crossForModuleFile = crossModulePatternsForModuleFile(moduleName);
  const domainGlob = `src/modules/${moduleName}/domain/**`;
  const applicationGlob = `src/modules/${moduleName}/application/**`;
  const persistenceGlob = `src/modules/${moduleName}/infrastructure/persistence/**`;
  const moduleFileGlob = `src/modules/${moduleName}/*.module.ts`;

  return [
    {
      files: [`${domainGlob}/*.ts`],
      rules: {
        'no-restricted-imports': [
          'error',
          { paths: DOMAIN_PATHS, patterns: [...DOMAIN_PATTERNS, ...cross] },
        ],
      },
    },
    {
      files: [`${applicationGlob}/*.ts`],
      rules: {
        'no-restricted-imports': [
          'error',
          { paths: APPLICATION_PATHS, patterns: [...APPLICATION_PATTERNS, ...cross] },
        ],
      },
    },
    {
      files: [`${persistenceGlob}/*.ts`],
      rules: {
        'no-restricted-imports': [
          'error',
          { paths: PERSISTENCE_PATHS, patterns: [...PERSISTENCE_PATTERNS, ...cross] },
        ],
      },
    },
    {
      files: [`src/modules/${moduleName}/**/*.ts`],
      ignores: [
        `${domainGlob}/**`,
        `${applicationGlob}/**`,
        `${persistenceGlob}/**`,
        moduleFileGlob,
      ],
      rules: {
        'no-restricted-imports': ['error', { patterns: cross }],
      },
    },
    {
      files: [moduleFileGlob],
      rules: {
        'no-restricted-imports': ['error', { patterns: crossForModuleFile }],
      },
    },
  ];
});

export default defineConfig(
  ...rootConfig,
  {
    files: ['src/shared/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: DOMAIN_PATHS, patterns: DOMAIN_PATTERNS }],
    },
  },
  {
    files: ['src/shared/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: APPLICATION_PATHS, patterns: APPLICATION_PATTERNS },
      ],
    },
  },
  {
    files: ['src/shared/infrastructure/persistence/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: PERSISTENCE_PATHS, patterns: PERSISTENCE_PATTERNS },
      ],
    },
  },
  {
    // Developer-run CLI tools; not part of the deployed app.
    files: ['src/shared/infrastructure/persistence/seeds/**/*.ts'],
    ignores: ['src/shared/infrastructure/persistence/seeds/**/*.int-spec.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Jest setup file, not application code: gives unit tests fallback db
    // values so importing data-source.ts never needs a real .env.
    files: ['jest.setup-env.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  ...moduleConfigs,
);

import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';
import eslintConfigPrettier from 'eslint-config-prettier';

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/dist-lambda/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/cdk.out/**',
      'infra/test/fixtures/**',
      '**/*.d.ts',
      'pnpm-lock.yaml',
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { unicorn },
    rules: {
      'max-params': ['error', 3],
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            'Read process.env only inside config/ (see references/coding-conventions.md#c2).',
        },
      ],
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    },
  },
  {
    files: ['**/config/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
  eslintConfigPrettier,
);

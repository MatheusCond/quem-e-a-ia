// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'legacy/**',
      'apps/*/src/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['apps/api/**/*.ts', 'apps/worker/**/*.ts', 'packages/**/*.ts', 'load-test/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
  },
  {
    files: ['deploy/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['**/*.spec.ts', '**/test/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);

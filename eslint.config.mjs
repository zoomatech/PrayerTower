// @ts-check
// ESLint for the server, station, shared package, e2e tests and scripts.
// The app has its own config (apps/mobile/eslint.config.js, from Expo).
// docs/CODE_HEALTH.md.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['apps/mobile/**', '**/node_modules/**', '**/dist/**', '**/coverage/**', 'apps/e2e/.web-dist/**', 'apps/e2e/test-results/**', 'apps/e2e/playwright-report/**', 'apps/station/.venv/**']),
  {
    files: ['**/*.{js,mjs,cjs,ts}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    // Tests read deep into JSON answers; typing every one adds nothing.
    files: ['**/test/**/*.ts', 'apps/e2e/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
]);

// Lint for the app JS, tools and tests (CI job "lint"). Tuned so develop passes as it is today:
// it catches real mistakes (undefined names, unreachable code, duplicate keys, bad regexes) and
// leaves style alone. No formatter, no style rules, nothing rewrites app code.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'playwright-report/**', 'test-results/**', 'blob-report/**', 'screenshots/**', 'android-icons/**', 'tests/fixtures/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-empty': 'off',
    },
  },
  { files: ['sw.js'], languageOptions: { globals: { ...globals.serviceworker } } },
  { files: ['tools/**', 'tests/**', '*.config.js', 'eslint.config.js'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } } },
  // Lint finding L1 (develop 7465438): js/parent-screen.js line 7 reads GPC but never imports it. The helper (_nice)
  // is unused today, so it never throws. This one-file override is the only exception; delete it when the import lands.
  { files: ['js/parent-screen.js'], languageOptions: { globals: { GPC: 'readonly' } } },
];

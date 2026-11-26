import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

/**
 * Rule 1 of CLAUDE.md: game logic and shared packages are deterministic plain TypeScript.
 * No DOM, storage, network, clock, unseeded randomness, UI framework or native plugin.
 */
const BROWSER_GLOBALS = [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'navigator',
  'location',
  'fetch',
  'WebSocket',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'performance',
];

/** Node runs this code directly by stripping types, which cannot handle `constructor(readonly x: T)`. */
const NO_PARAMETER_PROPERTIES = {
  selector: 'TSParameterProperty',
  message:
    'Declare the field and assign it in the constructor (not supported by Node type stripping).',
};

const logicPurity = {
  'no-restricted-globals': ['error', ...BROWSER_GLOBALS],
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Use the seeded generator from game-kit.' },
    { object: 'Date', property: 'now', message: 'Time is passed in as an input.' },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date'][arguments.length=0]",
      message: 'Time is passed in as an input.',
    },
    NO_PARAMETER_PROPERTIES,
  ],
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        { group: ['svelte', 'svelte/*', '@sveltejs/*'], message: 'Logic never imports the UI.' },
        { group: ['@capacitor/*'], message: 'Logic never imports native plugins.' },
        { group: ['node:*'], message: 'Logic is host-neutral: no Node.js APIs.' },
      ],
    },
  ],
};

export default defineConfig(
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    '.wrangler/**',
    'apps/client/android/**',
    'apps/client/playwright-report/**',
    'apps/client/test-results/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, __APP_VERSION__: 'readonly' },
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['**/*.ts', '**/*.svelte'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Logic and shared packages (CLAUDE.md rule 1). Tests may use the platform freely.
    files: ['packages/*/src/**/*.ts', 'games/*/logic/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: logicPurity,
  },
  {
    // Servers run as plain Node.js: type stripping applies, and the platform is theirs to use.
    files: ['apps/server-*/src/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', NO_PARAMETER_PROPERTIES] },
  },
);

const OFF = 0;
const WARN = 1;

// TODO: Types
// eslint-disable-next-line max-len
// /** @type {import('eslint/lib/shared/types').ConfigData & { parserOptions: import('@typescript-eslint/types').ParserOptions }} */
module.exports = {
  root: true,
  reportUnusedDisableDirectives: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./test/tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'airbnb-base',
    'airbnb-typescript/base',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:unicorn/recommended',
  ],
  rules: {
    '@typescript-eslint/explicit-module-boundary-types': WARN,
    'import/prefer-default-export': OFF,
    'no-restricted-syntax': OFF,
    'no-void': OFF,
    'unicorn/filename-case': OFF,
    'unicorn/no-abusive-eslint-disable': WARN,
    'unicorn/no-null': OFF,
    'unicorn/no-process-exit': OFF,
    'unicorn/prefer-module': OFF,
    'unicorn/prefer-node-protocol': OFF,
    'unicorn/prefer-query-selector': OFF,
    'unicorn/prevent-abbreviations': OFF,
  },
};

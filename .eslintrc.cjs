/**
 * Общая конфигурация ESLint для монорепо (TIER 1).
 *
 * Формат — классический `.eslintrc.cjs` (ESLint 8). Архивный код черновика
 * (`archive/`) и артефакты сборки исключены из проверки.
 */
module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
    browser: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'coverage/',
    'archive/',
    'data/',
    '*.cjs',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'warn',
    eqeqeq: ['error', 'smart'],
  },
};

module.exports = {
  root: true,
  extends: [
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier'
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier', 'jest', 'import', 'react', 'react-hooks', 'react-native'],
  ignorePatterns: [
    'node_modules/',
    '**/node_modules/',
    'build/',
    'dist/',
    'coverage/',
    'android/',
    'ios/',
    'web-build/',
    '.expo/',
    'scripts/',
  ],
  rules: {
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'import/no-useless-path-segments': 'off',
    'no-unused-vars': 'off',
    'prettier/prettier': 'error',
    '@typescript-eslint/consistent-type-imports': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'react/display-name': 'off',
    'react/no-unescaped-entities': 'off',
    'react-native/no-unused-styles': 'warn',
    'react-native/no-inline-styles': 'off',
    'react-native/no-color-literals': 'off',
  },
  env: {
    'jest/globals': true,
    node: true,
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
};

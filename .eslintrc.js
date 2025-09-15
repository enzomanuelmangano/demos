module.exports = {
  root: true,
  extends: ['react-native-wcandillon', 'prettier'],
  plugins: [
    // ... other plugins
    'prettier',
    'jest',
  ],
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
    '@typescript-eslint/consistent-type-imports': 'off', // Disable problematic rule temporarily
  },
  env: {
    // ... other environments
    'jest/globals': true,
  },
};

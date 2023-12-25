module.exports = {
  root: true,
  extends: ['react-native-wcandillon', 'prettier'],
  plugins: [
    // ... other plugins
    'prettier',
    'jest',
  ],
  rules: {
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'import/no-useless-path-segments': 'off',
    'no-unused-vars': 'off',
    'prettier/prettier': [
      'error',
      {
        endOfLine: 'auto',
      },
    ],
  },
  env: {
    // ... other environments
    'jest/globals': true,
  },
};

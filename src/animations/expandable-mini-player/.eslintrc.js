module.exports = {
  root: true,
  extends: ['react-native-wcandillon', 'prettier'],
  plugins: [
    // ... other plugins
    'jest',
  ],
  rules: {
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'import/no-useless-path-segments': 'off',
    'no-unused-vars': 'off',
    'import/no-default-export': 'off',
  },
  env: {
    // ... other environments
    'jest/globals': true,
  },
};

module.exports = {
  root: true,
  extends: [
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:refined/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
    'jest',
    'import',
    'react',
    'react-hooks',
    'react-native',
    'deprecation',
    'prettier',
    'pressto',
    'refined',
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
    'pressto/require-worklet-directive': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'import/no-useless-path-segments': 'off',
    'no-unused-vars': 'off',
    'prettier/prettier': 'error',
    '@typescript-eslint/consistent-type-imports': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'deprecation/deprecation': 'error',
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'react/display-name': 'off',
    'react/no-unescaped-entities': 'off',
    'react-native/no-unused-styles': 'warn',
    'react-native/no-inline-styles': 'off',
    'react-native/no-color-literals': 'off',
    'react-native/no-unused-styles': 'warn',
    'react-native/sort-styles': [
      'error',
      'asc',
      {
        ignoreClassNames: false,
        ignoreStyleProperties: false,
      },
    ],
    // Import ordering rules to ensure styles are always at the top
    'import/order': [
      'error',
      {
        groups: [
          ['builtin', 'external'], // Node built-ins and external packages
          'internal', // Internal modules
          ['parent', 'sibling'], // Parent and sibling imports
          'index', // Index file imports
          'object', // Object imports
          'type', // Type imports
        ],
        pathGroups: [
          {
            pattern: '*.{css,scss,sass,less,styl,stylus,pcss,postcss}',
            group: 'builtin',
            position: 'before',
          },
          {
            pattern: '**/*.{css,scss,sass,less,styl,stylus,pcss,postcss}',
            group: 'builtin',
            position: 'before',
          },
          {
            pattern: 'react-native',
            group: 'external',
            position: 'before',
          },
          {
            pattern: 'react',
            group: 'external',
            position: 'before',
          },
        ],
        pathGroupsExcludedImportTypes: ['type'],
        'newlines-between': 'always',
        alphabetize: {
          order: 'asc',
          caseInsensitive: true,
        },
      },
    ],
    'import/newline-after-import': ['error', { count: 1 }],
    'import/no-duplicates': 'error',
  },
  env: {
    'jest/globals': true,
    node: true,
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
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

module.exports = {
  root: true,
  extends: [
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
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
    'prettier',
    'pressto',
    'refined',
    'local-rules',
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
    // eslint-plugin-refined rules (enable one at a time as needed)
    'refined/border-radius-with-curve': 'warn',
    'refined/prefer-hairline-width': 'warn',
    'refined/prefer-box-shadow': 'warn',
    'refined/require-hitslop-small-touchables': 'warn',
    'refined/spring-config-consistency': [
      'warn',
      {
        reanimatedVersion: 'v4',
      },
    ],
    'refined/avoid-touchable-opacity': 'warn',

    'pressto/require-worklet-directive': 'error',
    // Shared values: enforce .get()/.set() over .value (type-aware local rule)
    'local-rules/no-shared-value-dot-value': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'import/no-useless-path-segments': 'off',
    'no-unused-vars': 'off',
    'prettier/prettier': 'error',
    '@typescript-eslint/consistent-type-imports': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    // Gesture Handler 3 deprecates the `Gesture.*` builder in favour of the
    // hook API. The builder still works on v3; moving every demo to hooks is
    // its own migration, so only the builder is allowed here — any other
    // deprecated API is still an error.
    '@typescript-eslint/no-deprecated': [
      'error',
      {
        allow: [
          {
            from: 'package',
            package: 'react-native-gesture-handler',
            name: [
              'Gesture',
              'Tap',
              'Pan',
              'Pinch',
              'Rotation',
              'Fling',
              'LongPress',
              'ForceTouch',
              'Native',
              'Manual',
              'Hover',
              'Race',
              'Simultaneous',
              'Exclusive',
            ],
          },
        ],
      },
    ],
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

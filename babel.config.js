module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-worklets/plugin',
      [
        './plugins/liquid-glass-resolver',
        {
          // Customize the suffix used for variant files
          // Default: '.liquid' (e.g., component.liquid.tsx)
          suffix: '.liquid',

          // Enable debug logging to see transformation details
          debugLogging: false,
        },
      ],
    ],
  };
};

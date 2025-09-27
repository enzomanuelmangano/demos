module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-worklets/plugin',
      './babel-plugin-liquid-glass-simple.js',
    ],
  };
};

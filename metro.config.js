// SDK 56: expo-router vendors react-navigation and rejects direct
// @react-navigation/* imports. The router chrome uses the vendored exports;
// the animation demos run their own standalone NavigationContainers (wrapped
// in NavigationIndependentTree), which are safe — disable the blanket check.
process.env.EXPO_ROUTER_DISABLE_RN_NAVIGATION_CHECK = '1';

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Redirect Skia's WebGPUViewNativeComponent to a stub to avoid duplicate registration
// with react-native-webgpu (both register "WebGPUView")
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName.includes('WebGPUViewNativeComponent') &&
    context.originModulePath.includes('@shopify/react-native-skia')
  ) {
    return {
      filePath: path.resolve(__dirname, 'src/stubs/webgpu-view-stub.js'),
      type: 'sourceFile',
    };
  }

  // Fall back to default resolution
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

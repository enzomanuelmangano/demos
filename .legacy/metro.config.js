// SDK 56: expo-router vendors react-navigation and rejects direct
// @react-navigation/* imports. The router chrome uses the vendored exports;
// the animation demos run their own standalone NavigationContainers (wrapped
// in NavigationIndependentTree), which are safe — disable the blanket check.
process.env.EXPO_ROUTER_DISABLE_RN_NAVIGATION_CHECK = '1';

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle raw ASTC-compressed atlases (art-gallery) as binary assets so they can
// be fetched verbatim and uploaded to GPU compressed textures. .bin carries the
// same idea for uncompressed GPU payloads — light-on-painting's baked
// rgba16float surface field, whose half-floats no image container would survive.
config.resolver.assetExts.push('astc', 'bin');

module.exports = config;

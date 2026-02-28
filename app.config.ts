import { ExpoConfig, ConfigContext } from 'expo/config';

const packageJson = require('./package.json');

const IS_DEV = process.env.EXPO_PUBLIC_APP_VARIANT === 'development';

const getEnvironment = () => {
  if (IS_DEV) {
    return {
      name: 'Demos Dev',
      scheme: 'demos-dev',
      bundleIdentifier: 'com.reactiive.dev',
      apsEnvironment: 'development',
    };
  }
  return {
    name: 'Demos',
    scheme: 'demos',
    bundleIdentifier: 'com.reactiive.app',
    apsEnvironment: 'production',
  };
};

const env = getEnvironment();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: env.name,
  slug: 'thank-you',
  version: packageJson.version,
  orientation: 'portrait',
  runtimeVersion: {
    policy: 'appVersion',
  },
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  scheme: env.scheme,
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#111111',
  },
  updates: {
    url: 'https://u.expo.dev/eb1bbf17-5fb9-4743-bccf-3fbcbc95176a',
    enabled: true,
    fallbackToCacheTimeout: 0,
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    config: {
      usesNonExemptEncryption: false,
    },
    bundleIdentifier: env.bundleIdentifier,
    entitlements: {
      'aps-environment': env.apsEnvironment,
    },
    appleTeamId: 'W3N4N47454',
    associatedDomains: ['applinks:app.reactiive.io'],
    infoPlist: {
      CADisableMinimumFrameDurationOnPhone: true,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FFFFFF',
    },
    package: env.bundleIdentifier,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'https',
            host: 'app.reactiive.io',
            pathPrefix: '/',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-asset',
    'expo-font',
    'expo-image',
    [
      'expo-color-space-plugin',
      {
        colorSpace: 'displayP3',
      },
    ],
    'expo-router',
    [
      'expo-build-properties',
      {
        android: {
          reactNativeReleaseLevel: 'experimental',
        },
        ios: {
          reactNativeReleaseLevel: 'experimental',
        },
      },
    ],
    [
      'expo-quick-actions',
      {
        iosActions: [
          {
            id: '1',
            title: 'Leave Feedback',
            subtitle: 'Share your thoughts',
            icon: 'symbol:heart.fill',
            params: {
              href: '/',
              action: 'feedback',
            },
          },
        ],
      },
    ],
    'expo-sqlite',
  ],
  extra: {
    eas: {
      projectId: 'eb1bbf17-5fb9-4743-bccf-3fbcbc95176a',
    },
  },
});

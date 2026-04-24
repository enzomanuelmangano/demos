const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin to add DemosNitro pod to the Podfile.
 * This is required because DemosNitro is a local pod that isn't
 * automatically discovered by Expo's autolinking.
 */
const withNitroAutolinking = config => {
  return withDangerousMod(config, [
    'ios',
    async config => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile',
      );

      let podfileContent = fs.readFileSync(podfilePath, 'utf-8');

      // Check if our fix is already applied
      if (podfileContent.includes("pod 'DemosNitro'")) {
        return config;
      }

      // Add DemosNitro pod after use_react_native! block
      const demosNitroPod = `
  # Local Nitro module for high-performance color matching
  pod 'DemosNitro', :path => '../'
`;

      // Insert after use_react_native!(...) closing parenthesis
      podfileContent = podfileContent.replace(
        /(use_react_native!\([\s\S]*?\)\n)/,
        `$1${demosNitroPod}`,
      );

      fs.writeFileSync(podfilePath, podfileContent);
      return config;
    },
  ]);
};

module.exports = withNitroAutolinking;

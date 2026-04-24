const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin to wire up the local DemosNitro native module.
 * The actual native code lives in /native - this plugin just connects it.
 */

function withNitroIOS(config) {
  return withDangerousMod(config, [
    'ios',
    async config => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile',
      );
      let podfile = fs.readFileSync(podfilePath, 'utf-8');

      if (!podfile.includes("pod 'DemosNitro'")) {
        podfile = podfile.replace(
          /(use_react_native!\([\s\S]*?\)\n)/,
          `$1\n  # Local Nitro module\n  pod 'DemosNitro', :path => '../'\n`,
        );
        fs.writeFileSync(podfilePath, podfile);
      }
      return config;
    },
  ]);
}

function withNitroAndroid(config) {
  return withDangerousMod(config, [
    'android',
    async config => {
      const androidDir = path.join(config.modRequest.projectRoot, 'android');
      const nativeAndroidDir = path.join(
        config.modRequest.projectRoot,
        'plugins/nitro-android',
      );

      // Symlink native/android -> android/demosnitro
      const targetDir = path.join(androidDir, 'demosnitro');
      if (!fs.existsSync(targetDir)) {
        fs.symlinkSync(nativeAndroidDir, targetDir, 'dir');
      }

      // Add to settings.gradle
      const settingsPath = path.join(androidDir, 'settings.gradle');
      let settings = fs.readFileSync(settingsPath, 'utf-8');
      if (!settings.includes("include ':demosnitro'")) {
        settings = settings.replace(
          "include ':app'",
          "include ':app'\ninclude ':demosnitro'",
        );
        fs.writeFileSync(settingsPath, settings);
      }

      // Add dependency to app/build.gradle
      const appBuildPath = path.join(androidDir, 'app', 'build.gradle');
      let appBuild = fs.readFileSync(appBuildPath, 'utf-8');
      if (!appBuild.includes("project(':demosnitro')")) {
        appBuild = appBuild.replace(
          'implementation("com.facebook.react:react-android")',
          'implementation("com.facebook.react:react-android")\n    implementation project(\':demosnitro\')',
        );
        fs.writeFileSync(appBuildPath, appBuild);
      }

      return config;
    },
  ]);
}

module.exports = config => {
  config = withNitroIOS(config);
  config = withNitroAndroid(config);
  return config;
};

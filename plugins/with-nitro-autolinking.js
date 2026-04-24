const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin to add DemosNitro native module autolinking.
 * This is required because DemosNitro is a local module that isn't
 * automatically discovered by Expo's autolinking.
 *
 * iOS: Adds the pod to Podfile
 * Android: Creates CMakeLists.txt and modifies build.gradle
 */

function withNitroAutolinkingIOS(config) {
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
}

function withNitroAutolinkingAndroid(config) {
  return withDangerousMod(config, [
    'android',
    async config => {
      const projectRoot = config.modRequest.projectRoot;
      const androidDir = path.join(projectRoot, 'android');
      const demosnitroDir = path.join(androidDir, 'demosnitro');

      // Create directory structure
      const kotlinDir = path.join(demosnitroDir, 'src', 'main', 'kotlin', 'com', 'margelo', 'nitro', 'demos');
      fs.mkdirSync(kotlinDir, { recursive: true });

      // 1. Create build.gradle
      const buildGradle = `apply plugin: 'com.android.library'
apply plugin: 'org.jetbrains.kotlin.android'

def demosRoot = file("$projectDir/../..")

android {
    namespace 'com.margelo.nitro.demos'
    compileSdk rootProject.ext.compileSdkVersion

    defaultConfig {
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion

        externalNativeBuild {
            cmake {
                cppFlags "-std=c++20 -frtti -fexceptions"
                arguments "-DANDROID_STL=c++_shared"
                abiFilters(*rootProject.getProperties().getOrDefault("reactNativeArchitectures", "arm64-v8a").split(","))
            }
        }

        ndk {
            abiFilters(*rootProject.getProperties().getOrDefault("reactNativeArchitectures", "arm64-v8a").split(","))
        }
    }

    externalNativeBuild {
        cmake {
            path "CMakeLists.txt"
        }
    }

    sourceSets {
        main {
            java.srcDirs += ["\${demosRoot}/nitrogen/generated/android/kotlin"]
        }
    }

    buildFeatures {
        prefab true
    }
}

dependencies {
    implementation "com.facebook.react:react-android"
    implementation project(':react-native-nitro-modules')
}
`;
      fs.writeFileSync(path.join(demosnitroDir, 'build.gradle'), buildGradle);

      // 2. Create CMakeLists.txt
      const cmakeLists = `cmake_minimum_required(VERSION 3.13)
project(DemosNitro)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(DEMOS_ROOT \${CMAKE_SOURCE_DIR}/../..)

add_definitions(-DBUILDING_DEMOSNITRO_WITH_GENERATED_CMAKE_PROJECT)

add_library(DemosNitro SHARED
    \${DEMOS_ROOT}/src/native/ColorMatcher/HybridColorMatcher.cpp
    \${DEMOS_ROOT}/src/native/ColorMatcher/cpp-adapter.cpp
    \${DEMOS_ROOT}/nitrogen/generated/android/DemosNitroOnLoad.cpp
    \${DEMOS_ROOT}/nitrogen/generated/shared/c++/HybridColorMatcherSpec.cpp
)

target_include_directories(DemosNitro PRIVATE
    \${DEMOS_ROOT}/src/native/ColorMatcher
    \${DEMOS_ROOT}/nitrogen/generated/shared/c++
    \${DEMOS_ROOT}/nitrogen/generated/android/c++
    \${DEMOS_ROOT}/nitrogen/generated/android
)

find_package(fbjni REQUIRED)
find_package(ReactAndroid REQUIRED)
find_package(react-native-nitro-modules REQUIRED)

target_link_libraries(DemosNitro
    fbjni::fbjni
    ReactAndroid::jsi
    react-native-nitro-modules::NitroModules
)

if(ReactAndroid_VERSION_MINOR GREATER_EQUAL 76)
    target_link_libraries(DemosNitro ReactAndroid::reactnative)
else()
    target_link_libraries(DemosNitro ReactAndroid::react_nativemodule_core)
endif()
`;
      fs.writeFileSync(path.join(demosnitroDir, 'CMakeLists.txt'), cmakeLists);

      // 3. Create AndroidManifest.xml with ContentProvider
      const manifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application>
        <provider
            android:name="com.margelo.nitro.demos.DemosNitroInitProvider"
            android:authorities="\${applicationId}.demosnitroinitprovider"
            android:exported="false" />
    </application>
</manifest>
`;
      fs.writeFileSync(path.join(demosnitroDir, 'src', 'main', 'AndroidManifest.xml'), manifest);

      // 4. Create Kotlin ContentProvider for auto-initialization
      const initProvider = `package com.margelo.nitro.demos

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri

class DemosNitroInitProvider : ContentProvider() {
    override fun onCreate(): Boolean {
        DemosNitroOnLoad.initializeNative()
        return true
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?,
                       selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?,
                        selectionArgs: Array<out String>?): Int = 0
}
`;
      fs.writeFileSync(path.join(kotlinDir, 'DemosNitroInitProvider.kt'), initProvider);

      // 5. Modify settings.gradle to include demosnitro module
      const settingsPath = path.join(androidDir, 'settings.gradle');
      let settingsContent = fs.readFileSync(settingsPath, 'utf-8');
      if (!settingsContent.includes("include ':demosnitro'")) {
        settingsContent = settingsContent.replace(
          "include ':app'",
          "include ':app'\ninclude ':demosnitro'"
        );
        fs.writeFileSync(settingsPath, settingsContent);
      }

      // 6. Modify app/build.gradle to depend on demosnitro
      const appBuildGradlePath = path.join(androidDir, 'app', 'build.gradle');
      let appBuildGradle = fs.readFileSync(appBuildGradlePath, 'utf-8');
      if (!appBuildGradle.includes("project(':demosnitro')")) {
        appBuildGradle = appBuildGradle.replace(
          'implementation("com.facebook.react:react-android")',
          'implementation("com.facebook.react:react-android")\n    implementation project(\':demosnitro\')'
        );
        fs.writeFileSync(appBuildGradlePath, appBuildGradle);
      }

      return config;
    },
  ]);
}

const withNitroAutolinking = config => {
  config = withNitroAutolinkingIOS(config);
  config = withNitroAutolinkingAndroid(config);
  return config;
};

module.exports = withNitroAutolinking;

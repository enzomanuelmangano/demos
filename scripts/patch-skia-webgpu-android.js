#!/usr/bin/env node
/**
 * Android-only patch for react-native-skia to avoid conflict with react-native-wgpu.
 * Both libraries register a native component called "WebGPUView",
 * causing duplicate symbol errors on Android.
 *
 * This script:
 * 1. Stubs out the TypeScript spec (prevents codegen conflicts)
 * 2. Removes WebGPUViewManager from RNSkiaPackage.java
 * 3. Stubs WebGPUViewManager.java to compile without codegen dependencies
 *
 * Note: iOS is handled separately by the Expo plugin (plugins/with-skia-webgpu-fix.js)
 */

const fs = require('fs');
const path = require('path');

const SKIA_PATH = path.join(
  __dirname,
  '../node_modules/@shopify/react-native-skia'
);

const PATCH_MARKER = 'Patched to avoid conflict with react-native-wgpu';

// Patch 1: TypeScript spec
function patchTypeScriptSpec() {
  const filePath = path.join(SKIA_PATH, 'src/specs/WebGPUViewNativeComponent.ts');

  const stubbedContent = `// ${PATCH_MARKER}
// Both libraries register a native component called "WebGPUView"
// Since we use react-native-wgpu for WebGPU, we stub this out
import { View } from "react-native";

export interface NativeProps {
  contextId: number;
  transparent: boolean;
}

// eslint-disable-next-line import/no-default-export
export default View as any;
`;

  if (!fs.existsSync(filePath)) {
    console.log('  ⚠ WebGPUViewNativeComponent.ts not found, skipping');
    return false;
  }

  const currentContent = fs.readFileSync(filePath, 'utf8');
  if (currentContent.includes(PATCH_MARKER)) {
    console.log('  ✓ WebGPUViewNativeComponent.ts already patched');
    return true;
  }

  fs.writeFileSync(filePath, stubbedContent);
  console.log('  ✓ Patched WebGPUViewNativeComponent.ts');
  return true;
}

// Patch 2: Remove WebGPUViewManager from RNSkiaPackage.java
function patchRNSkiaPackage() {
  const filePath = path.join(
    SKIA_PATH,
    'android/src/main/java/com/shopify/reactnative/skia/RNSkiaPackage.java'
  );

  if (!fs.existsSync(filePath)) {
    console.log('  ⚠ RNSkiaPackage.java not found, skipping');
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes(PATCH_MARKER)) {
    console.log('  ✓ RNSkiaPackage.java already patched');
    return true;
  }

  // Remove WebGPUViewManager from createViewManagers
  // Change: new SkiaPictureViewManager(), new WebGPUViewManager()
  // To: new SkiaPictureViewManager()
  const originalLine = 'new SkiaPictureViewManager(),\n            new WebGPUViewManager()';
  const patchedLine = 'new SkiaPictureViewManager()\n            // WebGPUViewManager removed - ' + PATCH_MARKER;

  if (!content.includes(originalLine)) {
    // Try alternate format
    const altOriginal = 'new SkiaPictureViewManager(),\n            new WebGPUViewManager()';
    if (content.includes('WebGPUViewManager') && !content.includes(PATCH_MARKER)) {
      // Use regex for more flexible matching
      content = content.replace(
        /new SkiaPictureViewManager\(\),\s*\n\s*new WebGPUViewManager\(\)/,
        'new SkiaPictureViewManager()\n            // WebGPUViewManager removed - ' + PATCH_MARKER
      );
    } else {
      console.log('  ⚠ Could not find WebGPUViewManager in RNSkiaPackage.java');
      return false;
    }
  } else {
    content = content.replace(originalLine, patchedLine);
  }

  fs.writeFileSync(filePath, content);
  console.log('  ✓ Patched RNSkiaPackage.java');
  return true;
}

// Patch 3: Stub out WebGPUViewManager.java to prevent compilation errors
function patchWebGPUViewManager() {
  const filePath = path.join(
    SKIA_PATH,
    'android/src/main/java/com/shopify/reactnative/skia/WebGPUViewManager.java'
  );

  // Minimal stub that compiles without codegen dependencies
  const stubbedContent = `// ${PATCH_MARKER}
package com.shopify.reactnative.skia;

import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.views.view.ReactViewManager;
import androidx.annotation.NonNull;

// Stubbed out - WebGPU functionality provided by react-native-wgpu
public class WebGPUViewManager extends ReactViewManager {
  public static final String NAME = "SkiaWebGPUView"; // Renamed to avoid conflict

  @NonNull
  @Override
  public String getName() {
    return NAME;
  }

  @NonNull
  @Override
  public WebGPUView createViewInstance(@NonNull ThemedReactContext context) {
    return new WebGPUView(context);
  }
}
`;

  if (!fs.existsSync(filePath)) {
    console.log('  ⚠ WebGPUViewManager.java not found, skipping');
    return false;
  }

  const currentContent = fs.readFileSync(filePath, 'utf8');
  if (currentContent.includes(PATCH_MARKER)) {
    console.log('  ✓ WebGPUViewManager.java already patched');
    return true;
  }

  fs.writeFileSync(filePath, stubbedContent);
  console.log('  ✓ Patched WebGPUViewManager.java');
  return true;
}

// Main
console.log('Patching react-native-skia for react-native-wgpu compatibility (Android)...');

try {
  if (!fs.existsSync(SKIA_PATH)) {
    console.log('⚠ react-native-skia not found, skipping patches');
    process.exit(0);
  }

  patchTypeScriptSpec();
  patchRNSkiaPackage();
  patchWebGPUViewManager();

  console.log('✓ react-native-skia patched successfully');
} catch (error) {
  console.error('✗ Failed to patch react-native-skia:', error.message);
  process.exit(1);
}

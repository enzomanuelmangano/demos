#!/bin/sh
# Builds BlurProbe.app (probe.m) for the iOS Simulator into /tmp/blur-probe.
set -e
cd "$(dirname "$0")"
OUT=/tmp/blur-probe/BlurProbe.app
mkdir -p "$OUT"
SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
xcrun --sdk iphonesimulator clang -fobjc-arc -O1 -target arm64-apple-ios17.0-simulator -isysroot "$SDK" \
  -framework UIKit -framework QuartzCore -framework CoreGraphics -framework Foundation -o "$OUT/BlurProbe" probe.m
cat > "$OUT/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.reactiive.blurprobe</string>
<key>CFBundleExecutable</key><string>BlurProbe</string>
<key>CFBundleName</key><string>BlurProbe</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>MinimumOSVersion</key><string>17.0</string>
<key>UIRequiredDeviceCapabilities</key><array><string>arm64</string></array>
<key>UILaunchScreen</key><dict/>
<key>UIApplicationSceneManifest</key><dict><key>UIApplicationSupportsMultipleScenes</key><false/></dict>
<key>UIStatusBarHidden</key><true/>
<key>UIUserInterfaceStyle</key><string>Dark</string>
<key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array>
</dict></plist>
PLIST
codesign -s - --force "$OUT" >/dev/null 2>&1 || true
echo "$OUT"

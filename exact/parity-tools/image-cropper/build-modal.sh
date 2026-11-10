#!/bin/sh
# Builds modal-probe.m for Mac Catalyst into /tmp/image-cropper-modal-probe/Probe.app.
set -e
here=$(cd "$(dirname "$0")" && pwd)
out=/tmp/image-cropper-modal-probe/Probe.app/Contents
mkdir -p "$out/MacOS"
sdk=$(xcrun --sdk macosx --show-sdk-path)
xcrun clang -fobjc-arc -O1 -target arm64-apple-ios17.0-macabi -isysroot "$sdk" \
  -iframework "$sdk/System/iOSSupport/System/Library/Frameworks" \
  -framework UIKit -framework QuartzCore -framework Foundation -o "$out/MacOS/Probe" "$here/modal-probe.m"
cat > "$out/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.reactiive.modalprobe</string>
<key>CFBundleExecutable</key><string>Probe</string>
<key>CFBundleName</key><string>Probe</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSRequiresIPhoneOS</key><true/>
<key>UIDeviceFamily</key><array><integer>2</integer></array>
<key>UIApplicationSceneManifest</key><dict><key>UIApplicationSupportsMultipleScenes</key><false/></dict>
</dict></plist>
PLIST
codesign -s - --force "$out/.." >/dev/null 2>&1 || true
echo "$out/MacOS/Probe"

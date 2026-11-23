#!/bin/sh
# Builds border-image.m with React Native's own RCTBorderDrawing.m (the renderer's scale forced
# to 3, RCTRoundPixelValue at 3x) for Mac Catalyst, runs it, and writes the border image's alpha
# to exact/demos/gpu/images/image-cropper/border-17pt-r8-w1-3x.a8.
set -e
here=$(cd "$(dirname "$0")" && pwd)
rn="$here/../../../node_modules/react-native/React/Views"
tmp=/tmp/image-cropper-border
mkdir -p "$tmp/React"
cp "$rn/RCTBorderStyle.h" "$rn/RCTBorderDrawing.h" "$tmp/React/"
cp "$rn/RCTBorderDrawing.h" "$tmp/"
echo '#define RCT_EXTERN extern' > "$tmp/React/RCTDefines.h"
echo '#define RCTLogWarn(...)' > "$tmp/RCTLog.h"
sed -e 's|\[UIGraphicsImageRendererFormat defaultFormat\];|[UIGraphicsImageRendererFormat defaultFormat]; rendererFormat.scale = 3;|' \
    -e 's|#import "RCTLog.h"|#import "RCTLog.h"\nCGFloat RCTRoundPixelValue(CGFloat v);|' \
    "$rn/RCTBorderDrawing.m" > "$tmp/RCTBorderDrawing.m"
sdk=$(xcrun --sdk macosx --show-sdk-path)
xcrun clang -fobjc-arc -O1 -target arm64-apple-ios17.0-macabi -isysroot "$sdk" \
  -iframework "$sdk/System/iOSSupport/System/Library/Frameworks" -I "$tmp" \
  -framework UIKit -framework CoreGraphics -framework Foundation \
  -o "$tmp/border-image" "$here/border-image.m" "$tmp/RCTBorderDrawing.m"
"$tmp/border-image" "$here/../../demos/gpu/images/image-cropper/border-17pt-r8-w1-3x.a8"

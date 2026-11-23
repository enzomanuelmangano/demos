#!/bin/sh
# Builds probe.m for Mac Catalyst into /tmp/swipe-probe and runs it; `./build.sh dis` also
# disassembles the swipe's touchesMoved: and _checkForSwipeWithDelta:… from the loaded UIKitCore.
set -e
cd "$(dirname "$0")"; mkdir -p /tmp/swipe-probe
SDK=$(xcrun --sdk macosx --show-sdk-path)
clang -fobjc-arc -target arm64-apple-ios17.0-macabi -isysroot "$SDK" \
  -F "$SDK/System/iOSSupport/System/Library/Frameworks" -framework UIKit -o /tmp/swipe-probe/probe probe.m 2>/dev/null
/tmp/swipe-probe/probe
if [ "$1" = dis ]; then
  lldb /tmp/swipe-probe/probe -b -o "b main" -o run \
    -o 'disassemble -n "-[UISwipeGestureRecognizer touchesMoved:withEvent:]"' \
    -o 'disassemble -n "-[UISwipeGestureRecognizer _checkForSwipeWithDelta:time:currentPositionChange:currentTimeChange:indirect:]"' \
    -o quit
fi

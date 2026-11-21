#!/bin/sh
# run.sh <udid> <cases> <out.txt> [screenshot.png]: launches the probe with the cases
# ("font|size|text|x|y" joined by ";;"; font a bundled file or system-<UIFontWeight>), waits for
# its dump and copies it out.
U=$1; CASES=$2; OUT=$3
xcrun simctl launch --terminate-running-process $U com.reactiive.textprobe -cases "$CASES" >/dev/null
D=$(xcrun simctl get_app_container $U com.reactiive.textprobe data)/Documents/text.txt
rm -f "$D"
for i in $(seq 1 30); do [ -s "$D" ] && break; sleep 0.5; done
cp "$D" "$OUT"
[ -n "$4" ] && xcrun simctl io $U screenshot "$4" >/dev/null 2>&1
exit 0

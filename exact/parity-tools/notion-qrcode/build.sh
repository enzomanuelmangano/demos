#!/bin/sh
# Builds the Hermes runner (/tmp/notion-qrcode-hermes) against the hermes-engine pod of the RN app
# (HERMES_DESTROOT overrides it) and bundles parity.ts with the RN demo's own sources
# (/tmp/notion-qrcode-parity.js), runs the bundle in Hermes, passes the hsl() strings it hands
# Skia.Color through RN Skia's own CSSColorParser (css-color.cpp), and writes reference.txt.
set -e
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../../node_modules" && pwd -P)/..
hermes=${HERMES_DESTROOT:-$root/ios/Pods/hermes-engine/destroot}
fw="$hermes/Library/Frameworks/macosx"
clang++ -std=c++20 -O1 -I"$hermes/include" -F"$fw" -framework hermesvm -Wl,-rpath,"$fw" \
  "$here/hermes-run.cpp" -o /tmp/notion-qrcode-hermes
bun "$here/bundle.ts" /tmp/notion-qrcode-parity.js
/tmp/notion-qrcode-hermes /tmp/notion-qrcode-parity.js > /tmp/notion-qrcode-hermes.txt
css="$root/node_modules/react-native-skia/cpp/api/third_party"
clang++ -std=c++17 -O1 -I"$css" "$here/css-color.cpp" "$css/CSSColorParser.cpp" -o /tmp/notion-qrcode-css
grep '^color ' /tmp/notion-qrcode-hermes.txt | sed 's/^color //' | /tmp/notion-qrcode-css > /tmp/notion-qrcode-css.txt
{ grep -v '^color ' /tmp/notion-qrcode-hermes.txt; tail -1 /tmp/notion-qrcode-css.txt; } > "$here/reference.txt"
cat "$here/reference.txt"

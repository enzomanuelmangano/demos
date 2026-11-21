#!/bin/sh
# Runs parity.ts in the Hermes engine RN 0.88 ships (notion-qrcode's runner, hermes-run.cpp,
# built against the RN app's hermes-engine pod; HERMES_DESTROOT overrides it) and writes
# reference.txt for gpu/src/cherry_blossom_qrcode.rs's tests.
set -e
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../../node_modules" && pwd -P)/..
runner=/tmp/notion-qrcode-hermes
if [ ! -x "$runner" ]; then
  hermes=${HERMES_DESTROOT:-$root/ios/Pods/hermes-engine/destroot}
  fw="$hermes/Library/Frameworks/macosx"
  clang++ -std=c++20 -O1 -I"$hermes/include" -F"$fw" -framework hermesvm -Wl,-rpath,"$fw" \
    "$here/../notion-qrcode/hermes-run.cpp" -o "$runner"
fi
bun "$here/bundle.ts" /tmp/cherry-blossom-qrcode-parity.js
"$runner" /tmp/cherry-blossom-qrcode-parity.js > "$here/reference.txt"
cat "$here/reference.txt"

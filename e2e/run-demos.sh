#!/usr/bin/env bash
# Runs the per-demo agent-device scripts in e2e/demos against a running dev
# build, one at a time, and fails a demo when:
#   - its script diverges (agent-device test exits non-zero),
#   - the app logged a JS error or warning while it ran, or
#   - a line it declares with `# expect-log: <text>` never showed up.
#
# Usage: DEVICE="Demos Perf" SESSION=perf e2e/run-demos.sh [slug ...]
# The app must already be open on the home screen and connected to Metro.
set -uo pipefail

cd "$(dirname "$0")/.."
DEVICE="${DEVICE:-Demos Perf}"
# One agent-device session per simulator, so runs on several can overlap.
SESSION="${SESSION:-default}"
OUT="${OUT:-/tmp/demos-e2e/$SESSION}"
mkdir -p "$OUT"

UDID=$(xcrun simctl list devices booted -j |
  python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; print(next(x['udid'] for v in d.values() for x in v if x['name']==sys.argv[1]))" "$DEVICE")

if [ "$#" -gt 0 ]; then
  scripts=()
  for slug in "$@"; do scripts+=("e2e/demos/$slug.ad"); done
else
  scripts=(e2e/demos/*.ad)
fi

# Release the device from an interactive session of the same name; the app
# keeps running, so the loaded bundle survives.
agent-device close --session "$SESSION" >/dev/null 2>&1

pass=0
fail=0
for script in "${scripts[@]}"; do
  slug=$(basename "$script" .ad)
  log="$OUT/$slug.log"
  # The React Native JS console lands in the unified log under this subsystem.
  xcrun simctl spawn "$UDID" log stream --style compact --level debug \
    --predicate 'subsystem == "com.facebook.react.log"' >"$log" 2>/dev/null &
  stream=$!
  sleep 1

  agent-device test "$script" --platform ios --device "$DEVICE" --session "$SESSION" \
    --artifacts-dir "$OUT/artifacts/$slug" >"$OUT/$slug.test.txt" 2>&1
  status=$?
  sleep 1
  kill "$stream" 2>/dev/null
  wait "$stream" 2>/dev/null

  problems=()
  [ "$status" -ne 0 ] && problems+=("script diverged (see $OUT/$slug.test.txt)")
  errors=$(grep -E ' (E|Df|F) +Demos\[|\[com\.facebook\.react\.log:javascript\].*(Error|Exception|Warning)' "$log" | head -5)
  [ -n "$errors" ] && problems+=("JS errors: $errors")
  while IFS= read -r expected; do
    grep -qF -- "$expected" "$log" || problems+=("missing log: $expected")
  done < <(sed -n 's/^# expect-log: //p' "$script")

  if [ "${#problems[@]}" -eq 0 ]; then
    pass=$((pass + 1))
    echo "PASS $slug"
  else
    fail=$((fail + 1))
    echo "FAIL $slug"
    printf '     %s\n' "${problems[@]}"
  fi
done

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]

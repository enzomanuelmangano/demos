#!/usr/bin/env bash
# Runs the per-demo agent-device scripts in e2e/demos against a running dev
# build, one at a time, and fails a demo when:
#   - its script diverges (agent-device test exits non-zero),
#   - the app logged a JS error or warning while it ran, or
#   - a line it declares with `# expect-log: <text>` never showed up.
#
# Usage: DEVICE="iPhone 17 Pro" SESSION=e2e e2e/run-demos.sh [slug ...]
# The app must already be open on the home screen and connected to Metro.
set -uo pipefail

cd "$(dirname "$0")/.."
DEVICE="${DEVICE:?set DEVICE to the name of a booted iPhone 17 Pro simulator}"
# One agent-device session per simulator, so runs on several can overlap.
SESSION="${SESSION:-default}"
OUT="${OUT:-/tmp/demos-e2e/$SESSION}"
mkdir -p "$OUT"

for tool in agent-device python3 xcrun; do
  command -v "$tool" >/dev/null || { echo "missing $tool" >&2; exit 2; }
done

UDID=$(xcrun simctl list devices booted -j |
  python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; print(next((x['udid'] for v in d.values() for x in v if x['name']==sys.argv[1]), ''))" "$DEVICE")
[ -n "$UDID" ] || { echo "no booted simulator named \"$DEVICE\"" >&2; exit 2; }

stream=
cleanup() {
  [ -n "$stream" ] && kill "$stream" 2>/dev/null
  agent-device close --session "$SESSION" >/dev/null 2>&1
}
trap cleanup EXIT
trap 'exit 130' INT TERM

if [ "$#" -gt 0 ]; then
  scripts=()
  for slug in "$@"; do scripts+=("e2e/demos/$slug.ad"); done
else
  scripts=(e2e/demos/*.ad)
fi

# Release the device from an interactive session of the same name; the app
# keeps running, so the loaded bundle survives.
agent-device close --session "$SESSION" >/dev/null 2>&1

# Back to the home between demos: a script that diverged before its own
# close would leave its demo open, and every later deep link would stack on
# top of it. Presses the shell's Close button (id xmark, never a demo's own
# "Close") until none is left. `close` ends the session, not the app.
go_home() {
  if ! agent-device open com.reactiive.app --platform ios --udid "$UDID" \
    --session "$SESSION" >/dev/null 2>&1; then
    echo "warning: could not attach to the app to reset it" >&2
    return
  fi
  for _ in $(seq 1 15); do
    agent-device find 'id="xmark"' click --first --platform ios \
      --udid "$UDID" --session "$SESSION" >/dev/null 2>&1 || break
    sleep 1.5
  done
  agent-device close --session "$SESSION" >/dev/null 2>&1
}

go_home

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

  agent-device test "$script" --platform ios --udid "$UDID" --session "$SESSION" \
    --artifacts-dir "$OUT/artifacts/$slug" >"$OUT/$slug.test.txt" 2>&1
  status=$?
  # Let the last lines reach the file before the stream goes away.
  sleep 2
  kill "$stream" 2>/dev/null
  wait "$stream" 2>/dev/null
  stream=
  # After the stream: closing the demo must not count against it.
  go_home

  problems=()
  [ "$status" -ne 0 ] && problems+=("script diverged (see $OUT/$slug.test.txt)")
  # Compact style levels: I = console.log, Df = console.warn, E = console.error
  # and uncaught JS errors (red boxes), F = fault.
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

#!/bin/sh
# Reads the `[LAUNCH]` lines of a launch stress run (tools/launch-stress.md) from a log file and fails on the states
# that mean a shown demo would not pull closed or would close with no flight home.
# usage: tools/launch-stress-check.sh <log file>
log="${1:?usage: launch-stress-check.sh <log file>}"
lines=$(grep -E '\[LAUNCH(-FAULT)?\]' "$log")
count() { printf '%s\n' "$lines" | grep -c -E "$1"; }
adopted=$(count 'adopted for'); closed=$(count 'closes from'); grouped=$(count 'closes from .*, grouped')
bad=$(count 'LAUNCH-FAULT|opens ungrouped|pull refused')
echo "sessions $adopted, closes $closed (grouped $grouped), rescued re-taps $(count 'no icon touched'), bad $bad"
printf '%s\n' "$lines" | grep -E 'LAUNCH-FAULT|opens ungrouped|pull refused'
# One demo may still be open when the run stops.
[ "$bad" -eq 0 ] && [ $((adopted - closed)) -le 1 ] && [ "$closed" -eq "$grouped" ]

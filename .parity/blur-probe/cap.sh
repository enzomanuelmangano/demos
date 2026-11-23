#!/bin/sh
# cap.sh <out.png> <args…>: relaunches the probe with the args and screenshots it once the
# screen has settled (two captures 1 s apart identical; the launch fades in for ~3 s).
P=${PROBE_SIM:-CA7DC095-E628-4E18-A8CC-687844E129CF}
OUT=$1; shift
xcrun simctl launch --terminate-running-process $P com.reactiive.blurprobe -mode render "$@" >/dev/null
sleep 3
xcrun simctl io $P screenshot "$OUT.a.png" >/dev/null 2>&1
for i in 1 2 3 4 5 6 7 8; do
  sleep 1
  xcrun simctl io $P screenshot "$OUT" >/dev/null 2>&1
  if cmp -s "$OUT" "$OUT.a.png"; then rm -f "$OUT.a.png"; exit 0; fi
  mv "$OUT" "$OUT.a.png"
done
echo "unsettled: $OUT" >&2; mv "$OUT.a.png" "$OUT"

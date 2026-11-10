#!/bin/sh
# Side by side, RN (left) and Exact (right), for each slug: both apps on one simulator, each
# demo opened by its deep link, captured after it settles.
#   tools/compare.sh <slug>…      → /tmp/compare/<slug>.png and /tmp/compare/sheet.png
# Needs the RN dev build pointed at a running Metro (demos://) and the Exact build (demos-exact://).
U=${EXACT_SIM:-4287A1AF-1C48-462C-9E3D-3FAABC3F0119}
OUT=${OUT:-/tmp/compare}
WAIT=${WAIT:-4}
mkdir -p "$OUT"
for s in "$@"; do
  xcrun simctl openurl "$U" "demos://animations/$s"; sleep "$WAIT"
  xcrun simctl io "$U" screenshot "$OUT"/$s-rn.png >/dev/null 2>&1
  xcrun simctl openurl "$U" "demos-exact://demo/$s"; sleep "$WAIT"
  xcrun simctl io "$U" screenshot "$OUT"/$s-exact.png >/dev/null 2>&1
  xcrun simctl openurl "$U" "demos-exact://"; sleep 1
done
OUT="$OUT" python3 - "$@" <<'PY'
import sys, os
OUT = os.environ.get('OUT', '/tmp/compare')
from PIL import Image, ImageDraw
w, h = 300, 651
tiles = []
for s in sys.argv[1:]:
    t = Image.new('RGB', (w * 2 + 8, h + 18), (40, 40, 40))
    for i, k in enumerate(['rn', 'exact']):
        try:
            t.paste(Image.open(f'{OUT}/{s}-{k}.png').convert('RGB').resize((w, h)), (i * (w + 8), 18))
        except FileNotFoundError:
            pass
    ImageDraw.Draw(t).text((4, 3), f'{s}   RN | Exact', fill=(255, 255, 255))
    t.save(f'{OUT}/{s}.png'); tiles.append(t)
cols = 2
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (w * 2 + 16), rows * (h + 26)), (20, 20, 20))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % cols) * (w * 2 + 16), (i // cols) * (h + 26)))
sheet.save(f'{OUT}/sheet.png')
PY

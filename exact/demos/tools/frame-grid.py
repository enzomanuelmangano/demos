#!/usr/bin/env python3
"""Two recordings aligned on their first gesture event, sampled at the same offsets: RN on the
top row, Exact below. Usage:
  tools/frame-grid.py rn.mp4 <rn_t0_s> exact.mp4 <exact_t0_s> out.png <offset_s>…"""
import subprocess, sys, tempfile, os
from PIL import Image, ImageDraw

rn, t_rn, ex, t_ex, out = sys.argv[1], float(sys.argv[2]), sys.argv[3], float(sys.argv[4]), sys.argv[5]
offsets = [float(x) for x in sys.argv[6:]] or [0, 0.1, 0.2, 0.4, 0.8, 1.6]
W = 240
def frame(video, t):
    f = tempfile.mktemp(suffix='.png')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-ss', f'{max(0, t):.3f}', '-i', video, '-frames:v', '1', f], check=True)
    im = Image.open(f).convert('RGB'); os.remove(f)
    return im.resize((W, int(im.height * W / im.width)))
rows = [[frame(rn, t_rn + o) for o in offsets], [frame(ex, t_ex + o) for o in offsets]]
h = rows[0][0].height
grid = Image.new('RGB', (W * len(offsets), 2 * h + 40), (30, 30, 30))
d = ImageDraw.Draw(grid)
for i, o in enumerate(offsets):
    d.text((i * W + 4, 2), f'+{o:.2f}s', fill=(255, 255, 255))
    grid.paste(rows[0][i], (i * W, 20)); grid.paste(rows[1][i], (i * W, h + 40))
d.text((4, h + 24), 'Exact', fill=(255, 200, 0))
grid.save(out)

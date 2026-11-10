"""swipe-cards' translateX from a screenshot of the held front card (iPhone Air, 3x): the top
edge's slope is rotate = translateX / (w / 3) × π / 20 while |translateX| < w / 3 (140 pt).
  python3 card-tx.py <screenshot.png>"""
import math
import sys
import numpy as np
from PIL import Image

a = np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(int)
bg = a[1700, 30]
def top(x):
    for y in range(250, 900):
        if np.abs(a[y, x] - bg).max() > 12:
            return y
xs = list(range(640, 900, 20))
ys = [top(x) for x in xs]
theta = math.atan(np.polyfit(xs, ys, 1)[0])
print(f"{theta / (math.pi / 20) * 140:.1f}")

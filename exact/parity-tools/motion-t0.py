"""The first moment (s) a recording's region changes: where an A/B grid's t0 goes.
  python3 motion-t0.py <video.mp4> <x0> <y0> <x1> <y1> (normalised region) [threshold]"""
import sys
import cv2
import numpy as np

path = sys.argv[1]
x0, y0, x1, y1 = map(float, sys.argv[2:6])
thr = float(sys.argv[6]) if len(sys.argv) > 6 else 8.0
cap = cv2.VideoCapture(path)
fps = cap.get(cv2.CAP_PROP_FPS)
first = None
i = 0
while True:
    ok, f = cap.read()
    if not ok:
        break
    h, w = f.shape[:2]
    r = f[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)].astype(int)
    if first is None:
        first = r
    elif np.abs(r - first).max(axis=2).mean() > thr / 10 and np.abs(r - first).max() > thr * 4:
        print(f"{i / fps:.3f}")
        break
    i += 1

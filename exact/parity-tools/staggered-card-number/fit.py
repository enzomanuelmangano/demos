"""Fit each cell of an RN screenshot of staggered-card-number to the Rust surface's sweep.

The sweep: `SCN_SWEEP=<dir> cargo test -p demos-gpu staggered_card_number` writes p000…p100.rgb
(624 × 75, every cell at progress k / 100). For each cell of the RN capture (the row at window px
(138, 1369) on the iPhone Air), the progress whose render differs least, and that difference.
  python3 fit.py <sweep dir> <rn.png>…
"""
import sys
import numpy as np
from PIL import Image

W, H = 624, 75
sweep_dir = sys.argv[1]
sweep = np.stack([np.fromfile(f"{sweep_dir}/p{k:03d}.rgb", dtype=np.uint8).reshape(H, W, 3).astype(int) for k in range(101)])
cells = [i * 11 + 8 * (i // 4) for i in range(16)]
for path in sys.argv[2:]:
    rn = np.asarray(Image.open(path).convert("RGB")).astype(int)[1369:1369 + H, 138:138 + W]
    out = []
    for i, x in enumerate(cells):
        a = rn[:, x * 3:x * 3 + 33]
        d = np.abs(sweep[:, :, x * 3:x * 3 + 33] - a[None]).reshape(101, -1)
        k = int(np.argmin(d.max(axis=1) + d.mean(axis=1)))
        out.append(f"{i}:p{k/100:.2f} max{d[k].max()} mean{d[k].mean():.2f}")
    gap = np.abs(rn[:, 33 * 4:33 * 4 + 24] - 255).max()
    print(path.split('/')[-1], "gap", gap, " ".join(out))

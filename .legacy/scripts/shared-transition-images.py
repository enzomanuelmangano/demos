"""Derives the shared-transition demo's shipped images from its masters.

The masters (src/animations/shared-transition/assets/images/NN.jpg) are no
longer required by the app. expo-image shrinks an image larger than its view
with a CPU redraw on the main thread, so each shipped size is the smallest that
still covers its view on the largest supported phone (440pt wide, @3x):

  thumbnails/  grid cell NN, 210pt wide and (150 + 50 * (NN % 3))pt tall
               (screens/home)                  -> covers 630 x 450..750 px
  detail/      details header, 440 x 300pt     -> covers 1320 x 900 px

  python3 scripts/shared-transition-images.py          # write
  python3 scripts/shared-transition-images.py --check  # exit 1 on drift
"""

import glob
import os
import shutil
import sys

from PIL import Image

ROOT = os.path.join(
    os.path.dirname(__file__), '..', 'src', 'animations', 'shared-transition',
    'assets', 'images')


def targets(index):
    return {
        'thumbnails': (630, 3 * (150 + 50 * (index % 3))),
        'detail': (1320, 900),
    }


def target_size(size, cover):
    w, h = size
    scale = min(1, max(cover[0] / w, cover[1] / h))
    return round(w * scale), round(h * scale)


def main():
    check = '--check' in sys.argv
    drift = []
    for master in sorted(glob.glob(os.path.join(ROOT, '*.jpg'))):
        image = Image.open(master)
        index = int(os.path.splitext(os.path.basename(master))[0])
        for folder, cover in targets(index).items():
            out = os.path.join(ROOT, folder, os.path.basename(master))
            size = target_size(image.size, cover)
            if os.path.exists(out) and Image.open(out).size == size:
                continue  # re-encoding is not byte-stable; leave it alone
            if check:
                drift.append(out)
                continue
            os.makedirs(os.path.dirname(out), exist_ok=True)
            if size == image.size:
                shutil.copyfile(master, out)  # already small enough
                continue
            image.convert('RGB').resize(size, Image.LANCZOS).save(
                out, quality=85, optimize=True)
            print(f'{out}: {image.size} -> {size}')
    if drift:
        print('out of date:', *drift, sep='\n  ')
        sys.exit(1)


if __name__ == '__main__':
    main()

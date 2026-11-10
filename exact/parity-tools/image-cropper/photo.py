# image-cropper's bundled photo (exact/demos/gpu/images/image-cropper/), losslessly w.r.t. what
# RN samples: the JPEG the demo's useImage requests (Unsplash photo-1621996346565, w=2706: a
# 2706 x 2706 progressive JPEG tagged sRGB, as imgix serves it to NSURLSession's Accept */*),
# decoded as RN Skia decodes it (SkJpegCodec: libjpeg-turbo, JDCT_ISLOW, fancy upsampling,
# no colour conversion at decode). Pillow's decoder is the same libjpeg-turbo with the same
# defaults, so its RGB bytes are RN's texels (zune-jpeg, the crate's decoder, differs).
# Stored as `photo-<w>x<h>.rgb8up.zlib`: each row minus the row above, bytewise mod 256 (the
# first row as is), zlib level 9. Prints the decoded bytes' FNV-1a 64, which
# gpu/src/image_cropper.rs's test checks after inflating.
#
#   python3 exact/parity-tools/image-cropper/photo.py [path/to/the.jpg]
import os
import sys
import urllib.request
import zlib

import numpy as np
from PIL import Image

URL = ('https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?ixlib=rb-4.0.3&ixid='
       'M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2706&q=80')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'demos', 'gpu', 'images', 'image-cropper')


def fnv(data: bytes) -> str:
    h = 0xCBF29CE484222325
    for b in data:
        h = ((h ^ b) * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return f'0x{h:016x}'


def main() -> None:
    if len(sys.argv) > 1:
        src = sys.argv[1]
    else:
        src = '/tmp/image-cropper-photo.jpg'
        req = urllib.request.Request(URL, headers={'Accept': '*/*'})
        with urllib.request.urlopen(req) as r, open(src, 'wb') as f:
            f.write(r.read())
    image = Image.open(src)
    assert image.format == 'JPEG' and image.mode == 'RGB', (image.format, image.mode)
    w, h = image.size
    rgb = np.frombuffer(image.tobytes(), dtype=np.uint8).reshape(h, w * 3)
    up = rgb.copy()
    up[1:] = rgb[1:] - rgb[:-1]
    os.makedirs(OUT, exist_ok=True)
    name = f'photo-{w}x{h}.rgb8up.zlib'
    with open(os.path.join(OUT, name), 'wb') as f:
        f.write(zlib.compress(up.tobytes(), 9))
    print(name, w, h, fnv(rgb.tobytes()))


if __name__ == '__main__':
    main()

# light-on-painting's bundled pixels (exact/demos/gpu/images/light-on-painting/), from the RN
# demo's assets (src/animations/light-on-painting/assets), losslessly w.r.t. what RN samples:
#
# - the albedo: RN Skia decodes the JPEG (SkJpegCodec: libjpeg-turbo, JDCT_ISLOW, fancy
#   upsampling) and readPixels hands its RGBA8 bytes, unconverted, to an rgba8unorm texture.
#   Pillow's decoder is the same libjpeg-turbo with the same defaults, so its RGB bytes are
#   RN's texels (zune-jpeg, the crate's decoder, differs in 8 % of the bytes by up to 4).
#   Stored as `<id>-<w>x<h>.rgb8up.zlib`: each row minus the row above, bytewise mod 256 (the
#   first row as is), zlib level 9.
# - the surface field: the .bin's rgba16float half bits, which reach writeTexture untouched.
#   Stored as `<id>-surface-<w>x<h>.rgba16f.zlib`: each row minus the row above (u16 mod
#   65536), then per channel its high bytes and its low bytes as two planes, zlib level 9.
#
# It prints each file's FNV-1a 64 of the decoded bytes, which gpu/src/light_on_painting.rs's
# test checks after inflating.
#
#   python3 exact/parity-tools/light-on-painting-assets.py
import json
import os
import zlib

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
SRC = os.path.join(ROOT, 'src', 'animations', 'light-on-painting', 'assets')
OUT = os.path.join(ROOT, 'exact', 'demos', 'gpu', 'images', 'light-on-painting')


def fnv(data: bytes) -> str:
    h = 0xCBF29CE484222325
    for b in data:
        h = ((h ^ b) * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return f'0x{h:016x}'


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for pid in ['girl-with-a-pearl-earring', 'nighthawks']:
        image = Image.open(os.path.join(SRC, f'{pid}.jpg')).convert('RGB')
        w, h = image.size
        rgb = np.frombuffer(image.tobytes(), dtype=np.uint8).reshape(h, w * 3)
        up = rgb.copy()
        up[1:] = rgb[1:] - rgb[:-1]
        name = f'{pid}-{w}x{h}.rgb8up.zlib'
        with open(os.path.join(OUT, name), 'wb') as f:
            f.write(zlib.compress(up.tobytes(), 9))
        print(name, fnv(rgb.tobytes()))

        meta = json.load(open(os.path.join(SRC, f'{pid}-surface.json')))
        sw, sh = meta['width'], meta['height']
        raw = open(os.path.join(SRC, f'{pid}-surface.bin'), 'rb').read()
        field = np.frombuffer(raw, dtype='<u2').reshape(sh, sw, 4)
        delta = field.copy()
        delta[1:] = field[1:] - field[:-1]
        planes = b''.join(
            (delta[:, :, c] >> 8).astype(np.uint8).tobytes() + (delta[:, :, c] & 0xFF).astype(np.uint8).tobytes()
            for c in range(4)
        )
        name = f'{pid}-surface-{sw}x{sh}.rgba16f.zlib'
        with open(os.path.join(OUT, name), 'wb') as f:
            f.write(zlib.compress(planes, 9))
        print(name, fnv(raw))


if __name__ == '__main__':
    main()

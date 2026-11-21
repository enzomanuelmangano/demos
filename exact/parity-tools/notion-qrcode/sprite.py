# The demo's avatars-sprite.png (640 x 512, 8-bit RGBA, no colour profile: sRGB to Skia) as
# straight RGBA rows, zlib'd, for gpu/images/ (the surface inflates and premultiplies it as
# Skia's PNG decode does: round(c * a / 255)). Decoded here (zlib + PNG's row filters) so no
# image library is needed; prints the pixels' FNV-1a (32-bit).
#   python3 -I exact/parity-tools/notion-qrcode/sprite.py
import os, struct, zlib

here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, '../../../src/animations/notion-qrcode/avatars-sprite.png')
dst = os.path.join(here, '../../demos/gpu/images/notion-qrcode-avatars-640x512.rgba8.zlib')
data = open(src, 'rb').read()
i, idat, w, h = 8, b'', 0, 0
while i < len(data):
    n, kind = struct.unpack('>I4s', data[i:i + 8])
    chunk = data[i + 8:i + 8 + n]
    if kind == b'IHDR':
        w, h, depth, color, _, _, interlace = struct.unpack('>IIBBBBB', chunk)
        assert (depth, color, interlace) == (8, 6, 0)
    elif kind == b'IDAT':
        idat += chunk
    i += 12 + n
raw = zlib.decompress(idat)
bpp, stride = 4, w * 4
out, prev = bytearray(), bytearray(stride)
for y in range(h):
    f = raw[y * (stride + 1)]
    line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
    for x in range(stride):
        a = line[x - bpp] if x >= bpp else 0
        b = prev[x]
        c = prev[x - bpp] if x >= bpp else 0
        if f == 1:
            line[x] = (line[x] + a) & 255
        elif f == 2:
            line[x] = (line[x] + b) & 255
        elif f == 3:
            line[x] = (line[x] + ((a + b) >> 1)) & 255
        elif f == 4:
            pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
            line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
    out += line
    prev = line
h32 = 0x811C9DC5
for byte in out:
    h32 = ((h32 ^ byte) * 0x01000193) & 0xFFFFFFFF
open(dst, 'wb').write(zlib.compress(bytes(out), 9))
print(f'{w} x {h}, fnv {h32:08x}, {os.path.getsize(dst)} bytes')

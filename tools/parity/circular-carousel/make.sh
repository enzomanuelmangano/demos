#!/bin/sh
# The photos as RN shows them (demos/gpu/images/circular-carousel): each Unsplash JPEG (w=400)
# decoded by ImageIO (the iOS decoder; zune/libjpeg differ by ~1 level, in 8x8 blocks), and the
# 400 x 600 ones downscaled as expo-image does (89 x 134 pt at 3x: 267 x 402). RGB rows, zlib.
set -e
here=$(cd "$(dirname "$0")" && pwd)
img="$here/../../../gpu/images/circular-carousel"
swiftc -O "$here/decode.swift" -o /tmp/cc-decode
for spec in 01:400:250 02:400:267 03:400:250 04:267:402 05:400:250 06:400:250 07:267:402 08:400:267 09:267:402; do
  n=${spec%%:*}; wh=${spec#*:}; w=${wh%:*}; h=${wh#*:}
  /tmp/cc-decode "$img/$n.jpg" /tmp/cc-$n.rgb "$w" "$h"
  python3 -c "import zlib,sys; open(sys.argv[2],'wb').write(zlib.compress(open(sys.argv[1],'rb').read(),9))" /tmp/cc-$n.rgb "$img/$n-${w}x$h.rgb8.zlib"
done

#!/bin/sh
# The photos as RN shows them on an iPhone Air (1260 x 2736 px): RCTImageLoader decodes a photo
# larger than its cover size with ImageIO's thumbnail at that size (france, italy, iceland:
# 2736 px tall), and Core Animation shows it 1:1, centred; a smaller one (norway, japan) is
# decoded whole and scaled up. This writes, for each downscaled photo, ImageIO's decode cropped to
# the centre 1260 px plus 3 px each side (JPEG q97, 4:4:4) as <name>-<thumbWidth>-<cropX>.jpg;
# norway.jpg and japan.jpg are copied as they are. Needs swiftc and python3 with Pillow.
set -e
here=$(cd "$(dirname "$0")" && pwd)
src="$here/../../../assets/demos/dynamic-tab-indicator"
tmp=$(mktemp -d)
cat > "$tmp/thumb.swift" <<'SWIFT'
import Foundation
import ImageIO
import UniformTypeIdentifiers
let a = CommandLine.arguments
let s = CGImageSourceCreateWithURL(URL(fileURLWithPath: a[1]) as CFURL, nil)!
let o: [CFString: Any] = [kCGImageSourceThumbnailMaxPixelSize: Int(a[3])!,
  kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true]
let i = CGImageSourceCreateThumbnailAtIndex(s, 0, o as CFDictionary)!
let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[2]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(d, i, nil); CGImageDestinationFinalize(d)
SWIFT
swiftc -O "$tmp/thumb.swift" -o "$tmp/thumb"
rm -f "$here"/*.jpg
for n in france italy iceland; do
  "$tmp/thumb" "$src/$n.jpg" "$tmp/$n.png" 2736
  python3 - "$tmp/$n.png" "$here" "$n" <<'PY'
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
x0 = int((im.width - 1260) / 2) - 3
im.crop((x0, 0, x0 + 1266, im.height)).save(f'{sys.argv[2]}/{sys.argv[3]}-{im.width}-{x0}.jpg', quality=97, subsampling=0)
PY
done
cp "$src/norway.jpg" "$src/japan.jpg" "$here/"
rm -rf "$tmp"
ls -la "$here"

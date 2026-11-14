#!/bin/sh
# The chessboard demo's bitmaps and fonts, as RN shows them on an iPhone Air (3x).
# - pieces-sprite: react-native-chessboard's 768 x 256 sheet, drawn by Skia's <Atlas> (linear,
#   no mipmaps): its pixels as they are.
# - RN <Image>s (RCTImageLoader): a bitmap larger than its view's pixel size is decoded with
#   ImageIO's thumbnail at that size, then shown 1:1 by Core Animation: the capture trays' pieces
#   (16 pt: 48 px), the promotion dialog's (48 pt: 144 px), the avatars (40 pt: 120 px on the
#   cards, 34 pt: 102 px on the review card).
# Every bitmap is written straight-alpha RGBA8, zlib'd: <name>-<w>x<h>.rgba8.zlib.
# Fonts (gpu/fonts): the three bundled faces RN loads (assets/fonts) cut to Basic Latin, two
# Ionicons glyphs (and the first two with their digits tabular), and the two fallback faces CoreText picks for the review's ⌑ (Menlo-Bold) and ✕
# (ZapfDingbats) in the iOS 27.1 runtime. Needs swiftc, python3 with Pillow and fontTools (PY=),
# and the RN checkout (RN=, default the repo this app is in).
set -e
here=$(cd "$(dirname "$0")" && pwd)
rn=${RN:-"$here/../../../../.."}
lib="$rn/node_modules/react-native-chessboard/src/assets"
demo="$rn/src/animations/chessboard/assets"
fonts="$here/../../fonts"
PY=${PY:-python3}
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
rm -f "$here"/*.zlib
pack() { "$PY" - "$1" "$here" "$2" <<'PY'
import sys, zlib
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA')
open(f'{sys.argv[2]}/{sys.argv[3]}-{im.width}x{im.height}.rgba8.zlib', 'wb').write(zlib.compress(im.tobytes(), 9))
PY
}
pack "$lib/pieces-sprite.png" pieces-sprite
for c in w b; do for p in p n b r q; do
  "$tmp/thumb" "$lib/$c$p.png" "$tmp/t$c$p.png" 48; pack "$tmp/t$c$p.png" "tray-$c$p"
done; for p in q r b n; do
  "$tmp/thumb" "$lib/$c$p.png" "$tmp/d$c$p.png" 144; pack "$tmp/d$c$p.png" "promo-$c$p"
done; done
for n in lasker enzo; do for px in 120 102; do
  "$tmp/thumb" "$demo/avatar-$n.jpg" "$tmp/a$n$px.png" $px; pack "$tmp/a$n$px.png" "avatar-$n"
done; done
rt=$(xcrun simctl runtime list -v 2>/dev/null | grep "Bundle Path:.*iOS 27.1" | sed 's/.*Bundle Path: //')/Contents/Resources/RuntimeRoot/System/Library/Fonts
"$PY" - "$rn/assets/fonts" "$fonts" "$rn/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf" "$rt" <<'PY'
import sys
from fontTools import subset
from fontTools.ttLib import TTFont, TTCollection
src, out, ion, rt = sys.argv[1:5]
def cut(font, unicodes, path):
    o = subset.Options(); o.recalc_bounds = False; o.layout_features = ['*']; o.name_IDs = ['*']
    o.notdef_outline = True; o.drop_tables += ['trak']
    s = subset.Subsetter(o); s.populate(unicodes=unicodes); s.subset(font); font.save(path)
latin = list(range(0x20, 0x7F))
for name, file in [('SF-Pro-Rounded-Bold', 'sf-pro-rounded-bold-chessboard'), ('SF-Pro-Rounded-Heavy', 'sf-pro-rounded-heavy-chessboard'), ('SF-Compact-Rounded-Medium', 'sf-compact-rounded-medium-chessboard')]:
    cut(TTFont(f'{src}/{name}.otf', recalcBBoxes=False), latin, f'{out}/{file}.otf')
# fontVariant ['tabular-nums']: the faces again with the digits mapped to their tnum glyphs.
def tnum(path, out_path):
    f = TTFont(path, recalcBBoxes=False); g = f['GSUB'].table; m = {}
    for fr in g.FeatureList.FeatureRecord:
        if fr.FeatureTag == 'tnum':
            for li in fr.Feature.LookupListIndex:
                for st in g.LookupList.Lookup[li].SubTable:
                    m.update(getattr(st, 'mapping', None) or getattr(getattr(st, 'ExtSubTable', None), 'mapping', None) or {})
            break
    for t in f['cmap'].tables:
        for c, gn in list(t.cmap.items()):
            if gn in m: t.cmap[c] = m[gn]
    f.save(out_path)
for file in ['sf-pro-rounded-bold-chessboard', 'sf-compact-rounded-medium-chessboard']:
    tnum(f'{out}/{file}.otf', f'{out}/{file}-tnum.otf')
cut(TTFont(ion, recalcBBoxes=False), [0xF127, 0xF51A], f'{out}/ionicons-chessboard-subset.ttf')
menlo = [f for f in TTCollection(f'{rt}/CoreUI/Menlo.ttc').fonts if f['name'].getDebugName(6) == 'Menlo-Bold'][0]
cut(menlo, [0x2311], f'{out}/menlo-bold-chessboard-subset.ttf')
cut(TTFont(f'{rt}/Core/ZapfDingbats.ttf', recalcBBoxes=False), [0x2715], f'{out}/zapfdingbats-chessboard-subset.ttf')
PY
rm -rf "$tmp"
ls -la "$here" "$fonts"/*chessboard*

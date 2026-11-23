// drag-to-sort's nine emoji Texts (ListItem's iconText: fontSize 20, bold, white) as TextKit lays
// out and draws an RN Text (NSLayoutManager, usesFontLeading NO, lineFragmentPadding 0, the
// bold system font with Apple Color Emoji as its fallback), at 3x: each Text's box (its used
// rect, ceiled to the device pixel after an epsilon, as Yoga measures it) as premultiplied
// RGBA, zlib-compressed, with its size in points in the file name's header line.
//   swift tools/parity/drag-to-sort/emoji.swift <out dir>
// Output: <out>/emoji-<i>.rgba.zlib, and one line per emoji on stdout: i, width px, height px.
import AppKit
import Foundation

let out = CommandLine.arguments[1]
let emojis = ["🧘", "💻", "🏋️‍♀️", "📖", "😴", "🥗", "🚰", "🚶", "🎹"]
let scale: CGFloat = 3
for (i, e) in emojis.enumerated() {
  let storage = NSTextStorage(string: e, attributes: [
    .font: NSFont.systemFont(ofSize: 20, weight: .bold), .foregroundColor: NSColor.white,
  ])
  let lm = NSLayoutManager(); lm.usesFontLeading = false
  let tc = NSTextContainer(size: CGSize(width: 1000, height: 1000)); tc.lineFragmentPadding = 0
  lm.addTextContainer(tc); storage.addLayoutManager(lm)
  let range = lm.glyphRange(for: tc)
  let used = lm.usedRect(for: tc)
  let side = { (v: CGFloat) -> Int in Int((v * scale + 1e-4).rounded(.down)) + 1 }
  let (w, h) = (side(used.width), side(used.height))
  let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.translateBy(x: 0, y: CGFloat(h)); ctx.scaleBy(x: scale, y: -scale)
  NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: true)
  lm.drawGlyphs(forGlyphRange: range, at: .zero)
  NSGraphicsContext.current = nil
  let data = Data(bytes: ctx.data!, count: w * h * 4)
  let z = try! (data as NSData).compressed(using: .zlib) as Data
  // NSData's zlib is raw deflate: wrap it as a zlib stream (header, adler32).
  var adler: (UInt32, UInt32) = (1, 0)
  for b in data { adler.0 = (adler.0 + UInt32(b)) % 65521; adler.1 = (adler.1 + adler.0) % 65521 }
  var stream = Data([0x78, 0x9C]); stream.append(z)
  let a = (adler.1 << 16) | adler.0
  stream.append(contentsOf: [UInt8(a >> 24), UInt8((a >> 16) & 0xFF), UInt8((a >> 8) & 0xFF), UInt8(a & 0xFF)])
  try! stream.write(to: URL(fileURLWithPath: "\(out)/emoji-\(i)-\(w)x\(h).rgba.zlib"))
  print(i, w, h, used.width, used.height)
}

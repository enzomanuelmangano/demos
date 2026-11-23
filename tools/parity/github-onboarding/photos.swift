// github-onboarding's four photos as expo-image shows them (node_modules/expo-image/ios:
// ImageView.swift's load handler, Utils/ImageUtils.swift idealSize / shouldDownscale / resize),
// for the iPhone Air (window 420 pt wide, scale 3): each badge's image view is 0.6 × 420 − 2 × 10
// = 232 pt square, contentFit cover. idealSize is the photo aspect-filled to it, rounded up to
// whole points; a photo is downscaled only when it is larger than that at scale 3 on both sides:
//   02.jpg 1080 × 1549: (232, 332.74) → (232, 333) pt, 696 × 999 px < 1080 × 1549: resized by
//     UIGraphicsImageRenderer (here CoreGraphics on the Mac: an 8-bit sRGB bitmap, default
//     interpolation; not UIKit's renderer bit for bit, which may keep extended range);
//   01.jpg 640 × 853, 03.jpg 640 × 896, 04.jpg 640 × 960: 696 px wide wanted, 640 < 696: kept.
// Decoded by ImageIO (what SDWebImage decodes with on iOS), its own bytes (no colour matching).
// Stored as `<name>-<w>x<h>.rgb8up.zlib`: RGB rows, each minus the row above bytewise (the first
// as is), zlib (see tools/parity/image-cropper/photo.py).
//   swift tools/parity/github-onboarding/photos.swift <src/animations/github-onboarding/assets> <out dir>
import CoreGraphics
import Foundation
import ImageIO

let args = CommandLine.arguments
let (src, out) = (args[1], args[2])

func decode(_ name: String) -> CGImage {
  let s = CGImageSourceCreateWithURL(URL(fileURLWithPath: "\(src)/\(name)") as CFURL, nil)!
  return CGImageSourceCreateImageAtIndex(s, 0, nil)!
}

/// The image's own decoded bytes as RGB rows (no colour conversion).
func rgb(_ image: CGImage) -> [UInt8] {
  let data = image.dataProvider!.data! as Data
  let (w, h, bpr, bpp) = (image.width, image.height, image.bytesPerRow, image.bitsPerPixel / 8)
  precondition(image.bitsPerComponent == 8 && bpp >= 3, "unexpected layout \(image.bitsPerPixel)")
  let first = image.alphaInfo == .first || image.alphaInfo == .premultipliedFirst || image.alphaInfo == .noneSkipFirst
  var out = [UInt8](); out.reserveCapacity(w * h * 3)
  data.withUnsafeBytes { (p: UnsafeRawBufferPointer) in
    for y in 0..<h { for x in 0..<w {
      let o = y * bpr + x * bpp + (first && bpp == 4 ? 1 : 0)
      out.append(p[o]); out.append(p[o + 1]); out.append(p[o + 2])
    } }
  }
  return out
}

/// `image` drawn into a w × h 8-bit sRGB bitmap (UIGraphicsImageRenderer's draw(in:)).
func resized(_ image: CGImage, _ w: Int, _ h: Int) -> [UInt8] {
  let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.interpolationQuality = .default
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
  let d = ctx.data!.assumingMemoryBound(to: UInt8.self)
  var out = [UInt8](); out.reserveCapacity(w * h * 3)
  for i in 0..<(w * h) { out.append(d[i * 4]); out.append(d[i * 4 + 1]); out.append(d[i * 4 + 2]) }
  return out
}

func write(_ name: String, _ w: Int, _ h: Int, _ px: [UInt8]) {
  var up = px
  let row = w * 3
  for i in stride(from: px.count - 1, through: row, by: -1) { up[i] = px[i] &- px[i - row] }
  let raw = URL(fileURLWithPath: "/tmp/go-\(name).raw")
  try! Data(up).write(to: raw)
  let p = Process()
  p.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
  p.arguments = ["-c", "import sys,zlib; open(sys.argv[2],'wb').write(zlib.compress(open(sys.argv[1],'rb').read(), 9))",
                 raw.path, "\(out)/\(name)-\(w)x\(h).rgb8up.zlib"]
  try! p.run(); p.waitUntilExit()
  try? FileManager.default.removeItem(at: raw)
  var h64: UInt64 = 0xcbf29ce484222325
  for b in px { h64 = (h64 ^ UInt64(b)) &* 0x100000001b3 }
  print(name, w, h, String(format: "fnv 0x%016llx", h64), image(name))
}
func image(_ n: String) -> String { n }

let two = decode("02.jpg")
print("02 source", two.width, two.height, two.colorSpace?.name ?? "none" as CFString)
write("02", 696, 999, resized(two, 696, 999))
for name in ["01", "03", "04"] {
  let i = decode("\(name).jpg")
  print(name, "source", i.colorSpace?.name ?? "none" as CFString, i.bitsPerPixel, i.alphaInfo.rawValue)
  write(name, i.width, i.height, rgb(i))
}

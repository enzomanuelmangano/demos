// The parallax logo as expo-image shows it (node_modules/expo-image/ios: ImageView.swift
// processImage, Utils/ImageUtils.swift idealSize / resize): logo.png (1024 × 842, scale 1) in a
// 200² view, contentFit contain: idealSize 200 × 164.453 rounded up to whole points (200, 165),
// downscaled because 1024 > 600 and 842 > 495 px, by UIGraphicsImageRenderer(size: 200 × 165,
// scale 3) drawing it into 600 × 495 px. Core Animation then shows that bitmap in the 200 ×
// 164.453 frame with trilinear minification. Here CoreGraphics on the Mac does the draw (ImageIO
// decode, an 8-bit sRGB premultiplied bitmap, default interpolation); the logo is one colour, so
// only its alpha is kept.
//   swift logo.swift <logo.png> <out.a8>   (600 × 495 alpha rows, top first)
import CoreGraphics
import Foundation
import ImageIO

let args = CommandLine.arguments
let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil)!
let image = CGImageSourceCreateImageAtIndex(src, 0, nil)!
let (w, h) = (600, 495)
let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.interpolationQuality = .default
ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
let data = ctx.data!.assumingMemoryBound(to: UInt8.self)
var a = [UInt8]()
a.reserveCapacity(w * h)
for i in 0..<(w * h) { a.append(data[i * 4 + 3]) }
try! Data(a).write(to: URL(fileURLWithPath: args[2]))

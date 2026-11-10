// The list's photo as expo-image shows it (node_modules/expo-image/ios: ImageView.swift
// processImage, Utils/ImageUtils.swift idealSize / resize): the Unsplash JPEG RN requests (w=200:
// 200 × 300, SDWebImage's Accept "image/*,*/*;q=0.8", so imgix's auto=format serves JPEG) in a
// 55.333 pt square view (Yoga's rounded 55.25), contentFit cover: idealSize (55.333, 83) rounded
// up to whole points (56, 83), downscaled because 200 > 166 and 300 > 166 px, by
// UIGraphicsImageRenderer(size: 56 × 83, scale 3) drawing it into 168 × 249 px. Here CoreGraphics
// on the Mac does that draw (ImageIO decode, an 8-bit sRGB bitmap, default interpolation): not
// UIKit's renderer bit for bit.
//   swift resize-photo.swift <photo.jpg> <out.rgb>   (168 × 249 RGB rows)
import CoreGraphics
import Foundation
import ImageIO

let args = CommandLine.arguments
let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil)!
let image = CGImageSourceCreateImageAtIndex(src, 0, nil)!
let (w, h) = (168, 249)
let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.interpolationQuality = .default
ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
let data = ctx.data!.assumingMemoryBound(to: UInt8.self)
var rgb = [UInt8]()
rgb.reserveCapacity(w * h * 3)
for i in 0..<(w * h) {
  rgb.append(data[i * 4]); rgb.append(data[i * 4 + 1]); rgb.append(data[i * 4 + 2])
}
try! Data(rgb).write(to: URL(fileURLWithPath: args[2]))

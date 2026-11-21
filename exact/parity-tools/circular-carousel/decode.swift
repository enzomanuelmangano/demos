// ImageIO decode of a JPEG drawn into w x h px (8-bit sRGB, default interpolation): w x h equal
// to the JPEG is its decode; smaller is expo-image's resize (UIGraphicsImageRenderer draw(in:)).
import CoreGraphics
import Foundation
import ImageIO
let a = CommandLine.arguments
let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: a[1]) as CFURL, nil)!
let image = CGImageSourceCreateImageAtIndex(src, 0, nil)!
let (w, h) = (Int(a[3])!, Int(a[4])!)
let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
  space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.interpolationQuality = .default
ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
let d = ctx.data!.assumingMemoryBound(to: UInt8.self)
var rgb = [UInt8](); rgb.reserveCapacity(w * h * 3)
for i in 0..<(w * h) { rgb.append(d[i*4]); rgb.append(d[i*4+1]); rgb.append(d[i*4+2]) }
try! Data(rgb).write(to: URL(fileURLWithPath: a[2]))

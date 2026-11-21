// Packs the home's wallpaper and the 109 icons as raw pixels, LZ4-compressed, into assets/art-pack.bin.
//
//   swift tools/gen-art-pack.swift          (macOS; run it after tools/gen-demos.ts changes the icons or their order)
//
// Why: the first PNG a process decodes pays ImageIO's one-time setup (~35 ms of the home's first commit on the
// simulator), and every icon after it ~0.7 ms. A pack entry is a memory-mapped read and an LZ4 block (~0.05 ms), so
// StillArt.swift has the home's artwork without ImageIO. The pixels are what the PNG decodes to (same colour space,
// premultiplied BGRA for the icons, 8-bit gray for the wallpaper), so the home looks the same. The entries are in
// the home's order (the wallpaper, then demos.contract's), so the first page is decoded first. The PNGs stay:
// StillArt falls back to them for a file the pack lacks, and the other hosts read them.
//
// Layout: "ART1", u32 header length, a JSON header [{file, w, h, kind: "gray"|"bgra", space, offset, size, raw}], then
// the blobs (offsets from the end of the header).
import Compression
import CoreGraphics
import Foundation
import ImageIO

let app = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : FileManager.default.currentDirectoryPath)
var files = ["assets/home-wallpaper.png"]
let contract = try String(contentsOf: app.appendingPathComponent("demos.contract"), encoding: .utf8)
let rx = try NSRegularExpression(pattern: "icon=\"(assets/app-icons/[^\"]+\\.png)\"")
for m in rx.matches(in: contract, range: NSRange(contract.startIndex..., in: contract)) {
    files.append(String(contract[Range(m.range(at: 1), in: contract)!]))
}

var header: [[String: Any]] = []
var blobs = Data()
var rawTotal = 0
for file in files {
    let url = app.appendingPathComponent(file)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
        FileHandle.standardError.write(Data("cannot read \(file)\n".utf8)); exit(1)
    }
    let w = img.width, h = img.height
    let gray = img.colorSpace?.model == .monochrome
    let space = img.colorSpace?.name as String? ?? (gray ? "kCGColorSpaceGenericGrayGamma2_2" : "kCGColorSpaceSRGB")
    let cs = CGColorSpace(name: space as CFString) ?? (gray ? CGColorSpaceCreateDeviceGray() : CGColorSpace(name: CGColorSpace.sRGB)!)
    let rowBytes = gray ? w : w * 4
    var pixels = [UInt8](repeating: 0, count: rowBytes * h)
    pixels.withUnsafeMutableBytes { buf in
        let info = gray ? CGImageAlphaInfo.none.rawValue : CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
        let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: rowBytes, space: cs, bitmapInfo: info)!
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    }
    var packed = [UInt8](repeating: 0, count: pixels.count + 4096)
    let n = compression_encode_buffer(&packed, packed.count, pixels, pixels.count, nil, COMPRESSION_LZ4)
    guard n > 0 else { FileHandle.standardError.write(Data("cannot pack \(file)\n".utf8)); exit(1) }
    header.append(["file": file, "w": w, "h": h, "kind": gray ? "gray" : "bgra", "space": space, "offset": blobs.count, "size": n, "raw": pixels.count])
    blobs.append(contentsOf: packed[0..<n])
    rawTotal += pixels.count
}
let json = try JSONSerialization.data(withJSONObject: header, options: [.sortedKeys])
var out = Data("ART1".utf8)
var len = UInt32(json.count).littleEndian
out.append(Data(bytes: &len, count: 4))
out.append(json)
out.append(blobs)
try out.write(to: app.appendingPathComponent("assets/art-pack.bin"))
print("packed \(files.count) files: \(rawTotal / 1024) KB raw -> \(out.count / 1024) KB")

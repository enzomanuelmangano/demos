// The advances RN Skia's getGlyphWidths returns on iOS for sculptures-in-words' paragraph font:
// SkTypeface_Mac from data (a CTFont at size 0: 12 pt, optical size "auto") and the strike's
// SkCTFontCreateExactCopy at the text size with NSCTFontOpticalSizeAttribute 12 (the base
// font's size, its attribute not being a number) and no tracking.
//   swiftc -O advances-ct.swift -o advances-ct && ./advances-ct Newsreader.ttf 15.64 <ids,…>
// Prints per glyph id: the id, the f64 advance, the f32 bits Skia keeps.
import CoreText
import Foundation
let data = try! Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])) as CFData
let size = Double(Float(CommandLine.arguments[2])!)
let desc = CTFontManagerCreateFontDescriptorFromData(data)!
let base = CTFontCreateWithFontDescriptor(desc, 0, nil)
let attrs: [String: Any] = ["NSCTFontOpticalSizeAttribute": CTFontGetSize(base), "NSCTFontUnscaledTrackingAttribute": 0]
let d2 = CTFontDescriptorCreateWithAttributes(attrs as CFDictionary)
let font = CTFontCreateCopyWithAttributes(base, size, nil, d2)
for s in CommandLine.arguments[3].split(separator: ",") {
  var g = CGGlyph(UInt16(s)!)
  var adv = CGSize.zero
  CTFontGetAdvancesForGlyphs(font, .horizontal, &g, &adv, 1)
  print(g, String(format: "%.17g", adv.width), Float(adv.width).bitPattern)
}

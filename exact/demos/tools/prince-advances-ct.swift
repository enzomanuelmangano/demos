// Core Text's advances for the-little-prince's page font (RN Skia's getGlyphWidths on iOS: a
// CTFont from Newsreader.ttf at 30, optical size "none" as Skia's SkCTFontCreateExactCopy sets
// it), the reference gpu/src/the_little_prince.rs advances_are_core_texts checks:
//   swiftc -O tools/prince-advances-ct.swift -o /tmp/pct && /tmp/pct \
//     ../../src/animations/text-image-morph/assets/Newsreader.ttf <file with the page's text>
// Prints per character: code point, the f64 advance, the f32 bits Skia keeps.
import CoreText
import Foundation
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let data = try! Data(contentsOf: url) as CFData
let desc = CTFontManagerCreateFontDescriptorFromData(data)!
// Skia's SkCTFontCreateExactCopy with no opsz variation: optical size "none".
let attrs: [String: Any] = ["NSCTFontOpticalSizeAttribute": "none"]
let d2 = CTFontDescriptorCreateCopyWithAttributes(desc, attrs as CFDictionary)
let font = CTFontCreateWithFontDescriptor(d2, 30, nil)
let text = try! String(contentsOfFile: CommandLine.arguments[2], encoding: .utf8)
var seen = Set<Character>()
for ch in text where ch != "\n" && !seen.contains(ch) {
  seen.insert(ch)
  var u = Array(String(ch).utf16); var g = [CGGlyph](repeating: 0, count: u.count)
  CTFontGetGlyphsForCharacters(font, &u, &g, u.count)
  var adv = CGSize.zero
  CTFontGetAdvancesForGlyphs(font, .horizontal, &g, &adv, 1)
  print(String(ch).unicodeScalars.first!.value, String(format: "%.17g", adv.width), Float(adv.width).bitPattern)
}

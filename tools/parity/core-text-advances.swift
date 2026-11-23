// Core Text advances of a font at 30 pt, per character: `none` (optical size none), `default`
// (Core Text's automatic optical size) or a number (the opsz variation). The table in
// exact/demos/gpu/src/the_little_prince.rs is `<Newsreader.ttf> 12 <the page's characters>`.
//   swiftc -O core-text-advances.swift -o /tmp/cta && /tmp/cta <font> <mode> <characters>
import CoreText
import Foundation
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let data = try! Data(contentsOf: url) as CFData
let desc = CTFontManagerCreateFontDescriptorFromData(data)!
let mode = CommandLine.arguments[2]
var d = desc
if mode == "none" { d = CTFontDescriptorCreateCopyWithAttributes(desc, ["NSCTFontOpticalSizeAttribute": "none"] as CFDictionary) }
if let v = Double(mode) { d = CTFontDescriptorCreateCopyWithAttributes(desc, [kCTFontVariationAttribute as String: [0x6F70737A: v]] as CFDictionary) }
let font = CTFontCreateWithFontDescriptor(d, 30, nil)
for ch in CommandLine.arguments[3] {
  var u = Array(String(ch).utf16); var g = [CGGlyph](repeating: 0, count: u.count)
  CTFontGetGlyphsForCharacters(font, &u, &g, u.count)
  var adv = CGSize.zero
  CTFontGetAdvancesForGlyphs(font, .horizontal, &g, &adv, 1)
  print(String(ch), String(format: "%.6f", adv.width))
}

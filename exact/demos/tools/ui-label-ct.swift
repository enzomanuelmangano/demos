// Core Text's layout of the atlas-button label (an RN <Text>: System 20 bold) on macOS, the
// reference gpu/src/atlas_button.rs the_label_is_laid_out_as_uikit checks:
//   swiftc -O tools/ui-label-ct.swift -o /tmp/ui-label-ct && /tmp/ui-label-ct
import AppKit
import CoreText
// An RN <Text> "React Native", System 20 bold, as Core Text lays it out (macOS's SFNS.ttf).
let font = NSFont.systemFont(ofSize: 20, weight: .bold) as CTFont
let attr = NSAttributedString(string: "React Native", attributes: [.font: font])
let line = CTLineCreateWithAttributedString(attr)
var asc: CGFloat = 0, desc: CGFloat = 0, lead: CGFloat = 0
let w = CTLineGetTypographicBounds(line, &asc, &desc, &lead)
print("width", w, "ascent", asc, "descent", desc, "leading", lead)
print("font ascent", CTFontGetAscent(font), "descent", CTFontGetDescent(font), "leading", CTFontGetLeading(font))
for run in CTLineGetGlyphRuns(line) as! [CTRun] {
  let n = CTRunGetGlyphCount(run)
  var pos = [CGPoint](repeating: .zero, count: n)
  CTRunGetPositions(run, CFRange(location: 0, length: n), &pos)
  print(pos.map { String(format: "%.4f", $0.x) }.joined(separator: " "))
}
let tf = NSTextField(labelWithString: "React Native"); tf.font = NSFont.systemFont(ofSize: 20, weight: .bold)
print("label fitting", tf.fittingSize)

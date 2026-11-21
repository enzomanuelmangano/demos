// How TextKit lays out an RN <Text numberOfLines={n}> (RCTTextLayoutManager: NSTextContainer of
// the frame's width, lineFragmentPadding 0, lineBreakMode byTruncatingTail when n > 0,
// maximumNumberOfLines n; NSLayoutManager usesFontLeading NO), on the Mac's AppKit TextKit with
// the Mac's San Francisco: each line's characters, the truncation, the used widths.
//   swift textkit-lines.swift <size> <weight: regular|bold> <width> <maxLines> <text>
import AppKit

let a = CommandLine.arguments
let size = CGFloat(Double(a[1])!)
let font = NSFont.systemFont(ofSize: size, weight: a[2] == "bold" ? .bold : .regular)
let width = CGFloat(Double(a[3])!)
let maxLines = Int(a[4])!
let text = a[5]
let storage = NSTextStorage(string: text, attributes: [.font: font])
let container = NSTextContainer(size: CGSize(width: width, height: .greatestFiniteMagnitude))
container.lineFragmentPadding = 0
container.lineBreakMode = maxLines > 0 ? .byTruncatingTail : .byClipping
container.maximumNumberOfLines = maxLines
let lm = NSLayoutManager()
lm.usesFontLeading = false
lm.addTextContainer(container)
storage.addLayoutManager(lm)
lm.ensureLayout(for: container)
let glyphs = lm.glyphRange(for: container)
lm.enumerateLineFragments(forGlyphRange: glyphs) { rect, used, _, range, _ in
  let chars = lm.characterRange(forGlyphRange: range, actualGlyphRange: nil)
  let s = (text as NSString).substring(with: chars)
  let trunc = lm.truncatedGlyphRange(inLineFragmentForGlyphAt: range.location)
  var shown = s
  if trunc.location != NSNotFound {
    let tc = lm.characterRange(forGlyphRange: trunc, actualGlyphRange: nil)
    shown = (text as NSString).substring(with: NSRange(location: chars.location, length: tc.location - chars.location)) + "…"
  }
  print(String(format: "line y %.4f h %.4f used w %.4f | %@", rect.origin.y, rect.height, used.width, shown))
  if trunc.location != NSNotFound {
    let loc = lm.location(forGlyphAt: trunc.location)
    print(String(format: "  truncated at glyph %d, x %.4f", trunc.location, loc.x))
  }
}
print(String(format: "used %.4f x %.4f", lm.usedRect(for: container).width, lm.usedRect(for: container).height))

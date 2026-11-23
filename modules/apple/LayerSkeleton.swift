// "Show layers" in the shake sheet: a skeleton over the open demo that says who draws each region.
// Contract: the boxes, text and images the Contract lays out (the host's plain UIKit nodes).
// Rust: a GPU canvas (the Metal layer a gpu/src surface renders into).
// Native: a Swift module's view (every view of `DemosModule.views`, tagged when it is made).
// One walk of the view tree when it opens, one drawing pass into a single layer, then nothing
// runs: no display link, no timers, no observers. Tap it, or shake again, to take it away.
import Foundation
#if os(iOS)
import UIKit

enum LayerSkeleton {
    enum Kind: Int, CaseIterable {
        case contract, rust, native

        var title: String { ["Contract", "Rust", "Native"][rawValue] }
        var symbol: String { ["doc.text", "cpu", "iphone"][rawValue] }
        // The same hues as the "How it's built" card.
        var color: UIColor { [UIColor.systemBlue, .systemOrange, .systemGreen][rawValue] }
    }

    private static let names = NSMapTable<UIView, NSString>.weakToStrongObjects()
    private static weak var current: SkeletonView?

    /// A native module's view is named when its factory makes it: the view tree carries no tag name.
    static func tag(_ view: UIView, _ name: String) { names.setObject(name as NSString, forKey: view) }

    /// Takes the overlay away if it is up; true when there was one.
    @discardableResult
    static func dismiss() -> Bool {
        guard let overlay = current else { return false }
        current = nil
        guard !UIAccessibility.isReduceMotionEnabled else { overlay.removeFromSuperview(); return true }
        UIView.animate(withDuration: 0.12, delay: 0, options: [.curveEaseIn, .allowUserInteraction]) {
            overlay.alpha = 0
        } completion: { _ in overlay.removeFromSuperview() }
        return true
    }

    static func show(card: DemoCardView, window: UIWindow, slug: String) {
        dismiss()
        var responder: UIResponder? = card.next
        while let r = responder, !(r is UIViewController) { responder = r.next }
        let root = (responder as? UIViewController)?.view ?? window
        let found = collect(root: root, window: window)
        let overlay = SkeletonView(frame: window.bounds, boxes: found.boxes, canvases: found.canvases,
                                   rust: DemoArchitecture.bySlug[slug]?.rustFiles.map(\.name) ?? [],
                                   bottomInset: window.safeAreaInsets.bottom)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.addSubview(overlay)
        current = overlay
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        overlay.alpha = 0
        UIView.animate(withDuration: 0.16, delay: 0, options: [.curveEaseOut, .allowUserInteraction]) { overlay.alpha = 1 }
    }

    // MARK: The walk

    struct Box { var rect: CGRect; var kind: Kind; var label: String; var radius: CGFloat }

    private struct Entry { let view: UIView; let clip: CGRect; let parent: CGRect?; let parentKind: Kind? }

    private static let maxBoxes = 60, maxSpecial = 30, maxVisits = 3000

    /// Breadth first, so the outermost boxes come first. `canvases` indexes the Rust boxes in `boxes`.
    private static func collect(root: UIView, window: UIWindow) -> (boxes: [Box], canvases: [Int]) {
        var contract: [Box] = [], special: [Box] = []
        var queue = [Entry(view: root, clip: window.bounds, parent: nil, parentKind: nil)]
        var head = 0
        while head < queue.count, head < maxVisits {
            let e = queue[head]; head += 1
            let v = e.view
            if v.isHidden || v.alpha < 0.02 || v is DemoCardView { continue }
            let rect = v.convert(v.bounds, to: window)
            let seen = rect.intersection(e.clip)
            let clips = v.clipsToBounds
            if clips && (seen.isNull || seen.isEmpty) { continue }

            var kind = Kind.contract, label = "Contract"
            if let name = names.object(forKey: v) as String? ?? fallbackName(v) {
                kind = .native; label = "Native · \(name)"
            } else if isCanvas(v) {
                kind = .rust; label = "Rust"
            }

            if kind != .contract {
                if special.count < maxSpecial, seen.width >= 8, seen.height >= 8 {
                    special.append(Box(rect: seen, kind: kind, label: label, radius: radius(v, seen)))
                }
                continue
            }

            var parent = e.parent, parentKind = e.parentKind
            if seen.width >= 4, seen.height >= 4, !seen.isNull, hasContent(v) {
                // A box that sits exactly on the one that holds it adds no outline.
                if let p = parent, parentKind == .contract, near(p, seen) {
                } else {
                    if contract.count < maxBoxes { contract.append(Box(rect: seen, kind: .contract, label: label, radius: radius(v, seen))) }
                    parent = seen; parentKind = .contract
                }
            }
            let clip = clips ? seen : e.clip
            for sub in v.subviews { queue.append(Entry(view: sub, clip: clip, parent: parent, parentKind: parentKind)) }
        }
        // A box that a canvas or native view sits exactly on is that view's, not the Contract's.
        contract.removeAll { c in special.contains { near($0.rect, c.rect) } }
        let kept = Array(contract.prefix(maxBoxes - special.count))
        let all = kept + special
        return (all, all.indices.filter { all[$0].kind == .rust })
    }

    private static func near(_ a: CGRect, _ b: CGRect) -> Bool {
        abs(a.minX - b.minX) < 1.5 && abs(a.minY - b.minY) < 1.5 && abs(a.maxX - b.maxX) < 1.5 && abs(a.maxY - b.maxY) < 1.5
    }

    private static func radius(_ v: UIView, _ rect: CGRect) -> CGFloat {
        min(v.layer.cornerRadius, rect.width / 2, rect.height / 2)
    }

    /// A GPU canvas: the view that holds the Metal layer a Rust surface renders into.
    private static func isCanvas(_ v: UIView) -> Bool {
        if v.layer is CAMetalLayer { return true }
        guard let subs = v.layer.sublayers else { return false }
        return subs.contains { $0 is CAMetalLayer }
    }

    /// Views of the app's own module that were not tagged (a reused one made before the tag existed).
    private static func fallbackName(_ v: UIView) -> String? {
        switch v {
        case is GlassPaneView: return "glass-pane"
        case is VariableBlurView: return "variable-blur"
        case is MusicTabBarHost: return "music-tabbar"
        case is AudioTrackView: return "audio-track"
        default: return String(describing: type(of: v)).contains("HostingView") ? "SwiftUI" : nil
        }
    }

    /// Whether the view paints something itself: a fill, a border, a shadow, text or an image.
    private static func hasContent(_ v: UIView) -> Bool {
        if v is UILabel || v is UIImageView || v is UITextView || v is UITextField || v is UIControl { return true }
        let layer = v.layer
        if layer.contents != nil { return true }
        if let c = layer.backgroundColor, c.alpha > 0.01 { return true }
        if layer.borderWidth > 0, let c = layer.borderColor, c.alpha > 0.01 { return true }
        if layer.shadowOpacity > 0.01, let c = layer.shadowColor, c.alpha > 0.01 { return true }
        for sub in layer.sublayers ?? [] where !sub.isHidden {
            // A subview's own layer is that view's to say.
            if let d = sub.delegate as? UIView, d !== v { continue }
            if type(of: sub) != CALayer.self || sub.contents != nil || sub.backgroundColor != nil || sub.borderWidth > 0 { return true }
        }
        // A text node paints through its parent's layer tree; it is the one leaf that speaks to accessibility.
        return v.subviews.isEmpty && v.isAccessibilityElement
    }
}

// MARK: - The overlay

private final class SkeletonView: UIView {
    private struct Pill { let rect: CGRect; let text: String; let kind: LayerSkeleton.Kind }

    private let boxes: [LayerSkeleton.Box]
    private var pills: [Pill] = []
    private let legend: CGRect
    private let startSize: CGSize

    private static let pillFont = UIFont.systemFont(ofSize: 9, weight: .semibold)
    private static let legendFont = UIFont.systemFont(ofSize: 12, weight: .semibold)
    private static let hintFont = UIFont.systemFont(ofSize: 10, weight: .medium)
    private static let pillHeight: CGFloat = 15
    private static let legendHeight: CGFloat = 52
    private static let legendIcon: CGFloat = 14
    private static let legendGap: CGFloat = 16

    init(frame: CGRect, boxes: [LayerSkeleton.Box], canvases: [Int], rust: [String], bottomInset: CGFloat) {
        // Drawn contract first, so a canvas or native outline lies over what it covers.
        var named = boxes
        for (n, i) in canvases.enumerated() {
            let file = rust.count == canvases.count ? rust[n] : (rust.count == 1 ? rust[0] : nil)
            if let file { named[i].label = "Rust · " + file.replacingOccurrences(of: ".rs", with: "") }
        }
        self.boxes = LayerSkeleton.Kind.allCases.flatMap { k in named.filter { $0.kind == k } }
        startSize = frame.size
        let width = Self.legendWidth()
        legend = CGRect(x: (frame.width - width) / 2, y: frame.height - max(bottomInset, 12) - 12 - Self.legendHeight,
                        width: width, height: Self.legendHeight)
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = false
        isMultipleTouchEnabled = false
        isAccessibilityElement = true
        accessibilityLabel = "Layers: Contract, Rust and Native. Tap to dismiss."
        accessibilityTraits = .button
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped)))
        pills = placePills(in: frame)
    }

    required init?(coder: NSCoder) { nil }

    @objc private func tapped() { LayerSkeleton.dismiss() }

    // The picture is of one layout: a different size would lie, so it goes.
    override func layoutSubviews() {
        super.layoutSubviews()
        if bounds.size != startSize { LayerSkeleton.dismiss() }
    }

    // MARK: Layout

    private static func textWidth(_ s: String, _ font: UIFont) -> CGFloat {
        ceil((s as NSString).size(withAttributes: [.font: font]).width)
    }

    private static func legendWidth() -> CGFloat {
        let row = LayerSkeleton.Kind.allCases.reduce(CGFloat(0)) { $0 + legendIcon + 5 + textWidth($1.title, legendFont) }
            + legendGap * 2
        return max(row, textWidth("Tap anywhere to dismiss", hintFont)) + 28
    }

    private func pillRect(_ text: String, at origin: CGPoint) -> CGRect {
        CGRect(x: origin.x, y: origin.y, width: 14 + Self.textWidth(text, Self.pillFont) + 6, height: Self.pillHeight)
    }

    /// Canvases and native views are always labelled; Contract boxes only where a label fits clear of the others.
    private func placePills(in frame: CGRect) -> [Pill] {
        var out: [Pill] = []
        var taken: [CGRect] = [legend]
        let screen = CGRect(origin: .zero, size: frame.size)
        var contractLabels = 0
        for b in boxes.filter({ $0.kind != .contract }).reversed() + boxes.filter({ $0.kind == .contract }) {
            let isSpecial = b.kind != .contract
            if !isSpecial && contractLabels >= 8 { continue }
            let texts = b.label == b.kind.title ? [b.label] : [b.label, b.kind.title]
            var placed = false
            for text in texts {
                let corners = [CGPoint(x: b.rect.minX + 3, y: b.rect.minY + 3),
                               CGPoint(x: b.rect.minX + 3, y: b.rect.maxY - Self.pillHeight - 3)]
                for at in corners {
                    var r = pillRect(text, at: at)
                    if isSpecial { r.origin.x = min(max(r.origin.x, screen.minX + 2), screen.maxX - r.width - 2) }
                    let fits = isSpecial || (r.width <= b.rect.width - 6 && r.height <= b.rect.height - 6)
                    guard fits, screen.contains(r), !taken.contains(where: { $0.intersects(r) }) else { continue }
                    taken.append(r); out.append(Pill(rect: r, text: text, kind: b.kind))
                    placed = true; break
                }
                if placed { break }
            }
            if placed && !isSpecial { contractLabels += 1 }
        }
        return out
    }

    // MARK: Drawing

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        let trait = traitCollection
        func tint(_ k: LayerSkeleton.Kind) -> UIColor { k.color.resolvedColor(with: trait) }

        for b in boxes {
            let width: CGFloat = b.kind == .contract ? 1 : 1.5
            let path = UIBezierPath(roundedRect: b.rect.insetBy(dx: width / 2, dy: width / 2),
                                    cornerRadius: max(0, b.radius - width / 2))
            tint(b.kind).withAlphaComponent(b.kind == .contract ? 0.07 : 0.12).setFill()
            path.fill()
            tint(b.kind).withAlphaComponent(0.9).setStroke()
            path.lineWidth = width
            path.stroke()
        }

        for p in pills {
            let capsule = UIBezierPath(roundedRect: p.rect, cornerRadius: p.rect.height / 2)
            UIColor.black.withAlphaComponent(0.78).setFill()
            capsule.fill()
            tint(p.kind).setStroke()
            capsule.lineWidth = 1
            capsule.stroke()
            tint(p.kind).setFill()
            ctx.fillEllipse(in: CGRect(x: p.rect.minX + 5, y: p.rect.midY - 2.5, width: 5, height: 5))
            (p.text as NSString).draw(at: CGPoint(x: p.rect.minX + 14, y: p.rect.minY + (p.rect.height - Self.pillFont.lineHeight) / 2),
                                      withAttributes: [.font: Self.pillFont, .foregroundColor: UIColor.white])
        }

        let plate = UIBezierPath(roundedRect: legend, cornerRadius: 16)
        UIColor.black.withAlphaComponent(0.8).setFill()
        plate.fill()
        var x = legend.minX + 14
        let rowY = legend.minY + 10
        for kind in LayerSkeleton.Kind.allCases {
            let config = UIImage.SymbolConfiguration(pointSize: 13, weight: .semibold)
            if let image = UIImage(systemName: kind.symbol, withConfiguration: config)?
                .withTintColor(tint(kind), renderingMode: .alwaysOriginal) {
                let size = image.size
                image.draw(in: CGRect(x: x + (Self.legendIcon - size.width) / 2, y: rowY + (18 - size.height) / 2,
                                      width: size.width, height: size.height))
            }
            x += Self.legendIcon + 5
            (kind.title as NSString).draw(at: CGPoint(x: x, y: rowY + (18 - Self.legendFont.lineHeight) / 2),
                                          withAttributes: [.font: Self.legendFont, .foregroundColor: UIColor.white])
            x += Self.textWidth(kind.title, Self.legendFont) + Self.legendGap
        }
        let hint = "Tap anywhere to dismiss"
        (hint as NSString).draw(at: CGPoint(x: legend.midX - Self.textWidth(hint, Self.hintFont) / 2, y: rowY + 22),
                                withAttributes: [.font: Self.hintFont, .foregroundColor: UIColor.white.withAlphaComponent(0.6)])
    }
}
#endif

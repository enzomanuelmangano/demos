// `glass-pane`: a glass (or blur) pane that sits behind other content.
//
// iOS 26: a UIVisualEffectView with a UIGlassEffect. UIKit skips a glass effect created at low
// opacity and never installs it later, so it is installed from `layoutSubviews` once the view is
// in a window and visible, and again on returning to a window. Before iOS 26: a dark UIBlurEffect
// with a hairline white border. macOS 26+: NSGlassEffectView; earlier, a dark NSVisualEffectView.
//
// Props (all optional):
//   glass-style "clear" | "regular" | "none"; default "regular"
//   pane-tint   the tint colour, #rrggbb, #rrggbbaa or rgba(r, g, b, a); none by default
//   interactive "true" | "false"; default false. True: the pane takes the touch and plays iOS's
//               press response (the glass swells and shimmers under the finger); the touch still
//               reaches the views above it.
//   scheme      "light" | "dark": the pane's appearance, whatever the phone's; default the phone's.
//               Glass reads its backdrop through it, so a dark one over a light page looks grey.
//   corner-size the corner radius in points; default 0. "capsule": half the shorter side, as a true
//               pill (UIKit's capsule configuration): a continuous curve at half the height leaves
//               flat-looking ends.
//   continuous  "true" | "false": continuous corner curve; default true
import Foundation

/// `#rrggbb`, `#rrggbbaa` or `rgba(r, g, b, a)` (0-255, alpha 0-1) as sRGB components.
func glassPaneColor(_ text: String?) -> (CGFloat, CGFloat, CGFloat, CGFloat)? {
    guard let raw = text?.trimmingCharacters(in: .whitespaces), !raw.isEmpty else { return nil }
    if raw.hasPrefix("#") {
        let hex = String(raw.dropFirst())
        guard hex.count == 6 || hex.count == 8, let v = UInt64(hex, radix: 16) else { return nil }
        let full = hex.count == 6 ? (v << 8) | 0xff : v
        return (CGFloat((full >> 24) & 0xff) / 255, CGFloat((full >> 16) & 0xff) / 255,
                CGFloat((full >> 8) & 0xff) / 255, CGFloat(full & 0xff) / 255)
    }
    guard raw.hasPrefix("rgba(") || raw.hasPrefix("rgb("), raw.hasSuffix(")"),
          let open = raw.firstIndex(of: "(") else { return nil }
    let inner = raw[raw.index(after: open)..<raw.index(before: raw.endIndex)]
    let parts = inner.split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
    guard parts.count == 3 || parts.count == 4 else { return nil }
    return (CGFloat(parts[0] / 255), CGFloat(parts[1] / 255), CGFloat(parts[2] / 255),
            CGFloat(parts.count == 4 ? parts[3] : 1))
}

struct GlassPaneStyle: Equatable {
    var glass = "regular"
    var tint: [CGFloat]? = nil
    var interactive = false
    var scheme: String? = nil
    var radius: CGFloat = 0
    var capsule = false
    var continuous = true

    init() {}

    init(_ props: [String: String]) {
        glass = props["glass-style"] ?? "regular"
        tint = glassPaneColor(props["pane-tint"]).map { [$0.0, $0.1, $0.2, $0.3] }
        interactive = props["interactive"] == "true"
        scheme = props["scheme"]
        capsule = props["corner-size"] == "capsule"
        radius = props["corner-size"].flatMap(Double.init).map { CGFloat(max(0, $0)) } ?? 0
        continuous = props["continuous"] != "false"
    }
}

#if os(iOS)
import UIKit

final class GlassPaneView: UIView {
    private let effectView = UIVisualEffectView()
    private var installed = false
    private var visibilityLink: CADisplayLink?
    var style = GlassPaneStyle() {
        didSet { if style != oldValue { restyle(effectChanged: style.glass != oldValue.glass || style.interactive != oldValue.interactive) } }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = .clear
        effectView.frame = bounds
        effectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        effectView.isUserInteractionEnabled = false
        addSubview(effectView)
    }

    required init?(coder: NSCoder) { nil }

    deinit { visibilityLink?.invalidate() }

    /// Decorative, never a touch target, so a pan on the demo underneath hears the finger. An
    /// interactive pane takes the touch for its press response: the gesture recognizers of the
    /// views above still see it.
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard style.interactive, bounds.contains(point) else { return nil }
        // A control placed in `contentView` keeps its own touch; the glass still reads it as a press.
        return effectView.hitTest(convert(point, to: effectView), with: event) ?? effectView
    }

    /// Where a control that sits on the glass goes: its touches stay inside the effect view, so an
    /// interactive glass answers them.
    var contentView: UIView { effectView.contentView }

    /// Checked at runtime: early iOS 26 betas crashed in the glass initialiser.
    private static var hasGlass: Bool {
        if #available(iOS 26.0, *) {
            guard let cls = NSClassFromString("UIGlassEffect") as? NSObject.Type else { return false }
            return cls.responds(to: Selector(("effectWithStyle:")))
        }
        return false
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // The pre-glass fallback's capsule radius follows the size.
        if style.capsule, !Self.hasGlass { layer.cornerRadius = min(bounds.width, bounds.height) / 2; effectView.layer.cornerRadius = layer.cornerRadius }
        guard !installed else { return }
        if renderable { install() } else { waitForVisibility() }
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil {
            installed = false
            stopWaiting()
        } else {
            setNeedsLayout()
        }
    }

    /// In a window, shown, and above the opacity UIKit draws glass at (0.02).
    private var renderable: Bool {
        guard window != nil else { return false }
        var opacity: CGFloat = 1
        var view: UIView? = self
        while let v = view {
            if v.isHidden { return false }
            opacity *= v.alpha
            view = v.superview
        }
        return opacity > 0.02
    }

    private func waitForVisibility() {
        guard visibilityLink == nil else { return }
        let link = CADisplayLink(target: GlassPaneTicker(self), selector: #selector(GlassPaneTicker.tick))
        link.add(to: .main, forMode: .common)
        visibilityLink = link
    }

    fileprivate func tick() {
        if renderable { setNeedsLayout() }
    }

    private func stopWaiting() {
        visibilityLink?.invalidate()
        visibilityLink = nil
    }

    private func install() {
        installed = true
        stopWaiting()
        effectView.effect = UIVisualEffect()
        restyle(effectChanged: true)
    }

    private func restyle(effectChanged: Bool) {
        effectView.isUserInteractionEnabled = style.interactive
        switch style.scheme {
        case "dark": overrideUserInterfaceStyle = .dark
        case "light": overrideUserInterfaceStyle = .light
        default: overrideUserInterfaceStyle = .unspecified
        }
        let tint = style.tint.map { UIColor(red: $0[0], green: $0[1], blue: $0[2], alpha: $0[3]) }
        if Self.hasGlass, #available(iOS 26.0, *) {
            layer.borderWidth = 0
            if installed {
                if style.glass == "none" {
                    effectView.effect = UIVisualEffect()
                } else {
                    if effectChanged { effectView.effect = UIVisualEffect() }
                    let effect = UIGlassEffect(style: style.glass == "clear" ? .clear : .regular)
                    effect.tintColor = tint
                    effect.isInteractive = style.interactive
                    // Set again, or the tint and interactivity have no effect.
                    effectView.effect = effect
                }
            }
            if style.capsule {
                effectView.cornerConfiguration = .capsule()
            } else {
                let r = UICornerRadius(floatLiteral: Double(style.radius))
                effectView.cornerConfiguration = .corners(topLeftRadius: r, topRightRadius: r,
                                                          bottomLeftRadius: r, bottomRightRadius: r)
            }
        } else {
            if effectView.effect == nil || effectChanged { effectView.effect = UIBlurEffect(style: .dark) }
            let radius = style.capsule ? min(bounds.width, bounds.height) / 2 : style.radius
            effectView.layer.cornerRadius = radius
            effectView.clipsToBounds = radius > 0
            layer.cornerRadius = radius
            layer.borderWidth = 1 / max(traitCollection.displayScale, 1)
            layer.borderColor = UIColor(white: 1, alpha: 0.5).cgColor
        }
        let curve: CALayerCornerCurve = style.continuous && !style.capsule ? .continuous : .circular
        layer.cornerCurve = curve
        effectView.layer.cornerCurve = curve
    }
}

/// A weak target, so the display link does not keep the view alive.
private final class GlassPaneTicker: NSObject {
    private weak var view: GlassPaneView?
    init(_ view: GlassPaneView) { self.view = view }
    @objc func tick() { view?.tick() }
}

final class GlassPane: ExactNativeInstance {
    private let pane = GlassPaneView()

    init(props: [String: String], events: ExactNativeEvents) {
        super.init(events: events)
        try? setProps(props)
    }

    override var view: ExactNativeView { pane }

    override func setProps(_ props: [String: String]) throws {
        pane.style = GlassPaneStyle(props)
    }
}

#elseif os(macOS)
import AppKit

final class GlassPaneView: NSView {
    private var glass: NSView?
    var style = GlassPaneStyle() {
        didSet { if style != oldValue { restyle() } }
    }

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        restyle()
    }

    required init?(coder: NSCoder) { nil }

    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    private func restyle() {
        let tint = style.tint.map { NSColor(srgbRed: $0[0], green: $0[1], blue: $0[2], alpha: $0[3]) }
        if #available(macOS 26.0, *), NSClassFromString("NSGlassEffectView") != nil {
            let view = glass as? NSGlassEffectView ?? NSGlassEffectView(frame: bounds)
            if glass !== view { glass?.removeFromSuperview(); attach(view) }
            view.style = style.glass == "clear" ? .clear : .regular
            view.tintColor = tint
            view.cornerRadius = style.capsule ? min(bounds.width, bounds.height) / 2 : style.radius
            view.isHidden = style.glass == "none"
        } else {
            let view = glass as? NSVisualEffectView ?? NSVisualEffectView(frame: bounds)
            if glass !== view { glass?.removeFromSuperview(); attach(view) }
            view.material = .hudWindow
            view.blendingMode = .withinWindow
            view.state = .active
            view.appearance = NSAppearance(named: .darkAqua)
            view.wantsLayer = true
            let radius = style.capsule ? min(bounds.width, bounds.height) / 2 : style.radius
            view.layer?.cornerRadius = radius
            view.layer?.masksToBounds = radius > 0
            view.isHidden = style.glass == "none"
        }
        glass?.layer?.cornerCurve = style.continuous ? .continuous : .circular
    }

    private func attach(_ view: NSView) {
        view.frame = bounds
        view.autoresizingMask = [.width, .height]
        addSubview(view)
        glass = view
    }
}

final class GlassPane: ExactNativeInstance {
    private let pane = GlassPaneView()

    init(props: [String: String], events: ExactNativeEvents) {
        super.init(events: events)
        try? setProps(props)
    }

    override var view: ExactNativeView { pane }

    override func setProps(_ props: [String: String]) throws {
        pane.style = GlassPaneStyle(props)
    }
}
#endif

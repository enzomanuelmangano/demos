// `variable-blur`: a progressive blur of whatever lies under the view: one Gaussian whose radius
// is read per pixel from an alpha mask, run by the render server on the live backdrop.
//
// A UIVisualEffectView's backdrop layer gets Core Animation's private `variableBlur` CAFilter in
// place of the material's chain. CAFilter is looked up by name; when it or `variableBlur` is
// missing the view falls back to an ultra-thin light material faded in by the same ramp.
//
// Props (all optional):
//   blur-radius         the largest radius, points; default 20
//   ramp-from, ramp-to  where the ramp runs, as fractions of the view's height; default 0 and 1
//   ramp-up             "true": blurred at the top, sharp toward the bottom; default false
// The ramp is smootherstep, so neither its onset nor its full-radius line shows.
#if os(iOS)
import UIKit

final class VariableBlur: ExactNativeInstance {
    private let blur = VariableBlurView()

    init(props: [String: String], events: ExactNativeEvents) {
        super.init(events: events)
        try? setProps(props)
    }

    override var view: ExactNativeView { blur }

    override func setProps(_ props: [String: String]) throws {
        func number(_ key: String, _ fallback: CGFloat) -> CGFloat {
            guard let text = props[key], let value = Double(text), value.isFinite else { return fallback }
            return CGFloat(value)
        }
        blur.configure(VariableBlurView.Ramp(
            radius: max(0, number("blur-radius", 20)),
            start: min(max(number("ramp-from", 0), 0), 1),
            end: min(max(number("ramp-to", 1), 0), 1),
            up: props["ramp-up"] == "true"))
    }
}

final class VariableBlurView: UIView {
    /// Decorative, never a touch target: what lies under it takes the taps.
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? { nil }
    struct Ramp: Equatable {
        var radius: CGFloat = 20
        var start: CGFloat = 0
        var end: CGFloat = 1
        var up = false
    }

    private static let maskRows = 1024

    private let effect = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialLight))
    private var ramp = Ramp()
    private var filter: NSObject?
    private var fallbackMask: CAGradientLayer?

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = .clear
        effect.frame = bounds
        effect.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        effect.isUserInteractionEnabled = false
        addSubview(effect)
        filter = Self.makeVariableBlur()
        if filter == nil {
            let mask = CAGradientLayer()
            effect.layer.mask = mask
            fallbackMask = mask
        }
        apply()
        registerForTraitChanges([UITraitDisplayScale.self, UITraitUserInterfaceStyle.self]) { (view: VariableBlurView, _) in
            view.install()
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    func configure(_ next: Ramp) {
        guard next != ramp else { return }
        ramp = next
        apply()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        fallbackMask?.frame = effect.bounds
        // UIKit rebuilds a visual effect's layers on some trait and layout changes: keep ours.
        install()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        install()
    }


    // MARK: - The filter

    /// `[CAFilter filterWithType:@"variableBlur"]`, or nil where the runtime lacks it.
    private static func makeVariableBlur() -> NSObject? {
        guard let type = NSClassFromString(["CA", "Filter"].joined()) as? NSObject.Type else { return nil }
        let make = NSSelectorFromString(["filter", "With", "Type:"].joined())
        guard type.responds(to: make),
              let made = type.perform(make, with: "variableBlur")?.takeUnretainedValue() as? NSObject
        else { return nil }
        // An unknown type still makes a filter on some releases: it must take our keys.
        guard made.responds(to: NSSelectorFromString("setValue:forKey:")) else { return nil }
        return made
    }

    private func apply() {
        if let filter {
            filter.setValue(ramp.radius, forKey: "inputRadius")
            filter.setValue(Self.maskImage(ramp), forKey: "inputMaskImage")
            filter.setValue(true, forKey: "inputNormalizeEdges")
            // A filter already on the layer is a copy: put the new one on.
            backdropLayer()?.setValue(nil, forKey: "filters")
            install()
        } else if let mask = fallbackMask {
            let stops = 16
            mask.colors = (0...stops).map { i in
                UIColor(white: 0, alpha: Self.alpha(CGFloat(i) / CGFloat(stops), ramp)).cgColor
            }
            mask.locations = (0...stops).map { NSNumber(value: Double($0) / Double(stops)) }
            mask.startPoint = CGPoint(x: 0.5, y: 0)
            mask.endPoint = CGPoint(x: 0.5, y: 1)
        }
    }

    /// The backdrop layer of the effect view: the subview whose layer is a backdrop layer.
    private func backdropLayer() -> CALayer? {
        effect.subviews.first { NSStringFromClass(type(of: $0.layer)).contains("Backdrop") }?.layer
    }

    private func install() {
        guard let filter, let backdrop = backdropLayer() else { return }
        let current = backdrop.value(forKey: "filters") as? [NSObject]
        if current?.count != 1 || current?.first?.value(forKey: "name") as? String != filter.value(forKey: "name") as? String
            || (current?.first?.value(forKey: "inputRadius") as? NSNumber)?.doubleValue != Double(ramp.radius) {
            backdrop.setValue([filter], forKey: "filters")
        }
        let scale = window?.screen.scale ?? traitCollection.displayScale
        if scale > 0 { backdrop.setValue(scale, forKey: "scale") }
        for view in effect.subviews where view.layer !== backdrop {
            view.isHidden = true
        }
    }

    // MARK: - The mask

    /// The blur's weight at `y` (0 top … 1 bottom of the view).
    static func alpha(_ y: CGFloat, _ ramp: Ramp) -> CGFloat {
        let y = ramp.up ? 1 - y : y
        let span = ramp.end - ramp.start
        let t: CGFloat
        if span <= 0.0001 { t = y >= ramp.start ? 1 : 0 } else { t = min(max((y - ramp.start) / span, 0), 1) }
        return t * t * t * (t * (t * 6 - 15) + 10)
    }

    /// One column of the ramp as premultiplied alpha, top row first; the filter stretches it over the layer.
    static func maskImage(_ ramp: Ramp) -> CGImage? {
        let rows = maskRows
        var pixels = [UInt8](repeating: 0, count: rows * 4)
        for row in 0..<rows {
            let a = alpha((CGFloat(row) + 0.5) / CGFloat(rows), ramp)
            pixels[row * 4 + 3] = UInt8((a * 255).rounded())
        }
        let data = Data(pixels) as CFData
        guard let provider = CGDataProvider(data: data) else { return nil }
        return CGImage(width: 1, height: rows, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: 4,
                       space: CGColorSpaceCreateDeviceRGB(),
                       bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                       provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }
}
#endif

// `search-reveal`: the home's pull-to-search, native from the finger to the pixels.
//
// A downward pull on the pager (the `page-scroller` hatch, springboard.contract) drives one `reveal`
// value 0...1 over 100 pt of damped travel, as iOS's App Library search: the home blurs, the field and
// the results ride the finger down, the results fade in. Each touch move sets layer properties only
// (one backdrop blur's radius, a dim, the field, the results), with actions disabled: nothing is
// committed to the Contract plan, nothing reaches Rust. Released past the trigger (or flicked) the
// rest of the way is handed to Core Animation as keyframes and the field narrows for its Cancel; it
// takes the keyboard once it has landed. Released short it runs back to 0. No display link: a main thread
// busy with the keyboard does not hold a frame of it back.
//
// The view holds everything the search shows: the blur and the dim over the home, the results (a
// UICollectionView of icon + name rows, filtered by the field with no round trip), the scroll-edge blur
// under the field, the glass field (a real UITextField) and its Cancel. It covers the whole screen, the
// keyboard's area too: the keys float over the blurred home, never over the window's black. Only a
// tapped result leaves the view: `change("<slug>")` opens that demo out of the row's icon, the same
// launch as the grid's (DemoLaunch.swift names the source by `LaunchIcons.touch(_:slug:)`).
//
// Props (all text):
//   scroller    the pager's `data-scroller` name (PageDots.swift's `PageScrollers`)
//   slugs, names, labels, icons    the demos, "|" between them, in the order the home lists them
//   icon-size   the result icons' edge; side-margin   the home grid's side padding
#if os(iOS)
import UIKit
import UIKit.UIGestureRecognizerSubclass

// MARK: - The numbers

private enum Pull {
    /// The pull (pt) at which the reveal is whole and letting go commits.
    static let trigger: CGFloat = 100
    /// The pull eases toward this asymptote: it follows the finger early, then yields.
    static let rubber: CGFloat = 260
    /// Backing off below this share of the trigger disarms it, so a finger resting on it does not tick.
    static let disarm: CGFloat = 0.85
    /// A release faster than this (pt/s) commits without reaching the trigger.
    static let flick: CGFloat = 900
    /// The finger travel that starts the pull, and the sideways travel that fails it.
    static let activate: CGFloat = 22
    static let failX: CGFloat = 10
    /// The reveal's windows (App Library, frame by frame): the home blurs first, the field shows,
    /// then the results fade in over the blurred home.
    static let blur: (CGFloat, CGFloat) = (0.1, 1)
    /// The blur's radius grows as (its window)^blurPower: a Gaussian of 1.5 pt already makes the labels
    /// unreadable, so a gentler radius looks like a jump; App Library is sharp at a quarter of the pull,
    /// barely soft at half, strongest near commit (~0, 1.8, 9.6, 30 pt at 25/50/75/100 %).
    static let blurPower: CGFloat = 3.5
    static let dimPower: CGFloat = 1.5
    /// Below this radius (pt) the backdrop is sampled at the screen's own scale: sampled at 1x it is
    /// visibly soft at radius 0, which read as the home blurring at once.
    static let fullScaleBelow: CGFloat = 5
    static let field: (CGFloat, CGFloat) = (0.15, 0.55)
    static let list: (CGFloat, CGFloat) = (0.35, 1)
    /// How far the field and the results ride the pull (× the damped pull).
    static let fieldRide: CGFloat = 0.4
    static let listRide: CGFloat = 1
    /// The release lands in 0.34 s (then the keys rise), Cancel leaves the reveal in 0.36 s after
    /// the keys have started down, a short pull springs back in 0.26 s.
    static let commitMs = 0.34, backMs = 0.26, exitMs = 0.36, exitDelay = 0.06
    /// The field narrows for Cancel (and back) on this spring.
    static let focusMs = 0.36
    static let barHeight: CGFloat = 48
    static let barTop: CGFloat = 10
    static let listGap: CGFloat = 24
    static let rowPadding: CGFloat = 7
    static let edgeBlur: CGFloat = 28
    /// The home's blur at full reveal (Gaussian radius, pt) and the dim over it.
    static let blurRadius: CGFloat = 30
    static let maxDim: CGFloat = 0.28
    /// Keyframes per second handed to Core Animation.
    static let rate = 120.0
}

private func clamp01(_ x: CGFloat) -> CGFloat { min(1, max(0, x)) }
private func span(_ x: CGFloat, _ r: (CGFloat, CGFloat)) -> CGFloat { clamp01((x - r.0) / (r.1 - r.0)) }
private func smooth(_ t: CGFloat) -> CGFloat { t * t * (3 - 2 * t) }
private func easeOutCubic(_ t: CGFloat) -> CGFloat { 1 - pow(1 - t, 3) }
private func easeInOutCubic(_ t: CGFloat) -> CGFloat { t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2 }
private func easeInOutQuad(_ t: CGFloat) -> CGFloat { t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2 }

// MARK: - The pull

/// A one-finger drag that begins only for a clear downward pull: 22 pt down before 10 pt sideways.
/// Everything else fails and leaves the touch to the pager and the icons.
final class SearchPullRecognizer: UIGestureRecognizer {
    private(set) var travel: CGFloat = 0
    private(set) var velocity: CGFloat = 0
    private var tracked: UITouch?
    private var start = CGPoint.zero
    private var last: (y: CGFloat, t: TimeInterval) = (0, 0)

    override func reset() {
        tracked = nil
        travel = 0
        velocity = 0
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        guard tracked == nil, touches.count == 1, let touch = touches.first else { state = .failed; return }
        tracked = touch
        // Window coordinates: the pager's own bounds move with its horizontal scroll.
        start = touch.location(in: nil)
        last = (start.y, touch.timestamp)
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        guard let touch = tracked, touches.contains(touch) else { return }
        let p = touch.location(in: nil)
        let dx = p.x - start.x, dy = p.y - start.y
        let dt = touch.timestamp - last.t
        if dt > 0 { velocity = velocity * 0.5 + ((p.y - last.y) / CGFloat(dt)) * 0.5 }
        last = (p.y, touch.timestamp)
        switch state {
        case .possible:
            if abs(dx) > Pull.failX || dy < -Pull.failX { state = .failed }
            else if dy >= Pull.activate { travel = dy; state = .began }
        case .began, .changed:
            travel = max(0, dy)
            state = .changed
        default: break
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        guard let touch = tracked, touches.contains(touch) else { return }
        state = state == .possible ? .failed : .ended
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        state = state == .possible ? .failed : .cancelled
    }
}

// MARK: - The home's blur: one Gaussian on the backdrop, its radius a layer property

/// A UIVisualEffectView whose backdrop layer runs Core Animation's `gaussianBlur` CAFilter alone (no
/// material tint): its radius is a key path of the layer, set per touch or keyframed, and the render
/// server blurs at that radius. A material scrubbed by a paused animator cannot be handed to Core
/// Animation, and its tint ramps with it. Where the filter is missing: the material, faded in.
private final class SearchBlur: UIView {
    private let effect = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
    private let filter: NSObject? = SearchBlur.makeGaussian()
    static let path = "filters.gaussianBlur.inputRadius"
    private(set) var radius: CGFloat = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        effect.frame = bounds
        effect.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        effect.isUserInteractionEnabled = false
        addSubview(effect)
        isHidden = true
    }
    required init?(coder: NSCoder) { nil }
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? { nil }

    private static func makeGaussian() -> NSObject? {
        guard let type = NSClassFromString(["CA", "Filter"].joined()) as? NSObject.Type else { return nil }
        let make = NSSelectorFromString(["filter", "With", "Type:"].joined())
        guard type.responds(to: make),
              let made = type.perform(make, with: "gaussianBlur")?.takeUnretainedValue() as? NSObject,
              made.responds(to: NSSelectorFromString("setValue:forKey:")) else { return nil }
        made.setValue("gaussianBlur", forKey: "name")
        made.setValue(0, forKey: "inputRadius")
        // Edges are blurred with the screen's own pixels, not darkened toward transparent black.
        made.setValue(true, forKey: "inputNormalizeEdges")
        return made
    }

    /// The layer whose key path animates: the backdrop with our filter, or (fallback) the effect view.
    var animated: CALayer? { filter != nil ? backdrop() : effect.layer }

    private func backdrop() -> CALayer? {
        effect.subviews.first { NSStringFromClass(type(of: $0.layer)).contains("Backdrop") }?.layer
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        install()
    }
    override func didMoveToWindow() {
        super.didMoveToWindow()
        install()
    }

    /// UIKit rebuilds a visual effect's layers on some trait and layout changes: keep ours.
    private func install() {
        guard let filter, let backdrop = backdrop() else { return }
        let current = backdrop.value(forKey: "filters") as? [NSObject]
        if current?.count != 1 || current?.first?.value(forKey: "name") as? String != "gaussianBlur" {
            backdrop.setValue([filter], forKey: "filters")
            backdrop.setValue(radius, forKeyPath: Self.path)
        }
        applyScale(backdrop, force: true)
        for view in effect.subviews where view.layer !== backdrop { view.isHidden = true }
    }

    /// One sample per point once the blur is wide (a 30 pt blur at 3 px per point costs 9 times the pixels and
    /// looks the same), the screen's own scale while it is narrow, where 1x sampling alone is a visible blur.
    private var sampled: CGFloat = 0
    private func applyScale(_ backdrop: CALayer, force: Bool = false) {
        let native = max(window?.screen.scale ?? traitCollection.displayScale, 1)
        let s: CGFloat = radius < Pull.fullScaleBelow ? native : 1
        guard force || s != sampled else { return }
        sampled = s
        backdrop.setValue(s, forKey: "scale")
    }

    /// The model value (actions off by the caller); the view hides at 0, where it would cost a pass for nothing.
    /// `scaleFor` picks the sampling for a run's whole way (its widest radius), not the value it starts at.
    func set(_ r: CGFloat, hide: Bool = true, scaleFor: CGFloat? = nil) {
        radius = scaleFor ?? r
        if filter != nil, let backdrop = backdrop() { applyScale(backdrop) }
        radius = r
        if r >= 0.05 { isHidden = false } else if hide { isHidden = true }
        if filter != nil { backdrop()?.setValue(r, forKeyPath: Self.path) } else { effect.alpha = r / Pull.blurRadius }
    }

    /// Keyframe values for `animated` (radius, or the fallback's opacity).
    func keyframes(_ radii: [CGFloat]) -> (path: String, values: [Any]) {
        filter != nil ? (Self.path, radii.map { $0 as Any }) : ("opacity", radii.map { Float($0 / Pull.blurRadius) as Any })
    }
}

// MARK: - The field

private final class SearchField: UITextField {
    var allowsFocus: () -> Bool = { true }
    override var canBecomeFirstResponder: Bool { allowsFocus() && super.canBecomeFirstResponder }

    private var textBox: (CGRect) -> CGRect { { $0.inset(by: UIEdgeInsets(top: 0, left: 41, bottom: 0, right: 10)) } }
    override func textRect(forBounds bounds: CGRect) -> CGRect { textBox(bounds) }
    override func editingRect(forBounds bounds: CGRect) -> CGRect { textBox(bounds) }
    override func placeholderRect(forBounds bounds: CGRect) -> CGRect { textBox(bounds) }
    override func clearButtonRect(forBounds bounds: CGRect) -> CGRect {
        super.clearButtonRect(forBounds: bounds).offsetBy(dx: -8, dy: 0)
    }
}

/// A button whose touch area reaches 10 pt past its title.
private final class SlopButton: UIButton {
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        bounds.insetBy(dx: -10, dy: -10).contains(point)
    }
}

// MARK: - A result row

private final class ResultCell: UICollectionViewCell {
    static let reuse = "result"
    let icon = UIImageView()
    let name = UILabel()
    let line = CALayer()
    var iconSize: CGFloat = 62 { didSet { if iconSize != oldValue { setNeedsLayout() } } }

    override init(frame: CGRect) {
        super.init(frame: frame)
        // The artwork carries its own squircle: no clip, mask or shadow.
        icon.isUserInteractionEnabled = false
        name.font = .systemFont(ofSize: 17, weight: .medium)
        name.textColor = UIColor(white: 1, alpha: 0.95)
        line.backgroundColor = UIColor(white: 1, alpha: 0.1).cgColor
        contentView.addSubview(icon)
        contentView.addSubview(name)
        contentView.layer.addSublayer(line)
    }
    required init?(coder: NSCoder) { nil }

    override func layoutSubviews() {
        super.layoutSubviews()
        let hair = 1 / max(traitCollection.displayScale, 1)
        let pad = Pull.rowPadding
        icon.frame = CGRect(x: 0, y: pad, width: iconSize, height: iconSize)
        let x = iconSize + 14
        name.frame = CGRect(x: x, y: pad, width: max(0, bounds.width - x), height: iconSize)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        line.frame = CGRect(x: x, y: bounds.height - hair, width: max(0, bounds.width - x), height: hair)
        CATransaction.commit()
    }

    /// A press dims the icon a touch (quick in, soft out) and the name to 0.6.
    override var isHighlighted: Bool {
        didSet {
            guard isHighlighted != oldValue else { return }
            UIView.animate(withDuration: isHighlighted ? 0.08 : 0.22, delay: 0, options: [.allowUserInteraction, .curveEaseOut]) {
                self.icon.alpha = self.isHighlighted ? 0.85 : 1
                self.name.alpha = self.isHighlighted ? 0.6 : 1
            }
        }
    }
}

private struct Row {
    let slug: String, name: String, label: String, icon: String
    let lowered: (name: String, label: String)
}

// MARK: - The view

final class SearchRevealView: UIView, UICollectionViewDataSource, UICollectionViewDelegate,
                              UIGestureRecognizerDelegate, UITextFieldDelegate {
    var onPick: (String) -> Void = { _ in }

    // Content
    private var rows: [Row] = []
    private var results: [Row] = []
    private var iconSize: CGFloat = 62
    private var sideMargin: CGFloat = 22
    private var scrollerName = ""

    // State: `reveal` is the one value the look reads; `pull` the damped finger travel the field and results ride.
    private var reveal: CGFloat = 0
    private var pull: CGFloat = 0
    private var committed = false
    private var armed = false
    /// The field narrowed for Cancel (committed), or wide with its hint centred (the pull).
    private var narrowed = false

    // Subviews, back to front
    private let blur = SearchBlur()
    private let dim = UIView()
    private let list: UICollectionView
    private let layout: UICollectionViewFlowLayout
    private let empty = UILabel()
    private let band = UIView()
    private let edgeBlur = VariableBlurView()
    private let fade = CAGradientLayer()
    private let bar = UIView()
    private let glass = GlassPaneView()
    private let field = SearchField()
    /// The glyph and "Search": centred in the wide field, at its leading edge once it narrows.
    private let hint = UIView()
    private let hintGlyph = UIImageView()
    private let hintLabel = UILabel()
    private let cancelButton = SlopButton(type: .system)

    // The pull
    private let recognizer = SearchPullRecognizer()
    private weak var scroll: UIScrollView?
    private var scrollPanWasEnabled = true
    private let tick = UIImpactFeedbackGenerator(style: .light)
    private let select = UISelectionFeedbackGenerator()

    /// The run handed to Core Animation: kept to answer where it is when a finger interrupts it.
    private struct Run {
        var from: (r: CGFloat, p: CGFloat), to: (r: CGFloat, p: CGFloat)
        var start: CFTimeInterval, duration: CFTimeInterval
        var curve: (CGFloat) -> CGFloat
        func at(_ now: CFTimeInterval) -> (r: CGFloat, p: CGFloat) {
            let u = curve(clamp01(CGFloat((now - start) / duration)))
            return (from.r + (to.r - from.r) * u, from.p + (to.p - from.p) * u)
        }
    }
    private var run: Run?
    /// The radius that picks the blur's sampling while a run is on (its narrowest).
    private var runBlurScaleFor: CGFloat = 0
    /// Counts runs: the end of one that was replaced does nothing.
    private var runGen = 0
    private var keyboardOverlap: CGFloat = 0

    override init(frame: CGRect) {
        let flow = UICollectionViewFlowLayout()
        layout = flow
        list = UICollectionView(frame: .zero, collectionViewLayout: flow)
        super.init(frame: frame)
        backgroundColor = .clear
        clipsToBounds = false

        blur.frame = bounds
        blur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(blur)
        dim.backgroundColor = .black
        dim.isUserInteractionEnabled = false
        dim.frame = bounds
        dim.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(dim)

        layout.minimumLineSpacing = 0
        layout.minimumInteritemSpacing = 0
        list.backgroundColor = .clear
        list.register(ResultCell.self, forCellWithReuseIdentifier: ResultCell.reuse)
        list.dataSource = self
        list.delegate = self
        list.delaysContentTouches = false
        list.alwaysBounceVertical = true
        list.showsVerticalScrollIndicator = false
        // As iOS: the keys follow a drag that reaches them. `.onDrag` took them down as each scroll began, a
        // main-thread turn (35-70 ms on the simulator) on the scroll's first frames.
        list.keyboardDismissMode = .interactive
        list.contentInsetAdjustmentBehavior = .never
        list.layer.allowsGroupOpacity = false
        addSubview(list)

        empty.textColor = UIColor(white: 1, alpha: 0.55)
        empty.font = .systemFont(ofSize: 17, weight: .medium)
        empty.textAlignment = .center
        empty.isHidden = true
        addSubview(empty)

        band.isUserInteractionEnabled = false
        edgeBlur.configure(VariableBlurView.Ramp(radius: Pull.edgeBlur, start: 0, end: 1, up: true))
        // Re-blurred on every frame the results move under it: at the screen's 3x a 28 pt radius is 84 px over the
        // whole band; at 1x it looks the same.
        edgeBlur.sampleScale = 1
        // Faded as a whole, the band and the list each cost an off-screen pass per frame of the pull; their parts
        // do not overlap (the band's tint lies over its blur either way), so each part fades on its own.
        band.layer.allowsGroupOpacity = false
        band.addSubview(edgeBlur)
        // What passes under the edge also fades into the defocused home, as a scroll edge does.
        fade.colors = [UIColor(red: 31 / 255, green: 31 / 255, blue: 32 / 255, alpha: 0.92).cgColor,
                       UIColor(red: 31 / 255, green: 31 / 255, blue: 32 / 255, alpha: 0.7).cgColor,
                       UIColor(red: 31 / 255, green: 31 / 255, blue: 32 / 255, alpha: 0).cgColor]
        band.layer.addSublayer(fade)
        addSubview(band)

        glass.style = {
            var s = GlassPaneStyle()
            s.glass = "regular"
            s.radius = Pull.barHeight / 2
            // Static while it rides the pull: interactive glass cost the first pull 60 ms and every touch more.
            // It turns interactive once the search has landed (`glassInteractive`).
            s.interactive = false
            return s
        }()
        bar.addSubview(glass)
        let grey = UIColor(red: 142 / 255, green: 142 / 255, blue: 147 / 255, alpha: 1)
        field.delegate = self
        field.allowsFocus = { [weak self] in self?.mayFocus ?? false }
        field.font = .systemFont(ofSize: 17)
        field.textColor = .white
        field.autocorrectionType = .no
        field.autocapitalizationType = .none
        field.spellCheckingType = .no
        field.returnKeyType = .search
        field.clearButtonMode = .whileEditing
        field.keyboardAppearance = .dark
        field.accessibilityLabel = "Search"
        // Invisible: the hint draws it. A field with no placeholder reads as a login field to AutoFill.
        field.attributedPlaceholder = NSAttributedString(string: "Search", attributes: [.foregroundColor: UIColor.clear])
        field.addTarget(self, action: #selector(queryChanged), for: .editingChanged)
        // On the glass, not over it: a touch on the field is a touch on the glass too.
        glass.contentView.addSubview(field)
        hint.isUserInteractionEnabled = false
        hintGlyph.image = UIImage(systemName: "magnifyingglass",
                                  withConfiguration: UIImage.SymbolConfiguration(pointSize: 18, weight: .regular))
        hintGlyph.tintColor = grey
        hintGlyph.contentMode = .center
        hintLabel.text = "Search"
        hintLabel.font = .systemFont(ofSize: 17)
        hintLabel.textColor = grey
        hint.addSubview(hintGlyph)
        hint.addSubview(hintLabel)
        glass.contentView.addSubview(hint)
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.setTitleColor(.white, for: .normal)
        cancelButton.titleLabel?.font = .systemFont(ofSize: 17)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        bar.addSubview(cancelButton)
        addSubview(bar)

        recognizer.addTarget(self, action: #selector(pulled(_:)))
        recognizer.delegate = self
        let outside = UITapGestureRecognizer(target: self, action: #selector(tappedOutside))
        outside.delegate = self
        outside.cancelsTouchesInView = false
        addGestureRecognizer(outside)

        NotificationCenter.default.addObserver(self, selector: #selector(scrollerChanged(_:)),
                                               name: PageScrollers.changed, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardMoved(_:)),
                                               name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
        render()
    }

    required init?(coder: NSCoder) { nil }

    deinit {
        NotificationCenter.default.removeObserver(self)
        if let scroll { scroll.removeGestureRecognizer(recognizer) }
    }

    // MARK: props

    func configure(scroller: String, slugs: [String], names: [String], labels: [String], icons: [String],
                   iconSize: CGFloat, sideMargin: CGFloat) {
        let nextRows = slugs.enumerated().map { i, slug in
            let name = i < names.count ? names[i] : slug
            let label = i < labels.count ? labels[i] : name
            return Row(slug: slug, name: name, label: label, icon: i < icons.count ? icons[i] : "",
                       lowered: (name.lowercased(), label.lowercased()))
        }
        let dataChanged = nextRows.map(\.slug) != rows.map(\.slug)
        let sizeChanged = iconSize != self.iconSize || sideMargin != self.sideMargin
        rows = nextRows
        self.iconSize = iconSize
        self.sideMargin = sideMargin
        if scroller != scrollerName {
            scrollerName = scroller
            attach(PageScrollers.shared.scrollView(scroller))
        }
        if dataChanged { filter() }
        if sizeChanged { setNeedsLayout() }
        if dataChanged { preload() }
    }

    /// The artwork the home's icons show (StillArt.swift): decoded once for both, at launch, so a row costs no decode.
    private static func image(_ file: String) -> UIImage? { StillArt.image(file) }
    private func preload() { StillArt.warm() }

    // MARK: layout

    private var safeTop: CGFloat { window?.safeAreaInsets.top ?? safeAreaInsets.top }
    private var safeBottom: CGFloat { window?.safeAreaInsets.bottom ?? safeAreaInsets.bottom }
    private var barBottom: CGFloat { safeTop + Pull.barTop + Pull.barHeight }
    /// Where the results start, and the height of the scroll-edge band: the fade's runway under the field.
    private var listTop: CGFloat { barBottom + Pull.listGap }
    private var cancelWidth: CGFloat { ceil(cancelButton.sizeThatFits(.zero).width) + 12 }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let w = bounds.width
        // Bounds and center, not `frame`: the list and the bar carry transforms.
        list.bounds = CGRect(origin: list.bounds.origin, size: bounds.size)
        list.center = CGPoint(x: bounds.midX, y: bounds.midY)
        band.frame = CGRect(x: 0, y: 0, width: w, height: listTop)
        edgeBlur.frame = band.bounds
        fade.frame = band.bounds
        fade.locations = [0, NSNumber(value: Double(barBottom / max(listTop, 1))), 1]
        // With the off-screen warm-up transform on, a frame assignment is the transformed rect, so it put the
        // bar back in view (the field showed for 0.4 s after the home appeared).
        let barFrame = CGRect(x: sideMargin, y: safeTop + Pull.barTop, width: max(0, w - sideMargin * 2), height: Pull.barHeight)
        bar.bounds = CGRect(origin: .zero, size: barFrame.size)
        bar.center = CGPoint(x: barFrame.midX, y: barFrame.midY)
        layoutBar()
        empty.frame = CGRect(x: sideMargin, y: listTop + 40, width: max(0, w - sideMargin * 2), height: 24)
        CATransaction.commit()
        // The keys coming up lay this view out again: the rows are re-laid out only when their geometry changed.
        let key = [w, bounds.height, listTop, safeBottom, iconSize, sideMargin, traitCollection.displayScale]
        if key != layoutKey {
            layoutKey = key
            let stride = iconSize + Pull.rowPadding * 2 + 1 / max(traitCollection.displayScale, 1)
            layout.itemSize = CGSize(width: max(0, w - sideMargin * 2), height: stride)
            layout.sectionInset = UIEdgeInsets(top: listTop, left: sideMargin, bottom: safeBottom + 40, right: sideMargin)
            layout.invalidateLayout()
        }
        render()
    }
    private var layoutKey: [CGFloat] = []

    /// The field wide with its hint centred, or narrowed for Cancel with the hint at its leading edge.
    private func layoutBar() {
        let full = bar.bounds.width
        let cancelW = cancelWidth
        let pillW = max(0, narrowed ? full - cancelW : full)
        glass.frame = CGRect(x: 0, y: 0, width: pillW, height: Pull.barHeight)
        field.frame = CGRect(x: 0, y: 0, width: pillW, height: Pull.barHeight)
        // Bounds and center: it carries a transform, under which a frame assignment lands elsewhere.
        cancelButton.bounds = CGRect(x: 0, y: 0, width: cancelW - 12, height: Pull.barHeight)
        cancelButton.center = CGPoint(x: full - (cancelW - 12) / 2, y: Pull.barHeight / 2)
        cancelButton.alpha = narrowed ? 1 : 0
        cancelButton.transform = narrowed ? .identity : CGAffineTransform(translationX: cancelW * 0.6, y: 0)
        let labelW = ceil(hintLabel.sizeThatFits(.zero).width)
        let hintW = 18 + 7 + labelW
        hint.bounds = CGRect(x: 0, y: 0, width: hintW, height: Pull.barHeight)
        let leading = narrowed || !(field.text ?? "").isEmpty
        hint.center = CGPoint(x: leading ? 16 + hintW / 2 : pillW / 2, y: Pull.barHeight / 2)
        hintGlyph.frame = CGRect(x: 0, y: (Pull.barHeight - 18) / 2, width: 18, height: 18)
        hintLabel.frame = CGRect(x: 25, y: 0, width: labelW, height: Pull.barHeight)
        hintLabel.isHidden = !(field.text ?? "").isEmpty
    }

    /// The field narrows for Cancel (or widens back) on a spring, beside the keys.
    private func focus(_ on: Bool) {
        guard on != narrowed else { return }
        narrowed = on
        UIView.animate(springDuration: Pull.focusMs, bounce: 0, initialSpringVelocity: 0,
                       delay: 0, options: [.allowUserInteraction, .beginFromCurrentState]) {
            // Frames only: the glass's effect view follows by autoresizing, with no layout pass in the block.
            self.layoutBar()
        }
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        tick.prepare()
        // The glass is created only once it can be seen (GlassPane.swift: ~15 ms on the simulator, the first glass of the
        // process): show it once, off screen, so the first pull does not pay for it. Not in the home's first 3 s, when the
        // first frames and the other pages are being made, and not under a finger.
        warmGlass(after: 3.2)
        warmKeys(after: 4.5)
    }

    /// The first focus of the process starts the text system (seconds on a loaded simulator, ~0.1 s on a phone):
    /// a field off screen takes the focus once with an empty input view, so no key shows, and gives it back at once.
    /// After the glass, never under a finger or a demo, never while another field has the keys.
    private var keysWarm = false
    private func warmKeys(after delay: Double) {
        guard !keysWarm else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, let window = self.window, !self.keysWarm else { return }
            let busy = self.reveal > 0 || self.committed || window.rootViewController?.presentedViewController != nil
                || (self.scroll.map { $0.isTracking || $0.isDragging || $0.isDecelerating } ?? false)
            if busy { self.warmKeys(after: 0.5); return }
            self.keysWarm = true
            let probe = UITextField(frame: CGRect(x: -200, y: -200, width: 10, height: 10))
            probe.inputView = UIView(frame: .zero)
            probe.inputAccessoryView = nil
            probe.autocorrectionType = .no
            probe.spellCheckingType = .no
            probe.keyboardAppearance = .dark
            probe.isAccessibilityElement = false
            self.addSubview(probe)
            let t0 = CACurrentMediaTime()
            let ok = probe.becomeFirstResponder()
            probe.resignFirstResponder()
            probe.removeFromSuperview()
            Self.trace(String(format: "keys warmed %d in %.1f ms", ok ? 1 : 0, (CACurrentMediaTime() - t0) * 1000))
        }
    }

    private var glassWarm = false
    private func warmGlass(after delay: Double) {
        guard !glassWarm else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, self.window != nil, !self.glassWarm else { return }
            if reveal > 0 || self.committed { self.glassWarm = true; return }
            if let scroll = self.scroll, scroll.isTracking || scroll.isDragging || scroll.isDecelerating { self.warmGlass(after: 0.3); return }
            self.glassWarm = true
            self.bar.isHidden = false
            self.bar.alpha = 1
            self.bar.transform = CGAffineTransform(translationX: 0, y: -400)
            // Narrowed, with Cancel drawn: the release's first narrowing then costs no first glass resize or text.
            self.narrowed = true
            self.setNeedsLayout()
            self.layoutIfNeeded()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
                guard let self else { return }
                if !self.committed {
                    self.narrowed = false
                    CATransaction.begin()
                    CATransaction.setDisableActions(true)
                    self.layoutBar()
                    CATransaction.commit()
                }
                self.bar.transform = .identity
                self.renderNow()
            }
        }
    }

    // MARK: the look: one value in, layer properties out

    private struct Look {
        var blur: CGFloat, dim: Float, bar: Float, barY: CGFloat, list: Float, listY: CGFloat, band: Float
    }

    private func look(_ r: CGFloat, _ p: CGFloat) -> Look {
        let b = span(r, Pull.blur)
        let fp = span(r, Pull.field)
        let lp = span(r, Pull.list)
        return Look(blur: Pull.blurRadius * pow(b, Pull.blurPower), dim: Float(pow(clamp01(r), Pull.dimPower) * Pull.maxDim),
                    bar: Float(fp), barY: -16 * (1 - fp) + p * Pull.fieldRide,
                    list: Float(smooth(lp)), listY: -16 * (1 - lp) + p * Pull.listRide,
                    band: Float(fp))
    }

    /// Sets the model values for (reveal, pull): the caller holds actions off.
    private func put(_ l: Look, blurScaleFor: CGFloat? = nil) {
        // A view that ends at nothing hides (no pass for it), but never while a run still shows it on its way there:
        // a layout mid-run (the keys going down lay the view out) hid the results and the blur in one frame.
        func show(_ v: UIView, _ on: Bool) { if on { v.isHidden = false } else if run == nil { v.isHidden = true } }
        blur.set(l.blur, hide: run == nil, scaleFor: blurScaleFor ?? (run == nil ? nil : runBlurScaleFor))
        show(dim, l.dim > 0.001)
        dim.layer.opacity = l.dim
        // The warm-up holds the bar off screen for 0.4 s: leave it there.
        if bar.transform.ty > -100 {
            show(bar, l.bar > 0.001)
            // UIView's alpha, never the layer's opacity or a keyframe on it: the glass inside stops drawing under those.
            bar.alpha = CGFloat(l.bar)
            bar.transform = CGAffineTransform(translationX: 0, y: l.barY)
        }
        show(band, l.band > 0.001)
        band.layer.opacity = l.band
        show(list, l.list > 0.001)
        list.layer.opacity = l.list
        list.layer.transform = CATransform3DMakeTranslation(0, l.listY, 0)
        empty.layer.opacity = l.list
    }

    private func render() { put(look(reveal, pull)) }

    private func renderNow() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        render()
        CATransaction.commit()
    }

    private static let runKey = "search"
    /// Launch argument `-searchTrace YES`: the keyboard's timings, one line each.
    private static let tracing = UserDefaults.standard.bool(forKey: "searchTrace")
    private static func trace(_ line: @autoclosure () -> String) { if tracing { NSLog("[SEARCH] %@", line()) } }

    /// The layers a run animates, and their key paths.
    private var runLayers: [CALayer] {
        [blur.animated, dim.layer, band.layer, list.layer, empty.layer].compactMap { $0 }
    }

    /// Where a run handed to Core Animation is now: its keyframes go, the model takes that pose.
    private func stopRun() {
        runGen += 1
        guard let r = run else { return }
        run = nil
        let now = r.at(CACurrentMediaTime())
        reveal = now.r
        pull = now.p
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for layer in runLayers { layer.removeAnimation(forKey: Self.runKey + ".a"); layer.removeAnimation(forKey: Self.runKey + ".b") }
        if bar.transform.ty > -100 { bar.layer.removeAllAnimations() }
        render()
        CATransaction.commit()
    }

    /// Hands the way from here to (reveal, pull) to Core Animation as keyframes, sampled from the same look
    /// the finger drives, so every layer keeps its own window of the reveal.
    private func animate(reveal to: CGFloat, pull pullTo: CGFloat, ms: Double, delay: Double = 0,
                         curve: @escaping (CGFloat) -> CGFloat, then: (() -> Void)?) {
        stopRun()
        let start = CACurrentMediaTime() + delay
        let r = Run(from: (reveal, pull), to: (to, pullTo), start: start, duration: ms, curve: curve)
        let n = max(2, Int((ms * Pull.rate).rounded()) + 1)
        let looks: [Look] = (0..<n).map { i in
            let v = r.at(start + ms * Double(i) / Double(n - 1))
            return look(v.r, v.p)
        }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        // Everything the run passes through is shown for it; what ends at nothing hides at the end.
        let peak = (blur: looks.map(\.blur).max() ?? 0, dim: looks.map(\.dim).max() ?? 0, bar: looks.map(\.bar).max() ?? 0,
                    band: looks.map(\.band).max() ?? 0, list: looks.map(\.list).max() ?? 0)
        func add(_ layer: CALayer?, _ path: String, _ key: String, _ values: [Any]) {
            guard let layer else { return }
            let a = CAKeyframeAnimation(keyPath: path)
            a.values = values
            a.duration = ms
            // In the layer's own time: an ancestor's timing would shift a raw media time.
            a.beginTime = layer.convertTime(start, from: nil)
            a.calculationMode = .linear
            a.fillMode = .both
            a.isRemovedOnCompletion = true
            a.preferredFrameRateRange = CAFrameRateRange(minimum: 80, maximum: 120, preferred: 120)
            layer.add(a, forKey: Self.runKey + key)
        }
        let final = looks[n - 1]
        reveal = to
        pull = pullTo
        // A run that passes through a narrow blur is sampled at the screen's scale all the way (the backdrop's
        // scale is not animatable); the end's render drops it to 1x once the blur rests wide.
        runBlurScaleFor = min(looks[0].blur, final.blur)
        put(final, blurScaleFor: runBlurScaleFor)
        if peak.blur > 0.05 { blur.isHidden = false }
        if peak.dim > 0.001 { dim.isHidden = false }
        if peak.bar > 0.001, bar.transform.ty > -100 { bar.isHidden = false }
        if peak.band > 0.001 { band.isHidden = false }
        if peak.list > 0.001 { list.isHidden = false }
        let blurFrames = blur.keyframes(looks.map(\.blur))
        add(blur.animated, blurFrames.path, ".a", blurFrames.values)
        add(dim.layer, "opacity", ".a", looks.map(\.dim))
        if bar.transform.ty > -100 {
            bar.alpha = CGFloat(looks[0].bar)
            bar.transform = CGAffineTransform(translationX: 0, y: looks[0].barY)
        }
        add(band.layer, "opacity", ".a", looks.map(\.band))
        add(list.layer, "opacity", ".a", looks.map(\.list))
        add(list.layer, "transform", ".b", looks.map { NSValue(caTransform3D: CATransform3DMakeTranslation(0, $0.listY, 0)) })
        add(empty.layer, "opacity", ".a", looks.map(\.list))
        CATransaction.commit()
        // The bar (it holds the glass) through UIKit's own animation, outside the transaction that holds actions off.
        if bar.transform.ty > -100 {
            UIView.animate(withDuration: ms, delay: delay, options: [to > r.from.r ? .curveEaseOut : .curveEaseInOut, .allowUserInteraction]) {
                self.bar.alpha = CGFloat(final.bar)
                self.bar.transform = CGAffineTransform(translationX: 0, y: final.barY)
            }
        }
        run = r
        let gen = runGen
        DispatchQueue.main.asyncAfter(deadline: .now() + delay + ms) { [weak self] in
            guard let self, self.runGen == gen else { return }
            self.run = nil
            // The hidden flags of the end pose (a blur at 0 costs no pass).
            self.renderNow()
            then?()
        }
    }

    // MARK: hit testing: the home keeps every touch until the search is committed

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard committed else { return nil }
        return super.hitTest(point, with: event) ?? self
    }

    // MARK: the pager

    @objc private func scrollerChanged(_ note: Notification) {
        guard (note.userInfo?["name"] as? String) == scrollerName else { return }
        attach(PageScrollers.shared.scrollView(scrollerName))
    }

    private func attach(_ next: UIScrollView?) {
        guard next !== scroll else { return }
        scroll?.removeGestureRecognizer(recognizer)
        scroll = next
        next?.addGestureRecognizer(recognizer)
        recognizer.isEnabled = !committed
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        g === recognizer
    }

    /// Not while a demo's route is still presented (a close hands it back 0.3 s after the release): a result opened
    /// then would push a route over one still leaving.
    override func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
        guard g === recognizer else { return super.gestureRecognizerShouldBegin(g) }
        return window?.rootViewController?.presentedViewController == nil
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard g !== recognizer else { return true }
        // A tap on nothing: the dim, or the list's empty room (a row, the field and Cancel take their own).
        return touch.view === self || touch.view === list
    }

    /// Posted when a pull takes hold: a demo card still landing on the home (DemoLaunch.swift) lands at once.
    static let pullBegan = Notification.Name("DemosSearchPullBegan")

    @objc private func pulled(_ g: SearchPullRecognizer) {
        switch g.state {
        case .began:
            watchFrames("pull", from: CACurrentMediaTime())
            armed = false
            stopRun()
            tick.prepare()
            NotificationCenter.default.post(name: Self.pullBegan, object: self)
            // The pager must not take the same finger sideways while the pull has it.
            if let pan = scroll?.panGestureRecognizer { scrollPanWasEnabled = pan.isEnabled; pan.isEnabled = false }
            follow(g)
        case .changed:
            follow(g)
        case .ended:
            restorePager()
            if armed || g.velocity > Pull.flick {
                if !armed { tick.impactOccurred() }
                commit()
            } else { endFrameWatch(); settleBack() }
        case .cancelled, .failed:
            restorePager()
            endFrameWatch()
            settleBack()
        default: break
        }
    }

    /// One touch: two numbers, one layer pass, no animation.
    private func follow(_ g: SearchPullRecognizer) {
        // Measured from where the pull took hold (22 pt down): from the finger's start, its first frame was
        // already a fifth of the reveal. The reveal is whole where the trigger arms.
        func damp(_ x: CGFloat) -> CGFloat { Pull.rubber * (1 - exp(-max(0, x) / Pull.rubber)) }
        let p = damp(g.travel - Pull.activate)
        let r = min(p / damp(Pull.trigger - Pull.activate), 1)
        if r != reveal || p != pull {
            let t0 = Self.tracing ? CACurrentMediaTime() : 0
            reveal = r
            pull = p
            renderNow()
            if Self.tracing { touchCosts.append((CACurrentMediaTime() - t0) * 1000) }
        }
        if !armed, g.travel > Pull.trigger {
            armed = true
            tick.impactOccurred()
        } else if armed, g.travel < Pull.trigger * Pull.disarm {
            armed = false
            select.selectionChanged()
        }
    }

    private func restorePager() { scroll?.panGestureRecognizer.isEnabled = scrollPanWasEnabled }

    // MARK: the states

    /// Launch argument `-searchKeysEarly YES`: the keyboard is asked for on the turn after the release, as before,
    /// for an A/B of the release's frames.
    private static let keysEarly = UserDefaults.standard.bool(forKey: "searchKeysEarly")

    private func commit() {
        committed = true
        recognizer.isEnabled = false
        let t0 = CACurrentMediaTime()
        watchFrames("release", from: t0, for: Pull.commitMs + 0.25)
        // The keyboard's first responder blocks the main thread (~0.1 s on a phone, seconds on a loaded simulator)
        // and the field's glass and Cancel are drawn by UIKit on that thread: asked for during the settle, it froze
        // them mid-way. The keys rise once the field has landed.
        animate(reveal: 1, pull: 0, ms: Pull.commitMs, curve: easeOutCubic) { [weak self] in
            if !Self.keysEarly { self?.takeKeys(since: t0) }
        }
        let t1 = CACurrentMediaTime()
        focus(true)
        let t2 = CACurrentMediaTime()
        // The motion is committed before any other main-thread work: it runs on the render server.
        CATransaction.flush()
        if Self.keysEarly { DispatchQueue.main.async { [weak self] in self?.takeKeys(since: t0) } }
        let t3 = CACurrentMediaTime()
        Self.trace(String(format: "commit %.1f ms (run %.1f, field %.1f, flush %.1f)", (t3 - t0) * 1000,
                          (t1 - t0) * 1000, (t2 - t1) * 1000, (t3 - t2) * 1000))
    }

    /// Interactive glass, as the system's controls (it swells and shimmers under the finger), only while the
    /// search is open: the effect is set again, so it is done at rest, never under the pull.
    private func glassInteractive(_ on: Bool) {
        guard glass.style.interactive != on, !Self.glassStatic else { return }
        let t0 = CACurrentMediaTime()
        UIView.performWithoutAnimation { glass.style.interactive = on }
        Self.trace(String(format: "glass interactive %d in %.1f ms", on ? 1 : 0, (CACurrentMediaTime() - t0) * 1000))
    }
    /// Launch argument `-searchGlassStatic YES`: the field's glass is never interactive, for an A/B.
    private static let glassStatic = UserDefaults.standard.bool(forKey: "searchGlassStatic")

    private func takeKeys(since t0: CFTimeInterval) {
        guard committed else { return }
        glassInteractive(true)
        let t1 = CACurrentMediaTime()
        let ok = field.becomeFirstResponder()
        Self.trace(String(format: "focus %d after %.1f ms, becomeFirstResponder %.1f ms", ok ? 1 : 0, (t1 - t0) * 1000, (CACurrentMediaTime() - t1) * 1000))
    }

    /// With `-searchTrace YES`: the main thread's frame gaps over a stretch (the pull, the release and its settle,
    /// a scroll of the results, the dismissal), one line each, so a stall shows as a number.
    private var frameWatch: CADisplayLink?
    private var frameWatchLabel = ""
    private var frameWatchStart: CFTimeInterval = 0
    private var frameWatchLast: CFTimeInterval = 0
    private var frameWatchUntil: CFTimeInterval = .infinity
    private var frameGaps: [Double] = []
    private var frameEnds: [Double] = []
    private var frameMs: Double = 1000 / 60
    /// Main-thread time of each touch the pull handled (ms).
    private var touchCosts: [Double] = []
    private func watchFrames(_ label: String, from t0: CFTimeInterval, for seconds: Double = .infinity) {
        guard Self.tracing else { return }
        endFrameWatch()
        frameWatchLabel = label
        frameWatchStart = t0
        frameWatchLast = t0
        frameWatchUntil = t0 + seconds
        frameGaps = []
        frameEnds = []
        touchCosts = []
        let link = CADisplayLink(target: FrameWatchTicker(self), selector: #selector(FrameWatchTicker.tick(_:)))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 80, maximum: 120, preferred: 120)
        link.add(to: .main, forMode: .common)
        frameWatch = link
    }
    fileprivate func frameTick(_ link: CADisplayLink) {
        let now = CACurrentMediaTime()
        if link.duration > 0 { frameMs = link.duration * 1000 }
        frameGaps.append((now - frameWatchLast) * 1000)
        frameEnds.append((now - frameWatchStart) * 1000)
        frameWatchLast = now
        if now >= frameWatchUntil { endFrameWatch() }
    }
    private func endFrameWatch() {
        guard let link = frameWatch else { return }
        link.invalidate()
        frameWatch = nil
        // Each gap over 1.5 frames as length@end, in ms from the start.
        let frame = frameMs
        let over = zip(frameGaps, frameEnds).filter { $0.0 > frame * 1.5 }
        let touches = touchCosts.isEmpty ? "" : String(format: ", touches %d, cost avg %.2f max %.2f first %.2f ms", touchCosts.count,
                                                       touchCosts.reduce(0, +) / Double(touchCosts.count), touchCosts.max() ?? 0, touchCosts[0])
        Self.trace(String(format: "%@ frames %d in %.0f ms, max gap %.1f ms, gaps > %.0f ms: %d (%@)%@", frameWatchLabel, frameGaps.count,
                          frameEnds.last ?? 0, frameGaps.max() ?? 0, frame * 1.5, over.count,
                          over.prefix(12).map { String(format: "%.0f@%.0f", $0.0, $0.1) }.joined(separator: " "), touches))
    }

    private func settleBack() {
        animate(reveal: 0, pull: 0, ms: Pull.backMs, curve: easeInOutQuad, then: nil)
    }

    @objc private func cancelTapped() { dismiss() }
    @objc private func tappedOutside() { if committed { dismiss() } }

    private func dismiss() {
        guard committed else { return }
        select.selectionChanged()
        watchFrames("dismiss", from: CACurrentMediaTime(), for: Pull.exitDelay + Pull.exitMs + 0.25)
        // The keys go down and the field widens first; the results and the blur follow them out.
        field.resignFirstResponder()
        focus(false)
        animate(reveal: 0, pull: 0, ms: Pull.exitMs, delay: Pull.exitDelay, curve: easeInOutCubic) { [weak self] in
            guard let self else { return }
            self.committed = false
            self.glassInteractive(false)
            self.recognizer.isEnabled = true
            self.field.text = ""
            self.filter()
            self.list.setContentOffset(.zero, animated: false)
            self.layoutBar()
        }
    }

    // MARK: the field

    /// Never focused under a demo: UIKit hands first responder back to the field when the demo's
    /// route is presented over the home, and the keyboard came up over the opening demo.
    private var mayFocus: Bool {
        committed && window?.rootViewController?.presentedViewController == nil
    }

    func textFieldDidBeginEditing(_ textField: UITextField) {
        if !mayFocus { textField.resignFirstResponder() }
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        textField.resignFirstResponder()
        return true
    }

    @objc private func queryChanged() {
        filter()
        list.setContentOffset(.zero, animated: false)
        hintLabel.isHidden = !(field.text ?? "").isEmpty
    }

    private func filter() {
        let q = (field.text ?? "").trimmingCharacters(in: .whitespaces).lowercased()
        // The name and the short label (the name on the grid), in the home's order.
        results = q.isEmpty ? rows : rows.filter { $0.lowered.name.contains(q) || $0.lowered.label.contains(q) }
        list.reloadData()
        empty.isHidden = !results.isEmpty
        empty.text = results.isEmpty ? "No Results" : nil
    }

    /// The keys cover the results' bottom: the list scrolls its last row above them. The view itself stays
    /// whole (the home overlays the keys, app.contract), so the blurred home runs under the keys to the edge.
    @objc private func keyboardMoved(_ note: Notification) {
        guard let end = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect, window != nil else { return }
        let overlap = max(0, bounds.maxY - convert(end, from: nil).minY)
        guard overlap != keyboardOverlap else { return }
        keyboardOverlap = overlap
        list.contentInset.bottom = overlap
        list.verticalScrollIndicatorInsets.bottom = overlap
    }

    // MARK: the results

    func collectionView(_ c: UICollectionView, numberOfItemsInSection section: Int) -> Int { results.count }

    func collectionView(_ c: UICollectionView, cellForItemAt path: IndexPath) -> UICollectionViewCell {
        let cell = c.dequeueReusableCell(withReuseIdentifier: ResultCell.reuse, for: path) as! ResultCell
        let row = results[path.item]
        cell.iconSize = iconSize
        cell.icon.image = Self.image(row.icon)
        cell.name.text = row.name
        cell.icon.isHidden = false
        cell.icon.alpha = 1
        cell.name.alpha = 1
        return cell
    }

    func scrollViewWillBeginDragging(_ s: UIScrollView) {
        if s === list { watchFrames("scroll", from: CACurrentMediaTime()) }
    }
    func scrollViewDidEndDragging(_ s: UIScrollView, willDecelerate decelerate: Bool) {
        if s === list, !decelerate { endFrameWatch() }
    }
    func scrollViewDidEndDecelerating(_ s: UIScrollView) {
        if s === list { endFrameWatch() }
    }

    func collectionView(_ c: UICollectionView, didSelectItemAt path: IndexPath) {
        guard path.item < results.count, let cell = c.cellForItem(at: path) as? ResultCell else { return }
        let slug = results[path.item].slug
        // The demo opens out of this row's icon, and closes back into it.
        LaunchIcons.shared.touch(cell.icon, slug: slug)
        onPick(slug)
        // After the open has started: taking the keyboard down is a main-thread cost the card must not wait for.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in self?.field.resignFirstResponder() }
    }
}

/// A weak target, so the display link does not keep the view alive.
private final class FrameWatchTicker: NSObject {
    private weak var view: SearchRevealView?
    init(_ view: SearchRevealView) { self.view = view }
    @objc func tick(_ link: CADisplayLink) {
        if let view { view.frameTick(link) } else { link.invalidate() }
    }
}

final class SearchReveal: ExactNativeInstance {
    private let search = SearchRevealView()

    init(props: [String: String], events: ExactNativeEvents) {
        super.init(events: events)
        search.onPick = { slug in events.change(slug) }
        try? setProps(props)
    }

    override var view: ExactNativeView { search }

    override func setProps(_ props: [String: String]) throws {
        func list(_ key: String) -> [String] {
            (props[key] ?? "").split(separator: "|", omittingEmptySubsequences: false).map(String.init)
        }
        func number(_ key: String, _ fallback: CGFloat) -> CGFloat {
            guard let text = props[key], let value = Double(text), value.isFinite else { return fallback }
            return CGFloat(value)
        }
        let slugs = (props["slugs"] ?? "").isEmpty ? [] : list("slugs")
        search.configure(scroller: props["scroller"] ?? "", slugs: slugs, names: list("names"), labels: list("labels"),
                         icons: list("icons"), iconSize: number("icon-size", 62), sideMargin: number("side-margin", 22))
    }
}
#endif

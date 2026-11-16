// `search-reveal`: the home's pull-to-search, native from the finger to the pixels.
//
// A downward pull on the pager (the `page-scroller` hatch, springboard.contract) drives one `reveal`
// value 0...1 over 100 pt of damped travel. Each touch move sets layer properties only (the home's
// two blur passes, a dim, the field, the results), with actions disabled: nothing is committed to
// the Contract plan, nothing reaches Rust. Released past the trigger (or flicked) the reveal runs
// to 1 on a display link and the field takes the keyboard; released short it runs back to 0.
//
// The view holds everything the search shows: the two blur passes and the dim over the home, the
// results (a UICollectionView of icon + name rows, filtered by the field with no round trip), the
// scroll-edge blur under the field, the glass field (a real UITextField) and its Cancel. Only a
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
    /// The reveal's windows: the field and its Cancel, then the results.
    static let field: (CGFloat, CGFloat) = (0.2, 0.6)
    static let list: (CGFloat, CGFloat) = (0.55, 1)
    static let extraBlur: (CGFloat, CGFloat) = (0.5, 1)
    static let commitMs = 0.32, commitPullMs = 0.34, backMs = 0.26, exitMs = 0.30
    static let barHeight: CGFloat = 48
    static let barTop: CGFloat = 10
    static let listGap: CGFloat = 24
    static let rowPadding: CGFloat = 7
    static let edgeBlur: CGFloat = 28
    static let maxDim: CGFloat = 0.3
}

private func clamp01(_ x: CGFloat) -> CGFloat { min(1, max(0, x)) }
private func span(_ x: CGFloat, _ r: (CGFloat, CGFloat)) -> CGFloat { clamp01((x - r.0) / (r.1 - r.0)) }
private func smooth(_ t: CGFloat) -> CGFloat { t * t * (3 - 2 * t) }
private func easeOutCubic(_ t: CGFloat) -> CGFloat { 1 - pow(1 - t, 3) }
private func easeInCubic(_ t: CGFloat) -> CGFloat { t * t * t }
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

// MARK: - The home's blur: one UIVisualEffectView, its paused animator made once

private final class SearchBlurPass: UIVisualEffectView {
    private var animator: UIViewPropertyAnimator?
    /// This material at fraction 1 blurs at sigma 31 pt: the same calibration as the launch's home blur.
    private static let fullFraction: CGFloat = 0.85
    var amount: CGFloat = 0 { didSet { if amount != oldValue { apply() } } }

    init() {
        super.init(effect: nil)
        isUserInteractionEnabled = false
    }
    required init?(coder: NSCoder) { nil }
    deinit { animator?.stopAnimation(true) }

    /// Made once the view is in a window: a paused animator made before shows the whole effect.
    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil, animator == nil else { return }
        effect = nil
        let a = UIViewPropertyAnimator(duration: 1, curve: .linear) { [unowned self] in
            self.effect = UIBlurEffect(style: .systemUltraThinMaterialDark)
        }
        a.pausesOnCompletion = true
        animator = a
        apply()
    }
    private func apply() { animator?.fractionComplete = clamp01(amount) * Self.fullFraction }
}

// MARK: - The field

private final class SearchField: UITextField {
    var allowsFocus: () -> Bool = { true }
    override var canBecomeFirstResponder: Bool { allowsFocus() && super.canBecomeFirstResponder }

    private var textBox: (CGRect) -> CGRect { { $0.inset(by: UIEdgeInsets(top: 0, left: 41, bottom: 0, right: 10)) } }
    override func textRect(forBounds bounds: CGRect) -> CGRect { textBox(bounds) }
    override func editingRect(forBounds bounds: CGRect) -> CGRect { textBox(bounds) }
    override func placeholderRect(forBounds bounds: CGRect) -> CGRect { textBox(bounds) }
    override func leftViewRect(forBounds bounds: CGRect) -> CGRect {
        CGRect(x: 16, y: (bounds.height - 18) / 2, width: 18, height: 18)
    }
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

    // State: `reveal` is the one value everything reads; `pull` the rubber-band the results ride.
    private var reveal: CGFloat = 0
    private var pull: CGFloat = 0
    /// Both move in one frame: one render, not one per value.
    private func put(reveal r: CGFloat, pull p: CGFloat) {
        guard r != reveal || p != pull else { return }
        reveal = r
        pull = p
        render()
    }
    private var committed = false
    private var armed = false

    // Subviews, back to front
    private let blurLead = SearchBlurPass()
    private let blurExtra = SearchBlurPass()
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
    private let cancelButton = SlopButton(type: .system)

    // The pull
    private let recognizer = SearchPullRecognizer()
    private weak var scroll: UIScrollView?
    private var scrollPanWasEnabled = true
    private let tick = UIImpactFeedbackGenerator(style: .light)
    private let select = UISelectionFeedbackGenerator()

    // The tweens
    private struct Tween {
        var from: CGFloat, to: CGFloat, start: CFTimeInterval, duration: CFTimeInterval
        var curve: (CGFloat) -> CGFloat
        func value(_ now: CFTimeInterval) -> (CGFloat, Bool) {
            let t = clamp01(CGFloat((now - start) / duration))
            return (from + (to - from) * curve(t), t >= 1)
        }
    }
    private var revealTween: Tween?
    private var pullTween: Tween?
    private var link: CADisplayLink?
    private var whenSettled: (() -> Void)?
    private var keyboardOverlap: CGFloat = 0

    override init(frame: CGRect) {
        let flow = UICollectionViewFlowLayout()
        layout = flow
        list = UICollectionView(frame: .zero, collectionViewLayout: flow)
        super.init(frame: frame)
        backgroundColor = .clear
        clipsToBounds = false

        for pass in [blurLead, blurExtra] { pass.frame = bounds; pass.autoresizingMask = [.flexibleWidth, .flexibleHeight]; addSubview(pass) }
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
        list.keyboardDismissMode = .onDrag
        list.contentInsetAdjustmentBehavior = .never
        addSubview(list)

        empty.textColor = UIColor(white: 1, alpha: 0.55)
        empty.font = .systemFont(ofSize: 17, weight: .medium)
        empty.textAlignment = .center
        empty.isHidden = true
        addSubview(empty)

        band.isUserInteractionEnabled = false
        edgeBlur.configure(VariableBlurView.Ramp(radius: Pull.edgeBlur, start: 0, end: 1, up: true))
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
            return s
        }()
        bar.addSubview(glass)
        field.delegate = self
        field.allowsFocus = { [weak self] in self?.mayFocus ?? false }
        field.font = .systemFont(ofSize: 17)
        field.textColor = .white
        field.attributedPlaceholder = NSAttributedString(
            string: "Search", attributes: [.foregroundColor: UIColor(red: 142 / 255, green: 142 / 255, blue: 147 / 255, alpha: 1)])
        field.autocorrectionType = .no
        field.autocapitalizationType = .none
        field.spellCheckingType = .no
        field.returnKeyType = .search
        field.clearButtonMode = .whileEditing
        field.keyboardAppearance = .dark
        let glyph = UIImageView(image: UIImage(systemName: "magnifyingglass",
            withConfiguration: UIImage.SymbolConfiguration(pointSize: 18, weight: .regular)))
        glyph.tintColor = UIColor(red: 142 / 255, green: 142 / 255, blue: 147 / 255, alpha: 1)
        glyph.contentMode = .center
        field.leftView = glyph
        field.leftViewMode = .always
        field.addTarget(self, action: #selector(queryChanged), for: .editingChanged)
        bar.addSubview(field)
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
        link?.invalidate()
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

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let w = bounds.width
        let stride = iconSize + Pull.rowPadding * 2 + 1 / max(traitCollection.displayScale, 1)
        layout.itemSize = CGSize(width: max(0, w - sideMargin * 2), height: stride)
        layout.sectionInset = UIEdgeInsets(top: listTop, left: sideMargin, bottom: safeBottom + 40, right: sideMargin)
        list.frame = bounds
        band.frame = CGRect(x: 0, y: 0, width: w, height: listTop)
        edgeBlur.frame = band.bounds
        fade.frame = band.bounds
        fade.locations = [0, NSNumber(value: Double(barBottom / max(listTop, 1))), 1]
        let cancelW = ceil(cancelButton.sizeThatFits(.zero).width) + 12
        // Bounds and center, not `frame`: with the off-screen warm-up transform on, a frame assignment is the transformed
        // rect, so it put the bar back in view (the field showed for 0.4 s after the home appeared).
        let barFrame = CGRect(x: sideMargin, y: safeTop + Pull.barTop, width: max(0, w - sideMargin * 2), height: Pull.barHeight)
        bar.bounds = CGRect(origin: .zero, size: barFrame.size)
        bar.center = CGPoint(x: barFrame.midX, y: barFrame.midY)
        let pillW = max(0, bar.bounds.width - cancelW)
        glass.frame = CGRect(x: 0, y: 0, width: pillW, height: Pull.barHeight)
        field.frame = glass.frame
        cancelButton.frame = CGRect(x: pillW + 12, y: 0, width: cancelW - 12, height: Pull.barHeight)
        empty.frame = CGRect(x: sideMargin, y: listTop + 40, width: max(0, w - sideMargin * 2), height: 24)
        CATransaction.commit()
        layout.invalidateLayout()
        render()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        // The glass is created only once it can be seen (GlassPane.swift): show it once, off screen.
        bar.isHidden = false
        bar.alpha = 1
        bar.transform = CGAffineTransform(translationX: 0, y: -400)
        setNeedsLayout()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            self?.bar.transform = .identity
            self?.render()
        }
        tick.prepare()
    }

    // MARK: the render: layer properties only, no implicit animations

    private func render() {
        let lead = smooth(clamp01(reveal))
        blurLead.amount = lead * lead
        blurExtra.amount = smooth(span(reveal, Pull.extraBlur))
        dim.alpha = lead * lead * Pull.maxDim
        let fp = span(reveal, Pull.field)
        let lp = span(reveal, Pull.list)
        let barOff = bar.transform.ty < -100
        if !barOff {
            bar.isHidden = fp <= 0.001
            bar.alpha = fp
            bar.transform = CGAffineTransform(translationX: 0, y: -16 * (1 - fp))
        }
        cancelButton.alpha = fp
        band.isHidden = fp <= 0.001
        band.alpha = fp
        list.isHidden = lp <= 0.001
        list.alpha = lp
        list.transform = CGAffineTransform(translationX: 0, y: -20 * (1 - lp) + pull)
        empty.alpha = lp
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

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard g !== recognizer else { return true }
        // A tap on nothing: the dim, or the list's empty room (a row, the field and Cancel take their own).
        return touch.view === self || touch.view === list
    }

    @objc private func pulled(_ g: SearchPullRecognizer) {
        switch g.state {
        case .began:
            armed = false
            stopTweens()
            tick.prepare()
            // The pager must not take the same finger sideways while the pull has it.
            if let pan = scroll?.panGestureRecognizer { scrollPanWasEnabled = pan.isEnabled; pan.isEnabled = false }
        case .changed:
            let p = Pull.rubber * (1 - exp(-g.travel / Pull.rubber))
            put(reveal: min(p / Pull.trigger, 1), pull: p)
            if !armed, g.travel > Pull.trigger {
                armed = true
                tick.impactOccurred()
            } else if armed, g.travel < Pull.trigger * Pull.disarm {
                armed = false
                select.selectionChanged()
            }
        case .ended:
            restorePager()
            if armed || g.velocity > Pull.flick {
                if !armed { tick.impactOccurred() }
                commit()
            } else { settleBack() }
        case .cancelled, .failed:
            restorePager()
            settleBack()
        default: break
        }
    }

    private func restorePager() { scroll?.panGestureRecognizer.isEnabled = scrollPanWasEnabled }

    // MARK: the states

    private func commit() {
        committed = true
        recognizer.isEnabled = false
        run(reveal: 1, ms: Pull.commitMs, curve: easeOutCubic, pull: 0, pullMs: Pull.commitPullMs) { [weak self] in
            guard let self, self.committed else { return }
            // The keyboard rises once the reveal has landed: its first appearance is a main-thread cost.
            self.field.becomeFirstResponder()
        }
    }

    private func settleBack() {
        run(reveal: 0, ms: Pull.backMs, curve: easeInOutQuad, pull: 0, pullMs: Pull.backMs, then: nil)
    }

    @objc private func cancelTapped() { dismiss() }
    @objc private func tappedOutside() { if committed { dismiss() } }

    private func dismiss() {
        guard committed else { return }
        select.selectionChanged()
        field.resignFirstResponder()
        run(reveal: 0, ms: Pull.exitMs, curve: easeInCubic, pull: 0, pullMs: Pull.exitMs) { [weak self] in
            guard let self else { return }
            self.committed = false
            self.recognizer.isEnabled = true
            self.field.text = ""
            self.filter()
            self.list.setContentOffset(.zero, animated: false)
        }
    }

    // MARK: tweens on one display link, in time and not in steps: a late frame jumps, it does not slow

    private func run(reveal to: CGFloat, ms: Double, curve: @escaping (CGFloat) -> CGFloat,
                     pull pullTo: CGFloat, pullMs: Double, then: (() -> Void)?) {
        let now = CACurrentMediaTime()
        revealTween = Tween(from: reveal, to: to, start: now, duration: ms, curve: curve)
        pullTween = Tween(from: pull, to: pullTo, start: now, duration: pullMs, curve: easeOutCubic)
        whenSettled = then
        if link == nil {
            let l = CADisplayLink(target: LinkTarget(self), selector: #selector(LinkTarget.step(_:)))
            l.preferredFrameRateRange = CAFrameRateRange(minimum: 80, maximum: 120, preferred: 120)
            l.add(to: .main, forMode: .common)
            link = l
        }
        link?.isPaused = false
    }

    private func stopTweens() {
        revealTween = nil
        pullTween = nil
        whenSettled = nil
        link?.isPaused = true
    }

    fileprivate func step() {
        let now = CACurrentMediaTime()
        var done = true
        var r = reveal, p = pull
        if let t = revealTween {
            let (v, end) = t.value(now)
            r = v
            if end { revealTween = nil } else { done = false }
        }
        if let t = pullTween {
            let (v, end) = t.value(now)
            p = v
            if end { pullTween = nil } else { done = false }
        }
        put(reveal: r, pull: p)
        if done {
            link?.isPaused = true
            let finished = whenSettled
            whenSettled = nil
            finished?()
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
    }

    private func filter() {
        let q = (field.text ?? "").trimmingCharacters(in: .whitespaces).lowercased()
        // The name and the short label (the name on the grid), in the home's order.
        results = q.isEmpty ? rows : rows.filter { $0.lowered.name.contains(q) || $0.lowered.label.contains(q) }
        list.reloadData()
        empty.isHidden = !results.isEmpty
        empty.text = results.isEmpty ? "No Results" : nil
    }

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
private final class LinkTarget: NSObject {
    private weak var view: SearchRevealView?
    init(_ view: SearchRevealView) { self.view = view }
    @objc func step(_ link: CADisplayLink) { view?.step() }
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

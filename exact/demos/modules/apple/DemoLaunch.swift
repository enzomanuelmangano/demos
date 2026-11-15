// The demo screen's open and close, drawn like iOS's app launch and its swipe home.
//
// Open: a card holding the app grows out of the tapped icon; its width, aspect and centre each run
// their own spring. The icon's artwork cross-fades into it, the corners overshoot the display radius
// and settle, the card is a slight trapezoid that straightens as it lands, and the home behind
// shrinks, blurs and dims. Close: a drag shrinks the card under the finger (a still of the demo takes its
// place for the pull, rounded by its own layer: no offscreen pass; the demo keeps running hidden behind it);
// a throw (or a pull past a tenth of the screen) flies it into its icon, a shorter pull springs back.
//
// `present(_:animated:completion:)` is swizzled once (`installLaunch`) so the presented
// `.overFullScreen` controller gets this file's transitioning delegate, named by the icon the finger
// last touched (LaunchIconHatch.swift). Touches are never held for the motion's tail: the
// presentation completes as soon as the demo shows, and a close may interrupt the open mid-flight;
// a close flies the live demo home inside the card and hands the route back once the card is on its
// way (`routeLeaves`), so the release costs no picture and no unmount; a close that UIKit asked for
// has its route going at once and flies a touch-transparent still picture instead.
#if os(iOS)
import MachO
import ObjectiveC
import UIKit
import UIKit.UIGestureRecognizerSubclass

// MARK: - The measured numbers

/// A spring by natural frequency ω (rad/s) and damping ratio ζ, mass 1.
struct SpringParams { let omega: Double, zeta: Double }

private enum K {
    static let openWidth = SpringParams(omega: 22.6, zeta: 0.977)
    static let openAspect = SpringParams(omega: 34.6, zeta: 1.088)
    static let openCenterX = SpringParams(omega: 26.9, zeta: 1.02)
    static let openCenterY = SpringParams(omega: 32.1, zeta: 0.892)
    static let closeWidth = SpringParams(omega: 15.7, zeta: 0.867)
    static let closeHeight = SpringParams(omega: 25.7, zeta: 0.948)
    static let closeCenterX = SpringParams(omega: 12.6, zeta: 0.67)
    static let closeCenterY = SpringParams(omega: 13.6, zeta: 0.72)
    static let homeScale = 0.912
    static let homeBlurSigma = 25.0          // pt, Gaussian
    static let homeGain = 0.445
    static let openHomeScale = SpringParams(omega: 11, zeta: 1)
    static let openHomeBlur = SpringParams(omega: 10.5, zeta: 1)
    static let openHomeDim = SpringParams(omega: 25, zeta: 1)
    static let closeHomeScale = SpringParams(omega: 10, zeta: 1)
    static let closeHomeDim = SpringParams(omega: 8.7, zeta: 0.73)
    /// The blur clears exponentially once the card is let go: σ × e^(−12.6 t).
    static let closeBlurRate = 12.6
    static let dragTravel: CGFloat = 0.7     // × screen height for the card to vanish
    static let dragMinScale: CGFloat = 0.3
    static let failSideways: CGFloat = 30
    static let activeOffsetY: CGFloat = 10
    /// The still of the demo is taken (and the home shown behind) this far into the pull, before the card moves.
    static let prepareOffsetY: CGFloat = 6
    /// A demo whose own drags need the whole screen still gives a pull from this much of the screen's top
    /// (and from the status-bar inset above it) to the close.
    static let stripFraction: CGFloat = 0.18
    /// A release closes when it is a throw down, or lands past a tenth of the screen: a short pull is enough, as on iOS.
    static let closeVelocity: CGFloat = 250
    static let closeTravel: CGFloat = 0.1
    static let throwProjection: CGFloat = 0.15
    // The icon's artwork fades out between these fractions of the screen's width.
    static let artGone = (from: 0.2, to: 0.42)
    // The card narrows by k per pt down its height: k = taper * (1 - q) / screen width.
    static let taper: Double = 0.334
    static let taperIn = 0.065
    /// The open's corner radius against its width progress q, × the display radius.
    static let openRadius: [(q: Double, r: Double)] = [
        (0.14, 0.53), (0.35, 0.84), (0.45, 1.0), (0.5, 1.18), (0.6, 1.27), (0.7, 1.29), (0.8, 1.26),
        (0.85, 1.23), (0.9, 1.16), (0.95, 1.10), (0.98, 1.056), (1, 1),
    ]
    /// The close keeps the release's radius down to this q, then rounds into the icon's.
    static let closeRadiusFrom = 0.35
    // The reveal: the card covers the demo until it has painted.
    static let contentFade: Double = 200
    static let firstPaintFrames = 4
    /// The close hands the route back this long after the card lets go: its unmount is one large commit.
    static let routeLeaves = 0.3
    static let mountAt = 0.85
    static let iconRadiusRatio: CGFloat = 0.2237
}

/// The display's corner radius (min 25 for a square-cornered screen).
let screenCornerRadius: CGFloat = {
    let device = (UIScreen.main.value(forKey: "_displayCornerRadius") as? CGFloat) ?? 0
    return max(device, 25)
}()

// MARK: - A damped spring, stepped in closed form (exact for any frame time)

private struct Spring {
    var x: Double
    var v = 0.0
    var target: Double
    var p: SpringParams
    init(_ x: Double, _ p: SpringParams = K.openWidth) { self.x = x; target = x; self.p = p }

    mutating func run(to target: Double, _ p: SpringParams, velocity: Double? = nil) {
        self.target = target; self.p = p
        if let velocity { v = velocity }
    }
    mutating func set(_ value: Double) { x = value; target = value; v = 0 }

    mutating func step(_ dt: Double) {
        let x0 = x - target, v0 = v, w = p.omega, z = p.zeta, t = dt
        guard x0 != 0 || v0 != 0 else { return }
        if z < 0.9999 {
            let a = z * w, wd = w * (1 - z * z).squareRoot(), e = exp(-a * t)
            let A = x0, B = (v0 + a * x0) / wd, c = cos(wd * t), s = sin(wd * t)
            x = target + e * (A * c + B * s)
            v = e * ((-a * A + B * wd) * c + (-a * B - A * wd) * s)
        } else if z <= 1.0001 {
            let e = exp(-w * t), B = v0 + w * x0
            x = target + e * (x0 + B * t)
            v = e * (v0 - w * B * t)
        } else {
            let r = (z * z - 1).squareRoot(), r1 = -w * (z - r), r2 = -w * (z + r)
            let c2 = (v0 - r1 * x0) / (r2 - r1), c1 = x0 - c2
            let e1 = exp(r1 * t), e2 = exp(r2 * t)
            x = target + c1 * e1 + c2 * e2
            v = r1 * c1 * e1 + r2 * c2 * e2
        }
    }
    func settled(_ tolerance: Double) -> Bool { abs(x - target) < tolerance && abs(v) < tolerance * 8 }
}

private func clamp01(_ x: Double) -> Double { max(0, min(1, x)) }
private func smoothstep(_ a: Double, _ b: Double, _ x: Double) -> Double {
    let t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t)
}
private func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double { a + (b - a) * t }

// MARK: - The icons on the home (LaunchIconHatch.swift)

final class LaunchIcons {
    static let shared = LaunchIcons()
    private var views: [String: WeakView] = [:]
    private struct WeakView { weak var view: UIView? }
    func set(slug: String, view: UIView) {
        views = views.filter { $0.value.view != nil && $0.value.view !== view }
        views[slug] = WeakView(view: view)
    }
    func remove(view: UIView) { views = views.filter { $0.value.view !== view && $0.value.view != nil } }
    private(set) var touched: (slug: String, at: CFTimeInterval)?
    func touch(_ view: UIView) {
        guard let slug = views.first(where: { $0.value.view === view })?.key else { return }
        rowSource = nil
        touched = (slug, CACurrentMediaTime())
        GpuWarm.prioritize(slug)
    }
    /// A source that is not a home icon (a search result's icon): `view(slug)` answers it until a home icon is touched.
    private var rowSource: (slug: String, view: WeakView)?
    func touch(_ view: UIView, slug: String) {
        rowSource = (slug, WeakView(view: view))
        touched = (slug, CACurrentMediaTime())
        GpuWarm.prioritize(slug)
    }
    /// The demo a presentation now opens out of: an icon touched in the last two seconds.
    func takeTouched() -> String? {
        defer { touched = nil }
        guard let t = touched, CACurrentMediaTime() - t.at < 2 else {
            // No icon named: the launch will be ungrouped (the demo simply appears, no pull, the close button is the route's own).
            LaunchTrace.log("no icon touched in the last 2 s (touched \(touched.map { "\($0.slug) \(CACurrentMediaTime() - $0.at) s ago" } ?? "never"))")
            return nil
        }
        return t.slug
    }
    func view(_ slug: String) -> UIView? {
        if let r = rowSource, r.slug == slug, let v = r.view.view, v.window != nil { return v }
        guard let v = views[slug]?.view, v.window != nil else { return nil }
        return v
    }

    // An icon is hidden while its launch flies, and a hidden view takes no touch: a finger that lands on it reaches the
    // button around it, which opens the demo with no icon named (the launch would be ungrouped: no pull, no flight home).
    // So the demo's own route names it (`heldSlug`), and the icon is shown again only by the launch that hid it.
    private var hiddenBy: [ObjectIdentifier: Int] = [:]
    func hide(_ view: UIView, by gen: Int) {
        view.isHidden = true
        hiddenBy[ObjectIdentifier(view)] = gen
    }
    /// A launch from before the one that holds the icon now (its landing comes late) leaves it hidden.
    func show(_ view: UIView, by gen: Int) {
        guard hiddenBy[ObjectIdentifier(view)] == gen else {
            if let owner = hiddenBy[ObjectIdentifier(view)] { LaunchTrace.log("launch \(gen) leaves an icon that launch \(owner) holds") }
            return
        }
        hiddenBy[ObjectIdentifier(view)] = nil
        view.isHidden = false
    }
    /// The demo of `route` when its home icon is hidden by a launch that is still landing, else nil.
    func heldSlug(of route: UIViewController) -> String? {
        guard let root = route.viewIfLoaded else { return nil }
        var queue = [root], at = 0
        while at < queue.count {
            let v = queue[at]; at += 1
            if let card = v as? DemoCardView, !card.slug.isEmpty {
                guard let icon = view(card.slug), hiddenBy[ObjectIdentifier(icon)] != nil else { return nil }
                return card.slug
            }
            queue.append(contentsOf: v.subviews)
        }
        return nil
    }
}

// MARK: - The GPU module's warm-up

/// gpu/src/warm.rs compiles every demo's pipelines in the background; a finger on an icon moves that
/// demo to the front. The module is `dlopen`ed privately, so its entry is found among the loaded images.
private enum GpuWarm {
    private typealias Prioritize = @convention(c) (UnsafePointer<UInt8>?, Int) -> Void
    private static var entry: Prioritize?

    static func prioritize(_ slug: String) {
        if entry == nil {
            for i in 0..<_dyld_image_count() {
                guard let name = _dyld_get_image_name(i), String(cString: name).hasSuffix("libexact_gpu.dylib"),
                      let handle = dlopen(name, RTLD_LAZY | RTLD_NOLOAD),
                      let symbol = dlsym(handle, "demos_gpu_prioritize") else { continue }
                entry = unsafeBitCast(symbol, to: Prioritize.self)
                break
            }
        }
        let bytes = Array(slug.utf8)
        bytes.withUnsafeBufferPointer { entry?($0.baseAddress, bytes.count) }
    }
}

// MARK: - The home's blur: one UIVisualEffectView, its paused animator made once

private final class HomeBlur: UIVisualEffectView {
    private var animator: UIViewPropertyAnimator?
    var amount: Double = 0 { didSet { if amount != oldValue { apply() } } }
    init() {
        super.init(effect: nil)
        isUserInteractionEnabled = false
        autoresizingMask = [.flexibleWidth, .flexibleHeight]
    }
    required init?(coder: NSCoder) { nil }
    deinit { animator?.stopAnimation(true) }

    /// Made once the view is in a window: a paused animator made before shows the whole effect.
    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil, animator == nil else { return }
        effect = nil
        let a = UIViewPropertyAnimator(duration: 1, curve: .linear) { [unowned self] in
            self.effect = UIBlurEffect(style: BlurCalibration.style)
        }
        a.pausesOnCompletion = true
        animator = a
        apply()
    }
    private func apply() { animator?.fractionComplete = CGFloat(clamp01(amount) * BlurCalibration.fullFraction) }
}

/// At fraction 1 this material blurs at sigma 31 pt, so the 25 pt target is fraction 0.85;
/// the dimming view supplies the remaining darkness.
private enum BlurCalibration {
    static let style: UIBlurEffect.Style = .systemUltraThinMaterialDark
    static let fullFraction: Double = 0.85
    static let gainAtFull: Double = 0.56
}

// MARK: - The drag's timings (launch argument `-panTrace YES`; one NSLog line when the finger lifts)

private enum PanTrace {
    static let on = UserDefaults.standard.bool(forKey: "panTrace")
    private static var base = mach_timebase_info_data_t()
    private static var stats: [String: (n: Int, sum: Double, max: Double)] = [:]
    private static var last: TimeInterval?
    private static var gaps: [Double] = []
    static func now() -> UInt64 { on ? mach_absolute_time() : 0 }
    static func ms(_ t0: UInt64) -> Double {
        if base.denom == 0 { mach_timebase_info(&base) }
        return Double(mach_absolute_time() - t0) * Double(base.numer) / Double(base.denom) / 1e6
    }
    static func record(_ name: String, _ since: UInt64) {
        guard on else { return }
        let v = ms(since)
        let o = stats[name] ?? (0, 0, 0)
        stats[name] = (o.n + 1, o.sum + v, Swift.max(o.max, v))
    }
    static func gap(_ t: TimeInterval) {
        guard on else { return }
        if let l = last { gaps.append((t - l) * 1000) }
        last = t
    }
    static func flush() {
        guard on else { return }
        let g = gaps.sorted()
        let line = stats.sorted { $0.key < $1.key }.map { String(format: "%@ n=%d mean=%.3f max=%.3f", $0.key, $0.value.n, $0.value.sum / Double($0.value.n), $0.value.max) }
        NSLog("[PAN] %@ | event gap ms median=%.2f max=%.2f n=%d", line.joined(separator: " | "),
              g.isEmpty ? 0 : g[g.count / 2], g.last ?? 0, g.count)
        stats = [:]; gaps = []; last = nil
    }
}

// MARK: - The launch's state, traced (launch arguments `-launchTrace YES`, `-launchStrict YES`)

/// Every step of a session (adopt, open, commit, leave, land) with its generation, and the states in which a shown demo
/// would answer neither the pull nor the close button. A fault is always logged (rare, free until it happens);
/// `-launchStrict YES` traps on it, so a stress run (tools/launch-stress.md) stops at the first divergence.
enum LaunchTrace {
    static let on = UserDefaults.standard.bool(forKey: "launchTrace")
    static let strict = UserDefaults.standard.bool(forKey: "launchStrict")
    static func log(_ line: @autoclosure () -> String) { if on { NSLog("[LAUNCH] %@", line()) } }
    static func fault(_ line: @autoclosure () -> String) {
        NSLog("[LAUNCH-FAULT] %@", line())
        if strict { fatalError("launch fault: " + line()) }
    }
}

// MARK: - The close drag: a pan held until it moves down (activeOffsetY 10, failOffsetX ±30)

/// Tracks its first finger itself (UIPanGestureRecognizer's translation does not move while its minimum
/// touch count is unmet), reads nothing but the touch in the handler and keeps the samples its velocity needs.
private final class ClosePan: UIGestureRecognizer {
    weak var session: LaunchSession?
    private var touch: UITouch?
    private var origin = CGPoint.zero
    private var samples: [(t: TimeInterval, p: CGPoint)] = []
    private var prepared = false
    private(set) var translation = CGPoint.zero
    private(set) var velocity = CGPoint.zero
    /// Where the finger went down: the point of the card that stays under it.
    var location: CGPoint { origin }
    /// What the finger had moved when the pull took hold: the card does not jump by it, it catches up over `catchUp`.
    private var lag = CGPoint.zero
    private static let catchUp: CGFloat = 50

    private func eased(_ tr: CGPoint) -> CGPoint {
        let left = max(0, 1 - max(0, tr.y - lag.y) / ClosePan.catchUp)
        return CGPoint(x: tr.x - lag.x * left, y: tr.y - lag.y * left)
    }

    override func reset() {
        abort()
        touch = nil; samples = []; prepared = false
        translation = .zero; velocity = .zero; lag = .zero
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        if touch != nil || touches.count > 1 {
            // A second finger is a pinch or a different gesture, never the close.
            if state == .possible { state = .failed; abort() }
            return
        }
        guard let t = touches.first else { return }
        touch = t
        origin = t.location(in: nil)
        samples = [(t.timestamp, origin)]
        // The strip is the close's whatever the demo: nothing moves under a finger there, so the still is taken now.
        if session?.stripTouch == true { prepared = true; session?.dragPrepare() }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        guard let t = touch, touches.contains(t) else { return }
        let t0 = PanTrace.now()
        let p = t.location(in: nil)
        samples.append((t.timestamp, p))
        if samples.count > 16 { samples.removeFirst(samples.count - 16) }
        let tr = CGPoint(x: p.x - origin.x, y: p.y - origin.y)
        switch state {
        case .possible:
            if abs(tr.x) > K.failSideways { state = .failed; abort(); return }
            // A pull up from the strip is the demo's: it waits on this pan, so the pan lets go at once.
            if session?.stripTouch == true, tr.y < -K.activeOffsetY { state = .failed; abort(); return }
            if tr.y > K.prepareOffsetY, !prepared { prepared = true; session?.dragPrepare() }
            // Vertical-dominant: a mostly sideways drag with some drift down is the demo's (a slider), not the close.
            if tr.y > K.activeOffsetY, tr.y > abs(tr.x) {
                lag = tr
                translation = eased(tr)
                state = .began
            }
        case .began, .changed:
            translation = eased(tr)
            state = .changed
        default: break
        }
        PanTrace.record("touchesMoved", t0)
        PanTrace.gap(t.timestamp)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        guard let t = touch, touches.contains(t) else { return }
        let p = t.location(in: nil)
        samples.append((t.timestamp, p))
        if state == .possible { state = .failed; abort(); return }
        translation = eased(CGPoint(x: p.x - origin.x, y: p.y - origin.y))
        // The finger's speed over its last 80 ms, up to the lift: a finger that rested before it lifted is at rest.
        let end = t.timestamp
        let from = samples.last(where: { $0.t <= end - 0.08 }) ?? samples[0]
        let dt = max(end - from.t, 1.0 / 120)
        velocity = CGPoint(x: (p.x - from.p.x) / dt, y: (p.y - from.p.y) / dt)
        state = .ended
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        guard let t = touch, touches.contains(t) else { return }
        if state == .possible { state = .failed; abort() } else { state = .cancelled }
    }

    private func abort() { if prepared { session?.dragAbort() } }
}

/// The strip over the status bar: its drags are always the close's and never reach the demo.
private final class GrabZone: UIView {}

/// Where a demo lets the swipe-down close start (app.contract `closeZone`): space-separated words,
/// none = anywhere (RN's CloseGesture over the whole screen). `strip` = only the top strip (the demo's own
/// drags need the screen); `x0,y0,x1,y1` = a rect, in fractions of the screen, where the demo's own vertical
/// drags live and the close must not start. A vertical scroller needs no word: see `LaunchSession.scrollers`.
struct CloseZone {
    private(set) var strip = false
    private(set) var blocked: [CGRect] = []

    init(_ spec: String = "") {
        for word in spec.split(separator: " ") {
            if word == "strip" { strip = true; continue }
            let v = word.split(separator: ",").compactMap { Double($0) }
            if v.count == 4 { blocked.append(CGRect(x: v[0], y: v[1], width: v[2] - v[0], height: v[3] - v[1])) }
        }
    }

    /// Whether a touch at `p` (window points) outside the top strip may start the close.
    func allows(_ p: CGPoint, in screen: CGSize) -> Bool {
        if strip { return false }
        let f = CGPoint(x: p.x / max(screen.width, 1), y: p.y / max(screen.height, 1))
        return !blocked.contains { $0.contains(f) }
    }
}

/// The card: a plain clipping view around the presented view.
private final class CardView: UIView {}

// MARK: - One demo's launch session

final class LaunchSession: NSObject, UIViewControllerTransitioningDelegate {
    static weak var current: LaunchSession?
    /// Counts the sessions made: a delayed block of an older one is told by its `gen`.
    private static var generation = 0
    /// The session that last opened over the home: the only one that moves or shows it.
    private static weak var homeOwner: LaunchSession?
    private var ownsHome: Bool { LaunchSession.homeOwner == nil || LaunchSession.homeOwner === self }
    private static var live: [LaunchSession] = []
    static let shownChanged = Notification.Name("DemosLaunchShownChanged")

    /// Made and warmed before the finger lifts: a generator made at the release costs a frame.
    private static let thump = UIImpactFeedbackGenerator(style: .medium)

    private enum Phase { case opening, open, dragging, returning, closing, landed }

    /// The tapped icon's demo (nil: a deep link, which simply appears).
    let slug: String?
    fileprivate let gen: Int
    /// UIKit's dismissal of the route has ended: the delegate is needed until then (`retire`).
    private var dismissed = false
    private weak var controller: UIViewController?
    private weak var card: DemoCardView?
    private var zone: CloseZone { card?.zone ?? CloseZone() }
    /// The vertical scrollers under the finger that sit at their top: the pull takes them over (`beganScrollers`).
    private var scrollers: [UIScrollView] = []

    private var phase = Phase.opening
    private var grouped = false
    private(set) var closing = false
    private var routeGone = false
    /// The flight's time at which the route leaves (the demo is covered by then): never in its first frames.
    private var routeAt = Double.infinity
    fileprivate var stripTouch = false

    // Geometry, in window points.
    private var screen = CGSize.zero
    private var iconFrame = CGRect.zero
    private var iconRadius: CGFloat = 0
    private var w = Spring(0), h = Spring(0), aspect = Spring(1), cx = Spring(0), cy = Spring(0)
    private var radius: Double = 0
    private var releaseRadius: Double = 0
    private var dragAnchor = CGPoint.zero
    private var homeScale = Spring(1), homeBlur = Spring(0), homeDim = Spring(0)

    private weak var icon: UIView?
    private weak var home: UIView?
    /// What scales on the home: its icons (`springboard-zoom`), or the home itself.
    private weak var zoom: UIView?
    private var zoomCenter = CGPoint.zero
    private var snapshot: UIView?
    /// The still the pull took ahead of the card moving (the live demo stays hidden behind it meanwhile).
    private var pulled: UIView?
    private var content: UIView? { snapshot ?? controller?.view }
    private var detached = false
    private weak var cardHost: UIView?
    private var cardView: CardView?
    private var art: UIView?
    private var blur: HomeBlur?
    private var dim: UIView?
    private var grab: GrabZone?
    private var pan: ClosePan?
    private var link: CADisplayLink?
    private var presenting: UIViewControllerContextTransitioning?
    private var dismissing: UIViewControllerContextTransitioning?

    private var revealCountdown: Int?
    private(set) var shown = false

    init(controller: UIViewController, slug: String?) {
        self.controller = controller
        self.slug = slug
        LaunchSession.generation += 1
        gen = LaunchSession.generation
        super.init()
    }

    var buttonsVisible: Bool { shown && !closing }

    static func adopt(_ controller: UIViewController, slug: String?) {
        let session = LaunchSession(controller: controller, slug: slug)
        // A session that has landed and whose route is gone for good (a flying one stays: it lands the card and the icon).
        live.removeAll { $0.phase == .landed && $0.controller == nil }
        LaunchTrace.log("session \(session.gen) adopted for \(slug ?? "no icon"), \(live.count) other(s) still live")
        live.append(session)
        current = session
        controller.transitioningDelegate = session
    }

    static func attach(_ card: DemoCardView) {
        guard let session = live.last(where: { s in
            guard let v = s.controller?.viewIfLoaded else { return false }
            return card.isDescendant(of: v)
        }) ?? current else { return }
        session.card = card
        if session.shown { card.alpha = 0 }
    }

    /// The session whose route holds `view`: the close button asks this and not `current`, which any other session's
    /// commit or adoption moves (a shown demo must close through its own launch, whatever came before it).
    static func owning(_ view: UIView?) -> LaunchSession? {
        guard let view else { return current }
        return live.last(where: { s in
            guard let v = s.controller?.viewIfLoaded else { return false }
            return view.isDescendant(of: v)
        }) ?? current
    }

    static func holds(_ controller: UIViewController) -> Bool {
        var at: UIViewController? = controller
        while let c = at {
            if live.contains(where: { $0.controller === c }) { return true }
            at = c.parent ?? c.presentingViewController
        }
        return false
    }

    fileprivate static func find(_ id: String, in root: UIView) -> UIView? {
        var queue = [root]
        while !queue.isEmpty {
            let v = queue.removeFirst()
            if v.accessibilityIdentifier == id { return v }
            queue.append(contentsOf: v.subviews)
        }
        return nil
    }

    // MARK: transitioning delegate

    func animationController(forPresented presented: UIViewController, presenting: UIViewController,
                             source: UIViewController) -> UIViewControllerAnimatedTransitioning? {
        Animator(session: self, presenting: true)
    }

    func animationController(forDismissed dismissed: UIViewController) -> UIViewControllerAnimatedTransitioning? {
        Animator(session: self, presenting: false)
    }

    private final class Animator: NSObject, UIViewControllerAnimatedTransitioning {
        let session: LaunchSession, presenting: Bool
        init(session: LaunchSession, presenting: Bool) { self.session = session; self.presenting = presenting }
        func transitionDuration(using ctx: UIViewControllerContextTransitioning?) -> TimeInterval { presenting ? 0.45 : 0.6 }
        func animateTransition(using ctx: UIViewControllerContextTransitioning) {
            if presenting { session.open(ctx) } else { session.dismiss(ctx) }
        }
    }

    // MARK: open

    private func open(_ ctx: UIViewControllerContextTransitioning) {
        guard let controller, let view = controller.view else { return ctx.completeTransition(true) }
        let container = ctx.containerView
        screen = container.bounds.size
        let cardView = CardView(frame: container.bounds)
        cardView.layer.cornerCurve = .continuous
        cardView.isOpaque = false
        container.addSubview(cardView)
        self.cardView = cardView
        view.frame = cardView.bounds
        // The icon it opens out of: a deep link has none, and the demo simply appears.
        guard let slug, let icon = LaunchIcons.shared.view(slug), let host = container.superview else {
            LaunchTrace.log("session \(gen) opens ungrouped: slug \(slug ?? "nil"), icon \(slug.flatMap { LaunchIcons.shared.view($0) } != nil ? "found" : "missing")")
            cardView.addSubview(view)
            grouped = false
            phase = .open
            revealCountdown = K.firstPaintFrames + 1
            ctx.completeTransition(true)
            opened()
            startLink()
            return
        }
        self.icon = icon
        grouped = true
        home = ctx.viewController(forKey: .from)?.view ?? host.subviews.first
        zoom = home.flatMap { LaunchSession.find("springboard-zoom", in: $0) } ?? home
        LaunchSession.homeOwner = self
        if let zoom { zoomCenter = zoom.convert(CGPoint(x: zoom.bounds.midX, y: zoom.bounds.midY), to: nil) }
        // A close still landing may have the icons part way back: start from where they show.
        let shownScale = Double(zoom?.layer.presentation()?.transform.m11 ?? 1)
        iconFrame = icon.convert(icon.bounds, to: nil)
        iconRadius = iconFrame.width * K.iconRadiusRatio
        let blur = HomeBlur()
        blur.frame = host.bounds
        host.insertSubview(blur, belowSubview: container)
        self.blur = blur
        let dim = UIView(frame: host.bounds)
        dim.backgroundColor = .black
        dim.alpha = 0
        dim.isUserInteractionEnabled = false
        dim.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.insertSubview(dim, belowSubview: container)
        self.dim = dim
        if let art = LaunchSession.picture(of: icon) {
            art.isUserInteractionEnabled = false
            art.bounds = CGRect(origin: .zero, size: iconFrame.size)
            cardView.addSubview(art)
            self.art = art
            // Stands in for the demo until it is in the card (below), so a card committed first shows no hole.
            cardView.backgroundColor = (art as? UIImageView)?.image.flatMap(LaunchSession.averageColor)
        }
        LaunchIcons.shared.hide(icon, by: gen)
        moving(true)
        w.set(Double(iconFrame.width)); w.run(to: Double(screen.width), K.openWidth)
        aspect.set(Double(iconFrame.height / iconFrame.width))
        aspect.run(to: Double(screen.height / screen.width), K.openAspect)
        h.set(w.x * aspect.x)
        cx.set(Double(iconFrame.midX)); cx.run(to: Double(screen.width / 2), K.openCenterX)
        cy.set(Double(iconFrame.midY)); cy.run(to: Double(screen.height / 2), K.openCenterY)
        homeScale.set(shownScale > 0 ? shownScale : 1); homeScale.run(to: K.homeScale, K.openHomeScale)
        homeBlur.set(0); homeBlur.run(to: 1, K.openHomeBlur)
        homeDim.set(0); homeDim.run(to: 1, K.openHomeDim)
        phase = .opening
        presenting = ctx
        fly()
        // The demo joins the card only now: moving its route into the window lays it out (a few ms on
        // a fast Mac, 30-90 ms on a phone), which used to hold the first frame of the flight back. The
        // flight above is already committed, so the card moves on the first frame after the tap.
        if let content = controller.view, content.superview == nil {
            cardView.insertSubview(content, at: 0)
            cardView.backgroundColor = nil
        }
    }

    /// The artwork's mean colour: a 1 x 1 redraw.
    fileprivate static func averageColor(_ image: UIImage) -> UIColor? {
        guard let cg = image.cgImage else { return nil }
        var px = [UInt8](repeating: 0, count: 4)
        guard let ctx = CGContext(data: &px, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.interpolationQuality = .medium
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        let a = max(CGFloat(px[3]) / 255, 0.001)
        return UIColor(red: CGFloat(px[0]) / 255 / a, green: CGFloat(px[1]) / 255 / a, blue: CGFloat(px[2]) / 255 / a, alpha: 1)
    }

    private func opened() {
        phase = .open
        rest()
        completePresentation()
        installGestures()
    }

    /// UIKit ignores touches until the presentation completes, so it ends as soon as the demo shows.
    private func completePresentation() {
        guard let ctx = presenting else { return }
        presenting = nil
        ctx.completeTransition(!ctx.transitionWasCancelled)
    }

    private func installGestures() {
        guard pan == nil, !closing, let view = controller?.view else { return }
        let grab = GrabZone(frame: CGRect(x: 0, y: 0, width: view.bounds.width,
                                          height: view.window?.safeAreaInsets.top ?? 0))
        grab.autoresizingMask = [.flexibleWidth]
        grab.backgroundColor = .clear
        view.addSubview(grab)
        self.grab = grab
        // On the window: a GPU canvas's touches never reach recognizers on the presented view.
        let pan = ClosePan(target: self, action: #selector(dragged(_:)))
        pan.session = self
        pan.delegate = self
        (view.window ?? view).addGestureRecognizer(pan)
        self.pan = pan
    }

    /// While it flies the card's bounds move each frame and the demo inside is not laid out for them.
    private func moving(_ on: Bool) {
        cardView?.autoresizesSubviews = !on
        cardView?.layer.masksToBounds = on
        cardView?.layer.allowsEdgeAntialiasing = on
    }

    private func rest() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        removeFlight()
        if let cardView {
            cardView.layer.transform = CATransform3DIdentity
            cardView.bounds = CGRect(origin: .zero, size: screen)
            cardView.center = CGPoint(x: screen.width / 2, y: screen.height / 2)
            cardView.layer.cornerRadius = 0
        }
        moving(false)
        liveAgain()
        if let view = controller?.view {
            view.transform = .identity
            view.frame = CGRect(origin: .zero, size: screen)
        }
        art?.layer.opacity = 0
        blur?.isHidden = true
        dim?.isHidden = true
        if ownsHome { home?.isHidden = true }
        CATransaction.commit()
    }

    private func unrest() {
        home?.isHidden = false
        blur?.isHidden = false
        dim?.isHidden = false
        moving(true)
        homeScale.set(K.homeScale); homeBlur.set(1); homeDim.set(1)
        w.set(Double(screen.width)); h.set(Double(screen.height))
        cx.set(Double(screen.width / 2)); cy.set(Double(screen.height / 2))
        radius = Double(screenCornerRadius)
    }

    // MARK: close

    func closeFromButton() {
        guard phase == .open || phase == .opening || !grouped else { return }
        if closing { return }
        var velocity: (w: Double, h: Double, x: Double, y: Double)?
        if grouped { if phase == .opening { velocity = interruptOpen() } else { unrest() } }
        commit(haptic: true, velocity: velocity)
    }

    /// Stops the open where it shows: the springs take the flight's pose and velocity, and UIKit's transition ends.
    private func interruptOpen() -> (w: Double, h: Double, x: Double, y: Double)? {
        defer { completePresentation() }
        guard phase == .opening, let f = flight, !f.poses.isEmpty else { unrest(); return nil }
        let x = max(0, CACurrentMediaTime() - f.start) * Flight.rate
        let i = min(Int(x), f.poses.count - 1), j = min(i + 1, f.poses.count - 1), u = x - Double(i)
        let a = f.poses[i], b = f.poses[j]
        func at(_ k: KeyPath<Pose, Double>) -> Double { lerp(a[keyPath: k], b[keyPath: k], u) }
        func rate(_ k: KeyPath<Pose, Double>) -> Double { (b[keyPath: k] - a[keyPath: k]) * Flight.rate }
        flight = nil
        home?.isHidden = false
        blur?.isHidden = false
        dim?.isHidden = false
        moving(true)
        w.set(at(\.w)); h.set(at(\.h)); cx.set(at(\.cx)); cy.set(at(\.cy))
        radius = at(\.radius)
        homeScale.set(at(\.homeScale)); homeBlur.set(at(\.blur)); homeDim.set(at(\.hd))
        return (rate(\.w), rate(\.h), rate(\.cx), rate(\.cy))
    }

    private func commit(haptic: Bool, velocity: (w: Double, h: Double, x: Double, y: Double)?) {
        guard !closing else { return }
        closing = true
        LaunchTrace.log("session \(gen) closes from \(phase), \(grouped ? "grouped" : "ungrouped")")
        if LaunchSession.current === self { LaunchSession.current = nil }
        guard grouped else {
            controller?.view.isUserInteractionEnabled = false
            closed(haptic: haptic)
            leave()
            return
        }
        phase = .closing
        releaseRadius = radius
        let v = velocity ?? (0, 0, 0, 0)
        w.run(to: w.x, K.closeWidth, velocity: v.w)
        h.run(to: h.x, K.closeHeight, velocity: v.h)
        cx.run(to: cx.x, K.closeCenterX, velocity: v.x)
        cy.run(to: cy.x, K.closeCenterY, velocity: v.y)
        homeScale.run(to: 1, K.closeHomeScale)
        homeDim.run(to: 0, K.closeHomeDim)
        homeBlur.target = 0
        retargetIcon()
        // The route is already going when UIKit asked for the dismissal: its views go with it, so a still
        // takes their place. Otherwise the demo itself rides the card down.
        if dismissing != nil { pictureContent() }
        detachCard()
        fly()
        // Committed: the card moves on the first frame after the release.
        CATransaction.flush()
        // What is not the card waits until it is on its way: the demo stops taking touches, the pan goes.
        controller?.view.isUserInteractionEnabled = false
        if let pan { pan.view?.removeGestureRecognizer(pan) }
        closed(haptic: haptic)
        if dismissing != nil, detached { DispatchQueue.main.async { [self] in leave() } }
        else { routeAt = K.routeLeaves }
    }

    /// What the close does that is not the card: the haptic, the keyboard, the buttons.
    private func closed(haptic: Bool) {
        if haptic { LaunchSession.thump.impactOccurred() }
        controller?.view.window?.endEditing(true)
        NotificationCenter.default.post(name: LaunchSession.shownChanged, object: self)
    }

    /// Moves the card out of the presentation's container, which UIKit takes away with the route, so the home takes taps.
    private func detachCard() {
        guard !detached, let cardView, let container = cardView.superview, let host = container.superview else { return }
        let origin = container.frame.origin
        host.insertSubview(cardView, aboveSubview: container)
        if origin != .zero { cardView.center = CGPoint(x: cardView.center.x + origin.x, y: cardView.center.y + origin.y) }
        cardView.isUserInteractionEnabled = false
        cardHost = host
        detached = true
    }

    /// UIKit's dismissal takes the detached card and its flight out of the window: both go back on the flight's clock.
    private func keepCard() {
        guard detached, phase == .closing, let cardView, cardView.superview == nil, let host = cardHost else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        host.addSubview(cardView)
        if let f = flight { removeFlight(); animate(f) }
        CATransaction.commit()
    }

    /// A still of the demo in the card, to fly home once the route is handed back (its views go with the route).
    private func pictureContent() {
        guard snapshot == nil, let view = controller?.view, let picture = LaunchSession.picture(of: view) else { return }
        adopt(picture)
    }

    /// The still takes the live demo's place in the card; the demo keeps running, hidden.
    private func adopt(_ picture: UIView) {
        guard snapshot == nil, let view = controller?.view, let cardView else { return }
        picture.isUserInteractionEnabled = false
        picture.bounds = view.bounds
        picture.layer.anchorPoint = view.layer.anchorPoint
        picture.layer.position = view.layer.position
        picture.layer.transform = view.layer.transform
        cardView.insertSubview(picture, aboveSubview: view)
        view.layer.removeAnimation(forKey: LaunchSession.flightKey + ".a")
        view.layer.removeAnimation(forKey: LaunchSession.flightKey + ".b")
        view.isHidden = true
        snapshot = picture
    }

    /// The live demo takes the card back from the still of a pull that sprang back.
    private func liveAgain() {
        guard !closing, let still = snapshot, let view = controller?.view else { return }
        still.removeFromSuperview()
        snapshot = nil
        view.isHidden = false
    }

    /// A still image of `view` from the render server, drawn at once (a GPU canvas included). A `snapshotView`
    /// is taken at the next commit, so it is empty when its view is hidden or leaves in the same transaction.
    fileprivate static func picture(of view: UIView) -> UIView? {
        let size = view.bounds.size
        guard size.width >= 1, size.height >= 1, view.window != nil else { return nil }
        let format = UIGraphicsImageRendererFormat.preferred()
        format.scale = view.window?.screen.scale ?? UIScreen.main.scale
        let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            _ = view.drawHierarchy(in: CGRect(origin: .zero, size: size), afterScreenUpdates: false)
        }
        let picture = UIImageView(image: image)
        picture.frame = CGRect(origin: .zero, size: size)
        return picture
    }

    private func retargetIcon() {
        let s = homeScale.x
        let mid = zoom != nil ? zoomCenter : CGPoint(x: screen.width / 2, y: screen.height / 2)
        w.target = Double(iconFrame.width) * s
        h.target = Double(iconFrame.height) * s
        cx.target = Double(mid.x) + (Double(iconFrame.midX) - Double(mid.x)) * s
        cy.target = Double(mid.y) + (Double(iconFrame.midY) - Double(mid.y)) * s
    }

    private func leave() {
        guard !routeGone else { return }
        routeGone = true
        LaunchTrace.log("session \(gen) hands the route back")
        if dismissing == nil {
            // The route's back pops the top route, whichever card asked: with a newer session open over this one it
            // would take that one's route, and with no card it takes none (the route stays, presented and unseen).
            if LaunchSession.live.contains(where: { $0.gen > gen && !$0.closing }) {
                LaunchTrace.fault("session \(gen) hands its route back while a newer session is open: the back would pop that one")
            }
            if card == nil { LaunchTrace.fault("session \(gen) hands its route back but its card never attached: nothing leaves") }
            card?.leave()
        }
        finishDismissal()
    }

    private func dismiss(_ ctx: UIViewControllerContextTransitioning) {
        dismissing = ctx
        if routeGone || !grouped { finishDismissal() }
        else if !closing {
            var velocity: (w: Double, h: Double, x: Double, y: Double)?
            if phase == .opening { velocity = interruptOpen() } else if phase == .open { unrest() }
            commit(haptic: false, velocity: velocity)
        }
    }

    private func finishDismissal() {
        guard let ctx = dismissing else { return }
        dismissing = nil
        if !detached || phase == .landed { cardView?.removeFromSuperview() }
        ctx.view(forKey: .from)?.removeFromSuperview()
        ctx.completeTransition(true)
        keepCard()
        dismissed = true
        if !grouped { land() }
        retire()
    }

    /// The session leaves `live` (and is freed: UIKit holds its delegate weakly) once the card has landed AND UIKit's
    /// dismissal of the route has ended. Dropping it at the landing alone freed it while the dismissal was still to come
    /// whenever the main thread ran late (the route handed back and the card landed in one tick): UIKit then dismissed
    /// with no delegate, and a session that is gone answers nothing.
    private func retire() {
        guard phase == .landed, routeGone, dismissed || controller == nil else { return }
        LaunchTrace.log("session \(gen) retired")
        LaunchSession.live.removeAll { $0 === self }
    }

    private func landCard() {
        if let icon { LaunchIcons.shared.show(icon, by: gen) }
        art?.removeFromSuperview()
        art = nil
        cardView?.isHidden = true
    }

    private func land() {
        phase = .landed
        removeFlight()
        landCard()
        blur?.removeFromSuperview()
        blur = nil
        dim?.removeFromSuperview()
        dim = nil
        if ownsHome {
            zoom?.layer.transform = CATransform3DIdentity
            home?.isHidden = false
            LaunchSession.homeOwner = nil
        }
        if detached {
            snapshot?.removeFromSuperview()
            snapshot = nil
            cardView?.removeFromSuperview()
        }
        link?.invalidate()
        link = nil
        if grouped, !routeGone { DispatchQueue.main.async { [self] in leave() } }
        retire()
    }

    // MARK: drag

    /// The card's scale and centre where the pull took hold, and the point of the card under the finger.
    private var dragFrom = (s: CGFloat(1), c: CGPoint.zero)
    private var dragHeld = CGPoint.zero

    private func dragPose(_ t: CGPoint) -> (s: CGFloat, x: CGFloat, y: CGFloat) {
        let d = max(0, t.y)
        let s = max(K.dragMinScale, dragFrom.s - d / (K.dragTravel * screen.height))
        return (s, dragAnchor.x + t.x - dragHeld.x * s, dragAnchor.y + d - dragHeld.y * s)
    }

    /// Where the card is while a flight runs (the open, or the spring back), or nil.
    private func flightCard() -> (w: Double, cx: Double, cy: Double)? {
        guard let f = flight, !f.poses.isEmpty else { return nil }
        let x = max(0, CACurrentMediaTime() - f.start) * Flight.rate
        let i = min(Int(x), f.poses.count - 1), j = min(i + 1, f.poses.count - 1), u = x - Double(i)
        let a = f.poses[i], b = f.poses[j]
        return (lerp(a.w, b.w, u), lerp(a.cx, b.cx, u), lerp(a.cy, b.cy, u))
    }

    /// The first pixels of a downward pull: the still is taken and the home is shown behind the card,
    /// a frame or two before the card moves, so neither lands in the card's first frames.
    fileprivate func dragPrepare() {
        guard grouped, !closing, pulled == nil else { return }
        let t0 = PanTrace.now()
        switch phase {
        case .open: break
        case .opening: guard let c = flightCard(), c.w >= 0.75 * Double(screen.width) else { return }
        case .returning: return
        default: return
        }
        if snapshot == nil, let view = controller?.view { pulled = LaunchSession.picture(of: view) }
        if phase == .open {
            home?.isHidden = false
            blur?.isHidden = false
            dim?.isHidden = false
        }
        PanTrace.record("prepare", t0)
    }

    /// The finger lifted before the pull took hold.
    fileprivate func dragAbort() {
        if phase != .dragging { pulled?.removeFromSuperview() }
        pulled = nil
        guard phase == .open, !closing else { return }
        blur?.isHidden = true
        dim?.isHidden = true
        if ownsHome { home?.isHidden = true }
    }

    @objc private func dragged(_ pan: ClosePan) {
        switch pan.state {
        case .began:
            let t0 = PanTrace.now()
            defer { PanTrace.record("began", t0) }
            guard phase == .open || phase == .opening || phase == .returning, grouped, !closing else {
                LaunchTrace.log("session \(gen) pull refused in \(phase): grouped \(grouped), closing \(closing)")
                return
            }
            var from = (s: CGFloat(1), c: CGPoint(x: screen.width / 2, y: screen.height / 2))
            if phase != .open {
                // Taken from where the card shows: an open that has nearly landed, or a spring back.
                guard let c = flightCard(), c.w >= 0.75 * Double(screen.width) else { return }
                from = (CGFloat(c.w) / screen.width, CGPoint(x: c.cx, y: c.cy))
                flight = nil
                removeFlight()
                completePresentation()
            }
            beganScrollers()
            unrest()
            LaunchSession.thump.prepare()
            if snapshot == nil, let view = controller?.view {
                if let still = pulled ?? LaunchSession.picture(of: view) { adopt(still) }
            }
            pulled = nil
            // The still rounds itself: a layer of nothing but contents clips without an offscreen pass, the
            // live demo's subtree under a clipping card would not.
            if let layer = snapshot?.layer {
                layer.cornerRadius = screenCornerRadius
                layer.cornerCurve = .continuous
                layer.masksToBounds = true
                cardView?.layer.masksToBounds = false
                cardView?.layer.allowsEdgeAntialiasing = false
            }
            dragFrom = from
            dragAnchor = pan.location
            dragHeld = CGPoint(x: (dragAnchor.x - from.c.x) / from.s, y: (dragAnchor.y - from.c.y) / from.s)
            phase = .dragging
            moveDrag(pan)
        case .changed:
            guard phase == .dragging else { return }
            moveDrag(pan)
        case .ended, .cancelled, .failed:
            guard phase == .dragging else { return }
            let t0 = PanTrace.now()
            defer { PanTrace.record("release", t0); PanTrace.flush() }
            let t = pan.translation, v = pan.velocity
            let d = max(0, t.y)
            let thrown = d + max(0, v.y) * K.throwProjection
            let held = dragPose(t)
            let ds = d > 0 && held.s > K.dragMinScale ? -Double(v.y) / Double(K.dragTravel * screen.height) : 0
            let vw = Double(screen.width) * ds, vh = Double(screen.height) * ds
            let vx = Double(v.x) + Double(screen.width / 2 - dragAnchor.x) * ds
            let vy = (d > 0 ? Double(v.y) : 0) + Double(screen.height / 2 - dragAnchor.y) * ds
            flightClip()
            if pan.state == .ended, v.y > -100, v.y > K.closeVelocity || thrown > K.closeTravel * screen.height {
                commit(haptic: true, velocity: (vw, vh, vx, vy))
            } else {
                phase = .returning
                w.run(to: Double(screen.width), K.openWidth, velocity: vw)
                cx.run(to: Double(screen.width / 2), K.openCenterX, velocity: vx)
                cy.run(to: Double(screen.height / 2), K.openCenterY, velocity: vy)
                fly()
            }
        default: break
        }
    }

    /// Back from the still's own rounding to the card's clip, which the flight animates.
    private func flightClip() {
        if let layer = snapshot?.layer { layer.masksToBounds = false; layer.cornerRadius = 0 }
        moving(true)
    }

    /// Per touch: the springs hold the pose for the release, the still moves. Nothing else changes in a pull
    /// (the card, the home and the blur stand), so this sets two properties of one layer.
    private func moveDrag(_ pan: ClosePan) {
        let t0 = PanTrace.now()
        let d = dragPose(pan.translation)
        w.set(Double(screen.width * d.s)); h.set(Double(screen.height * d.s))
        cx.set(Double(d.x)); cy.set(Double(d.y))
        radius = Double(screenCornerRadius * d.s)
        if let layer = snapshot?.layer {
            CATransaction.setDisableActions(true)
            layer.position = CGPoint(x: d.x, y: d.y)
            layer.transform = CATransform3DMakeScale(d.s, d.s, 1)
        } else {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            put(pose(at: 0))
            CATransaction.commit()
        }
        PanTrace.record("moveDrag", t0)
    }

    // MARK: the flight, handed to Core Animation

    private struct Pose {
        var w = 0.0, h = 0.0, cx = 0.0, cy = 0.0, radius = 0.0, taper = 0.0, art = 0.0
        var homeScale = 1.0, dim = 0.0, blur = 0.0
        var hd = 0.0              // the dimming spring itself (dim is the layer's opacity)
    }

    private func pose(at since: Double) -> Pose {
        var p = Pose(w: w.x, h: max(h.x, 1), cx: cx.x, cy: cy.x, radius: radius, taper: 0,
                     art: artAlpha(), homeScale: homeScale.x, dim: 0, blur: clamp01(homeBlur.x))
        let q = widthProgress()
        switch phase {
        case .opening: p.taper = K.taper / Double(screen.width) * (1 - clamp01(q))
        case .closing:
            p.taper = K.taper / Double(screen.width) * (1 - clamp01(q)) * clamp01(since / K.taperIn)
                * smoothstep(0, 0.08, q)
        default: break
        }
        let gain = 1 - (1 - K.homeGain) * clamp01(homeDim.x)
        let blurGain = 1 - (1 - BlurCalibration.gainAtFull) * p.blur
        p.dim = clamp01(1 - gain / max(blurGain, 0.01))
        p.hd = homeDim.x
        return p
    }

    private func step(_ dt: Double) {
        switch phase {
        case .opening:
            w.step(dt); aspect.step(dt); cx.step(dt); cy.step(dt)
            homeScale.step(dt); homeBlur.step(dt); homeDim.step(dt)
            h.set(w.x * aspect.x)
            radius = openRadius()
        case .returning:
            w.step(dt); cx.step(dt); cy.step(dt)
            h.set(w.x * Double(screen.height / screen.width))
            radius = Double(screenCornerRadius) * w.x / Double(screen.width)
        case .closing:
            homeScale.step(dt); homeDim.step(dt)
            homeBlur.x *= exp(-K.closeBlurRate * dt)
            retargetIcon()
            w.step(dt); h.step(dt); cx.step(dt); cy.step(dt)
            radius = lerp(Double(iconRadius) * homeScale.x, releaseRadius,
                          smoothstep(0, K.closeRadiusFrom, widthProgress()))
        default: break
        }
    }

    private var cardSettled: Bool {
        switch phase {
        case .opening: return w.settled(0.25) && aspect.settled(0.0005) && cx.settled(0.25) && cy.settled(0.25)
        case .returning: return w.settled(0.25) && cx.settled(0.25) && cy.settled(0.25)
        default: return w.settled(0.3) && h.settled(0.3) && cx.settled(0.3) && cy.settled(0.3)
        }
    }
    private var homeSettled: Bool {
        switch phase {
        case .opening: return homeDim.settled(0.004) && homeBlur.settled(0.004) && homeScale.settled(0.0005)
        case .closing: return homeScale.settled(0.0005) && homeDim.settled(0.004) && homeBlur.x < 0.004
        default: return true
        }
    }

    /// The flight's timeline: its poses every 1/120 s and the moments the link acts on.
    private struct Flight {
        var start = 0.0
        var poses: [Pose] = []
        var cardDone = 0.0        // the card has landed (closing) or fills the screen (opening)
        var end = 0.0
        var covered = Double.infinity   // closing: the artwork is opaque over the demo
        var mount = Double.infinity     // opening: the demo is mounted far enough to show
        func blur(at t: Double) -> Double {
            guard !poses.isEmpty else { return 0 }
            let x = max(0, t - start) * Flight.rate
            let i = min(Int(x), poses.count - 1), j = min(i + 1, poses.count - 1)
            return lerp(poses[i].blur, poses[j].blur, x - Double(i))
        }
        static let rate = 120.0
    }
    private var flight: Flight?

    /// Runs the springs to rest ahead of time and hands Core Animation the whole path, so a busy main
    /// thread can't drop frames. The link only scrubs the blur and acts at the flight's moments.
    private func fly() {
        let dt = 1 / Flight.rate
        var f = Flight()
        var t = 0.0
        var cardDone: Double?
        f.poses.append(pose(at: 0))
        while t < 3 {
            step(dt); t += dt
            let p = pose(at: t)
            f.poses.append(p)
            if f.covered == .infinity, phase == .closing, p.art >= 1 { f.covered = t }
            if f.mount == .infinity, phase == .opening, widthProgress() >= K.mountAt { f.mount = t }
            if cardDone == nil, cardSettled { cardDone = t }
            if cardDone != nil, homeSettled { break }
        }
        f.cardDone = cardDone ?? t
        f.end = t
        let last = f.poses[f.poses.count - 1]
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        removeFlight()
        put(last)
        f.start = CACurrentMediaTime()
        animate(f)
        // The blur is scrubbed by the link, not by the keyframes: it starts at the flight's first pose, or
        // the first committed frame shows the flight's last (the home fully blurred).
        blur?.amount = f.poses[0].blur
        CATransaction.commit()
        // The open runs inside the host's apply, which then mounts the demo's route on this thread
        // (100–300 ms for a GPU demo): commit now so the flight starts under the finger.
        if phase == .opening { CATransaction.flush() }
        flight = f
        startLink()
    }

    private static let flightKey = "launch"

    private func removeFlight() {
        let homeLayer = ownsHome ? zoom?.layer : nil
        for layer in [cardView?.layer, content?.layer, art?.layer, homeLayer, dim?.layer] {
            layer?.removeAnimation(forKey: LaunchSession.flightKey + ".a")
            layer?.removeAnimation(forKey: LaunchSession.flightKey + ".b")
            layer?.removeAnimation(forKey: LaunchSession.flightKey + ".c")
            layer?.removeAnimation(forKey: LaunchSession.flightKey + ".d")
        }
    }

    private struct LayerPose {
        var cardBounds: CGRect, cardPosition: CGPoint, cardTransform: CATransform3D, radius: CGFloat
        var contentTransform: CATransform3D, contentPosition: CGPoint
        var artPosition: CGPoint, artTransform: CATransform3D, artOpacity: Float
        var homeTransform: CATransform3D, dimOpacity: Float
    }

    private func layerPose(_ p: Pose) -> LayerPose {
        let W = CGFloat(p.w), H = CGFloat(p.h), k = CGFloat(p.taper)
        // Projective taper about the card's centre (w = 1 + k·y): solve the unprojected height and centre.
        let top = CGFloat(p.cy) - H / 2, bottom = CGFloat(p.cy) + H / 2
        var half = H / 2
        if k != 0 { for _ in 0..<4 { half = (bottom - top) / 2 * (1 - k * k * half * half) } }
        let centerY = k != 0 ? top + half / (1 - k * half) : CGFloat(p.cy)
        var cardTransform = CATransform3DIdentity
        cardTransform.m24 = k
        let s = W / screen.width
        let hs = CGFloat(p.homeScale)
        let iconW = max(iconFrame.width, 1), iconH = max(iconFrame.height, 1)
        return LayerPose(
            cardBounds: CGRect(x: 0, y: 0, width: W, height: half * 2),
            cardPosition: CGPoint(x: CGFloat(p.cx), y: centerY), cardTransform: cardTransform,
            radius: CGFloat(p.radius),
            contentTransform: CATransform3DMakeScale(s, s, 1),
            contentPosition: CGPoint(x: W / 2, y: screen.height * s / 2),
            artPosition: CGPoint(x: W / 2, y: half),
            artTransform: CATransform3DMakeScale(W / iconW, half * 2 / iconH, 1),
            artOpacity: Float(p.art),
            homeTransform: CATransform3DMakeScale(hs, hs, 1), dimOpacity: Float(p.dim))
    }

    private func put(_ p: Pose) {
        let l = layerPose(p)
        if let c = cardView?.layer {
            c.bounds = l.cardBounds; c.position = l.cardPosition; c.transform = l.cardTransform
            c.cornerRadius = l.radius
        }
        if let v = content?.layer {
            v.transform = l.contentTransform; v.position = l.contentPosition
        }
        if let a = art?.layer {
            a.position = l.artPosition; a.transform = l.artTransform; a.opacity = l.artOpacity
        }
        if ownsHome { zoom?.layer.transform = l.homeTransform }
        dim?.layer.opacity = l.dimOpacity
        blur?.amount = p.blur
    }

    private func animate(_ f: Flight) {
        let ls = f.poses.map(layerPose)
        let duration = Double(ls.count - 1) / Flight.rate
        guard duration > 0 else { return }
        let fastest = Float(controller?.view.window?.screen.maximumFramesPerSecond ?? UIScreen.main.maximumFramesPerSecond)
        func add(_ layer: CALayer?, _ path: String, _ key: String, _ values: [Any]) {
            guard let layer else { return }
            let a = CAKeyframeAnimation(keyPath: path)
            a.values = values
            a.duration = duration
            a.calculationMode = .linear
            a.beginTime = f.start
            a.fillMode = .both
            a.isRemovedOnCompletion = true
            a.preferredFrameRateRange = CAFrameRateRange(minimum: min(80, fastest), maximum: fastest, preferred: fastest)
            layer.add(a, forKey: LaunchSession.flightKey + key)
        }
        let card = cardView?.layer
        add(card, "bounds", ".a", ls.map { NSValue(cgRect: $0.cardBounds) })
        add(card, "position", ".b", ls.map { NSValue(cgPoint: $0.cardPosition) })
        add(card, "transform", ".c", ls.map { NSValue(caTransform3D: $0.cardTransform) })
        add(card, "cornerRadius", ".d", ls.map { $0.radius })
        let content = self.content?.layer
        add(content, "transform", ".a", ls.map { NSValue(caTransform3D: $0.contentTransform) })
        add(content, "position", ".b", ls.map { NSValue(cgPoint: $0.contentPosition) })
        add(art?.layer, "position", ".a", ls.map { NSValue(cgPoint: $0.artPosition) })
        add(art?.layer, "transform", ".b", ls.map { NSValue(caTransform3D: $0.artTransform) })
        add(art?.layer, "opacity", ".c", ls.map { $0.artOpacity })
        add(ownsHome ? zoom?.layer : nil, "transform", ".a", ls.map { NSValue(caTransform3D: $0.homeTransform) })
        add(dim?.layer, "opacity", ".a", ls.map { $0.dimOpacity })
    }

    // MARK: the link: the blur, and the flight's moments

    private func startLink() {
        guard link == nil else { return }
        let link = CADisplayLink(target: LinkTarget(self), selector: #selector(LinkTarget.tick(_:)))
        // A spatial transition asks for the panel's full rate: at `.default` a ProMotion iPhone paces this at 60 Hz.
        let fastest = Float(controller?.view.window?.screen.maximumFramesPerSecond ?? UIScreen.main.maximumFramesPerSecond)
        link.preferredFrameRateRange = CAFrameRateRange(minimum: min(80, fastest), maximum: fastest, preferred: fastest)
        link.add(to: .main, forMode: .common)
        self.link = link
    }

    private final class LinkTarget {
        weak var session: LaunchSession?
        init(_ s: LaunchSession) { session = s }
        @objc func tick(_ link: CADisplayLink) {
            guard let s = session else { return link.invalidate() }
            s.tick(link.targetTimestamp)
        }
    }

    private func tick(_ now: Double) {
        var busy = false
        if let f = flight {
            busy = true
            blur?.amount = f.blur(at: now)
            let t = now - f.start
            switch phase {
            case .opening:
                if !shown, revealCountdown == nil, t >= f.mount { revealCountdown = K.firstPaintFrames + 1 }
                // Touches from the moment the demo shows or the card fills the screen, not once the home settles.
                if shown || t >= f.cardDone { completePresentation() }
                if t >= f.cardDone { installGestures() }
                if t >= f.end {
                    flight = nil
                    opened()
                }
            case .returning:
                if t >= f.end { flight = nil; phase = .open; rest() }
            case .closing:
                keepCard()
                // Covered by the artwork: the demo stops drawing; its route goes once all is still.
                if t >= f.covered, controller?.view.isHidden == false { controller?.view.isHidden = true }
                if t >= routeAt { routeAt = .infinity; leave() }
                if t >= f.cardDone, cardView?.isHidden == false { landCard() }
                if t >= f.end { flight = nil; land(); return }
            default: flight = nil
            }
        }
        if let n = revealCountdown {
            busy = true
            if n <= 0 {
                revealCountdown = nil
                shown = true
                NotificationCenter.default.post(name: LaunchSession.shownChanged, object: self)
                if let card {
                    let a = CABasicAnimation(keyPath: "opacity")
                    a.fromValue = 1
                    a.toValue = 0
                    a.duration = K.contentFade / 1000
                    a.timingFunction = CAMediaTimingFunction(controlPoints: 1.0 / 3, 2.0 / 3, 2.0 / 3, 1)
                    card.layer.add(a, forKey: "reveal")
                    card.alpha = 0
                }
            } else { revealCountdown = n - 1 }
        }
        if !busy { link?.invalidate(); link = nil }
    }

    /// q: the card's width from the icon (0) to the screen (1).
    private func widthProgress() -> Double {
        let iw = Double(iconFrame.width) * (closing ? homeScale.x : 1)
        let span = Double(screen.width) - iw
        return span > 0 ? (w.x - iw) / span : 1
    }

    private func openRadius() -> Double {
        let q = widthProgress(), rd = Double(screenCornerRadius)
        var last = (q: 0.0, r: Double(iconRadius) / rd)
        for p in K.openRadius {
            if q <= p.q { return rd * lerp(last.r, p.r, clamp01((q - last.q) / (p.q - last.q))) }
            last = p
        }
        return rd
    }

    private func artAlpha() -> Double {
        guard art != nil, phase == .opening || phase == .closing else { return 0 }
        return 1 - smoothstep(K.artGone.from, K.artGone.to, w.x / Double(screen.width))
    }
}

extension LaunchSession: UIGestureRecognizerDelegate {
    /// Where the close may start: the strip over the status bar always; below it anywhere the demo's zone
    /// (`CloseZone`) allows and no vertical scroller under the finger is scrolled into its content.
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        // The strip is the status bar's height, but a finger rarely lands on the status bar itself (the system keeps
        // the touches there): a drag down from the top of the screen is the close's as well.
        let p = touch.location(in: nil)
        let inStrip = touch.view is GrabZone || p.y < max(grab?.bounds.height ?? 0, screen.height * K.stripFraction)
        stripTouch = inStrip
        scrollers = []
        if inStrip { return true }
        guard zone.allows(p, in: screen) else { return false }
        // iOS's hand-off: a scroller at its top gives the pull to the close, one scrolled into its content keeps it.
        var at = touch.view
        while let v = at {
            if let s = v as? UIScrollView, LaunchSession.scrollsVertically(s) {
                guard s.contentOffset.y <= -s.adjustedContentInset.top + 1 else { scrollers = []; return false }
                scrollers.append(s)
            }
            at = v.superview
        }
        return true
    }

    private static func scrollsVertically(_ s: UIScrollView) -> Bool {
        guard s.isScrollEnabled else { return false }
        let room = s.bounds.height - s.adjustedContentInset.top - s.adjustedContentInset.bottom
        return s.contentSize.height > room + 1 || s.alwaysBounceVertical
    }

    /// A touch in the strip never reaches the demo: its recognizers wait for the close to fail.
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
        stripTouch
    }

    /// A scroller at its top recognizes its own pan on the same pull: both run until the close begins, which cancels it.
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        scrollers.contains { $0.panGestureRecognizer === other }
    }

    /// The pull took hold: the scrollers under it let go (toggling a recognizer cancels it) and spring back behind the still.
    fileprivate func beganScrollers() {
        for s in scrollers { s.panGestureRecognizer.isEnabled = false; s.panGestureRecognizer.isEnabled = true }
        scrollers = []
    }
}

// MARK: - The card in the route (`demo-card`)

/// The route's `demo-card`: covers the demo until it has painted; `leave` is the route's close.
final class DemoCardView: UIView {
    var slug = ""
    var name = ""
    var zone = CloseZone()
    var onLeave: (() -> Void)?
    func leave() { onLeave?() }
    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { LaunchSession.attach(self); PhoneFeedback.attach(self) }
    }
}

/// `present` wrapped once: Exact's fullscreen presentation over the home is the launch's.
func installLaunch() {
    struct Once { static let done: Void = {
        let cls = UIViewController.self
        guard let original = class_getInstanceMethod(cls, #selector(UIViewController.present(_:animated:completion:))),
              let wrapped = class_getInstanceMethod(cls, #selector(UIViewController.demosLaunchPresent(_:animated:completion:))) else { return }
        method_exchangeImplementations(original, wrapped)
    }() }
    _ = Once.done
}

extension UIViewController {
    @objc func demosLaunchPresent(_ presented: UIViewController, animated: Bool, completion: (() -> Void)?) {
        if presented.modalPresentationStyle == .overFullScreen, presented.transitioningDelegate == nil,
           !LaunchSession.holds(self) {
            LaunchSession.adopt(presented, slug: LaunchIcons.shared.takeTouched() ?? LaunchIcons.shared.heldSlug(of: presented))
        }
        demosLaunchPresent(presented, animated: animated, completion: completion)
    }
}
#endif

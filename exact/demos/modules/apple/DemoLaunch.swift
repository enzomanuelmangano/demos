// The demo screen's open and close, drawn like iOS's app launch and its swipe home.
//
// Open: a card holding the app grows out of the tapped icon; its width, aspect and centre each run
// their own spring. The icon's artwork cross-fades into it, the corners overshoot the display radius
// and settle, the card is a slight trapezoid that straightens as it lands, and the home behind
// shrinks, blurs and dims. Close: a drag shrinks the card under the finger; a throw (or a pull past
// a fifth of the screen) flies it into its icon, a shorter pull springs back.
//
// `present(_:animated:completion:)` is swizzled once (`installLaunch`) so the presented
// `.overFullScreen` controller gets this file's transitioning delegate, named by the icon the finger
// last touched (LaunchIconHatch.swift). Touches are never held for the motion's tail: the
// presentation completes as soon as the demo shows, and a close may interrupt the open mid-flight;
// a close flies the live demo home inside the card and hands the route back once the card is on its
// way (`routeLeaves`), so the release costs no picture and no unmount; a close that UIKit asked for
// has its route going at once and flies a touch-transparent still picture instead.
#if os(iOS)
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
    /// A release closes when it is a throw down, or lands past a fifth of the screen.
    static let closeVelocity: CGFloat = 400
    static let closeTravel: CGFloat = 0.2
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
        touched = (slug, CACurrentMediaTime())
    }
    /// The demo a presentation now opens out of: an icon touched in the last two seconds.
    func takeTouched() -> String? {
        defer { touched = nil }
        guard let t = touched, CACurrentMediaTime() - t.at < 2 else { return nil }
        return t.slug
    }
    func view(_ slug: String) -> UIView? {
        guard let v = views[slug]?.view, v.window != nil else { return nil }
        return v
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

// MARK: - The close drag: a pan held until it moves down (activeOffsetY 10, failOffsetX ±30)

private final class ClosePan: UIPanGestureRecognizer {
    override init(target: Any?, action: Selector?) {
        super.init(target: target, action: action)
        maximumNumberOfTouches = Int.max
    }
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        // Keeps the pan from beginning until touchesMoved decides.
        super.minimumNumberOfTouches = 20
        super.touchesBegan(touches, with: event)
    }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesMoved(touches, with: event)
        guard state == .possible else { return }
        let trans = translation(in: nil)
        if trans.x < -K.failSideways || trans.x > K.failSideways { state = .failed; return }
        if trans.y > K.activeOffsetY {
            super.minimumNumberOfTouches = 1
            if numberOfTouches >= 1 {
                state = .began
                setTranslation(.zero, in: nil)
            }
        }
    }
}

/// The strip over the status bar: its drags are always the close's and never reach the demo.
private final class GrabZone: UIView {}

/// The card: a plain clipping view around the presented view.
private final class CardView: UIView {}

// MARK: - One demo's launch session

final class LaunchSession: NSObject, UIViewControllerTransitioningDelegate {
    static weak var current: LaunchSession?
    /// The session that last opened over the home: the only one that moves or shows it.
    private static weak var homeOwner: LaunchSession?
    private var ownsHome: Bool { LaunchSession.homeOwner == nil || LaunchSession.homeOwner === self }
    private static var live: [LaunchSession] = []
    static let shownChanged = Notification.Name("DemosLaunchShownChanged")

    private enum Phase { case opening, open, dragging, returning, closing, landed }

    /// The tapped icon's demo (nil: a deep link, which simply appears).
    let slug: String?
    private weak var controller: UIViewController?
    private weak var card: DemoCardView?
    private var owns: Bool { card?.ownsDrags ?? false }

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
        super.init()
    }

    var buttonsVisible: Bool { shown && !closing }

    static func adopt(_ controller: UIViewController, slug: String?) {
        let session = LaunchSession(controller: controller, slug: slug)
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
        icon.isHidden = true
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
        if LaunchSession.current === self { LaunchSession.current = nil }
        controller?.view.isUserInteractionEnabled = false
        guard grouped else {
            closed(haptic: haptic)
            leave()
            return
        }
        if let pan { pan.view?.removeGestureRecognizer(pan) }
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
        closed(haptic: haptic)
        if dismissing != nil, detached { DispatchQueue.main.async { [self] in leave() } }
        else { routeAt = K.routeLeaves }
    }

    /// What the close does that is not the card: the haptic, the keyboard, the buttons.
    private func closed(haptic: Bool) {
        if haptic { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
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
        guard snapshot == nil, let view = controller?.view, let cardView,
              let picture = LaunchSession.picture(of: view) else { return }
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
        if dismissing == nil { card?.leave() }
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
        if !grouped { land() }
        if phase == .landed || !grouped { LaunchSession.live.removeAll { $0 === self } }
    }

    private func landCard() {
        icon?.isHidden = false
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
        if routeGone { LaunchSession.live.removeAll { $0 === self } }
    }

    // MARK: drag

    private func dragPose(_ t: CGPoint) -> (s: CGFloat, x: CGFloat, y: CGFloat) {
        let d = max(0, t.y)
        let s = max(K.dragMinScale, 1 - d / (K.dragTravel * screen.height))
        let x = dragAnchor.x + t.x + (screen.width / 2 - dragAnchor.x) * s
        let y = dragAnchor.y + d + (screen.height / 2 - dragAnchor.y) * s
        return (s, x, y)
    }

    @objc private func dragged(_ pan: UIPanGestureRecognizer) {
        switch pan.state {
        case .began:
            // Only a card at rest is taken (one springing back finishes first).
            guard phase == .open || phase == .opening, grouped, !closing else { return }
            if phase == .opening { flight = nil; removeFlight(); completePresentation() }
            unrest()
            dragAnchor = pan.location(in: nil)
            phase = .dragging
            moveDrag(pan)
        case .changed:
            guard phase == .dragging else { return }
            moveDrag(pan)
        case .ended, .cancelled, .failed:
            guard phase == .dragging else { return }
            let t = pan.translation(in: nil), v = pan.velocity(in: nil)
            let d = max(0, t.y)
            let thrown = d + max(0, v.y) * K.throwProjection
            let held = dragPose(t)
            let ds = d > 0 && held.s > K.dragMinScale ? -Double(v.y) / Double(K.dragTravel * screen.height) : 0
            let vw = Double(screen.width) * ds, vh = Double(screen.height) * ds
            let vx = Double(v.x) + Double(screen.width / 2 - dragAnchor.x) * ds
            let vy = (d > 0 ? Double(v.y) : 0) + Double(screen.height / 2 - dragAnchor.y) * ds
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

    private func moveDrag(_ pan: UIPanGestureRecognizer) {
        let d = dragPose(pan.translation(in: nil))
        w.set(Double(screen.width * d.s)); h.set(Double(screen.height * d.s))
        cx.set(Double(d.x)); cy.set(Double(d.y))
        radius = Double(screenCornerRadius * d.s)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        put(pose(at: 0))
        CATransaction.commit()
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
    /// A demo whose drags own the screen keeps every touch below the strip.
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        let inStrip = touch.view is GrabZone || touch.location(in: nil).y < (grab?.bounds.height ?? 0)
        stripTouch = inStrip
        return !owns || inStrip
    }

    /// A touch in the strip never reaches the demo: its recognizers wait for the close to fail.
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
        stripTouch
    }
}

// MARK: - The card in the route (`demo-card`)

/// The route's `demo-card`: covers the demo until it has painted; `leave` is the route's close.
final class DemoCardView: UIView {
    var slug = ""
    var name = ""
    var ownsDrags = false
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
            LaunchSession.adopt(presented, slug: LaunchIcons.shared.takeTouched())
        }
        demosLaunchPresent(presented, animated: animated, completion: completion)
    }
}
#endif

// The demo screen's open and close, as iOS 27's SpringBoard draws an app's launch and its
// swipe home. Every number here was measured frame by frame on the owner's recording of the
// real SpringBoard (iPhone 17, 402 × 874 pt, 60 fps:
// exact/parity-tools/ios-launch-reference, kept out of git; the port-demo skill's Traps list
// what was measured and how).
//
// The open: a card of the app grows out of the tapped icon. Its width, its aspect (height /
// width), its centre x and its centre y each run their own spring from the icon's frame to the
// screen's. The app's content is scaled to the card's width and pinned to its top (the card
// crops it at the bottom). The icon's artwork, stretched to the card, cross-fades into it by a
// third of the screen's width. The card's corners grow past the display's radius mid-flight and
// settle on it; the card is a slight trapezoid (wider at the top) that straightens as it lands.
// Behind it the home shrinks to 0.912, blurs (Gaussian, σ 25 pt) and dims (× 0.445).
//
// The close: a drag shrinks the card under the finger (scale 1 − travel / 0.7 screen
// heights, the grabbed point staying under the finger, corners at the display radius × scale,
// the home still blurred). Let go with a throw (or past a fifth of the screen) and the card flies
// into its icon on softer springs that keep the throw's velocity, cross-fading back into the
// artwork; the home's blur and dimming clear and it grows back to full size. Let go short of it
// and the card springs back to full screen on the open's springs.
//
// The Exact route is UIKit's `.overFullScreen` presentation. Its controller is made inside the
// host's present, so `present(_:animated:completion:)` is wrapped once (`installLaunch`) to give
// it this file's transitioning delegate before UIKit asks for one, named by the icon the finger
// went down on (LaunchIconHatch.swift). The presented view goes into a plain clipping view (the
// card: bounds, cornerRadius + cornerCurve + masksToBounds, a projective transform for the
// taper): no mask layer, no rasterization. At rest the card is the screen (no clipping, identity)
// and the home, its blur and its dimming are hidden under it.
#if os(iOS)
import ObjectiveC
import UIKit
import UIKit.UIGestureRecognizerSubclass

// MARK: - The measured numbers

/// A spring by its natural frequency ω (rad/s) and damping ratio ζ, mass 1: stiffness ω²,
/// damping 2ζω.
struct SpringParams { let omega: Double, zeta: Double }

private enum K {
    // The open (two launches fitted; each row is the mean, rms error ≤ 1.1 pt).
    static let openWidth = SpringParams(omega: 22.6, zeta: 0.977)      // k 511, c 44.2
    static let openAspect = SpringParams(omega: 34.6, zeta: 1.088)     // k 1197, c 75.3
    static let openCenterX = SpringParams(omega: 26.9, zeta: 1.02)     // k 724, c 54.9
    static let openCenterY = SpringParams(omega: 32.1, zeta: 0.892)    // k 1030, c 57.3
    // The flight home after a throw (two closes fitted, the throw's velocity kept).
    static let closeWidth = SpringParams(omega: 15.7, zeta: 0.867)     // k 246, c 27.2
    static let closeHeight = SpringParams(omega: 25.7, zeta: 0.948)    // k 660, c 48.7
    static let closeCenterX = SpringParams(omega: 12.6, zeta: 0.67)    // k 159, c 16.9
    static let closeCenterY = SpringParams(omega: 13.6, zeta: 0.72)    // k 185, c 19.6
    // The home behind the card.
    static let homeScale = 0.912
    static let homeBlurSigma = 25.0          // pt, Gaussian
    static let homeGain = 0.445              // its brightness under the open card
    static let openHomeScale = SpringParams(omega: 11, zeta: 1)
    static let openHomeBlur = SpringParams(omega: 10.5, zeta: 1)
    static let openHomeDim = SpringParams(omega: 25, zeta: 1)
    static let closeHomeScale = SpringParams(omega: 10, zeta: 1)
    static let closeHomeDim = SpringParams(omega: 8.7, zeta: 0.73)
    /// The blur clears exponentially once the card is let go: σ × e^(−12.6 t).
    static let closeBlurRate = 12.6
    // The drag.
    static let dragTravel: CGFloat = 0.7     // × screen height for the card to vanish
    static let dragMinScale: CGFloat = 0.3
    static let failSideways: CGFloat = 30
    static let activeOffsetY: CGFloat = 10
    /// A release closes when it is a throw down, or lands past a fifth of the screen.
    static let closeVelocity: CGFloat = 400
    static let closeTravel: CGFloat = 0.2
    static let throwProjection: CGFloat = 0.15
    // The icon's artwork: opaque at a fifth of the screen's width, gone at 0.42.
    static let artGone = (from: 0.2, to: 0.42)
    // The taper: the width shrinks by k per pt down the card, k = taper × (1 − q) / screen width
    // (8.3e-4 /pt at 402 pt), q the card's width progress from the icon (0) to the screen (1).
    static let taper: Double = 0.334
    /// After a release the taper comes in over this long.
    static let taperIn = 0.065
    /// The open's corner radius against its width progress q, × the display radius (q = 0 is
    /// the icon's own radius).
    static let openRadius: [(q: Double, r: Double)] = [
        (0.14, 0.53), (0.35, 0.84), (0.45, 1.0), (0.5, 1.18), (0.6, 1.27), (0.7, 1.29), (0.8, 1.26),
        (0.85, 1.23), (0.9, 1.16), (0.95, 1.10), (0.98, 1.056), (1, 1),
    ]
    /// The close keeps the release's radius down to this q, then rounds into the icon's.
    static let closeRadiusFrom = 0.35
    // The demo's own reveal (RN's card: its backdrop until the demo has painted).
    static let contentFade: Double = 200
    static let firstPaintFrames = 4
    static let mountAt = 0.85
    /// springboard.contract's icon radius ratio.
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
    /// Within `tolerance` of its target and nearly still.
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
    /// The icon a finger last went down on, and when: the tap that names a launch.
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
    /// 0 … 1 of the blur at its full radius: the paused animator's fraction.
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

/// What the effect view gives, measured on the simulator (a held drag, the home fitted as
/// gain × blur_σ(scale × home) + offset): at fraction 1 this material is σ 31 pt and gain 0.48, so
/// the reference's σ 25 pt is fraction 0.85 (checked: σ 23.5 at 0.8), where the material's own
/// gain is 0.56; the dimming view supplies the rest of the reference's 0.445.
private enum BlurCalibration {
    static let style: UIBlurEffect.Style = .systemUltraThinMaterialDark
    static let fullFraction: Double = 0.85
    /// The material's own brightness gain at amount 1 (linear in the amount).
    static let gainAtFull: Double = 0.56
}

// MARK: - The close drag: a pan held until it moves down (activeOffsetY 10, failOffsetX ±30)

private final class ClosePan: UIPanGestureRecognizer {
    override init(target: Any?, action: Selector?) {
        super.init(target: target, action: action)
        maximumNumberOfTouches = Int.max
    }
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        // Held from beginning on its own until the criteria are met.
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

/// The grab strip over the status bar: above the demo, so a drag there is always the close's
/// and a touch there never reaches the demo.
private final class GrabZone: UIView {}

/// The card: a plain clipping view around the presented view.
private final class CardView: UIView {}

// MARK: - One demo's launch session

final class LaunchSession: NSObject, UIViewControllerTransitioningDelegate {
    /// The demo on screen (not closing): its card and buttons read it.
    static weak var current: LaunchSession?
    /// Sessions alive: a close still landing while the next opens.
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
    fileprivate var stripTouch = false

    // Geometry, in window points.
    private var screen = CGSize.zero
    private var iconFrame = CGRect.zero        // the icon at the home's full size
    private var iconRadius: CGFloat = 0
    private var w = Spring(0), h = Spring(0), aspect = Spring(1), cx = Spring(0), cy = Spring(0)
    private var radius: Double = 0
    private var releaseRadius: Double = 0
    private var dragAnchor = CGPoint.zero      // where the finger took the card
    // The home.
    private var homeScale = Spring(1), homeBlur = Spring(0), homeDim = Spring(0)

    // What it adds.
    private weak var icon: UIView?
    private weak var home: UIView?
    private var cardView: CardView?
    private var art: UIView?
    private var blur: HomeBlur?
    private var dim: UIView?
    private var grab: GrabZone?
    private var pan: ClosePan?
    private var link: CADisplayLink?
    private var presenting: UIViewControllerContextTransitioning?
    private var dismissing: UIViewControllerContextTransitioning?

    // The content reveal.
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

    /// The route's `demo-card`, made once the presentation is under way.
    static func attach(_ card: DemoCardView) {
        guard let session = live.last(where: { s in
            guard let v = s.controller?.viewIfLoaded else { return false }
            return card.isDescendant(of: v)
        }) ?? current else { return }
        session.card = card
        if session.shown { card.alpha = 0 }
    }

    /// Whether `controller` is (or is inside) a demo the launch holds.
    static func holds(_ controller: UIViewController) -> Bool {
        var at: UIViewController? = controller
        while let c = at {
            if live.contains(where: { $0.controller === c }) { return true }
            at = c.parent ?? c.presentingViewController
        }
        return false
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
        cardView.addSubview(view)
        // The icon it opens out of: a deep link has none, and the demo simply appears.
        guard let slug, let icon = LaunchIcons.shared.view(slug), let host = container.superview else {
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
        // The icon's artwork, lifted into the card (the card clips it to its corners).
        if let art = icon.snapshotView(afterScreenUpdates: false) {
            art.isUserInteractionEnabled = false
            art.bounds = CGRect(origin: .zero, size: iconFrame.size)
            cardView.addSubview(art)
            self.art = art
        }
        icon.isHidden = true
        moving(true)
        w.set(Double(iconFrame.width)); w.run(to: Double(screen.width), K.openWidth)
        aspect.set(Double(iconFrame.height / iconFrame.width))
        aspect.run(to: Double(screen.height / screen.width), K.openAspect)
        h.set(w.x * aspect.x)
        cx.set(Double(iconFrame.midX)); cx.run(to: Double(screen.width / 2), K.openCenterX)
        cy.set(Double(iconFrame.midY)); cy.run(to: Double(screen.height / 2), K.openCenterY)
        homeScale.set(1); homeScale.run(to: K.homeScale, K.openHomeScale)
        homeBlur.set(0); homeBlur.run(to: 1, K.openHomeBlur)
        homeDim.set(0); homeDim.run(to: 1, K.openHomeDim)
        phase = .opening
        presenting = ctx
        fly()
    }

    /// The card is the screen: the transition completes, and what it covers stops drawing.
    private func opened() {
        guard let view = controller?.view else { return }
        phase = .open
        rest()
        let grab = GrabZone(frame: CGRect(x: 0, y: 0, width: view.bounds.width,
                                          height: view.window?.safeAreaInsets.top ?? 0))
        grab.autoresizingMask = [.flexibleWidth]
        grab.backgroundColor = .clear
        view.addSubview(grab)
        self.grab = grab
        // On the window, as RN's CloseGesture wraps the whole screen: a GPU canvas's touches
        // never pass through the presented view's recognizers.
        let pan = ClosePan(target: self, action: #selector(dragged(_:)))
        pan.delegate = self
        (view.window ?? view).addGestureRecognizer(pan)
        self.pan = pan
    }

    /// The card's bounds move every frame while it flies: the demo inside is not laid out again
    /// for them. At rest it fills the screen and follows it.
    private func moving(_ on: Bool) {
        cardView?.autoresizesSubviews = !on
        cardView?.layer.masksToBounds = on
        cardView?.layer.allowsEdgeAntialiasing = on
    }

    /// At rest: the card unclipped and untransformed, the home and its blur hidden under it.
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
        home?.isHidden = true
        CATransaction.commit()
    }

    /// The home, its blur and dimming back on screen at the open's full state, for a close.
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

    /// The close button: the card flies home from full screen.
    func closeFromButton() {
        guard phase == .open || !grouped else { return }
        if closing { return }
        if grouped { unrest() }
        commit(haptic: true, velocity: nil)
    }

    /// Let go: the card flies into the icon from the pose it is in, keeping the throw.
    private func commit(haptic: Bool, velocity: (w: Double, h: Double, x: Double, y: Double)?) {
        guard !closing else { return }
        closing = true
        if haptic { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
        if LaunchSession.current === self { LaunchSession.current = nil }
        controller?.view.isUserInteractionEnabled = false
        controller?.view.window?.endEditing(true)
        NotificationCenter.default.post(name: LaunchSession.shownChanged, object: self)
        guard grouped else {
            // No icon to fly to (a deep link): the plain back.
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
        fly()
    }

    /// The icon where the home now draws it (the home grows back under the flight).
    private func retargetIcon() {
        let s = homeScale.x
        let mid = CGPoint(x: screen.width / 2, y: screen.height / 2)
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
            if phase == .open { unrest() }
            commit(haptic: false, velocity: nil)
        }
    }

    private func finishDismissal() {
        guard let ctx = dismissing else { return }
        dismissing = nil
        ctx.view(forKey: .from)?.removeFromSuperview()
        cardView?.removeFromSuperview()
        ctx.completeTransition(true)
        if !grouped { land() }
        if phase == .landed || !grouped { LaunchSession.live.removeAll { $0 === self } }
    }

    /// The artwork is the icon, in its place: the icon takes over, the card goes.
    private func landCard() {
        icon?.isHidden = false
        art?.removeFromSuperview()
        art = nil
        cardView?.isHidden = true
    }

    /// Everything at rest: the blur and dimming gone, then the route's unmount on a still screen.
    private func land() {
        phase = .landed
        removeFlight()
        landCard()
        blur?.removeFromSuperview()
        blur = nil
        dim?.removeFromSuperview()
        dim = nil
        home?.transform = .identity
        home?.isHidden = false
        link?.invalidate()
        link = nil
        if grouped, !routeGone { DispatchQueue.main.async { [self] in leave() } }
        if routeGone { LaunchSession.live.removeAll { $0 === self } }
    }

    // MARK: drag

    private func dragPose(_ t: CGPoint) -> (s: CGFloat, x: CGFloat, y: CGFloat) {
        let d = max(0, t.y)
        let s = max(K.dragMinScale, 1 - d / (K.dragTravel * screen.height))
        // The grabbed point stays under the finger.
        let x = dragAnchor.x + t.x + (screen.width / 2 - dragAnchor.x) * s
        let y = dragAnchor.y + d + (screen.height / 2 - dragAnchor.y) * s
        return (s, x, y)
    }

    @objc private func dragged(_ pan: UIPanGestureRecognizer) {
        switch pan.state {
        case .began:
            // Only a card at rest is taken (one springing back finishes first).
            guard phase == .open, grouped, !closing else { return }
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
            // The card's own velocities: d(scale)/dt = −v / travel while the finger is past start.
            let ds = d > 0 && held.s > K.dragMinScale ? -Double(v.y) / Double(K.dragTravel * screen.height) : 0
            let vw = Double(screen.width) * ds, vh = Double(screen.height) * ds
            let vx = Double(v.x) + Double(screen.width / 2 - dragAnchor.x) * ds
            let vy = (d > 0 ? Double(v.y) : 0) + Double(screen.height / 2 - dragAnchor.y) * ds
            if pan.state == .ended, v.y > -100, v.y > K.closeVelocity || thrown > K.closeTravel * screen.height {
                commit(haptic: true, velocity: (vw, vh, vx, vy))
            } else {
                // Short of it: back to full screen on the open's springs.
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

    /// Everything one frame shows.
    private struct Pose {
        var w = 0.0, h = 0.0, cx = 0.0, cy = 0.0, radius = 0.0, taper = 0.0, art = 0.0
        var homeScale = 1.0, dim = 0.0, blur = 0.0
    }

    /// The pose of the springs as they are, `since` seconds into the phase.
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
        // The home's brightness: 1 → 0.445 with the dimming; the blur's own tint is part of it.
        let gain = 1 - (1 - K.homeGain) * clamp01(homeDim.x)
        let blurGain = 1 - (1 - BlurCalibration.gainAtFull) * p.blur
        p.dim = clamp01(1 - gain / max(blurGain, 0.01))
        return p
    }

    /// One step of the phase's springs.
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
        var end = 0.0             // the home is still too
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

    /// Runs the phase's springs to rest ahead of time and gives Core Animation the whole path: the
    /// render server draws it, so a busy main thread (the demo mounting, unmounting) can't drop
    /// its frames. The link only scrubs the blur and acts at the flight's moments.
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
        // The last pose is the rest the springs reach.
        f.cardDone = cardDone ?? t
        f.end = t
        let last = f.poses[f.poses.count - 1]
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        removeFlight()
        put(last)
        f.start = CACurrentMediaTime()
        animate(f)
        CATransaction.commit()
        // The open is made inside the host's apply, which goes on to mount the demo's route on
        // this thread (100–300 ms for a GPU demo). Commit the flight now so the render server
        // starts it under the finger instead of when the mount is done.
        if phase == .opening { CATransaction.flush() }
        flight = f
        blur?.amount = f.poses[0].blur
        startLink()
    }

    private static let flightKey = "launch"

    private func removeFlight() {
        for layer in [cardView?.layer, controller?.view.layer, art?.layer, home?.layer, dim?.layer] {
            layer?.removeAnimation(forKey: LaunchSession.flightKey + ".a")
            layer?.removeAnimation(forKey: LaunchSession.flightKey + ".b")
            layer?.removeAnimation(forKey: LaunchSession.flightKey + ".c")
            layer?.removeAnimation(forKey: LaunchSession.flightKey + ".d")
        }
    }

    /// The layer values of one pose.
    private struct LayerPose {
        var cardBounds: CGRect, cardPosition: CGPoint, cardTransform: CATransform3D, radius: CGFloat
        var contentTransform: CATransform3D, contentPosition: CGPoint
        var artPosition: CGPoint, artTransform: CATransform3D, artOpacity: Float
        var homeTransform: CATransform3D, dimOpacity: Float
    }

    private func layerPose(_ p: Pose) -> LayerPose {
        let W = CGFloat(p.w), H = CGFloat(p.h), k = CGFloat(p.taper)
        // The taper is a projective transform about the card's centre (w = 1 + k·y). Solve the
        // unprojected height and centre that land its top and bottom where the springs say.
        let top = CGFloat(p.cy) - H / 2, bottom = CGFloat(p.cy) + H / 2
        var half = H / 2
        if k != 0 { for _ in 0..<4 { half = (bottom - top) / 2 * (1 - k * k * half * half) } }
        let centerY = k != 0 ? top + half / (1 - k * half) : CGFloat(p.cy)
        var cardTransform = CATransform3DIdentity
        cardTransform.m24 = k
        // The app, scaled to the card's width and pinned to its top.
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

    /// Sets the layers to a pose (the drag, and the model values under a flight).
    private func put(_ p: Pose) {
        let l = layerPose(p)
        if let c = cardView?.layer {
            c.bounds = l.cardBounds; c.position = l.cardPosition; c.transform = l.cardTransform
            c.cornerRadius = l.radius
        }
        if let v = controller?.view.layer {
            v.transform = l.contentTransform; v.position = l.contentPosition
        }
        if let a = art?.layer {
            a.position = l.artPosition; a.transform = l.artTransform; a.opacity = l.artOpacity
        }
        home?.layer.transform = l.homeTransform
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
            // A spatial transition asks for the panel's full rate (80–120 on ProMotion).
            a.preferredFrameRateRange = CAFrameRateRange(minimum: min(80, fastest), maximum: fastest, preferred: fastest)
            layer.add(a, forKey: LaunchSession.flightKey + key)
        }
        let card = cardView?.layer
        add(card, "bounds", ".a", ls.map { NSValue(cgRect: $0.cardBounds) })
        add(card, "position", ".b", ls.map { NSValue(cgPoint: $0.cardPosition) })
        add(card, "transform", ".c", ls.map { NSValue(caTransform3D: $0.cardTransform) })
        add(card, "cornerRadius", ".d", ls.map { $0.radius })
        let content = controller?.view.layer
        add(content, "transform", ".a", ls.map { NSValue(caTransform3D: $0.contentTransform) })
        add(content, "position", ".b", ls.map { NSValue(cgPoint: $0.contentPosition) })
        add(art?.layer, "position", ".a", ls.map { NSValue(cgPoint: $0.artPosition) })
        add(art?.layer, "transform", ".b", ls.map { NSValue(caTransform3D: $0.artTransform) })
        add(art?.layer, "opacity", ".c", ls.map { $0.artOpacity })
        add(home?.layer, "transform", ".a", ls.map { NSValue(caTransform3D: $0.homeTransform) })
        add(dim?.layer, "opacity", ".a", ls.map { $0.dimOpacity })
    }

    // MARK: the link: the blur, and the flight's moments

    private func startLink() {
        guard link == nil else { return }
        let link = CADisplayLink(target: LinkTarget(self), selector: #selector(LinkTarget.tick(_:)))
        // A spatial transition asks for the panel's full rate: at `.default` a ProMotion
        // iPhone paces this link at 60 Hz.
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
                if t >= f.end {
                    flight = nil
                    presenting?.completeTransition(!(presenting?.transitionWasCancelled ?? false))
                    presenting = nil
                    opened()
                }
            case .returning:
                if t >= f.end { flight = nil; phase = .open; rest() }
            case .closing:
                // Covered by the artwork: the demo stops drawing; its route goes once all is still.
                if t >= f.covered, controller?.view.isHidden == false { controller?.view.isHidden = true }
                if t >= f.cardDone, cardView?.isHidden == false { landCard() }
                if t >= f.end { flight = nil; land(); return }
            default: flight = nil
            }
        }
        // The demo shows once it has painted: its cover fades out (200 ms, out(quad)).
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
                    // out(quad) = 1 − (1 − x)², a cubic Bézier exactly: (1/3, 2/3), (2/3, 1).
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

    /// A touch in the strip never reaches the demo: what the demo's own recognizers would make
    /// of it waits for the close to fail.
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
        stripTouch
    }
}

// MARK: - The card in the route (`demo-card`)

/// The demo's cover until it has painted (its backdrop until the demo fades in over it), and the
/// route's hold on the launch: `press` is the route's leave.
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
        // A demo route: Exact's fullscreen presentation over the home, not one a demo presents.
        if presented.modalPresentationStyle == .overFullScreen, presented.transitioningDelegate == nil,
           !LaunchSession.holds(self) {
            LaunchSession.adopt(presented, slug: LaunchIcons.shared.takeTouched())
        }
        demosLaunchPresent(presented, animated: animated, completion: completion)
    }
}
#endif

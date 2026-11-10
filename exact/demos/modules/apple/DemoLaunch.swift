// The demo screen's open and close, as RN's launch choreography draws them
// (src/navigation/home/demo-screen.tsx, launch-transition.tsx, springboard.tsx's blur).
//
// RN's demo is a transparent route over the home: a card of the demo's backdrop grows out of
// the tapped icon on the launch spring (k 380, c 36, m 1, overshootClamping) while the icon's
// artwork flies over it and fades by 30 % of the way; the demo mounts at 85 % and fades in
// (200 ms, out(quad)) once it has painted. A drag down (activeOffsetY 10, failOffsetX ±30) holds
// the card: it follows the finger at 0.5 vertically and 0.35 sideways and shrinks to 0.5 over half
// the screen; past 0.75 (or a release whose throw of 0.12 s would carry it there) it closes with
// impactMedium, else it springs home (k 300, c 26, m 1). The close flies the card into the icon
// on a 450 ms out(cubic) timing, cross-fading into the artwork, the route going at expansion 0.2.
// The home under the card is blurred (expo-blur, dark, 90 × expansion × the drag's own factor).
//
// The Exact route is UIKit's `.overFullScreen` presentation. Its controller is made inside the
// host's present, so `present(_:animated:completion:)` is wrapped once (`installLaunch`) to give
// it this file's transitioning delegate before UIKit asks for one, named by the icon the finger
// went down on (LaunchIconHatch.swift); the presented view is the card, moved by its transform
// and clipped by its layer. The route's `demo-card` joins the session once it is made.
#if os(iOS)
import ObjectiveC
import UIKit
import UIKit.UIGestureRecognizerSubclass

// MARK: - RN's numbers

private enum K {
    /// demo-screen.tsx
    static let dragShrinkTravel: CGFloat = 0.5
    static let dragMinScale: CGFloat = 0.5
    static let dragFollowY: CGFloat = 0.5
    static let dragFollowX: CGFloat = 0.35
    static let failSideways: CGFloat = 30
    static let activeOffsetY: CGFloat = 10
    static let throwProjection: CGFloat = 0.12
    static let dragHomeSpring = SpringConfig(stiffness: 300, damping: 26, mass: 1)
    static let closeDuration: Double = 450
    static let contentFade: Double = 200
    static let firstPaintFrames = 4
    static let mountAtProgress: Double = 0.85
    /// launch-transition.tsx
    static let closeScale: CGFloat = 0.75
    static let heightEase: CGFloat = 1.6
    static let launchSpring = SpringConfig(stiffness: 380, damping: 36, mass: 1)
    static let closeFade = (from: 0.05, to: 0.4)
    /// The library removes the demo's route at this expansion (launch-transition.tsx CLOSE_FADE).
    static let routeGoesAt: Double = 0.2
    /// springboard.tsx HOME_MAX_BLUR
    static let homeMaxBlur: Double = 90
    /// use-grid-layout.ts ICON_RADIUS_RATIO
    static let iconRadiusRatio: CGFloat = 0.2237
}

/// screen-radius.ts: max(ScreenCornerRadius, MIN_RADIUS 25).
let screenCornerRadius: CGFloat = {
    let device = (UIScreen.main.value(forKey: "_displayCornerRadius") as? CGFloat) ?? 0
    return max(device, 25)
}()

// MARK: - Reanimated's withSpring and withTiming (packages/reanimated/src/spring.rs, timing.rs)

struct SpringConfig { var stiffness: Double, damping: Double, mass: Double }

private struct Spring {
    var config = K.dragHomeSpring
    var from = 0.0, to = 0.0, v0 = 0.0, t = 0.0, energy0 = 0.0
    var last: Double?
    var value = 0.0, velocity = 0.0
    var running = false, clamp = false

    init(_ value: Double) { self.value = value; from = value; to = value }

    mutating func set(_ v: Double) { self = Spring(v) }

    mutating func to(_ target: Double, config: SpringConfig, clamped: Bool = false) {
        let v = velocity
        let velocity = (target > value && v < 0) || (target < value && v > 0) ? 0 : v
        let x0 = value - target
        self.config = config
        from = value; to = target; v0 = velocity; t = 0; last = nil; clamp = clamped
        energy0 = 0.5 * config.stiffness * x0 * x0 + 0.5 * config.mass * velocity * velocity
        running = energy0 > 0
        if !running { value = target; self.velocity = 0 }
    }

    mutating func step(_ nowMs: Double) {
        guard running else { return }
        let dt = last.map { min(max(nowMs - $0, 0), 64) / 1000 } ?? 0
        last = nowMs
        t += dt
        let k = config.stiffness, c = config.damping, m = config.mass
        let zeta = c / (2 * (k * m).squareRoot()), omega0 = (k / m).squareRoot()
        let x0 = to - from, v0 = -self.v0
        let x: Double, v: Double
        if zeta < 1 {
            let omega1 = omega0 * (1 - zeta * zeta).squareRoot()
            let envelope = exp(-zeta * omega0 * t)
            x = envelope * (((v0 + zeta * omega0 * x0) / omega1) * sin(omega1 * t) + x0 * cos(omega1 * t))
            v = zeta * omega0 * x - envelope * (cos(omega1 * t) * (v0 + zeta * omega0 * x0) - omega1 * x0 * sin(omega1 * t))
        } else {
            let envelope = exp(-omega0 * t)
            x = envelope * (x0 + (v0 + omega0 * x0) * t)
            v = envelope * (v0 * (t * omega0 - 1) + t * x0 * omega0 * omega0)
        }
        value = to - x
        velocity = v
        if clamp && (value < min(from, to) || value > max(from, to)) {
            value = to; velocity = 0; running = false; return
        }
        let energy = 0.5 * k * x * x + 0.5 * m * v * v
        if energy0 <= 0 || energy / energy0 < 6e-9 { value = to; velocity = 0; running = false }
    }
}

/// withTiming(to, { duration, easing }) from `from`: its clock starts at its first frame.
private struct Timing {
    let from: Double, to: Double, duration: Double, easing: (Double) -> Double
    var start: Double?
    var running = true
    mutating func step(_ nowMs: Double) -> Double {
        if start == nil { start = nowMs }
        let x = min(1, (nowMs - start!) / duration)
        if x >= 1 { running = false }
        return from + (to - from) * easing(x)
    }
}

private func outCubic(_ x: Double) -> Double { 1 - pow(1 - x, 3) }
private func outQuad(_ x: Double) -> Double { 1 - (1 - x) * (1 - x) }
private func clamp01(_ x: Double) -> Double { max(0, min(1, x)) }

// MARK: - launch-transition.tsx's geometry

private struct CardPose { var cx: CGFloat, cy: CGFloat, width: CGFloat, height: CGFloat, radius: CGFloat }

/// frameAt + launchCardAt.
private func launchCardAt(frame: CGRect, radius: CGFloat, screen: CGSize, expansion: Double,
                          poseX: CGFloat, poseY: CGFloat, poseScale: CGFloat) -> CardPose {
    let t = CGFloat(clamp01(expansion))
    let x = frame.minX * (1 - t), y = frame.minY * (1 - t)
    let width = frame.width + (screen.width - frame.width) * t
    let height = max(frame.height + (screen.height - frame.height) * pow(t, K.heightEase), width)
    let r = radius + (screenCornerRadius - radius) * t
    let pose = 1 + (poseScale - 1) * t
    return CardPose(cx: x + width / 2 + poseX * t, cy: y + height / 2 + poseY * t,
                    width: width * pose, height: height * pose, radius: r * pose)
}

private func closeFadeAt(_ expansion: Double) -> Double {
    let t = 1 - cbrt(clamp01(expansion))
    let x = clamp01((t - K.closeFade.from) / (K.closeFade.to - K.closeFade.from))
    return 1 - x * x * (3 - 2 * x)
}

private func iconOpacityAt(_ progress: Double, closing: Bool) -> Double {
    closing ? 1 - closeFadeAt(progress) : 1 - clamp01(progress / 0.3)
}

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

// MARK: - The home's blur (expo-blur's BlurEffectView, tint dark)

private final class HomeBlur: UIVisualEffectView {
    private var animator: UIViewPropertyAnimator?
    init() {
        super.init(effect: nil)
        isUserInteractionEnabled = false
        autoresizingMask = [.flexibleWidth, .flexibleHeight]
    }
    required init?(coder: NSCoder) { nil }
    deinit { animator?.stopAnimation(true) }
    /// expo-blur's intensity, 0–100: the paused animator's fraction. At 0 RN shows no effect.
    var intensity: Double = 0 { didSet { if intensity != oldValue { applyFraction() } } }

    /// The animator is made once the view is in a window (expo-blur makes it in `draw`): made
    /// before, its fraction never applies and the effect shows whole.
    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil, animator == nil else { return }
        effect = nil
        let a = UIViewPropertyAnimator(duration: 1, curve: .linear) { [unowned self] in
            self.effect = UIBlurEffect(style: .dark)
        }
        a.pausesOnCompletion = true
        animator = a
        applyFraction()
    }

    private func applyFraction() {
        animator?.fractionComplete = CGFloat(min(1, max(0, intensity / 100)))
    }
}

// MARK: - The close drag (CloseGesture: RNGH's Pan, as RNPanHandler.m runs custom criteria)

private final class ClosePan: UIPanGestureRecognizer {
    private var start: CGPoint?
    override init(target: Any?, action: Selector?) {
        super.init(target: target, action: action)
        maximumNumberOfTouches = Int.max
    }
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        // Held from beginning on its own until the criteria are met (RNPanHandler: 20).
        super.minimumNumberOfTouches = 20
        super.touchesBegan(touches, with: event)
        if start == nil, let t = touches.first { start = t.location(in: nil) }
    }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesMoved(touches, with: event)
        guard state == .possible else { return }
        let trans = translation(in: nil)
        // shouldFailUnderCustomCriteria: failOffsetX [-30, 30].
        if trans.x < -K.failSideways || trans.x > K.failSideways { state = .failed; return }
        // shouldActivateUnderCustomCriteria: activeOffsetY(10) is activeOffsetYEnd 10.
        if trans.y > K.activeOffsetY {
            super.minimumNumberOfTouches = 1
            if numberOfTouches >= 1 {
                state = .began
                setTranslation(.zero, in: nil)
            }
        }
    }
    override func reset() {
        super.reset()
        start = nil
    }
}

/// RN's grab strip over the status bar: above the demo, so a drag there is always the close's
/// and a touch there never reaches the demo.
private final class GrabZone: UIView {}

// MARK: - One demo's launch session

final class LaunchSession: NSObject, UIViewControllerTransitioningDelegate {
    /// The demo on screen (not closing): its card and buttons read it.
    static weak var current: LaunchSession?
    /// Sessions alive: a close still landing while the next opens.
    private static var live: [LaunchSession] = []
    static let shownChanged = Notification.Name("DemosLaunchShownChanged")

    /// The tapped icon's demo (nil: a deep link, which simply appears).
    let slug: String?
    private weak var controller: UIViewController?
    private weak var card: DemoCardView?
    private var owns: Bool { card?.ownsDrags ?? false }

    // The launch's state (launch-transition.tsx).
    private var grouped = false
    private var frame = CGRect.zero
    private var iconRadius: CGFloat = 0
    private var progress = Spring(0)
    private var flight: Timing?
    private var poseX = Spring(0), poseY = Spring(0), poseScale = Spring(1)
    private(set) var closing = false
    private var routeGone = false
    private var dragging = false
    fileprivate var stripTouch = false

    // What it adds.
    private weak var icon: UIView?
    private var overlay: UIView?
    private var blur: HomeBlur?
    private var grab: GrabZone?
    private var pan: ClosePan?
    private var mask: CALayer?
    private var link: CADisplayLink?
    private var screen = CGSize.zero
    private var presenting: UIViewControllerContextTransitioning?
    private var dismissing: UIViewControllerContextTransitioning?

    // The content reveal (onContentLayout).
    private var revealCountdown: Int?
    private var fade: Timing?
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
        if session.shown && session.fade == nil { card.alpha = 0 }
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
        func transitionDuration(using ctx: UIViewControllerContextTransitioning?) -> TimeInterval { presenting ? 0.6 : 0.45 }
        func animateTransition(using ctx: UIViewControllerContextTransitioning) {
            if presenting { session.open(ctx) } else { session.dismiss(ctx) }
        }
    }

    // MARK: open

    private func open(_ ctx: UIViewControllerContextTransitioning) {
        guard let controller, let view = controller.view else { return ctx.completeTransition(true) }
        let container = ctx.containerView
        view.frame = ctx.finalFrame(for: controller)
        container.addSubview(view)
        screen = container.bounds.size
        // The icon it opens out of: a deep link has none, and the demo simply appears.
        if let slug, let icon = LaunchIcons.shared.view(slug), let host = container.superview {
            self.icon = icon
            frame = icon.convert(icon.bounds, to: nil)
            iconRadius = frame.width * K.iconRadiusRatio
            grouped = true
            let blur = HomeBlur()
            blur.frame = host.bounds
            host.insertSubview(blur, belowSubview: container)
            self.blur = blur
            // The artwork, lifted out of the home (the library's overlay, above the card).
            if let art = icon.snapshotView(afterScreenUpdates: false) {
                art.frame = frame
                art.isUserInteractionEnabled = false
                host.insertSubview(art, aboveSubview: container)
                overlay = art
            }
            icon.isHidden = true
            progress.set(0)
            progress.to(1, config: K.launchSpring, clamped: true)
            presenting = ctx
        } else {
            grouped = false
            progress.set(1)
        }
        if !grouped { revealCountdown = K.firstPaintFrames + 1 }
        apply()
        startLink()
        if presenting == nil { ctx.completeTransition(true); opened() }
    }

    private func opened() {
        guard let view = controller?.view else { return }
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

    // MARK: close

    /// closeFromButton.
    func closeFromButton() {
        if grouped && progress.value < 0.999 { return }
        if closing { return }
        commit(haptic: true)
    }

    /// closeHandlers.commit: released at once; the card flies home from the pose it is in.
    private func commit(haptic: Bool) {
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
        flight = Timing(from: progress.value, to: 0, duration: K.closeDuration, easing: outCubic)
        progress.running = false
        startLink()
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
        else if !closing { commit(haptic: false) }
    }

    private func finishDismissal() {
        guard let ctx = dismissing else { return }
        dismissing = nil
        ctx.view(forKey: .from)?.removeFromSuperview()
        ctx.completeTransition(true)
        if !grouped { land() }
        if flight == nil { LaunchSession.live.removeAll { $0 === self } }
    }

    /// landClose: the artwork is back in the home, the blur gone.
    private func land() {
        if let pan { pan.view?.removeGestureRecognizer(pan) }
        overlay?.removeFromSuperview()
        overlay = nil
        blur?.removeFromSuperview()
        blur = nil
        icon?.isHidden = false
        link?.invalidate()
        link = nil
        // The landed frame commits first; the route's unmount runs on the next turn, on a still screen.
        if grouped, !routeGone { DispatchQueue.main.async { [self] in leave() } }
        if routeGone { LaunchSession.live.removeAll { $0 === self } }
    }

    // MARK: drag

    private func scaleForDrag(_ distance: CGFloat) -> CGFloat {
        let travel = screen.height * K.dragShrinkTravel
        return 1 + (K.dragMinScale - 1) * min(1, max(0, distance / travel))
    }

    @objc private func dragged(_ pan: UIPanGestureRecognizer) {
        switch pan.state {
        case .began:
            // onStart: not while a launch is flying.
            dragging = !closing && (!grouped || progress.value >= 0.999)
        case .changed:
            guard dragging else { return }
            let t = pan.translation(in: nil)
            let distance = max(0, t.y)
            let scale = scaleForDrag(distance)
            poseX.set(Double(t.x * K.dragFollowX))
            poseY.set(Double(distance * K.dragFollowY))
            poseScale.set(Double(scale))
            apply()
            if scale <= K.closeScale {
                dragging = false
                commit(haptic: true)
            }
        case .ended, .cancelled, .failed:
            if pan.state == .ended, dragging {
                let t = pan.translation(in: nil), v = pan.velocity(in: nil)
                let thrown = max(0, t.y) + max(0, v.y) * K.throwProjection
                if scaleForDrag(thrown) <= K.closeScale {
                    dragging = false
                    commit(haptic: true)
                }
            }
            // onFinalize: let go short of it, back to full screen.
            guard dragging else { return }
            dragging = false
            poseX.to(0, config: K.dragHomeSpring)
            poseY.to(0, config: K.dragHomeSpring)
            poseScale.to(1, config: K.dragHomeSpring)
            startLink()
        default: break
        }
    }

    // MARK: frames

    private func startLink() {
        guard link == nil else { return }
        let link = CADisplayLink(target: LinkTarget(self), selector: #selector(LinkTarget.tick(_:)))
        // A spatial transition asks for the panel's full rate: at `.default` a ProMotion
        // iPhone paces this link at 60 Hz, so the card's flight presents at half rate.
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
            s.tick(link.targetTimestamp * 1000)
        }
    }

    private func tick(_ now: Double) {
        progress.step(now)
        if var f = flight {
            progress.value = f.step(now)
            flight = f.running ? f : nil
        }
        poseX.step(now); poseY.step(now); poseScale.step(now)
        // The demo mounts at MOUNT_AT_PROGRESS of the open; it shows once it has painted.
        if grouped, !closing, !shown, revealCountdown == nil, progress.value >= K.mountAtProgress {
            revealCountdown = K.firstPaintFrames + 1
        }
        if let n = revealCountdown {
            if n <= 0 {
                revealCountdown = nil
                fade = Timing(from: 1, to: 0, duration: K.contentFade, easing: outQuad)
                shown = true
                NotificationCenter.default.post(name: LaunchSession.shownChanged, object: self)
            } else { revealCountdown = n - 1 }
        }
        if var f = fade {
            card?.alpha = CGFloat(f.step(now))
            fade = f.running ? f : nil
        }
        apply()
        if let ctx = presenting, !progress.running {
            presenting = nil
            ctx.completeTransition(!ctx.transitionWasCancelled)
            opened()
        }
        // RN removes the route here; its unmount (the demo's tree, its GPU surfaces) on the main
        // thread mid-flight was the close's hitch. The card is transparent from here on
        // (closeFadeAt(0.2) is 0), so it is hidden now and the route goes once the flight lands.
        if closing, grouped, progress.value <= K.routeGoesAt, controller?.view.isHidden == false {
            controller?.view.isHidden = true
        }
        if closing, grouped, flight == nil { land(); return }
        let moving = progress.running || flight != nil || poseX.running || poseY.running || poseScale.running
            || revealCountdown != nil || fade != nil || presenting != nil
        if !moving { link?.invalidate(); link = nil }
    }

    /// The card, the artwork and the blur, from the one pose (launchCardAt).
    private func apply() {
        guard let view = controller?.view, screen.width > 0 else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        let e = grouped ? progress.value : 1
        let full = CGRect(origin: .zero, size: screen)
        let card = launchCardAt(frame: grouped ? frame : full, radius: grouped ? iconRadius : 0, screen: screen,
                                expansion: e, poseX: CGFloat(poseX.value), poseY: CGFloat(poseY.value),
                                poseScale: CGFloat(poseScale.value))
        // The demo, uniformly scaled to the card's width and cropped top and bottom by it.
        let s = card.width / screen.width
        view.transform = CGAffineTransform(a: s, b: 0, c: 0, d: s, tx: card.cx - screen.width / 2,
                                           ty: card.cy - screen.height / 2)
        let visible = card.height / s
        let radius = card.radius / s
        let layer = view.layer
        layer.cornerCurve = .continuous
        layer.masksToBounds = true
        if visible < screen.height - 0.01 {
            let m = mask ?? CALayer()
            m.backgroundColor = UIColor.black.cgColor
            m.cornerCurve = .continuous
            m.frame = CGRect(x: 0, y: (screen.height - visible) / 2, width: screen.width, height: visible)
            m.cornerRadius = radius
            mask = m
            if layer.mask !== m { layer.mask = m }
            layer.cornerRadius = 0
        } else {
            if layer.mask != nil { layer.mask = nil }
            layer.cornerRadius = radius
        }
        view.alpha = grouped && closing ? CGFloat(closeFadeAt(e)) : 1
        if let overlay {
            let c0 = CGPoint(x: frame.midX, y: frame.midY)
            let k = card.width / frame.width
            overlay.transform = CGAffineTransform(a: k, b: 0, c: 0, d: k, tx: card.cx - c0.x, ty: card.cy - c0.y)
            overlay.alpha = CGFloat(iconOpacityAt(e, closing: closing))
        }
        if let blur {
            // springboard.tsx blurProps: the blur clears as the card is dragged smaller.
            let factor = 1 + (0.5 - 1) * clamp01((1 - poseScale.value) / (1 - Double(K.closeScale)))
            blur.intensity = clamp01(e * factor) * K.homeMaxBlur
        }
    }
}

extension LaunchSession: UIGestureRecognizerDelegate {
    /// A demo whose drags own the screen keeps every touch below the strip.
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        let inStrip = touch.view is GrabZone || touch.location(in: nil).y < (grab?.bounds.height ?? 0)
        stripTouch = inStrip
        return !owns || inStrip
    }

    /// A touch in the strip never reaches the demo in RN (the strip sits above it): what the
    /// demo's own recognizers would make of it waits for the close to fail.
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
        stripTouch
    }
}

// MARK: - The card in the route (`demo-card`)

/// The demo's cover until it has painted (RN's card shows its backdrop until the demo fades in
/// over it), and the route's hold on the launch: `press` is the route's leave.
final class DemoCardView: UIView {
    var slug = ""
    var ownsDrags = false
    var onLeave: (() -> Void)?
    func leave() { onLeave?() }
    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { LaunchSession.attach(self) }
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

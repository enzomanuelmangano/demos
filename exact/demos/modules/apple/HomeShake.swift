// `home-shake`: a shake on the home filters out the resolved (approved) demos; a second one shows all again.
//
// Feedback.swift's shake swizzle opens the feedback sheet inside a demo; with no demo on screen it calls
// `HomeShake.shaken()`, which posts `HomeShake.notification`. This view (a 0x0 node in the Springboard) hears it,
// rewinds the pager to page 0 and emits `change("toggle")`; the Contract owns the persisted `hideResolved`. When the
// new `hiding`/`count` props arrive it plays the haptic and a small pill at the top ("Hiding resolved · 12 left",
// "Showing all 108"). A prop change that no shake asked for (the first props, a relaunch) shows nothing.
//
// Props: `scroller` the pager's `data-scroller` name, `hiding` ("true" while the approved are hidden),
//        `count` the demos now shown. Events: `change("toggle")`.
#if os(iOS)
import UIKit

enum HomeShake {
    static let notification = Notification.Name("HomeShake")

    /// A shake that opened no sheet: it is the home's when no demo is open or opening and nothing is presented.
    static func shaken() {
        guard LaunchSession.current == nil else { return }
        let window = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.windows.first { $0.isKeyWindow } }.first
        guard window?.rootViewController?.presentedViewController == nil else { return }
        NotificationCenter.default.post(name: notification, object: nil)
    }
}

final class HomeShakeInstance: ExactNativeInstance {
    private let anchor = UIView()
    private var scroller = ""
    private var hiding: Bool?
    private var pending = false
    private var observer: NSObjectProtocol?

    init(props: [String: String], events: ExactNativeEvents) {
        super.init(events: events)
        PhoneFeedback.installShake()
        anchor.isUserInteractionEnabled = false
        anchor.isAccessibilityElement = false
        observer = NotificationCenter.default.addObserver(forName: HomeShake.notification, object: nil, queue: .main) { [weak self] _ in self?.shaken() }
        try? setProps(props)
    }

    override var view: ExactNativeView { anchor }

    override func setProps(_ props: [String: String]) throws {
        scroller = props["scroller"] ?? ""
        let now = props["hiding"] == "true"
        let count = Int(props["count"] ?? "") ?? 0
        let before = hiding
        hiding = now
        guard pending, let before, before != now else { return }
        pending = false
        if now { UINotificationFeedbackGenerator().notificationOccurred(.success) } else { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
        FilterPill.show(now ? "Hiding resolved · \(count) left" : "Showing all \(count)", in: anchor.window)
    }

    private func shaken() {
        // The home stays mounted under a demo: only a home that is on screen answers.
        guard anchor.window != nil, !pending else { return }
        pending = true
        // The grid is about to be re-paged: start from its first page.
        if let scroll = PageScrollers.shared.scrollView(scroller) { scroll.setContentOffset(CGPoint(x: 0, y: scroll.contentOffset.y), animated: false) }
        events.change("toggle")
        // No prop change followed (nothing to flip): do not leave the next change to look asked-for.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in self?.pending = false }
    }

    override func destroy() {
        if let observer { NotificationCenter.default.removeObserver(observer) }
        observer = nil
    }

    deinit { if let observer { NotificationCenter.default.removeObserver(observer) } }
}

/// A blurred capsule at the top centre that fades in, holds and fades out (~1.6 s); built on the first shake only.
private enum FilterPill {
    private static var pill: UIVisualEffectView?
    private static var label: UILabel?
    private static var token = 0

    static func show(_ text: String, in window: UIWindow?) {
        guard let window else { return }
        let pill = self.pill ?? make()
        label?.text = text
        if pill.superview !== window { window.addSubview(pill) }
        let size = label?.sizeThatFits(CGSize(width: window.bounds.width - 80, height: 40)) ?? .zero
        let w = size.width + 32, h: CGFloat = 36
        pill.frame = CGRect(x: (window.bounds.width - w) / 2, y: window.safeAreaInsets.top + 8, width: w, height: h)
        label?.frame = CGRect(x: 0, y: 0, width: w, height: h)
        token += 1
        let mine = token
        pill.layer.removeAllAnimations()
        pill.alpha = 0
        UIView.animate(withDuration: 0.2, delay: 0, options: [.curveEaseOut, .beginFromCurrentState]) { pill.alpha = 1 }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            guard mine == token else { return }
            UIView.animate(withDuration: 0.4, delay: 0, options: [.curveEaseIn, .beginFromCurrentState]) { pill.alpha = 0 } completion: { _ in
                if mine == token { pill.removeFromSuperview() }
            }
        }
    }

    private static func make() -> UIVisualEffectView {
        let view = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterialDark))
        view.clipsToBounds = true
        view.layer.cornerRadius = 18
        view.layer.cornerCurve = .continuous
        view.isUserInteractionEnabled = false
        let text = UILabel()
        text.font = .systemFont(ofSize: 14, weight: .semibold)
        text.textColor = .white
        text.textAlignment = .center
        view.contentView.addSubview(text)
        pill = view
        label = text
        return view
    }
}
#endif

// `system-alert`: a real UIAlertController (alert or action sheet), actions in the order given,
// presented from the top-most view controller (a full-screen demo route cannot present a `dialog`).
//
// The view is an empty box (give it width=0 height=0). Props (the `alert-` prefix: names like
// `title` and `message` are refused on a native tag):
//   `open`                "true" presents the alert when it turns "true"; anything else dismisses it
//   `alert-title`, `alert-message`  the title and the message ("" for none)
//   `alert-buttons`       up to three labels, separated by "|"; none: a single "OK"
//   `alert-button-styles` each button's style, by position, "|" between: "default", "cancel" or
//                         "destructive" (missing: "default")
//   `alert-presentation`  "action-sheet" for an action sheet; anything else is an alert
//   `alert-appearance`    "dark" or "light" forces the appearance; anything else follows the presenter
// Event: `change(index)`, the tapped button's index in `alert-buttons`, once the alert has gone.
// UIKit closes the alert itself; the Contract sets `open` false in its handler. A tap outside does nothing.
// Each instance sends `message("system-alert:1")` once, so a Contract can detect this view's presence.
#if os(iOS)
import UIKit

final class SystemAlert: ExactNativeInstance {
    private let box = UIView()
    private var props: [String: String] = [:]
    /// The alert is presented on the rise of `open` to "true" only, not on every re-render.
    private var lastOpen = false
    private var alert: UIAlertController?

    init(props: [String: String], events: ExactNativeEvents) {
        box.isUserInteractionEnabled = false
        box.backgroundColor = .clear
        super.init(events: events)
        try? setProps(props)
        DispatchQueue.main.async { events.message("system-alert:1") }
    }

    override var view: ExactNativeView { box }

    override func setProps(_ props: [String: String]) throws {
        self.props = props
        let open = props["open"] == "true"
        guard open != lastOpen else { return }
        lastOpen = open
        DispatchQueue.main.async { [weak self] in open ? self?.present(attempt: 0) : self?.dismiss() }
    }

    override func destroy() {
        lastOpen = false
        dismiss()
    }

    private static func topController(from window: UIWindow?) -> UIViewController? {
        var top = (window ?? UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }.first)?.rootViewController
        while let next = top?.presentedViewController, !next.isBeingDismissed { top = next }
        return top
    }

    private static func list(_ text: String?) -> [String] {
        guard let text, !text.isEmpty else { return [] }
        return text.components(separatedBy: "|")
    }

    private static func style(_ name: String) -> UIAlertAction.Style {
        switch name.trimmingCharacters(in: .whitespaces) {
        case "cancel": return .cancel
        case "destructive": return .destructive
        default: return .default
        }
    }

    private func present(attempt: Int) {
        guard lastOpen, alert == nil else { return }
        // UIKit refuses a presentation from a controller that is mid-transition: retry shortly.
        guard let top = Self.topController(from: box.window),
              top.transitionCoordinator == nil, !top.isBeingPresented else {
            if attempt < 20 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                    self?.present(attempt: attempt + 1)
                }
            }
            return
        }
        let sheet = props["alert-presentation"] == "action-sheet"
        let title = props["alert-title"].flatMap { $0.isEmpty ? nil : $0 }
        let message = props["alert-message"].flatMap { $0.isEmpty ? nil : $0 }
        let controller = UIAlertController(title: title, message: message,
                                           preferredStyle: sheet ? .actionSheet : .alert)
        switch props["alert-appearance"] {
        case "dark": controller.overrideUserInterfaceStyle = .dark
        case "light": controller.overrideUserInterfaceStyle = .light
        default: break
        }
        var labels = Array(Self.list(props["alert-buttons"]).prefix(3))
        if labels.isEmpty { labels = ["OK"] }
        let styles = Self.list(props["alert-button-styles"])
        var hasCancel = false
        for (index, label) in labels.enumerated() {
            var style = index < styles.count ? Self.style(styles[index]) : .default
            // UIKit throws on a second cancel action.
            if style == .cancel { if hasCancel { style = .default } else { hasCancel = true } }
            controller.addAction(UIAlertAction(title: label, style: style) { [weak self] _ in
                self?.chose(index, from: controller)
            })
        }
        if let popover = controller.popoverPresentationController {
            popover.sourceView = box.window ?? top.view
            let bounds = popover.sourceView?.bounds ?? .zero
            popover.sourceRect = CGRect(x: bounds.midX, y: bounds.maxY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        alert = controller
        top.present(controller, animated: true)
    }

    private func chose(_ index: Int, from controller: UIAlertController) {
        guard alert === controller else { return }
        alert = nil
        events.change(String(index))
    }

    private func dismiss() {
        guard let controller = alert else { return }
        alert = nil
        if controller.presentingViewController != nil { controller.dismiss(animated: true) }
    }
}
#endif

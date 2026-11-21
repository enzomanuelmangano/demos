// `inspiration-sheet`: the demo screen's Inspiration sheet, a real UIKit sheet
// (UISheetPresentationController) with a detent fitted to its content, a grabber, the system
// background in the dark appearance and drag to dismiss. Content: a bold title, the story, and a
// full-width capsule action (glassProminent from iOS 26, borderedProminent earlier).
//
// The view itself is an empty box; the sheet is presented from the top-most view controller,
// because the full-screen demo route cannot present a dialog itself. Props: `open` ("true"
// presents, anything else dismisses), `caption` (the title), `story`, `action-label` (the Contract
// refuses `label` on a native tag). Events: `press` when the action is tapped (the route opens
// the URL and closes the sheet), `change("dismissed")` when the person drags it away.
#if os(iOS)
import SwiftUI
import UIKit

final class InspirationModel: ObservableObject {
    @Published var title = "Inspiration"
    @Published var story = ""
    @Published var label = ""
}

struct InspirationBody: View {
    @ObservedObject var model: InspirationModel
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(model.title).font(.title2.bold())
            Text(model.story).font(.body).fixedSize(horizontal: false, vertical: true)
            styled(SwiftUI.Button(action: action) {
                Text(model.label).font(.headline).frame(maxWidth: .infinity)
            })
            .buttonBorderShape(.capsule)
            .controlSize(.large)
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24)
        .padding(.top, 28)
        .padding(.bottom, 24)
    }

    /// Glass from iOS 26, bordered prominent on earlier versions.
    @ViewBuilder
    private func styled<V: View>(_ button: V) -> some View {
        if #available(iOS 26.0, *) {
            button.buttonStyle(.glassProminent)
        } else {
            button.buttonStyle(.borderedProminent)
        }
    }
}

/// The sheet's dismissal, reported (an NSObject, as UIKit's delegates are).
private final class SheetDismissal: NSObject, UISheetPresentationControllerDelegate {
    var dismissed: () -> Void = {}
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { dismissed() }
}

final class InspirationSheet: ExactNativeInstance {
    private let model = InspirationModel()
    private let dismissal = SheetDismissal()
    private let box = UIView()
    private var sheet: UIHostingController<InspirationBody>?
    private var wantsOpen = false

    init(props: [String: String], events: ExactNativeEvents) {
        box.isUserInteractionEnabled = false
        box.backgroundColor = .clear
        super.init(events: events)
        dismissal.dismissed = { [weak self] in self?.dismissedByPerson() }
        try? setProps(props)
    }

    override var view: ExactNativeView { box }

    override func setProps(_ props: [String: String]) throws {
        model.title = props["caption"].flatMap { $0.isEmpty ? nil : $0 } ?? "Inspiration"
        model.story = props["story"] ?? ""
        model.label = props["action-label"] ?? props["label"] ?? ""
        let open = props["open"] == "true"
        if open != wantsOpen {
            wantsOpen = open
            DispatchQueue.main.async { [weak self] in open ? self?.present() : self?.dismiss() }
        }
    }

    override func destroy() {
        wantsOpen = false
        dismiss()
    }

    private static func topController(from window: UIWindow?) -> UIViewController? {
        var top = (window ?? UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }.first)?.rootViewController
        while let next = top?.presentedViewController, !next.isBeingDismissed { top = next }
        return top
    }

    private func present() {
        guard wantsOpen, sheet == nil, let top = Self.topController(from: box.window) else { return }
        let events = self.events
        let host = UIHostingController(rootView: InspirationBody(model: model, action: { events.press() }))
        host.overrideUserInterfaceStyle = .dark
        // iOS 26's sheet floats inset from the display's corners. With no bottom safe area the
        // action sits one inset (24) above the sheet's edge, so its capsule is concentric with the
        // sheet's corners and the display's.
        host.safeAreaRegions = []
        host.view.backgroundColor = .clear
        host.modalPresentationStyle = .pageSheet
        if let controller = host.sheetPresentationController {
            // fitToContents: the content's own height at the screen's width.
            let width = top.view.window?.bounds.width ?? top.view.bounds.width
            let fitted = host.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude)).height
            controller.detents = [.custom(identifier: .init("fitted")) { context in
                min(fitted, context.maximumDetentValue)
            }]
            controller.prefersGrabberVisible = true
            controller.delegate = dismissal
        }
        sheet = host
        top.present(host, animated: true)
    }

    private func dismiss() {
        guard let host = sheet else { return }
        sheet = nil
        if host.presentingViewController != nil { host.dismiss(animated: true) }
    }

    private func dismissedByPerson() {
        sheet = nil
        wantsOpen = false
        events.change("dismissed")
    }
}
#endif

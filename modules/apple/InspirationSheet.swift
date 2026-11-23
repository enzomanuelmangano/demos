// `inspiration-sheet`: the demo screen's Inspiration sheet, a real UIKit sheet
// (UISheetPresentationController) with a detent fitted to its content, a grabber, the system's
// own sheet material in the app's appearance and drag to dismiss. Content: a bold title, the
// story, and a full-width capsule action (glassProminent from iOS 26, borderedProminent earlier).
//
// The view itself is an empty box; the sheet is presented from the top-most view controller,
// because the full-screen demo route cannot present a dialog itself. Props: `open` ("true"
// presents, anything else dismisses), `caption` (the title), `story`, `icon` (the demo's app icon file), `action-url` (picks the action's symbol), `action-label` (the Contract
// refuses `label` on a native tag). Events: `press` when the action is tapped (the route opens
// the URL and closes the sheet), `change("dismissed")` when the person drags it away.
#if os(iOS)
import SwiftUI
import UIKit

final class InspirationModel: ObservableObject {
    @Published var title = "Inspiration"
    @Published var story = ""
    @Published var label = ""
    @Published var icon: UIImage?
    @Published var symbol = "arrow.up.right"
    /// The window's bottom safe area (34 with a home indicator), which the sheet keeps under its content.
    @Published var bottom: CGFloat = 0
}

/// The action's leading symbol, from where the link goes.
private func actionSymbol(_ url: String) -> String {
    let host = URL(string: url)?.host?.lowercased() ?? ""
    if host.hasSuffix("apple.com") { return "arrow.down.app" }
    if ["youtube.com", "youtu.be", "vimeo.com", "tiktok.com"].contains(where: { host == $0 || host.hasSuffix("." + $0) }) {
        return "play.rectangle"
    }
    return "arrow.up.right"
}

struct InspirationBody: View {
    @ObservedObject var model: InspirationModel
    let action: () -> Void

    /// One inset on every side of the content. The sheet is as tall as the content plus the bottom
    /// safe area; the content moves down into that area by what it exceeds the inset, and the top
    /// padding gives back as much, so the title keeps its place under the grabber (as the RN sheet).
    private let inset: CGFloat = 24

    var body: some View {
        let shift = min(max(0, model.bottom - inset), inset + 4)
        // Top-aligned: a taller sheet must not centre the content and push it off the inset.
        VStack(spacing: 0) {
            content
                .padding(.horizontal, inset)
                .padding(.top, inset + 4 - shift)
                .padding(.bottom, max(0, inset - model.bottom))
                .offset(y: shift)
            Spacer(minLength: 0)
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 14) {
                if let icon = model.icon {
                    Image(uiImage: icon).resizable().frame(width: 56, height: 56)
                        .clipShape(RoundedRectangle(cornerRadius: 12.5, style: .continuous))
                }
                Text(model.title).font(.title2.bold())
            }
            Text(model.story).font(.body).fixedSize(horizontal: false, vertical: true)
            styled(SwiftUI.Button(action: action) {
                HStack(spacing: 8) {
                    Image(systemName: model.symbol)
                    Text(model.label)
                }
                .font(.headline).frame(maxWidth: .infinity)
            })
            .buttonBorderShape(.capsule)
            .controlSize(.large)
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
    private var iconFile = ""

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
        model.symbol = actionSymbol(props["action-url"] ?? "")
        if let file = props["icon"], !file.isEmpty, file != iconFile {
            iconFile = file
            model.icon = StillArt.image(file)
        }
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
        model.bottom = top.view.window?.safeAreaInsets.bottom ?? 0
        let host = UIHostingController(rootView: InspirationBody(model: model, action: { events.press() }))
        // iOS 26's sheet floats inset from the display's corners. With no bottom safe area the
        // action sits one inset (24) above the sheet's edge, so its capsule is concentric with the
        // sheet's corners and the display's.
        host.safeAreaRegions = []
        // The system's sheet material, not a fill of ours. No forced appearance: a dark one put white
        // labels on the glass that a light demo turns light; in the app's own appearance the glass and
        // its label colours (.primary) are the pair a native sheet has, readable over any demo.
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

// `toggle-sheet`: a real UIKit sheet of switches (content-fitted detent, grabber, dark appearance):
// a title, then one tinted Toggle per switch. The view is an empty box; the sheet is presented from
// the top-most view controller, because a full-screen demo route cannot present one.
//
// Props (all text):
//   open          "true" presents it, anything else dismisses it
//   caption       the title
//   switches      the rows, "|" between them, each "<id>:<1|0>:<label>"
//   switch-tint   the toggles' tint, #rrggbb
// Events: `change("<id>:true|false")` when a switch flips, `change("dismissed")` when dragged away.
#if os(iOS)
import SwiftUI
import UIKit

final class ToggleSheetModel: ObservableObject {
    struct Row: Identifiable, Equatable {
        let id: String
        var label: String
        var on: Bool
    }
    @Published var title = ""
    @Published var rows: [Row] = []
    @Published var tint: Color = .accentColor

    static func parse(_ text: String) -> [Row] {
        text.split(separator: "|").compactMap { entry in
            let parts = entry.split(separator: ":", maxSplits: 2).map(String.init)
            guard parts.count == 3 else { return nil }
            return Row(id: parts[0], label: parts[2], on: parts[1] == "1" || parts[1] == "true")
        }
    }

    static func color(_ hex: String?) -> Color? {
        guard var h = hex?.trimmingCharacters(in: .whitespaces), h.hasPrefix("#") else { return nil }
        h.removeFirst()
        guard h.count == 6, let v = UInt32(h, radix: 16) else { return nil }
        return Color(.sRGB, red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255,
                     blue: Double(v & 0xFF) / 255, opacity: 1)
    }
}

struct ToggleSheetBody: View {
    @ObservedObject var model: ToggleSheetModel
    let flipped: (String, Bool) -> Void

    var body: some View {
        VStack(spacing: 20) {
            Text(model.title).font(.title3.weight(.semibold))
            ForEach(model.rows) { row in
                Toggle(row.label, isOn: Binding(
                    get: { model.rows.first { $0.id == row.id }?.on ?? false },
                    set: { on in
                        if let i = model.rows.firstIndex(where: { $0.id == row.id }) { model.rows[i].on = on }
                        UISelectionFeedbackGenerator().selectionChanged()
                        flipped(row.id, on)
                    }))
                .tint(model.tint)
            }
        }
        .padding(22)
    }
}

private final class ToggleSheetDismissal: NSObject, UISheetPresentationControllerDelegate {
    var dismissed: () -> Void = {}
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { dismissed() }
}

final class ToggleSheet: ExactNativeInstance {
    private let model = ToggleSheetModel()
    private let dismissal = ToggleSheetDismissal()
    private let box = UIView()
    private var sheet: UIHostingController<ToggleSheetBody>?
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
        model.title = props["caption"] ?? ""
        let rows = ToggleSheetModel.parse(props["switches"] ?? "")
        if rows != model.rows { model.rows = rows }
        model.tint = ToggleSheetModel.color(props["switch-tint"]) ?? .accentColor
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
        let host = UIHostingController(rootView: ToggleSheetBody(model: model, flipped: { id, on in
            events.change("\(id):\(on)")
        }))
        host.overrideUserInterfaceStyle = .dark
        host.view.backgroundColor = .clear
        host.modalPresentationStyle = .pageSheet
        if let controller = host.sheetPresentationController {
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

// `painting-menu`: art-gallery's PaintingMenu (src/animations/art-gallery/components/
// painting-menu.tsx) as @expo/ui draws it on RN's Release (EXPO_PUBLIC_LIQUID_GLASS_ENABLED): a
// `Host matchContents colorScheme="dark"` at right 16, top safeTop, holding SwiftUI's
//   Menu(label: Image(systemName: "ellipsis").font(size 17).frame(15, 15)) {
//     Toggle("Default", isOn: selected == nil)
//     Menu(movement) { Menu(painter) { Toggle(painting, isOn: id == selected) … } … } …
//   }
//   .accessibilityLabel("Choose a painting") .menuStyle(.button)
//   .buttonStyle(LIQUID_GLASS ? .glass : .bordered) .buttonBorderShape(.circle)
//   .controlSize(.large) .menuIndicator(.hidden)
// in RN's modifier order. iOS and macOS share it; on macOS 26 and later the label is the same
// liquid-glass circle and the menu AppKit's own (in the dark appearance).
//
// Props: `items`, the tree, one entry per `|`: `m <id> <name>` a movement, `p <id> <name>` a
// painter of the last movement, `t <id> <name>` a painting of the last painter; `selected`, the
// painting shown ("" for Default). A toggle sends `change` with its painting's id ("" for Default),
// and the menu closes, as SwiftUI's does.
import Foundation
import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

struct PaintingNode: Identifiable {
    let id: String
    let name: String
    var children: [PaintingNode] = []
}

final class PaintingMenuModel: ObservableObject {
    @Published var movements: [PaintingNode] = []
    @Published var selected = ""

    static func parse(_ items: String) -> [PaintingNode] {
        var out: [PaintingNode] = []
        for entry in items.split(separator: "|") {
            let parts = entry.split(separator: " ", maxSplits: 2).map(String.init)
            guard parts.count == 3 else { continue }
            let node = PaintingNode(id: parts[1], name: parts[2])
            switch parts[0] {
            case "m": out.append(node)
            case "p" where !out.isEmpty: out[out.count - 1].children.append(node)
            case "t" where !(out.last?.children.isEmpty ?? true):
                let m = out.count - 1
                out[m].children[out[m].children.count - 1].children.append(node)
            default: break
            }
        }
        return out
    }
}

struct PaintingMenuBody: View {
    @ObservedObject var model: PaintingMenuModel
    let pick: (String) -> Void

    var body: some View {
        styled(Menu {
            toggle("Default", id: "")
            ForEach(model.movements) { movement in
                Menu(movement.name) {
                    ForEach(movement.children) { painter in
                        Menu(painter.name) {
                            ForEach(painter.children) { painting in
                                toggle(painting.name, id: painting.id)
                            }
                        }
                    }
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 17))
                .frame(width: 15, height: 15)
        }
        .accessibilityLabel("Choose a painting")
        .menuStyle(.button))
        .buttonBorderShape(.circle)
        .controlSize(.large)
        .menuIndicator(.hidden)
        .environment(\.colorScheme, .dark)
        // RN's Host sits at right 16 at its content's own size; the box is whole points, so the
        // button keeps to its top-trailing corner.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
    }

    private func toggle(_ label: String, id: String) -> some View {
        Toggle(label, isOn: Binding(
            get: { model.selected == id },
            // onIsOnChange: onPaintingChange(id), whichever way it flips.
            set: { _ in
                model.selected = id
                pick(id)
            }))
    }

    /// buttonStyle(LIQUID_GLASS ? 'glass' : 'bordered').
    @ViewBuilder
    private func styled<V: View>(_ menu: V) -> some View {
        if #available(iOS 26.0, macOS 26.0, *) {
            menu.buttonStyle(.glass)
        } else {
            menu.buttonStyle(.bordered)
        }
    }
}

final class PaintingMenu: ExactNativeInstance {
    private let model = PaintingMenuModel()
    #if os(macOS)
    private let host: NSHostingView<PaintingMenuBody>
    #else
    private let host: UIHostingController<PaintingMenuBody>
    #endif

    init(props: [String: String], events: ExactNativeEvents) {
        let body = PaintingMenuBody(model: model, pick: { events.change($0) })
        #if os(macOS)
        host = NSHostingView(rootView: body)
        // Host colorScheme="dark": the label and AppKit's menu.
        host.appearance = NSAppearance(named: .darkAqua)
        #else
        host = UIHostingController(rootView: body)
        host.safeAreaRegions = []
        host.view.backgroundColor = .clear
        host.overrideUserInterfaceStyle = .dark
        #endif
        super.init(events: events)
        try? setProps(props)
    }

    #if os(macOS)
    override var view: ExactNativeView { host }
    #else
    override var view: ExactNativeView { host.view }
    #endif

    override func setProps(_ props: [String: String]) throws {
        let items = props["items"] ?? ""
        let movements = PaintingMenuModel.parse(items)
        if movements.map(\.id) != model.movements.map(\.id) { model.movements = movements }
        let selected = props["selected"] ?? ""
        if model.selected != selected { model.selected = selected }
    }
}

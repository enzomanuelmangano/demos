// `music-tabbar` / `native-tabbar`: iOS 26's native bottom chrome: a SwiftUI TabView (the
// floating glass tab bar), and for `music-tabbar` (Apple Music) `.tabViewBottomAccessory` holding
// the mini player (artwork, title, artist, play/pause, next). `native-tabbar` is the same bar
// with no accessory (telegram-theme-switch); so is a `music-tabbar` with no track-title. expandable-mini-player draws its page in Contract behind it: every
// tab's content is clear and takes no touch, and this view answers only touches on the bar and
// the accessory, so the page under the box still scrolls and taps.
//
// Before iOS 26 (no bottom accessory, no glass bar): a plain TabView bar with the mini player
// as a material capsule above it, so the demo still works.
//
// Props (all text; Contract binds `title`, `tint` and the like to the box, so the names are the
// module's own; each was tried in a scratch contract build):
//   tab-titles     the tabs' titles, "|" between them
//   tab-symbols    their SF Symbols, "|" between them, in the same order
//   selected-tab   the selected tab's index
//   tab-tint       the selected tab's tint, #rrggbb (Music: #FA2D48)
//   track-title    the mini player's title
//   track-artist   its subtitle
//   artwork-file   the artwork, relative to the app bundle (the app's assets/ tree is copied
//                  into it as `assets/`)
//   is-playing     "true" shows pause, anything else play
//   bar-appearance "dark" or "light": the bar's own appearance (an app theme, not the
//                  system's); dark by default
// Events (`change`): "tab:<index>" when the person picks a tab, "accessory" for a tap on the
// mini player, "play" for its play/pause button, "next" for its next button.
#if os(iOS)
import SwiftUI
import UIKit

final class MusicTabBarModel: ObservableObject {
    @Published var titles: [String] = []
    @Published var symbols: [String] = []
    @Published var selected = 0
    @Published var tint: Color = .accentColor
    @Published var title = ""
    @Published var artist = ""
    @Published var artwork: UIImage?
    @Published var playing = false
    @Published var accessory = true
    var artworkFile = ""

    static func color(_ hex: String?) -> Color? {
        guard var h = hex?.trimmingCharacters(in: .whitespaces), h.hasPrefix("#") else { return nil }
        h.removeFirst()
        guard h.count == 6, let v = UInt32(h, radix: 16) else { return nil }
        return Color(.sRGB, red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255,
                     blue: Double(v & 0xFF) / 255, opacity: 1)
    }

    /// A file of the app bundle (its resources, then its root), as AudioTrack finds its track.
    static func image(_ file: String) -> UIImage? {
        guard !file.isEmpty else { return nil }
        for base in [Bundle.main.resourceURL, Bundle.main.bundleURL].compactMap({ $0 }) {
            let url = base.appendingPathComponent(file)
            if let image = UIImage(contentsOfFile: url.path) { return image }
        }
        return nil
    }
}

/// The mini player: artwork, title and artist, play/pause and next.
struct MusicMiniPlayer: View {
    @ObservedObject var model: MusicTabBarModel
    let send: (String) -> Void

    var body: some View {
        HStack(spacing: 12) {
            Group {
                if let art = model.artwork {
                    Image(uiImage: art).resizable().aspectRatio(contentMode: .fill)
                } else {
                    Color.gray.opacity(0.3)
                }
            }
            .frame(width: 36, height: 36)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                Text(model.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                Text(model.artist).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 4)
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                send("play")
            } label: {
                Image(systemName: model.playing ? "pause.fill" : "play.fill").font(.title3)
                    .frame(width: 36, height: 36)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(model.playing ? "Pause" : "Play")
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                send("next")
            } label: {
                Image(systemName: "forward.fill").font(.title3).frame(width: 36, height: 36)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Next")
        }
        .padding(.horizontal, 12)
        .contentShape(Rectangle())
        .onTapGesture {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            send("accessory")
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Now playing: \(model.title), \(model.artist)")
    }
}

struct MusicTabBarBody: View {
    @ObservedObject var model: MusicTabBarModel
    let send: (String) -> Void

    private var selection: Binding<Int> {
        Binding(get: { model.selected }, set: { index in
            guard index != model.selected else { return }
            model.selected = index
            UISelectionFeedbackGenerator().selectionChanged()
            send("tab:\(index)")
        })
    }

    @ViewBuilder private func tabs() -> some View {
        ForEach(Array(model.titles.enumerated()), id: \.offset) { index, title in
            // The page is Contract's, behind this view: every tab's content is clear.
            Color.clear
                .allowsHitTesting(false)
                .tabItem {
                    Label(title, systemImage: index < model.symbols.count ? model.symbols[index] : "circle")
                }
                .tag(index)
        }
    }

    var body: some View {
        if #available(iOS 26.0, *) {
            if model.accessory && !model.title.isEmpty {
                TabView(selection: selection) { tabs() }
                    .tabViewBottomAccessory { MusicMiniPlayer(model: model, send: send) }
                    .tint(model.tint)
            } else {
                TabView(selection: selection) { tabs() }
                    .tint(model.tint)
            }
        } else if !model.accessory || model.title.isEmpty {
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                TabView(selection: selection) { tabs() }
                    .tint(model.tint)
                    .frame(height: 84)
            }
        } else {
            VStack(spacing: 8) {
                Spacer(minLength: 0)
                MusicMiniPlayer(model: model, send: send)
                    .frame(height: 56)
                    .background(.regularMaterial, in: Capsule())
                    .padding(.horizontal, 10)
                TabView(selection: selection) { tabs() }
                    .tint(model.tint)
                    .frame(height: 84)
            }
        }
    }
}

/// Takes a touch only where SwiftUI drew something that answers it (the bar, the accessory):
/// a hit on the hosting view itself (its clear content) passes to the Contract page under it.
final class MusicTabBarHost: UIView {
    weak var hosted: UIView?

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let hit = super.hitTest(point, with: event), hit !== self, hit !== hosted else { return nil }
        // UIKit's TabView container views that fill the box (the tab's transition view, the
        // clear content's hosting) are not targets either: only the bar and the accessory are.
        if let hosted, hit.bounds.size == hosted.bounds.size, hit.isDescendant(of: hosted) { return nil }
        return hit
    }
}

final class MusicTabBar: ExactNativeInstance {
    private let model = MusicTabBarModel()
    /// `native-tabbar`: no accessory, whatever the props say.
    private let box = MusicTabBarHost()
    private var host: UIHostingController<MusicTabBarBody>?

    init(props: [String: String], events: ExactNativeEvents, accessory: Bool = true) {
        model.accessory = accessory
        box.backgroundColor = .clear
        super.init(events: events)
        let events = self.events
        let host = UIHostingController(rootView: MusicTabBarBody(model: model, send: { events.change($0) }))
        host.view.backgroundColor = .clear
        host.overrideUserInterfaceStyle = .dark
        host.view.frame = box.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        box.addSubview(host.view)
        box.hosted = host.view
        self.host = host
        try? setProps(props)
    }

    override var view: ExactNativeView { box }

    override var controller: UIViewController? { host }

    override func setProps(_ props: [String: String]) throws {
        let split = { (key: String) in (props[key] ?? "").split(separator: "|").map(String.init) }
        let titles = split("tab-titles")
        if titles != model.titles { model.titles = titles }
        let symbols = split("tab-symbols")
        if symbols != model.symbols { model.symbols = symbols }
        let selected = Int(props["selected-tab"] ?? "") ?? 0
        if selected != model.selected { model.selected = selected }
        model.tint = MusicTabBarModel.color(props["tab-tint"]) ?? .accentColor
        if model.title != props["track-title"] ?? "" { model.title = props["track-title"] ?? "" }
        if model.artist != props["track-artist"] ?? "" { model.artist = props["track-artist"] ?? "" }
        let file = props["artwork-file"] ?? ""
        if file != model.artworkFile {
            model.artworkFile = file
            model.artwork = MusicTabBarModel.image(file)
        }
        let playing = props["is-playing"] == "true"
        if playing != model.playing { model.playing = playing }
        let style: UIUserInterfaceStyle = props["bar-appearance"] == "light" ? .light : .dark
        if host?.overrideUserInterfaceStyle != style { host?.overrideUserInterfaceStyle = style }
    }

    override func destroy() {
        host?.view.removeFromSuperview()
        host = nil
    }
}
#endif

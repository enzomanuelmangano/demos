// The demos app's native module: the views the Contracts reach through native tags (iOS, and
// macOS where noted). Every view is registered in `DemosModule.views` below.
//
// `rolling-count`: SwiftUI text whose digits roll (`.numericText`) when `count` changes, on a
//   0.3 s bounce-free spring. Props: `count`, `points`, `tint`, plus optional `family` (a
//   registered PostScript name, fixed size), `weight` and `design` (SwiftUI names), `tracking` (pt),
//   `anchor="top-leading"` (natural size at the top-leading corner instead of centred), `down`
//   ("true" rolls downward), `seconds`, `bounce`, `delay` for the spring. Each instance sends
//   `message("rolling-count:2")` once after its first props, so a Contract can tell a build that
//   knows these props from one that does not.
// `demo-card`: the demo screen's card; the open, close drag and flight home live in DemoLaunch.swift.
//   The view itself is the demo's backdrop until the demo has painted.
// `glass-button`: the demo screen's close and info buttons, a SwiftUI glass button; `role="close"`
//   is the system close role (iOS 26). It fades in once the demo has painted.
// `swift-slider`: a SwiftUI Slider (0...1) whose changes arrive as `change`; `progress` is the
//   value at mount, `max-track-tint` the unfilled track's colour.
// `mate-haptic`: a Core Haptics crescendo; a new `plays` value starts it, a new `stops` value
//   cancels it. Discrete points are transient events, continuous ones one event under an
//   intensity and a sharpness curve.
// `painting-menu` (PaintingMenu.swift, iOS and macOS), `inspiration-sheet` (InspirationSheet.swift),
//   `toggle-sheet` (ToggleSheet.swift), `system-alert` (SystemAlert.swift: a UIAlertController
//   presented from the top-most controller), `glass-pane` (GlassPane.swift, iOS and macOS),
//   `variable-blur` (VariableBlur.swift), `audio-track` (AudioTrack.swift).
// `music-tabbar` (MusicTabBar.swift): a SwiftUI TabView with a mini player as its bottom
//   accessory; `native-tabbar` is the same bar without the accessory.
// `page-dots` (PageDots.swift): the home's page dots, following the pager's scroll offset
//   (the `page-scroller` hatch names the pager's scroll view).
// `search-reveal` (SearchReveal.swift): the home's pull-to-search, driven by the same pager.
import Foundation
#if os(iOS)
import CoreHaptics
import SwiftUI
import UIKit

let exactModule: ExactModule.Type = DemosModule.self

final class DemosModule: ExactModule {
    override class var views: [String: ExactNativeFactory] {
        installLaunch()
        // Each native view is named for the layers overlay (LayerSkeleton.swift) when it is made.
        func native(_ tag: String, _ make: @escaping ([String: String], ExactNativeEvents) -> ExactNativeInstance) -> ExactNativeFactory {
            ExactNativeFactory { props, events in
                let instance = make(props, events)
                LayerSkeleton.tag(instance.view, tag)
                return instance
            }
        }
        return ["rolling-count": native("rolling-count") { RollingCount(props: $0, events: $1) },
         "demo-card": native("demo-card") { DemoCard(props: $0, events: $1) },
         "glass-button": native("glass-button") { GlassButton(props: $0, events: $1) },
         "mate-haptic": native("mate-haptic") { MateHaptic(props: $0, events: $1) },
         "swift-slider": native("swift-slider") { SwiftSlider(props: $0, events: $1) },
         "painting-menu": native("painting-menu") { PaintingMenu(props: $0, events: $1) },
         "variable-blur": native("variable-blur") { VariableBlur(props: $0, events: $1) },
         "audio-track": native("audio-track") { AudioTrack(props: $0, events: $1) },
         "glass-pane": native("glass-pane") { GlassPane(props: $0, events: $1) },
         "inspiration-sheet": native("inspiration-sheet") { InspirationSheet(props: $0, events: $1) },
         "toggle-sheet": native("toggle-sheet") { ToggleSheet(props: $0, events: $1) },
         "system-alert": native("system-alert") { SystemAlert(props: $0, events: $1) },
         "music-tabbar": native("music-tabbar") { MusicTabBar(props: $0, events: $1) },
         "native-tabbar": native("native-tabbar") { MusicTabBar(props: $0, events: $1, accessory: false) },
         "page-dots": native("page-dots") { PageDots(props: $0, events: $1) },
         "search-reveal": native("search-reveal") { SearchReveal(props: $0, events: $1) }]
    }

    override func element(_ element: ExactElement) {
        if element.hatch == .launchIcon { launchIconHatch(element) }
        if element.hatch == .pageScroller { pageScrollerHatch(element) }
    }

    override func elementEnded(_ element: ExactElement) {
        if element.hatch == .launchIcon { launchIconHatchEnded(element) }
        if element.hatch == .pageScroller { pageScrollerHatchEnded(element) }
    }
}

private final class CountModel: ObservableObject {
    @Published var text = "0"
    @Published var size: CGFloat = 50
    @Published var color = Color.black
    @Published var family: String?
    @Published var weight = Font.Weight.bold
    @Published var design = Font.Design.rounded
    @Published var tracking: CGFloat = 0
    @Published var topLeading = false
    @Published var down = false
    @Published var seconds = 0.3
    @Published var bounce = 0.0
    @Published var delay = 0.0

    var font: Font {
        if let family, UIFont(name: family, size: size) != nil { return .custom(family, fixedSize: size) }
        return .system(size: size, weight: weight, design: design)
    }
}

private struct CountBody: View {
    @ObservedObject var model: CountModel

    var body: some View {
        ZStack(alignment: .topLeading) {
            if model.topLeading {
                text.fixedSize()
            } else {
                text.frame(maxWidth: 9999, alignment: .center)
            }
        }
        // Fill the host's box, content at top-leading.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .animation(.spring(duration: model.seconds, bounce: model.bounce, blendDuration: 0)
            .delay(model.delay), value: model.text)
    }

    private var text: some View {
        Text(model.text)
            .contentTransition(.numericText(countsDown: model.down))
            .font(model.font)
            .monospacedDigit()
            .tracking(model.tracking)
            .foregroundStyle(model.color)
            .accessibilityHidden(true)
    }
}

private final class RollingCount: ExactNativeInstance {
    private let model = CountModel()
    private let host: UIHostingController<CountBody>
    private var announced = false

    init(props: [String: String], events: ExactNativeEvents) {
        host = UIHostingController(rootView: CountBody(model: model))
        host.safeAreaRegions = []
        host.view.backgroundColor = .clear
        host.view.isUserInteractionEnabled = false
        super.init(events: events)
        try? setProps(props)
    }

    override var view: ExactNativeView { host.view }

    override func setProps(_ props: [String: String]) throws {
        if let size = props["points"].flatMap(Double.init) { model.size = CGFloat(size) }
        if let hex = props["tint"], let color = Self.color(hex) { model.color = color }
        model.family = props["family"].flatMap { $0.isEmpty ? nil : $0 }
        model.weight = props["weight"].flatMap(Self.weight) ?? .bold
        model.design = props["design"].flatMap(Self.design) ?? .rounded
        model.tracking = CGFloat(props["tracking"].flatMap(Double.init) ?? 0)
        model.topLeading = props["anchor"] == "top-leading"
        model.down = props["down"] == "true"
        model.seconds = props["seconds"].flatMap(Double.init) ?? 0.3
        model.bounce = props["bounce"].flatMap(Double.init) ?? 0
        model.delay = props["delay"].flatMap(Double.init) ?? 0
        // Last, so the change animates with this update's direction, spring and delay.
        if let text = props["count"], text != model.text { model.text = text }
        if !announced {
            announced = true
            let events = self.events
            DispatchQueue.main.async { events.message("rolling-count:2") }
        }
    }

    private static func weight(_ name: String) -> Font.Weight? {
        switch name {
        case "ultraLight": .ultraLight
        case "thin": .thin
        case "light": .light
        case "regular": .regular
        case "medium": .medium
        case "semibold": .semibold
        case "bold": .bold
        case "heavy": .heavy
        case "black": .black
        default: nil
        }
    }

    private static func design(_ name: String) -> Font.Design? {
        switch name {
        case "default": .default
        case "rounded": .rounded
        case "monospaced": .monospaced
        case "serif": .serif
        default: nil
        }
    }

    private static func color(_ hex: String) -> Color? { uiColor(hex).map { Color($0) } }

    static func uiColor(_ hex: String) -> UIColor? {
        let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        return UIColor(red: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255,
                       blue: CGFloat(v & 0xff) / 255, alpha: 1)
    }
}
/// `demo-card`: the demo's backdrop until it has painted, and the route's hold on the launch
/// (DemoLaunch.swift). `press` fires when the launch lets the route go.
private final class DemoCard: ExactNativeInstance {
    private let card = DemoCardView()

    init(props: [String: String], events: ExactNativeEvents) {
        card.isUserInteractionEnabled = false
        card.isAccessibilityElement = false
        super.init(events: events)
        card.onLeave = { events.press() }
        try? setProps(props)
    }

    override var view: ExactNativeView { card }

    override func setProps(_ props: [String: String]) throws {
        card.slug = props["slug"] ?? card.slug
        card.name = props["caption"] ?? card.name
        card.zone = CloseZone(props["zone"] ?? "")
        if let hex = props["tint"], let color = RollingCount.uiColor(hex) { card.backgroundColor = color }
    }
}
private final class GlassModel: ObservableObject {
    @Published var label = ""
    @Published var symbol = ""
    @Published var close = false
    /// When `close` last changed.
    var closeSince: CFTimeInterval = 0
    @Published var visible = false
    @Published var trailing = false
}

private struct GlassBody: View {
    @ObservedObject var model: GlassModel
    let press: () -> Void

    var body: some View {
        styled(SwiftUI.Button(model.label, systemImage: model.symbol, role: role, action: press)
            .labelStyle(.iconOnly)
            // A demo's sub-page turns the close into Back (demo-screen.contract): the symbols
            // swap with SF Symbols' replace effect.
            .contentTransition(.symbolEffect(.replace))
            .animation(.snappy(duration: 0.3), value: model.symbol))
            .buttonBorderShape(.circle)
            .controlSize(.large)
            .opacity(model.visible ? 1 : 0)
            .animation(.easeOut(duration: 0.22), value: model.visible)
            // Visible once the demo has painted, hidden at the close.
            .onAppear { DispatchQueue.main.async { model.visible = LaunchSession.current?.buttonsVisible ?? true } }
            .onReceive(NotificationCenter.default.publisher(for: LaunchSession.shownChanged)) { note in
                guard let session = note.object as? LaunchSession else { return }
                model.visible = session.buttonsVisible
            }
            // The box is rounded to whole points, so the button keeps to its edge.
            .frame(maxWidth: .infinity, maxHeight: .infinity,
                   alignment: model.trailing ? .topTrailing : .topLeading)
    }

    /// Glass from iOS 26, bordered on earlier versions.
    @ViewBuilder
    private func styled<V: View>(_ button: V) -> some View {
        if #available(iOS 26.0, *) {
            button.buttonStyle(.glass)
        } else {
            button.buttonStyle(.bordered)
        }
    }

    private var role: ButtonRole? {
        guard model.close else { return nil }
        if #available(iOS 26.0, *) { return .close }
        return nil
    }
}

private final class GlassButton: ExactNativeInstance {
    /// The button's view, for the closure that is made before the view exists.
    private final class Anchor { weak var view: UIView? }
    private let anchor: Anchor
    private let model = GlassModel()
    private let host: UIHostingController<GlassBody>

    init(props: [String: String], events: ExactNativeEvents) {
        let model = self.model
        // The close goes through the launch (haptic, then the flight home); with no launch
        // (a demo it does not hold) it falls back to the route's own leave.
        // A close right after a sub-page's Back (the same button) is ignored, as the route's own guard does.
        let anchor = Anchor()
        self.anchor = anchor
        host = UIHostingController(rootView: GlassBody(model: model, press: {
            // The session whose route holds this button, not the last one adopted.
            if model.close, let session = LaunchSession.owning(anchor.view) {
                if CACurrentMediaTime() - model.closeSince > 0.4 { session.closeFromButton() }
            } else {
                if model.close { LaunchTrace.fault("the close button fell back to the route's back: no launch session holds it") }
                events.press()
            }
        }))
        anchor.view = host.view
        host.safeAreaRegions = []
        host.view.backgroundColor = .clear
        // The buttons are always drawn on a dark surface.
        host.overrideUserInterfaceStyle = .dark
        super.init(events: events)
        try? setProps(props)
    }

    override var view: ExactNativeView { host.view }

    override func setProps(_ props: [String: String]) throws {
        model.label = props["caption"] ?? ""
        model.symbol = props["symbol"] ?? ""
        let close = props["kind"] == "close"
        if close != model.close { model.closeSince = CACurrentMediaTime() }
        model.close = close
        model.trailing = props["edge"] == "trailing"
    }
}
private final class SliderModel: ObservableObject {
    /// The value at mount (props `progress`).
    @Published var progress: Float = 0
}
/// A bare SwiftUI Slider (0...1, no step or labels) filling the box.
private struct SliderBody: View {
    @ObservedObject var model: SliderModel
    let changed: (Float) -> Void
    @State private var value: Float = 0
    var body: some View {
        ZStack(alignment: .topLeading) {
            Slider(value: Binding(get: { value }, set: { value = min(max($0, 0), 1) }), onEditingChanged: { _ in })
                .onAppear { value = model.progress }
                .onChange(of: value) { new in changed(new) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
/// `swift-slider`: see the header.
private final class SwiftSlider: ExactNativeInstance {
    private let model = SliderModel()
    private let host: UIHostingController<SliderBody>
    init(props: [String: String], events: ExactNativeEvents) {
        let model = self.model
        host = UIHostingController(rootView: SliderBody(model: model, changed: { v in events.change(String(v)) }))
        host.safeAreaRegions = []
        host.view.backgroundColor = .clear
        super.init(events: events)
        try? setProps(props)
    }
    override var view: ExactNativeView { host.view }
    /// `max-track-tint`: the unfilled track's colour, `#RRGGBB` or `#RRGGBBAA`. SwiftUI's Slider has
    /// no modifier for it, so it is set on the UISlider inside the hosting view once that exists
    /// (after the first layout) and again on each change.
    private var maxTrack: UIColor?
    override func setProps(_ props: [String: String]) throws {
        if let p = props["progress"].flatMap(Float.init) { model.progress = p }
        if let hex = props["max-track-tint"] {
            maxTrack = Self.rgba(hex)
            applyTint()
            DispatchQueue.main.async { [weak self] in self?.applyTint() }
        }
    }
    private func applyTint() {
        guard let maxTrack else { return }
        func walk(_ v: UIView) {
            if let slider = v as? UISlider { slider.maximumTrackTintColor = maxTrack; return }
            v.subviews.forEach(walk)
        }
        walk(host.view)
    }
    private static func rgba(_ hex: String) -> UIColor? {
        let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard s.count == 6 || s.count == 8, let v = UInt32(s, radix: 16) else { return nil }
        let (rgb, a): (UInt32, CGFloat) = s.count == 8 ? (v >> 8, CGFloat(v & 0xff) / 255) : (v, 1)
        return UIColor(red: CGFloat((rgb >> 16) & 0xff) / 255, green: CGFloat((rgb >> 8) & 0xff) / 255,
                       blue: CGFloat(rgb & 0xff) / 255, alpha: a)
    }
}

/// `mate-haptic`: a checkmate crescendo on Core Haptics (see the header).
private final class MateHaptic: ExactNativeInstance {
    /// (ms, amplitude, frequency).
    private static let discrete: [(Double, Float, Float)] = [
        (0, 0.45, 0.6), (90, 0.25, 0.5), (240, 0.55, 0.6), (330, 0.3, 0.5),
        (400, 1, 0.55), (470, 0.5, 0.5), (540, 0.3, 0.45),
        (700, 1, 0.35), (760, 0.9, 0.2),
        (900, 0.55, 0.5), (1080, 0.4, 0.4), (1280, 0.3, 0.35), (1500, 0.2, 0.3),
        (1900, 0.6, 0.6), (1975, 0.75, 0.8), (2060, 0.9, 1),
    ]
    /// (ms, value).
    private static let amplitude: [(Double, Float)] = [
        (0, 0), (380, 0.1), (450, 0.3), (680, 1), (850, 0.55), (950, 0.7), (1150, 0.4), (1300, 0.5), (1700, 0.12), (2150, 0),
    ]
    private static let frequency: [(Double, Float)] = [(0, 0.5), (400, 0.4), (680, 0.9), (800, 0.25), (1400, 0.35), (2150, 0.3)]

    private let box = UIView()
    private var engine: CHHapticEngine?
    private var players: [CHHapticPatternPlayer] = []
    private var played: String
    private var stopped: String

    init(props: [String: String], events: ExactNativeEvents) {
        box.isUserInteractionEnabled = false
        box.isAccessibilityElement = false
        played = props["plays"] ?? "0"
        stopped = props["stops"] ?? "0"
        super.init(events: events)
    }

    override var view: ExactNativeView { box }

    override func setProps(_ props: [String: String]) throws {
        if let p = props["plays"], p != played {
            played = p
            play()
        }
        if let s = props["stops"], s != stopped {
            stopped = s
            stop()
        }
    }

    private static func curve(_ id: CHHapticDynamicParameter.ID, _ points: [(Double, Float)]) -> CHHapticParameterCurve {
        var controls: [CHHapticParameterCurve.ControlPoint] = []
        for (ms, v) in points {
            let value = min(max(v, 0), 1)
            if controls.isEmpty && ms > 0 { controls.append(.init(relativeTime: 0, value: value)) }
            controls.append(.init(relativeTime: ms / 1000, value: value))
        }
        return CHHapticParameterCurve(parameterID: id, controlPoints: controls, relativeTime: 0)
    }

    private func stop() {
        for p in players { try? p.stop(atTime: CHHapticTimeImmediate) }
        players = []
    }

    private func play() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
        stop()
        do {
            if engine == nil {
                let made = try CHHapticEngine()
                made.resetHandler = { [weak made] in try? made?.start() }
                engine = made
            }
            guard let engine else { return }
            try engine.start()
            let length = max(Self.amplitude.last?.0 ?? 0, Self.frequency.last?.0 ?? 0) / 1000
            let continuous = try CHHapticPattern(
                events: [CHHapticEvent(eventType: .hapticContinuous,
                                       parameters: [CHHapticEventParameter(parameterID: .hapticIntensity, value: 1),
                                                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0)],
                                       relativeTime: 0, duration: length)],
                parameterCurves: [Self.curve(.hapticIntensityControl, Self.amplitude), Self.curve(.hapticSharpnessControl, Self.frequency)])
            let discrete = try CHHapticPattern(
                events: Self.discrete.map { ms, a, f in
                    CHHapticEvent(eventType: .hapticTransient,
                                  parameters: [CHHapticEventParameter(parameterID: .hapticIntensity, value: min(max(a, 0), 1)),
                                               CHHapticEventParameter(parameterID: .hapticSharpness, value: min(max(f, 0), 1))],
                                  relativeTime: ms / 1000)
                },
                parameters: [])
            for pattern in [continuous, discrete] {
                let player = try engine.makePlayer(with: pattern)
                try player.start(atTime: CHHapticTimeImmediate)
                players.append(player)
            }
        } catch {
            stop()
        }
    }
}
#else
import AppKit
let exactModule: ExactModule.Type = DemosModule.self
final class DemosModule: ExactModule {
    override class var views: [String: ExactNativeFactory] {
        // The desktop atlas is a light canvas: keep the window (and its toolbar) in the light
        // appearance whatever the system's, so the toolbar isn't a dark grey band over it.
        DispatchQueue.main.async { NSApp?.appearance = NSAppearance(named: .aqua) }
        return ["painting-menu": ExactNativeFactory { props, events in PaintingMenu(props: props, events: events) },
         "glass-pane": ExactNativeFactory { props, events in GlassPane(props: props, events: events) }]
    }
}
#endif

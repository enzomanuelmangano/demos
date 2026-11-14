// The demos app's native module. Its one view, `rolling-count`, is RN wheel-picker's
// AnimatedCount (src/animations/wheel-picker/components/animated-count/index.ios.tsx) as
// @expo/ui draws it: a SwiftUI `Host` (a ZStack aligned top-leading, filling the box) holding
// expo-ui's `TextView` with the modifiers RN passes, in RN's order:
//   contentTransition('numericText')  → .contentTransition(.numericText(countsDown: false))
//                                        (ContentTransitionModifier: countsDown defaults false)
//   font({ size, weight: 'bold', design: 'rounded' }) → .font(.system(size:weight:design:))
//   monospacedDigit()                 → .monospacedDigit()
//   frame({ maxWidth: 9999, alignment: 'center' })
//   foregroundStyle(color)
//   { $type: 'animation', animation: { type: 'spring', duration: 0.3 }, animatedValue: count }
//                                     → .animation(.spring(duration: 0.3, bounce: 0,
//                                        blendDuration: 0), value: Double(count))
// So the number always rolls up (countsDown false), on a 0.3 s bounce-free spring.
//
// `demo-card` is the demo screen's card (src/navigation/home/demo-screen.tsx styles.card and
// DemoLaunch): its open out of the icon, the close drag, the flight home, the home's blur, all
// in DemoLaunch.swift. The view itself is the demo's backdrop over the demo until it has painted.
//
// `glass-button` is the demo screen's close and info buttons (demo-close-button.tsx,
// demo-inspiration.tsx): @expo/ui's Button in a matchContents Host with colorScheme dark,
// SwiftUI.Button(label, systemImage:, role:) with RN's modifiers in RN's order:
//   labelStyle('iconOnly') buttonStyle('glass') buttonBorderShape('circle') controlSize('large')
//   opacity(visible) animation(Animation.easeOut({ duration: 0.22 }), visible)
// `role="close"` is the close role (iOS 26: LIQUID_GLASS). RN fades it in once the demo has
// painted (demo-screen.tsx `shown`): here once SwiftUI shows it.
//
// `swift-slider` is airbnb-slider's AnimatedSlider on iOS 26 (components/animated-slider/
// index.liquid.tsx): @expo/ui's Host (a ZStack aligned top-leading, filling the box) holding its
// SliderView: `Slider(value:onEditingChanged:)` (no range, no step) on a clamped binding to the
// view's own @State value, each change sent once SwiftUI has applied it (`onChange(of: value)`,
// as onValueChanged) through `change`. `progress` is its value at mount (initialProgress). RN
// echoes each value back through animatedProps and, with no mostRecentEventCount, a stale echo
// pulls the thumb back while JS lags: not ported (the slider's design follows the finger).
//
// `mate-haptic` is chessboard's checkmate crescendo (src/animations/chessboard/src/haptics.ts
// MATE_PATTERN) as react-native-pulsar's PatternComposer plays it: the discrete points as
// transient events (intensity = amplitude, sharpness = frequency), the continuous points as one
// continuous event (intensity 1, sharpness 0) for the curves' length under an intensity-control
// and a sharpness-control curve (a first point at 0 when the first is later). A new `plays` value
// starts it, a new `stops` value cancels it (demos/chessboard/chessboard.contract).
import Foundation
#if os(iOS)
import CoreHaptics
import SwiftUI
import UIKit

let exactModule: ExactModule.Type = DemosModule.self

final class DemosModule: ExactModule {
    override class var views: [String: ExactNativeFactory] {
        installLaunch()
        return ["rolling-count": ExactNativeFactory { props, events in RollingCount(props: props, events: events) },
         "demo-card": ExactNativeFactory { props, events in DemoCard(props: props, events: events) },
         "glass-button": ExactNativeFactory { props, events in GlassButton(props: props, events: events) },
         "mate-haptic": ExactNativeFactory { props, events in MateHaptic(props: props, events: events) },
         "swift-slider": ExactNativeFactory { props, events in SwiftSlider(props: props, events: events) }]
    }

    override func element(_ element: ExactElement) {
        if element.hatch == .launchIcon { launchIconHatch(element) }
    }

    override func elementEnded(_ element: ExactElement) {
        if element.hatch == .launchIcon { launchIconHatchEnded(element) }
    }
}

private final class CountModel: ObservableObject {
    @Published var text = "0"
    @Published var value = 0.0
    @Published var size: CGFloat = 50
    @Published var color = Color.black
}

private struct CountBody: View {
    @ObservedObject var model: CountModel

    var body: some View {
        ZStack(alignment: .topLeading) {
            Text(model.text)
                .contentTransition(.numericText(countsDown: false))
                .font(.system(size: model.size, weight: .bold, design: .rounded))
                .monospacedDigit()
                .frame(maxWidth: 9999, alignment: .center)
                .foregroundStyle(model.color)
                .animation(.spring(duration: 0.3, bounce: 0, blendDuration: 0), value: model.value)
                .accessibilityHidden(true)
        }
        // HostView's FillAlignmentModifier: the host fills its box, content at top-leading.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private final class RollingCount: ExactNativeInstance {
    private let model = CountModel()
    private let host: UIHostingController<CountBody>

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
        if let text = props["count"], text != model.text {
            model.text = text
            model.value = Double(text) ?? 0
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
/// `demo-card`: the demo's cover in its backdrop until the demo has painted, and the route's hold
/// on the launch (DemoLaunch.swift). `press` is the route's leave, which the launch fires when
/// the close lets the route go.
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
        card.ownsDrags = props["owns"] == "drags"
        if let hex = props["tint"], let color = RollingCount.uiColor(hex) { card.backgroundColor = color }
    }
}
private final class GlassModel: ObservableObject {
    @Published var label = ""
    @Published var symbol = ""
    @Published var close = false
    @Published var visible = false
    @Published var trailing = false
}

private struct GlassBody: View {
    @ObservedObject var model: GlassModel
    let press: () -> Void

    var body: some View {
        styled(SwiftUI.Button(model.label, systemImage: model.symbol, role: role, action: press)
            .labelStyle(.iconOnly))
            .buttonBorderShape(.circle)
            .controlSize(.large)
            .opacity(model.visible ? 1 : 0)
            .animation(.easeOut(duration: 0.22), value: model.visible)
            // RN's `visible={shown && !closing}`: in once the demo has painted, out at the close.
            .onAppear { DispatchQueue.main.async { model.visible = LaunchSession.current?.buttonsVisible ?? true } }
            .onReceive(NotificationCenter.default.publisher(for: LaunchSession.shownChanged)) { note in
                guard let session = note.object as? LaunchSession else { return }
                model.visible = session.buttonsVisible
            }
            // RN's Host sits at left 16 (close) or right 16 (info) at its content's own size;
            // the box here is rounded to whole points, so the button keeps to that edge.
            .frame(maxWidth: .infinity, maxHeight: .infinity,
                   alignment: model.trailing ? .topTrailing : .topLeading)
    }

    /// buttonStyle(LIQUID_GLASS ? 'glass' : 'bordered').
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
    private let model = GlassModel()
    private let host: UIHostingController<GlassBody>

    init(props: [String: String], events: ExactNativeEvents) {
        let model = self.model
        // The close is the launch's (closeFromButton: haptic, then the flight home); without one
        // (a demo the launch does not hold) the route's own leave.
        host = UIHostingController(rootView: GlassBody(model: model, press: {
            if model.close, let session = LaunchSession.current { session.closeFromButton() } else { events.press() }
        }))
        host.safeAreaRegions = []
        host.view.backgroundColor = .clear
        // Host colorScheme="dark".
        host.overrideUserInterfaceStyle = .dark
        super.init(events: events)
        try? setProps(props)
    }

    override var view: ExactNativeView { host.view }

    override func setProps(_ props: [String: String]) throws {
        model.label = props["caption"] ?? ""
        model.symbol = props["symbol"] ?? ""
        model.close = props["role"] == "close"
        model.trailing = props["edge"] == "trailing"
    }
}
private final class SliderModel: ObservableObject {
    /// The value at mount (props `progress`).
    @Published var progress: Float = 0
}
/// expo-ui's SliderView with no min, max, step or labels, in HostView's ZStack.
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
    override func setProps(_ props: [String: String]) throws {
        if let p = props["progress"].flatMap(Float.init) { model.progress = p }
    }
}

/// `mate-haptic`: MATE_PATTERN on Core Haptics (see the header).
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
let exactModule: ExactModule.Type = DemosModule.self
final class DemosModule: ExactModule {}
#endif

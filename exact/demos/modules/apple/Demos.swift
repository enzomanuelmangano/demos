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
// `screen-corners` is the demo screen's card (src/navigation/home/demo-screen.tsx styles.card:
// borderCurve 'continuous', overflow 'hidden', borderRadius SCREEN_CORNER_RADIUS × the drag's
// pose). RN's demo route is transparent over the home, so the home shows in the card's corners.
// The Exact route is UIKit's fullscreen presentation (`.overFullScreen`: the home stays beneath),
// whose view Contract cannot round: this zero-sized view rounds the presented controller's view
// once it is in a window. The radius is react-native-screen-corner-radius's, the screen's
// `_displayCornerRadius` floored at 25 (screen-radius.ts MIN_RADIUS); under UIKit's zoom the
// layer's radius scales with the view, as RN's radius × pose.
//
// `glass-button` is the demo screen's close and info buttons (demo-close-button.tsx,
// demo-inspiration.tsx): @expo/ui's Button in a matchContents Host with colorScheme dark,
// SwiftUI.Button(label, systemImage:, role:) with RN's modifiers in RN's order:
//   labelStyle('iconOnly') buttonStyle('glass') buttonBorderShape('circle') controlSize('large')
//   opacity(visible) animation(Animation.easeOut({ duration: 0.22 }), visible)
// `role="close"` is the close role (iOS 26: LIQUID_GLASS). RN fades it in once the demo has
// painted (demo-screen.tsx `shown`): here once SwiftUI shows it.
import Foundation
#if os(iOS)
import SwiftUI
import UIKit

let exactModule: ExactModule.Type = DemosModule.self

final class DemosModule: ExactModule {
    override class var views: [String: ExactNativeFactory] {
        ["rolling-count": ExactNativeFactory { props, events in RollingCount(props: props, events: events) },
         "screen-corners": ExactNativeFactory { _, events in ScreenCorners(events: events) },
         "glass-button": ExactNativeFactory { props, events in GlassButton(props: props, events: events) }]
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

    private static func color(_ hex: String) -> Color? {
        let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        return Color(.sRGB, red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255,
                     blue: Double(v & 0xff) / 255, opacity: 1)
    }
}
/// screen-radius.ts: max(ScreenCornerRadius, MIN_RADIUS 25).
private let screenCornerRadius: CGFloat = {
    let device = (UIScreen.main.value(forKey: "_displayCornerRadius") as? CGFloat) ?? 0
    return max(device, 25)
}()

private final class CornerProbe: UIView {
    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        // The route's controller, then its outermost parent: the presented one.
        var responder: UIResponder? = self
        while let r = responder, !(r is UIViewController) { responder = r.next }
        guard var controller = responder as? UIViewController else { return }
        while let parent = controller.parent { controller = parent }
        guard controller.presentingViewController != nil,
              controller.modalPresentationStyle == .overFullScreen else { return }
        let layer = controller.view.layer
        layer.cornerRadius = screenCornerRadius
        layer.cornerCurve = .continuous
        layer.masksToBounds = true
    }
}

private final class ScreenCorners: ExactNativeInstance {
    private let probe = CornerProbe()

    override init(events: ExactNativeEvents) {
        probe.isUserInteractionEnabled = false
        probe.isAccessibilityElement = false
        super.init(events: events)
    }

    override var view: ExactNativeView { probe }
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
            // RN's `shown`: the button fades in once the demo is on screen.
            .onAppear { DispatchQueue.main.async { model.visible = true } }
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
        host = UIHostingController(rootView: GlassBody(model: model, press: { events.press() }))
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
#else
let exactModule: ExactModule.Type = DemosModule.self
final class DemosModule: ExactModule {}
#endif

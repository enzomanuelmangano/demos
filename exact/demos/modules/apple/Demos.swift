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
import Foundation
#if os(iOS)
import SwiftUI
import UIKit

let exactModule: ExactModule.Type = DemosModule.self

final class DemosModule: ExactModule {
    override class var views: [String: ExactNativeFactory] {
        ["rolling-count": ExactNativeFactory { props, events in RollingCount(props: props, events: events) }]
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
#else
let exactModule: ExactModule.Type = DemosModule.self
final class DemosModule: ExactModule {}
#endif

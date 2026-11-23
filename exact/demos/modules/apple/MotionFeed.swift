// `motion-feed`: Core Motion's gravity written straight into a GPU canvas's input while this node is in a
// window (Linear Sensors; RN: useAnimatedSensor(GRAVITY / ROTATION, { interval: 20 })).
//
// Why not @exact/motion's `startSensorInput`: its feed runs only while the runner's lease says the canvas
// is displayed. A start that reaches the runner before the canvas counts as displayed is told "hidden"
// (runner/src/runner/modules/fed.rs `fed_send`, `if started && !shown`), and Motion.swift keeps that
// surface in `hidden`, its feed paused. A later start sets the runner's `shown` silently
// (fed.rs: `(s.shown, s.paused) = (shown, !shown)`, no `tell_fed`), so `report_fed` sees no change and
// never says "displayed true"; a still demo makes no other commit. Motion.swift then refuses to unpause
// (`startInput`: `if !hidden.contains(surface) { leased.remove(surface) }`): no sample on a phone, ever.
//
// Props: `feed` (the canvas's surface name), `frequency` (Hz, default 50). Samples are the W3C's
// GravitySensor reading, as Motion.swift writes them: Core Motion's gravity (g) times -9.80665.
//
// Debug: launched with `-MotionFeedDebug YES`, a label shows the last sample, the count and its age;
// with `-MotionFeedSweep YES` on a device with no motion hardware (the simulator) the feed writes a
// slow synthetic tilt instead, so the path into the canvas can be watched without a phone.
#if os(iOS)
import CoreMotion
import UIKit

final class MotionFeed: ExactNativeInstance {
    private final class Anchor: UIView {
        var moved: (() -> Void)?
        override func didMoveToWindow() {
            super.didMoveToWindow()
            moved?()
        }
    }

    private static let g = 9.80665
    private static let manager = CMMotionManager()
    private let anchor = Anchor()
    private var surface = ""
    private var frequency = 50.0
    private var running = false
    private var sweep: Timer?
    private var count = 0
    private var last: [Double] = []
    private var lastAt = CACurrentMediaTime()
    private var label: UILabel?
    private var labelTimer: Timer?

    init(props: [String: String], events: ExactNativeEvents) {
        super.init(events: events)
        anchor.isUserInteractionEnabled = false
        anchor.isAccessibilityElement = false
        anchor.moved = { [weak self] in self?.update() }
        try? setProps(props)
    }

    override var view: ExactNativeView { anchor }

    override func setProps(_ props: [String: String]) throws {
        let surface = props["feed"] ?? "", frequency = Double(props["frequency"] ?? "") ?? 50
        guard surface != self.surface || frequency != self.frequency else { return }
        stop()
        self.surface = surface
        self.frequency = max(1, frequency)
        update()
    }

    override func destroy() { stop() }

    deinit {
        MotionFeed.manager.stopDeviceMotionUpdates()
        sweep?.invalidate()
        labelTimer?.invalidate()
    }

    /// Running exactly while the node is in a window: the demo open, on screen.
    private func update() {
        if anchor.window != nil, !surface.isEmpty { start() } else { stop() }
    }

    private func start() {
        guard !running else { return }
        running = true
        let defaults = UserDefaults.standard
        if defaults.bool(forKey: "MotionFeedDebug") { showLabel() }
        let manager = Self.manager
        if manager.isDeviceMotionAvailable {
            manager.deviceMotionUpdateInterval = 1 / frequency
            manager.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: .main) { [weak self] m, _ in
                guard let self, let m else { return }
                self.write([m.gravity.x, m.gravity.y, m.gravity.z])
            }
        } else if defaults.bool(forKey: "MotionFeedSweep") {
            // Pitch swings 15°...85° and roll ±60° (the gravity of a phone so held), every ~6 s.
            let t0 = CACurrentMediaTime()
            sweep = Timer.scheduledTimer(withTimeInterval: 1 / frequency, repeats: true) { [weak self] _ in
                let t = CACurrentMediaTime() - t0
                let pitch = (50 + 35 * sin(t * 1.1)) * .pi / 180, roll = 60 * sin(t * 0.7) * .pi / 180
                self?.write([sin(roll) * cos(pitch), -sin(pitch), -cos(roll) * cos(pitch)])
            }
        }
    }

    private func stop() {
        guard running else { return }
        running = false
        Self.manager.stopDeviceMotionUpdates()
        sweep?.invalidate()
        sweep = nil
        labelTimer?.invalidate()
        labelTimer = nil
        label?.removeFromSuperview()
        label = nil
        guard let module = DemosModule.live else { return }
        module.hatches?.sensor(surface, "gravity", [], dropped: 0, at: module.context.now(), ended: true)
    }

    /// One Core Motion gravity reading (g, face up reads z = -1) into the canvas, in W3C units and sign.
    private func write(_ gravity: [Double]) {
        guard running, let module = DemosModule.live else { return }
        let values = gravity.map { $0 * -Self.g }
        module.hatches?.sensor(surface, "gravity", values, dropped: 0, at: module.context.now(), ended: false)
        count += 1
        last = values
        lastAt = CACurrentMediaTime()
    }

    private func showLabel() {
        let label = UILabel()
        label.numberOfLines = 0
        label.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        label.textColor = .white
        label.isUserInteractionEnabled = false
        label.accessibilityIdentifier = "motion-feed-debug"
        anchor.window?.addSubview(label)
        self.label = label
        labelTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self, let label = self.label, let window = label.window else { return }
            let v = self.last.map { String(format: "%.2f", $0) }.joined(separator: " ")
            let age = self.count == 0 ? "-" : String(format: "%.0f ms", (CACurrentMediaTime() - self.lastAt) * 1000)
            label.text = "gravity \(v)\nsamples \(self.count) · age \(age)"
            label.accessibilityLabel = label.text
            label.frame = CGRect(x: 16, y: window.bounds.height - window.safeAreaInsets.bottom - 44, width: window.bounds.width - 32, height: 36)
        }
    }
}
#endif

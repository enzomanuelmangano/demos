// A launch probe for tools/startup-measure.sh: with `DEMOS_STARTUP_PROBE=1` in the launch environment, every main-thread
// run loop turn that kept the thread busy for 3 ms or more is logged (`[probe] busy 31.2 ms ...`) with the native views the
// turn made. Off otherwise: a plain launch installs nothing.
#if os(iOS)
import Foundation
import QuartzCore

enum StartupProbe {
    private static let on = ProcessInfo.processInfo.environment["DEMOS_STARTUP_PROBE"] == "1"
    nonisolated(unsafe) private static var began = 0.0
    nonisolated(unsafe) private static var made: [String: Int] = [:]
    nonisolated(unsafe) private static var madeMs: [String: Double] = [:]
    nonisolated(unsafe) private static var installed = false

    /// Installs the run loop observer once, on the main thread.
    static func start() {
        guard on, !installed else { return }
        installed = true
        let observer = CFRunLoopObserverCreateWithHandler(nil, CFRunLoopActivity.afterWaiting.rawValue | CFRunLoopActivity.beforeWaiting.rawValue, true, 3_000_000) { _, activity in
            let now = CACurrentMediaTime()
            if activity == .afterWaiting { began = now; return }
            guard began > 0 else { return }
            let ms = (now - began) * 1000
            began = 0
            guard ms >= 3 else { made = [:]; madeMs = [:]; return }
            let views = made.sorted { $0.key < $1.key }.map { "\($0.key) x\($0.value) \(String(format: "%.1f", madeMs[$0.key] ?? 0)) ms" }.joined(separator: ", ")
            made = [:]; madeMs = [:]
            NSLog("[probe] busy %.1f ms at %.0f%@", ms, now * 1000, views.isEmpty ? "" : " | " + views)
        }
        CFRunLoopAddObserver(CFRunLoopGetMain(), observer, .commonModes)
    }

    /// One picture fetch: its wait on another thread's decode, or its own decode.
    static func waited(_ file: String, since began: Double, decoded: Bool) {
        guard on else { return }
        let ms = (CACurrentMediaTime() - began) * 1000
        if ms >= 4 { NSLog("[probe] art %@ %@ %.1f ms on %@", file, decoded ? "decode" : "wait", ms, Thread.isMainThread ? "main" : "worker") }
    }

    /// Times one native view's creation, added to the turn's line.
    @inline(__always) static func made<T>(_ tag: String, _ body: () -> T) -> T {
        guard on else { return body() }
        let t = CACurrentMediaTime()
        let out = body()
        made[tag, default: 0] += 1
        madeMs[tag, default: 0] += (CACurrentMediaTime() - t) * 1000
        return out
    }
}
#endif

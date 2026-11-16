// `still-art`: a picture from the app's bundle that is on screen in the frame its node first shows in.
//
// Exact decodes an `image` node on a worker and puts it on its view later, so the home's wallpaper and
// 109 icons landed one after another over the launch colour. This view takes the pixels from `StillArt`,
// which decodes every icon and the wallpaper on background threads the moment the module loads, in
// parallel with the first plan commit; a view made before its picture is done waits for that one decode,
// never for the rest. It is a first-frame view (`firstFrame`), so it joins the commit that made it.
//
// Props: `art` the file under the bundle's resources (`assets/app-icons/x.png`);
//        `mode` "cover" (default) or "fill".
#if os(iOS)
import UIKit
import QuartzCore

enum StillArt {
    private static let lock = NSCondition()
    private static var done: [String: UIImage] = [:]
    private static var claimed = Set<String>()
    private static var started = false

    /// Every file `warm` decodes: the home's wallpaper, then the icons.
    private static func files() -> [String] {
        var out = ["assets/home-wallpaper.png"]
        let root = (Bundle.main.resourceURL ?? Bundle.main.bundleURL).appendingPathComponent("assets/app-icons")
        let names = (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
        out += names.filter { $0.hasSuffix(".png") && !$0.hasPrefix("_") }.sorted().map { "assets/app-icons/\($0)" }
        return out
    }

    /// Starts the decode of everything on the cores the main thread is not using. Idempotent.
    static func warm() {
        lock.lock()
        let first = !started
        started = true
        lock.unlock()
        guard first else { return }
        let list = files()
        let cores = max(2, min(4, ProcessInfo.processInfo.activeProcessorCount - 1))
        var next = 0
        let turn = NSLock()
        for i in 0..<cores {
            Thread.detachNewThread {
                Thread.current.name = "demos-still-art-\(i)"
                Thread.current.qualityOfService = .userInitiated
                while true {
                    turn.lock()
                    let at = next
                    next += 1
                    turn.unlock()
                    guard at < list.count else { return }
                    autoreleasepool { _ = image(list[at]) }
                }
            }
        }
    }

    /// The decoded picture: from the cache, from another thread's decode in flight (waited for), or decoded here.
    static func image(_ file: String) -> UIImage? {
        let began = CACurrentMediaTime()
        lock.lock()
        while true {
            if let hit = done[file] { lock.unlock(); StartupProbe.waited(file, since: began, decoded: false); return hit }
            if claimed.contains(file) { lock.wait(); continue }
            claimed.insert(file)
            break
        }
        lock.unlock()
        defer { StartupProbe.waited(file, since: began, decoded: true) }
        var made: UIImage?
        for base in [Bundle.main.resourceURL, Bundle.main.bundleURL].compactMap({ $0 }) {
            if let image = UIImage(contentsOfFile: base.appendingPathComponent(file).path) {
                made = image.preparingForDisplay() ?? image
                break
            }
        }
        lock.lock()
        if let made { done[file] = made }
        claimed.remove(file)
        lock.broadcast()
        lock.unlock()
        return made
    }
}

final class StillArtView: UIImageView {
    var file = "" {
        didSet {
            guard file != oldValue else { return }
            image = file.isEmpty ? nil : StillArt.image(file)
        }
    }
    var fit = "cover" {
        didSet { contentMode = fit == "fill" ? .scaleToFill : .scaleAspectFill }
    }

    init() {
        super.init(frame: .zero)
        clipsToBounds = true
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        contentMode = .scaleAspectFill
        // Sized down from 192 px to the icon's own pixels: mipmapped, not aliased on a 2x screen.
        layer.minificationFilter = .trilinear
    }
    required init?(coder: NSCoder) { fatalError() }
}

final class StillArtInstance: ExactNativeInstance {
    private let art = StillArtView()

    init(props: [String: String], events: ExactNativeEvents) {
        super.init(events: events)
        try? setProps(props)
    }

    override var view: ExactNativeView { art }

    override func setProps(_ props: [String: String]) throws {
        art.fit = props["mode"] ?? "cover"
        art.file = props["art"] ?? ""
    }
}
#endif

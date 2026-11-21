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
import Compression
import UIKit
import QuartzCore

/// `assets/art-pack.bin` (tools/gen-art-pack.swift): the wallpaper and the icons as LZ4 raw pixels. Reading an entry
/// never touches ImageIO, whose first PNG decode in a process costs ~35 ms of the home's first commit.
private enum ArtPack {
    struct Entry { let w, h, offset, size, raw: Int; let gray: Bool; let space: String }
    static let shared: (data: Data, base: Int, entries: [String: Entry])? = load()

    private static func load() -> (data: Data, base: Int, entries: [String: Entry])? {
        guard let url = (Bundle.main.resourceURL ?? Bundle.main.bundleURL).appendingPathComponent("assets/art-pack.bin") as URL?,
              let data = try? Data(contentsOf: url, options: .alwaysMapped), data.count > 8, data.prefix(4) == Data("ART1".utf8) else { return nil }
        let length = Int(data.subdata(in: 4..<8).withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }.littleEndian)
        guard 8 + length <= data.count,
              let list = (try? JSONSerialization.jsonObject(with: data.subdata(in: 8..<(8 + length)))) as? [[String: Any]] else { return nil }
        var entries: [String: Entry] = [:]
        for e in list {
            guard let file = e["file"] as? String, let w = e["w"] as? Int, let h = e["h"] as? Int, let offset = e["offset"] as? Int,
                  let size = e["size"] as? Int, let raw = e["raw"] as? Int, let kind = e["kind"] as? String, let space = e["space"] as? String else { continue }
            entries[file] = Entry(w: w, h: h, offset: offset, size: size, raw: raw, gray: kind == "gray", space: space)
        }
        return (data, 8 + length, entries)
    }

    /// The files the pack holds, in its order (the home's).
    static var files: [String] {
        guard let pack = shared else { return [] }
        return pack.entries.sorted { $0.value.offset < $1.value.offset }.map { $0.key }
    }

    static func image(_ file: String) -> UIImage? {
        guard let pack = shared, let e = pack.entries[file], let pixels = malloc(e.raw) else { return nil }
        let end = pack.base + e.offset + e.size
        guard end <= pack.data.count else { free(pixels); return nil }
        let got = pack.data.withUnsafeBytes { buf in
            compression_decode_buffer(pixels.assumingMemoryBound(to: UInt8.self), e.raw, buf.baseAddress!.assumingMemoryBound(to: UInt8.self) + pack.base + e.offset, e.size, nil, COMPRESSION_LZ4)
        }
        guard got == e.raw,
              let provider = CGDataProvider(dataInfo: nil, data: pixels, size: e.raw, releaseData: { _, p, _ in free(UnsafeMutableRawPointer(mutating: p)) }) else { free(pixels); return nil }
        let space = CGColorSpace(name: e.space as CFString) ?? (e.gray ? CGColorSpaceCreateDeviceGray() : CGColorSpace(name: CGColorSpace.sRGB)!)
        let info = e.gray ? CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue)
            : CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        guard let image = CGImage(width: e.w, height: e.h, bitsPerComponent: 8, bitsPerPixel: e.gray ? 8 : 32, bytesPerRow: e.gray ? e.w : e.w * 4,
                                  space: space, bitmapInfo: info, provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent) else { return nil }
        return UIImage(cgImage: image, scale: 1, orientation: .up)
    }
}

enum StillArt {
    private static let lock = NSCondition()
    private static var done: [String: UIImage] = [:]
    private static var claimed = Set<String>()
    private static var started = false

    /// Every file `warm` decodes: the home's wallpaper, then the icons.
    private static func files() -> [String] {
        var out = ["assets/home-wallpaper.png"]
        let packed = ArtPack.files
        if !packed.isEmpty { return packed }
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
        var made = ArtPack.image(file)
        if made == nil {
            for base in [Bundle.main.resourceURL, Bundle.main.bundleURL].compactMap({ $0 }) {
                if let image = UIImage(contentsOfFile: base.appendingPathComponent(file).path) {
                    made = image.preparingForDisplay() ?? image
                    break
                }
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

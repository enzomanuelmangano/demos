// Feedback from the phone, in any open demo: shake, or long-press with two fingers, to open a sheet
// with the demo's name and slug, a screenshot taken at the trigger (tap it to mark a point), a note
// and quick commands. Each command is one `POST /phone` to the Mac's feedback server, which appends
// it to inbox.jsonl. The Mac is found by the launch argument `-feedbackHost <ip[:port]>`, else by
// `feedback-host/mac.json` in the bundle. Requests are raw HTTP/1.1 over Network.framework so App
// Transport Security never refuses a cleartext LAN IP; an undelivered command stays queued on disk
// and is retried every 20 s and on the next trigger, until the server answers 2xx.
import Foundation
#if os(iOS)
import AVFoundation
import Network
import ReplayKit
import SwiftUI
import UIKit

enum PhoneFeedback {
    static weak var card: DemoCardView?
    private static var presses: Set<ObjectIdentifier> = []
    private static var open = false
    static var recording = false

    static func attach(_ card: DemoCardView) {
        installShake()
        self.card = card
        guard let window = card.window, !presses.contains(ObjectIdentifier(window)) else { return }
        presses.insert(ObjectIdentifier(window))
        let press = UILongPressGestureRecognizer(target: Trigger.shared, action: #selector(Trigger.pressed(_:)))
        press.numberOfTouchesRequired = 2
        press.minimumPressDuration = 0.6
        press.cancelsTouchesInView = false
        press.delaysTouchesBegan = false
        press.delegate = Trigger.shared
        window.addGestureRecognizer(press)
        FeedbackQueue.shared.flush()
    }

    private static func installShake() {
        struct Once { static let done: Void = {
            let cls = UIApplication.self
            guard let original = class_getInstanceMethod(cls, #selector(UIApplication.sendEvent(_:))),
                  let wrapped = class_getInstanceMethod(cls, #selector(UIApplication.demosFeedbackSendEvent(_:))) else { return }
            method_exchangeImplementations(original, wrapped)
        }() }
        _ = Once.done
    }

    static func trigger() {
        guard !open, !recording, let card, card.window != nil, let window = card.window else { return }
        let slug = card.slug.isEmpty ? (LaunchSession.current?.slug ?? "") : card.slug
        guard !slug.isEmpty, var top = window.rootViewController else { return }
        while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
        let shot = snapshot(window)
        open = true
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        let model = SheetModel(slug: slug, name: card.name.isEmpty ? slug : card.name, shot: shot)
        let host = UIHostingController(rootView: FeedbackSheet(model: model))
        model.close = { [weak host] in host?.dismiss(animated: true) }
        host.modalPresentationStyle = .pageSheet
        host.presentationController?.delegate = Trigger.shared
        if let sheet = host.sheetPresentationController {
            sheet.detents = [.medium(), .large()]
            sheet.prefersGrabberVisible = true
        }
        top.present(host, animated: true)
        FeedbackQueue.shared.flush()
        FeedbackQueue.shared.recent(slug) { model.recent = $0 }
    }

    static func closed() { open = false }

    static func snapshot(_ window: UIWindow) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        return UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: false)
        }
    }

    static func record(slug: String, name: String) {
        guard !recording else { return }
        recording = true
        let recorder = ClipRecorder()
        recorder.start { started in
            guard started else { recording = false; return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                recorder.stop { data in
                    recording = false
                    UINotificationFeedbackGenerator().notificationOccurred(data == nil ? .error : .success)
                    guard let data else { return }
                    FeedbackQueue.shared.send(kind: "clip", slug: slug, name: name, clip: data)
                }
            }
        }
    }
}

extension UIApplication {
    @objc func demosFeedbackSendEvent(_ event: UIEvent) {
        demosFeedbackSendEvent(event)
        if event.type == .motion, event.subtype == .motionShake { PhoneFeedback.trigger() }
    }
}

private final class Trigger: NSObject, UIGestureRecognizerDelegate, UIAdaptivePresentationControllerDelegate {
    static let shared = Trigger()
    @objc func pressed(_ g: UILongPressGestureRecognizer) {
        if g.state == .began { PhoneFeedback.trigger() }
    }
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
    func presentationControllerDidDismiss(_ p: UIPresentationController) { PhoneFeedback.closed() }
}

// MARK: - The sheet

struct RecentNote: Identifiable { let id: String; let n: Int; let comment: String; let status: String }

final class SheetModel: ObservableObject {
    let slug: String, name: String, shot: UIImage
    let architecture: DemoArchitecture?
    @Published var point: CGPoint?
    @Published var text = ""
    @Published var recent: [RecentNote] = []
    var close: () -> Void = {}
    init(slug: String, name: String, shot: UIImage) { self.slug = slug; self.name = name; self.shot = shot; architecture = DemoArchitecture.bySlug[slug] }

    func send(_ kind: String, image: Bool = true) {
        FeedbackQueue.shared.send(kind: kind, slug: slug, name: name, text: kind == "note" ? text : "",
                                  point: point, image: image ? shot : nil)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        dismiss()
    }

    func dismiss() { close(); PhoneFeedback.closed() }
}

private struct FeedbackSheet: View {
    @ObservedObject var model: SheetModel
    @FocusState private var typing: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.name).font(.headline)
                        Text(model.slug).font(.caption.monospaced()).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Cancel") { model.dismiss() }
                }
                HStack(alignment: .top, spacing: 12) {
                    shot
                    VStack(spacing: 8) {
                        command("📸 Screenshot") { model.send("screenshot") }
                        command("🎬 Record 5 s") {
                            let slug = model.slug, name = model.name
                            model.dismiss()
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { PhoneFeedback.record(slug: slug, name: name) }
                        }
                        command("🔁 Same as RN?") { model.send("parity") }
                        command("✅ Looks good") { model.send("approve", image: false) }
                    }
                }
                if let architecture = model.architecture { ArchitectureCard(architecture: architecture) }
                TextField("What's off? (dictation works)", text: $model.text, axis: .vertical)
                    .lineLimit(2...6)
                    .textFieldStyle(.roundedBorder)
                    .keyboardType(.default)
                    .focused($typing)
                Button { model.send("note") } label: { Text("Send").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                if !model.recent.isEmpty {
                    Text("Already reported").font(.subheadline.weight(.semibold)).padding(.top, 4)
                    ForEach(model.recent) { note in
                        HStack(alignment: .firstTextBaseline) {
                            Text("#\(note.n)").font(.caption.monospaced()).foregroundStyle(.secondary)
                            Text(note.comment).font(.footnote).lineLimit(2)
                            Spacer()
                            Text(note.status == "open" ? "open" : "fixed").font(.caption2.weight(.semibold))
                                .foregroundStyle(note.status == "open" ? .orange : .green)
                        }
                    }
                }
                let queued = FeedbackQueue.shared.pending
                if queued > 0 {
                    Text("\(queued) waiting for the Mac, retrying").font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(20)
        }
    }

    private var shot: some View {
        Image(uiImage: model.shot).resizable().scaledToFit()
            .frame(height: 190)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(GeometryReader { geo in
                ZStack {
                    Color.clear.contentShape(Rectangle())
                        .onTapGesture(coordinateSpace: .local) { at in
                            model.point = CGPoint(x: at.x / geo.size.width, y: at.y / geo.size.height)
                        }
                    if let p = model.point {
                        Circle().stroke(Color.red, lineWidth: 3).frame(width: 16, height: 16)
                            .position(x: p.x * geo.size.width, y: p.y * geo.size.height)
                            .allowsHitTesting(false)
                    }
                }
            })
            .accessibilityLabel("Screenshot: tap to mark a point")
    }

    private func command(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Text(title).font(.subheadline).frame(maxWidth: .infinity, alignment: .leading) }
            .buttonStyle(.bordered)
    }
}

// MARK: - How it's built

/// Contract -> Rust -> Native, each layer with the number that says how much of the demo it carries.
/// Static: the facts are a dictionary lookup (Architecture.generated.swift), nothing is computed here.
private struct ArchitectureCard: View {
    let architecture: DemoArchitecture

    var body: some View {
        let a = architecture
        let views = a.nativeViews + a.systemAPIs
        VStack(alignment: .leading, spacing: 8) {
            Text("How it's built").font(.subheadline.weight(.semibold))
            HStack(spacing: 4) {
                LayerTile(symbol: "doc.text", title: "Contract", role: "UI, state and gestures", tint: .blue,
                          count: a.contractLines, unit: "lines",
                          details: ["\(a.contractComponents) component\(a.contractComponents == 1 ? "" : "s")"]
                              + (a.contractActions > 0 ? ["\(a.contractActions) action\(a.contractActions == 1 ? "" : "s")"] : [])
                              + (a.contractDerives > 0 ? ["\(a.contractDerives) derive\(a.contractDerives == 1 ? "" : "s")"] : []))
                arrow
                LayerTile(symbol: "cpu", title: "Rust", role: "Per-frame GPU drawing", tint: .orange,
                          count: a.rustFiles.isEmpty ? nil : a.rustLines, unit: "lines",
                          details: (a.rustFiles.count > 1 ? ["\(a.rustFiles.count) files"] : [])
                              + (a.shaders.isEmpty ? [] : ["\(a.shaders.count) shader\(a.shaders.count == 1 ? "" : "s")"])
                              + (a.hostHaptics ? ["haptics"] : []))
                arrow
                LayerTile(symbol: "iphone", title: "Native", role: "Swift views and system APIs", tint: .green,
                          count: views.isEmpty ? nil : views.count, unit: views.count == 1 ? "piece" : "pieces",
                          details: Array(views.prefix(3)) + (views.count > 3 ? ["+\(views.count - 3) more"] : []))
            }
            .fixedSize(horizontal: false, vertical: true)
            Text(a.summary).font(.footnote).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private var arrow: some View {
        Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(.tertiary)
            .accessibilityHidden(true)
    }
}

private struct LayerTile: View {
    let symbol: String, title: String, role: String
    let tint: Color
    /// nil: the demo does not use this layer.
    let count: Int?
    let unit: String
    let details: [String]

    var body: some View {
        VStack(spacing: 2) {
            Image(systemName: symbol).font(.title3.weight(.semibold)).foregroundStyle(count == nil ? Color.secondary : tint)
                .padding(.bottom, 2)
            Text(title).font(.caption.weight(.bold))
            if let count {
                Text(grouped(count)).font(.system(.title3, design: .rounded).weight(.bold)).monospacedDigit()
                Text(unit).font(.caption2).foregroundStyle(.secondary)
            } else {
                Text("not used").font(.footnote.weight(.medium)).foregroundStyle(.secondary)
                Text(" ").font(.caption2)
            }
            Text(role).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true).padding(.top, 2)
            if count != nil {
                ForEach(details, id: \.self) { Text($0).font(.caption2.weight(.medium)).lineLimit(1).minimumScaleFactor(0.8) }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 6).padding(.vertical, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .opacity(count == nil ? 0.5 : 1)
    }

    private func grouped(_ n: Int) -> String {
        var out = "", digits = String(n)
        while digits.count > 3 { out = "," + digits.suffix(3) + out; digits.removeLast(3) }
        return digits + out
    }
}

// MARK: - The clip

private final class ClipRecorder {
    private let q = DispatchQueue(label: "exact.feedback.clip")
    private var writer: AVAssetWriter?
    private var input: AVAssetWriterInput?
    private var startedSession = false
    private let url = FileManager.default.temporaryDirectory.appendingPathComponent("feedback-\(UUID().uuidString).mp4")

    func start(_ done: @escaping (Bool) -> Void) {
        let screen = UIScreen.main.bounds.size
        let w = 540, h = Int((Double(w) * screen.height / screen.width / 2).rounded()) * 2
        do {
            let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
            let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: w, AVVideoHeightKey: h,
                AVVideoScalingModeKey: AVVideoScalingModeResizeAspect,
                AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 1_500_000],
            ])
            input.expectsMediaDataInRealTime = true
            writer.add(input)
            self.writer = writer; self.input = input
        } catch { done(false); return }
        RPScreenRecorder.shared().isMicrophoneEnabled = false
        RPScreenRecorder.shared().startCapture(handler: { [weak self] sample, type, _ in
            guard type == .video, let self else { return }
            self.q.async {
                guard let writer = self.writer, let input = self.input, CMSampleBufferDataIsReady(sample) else { return }
                if !self.startedSession {
                    guard writer.startWriting() else { return }
                    writer.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(sample))
                    self.startedSession = true
                }
                if input.isReadyForMoreMediaData { input.append(sample) }
            }
        }, completionHandler: { error in DispatchQueue.main.async { done(error == nil) } })
    }

    func stop(_ done: @escaping (Data?) -> Void) {
        RPScreenRecorder.shared().stopCapture { _ in
            self.q.async {
                guard let writer = self.writer, self.startedSession else { DispatchQueue.main.async { done(nil) }; return }
                self.input?.markAsFinished()
                writer.finishWriting {
                    let data = try? Data(contentsOf: self.url)
                    try? FileManager.default.removeItem(at: self.url)
                    DispatchQueue.main.async { done(data) }
                }
            }
        }
    }
}

// MARK: - Delivery

final class FeedbackQueue {
    static let shared = FeedbackQueue()
    private let dir: URL
    private var flushing = false
    private var retry: Timer?
    private var good: (String, UInt16)?

    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        dir = base.appendingPathComponent("exact-feedback", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    var pending: Int { files().count }

    private func files() -> [URL] {
        ((try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [])
            .filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    private func hosts() -> [(String, UInt16)] {
        var out: [(String, UInt16)] = []
        if let good { out.append(good) }
        if let arg = UserDefaults.standard.string(forKey: "feedbackHost"), !arg.isEmpty {
            let parts = arg.split(separator: ":")
            out.append((String(parts[0]), parts.count > 1 ? UInt16(parts[1]) ?? 5350 : 5350))
        }
        let root = Bundle.main.bundleURL
        for path in ["ExactResources/Resources/feedback-host/mac.json", "ExactResources/feedback-host/mac.json"] {
            guard let data = try? Data(contentsOf: root.appendingPathComponent(path)),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
            let port = UInt16(obj["port"] as? Int ?? 5350)
            for h in obj["hosts"] as? [String] ?? [] { out.append((h, port)) }
            break
        }
        #if targetEnvironment(simulator)
        out.append(("127.0.0.1", 5350))
        #endif
        return out
    }

    func send(kind: String, slug: String, name: String, text: String = "", point: CGPoint? = nil,
              image: UIImage? = nil, clip: Data? = nil) {
        let at = ISO8601DateFormatter().string(from: Date())
        let id = "\(String(Int(Date().timeIntervalSince1970 * 1000), radix: 36))-\(UUID().uuidString.prefix(6).lowercased())"
        var body: [String: Any] = ["id": id, "kind": kind, "slug": slug, "name": name, "text": text, "at": at,
                                   "point": point.map { ["x": $0.x, "y": $0.y] } ?? NSNull(),
                                   "device": Self.device, "build": Self.build]
        if let jpeg = image?.jpegData(compressionQuality: 0.7) { body["image"] = jpeg.base64EncodedString() }
        if let clip, clip.count <= 12 << 20 { body["clip"] = clip.base64EncodedString() }
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return }
        try? data.write(to: dir.appendingPathComponent("\(id).json"), options: .atomic)
        flush()
    }

    func flush() {
        DispatchQueue.main.async { [self] in
            guard !flushing, let next = files().first, let body = try? Data(contentsOf: next) else { return }
            flushing = true
            request("POST", "/phone", body, hosts()) { [self] status, _ in
                flushing = false
                if let status, (200..<300).contains(status) || status == 400 {
                    // 400 is a body the server will never take: dropping it keeps the rest moving.
                    try? FileManager.default.removeItem(at: next)
                    flush()
                } else {
                    scheduleRetry()
                }
            }
        }
    }

    private func scheduleRetry() {
        guard retry == nil else { return }
        retry = Timer.scheduledTimer(withTimeInterval: 20, repeats: false) { [weak self] _ in
            self?.retry = nil
            self?.flush()
        }
    }

    func recent(_ slug: String, _ done: @escaping ([RecentNote]) -> Void) {
        request("GET", "/notes?slug=\(slug)", nil, hosts()) { status, data in
            guard status == 200, let data, let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let notes = obj["notes"] as? [[String: Any]] else { return }
            let last = notes.suffix(3).reversed().map {
                RecentNote(id: $0["id"] as? String ?? UUID().uuidString, n: $0["n"] as? Int ?? 0,
                           comment: $0["comment"] as? String ?? "", status: $0["status"] as? String ?? "open")
            }
            DispatchQueue.main.async { done(Array(last)) }
        }
    }

    private func request(_ method: String, _ path: String, _ body: Data?, _ hosts: [(String, UInt16)],
                         _ done: @escaping (Int?, Data?) -> Void) {
        guard let (host, port) = hosts.first else { DispatchQueue.main.async { done(nil, nil) }; return }
        HTTPCall.run(host: host, port: port, method: method, path: path, body: body) { [self] status, data in
            DispatchQueue.main.async { [self] in
                if status != nil { good = (host, port); done(status, data) }
                else { request(method, path, body, Array(hosts.dropFirst()), done) }
            }
        }
    }

    static let device: [String: String] = {
        var u = utsname(); uname(&u)
        let machine = withUnsafeBytes(of: &u.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
        return ["model": UIDevice.current.model, "machine": machine, "system": "iOS \(UIDevice.current.systemVersion)",
                "name": UIDevice.current.name]
    }()

    static let build: [String: String] = {
        let info = Bundle.main.infoDictionary ?? [:]
        return ["bundle": Bundle.main.bundleIdentifier ?? "", "version": info["CFBundleShortVersionString"] as? String ?? "",
                "build": info["CFBundleVersion"] as? String ?? ""]
    }()
}

/// HTTP/1.1 over a plain TCP connection, `Connection: close`, 10 s at most.
private final class HTTPCall {
    private static var calls: [ObjectIdentifier: HTTPCall] = [:]
    private let conn: NWConnection
    private var buffer = Data()
    private var done: ((Int?, Data?) -> Void)?
    private let q = DispatchQueue(label: "exact.feedback.http")

    static func run(host: String, port: UInt16, method: String, path: String, body: Data?, done: @escaping (Int?, Data?) -> Void) {
        guard let p = NWEndpoint.Port(rawValue: port) else { done(nil, nil); return }
        let call = HTTPCall(conn: NWConnection(host: NWEndpoint.Host(host), port: p, using: .tcp), done: done)
        DispatchQueue.main.async { calls[ObjectIdentifier(call)] = call }
        call.start(host: host, port: port, method: method, path: path, body: body)
    }

    private init(conn: NWConnection, done: @escaping (Int?, Data?) -> Void) { self.conn = conn; self.done = done }

    private func start(host: String, port: UInt16, method: String, path: String, body: Data?) {
        var head = "\(method) \(path) HTTP/1.1\r\nHost: \(host):\(port)\r\nConnection: close\r\n"
        if let body { head += "Content-Type: application/json\r\nContent-Length: \(body.count)\r\n" }
        var request = Data((head + "\r\n").utf8)
        if let body { request.append(body) }
        conn.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                self.conn.send(content: request, completion: .contentProcessed { error in
                    if error != nil { self.finish(nil) } else { self.receive() }
                })
            case .failed, .cancelled: self.finish(nil)
            default: break
            }
        }
        conn.start(queue: q)
        q.asyncAfter(deadline: .now() + 10) { [weak self] in self?.finish(nil) }
    }

    private func receive() {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 1 << 16) { [weak self] data, _, complete, error in
            guard let self else { return }
            if let data { self.buffer.append(data) }
            if let parsed = self.parse(final: complete || error != nil) { self.finish(parsed.0, parsed.1) }
            else if complete || error != nil { self.finish(nil) }
            else { self.receive() }
        }
    }

    private func parse(final: Bool) -> (Int, Data)? {
        guard let end = buffer.range(of: Data("\r\n\r\n".utf8)) else { return nil }
        let head = String(decoding: buffer[..<end.lowerBound], as: UTF8.self)
        let lines = head.components(separatedBy: "\r\n")
        guard let status = lines.first?.split(separator: " ").dropFirst().first.flatMap({ Int($0) }) else { return nil }
        let body = buffer[end.upperBound...]
        let length = lines.first { $0.lowercased().hasPrefix("content-length:") }
            .flatMap { Int($0.split(separator: ":")[1].trimmingCharacters(in: .whitespaces)) }
        if let length, body.count >= length { return (status, Data(body.prefix(length))) }
        return final ? (status, Data(body)) : nil
    }

    private func finish(_ status: Int?, _ data: Data? = nil) {
        guard let done else { return }
        self.done = nil
        conn.cancel()
        done(status, data)
        let id = ObjectIdentifier(self)
        DispatchQueue.main.async { HTTPCall.calls[id] = nil }
    }
}
#endif

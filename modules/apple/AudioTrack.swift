// `audio-track`: an invisible native view that plays a bundled audio file with AVAudioPlayer.
// While it plays the audio session is `.playback`; the previous session is restored afterwards.
//
// Props (all text):
//   file        path relative to the app bundle; default "assets/audio/track.m4a"
//   play-state  "true" plays, anything else pauses (`playing` is read as a fallback)
//   seek        "<token>:<seconds>": a new token moves the playhead
// Messages (events.message), each "<kind>:<value>":
//   ready:<seconds>   the file's length, once loaded
//   missing:<file>    no such file in the bundle
//   wave:<50 levels>  loudness in 50 equal slices (RMS, normalised to the loudest, 0...1, comma-separated)
//   time:<seconds>    the player's clock, every 0.5 s while playing
//   ended:            reached the end
//   paused:           the system paused it (call, Siri, headphones unplugged)
#if os(iOS)
import AVFoundation
import UIKit

final class AudioTrack: ExactNativeInstance {
    static let defaultFile = "assets/audio/track.m4a"
    static let slices = 50

    private let box = AudioTrackView()
    private let relay = AudioTrackRelay()
    private var player: AVAudioPlayer?
    private var file = ""
    private var wantsPlay = false
    private var seekToken: String?
    private var ticker: Timer?
    /// Serialises session changes off the main thread.
    private static let sessionQueue = DispatchQueue(label: "audio-track.session", qos: .userInitiated)
    private var starting = false
    private var savedSession: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?
    private var observers: [NSObjectProtocol] = []

    init(props: [String: String], events: ExactNativeEvents) {
        super.init(events: events)
        box.isHidden = true
        box.isUserInteractionEnabled = false
        box.attached = { [weak self] inWindow in
            guard let self else { return }
            if inWindow { self.apply() } else { self.halt() }
        }
        relay.finished = { [weak self] in
            guard let self else { return }
            self.stopTicker()
            self.restoreSession()
            self.send("ended:")
        }
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let self,
                  let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: raw) == .began,
                  self.wantsPlay else { return }
            self.systemPaused()
        })
        observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            guard let self,
                  let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable,
                  self.wantsPlay else { return }
            self.systemPaused()
        })
        try? setProps(props)
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
        ticker?.invalidate()
        player?.stop()
        if let (category, mode, options) = savedSession {
            try? AVAudioSession.sharedInstance().setCategory(category, mode: mode, options: options)
        }
    }

    override var view: ExactNativeView { box }

    override func destroy() {
        wantsPlay = false
        box.attached = nil
        halt()
        player?.stop()
    }

    override func setProps(_ props: [String: String]) throws {
        let next = props["file"].flatMap { $0.isEmpty ? nil : $0 } ?? Self.defaultFile
        if next != file {
            file = next
            load()
        }
        if let seek = props["seek"], let colon = seek.firstIndex(of: ":") {
            let token = String(seek[..<colon])
            if token != seekToken {
                seekToken = token
                if let seconds = Double(seek[seek.index(after: colon)...]), seconds.isFinite, let player {
                    player.currentTime = min(max(seconds, 0), player.duration)
                }
            }
        }
        wantsPlay = (props["play-state"] ?? props["playing"]) == "true"
        apply()
    }

    // MARK: - Playback

    private func load() {
        player?.stop()
        player = nil
        guard let url = Self.locate(file) else {
            send("missing:\(file)")
            return
        }
        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.delegate = relay
            player.prepareToPlay()
            self.player = player
            send("ready:\(player.duration)")
        } catch {
            send("missing:\(file)")
            return
        }
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let levels = Self.levels(url, slices: Self.slices) else { return }
            let text = levels.map { String(format: "%.3f", $0) }.joined(separator: ",")
            DispatchQueue.main.async { self?.send("wave:\(text)") }
        }
    }

    static func locate(_ file: String) -> URL? {
        let manager = FileManager.default
        for base in [Bundle.main.resourceURL, Bundle.main.bundleURL].compactMap({ $0 }) {
            let url = base.appendingPathComponent(file)
            if manager.fileExists(atPath: url.path) { return url }
        }
        let name = (file as NSString).lastPathComponent
        return Bundle.main.url(forResource: (name as NSString).deletingPathExtension,
                               withExtension: (name as NSString).pathExtension)
    }

    private func apply() {
        guard let player else { return }
        if wantsPlay && box.window != nil {
            guard !player.isPlaying, !starting else { return }
            // Activating the session blocks for tens of ms, so it runs off the main thread.
            starting = true
            takeSession { [weak self] in
                guard let self else { return }
                self.starting = false
                guard self.wantsPlay, self.box.window != nil, let player = self.player, !player.isPlaying else {
                    if !self.wantsPlay { self.restoreSession() }
                    return
                }
                if player.currentTime >= player.duration - 0.05 { player.currentTime = 0 }
                player.play()
                self.startTicker()
            }
        } else {
            halt()
        }
    }

    private func halt() {
        if player?.isPlaying == true { player?.pause() }
        stopTicker()
        restoreSession()
    }

    private func systemPaused() {
        wantsPlay = false
        halt()
        send("paused:")
    }

    private func startTicker() {
        stopTicker()
        let ticker = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self, let player = self.player, player.isPlaying else { return }
            self.send("time:\(player.currentTime)")
        }
        RunLoop.main.add(ticker, forMode: .common)
        self.ticker = ticker
    }

    private func stopTicker() {
        ticker?.invalidate()
        ticker = nil
    }

    // MARK: - The session

    private func takeSession(then: @escaping () -> Void) {
        let session = AVAudioSession.sharedInstance()
        if savedSession == nil {
            savedSession = (session.category, session.mode, session.categoryOptions)
        }
        Self.sessionQueue.async {
            try? session.setCategory(.playback, mode: .default, options: [])
            try? session.setActive(true)
            DispatchQueue.main.async(execute: then)
        }
    }

    private func restoreSession() {
        guard let (category, mode, options) = savedSession else { return }
        savedSession = nil
        let session = AVAudioSession.sharedInstance()
        Self.sessionQueue.async {
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            try? session.setCategory(category, mode: mode, options: options)
        }
    }

    private func send(_ text: String) {
        let events = self.events
        if Thread.isMainThread { events.message(text) } else { DispatchQueue.main.async { events.message(text) } }
    }

    // MARK: - The waveform

    static func levels(_ url: URL, slices: Int) -> [Double]? {
        guard let file = try? AVAudioFile(forReading: url) else { return nil }
        let total = file.length
        guard total > 0, slices > 0 else { return nil }
        let format = file.processingFormat
        let chunk: AVAudioFrameCount = 1 << 16
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: chunk) else { return nil }
        var sums = [Double](repeating: 0, count: slices)
        var counts = [Double](repeating: 0, count: slices)
        var frame: AVAudioFramePosition = 0
        while frame < total {
            do { try file.read(into: buffer, frameCount: chunk) } catch { break }
            let n = Int(buffer.frameLength)
            guard n > 0, let channel = buffer.floatChannelData?[0] else { break }
            for i in 0..<n {
                let slice = min(Int((frame + AVAudioFramePosition(i)) * AVAudioFramePosition(slices) / total), slices - 1)
                let v = Double(channel[i])
                sums[slice] += v * v
                counts[slice] += 1
            }
            frame += AVAudioFramePosition(n)
        }
        let rms = zip(sums, counts).map { $1 > 0 ? ($0 / $1).squareRoot() : 0 }
        guard let loudest = rms.max(), loudest > 0 else { return nil }
        return rms.map { $0 / loudest }
    }
}

/// AVAudioPlayer's delegate; needs an NSObject, which ExactNativeInstance is not.
private final class AudioTrackRelay: NSObject, AVAudioPlayerDelegate {
    var finished: (() -> Void)?
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async { self.finished?() }
    }
}

/// Invisible view that reports when it joins or leaves a window.
final class AudioTrackView: UIView {
    var attached: ((Bool) -> Void)?
    override func didMoveToWindow() {
        super.didMoveToWindow()
        attached?(window != nil)
    }
}
#endif

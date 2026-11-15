// `audio-track`: the audio-player demo's real playback (demos/audio-player/audio-player.contract),
// the owner's phone note: "musica vera … con config per pausa, play". An invisible view: an
// AVAudioPlayer on a bundled file, the audio session `.playback` while it plays (so the ring /
// silent switch does not mute it), the previous session put back when it pauses, ends or
// unmounts (other demos' sounds stay "ambient").
//
// Props (all text):
//   file     the file, relative to the app bundle; default "assets/audio/track.m4a" (the app's
//            assets/ tree is copied into the bundle as `assets/`)
//   play-state  "true" plays, anything else pauses (Contract refuses `playing` on a native tag:
//               it is a known event; `playing` is still read for an old contract)
//   seek     "<token>:<seconds>": a new token moves the playhead there (the waveform's scrub
//            release and the ±15 s buttons, through the surface's "seek:<s>")
// Messages (events.message), each a "<kind>:<value>":
//   "ready:<seconds>"   the file's length, once loaded
//   "missing:<file>"    no such file in the bundle (the demo still plays its UI, silently)
//   "wave:<50 levels>"  the file's loudness in 50 equal slices (RMS, normalised to the loudest,
//                       comma-separated 0…1, three decimals), measured off the main thread
//   "time:<seconds>"    the player's own clock, every 0.5 s while it plays
//   "ended:"            it reached the end
//   "paused:"           the system paused it (a call, Siri, headphones unplugged)
// The surface (gpu/src/audio_player.rs, card mode) runs the playhead on its own clock and takes
// "time:" only to correct a drift.
#if os(iOS)
import AVFoundation
import UIKit

final class AudioTrack: ExactNativeInstance {
    static let defaultFile = "assets/audio/track.m4a"
    /// Slices of the waveform (the surface's N).
    static let slices = 50

    private let box = AudioTrackView()
    private let relay = AudioTrackRelay()
    private var player: AVAudioPlayer?
    private var file = ""
    private var wantsPlay = false
    private var seekToken: String?
    private var ticker: Timer?
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

    /// The host's last call (the demo closed): silence, and the session as it was.
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

    /// The file in the bundle: under its resources (iOS keeps them at the bundle's root), or
    /// by name anywhere `Bundle` looks.
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

    /// Plays or pauses as asked, while the view is on screen.
    private func apply() {
        guard let player else { return }
        if wantsPlay && box.window != nil {
            guard !player.isPlaying else { return }
            takeSession()
            if player.currentTime >= player.duration - 0.05 { player.currentTime = 0 }
            player.play()
            startTicker()
        } else {
            halt()
        }
    }

    /// Pauses without telling the Contract (it asked, or the view left the screen).
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

    /// `.playback` while it plays: heard with the silent switch on, other audio paused.
    private func takeSession() {
        let session = AVAudioSession.sharedInstance()
        if savedSession == nil {
            savedSession = (session.category, session.mode, session.categoryOptions)
        }
        try? session.setCategory(.playback, mode: .default, options: [])
        try? session.setActive(true)
    }

    /// The session as it was, and other apps' audio told it may resume.
    private func restoreSession() {
        guard let (category, mode, options) = savedSession else { return }
        savedSession = nil
        let session = AVAudioSession.sharedInstance()
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
        try? session.setCategory(category, mode: mode, options: options)
    }

    private func send(_ text: String) {
        let events = self.events
        if Thread.isMainThread { events.message(text) } else { DispatchQueue.main.async { events.message(text) } }
    }

    // MARK: - The waveform

    /// The RMS of each of `slices` equal parts of the file's first channel, over the loudest.
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

/// The player's delegate (an NSObject, which an ExactNativeInstance is not).
private final class AudioTrackRelay: NSObject, AVAudioPlayerDelegate {
    var finished: (() -> Void)?
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async { self.finished?() }
    }
}

/// The instance's view: invisible, it only says when it joins or leaves a window.
final class AudioTrackView: UIView {
    var attached: ((Bool) -> Void)?
    override func didMoveToWindow() {
        super.didMoveToWindow()
        attached?(window != nil)
    }
}
#endif

import UIKit

/// A disc under each finger, so a screen recording carries the input and not
/// only its result. A page turns and there is otherwise no way to tell whether
/// it was tapped, flicked or dragged.
///
/// ONE disc, and nothing else. Two other shapes were built and both were
/// worse. A comet trail — a
/// fading copy dropped every few points of travel — is motion blur on paper and
/// a swarm on screen: a dozen discs at once reads as a dozen things, not as one
/// thing moving fast. A sharp core inside a soft halo is prettier in a still
/// and busier in motion, which is the wrong trade for something that exists to
/// be watched at speed.
enum TouchIndicator {
  /// Diameter of the disc at rest, in points.
  private static let discSize: CGFloat = 42
  /// How long the disc takes to fade once the finger lifts.
  private static let liftDuration: CFTimeInterval = 0.18
  /// Speed, in points per second, at which the disc reaches its full stretch.
  private static let fullStretchSpeed: CGFloat = 2600
  /// How long the disc gets at that speed, as a multiple of its width.
  private static let maxStretch: CGFloat = 1.9

  /// What one finger needs remembered between events: its disc, and where it
  /// was and when — so velocity is measured rather than guessed.
  private final class Live {
    let disc: CALayer
    var last: CGPoint
    var lastTime: TimeInterval

    init(disc: CALayer, at point: CGPoint, time: TimeInterval) {
      self.disc = disc
      self.last = point
      self.lastTime = time
    }
  }

  /// Keyed by the UITouch, held WEAKLY: UIKit recycles a UITouch between
  /// gestures, so holding one would both leak and hand back a stale object on
  /// the next press.
  private static let live = NSMapTable<UITouch, Live>.weakToStrongObjects()
  private static var overlay: UIWindow?
  private static var installed = false

  // MARK: - Switch

  /// Off unless something turns it on. This ships in the app, so the quiet
  /// state is the one nobody asked for.
  private(set) static var isEnabled = false

  static func setEnabled(_ enabled: Bool) {
    isEnabled = enabled
    guard enabled else {
      clear()
      return
    }
    install()
  }

  private static func clear() {
    // Layers, so the main thread — the caller may be anywhere.
    DispatchQueue.main.async {
      host()?.sublayers?.forEach { $0.removeFromSuperlayer() }
      live.removeAllObjects()
      overlay?.isHidden = true
      overlay = nil
    }
  }

  // MARK: - Install

  /// Patches UIKit's event delivery, once, the first time it is switched on.
  ///
  /// Deliberately lazy rather than done at launch: an app that never turns this
  /// on never has its `sendEvent:` swizzled at all. The patch is not removed
  /// when the switch goes off — unswizzling is the part of this trick that goes
  /// wrong, because another guest may have swizzled the same method in the
  /// meantime and exchanging back would hand them our implementation. The flag
  /// costs one branch per event and cannot leave the event path half-patched.
  static func install() {
    guard !installed else { return }
    installed = true
    guard
      let original = class_getInstanceMethod(
        UIWindow.self, #selector(UIWindow.sendEvent(_:))),
      let replacement = class_getInstanceMethod(
        UIWindow.self, #selector(UIWindow.touchIndicator_sendEvent(_:)))
    else { return }
    method_exchangeImplementations(original, replacement)
  }

  // MARK: - Overlay

  private static func window(for source: UIWindow) -> UIWindow? {
    guard let scene = source.windowScene else { return nil }
    // Rebuilt if the app moved to a different scene — an iPad second window, or
    // a scene torn down and restored. Cheaper than observing scene lifecycle,
    // and it cannot fall out of step, because it is checked against the very
    // event being drawn.
    if let existing = overlay, existing.windowScene !== scene {
      existing.isHidden = true
      overlay = nil
    }
    if overlay == nil {
      let window = UIWindow(windowScene: scene)
      window.backgroundColor = .clear
      // A ROOT VIEW CONTROLLER, which is not optional. A UIWindow without one
      // is never composited: it can be unhidden, correctly sized and full of
      // layers and still not appear. That cost an afternoon on the prototype.
      let root = UIViewController()
      root.view.backgroundColor = .clear
      root.view.isUserInteractionEnabled = false
      window.rootViewController = root
      // Never takes a touch, never becomes key: a pane of glass with some paint
      // on it. Without both it would swallow the gestures it is drawing.
      window.isUserInteractionEnabled = false
      window.windowLevel = .statusBar + 100
      window.isHidden = false
      overlay = window
    }
    // Followed, not set once. A rotation or a split-view resize changes the
    // source window's bounds, and an overlay left at the old size would put
    // every disc at an offset from the finger that made it.
    if overlay?.frame != source.frame {
      overlay?.frame = source.frame
    }
    return overlay
  }

  private static func host() -> CALayer? {
    overlay?.rootViewController?.view.layer
  }

  // MARK: - Drawing

  private static func makeDisc() -> CALayer {
    let disc = CALayer()
    disc.bounds = CGRect(x: 0, y: 0, width: discSize, height: discSize)
    disc.cornerRadius = discSize / 2
    // Translucent fill, no outline. It has to read over a dark stage and over a
    // white button, and a ring would fight whatever it is sitting on.
    disc.backgroundColor = UIColor(white: 1, alpha: 0.38).cgColor
    // The one dark note, and what keeps a white disc legible on a white
    // surface. Tight and centred: any more and it reads as a border.
    disc.shadowColor = UIColor.black.cgColor
    disc.shadowOpacity = 0.35
    disc.shadowRadius = 10
    disc.shadowOffset = .zero
    disc.allowsEdgeAntialiasing = true
    return disc
  }

  /// Move without CALayer's implicit animation. The disc has to sit exactly
  /// under the finger; a quarter-second ease on every position change would
  /// show it trailing a drag by a visible margin.
  private static func place(
    _ disc: CALayer, at point: CGPoint, transform: CGAffineTransform
  ) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    disc.position = point
    disc.setAffineTransform(transform)
    CATransaction.commit()
  }

  /// Stretch along the direction of travel, by how fast the finger is going.
  ///
  /// This is the motion blur, and it does what a camera does: a subject that
  /// crosses the frame during an exposure is drawn long. A round dot moving at
  /// 2000pt/s reads as a round dot in a different place each frame; the same
  /// dot drawn along its own path reads as speed.
  ///
  /// It narrows across the axis as it lengthens along it, so a fast disc does
  /// not also look bigger — but only by the square root, not in proportion.
  /// Taking the full 1/stretch conserves area exactly and looks wrong: past a
  /// flick the disc becomes a needle, which reads as a thin object rather than
  /// a round one moving quickly.
  private static func stretch(
    from: CGPoint, to: CGPoint, dt: TimeInterval
  ) -> CGAffineTransform {
    let dx = to.x - from.x
    let dy = to.y - from.y
    let distance = hypot(dx, dy)
    guard dt > 0, distance >= 0.5 else { return .identity }
    let speed = distance / CGFloat(dt)
    let t = min(speed / fullStretchSpeed, 1)
    let amount = 1 + (maxStretch - 1) * t
    let rotate = CGAffineTransform(rotationAngle: atan2(dy, dx))
    return rotate.scaledBy(x: amount, y: 1 / sqrt(amount))
  }

  // MARK: - Events

  static func handle(_ event: UIEvent, in source: UIWindow) {
    guard isEnabled, event.type == .touches else { return }
    guard window(for: source) != nil, let host = host() else { return }

    for touch in event.allTouches ?? [] {
      let point = touch.location(in: nil)
      let state = live.object(forKey: touch)

      switch touch.phase {
      case .began:
        let entry: Live
        if let state {
          entry = state
        } else {
          let disc = makeDisc()
          host.addSublayer(disc)
          entry = Live(disc: disc, at: point, time: touch.timestamp)
          live.setObject(entry, forKey: touch)
        }
        entry.last = point
        entry.lastTime = touch.timestamp
        place(entry.disc, at: point, transform: .identity)
        // Lands a touch large and settles, which is what a press feels like.
        let pop = CABasicAnimation(keyPath: "transform.scale")
        pop.fromValue = 0.7
        pop.toValue = 1
        pop.duration = 0.14
        pop.timingFunction = CAMediaTimingFunction(name: .easeOut)
        entry.disc.add(pop, forKey: "pop")
        entry.disc.opacity = 1

      case .moved:
        guard let state else { break }
        let dt = touch.timestamp - state.lastTime
        place(
          state.disc, at: point,
          transform: stretch(from: state.last, to: point, dt: dt))
        state.last = point
        state.lastTime = touch.timestamp

      case .stationary:
        // Let back to round. A finger that has stopped is not moving, and
        // leaving the last stretch on it draws motion that is not happening.
        if let state {
          place(state.disc, at: point, transform: .identity)
        }

      case .ended, .cancelled:
        guard let state else { break }
        let disc = state.disc
        live.removeObject(forKey: touch)
        // Releases back to round on the way out. A disc that faded while still
        // stretched would leave the last frame of a flick looking like a smudge
        // somebody forgot to clean up.
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 1
        fade.toValue = 0
        let grow = CABasicAnimation(keyPath: "transform")
        grow.fromValue = disc.transform
        grow.toValue = CATransform3DMakeScale(1.35, 1.35, 1)
        let group = CAAnimationGroup()
        group.animations = [fade, grow]
        group.duration = liftDuration
        group.timingFunction = CAMediaTimingFunction(name: .easeOut)
        group.fillMode = .forwards
        group.isRemovedOnCompletion = false

        CATransaction.begin()
        CATransaction.setCompletionBlock { disc.removeFromSuperlayer() }
        disc.add(group, forKey: "lift")
        CATransaction.commit()

      default:
        break
      }
    }
  }
}

extension UIWindow {
  /// Swizzled with `sendEvent:`. After the exchange this name runs the app's
  /// original implementation, which is why the call below is not recursion.
  ///
  /// `sendEvent:` is where every touch in the application passes through, which
  /// is the one place that sees the user's own hand as well as anything a test
  /// harness injects.
  @objc fileprivate func touchIndicator_sendEvent(_ event: UIEvent) {
    // The app's event delivery first and unconditionally — this is an observer,
    // and a mistake in the drawing must never cost the app a touch.
    touchIndicator_sendEvent(event)
    TouchIndicator.handle(event, in: self)
  }
}

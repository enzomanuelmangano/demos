// The `launch-icon` hatch on Apple: each home icon's square (springboard.contract's AppIcon, RN
// launch-icon.tsx's LaunchIcon wrapper) hands its view to the launch (DemoLaunch.swift), which
// measures it as the frame a demo opens out of and closes into, and hides it while its artwork
// flies (RN's choreography lifts the artwork out of the home for the whole session).
#if os(iOS)
import UIKit
import UIKit.UIGestureRecognizerSubclass

/// Built (`element.isNew`) and changed (a `data-*` word moved): the icon of `data-slug`.
func launchIconHatch(_ element: ExactElement) {
    guard let view = element.view, let slug = element.data[.slug] else { return }
    LaunchIcons.shared.set(slug: slug, view: view)
    if element.isNew {
        let touch = IconTouch()
        view.addGestureRecognizer(touch)
        element.owns(recognizer: touch, "names the launch on touch-down, as RN's tap does")
    }
}

/// Notes a finger on the icon and never recognizes: the press stays Exact's.
private final class IconTouch: UIGestureRecognizer {
    override init(target: Any?, action: Selector?) {
        super.init(target: target, action: action)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
    }
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        if let view { LaunchIcons.shared.touch(view) }
        state = .failed
    }
    override func canPrevent(_ preventedGestureRecognizer: UIGestureRecognizer) -> Bool { false }
}

/// The node is leaving, its view still there.
func launchIconHatchEnded(_ element: ExactElement) {
    guard let view = element.view else { return }
    LaunchIcons.shared.remove(view: view)
}
#endif

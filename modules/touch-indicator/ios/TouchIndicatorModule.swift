import ExpoModulesCore

// The switch for the touch overlay. See TouchIndicatorOverlay.swift for what it
// draws and why it draws only that.
//
// Development affordance, and it ships off. The overlay costs nothing until it
// is switched on: UIKit's event delivery is not patched until the first
// `setEnabled(true)`, so an app that never turns it on never has its
// `sendEvent:` touched.
public class TouchIndicatorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TouchIndicator")

    Function("setEnabled") { (enabled: Bool) in
      // The overlay is UIKit, so it is driven from the main thread whatever
      // thread the JS call landed on.
      DispatchQueue.main.async {
        TouchIndicator.setEnabled(enabled)
      }
    }

    Function("isEnabled") { () -> Bool in
      TouchIndicator.isEnabled
    }
  }
}

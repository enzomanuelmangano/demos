// The device's physical display corner radius, read once at startup from the
// native module (react-native-screen-corner-radius). The open-zoom grows the
// demo screen to these corners so, at full size, they meet the phone's screen
// edge seamlessly — the iOS app-launch look.
//
// Guarded: the package reads NativeModules.ScreenCornerRadius.cornerRadius at
// import and would throw if the native module isn't linked yet (before a
// rebuild, or on a platform that reports nothing). We fall back to a sensible
// floor instead of crashing, and clamp to that floor on devices that report 0
// (simulators / square displays).
const MIN_RADIUS = 25;

let deviceRadius = 0;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  deviceRadius =
    require('react-native-screen-corner-radius').ScreenCornerRadius ?? 0;
} catch {
  deviceRadius = 0;
}

export const SCREEN_CORNER_RADIUS = Math.max(deviceRadius, MIN_RADIUS);

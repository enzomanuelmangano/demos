# Web parity

The Demos app on the web (`bun exact.mjs web`), against the iPhone. Desktop: an iPhone Air frame (420 x 912 pt, scaled to the
window). Phone browser: full screen like an app. Measured in headless Chrome 1440 x 900 (desktop, mouse) and 390 x 844 DPR 2
(touch emulation, coarse pointer), WebGPU on Metal, 2026-11-22, branch `exact-web`.

## How it is measured

- Idle: each demo opened by its link (`/demo/<slug>`), 4.5 s after load, `requestAnimationFrame` deltas over 2 s (fps).
- Interaction: tap the centre, drag left-right, drag up and down, long press 0.7 s; frame deltas over the whole run.
  `jank` = frames over 25 ms, `worst` = the longest frame in ms. Headless rAF is vsync-locked at 60 Hz, so a busy
  main thread shows as late frames; GPU time is not in this number.
- Pointer mapping under the frame's scale (skia-color-picker, tap at 80% / 60% of the screen at scale 1.00 and 0.70):
  the same colour and pin place, so clicks and drags map 1:1.
- No iOS reference frames exist for most demos (`parity-tools/screen-atlas/out` has RN and Exact iOS for two), so the
  layout comparison against the phone rests on the shared Contract / Rust: a demo's plan and GPU surfaces are the same
  code; the differences are the host layers listed below.

## What differs from the iPhone on the web

| Area | Web | Status |
|---|---|---|
| Native views (`modules/apple`) | page module `modules/web/index.js`: glass-pane, glass-button, swift-slider, rolling-count, variable-blur, toggle-sheet, painting-menu, audio-track, native-tabbar, mate-haptic. `motion-feed` and the launcher's own views are stubs (the launcher is drawn in Contract). | done, approximations of UIKit's looks |
| Launcher | `home/web-phone.contract`: wallpaper, paged grid, page dots, status bar and home indicator in the frame. No pull-to-search, no long-press menu on icons, no launch zoom (a scale and fade). | partial |
| Demo open / close | scale and fade; close and info are round glass-like buttons; the Inspiration sheet is a plain bottom sheet. | done |
| Swipe-down to close | not on the web (the close button closes; Back or the browser's back also closes). A top-strip pan would take the demo's taps there. | open |
| Haptics | none on the web, except `navigator.vibrate` for the checkmate crescendo where the browser has it. | by design |
| Device attitude / motion sensors | `startSensorInput` is `NotSupportedError` in the browser build: card-shader-reflections, threads-holo-ticket and linear-sensors do not tilt. | open |
| Safe areas | frame: top 62, bottom 34 (simulated); phone browser: the device's own via `viewport-fit=cover`. Five demos used `env(safe-area-inset-bottom)` and now read their DemoEnv. | done |
| Scroll physics | the browser's: rubber band on iOS Safari, none on desktop Chrome. | by design |
| Fonts | SF through `system-ui` / `ui-rounded` on Apple devices; other systems fall back. | by design |
| Shaders | Dawn is stricter than naga: paper-folding's hash needed parentheses (fixed, same value). All other surfaces compile. | done |

## Per demo

status: `renders` = opens, draws, closes, no console errors; fps = desktop / mobile idle; jank and worst = desktop / mobile
during the interaction run.

| demo | status | fps | jank | worst ms | notes |
|---|---|---|---|---|---|
| sculptures-in-words | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| light-on-painting | renders | 61 / 61 | 0 / 0 | 17 / 17 | web module: toggle-sheet |
| the-little-prince | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| chessboard | renders | 60 / 60 | 0 / 0 | 17 / 17 | web module: mate-haptic |
| art-gallery | renders | 61 / 61 | 0 / 0 | 17 / 17 | web module: painting-menu |
| cherry-blossom-qrcode | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| github-terrain | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| notion-qrcode | renders | 60 / 40 | 0 / 0 | 17 / 17 |  |
| scrollable-shapes | renders | 60 / 60 | 0 / 0 | 17 / 17 |  |
| sphere-waves | renders | 60 / 60 | 0 / 0 | 17 / 17 |  |
| calendar-days | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| blur-cards | renders | 61 / 61 | 1 / 1 | 133 / 33 |  |
| liquid-glass-playground | renders | 61 / 61 | 0 / 0 | 17 / 17 | web module: glass-pane |
| airbnb-flip-interaction | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| stacked-carousel | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| github-contributions | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| draggable-panel | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| online-offline | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| ios-home-bouncy | renders | 61 / 61 | 0 / 2 | 17 / 267 | unstable (opened by link only) |
| time-machine | renders | 61 / 61 | 0 / 0 | 17 / 17 | unstable (opened by link only) |
| magnet-spring | renders | 61 / 61 | 0 / 1 | 17 / 33 |  |
| sudoku | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| clock-time-picker | renders | 60 / 61 | 0 / 0 | 17 / 17 |  |
| card-shader-reflections | partial | 61 / 61 | 0 / 0 | 17 / 17 | device attitude (sensors) has no web source: the light stays still |
| composable-text | renders | 61 / 61 | 0 / 1 | 17 / 67 |  |
| fluid-tab-interaction | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| threads-holo-ticket | partial | 61 / 61 | 0 / 0 | 17 / 17 | device attitude (sensors) has no web source: the ticket stays still |
| everybody-can-cook | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| verification-code-face | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| linear-sensors | partial | 60 / 61 | 0 / 0 | 17 / 17 | web module: motion-feed (no web); motion-feed has no web source: the sensor readout stays at rest |
| stacked-modals | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| mnist | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| tab-navigation | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| bezier-curve-outline | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| expandable-mini-player | renders | 61 / 61 | 0 / 0 | 17 / 17 | web module: glass-pane, native-tabbar |
| snake | renders | 60 / 60 | 0 / 0 | 17 / 17 |  |
| delete-button | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| motion-blur | renders | 60 / 61 | 0 / 0 | 17 / 17 |  |
| alert-drawer | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| duration-slider | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| clerk-toast | renders | 61 / 61 | 0 / 2 | 17 / 150 | web module: variable-blur, glass-pane |
| exclusion-tabs | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| pomodoro-timer | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| steps | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| miles-bar-chart | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| paper-folding | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| coverflow-carousel | renders | 60 / 61 | 0 / 0 | 17 / 17 |  |
| dot-sheet | renders | 61 / 61 | 2 / 0 | 167 / 17 |  |
| interaction-appearance | renders | 61 / 61 | 0 / 0 | 17 / 17 | web module: glass-pane |
| checkbox-interactions | renders | 61 / 61 | 0 / 1 | 17 / 33 |  |
| atlas-sphere | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| atlas-button | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| imessage-stack | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| grid-visualizer | renders | 61 / 60 | 0 / 0 | 17 / 17 | unstable (opened by link only) |
| geometry-button | renders | 61 / 60 | 0 / 0 | 17 / 17 |  |
| stacked-list | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| wheel-picker | renders | 61 / 61 | 0 / 0 | 17 / 17 | web module: rolling-count |
| twodos-slide | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| infinite-carousel | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| empty-qr-code | renders | 60 / 60 | 0 / 0 | 17 / 17 |  |
| prequel-slider | renders | 61 / 61 | 1 / 1 | 83 / 83 |  |
| gl-transitions | renders | 61 / 61 | 0 / 1 | 17 / 33 | web module: glass-button |
| stacked-bottom-sheet | renders | 61 / 61 | 0 / 0 | 17 / 17 | web module: glass-pane |
| staggered-card-number | renders | 61 / 61 | 0 / 0 | 17 / 17 | web module: rolling-count |
| scroll-transition-3d | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| verification-code | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| fibonacci-shader-grid | renders | 61 / 60 | 0 / 0 | 17 / 17 |  |
| balance-slider | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| family-number-input | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| fibonacci-shader | renders | 60 / 60 | 0 / 0 | 17 / 17 | web module: swift-slider |
| drag-to-sort | renders | 61 / 61 | 0 / 1 | 17 / 33 |  |
| fractal-glass | renders | 60 / 60 | 0 / 0 | 17 / 17 |  |
| slide-to-reveal | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| toast | renders | 60 / 61 | 0 / 0 | 17 / 17 |  |
| action-tray | renders | 61 / 61 | 0 / 0 | 17 / 17 | web module: glass-pane |
| steddy-graph-interaction | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| airbnb-slider | renders | 61 / 61 | 0 / 0 | 17 / 17 | web module: swift-slider |
| blurred-scroll | renders | 60 / 61 | 0 / 0 | 17 / 17 |  |
| skia-color-picker | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| scrollable-bottom-sheet | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| loading-button | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| github-onboarding | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| fourier-visualizer | renders | 61 / 61 | 1 / 2 | 83 / 67 |  |
| telegram-theme-switch | renders | 61 / 61 | 0 / 0 | 17 / 17 | web module: glass-pane |
| split-button | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| circular-carousel | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| selectable-grid-list | renders | 61 / 61 | 0 / 1 | 17 / 33 |  |
| radar-chart | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| animated-indicator-list | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| fluid-slider | renders | 61 / 61 | 0 / 1 | 17 / 33 |  |
| animated-3d-parallax | renders | 61 / 61 | 0 / 1 | 17 / 33 |  |
| color-carousel | renders | 61 / 61 | 0 / 1 | 17 / 50 |  |
| audio-player | renders | 61 / 60 | 0 / 0 | 17 / 17 | web module: audio-track |
| floating-modal | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| smooth-dropdown | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| blur-circles | renders | 60 / 60 | 0 / 0 | 17 / 17 |  |
| story-list | renders | 61 / 60 | 0 / 0 | 17 / 17 |  |
| shared-transitions | renders | 61 / 61 | 0 / 0 | 17 / 17 | unstable (opened by link only) |
| metaball | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| cuberto-slider | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| bottom-bar-skia | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| add-to-cart | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| theme-canvas-animation | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| animated-clip-box | renders | 60 / 61 | 0 / 0 | 17 / 17 |  |
| floating-bottom-bar | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| scroll-progress | renders | 61 / 61 | 0 / 0 | 17 / 17 | web module: variable-blur |
| spiral | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| swipe-cards | renders | 61 / 61 | 0 / 0 | 17 / 17 |  |
| mobile-input | renders | 60 / 60 | 0 / 0 | 17 / 17 |  |

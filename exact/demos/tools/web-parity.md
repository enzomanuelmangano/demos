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
| Launcher | `home/web-phone.contract`: wallpaper, paged grid, page dots, status bar and home indicator in the frame. Page module: pull-to-search (`search-reveal`, SearchReveal.swift's numbers: rubber band, blur ramp reveal^3.5 as three cross-faded backdrop blurs, field, Cancel, filtered results, a row opens out of its icon), the long-press / right-click menu (`icon-grid`: Inspiration, Share via navigator.share else copy, View Code), a mouse drags the pages (rubber band, snap by throw or half a page), arrow keys and dot taps page, a trackpad's two-finger pull down searches; icons load eagerly. | done |
| Demo open / close | `demo-card` (page module, DemoLaunch.swift's springs): the card grows out of the tapped icon (width, aspect, centre springs, radius overshoot table, taper, art cross-fade, home scale 0.912 + blur + dim), the close flies into the icon (or a search row); springs run ahead at 120 Hz, played as compositor keyframes (transform, opacity; the radius is the one main-thread track). A link opens without a flight, as on the phone. Close lands in ~0.78 s (within 1.2 pt of the icon). | done |
| Swipe-down to close | `demo-card`: ClosePan's rules and `closeZone(slug)` (strip 0.18, zones, a vertical scroller's top hand-off), 10 pt vertical-dominant activation, 30 pt sideways fail; the card shrinks under the finger (scale to 0.3 over 0.7 screen), closes past 0.1 screen or at 250 pt/s, else springs back; interruptible mid-open. The demo's own gesture on that pointer gets a pointercancel; a downward first touchmove is kept from the browser. Tested: sudoku / stacked-list (top hand-off) / chessboard (zone and strip), mouse and touch. | done |
| Haptics | `navigator.vibrate` (Android; iOS Safari has none): selection 5 ms, light 8, medium 12, heavy 18, success / warning / error patterns, 150 ms pacing; Contract's haptic() (the runtime's vibrate 5 / 12) paced too; surfaces' `haptic:<kind>` stay kinds in the web GPU module (gpu/src/haptic.rs, wasm32 only) and are played by the page module. | done |
| Device attitude / motion sensors | `motion-feed` (page module) writes into the canvas through `exact.gpu.sensors`: gravity (linear-sensors) and the attitude quaternion (threads-holo-ticket, card-shader-reflections, mounted on the web in app.contract instead of startSensorInput). Generic Sensor classes, else devicemotion / deviceorientation (iOS Safari's permission on the first tap in the demo); a desktop tilts by the pointer over the frame. Verified: pointer tilt on all three, deviceorientation override on the ticket. | done (real iPhone Safari unverified) |
| Safe areas | frame: top 62, bottom 34 (simulated); phone browser: the device's own via `viewport-fit=cover`. Five demos used `env(safe-area-inset-bottom)` and now read their DemoEnv. | done |
| Scroll physics | the browser's: rubber band on iOS Safari, none on desktop Chrome. | by design |
| Fonts | SF through `system-ui` / `ui-rounded` on Apple devices; other systems fall back. | by design |
| Shaders | Dawn is stricter than naga: paper-folding's hash needed parentheses (fixed, same value). All other surfaces compile. | done |

## Notes (second pass, 2026-11-22)

- theme-color: the production build (`bun exact.mjs web-build --out <dir>`) writes `<meta name="theme-color" content="#141414">`
  and `manifest.json` (theme and background #141414) from app.json; the dev loop does not (dev only). Nothing to add
  (`host.web.head` refuses a theme colour: Exact writes it).
- WebGPU needs a secure context: the dev loop's LAN URL (`http://192.168.1.206:5341`) has no `navigator.gpu`, so every
  GPU demo is blank there (phone or desktop). Use `http://localhost:5341` on the Mac, an HTTPS tunnel (`--allow-host`)
  for a phone, or Chrome's `--unsafely-treat-insecure-origin-as-secure=<lan url>`; a deployed (HTTPS) build is fine.
- Hitches: the 15 demos with a stray late frame in the first pass were rerun with a trace (desktop and mobile, the same
  interaction run): 29 of 30 runs had no frame over 25 ms; the one repeat (clerk-toast, desktop, first tap) is a 250-280 ms
  GPU-process task (`GPUTask`) with nothing on the page's thread: a first-use compile of the browser's own blur shaders
  (clerk-toast has no WebGPU surface; its glass and variable blur are backdrop-filters), cold profile only. The first
  pass's other one-off frames (33-267 ms) did not recur: first-use pipeline / shader compiles in a cold Dawn cache.
  The iPhone's background warm-up (gpu/src/warm.rs) is a no-op in wasm (the page's device is not `Send`); a main-thread
  warm-up on the home was tried and dropped: it put 100-570 ms frames into the idle home.
- sudoku draws black on the web (also in the first pass's screenshots): to be fixed in the per-demo pass.

## Per-demo pass (owner: newest first, until every row is PERFECT or a documented web limit)

Order: demos.contract (newest first). Done: none yet. In progress: sculptures-in-words (letters pass blank after the
toggle on the web; being debugged), then light-on-painting, the-little-prince, chessboard, ...

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

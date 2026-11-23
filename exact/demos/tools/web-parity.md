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

## Launch and scroll smoothness (third pass, 2026-11-22)

- The flight is compositor-only now: card transform + clip-path corners (composited in Chrome 158: 9 main-thread
  lifecycles over a 1 s clip-path animation against 62 for border-radius, measured on a test page), content transform,
  home zoom transform, dim / blur opacity, all WAAPI keyframes of the springs run ahead; layers promoted when the card
  is set up; a dragged close commits to the route only at landing; no style reads after writes in a drag.
- Headless measurement is noisy (Dawn on Metal behind ANGLE): during the close the remaining long frames are GPU-process
  `SwapBuffers` waiting on `IOSurfaceImageBacking::WaitForCommandsToBeScheduled::Dawn` (100-200 ms): the demo's WebGPU
  canvas inside the card still submitting work, or a first-use pipeline compile, not the page's thread (the release
  task fell from 152 ms to 69 ms; per-frame main-thread work during the flight is the runtime's rAF tick, ~0.07 ms).
- A cold open of a GPU demo can still miss its first frames: the demo mounts in the tap's task and its surface's
  pipelines compile on the GPU process's main thread (wgpu's createRenderPipeline is synchronous), which also draws
  the compositor's frames. Warm opens and closes are smooth (chessboard: every screencast frame advances). Not fixed:
  deferring a surface's creation until the flight lands needs the host's GPU glue (exact2) to expose a hold.
- The home pager: a mouse drag reads its sizes once per press; the host's `:hover` rules are removed (several are
  `:has(...:hover)`). Synthetic CDP drags are bounded by the driver's input rate (~30 Hz), so the pager's frame rate under
  a real mouse was not measured here.

## Per-demo pass (owner: newest first, until every row is PERFECT or a documented web limit)

Order: demos.contract (newest first). Drivers used (not in the repo): a CDP script per check, headless Chrome with
`--enable-unsafe-webgpu`, desktop 1440x900 framed and 390x844 touch emulation, cold profile.

Fixes that apply to every demo: GPU canvases are configured `premultiplied` (wgpu's WebGPU backend lists only `opaque`,
so transparent overlay canvases painted black: sudoku was all black); sheets opened by a double tap no longer
dismiss on the tap's own click; no hover wash on pressables (a grey square stayed where the mouse rested); continuous
corners that do not fit in half the side are round, as UIKit draws them (discs and capsules were squircles);
`symbol:sf/textformat` drawn (the host's table lacks it); every `symbol:sf/<name>` (39, in 13 demos and the atlas) is now an app.forma icon with its SF source for Apple and an Ionicons SVG for the web, where it was blank (e9e0187d); a canvas in the launch card is sized in the screen's points
(the host measured it with getBoundingClientRect, which includes the card's and the frame's scale: a demo opened
from its icon kept the icon-sized layout, a stuck zoomed still, and on the desktop frame every surface was laid out at
the frame's scale, 378 pt wide at 0.9) and its pointer events are mapped back by the same scale; GPU surfaces draw
their system-font text (draw2d read SF from the system's files: on the web every label drawn by 27 surfaces was
missing; the web's system face is Inter, OFL, subset 250 KB, a stand-in for SF, which may not be shipped).

| demo | state | what was checked / what is left |
|---|---|---|
| sculptures-in-words | PERFECT | statue (45a6cabf); grey square, the Aa icon, the circle disc (6e8f0dbb); toggle, sideways re-seat, 60 fps desktop and touch. The column at rest is the letters' quads on the web (3cbf58cf): no per-frame upload, letters on CoreText's pixel grid; checked: scroll, cross in the figure then back to page 2's column. |
| light-on-painting | fixed (7549deb8), checked on touch | Bulb drag relights, swipe pages, double tap opens the Light sheet, Show depth, scrim dismisses. Left: the sheet on the desktop frame. |
| sudoku | PERFECT | touch and desktop, 60 fps (vsync), no late frame: Start Game, the board then the pad; a given cell highlights its digit everywhere (no fill), an empty cell takes a key (digit and key lit), a wrong one plays the error haptic; Notes On writes pencil marks in their 3 x 3 places and a second press removes one; Undo takes back the last placement; Erase (its icon was blank on the web: fixed, e9e0187d); the title solves the board: confetti, success haptic, the Genius! alert; New Game asks first. |
| the-little-prince | PERFECT | letters fly to the picture and back (toggle, 240 ms icon crossfade), laid out at 420 pt; no late frame desktop / touch. |
| chessboard | PERFECT | Fool's Mate plays, glass wave, review card; Back, Replay; drag a piece, tap-select (dots) and tap-move; 60 fps. |
| art-gallery | PERFECT | menu picks a painting (fixed: paintings opened as empty submenus), the mosaic rearranges; pinch, pan, double tap, zoom-out button (touch); a trackpad pinches and pans (fixed: no wheel input before). Menu is a web glass list, not SwiftUI's. |
| cherry-blossom-qrcode | PERFECT, web limit | tap folds to the QR and back, long press sends the creeper (blast, reassembly), the field retypes the code. Limit: no software keyboard on a desktop, so the field's keyboard toolbar sits at the screen's bottom and the tree's space above an absent keyboard stays empty. |
| github-terrain | PERFECT | tap springs to the terrain and back, the switch swaps data. Note (iOS too, not web): RN's switch has an off track #C8CCC9, the port's is the system's (faint on the light page). |
| notion-qrcode | PERFECT | CONNECT / SHARE labels drawn (font fix), the wave to the QR and back, 60 fps touch. Labels are Inter on the web. |
| scrollable-shapes | PERFECT | swipes morph sphere, cube, torus, heart; dots follow; 60 fps. A trackpad's sideways scroll swipes too (the trackpad mapping). |
| sphere-waves | PERFECT | tap right / left walks the pattern history (selection haptic each), pinch nearer / farther and springs back (heavy haptic under 0.3), touch and trackpad; 60 fps. As on the iPhone (shared Rust, RN's Tap allows any distance), a pinch shorter than 500 ms also counts as a tap. |
| calendar-days | PERFECT (draw2d fix) | slider drag flips pages, a haptic per day, trackpad drags the slider, the slider zone keeps the close. Fixed: the 31 lost the 3's lower half on the web (draw2d, see the shared fixes). |
| blur-cards | PERFECT | press fans the five cards out and back; matches the iPhone frame at rest; 60 fps (vsync) desktop and touch. |
| liquid-glass-playground | PERFECT (fixed) | the pane follows the pan at half travel, haptics ramp, springs back, strip-only close; trackpad pulls it. Fixed: clear glass was darker and flatter than the iPhone's (mean 27 / 59 / 12 vs 40 / 74 / 20). |
| airbnb-flip-interaction | PERFECT | press flips the card (3D turn) and swaps the pages with their rise-and-fade; flips back; 60 fps. |
| stacked-carousel | PERFECT | swipes page the pile both ways, the seven-dot window follows, trackpad swipes; 60 fps. (The atlas frame predates the dot window.) |
| github-contributions | PERFECT | press sweeps the squares to their greens and back; 60 fps touch and desktop. |
| draggable-panel | PERFECT | spring picks, the panel thrown to the nearest corner, close shrinks it to the settings button under the close button (as on the iPhone: safe top + 56), the button grows it back; 60 fps. |
| online-offline | PERFECT | each press moves a random avatar across, the pills resize; 60 fps (vsync), no late frame without screenshots. |
| ios-home-bouncy | PERFECT (link only, unstable) | squares spring in; tap replays; long press opens the tuner (light haptic), sliders step with selection haptics, a pull from the sheet's body dismisses it (medium) and replays. As on the iPhone (shared Rust, RN's Reanimated 4 springs): a replay first springs to 0 on mass 80 / damping 120 / stiffness 240, about 13 s with the grid zoomed out, before the squares return; a pull from the grabber starts in the `strip` close zone and closes the demo. |
| time-machine | checked on desktop (link only, unstable) | a row drag reorders (Feed the cat down one), pulling the screen down opens the stack over the starfield (2 cards, medium haptic), a sideways drag leafs to the older card, pulling up closes on it and the old order is back; 60 fps. Left: the touch run; the frame's status-bar ink follows the backdrop (#030303: white), invisible over the light list: check what the iPhone shows before changing `inkOver`. One headless run hung after the sideways drag (screenshot); five reruns did not. |
| magnet-spring | PERFECT | desktop: drag onto a magnet (it swells to 3x under the piece, the piece 1.2x), release snaps with the spring, a fling lands on the nearest; touch (390 x 844): the same, grab vibrates 8 ms, a crossing 5, landing nothing; a trackpad's two-finger scroll carries the piece and it lands on a magnet; 60 fps vsync, no late frame. (Contract's haptic('impact-light') reaches the runtime's vibrate(12), not the module's 8: runtime.) |
| clock-time-picker | PERFECT | touch drag, mouse drag and trackpad scroll the list: the hands turn with it and it rests on the nearest half hour (1:00 -> 1:30 / 2:00 / 3:00), a selection haptic per time centred, the rigid one (12 ms) once when pulled past the top; 60 fps, no late frame. |
| card-shader-reflections | PERFECT (web stand-in for the sensor) | swipes page Metal / Silver / Gold (a fast fling may pass two cards: snapToInterval with fast deceleration, as RN and the iPhone's shared Rust); the light follows the pointer over the frame on a desktop (motion-feed), the device's attitude on a phone browser (unverified on a real iPhone Safari); 60 fps. |
| composable-text | PERFECT | touch and desktop, 60 fps (vsync), no late frame: a press toggles Use Max / Using Max, the new letters spring in from half size (757 ms), the leaving ones fade where they stood (200 ms), the rest and the pill slide on their springs, the colour crosses in 200 ms; a selection haptic per press. All Contract (shared with the iPhone). |
| fluid-tab-interaction | PERFECT | touch and desktop, 60 fps, no late frame: a tap on a cell slides the pill, the labels cross-fade, the blur pulses over the control (as RN's AnimatedBlurView), a selection haptic per tap; Accounts / Deposits / Funds each way. |
| threads-holo-ticket | PERFECT | touch and desktop, 60 fps (vsync), no late frame: a drag turns the ticket (holo grid while it turns, shadow and specular band), a fling settles on a face, a tap flips it away from the finger with one selection haptic (5 ms), a trackpad's sideways scroll turns it, the pointer over the frame tilts it (motion-feed; a phone browser's attitude unverified on a real iPhone Safari), the Inspiration sheet, the swipe-down close (zone "": from anywhere, as on the iPhone). Labels are Inter on the web. iOS too, not web (deliberate, c54cd54e / 4a6ce868): no RN hitSlop of 50 pt, a fling lands on a face, the tap's turn follows the finger's side. |
| everybody-can-cook | PERFECT | touch and desktop, 60 fps, no late frame: a tap flips every letter about x in a wave (Honk Sans Medium, the bundled face), quick taps stack waves, impact-light (12 ms) per tap. All Contract. No Inspiration (none registered, iOS too). |
| verification-code-face | PERFECT (fixed) | desktop and touch, 60 fps: digits flip in, the face tilts toward the next box, a wrong code frowns, reddens and shakes, 1111 smiles in blue, the reset a second later; a tap on the boxes refocuses the field. Fixed (web only): the content lifted 118 pt for a keyboard on any focus, so a desktop page sat high over an empty half; on the web it now lifts by RN's rule, half the keys' cover (`DemoEnv.keyboardHeight`, exactViewport's, 0 on a desktop; a phone browser's keys unverified on a real phone); the hidden field's focus ring showed in the top-left corner. Same two fixes in verification-code. |
| linear-sensors | PERFECT (web stand-in for the sensor) | desktop: the pointer over the frame tilts the square (motion-feed gravity), shadow against the tilt; touch with no samples rests at rotateX π/8 as on the iPhone without Core Motion (a phone browser's devicemotion unverified on a real iPhone Safari); 60 fps. |
| stacked-modals | PERFECT | touch and desktop, 60 fps, no late frame: + opens the first card (rise and fade), Confirm / Dismiss stack the next in front (older ones shrink and rise, their text fades), a selection haptic per answer, a tap on the backdrop drops them one after another. All Contract. |
| mnist | PERFECT | touch and desktop, 60 fps: a stroke inside the grid fills its cells (the close zone keeps it), the network lights and the guess follows (a vertical stroke reads 1), the eraser clears to N/A with a selection haptic. |
| tab-navigation | PERFECT | touch and desktop, 60 fps (vsync), no late frame: a tap chooses on finger-down, the pill widens on the critically damped spring (settles in ~400 ms), the icon slides left, the label fades in as progress cubed and the old one out (sampled: tab-1's label 0.005 / 0.135 / 0.439 at 57 / 109 / 159 ms against RN's p^3), the pressto scale while held, a selection haptic per tap; the Inspiration sheet, the swipe-down close from anywhere. All Contract. |
| bezier-curve-outline | PERFECT | touch and desktop, 60 fps (vsync), no late frame: a tap sends the square along the curve, growing 64 to 180 with the motion blur, a second tap brings it back; holding Outline Mode blurs the screen (65 over 300 ms, linear) and the label's ink follows; outline mode crossfades to the curve, its four points drag (mouse and touch) and the square then travels the new curve. |
| expandable-mini-player | PERFECT (fixed) | touch and desktop, 60 fps: a drag up (or a tap) raises the sheet, the cover, title, play and next morph from the mini player, a drag down past the middle or a flick closes it, the transport (previous, pause / play with the cover settling smaller, next), the clock ticks. Fixed: (1) web: no transform drag began in the scaled desktop frame (the host admits a drag only on an untransformed path): the drag's target and clip measure, and a handle's pointer events arrive, in the unscaled screen; a mouse's click after a drag on a handle is dropped (the sheet closed and at once reopened on its press); toast, clerk-toast, stacked-bottom-sheet, add-to-cart and action-tray share it. (2) web: the clock never ticked (the host delivers no surface messages): it counts the timer's tokens in env.timers. (3) shared, a bug for both: every place was a 402 x 874 display's (mini player at 732, play / next at x 318 / 353, the ways in the keyframes), so on 390 x 844 the mini player sat on the tab bar and its cover, title and buttons 56 pt above the glass; now the mini player is 142 above the bottom, the cover fits the screen's height, and the ways are boxes as long as the way (the animated-indicator-list pattern) plus a scale run over a longer range. Same numbers on 402 x 874; on the Air (912) the mini player moves 732 to 770, 6 above the tab bar as Apple Music (it floated 42 above). |
| snake | PERFECT | touch and desktop, 60 fps (vsync), no late frame: flings turn the snake (a selection haptic each, no reversal), it wraps at the edges, food grows it (impact-medium) and the count rolls with its blur; biting itself (a scripted 2 x 2 circle at length 7) fades in "Life goes on..." over the board (impact-rigid), its press restarts and the count rolls back to 0. The count's digits rest under the BlurView's 1 % (σ 0.3 pt), as on the iPhone. Label is Inter on the web. |
| delete-button | PERFECT | touch and desktop, 60 fps: a tap (up to RN's 500 ms) slides the pill left, it turns black and reads Confirm while the close circle melts out of its right end (the gooey bridge), the X folds it back; a selection haptic each. |
| motion-blur | PERFECT | touch and desktop, 60 fps: + adds on press-down (light haptic), a new card comes out of the +, the others slide up and the oldest leaves, each blurred along its motion; holding adds bursts (one card and an 8 ms buzz per burst, 300 ms then faster); a tap on the list toggles the debug slow motion and HUD (iOS too). (Beyond RN, iOS too: press-down add, bursts, haptics, the debug mode.) |
| alert-drawer | PERFECT | touch and desktop, 60 fps (vsync, no screenshots): Continue raises the floating card and the scrim on the 400 ms spring, the content fades in late and drops; Cancel, the close button and the scrim fold it back; a selection haptic per press. |
| duration-slider | PERFECT | touch and desktop, 60 fps: the knob dragged around the dial (a circular drag) fills the ring, the value steps 1...12 with a selection haptic each, the ring stops at 12 with the limit bump (impact-rigid) and goes back down the other way. |
| clerk-toast | PERFECT (fixed) | touch and desktop, 60 fps (vsync, no screenshots): each press stacks the next toast on its spring (three slots, older ones under the third), a swipe left dismisses the front one (mouse too, since the transform-drag fix), the eighth's x clears them all in turn, a selection haptic per press; the progressive blur ramps in above the stack. Fixed (web, the desktop frame): the frame's display was clipped by a rounded overflow (border-radius 62, corner-shape), under which Chrome ignores the mask of every backdrop-filter: the progressive blur was one hard-edged full blur (checked: radius 0 and a round corner-shape restore the ramp; a clip-path does not break it). The display is clipped by a clip path of UIKit's continuous 62 pt corner instead (home/web-phone.contract `airDisplayPath`); corners match within 54 levels on the curve's edge pixels, flights unchanged (chessboard / clerk-toast open and close, A/B). Long titles wrap at 390 pt as they would on a 390 pt iPhone. |
| exclusion-tabs | PERFECT | touch and desktop, 60 fps: a tap turns the tab blue with its rounded corners and melts its neighbours back into the black bar on either side, a selection haptic each. Labels are Inter on the web. |
| pomodoro-timer | PERFECT | touch and desktop, 60 fps: a sideways drag turns the 200-tick ring (a selection haptic per tick) and sets the count; the button at 0 shows "Please enter a valid number"; started, the count springs to 0 and counts up one a second (a tick each, as RN's useTimer), "Timer completed" a second after, its OK resets; Stop resets at once. |
| steps | PERFECT | touch and desktop, 60 fps: Continue fills the dots under the green bar's spring, Back slides in after the first step, the last step reads Finish with its check and wraps to the start; a selection haptic per press. |
| miles-bar-chart | PERFECT | touch, mouse drag and trackpad, 60 fps: paging the week strip springs every bar to that week (height and colour), a selection tick per week; weeks start at the Monday 21 days before today. |
| paper-folding | PERFECT | touch and desktop, 60 fps: a tap unfolds the three folds and folds them back (selection on touch, soft as the folds land; the web paces buzzes 150 ms apart). |
| coverflow-carousel | PERFECT | touch, mouse and trackpad, 60 fps: the strip snaps every 160 pt, the centred photo full size and the others squashed and fanned, a selection haptic per photo, the rigid bump past either end. |
| dot-sheet | PERFECT (fixed) | touch and desktop, 60 fps: the tilted card grows into the sheet, the field takes the text, the send arrow (or the card's back chrome) closes it with the note kept, the card reopens. Fixed (web only): (1) the field never took focus after a tap (its 260 ms timer reports no message on the web): on the web it focuses in the tap itself, which is also the only focus a phone browser raises its keyboard for; (2) a press on the send arrow blurred the field first (a browser moves focus on mousedown), closing the sheet before the press could submit: while a field in a demo has focus, a press elsewhere keeps it, as on the iPhone (page module); (3) the send's success haptic was dropped by the 150 ms pacing behind the press's selection tick: a stronger buzz now still plays. |
| interaction-appearance | PERFECT | touch and desktop, 60 fps: the sun button switches light and dark (a selection haptic), held it shrinks the page, fades the poster's glow and raises the blur over it (the glass button stays sharp above), the page bounces but does not scroll (RN's bounce-only), a trackpad pulls it too. |
| checkbox-interactions | PERFECT | touch and desktop, 60 fps: a tap checks a chip (orange, check fading in over 150 ms) and the chips reflow on their layout spring; a second tap unchecks; a selection haptic each. |
| atlas-sphere | PERFECT | touch and desktop, 60 fps: under a finger the dots gather into a sphere that follows it (impact-light on the grab, selection ticks as they roll) and spread back into the grid on release. |
| atlas-button | PERFECT | touch and desktop, 60 fps: held, the button shrinks, the logo rises, "React Native" fades in and the disc of blue squares grows; release reverses it; a light haptic on press and release. |
| imessage-stack | PERFECT | touch, mouse drag and trackpad, 60 fps: a sideways swipe brings the next card to the front (one per fling) and the stack fans to both sides, a selection haptic per card, the rigid bump past either end. |
| grid-visualizer | PERFECT (link only, unstable) | touch and desktop, 60 fps: the squares inside the number's glyphs spring outward, a tap clears it and a random number arrives 700 ms later. The glyphs are Inter on the web (SF on the iPhone), so their outline differs a little. |
| geometry-button | PERFECT | touch and desktop, 60 fps: held, the fifty circles fan out into the flower (impact-heavy, 18 ms, on the accepted touch-down) and close back to one circle on release. No Inspiration (none registered, iOS too). |
| stacked-list ... | next | Continue in demos.contract order: stacked-list, wheel-picker, twodos-slide, infinite-carousel, empty-qr-code, prequel-slider, gl-transitions, stacked-bottom-sheet (a transform drag: check the handle with a mouse now that it can begin in the frame), staggered-card-number, scroll-transition-3d, ... Drivers: /tmp/w9/touch.ts (adds `VP=w,h`, `arc:`), /tmp/w9/png.py (decode a screenshot's rows / crop-zoom, no PIL), /tmp/w9/fshot.ts (the frame and display at 1440 x 900 DPR 2). In-page scripted PointerEvents (untrusted) drive GPU canvases at exact timings and hold presses for a screenshot mid-hold. |

Trackpad (done, 55fa5849 + 6d29e48f): over anything in a demo that claims touches (computed touch-action other than
auto: a GPU canvas, a Contract pan, a host drag) a wheel becomes synthetic touches: a ctrl-wheel (trackpad pinch) is
two touches spreading about the pointer (50 pt either side, Chrome's step), a scroll one touch dragging with the
content; they lift 120 ms after the wheel stills (under 10 pt travelled: cancelled, never a tap), are untrusted (the
close pan ignores them; capturing them is a no-op) and held off by a real touch. A DOM scroller that can scroll the
wheel's way, and an axis left to the browser (pan-x / pan-y), keep the wheel. art-gallery's own Rust wheel is gone.
A mouse wheel's 100 px notches arrive as jumps of the touch (a trackpad's deltas are fine).

Shared fixes (this pass): draw2d (08f75964): a path that was the first user of a path clip (a continuous-corner
clip, any clip_path) was drawn as the clip's outline: use_msaa_clips borrowed the draw's verbs buffer. Off Apple
every glyph is an outline, so clipped text lost glyphs on the web; on the iPhone only a non-convex path that first
uses a path clip changes (to what it should have drawn); draw2d 50 and demos-gpu 362 tests unchanged. The page
module no longer touches the DOM when the build imports it in Bun (`Element is not defined` had stopped the dev
server's Rust rebuilds: gpu/ edits did not reach the dev page). glass-pane's clear style: half-alpha tint, no wash,
saturation 120%.

Measuring: frame stats here are taken with vsync on (Chrome headless, real GPU, 60 Hz) and no screenshots during
the run; uncapped runs (`--disable-gpu-vsync --disable-frame-rate-limit`) flood the GPU at ~2400 rAF/s and show
periodic 35 ms stalls that a real display never sees (blur-cards).

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

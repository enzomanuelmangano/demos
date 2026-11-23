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
| light-on-painting | PERFECT (fixed) | touch and desktop, 60 fps: the bulb drag relights the painting, a swipe pages, a double tap opens the Light sheet (in the frame on the desktop), its switches change the scene (a selection haptic each; Cord turns off with Bulb), the scrim or a drag down on the sheet dismisses it, a short drag springs back. Fixed (7549deb8; web, e39b8a1e): the web sheet kept its first switch states while up, played no haptic and could not be dragged away. |
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
| time-machine | PERFECT (link only, unstable) | touch and desktop, 60 fps: a row drag reorders (impact-light, a selection per row passed), pulling the screen down opens the stack over the starfield (impact-medium), a sideways drag leafs to the older card (selection), pulling up closes on it and that order is back. Fixed (web, 424e5fcd): the frame's status-bar ink was white over the light list (chosen from the #030303 backdrop); it is black now (gl-transitions too; clerk-toast and skia-color-picker the other way). |
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
| stacked-list | PERFECT | touch (native fling), wheel and mouse drag, 60 fps (vsync), no late frame: the cards pile up shrunk and faded at the bottom on the scroll timeline; a pull down at the top closes the demo (the scroller's top hand-off), not past it. |
| wheel-picker | PERFECT (web font) | touch, mouse drag and trackpad, 60 fps: the ruler follows, the count rolls, a selection per tick (paced 150 ms on the web), the corner button spreads the ticks (50 pt) and back. The count is SF Rounded on the iPhone; Chrome has no `ui-rounded`, so it is the system face there (Safari draws it rounded). |
| twodos-slide | PERFECT | touch, mouse and trackpad, 60 fps: the label rubber-bands with the drag and springs back, the squares turn (right: the outline draws round the front one; left: they square up), impact-light past the full turn once per quiet second. |
| infinite-carousel | PERFECT | touch, mouse and trackpad, 60 fps: the circular strip pages, the cards tilt by distance, the background follows the centred theme over 500 ms, a tap on a side card scrolls to it, a selection per theme. No Inspiration (none registered). |
| empty-qr-code | PERFECT | touch and desktop, 60 fps: the tilted card cycles YOURLOGO's letters on their gradients (SF Rounded Bold, bundled), a tap straightens and grows it into the white QR code and back, a selection each. |
| prequel-slider | PERFECT | touch, mouse and trackpad, 60 fps: the ruler (its 60 pt band only, as RN) drags, flings and snaps to a tick, rubber-bands past its ends, the photo warps on the butterfly wave and the ring fills, a selection per tick. |
| gl-transitions | PERFECT (fixed, shared) | touch and desktop, 60 fps: the glass + slides the new-note screen up, an empty save shows the Empty Note alert (OK), the typed note saves through the GL transition and leads the list (staggered entry), Back warps out without a note; the notes scroll (touch, wheel). The placeholder is the dark scheme's placeholder grey on white, as on the iPhone and RN (the app is dark). Fixed (shared, 93c2309b): "Create a new Note" ran under the glass check on a 390 pt screen; it now ends 4 pt before it (402 / 420 pt unchanged). |
| stacked-bottom-sheet | PERFECT | touch and mouse, 60 fps: each press stacks the next sheet on its spring (older ones lift, shrink, fade), the front one swipes down (impact-medium) or springs back, the wand stacks the spiral sheet (its 44 pt strip drags it, mouse and touch; a tap on the spiral turns it). |
| staggered-card-number | PERFECT (fixed) | touch and desktop, 60 fps: the eye hides the first twelve digits one after another (25 ms stagger, rolling down) and shows them back. Fixed (web, e0423543): the digits were the rounded bold fallback; rolling-count now finds a bundled family (Fira Code) by its @font-face file and draws it at its own weight. |
| scroll-transition-3d | PERFECT | touch, mouse and trackpad, 60 fps: 99 to 0 on the inverted snapping list, each number tips back, fades and blurs off the middle, a selection per number, impact-rigid past an end. |
| verification-code | PERFECT | touch and desktop, 60 fps: digits flip in (Fira Code), a wrong code reddens and shakes, 11111 turns green, the reset a second later; no lift on a desktop (the shared keyboard fix). |
| fibonacci-shader-grid | PERFECT | touch and desktop, 60 fps: the pad's pointer follows (grows while held), the sphere's circles and multiplier follow it, impact-light on the take, a selection per cell, impact-rigid leaving the pad. |
| balance-slider | PERFECT | touch, mouse and trackpad, 60 fps: coffee / milk split follows the knob, impact-light on the take, a selection per step, impact-rigid at an end. |
| family-number-input | PERFECT (fixed) | touch and desktop, 60 fps: digits rise in and regroup with sliding commas, backspace drops one, held it repeats quickening (impact-light each, impact-medium at 0). Fixed: (web, 5555a3f4) a held backspace deleted one digit (its timer reports no message on the web): the hold's deletions are counted from env.timers; (iOS, a bug there, 9c24cb12) the wait after the first repeat was 58 ms, not 100 (tick read `repeats` after writing it). |
| fibonacci-shader | PERFECT (fixed, shared) | touch and desktop, 60 fps: the glass bar's slider sets the points (5 to 350), the sparkles button rolls a new spiral. Fixed (shared, a2b0ca0c): the bar was content-box, so its 30 pt of padding pushed its right end to the display's edge and the button off it; border-box now, 30 pt from both edges. |
| drag-to-sort | PERFECT | touch and mouse, 60 fps: a long press lifts a row (impact-light), the drag reorders the others around it, the drop settles (impact-soft); a plain drag or wheel scrolls the list. |
| fractal-glass | PERFECT (fixed, shared) | touch and desktop, 60 fps: the circle drags behind the reeded glass (impact-light on the grab), refracted per flute. Fixed (shared, 35e65467): its backdrop was RN's default white (dark-only demo), so the web's status bar ink was black on black and the card opened white; gen-demos now overrides it to #000000. |
| slide-to-reveal | PERFECT | touch and desktop, 60 fps: the finger sharpens and grows the digits under it, impact-light on the take, a selection per digit. |
| toast | PERFECT | touch and mouse, 60 fps: each press stacks a toast, a swipe left dismisses the front one (impact-medium), the fifth dismisses itself after 2.5 s unless another lands on it (as RN), the sixth on are the spam toast. |
| action-tray | PERFECT | touch and mouse, 60 fps: + opens the tray (impact-soft), Continue walks the three steps with the height springing to each, Accept closes it; the backdrop, the x and a swipe down close it. Contract's non-selection haptics are the runtime's single 12 ms buzz (success is not a pattern there: runtime). |
| steddy-graph-interaction | PERFECT | touch and desktop, 60 fps: the highlight slides under the picked difficulty, each score springs to its value, a selection per press. |
| airbnb-slider | PERFECT (fixed, shared) | touch and mouse, 60 fps: the price rolls with the thumb, a selection per digit-count change, impact-rigid at $0 and $4500. Fixed (shared, f48ecfd9): moved() judged the previous change (it read progress after writing it), so the end's bump came a move late (never on the web). |
| blurred-scroll | PERFECT | touch, wheel, 60 fps: the leaving card shrinks, tilts and blurs, sharp again off screen; native deceleration and bounce. |
| skia-color-picker | PERFECT | touch and mouse, 60 fps: the drop follows the finger clamped to the wheel and fills with the colour under it; impact-light on the take, a selection per 30 degrees past half the radius, impact-rigid at the rim. |
| scrollable-bottom-sheet | PERFECT | touch, mouse and trackpad, 60 fps: the button opens the sheet, its height follows the page, pages swipe (selection each), a drag down closes it (impact-medium), Close closes it. |
| loading-button | PERFECT | touch and desktop, 60 fps: Check Transaction morphs to the spinner and Analyzing, then the check (or lock) and back to idle. |
| github-onboarding | PERFECT | touch, mouse and trackpad, 60 fps: the cats page with the gradient following, a dot pages to its cat, a selection per page, impact-rigid past an end. |
| fourier-visualizer | PERFECT | touch and mouse, 60 fps: a stroke's epicycles retrace it over 20 s, the x clears it. |
| telegram-theme-switch | PERFECT (fixed) | touch and desktop, 60 fps: the button grows the other theme in a circle from it (impact-medium), the landing makes it the base (impact-soft), again and again. Fixed (web, a2b64d23): the reveal's timer message never reached landed() on the web, so only the first tap switched; the landing is read from env.timers and the timer surface plays the landing's haptic there. |
| split-button | PERFECT | touch and desktop, 60 fps: Start splits into Google and Apple, Google merges them back, Apple toggles; haptics as the iPhone. |
| circular-carousel | PERFECT | touch, mouse and trackpad, 60 fps: the strip bends into its arc as it scrolls, snaps every quarter width, a selection per photo; the Scale switch springs the arc's scale. (The switch's off track is the system's, faint on the light page: iOS too, as github-terrain.) |
| selectable-grid-list | PERFECT | touch, mouse and trackpad, 60 fps: a tap toggles a photo, a sideways drag selects the range (impact-light, a selection per change), a steep drag or a wheel scrolls, the counter button clears. |
| radar-chart | PERFECT | touch and desktop, 60 fps: Shuffle springs both datasets in, axis after axis. |
| animated-indicator-list | PERFECT (fixed) | desktop wheel, 390 pt wheel and touch, 60 fps: the header row slides and the bar stretches to the section's name as the list scrolls, a header tap scrolls smoothly to its section. Fixed (web, ef0c3e92): the named scroll timeline was never handed to the browser. The 30 fps under touch emulation was headless Chrome's: any active scroll-driven animation (a plain HTML page with one sticky box on `scroll(nearest)` too, and stacked-list) halves rAF during a touch scroll in headless; the same runs in a headed Chrome (390 x 844 touch emulation, vsync) have 0 late frames for both demos. |
| fluid-slider | PERFECT | touch and mouse, 60 fps: a grab lifts the drop (impact-light), the value follows the finger with a selection per ten, a tap far away springs the picker there. |
| animated-3d-parallax | PERFECT | touch and mouse, 60 fps: the card and the logo tilt toward the finger (the logo lags on its looser spring), both spring back on release; a drag starting outside the card closes the demo, as on the iPhone (zone 0.09-0.91 x 0.31-0.69). |
| color-carousel | PERFECT | touch, mouse and trackpad, 60 fps: the strip snaps per card, the centred card grows and the others turn away in perspective, the glow eases to its colour, a selection per card, impact-rigid past an end. The cards' straight edges are aliased on purpose (Core Animation's, matched on the device); on a 1x desktop display the steps show more than at 3x. |
| audio-player | PERFECT (fixed, shared) | touch and mouse, 60 fps: play grows the artwork on its spring and the clock runs (audio-track plays assets/audio/track.m4a, gitignored: a fresh clone plays on a silent nominal 3:00), the waveform scrubs (impact-light, a selection per bar, impact-soft on release), +15 / -15. Fixed (shared, a bug for both, 707ce866): the first skip after opening did nothing (the action wrote its token counter and read it back in the same action, so it sent the mount's token again); the first seek and clock token had the same flaw. |
| floating-modal | PERFECT | touch and mouse, 60 fps: + grows into the sheet (selection), a drag on the sheet shrinks it with the distance (impact-light on the take) and a release far enough down closes it (impact-medium), else it springs back; a tap outside and Done close it. |
| smooth-dropdown | PERFECT | touch and mouse, 60 fps: the header springs the four options open into a list and turns the chevron, a second tap folds them back, a tap mid-flight reverses from where it is; a selection per press. |
| blur-circles | PERFECT | desktop and touch, 60 fps: the sweep circle and the glass circle wander on the noise, the glass blurs what is under it. No input. |
| story-list | PERFECT | touch, mouse and trackpad, 60 fps: one card per page, the leaving card scales and slides over the stack, a selection per card, impact-rigid past an end. |
| shared-transitions | PERFECT (link only, unstable) | touch, mouse and wheel, 60 fps: a photo fades in its details screen, the title and paragraph fade in after it, Home fades it out; the masonry scrolls. |
| metaball | PERFECT | touch and mouse, 60 fps: each finger pulls a circle out of the liquid (impact-light), the neck stretches and breaks (impact-medium), selection ticks denser under tension, release springs back and merges (impact-soft). |
| cuberto-slider | PERFECT | touch and mouse, 60 fps: the picker grows and rounds under the finger, the balloon trails and leans, the value 0 to 100 (floor, as RN) with a selection per step and impact-rigid at an end. |
| bottom-bar-skia | PERFECT | touch and mouse, 60 fps: a tab tap moves the notch and the raised circle to it on the spring, the icon rises into it, a selection per tap. |
| add-to-cart | PERFECT (fixed) | touch and mouse, 60 fps: a row flies its photo into the sheet, the backdrop or a swipe down flies it home, Add to Cart drops it into the row's cart button, the badge pops and the success haptic plays. Fixed (web, c924cc68): the landing timer's message never reached landed() on the web, so after a dismiss the photo stayed over the row (a scroll left it on the screen) and the confirm's success haptic never played: read from env.timers, as telegram-theme-switch. Also (web, a1b9aa29): the list lost 15 px to a classic scrollbar on the desktop frame. |
| theme-canvas-animation | PERFECT | touch and mouse, 60 fps: a swatch floods the screen with its theme in a circle grown from it, a selection per tap, quick taps chain. |
| animated-clip-box | PERFECT | touch and mouse, 60 fps: held, the corner circle floods the card and the text turns white, release shrinks it back, a selection per press. At 420 pt (the desktop frame, the Air) the first card's description is two lines, the second clipped, as on the Air (the Rust test pins it). |
| floating-bottom-bar | PERFECT | touch and mouse, 60 fps: a tab tap slides the light cone and the bar over it, a selection per tap. |
| scroll-progress | PERFECT | touch and wheel, 60 fps: the pill widens with the percentage and its meter as the article scrolls, the end turns it into the up arrow (impact-rigid), its press scrolls smoothly to the top and the reading time comes back. The first scroll after opening has one 33 ms frame (the first run of the host's layout-transition glue for the pill: 15 ms of script, once); later scrolls and the pill's other changes have none. |
| spiral | PERFECT | touch and mouse, 60 fps: a tap springs every circle to a new spiral (a selection). |
| swipe-cards | PERFECT | touch and mouse, 60 fps: the front card follows the finger and tilts, past the line (selection) a release throws it (impact-medium), else it springs back; the buttons throw it either way, Reset brings the cards back one after another. |
| mobile-input | PERFECT | touch and mouse, 60 fps: keys press on touch-down (a selection each), the face opens its eyes, 11111 smiles, a wrong PIN frowns and the dots shake, backspace clears. |

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

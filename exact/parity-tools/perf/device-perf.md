# Demos on Exact: performance, every demo

2026-11-14, exact2 730abad1, branch `exact`. Target: iPhone 17 (120 Hz), 00008150-00114D61220A401C.

## How this was filled

From the code first (the integrator's rule), then measured where the code cannot say.

- **Every GPU surface**, by `cargo test --release -p demos-gpu --lib audit_every_surface -- --ignored --nocapture`
  (gpu/src/bench.rs): each registered surface offscreen at the phone's screen (402 × 874 @3,
  120 Hz steps), bound with the app's inputs, 4 s untouched and then 2 s of a finger dragging a
  figure-eight across it. Reports whether it still asks for frames after 4 s (and at what
  `max_fps`), the thread CPU of one `render` (median / p90 µs: recording, tessellation, buffer
  writes, encoding; GPU time excluded) and its heap allocations. On the M-series Mac, a proxy
  for the A19's big core. The machine was shared with other agents' builds: CPU is ±2×; compare
  rows, not runs. `render()` is forced every frame here, so a resting surface's µs is what a
  wake costs.
- **Contract**, by reading each demo's view for: `scroll=` / `pan=` actions (an action and a
  commit per frame, one round trip behind), filters, masks (`mask-image`, `clip-path`, shaped
  corners), shadows, canvas size and count.
- **The shell around every demo** (app.contract, home/demo-screen.contract,
  modules/apple/DemoLaunch.swift, the host's FrameClock and canvas presenter) by reading it.
- **Device columns** (presented fps, hitches, render-server time, offscreen passes): NOT
  measured this round. The phone was on Wi-Fi pairing, not the cable (argent: `paired`,
  devicectl: transport localNetwork), and then dropped off (`unavailable`). Every launch was
  ended with SIGTERM 10-15 s in, the screen apparently asleep. xctrace "Animation Hitches"
  recorded an empty trace. Re-run with the phone cabled, unlocked and awake (see "Next").

## Root causes

1. **The shell renders every demo offscreen, every frame it changes (DemoLaunch.swift, not
   Exact).** At rest after the open, the presented demo view keeps `masksToBounds = true` with
   `cornerRadius = screenCornerRadius` (continuous): Core Animation renders the whole
   full-screen demo into an offscreen texture to clip it to corners the panel itself already
   rounds. The route is `.overFullScreen`, so the home (the SpringBoard of ~100 icons) stays
   in the window under the opaque demo, with `HomeBlur`, a full-screen dark
   `UIVisualEffectView` at intensity 90: the blur's backdrop passes are re-run whenever the
   render server redraws the region over it, which is the whole screen. The demo's rounded
   clip also stops occlusion culling of the home and blur. Then two liquid-glass buttons
   (`glass-button`, SwiftUI) sample their backdrop each frame the demo under them moves. These
   are the prime suspects for the 25-47 offscreen passes per frame, and so for canvases at 60 Hz
   (render-server GPU over its 8.3 ms budget). RN pays for the same glass buttons and blur
   (its route is transparent), so only the clip and the hidden home are free wins:
   - at rest (fully expanded, no drag), drop the mask: `masksToBounds = false`,
     `cornerRadius = 0` (the panel's own corners hide the difference: same pixels);
   - at rest, hide the home and its blur under the opaque demo (`isHidden`), and show them again
     as the close drag begins.
   DemoLaunch.swift is another agent's: these are handed to them, not made here.
2. **The 60 Hz canvases: not in FrameClock or the Metal layer config.** Read, all correct:
   `CADisableMinimumFrameDurationOnPhone` is in the Info.plist; `Frames.rate()` asks for
   CAFrameRateRange(80, max, max) whenever a canvas wants frames; FrameClock merges users by
   max; no surface sets `max_fps`; wgpu-hal sets `maximumDrawableCount = 3`
   (FRAME_LATENCY 2 + 1), `presentsWithTransaction` is off, and frames are presented with
   `presentDrawable` on the frame's own command buffer (EXACT-PATCHES 2). The GPU dylib is the
   optimized `host-dev` profile. Left: (a) render-server GPU from (1); (b) the acquire thread's
   starved render, which draws when a drawable lands "about 4 ms into frame k + 3"
   (gpu/src/acquire.rs): if that present misses the render server's latch, every other frame
   slips, which is 60 Hz. A trace shows which: `hitches-renders` / `hitches-gpu`
   (render-server time) for (a), `display-surface-swap` against `display-vsyncs-interval` for
   the canvas layer (b). No Exact issue is drafted until the trace says it is (b).
3. **Rust surfaces are cheap.** Every surface but one renders in under 1.3 ms of CPU, most under
   0.2 ms, and allocates at most a few hundred times a frame (dynamic_blur_tabs, blur_circles,
   bottom_bar_skia, circular_carousel, duration_slider: 200-490 allocations, tens of µs). The
   one outlier was fourier-visualizer (fixed below).
4. **Idle redraws.** Ten surfaces still ask for frames after 4 s untouched. Nine are RN's own
   motion (a `withRepeat`, a 22 s playback, a 12 s mount sequence, a frame-callback game loop,
   a rotation clock). One was not: empty-qr-code (fixed below).
5. **Commits per frame from Contract** (`scroll=` and `pan=` actions): blurred-scroll and
   dynamic-blur-tabs bind a canvas input from the scroll each frame; stacked-list, scroll-progress and scrollable-bottom-sheet write state each frame;
   liquid-glass-playground commits each finger move (for its progressive haptics), and moves a
   `blur(10px) saturate(1.2)` pane. Exact's tool is a scroll-driven animation
   (`scroll-timeline` + `animation-timeline`, zero commits, the consumer moved in the scroll's
   own frame; animated-indicator-list now uses it, 2026-11-14). The others are not changed here: each change needs a device pass for parity, and none
   was possible.

## Fixes

| Demo | Cause | Fix | Before | After |
|---|---|---|---|---|
| fourier-visualizer | Every frame of the 20 s replay stroked 2048 epicycle circles, each a closed polygon, through the stroke tessellator (miter joins, MSAA) | The same region filled: each circle's annulus as two opposite rings under the nonzero rule (overlaps covered once, as one stroked path), each edge within 0.05 device px. Against the true annuli at Graphite's 4× MSAA sample pattern: 1748 pixels off the reference (sum of errors 462), against 1860 (492) before | 17.0 ms median, 23.1 ms p90 CPU per frame (bench `fourier-visualizer`, a 1500 pt stroke); under 60 fps by itself | 2.1 ms median, 3.5 ms p90 |
| empty-qr-code | Redrew the same picture every display frame (a full-screen compose pass) because RN's `setInterval` swaps the letter every 650 ms | `max_fps`: every frame while anything moves, a finger or an input; between letters, `ceil(1000 / ms to the next one)`, so the host's deadline (last draw + 1000 / cap) lands on it. The test `at_rest_it_draws_only_to_land_each_letter` checks each letter lands on the same display frame as at full rate | 78 draws per 650 ms at rest | about 5 (under an eighth, tested) |

Neither fix is on the phone yet: the phone was unreachable for the reinstall.

## Per demo

Rust: `surface` median/p90 µs and allocations per `render` at rest, then under a drag (when
it takes input), and whether it rests after 4 s. Device columns: not measured (see above).

| Demo | GPU surfaces | Contract costs |
|---|---|---|
| action-tray | Contract only |  |
| airbnb-flip-interaction | `airbnb_flip_card` 22/47 µs, 11 allocs; rests · `airbnb_flip_pages` 24/37 µs, 60 allocs; rests |  |
| alert-drawer | `alert_drawer_card` 32/56 µs, 20 allocs; rests |  |
| animated-3d-parallax | `animated_3d_parallax` 18/31 µs, 11 allocs; drag 20/48 µs; rests |  |
| animated-clip-box | `animated_clip_box` 199/260 µs, 24 allocs; drag 194/281 µs; rests | shadows (shadowPath: no pass) |
| animated-count-text | Contract only |  |
| animated-grid-list | Contract only | scroll= action each frame (writes on change); shadows (shadowPath: no pass) |
| animated-indicator-list | Contract only | scroll-driven (zero commits per frame) |
| atlas-button | `atlas_button` 96/258 µs, 27 allocs; drag 109/273 µs; rests |  |
| atlas-sphere | `atlas_sphere` 24/63 µs, 11 allocs; drag 22/49 µs; rests |  |
| audio-player | `audio_player` 71/108 µs, 23 allocs; drag 77/132 µs; loops (22 s playback (RN withTiming 22 s)) |  |
| balance-slider | `balance_slider` 38/86 µs, 23 allocs; drag 43/123 µs; rests |  |
| bezier-curve-outline | `bezier_curve_outline` 514/768 µs, 145 allocs; drag 618/760 µs; rests |  |
| blur-cards | `blur_cards` 78/163 µs, 175 allocs; rests |  |
| blur-circles | `blur_circles` 94/133 µs, 138 allocs; loops (RN withRepeat loop) |  |
| blurred-bottom-bar | `blurred_bottom_bar` 107/224 µs, 55 allocs; rests |  |
| blurred-scroll | `blurred_scroll` 25/36 µs, 77 allocs; rests | scroll= sets canvas input each frame |
| bottom-bar-skia | `bottom_bar_skia` 102/266 µs, 238 allocs; drag 138/242 µs; rests |  |
| calendar-days | `calendar_days` 70/107 µs, 34 allocs; drag 70/112 µs; rests |  |
| checkbox-interactions | Contract only |  |
| circular-carousel | `circular_carousel` 42/47 µs, 41 allocs; drag 41/45 µs; rests (2026-11-14: was 216 µs, 222 allocs: continuous-rrect ring paths per cell, now analytic circles) |  |
| clerk-toast | Contract only | mask-image (offscreen pass while shown); shadows (shadowPath: no pass) |
| clock-time-picker | `clock_time_picker` 142/199 µs, 180 allocs; drag 131/174 µs; rests |  |
| color-carousel | `color_carousel` 21/28 µs, 14 allocs; drag 22/28 µs; rests |  |
| composable-text | Contract only |  |
| coverflow-carousel | `coverflow_carousel` 41/57 µs, 21 allocs; drag 43/62 µs; rests |  |
| cuberto-slider | `cuberto_slider` 31/44 µs, 24 allocs; drag 39/106 µs; rests |  |
| delete-button | `delete_button` 118/274 µs, 77 allocs; drag 69/111 µs; rests |  |
| dot-sheet | `dot_sheet` 1/2 µs, 6 allocs; rests · `dot_sheet_card` 30/41 µs, 20 allocs; rests |  |
| duration-slider | `duration_slider` 181/248 µs, 211 allocs; drag 166/218 µs; rests |  |
| dynamic-blur-tabs | `dynamic_blur_tabs` 249/554 µs, 489 allocs; rests | scroll= sets canvas input each frame |
| dynamic-tab-indicator | `dynamic_tab_indicator` 44/102 µs, 21 allocs; drag 39/65 µs; rests |  |
| email-demo | `email_row` 178/259 µs, 86 allocs; rests | shadows (shadowPath: no pass) |
| everybody-can-cook | Contract only |  |
| exclusion-tabs | `exclusion_tabs` 81/124 µs, 70 allocs; drag 73/118 µs; rests |  |
| expandable-mini-player | `expandable_mini_player` 111/190 µs, 31 allocs; drag 107/154 µs; rests |  |
| family-number-input | Contract only |  |
| fibonacci-shader | `fibonacci_shader` 100/215 µs, 24 allocs; drag 51/97 µs; loops (RN withRepeat loop) |  |
| floating-bottom-bar | `floating_bottom_bar` 65/119 µs, 24 allocs; drag 66/158 µs; rests |  |
| floating-modal | `floating_modal` 32/49 µs, 23 allocs; drag 37/136 µs; rests |  |
| fluid-slider | `fluid_slider` 71/118 µs, 132 allocs; drag 70/152 µs; rests |  |
| fluid-tab-interaction | `fluid_tab_interaction` 81/120 µs, 113 allocs; drag 158/409 µs; rests |  |
| fractal-glass | `fractal_glass` 64/103 µs, 124 allocs; drag 71/122 µs; rests |  |
| geometry-button | `geometry_button` 420/446 µs, 37 allocs; drag 467/549 µs; rests |  |
| github-contributions | `github_contributions` 19/26 µs, 10 allocs; rests | shadows (shadowPath: no pass) |
| github-terrain | `github_terrain` 15/22 µs, 11 allocs; drag 19/38 µs; rests |  |
| imessage-stack | `imessage_stack` 226/394 µs, 24 allocs; drag 166/361 µs; rests |  |
| linear-sensors | `linear_sensors` 67/154 µs, 11 allocs; rests |  |
| liquid-glass-playground | Contract only | pan= commit per finger move; blur(10px) saturate filter |
| loading-button | `loading_button` 87/256 µs, 20 allocs; drag 170/680 µs; rests |  |
| magnet-spring | `magnet_spring` 57/152 µs, 11 allocs; drag 36/95 µs; rests |  |
| metaball | `metaball` 246/383 µs, 82 allocs; drag 314/606 µs; rests |  |
| miles-bar-chart | `miles_bar_chart` 33/119 µs, 10 allocs; drag 44/137 µs; rests |  |
| mobile-input | `mobile_input` 302/491 µs, 86 allocs; drag 229/452 µs; loops (12 s mount blur sequence (RN)) |  |
| motion-blur | Contract only | shadows (shadowPath: no pass) |
| online-offline | Contract only | grayscale filter (static) |
| paper-folding | `paper_folding` 21/43 µs, 11 allocs; drag 22/50 µs; rests |  |
| particles-button | `particles_button` 37/71 µs, 23 allocs; drag 46/128 µs; rests |  |
| popup-handler | Contract only | shadows (shadowPath: no pass) |
| prequel-slider | `prequel_slider` 47/79 µs, 31 allocs; drag 47/93 µs; rests |  |
| radar-chart | `radar_chart` 106/218 µs, 38 allocs; rests |  |
| record-button | `record_button` 270/416 µs, 19 allocs; drag 195/366 µs; rests |  |
| scroll-progress | Contract only | scroll= writes state each frame |
| scrollable-bottom-sheet | Contract only | scroll= and pan= write state each frame |
| scrollable-shapes | `scrollable_shapes` 68/141 µs, 34 allocs; drag 82/138 µs; loops (RN withRepeat loop) |  |
| selectable-grid-list | `selectable_grid_list` 57/114 µs, 28 allocs; drag 48/99 µs; rests |  |
| shake-to-delete | Contract only |  |
| shared-transitions | Contract only |  |
| skia-bottom-sheet | `skia_bottom_sheet` 72/141 µs, 11 allocs; drag 39/127 µs; rests |  |
| skia-color-picker | `skia_color_picker` 97/150 µs, 88 allocs; drag 139/241 µs; rests |  |
| slide-to-reveal | `slide_to_reveal` 40/71 µs, 28 allocs; drag 34/63 µs; rests |  |
| smooth-dropdown | Contract only |  |
| sphere-waves | `sphere_waves` 74/91 µs, 13 allocs; drag 74/95 µs; loops (RN withRepeat loop) |  |
| spiral | `spiral` 864/940 µs, 60 allocs; drag 902/1467 µs; rests |  |
| split-button | Contract only | shadows (shadowPath: no pass) |
| stacked-bottom-sheet | `spiral` 864/940 µs, 60 allocs; drag 902/1467 µs; rests | shadows (shadowPath: no pass) |
| stacked-carousel | `stacked_carousel` 26/49 µs, 11 allocs; drag 21/33 µs; rests |  |
| stacked-list | Contract only | scroll= writes state each frame |
| stacked-modals |  | shadows (shadowPath: no pass) |
| staggered-card-number | `staggered_card_number` 147/234 µs, 98 allocs; rests | shadows (shadowPath: no pass) |
| steddy-graph-interaction | `steddy_graph_interaction` 270/358 µs, 20 allocs; rests · `steddy_highlight` 54/188 µs, 31 allocs; rests |  |
| steps | Contract only |  |
| story-list | `story_list` 67/105 µs, 19 allocs; drag 103/233 µs; rests |  |
| swipe-cards | `swipe_cards` 61/99 µs, 20 allocs; drag 101/239 µs; rests | shadows (shadowPath: no pass) |
| tab-navigation | Contract only |  |
| telegram-theme-switch | `telegram_theme_switch` 38/75 µs, 24 allocs; drag 84/209 µs; rests |  |
| the-little-prince | `the_little_prince` 113/234 µs, 19 allocs; rests |  |
| theme-canvas-animation | `theme_canvas_animation` 52/97 µs, 28 allocs; drag 61/169 µs; rests |  |
| toast |  | shadows (shadowPath: no pass) |
| twitter-tab-bar | Contract only | scroll= writes prevY each frame (shows nowhere) |
| twodos-slide | `twodos_slide` 199/305 µs, 24 allocs; drag 145/284 µs; rests |  |
| verification-code | Contract only |  |
| wheel-picker | `wheel_picker` 38/56 µs, 24 allocs; drag 39/76 µs; rests |  |
| fibonacci-shader-grid | `fibonacci_shader_grid` 132/208 µs, 32 allocs; drag 143/256 µs; loops (RN withRepeat loop) |  |
| fourier-visualizer | `fourier_visualizer` 49/161 µs, 19 allocs; drag 131/1673 µs; rests |  |
| card-shader-reflections | `card_shader_reflections` 19/34 µs, 11 allocs; drag 28/51 µs; rests |  |
| threads-holo-ticket | `threads_holo_ticket` 40/99 µs, 11 allocs; drag 93/180 µs; rests |  |
| light-on-painting | `light_on_painting` 31/93 µs, 11 allocs; drag 111/218 µs; rests |  |
| gl-transitions | `gl_transitions` 1188/1483 µs, 33 allocs; drag 1182/1502 µs; rests |  |
| add-to-cart | `add_to_cart` 588/661 µs, 27 allocs; drag 655/815 µs; rests |  |
| cherry-blossom-qrcode | `cherry_blossom_qrcode` 17/26 µs, 11 allocs; drag 19/30 µs; rests | shadows (shadowPath: no pass) |
| empty-qr-code | `empty_qr_code` 41/125 µs, 11 allocs; drag 35/93 µs; capped 2fps at rest |  |
| image-cropper | `image_cropper` 183/294 µs, 24 allocs; drag 165/266 µs; rests |  |
| notion-qrcode | `notion_qrcode` 267/547 µs, 25 allocs; drag 313/575 µs; loops (RN rotates iTime continuously) |  |
| qr-code-generator | `qr_code_generator` 410/594 µs, 24 allocs; drag 355/535 µs; rests |  |
| snake | `snake` 41/50 µs, 11 allocs; drag 41/67 µs; loops (game loop (RN useFrameCallback)) | shadows (shadowPath: no pass) |
| sudoku | `sudoku` 196/286 µs, 48 allocs; drag 192/264 µs; rests |  |
| github-onboarding | `github_onboarding` 86/125 µs, 42 allocs; drag 82/105 µs; rests |  |
| airbnb-slider | `airbnb_slider` 29/46 µs, 21 allocs; rests |  |
| drag-to-sort | `drag_to_sort` 579/1075 µs, 30 allocs; drag 486/548 µs; rests |  |
| grid-visualizer | `grid_visualizer` 128/307 µs, 27 allocs; drag 141/340 µs; rests |  |
| infinite-carousel | `infinite_carousel` 27/55 µs, 20 allocs; drag 145/292 µs; rests |  |
| scroll-transition-3d | `scroll_transition_3d` 31/69 µs, 22 allocs; drag 141/271 µs; rests |  |
| interaction-appearance | `interaction_appearance` 61/201 µs, 64 allocs; drag 47/136 µs; rests |  |
| pomodoro-timer | `pomodoro_timer` 53/109 µs, 107 allocs; drag 89/181 µs; rests |  |
| mnist | `mnist` 797/1241 µs, 62 allocs; drag 818/1239 µs; rests |  |

## Next (with the phone cabled, unlocked, awake)

1. One trace per group, `xcrun xctrace record --device <udid> --template "Animation Hitches"
   --attach <pid> --time-limit 10s`, the demos opened by `demos-exact://demo/<slug>` through
   `devicectl device process launch --payload-url` mid-trace. Start with the self-animating ones
   (sphere-waves, fibonacci-shader, blur-circles, notion-qrcode, scrollable-shapes: no
   touches), then the drags. Export `displayed-surfaces-per-second`, `hitches`,
   `hitches-renders`, `hitches-gpu`, `display-surface-swap`, then delete the trace and
   `$TMPDIR/instruments*.ktrace`.
2. The same demo with the DemoLaunch changes of root cause 1: offscreen passes and fps before
   and after.
3. Then the `scroll=` demos, in the order above.

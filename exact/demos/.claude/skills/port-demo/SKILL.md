---
name: port-demo
description: Port one demo of the RN demos app (src/animations/<slug>) to the Exact app in exact/demos with the same UI, numbers, gestures and layout animations, at the highest performance — Contract for UI and state, Rust (gpu/) for anything Skia, WebGPU, three.js or per-frame. Use for any "port demo X" task.
---

# Port one demo

**The bar (the owner's): high-quality parity, not a copy.** No "not exact" item is accepted.
If Contract cannot express something exactly (an animated blur intensity, an animated radius
or font size, a value computed from the finger each move, a staggered exit, a sensor, a
haptic at a precise moment), the demo — or the part of it that moves — is drawn in Rust
(`gpu/`), where everything is possible. A port is done only when `parity-verify` passes:
still frames AND motion, side by side with the RN app.

The RN demo (`src/animations/<slug>/`, read-only) is the source of truth: every size,
padding, radius, colour, font, timing, curve, spring and gesture. Target: the same demo,
not a lookalike. Read `demos-dev-loop` first (build rules, springs, GPU rules).

## 1. Read the RN code in full

The demo's `index.tsx` and everything it imports inside its folder. Note each constant
with its RN name. Note what the demo imports from packages (pressto, reanimated, skia,
gesture-handler, expo-*): those map to `packages/*` here.

## 2. Choose the layer — performance first

| RN | Exact |
|---|---|
| Views, Text, flex layout, `StyleSheet` | Contract boxes with the same numbers |
| `useState`, handlers | component `state` + `action` (a child component may own state) |
| `useAnimatedStyle` + `withTiming/withSpring` on a state change | `transition` / `-exact-spring(k, c, m)` on `translate`/`scale`/`rotate`/`opacity`/colours |
| `entering` / `exiting` (FadeIn, …) | `animation="kf …"` / `-exact-exit-animation` |
| `layout={LinearTransition…}` | `-exact-layout-transition` (never drop one) |
| `withRepeat` loops | `keyframes` + `animation … infinite` |
| scroll-driven `useAnimatedScrollHandler` | `scroll=` writing ONE state value read only by `translate`/`scale`/`opacity` (stacked-list); or the whole thing in Rust when heavy |
| Pan/drag that moves a box (no per-frame logic) | `transformDragFor` + `transformgeometry`/`transformrelease`, `-exact-drag-timeline` + `animation-timeline` (interaction-gallery's CardDeck): host-driven, zero commits |
| Gestures with per-frame logic, physics, many moving things | Rust surface: `gesture-handler` + `reanimated` crates, `wants_input()` |
| Skia (anything), WebGPU, three.js, shaders | Rust surface in `gpu/src/<slug>.rs` + `gpu/shaders/<slug>.wgsl` |
| `PressableScale` / `PressableOpacity` (pressto) | `class=PressableScale` / `PressableOpacity` from `"pressto"`, + `haptic("selection")` in the press action (the app's global press haptic) |
| `Math.random()` | `roll(env.seed, k, n)` from `../env.contract` |
| `useWindowDimensions()` | `env.width`, `env.height`; `useSafeAreaInsets().top` is `env.safeTop` |
| `DEMO_BUTTON_ROW_HEIGHT` | `demoButtonRow()` (56) |
| Ionicons / SF symbols | `image "symbol:sf/<name>"` (the SF Symbol RN's icon looks like) |
| SF-Pro-Rounded fonts | `font-family="ui-rounded"` |

Never a per-frame `every(frame…)` task writing state for motion. Never approximate a Skia
drawing with Contract boxes: it is Rust.

## 3. Files

- `demos/<slug>/<slug>.contract`: one root component `PascalSlug` taking `env: DemoEnv`
  when it needs it. A header comment: what the demo is and the RN path.
- `demos/<slug>/<slug>.test.contract`: `at "/demo/<slug>"`, one test per behaviour.
- Rust: `gpu/src/<slug_snake>.rs` (`pub fn surface() -> Box<dyn Surface>`), shaders in
  `gpu/shaders/<slug_snake>.wgsl`, an offscreen test (`exact_gpu::fixture`) that checks
  where things are drawn. The canvas gets explicit `width`/`height`.
- Registration (the integrator does it, one at a time): `demos/index.contract` (`use` + an
  `if slug == …` arm), `gpu/src/lib.rs` (`pub mod`, the `REGISTRY` row), a surface that
  holds touches publishes `{"held": bool}` and gets a `Hold` resource in `app.contract`.

## Haptics from a surface

A surface cannot play a haptic itself. It returns the kind from `messages()` (e.g.
`"haptic:selection"`, `"haptic:impact-heavy"`), and the demo's canvas has `message=buzz` with
an action that plays it (`if text == "haptic:selection" haptic("selection")`, one line per kind).
One commit per haptic event, never per frame.

## Traps the compiler only catches in the whole app

- RN Skia renders into a Display P3 surface: a RuntimeEffect (SkSL) shader's output colours
  are P3 values, so convert them to sRGB in the WGSL port (skia-color-picker: 5.0 → 1.2 levels).
- RN Skia `measureText` on iOS: each glyph's bounds rounded out to whole points + 1 pt, wider
  than the ink; `skia::measure_text` reproduces it ("Home" = 37.888).
- Variable fonts: RN uses the optical size it draws at and Core Text's fractional advances
  (Newsreader at opsz 12): never round advances to font units.
- iOS host: a `transition`'s DELAY is ignored (measured: popup-handler, verification-code),
  armed early or not. `animation` delays hold. A delayed motion (`withDelay`) is keyframes
  with a delay (`… 300ms <easing> 800ms both`) or Rust. Keyframes refuse `rotate="x -90deg"`
  (BadValue), but animate the angle of a node whose axis a fixed `rotate="x 0deg"` sets
  (verification-code). A delay before a spring or a state change: the `timer` surface
  (`gpu/src/timer.rs`: inputs token, ms; posts `timer:<token>` once; see popup-handler). Timers (`task … when` + `after(ms, action)`) exist only in the ROOT component.
- iOS host: a `-exact-drag-timeline` box moved only by a `transition` (state change, no
  finger) does NOT drive its `animation-timeline` keyframes: they jump to the end. For
  state-driven motion use state-triggered keyframes that sample the RN curve densely enough that
  the linear segments stay under 0.5 px / 1 colour level off the real curve (check numerically),
  or move it to Rust. Release-after-drag is fine (swipe-cards verified): only never-dragged
  boxes are affected. Keyframes cap at ~21-33 stops.
- Exact easings: `cubic-bezier(0.455, 0.03, 0.515, 0.955)` is only CLOSE to Reanimated's
  inOut(quad) (1.9 % off): never use it. In a `transition` / `animation`, paste
  `bun tools/easing.ts inOutQuad` (a `linear()` within 0.0005, verified on iOS). Or, for keyframes, Exact: two keyframe halves, ease-in half `cubic-bezier(1/3, 0, 2/3, 1/3)` (y = s²)
  and ease-out half `cubic-bezier(1/3, 2/3, 2/3, 1)`, with the value linear in progress inside
  each half. Any polynomial easing of degree ≤ 3 is an exact cubic Bézier this way; out(cubic)
  = 1-(1-t)³ is `cubic-bezier(1/3, 1, 2/3, 1)`.
- Corners: RN `borderCurve: 'continuous'` = `corner-shape="-exact-continuous"` (CALayer
  cornerCurve .continuous), pills and circles included: CA draws it unclamped at min(r, w/2, h/2),
  so a continuous pill's ends are flatter than a semicircle. `squircle` is the CSS superellipse,
  a different shape: never use it. No borderCurve in RN = plain `border-radius`. Rust: skia's
  continuous rrect.
- iOS host: `object-fit="cover"` pins the image to the TOP when it crops vertically (CSS and
  expo-image centre it; Contract has no `object-position`). When the photo is taller than its box
  at cover scale, lay the cover box out by hand: a clip box, the image absolute at
  `max(w/iw, h/ih)` × its size, centred (see swipe-cards). Horizontal crops: unchecked, check for a left pin too.
- `transformgeometry` is NOT a touch-down: it fires when the drag binds (the handle mounts or its
  geometry changes, deduplicated). To know which item a drag holds, key the handle by the item
  (`for k in [frontKey] key=k` or one handle per item, `transformgeometry=began(k)`), so a new
  front rebinds; for RN's onBegin (isSwiping) use `pointerdown` / `pointerup` on the handle
  (toast: the drag held the oldest toast until this).
- Text line height: an RN Text with no `lineHeight` is laid out by TextKit at the font's
  unrounded hhea line height, (ascender + descender + lineGap) / unitsPerEm × font size (SF:
  (1950 + 494) / 2048, so 16.70703125 at 14, 23.8671875 at 20, every weight). Exact's `normal`
  line box rounds ascent and descent to whole points (17 and 23 there): every multi-line text
  drifts per line (scroll-progress: 0.88 px a line). Give each multi-line text that px value as
  an explicit `line-height`. Its baseline then sits at the rounded ascent plus the floored
  half-leading (SF: 13 at 14, 17 at 18) where TextKit's is 1950 / 2048 × size (13.33, 17.14), and
  RN rounds each Text box up to the device pixel: measure, then a `position="relative" top=…`
  puts the line back (stacked-modals: title and message pixel-identical; scroll-progress).
- Bundled fonts: Exact's line box takes the OS/2 usWin ascent/descent, TextKit the hhea ones
  (FiraCode: 2164 / 1000 vs 1980 / 644). In a fixed-height box that centres the text, the
  baseline moves by the metric difference and no `line-height` changes it (it cancels): offset
  the text (`position="relative" top=…`) by the computed difference (staggered-card-number: 1 pt).
  Read the metrics with fontTools, don't eyeball.
- Vector-icon glyphs drawn as SVG paths (Feather, Octicons, AntDesign…): TextKit puts half the
  font's hhea lineGap above the ascender, so in an `ascender + descender + lineGap` tall box the
  glyph sits lineGap / 2 lower than at the box top + ascender: `viewBox="0 -23 512 572"` for a
  lineGap of 46 / 512 (staggered-card-number's eye was 1.09 pt high). Where the box is centred
  in its row and hugs the glyph the offset cancels; check which case a demo is.
- `-exact-exit-animation` must be one literal declaration (no `${…}`), or the web target
  refuses it. Write the curve out (`cubic-bezier(0.455, 0.03, 0.515, 0.955)` is inOut(quad)).
- RNGH's iOS Pan (measured, wheel-picker): `translationX/Y` starts at 0 where the pan activates
  (UIKit drops its ~10 pt hysteresis; RNGH's custom criteria `setTranslation(.zero)`), not where
  the finger went down; and a finger at rest sends no moves, so the lift's `velocityX/Y` is the
  last move's (a drag held still still flings a snapPoint one tick on). `PanGesture::new().uikit()`
  does both; the plain `new()` (translation from the down point, velocity decaying at rest) is
  still the default until each surface is re-verified.
- UIScrollView (measured, selectable-grid-list's FlatList): the drag is 1:1 from the pan's
  activation; at the lift it decelerates (0.998/ms) only from a finger faster than ~335 pt/s and
  not after a 100 ms rest: `ui_scroll::uiscroll_release`. Below that it stops under the finger.
- SwiftUI views RN draws with @expo/ui (numeric text, …) are exact through the app's native
  module (`modules/apple/Demos.swift`, a hyphenated tag in app.json `modules`): `rolling-count`
  is AnimatedCount's Text. The web shows an empty box: test it with `expect tree has`.
- RN Debug: Reanimated `scrollTo` driven from a pan's onUpdate lands about once per 200 ms (the
  onScroll that refreshes the offset arrives late, so faster updates repeat the same target):
  selectable-grid-list's edge auto-scroll steps 15.75 pt per update 200 ms apart, but only 2 of
  7 updates 37 ms apart. A release build would not; decide per demo which one parity means.
- argent on the Exact app: `gesture-custom` calls return before the gesture has played out; put
  consecutive gestures in one `run-sequence` with `delayMs`, or the next Down catches a fling.
  Its `interpolate` also fills an Up → Down gap with moves (one call per gesture).

## 4. Check

`bun tools/check-demo.ts <slug>` prints `[]` (compiles the demo alone, before it is
registered; needs no build and touches nothing shared). Once registered:
`bun exact.mjs contract build app.contract --json --errors-only` is `[]`; the demo's web
test passes; `cargo test -p demos-gpu` for Rust. Then on the simulator (integrator):
`demos-exact://demo/<slug>`, a real-time recording of each gesture, frames read back.

## The Rust queue (demos a Contract port found need per-frame logic)

the-little-prince (Skia Atlas glyph morph), animated-3d-parallax (two springs chasing the
finger), magnet-spring (2D distance per frame to nine magnets).

## Parity debts (ported, with a known gap to revisit, likely in Rust)

- Animated blur intensity (expo-blur `intensity` driven by Reanimated): Exact's materials and
  `backdrop-filter` don't animate. staggered-card-number (per-digit blur), fluid-tab-interaction
  (blur pulses). The fix is `skia::backdrop` (UIKit's partially animated blur, measured by
  `exact/parity-tools/blur-probe`): a Rust surface draws what is under the BlurView and runs the
  tint's chain at intensity / 100 (blurred-bottom-bar, dynamic-blur-tabs, bezier-curve-outline).
- `border-radius` doesn't animate: alert-drawer (mid-spring radius).
- liquid-glass-playground: progressive haptics every 5 px of drag (needs per-move logic).
- stacked-modals: the 60 ms × index stagger on exit (an exit animation is one literal).

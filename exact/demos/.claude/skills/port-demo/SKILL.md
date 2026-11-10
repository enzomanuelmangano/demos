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
| Any pressto pressable (`PressableScale`, `PressableOpacity`, `PressableWithoutFeedback`, `createAnimatedPressable`) | **pressto is the app's global press system: use `packages/pressto`, never `:active` / `-exact-press-*`.** Contract: `pressing` state + `pointerdown=pressIn(key) pointerup=pressOut` + `scale=pressableScale(pressing, key, pressto)` (`pressableOpacity`, `animatedPressable(…, rest, pressed)`, `animatedPressableColor`) + `transition=pressTransition("scale", pressto)`, and `pressablesOnPress()` (the global haptic) in the press action; `inject pressto: PressablesConfig` and `pressablesOnPress: action` (the root provides them). Rust surface: `pressto::Pressable` (BaseButton semantics, progress, `scale()`/`opacity()`, `global_message()`). packages/pressto/README.md |
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

- Text in a surface standing for an RN `<Text>` (not RN Skia `<Text>`): its font MUST be
  `.with_ui_layout()` (or `match_ui_font`). `Font::new` alone takes Skia's path with gamma
  pre-blend: 5–20 % heavier ink than TextKit. With it, the text probe matches UIKit at 0 diff.
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
- RN `<Text>` drawn in Rust (labels, @expo/vector-icons glyphs): use a UIKit font
  (`skia::match_ui_font`, or `Font::new(..).map(Font::with_ui_layout)` for a bundled/icon font)
  and `gfx::line_height` / `gfx::baseline`. Measured by exact/parity-tools/text-probe (UILabel-
  free RN path: NSLayoutManager, usesFontLeading NO, lineFragmentPadding 0) and matched pixel for
  pixel: the line is hhea ascent + descent (no lineGap), the baseline the hhea ascent below the
  box top (CoreText ignores USE_TYPO_METRICS: AntDesign, Entypo, Ionicons), trak values truncated
  to whole units, glyphs drawn by CoreGraphics (x floored to the size's subpixel levels, y
  rounded down the screen, raw coverage). The old "half the lineGap above the ascender" was the
  box being a lineGap too tall. Vector-icon glyphs drawn as SVG paths in a Contract box still
  need that offset by hand (the box is Contract's).
- `-exact-exit-animation` must be one literal declaration (no `${…}`), or the web target
  refuses it. Write the curve out (`cubic-bezier(0.455, 0.03, 0.515, 0.955)` is inOut(quad)).
- RNGH's iOS Pan: a plain `Gesture.Pan()` is UIKit's UIPanGestureRecognizer untouched (RNPanHandler.m
  adds nothing without custom criteria; `failOffset*` alone is none) and reports
  `translationInView:` of the window, so a view's own transform plays no part. It begins on the first
  move 10 pt or more from touch-down, and its translation depends on when (exact/parity-tools/pan-probe,
  a bare recognizer): from ~90 ms after touch-down it leaves out exactly the 10 pt along the set-off
  (a 12 pt begin reads 2; slow drags: 140 → 130 at any move size; RN's wheel-picker 104.5 → 94.3,
  floating-modal 99.95 → 90.1); earlier, UIKit defers the begin a frame and zeroes the translation at
  the finger (12 pt at 30-83 ms reads 0; 0.6 s drags of 140 pt: 124.3-129.7 by move size). Custom
  criteria (`minDist`, active offsets) `setTranslation(.zero)` at activation instead. A finger at
  rest sends no moves, so the lift's `velocityX/Y` is the last move's (a drag held still still flings
  a snapPoint one tick on). The gesture-handler crate's `PanGesture` does all of it
  (`.min_distance(d)` is the custom-criteria case; a test that wants the 10 pt left out moves 90 ms
  or more after its down). The RN Debug app loses more on fast drags (swipe-cards: 113 for 140 pt in
  0.6 s, 127.9 in 2 s): its busy main thread; parity follows UIKit (Release). react-native-skia-gesture
  is an RNGH Pan underneath. The demo screen's close Pan (activeOffsetY 10, failOffsetX ±30) does not
  change a demo pan's activation. A Rust UIScrollView zeroes the velocity after a rest itself
  (`ui_scroll::release_velocity`).
- UIScrollView (measured, selectable-grid-list's FlatList): the drag is 1:1 from the pan's
  activation; at the lift it decelerates (0.998/ms) only from a finger faster than ~335 pt/s and
  not after a 100 ms rest: `ui_scroll::uiscroll_release`. Below that it stops under the finger.
- UIScrollView bounce and deceleration (measured with `tools/scroll-probe`, a bare UIScrollView
  logging contentOffset per display frame; drive it with argent at y 0.6): the bounce is critically
  damped at 0.01088/ms from a start velocity of 0.00797 × the overshoot toward the edge (plus the
  banded content velocity), not from rest; UIKit projects a fling (v − 0.00988) / −ln(rate) and
  stops when the velocity falls to 0.00988 pt/ms; a target RN's snapToInterval moves after a
  still lift glides at λ = 0.01464 (~300 ms), not at the deceleration rate. `ui_scroll` does all
  of it. A still lift below ~335 pt/s reports velocity 0 to willEndDragging, so snapToInterval
  rounds. Measure a new scroll question with the probe before guessing: RN's recordings can't.
- UIScrollView's drag (scroll probe, argent drags): the pan begins on the SECOND move past the
  10 pt hysteresis (7 of 9 drags) and the content follows 1:1 from that move; the lift's own
  point does not move the content. A 101 pt flick so lands one snap shorter than a pan-style
  start (color-carousel). `ui_scroll` does it. UIKit clamps `decelerationRate` to fast (0.99) at
  least: RN's `decelerationRate={0.8}` is fast.
- RN ScrollView snapping on iOS: `snapToInterval` / `snapToOffsets` override `pagingEnabled`
  (ScrollView.js sets it false), so a list with both snaps by RCTEnhancedScrollView's rule, never
  by UIKit's page. Evenly spaced `snapToOffsets` are `Snap::Interval`.
- Remote photos in a Rust surface: download the exact URLs RN requests (same `w=`) into
  `gpu/images/<slug>/` and `include_bytes!` them (coverflow, circular-carousel: ~1 MB total).
- packages/skia: a continuous rrect with r ≥ half its side (a continuous circle or pill) leaves a
  1-sample AA crack one pixel inside its extremes (reported; circular-carousel's rings show it).
- Icon fonts drawn in Rust (`draw_text` of an AntDesign / Entypo glyph): TextKit sets the glyph
  half the font's hhea lineGap below box top + ascender (twodos-slide's check was 5.6 px high).
  Add `font.metrics().leading / 2` to the top before `gfx::baseline`.
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
- Yoga rounds a View's edges to the nearest device pixel but FLOORS a Text node's relative
  left/top (`textRounding`): a label centred 0.833 pt into its row sits at 0.667, not 1.0
  (measured by `nativeFabricUIManager.measure`: twodos-slide's label, telegram-theme-switch's
  tab icons, fluid-tab-interaction, both 1 px low before). A Text's measured side is ceiled
  after an epsilon, so an exact 13 or 28 measures 13.333 / 28.333. In Rust: floor the Text's
  offset inside its parent (`text_grid`); in Contract: `position="relative"` back onto RN's px.
- RN `fontWeight` is a UIFontWeight, which San Francisco draws at its named instance's `wght`:
  '500' 510, '600' 590, '800' 860, '900' 1000 (`skia::match_ui_font` does it: `ui_weight`). At
  the CSS number a semibold label was a hair heavy (expandable-mini-player's "Demo", max 44).
- Subsetting an icon font with fontTools: keep `recalc_bounds = False` (and load with
  `recalcBBoxes=False`). MaterialCommunityIcons' headers say xMin 0 where the outline starts
  at 64 with lsb 0; CoreText shifts a glyph by lsb − xMin, so recalculated bounds moved every
  icon 1.6 pt left.
- iOS Fabric applies zIndex as the layer's zPosition, which hit-testing ignores: a later sibling
  takes the touches over an earlier one even when it draws below it (fluid-tab-interaction:
  the pill and the blur cell, zIndex 1, block the selected cell, zIndex 2; a held press there
  doesn't scale it in RN).
- Reanimated's `cancelAnimation(sv)` (and any assignment over a running animation) calls that
  animation's callback with `finished = false`. A callback that ignores the flag runs its reset
  then (fluid-tab-interaction: an interrupting press clears activeIndexes, so the second pulse
  blurs no cell).
- A bundled font with USE_TYPO_METRICS in a Contract `textarea`/`input`: the host sets the first
  baseline at the typo ascender, UITextView at the hhea one (AddingtonCF: 461 / 2048 em lower,
  16 px at 24 pt). Pad the field by the difference (dot-sheet).
- Keyframes accept only sRGB `rgb()` colours (`color(display-p3 …)`, `oklch()` are BadValue): a
  keyframed colour that ends outside sRGB clips. Fade a box of the exact P3 colour in over the
  last stop on the same timeline (github-contributions levels 2–4).
- `filter` neither transitions nor keyframes (`lower-keyframe-property`): an animated layer
  shadow without a shadowPath (one that follows the content) can't spring in Contract
  (email-demo's highlight).
- A `transformDragFor` handle moved out from under the finger (by a counter-translation of its
  ancestor) ends the host drag: keep the handle on the dragged layer and move only what is drawn
  (action-tray's −50 clamp). RN's own clamps that freeze on "the last update above X" land
  where the event cadence puts them (−43.3 on a slow argent drag): the limit is X.
- RN `textAlign: 'center'` on a Text: Yoga ceils the Text's measured width to the pixel grid and
  TextKit centres the line in that box, so the glyphs start half the slack right of the box
  (fluid-tab's "Accounts": 63.14 in 63.333, 0.29 px; its o, u, s crossed a pixel edge). Add
  `(ceiled − width) / 2` to the x in Rust.
- RN's Text draws in its view's drawRect: ink past the (ceiled) frame is cut (dot-sheet's "g"
  lost its last row, max 239). `overflow="hidden"` on a Contract `text` doesn't clip on iOS: wrap
  it in a box of RN's frame that clips.
- iOS host: a full-screen `canvas` takes the touches under it whatever its `pointer-events`
  (dot-sheet's Start and Back did nothing). Give the controls under it a higher `z-index`
  where the drawing never covers them.
- iOS host: the keyboard's default policy (`resizes-content`) shrinks the screen above the keys;
  RN moves nothing unless the demo has a KeyboardAvoidingView. app.contract's
  `overlaysKeyboard(slug)` sets the root's `interactive-widget="overlays-content"` per demo.
- `-exact-spring` on translate/scale/rotate/opacity carries the running velocity into a retarget
  unconditionally (motion/src/engine.rs); Reanimated's withSpring zeroes it when it points away
  from the new target (spring.ts onStart). A reversal mid-flight (steddy's highlight, any toggle
  tapped twice) differs: RN restarts from rest, Exact keeps going first. Rust, or a host option.
- RNGH's iOS Tap has no distance limit by default (maxDist/maxDeltaX/Y NaN), only maxDuration
  500 ms; `maxDeltaX/Y` bound each axis, `maxDist` a radius. The crate's `TapGesture::default()`
  is that; pressto's buttons (BaseButton) also have no duration: `.max_duration(f64::INFINITY)`.
- UIScrollView: a touch that never drags gets no scrollViewWillEndDragging, so RN's snap never
  runs: a caught snapping list rests where it is (`ui_scroll` does it).
- iOS host: a transition begun by a commit a surface's `message` made (the `timer` surface) can
  play its first frame at the end: popup-handler's corner spring and a plain box in the same commit
  jumped in one frame at 400 and 800 ms, sprang fully at 50 and 200 ms (a keeper animation running
  meanwhile did not help). Begin the motion from the input's own commit instead: a delayed spring
  is keyframes with an `animation` delay and `backwards` fill on a box sized to the travel
  (`translate` from ∓100 % to 0, the spring sampled into a `linear()`), the moved box set to its
  end at once (popup-handler). Check toast / stacked-bottom-sheet timers the same way.
- iOS host: a `transformDragFor` target takes only a spring (or no) `translate` transition: a
  `linear()` / duration transition on it keeps the drag from binding at all, even at rest. And
  every ancestor of the handle below the target must be untransformed and not animating while a
  drag starts (`supported_mapping`): a running keyframe on a wrapper refuses the drag until it ends.
- Shared tree: a commit through a private `GIT_INDEX_FILE` leaves the shared index on the old
  content of those paths (`git status` shows MM: anyone committing then reverts them). After it,
  `git reset -q -- <your paths>` with the shared index.
- RN Metro on 8082 can stop seeing edits (watchman here fails to load: libfmt.10.dylib missing),
  and serves the old transform after a reload: grep the served bundle before trusting an
  instrumentation run.
- A canvas that overhangs its box inside a Contract `scroll` (a shadow's reach, `left=-48`)
  widens the scroll's content: the list then scrolls sideways (email-demo, all rows cut on the
  left after a horizontal drag). Give the `scroll` `overflow-x="hidden"` and its content column
  `width="100%" overflow-x="clip"`. A canvas with no input inside a Contract scroll does not
  take its drags: the native UIScrollView still scrolls over it (no `ui_scroll` needed).
- Yoga rounds each node's position RELATIVE to its parent (half up; a Text's floored) and its
  size from the unrounded absolute edges, so an inset of 0.5 (a 0.5 border) puts the children at
  0.667 and nested centring can land a third of a point off a whole-tree rounding. email-demo's
  labels: title at 18, subtitle at 42.333 (pixel-exact only with the per-parent sum).
- `exact_gpu::fixture` on the Mac draws San Francisco from the Mac's own SF file: text positions
  read from a fixture can be a pixel off the simulator's. Judge text placement on device.
- A RN Text's `lineHeight` (TextKit min = max line height, NSBaselineOffset (lineHeight −
  UIFont.lineHeight) / 2): the glyphs' baseline is offset + ascent below the box top (text probe:
  15.332 for SF 15 at lineHeight 20).
- A bundled font's `trak` table is NOT applied to an RN Text (SF-Pro-Rounded-Heavy at 32 was
  0.375 pt a glyph wider with it, +24 units); `Font::with_ui_layout` applies it when present, so
  drop `trak` from a bundled subset (fontTools' subsetter does). The system font's is applied.
- expo-image ignores `borderCurve` (ListItem's own TODO): its radius is circular, measured. It
  downscales a larger photo with `UIGraphicsImageRenderer` at the view's pixel size before Core
  Animation shows it 1:1: run that once on the simulator and bundle the result (email-demo).
- expo-linear-gradient's layer masks to its bounds, so RN draws its border and radius with Core
  Animation (circular unless borderCurve), and its colours are a CG gradient in DeviceRGB from
  start × size to end × size (isolines perpendicular to that axis, not CSS's corner-to-corner).
- RN's border on a view that does not clip (translucent or not) is RCTBorderDrawing's ring with
  circular corners over the background layer (which keeps the view's cornerCurve); only a
  clipping view (or a hidden border) gets Core Animation's border.
- Reanimated `withSpring(v, { velocity })` starts from the running animation's velocity PLUS
  `velocity` (just `velocity` from rest), then drops it when it points away from the target: a
  flip back from rest starts from 0 (airbnb-flip-interaction).
- expo-blur at intensity 0 shows no effect even though its fraction clamps to 0.01 (the page
  under airbnb's BlurView is sharp at rest): treat intensity ≤ 0 as none.
- A Core Animation layer moved by translateY (a Keyframe on a View of text) is its backing store
  resampled at the fractional offset, not glyphs re-rasterised: pre-render such a layer and
  sample it bilinearly (airbnb's pages).
- An RN Skia `<Canvas>` is cleared TRANSPARENT (a `backgroundColor` in its style is the View's),
  and Core Animation colour-matches its Display P3 surface per pixel UNPREMULTIPLIED before it
  blends over that View: an AA edge or a glow keeps its colour's sRGB hue. Converting the
  premultiplied (or pre-blended) P3 value instead gave spiral's cyan glow up to 10 levels of red
  RN has not. Compose `p3_to_srgb(rgb / a) * a + view × (1 − a)`.
- A Group `layer` with an image filter is a layer in the surface's space, encoded Display P3:
  gradients mix there and the blur mixes P3 values (an sRGB-encoded blur of a saturated colour is
  up to 18 levels off). `Renderer::p3 = true` keeps a packages/skia target in P3 (gradients stay,
  other colours are converted); convert once at the end. Skia sizes such a layer to the filter's
  input, the device clip outset by the blur's `ceil(3σ)` (when the content has no bounds), so what
  lies just off screen glows into the edges: draw the layer that much larger (spiral).
- A path of many small `addCircle`s (spiral's 1641) is one Graphite path, a 4× MSAA union: the
  sub-pixel circles take quarter coverages. Instanced analytic circles overstate them (a r 0.6 px
  dot lit 4 pixels): draw RN's path with `draw_with` + `skia::add_circle` (~1.7 ms CPU a frame).
- iOS Graphite rounds each gradient value to 8 bits in P3: on saturated cyan one P3 level of red
  is ~11 sRGB levels, so a sweep's seam can step a few pixels apart from RN's (sub-level float
  arithmetic, not a model error).
- The RN app today (pressto 0.7.0 on RNGH 3.3) shows NO press feedback: pressto hands BaseButton
  `onBegan`/`onActivated`/`onEnded`, but RNGH 3.3's v3 BaseButton reads only `onBegin`/
  `onActivate`/`onFinalize` (propsWhiteList.ts), so `active` never turns true. Its onFinalize then
  calls onPress on any uncancelled lift, inside or not (a key slid off still types; measured on
  mobile-input and steps' Continue). The owner's decision: port pressto's design (progress on press
  in/out, onPress only on a lift inside), not the bug.
- pressto is the global press system; use it (packages/pressto, Contract and crate). Its timing is
  pressto's (250 ms on CSS `ease`, a full run from the current value on every retarget): the
  host's `:active` is a fixed 120 ms on cubic-bezier(.16, 1, .3, 1) that nothing changes, so no
  pressable uses it. A node with `pointerdown`/`pointerup` gets no host dim. A node that already
  has its own `scale` takes the press on a box inside that fills it (smooth-dropdown); its own
  `transition` joins `pressTransition(…)` with `, `. Never write `haptic("selection")` for a press:
  call `pressablesOnPress()` (or post `haptic:selection` from a surface).
- RNGestureHandlerButton's inside test is `locationInView:self` against its own bounds: through
  the view's transform. A pressable scaled to 0.9 while held has a 0.9 hit frame; test the lift
  in the key's transformed bounds (mobile-input).
- Yoga, a wrapping row with `alignItems: 'center'`: each item's BORDER box is centred in its line,
  whose height includes the trailing margin, so the item sits margin / 2 below the line's top
  (mobile-input's keys at 498 + 4.9, measured 503).
- A `Chain` of timings (withSequence / withRepeat) starts each step at the frame the last one
  ended: a fixture rendered at sparse times (0, 6000, 12100 ms) lands mid-chain on the wrong step.
  Step the surface every 16 ms before an "at rest" render.
- CoreGraphics draws an RN Text line's baseline on the next device pixel DOWN (ceil); the iOS
  host rounds to the nearest. A single-line text whose TextKit baseline lands .01-.49 px past a
  pixel sits 1 px high: `position="relative" top="0.1666px"` (just under half a device pixel at
  3x) makes nearest a ceil. Lines 2+ of a multi-line text are rounded from the text's snapped
  origin (k × line height): neither an offset, a padding nor a line height reproduces ceil for
  every line (scroll-progress' descriptions: lines 2-5 at .12/.24/.36/.48 px sit 1 px high). Host
  limit; Rust text if it must be exact.
- A 0.5 pt border on a non-clipping RN View draws 2 full device rows (RCTBorderDrawing), and Yoga
  lays the children out at the unrounded inset and rounds their edges half up: a margin-5 child
  starts 5.667 in and ends 5.333 short (scroll-progress' pill). Contract: border 0.66667 and the
  child's margins 5 / 4.66667 (right, bottom), its padding rebalanced to keep RN's unrounded
  content box.
- Order between an exit and what a commit starts with it: RN's `exiting` starts at the Fabric
  mount, a `useAnimatedStyle` whose deps changed (a backdrop's `withTiming`) only when its mapper
  re-runs after the JS effect, so the leaving view leads (stacked-modals: ~20 ms). The iOS host
  does the opposite: in one commit a `transition` (or a plain animation) on a box led a
  translate keyframe animation on the leaving card by ~28 ms (not the drag timeline, the
  `pointer-events` switch nor a `to`-only keyframe: each measured). Measure same-frame pairs
  (argent's recordings are resampled to 30 fps: compare two values in one frame, never frame
  times), and delay the follower (`animation` delay; a retargetable fade is one 0 → 1 keyframe
  pair with a computed `linear()` of RN's values from the current one: stacked-modals' backdrop).
- RN's ReText is a TextInput: UITextField centres the line a device pixel above where a Text
  would sit (scroll-progress' percentage).
- The demo screen is UIKit's `.overFullScreen` presentation (the home stays beneath). Contract
  cannot round or clear the presented controller's view (a fullscreen route's backdrop falls back
  to its ancestors' or the system background, never clear), so RN's card corners (continuous
  SCREEN_CORNER_RADIUS, 62 on iPhone Air, clipped) are the `screen-corners` module view
  (modules/apple/Demos.swift) setting the presented view's layer as Fabric sets RN's card.
- A SwiftUI view in a module tag: Exact rounds the module box to whole points and the hosting
  view centres its content in it, so a fractional-size control (the glass close, 47.33 pt) lands a
  device pixel off. Author the box and pin the SwiftUI content to the edge RN anchors it at
  (`.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)`); return the
  hosting controller's view itself as the instance's view (a wrapper UIView offset it by half its
  size). `label` is refused on a module tag (it is `aria-label`): name it otherwise (`caption`).
- iOS host, `-exact-layout-transition` on a state toggle (animated-grid-list grid ↔ list): the
  photo's clip box (a `Reflow` child) shows its new size on the commit's first frame, square, and
  the cards' 700 ms transitions start ~4 frames (~130 ms) after it; RN starts every layout
  animation on the same frame, the photo shrinking and rounding over 300 ms. Unsolved.
- `pgrep -f "exact.mjs ios"` also matches a shell whose own command line contains that text (a
  wait loop): check the build lock with a bare `pgrep` call, never from inside a loop that greps it.
- The RN dev client launched cold by its `exp+thank-you://expo-development-client/?url=…` link
  lands on Unmatched Route (RootLayout pushes the dev-client URL's path) and later `demos://`
  links stay there. `restart-app com.reactiive.app` with no URL reconnects to Metro and shows the
  home; then the deep links work. Never `simctl terminate` the RN app.

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
  `backdrop-filter` don't animate. The fix is `skia::backdrop` (UIKit's partially animated blur, measured by
  `exact/parity-tools/blur-probe`): a Rust surface draws what is under the BlurView and runs the
  tint's chain at intensity / 100 (blurred-bottom-bar, dynamic-blur-tabs, bezier-curve-outline,
  airbnb-flip-interaction).
- `border-radius` doesn't animate: draw the body in Rust under the Contract content
  (alert-drawer, dot-sheet: `alert_drawer_card.rs`, `dot_sheet_card.rs`).
- liquid-glass-playground: progressive haptics every 5 px of drag (needs per-move logic).

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

- iOS host: `object-fit="cover"` pins the image to the TOP when it crops vertically (CSS and
  expo-image centre it; Contract has no `object-position`). When the photo is taller than its box
  at cover scale, lay the cover box out by hand: a clip box, the image absolute at
  `max(w/iw, h/ih)` × its size, centred (see swipe-cards). Horizontal crops are fine.
- `-exact-exit-animation` must be one literal declaration (no `${…}`), or the web target
  refuses it. Write the curve out (`cubic-bezier(0.455, 0.03, 0.515, 0.955)` is inOut(quad)).

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
  (blur pulses), blurred-bottom-bar (intensity 40 → "regular").
- `border-radius` doesn't animate: alert-drawer (mid-spring radius).
- liquid-glass-playground: progressive haptics every 5 px of drag (needs per-move logic).
- stacked-modals: the 60 ms × index stagger on exit (an exit animation is one literal).

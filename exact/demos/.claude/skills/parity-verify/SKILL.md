---
name: parity-verify
description: Prove an Exact demo matches the RN demo — still frames and motion, side by side, same gestures at the same moments — and list every difference until there is none. Use before a demo counts as ported, and whenever the owner says something looks or moves differently.
---

# Parity verify

The RN dev build and the Exact build run on the same simulator (`demos-dev-loop`: Metro 8082,
`demos://animations/<slug>`, `demos-exact://demo/<slug>`).

1. **Stills at rest.** `WAIT=5 ./tools/compare.sh <slug>` → `/tmp/compare/<slug>.png`. Compare
   at full resolution (`/tmp/compare/<slug>-rn.png` vs `-exact.png`, 1260×2736): positions,
   sizes, radii, colours, fonts, line heights, shadows, every element present. Measure in
   pixels where in doubt; don't judge by eye on a thumbnail.
2. **Motion.** For each gesture or animation the demo has (tap, press-and-hold, drag, fling,
   scroll, its idle loop): open the RN demo, argent `screen-recording-start`
   (`trimStatic: false`, `showTouches: false`), the gesture as one `run-sequence` with fixed
   delays, `screen-recording-stop`; then the identical sequence on the Exact demo. Align both
   on the gesture's first event and build a grid:
   `python3 tools/frame-grid.py rn.mp4 <t0> exact.mp4 <t0> /tmp/grid.png 0.05 0.15 0.3 0.5 0.8 1.2 2.0`
   (RN top row, Exact bottom). Same pose at the same time, same overshoot, same end.
3. **List the differences** as facts (what, when, RN vs Exact), fix them in order of
   visibility, repeat until none is left. If Contract can't reach parity, move that part to
   Rust (`port-demo`).
4. **Then** the demo goes in `tools/ported.txt`.

## Motion verdict: audit first, record second

argent's recordings of the RN Debug app drop every other frame (about 15 fps), so a recording
can't time RN to tens of milliseconds. Motion parity is proved in two parts:

1. **Audit (decides timing and feel).** For every animated value in the RN source, write a row:
   value, driver (withSpring / withTiming / withDecay / interpolate / gesture), config (stiffness
   / damping / mass or duration + dampingRatio, duration, easing, delay), input and output ranges,
   extrapolation, what triggers it, what cancels it, the haptics. Check the Exact side against
   each row. `packages/reanimated` is Reanimated's math line for line, so equal rows mean equal
   curves. Contract `-exact-spring(k, c, m)` is the same spring; durations go through
   `tools/spring.ts`.
2. **Recording (decides structure).** At 15 fps a recording still shows the wrong property
   moving, a wrong direction, a missing stagger, a wrong end state, or a gesture threshold firing
   at the wrong place. Use it for that, not for timing.

A demo's motion is "identical" only when every audit row matches and the recording shows the same
structure.

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

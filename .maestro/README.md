# E2E tests — one hand-maintained test per demo

[`animations/`](./animations) holds **one test file per demo** (`<slug>.yaml`,
the slug = the `AnimationRegistry` key). Each is a standalone, editable test —
no generator, no shared template. Edit a demo's test directly.

## What each test does

Every demo renders into Skia / WebGPU canvases, so a view-tree inspector can't
see inside the canvas. Each test works *with* that:

1. **deep-links straight to the demo** — `demos://animations/<slug>`.
2. **drives the demo's real interaction** by `testID` selector — `tapOn {id}`,
   `swipe {from:{id}, direction}`, `inputText`. ennio resolves each testID to
   its real rect on whatever simulator runs it, so there are **no hardcoded
   coordinates** and a gesture can't silently miss.
3. **asserts the actual outcome.** Each demo exposes its result as a
   near-invisible accessible probe (`Text testID="<slug>-status"`), and the
   test asserts the expected post-interaction value — e.g. `mobile-input` →
   `unlocked`, `sudoku` → `cell:5`, `floating-bottom-bar` → `tab:bookmark`. The
   test passes **only if the interaction produced the right result**, and fails
   if it didn't.
4. captures `<slug>--mounted` / `<slug>--after` screenshots as artifacts.

A handful of demos are render-only (passive auto-animations; `art-gallery`
where react-native-webgpu renders blank in the sim; `chessboard` which hides
its chrome and auto-replays) — those assert their canvas renders.

## Running

```bash
bun run e2e                                      # all tests (full relaunch per test)
bun run e2e:one .maestro/animations/sudoku.yaml  # one test
```

Needs a booted iOS simulator with the app installed and the ennio CLI
(`npx @reactiive/ennio`). Metro must be serving this project — **use a port
other than 8081 if 8081 is taken by another project** (`bun start --port 8082`).
`--disable-reuse-app` gives each test a clean process so a stale outcome from a
prior test can't false-pass.

## Adding a demo

Add `<slug>.yaml` here, mirroring an existing one: deep-link in, drive the
control by its `testID`, expose the result as a `<slug>-status` probe in the
demo, and assert it.

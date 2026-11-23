# Upgrade to Exact 98ed61fb (2026-11-23), from 2180d806

360 upstream commits (1,419 files). The app is on `98ed61fb2a7d618ce90af2c40f349bb9ea91c706` (upstream `main`), a new detached
worktree of the shared object store (`git -C ~/.exact/exact2/94b8671f... worktree add --detach ~/.exact/exact2/98ed61fb... 98ed61fb...`);
its `target`, `node_modules` and the Hermes installer's `target` are APFS clones (`cp -cRp`) of the 2180d806 checkout's.
`exact.mjs`'s `seed` (set by hand in #114, which `update` keeps as it is) now names the new checkout; `bun exact.mjs update` changed
nothing else in the repo; `bun exact.mjs lock` resolved `Cargo.lock` (wgpu 30.0.1 -> 30.0.2, exact-route and sha2 new deps of
Exact's own crates). Toolchain (1.99.1), wasm-bindgen pin (0.2.130) and the Hermes pin are unchanged: no machine setup needed.

## What broke

Nothing the app writes. The Contract compiler builds `app.contract` with 0 errors, the Swift modules (`modules/apple`) and the
GPU crate compile unchanged, and every test passes. The changes that touch what the app uses (portal elements, the iOS bar's
closed set, a dialog's header as its sheet's bar, sheet detents on dialogs, translucent web canvases, Android first content)
needed no edit here.

## Workarounds

- Removed: the web page module's `GPUCanvasContext.configure` override (2b9ad379, `modules/web/index.js`), which configured
  every canvas `premultiplied` because wgpu's WebGPU backend listed only `opaque`. Upstream 452bfeae1 pins wgpu 30.0.2 for the
  web, whose WebGPU backend lists `[Opaque, PreMultiplied]`, and `gpu/src/target.rs::alpha_mode` picks `PreMultiplied` for a
  surface that is not opaque and `Opaque` for one that is (alpha 1 everywhere by `Surface::opaque`'s contract: the same pixels as
  premultiplied). Verified without the override, dev and production builds in headless Chrome with WebGPU: sudoku's overlay
  canvases are configured `premultiplied` and the board shows through (the bug the override fixed was an all-black page);
  translucent surfaces (chessboard, fractal-glass, airbnb-slider, telegram-theme-switch, the sculptures/art-gallery overlays)
  `premultiplied`, opaque ones (card-shader-reflections, fibonacci-shader, the full-screen layers) `opaque`.
- Kept: `inspiration-sheet` (`modules/apple/InspirationSheet.swift`). da39d2e5f gives a Contract `dialog` sheet detents, a
  grabber and a fitted height on iOS, but the sheet opens from the full-screen demo route, which still cannot present a
  `dialog` (demos/route-alert.contract), and the module's look (system material, icon, the capsule action) is not a dialog's.
  Not equivalent, so not replaced.
- Kept: `gpu/Cargo.toml`'s native `wgpu` `std` feature (#114). Exact builds wgpu with `std` since b768e92c0, so on this pin it is
  redundant; it keeps the warm-up's error scope per thread on any older checkout a fresh clone could still link.
- Local patch (`Surface.swift`, `BorderPaint.reduced`): still NOT fixed upstream on 98ed61fb (line 158 passes the authored
  radii; neither file changed upstream). Re-applied in the new checkout, uncommitted there; `radius-reduced.patch` applies as is.

## Checked (iPhone 17 simulator D3D786DE, and headless Chrome with WebGPU)

| check | result |
|---|---|
| `contract build app.contract --errors-only` | 0 errors |
| `tools/lint.sh contract` | 0 new problems (39 accepted in the baseline, 11 baseline entries now fixed) |
| `tools/lint.sh ts` | tsconfig.json clean (.parity: 58, not gating) |
| `tools/lint.sh rust` | rustfmt OK; clippy 5 lints above `rust-lint-baseline.txt` (approx_constant, chunks_exact_to_as_chunks, field_reassign_with_default, unused_mut, unused_variables), all in app files this upgrade does not touch: the baseline was recorded on rustc 1.97.0 (2026-11-15), the repo is on 1.99.1 since c193f394. Not from this upgrade |
| `cargo test -p demos-gpu` | 366 passed, 7 ignored; `tests/warm_configure.rs` 1 passed |
| `cargo check -p demos-gpu --target wasm32-unknown-unknown` | clean |
| iOS simulator build (`ios --run`) | built and launched (cargo 233 s, swift 147 s, cold for the new checkout's host crates) |
| first home frame (`startup-measure.sh -n 3 -a`, load 6.5) | warm runs 0.37 and 0.60 s, cold first run 1.73 s; the app's own first commit (`probe_first_commit_ms`) 16.5 and 24.7 ms warm, vs 15.9 and 16.6 ms on 2180d806 (load ~4.8). No upstream Apple-host commit in the range touches launch, plan apply or image decoding, so the difference is load, not a regression; 0 placeholders, 0 search flash frames. To settle it: alternate old and new builds in A/B pairs, 10+ each at load < 5, drop each cold first run, compare medians. |
| launch stress (tools/launch-stress.md, strict, random 0.5 s SIGSTOP stalls) | 43 sessions, 43 grouped closes, 0 bad, no `error scopes` panic, app alive, no new crash report |
| close gesture, pull-to-search, a search result's close, Inspiration sheet | all as before (the sheet: grabber, fitted, system material, drag to dismiss) |
| 14 demos by deep link vs the 2180d806 build (before) | same pictures: RMSE 1.1-2.1 % (clock, animation phase); fibonacci-shader 3.8 % and fractal-glass 6.4 % are animating shaders |
| web dev server: framed launcher + 11 demos open/close (chessboard by the pull) | all open and close, 0 page exceptions |
| production web build, `load.ts`, cable 1x desktop | 5.75 MB / 145 requests; FCP 0.49-0.66 s, launcher drawn 0.62-0.76 s, GPU ready 4.7-5.2 s; 1 long task 127-130 ms (2026-11-23 final: 0.90 / 0.98 / 5.12 s) |
| same, 4G + 4x CPU, 390 x 844 | FCP 2.10-2.13 s, launcher 3.35-3.48 s, GPU ready 8.97-8.99 s; long tasks 2 / 622-629 ms / max 548-555 (final: 2.77 / 4.02-4.18 / 9.65 s; 3 / 1097-1101 / 971-977) |

Noticed while checking, not from the upgrade: `tools/lint.sh generated` reports a stale `Architecture.generated.swift`
(line counts); a tap on the web launcher within ~0.7 s of an arrow-key page change is taken by the settling pager, as on iOS
(`tools/web-perf/runtime.ts`'s 700 ms wait can miss an icon off page 1).

## Rollback

`git revert` this upgrade's commits, then `EXACT=~/.exact/exact2/2180d806c4d7a3668c6423ea34cda497be26ad4d bun exact.mjs ios --run --sim <udid>`
(and the dev server with the same `EXACT=`). The 2180d806 checkout is untouched (its `Surface.swift` patch and `target` included).

# Upgrade to Exact 2180d806 (2026-11-20), from c193f394

14 upstream commits (98 files: host/apple ExactKit batch/publication timing, web-js, contract lower/syntax/cli, runner; nothing the
app calls changed). The app is on `2180d806c4d7a3668c6423ea34cda497be26ad4d` (upstream `main`), a git worktree of the same object
store (`~/.exact/exact2/<hash>`), made as before: `git worktree add --detach <path> origin/main` from the c193f394 checkout, then
`EXACT=<path> bun exact.mjs update` (the `.exact/checkout` symlink now points there; nothing in the repo changed, no hash is
committed) and `lock` ("current; no changes"). To save disk, the new checkout's `target`, `node_modules` and the Hermes installer
`target` were APFS clones (`cp -cRp`) of the old checkout's: only what the build rewrites takes space.

- Fixed upstream (expo/exact#1133, our report): b768e92c0 builds wgpu with `std` in the native GPU module and the Ink renderer, so
  validation error scopes are per thread again. `gpu/src/warm.rs` has its scope back (see below); `cargo test -p demos-gpu` still 336.
- Local patch (`Surface.swift`, `BorderPaint.reduced`): still NOT fixed upstream on 2180d806 (line 158 passes the authored radii);
  re-applied in the new checkout (uncommitted there), `radius-reduced.patch` applies as is. Do not `git clean`/`checkout` it.
- Machine setup: the Hermes bundles for aarch64-apple-ios-sim and aarch64-apple-ios were already installed for this pin; the
  wasm-bindgen 0.2.130 CLI is still first on `PATH` for the dev server. Build with `CARGO_INCREMENTAL=0` on a tight disk (each
  incremental dir is 1.5-6 GB).
- Checked on the iPhone 17 sim (D3D786DE): contract build 0 errors, Contract linter 0 new problems (50 accepted baseline),
  `cargo test -p demos-gpu` 336 passed, `cargo check` for wasm32 demos-gpu and draw2d/motion/gestures/noise/pressto clean.
  Cold start (`tools/startup-measure.sh -n 5 -a`, machine load 6.6 median): first home frame 0.40 s, fully bright 0.60 s (c193f394 at
  load ~7: 0.37 / 0.57; 730abad1 at load ~4: 0.27 / 0.47); the first run of five is the cold-cache one (1.67 / 1.87 s), the other four
  0.33-0.60 / 0.53-0.80. Launch stress (tools/launch-stress.md, strict, with random 0.5 s SIGSTOP stalls): 35 sessions, 35 grouped
  closes, 0 bad, no `error scopes` panic, no new Demos crash report. An earlier run at machine load 40-60 hit one
  `opens ungrouped` (the route was adopted 2.2 s after the touch, past the 2 s window): a starved machine, not reproduced at load 7.
- `gpu/src/warm.rs`: the warm-up frame has its validation scope back (it was removed in 65646a7a for #1133). Benefit: a shader or
  pipeline validation error in the warm frame is reported and dropped instead of aborting the app. Verified by the stress run above.
- Rollback: `git revert` the two commits of this upgrade (warm.rs scope, notes), then point the build at the old checkout:
  `EXACT=~/.exact/exact2/c193f39435fdc24000ba2edeb48eda6acc64fc36 bun exact.mjs ios --run --sim <udid>` (and the dev server with the
  same `EXACT=`; the gitignored `.exact/checkout` symlink is re-pointed by it). The c193f394 checkout keeps its sources and its `Surface.swift` patch; its `target` was removed (a cache, a cold
  rebuild). The 730abad1 checkout is untouched.

# Upgrade to Exact c193f394 (2026-11-20), from 730abad1 (2026-11-14)

1,370 upstream commits. The app is on `c193f39435fdc24000ba2edeb48eda6acc64fc36`, a git worktree of the same object store
as the older checkouts (`~/.exact/exact2/<hash>`). The old checkout `730abad1...` is untouched (its `Surface.swift` patch
included) and is the rollback.

## What changed for the app

- `exact.mjs`, `AGENTS.md`/`CLAUDE.md`, `Cargo.toml`, `apple/` and `web/` `Cargo.toml`, `app.json` `$schema`, `package.json`
  (`@exact/motion`), `rust-toolchain.toml` (1.97.0 to 1.99.1): `bun exact.mjs update` + `lock`. The checkout is now
  `.exact/checkout`, a gitignored symlink `exact.mjs` creates; no commit hash is in the committed paths any more.
- `gpu/Cargo.toml`: `wasm-bindgen = "=0.2.130"` (what `lock` asked for: the web build's CLI version).
- exact-gpu 0.4: `Surface::device_ready(features, limits)`; `InputEvent::Pointer` has `shift_key ctrl_key alt_key meta_key`
  (`gpu/src/warm.rs` and 115 test constructors).
- exact-gpu wraps each canvas render in a wgpu error scope, and wgpu has no `std` feature there, so its error scopes are one
  stack for all threads. The warm-up thread's own scope (`gpu/src/warm.rs`) then interleaved with the main thread's and
  panicked ("error scopes must be popped in reverse order") during the first ~60 s after launch, under rapid open/close
  (launch-stress). The warm frame now runs without a scope. Any other app thread that pushes a scope has the same hazard.
- Nothing changed in `app.contract`, the Swift modules (`modules/apple`) or the Contract linter (0 new findings).

## Machine setup the new checkout needed (once)

`rustup target add aarch64-apple-ios-sim aarch64-apple-ios --toolchain 1.99.1`; the Hermes bundle
(`cargo run --manifest-path <checkout>/vendor/ibex/crates/hermes-lean-sys-installer/Cargo.toml -- --target aarch64-apple-ios-sim`);
`bun install --frozen-lockfile` in the checkout (the contract build imports rolldown); `cargo fetch --locked` in the checkout
(the web build resolves offline); wasm-bindgen CLI 0.2.130 (the dev server needs the CLI to match the pin). The one in
`~/.cargo/bin` is 0.2.127 (other checkouts use it), so 0.2.130 is in `~/.exact/bindgen-0.2.130/bin`, first on `PATH` for the
dev server: `PATH=~/.exact/bindgen-0.2.130/bin:$PATH bun exact.mjs web --port 5341 --lan`.

## Adopted / kept

- Adopted: nothing new to adopt was needed for it to work; the new "native modules linked by use" seams link our 18 modules from
  `app.json` `modules` as is.
- Kept: `background_color` / `color_scheme_dark` `#141414`. The docs say the default launch ground is the app's own background
  only where nothing paints over it to the screen's edges; the home's full-bleed wallpaper does, so the default would be
  `systemBackground` (white in a light scheme). Not changed, not measured.
- Kept: the page-dots hatch (`PageDots.swift` reads the pager's scroll view in `pageScrollerHatch`); it works unchanged, and
  #1043's "a route hatch reads its content scroll view when it asks" was not needed to prove anything more.

## Local patch

`host/apple/Sources/ExactKit/Surface.swift` (`BorderPaint.reduced(...)`, `.parity/exact-issues/radius-reduced.md`):
NOT fixed upstream (line 158 still passes the authored radii). Re-applied in the new checkout, uncommitted there as in the old
one; `radius-reduced.patch` applies as is (a line number differs). A new checkout of c193f394 without it loses the transition
corner fix. It is also in the working tree of `~/.exact/exact2/c193f394...`: do not `git clean`/`checkout` that checkout.

## Rollback

`git revert 65646a7a 9493e4e2` (or `git checkout f885e208 -- exact/demos`: the app lived in exact/demos then), then `EXACT=~/.exact/exact2/730abad161c2a5f6cd1f34ea164cda8d9ad6b358 bun exact.mjs ios --run --sim <udid>`
and restart the dev server with `EXACT=` the same (the old toolchain 1.97.0 and `~/.cargo/bin/wasm-bindgen` 0.2.127 are still installed).

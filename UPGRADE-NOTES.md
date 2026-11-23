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

`host/apple/Sources/ExactKit/Surface.swift` (`BorderPaint.reduced(...)`, `tools/parity/exact-issues/radius-reduced.md`):
NOT fixed upstream (line 158 still passes the authored radii). Re-applied in the new checkout, uncommitted there as in the old
one; `radius-reduced.patch` applies as is (a line number differs). A new checkout of c193f394 without it loses the transition
corner fix. It is also in the working tree of `~/.exact/exact2/c193f394...`: do not `git clean`/`checkout` that checkout.

## Rollback

`git revert 65646a7a 9493e4e2` (or `git checkout f885e208 -- exact/demos`: the app lived in exact/demos then), then `EXACT=~/.exact/exact2/730abad161c2a5f6cd1f34ea164cda8d9ad6b358 bun exact.mjs ios --run --sim <udid>`
and restart the dev server with `EXACT=` the same (the old toolchain 1.97.0 and `~/.cargo/bin/wasm-bindgen` 0.2.127 are still installed).

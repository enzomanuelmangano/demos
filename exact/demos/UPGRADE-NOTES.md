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

`host/apple/Sources/ExactKit/Surface.swift` (`BorderPaint.reduced(...)`, `exact/parity-tools/exact-issues/radius-reduced.md`):
NOT fixed upstream (line 158 still passes the authored radii). Re-applied in the new checkout, uncommitted there as in the old
one; `radius-reduced.patch` applies as is (a line number differs). A new checkout of c193f394 without it loses the transition
corner fix. It is also in the working tree of `~/.exact/exact2/c193f394...`: do not `git clean`/`checkout` that checkout.

## Rollback

`git revert 65646a7a 9493e4e2` (or `git checkout f885e208 -- exact/demos`), then `EXACT=~/.exact/exact2/730abad161c2a5f6cd1f34ea164cda8d9ad6b358 bun exact.mjs ios --run --sim <udid>`
and restart the dev server with `EXACT=` the same (the old toolchain 1.97.0 and `~/.cargo/bin/wasm-bindgen` 0.2.127 are still installed).

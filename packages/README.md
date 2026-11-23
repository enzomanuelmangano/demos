# packages

The Demos app's helper crates. Each one is meant to stand alone: independent of the computer it is
built on and of this app, so that it can be published later (npm for the Contract / package side,
crates.io for the Rust side). Today every one stays `publish = false` (Rust) and `private: true`
(npm); nothing here is published.

| Crate | What it is |
| --- | --- |
| `draw2d` | a small 2D layer on lyon and wgpu with the same shapes and numbers as the Skia API the RN demos use, no Skia code |
| `motion` | spring/timing/easing/decay with the same constants as the originals for consistency (Contract side: `motion.contract`) |
| `gestures` | pan/tap/pinch/fling from raw pointer events |
| `noise` | 2D simplex noise |
| `pressto` | Contract package plus Rust crate, pressto's conventions as designed (Contract side: `pressto.contract`) |

## Dependency graph

```
pressto --> motion
        \-> gestures
draw2d  --> wgpu, lyon, ttf-parser, bytemuck, zune-jpeg   (crates.io only)
noise   --> (nothing)
motion  --> (nothing)
gestures --> (nothing)

demos-gpu (gpu/, the app) --> all five, and exact-gpu (not published)
```

Only `pressto` depends on a sibling (`motion`, `gestures`), by version and path, named once in the
workspace (`Cargo.toml`, `[workspace.dependencies]`): cargo packages it as
`motion = "0.1.0"` and builds it in the workspace from the path.

## Versions and metadata

Every crate and package is `0.1.0`: the versions are the crates' own, not the npm libraries they
mirror (react-native-reanimated, react-native-gesture-handler, simplex-noise, pressto). `license`
(MIT), `repository`, `homepage`, `keywords` and `categories` are in each `Cargo.toml`
(`license`, `repository`, `homepage` inherited from `[workspace.package]`, which `cargo package`
flattens into the tarball); `package.json` carries `license` and `repository` with its `directory`.

## What keeps a crate from standing alone

Checked by `tools/check-standalone.sh` (below). What was found and what was done:

- `draw2d` named Exact's GPU crate by a path in the owner's home directory
  (`../../../../../../../../.exact/exact2/<hash>/gpu`). It used `exact-gpu` for one thing in the
  library, the re-export `pub use exact_gpu::wgpu`. It now depends on `wgpu = "30"` from crates.io
  directly (`default-features = false`, `wgsl`; no backend: the host that links it, exact-gpu, picks
  them) and re-exports that. wgpu resolves to one crate in a build that also has exact-gpu, so
  `draw2d::wgpu` is still `exact_gpu::wgpu`. `exact-gpu` is only a dev-dependency now.
- `draw2d`'s parity tests (render on a headless device from `exact_gpu::fixture`, read the app's fonts
  in `gpu/fonts` and `assets/fonts`, compile the C references with `cc`) need this repository. They
  are behind the feature `repo-tests` (off by default). In this workspace the feature is on through a
  self dev-dependency (`draw2d = { path = ".", features = ["repo-tests"] }`, plus the path-only
  `exact-gpu` dev-dependency, both dropped from the packaged crate), so `cargo test -p draw2d` here
  still runs all 49 tests; the packaged crate runs the 33 that need nothing. To run them from the
  tarball, they would need their fonts vendored into the crate.
- `draw2d`'s Apple text path reads the iOS Simulator's system fonts at run time from
  `SIMULATOR_ROOT` / `IPHONE_SIMULATOR_ROOT` (`src/text.rs`): a run-time lookup that falls back when
  the variables are unset, no build dependency.
- `exact-gpu` (library users: `gpu/` only) is one entry in `Cargo.toml`
  `[workspace.dependencies]`; members write `exact-gpu = { workspace = true }`. `bun exact.mjs update`
  re-settles only `[patch.crates-io]`, not that path: change it there when the exact2 checkout moves.
  Once exact-gpu is published, replacing that one line moves every member.
- `gestures`, `pressto`, `motion` and `noise` do not use `exact-gpu`. `gestures` mentions its
  `InputEvent` and `PointerPhase` only in doc comments: it defines its own `Event` and `Phase`.
- No `build.rs` in any package, no `[patch]` assumption, no `include_bytes!` outside a crate in a
  library path (the remaining ones are in `draw2d`'s `repo-tests` tests).
- Comments name `node_modules/...` sources of the ports (documentation only, not read at build).

## State

`tools/check-standalone.sh`, last run on macOS (Apple silicon, rustc 1.97.0, the workspace's
`Cargo.lock` seeding the dependency resolution, `--offline`):

| Crate | Result | Detail |
| --- | --- | --- |
| `motion` | PASS | packaged, built and tested outside the repo |
| `noise` | PASS | packaged, built and tested outside the repo |
| `gestures` | PASS | packaged, built and tested outside the repo |
| `pressto` | PASS | needs `motion` and `gestures` published (the check patches them to the extracted tarballs) |
| `draw2d` | PASS | 33 tests (the 16 `repo-tests` ones are the workspace's) |

Blockers before anything is published (none is done today):

1. Per-crate `README.md` and `LICENSE` files (the manifests say `readme = "README.md"`, so
   `cargo package` fails without one; MIT wants its text in the tarball). The check reports a missing
   `LICENSE` or `README.md` in the tarball.
2. The repository's `LICENSE.md` is a proprietary software license, not MIT; `license = "MIT"` (the
   workspace's) and every `package.json` must match what the owner wants to grant before publishing.
3. Names: `motion`, `noise`, `gestures`, `draw2d`, `pressto` on crates.io, and `motion`, `gestures`,
   `noise` on npm, are not checked for availability (some are certainly taken; `pressto` on npm is the
   RN library the Contract package ports). Rename (`name = "..."`) or scope them.
4. `pressto` has to be published after `motion` and `gestures` (its `version = "0.1.0"` dependencies).
5. The Contract side (`motion.contract`, `pressto.contract`) needs Exact's toolchain, which is not on
   a public registry; its npm packages have no consumer outside an Exact app until it is.
6. `rust-version` is not set (the workspace pins 1.97.0 for builds; the real minimum is unmeasured),
   and `exact-gpu` for `draw2d` is a dev-dependency only: nothing blocks `draw2d` on it.

## Running the check

```sh
tools/check-standalone.sh            # all five
tools/check-standalone.sh motion     # one (a sibling it needs is added)
```

For each crate it runs `cargo package --allow-dirty --no-verify` (a dry packaging: it writes a
`.crate` under the target dir and uploads nothing; the script never calls `cargo publish`), extracts
the tarball into a temp dir outside the repository, and runs `cargo build` and `cargo test` there, so
a crate that secretly needs the repo fails, with the first error as the reason. It prints a PASS/FAIL
table and exits 1 if any crate fails.

- It needs 8 GB free on `/` and deletes its temp dir and `CARGO_TARGET_DIR` (default
  `/tmp/standalone-target`) at the end (`KEEP=1` keeps them).
- Offline when the cargo cache has the workspace's dependencies (the workspace `Cargo.lock` seeds each
  extracted crate); otherwise it falls back to the network and says so. Packaging `pressto` needs
  cargo's crates.io index for the sibling overlay: offline first, the network when that cannot resolve.
  `STANDALONE_FRESH=1` resolves from scratch (network) as a new user would.

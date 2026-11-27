# gpu/: the app's GPU module

Patterns' wgpu surfaces, the app's own crate (`patterns-exact-gpu`), as the RN code they port
is app code (`onboarding/*`): what the RN app draws with three.js (WebGPU + TSL) and Skia
shaders, ported to Exact's `exact-gpu` `Surface`. Each surface takes its inputs as arguments
from Contract and draws.

| Surface (args) | Module | Ports (`apps/patterns/` in `~/Desktop/Work/wogi/memocards`) |
|---|---|---|
| `ghost` (15) | `src/ghost.rs`, `scene.rs`, `morph.rs`, `poke.rs`, `board.rs`; `shaders/scene.wgsl`, `composite.wgsl`, `board.wgsl` | `onboarding/ghost-scene-core.ts`, `eye-rig.ts`, `sheet-board.tsx`, `shared-board.ts`, `index.tsx:50-311` (pager spring), `ghost-poke.ts` |
| `wave` (6) | `src/wave.rs`; `shaders/wave.wgsl`, `blur.wgsl` | `onboarding/checkmate-aura.tsx`, `wave-shader.ts`, `wave-pyramid.ts` |
| `mascot` (2) | `src/mascot.rs`, `mascot_clip.rs` (generated) | `onboarding/ghost-morph.tsx`, `mascot-scene-core.ts`, `ghost-clip.ts`, `board-turn.ts`, `src/components/welcome-tactics-aura.tsx` |
| `site` (11) | `src/site.rs`, `veil.rs`, `birds.rs`, `figure.rs`; `shaders/figure.wgsl`, `dissolve.wgsl` | `src/components/ghost/ghost.tsx`, `paywall-scene-core.ts`, `onboarding/ghost-materials.ts`, `eye-rig.ts`, `faces.ts`, `dizzy-birds.ts` |
| (shared) | `src/gfx.rs` (pipelines, targets, colour), `src/probe.rs` + `shaders/probe.wgsl` (the colour-scheme probe) | |

`src/glb.rs` reads the baked morph-target models by hand. `models/ghost.glb`, `models/ghost-morph.glb` and `models/ghost-site.glb` are the RN app's, embedded with
`include_bytes!`. `src/mascot_clip.rs` is written by `tools/mascot-clip.py` from
`onboarding/ghost-clip.ts`.

## How the app uses it

Exact loads an app's GPU module from the crate named `<app>-gpu` in the app's own `gpu/`
directory (`scripts/app.mjs` `hasGpu`); `src/lib.rs` registers the surfaces and calls
`exact_gpu::module!(REGISTRY)`. Its `shaders/` are packaged as the app's own (Exact's default
root; declaring it again in `app.json` fails as duplicate shaders). The crate is a member of the app's Cargo workspace (`Cargo.toml`).

## Tests

```sh
cargo test -p patterns-exact-gpu --offline
```

The readback tests (the page-0 glow pixel, the wave, the mascot) render on the Mac's GPU.

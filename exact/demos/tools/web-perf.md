# Web performance

The Demos app on the web, measured 2026-11-22 on branch `exact-web` (Apple M3 Pro, Chrome 1xx headless with the real
GPU: Metal through ANGLE/Dawn, `--disable-gpu-vsync --disable-frame-rate-limit`, so rAF is not capped at 60 Hz).
The machine was shared with other agents' builds (load average 6-8 on 12 cores): single runs vary by up to 2x, so
the causes below are the ones that showed in every run, not one-off numbers.

Tools (all in `tools/web-perf/`, no dependency beyond Bun and Chrome):

- `trace.ts <url> [--light] [--nobackdrop] [--mobile --cpu 4]`: the interaction traces below (pager, open, close,
  scroll), each with the full Chrome trace broken down by thread and kind.
- `load.ts <url> <label> --net cable|4g|fast3g [--cpu 4 --mobile]`: a cold load.
- `runtime.ts <url> <label> [--mobile --cpu 4] [--deep]`: every demo in launcher order (open, 3 s interaction, close).
- `serve.ts <dist> <port>`: a static host for a `web-build --out` directory (brotli, no idle timeout).
- `probe.js`: injected before the page; rAF frames, long tasks, long animation frames (script attribution), WebGPU
  resources created, pipeline compiles, `writeBuffer` bytes, GPU time per submit (timestamp queries), DOM mutations.

## Open / close / scroll (the owner's stutter report, desktop Chrome, 1440 x 900, mouse and trackpad)

Production build (`web-build --out`), served by `tools/web-perf/serve.ts`, warm page (GPU module loaded). "Presented"
is the GPU process's `Display::DrawAndSwap` (what reached the screen); "rAF" the page's frame callbacks (uncapped,
except while a compositor animation runs: then Chrome paces rAF at ~17 ms even with the frame-rate limit off).

| scenario | presented frames: count, p95 / max gap ms | rAF p95 / max ms | main thread busy ms | GPU process busy ms | what the main thread did |
|---|---|---|---|---|---|
| pager, 4 mouse drags (4.7 s) | 328-360, 23-38 / **470-550** | 18 / 19 | 560-580 | 1290-1460 | Contract script 92 ms (720 calls), 2400-2600 style recalcs (`StyleRecalc: Animation` x 4900), ~100 forced layouts; **~2200 raster tasks: the page is re-rasterised every frame of the drag** |
| pager, trackpad (wheel deltaX, 4 s) | 3550-4980, 1.5 / **75-750** | 0.6-17 / 163 | 810-1070 | 2000-2330 | Contract script 250-445 ms (2400-2600 calls, one per wheel event), GPU process back-pressured (`CALayerTreeCoordinator::ApplyBackpressure` 614 ms, `SwapBuffers` 1048 ms) |
| open chessboard, first time | 10-390, **870-1560** max | max **990-2200** | 2500-5500 | 2100-2700 | one `click` task of **910-1310 ms** (Contract builds the demo route synchronously, 650 layout objects added, forced layout 55 ms, the GPU surface's first frame); then `gpu-glue.js:frame` 490-800 ms over the flight with a forced layout in each frame |
| open chessboard, warm | 170-250, 14-58 / 280-390 | 3-16 / 320-380 | 1940-1960 | 1850-2080 | `click` 265 ms (forced layout 60 ms); `gpu-glue.js:frame` 660 ms over 1100 frames |
| close chessboard, swipe down | 70-184, 29-165 / **163-1230** | 7-10 / 50-1030 | 1250-3570 | 1400-3450 | `gpu-glue.js:frame` 400-610 ms; `pointerup` in index.js 77-162 ms (forced layout 20 ms); a `setTimeout` in index.js 46-79 ms; 1840 `:has()` style invalidations from index.js `put()` |
| open sudoku | 14-1066, 4-230 / 130-1430 | 2-18 / 190-740 | 490-1270 | 1080-2020 | `click` 146-180 ms (forced layout 37-54 ms) |
| open stacked-list | 410-946, 3-12 / ~500 | 13-17 / 90-120 | 1050-1120 | 1380-1480 | `click` 81-101 ms; Layerize 190-210 ms, 1000 paints |
| open blurred-scroll | 68-650, 3-99 / 490-1430 | 17-18 / 270-1080 | 570-1300 | 1580-2360 | `click` 77-160 ms (forced layout 34-86 ms) |
| close by Back (any demo) | **8-12** in 1.5 s, gap 107-294 | 17-19 / 50-490 | 100-500 | 140-490 | no flight: one `popstate` task of 30-170 ms (navigation.js, forced layout 10-62 ms) removes ~1150 layout objects; then nothing animates |
| scroll stacked-list (wheel, 1.8 s of events) | 906-916 over **10.7-16 s**, 39-52 / 220-1640 | 17-19 / 100-770 | 1560-4720 | 1030-4020 | **every scroll event is a Contract commit**: `scroll=scrolled` sets `state scroll`, each card's translate/scale/opacity is rewritten (4200 style-attribute writes for ~900 frames, 4.5 per frame); `onscroll` tasks of 47-165 ms with forced layouts of up to 58 ms; the wheel events queue behind them (1.8 s of input took 10.7-16 s to deliver) |
| scroll blurred-scroll (GPU surface) | 444-448 over 10 s, 54-55 / ~350 | 19 / 140-160 | 825-840 | 810-1130 | no commits (state stays in Rust); `gpu-glue.js` wheel handler 31 ms + frame 57 ms; frames paced at 60 Hz; the long gaps are GPU-side |

`--nobackdrop` (every `backdrop-filter` removed) changed none of these beyond run-to-run noise (pager mouse drags
presented max 550 -> 497 ms, GPU process 1460 -> 1830 ms; blurred-scroll 346 -> 350 ms): **backdrop-filter is not
what stutters**.

### Causes, ranked (open / close / scroll)

1. **Scroll-driven Contract state (stacked-list and every demo with `scroll=<action>` feeding `state`)**: a commit
   per scroll event, each rewriting every row's style, with forced layout. This is the in-demo scroll stutter, and it
   blocks input delivery. Fix in the demo: drive the cards from a scroll timeline on the host (the skill's "drag/scroll
   timelines", `transformDragFor`-style), not from `state scroll`. Find them: `grep -l "scroll=" demos/*/*.contract`
   and check which write the offset into state.
2. **The GPU canvas is resized every frame of the open and close flight** (chessboard: `width`/`height` set by
   `gpu.js` 46 times in the open, 74 in the swipe close; `LayoutInvalidationTracking: Size changed @ renderModule` on the
   CANVAS each time). Each resize re-lays out, reallocates the swap chain and the surface's MSAA/depth targets
   (`packages/draw2d` `render.rs` keys them on size: 1065 textures, 300 MB, created in one 1.2 s open) and redraws.
   `gpu-glue.js:frame` also forces a layout in most flight frames (16-36 ms). The flight scales the card with a
   transform, so the canvas's layout size does not change; its backing store follows the transformed rect. Fix: during
   the flight (`data-launched` card, phase opening/closing) keep the canvas backing size at the demo's resting size
   (CSS size x DPR from layout, not `getBoundingClientRect`), and read sizes once per frame from a ResizeObserver, not
   by layout reads in `frame`. (gpu-glue.js is Exact's; the page module could freeze it by not touching the canvas's
   box during the flight.)
3. **The open's first frame waits for the whole demo route to be built**: the icon's `click` runs the Contract commit
   that mounts the demo (650 layout objects, forced layouts 37-86 ms) and, the first time, the GPU surface's setup:
   80-180 ms for Contract demos, 265 ms warm and 910-1310 ms cold for chessboard. The flight starts after it, so the
   card visibly hesitates. Fix: start the card's flight on `pointerdown`/`click` before the commit (a placeholder card
   with the demo's art, as the iPhone's zoom does), mount the demo in the next task; for GPU demos create the surface
   after the first flight frame. For the cold case, see "GPU first use" below.
4. **The close by Back is not animated** and stalls 30-170 ms in one `popstate` task that tears down ~1150 layout
   objects with a forced layout. The swipe close animates but its `pointerup` task is 77-162 ms (forced layout) and
   index.js `put()` writes inline styles that invalidate Exact's `:has()` rules (1840 `:has()` invalidations in one
   close): every inline-style write re-matches `[style*="display:none"]` inside `:has()` (Exact's style.css). Fix: write
   the flight's per-frame values as CSS custom properties on one element (or `element.animate` keyframes only), never
   `style.x = ` on many nodes per frame; batch the reads (`offsetWidth`, `getBoundingClientRect`) before the writes.
5. **Pager drag re-rasterises the page every frame** (~2200 raster tasks in 4 mouse drags, GPU process 750 ms in raster,
   49 image uploads of 237 ms) and runs main-thread animations every frame (4900 `StyleRecalc: Animation`
   invalidations). Animations Chrome refused to composite: in the pager 4 animations (`compositeFailed` 131072), plus
   `background-color` animations on two `DIV.c733` and press animations on the icon buttons (`BUTTON.c729`); in the
   open, `border-radius` (all four corners, the card) and the custom property `--exact-press-factor` (pressto's press).
   A custom-property or radius animation is main-thread and repaints its layer each frame. Fix: cancel the icon press
   as soon as the pager drag starts (10 pt), animate only `transform`/`opacity`, and give the pager's content
   `will-change: transform` so a drag moves one composited layer instead of repainting.
6. **The pager's wheel listener is not passive** (`pager.addEventListener('wheel', onWheel, { passive: false })`,
   modules/web/index.js): every trackpad event waits for the main thread before the compositor may scroll, and the
   Contract runs a handler per wheel event (2400 calls, 250-445 ms per 4 s). With the main thread busy this produced
   gaps of 75-750 ms. Fix: listen passively and only take over (preventDefault) for the vertical pull-to-search, e.g.
   with `touch-action`/`overscroll-behavior` or a passive listener plus a non-passive one only while a pull is armed.

GPU first use (cold open of a GPU demo): the 910-1310 ms `click` includes creating the surface's pipelines and
inflating its embedded images (gpu/images, zlib) on the main thread. On the web `gpu/src/warm.rs` is a no-op (see
web-parity.md), so each demo pays this on its first open.

## Load (cold, empty cache)

`load.ts`, production build served by `serve.ts` (brotli, as a CDN), dev build by the running dev server (:5341).
"Launcher drawn" = the first page's 24 icons decoded; "GPU ready" = `gpu_bg.wasm` instantiated (a GPU demo can draw);
TTI = the end of the last long task before 3 s without one.

| build | network | CPU, screen | wire MB | FCP s | launcher drawn s | launcher TTI s | gpu_bg.wasm fetch s | GPU ready s | long tasks n / total / max ms |
|---|---|---|---|---|---|---|---|---|---|
| prod | cable (100 Mbit, 5 ms) | 1x, 1440x900 | 32.8 | 0.88 | 1.04 | 3.32 | 5.03-7.27 | 7.28 | 2 / 291 / 235 |
| prod | cable | 4x, 390x844@3 | 32.8 | 1.73 | 1.81 | 1.90 | 5.76-7.75 | 7.77 | 3 / 1090 / 966 |
| prod | 4G (9 Mbit, 165 ms) | 4x, 390x844@3 | 32.7 | 3.94 | 5.29 | 5.48 | 8.63-30.86 | **30.9** | 7 / 1908 / 1298 |
| prod | Fast 3G (1.44 Mbit, 563 ms) | 4x, 390x844@3 | 32.6 | 11.86 | **21.2** | 21.2 | 25.7-182.8 | **182.9** | 5 / 1549 / 1230 |
| dev | cable | 1x, 1440x900 | 58.0 | 3.24-3.44 | 3.37-3.62 | 3.37-3.69 | 7.3-9.8 | 9.8 | 1-3 / 550-630 / 490-550 |
| dev | cable | 4x, 390x844@3 | 58.0 | 5.01 | 5.11 | 5.23 | 9.1-11.4 | 11.4 | 6 / 2380 / 1978 |
| dev | 4G | 4x, 390x844@3 | - | never | never | - | - | never | the dev server drops the connection (below) |

Bytes of a cold production load (32.8 MB on the wire, 199 requests):

| what | wire MB | decoded MB | when it is fetched | notes |
|---|---|---|---|---|
| `gpu_bg.wasm` | 24.74 (br) | 28.52 | 4 s after the launcher is idle (`task warmingGpu`, app.contract) | code 1.6 MB, **data section 26.9 MB**: the `include_bytes!` images (gpu/images 25 MB) and fonts; brotli saves 13% |
| fonts (7, `<link rel=preload>`) | 2.99 (br) | 5.21 | at once, before app.js | **SF-Pro-Rounded-Bold.otf is 4.32 MB** (24,834 glyphs, CFF); a Latin subset is 100 KB (otf) / 47 KB (woff2). The launcher uses none of the 7 faces |
| images (107) | 4.12 | 4.10 | after app.js runs | home-wallpaper.png 2.02 MB (1206 x 2622 PNG); icon.png 0.30 MB; 105 icons ~20 KB |
| JS (26) | 0.73 (br) | 14.11 | app.js first | app.js 13.4 MB decoded, 0.45-0.53 MB brotli, 1.63 MB gzip-9: **brotli matters 3.5x here** |
| shaders (55 `.wgsl`) | 0.13 | 0.34 | after the wasm, every shader of every demo, one request each | |
| audio, art-pack | 0 | 0 | on demand | already lazy |

Dev server: app.js 18.4 MB and the wasm 28.5 MB are served uncompressed with `cache-control: no-store` (58 MB per
load, every reload), and the main-thread long task at startup is 2x the production one (550 vs 235 ms at 1x).

Startup CPU: one long task of 235 ms (1x) / 970-1300 ms (4x) when app.js runs and the launcher is built; the wasm is
compiled while it streams (`instantiateStreaming`, baseline + lazy tier-up: `wasm.CompileLazy` 350 functions, 3 ms),
so compile time hides under the download; instantiate 2-6 ms. Memory after load: JS heap 42 MB (prod) / 51 MB (dev),
wasm linear memory 28.6 MB (its data section is copied into it), 395-424 DOM nodes.

### Load causes, ranked

1. **The embedded images make the GPU module 28.5 MB**: 25 s of 4G and 157 s of Fast 3G before any GPU demo can draw,
   and 27 MB of wasm memory held for the session. Only 1.6 MB is code.
2. **7 fonts preloaded on the launcher, 5.2 MB (3 MB br), 4.3 MB of it one face** used as text in four demos
   (stacked-bottom-sheet, steps, cherry-blossom-qrcode, family-number-input). On 4G it holds the link for 3.6 s while app.js and the icons wait; on Fast 3G 45 s.
3. **home-wallpaper.png is 2 MB** and blocks "launcher drawn" on slow links (4G: done at 6.8 s; Fast 3G 50 s). It is 1206 x 2622
   (the iPhone's 3x); JPEG q85 of it is 1.05 MB, and the framed desktop shows it at ~420 pt wide, so a web copy at 2x
   (840 x 1824) in WebP/AVIF would be a few hundred KB.
4. **The GPU module starts 4 s after the launcher is idle**: right for a fast link (it keeps the launcher smooth), but
   on 4G the 25 MB then takes 22 s; a tap on a GPU demo in that window waits for it.
5. **Dev server**: uncompressed, `no-store`, and both `exact serve` and the dev server close a connection that a slow
   client drains (a 25 MB wasm at 1 MB/s is cut after ~8 s: `curl --limit-rate 1000k` gets 7.8 MB, then "transfer
   closed"): the dev build never loads on a throttled profile, and a phone on a weak LAN link can hit the same.

## Runtime, every demo (launcher order)

`runtime.ts` on the production build: per demo, tap its icon on the launcher (open flight, 1.2 s), a 3 s scripted
interaction (horizontal drag through the centre both ways, a drag up, three taps), Back (1.2 s). Desktop: 1440 x 900,
mouse, CPU 1x. Mobile: 390 x 844 @3, touch, CPU 4x. rAF is uncapped, so a frame interval is what the frame cost;
"(60)" marks segments Chrome paced at 60 Hz (a compositor animation was running), where ~17 ms is the pace, not a
cost. ios-home-bouncy, time-machine, grid-visualizer (and shared-transitions on mobile) are not on the web launcher.

Summary:

| | desktop 1x | mobile 4x |
|---|---|---|
| demos measured | 91 | 105 |
| median run frame p95 | 17.2 ms (mostly the 60 Hz pace) | 18.7 ms |
| demos with a long task (> 50 ms) during the interaction | 11 | 12 |
| open flight: median worst frame / demos with a frame > 100 ms | 140 ms / 64 | 197 ms / 105 (all) |
| worst open frame | fluid-tab-interaction 1105, duration-slider 996, threads-holo-ticket 910, sculptures-in-words 777, scroll-transition-3d 751 ms | coverflow-carousel 1539, light-on-painting 1271, github-onboarding 1029, chessboard 828, prequel-slider 760 ms |
| worst interaction frame | linear-sensors 405, art-gallery 241, online-offline 212, wheel-picker 206, airbnb-flip-interaction 181 ms | prequel-slider 409, chessboard 393, atlas-sphere 298, fibonacci-shader-grid 253, checkbox-interactions 146 ms |
| JS heap after GC, first -> last demo | 41.3 -> 48.9 MB (no demo leaks > 1.7 MB) | 41.2 -> 48.9 MB |
| wasm linear memory | 28.6 -> 92 MB (grows with each demo's decoded images, never shrinks) | 88 MB |
| crashes | **radar-chart: `RuntimeError: unreachable` in the GPU module on open (draws nothing)** | same |

GPU time (timestamp queries, per submit, run segment): highest p95 bezier-curve-outline 8.8 ms (max 16.7), clock-time-picker
7.6 (12.6), duration-slider 5.5 (41), exclusion-tabs 2.3, mnist 2.1 (9.9); on mobile emulation (same GPU) bezier-curve-outline
38.8 ms p95. Everything else is under 2 ms: the GPU is rarely the limit; the main thread is.

Per-frame data movement and resource churn (desktop):

- `writeBuffer` during 3 s of interaction: sculptures-in-words **1.57 GB** (2 MB per frame), notion-qrcode 1.4 GB,
  mnist 630 MB, drag-to-sort 450 MB, fourier-visualizer 440 MB, gl-transitions 420 MB, github-contributions 345 MB.
  A whole vertex/instance buffer re-uploaded every frame where a uniform would do.
- Textures created during the 1.2 s open: scrollable-shapes 631 (636 MB), notion-qrcode 391 (777 MB), snake 348,
  slide-to-reveal 348, chessboard 326, airbnb-flip-interaction 248: the canvas resized every flight frame (cause 2
  above) reallocates draw2d's MSAA and depth targets each time. Pipelines created in the open: airbnb-flip-interaction
  **649**, scrollable-shapes 162, duration-slider 145, snake 140: pipelines rebuilt per frame (per size) instead of once.
  During the interaction: blurred-scroll 363 textures (111 MB), github-contributions 94.
- DOM mutation records during the interaction (Contract commits): online-offline 329, everybody-can-cook 324,
  checkbox-interactions 288, github-contributions 223, liquid-glass-playground 122 (stacked-list's scroll: 4200, above).
- Long tasks in the interaction (desktop): wheel-picker 212 ms, airbnb-flip-interaction 195, linear-sensors 158
  (3 of them), threads-holo-ticket 155, sculptures-in-words 114, prequel-slider 101 ms. The open's own `click` task
  (the demo's commit) is the bigger one: wheel-picker 408 ms, sculptures-in-words 276, linear-sensors 266 ms.

Worst 15, desktop 1x (score = run p95 x4 + run max + open max / 4 + long task max x2 + GPU p95 x10):

| demo | run frame ms p50 / p95 / max | run frames > 60 / 120 Hz budget | run long tasks (max ms) | run GPU ms/submit p50 / p95 / max | open p95 / max (missed 60 Hz) | close p95 / max (missed) | run DOM mutations | run writeBuffer MB | textures / pipelines created (open+run) | heap growth MB | top long-frame scripts (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| linear-sensors | 16.9 / 17.8 / 404.8 (60) | 2 / 34 | 3 (158) | 0.038 / 0.937 / 1.237 | 17.7 / 382.6 (25) | 17.8 / 34.8 (1) | 4 | 0.03 | 42 / 70 | 0.05 | app-CvsiKF0t.js: 266; gpu-glue.js:frame: 55 |
| airbnb-flip-interaction | 17.4 / 17.8 / 181.3 (60) | 3 / 157 | 1 (195) | - | 32 / 614.1 (39) | 17.8 / 104.1 (5) | 0 | 0.00 | 248 / 649 | -0.02 | gpu-glue.js:frame: 643; navigation-CgaO-v3L.js: 83 |
| wheel-picker | 0.5 / 2.3 / 206.4 | 1 / 24 | 1 (212) | 0.05 / 0.341 / 1.717 | 16.9 / 459.6 (29) | 17.8 / 17.8 (0) | 29 | 25.25 | 6 / 14 | 0.12 | app-CvsiKF0t.js: 408; input-glue-BjspXFef.js: 19 |
| threads-holo-ticket | 0.3 / 1 / 140.1 | 2 / 10 | 1 (155) | 0.038 / 0.768 / 3.584 | 103.2 / 910 (67) | 17.8 / 33.8 (1) | 5 | 5.58 | 15 / 23 | 0.32 | app-CvsiKF0t.js: 82; : 53 |
| sculptures-in-words | 5.6 / 7.9 / 103.3 | 5 / 16 | 1 (114) | 1.288 / 1.955 / 3.048 | 17.7 / 776.7 (62) | 17.8 / 121.7 (6) | 5 | 1571.51 | 22 / 45 | 1.71 | app-CvsiKF0t.js: 276; gpu-glue.js:frame: 119 |
| fluid-tab-interaction | 1.2 / 17.1 / 52.3 | 2 / 95 | 1 (56) | 0.158 / 1.846 / 4.982 | 17.7 / 1104.8 (67) | 17.8 / 35.5 (1) | 5 | 140.06 | 30 / 66 | 0.10 | app-CvsiKF0t.js: 74; navigation-CgaO-v3L.js: 49 |
| prequel-slider | 16.8 / 17.7 / 86.6 (60) | 1 / 164 | 1 (101) | 0.363 / 1.892 / 2.4 | 17.7 / 209.1 (26) | 17.7 / 17.7 (0) | 5 | 1.06 | 19 / 30 | -0.23 | gpu-glue.js:frame: 256; app-CvsiKF0t.js: 40 |
| calendar-days | 17 / 17.8 / 89.7 (60) | 6 / 161 | 1 (81) | 0.459 / 1.152 / 2.002 | 17.5 / 331.7 (22) | 17.8 / 17.8 (0) | 5 | 2.51 | 11 / 29 | -0.26 | app-CvsiKF0t.js: 66; gpu-glue.js:frame: 15 |
| online-offline | 1.3 / 3.3 / 212 | 4 / 46 | 1 (65) | - | 13.5 / 179.7 (21) | 17.7 / 17.8 (0) | 329 | 0.00 | 0 / 0 | 0.44 | app-CvsiKF0t.js: 40; app-CvsiKF0t.js: 37 |
| duration-slider | 16.8 / 17.7 / 17.8 (60) | 0 / 168 | 0 (0) | 0.719 / 5.462 / 41.237 | 17.7 / 996 (59) | 17.8 / 17.8 (0) | 5 | 0.99 | 144 / 228 | 0.01 | app-CvsiKF0t.js: 65; gpu-glue.js:frame: 9 |
| metaball | 18.2 / 18.7 / 88.6 | 68 / 163 | 1 (84) | - | 18.8 / 192.3 (45) | 18.8 / 91.8 (31) | 0 | 0.00 | 0 / 0 | 0.01 | navigation-CgaO-v3L.js: 76; app-CvsiKF0t.js: 70 |
| audio-player | 17.5 / 18.7 / 34.5 (60) | 38 / 167 | 1 (56) | - | 17.7 / 554.2 (34) | 18.7 / 18.8 (29) | 0 | 0.00 | 0 / 0 | 0.04 | index.js: 538; app-CvsiKF0t.js: 63 |
| art-gallery | 0.6 / 1.4 / 241.3 | 5 / 18 | 0 (0) | 0.259 / 1.035 / 4.374 | 21.7 / 276.4 (25) | 17.7 / 53.3 (2) | 5 | 8.62 | 13 / 19 | -0.05 | gpu-glue.js:frame: 183; app-CvsiKF0t.js: 69 |
| bezier-curve-outline | 16.9 / 17.7 / 18 (60) | 0 / 164 | 0 (0) | 0.663 / 8.79 / 16.696 | 17.8 / 477.6 (45) | 17.8 / 34.8 (1) | 5 | 6.49 | 46 / 65 | -0.01 | app-CvsiKF0t.js: 51; gpu-glue.js:frame: 6 |
| fibonacci-shader-grid | 0.6 / 1.5 / 52.1 | 12 / 18 | 4 (52) | 0.536 / 1.047 / 1.809 | 2.9 / 276.8 (25) | 17.8 / 22.8 (1) | 1 | 264.24 | 98 / 15 | 0.05 | gpu-glue.js:frame: 207; app-CvsiKF0t.js: 57 |

Worst 15, mobile emulation 4x CPU:

| demo | run frame ms p50 / p95 / max | run frames > 60 / 120 Hz budget | run long tasks (max ms) | run GPU ms/submit p50 / p95 / max | open p95 / max (missed 60 Hz) | close p95 / max (missed) | run DOM mutations | run writeBuffer MB | textures / pipelines created (open+run) | heap growth MB | top long-frame scripts (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| prequel-slider | 17 / 18.7 / 409.1 (60) | 44 / 129 | 1 (420) | 1.093 / 4.387 / 4.715 | 18.8 / 760 (54) | 18.8 / 54.1 (29) | 5 | 1.05 | 18 / 30 | -0.09 | gpu-glue.js:frame: 1008; app-CvsiKF0t.js: 135 |
| chessboard | 1 / 4.9 / 392.7 | 9 / 32 | 1 (366) | 1.616 / 10.776 / 135.091 | 452.4 / 828.2 (146) | 18.6 / 290.1 (30) | 18 | 7.80 | 360 / 130 | 0.55 | gpu-glue.js:frame: 1474; app-CvsiKF0t.js: 176 |
| atlas-sphere | 0.7 / 2.8 / 298.1 | 2 / 10 | 2 (299) | 0.358 / 5.541 / 9.79 | 18.7 / 232.1 (32) | 18.8 / 73.3 (18) | 5 | 0.20 | 2 / 2 | 0.38 | gpu-glue.js:frame: 627; app-CvsiKF0t.js: 168 |
| fibonacci-shader-grid | 0.9 / 4.5 / 253.4 | 6 / 9 | 5 (261) | 3.962 / 4.624 / 5.114 | 46.8 / 372.4 (76) | 18.7 / 254.7 (41) | 1 | 75.53 | 122 / 15 | 0.30 | gpu-glue.js:frame: 2677; navigation-CgaO-v3L.js: 167 |
| checkbox-interactions | 6.7 / 18.7 / 145.5 | 37 / 111 | 2 (135) | - | 18.5 / 356.2 (34) | 18.7 / 74.2 (26) | 117 | 0.00 | 0 / 0 | -0.15 | app-CvsiKF0t.js: 304; app-CvsiKF0t.js: 262 |
| bezier-curve-outline | 17 / 18.7 / 18.9 (60) | 36 / 146 | 0 (0) | 17.822 / 38.78 / 67.695 | 18.6 / 214.7 (25) | 18.8 / 33.9 (24) | 5 | 8.24 | 46 / 65 | 0.30 | app-CvsiKF0t.js: 162; app-CvsiKF0t.js: 16 |
| sculptures-in-words | 15.5 / 26.8 / 68.5 | 47 / 165 | 1 (77) | 1.274 / 4.172 / 8.742 | 18.7 / 606.3 (46) | 18.8 / 37.3 (30) | 5 | 695.98 | 22 / 45 | 1.64 | app-CvsiKF0t.js: 403; gpu-glue.js:frame: 223 |
| coverflow-carousel | 2.8 / 18.1 / 18.8 | 26 / 91 | 0 (0) | 0.263 / 3.285 / 5.409 | 1538.9 / 1538.9 (87) | 18.8 / 36.6 (29) | 51 | 10.13 | 21 / 14 | -0.07 | gpu-glue.js:frame: 1338; app-CvsiKF0t.js: 160 |
| wheel-picker | 4.6 / 18 / 83.8 | 9 / 66 | 2 (100) | 0.219 / 1.222 / 8.139 | 18.5 / 472.5 (43) | 18.8 / 72 (33) | 27 | 3.30 | 6 / 14 | 0.04 | app-CvsiKF0t.js: 445; navigation-CgaO-v3L.js: 65 |
| scroll-progress | 17.5 / 28.9 / 104.8 (60) | 58 / 153 | 1 (89) | - | 18.2 / 176 (21) | 18.7 / 30.6 (17) | 439 | 0.00 | 0 / 0 | 0.02 | app-CvsiKF0t.js: 136; app-CvsiKF0t.js: 83 |
| liquid-glass-playground | 17.7 / 18.7 / 107.7 (60) | 36 / 162 | 2 (110) | - | 18.4 / 127.2 (22) | 18.8 / 36 (30) | 118 | 0.00 | 0 / 0 | 0.47 | app-CvsiKF0t.js: 124; input-glue-BjspXFef.js: 77 |
| gl-transitions | 2.7 / 4.1 / 62.6 | 1 / 9 | 1 (70) | 1.687 / 3.784 / 4.106 | 48.7 / 551.3 (56) | 18.8 / 56 (31) | 18 | 125.61 | 166 / 96 | 0.09 | : 225; gpu-glue.js:frame: 203 |
| calendar-days | 17 / 18.7 / 89.8 (60) | 33 / 144 | 1 (50) | 2.022 / 5.524 / 7.933 | 18.6 / 213.4 (34) | 18.8 / 35.3 (33) | 5 | 3.65 | 11 / 29 | -0.04 | app-CvsiKF0t.js: 161; gpu-glue.js:frame: 61 |
| light-on-painting | 1.9 / 3.2 / 17.2 | 0 / 2 | 0 (0) | 0.141 / 1.196 / 6.255 | 36.9 / 1271.3 (73) | 18.8 / 158.9 (26) | 22 | 1.39 | 14 / 16 | 0.86 | gpu-glue.js:frame: 1082; app-CvsiKF0t.js: 153 |
| github-onboarding | 1.3 / 2.8 / 18.8 | 17 / 60 | 0 (0) | 0.252 / 0.805 / 4.603 | 18.5 / 1029.2 (60) | 18.8 / 25.3 (32) | 5 | 4.22 | 7 / 16 | 0.03 | gpu-glue.js:frame: 895; app-CvsiKF0t.js: 119 |

## Ranked fix list

Ordered by what a person feels per unit of work. Owner of the code in brackets. Nothing here changes the iPhone if
it is guarded by `cfg(target_arch = "wasm32")` / the web page module.

1. **Scroll-driven demos commit per scroll event** (stacked-list: 4200 style writes, 47-165 ms `onscroll` tasks, input
   delayed 5-9x). Drive them with a host scroll timeline, keep the offset out of `state`. Then audit the other
   `scroll=` demos the same way (scroll-progress shows 58 late frames and 439 mutations on mobile). [demos/*.contract]
2. **Canvas backing store resized every open/close flight frame** (textures 300-777 MB churned per open, forced
   layout in `gpu-glue.js:frame`, pipelines rebuilt: airbnb-flip-interaction 649 in one open). Size the canvas from its
   layout box during the flight, not its transformed rect; or let the page module mark the card as flying so the GPU
   glue keeps the last size. [Exact gpu-glue.js; modules/web demo-card]
3. **Open waits for the demo's synchronous commit** (80-410 ms Contract demos, 265 ms warm / 0.9-1.3 s cold for GPU
   demos) before the flight's first frame. Start the flight first (art placeholder), mount the demo after the first
   flight frame. [modules/web demo-card + app.contract route]
4. **Close by Back is unanimated and stalls 30-170 ms** (teardown of ~1150 layout objects in `popstate`); the swipe
   close's `pointerup` is 77-162 ms with forced layout and `:has()` invalidations from per-node inline style writes.
   Animate Back like the swipe, defer the teardown to after the flight, write flight values as one custom property or
   `element.animate`. [modules/web; Exact style.css `:has([style*=…])` rules]
5. **Pager: re-raster every drag frame, main-thread animations (press custom property, border-radius,
   background-color), non-passive wheel listener**. Cancel the icon press on drag start, composite the pager content,
   passive wheel. [modules/web pagerDrive / search-reveal, home/web-*.contract]
6. **Split the embedded images out of the GPU module** (28.5 MB -> ~1.7 MB of wasm; 4G: GPU ready at ~10 s instead of
   31 s; Fast 3G: ~35 s instead of 183 s; 27 MB less wasm memory). Plan below. [gpu/src]
7. **Fonts**: stop preloading the 7 faces on the launcher, or at least subset SF-Pro-Rounded-Bold (4.32 MB -> 100 KB
   Latin OTF / 47 KB WOFF2, `pyftsubset --unicodes=U+0020-007E,U+00A0-00FF,U+2010-2027,U+2030-205E,U+20AC
   --layout-features='*'`). The preload is written by Exact for every `font` in demos/env.contract; a per-platform
   source (web: WOFF2 subset) needs either an env.contract change or Exact support. [demos/env.contract, assets/fonts]
8. **Per-frame buffer re-uploads**: sculptures-in-words 2 MB/frame, notion-qrcode, mnist, drag-to-sort,
   fourier-visualizer, gl-transitions, github-contributions (345 MB-1.57 GB per 3 s). Upload static geometry once,
   change uniforms per frame. [gpu/src]
9. **radar-chart panics** in the GPU module on the web (`RuntimeError: unreachable`, wasm function 1188, called from
   2727) and stays blank. [gpu/src/radar_chart.rs]
10. **Wallpaper** 2 MB PNG at 1206 x 2622 on the launcher's critical path: a 2x WebP/AVIF for the web. [home/web-phone]
11. **Dev loop**: the dev server sends 58 MB uncompressed with `no-store` per load, and it and `exact serve` drop slow
    connections (idle timeout while the client drains): a phone on weak Wi-Fi may never finish the wasm. [Exact]
12. **GPU warm start**: on a slow link start `gpu_bg.wasm` with the launcher (it is 4 s idle-delayed today), or better
    after fix 6 it no longer matters. [app.contract `warmingGpu`]

Not worth doing now: wasm opt-level (the GPU module is `opt-level = "z"`, fat LTO, `wasm-opt -Oz`; frame CPU in wasm
is a few ms at most per frame on desktop, the stutters above are commits, layout and resizes, not wasm speed); and
backdrop-filter (removing it changed nothing measurable).

### Plan: the GPU module's images as lazily fetched assets (fix 6)

Today 19 surfaces `include_bytes!` 25 MB from `gpu/images/` (biggest: art-gallery 6.8 MB, light-on-painting 4.5 MB,
swipe-cards 3.2 MB, github-onboarding 2.3 MB, circular-carousel 2.0 MB, prequel-slider 1.9 MB, sculptures-in-words
1.3 MB, chessboard 23 files). exact-gpu already has the delivery path: a surface returns names from
`Surface::assets()`, the web host fetches `assets/<name>` (8 in flight, 64 MiB cap, cancel on retire) and calls
`Surface::asset(name, bytes)`; `prepare_assets` runs before the surface reports ready.

1. Copy (not move: the iPhone keeps `include_bytes!`) each `gpu/images/<demo>/*` to `assets/gpu/<demo>/*` with a
   generated list; the web build ships `assets/`.
2. Per surface, one helper in a new `gpu/src/bytes.rs`: on `cfg(not(target_arch = "wasm32"))` it returns the
   `include_bytes!` slice at once; on wasm32 it returns `None` until `asset()` delivered it, and `assets()` lists
   the names still missing. The `include_bytes!` sits behind `#[cfg(not(target_arch = "wasm32"))]`, so the wasm
   drops 25 MB and the iPhone build is byte-identical.
3. A surface draws its placeholder (the demo's backdrop colour) until its images arrived, as it does for the first
   frame today; the first-draw inflate stays where it is.
4. Check: `cargo test -p demos-gpu` (fixtures read the native path), the web runtime pass (`runtime.ts`) for
   the 19 demos, and the wasm sections (`wasm-objdump -h`): code ~1.6 MB, data < 2 MB.

Coordination: these 19 files in `gpu/src/` are being edited by the web-parity pass (last commit to `gpu/src` 8 minutes
before this was written), so this is left as the plan, not done here.

## What was changed here

Only the measuring tools (`tools/web-perf/`) and this report: every high-value fix found is in code another pass owns
(modules/web, home/web-*, demos/*.contract, gpu/src) or in Exact itself. No change to app.json, Cargo profiles or
assets: the build settings are already size-optimised (fat LTO, `opt-level = "z"`, `wasm-opt -Oz`, brotli/gzip in
`exact serve`), and the remaining load cost is data (images, fonts), not code.

How to rerun: `bun exact.mjs web-build --out /tmp/perf-dist`, `bun tools/web-perf/serve.ts /tmp/perf-dist 5391`, then
`bun tools/web-perf/trace.ts http://127.0.0.1:5391 --light`, `bun tools/web-perf/load.ts http://127.0.0.1:5391/ prod
--net 4g --cpu 4 --mobile`, `bun tools/web-perf/runtime.ts http://127.0.0.1:5391 prod --out /tmp/rt.jsonl` and
`bun tools/web-perf/report.ts runtime /tmp/rt.jsonl`.

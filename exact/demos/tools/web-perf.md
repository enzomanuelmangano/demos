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

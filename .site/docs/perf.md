# Performance gate: the rebuild against the live reactiive.io

`tools/parity/perf.ts <live> <local> <route>… --runs 3` (median of 3 cold loads per cell, fresh browser context,
cache disabled). Profiles: `cable` (no throttling) and `4g` (170 ms RTT, 9 / 1.5 Mbps, 4x CPU: Lighthouse's mobile
preset). Metrics: bytes on the wire and requests; FCP, LCP, CLS, TBT (long tasks over 50 ms from FCP to 5 s after
load); runtime: a 3 s eased scroll through the page with rAF timing (frames over 20 ms = missed 60 Hz vsyncs).
**Rule: every local metric ≤ live**, or a written exemption below. Caveat: local is `tools/serve.ts` on localhost
(HTTP/1.1, no CDN); `cable` times favour it; `4g` adds the same latency to both. Phase 7 re-runs the gate against a
Vercel preview.

## 2026-11-23 (site at `490162fc` + this block; live = reactiive.io)

| route | width | profile | live: KB / req, FCP, LCP, TBT, CLS, jank | Exact: KB / req, FCP, LCP, TBT, CLS, jank | verdict |
|---|---|---|---|---|---|
| `/` | 1440 | cable | 656 / 39, 160, 1316, 0, 0, 0/182 | 246 / 17, 52, 1208, 0, 0, 0/182 | pass |
| `/` | 1440 | 4g | 656 / 39, 556, 1752, 62, 0, 0/182 | 246 / 17, 312, 1496, 10, 0, 0/182 | pass |
| `/` | 390 | cable | 656 / 39, 176, 1332, 0, 0, 0/182 | 246 / 17, 56, 1208, 0, 0, 0/182 | pass |
| `/` | 390 | 4g | 656 / 39, 588, 1772, 66, 0, 0/182 | 246 / 17, 312, 1500, 9, 0, 0/182 | pass |
| `/demos` | 1440 | cable | 781 / 46, 228, 824, 0, 0, 0/181 | 5266 / 164, 32, 32, 63, 0, 0/181 | exempt: bytes, TBT (the app) |
| `/demos` | 1440 | 4g | 782 / 46, 568, 1252, 57, 0, 0/181 | 3316 / 152, 320, 404, 442, 0, 0/181 | exempt: bytes, TBT (the app) |
| `/demos` | 390 | cable | 2943 / 70, 232, 1536, 0, 0, 90/91 | 5266 / 164, 36, 36, 59, 0, 0/181 | exempt: bytes, TBT (the app) |
| `/demos` | 390 | 4g | 2586 / 48, 560, 1904, 65, 0, 90/91 | 3316 / 152, 320, 396, 454, 0, 0/181 | exempt: bytes, TBT (the app) |
| 404 | 1440 | cable | 654 / 39, 224, 224, 0, 0, 0/182 | 246 / 17, 48, 48, 0, 0, 0/182 | pass |
| 404 | 1440 | 4g | 654 / 39, 520, 520, 73, 0, 0/182 | 246 / 17, 332, 812, 10, 0, 0/182 | **fails LCP** |
| 404 | 390 | cable | 654 / 40, 200, 200, 0, 0, 0/182 | 246 / 17, 28, 28, 0, 0, 0/182 | pass |
| 404 | 390 | 4g | 654 / 39, 488, 488, 64, 0, 0/182 | 246 / 17, 336, 816, 13, 0, 0/182 | **fails LCP** |

(Icons inlined since: the 404 at 4g is now 243 KB / 12 requests.)

## 2026-11-23, Exact 98ed61fb, /demos two-column + sandboxed frame (D12)

`perf.ts` now attaches out-of-process frames (their requests count, same throttling) and reports their blocking time
apart (`+N in 1 OOPIF`: the app's own main thread, not the page's). Median of 3.

| route | width | profile | live: KB / req, FCP, LCP, TBT | Exact: KB / req, FCP, LCP, page TBT (+ app's process) | verdict |
|---|---|---|---|---|---|
| `/demos` | 1440 | cable | 782 / 46, 192, 796, 0 | 3429 / 147, 52, 52, 0 (+73) | exempt: bytes (the app) |
| `/demos` | 1440 | 4g | 782 / 46, 604, 2148, 66 | 3429 / 147, 316, 680, 7 (+493) | exempt: bytes |
| `/demos` | 390 | cable | 2943 / 70, 148, 1452, 0 | 5270 / 159, 60, 1612, 0 (+66) | exempt: bytes; **LCP +160 ms open** |
| `/demos` | 390 | 4g | 2586 / 48, 564, 1900, 67 | 3299 / 146, 320, 1900, 8 (+518) | exempt: bytes |
| `/demos` (D12 revised, 3 runs, machine under load 25) | 1440 | cable / 4g | 872 / 2188, TBT 0 / 142 | 3510 / 149: LCP 460 / 592, page TBT 0 / 85 (+93 / +628 app) | exempt: bytes |
| `/demos` without the sim (`--block /demos/app/`) | 1440 | 4g | | 309 / 14, 316, -, 8 | the hero is as light as live's page minus its grid |

At 390 the sim's box is in the first viewport (its top at 327 px), so it loads at 1.6 s. The 390 LCP element is the
pill's text, whose blur-in ends at 1.55 s (as live's); the hero's other text is gradient-clipped (transparent colour),
which Chrome does not count; live's LCP is the first grid thumbnail. Jank: 0 frames over 20 ms on every route.
Note: runs on battery (low power) cap headless Chrome at 30 fps (every frame "janky", both origins): measure on AC.

## Exemptions and open failures

- **`/demos`, bytes and TBT: the Demos app.** The owner asked for the app in place of the video grid (D10); it is
  its own build (wasm GPU module, demo icons, shaders: ~3.3 MB on 4g, more on cable, where more icons load before the
  sample ends) running in a sandboxed frame (D12), so its start runs in its own renderer process, not on this page's main thread (page TBT
  7 ms at 4g vs live 66). The frame loads at 1.6 s, after the hero's entrances, when near the viewport; its box is
  reserved (CLS 0) and from 768 px a 133 KB still of the launcher stands in until it has drawn.
  The page around it (hero, header, footer) is 246 KB, the same as `/`. Live `/demos` on a phone drops 90 of 91
  frames while scrolling its video grid; the rebuild drops none.
- **404 at 4g, LCP: fixed at 1440, open at 390.** Inter's printable ASCII is now inlined (a 41 KB subset of the same
  variable file as a data: URL in the head; the rest of the file by unicode-range, fetched only by a page that uses
  one of those characters; no preload). The first paint is in Inter: 404 @1440 4g LCP 276 (live 528), `/` @1440 4g FCP
  304, LCP 1480 (live 564 / 1760); transfer 213 KB (was 246). At 390 4g a second, 1.4 % larger candidate of the same
  paragraph is reported at ~770 ms, when the runtime's stylesheet arrives (its box and computed style do not change:
  measured every frame); LCP 768 vs live 568: open. Previous analysis, kept for the record: The same text element is the LCP twice: first in the metric-matched fallback
  (`Inter Fallback`, next/font's numbers), then ~4 % larger when Inter swaps in at ~800 ms. Live paints first at
  ~500 ms with Inter already there (Vercel's edge: HTTP/2, the preload fetched with the document). To re-measure on a
  preview deploy before any change (`font-display: block` would only move FCP later).

## Runtime (all routes measured)

0 frames over 20 ms during the scroll on every local route and width (live `/demos` at 390: 90/91); CLS 0 (0.001 once
on a 4g 404 sample, under the 0.001 noise floor in perf.ts). Header stillness over in-app navigations: 0 px changed
(`tools/parity/nav.ts`, `/` ↔ `/demos`, 1440 and 390, live also 0).

## 2026-11-23, Inter's ASCII as a preloaded file (D7 amended again)

The 41 KB base64 subset inlined in every page's head script (≈45 KB gzip on every page, articles included) is now
`/assets/fonts/InterAscii.woff2?v=<hash>` (43 KB, `tnum` kept for tabular dates), preloaded by a head link
(`crossorigin`), cached for good (`compose.ts`: `/assets/fonts/` immutable; the URL carries the content hash), with
`font-display: block`. With `swap` the font arrived (~440 ms at 4g) after the first paint and its swap repainted only
once app.js had run (~780 ms: a second, 4 % larger LCP candidate). With `block` the text's first paint is already Inter, at
the font's arrival. Median of 3, machine load 13-15, AC power:

| route | width | profile | live FCP / LCP | before (inlined): KB, FCP, LCP | after: KB, FCP, LCP, TBT, CLS |
|---|---|---|---|---|---|
| `/` | 1440 | cable | 184 / 1380 | 213, 52, 1208 | 193, 52, 1220, 0, 0 |
| `/` | 1440 | 4g | 624 / 1824 | 213, 304, 1480 | 193, 328, 1512, 10, 0 |
| `/` | 390 | 4g | 560 / 1756 | 213, 312, 1500 | 193, 320, 1508, 11, 0 |
| 404 | 1440 | 4g | 532 / 532 | 213, 332, 276 | 192, 348, 484, 12, 0 |
| 404 | 390 | 4g | 568 (earlier run) / 3540 (this run) | 213, 336, 768 (failed) | 192, 348, 472, 9, 0 |

All pass; the 404 at 390 4g LCP is fixed (the open "second candidate"). A first visit pays one request more; every later page
reads the font from the cache (it was re-downloaded inside each page's HTML before). Pixels: `/` 0.03 / 0.28 %, 404 0.03 / 0.28 %.

## 2026-11-23, content pages activate on intent (D16)

Median of 3, live = reactiive.io, same session, AC power (machine load 8-60 for the "before" run). TBT in ms; 4g is
170 ms RTT + 4x CPU. Before = `319dac3a` (every route `activate=idle`), after = `85fada28`.

| route | live TBT 4g (1440 / 390) | before | after | after: KB 4g, LCP 4g (1440), CLS |
|---|---|---|---|---|
| `/` | 66-79 / 64-73 | 5 / 6 | 44 / 6 | 391, 1540 (live 1752), 0 |
| `/articles` | 69-74 / 64-69 | 20 / 22 | 0 / 0 | 961, 740 (live 3072), 0 |
| `/articles/pan-gesture-handler` (demo in the first viewport) | 74-84 / 71-110 | 225 / 259 | 72 / 73 | 1814, 440 (live 608), 0 |
| `/articles/smooth-dropdown` | 74-76 / 74-77 | 317 / 429 | 0 / 0 | 554, 460 (live 636), 0 |
| `/articles/the-hidden-gems-of-react-native` (no demo) | 81 / 71-85 | 110 / 106 | 0 / 0 | 1010, 444 (live 624), 0.004 (live 0.004) |
| `/docs/license` | 65 / 62-72 | 14 / 16 | 0 / 0 | 63, 428 (live 576), 0 |
| `/course` | 63-64 / 70-171 | 26 / 81 | 0 / 0 | 1030, 508 (live 724), 0 |

Cable: TBT 0 everywhere, FCP / LCP under live's on every route. Every TBT, LCP, FCP, CLS and transfer cell is ≤ live.
**Open: scroll jank on pages that wake while scrolled.** A page with an `intersect` node (a demo, a YouTube / X embed)
wakes the runtime at the reader's first scroll (Exact's rule), and the boot lands in that scroll: `smooth-dropdown`
2-3 frames over 20 ms (max 150-183 ms at 4x CPU), `pan-gesture-handler` 1-3 (max 50-67 ms); live 0. Next: embeds as
native `loading="lazy"` frames (no `intersect`), so only demo pages wake.
**Fixed (next section).**

## 2026-11-23, no runtime start inside a scroll (D16 amended)

The embeds are the browser's lazy frames (no `intersect`), the demos' frames have none either, and a page with a demo
starts its runtime on idle once parsed, never within 250 ms of a scroll (`web/reveal.js`). perf.ts's scroll (3 s eased,
5 s after load), median of 3, AC power, machine load ~9. Jank = frames over 20 ms; the longest frame is one vsync
(17 ms) in every cell, so no frame over 16.7 ms is a missed one.

| route | profile | before (`8ad31754`): jank, longest | after: jank (longest), TBT 1440 / 390 | live TBT 1440 / 390 |
|---|---|---|---|---|
| `/articles/smooth-dropdown` | cable | 2 (67 ms) | 0 (17), 0 / 0 | 0 / 0 |
| `/articles/smooth-dropdown` | 4g | 2-3 (150-300 ms) | 0 (17), 0 / 0 | 78-92 / 77-79 |
| `/articles/pan-gesture-handler` | cable | 0 (17 ms) | 0 (17), 0 / 0 | 0 / 0 |
| `/articles/pan-gesture-handler` | 4g | 1-3 (50-67 ms) | 0 (17), 77 / 72 | 78 / 73 |
| `/articles/metaball`, `animated-gradient`, `skeleton-loader` (canvas demos, local) | cable / 4g | | 0 (17) everywhere; TBT 4g 56-78 / 60-97 | 71-98 (other articles) |

Bytes: the YouTube frame now loads with the page when it is within the browser's lazy distance (smooth-dropdown 4g
554 -> 1406 KB, its player in its own process); live loads it at once too (1974 KB). Every cell ≤ live except
`/articles/metaball` @390 4g TBT 97, which has no live column in this run (live articles 71-98): to re-measure in the
next sweep. Starting at the demo's approach (1.5 viewports) was not taken: a reader scrolling steadily is mid-scroll
then. With the start after `load` instead of after parsing, pan-gesture-handler 4g was 81-100 (the start then competed
with the YouTube frame's load).

## 2026-11-23, /demos redesign (D17): before (origin/site 5b032ed5) against after

`perf.ts http://localhost:4316 (before) http://localhost:4315 (after) /demos --runs 3`: both builds composed with the
same Demos artifact, served locally. **Caveat: machine load 88 and on battery (18 %)**, so headless Chrome ran at
30 fps (jank 90/91 on both: the battery cap, see above) and times are noisy; the two columns ran interleaved.

| width | profile | before: KB / req, FCP, LCP, page TBT (+ app), CLS | after: KB / req, FCP, LCP, page TBT (+ app), CLS |
|---|---|---|---|
| 1440 | cable | 3680 / 185, 252, 1508, 0 (+88), 0 | 3681 / 185, 88, 260, 0 (+100), 0 |
| 1440 | 4g | 3680 / 186, 324, 660, 28 (+800), 0 | 3681 / 186, 328, 672, 27 (+737), 0 |
| 390 | cable | 5522 / 197, 160, 1696, 0 (+97), 0 | 5522 / 197, 80, 1632, 0 (+83), 0 |
| 390 | 4g | 3550 / 184, 352, 1420, 26 (+603), 0 | 3551 / 184, 324, 1420, 20 (+677), 0 |

+1 KB on the wire, no new request, CLS 0, page TBT equal or lower; 1440 4g FCP/LCP +4/+12 ms are within this run's
noise. To re-run on AC power with an idle machine before merging.

## 2026-11-23/24, navigating the sim (D18-D20): before (`ddfba72e`, demos `d2f01f0a`) against after (`site-demos-nav`)

**Caveat: machine load 200-850 (other agents' simulators and builds) for every run**; before and after ran interleaved,
so they share the noise, but absolute times are inflated and single cells are noisy. Headed Chrome, real vsync (120 Hz
on this display: one dropped frame = one missed 8.3 ms vsync), AC power. Local `tools/serve.ts` is HTTP/1.1 (6
connections per origin; Vercel is HTTP/2), now with ETags (304s, as the host). Median of 3 unless noted.

**Arriving at /demos, desktop 1440x900** (`tools/parity/sim-arrive.ts`; ms from the navigation or the header click;
"live" = the framed app shown, "interactive" = live + a tap on an icon that opens its demo):

| scenario | profile | before: FCP / still / live / interactive | after: FCP / still / live / interactive |
|---|---|---|---|
| cold (empty cache) | cable | 524 / 423 / 3538 / 3571 | 712 / 970 / 2274 / 2375 |
| warm (repeat visit) | cable | 100 / 68 / 3160 / 3042 | 80 / 233 / 2244 / 2364 |
| in-app (from /articles, header click) | cable | - / 453 / 3153 / 3190 | - / 164 / 2212 / 2244 |
| cold | 4g | 960 / 914 / 6205 / 6456 | 952 / 984 / 4816 / 5079 |
| warm | 4g | 424 / 668 / 5682 / 6593 | 340 / 444 / 4577 / 4744 |
| in-app | 4g | - / 1144 / 5180 / 5392 | - / 593 / 4057 / 4146 |

The frame now loads 600 ms in instead of after the hero's 1.6 s entrances (its start is in its own process): live
-1.0 to -1.3 s everywhere. Warm is not faster than cold for the frame: the sandboxed frame has no HTTP cache (D18,
measured: 144 requests and ~5 MB again on every visit, the `immutable` files included). Back to /demos within a tab
keeps the frame (D17): 0 reloads (verified again: the kept frame is the same document, `live` at once).

**Phones (390x844, touch): /demos → "Open the demos" → the app full screen** (no frame in the page any more, D20):
tap → launcher drawn: cable 1312 cold / 937 warm; 4g 3492 cold / 4831 warm (local HTTP/1.1: ~130 revalidations over 6
connections at 170 ms RTT; one run, noisy). Before, the phone's frame loaded only when scrolled near, 1.6 s at the
earliest, inside the page.

**Inside the app** (tap on an icon → the demo's root mounted; 10 demos in a row, GPU and plain; median / max):
desktop cable 40 / 124 → 34 / 114; desktop 4g 101 / 301 → 98 / 816 (one GPU demo's first open under load); phone
(full screen) cable 66 / 598, 4g 240 / 492. Deep link `/demos/chessboard` (308) → the demo drawn: desktop cable
503 → 512, 4g 1744 → 1911, phone 4g 1226 (unchanged path: the redirect, then the app's own start).

**Frame pacing in the framed app, 1440x900** (`tools/parity/sim-frames.ts`, dropped 120 Hz frames per interaction,
median over 3 interleaved rounds; before = the old embedding CSS put back with `--css`, same build; app = the same
build alone at the top):

| interaction | before (embedded) | after (embedded) | app alone |
|---|---|---|---|
| launcher drag (450 ms) | 1 | 0 | 35 |
| launcher flick | 15 | 0 | 3 |
| page back (drag + flick) | 0 | 5 | 0 |
| open a demo (10 demos, 1.2 s window) | 28 | 22.5 | 23 |
| close | 3.5 | 3 | 8.5 |
| pull to search | 1 | 1 | 0 |
| scroll inside a demo | 0 | 0 | 0 |

p95 frame interval 10.0-10.3 ms in every cell (one vsync plus jitter). Per demo, the longest frame on open: GPU
demos 50-210 ms (Sculptures in Words, The Little Prince, Card Shader Reflections, Chessboard) in both the embedded and
the standalone app: their first frame builds shader modules and pipelines, and Chrome's WebGPU compiles on the GPU
process's main thread, which stalls every compositor frame (the page's too, measured). **That is the app's own cost**
(the native warm-up, `gpu/src/warm.rs`, is a no-op on wasm: "the browser's device is not Send"). The embedding's own
cost was small and is gone (no mask or rounded clip over the frame); the rest is noise at this load. To remove the
open stalls: warm on the web with `createRenderPipelineAsync` (compiled off the GPU main thread) in idle slices, an
Exact/wgpu web change.

1728x960 (one round each, same order): drag 1 / 1 / 1, flick 0 / 9 / 0, open 35 / 31.5 / 22, close 4.5 / 5.5 / 16,
pull to search 44 / 0 / 1 (before / after / app alone). Phone 390x844, the app full screen as phones now get it (one
round): drag 4, flick 1, open 20, close 3, pull to search 22, scroll 0. **Verdict: not yet 0 on open.** The target
(0 dropped on paging / open / close on a desktop) is met for paging and close within noise; open keeps the GPU
demos' first-use compile stalls, the app's own, same embedded or alone.

### Re-run after the review fixes (2026-11-24: the app draws only its display in the frame, the hint's stops; load 90-280)

One round, same build, 1440x900, dropped 120 Hz frames (before = the old embedding CSS put back / after / the app
alone): drag 7 / 9 / 62, flick 0 / 0 / 0, open (median of 10 demos) 33.5 / 17.5 / 33, close 1 / 0 / 4, pull to search
21 / 0 / 1, scroll in a demo 0 / 0 / 0; p95 9.9-10.4 ms everywhere. Arrival, one run (cable / 4g): cold live
2013 / 4658, warm 1937 / 4930, in-app 1868 / 5822 ms; ten demos tap → mounted median 27 / 205 ms; deep link 356 /
2819 ms. Phones: tap "Open the demos" → the launcher drawn in 500-770 ms on cable at 390x844, 360x780, 430x932.
Composable Text check: pass. The corners of the display, sampled at DPR 2 and 3 (1440x900, 1728x960) and DPR 2
(820x1180): no lighter corner, no step at the clip's edge (≤ 1/255 across it).

## 2026-11-24, the canvas-demo articles at 4g: TBT and scroll ≤ live (final sweep follow-up)

`perf.ts` now interleaves runs (live run i, then local run i). 4g + 4x CPU, median of 5 interleaved runs each, machine
load 7-9, AC power. TBT ms (the page's own; the YouTube frame's process apart, equal on both); jank = frames over 20 ms
in the 3 s scroll.

| route | width | before (final sweep): TBT / jank | after: TBT / jank | live: TBT / jank |
|---|---|---|---|---|
| `/articles/pan-gesture-handler` | 1440 | 99 / 0 | 74 / 0 | 84 / 0 |
| `/articles/pan-gesture-handler` | 390 | 89 / 0 | 69 / 0 | 81 / 0 |
| `/articles/introduction-to-reanimated` | 1440 | 115 / 0 | 0 / 0 | 82 / 0 |
| `/articles/introduction-to-reanimated` | 390 | 116 / 0 | 0 / 0 | 79 / 0 |
| `/articles/metaball` | 1440 | 84 / 5 | 0 / 0 | 80 / 0 |
| `/articles/metaball` | 390 | 84 / 0 | 0 / 0 | 78 / 0 |
| `/articles/animated-spiral` | 1440 | 94 / 5 (max 67 ms) | 118 / 0 | 190 / 0 |
| `/articles/animated-spiral` | 390 | 83 / 2 | 110 / 0 | 188 / 0 |
| `/articles/interpolate-with-scrollview` | 1440 / 390 | 0 / 0 | 0 / 0 | 78-79 / 0 |
| `/articles/smooth-dropdown`, `the-hidden-gems-of-react-native` | 1440 / 390 | | 0 / 0 | 76-82 / 0 |

FCP / LCP / CLS / bytes ≤ live in every cell (LCP 436-456 vs 592-632). What changed, and why (traces at 4x CPU):

- **The runtime's start on a page whose demos are far down waits until the reader pauses near one** (2.5 viewports
  below, 1.5 above; `web/reveal.js`). It used to start on idle after the load (115 ms of TBT on
  introduction-to-reanimated, whose first demo is 5 viewports down). The start is taken over from Exact's capture
  script (`exact.ready` is ours), so the capture's own triggers (an `intersect` node entering the window, the first
  scroll) can no longer start it inside a scroll; a press still starts it at once and is replayed.
- **Canvas demos mount with the page and paint first only when the scroll has settled** (one per frame;
  `components/interactive/_canvas/draws.ts`). A canvas mounted inside a scroll cost a whole-document style pass (~27 ms:
  Exact's runtime CSS has ~40 `:has()` rules, so any insertion restyles the document); the spiral no longer takes its
  visibility as an argument (a changed argument repainted 1,500 dots and their halo, 20-35 ms, inside the scroll).
- **Code blocks off screen are neither shaped nor laid out** (`content-visibility: auto`, their exact size
  `32 + 21 × lines` px from `data-lines`: no layout shift, page heights unchanged); their highlight ranges are painted
  when they are about to render or in idle time after the load. First layout of pan-gesture-handler 105 → 86 ms.
- **Fewer nodes for the runtime to place at its start**: the inline runs' plain case first and the article blocks'
  kinds by frequency (each `else if` passed is an anchor the runtime inserts: pan-gesture-handler 3,014 → 1,766
  insertions at the start); a paragraph of plain runs is one text; the feedback and cancel dialogs only for a signed-in
  reader. The head scripts' observers look at live lists, not at every added node.

Pixels unchanged (compare.ts over every article, the docs, `/`, `/course`, `/inspirations`: the same values as the
final sweep, ≤ 0.31 % against the re-shot live captures).

## 2026-11-24, preloads (D24): main (`42317636`) against `site-tablet-sim`

Cold, 1440x900, DevTools throttling at 4G (150 ms RTT, 1.6 Mbps down, 750 kbps up), cache off, the page's renderer
only (the framed app's own requests are another process's). Transfer and requests 12 s after load, median of 3:

| Page | Transfer | Requests | JS files | LCP |
|---|---|---|---|---|
| /demos main | 685 KB | 52 | 45 | 1764 ms |
| /demos PR | 593 KB | 29 | 22 | 1776 ms |
| / main | 425 KB | 49 | 45 | 864 ms |
| / PR | 319 KB | 24 | 20 | 860 ms |

Input on the header's "Articles" 3 s after load → /articles with its cards drawn, median of 5 (same throttling; a tap
holds the finger 60 ms):

| From | Tap main / PR | Click (no move) main / PR | Hover 300 ms, click main / PR |
|---|---|---|---|
| / | 125 / 108 ms | 32 / 31 ms | 37 / 28 ms |
| /demos | 143 / 136 ms | 31 / 30 ms | 30 / 29 ms |

Crispness of the framed app (the display's crop, 1440x900, Laplacian standard deviation): identical to main at DPR 2
and 3 (the frame is main's; only the bridge's pointer answer changed).

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

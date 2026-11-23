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

## Exemptions and open failures

- **`/demos`, bytes and TBT: the Demos app.** The owner asked for the app in place of the video grid (D10); it is
  its own build (wasm GPU module, demo icons, shaders: ~3.3 MB on 4g, more on cable, where more icons load before the
  sample ends) running in a same-origin frame, whose start is main-thread work of this page. Mitigation in place: the
  frame loads 1.6 s in, after the hero's entrances (which stay at 0 dropped frames), and its box is reserved (CLS 0).
  The page around it (hero, header, footer) is 246 KB, the same as `/`. Live `/demos` on a phone drops 90 of 91
  frames while scrolling its video grid; the rebuild drops none.
- **404 at 4g, LCP (open).** The same text element is the LCP twice: first in the metric-matched fallback
  (`Inter Fallback`, next/font's numbers), then ~4 % larger when Inter swaps in at ~800 ms. Live paints first at
  ~500 ms with Inter already there (Vercel's edge: HTTP/2, the preload fetched with the document). To re-measure on a
  preview deploy before any change (`font-display: block` would only move FCP later).

## Runtime (all routes measured)

0 frames over 20 ms during the scroll on every local route and width (live `/demos` at 390: 90/91); CLS 0 (0.001 once
on a 4g 404 sample, under the 0.001 noise floor in perf.ts). Header stillness over in-app navigations: 0 px changed
(`tools/parity/nav.ts`, `/` ↔ `/demos`, 1440 and 390, live also 0).

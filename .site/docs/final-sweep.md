# Final sweep before merging into `main` (2026-11-23/24)

Every route, both widths (1440 desktop, 390 touch), with the existing tools, against the live reactiive.io. Site at the
commit that adds this file (Exact 98ed61fb, demos artifact key `d2f01f0a…`), served by `tools/serve.ts` on :4310 from
`tools/compose.ts`'s output. Machine: an M-series laptop shared with other agents' builds (load 6-60), on battery for
the first perf pass (no 30 fps cap observed: the longest frame was 17 ms wherever nothing was janky).

Routes: the 25 sitemap URLs (`/demos`, `/articles`, 23 articles) plus `/`, `/course`, `/inspirations`, `/demos-app`,
`/docs` and its 3 pages, the 4 series, the 404, `/profile` signed out: 38 pages; the 126 `/demos/<slug>` posts, the 6
Demos-tied article/series URLs and `/manage-subscription` as redirects.

## Headline

| check | result |
|---|---|
| 1. pixels vs live | 34 of 38 pages ≤ 0.5 % at both widths (median 0.05 %); 4 over: `/demos`, `/profile` (→ `/demos`) and `/articles` deliberate (D10/D12/D17, D13), `/series/animate-with-reanimated` a live-capture artifact (below) |
| 2. motion / reveal / hover | header, entrances and card cascade equal to live except the deliberate pages; 0 unexplained differences after classification (below); `/demos` title fixed back to live's entrance |
| 3. header across in-app navigation | 0 px changed on `/course → / → /articles → article → /demos → /articles → /` at 1440 and 390 (live also 0); was 1,635 px (Sign In re-popping after a document navigation): fixed |
| 4. head parity | `head-diff --strict`: 41 / 41 (every route plus robots, sitemap, RSS, manifest); 2 fixed |
| 5. perf | LCP ≤ live on 140 of 148 cells: 5 static pages at cable by 8-44 ms in single runs (localhost HTTP/1.1, under the noise of one run), `/demos` @390 cable +68 ms, `pan-gesture-handler` @390 4g +120 ms; CLS 0 everywhere (live up to 0.036); transfer ≤ live everywhere but `/demos` (the app, exempt); TBT ≤ live except 3 demo articles at 4g (+2 to +181 ms); scroll: 0 frames over 20 ms on the 3 long articles at cable, isolated 33-50 ms frames on 7 demo-article cells at 4g |
| 6. links | 156 internal links and assets referenced by the 40 built HTML files, CSS, sitemap, RSS, manifest: 156 × 200, 0 broken; 126 + 6 + 2 redirects land on 200 pages |
| 7. isolation | Demos capture identical (481 files / 21,465,912 bytes, lists byte-identical, `origin/main` vs HEAD); artifact key equal at both; root `bun.lock` untouched, `.site` installs alone; outside `.site/` only 4 workflow files |
| 8. secrets | `check-secrets --tracked`: 513 files, 0 findings; `--dir dist .vercel/output`: 0 findings |
| navigation (owner bug) | `nav-correct.ts`: every header / menu link × 8 page kinds × cold / warm / hovered / mid-scroll / keyboard × 1440 / 390, Back and Forward (and Back must stay back 3 s): 21 rounds (7 processes × 3), 7,938 checks, **0 failures** |
| Sign In (owner bug) | `sign-in.ts`: 5 pages × cold / warm / in-app × 1440 / 390: 60 checks, 0 failures; the dialog opens in ≤ 90 ms, a provider the API cannot answer shows the error toast |

## Fixes made in this sweep (each its own commit)

1. `/inspirations`, `/demos-app`: `og:image:alt` is the page description, as live (head-diff).
2. `tools/seo/postbuild.ts` refuses a second pass over the same build (it silently duplicated head tags).
3. `.github/workflows/site.yml` was invalid YAML (an unquoted `: ` in a step name): every Site run failed at 0 s since
   the secret-check step was added. Quoted.
4. Header stillness: a page not yet awake navigates by document (D16), and Sign In's pop-in replayed on every such
   page. A page reached from the site (not a reload) marks `html[data-nav]` and skips it.
5. Owner: the `/demos` title's draw-on animation removed (outlines, tool, CSS); the live entrance restored (D17 updated).
6. Owner: Sign In opened nothing without `SITE_ACCOUNTS=1`. It opens the dialog on every build, at once even before the
   runtime (head script); providers that cannot be reached answer with an error toast and retry (never disabled).
7. Owner: the mobile menu's links did nothing (a link with its own `press` does not navigate in Exact; the press only
   closed the menu). Plain links now; the menu closes on the route change.
8. Owner ("Demos often doesn't navigate"): a press landing in the runtime's first ~20 ms could be swallowed (or its link
   replaced between press and release) and the 404's runtime rebuilt its whole document (so a cold tap there was
   replayed on removed nodes). The 404 now adopts its document; a press not carried out in 2.5 s loads its page as a
   document (and a URL changed without its page drawn is reloaded).
9. Found by the new navigation test, fixed: the safety net of 8 re-navigated after a Back (a bfcache restore, or a Back
   within 200 ms of an in-app navigation): it now stands down on `pagehide` and as soon as the Navigation API reports
   a navigation toward its link.
10. `hover.ts` on the series pages: the article card's hover took the reference's hover classes (white/4 background,
   white/95 title, white/80 dims), which live's inline styles override: live keeps its colours and only lifts. Now
   the same.
11. Tooling: `nav.ts` reaches pages the header does not link and hovers before pressing; new `nav-correct.ts` and
   `sign-in.ts`.

## 1. Pixels (`shoot.ts` + `compare.ts`, threshold 32/255, full page)

Live = `/tmp/reactiive-live` (captured 2026-11-23 11:25); routes whose live capture showed images not yet loaded or
cards mid-reveal were shot again (marked). Text-placement counts are not available for the first live capture (no
`dom.json`), only for the re-shot ones.

| route | 1440 | 390 | flag |
|---|---|---|---|
| `/` | 0.02 % | 0.28 % |  |
| `/demos` | 20.17 % | 47.67 % | **> 0.5 %**: deliberate (D10 app in place of the grid, D12/D17 desktop layout) |
| `/articles` | 35.54 % | 45.22 % | **> 0.5 %**: deliberate (D13: 4 Demos-tied cards not ported; the grid below them shifts) |
| `/course` | 0.04 % | 0.01 % |  |
| `/inspirations` | 0.01 % | 0.14 % |  |
| `/demos-app` | 0.02 % | 0.18 % |  |
| `/docs` | 0.02 % | 0.22 % |  |
| `/docs/terms` | 0.06 % | 0.07 % |  |
| `/docs/privacy` | 0.24 % | 0.11 % |  |
| `/docs/license` | 0.01 % | 0 % |  |
| `/profile` | 18.91 % | 47.53 % | **> 0.5 %**: 307 → /demos signed out, as live (live renders /demos too); same as /demos |
| `/this-page-does-not-exist` | 0.03 % | 0.28 % |  |
| `/series/animate-with-reanimated` | 7.18 % | 32.26 % | **> 0.5 %**: live capture: its last row not yet revealed / mid-scale in both live shots (reveal.ts: same delays, local starts earlier); local complete |
| `/series/exploring-skia` | 0.02 % | 0.14 % |  |
| `/series/react-native-toolbelt` | 0.06 % | 0.27 % |  |
| `/series/what-about-gestures` | 0.04 % | 0.29 % |  |
| `/articles/introducing-refined` | 0.02 % | 0.05 % |  |
| `/articles/appjs-2025` | 0.02 % | 0.03 % |  |
| `/articles/checkbox-interactions` | 0.03 % | 0.25 % |  |
| `/articles/bottom-sheet-animation` | 0.06 % | 0.08 % |  |
| `/articles/css-animations-react-native` | 0.02 % | 0.06 % |  |
| `/articles/animated-loader-skia` | 0.03 % | 0.09 % |  |
| `/articles/skeleton-loader` | 0.03 % | 0.08 % |  |
| `/articles/metaball` | 0.03 % | 0.05 % |  |
| `/articles/animated-spiral` | 0.13 % | 0.19 % |  |
| `/articles/introduction-to-reanimated` | 0.03 % | 0.07 % |  |
| `/articles/animated-gradient` | 0.04 % | 0.11 % |  |
| `/articles/the-hidden-gems-of-react-native` | 0.11 % | 0.11 % |  |
| `/articles/animated-flat-list` | 0.04 % | 0.09 % |  |
| `/articles/introduction-to-gestures` | 0.05 % | 0.08 % |  |
| `/articles/setup-reanimated-gestures` | 0.02 % | 0.05 % |  |
| `/articles/smooth-dropdown` | 0.04 % | 0.06 % |  |
| `/articles/circular-progress-bar` | 0.03 % | 0.04 % |  |
| `/articles/the-power-of-lottie` | 0.06 % | 0.13 % |  |
| `/articles/pinch-gesture-handler` | 0.03 % | 0.06 % |  |
| `/articles/interpolate-with-scrollview` | 0.03 % | 0.05 % |  |
| `/articles/pan-gesture-handler` | 0.03 % | 0.07 % |  |
| `/articles/haptic-feedback` | 0.06 % | 0.16 % |  |

`/series/animate-with-reanimated`: in both live captures its last row of cards is still at opacity 0 / mid-scale when
the shot is taken (live's RevealOnScroll fires late after the scroll-through); `reveal.ts` on the same page: the same
delays, batches and easing on both, local starting ~150 ms earlier (live waits for hydration). Not a rebuild
difference. `/articles`: the 4 Demos-tied cards are not ported (D13), so every later card sits one slot earlier.

## 2. Motion, reveal, hover

`motion.ts` (entrances' keyframes, timing and 5 sampled frames; each link's and button's cursor, transition and hover
look) over the 37 pages at 1440 and 390: 0 differences on 15 pages at both widths (/, /inspirations, /demos-app, /docs
and its 3 pages, the 404, 10 articles), the rest classified:

| route | 1440 | 390 | what |
|---|---|---|---|
| `/demos` | 31 | 17 | deliberate (D10/D12/D17: the grid replaced by the app; title entrance now equal to live); D14: the demos' endless loops are CSS keyframes here, JS-driven on live (not listed on live) |
| `/articles` | 18 | 7 | D13 (4 cards not ported: the stagger shifts by those cards); article card hover read on a live card mid-reveal (live: rest look); ours matches the reference source (hover:bg-white/[0.04], title white/95); hover.ts box diff: see below |
| `/course` | 12 | 1 | live's course entrance is framer-motion (JS, not a WAAPI animation: not listed on live); testimonial hover: the hairline rim (open) |
| `/series/animate-with-reanimated` | 6 | 0 | article card hover read on a live card mid-reveal (live: rest look); ours matches the reference source (hover:bg-white/[0.04], title white/95); hover.ts box diff: see below |
| `/series/exploring-skia` | 4 | 0 | article card hover read on a live card mid-reveal (live: rest look); ours matches the reference source (hover:bg-white/[0.04], title white/95); hover.ts box diff: see below |
| `/series/react-native-toolbelt` | 3 | 0 | article card hover read on a live card mid-reveal (live: rest look); ours matches the reference source (hover:bg-white/[0.04], title white/95); hover.ts box diff: see below |
| `/series/what-about-gestures` | 2 | 0 | article card hover read on a live card mid-reveal (live: rest look); ours matches the reference source (hover:bg-white/[0.04], title white/95); hover.ts box diff: see below |
| `/articles/appjs-2025` | 1 | 0 | GitHub card: the same looks, children listed in a different DOM order (rows swapped) |
| `/articles/bottom-sheet-animation` | 2 | 0 | timing: Sign In's 450 ms pop-in started before the sample (font-display block delays FCP); both sides miss it on some loads |
| `/articles/css-animations-react-native` | 10 | 10 | D14: the demos' endless loops are CSS keyframes here, JS-driven on live (not listed on live) |
| `/articles/animated-loader-skia` | 2 | 0 | timing: Sign In's 450 ms pop-in started before the sample (font-display block delays FCP); both sides miss it on some loads; GitHub card: the same looks, children listed in a different DOM order (rows swapped) |
| `/articles/skeleton-loader` | 6 | 6 | D14: the demos' endless loops are CSS keyframes here, JS-driven on live (not listed on live) |
| `/articles/metaball` | 2 | 0 | timing: Sign In's 450 ms pop-in started before the sample (font-display block delays FCP); both sides miss it on some loads; GitHub card: the same looks, children listed in a different DOM order (rows swapped) |
| `/articles/animated-gradient` | 1 | 0 | GitHub card: the same looks, children listed in a different DOM order (rows swapped) |
| `/articles/animated-flat-list` | 1 | 0 | timing: Sign In's 450 ms pop-in started before the sample (font-display block delays FCP); both sides miss it on some loads |
| `/articles/introduction-to-gestures` | 1 | 0 | GitHub card: the same looks, children listed in a different DOM order (rows swapped) |
| `/articles/circular-progress-bar` | 1 | 0 | timing: Sign In's 450 ms pop-in started before the sample (font-display block delays FCP); both sides miss it on some loads |
| `/articles/the-power-of-lottie` | 1 | 0 | timing: Sign In's 450 ms pop-in started before the sample (font-display block delays FCP); both sides miss it on some loads |
| `/articles/pinch-gesture-handler` | 1 | 0 | GitHub card: the same looks, children listed in a different DOM order (rows swapped) |
| `/articles/interpolate-with-scrollview` | 1 | 0 | GitHub card: the same looks, children listed in a different DOM order (rows swapped) |
| `/articles/haptic-feedback` | 1 | 0 | timing: Sign In's 450 ms pop-in started before the sample (font-display block delays FCP); both sides miss it on some loads |

`reveal.ts` (every card of `/articles` and the 4 series, per frame from navigation start and through a 1200 px/s
scroll): delays, batches, easing equal; no flash, no restart; local's first batch starts 110-220 ms earlier than
live's (live waits for hydration).

Open (bigger, not fixed here): the `/course` testimonial cards' rim (live: figma-squircle clip with a gradient rim;
here a CSS squircle and a hairline inset shadow, same pixels within 0.04 %, but the hover reads a box-shadow live
does not have).

## 3. Header across in-app navigation (`nav.ts`)

`/course,/,/articles` · `/articles,/articles/introducing-refined,/demos` · `/demos,/articles,/` (the round trip in three
recordings, so each fits the screencast analysis), pointer hovering each link 1 s before the press:

| origin | width | frames | frames with a header change | document loads |
|---|---|---|---|---|
| local | 1440 | 200 / 184 / 212 | 0 / 0 / 0 | 1 / 2 / 0 |
| live | 1440 | 211 / 174 / 231 | 0 / 0 / 0 | 0 / 0 / 0 |
| local | 390 | 81 / 63 / 78 | 0 / 0 / 0 | 0 / 1 / 0 |
| live | 390 | 222 / 129 / 119 | 0 / 0 / 0 | 0 / 0 / 0 |

Before fix 4: 26 frames, up to 1,635 px (Sign In re-entering) on `/articles → article → /demos`. `/course` is linked
from no page (live neither): it is entered by address.

## 4. Head parity

`bun tools/parity/head-diff.ts --strict` on the built HTML: 41 ok, 0 different (37 pages, robots.txt, sitemap.xml,
rss.xml, manifest.json). Fixed: `og:image:alt` on `/inspirations` and `/demos-app`.

## 5. Performance (`perf.ts`, median; local vs live)

First pass `--runs 1` over every route, width and profile (148 cells); misses re-measured with `--runs 3`
(4g: 8 articles and `/docs/terms`). A third pass of the cable misses and the 4g articles ran while other agents'
builds held the machine at load 20-180 (live's own TBT read 2-6x its usual values): discarded, not used below. Cells: LCP ms, TBT ms (+ the Demos app's own process), CLS,
KB transferred, frames over 20 ms; live in brackets.

| route | width | cable: LCP, TBT, CLS, KB, jank (live) | 4g: LCP, TBT, CLS, KB, jank (live) | misses |
|---|---|---|---|---|
| `/` | 1440 | 704, 0, 0, 409, 0 (1420, 0, 0, 656, 0) | 1492, 3, 0, 409, 0 (1856, 65, 0, 656, 0) |  |
| `/` | 390 | 1212, 0, 0, 409, 0 (1404, 0, 0, 656, 0) | 1520, 7, 0, 409, 0 (1748, 70, 0, 656, 0) |  |
| `/demos` | 1440 | 324, 0 (+0 app), 0, 980, 0 (1740, 0, 0, 781, 0) | 684, 23 (+516 app), 0, 3706, 1 (1276, 63, 0, 782, 0) | cable: bytes 980 vs 781, fcp 208 vs 172; 4g: bytes 3706 vs 782, janky 1 vs 0 |
| `/demos` | 390 | 1592, 0 (+70 app), 0, 3735, 0 (1524, 0, 0, 3085, 90) | 1376, 17 (+506 app), 0, 3576, 1 (1904, 80, 0, 2586, 91) | cable: bytes 3735 vs 3085, lcp 1592 vs 1524; 4g: bytes 3576 vs 2586 |
| `/articles` | 1440 | 1196, 0, 0, 977, 0 (1260, 0, 0, 2271, 0) | 740, 0, 0, 977, 0 (3068, 66, 0, 2272, 0) | cable: fcp 196 vs 172 |
| `/articles` | 390 | 832, 0, 0, 977, 0 (1060, 0, 0, 990, 0) | 572, 0, 0, 977, 0 (1456, 63, 0, 990, 0) |  |
| `/course` | 1440 | 204, 0, 0, 1046, 0 (276, 0, 0, 1550, 0) | 492, 0, 0, 1046, 0 (768, 68, 0, 1550, 0) |  |
| `/course` | 390 | 60, 0, 0, 1046, 0 (248, 0, 0, 1550, 0) | 504, 0, 0, 1046, 0 (696, 55, 0, 1550, 0) |  |
| `/inspirations` | 1440 | 156, 0, 0, 78, 0 (176, 0, 0, 655, 0) | 424, 0, 0, 78, 0 (592, 61, 0, 651, 0) |  |
| `/inspirations` | 390 | 64, 0, 0, 78, 0 (180, 0, 0, 655, 0) | 436, 0, 0, 78, 0 (672, 58, 0, 655, 0) |  |
| `/demos-app` | 1440 | 248, 0, 0, 79, 0 (204, 0, 0, 666, 0) | 440, 0, 0, 79, 0 (560, 58, 0, 666, 0) | cable: fcp 248 vs 204, lcp 248 vs 204 |
| `/demos-app` | 390 | 44, 0, 0, 79, 0 (256, 0, 0, 666, 0) | 432, 0, 0, 79, 0 (564, 68, 0, 666, 0) |  |
| `/docs` | 1440 | 164, 0, 0, 77, 0 (192, 0, 0, 654, 0) | 444, 0, 0, 77, 0 (560, 64, 0, 654, 0) |  |
| `/docs` | 390 | 32, 0, 0, 77, 0 (168, 0, 0, 654, 0) | 424, 0, 0, 77, 0 (588, 58, 0, 654, 0) |  |
| `/docs/terms` | 1440 | 240, 0, 0, 200, 0 (352, 0, 0, 709, 0) | 624, 0, 0, 200, 0 (652, 149, 0, 709, 1) |  |
| `/docs/terms` | 390 | 56, 0, 0, 200, 0 (160, 0, 0, 709, 0) | 496, 0, 0, 200, 0 (820, 172, 0, 709, 1) |  |
| `/docs/privacy` | 1440 | 204, 0, 0, 195, 0 (228, 0, 0, 702, 0) | 452, 0, 0, 195, 0 (560, 55, 0, 702, 0) |  |
| `/docs/privacy` | 390 | 48, 0, 0, 195, 0 (264, 0, 0, 702, 0) | 436, 0, 0, 195, 0 (576, 63, 0, 702, 0) |  |
| `/docs/license` | 1440 | 172, 0, 0, 79, 0 (164, 0, 0, 699, 0) | 432, 0, 0, 79, 0 (620, 68, 0, 699, 0) | cable: fcp 172 vs 164, lcp 172 vs 164 |
| `/docs/license` | 390 | 52, 0, 0, 79, 0 (188, 0, 0, 699, 0) | 440, 0, 0, 79, 0 (588, 64, 0, 699, 0) |  |
| `/this-page-does-not-exist` | 1440 | 176, 0, 0, 408, 0 (156, 0, 0, 654, 0) | 480, 26, 0, 408, 0 (496, 65, 0, 654, 0) | cable: fcp 176 vs 156, lcp 176 vs 156 |
| `/this-page-does-not-exist` | 390 | 56, 0, 0, 408, 0 (160, 0, 0, 654, 0) | 480, 24, 0, 408, 0 (500, 78, 0, 654, 0) |  |
| `/series/animate-with-reanimated` | 1440 | 1176, 0, 0, 595, 0 (1364, 0, 0, 1387, 0) | 728, 0, 0, 595, 0 (2572, 61, 0, 1387, 0) |  |
| `/series/animate-with-reanimated` | 390 | 832, 0, 0, 595, 0 (1028, 0, 0, 1160, 0) | 748, 0, 0, 595, 0 (1472, 65, 0, 1160, 0) |  |
| `/series/exploring-skia` | 1440 | 1176, 0, 0, 255, 0 (1260, 0, 0, 943, 0) | 668, 0, 0, 368, 0 (2268, 68, 0, 943, 0) |  |
| `/series/exploring-skia` | 390 | 872, 0, 0, 255, 0 (1068, 0, 0, 943, 0) | 600, 0, 0, 368, 0 (1444, 71, 0, 943, 0) |  |
| `/series/react-native-toolbelt` | 1440 | 976, 0, 0, 166, 0 (976, 0, 0, 1909, 0) | 640, 0, 0, 279, 0 (1604, 68, 0, 1909, 0) |  |
| `/series/react-native-toolbelt` | 390 | 832, 0, 0, 166, 0 (992, 32, 0, 1909, 0) | 624, 0, 0, 279, 0 (844, 57, 0, 1909, 0) |  |
| `/series/what-about-gestures` | 1440 | 968, 0, 0, 149, 0 (1028, 0, 0, 901, 0) | 644, 0, 0, 262, 0 (808, 60, 0, 900, 0) |  |
| `/series/what-about-gestures` | 390 | 848, 0, 0, 149, 1 (1040, 0, 0, 901, 0) | 612, 0, 0, 262, 0 (828, 66, 0, 901, 0) | cable: janky 1 vs 0 |
| `/articles/introducing-refined` | 1440 | 240, 0 (+0 app), 0, 591, 0 (268, 0, 0.023, 1375, 0) | 600, 0 (+112 app), 0, 591, 0 (604, 104, 0, 1375, 0) |  |
| `/articles/introducing-refined` | 390 | 76, 0 (+0 app), 0, 498, 0 (192, 0, 0, 1282, 0) | 588, 0 (+105 app), 0, 611, 0 (696, 68, 0, 1282, 0) |  |
| `/articles/appjs-2025` | 1440 | 212, 0 (+0 app), 0, 1395, 0 (172, 0, 0, 1950, 0) | 436, 0 (+123 app), 0, 1394, 0 (608, 63, 0.001, 1950, 2) | cable: fcp 212 vs 172, lcp 212 vs 172 |
| `/articles/appjs-2025` | 390 | 56, 0 (+0 app), 0, 1365, 0 (160, 0, 0, 1920, 0) | 452, 0 (+121 app), 0, 1364, 0 (580, 65, 0, 1925, 0) |  |
| `/articles/checkbox-interactions` | 1440 | 236, 0 (+0 app), 0, 1697, 0 (396, 0, 0.056, 2018, 0) | 432, 66 (+136 app), 0.037, 1810, 0 (588, 72, 0.052, 2022, 0) |  |
| `/articles/checkbox-interactions` | 390 | 64, 0 (+0 app), 0, 1683, 0 (220, 0, 0, 2005, 0) | 448, 68 (+134 app), 0, 1799, 0 (628, 75, 0.237, 2005, 0) |  |
| `/articles/bottom-sheet-animation` | 1440 | 208, 0 (+0 app), 0, 1684, 0 (224, 0, 0.011, 1942, 0) | 440, 55 (+129 app), 0, 1684, 0 (668, 62, 0.011, 1938, 0) |  |
| `/articles/bottom-sheet-animation` | 390 | 56, 0 (+0 app), 0, 1673, 0 (204, 0, 0, 1928, 0) | 432, 55 (+132 app), 0, 1673, 0 (588, 64, 0, 1927, 0) |  |
| `/articles/css-animations-react-native` | 1440 | 216, 0, 0, 520, 0 (272, 0, 0.007, 788, 0) | 448, 62, 0, 520, 0 (632, 75, 0.007, 788, 0) |  |
| `/articles/css-animations-react-native` | 390 | 60, 0, 0, 520, 0 (200, 0, 0, 788, 0) | 456, 71, 0, 520, 0 (584, 72, 0, 788, 0) |  |
| `/articles/animated-loader-skia` | 1440 | 216, 0 (+0 app), 0, 1727, 0 (380, 0, 0, 1963, 0) | 428, 57 (+122 app), 0, 1727, 0 (652, 79, 0, 1965, 0) |  |
| `/articles/animated-loader-skia` | 390 | 56, 0 (+0 app), 0, 1717, 0 (212, 0, 0, 2013, 0) | 440, 56 (+137 app), 0, 1717, 0 (596, 72, 0, 1954, 0) |  |
| `/articles/skeleton-loader` | 1440 | 220, 0 (+0 app), 0, 1616, 0 (448, 0, 0.038, 1960, 0) | 444, 59 (+125 app), 0, 1733, 0 (592, 60, 0.038, 1959, 0) |  |
| `/articles/skeleton-loader` | 390 | 52, 0 (+0 app), 0, 1611, 0 (296, 0, 0, 1953, 0) | 452, 57 (+122 app), 0, 1719, 0 (600, 68, 0.063, 1953, 0) |  |
| `/articles/metaball` | 1440 | 248, 0 (+0 app), 0, 1733, 0 (444, 0, 0, 1973, 0) | 444, 85 (+130 app), 0, 1733, 3 (592, 83, 0, 1969, 0) | 4g: tbt 85 vs 83, janky 3 vs 0 |
| `/articles/metaball` | 390 | 64, 0 (+0 app), 0, 1781, 0 (172, 0, 0, 1957, 0) | 440, 75 (+129 app), 0, 1721, 0 (588, 72, 0, 1961, 0) | 4g: tbt 75 vs 72 |
| `/articles/animated-spiral` | 1440 | 224, 0, 0, 583, 0 (384, 0, 0.025, 1283, 0) | 436, 72, 0, 583, 5 (580, 174, 0.025, 1283, 0) | 4g: janky 5 vs 0 |
| `/articles/animated-spiral` | 390 | 64, 0, 0, 583, 0 (168, 0, 0, 1283, 1) | 448, 66, 0, 583, 2 (596, 171, 0.036, 1283, 0) | 4g: janky 2 vs 0 |
| `/articles/introduction-to-reanimated` | 1440 | 244, 0 (+0 app), 0, 1718, 0 (488, 0, 0, 1996, 0) | 444, 110 (+134 app), 0, 1831, 1 (588, 68, 0, 2000, 0) | 4g: tbt 110 vs 68, janky 1 vs 0 |
| `/articles/introduction-to-reanimated` | 390 | 60, 0 (+0 app), 0, 1693, 0 (220, 0, 0, 1972, 0) | 452, 107 (+136 app), 0, 1805, 1 (656, 74, 0, 1967, 0) | 4g: tbt 107 vs 74, janky 1 vs 0 |
| `/articles/animated-gradient` | 1440 | 216, 0 (+0 app), 0, 1738, 0 (412, 0, 0, 1975, 0) | 440, 56 (+127 app), 0, 1738, 0 (584, 81, 0, 1974, 0) |  |
| `/articles/animated-gradient` | 390 | 60, 0 (+0 app), 0, 1724, 0 (208, 0, 0, 1960, 0) | 440, 52 (+127 app), 0, 1724, 0 (628, 74, 0, 1960, 0) |  |
| `/articles/the-hidden-gems-of-react-native` | 1440 | 220, 0, 0, 1026, 0 (228, 0, 0, 1743, 0) | 452, 0, 0.004, 1026, 0 (680, 71, 0.004, 1743, 0) |  |
| `/articles/the-hidden-gems-of-react-native` | 390 | 60, 0, 0, 1026, 0 (276, 0, 0, 1743, 0) | 444, 0, 0, 1026, 0 (616, 73, 0.001, 1743, 0) |  |
| `/articles/animated-flat-list` | 1440 | 212, 0 (+0 app), 0, 1291, 1 (316, 0, 0.028, 1962, 0) | 428, 0 (+129 app), 0, 1399, 0 (588, 72, 0.031, 1962, 0) | cable: janky 1 vs 0 |
| `/articles/animated-flat-list` | 390 | 40, 0 (+0 app), 0, 1276, 0 (232, 0, 0, 1950, 0) | 448, 0 (+193 app), 0, 1388, 1 (584, 84, 0.011, 1951, 0) | 4g: janky 1 vs 0 |
| `/articles/introduction-to-gestures` | 1440 | 244, 0 (+0 app), 0, 1693, 0 (408, 0, 0, 1973, 0) | 440, 70 (+123 app), 0, 1806, 0 (580, 75, 0, 2028, 0) |  |
| `/articles/introduction-to-gestures` | 390 | 48, 0 (+0 app), 0, 1678, 0 (192, 0, 0, 1958, 0) | 460, 63 (+126 app), 0, 1795, 0 (656, 76, 0, 1958, 0) |  |
| `/articles/setup-reanimated-gestures` | 1440 | 196, 0, 0, 116, 0 (160, 0, 0, 744, 0) | 424, 0, 0, 116, 0 (636, 63, 0, 744, 0) | cable: fcp 196 vs 160, lcp 196 vs 160 |
| `/articles/setup-reanimated-gestures` | 390 | 36, 0, 0, 116, 0 (336, 0, 0, 744, 0) | 448, 0, 0, 116, 0 (572, 68, 0, 744, 0) |  |
| `/articles/smooth-dropdown` | 1440 | 280, 0 (+0 app), 0, 1294, 0 (388, 0, 0, 1974, 0) | 452, 0 (+123 app), 0, 1408, 0 (648, 73, 0, 1978, 0) |  |
| `/articles/smooth-dropdown` | 390 | 56, 0 (+0 app), 0, 1283, 0 (188, 0, 0, 1963, 0) | 456, 0 (+136 app), 0, 1396, 0 (592, 81, 0, 1959, 0) |  |
| `/articles/circular-progress-bar` | 1440 | 216, 0 (+0 app), 0, 1317, 0 (372, 0, 0.01, 1995, 0) | 444, 0 (+124 app), 0, 1430, 0 (592, 72, 0.01, 1991, 0) |  |
| `/articles/circular-progress-bar` | 390 | 56, 0 (+0 app), 0, 1289, 0 (196, 0, 0, 1963, 0) | 444, 0 (+139 app), 0, 1402, 0 (668, 67, 0, 1963, 0) |  |
| `/articles/the-power-of-lottie` | 1440 | 200, 0 (+0 app), 0, 1316, 0 (316, 0, 0.008, 1991, 1) | 440, 0 (+140 app), 0, 1320, 0 (580, 80, 0.008, 1991, 0) |  |
| `/articles/the-power-of-lottie` | 390 | 68, 0 (+0 app), 0, 1357, 0 (176, 0, 0, 1973, 0) | 448, 0 (+140 app), 0, 1470, 0 (584, 72, 0, 1977, 0) |  |
| `/articles/pinch-gesture-handler` | 1440 | 228, 0 (+0 app), 0, 1322, 0 (256, 0, 0, 1997, 0) | 452, 0 (+127 app), 0, 1435, 0 (608, 62, 0.001, 1997, 0) |  |
| `/articles/pinch-gesture-handler` | 390 | 68, 0 (+0 app), 0, 1292, 0 (304, 0, 0, 1969, 0) | 456, 0 (+119 app), 0, 1406, 0 (592, 68, 0, 1968, 0) |  |
| `/articles/interpolate-with-scrollview` | 1440 | 248, 0 (+0 app), 0, 1330, 0 (460, 0, 0, 2004, 0) | 460, 0 (+176 app), 0, 1439, 2 (584, 81, 0, 2004, 0) | 4g: janky 2 vs 0, longTasks 1 vs 0 |
| `/articles/interpolate-with-scrollview` | 390 | 56, 0 (+0 app), 0, 1295, 0 (264, 0, 0, 1972, 0) | 460, 0 (+168 app), 0, 1408, 0 (680, 100, 0, 1972, 0) |  |
| `/articles/pan-gesture-handler` | 1440 | 244, 0 (+0 app), 0, 1727, 0 (336, 0, 0.03, 2001, 0) | 448, 100 (+178 app), 0, 1836, 0 (632, 88, 0.03, 1998, 0) | 4g: tbt 100 vs 88 |
| `/articles/pan-gesture-handler` | 390 | 60, 0 (+0 app), 0, 1694, 1 (168, 0, 0, 1969, 0) | 864, 312 (+399 app), 0, 1807, 3 (744, 131, 0.019, 1969, 0) | cable: janky 1 vs 0; 4g: fcp 864 vs 744, lcp 864 vs 744, tbt 312 vs 131, janky 3 vs 0, longTasks 1 vs 0 |
| `/articles/haptic-feedback` | 1440 | 172, 0 (+0 app), 0, 1279, 0 (288, 0, 0.029, 1934, 0) | 440, 0 (+123 app), 0, 1282, 0 (648, 70, 0.029, 1931, 0) |  |
| `/articles/haptic-feedback` | 390 | 48, 0 (+0 app), 0, 1268, 0 (176, 0, 0, 1921, 0) | 452, 0 (+129 app), 0, 1269, 0 (576, 66, 0.067, 1921, 0) |  |

Misses after the re-runs:

| route | width | profile | miss (local vs live) | runs |
|---|---|---|---|---|
| `/articles` | 1440 | cable | fcp 196 vs 172 | 1 |
| `/demos-app` | 1440 | cable | fcp 248 vs 204, lcp 248 vs 204 | 1 |
| `/docs/license` | 1440 | cable | fcp 172 vs 164, lcp 172 vs 164 | 1 |
| `/this-page-does-not-exist` | 1440 | cable | fcp 176 vs 156, lcp 176 vs 156 | 1 |
| `/series/what-about-gestures` | 390 | cable | janky 1 vs 0 | 1 |
| `/articles/appjs-2025` | 1440 | cable | fcp 212 vs 172, lcp 212 vs 172 | 1 |
| `/articles/metaball` | 1440 | 4g | tbt 85 vs 83, janky 3 vs 0 | 3 |
| `/articles/metaball` | 390 | 4g | tbt 75 vs 72 | 3 |
| `/articles/animated-spiral` | 1440 | 4g | janky 5 vs 0 | 3 |
| `/articles/animated-spiral` | 390 | 4g | janky 2 vs 0 | 3 |
| `/articles/introduction-to-reanimated` | 1440 | 4g | tbt 110 vs 68, janky 1 vs 0 | 3 |
| `/articles/introduction-to-reanimated` | 390 | 4g | tbt 107 vs 74, janky 1 vs 0 | 3 |
| `/articles/animated-flat-list` | 1440 | cable | janky 1 vs 0 | 1 |
| `/articles/animated-flat-list` | 390 | 4g | janky 1 vs 0 | 3 |
| `/articles/setup-reanimated-gestures` | 1440 | cable | fcp 196 vs 160, lcp 196 vs 160 | 1 |
| `/articles/interpolate-with-scrollview` | 1440 | 4g | janky 2 vs 0, longTasks 1 vs 0 | 3 |
| `/articles/pan-gesture-handler` | 1440 | 4g | tbt 100 vs 88 | 3 |
| `/articles/pan-gesture-handler` | 390 | cable | janky 1 vs 0 | 1 |
| `/articles/pan-gesture-handler` | 390 | 4g | fcp 864 vs 744, lcp 864 vs 744, tbt 312 vs 131, janky 3 vs 0, longTasks 1 vs 0 | 3 |

`/demos`: bytes are the Demos app (exempt since D10, perf.md); its page TBT and LCP are under live's at 4g.
Scroll smoothness on the three long articles (`the-hidden-gems-of-react-native`, `smooth-dropdown`, `metaball`):
at cable 0 frames over 20 ms at both widths on all three (the longest frame 17 ms, one vsync); at 4g 0 on
`the-hidden-gems-of-react-native` and `smooth-dropdown`, `metaball` 1 frame of 33 ms at 1440 in pass 1 and 3 in the
re-run (live 0): see the misses.

## 6. Links

`/tmp`-only crawler over `.vercel/output/static` (every `href`, `src`, `srcset`, `data-entry`, URL-valued `content`,
CSS `url()`, sitemap/RSS `<loc>`/`<link>`, manifest icons; `<base href>` honoured; reactiive.io URLs mapped to the local
origin): 156 unique URLs, 156 answered 200 (redirects followed), 0 broken. Redirects: 126 `/demos/<slug>` → 308 (109 to
`/demos/app/demo/<slug>`, whose slug `compose.ts` checks against `demos.contract`, 17 to `/demos`), all landing 200;
`/articles/{building-demos,open-sourcing-demos}` → `/demos`, `/articles/{leaving-patreon,patreon-migration}` and
`/series/{thoughts,engineering}` → `/articles` (308, with or without a trailing slash); `/profile`, `/manage-subscription`
→ 307 `/demos` signed out.

## 7. Isolation

| proof | result |
|---|---|
| Demos capture (`tools/isolation/capture.ts --list`) | `git archive origin/main` (`a00ed9ca`) and `git archive HEAD`: 481 files, 21,465,912 bytes each, lists byte-identical. The worktree itself lists 482: `packages/gpu-images/exact.json`, a gitignored file the Demos app's own build generates (not the site's) |
| `/demos/` artifact key | `d2f01f0a…` at `origin/main` and at HEAD |
| installs | root `bun.lock` md5 `ffc3b799…` before and after `.site`'s `bun install --frozen-lockfile` (no changes) |
| outside `.site/` | `git diff --name-only origin/main...HEAD`: `.github/workflows/{exact-lint,site-demos-web,site-deploy,site}.yml` only |
| CI triggers (`ci-paths.ts`) | site-only → site.yml; demos-only → exact-lint.yml; legacy-only → lint.yml; disjoint (the tool failed on the invalid site.yml until fix 3) |

## 8. Secrets

`bun tools/check-secrets.ts --tracked`: 513 files (env-file values included), 0 findings. `--dir dist .vercel/output`:
0 findings. Nothing printed.

## Follow-up (2026-11-24): the demo articles and the mobile menu

- The canvas-demo articles at 4g are now ≤ live in TBT and scroll (5 interleaved runs each; docs/perf.md, last section):
  pan-gesture-handler TBT 74 / 69 vs live 84 / 81, introduction-to-reanimated, metaball, interpolate-with-scrollview,
  smooth-dropdown and the-hidden-gems 0 vs 76-82, animated-spiral 118 / 110 vs 190 / 188; 0 frames over 20 ms in
  every scroll. The open item on them below is closed.
- The mobile menu opens at the first tap before the runtime starts (`tools/parity/menu-time.ts`, 4x CPU, 2 x 5
  interleaved: live 63 / 63 ms, local 64 / 63 ms to the first visible frame; was 300+ ms).

## Open issues (bigger than this sweep)

- **Perf misses on the canvas-demo articles at 4g** (`introduction-to-reanimated` TBT +35-42 ms, `metaball` +2-3 ms,
  `pan-gesture-handler` +12 ms at 1440 and +181 ms / LCP +120 ms at 390; 1-5 frames of 33-50 ms during the scroll on `animated-spiral`, `metaball`,
  `interpolate-with-scrollview`): the runtime's start on idle (D16) and the demos' first frames. To re-measure on an idle
  machine (AC power, no other builds) and on the Vercel preview before deciding; the static and content pages pass.
- **Cable FCP/LCP within 20-44 ms of live** on a few static pages in single runs (`/demos-app`, `/articles/appjs-2025`,
  `/articles/setup-reanimated-gestures`, `/docs/license`, the 404): localhost HTTP/1.1 vs Vercel's edge; to re-check on
  the preview.
- **The 404 loads the whole runtime** (eager start: 408 KB / 49 requests at cable; 192 KB / 12 before the accounts
  merge). Still under live's 654 KB; `activate=interaction` for it would bring it back (its menu and Sign In work
  before the runtime now).
- **`/course` testimonial cards**: the rim is a CSS approximation of live's figma-squircle (pixels within 0.04 %, the
  hover look differs in `box-shadow`).
- **The mobile menu opens when the runtime has started** on a page not yet awake (its first tap starts it: 0.3-1.2 s on
  this machine at cable, more at 4x CPU); Sign In opens at once (head script). A pre-runtime open of the menu would need
  the same treatment.
- **Exact**: a press in the first ~20 ms of a runtime's start can be dropped (covered by the navigation safety net for
  links); the 404's fresh render of a document made for `/404.html` (worked around by moving its checkpoint). Worth
  reporting upstream.


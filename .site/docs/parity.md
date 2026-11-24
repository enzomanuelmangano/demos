# Parity with the live reactiive.io

Method (architecture.md §12): `tools/parity/shoot.ts` captures a page the live sweep's way (1440x900 desktop,
390x844 touch, 3.5 s settle, one scroll-through, full page JPEG q70) plus every visible box with its text, glyph
rect and computed styles; `tools/parity/compare.ts` diffs a local capture against the live one: head fields, element
counts, headings, page height (±1 %), each live text found at the same place (±2 px) with the same size and weight,
and the share of differing pixels (threshold 32/255). Bar: ≤ 0.5 % differing pixels, every text placed.

```sh
bun tools/parity/shoot.ts https://reactiive.io /tmp/live / /inspirations        # the reference
bun exact.mjs web-build --out dist && bun tools/compose.ts && bun tools/serve.ts --port 4310 &
bun tools/parity/shoot.ts http://127.0.0.1:4310 /tmp/local / /inspirations
bun tools/parity/compare.ts /tmp/live /tmp/local
```

## Status

Motion (`tools/parity/motion.ts`): every entrance's keyframes, duration, delay, iterations and five sampled frames,
and every link's and button's cursor, transition and hover look, live against local. Header stillness across in-app
navigations (`tools/parity/nav.ts`, screencast). Interaction states (`tools/parity/states.ts`: the mobile menu,
the scrolled bar, /demos's frame). Performance: `tools/parity/perf.ts`, docs/perf.md.

| page | 1440 px | 390 px | texts placed | motion (1440 / 390) | open |
|---|---|---|---|---|---|
| `/` | 0.05 % | 0.29 % | 22/23, 20/23 | 0 / 0 differences; project-row hover 0 px against live; header still across `/` ↔ `/demos` (0 px, both widths) | JSON-LD (phase 6); 3 wrapped paragraphs' glyph boxes 4 px narrower (same lines, same wraps) |
| 404 | 0.05 % | 0.28 % | 12/12 | shell as `/` | `twitter:card` is `summary_large_image` (the reference's 404 says `summary`): postbuild, phase 6 |
| `/demos` | hero: every text box at the live place to 0.1 px (title, subtitle, pill); the spiral is random per visit, as live | same | 4/4, 4/4 | hero entrances as live (title-in, blur-in 450/550 ms); the grid's card-ins are gone with the grid (D10) | the app below is `/demos/app/` in a frame (D10) |
| `/demos` from 1024 px | **deliberate difference** (owner, D12 revised, redesigned in D17: a 960 px row, the live pill, a spotlit device, the title drawn on): Apple-style copy left / device right, device masked to its silhouette, one viewport | | 4/4 | entrances and hovers as live (pill `transition-colors` 200 ms fixed); title 72-96 px / 600, subtitle 22 px secondary by the owner's request | the app sandboxed (own process), a still until it loads |
| `/demos/app/` | the Demos app: 0 px against its own build (decisions.md D3) | 0 px | | |
| all other pages | not built yet | | | |

Card cascade (`tools/parity/reveal.ts <live> <local> <route>…`): every card of /articles and /series/* sampled per
frame from navigation start and through a steady 1200 px/s scroll (start, end, scroll offset, delay, paused, flash,
restart). The reveal is `web/reveal.js`, a head script (the reference's RevealOnScroll: rootMargin -40 px, 60 ms
stagger in DOM order, first batch from 280 ms), not Exact's `intersect`, which only answered after the app booted
(the first screen's second row started ~1.2 s late). 2026-11-23: every series page equal to live in delays, pause,
batches and easing, no flash or restart; /articles differs only where D13's skipped cards shift the order. Live's
first batch starts ~40 ms later than local's (its hydration).

Navigation correctness (`tools/parity/nav-correct.ts <origin> [--rounds n] [--port p]`): every header / menu link from
8 page kinds, pressed cold (at parse), warm, after a hover (prerender), mid-scroll and by keyboard, at 1440 and 390;
the URL and the drawn page must agree within 6 s, Back and Forward too, and Back must stay back. Sign In
(`tools/parity/sign-in.ts`): the dialog opens on 5 pages cold / warm / in-app at both widths, and a provider the API
cannot answer shows the error toast. Final sweep: docs/final-sweep.md.

Hover audit: `tools/parity/hover.ts <live> <local> <route>… [--widths 1440,700]` (700 also opens the menu).
2026-11-23 (leftovers): `/articles/smooth-dropdown` 0 differences (35 elements, Sign In and Subscribe pressed with CSS
`:active`, also measured before the runtime starts: `rgb(255 255 255/.14)` / `#3c49b0` at scale 0.97, as live); the
demo buttons' 0.95 is a `transform` as live's inline style (pan-gesture-handler 3 differences to 1, animated-gradient
the same): the one left is a button focused after a hover, where live keeps `scale(1)` inline (matrix(1) vs none, same
pixels).

## Responsive (`tools/parity/responsive.ts`)

Every width and height, and a window resized live, not only 1440 and 390:

```sh
bun tools/parity/responsive.ts https://reactiive.io http://127.0.0.1:4310            # the default routes, the whole matrix
bun tools/parity/responsive.ts https://reactiive.io http://127.0.0.1:4310 /docs/terms --widths 320,390 --no-resize
bun tools/parity/responsive.ts https://reactiive.io http://127.0.0.1:4310 / --no-matrix --window   # + a real headed window
```

- **Matrix**: 27 widths (320 … 1920, both sides of every Tailwind breakpoint: 639/640, 767/768, 1023/1024, 1279/1280,
  1536) at 844 (under 800 px, touch) or 900 px tall, plus 600 and 700 px tall at 390, 768, 1024 and 1440. Per cell, live
  then local (one at a time, each settled and scrolled through, `--scroll 400,100`): the local page must not scroll
  sideways (`scrollWidth > clientWidth`, whatever live does), and its full page (capped at 6000 px) must differ from
  live's by at most the route's pixel budget (0.5 %, or the recorded deliberate difference in `budget()`: /articles
  D13, /demos D10/D12/D17/D20, signed-out /profile and /manage-subscription, the home page under 360 px where live cuts
  its own Subscribe button). A cell over budget is shot once more before it fails (live's YouTube player is made by
  its API script, sometimes after the settle). Texts placed are reported as compare.ts does.
- **Live resize**: one desktop page (no touch) loaded at 1440 x 900, resized by `Emulation.setDeviceMetricsOverride`
  1440 → 390 → 1440 through every breakpoint, then to 1440 x 700, 1440 x 600, 1024 x 600, 768 x 700, 390 x 600, in two
  phases: the static HTML (the runtime held off: `exact.ready` set to a promise that never settles before the capture
  script runs) and the started runtime (its entry imported). After each step every box (tag, rect, font size) must
  equal a fresh load at that size in the same phase to 1 px, with no sideways overflow. `--window` repeats it through a
  real headed window (`Browser.setWindowBounds`, 1440 → 500 → 1440; macOS keeps a window ≥ ~500 px wide).
- `--scrollbars` runs with classic scrollbars (a desktop with a mouse: the layout is 15 px narrower than the window, and
  a `100vw` box is 15 px wider than the page).
- Exits 1 on an overflow, a cell over budget or a resize that differs; `<out>/responsive.json` has every row, and a
  diff PNG is written for each cell over budget.

2026-11-24 (owner: "il sito non è responsive per niente"): the layout was already fluid: every breakpoint is CSS
(`components/responsive.contract`'s clamp() against 100vw, web/head.css media queries), so the static HTML is right at
any width before the runtime, and a resize equals a fresh load in both phases on every route (emulated and real
window). What was wrong, all fixed in shared CSS (b903ede8): the body lacked the reference's `overflow-x: hidden`, so
anything past the window's side made a phone's page pan sideways (/docs/terms at 320 px by 18 px: a long URL; /demos
from 1024 px by 24 px: the device's spotlight), now `overflow-x: clip` (a hidden body is a scroll container and would
hold the sticky header); the two header bars were only 0 px tall on the other side of 768 px, their links still in the
tab order and the accessibility tree (now `display: none`, as live's `hidden md:block` / `md:hidden`); the menu's
Sign In row ran 32 px past the window (width 100 % plus padding, now border-box).

Result on the fixed build (2026-11-24, 15 routes x 35 sizes, `--jobs 3`, ~70 min): no overflow anywhere (before: /docs/terms
at 320, /demos, /profile and /manage-subscription at 1024-1440); every judged cell within 0.5 % (max: /docs 0.31 %,
the 404 0.39 %, /series/what-about-gestures 0.32 % at 320; /course, /inspirations, articles ≤ 0.16 %); the home page
1.2 % at 320 only (live's cut Subscribe); every resize, static and started, equal to a fresh load (and the real window
on /, an article, /docs/terms). Classic scrollbars (`--scrollbars`): no overflow on any of the 38 pages.

## Open differences (the owner's bar is identity in pixels and in motion: each is to be fixed, none is accepted)

- **Icons are images.** The logo and the menu icon are `<img>` of SVG files (the reference inlines `<svg>`), so the
  image count differs (3 vs 0) and their edges antialias slightly differently.
- Fixed since (D11, `web/head.css`): the entrance blur, the footer links' underline offset, the nav underline's
  hover growth, the button and link transitions, focus rings, Exact's default link wash/dim/press fade (the reference
  has none), the project rows' hover colour.
- The project rows' tag: the reference's class says `font-mono`, but its `Text` component's font wins: live computes
  Inter (`inter, "inter Fallback", …`), so the rebuild draws Inter too.

# Progress

Branch `site` (worktree `thank-you-site`), draft PR #115 into `main`. Update this file at every stop.

## Done

- **Phase 0** (complete): `.site/` app (Exact `2180d806`); `/demos/` mount proven end to end, 0 differing pixels
  against the app's own build (decisions.md D3); five isolation proofs and the GitHub-runner build of `/demos/`
  (isolation.md); review amendments applied (architecture.md, top).
- **Phase 1** (in progress): tokens (`tokens.css` → `app.forma`), fonts (D7), `SiteHeader` (desktop bar, mobile bar,
  menu overlay, scrolled look D8), `SiteFooter` (both variants), `Container`, responsive helpers (D9), the 404.
  Reference assets imported (`tools/import-reference.ts`: `.content/`, `assets/`, `public/`).
- **Phase 2** (started): `/` at parity (0.05 % / 0.29 % px), newsletter wired to the public endpoint.
- Parity tooling: `tools/parity/{shoot,compare,diff,cdp}.ts` (docs/parity.md), p- **2026-11-23, block 2**: the site on Exact **98ed61fb** (seed in `exact.mjs`; `/`, 404 pixel parity 0.04 / 0.28 % and
  0.03 / 0.28 %, motion 0 differences, header still across `/` ↔ `/demos` 0 px, isolation lists identical, 481 files).
  `/demos` from 1024 px: Apple-style copy left / device right (owner, D12 + revision), the app **sandboxed in its own
  renderer process** (page TBT 4g 7-85 ms vs live 66-142, the app's ~500 ms in its OOPIF), a launcher still until the
  frame has drawn, the frame loading at 1.6 s when near the viewport. `perf.ts`: OOPIFs attached and throttled,
  `--block`, `--local-only`. Inter's ASCII inlined (41 KB data: URL): 404 @1440 4g LCP 276 (live 528), every page 213 KB.
  Touch (390 touch emulation, CDP touch into the sandboxed frame): Chessboard opens by tap; a swipe down from its
  top zone closes it, with the page at scrollY 254 and with the frame half scrolled in (scrollY 100); the page
  never scrolls. A drag that starts on the board plays the board, as in the standalone app (closeZone).

- **2026-11-23, block 3** (build-first): hover audit tool `tools/parity/hover.ts` (every :hover/:active/:focus target
  from the page's own stylesheets plus every control, hovered, pressed, focused, box screenshots diffed, a narrow
  desktop window with the menu open): `/`, 404, `/inspirations` 0 differences at 1440 and 700 (menu). Fixed: menu
  entries' hover (white on white/5) and transition, the nav underline scaling on x only, the global `:focus-visible`
  outline (footer and nav links had a ring), Exact's 0.65 press dim on buttons, Exact's hover/focus underline on menu
  links, the logo link's colour, the newsletter field's hover/focus, the /demos title's ease-out. Pages:
  `/inspirations` (0.01 / 0.14 % px), `/demos-app` (0.02 / 0.18 %, QR at build: `tools/qr.ts`), `/course`
  (0.04 / 0.01 %, 89/89 texts), `/docs` (the content agent's route; 0.02 / 0.22 %). Inter's ASCII is a preloaded,
  hash-versioned, immutable file with `tnum` and `font-display: block` (perf.md: 404 4g LCP 484 / 472 vs live 532 / 568,
  -20 KB per page, every / and 404 cell passes). Owner bugs: scrollbar track always on (`html{overflow-y:scroll}`,
  width 1425 and logo x 352.5 on every page and across in-app navigations); /demos ≥ 768 px: the frame clipped to the
  app's display so only the screen takes the wheel (CDP wheel 1 px in / out of each edge, corners, bezel, margins at
  1440x900 and 1920x1080), the still draws the bezel under it. head.css colours are literals: the theme is not CSS
  variables at run time (the /demos subtitle colour was silently dropped before).

- **2026-11-23, block 4** (perf): content and static pages `activate=interaction` (D16): no runtime until a press, a
  field or a demo / embed in view; the header's scrolled look in CSS; code blocks a text per run coloured by CSS
  highlights (pan-gesture-handler 2,763 nodes to 543). TBT at 4g ≤ live on `/`, `/articles`, three articles, a doc,
  `/course` (pan 72 vs 84, others 0 vs 63-85; perf.md). Display maths as live's MathJax (animated-spiral boxes at
  live's place to 0.08 px, page height equal). Link and GitHub card hovers 0 differences (hover.ts, 4 articles);
  italics slanted as live (Exact's root `font-synthesis: none`). Owner bug fixed: an article opened in-app kept
  /articles' scroll and its content popped in under the footer (CLS 0.13 -> 0, starts at the top).

## Next, in order

0. Scroll jank on pages that wake while scrolled (perf.md, D16): embeds as native lazy frames; demo buttons'
   press look before the runtime (hover.ts: transform vs scale, Sign In / Subscribe :active on a page not yet awake).
1. The one automated sweep over every page (pixel, motion, hover.ts, nav, perf), per the lead's plan.
2. Open: `/demos` @390 cable LCP ~1.6 s (live ~1.5 s): the pill's blur-in end; the testimonial cards' squircle
   (live: figma-squircle 18 / 0.6 clip and gradient rim; here border-radius 18 + hairline, pixels within 0.04 %); the
   menu's Sign In row is 32 px wider than live's at 700 px (pixels equal); `/demos` 390 touch: the app owns its
   full-width box (D10, unchanged).
3. 5 interactive components (content agent's articles), 6 SEO checks per page (head-diff), 7 deploy (prepared).

## Local setup notes

- Site: `cd .site && bun install && bun exact.mjs web-build --out dist && bun tools/compose.ts && bun tools/serve.ts --port 4310`.
- Demos artifact (compose needs it): `CARGO_HOME=/tmp/site-cargo-home` whose `bin/wasm-bindgen` links
  `~/.exact/bindgen-0.2.130/bin/wasm-bindgen` and whose `registry`, `git` and other `bin/*` link `~/.cargo`'s
  (decisions.md D6); `CARGO_TARGET_DIR=/tmp/site-target DEMOS_WEB_SCRATCH=/tmp/demos-web-src bun tools/demos-web/build.ts`
  (about 1.5 min warm, cached in `.out/demos-web/<key>/`). `/tmp/site-target` was deleted to keep disk ≥ 12 GB.
- Disk: keep ≥ 12 GB free; delete `/tmp/site-target`, `/tmp/demos-web-src` and `/tmp/site-cargo-home` at the very end.

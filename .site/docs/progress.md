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

## Next, in order

1. Open: 404 @390 4g LCP 768 vs live 568 (a second candidate of the same paragraph at ~770 ms when the runtime's
   stylesheet arrives; box and style unchanged: find what repaints it); `/demos` @390 cable LCP ~1.6 s (the pill's
   blur-in end; live's is a thumbnail at ~1.5 s). The motion.ts matcher keys the pill differently (labels differ,
   parameters equal).
2. Audit every hover/group-hover in reactiive.io/src against ours (grep `hover:` / `group-hover:`), then phase 2:
   `/inspirations`, `/demos-app` (QR at build), `/course`, `/docs`; each through shoot/compare, motion, nav, perf.
3. Phase 3 content pipeline (`tools/gen-content.ts`, Markdown + CodeBlock, `/docs/{terms,privacy,license}`); 4
   articles; 5 interactive components; 6 SEO/feeds; 7 deploy workflow (prepared only; production needs
   `Access-Control-Allow-Origin: *` under `/demos/app/`, compose writes it).
4. Measure perf on AC power with a quiet machine (load was 25-30 during this block; battery caps headless Chrome at 30 fps).

## Local setup notes

- Site: `cd .site && bun install && bun exact.mjs web-build --out dist && bun tools/compose.ts && bun tools/serve.ts --port 4310`.
- Demos artifact (compose needs it): `CARGO_HOME=/tmp/site-cargo-home` whose `bin/wasm-bindgen` links
  `~/.exact/bindgen-0.2.130/bin/wasm-bindgen` and whose `registry`, `git` and other `bin/*` link `~/.cargo`'s
  (decisions.md D6); `CARGO_TARGET_DIR=/tmp/site-target DEMOS_WEB_SCRATCH=/tmp/demos-web-src bun tools/demos-web/build.ts`
  (about 1.5 min warm, cached in `.out/demos-web/<key>/`). `/tmp/site-target` was deleted to keep disk ≥ 12 GB.
- Disk: keep ≥ 12 GB free; delete `/tmp/site-target`, `/tmp/demos-web-src` and `/tmp/site-cargo-home` at the very end.

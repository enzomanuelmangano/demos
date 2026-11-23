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
- Parity tooling: `tools/parity/{shoot,compare,diff,cdp}.ts` (docs/parity.md), p## Next, in order

1. `docs/perf.md` gate: keep every route ≤ live (the /demos exemptions are the app itself, D10); re-run
   `perf.ts` after each block. The site's own Exact pin is still 2180d806: move it to 98ed61fb (`bun exact.mjs
   update` with the new seed) and re-verify `/`, `/demos`, 404.
2. Remaining motion items: hero pill's entrance key in motion.ts (labels differ, parameters equal), the mobile menu's
   open/close timing check in motion.ts, the spiral's tap easter egg toast (sonner) on the 7th tap.
3. Phase 2: `/inspirations`, `/demos-app` (QR at build), `/course`, `/docs` (header + footer only). Live captures with
   `shoot.ts` + `states.ts` + `motion.ts`; for each: compare, motion, perf.
4. Phase 3: `tools/gen-content.ts`, `Markdown` + `CodeBlock`, `/docs/{terms,privacy,license}`.
5. Phase 4 articles and series (26), 5 interactive components (37), 6 SEO/feeds, 7 deploy workflow (prepared only).

verlay and scrolled state against the live site (scripted: open the
   menu at 390, scroll 30 px at 1440, screenshot both sides); `/docs` (header + footer only).
2. Phase 2: `/inspirations`, `/demos-app` (QR at build: `qrcode-generator` in a tool → SVG rects), `/course`
   (testimonials, avatars in `assets/images/avatars`). Live captures: `bun tools/parity/shoot.ts https://reactiive.io
   /tmp/site-live-dom /inspirations /demos-app /course /docs` (the old `/tmp/reactiive-live/` JPEGs are the sweep's;
   shoot.ts also writes the `.dom.json` structure compare.ts needs).
3. Phase 3: `tools/gen-content.ts` (MDX in `.content/` → typed block modules in `content-gen/`, gitignored;
   images to `assets/content/`, gitignored), `Markdown` + `CodeBlock` (palenight), `/docs/{terms,privacy,license}`.
4. Phase 4 articles and series; 5 interactive components; 6 SEO/feeds (postbuild: JSON-LD, twitter:card on the
   404, sitemap/robots/rss/manifest); 7 the deploy workflow (prebuilt output; never run from an agent).

## Local setup notes

- Site: `cd .site && bun install && bun exact.mjs web-build --out dist && bun tools/compose.ts && bun tools/serve.ts --port 4310`.
- Demos artifact (compose needs it): `CARGO_HOME=/tmp/site-cargo-home` whose `bin/wasm-bindgen` links
  `~/.exact/bindgen-0.2.130/bin/wasm-bindgen` and whose `registry`, `git` and other `bin/*` link `~/.cargo`'s
  (decisions.md D6); `CARGO_TARGET_DIR=/tmp/site-target DEMOS_WEB_SCRATCH=/tmp/demos-web-src bun tools/demos-web/build.ts`
  (about 1.5 min warm, cached in `.out/demos-web/<key>/`). `/tmp/site-target` was deleted to keep disk ≥ 12 GB.
- Disk: keep ≥ 12 GB free; delete `/tmp/site-target`, `/tmp/demos-web-src` and `/tmp/site-cargo-home` at the very end.

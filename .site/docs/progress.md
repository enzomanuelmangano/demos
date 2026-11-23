# Progress

Branch `site` (worktree `thank-you-site`), draft PR into `main`. Update this file at every stop.

## Done

- Phase 0: `.site/` app scaffolded (Exact `2180d806`); `/demos/` mount proven end to end (docs/decisions.md D3);
  the five isolation proofs and the runner build (docs/isolation.md); review amendments applied (architecture.md).
- Design tokens imported (`tokens.css` → `app.forma`).

## Next

1. Phase 1 shell: fonts (Inter variable, Source Code Pro), `SiteHeader`, `SiteFooter`, `Container`, 404; parity
   tools `tools/parity/shoot.ts` + `compare.ts` against `/tmp/reactiive-live/` (re-shoot with the live sweep's
   settings if missing: 1440x900 and 390x844 touch, 3.5 s settle, one scroll-through, JPEG q70).
2. Phase 2 static pages, phase 3 content pipeline (`.content/`), phase 4 articles, phase 5 interactive components,
   phase 6 SEO/feeds, phase 7 deploy workflow (no deploy from agents).

## Local setup notes

- Demos web build: `CARGO_HOME=/tmp/site-cargo-home` with `bin/wasm-bindgen` → 0.2.130 (docs/decisions.md D6),
  `CARGO_TARGET_DIR=/tmp/site-target`, `DEMOS_WEB_SCRATCH=/tmp/demos-web-src`.
- Composed output: `bun tools/compose.ts && bun tools/serve.ts --port 4310`.

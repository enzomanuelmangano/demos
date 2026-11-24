# Progress: SEO, feeds, deploy (branch `site-seo`)

Done: `tools/seo/` (site.ts, metadata.ts, jsonld.ts, feeds.ts, postbuild.ts), `tools/parity/head-diff.ts` (all 35 pages
match live with `--generated`; built routes `/`, `/demos`, 404 match live; sitemap, robots, rss, manifest match, minus the
four not-ported articles), `public/pfp.png`, `/content-assets/*` rewrite in compose, `site-deploy.yml` (manual only),
`docs/deploy.md`.

To do after `site` / `site-content` merge: rebase; run `bun run build && bun tools/parity/head-diff.ts --strict` so
articles, series, course and docs pages are checked on built HTML too.

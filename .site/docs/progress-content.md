# Content pipeline: progress (branch `site-content`)

Scope: the build-time MDX → Contract converter, the article, series and docs pages, and the interactive article
components. The other agent (branch `site`) owns the shell, static pages and shared tokens.

## Scope cut (owner, 2026-11-23): content tied to Demos is not ported

"All the content and articles tied to demos are no longer needed now." Classification, for the owner to verify:

### Skipped (demo-related)

| item | reason |
|---|---|
| `/demos/<slug>` posts (126, `.content/demos/`) | demo presentations; already 308s into the Demos app (decisions.md D5/D10) |
| Demo-post MDX components: `Demo` (phone-frame video), `SendFeedback`, `GitHubRepoButtons`, demo og images, demo media (R2 videos/thumbnails) | used only by the demo posts |
| `/articles/building-demos` (series engineering) | an overview of how the Demos product was built: presents Demos |
| `/articles/leaving-patreon` (series thoughts) | announces the move of the demos from Patreon to Demos |
| `/articles/patreon-migration` (series thoughts) | how Patreon supporters migrate to the Demos platform |
| `/articles/open-sourcing-demos` (series thoughts) | announces Demos going open source and refunds |
| `/series/engineering` | its only article is `building-demos` |
| `/series/thoughts` | its three articles are the three above |

Consequence: `/articles` lists 22 cards instead of live's 26 (the grid's height and the cards' places after the
first skipped one differ from live by design).

### Ported (real articles, series, docs)

| item | reason |
|---|---|
| 22 articles: animated-flat-list, animated-gradient, animated-loader-skia, animated-spiral, appjs-2025, bottom-sheet-animation, checkbox-interactions, circular-progress-bar, css-animations-react-native, haptic-feedback, interpolate-with-scrollview, introducing-refined, introduction-to-gestures, introduction-to-reanimated, metaball, pan-gesture-handler, pinch-gesture-handler, setup-reanimated-gestures, skeleton-loader, smooth-dropdown, the-hidden-gems-of-react-native, the-power-of-lottie | tutorials and essays on React Native animation, gestures, Skia, tooling and the App.js talk; a passing mention or link to Demos does not make an article a demo presentation (`checkbox-interactions`' `<Demo />` is its own interactive checkbox, not a demo video) |
| `/series/animate-with-reanimated`, `/exploring-skia`, `/react-native-toolbelt`, `/what-about-gestures` | lists of ported articles |
| `/articles` | the index of the ported articles |
| `/docs`, `/docs/terms`, `/docs/privacy`, `/docs/license` | legal pages, not demo content |
| interactive components of the 11 articles that have them (37 exports) | all 11 articles are ported |

## Status (2026-11-23)

The converter works end to end (`tools/gen-content.ts`, authoring guide `docs/content.md`): MDX stays the source
(`.content/`), output generated and gitignored; strict (unknown tag, expression, raw HTML, `index.json` field: build
error with file and line); `--watch` for authoring; head, JSON-LD, RSS and sitemap come from the same `index.json` files
(`tools/seo/postbuild.ts`, branch `site`; one not-ported list in `tools/seo/site.ts`); share images at their live
URLs through compose's `/content-assets/` rewrite. `bun run build` = convert, build, SEO postbuild. All ported pages build: 22 articles, 4 series,
`/articles`, `/docs` + 3 docs. Preview: `bun tools/serve.ts --port 4311` on the composed output.

Parity, full page, share of differing pixels (`compare.ts`, live shot into `/tmp/content-live`, `CDP_PORT_OFFSET=100`):

| page | 1440 | 390 | note |
|---|---|---|---|
| docs terms / privacy / license | 0.06 / 0.10 / 0.01 % | 0.08 / 0.14 / 0.02 % | |
| `/docs` | 0.02 % | 0.22 % | |
| series exploring-skia / toolbelt / gestures | 0.07 / 0.06 / 0.05 % | 0.26 / 0.28 / 0.34 % | dates: Inter ASCII subset lacks `tnum` (see open) |
| series animate-with-reanimated | 7.2 % | 37 % | tall page: live's reveal-on-scroll timing in the capture; to check |
| `/articles` | 40 % | 45 % | by design: 22 cards, not 26 (scope cut) |
| 11 articles without interactive components | 0.02-0.33 % | 0.05-0.89 % | animated-flat-list, appjs-2025, circular-progress-bar, haptic-feedback, interpolate-with-scrollview, pinch-gesture-handler, setup-reanimated-gestures, smooth-dropdown, the-hidden-gems, the-power-of-lottie; introducing-refined 4.4 / 8.9 % (to check) |
| 11 articles with interactive components | 0.2-9.8 % | 0.9-12.5 % | the components are empty 16:9 frames (live's size, so the rest is in place) |

## Open, in order

1. Interactive components (37 exports, 11 articles): placeholders now; port in batches (`interactive/<slug>/`).
   Known special sizes: checkbox-interactions `Demo`/`StaticDemo` (not 16:9), metaball `CanvasKitJsAlert` (drawn
   as nothing now), animated-loader-skia `WithProgressLoaderWithSkia` at 390.
2. Inline maths (animated-spiral): SVG sizes and baseline against live's MathJax.
3. The Inter ASCII subset (`assets/fonts/InterAscii.woff2`, branch `site`) has no `tnum`: tabular dates are 5 px
   narrower than live. Rebuild it with `--layout-features='*'`.
4. Perf: an article's HTML is ~2.5x live's document (smooth-dropdown 80 KB vs 32 KB brotli): every code token is a
   styled element. Merge equal-style tokens, class the colours, then the perf gate.
5. GitHub card: live clips a squircle (figma-squircle 0.6) with a gradient rim; here a 14 px radius and the
   `--shadow-surface` fallback the reference uses before measuring.
6. The motion, nav and perf sweep at the end (og:type, JSON-LD: done by the SEO postbuild).

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
| series exploring-skia / toolbelt / gestures | 0.02 / 0.06 / 0.05 % | 0.14 / 0.28 / 0.34 % | dates at live's width since `site`'s subset keeps `tnum` (c4bdbb89) |
| series animate-with-reanimated | 0.18 % | 0.25 % | shot with `--scroll 300,150`: live's RevealOnScroll misses cards passed at the default 600 px / 60 ms (they stay paused in live's shot); a reader's scroll reveals them on both |
| `/articles` | 40 % | 45 % | by design: 22 cards, not 26 (D13); every card's cover, title, description and date at live's offsets, grid and gaps equal |
| 11 articles without interactive components | 0-0.33 % | 0.03-0.89 % | introducing-refined 0.00 / 0.03 % (the X post's frame has live's measured height) |
| 11 articles with interactive components | 0.2-9.8 % | 0.9-12.5 % | the components are empty 16:9 frames (live's size, so the rest is in place) |

Review fixes (2026-11-23, PR #117): a failed conversion keeps the previous pages (temp dir + rename); compact code lines
in the checkpoint; og:image keeps the original of a featured WebP wider than 1440 px; the 4 skipped articles and 2
series 308 (D13). Article weight, smooth-dropdown, gzip: 105.7 KB -> 40.5 KB (font now external on `site`); checkpoint
26.8 -> 8.9 KB, body 24.8 -> 19.2 KB; live 38 KB. The rest is the head: Exact's page style 6.7 KB and runtime boot
3.9 KB, the content CSS (squircle masks 0.6 KB).

## Open, in order

1. Interactive components (37 exports, 11 articles): ported on `site-comp-canvas` and `site-comp-gesture` under
   `components/interactive/<article>/`; not in `site` yet. When merged: map the MDX tags to them in the converter
   (`interactive` blocks, `INTERACTIVE_ARTICLES`) instead of the empty frames. Known special sizes: checkbox-interactions
   `Demo`/`StaticDemo` (not 16:9), metaball `CanvasKitJsAlert` (drawn as nothing now), animated-loader-skia
   `WithProgressLoaderWithSkia` at 390.
2. Article weight 40.5 vs live 38 KB gzip (smooth-dropdown): the squircle CSS could be one sprite (0.4 KB); the rest
   is Exact's head (page style, boot script).
3. Inline maths (animated-spiral): SVG sizes and baseline against live's MathJax.
4. smooth-dropdown at 390: 0.88 % (paragraph wraps: the texts list two paragraphs as missing at 390 and 1440).
5. The motion, nav and perf sweep at the end.

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

## Status

- Live reference shot with `tools/parity/shoot.ts` into `/tmp/content-live` (`CDP_PORT_OFFSET=100`).

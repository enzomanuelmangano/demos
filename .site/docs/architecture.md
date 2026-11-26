# reactiive.io on Exact: architecture (phase 1 design)

Status: being built on branch `site` (see `progress.md`). Written 2026-11-23 against Exact `2180d806c4d7a3668c6423ea34cda497be26ad4d`
(`~/.exact/exact2/2180d806…`, public repo `expo/exact`) and the demos repo restructure on branch `repo-switch`
(worktree `thank-you-switch`, head `c28f3b6a`: Exact demos app at the root, RN app in `.legacy/`, tooling in `.parity/`).
Companion: [inventory.md](inventory.md) (what the site is today, route by route).

The reference site is `enzomanuelmangano/reactiive.io` (Next.js 16). **It is read-only**: it is not moved, branched or
edited. The new site is a second Exact app inside the **demos repo** (`enzomanuelmangano/demos`).


## Amendments after the independent review (2026-11-23): these supersede the sections below

1. **(Superseded by decisions.md D25: every `/demos/<slug>` is a page again.)** **`/demos/<slug>` is not rebuilt.** The 126 demo posts become 308s into the Demos app: `/demos/<slug>` →
   `/demos/demo/<slug>` for the 108 slugs the app has, `3d-scroll-transition` → `/demos/demo/scroll-transition-3d`
   (explicit alias), the other 17 (demos the Exact port does not have) → `/demos/`. List and aliases:
   `tools/demos-web/legacy-posts.ts`; written as edge routes by `tools/compose.ts`, which fails if an alias names a
   slug missing from `demos.contract`. §5.4's demo-post pages, §9's `demoPost` route and Spike S3 are dropped.
2. **The demos artifact publishes no audio and no atlas.** `/assets/audio/` (the copyrighted track) and
   `/assets/atlas/` (native macOS desk-mode tiles) are gitignored; the build runs on a `git archive` of the inputs, so
   neither can reach it (`tools/demos-web/build.ts` also fails if either is ever committed). The audio player plays
   its silent nominal 3:00 (`demos/audio-player/audio-player.contract`).
3. **Cache key / deploy filter** = every tracked path but the deny-list `.site .legacy .parity .github **/*.md` (so
   `app.forma` and `.cargo/` are inputs), plus the demos' Exact seed and the overlay version. The scratch tree is
   archived with the same pathspec, so the build cannot read a denied path.
4. **Base path.** Exact refuses a non-root base for the wasm target, games, bake-only builds, the Rust renderer,
   `--plan` and auth: the `/demos/` build pins `--render js` and never passes `--wasm`/`--plan`. The head fetch
   override finds `/demos/gpu_bg.wasm` beside `/demos/assets/demos-gpu-images/…` (Spike S1). The demos `robots.txt`
   is dropped (the origin's is the site's); it has no `.well-known/`. `/demos/` gets today's title, description and
   share card (`/og/demos.png`) by a compose-time overlay of the built HTML (`tools/demos-web/head.ts`).
5. **No hard-coded `https://reactiive.io/demos` links**: the site links `/demos/` relatively (an undeclared
   same-origin path is the browser's, so it leaves the site's runtime); canonical/og URLs use `SITE_ORIGIN`.
6. **Content sources live under a dot directory** (`.site/.content/`): Exact captures `.json/.js/.mjs` anywhere.
7. **CI build of the demos web is proven in phase 0** (`.github/workflows/site-demos-web.yml`); see
   `docs/decisions.md`.
8. **Routes carry `activate=idle`** like Exact's docs site; `/profile` and `/manage-subscription` are edge 307s to
   `/demos/` (no client stub).
9. **Capture re-measured** at `240aa4cf`: 481 files / 21,466,992 bytes (20.47 MiB), see `docs/isolation.md`.
10. **Output trees stay out of the capture:** `.out/` (artifact cache) and `.vercel/` (composed output) are dot dirs.

## 0. Decisions at a glance

| Question | Decision |
|---|---|
| Where the site lives | `.site/` at the demos repo root: its own Exact app (own `app.json`, `exact.mjs`, `package.json`, `bun.lock`, `tsconfig.json`), next to the demos app (root), `.legacy/` and `.parity/`. |
| Why a dot-folder | Exact's source capture (`js/bake/src/lib.rs` `sources()`) skips dot directories at any depth; every other placement either leaks the site into the demos build or moves the demos app off the root (section 1). |
| `/demos` | The demos app's own `web-build`, built from the **same commit** with a CI-only manifest overlay `host.web.base = "/demos/"`, copied under `/demos/` of the deployed output. No site code reaches it, no demos code reaches the site; the two `dist/` trees are only placed side by side by a composer script (section 6). |
| Versioning of `/demos` | Content-addressed: the demos artifact is keyed by the git tree hash of the demos app's inputs; a site-only change reuses the cached artifact, a demos change rebuilds it. Optional freeze file `.site/demos-web.pin`. |
| Content | The MDX of the reference repo is imported once into `.site/content/` (then owned here). `tools/gen-content.ts` turns it into typed block modules at build (the Exact docs site's own pattern, `docs/site/tools/gen.ts`). |
| Rendering | Every public page `render=build` (parameterised routes with `pages=`), 404 `render=build`. Signed-in pages `render=client` and stubbed. |
| Env-dependent features | Not handled: stubbed with the same pixels where visible (sign-in, payments, feedback, analytics, Sentry, DB). `/api/*` keeps being served by the old Next deployment through an edge rewrite until it is ported (section 9). |
| Hosting | Vercel, a new project from the demos repo, **prebuilt** deploys (Build Output API v3) made by GitHub Actions; the domain moves at cutover; the old Next project stays as rollback and as the `/api/*` backend. |

## 1. Where the site lives (options evaluated)

The constraint: Exact's bake captures every file under an app root with extension
`ts js mjs cjs json contract ttf otf`, plus everything under `assets/`, `deck/`, `gpu/shaders/`, skipping only
`.git`, `node_modules`, `target`, `dist`, dot directories (any depth), `*.test.contract`, `.exact-js-bake-*`, and a
**64 MiB total / 16 MiB per file** cap (`js/bake/src/lib.rs` lines 790-915). There is no exclude list in `app.json`
(the only other key read there is `typescript.sources`, which *adds* mounts).

Measured today (demos root at `c28f3b6a`, same rules re-implemented in Python): **480 files, 21,036,142 bytes
(20.06 MiB) captured**: `assets` 17.3 MiB, `gpu` 1.56, `demos` 0.46, `packages` 0.28, `tools` 0.21, `modules` 0.13,
`home` 0.06.

| Option | Cost to the demos app | Cost to the site | Verdict |
|---|---|---|---|
| **A. `.site/` (dot-folder Exact app)** | 0 bytes added to the capture (dot dirs skipped); demos tooling already skips dot dirs (`tools/contract-lint/cli.ts` walk, `tsconfig.json` includes only `tools/**`, `.easignore` uploads only `.legacy/`); one CI line: `'!.site/**'` in `exact-lint.yml`'s path filter. | Hidden folder in Finder/some editors (same as `.legacy/`, `.parity/`, which the owner already uses). | **Chosen.** |
| B. Visible `site/` | Captured: site `.contract/.ts/.json` + generated content modules (estimate 3-6 MiB: 155 pages of typed blocks) + any `.ttf`. Every site edit makes the demos bake stale (dev loop and web/iOS builds rebuild); the demos capture climbs toward the 64 MiB cap; two `app.contract`/`app.ts`/`app.json` inside one capture. | none | Rejected: the demos app would pay for site code on every build. |
| C. `apps/demos` + `apps/site`, root = workspace shell | Moves the demos app off the root one commit after the owner put it there (`a373893e`): `exact.mjs` seed paths, `.exact/checkout`, the Cargo workspace (`Cargo.toml`, `gpu/`, `packages/*` crates, `rust-toolchain.toml`, `.cargo/`), `.easignore`, both workflows, README/LINT/UPGRADE docs, `.parity/` scripts that address root paths. | Visible folder. | Rejected: the owner asked for the demos app at the root, and the churn buys only visibility. Revisit only if A ever fails. |
| D. Site as a route group inside the demos app | The site's components compile into the same plan: every demos visitor downloads them (the demos web start already has a 971-977 ms first-run long task at 4x CPU, `tools/web-perf.md`), and the iOS/macOS binaries ship them. Exact splits *data* per route (the docs site imports one content module per route from `app.ts`), not the compiled view plan. | Shares the demos head scripts (`overscroll-behavior:none`, `body{overflow:hidden}`, fetch override) that would break a scrolling site. | Rejected outright. |
| E. Upstream exclude (`sources.exclude` / `.exactignore`) | Would let the site be a visible `site/`. Not available at `2180d806`. | none | File as Exact feedback (`bun exact.mjs feedback note`); if it lands, `git mv .site site` + one `app.json` key is the whole migration. |

What A must still prove (phase 0, numbers recorded in `.site/docs/isolation.md`):

1. Demos capture identical before/after adding `.site/`: 480 files / 21,036,142 bytes (re-run the counter, plus
   `bun exact.mjs web-build --json` artifact hash on the demos root, before vs after).
2. Root `bun install` does not touch `.site/` (root `package.json` workspaces are `packages/*` only; `.site` has
   its own `bun.lock` and `node_modules`), and `.site` install never reads the root's: `bun install` in `.site`
   with the root `node_modules` deleted must succeed. Root `bun.lock` byte-identical.
3. No watcher crosses: `bun exact.mjs web` at the root, touch a `.site/*.contract`: zero rebuilds (log line count);
   and the reverse from `.site`.
4. CI: a PR touching only `.site/**` triggers no demos/legacy workflow; a PR touching only demos paths triggers
   no site *check* workflow (the site *deploy* does run, by design, because `/demos` embeds the demos build).
5. `.legacy/`: no file read by either build (`fs_usage`/`strace`-free proof: both captures enumerate no
   `.legacy` path; `tsconfig` of `.site` has `"include": ["tools/**/*.ts", "app.ts", "content-gen/**/*.ts"]`).

## 2. Repo tree (demos repo, after the site lands)

```text
/                          the Demos Exact app (unchanged)
├─ app.json app.contract app.ts demos/ home/ gpu/ modules/ packages/ assets/ tools/ …
├─ .legacy/                the React Native app (unchanged)
├─ .parity/                demos parity tooling (unchanged)
├─ .github/workflows/
│  ├─ exact-lint.yml       + '!.site/**' in paths
│  ├─ lint.yml             (.legacy, unchanged)
│  ├─ site.yml             NEW: site checks, paths: .site/** + itself
│  └─ site-deploy.yml      NEW: build + compose + deploy (section 10)
└─ .site/                  the website (Exact app, root of its own capture)
   ├─ AGENTS.md README.md  (exact block + site rules: parity, isolation, content)
   ├─ app.json             name "Reactiive", app.id io.reactiive.site, app.origin https://reactiive.io,
   │                       web manifest fields = today's manifest.json, host.web.head (section 7)
   ├─ app.contract         root: fonts, routes, App (header/main/footer), route switch
   ├─ app.ts               data module: page sources (dynamic import per slug), pages= lists, stubs
   ├─ app.forma            design tokens (from tokens.css, section 4)
   ├─ tokens.css           tokens extracted from the reference globals.css @theme (input to forma import)
   ├─ app.test.contract    route/head/responsive tests
   ├─ exact.mjs            Exact wrapper (seed → ~/.exact/exact2/<pinned>)
   ├─ package.json bun.lock tsconfig.json .gitignore
   ├─ components/          shared library (section 3)
   ├─ pages/               one .contract per page kind
   ├─ interactive/         article demos, one folder per article (section 5.4)
   ├─ content/             SOURCE content, not captured (mdx/md/images): articles/<slug>/{index.mdx,index.json,images/},
   │                       demos/<slug>/{index.mdx,meta.json}, docs/{terms,privacy,license}.mdx, github-repos.json
   ├─ content-gen/         GENERATED typed block modules, captured, gitignored (one .ts per page + index.ts)
   ├─ assets/              fonts/, og/, pwa/, logos/, images/avatars/, favicon, content/<slug>/* (copied by gen)
   ├─ tools/
   │  ├─ gen-content.ts    MDX → content-gen/*.ts + assets/content + rss/sitemap data (section 5)
   │  ├─ import-reference.ts  one-off: copies content/public from the reference checkout (read-only) at a pinned sha
   │  ├─ postbuild.ts      head extras, JSON-LD, rss.xml, sitemap.xml, robots.txt (section 7)
   │  ├─ compose.ts        site dist + demos dist → .vercel/output (section 6, 10)
   │  ├─ demos-web.ts      builds or fetches the demos artifact (overlay base, cache by tree hash)
   │  ├─ seo-check.ts      every page: title/description/canonical/og/twitter equal to baseline
   │  ├─ budgets.ts        section 11
   │  └─ parity/           shoot.ts (CDP screenshots + metrics), compare.ts, baseline/metrics.json
   ├─ tests/               browser tests (bun test + Chrome), compose/vercel-output tests
   └─ docs/                isolation.md (numbers), parity.md (per page status), decisions.md
```

`.site/.gitignore`: `/content-gen/ /dist/ /dist.* /target/ /node_modules/ /.exact/ /.vercel/ /app.contract.d.ts /.env*`.

## 3. Shared component library (`.site/components/*.contract`)

One component per reference component that renders something; names keep the reference names so a reviewer can
diff them side by side.

| Component | Replaces (reference) | Notes |
|---|---|---|
| `SiteHeader(current)` | `components/header` | fixed bar, transparent → `background` + `border-b white/5` after 10 px scroll (`scroll` event on the document scroller → `state scrolled`); desktop nav with the 1.5 px underline (`scale` transition, `--ease-snappy`); mobile hamburger + overlay menu (`inert` when closed). Logo SVG as `svg` paths (`logo-home`). Sign In slot: stub (section 8). |
| `SiteFooter(variant)` | `Footer.tsx` | two variants: default (Twitter / Inspirations) and legal (Terms / Privacy) chosen by route, same rule as `isDemos`. |
| `Container(size, padding)` | `container`, `ui/box` | max-width table `xs 448 … 2xl 1280`, `px-6` default; flex column like RNW. |
| `Text(variant)` | `ui/text`, `rn-text.ts` | variants h1-h6/body/caption with the RN `line-height: normal` and `white-space: pre-wrap` traps preserved. |
| `ProjectItem`, `WavingHand`, `Newsletter` | same | Newsletter posts to `subs.reactiive.io` (public, no env): keep, as a `mutation`/`send` with grant `net.fetch https://subs.reactiive.io`. |
| `ArticleList`, `PostTitle` | same | |
| `Markdown(blocks)` + `blocks/*` | `components/mdx`, `mdx.css` | renders the block kinds of section 5.2: p, h1-h4 (anchors), lists (bullet as `::before` → `text "•"`), code (pre-tokenised), blockquote, table, image, hr, kbd, inline runs. |
| `CodeBlock(lines, lang, terminal)` | `mdx/code-highlight.tsx` | palenight colours baked at build; copy button = `copyText` host command; diff lines. |
| `GithubCard(repo)` | `embeds/GithubCard.tsx` | data from `content/github-repos.json` snapshot at build (reference fetched live with `GITHUB_OAUTH_TOKEN`, ISR 1 h: env-dependent → snapshot; a scheduled workflow may refresh the JSON). |
| `YouTubeEmbed`, `Embed`, `XEmbed` | `embeds/*` | `iframe` tag (Exact WebView on web). X embed loads `platform.twitter.com/widgets.js` today: an `iframe` of `platform.twitter.com/embed/Tweet.html?id=` instead (no script). |
| `ReanimatePromo`, `GitHubRepoButtons` | same | static. |
| `DemoVideo(slug)` | `demos/demo-video` | `video` autoplay muted loop playsinline from the media CDN (`MEDIA_CDN_URL`, public). |
| `SendFeedback` | `send-feedback` | rendered identically; press opens a stub dialog (section 8). |
| `StyledQRCode` | `styled-qrcode` (qrcode-generator) | QR matrix computed at build in `tools/` (pure JS), drawn as `svg rect`s. |
| `Toast` | `sonner` | only the /demos easter egg used it, and that page is replaced: dropped. |
| `CourseLearn`, `Testimonials` | `landing/tabs/learn`, `testimonials` | framer-motion stagger → `keyframes` + per-item `animation-delay`. |
| `NotFound` | `components/404` | |
| `Squircle` | `figma-squircle` | precomputed path (as the demos app does for the iPhone outline). |

## 4. Design tokens, fonts, breakpoints, motion

- **Tokens.** `tools/tokens-from-reference.ts` reads the reference `src/app/globals.css` `@theme` block once and writes
  `.site/tokens.css` (colours in their OKLCH/hex as written, radii, shadows, eases); `bun exact.mjs forma import css
  tokens.css` writes `app.forma`. Rows name tokens as `var(--color-text-secondary)`. The page colour is the root's
  `background-color: var(--color-surface-primary)` (oklch 15.5% 0.0041 286). Dark only (the reference has no light theme;
  `theme-color` #0c0c0e in both schemes).
- **Fonts.** `font "Inter"` from the same subset `InterVariable.woff2` (115 KB; web host accepts woff2,
  `host/web-js/src/faces.rs`), `font "Source Code Pro"` from `SourceCodePro_400Regular.woff2`. Spike S4: a variable face
  with a 100-900 weight range and `font-optical-sizing: auto`; fallback: static 400/500/600/700 instances cut by
  `pyftsubset` with the same glyph set (keeps the weights real, not synthesised: reference trap 4).
- **Breakpoints.** Tailwind v4 defaults `sm 640 / md 768 / lg 1024 / xl 1280` become `exactViewport()` comparisons
  (`viewport.width >= 768` is `@media (width >= 768px)`; rendered pages carry it as a media query). Helper fns in
  `components/responsive.contract`: `fn md(v: Viewport): bool = v.width >= 768` etc. Grids use fluid
  `repeat(auto-fill, minmax(…))` where the reference did.
- **Motion.** The reference's CSS keyframes map 1:1 to Contract `keyframes`: `motion-blur-in` (opacity, blur 12 px,
  translateY), `motion-title-in`, `motion-card-in`, `motion-pop-in`, `motion-qr-in`, `fadeIn`, `wave` (the 👋),
  `kennyburns`, `skeleton-shimmer`; eases `--ease-motion cubic-bezier(.22,1,.36,1)`, `--ease-snappy`, `--ease-out-expo`.
  `prefersReducedMotion` from `exactViewport()` turns them off, as the reference's media query does.
  `RevealOnScroll` (react-intersection-observer + `.motion-wait`) → `intersect=` handler flipping `state seen`.
  framer-motion (course/testimonials, demo video chips) and `@number-flow/react` (GitHub stars pill on the retired
  /demos hero only) need no port beyond keyframes.

## 5. Content pipeline

### 5.1 Import (once)

`bun .site/tools/import-reference.ts <reference-checkout> <sha>` copies, read-only, from the reference repo at a
pinned commit (today `ef912464`): `content/**` (MDX + index.js/json + images + article component sources for
reference), `src/data/github-repos.json`, `public/{og,pwa,logos,images,fonts,LICENSE,apple-touch-icon.png}`,
`src/app/favicon.ico`, the two woff2 fonts. `content/demos/<slug>/index.js` (`module.exports = {…}`) is converted
to `meta.json`. It records the source sha in `.site/content/SOURCE`. After import the site owns its content.
Demo videos/thumbnails (78 MB in the reference `public/demos`) are **not** imported: they are served from the
R2 bucket already (`https://pub-4f02f6295cfb4d38ad95eef187b3610d.r2.dev/demos/videos/<slug>.mp4`) and would
exceed the 16 MiB-per-file/64 MiB capture caps anyway.

### 5.2 Build (every build)

`bun tools/gen-content.ts` (dependencies only in `.site/package.json`: `@mdx-js/mdx` or `remark-parse` +
`remark-mdx` + `remark-gfm`, `shiki`, `mathjax-full`, `qrcode-generator`):

1. Parse each `index.mdx` to mdast (MDX JSX nodes kept, never executed).
2. Map nodes to a closed set of typed blocks, the same idea as Exact's docs site (`Block { kind, runs, lines, … }`):
   `heading paragraph list code quote table image hr kbd` plus component blocks
   `title githubCard youtube embed tweet reanimatePromo demoVideo sendFeedback repoButtons math interactive`.
   An unknown JSX tag **fails the build**, naming file and line (no silent drop).
3. Code: tokenised at build with the palenight palette the reference uses (prism-react-renderer `themes.palenight`
   + its overrides in `code-highlight.tsx`), diff marks, terminal variant for `bash/sh`.
4. Math: `<InlineMath>`/`<BlockMath>` (5 + 5 uses, MathJax 3 `tex-svg` from jsDelivr today) rendered at build to SVG
   files in `assets/content/<slug>/math-<n>.svg`, shown with `image`: no third-party script at runtime.
5. Images: copied to `assets/content/<slug>/`, sizes read (PNG/WebP/GIF/JPEG headers) so `image` gets width/height
   (no layout shift).
6. Output: `content-gen/<kind>/<slug>.ts` (`export default {...}`), `content-gen/index.ts` with per-slug dynamic
   imports, `content-gen/lists.ts` (article list items, series, demo slugs with the publish-date rule), and the
   data for `rss.xml`/`sitemap.xml`.
7. Publish rule: the reference hides demos dated in the future (`isPublished`, 10:00 UTC on the day). A static
   build freezes it at build time → `site-deploy.yml` also runs on a daily schedule (10:05 UTC).

### 5.3 Routes

`app.ts` exports `articleSlugs()`, `demoSlugs()`, `docSlugs()`, `seriesSlugs()` for `pages=`, and
`loadArticle(slug)`, `loadDemoPost(slug)`, `loadDoc(slug)` that `import()` one generated module (a reader downloads
only that page's data; the docs-site pattern).

### 5.4 Interactive article components (37 exports in 11 articles)

Ported one by one to Contract in `interactive/<article>/`. The reference already rewrote them from
Reanimated/Skia to Canvas 2D / CSS / pointer events (`src/lib/animation`): springs → Contract springs/`keyframes`,
`usePanGesture` → `pan` handlers, Canvas 2D → `canvas`/`svg` (or a `gpu` surface only if a demo truly needs per-pixel
work: the metaball's blur + colour-matrix goo). Each gets a parity test (a frame at t=0 and after an interaction,
pixel-compared to the reference running locally with `bun dev` in a scratch copy: never in the read-only checkout).
List in inventory.md §4.

## 6. `/demos`: the Demos web app inside the site

Requirement: `https://reactiive.io/demos` is the demos app exactly as built (iPhone Air frame centred on desktop,
full screen on a phone: `home/web-phone.contract`), with no site code in it.

**Chosen: same-origin mount of the demos app's own build at `/demos/`.**

1. `tools/demos-web.ts` computes `key = sha256(git rev-parse HEAD:<p> for p in DEMOS_INPUTS)` where `DEMOS_INPUTS` =
   every root path except `.site .legacy .parity .github` and docs (`app.json app.contract app.ts demos.contract
   demos home gpu modules packages assets strings web apple Cargo.toml Cargo.lock rust-toolchain.toml package.json
   bun.lock exact.mjs tools/gpu-images-web.mjs`), plus the demos' Exact seed sha.
2. Cache hit (Actions cache / release asset `demos-web-<key>.tar.zst` on the demos repo): download, verify sha256.
3. Miss: in a **disposable copy** (CI checkout, or `git worktree add $TMP/demos-web HEAD` locally), apply the
   manifest overlay `host.web.base = "/demos/"` to `app.json` (jq; the tracked file is never committed changed),
   `bun install --frozen-lockfile && bun exact.mjs web-build --out dist`, tar `dist`. The demos dev loop and its own
   builds keep base `/` (Exact: "the web/native dev loop require `/`").
4. `tools/compose.ts` copies it to `.vercel/output/static/demos/` and turns its `routes.json` (home `/`,
   `/demo/:slug`, `/open`, `/atlas`, `/snap/:slug`) into Vercel routes that fall back to `/demos/shell.html`.
5. Optional freeze: `.site/demos-web.pin` holding a key makes deploys use that artifact regardless of HEAD (to ship a
   site fix while a demos change is not ready).

Why not the alternatives:

| Option | Problem |
|---|---|
| iframe of a separately hosted build (`demos.reactiive.io`) | two documents and two runtimes; the URL bar never shows `/demos/demo/<slug>` (no deep links, Back history inside the frame); iOS Safari iframe scroll/viewport-height and pull gestures differ from a top-level page; `clipboard-write`/`web-share` need `allow=`; WebGPU in a cross-origin frame. Kept as the **fallback** if spike S1 fails. |
| Import the demos app as an Exact package into the site | the site would compile demos sources (and their Rust/wasm gpu module) and own their head scripts: the opposite of isolation. |
| Rebuilding demos inside every site deploy | a Rust/wasm build (~minutes, multi-GB `target/`) on site-only edits: avoided by the tree-hash cache. |

Coexistence with the site's own `/demos/<slug>` pages (126 static article pages that stay identical): demos-app
paths are `/demos/`, `/demos/demo/*`, `/demos/open`, `/demos/atlas`, `/demos/snap/*` and its files
(`/demos/app.js`, `/demos/assets/*`, `/demos/.exact/*`, `shell.html`, `routes.json`, manifest). No demo slug is
`demo|open|atlas|snap|assets|app|shell|routes` (checked against the 126 slugs); `compose.ts` fails the build if one
ever is. `/demos` → `/demos/` is a 308 (Exact's own server does the same for a base).

Links from the site to `/demos` must leave the site's runtime (a same-origin path the site's router does not know would
otherwise become its `notfound`): `link href="https://reactiive.io/demos/"` (Exact: an https URL leaves the app) or an
`openURL` action; spike S2 confirms which keeps same-tab navigation.

**Spike S1 (first task of phase 0):** build the demos app with the overlay, serve `dist/` under `/demos/` with
`bun exact.mjs serve` and with the composed Vercel output (`vercel dev --prebuilt` or `tools/compose.ts` + a static
server), and check: launcher draws, a GPU demo opens (`gpu_bg.wasm` + the `shaders.wgsl` bundle via the head
fetch override, which resolves `new URL('assets/…', base)` relatively), fonts, `modules/web/index.js` views, deep link
`/demos/demo/chessboard` reload, Back, desktop frame at 1440×900 and full screen at 390×844, the cold-load numbers of
`tools/web-perf.md` (5.77 MB / FCP 2.77 s at 4G+4x) unchanged ±5%.

## 7. SEO and metadata

| Item | Reference | Exact |
|---|---|---|
| title / description / canonical / og:image / robots | `pageMetadata()` per page, title template `%s \| Reactiive` (home title "Home") | route `head title=… description=… image=… canonical=… robots=…`; Exact writes og/twitter from them, absolute against `app.origin` `https://reactiive.io`. Template applied in Contract (`fn pageTitle(t)`). |
| og:type article, article:published_time, article:author, article:tag, og:image width/height/alt/secure_url, og:site_name, og:locale, twitter:creator, twitter:card summary_large_image, keywords, RSS `alternate` link, `author`, `creator`, `publisher`, `msapplication-TileColor`, `apple-mobile-web-app-capable`, `X-UA-Compatible` | emitted by Next | site-wide ones in `app.json` `host.web.head`; per-page ones injected by `tools/postbuild.ts` into each built HTML from the generated content index (the docs site does postbuild the same way). `seo-check.ts` diffs every page's head against the baseline captured from the live site. |
| JSON-LD | WebSite+Person graph on `/`, NewsArticle on articles and demo posts | `host.web.head` goes on every page, and the reference has JSON-LD only on `/`, articles and demo posts, so all JSON-LD is injected per page by `postbuild.ts`. |
| sitemap.xml | 29 URLs (home, /demos, /articles, 26 articles; priorities/changefreq) | Exact would generate one of every build page; `postbuild.ts` overwrites `dist/sitemap.xml` with the reference's exact list. |
| robots.txt | `Allow: /`, Host, Sitemap | written by `postbuild.ts` byte-identical. |
| rss.xml | route, 26 items | written by `postbuild.ts` (same template, CDATA, RFC 822 dates). |
| manifest | `public/manifest.json` (name, description, icons 144/192/512, theme/background #000, standalone, portrait) | `app.json` web-manifest fields + `icons`; compare served JSON. |
| OG images | static `/og/{main,demos,articles}.png`, article `featuredImage`; demo posts point to `/demos/og-image/<slug>` which **404s on the live site** | same files; the demo-post og:image bug is kept for strict parity unless the owner approves pointing it at the thumbnail (decision D1 in inventory.md). |
| favicon / apple-touch-icon | `favicon.ico` 48×48, `/pwa/apple-touch-icon/apple-touch-icon-180.png` | `app.json` `icons` + head link. |

## 8. Env-dependent features (not handled: stubbed)

| Feature | Reference dependency | Stub in the Exact site |
|---|---|---|
| Sign in (Google, GitHub, Apple, Patreon OAuth), session JWT | `/api/auth/*`, `/api/callback/*`, `AUTH_JWT_SECRET`, `*_CLIENT_ID/SECRET`, `APPLE_*`, `EXPO_PUBLIC_ACCESS_KEY` | Header slot renders "Sign In" exactly; press opens the same modal shell with providers disabled and a "coming soon" line hidden behind a build flag `SITE_AUTH=off`. |
| `/profile`, `/manage-subscription` | auth + Supabase/Drizzle + LemonSqueezy | `render=client`, `robots="noindex, nofollow"` as today, reproduce the signed-out behaviour: the reference's `withRoleHandler` sends a signed-out visitor to `/demos`
(seen in the live sweep), so the stub redirects to `/demos/` (the Demos app). |
| Payments (support/purchase/upgrade/downgrade/cancel/resume/refund modals) | `/api/purchase/*`, `/api/refund/request`, `/api/webhook/subscription`, `LEMON_SQUEEZY_*`, `DATABASE_URL` | not rendered entry points stay hidden as they are for signed-out visitors. |
| Feedback / demo request | `/api/feedback/*` (auth + Telegram `TELEGRAM_*`) | `SendFeedback` card identical; its button opens the sign-in stub, as a signed-out press does today. |
| GitHub stars / repo cards live data | `GITHUB_OAUTH_TOKEN`, `/api/github/stars` | build-time snapshot `content/github-repos.json`. |
| Analytics | Amplitude `EXPO_PUBLIC_AMPLITUDE_API_KEY` | none (would be a `host.web.head` script + CSP later). |
| Errors | Sentry `EXPO_PUBLIC_SENTRY_DSN` (`instrumentation*.ts`) | none (Exact `report-errors` recipe later). |
| Newsletter count/Beehiiv | form posts to `https://subs.reactiive.io/api/subscribe` (public); `BEEHIIV_*` only server-side | **kept working** (public endpoint, no secret). |
| Media CDN | `EXPO_PUBLIC_MEDIA_CDN_URL` | public setting `MEDIA_CDN_URL` in `app.json` `env` with the public R2 origin as default (not a secret). |
| DB / scripts | Drizzle + Postgres, `scripts/*` (refunds, orders, Apple secret) | not ported. |
| `/api/*` at cutover | 22 routes live (webhooks and OAuth callbacks are called by third parties) | Vercel rewrite `/api/:path*` → the old Next project's production URL, so payments and sign-in callbacks keep working untouched. |

## 9. Route map (reference → Exact)

All in `.site/app.contract`; `render=build` unless stated.

| Reference route | Exact route | Page component | Notes |
|---|---|---|---|
| `/` | `home "/"` | `pages/home.contract` | |
| `/articles` | `articles "/articles"` | `pages/articles.contract` | `ArticleList` |
| `/articles/[post]` (26) | `article "/articles/:post" pages=articleSlugs()` | `pages/article.contract` | `Markdown` + Newsletter(showTitle) |
| `/series/[series]` (6) | `series "/series/:series" pages=seriesSlugs()` | `pages/series.contract` | |
| `/demos` | **not a site route**: the demos app at `/demos/` | (demos build) | section 6 |
| `/demos/[post]` (126) | `demoPost "/demos/:post" pages=demoSlugs()` | `pages/demo-post.contract` | video + GithubCard + promo + feedback |
| `/docs` | `docs "/docs"` | empty `div`, as today | |
| `/docs/[post]` (3) | `doc "/docs/:post" pages=docSlugs()` | `pages/doc.contract` | |
| `/course` | `course "/course"` | `pages/course.contract` | Learn + testimonials |
| `/inspirations` | `inspirations "/inspirations"` | `pages/inspirations.contract` | |
| `/demos-app` | `demosApp "/demos-app"` | `pages/demos-app.contract` | QR at build |
| `/profile` | `profile "/profile" render=client` | stub | noindex |
| `/manage-subscription` | `manageSubscription "/manage-subscription" render=client` | stub | noindex |
| 404 | `notfound render=build` | `pages/not-found.contract` | `status=404`, `robots="noindex, follow"` |
| `/sitemap.xml` `/robots.txt` `/rss.xml` | files from `postbuild.ts` | | |
| `/api/*` (22) | edge rewrite to the old deployment | | section 8 |

Spike S3: `/demos/:post` with `pages=` must not claim `/demos/` (empty param) in the site's router or in the composed
Vercel routes; if it does, the site route becomes `/demos/:post` with a guard returning `notfound` for `""` and the
Vercel route order puts the demos mount first.

## 10. Lint, test, CI, deployment

**Site checks** (`.github/workflows/site.yml`, `on: pull_request/push` with `paths: ['.site/**',
'.github/workflows/site.yml']`, `defaults.run.working-directory: .site`):

1. Exact checkout: `actions/checkout` of `expo/exact` (public) at the sha in `.site/exact.mjs`'s seed, path matching the
   seed, cached by sha; `bun <checkout>/scripts/exact.mjs setup --platform web` (cached `~/.cargo`, `~/.rustup`,
   checkout `target/`).
2. `bun install --frozen-lockfile` (in `.site` only).
3. `bun tools/gen-content.ts --check` (unknown MDX tags, broken image/links fail).
4. `bun exact.mjs contract build app.contract --errors-only`; `bun x tsc -p tsconfig.json`.
5. `bun exact.mjs web-build --out dist && bun tools/postbuild.ts dist && bun tools/seo-check.ts dist && bun
   tools/budgets.ts dist`.
6. `bun exact.mjs test web` (app.test.contract) and `bun test tests/`.

**Demos checks**: `exact-lint.yml` gains `'!.site/**'`; `lint.yml` (.legacy) unchanged. Neither reads `.site`.

**Deploy** (`site-deploy.yml`): `push` to `main` with paths `.site/**` **or** the demos inputs list (section 6),
`schedule: '5 10 * * *'` (publish dates), `workflow_dispatch`. Steps: site build as above → `tools/demos-web.ts`
(cache by key) → `tools/compose.ts` writes `.vercel/output/{config.json,static/}` → `vercel deploy --prebuilt
--prod` (secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`: listed, not created here). PRs get
`vercel deploy --prebuilt` previews; the parity job (section 12) runs against the preview URL.

**Vercel project**: new project `reactiive-site` linked to the demos repo, "Ignored Build Step: exit 0" (no
Git-triggered builds: Vercel's builders have no Exact checkout or Rust). `config.json` routes, in order:
`/demos` → 308 `/demos/`; `/api/(.*)` → rewrite to `https://<old-project>.vercel.app/api/$1`; filesystem; demos
patterns → `/demos/shell.html`; site patterns from `dist/routes.json` → `/shell.html`; else `/404.html` status 404.
Headers: `/demos/assets/*`, hashed runtime files → `cache-control: public, max-age=31536000, immutable`; HTML →
`max-age=0, must-revalidate` (as today).

**Today's `vercel.json`** (reference repo: `framework nextjs`, `bun install`, `bun run build`) is not touched; the old
project keeps deploying the reference repo and serves `/api/*`. **Cutover**: assign `reactiive.io` to `reactiive-site`;
**rollback**: assign it back (seconds, no rebuild).

## 11. Performance budgets (checked by `tools/budgets.ts` and the parity job)

Baseline = the live Next site measured by `tools/parity/shoot.ts` in phase 0 (same machine, Chrome 158 headless,
cable and 4G+4x CPU profiles). Budgets per page: transferred JS ≤ live; total transfer (excluding videos and
fonts) ≤ live; LCP ≤ live + 0 %; CLS = 0 (all images sized at build); no long task > 200 ms at 4x CPU on article
pages; font bytes ≤ 151 KB (Inter 115 KB + Source Code Pro 36 KB, Source Code Pro lazy). `/demos/`: the demos'
own numbers in `tools/web-perf.md` (5.77 MB / 145 requests, FCP ≤ 2.78 s at 4G+4x) ±5 %, measured on the composed
output, proving the mount costs nothing.

## 12. Parity method

- Baseline: `/tmp/reactiive-live/` (342 screenshots, 171 routes × 1440/390, plus `metrics.json`) captured 2026-11-23;
  phase 0 commits `metrics.json` to `.site/tools/parity/baseline/` and keeps the JPEGs out of git (re-shootable).
- Per page: `compare.ts` checks title/description/canonical/og/twitter equality, document height within ±1 % (the
  reference's own Expo→Next tolerance), equal counts of links/images/videos/iframes/canvases/code blocks, identical
  heading list, and a pixel diff of the first viewport and the full page (`argent screenshot-diff`-style threshold
  ≤ 0.5 % differing pixels; masks for videos, the GitHub avatar and time-dependent text).
- Interactions: header scroll state, mobile menu, code copy, newsletter error state, search-free pages; each
  interactive article component with a scripted gesture.
- Reviews: every phase ends with an independent reviewer agent given the diff, inventory.md, this file and the parity
  report, not the author's conclusions.

## 13. Phased build plan

| Phase | Scope | Exit check |
|---|---|---|
| 0. Spikes + skeleton | `.site/` app via `bun <exact2>/scripts/exact.mjs new site` inside the demos repo; pin Exact; S1 demos mount at `/demos/`, S2 leaving link, S3 `/demos/:post` vs `/demos/`, S4 variable Inter, S5 `head` + postbuild injection survives client navigation, S6 `video` autoplay/muted/playsinline/poster; isolation numbers (section 1) | `docs/isolation.md` with the five proofs; spikes written up in `docs/decisions.md` |
| 1. Shell | tokens/forma, fonts, `SiteHeader`, `SiteFooter`, `Container`, `Text`, 404 | header/footer pixel-diff on 3 pages at 1440/390, scroll state, menu |
| 2. Home, inspirations, demos-app, course | static pages + motion | parity on `/`, `/inspirations`, `/demos-app`, `/course` |
| 3. Content pipeline | import, gen-content, `Markdown`, `CodeBlock`, embeds, math | `/docs/*` (3) then `/demos/<slug>` (126) parity |
| 4. Articles | `/articles`, `/series/*`, 26 articles without interactive blocks first (placeholders flagged) | 15 articles with no interactive components at full parity |
| 5. Interactive components | 37 exports, article by article | each component's frame/interaction diff; remaining 11 articles at parity |
| 6. SEO/feeds | postbuild head extras, JSON-LD, sitemap/robots/rss/manifest | `seo-check.ts` zero diffs on 171 routes |
| 7. `/demos` + compose + deploy | demos-web cache, compose, Vercel prebuilt previews, `/api` rewrite | preview passes full parity sweep; `/demos/` perf within ±5 % |
| 8. Cutover | domain switch, old project kept | live sweep on production equals the baseline; rollback rehearsed once on a preview domain |

Commands a builder will run most: `cd .site && bun tools/gen-content.ts && bun exact.mjs web-build --out dist && bun
tools/postbuild.ts dist && bun exact.mjs serve dist` (local), `bun tools/parity/shoot.ts <url> && bun
tools/parity/compare.ts` (parity), `bun tools/demos-web.ts && bun tools/compose.ts` (full output).

# Decisions and spikes

Each entry: what was decided, the evidence, and how to re-check it. Newest last.

## D1. The site is `.site/`, a second Exact app in a dot directory (2026-11-23)

Exact's bake captures every `.ts .js .mjs .cjs .json .contract .ttf .otf` file and all of `assets/` under an app
root, skipping only dot directories, `node_modules`, `target`, `dist` and build leftovers
(`js/bake/src/lib.rs` `sources()`, identical at the demos' seed `c193f394`, the site's `2180d806` and upstream main
`98ed61fb`). The Demos app is the repo root, so any visible sibling directory would be captured by it. Options and
rejections: architecture.md §1.

Re-checked against upstream's new white-label recipe (`docs/recipes/white-label.md`, commit `0701ef8c8`: one directory
and `app.json` per brand in a Bun workspace, shared screens and data code through workspace packages). It does not
change the decision: it assumes sibling app directories under a workspace root that is not itself an app, which
would move the Demos app off the root (option C, rejected); and the site and the demos share no code by design, so
there is nothing to put in a workspace package. Upstream keeps the dot-directory skip, the base-path refusals and the
router rule D2 relies on, so the layout survives the planned Exact upgrade.

## D2. Links into the Demos app are plain relative paths (Spike S2)

`link href="/demos/"` leaves the site's runtime with a normal document navigation: the web router keeps in the
document only a same-origin link that matches a declared, non-`notfound` route; "a modified click, a target or
download, another origin or an undeclared path (a file) is the browser's alone" (`host/web-js/router.js`, the click
listener; the same at upstream main). The site declares no route under `/demos`, and `tools/compose.ts` fails the build
if it ever does. No absolute `https://reactiive.io/demos` anywhere, so a preview links to itself.

## D3. `/demos/` is the Demos app's own build at base `/demos/` (Spike S1: passed)

`tools/demos-web/build.ts` builds a `git archive` of the demos inputs only, with `host.web.base = "/demos/"` written
into the scratch copy's `app.json`, `--render js` and no `--wasm`/`--plan`. Measured on the composed output
(`tools/compose.ts` + `tools/serve.ts`, Chrome 158 headless, real GPU, `tools/parity/demos-mount.ts`):

| check | 1440x900 | 390x844 (touch) |
|---|---|---|
| `/demos` | 308 → `/demos/`, framed iPhone Air launcher | full-screen launcher |
| `/demos/demo/chessboard` cold deep link, reload, Back to `/demos/`, Forward | all draw, URL kept | all draw, URL kept |
| GPU module | `/demos/gpu_bg.wasm` 200 | same |
| shader bundle via the head fetch override | `/demos/assets/demos-gpu-images/chunks/shaders.wgsl` 200 (resolved beside the wasm) | same |
| non-2xx responses / JS exceptions | 0 / 0 | 0 / 0 |
| title | `Demos \| Reactiive` on every step | same |

Pixel identity (`tools/parity/demos-same.ts`): the launcher at `/demos/` of the composed output against the same
commit built at base `/` and served by `bun exact.mjs serve`: **0 differing pixels** (threshold 8/255) at both widths.
The mount changes nothing the app draws.

## D4. The `/demos/` head: a compose-time overlay, without `og:site_name`

The live `/demos` title, description, canonical, Open Graph and Twitter tags are written over the demos build's
`<title>Demos</title>` in `index.html` and `shell.html` (`tools/demos-web/head.ts`), so the tracked demos sources and
the cached artifact stay origin-free. `og:site_name` is left out on purpose: Exact's runtime retitles a page whose
route sets no title from `og:site_name` (navigation.js), which turned the tab into "Reactiive". The demos'
`robots.txt` (`Allow: /demos/`) is dropped: the origin's is the site's (`Allow: /`). The demos build has no
`.well-known/`.

## D5. Legacy `/demos/<slug>` posts become 308s into the app

108 of the 126 post slugs are demos of the app (`demos.contract`): `/demos/<slug>` → `/demos/demo/<slug>`.
`3d-scroll-transition` → `scroll-transition-3d` (same demo, renamed in the port). The other 17 (animated-count-text,
animated-grid-list, blurred-bottom-bar, dynamic-blur-tabs, dynamic-tab-indicator, email-demo, image-cropper,
inner-shared-transition, instagram-shared-transition, ios-home-grid, particles-button, popup-handler,
qr-code-generator, record-button, shake-to-delete, skia-bottom-sheet, twitter-tab-bar) are not ported to Exact:
→ `/demos/`. `/profile` and `/manage-subscription` (signed-out visitors were sent to `/demos` client-side) are 307s to
`/demos/` at the edge.

## D6. Building the demos web: two local gotchas, both handled in the tool

- **wasm-bindgen version.** The demos' seed pins wasm-bindgen 0.2.130; `~/.cargo/bin` may hold another (0.2.127 on
  the dev machine), and cargo puts `$CARGO_HOME/bin` first on the build scripts' PATH, so prepending
  `~/.exact/bindgen-0.2.130/bin` to PATH is not enough. Locally: a `CARGO_HOME` whose `bin/` links the right
  `wasm-bindgen` (and the rustup proxies) and whose `registry/`, `git/` link the real ones. CI installs the pinned one
  with `exact setup --platform web`.
- **CARGO_TARGET_DIR is claimed by an app directory.** Exact refuses a target dir whose crates another app directory
  built; the scratch tree therefore has one fixed path (`DEMOS_WEB_SCRATCH`, default `$TMPDIR/reactiive-demos-web-src`),
  wiped before each build.

## D7. Fonts: the reference's WOFF2 files with `font-display: swap`, declared in the head

Contract `font` declarations take TTF/OTF only and Exact writes them with `font-display: optional` (host/web-js
`faces.rs`): on a cold load the 290 KB TTF missed the 100 ms window and the page stayed in the system font
(measured: "Open Source" 84.1 px wide in SF, 86.5 px in Inter). The site therefore declares its two faces as the
reference does, in a head script that adds the `@font-face` rules (`app.json` `host.web.head`; the head takes no
`style` tag), with `font-display: swap` and Inter preloaded, from the reference's own 115 KB + 36 KB WOFF2 files.
Rows name `font-family="Inter, …"`. The same script sets the reference's body text rendering
(`optimizeLegibility`, antialiased) and `::selection`, which are not Contract properties.

(D7 amended, 2026-11-23: Inter's printable ASCII is inlined as a 41 KB data: URL face, `unicode-range: U+20-7E`; the
reference's file serves the rest by unicode-range and is no longer preloaded. Pixel parity unchanged: `/` 0.04 % /
0.28 %, 404 0.03 % / 0.28 %.)

(D7 amended again, 2026-11-23: the subset is a preloaded, hash-versioned, immutable file with `font-display: block`
and `tnum` kept, no longer inlined in every page: docs/perf.md, "Inter's ASCII as a preloaded file".)

## D8. The header's scrolled look: an intersection marker, not a scroll handler

The bar takes the page colour and a hairline past 10 px of scroll. A scroll-driven CSS animation was emitted but
ran with a 0 s duration under Exact's timeline handling, and `scroll=` on `scroll document` did not fire for the
document's scroll; a 10 px marker at the top of the page with `intersect=` flips `scrolled` once per crossing (no
work per scroll event), and the bar's own 300 ms transition times it, as the reference's.

## D9. Responsive layout without a runtime

Built pages must fit 390 and 1440 before any script runs, so a breakpoint is a CSS `clamp()` against `100vw`
(`components/responsive.contract`: `sm`, `md`, `lg`), the technique of Exact's docs site. A part that exists only
on one side (the desktop and mobile header bars) is clipped to zero height on the other.

## D10. `/demos` is a site page: the live hero, then the Demos app in a frame (owner, 2026-11-23; supersedes D3's mount path)

The owner asked for the live `/demos` top (header, spiral backdrop, "Demos" title, subtitle, the open-source pill
with its star count) and, below it, the Demos app in place of the video grid. So:

- **The app stays its own artifact**, built exactly as in D3 but at base **`/demos/app/`** (`tools/demos-web/build.ts`
  `BASE`; overlay v2, so a new cache key; nothing else in the artifact changes). `tools/compose.ts` places it at
  `/demos/app/`, refuses any site path under `/demos/` and routes `/demos/app` → 308 `/demos/app/`.
- **`/demos` is the site's route** (`pages/demos.contract`), its hero ported from `components/landing/hero` (layout
  matches the live text boxes to 0.1 px at 1440 and 390). The spiral and the pill's stars are Canvas 2D surfaces
  drawn by the data module (`components/hero-canvas.ts`, the reference's code with a seeded stream for
  `Math.random`); the count spins like NumberFlow (one 0-9 column per digit, 1.5 s `cubic-bezier(.16,1,.3,1)`,
  500 ms in). The count is a snapshot (3,248 on 2026-11-23): the live one needed `GITHUB_OAUTH_TOKEN` (stubs.md).
- **The app is an `iframe` of `/demos/app/`**, so it keeps its own runtime and the site loads none of it until the
  frame does. From 768 px the frame is 600 px wide and the viewport's height under the header (600-1080 px): the app
  then draws its own framed iPhone Air on its stage, scaled to fit, exactly as `/demos/app/` does in such a window;
  the stage's edges fade into the page (masks: top and bottom 24 px, sides 12 %). Under 768 px the frame is the
  window's width and its height under the 73 px header: the app's phone layout, owning the touches once scrolled to
  (the app's head sets `overscroll-behavior: none`, so its gestures never scroll the page); the header, the hero
  above and the footer below stay the page's handles. Verified (`/tmp` script, CDP input into the frame): open
  Chessboard, close with its button, page the launcher; the page's scroll stays put; no exceptions.
- **Legacy `/demos/<slug>` posts** 308 to `/demos/app/demo/<slug>` (the demo full window, as the old app link did);
  a slug the app lacks, and `/profile`, `/manage-subscription`, go to `/demos`. `/demos/` 308s to `/demos` (the
  reference's trailing-slash rule). A `?demo=` handoff into the framed app was considered and dropped: the frame's
  `src` is fixed at build, and changing it at run time loads the app twice.

## D11. Motion Contract cannot express lives in the head stylesheet, hooked by `data-*` words

Contract keyframes take no `filter`, boxes take no 3D transform, and a breakpoint cannot switch an animation. The
reference's entrances are CSS that runs before any script (motion-blur-in's 12 px blur, motion-title-in's
`rotateX(-30deg)` under a 1000 px perspective, `translateZ` lifts). They are therefore the reference's own CSS, in
`web/head.css` (copied into `app.json`'s head script by `tools/head.ts`; `--check` in CI), applied by the app's
declared `data-motion` / `data-delay` words (`app.json` `"data"`). Same keyframes, durations, easings and delays as
`globals.css`; `prefers-reduced-motion` turns them off as there.

## D12. /demos on a desktop: the hero left, the Demos app right; the app sandboxed in its own process (owner, 2026-11-23)

A deliberate difference from live, asked by the owner ("show the demos on the right and reorganise the screen").

- **From 1024 px** one row in the site's container (72 rem): the hero on the left, vertically centred and left-aligned
  (same title gradient, size 144 px or `(min(100vw, 1200px) - 648px) / 3` when the column is narrower, same entrances,
  delays and hovers as live), the app's frame on the right: 600 px (the app frames its iPhone from a 600 px window) by
  `clamp(560px, 100vh - 96px, 1032px)`, so the phone (`min(1, (h - 48) / 936)`) is never cut by the fold and never
  larger than 1:1. Checked at 1024x768, 1280x720, 1440x900, 1512x982, 1920x1080, 2560x1440 (phone 0.62-1.0 scale).
  The app's stage is masked to 24 px around the phone, so the spiral shows around it. Under 1024 px the stacked layout
  of D10 is unchanged. No runtime switches the layout: a wrapping row whose hero is 100 % wide under 1024 px, spacers
  for the alignment (`centring()`), the masks and the still in `web/head.css` media queries.
- **The still.** From 768 px a WebP of the app's framed launcher (`tools/sim-still.ts`: the phone at scale 1 plus its
  24 px, transparent around it, 2x, 133 KB) is drawn where the app will draw its phone, at the app's own scale, over
  the frame and blind to the pointer; it fades (300 ms) 800 ms after the frame's `load` (the app has drawn its phone by
  `load`: measured at 4x CPU on both processes). A CSS background in a media query, so a phone never downloads it.
- **When the frame loads.** Once its box is within a viewport's height of the window (`intersect-margin="100% 0px"`)
  and the hero's entrances are done (1.6 s), whichever is later.
- **Its own process.** `sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-pointer-lock
  allow-downloads"` without `allow-same-origin`: an opaque origin, which Chrome (desktop, and Android with site
  isolation) puts in a renderer process of its own, so the app's start (≈ 500 ms of long tasks at 4g / 4x CPU) is off
  the page's main thread: page TBT 7 ms vs live 66 ms. Measured alternatives (`perf.ts`, 1440 4g, one run):
  same-origin frame: page TBT 558 ms; a cross-site frame (`localhost` in a `127.0.0.1` page): page 0 + 499 ms in the
  OOPIF; sandboxed: page 0 + 602 ms in the OOPIF. A subdomain (`demos.reactiive.io`) would be the same *site*, hence the
  same process; a different registrable domain works but needs a second deployment and domain. `credentialless` keeps
  the origin, hence the process. Costs of the sandbox: the app's files must answer `Access-Control-Allow-Origin: *`
  (module scripts, wasm and fonts are CORS fetches from origin `null`; `tools/compose.ts` adds it under `/demos/app/`,
  public static files); the app gets no storage (it handles that: no exception, demos open and close) and no
  `allow=` permissions (Contract's `iframe` takes no `allow`: clipboard writes and Web Share inside the frame are
  refused); Safari and low-memory Android Chrome keep sandboxed frames in-process (no worse than a same-origin frame).

### D12, revised the same day (owner: "I don't understand the background behind the mockup … take inspiration from Apple")

Compared at 1280x720, 1440x900, 1512x982, 1920x1080: **A** copy left / device right (two equal columns) and **B** a
centred stack with the device peeking below the fold (the D10 layout at desktop widths). B leaves the device cut at
the fold on every size (the owner's first complaint) and the copy floating alone in the first viewport; A keeps
copy and device on one horizontal axis in one viewport. **Chosen: A**, restyled after apple.com's device-beside-copy
heroes, all from 1024 px in `web/head.css` (one DOM, the stacked layout under 1024 px unchanged):

- the device sits on the page: the frame is masked to the iPhone's silhouette (an SVG of the app's 444 x 936 frame:
  continuous 74 pt corners from the display path's constants, the four keys), so none of the app's stage shows; a
  soft shadow under it (`::before`, two blurred shadows, 55 % / 35 % black); the spiral steps back (40 % and masked
  out before the device column);
- device height `min(100vh - 176px, 780px)`: 48 px under the 80 px header band and 48 px above the fold, never larger
  than 780 px (1280x720: 544 px; 1440x900: 724 px; 1920x1080: 780 px); the frame is that plus the app's 24 px each
  side, 600 px wide, overflowing its column under the copy (the copy is above it, so its links keep the pointer);
- copy: title 72-96 px (`clamp(72px, 6.25vw, 96px)`), weight 600, -0.035em, the live gradient; subtitle 22 px / 1.45
  in the secondary colour; the pill 32 px below; the column vertically centred on the device's centre line;
- motion: the copy's entrances as live; the device rises 16 px and fades in, 700 ms `cubic-bezier(.16,1,.3,1)`, no
  delay (a delayed entrance delayed the page's largest paint, the still, to ~1 s); the live frame swaps in under the
  still with no shift.

## D13. The Demos-tied content is not ported; its live URLs redirect permanently (owner, 2026-11-23)

The owner: "All the content and articles tied to demos are no longer needed now" (classification:
`docs/progress-content.md`). Four articles and the two series made only of them are not built, but their live URLs
are linked from outside (search results, social posts, the newsletter), so none may 404. `tools/compose.ts` answers
each with a 308 (permanent, method kept; the same kind as D5's demo posts), with or without a trailing slash:

| live URL | to | why |
|---|---|---|
| `/articles/building-demos` | `/demos` | it presented how Demos was built: Demos is now the page |
| `/articles/open-sourcing-demos` | `/demos` | it announced Demos going open source |
| `/articles/leaving-patreon` | `/articles` | the Patreon move: no successor page, the articles index |
| `/articles/patreon-migration` | `/articles` | the same |
| `/series/thoughts` | `/articles` | the series of the three articles above |
| `/series/engineering` | `/articles` | the series of `building-demos` alone: a list of articles, so the articles index |

One list, `NOT_PORTED_REDIRECTS` in `tools/seo/site.ts`: the converter skips its articles (`SKIPPED`), the SEO
postbuild leaves them out of the sitemap and the feed, compose writes the redirects.

## D14. Interactive demos: motion as transitions, keyframes only for endless loops (gesture/UI group, 2026-11-23)

Exact emits CSS globally. Every `keyframes` in the plan becomes an `@keyframes` rule in every page's head and in
`style.css`, whichever route uses it (`host/web-js/src/emit.rs`, "The plan's `@keyframes`"). Each rule that animates
`scale` or `translate` also gets an `-exact-press` copy, which is what a pressable node plays. The view plan is a
single `app.js`. A demo therefore costs every page of the site, not just its article.

Rules for `components/interactive/`:

- Motion that restarts on a press is a transition on a fresh node keyed per press. The node's first layout
  (`resize`) sets its end values. Spring transitions (`-exact-spring`) and timed ones are written inline on the
  node, so they add no global rule.
- `keyframes` are used only for endless loops (the skeleton shimmer, the CSS square) and exit animations, with two
  stops each. No baked stop lists.
- Galleries for development are not routes. `components/interactive/gesture-kit/.tools/gallery.ts` adds the route
  to a temporary copy of `app.contract` and builds it into `dist/gallery`.

Measured on the home page, the gallery build (all 22 gesture/UI demos in the plan) against none:

| | none | before (baked keyframes) | after |
|---|---|---|---|
| HTML (raw / gzip) | 90.2 / 18.9 KB | 128.5 / 22.7 KB | 93.4 / 19.3 KB |
| `style.css` | 135.0 / 18.5 KB | 188.1 / 23.4 KB | 152.9 / 20.2 KB |
| `app.js` | 366.8 / 97.1 KB | 398.6 / 103.9 KB | 403.1 / 104.9 KB |

The remaining cost is the components' plan and classes, which every page loads. Removing it needs per-route plans
and keyframes from Exact (feedback noted).

## D15. The accounts: the reference's API as the backend, its client ported, off without the env (branch site-env, 2026-11-23)

- **Backend: the reference's own Next API, unchanged.** Locally `tools/local-env/api.ts` runs it from a `git archive`
  copy (never the reference clone) on :3000 with the owner's env file in its process environment only;
  `tools/serve.ts` proxies `/api/*` same-origin (redirects unfollowed, so OAuth works). In production compose's
  rewrite to `LEGACY_API_ORIGIN` does the same. Evaluated and rejected: server functions on the Exact web host. Exact's
  web output here is a static Build Output tree (`render=build` pages, `--render js`); compose could add Vercel
  functions, but that is a rewrite of 22 route handlers, the DB layer and the webhook for no gain over keeping the
  deployment that already runs them, and the OAuth clients' redirect URIs already name `https://reactiive.io/api/...`.
- **Session: the reference's, byte for byte on the wire.** Its callbacks answer 302 to
  `${EXPO_PUBLIC_WEBSITE_URL}/profile?accessToken=<JWT>`; the client keeps the JWT and sends `Authorization: Bearer`.
  Here the root's `state accessToken = "" persist` (localStorage) takes it from the URL and replaces the URL; the data
  module (`components/account/account.ts`) sends it with `credentials: 'omit'` (no cookie exists). A 401 forgets it. Not
  carried over: the reference's XOR obfuscation of the stored token under `@AccessStorage` (obfuscation with a public
  key, not security); after the cutover a signed-in visitor signs in once more.
- **Sign-in buttons are links.** The reference asks `/api/auth/{google,apple}-sign-up` at the press and sets
  `window.location`. Contract has no same-tab navigation to another origin from an action (`openURL` opens a new tab),
  so the URLs are asked when the dialog opens and the buttons are plain links to the provider (same requests, same
  page; a spinner while the answer is out).
- **On/off.** `SITE_ACCOUNTS=1` (public setting) turns the accounts on; `EXPO_PUBLIC_WEBSITE_URL` is the API base
  (default `https://reactiive.io`). Unset, the header draws the signed-out "Sign In" that opens nothing, no request is
  made, `/profile` 307s to `/demos` (compose, unless `LEGACY_API_ORIGIN`), the star count is the snapshot, and no
  analytics script is written: the public build is the earlier one.
- **Payments are not ported** (owner): no checkout, plan UI, subscription modals or refunds; `/manage-subscription`
  always 307s to `/demos`; the menu's support entry and the profile's SubscriptionBox are left out.
- **Analytics and Sentry** are a script `tools/observability.ts` writes into the built pages when the public keys are
  in the build's env: the vendors' CDN builds (pinned, SRI) with the reference's options; never sending on localhost.
- **Secrets.** Only public values reach the site build (`.env.local`: `SITE_ACCOUNTS`, `EXPO_PUBLIC_*`); server values
  live in the API process only. `tools/check-secrets.ts` scans the staged diff, the tracked tree and build outputs
  against patterns and the env file's values.

### D15, inherited from the reference: the session's known weaknesses (security review of PR #121, 2026-11-23)

Kept as they are, since the backend is the reference's, unchanged; listed with the fixes recommended upstream (in the
reference's API, then mirrored here):

- **The JWT lives in localStorage** (here a persisted state; there XOR-obfuscated): any XSS on the origin can read it.
  Upstream: an `HttpOnly; Secure; SameSite=Lax` `__Host-` session cookie set by the callback (Exact's
  `recipes/web-sessions.md`), the page never holding the token.
- **The token travels in the callback's URL** (`/profile?accessToken=`): it lands in history, logs and Referer.
  Mitigated here: the page replaces the URL at once, Sentry scrubs it from every event, the profile page loads no
  third-party resource before the replacement. Upstream: the cookie above, or a single-use code exchanged by POST.
- **The JWT does not expire** and cannot be revoked (no `exp`, no server-side session). Upstream: `exp` (hours),
  refresh with rotation, a revocation list or session table.
- **OAuth `state` carries only utm_source, no anti-CSRF value; no PKCE.** Upstream: a random, single-use `state`
  bound to the browser (cookie) and checked in the callback; PKCE for the code exchange.

## D16. Content and static pages activate on the reader's intent; the runtime adopts fewer nodes (2026-11-23)

Article pages blocked the main thread 225-430 ms at 4g / 4x CPU (live: ~75) because each page started Exact's whole
runtime once idle (`activate=idle`): one task that builds the page's view tree and adopts every node the build
rendered (~55 ms plus ~0.07 ms a node at 4x CPU; `pan-gesture-handler` had 2,763 nodes, 2,050 of them code tokens).

- **`activate=interaction`** on `/articles`, `/articles/:post`, `/series/:series`, `/docs`, `/docs/:post`, `/course`,
  `/inspirations`, `/demos-app` (`/` and `/demos`, ~140 nodes and their own clocks, stay `idle`). Such a page loads no
  script of the runtime until intent: a press on a control with a handler (the menu, Sign In, the copy button, the
  newsletter field), which Exact's capture script records and replays after the boot, or a node with an `intersect`
  handler entering the window (and the first scroll once one exists: Exact's own rule, `host/web-js/capture.js`).
  The interactive demos and the YouTube / X embeds carry one (`components/markdown.contract`), so a demo activates the
  page when it is seen; a page with none never loads the runtime. Text, links, entrances, the card cascade and every
  hover are HTML and CSS (D11) and work without it.
- **The header's scrolled look moved out of the runtime**: `web/reveal.js` sets `html[data-scrolled]` past 10 px (one
  passive scroll listener writing on change), `web/head.css` colours `[data-motion~=bar]` (the mobile bar too while its
  menu is open, `bar open`). The `scrolled` state, its 10 px marker and `topSeen` are gone, so no page has an
  `intersect` node at the top that would wake it at once.
- **Code blocks are a text node per run, not a span per token.** A block without diff marks is one pre-formatted text
  (its line feeds inside); the runs between italic comments are one text each, coloured by the CSS Custom Highlight API
  (`::highlight(tok-<letter>)`, web/content.css; `web/reveal.js` registers one `StaticRange` per token from the run's
  `data-hl` list, as the parser adds it, and again if a text node is replaced). Comments stay italic spans.
  `pan-gesture-handler`: 2,763 nodes to 543; HTML 310 to 212 KB. Glyphs are the same at the same places; anti-aliasing
  at former span starts differs by subpixel offsets (code blocks 0.01-0.24 % px at threshold 32). Without the API
  (Chrome < 105, Safari < 17.2, Firefox < 140) code is drawn in its block's colour.
- **Navigation.** Before activation a link is a document navigation (Exact: "real links navigate before
  activation"); the head's speculation rules prerender a same-origin page on hover (`moderate`; not `/demos*`,
  `/profile`, `/api/*`), so it swaps in at once with the header in place. After activation links are in-app as before.
- Rejected: deferring the idle activation past the measurement window (the same work, later, during the reader's first
  scroll); `paint`/`render` policies (they change when a page is drawn, not what activation costs); time-slicing the
  boot (Exact's adoption is one task; not ours to split).

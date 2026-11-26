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

## D5. Legacy `/demos/<slug>` posts become 308s into the app (the 109 with a demo are pages again since D21)

**Superseded by D25**: every post is a page; no `/demos/<slug>` redirects.

108 of the 126 post slugs are demos of the app (`demos.contract`): `/demos/<slug>` → `/demos/demo/<slug>`.
`3d-scroll-transition` → `scroll-transition-3d` (same demo, renamed in the port). The other 17 (animated-count-text,
animated-grid-list, blurred-bottom-bar, dynamic-blur-tabs, dynamic-tab-indicator, email-demo, image-cropper,
inner-shared-transition, instagram-shared-transition, ios-home-grid, particles-button, popup-handler,
qr-code-generator, record-button, shake-to-delete, skia-bottom-sheet, twitter-tab-bar) are not ported to Exact:
→ `/demos/` with a **307** (amended after the final review: the launcher is not a permanent equivalent of those
posts, so search engines keep the old URLs; the 109 with a demo stay 308). No alias for `qr-code-generator`
(checked against the reference's MDX, 2026-11-24): it is the RN app's `qrcode` demo (a text field, a gradient QR code,
path-effect sliders), and none of the app's three QR demos is it (`cherry-blossom-qrcode` a 3D WebGPU tree,
`empty-qr-code` the RN `empty-qrcode` logo / QR toggle with a share sheet, `notion-qrcode` a torus of avatars morphing
into a QR code); the owner's decision is that no demo is ported to Exact, so it stays a 307 to the launcher. `/profile` and `/manage-subscription` (signed-out visitors were sent to `/demos` client-side) are 307s to
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

**Superseded by D25**: the four articles and the two series are ported; the redirects are gone.

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

### D15, amended: the old site's storage is the new site's (owner, 2026-11-23: "people must NOT lose their data")

- **Overrides "Not carried over: the XOR obfuscation" above.** The session is kept in the reference's own key and
  format, `@AccessStorage` (XOR with the public `EXPO_PUBLIC_ACCESS_KEY`, base64), so a reader signed in on the old site
  is signed in on the new one at the cutover, and the reverse on a rollback. Also carried: `@UtmSource` and the header
  hint `reactiive:signed-in` (with `html[data-auth=in]`, the avatar's place reserved before the session is known).
  Everything else on the origin (`REACTIIVE_CACHE`, Amplitude's cookies, storage and IndexedDB) is left untouched, and
  Amplitude is the same SDK and init, so device and session ids continue. Inventory and proof: `docs/storage.md`.
- **How.** Exact's `persist` keeps a state under `exact.state.<name>` (JSON) and the data module cannot reach
  localStorage, so a page script (`web/storage.js`, first in the head, written by `tools/storage-bridge.ts` with the
  key) copies the reference's keys into the runtime's before it starts, and mirrors the runtime's writes back
  (`Storage.prototype.setItem`/`removeItem` wrapped, for those three keys only). Rejected: a copy at the first visit
  only (a rollback after a new sign-in or sign-out would see a stale session); dropping `persist` for a page-side store
  (Exact has no other way into a state at boot); renaming the states to the reference's keys (Exact prefixes every key).
- **Intent-activated pages (D16) and the session.** A signed-in reader's page starts its runtime once idle (the same
  start as Exact's capture script), so the avatar appears without a press; a signed-out reader's pages are unchanged.
- **Payments, amended.** `/manage-subscription` is ported for a subscriber's status and cancel only (`docs/stubs.md`):
  no price, purchase, upgrade, downgrade, resume or refund.

## D16. Content and static pages activate on the reader's intent; the runtime adopts fewer nodes (2026-11-23)

Article pages blocked the main thread 225-430 ms at 4g / 4x CPU (live: ~75) because each page started Exact's whole
runtime once idle (`activate=idle`): one task that builds the page's view tree and adopts every node the build
rendered (~55 ms plus ~0.07 ms a node at 4x CPU; `pan-gesture-handler` had 2,763 nodes, 2,050 of them code tokens).

- **`activate=interaction`** on `/articles`, `/articles/:post`, `/series/:series`, `/docs`, `/docs/:post`, `/course`,
  `/inspirations`, `/demos-app` (`/` and `/demos`, ~140 nodes and their own clocks, stay `idle`). Such a page loads no
  script of the runtime until intent: a press on a control with a handler (the menu, Sign In, the copy button, the
  newsletter field), which Exact's capture script records and replays after the boot, or a node with an `intersect`
  handler entering the window (and the first scroll once one exists: Exact's own rule, `host/web-js/capture.js`).
  **Amended (leftovers block):** the YouTube / X embeds are the browser's own lazy frames (`loading="lazy"`, written by
  `tools/seo/postbuild.ts` since Exact's `iframe` takes no `loading`; `web/reveal.js` adds it to a frame the runtime
  draws) and the demos' frames have no `intersect` either: an observed node made Exact start the runtime inside the
  reader's first scroll (2-3 frames up to 183 ms at 4x CPU). A page with a demo now starts its runtime once it is
  parsed and the main thread is idle (`web/reveal.js`: the capture script's own start, the checkpoint's entry and answers), deferred
  while the reader is scrolling (no scroll in the last 250 ms), so the one long task lands before the scroll, not in
  it; a page with only embeds never starts it. Text, links, entrances, the card cascade and every
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
  (Chrome < 105, Safari < 17.2, Firefox < 140) `web/reveal.js` splits each run's coloured tokens into spans
  (`[data-hl]>[data-tok=<letter>]`, the same colours in web/content.css; plain tokens stay text), so only those
  browsers pay the nodes; `?hl=spans` forces it (pan-gesture-handler: 7,538 code characters, 0 in another colour than
  the highlight's, 728 spans, before and after the runtime starts; modern browsers 0 spans, 647 nodes).
- **Pressed looks are CSS.** Exact draws a Contract `:active` (and `-exact-press-scale`) from its runtime, so the first
  press of a page not yet awake showed nothing. Sign In, Subscribe and the account dialogs' buttons
  (`data-motion~=press-primary` / `~=press-secondary`, web/head.css) press with `:active` as live's classes
  (`active:scale-[0.97]`, the variant's active colour, data-motion button's 150 ms snappy); hover and focus were already
  CSS. Exact's 0.65 press dim is off for them.
- **Navigation.** Before activation a link is a document navigation (Exact: "real links navigate before
  activation"); the head's speculation rules prerender a same-origin page on hover (`moderate`; not `/demos*`,
  `/profile`, `/api/*`), so it swaps in at once with the header in place. After activation links are in-app as before.
- Rejected: deferring the idle activation past the measurement window (the same work, later, during the reader's first
  scroll); `paint`/`render` policies (they change when a page is drawn, not what activation costs); time-slicing the
  boot (Exact's adoption is one task; not ours to split). Starting a demo page's runtime when its demo is 1.5
  viewports away: a reader scrolling steadily is mid-scroll then, the very frame to avoid; idle once parsed is earlier
  and between scrolls.

- **Amended again (2026-11-24, perf follow-up of the final sweep; docs/perf.md).** A demo page's runtime starts on idle
  only when a demo is within 2.5 viewports below or 1.5 above; otherwise each time the reader's scroll settles near
  one. The start is the page's own (`exact.ready` set by `web/reveal.js`), so Exact's capture script never starts it
  inside a scroll; a press starts it at once. A reader who scrolls without pausing onto a far demo sees its box empty
  until the first pause (250 ms): the price of no long task in the scroll. Canvas demos mount with the page and paint
  first once the scroll settles. Code blocks off screen are `content-visibility: auto` at their exact size.

## D17. /demos on a desktop, redesigned: the header's columns, two calls to action, a lit device (owner, 2026-11-23)

The owner: "I think you can also hugely improve the design of this one". Today's page (D12 revised) put the hero in the
72rem container while the header (shared by every page, unchanged) is in 48rem: at 1440 the title started 193 px left
of the logo, the left column was mostly empty, and the device floated alone on the right.

Three variants, all from 1024 px only (under 1024 px the stacked layout of D10 is unchanged, apart from the new
"Get the app" button beside the pill, same height, so the app's frame does not move), shot at 1440x900, 1920x1080,
1280x720 and 390x844 (`/tmp/demos-variants/{before,A,B,C}@<w>x<h>.png`):

- **A (chosen).** One row in the header's own container (48rem): the title starts under the logo, the device's right
  edge ends under Sign In. The title as large as the column allows (`min(104px, (672px - device width) / 3.1)`, 600,
  -0.04em, the live gradient), the subtitle exactly as live (owner, after a two-tone, three-line try: "awful"): the
  same two lines, one gradient, weight 500, line-height 1.55, -0.01em, at 18 px or slightly less
  (`min(18px, column / 20.2)`, 17.2 px at 1440 and 1920) so the second line never wraps; two calls to action: "Get the app" (the page's one light button: `/demos-app`, the TestFlight
  page) and the GitHub pill with the star count (its label shortened to "GitHub" beside the button); under them a
  quiet hint, "Running live. Tap any app on the screen.", whose dot turns green when the app has drawn (the screen
  "turns on" under it: the frame's fade over the still). The device stands in a soft cool spotlight (a radial gradient
  of the primary blue at 20 %, no panel, no edge) over a contact shadow; at most 700 px tall, so the composition is the
  same at 1440x900 and 1920x1080. The copy sits 2vh above the device's centre line (optical centre).
- **B.** A, quieter: no spotlight, the hint as a caption under the device ("Live in your browser. Tap any app."), the
  title 88 px, a one-colour subtitle. The caption reads well but sits on the fold at 1280x720 and the device is
  smaller; without the light the device is again a cut-out on black.
- **C.** A with a wider, brighter spotlight and a slow idle float of the device (±4 px, 3.2 s). The haze muddies the
  copy's side and moving an interactive target (the screen takes taps) has no purpose: rejected.

**A featured-demos list that opens a demo inside the phone** was considered and dropped: the app's
`/demos/app/demo/<slug>` draws the demo full window, not inside its framed iPhone (checked in a 600 px window), so the
frame would show a frameless demo; and a src change reloads the app (D10). Doing it properly needs the app's own
deep link into its framed launcher: a change in the Demos app, not here.

The pill's floating stars rise 170 px over the copy; beside the copy they would cross the subtitle, so from 1024 px
their canvas is masked to the 26 px between the subtitle and the pill and kept off the device's side: no sparkle
inside the text's box. Screens after this fix: `/tmp/demos-variants/A2@<w>x<h>.png`.

Cost: the CTA and hint are a few plan nodes (app.js +~1 KB) and ~2.5 KB of head CSS; perf.md 2026-11-23 (D17).

### D17, revised the same day (owner: "I don't like the Get the app button"; "everything is a bit too cramped")

- **No "Get the app".** Removed on every width; the live pill is back exactly ("Demos is Open Source | ★ 3,248", its
  icon, 36 px, hover, the spinning count, "Source code" under 640 px), the only control under the subtitle. The hint
  stays below it: with the pill alone it reads as the pill's caption about the device, not as an orphan.
- **Air, still inside the header's container** (both edges kept on the logo and Sign In). The gap between the copy and
  the device is `clamp(64px, 6.67vw, 112px)` (1280: 85, 1440: 96, 1728+: 112); the device is
  `min((720px - gap) * 48 %, 80 % of the height under the header, 332 px)` wide (1440x900: 300 x 632, 78 % of the
  height), so copy and device have about equal widths; the title and the subtitle size to the copy column
  (title `min(104px, column / 3.1)`, subtitle `min(18px, column / 20.2)`: 18 px at 1024-1280, 16 px at 1440,
  15.7 px from 1728); rhythm title → subtitle ~34 px, subtitle → pill 40, pill → hint 28. Measured: the subtitle's
  second line ends 97-112 px before the device at every width from 1024 to 1920. A wider hero container was not
  needed. Screens: `/tmp/demos-variants/A4@{1280x720,1440x900,1728x960,1920x1080,390x844}.png`.
- **Focus ring after a click.** A link that opens a new tab kept the focus; back on the tab the browser could draw the
  keyboard ring on the pill. `web/reveal.js` drops the focus of such a link after a pointer click (`detail > 0`);
  keyboard activation keeps it (and its ring).
- **No hint.** The owner removed "Running live. Tap any app on the screen." and its dot too: the copy is the title,
  the subtitle and the pill (title → subtitle ~34 px, subtitle → pill 40 px), centred 2vh above the device's centre.
- **Wider than the header (owner: "I'd like the layout to take more space", horizontally).** This overrides the
  header-container alignment above: from 1024 px the hero's row is `--W = clamp(720px, 100vw - 360px, 1200px)` wide,
  centred on the header (1440: 1080, 1728+: 1200; the header's own container is unchanged). Copy left, device right,
  gap `clamp(64px, 8vw, 160px)` (1440: 115, 1728: 138); the device keeps its height (80 % of the height under the
  header, at most 332 px wide); the title as wide as live's (up to 144 px), the subtitle up to 20 px, never wrapped.
- **Bottom space (owner: "too much bottom padding").** The row no longer fills the viewport: as much space under the
  device as above it (`--m = clamp(48px, 7vh, 96px)` under the 87 px header; 63 px both sides at 1440x900), then the
  footer at its usual 40 px. Screens: `/tmp/demos-variants/A6@{1280x720,1440x900,1728x960,1920x1080,390x844}.png`.
- **The middle ground (owner: "it still looks too wide").** `--W = clamp(720px, 100vw - 480px, 960px)`: 120 px past
  the header's container on each side from 1440 (centred on it), gap `clamp(64px, 7vw, 112px)` (1440: 101, 1728: 112);
  the rest as above. Screens: `/tmp/demos-variants/A7@{1440x900,1728x960}.png`.
- **One screen, no scroll (owner, on a 1728 x 960-1000 MacBook; the footer kept).** From 1024 px the whole page is the
  window: `main`'s 80vh floor is dropped on this page (`main:has(d-page)`), the hero row is `100dvh` less the 80 px
  header band and the footer's 105 px, the device as tall as that less equal margins above and below
  (`clamp(24px, 5dvh, 64px)`), clamped 320-700 px (was 420: a 1348 x 640 Chrome window, about 520 px inside, cut the phone at the fold, owner
  2026-11-24); the title (`--avail * .3`), the subtitle (`--avail / 22`) and the pill's gap (`--avail * .07`) follow a
  short window too, so the hero fits; shorter still, the page scrolls (nothing locks it: the row has a min-height only).
  Measured: no scroll at 1440x900 (unchanged), 1440x700, 1348x640, 1280x600, 1024x768, 1024x600; 1348x520 scrolls
  44 px to the footer with the phone whole (433 px, was 533 px, cut).
  Measured scrollHeight == clientHeight at 1728x960, 1728x1000, 1512x982, 1440x900, 1280x720 (device 456 px, 36 px
  margins) and 1024x768; under 1024 px the stacked page scrolls as before (390x844: 1196 px).
  Screens: `/tmp/demos-variants/A7@{1728x960,1440x900,1280x720,390x844}.png`.
- **"The sim reloads when I switch tabs" (owner).** Measured with CDP at 1728x960 (child-frame navigations of the
  sandboxed frame): 10 browser-tab switches (the page hidden, half of them also frozen and resumed): **0 reloads**;
  the app's own reload path (Exact's generation reload) needs sessionStorage, which the opaque-origin frame lacks, so it
  never fires there. 5 in-app round trips (Articles ↔ Demos): 5 loads, by design of the router: the page's entry is
  keyed per visit, so the frame is created again, and keeping it alive outside the routed content would mean placing
  it over a box whose place only the page's layout knows (the stacked layout under 1024 px). The jump was that the
  second visit showed the frame at once (`simLive` stayed true) while the app was starting, over the still:
  `follow` (app.contract) now resets `simFramed` / `simLive`, so every visit shows the still until the app has drawn
  again and cross-fades as the first does (sampled 50-1000 ms after each return: frame opacity 0 over the still,
  1 from 1.5 s).
- **The title's entrance: the live one (owner, the same evening: "the 'Demos' title animation is not good at all").**
  The drawn-on outlines with the light fill that followed (V3, `pages/demos-title.contract`, `tools/title-draw.py`,
  its head CSS) are removed, files and tooling included. The title enters as live's at every width: the wrapper's
  `motion-title-in` (900 ms, `--ease-motion`, 100 ms delay, `backwards`; the reference's `.motion-title` around the h1)
  over the live gradient (`from-[#ffffffd9] via-[#ffffff] to-[#ffffffd9]`). The rest of D17's layout is unchanged
  (from 1024 px the title is 600 and sized to the copy column).
- **Tab switches, re-measured in a headed Chrome (owner's report).** A normal window (`--user-data-dir`, no
  extensions), /demos in tab A, example.com in tab B, 10 switches 2-10 s apart, one minimise/restore, one
  freeze/resume: **0 child-frame navigations**, the frame's src unchanged, `live` kept, and a screencast of the
  device over 3 returns shows the launcher still (only its own wallpaper light moving). Nothing in the page reloads
  the frame on visibility or focus (Exact does not re-render the route on either).
- **Articles ↔ Demos: the frame is kept (from 1024 px).** It now lives outside the routed entry, in `app.contract`
  (mounted from the first visit, `keepSim`; hidden with `display: none` on any other page, which keeps a frame
  loaded; never moved, which would reload it), placed by CSS exactly where the hero leaves its column (the row's
  right padding is the device's width plus the gap; `sim-keep`'s top and right are computed from the same `--W`,
  `--m`, `--avail`, `--ph`). Measured: 5 round trips, **0 loads of the app**, the frame at opacity 1 from the first
  50 ms of each return. Under 1024 px the hero's height depends on its wrapped text, so no CSS can place a frame
  outside the flow there: the page's own frame is used, created per visit, with the still (from 768 px) until it has
  drawn. The device's entrance (rise, 700 ms) replays with the copy's on each return (a `display` change restarts CSS
  animations); the app inside keeps its state.
- **Review fixes (PR #122).** Focus order: the kept layer comes after the routed page, so from 1024 px the page's own
  footer keeps its place but is `visibility: hidden` (not focusable) and the layer draws the footer again after the
  phone: header, pill, phone, footer. One app at a time: a box 1 px wide from 1024 px and 0 under it (`resize`) sets
  `wide`; the kept frame loads only when wide, the page's own only when not, and crossing 1024 px sends the other back
  to about:blank (measured: 1440 → 900 → 1440 leaves one `/demos/app/` frame each time). With D16's activation on
  intent: `/articles` (no runtime) → Demos is a document navigation and `/demos` loads cold, lazily as before; after
  activation, `/demos` → `/articles` → `/demos` finds the kept frame live (opacity 1 at 150 ms, no load).

## D18. Navigating the framed Demos app: what the embedding costs, and fixes on both sides (owner, 2026-11-23)

The owner: "test the navigation on /demos and make it as fast and effective as possible"; "frames still drop a lot when
navigating the app from the site". Measured with `tools/parity/sim-frames.ts` (headed Chrome, real vsync: rAF intervals
inside the app's own renderer process and the page's, per interaction; site vs the app alone at the top) and
`tools/parity/composable-text.ts`; numbers in perf.md "Navigating the sim".

- **The embedding's costs, removed.** From 1024 px the frame was clipped by a rounded `clip-path` and its column masked by
  an SVG of the iPhone's silhouette; 768-1023 px stacked three gradient masks (two wrappers and the sides). A mask or a
  rounded clip over an out-of-process frame makes the compositor draw the whole frame into a render pass and mask it,
  every frame the app draws. Now: the frame is clipped to the display's plain rectangle (still a clip path, so the
  wheel over the bezel stays the page's) and the app's own bezel draws the corners; the silhouette mask is dropped (the
  still under the frame is transparent around the phone, so nothing showed through it); 768-1023 px fades the stage
  with two overlays painted in the page's colour (`sim-sides::before/::after`), no mask. The spotlight and the contact
  shadow are static layers, never over the frame's area.
- **The bezel is concentric** (owner: "the border around the sim must ALWAYS be equidistant from the mockup"). The app's
  rim and black glass were circular (`corner-shape` round, 74 / 70 pt) around a continuous 62 pt display, so the
  bezel thickened at the corners (up to 5.9 px more at 3x). Rim and glass are now the display's outline offset along
  its normals (`.site/tools/demos-web/air-frame-paths.ts` (a site tool, outside the Demos app's capture), polygons under 0.02 pt from the true offset, used as clip
  paths in `home/web-phone.contract`; the drop shadow is its own box 6 pt inside). Sampled along the normals at 0-90°
  of each corner and on the edges at 3x: max deviation 0.3 px at 1440x900, 0.4 px at 1728x960 (was 5.5 / 5.9 px).
  The launcher still is re-shot from it. In the site's frame the app now draws only its display (in a sandboxed frame
  its stage, rim, glass and shadow are transparent, isolation.md §6), so the still's phone shows around the display
  rectangle with no lighter corner and no step where the clip meets the rim, at any scale or DPR.
- **The status bar follows the flight** (owner: "this bar stutters badly when it animates"). The framed phone's status
  bar and home indicator took the demo's ink at the route's change: on a light demo the bar turned black in the tap's
  first frame, over the launcher, while the card was still an icon, and turned white again only when the close had
  landed (a 255-of-255 jump in one frame, both ways; `tools/parity/sim-statusbar.ts`). Each is now drawn in both inks
  (`home/web-phone.contract` WebStatusBar) and cross-faded by opacity in the flight's own keyframes as the card covers
  the bar (35-95 % of its width), on the compositor: at most 62-67 of 255 per frame, never before the card covers half
  the screen, standalone and framed. The module change is a compose-time patch of the artifact's `modules/index.js`
  (`tools/demos-web/patches.ts`); the Demos app's `modules/web/index.js` stays as on main.
- **No dark rectangle around the phone** (owner: "what is this black area around the sim", outside the rim). The
  launcher still had the app's drop shadow baked in, cut at the still's edge: a darker rectangle, 18 px past the rim,
  with a 5-level step where it ended (sampled along a row at 1440, DPR 2). The still is shot without it
  (`tools/sim-still.ts`), and the page's own soft shadow under the device is a little lighter (.42 / .28): the page's
  gradient now runs right up to the rim (19-20 levels, no step).
- **Glass buttons.** The web stand-in for iOS 26's glass close / info buttons read as flat grey discs over light demos;
  now a neutral translucent tint over a blur, a specular rim lit from the top, a soft lift shadow and a white glyph
  with a hairline shadow (`home/web-chrome.contract` WebRoundButton; Exact's `backdrop-filter` takes blur and saturate
  only).
- **Composable Text "often breaks"**: the leaving letters (i, n, g of "Using Max") drew on top of each other. Cause, in
  Exact's web-js host: a region's removal calls the presence `exit()` once per leaving node, and each read its box after
  the previous sibling had already been taken out of flow, so every later sibling read the first one's place.
  Web only (iOS ghosts are native snapshots). Fixed by `tools/demos-web/patches.ts`, applied by `tools/compose.ts` to
  the artifact's `presence-glue-*.js` (each edit must match exactly once, or the compose fails): an exit with no
  reading takes its ghost out of flow at the end of the task, or before the next measure. Reported to Exact
  (`exact feedback note`); drop the patch when the pinned Exact has the fix. The patched file keeps its name (its content-named importers
  stay the build's), so compose serves it revalidated, not `immutable`. Regression check:
  `bun tools/parity/composable-text.ts <origin>` (exit 1 if leaving letters collapse; 1440 and 390 touch).
- **Miles Bar Chart's bars jumped** to the new week's heights while their colour sprang. The `week` message arrives and
  `active` changes; the cause is in Exact's web-js host: height is one of the properties its motion engine plays as
  physics, so the CSS lowering keeps only `height 0s ease 0s` for it, but motion.js tells the engine a node's height
  only for a height drag's owner, so any other `height -exact-spring()` lands in one frame (iOS springs it). Measured
  before: every bar 0 in-between frames; after: 15-30 per bar over ~0.7 s, settling on 30 + 120 × value. The same fix
  (`tools/demos-web/patches.ts`, the artifact's `motion-*.js`) also springs Clerk Toast's backdrop strip (iOS-only
  drawing, its height snapped too). No other demo has a `height` spring; width and the other non-physics properties
  spring as CSS `linear()` and were fine. Reported to Exact (`exact feedback note`). Regression check:
  `bun tools/parity/height-spring.ts <origin>` (exit 1 on a snap; 390 touch and 1440 mouse).
- **The frame loads 600 ms in** (it waited for the hero's 1.6 s entrances): its start is in its own process, so it never
  competed with them on the page's main thread; live 1.0-1.3 s sooner on cable and 4g (perf.md).
- **The sandbox costs the frame its HTTP cache.** Measured: a repeat visit to `/demos` re-downloads every file of the
  app, the content-hashed `immutable` ones included (144 requests, ~5 MB on cable), because a frame with an opaque
  origin gets a transient cache partition; the same files at the top level come from the cache. Kept anyway: the
  frame's own renderer process is what keeps the app's start and its frames off the page's main thread (D12), and the
  owner's first ask is smooth navigation inside it; on a desktop the kept frame (D17) means one load per tab, not per
  visit. The fix for both is to serve the app from its own site (another registrable domain: its own process without
  a sandbox, and a cache), a deployment decision for the owner. A service worker cannot help (an opaque-origin frame is
  never controlled by one), nor can a prefetch from the page (another partition).

## D19. The framed app says it is live: a one-time touch demo (owner, 2026-11-23)

The owner: "add a way to make people understand they can interact with the sim; right now it almost looks like an
image" (a caption was rejected, D17 revised). Variants considered:

- **(a) chosen: a touch demo.** Once per session (`sessionStorage` `reactiive.demos.hint`), 1.2 s after the framed app
  has drawn, an iOS-style touch indicator (a soft grey disc with a light rim, 44 px) rises onto Composable Text's icon
  and taps it (the app opens it), taps its pill ("Use Max" morphs to "Using Max"), then taps close; ~5 s. Any pointer,
  wheel or key on the page, or the first real input inside the app, stops it at once (the disc fades in 200 ms; the
  app is closed again if the demo had opened, so the kept frame never carries it around the site); leaving `/demos`
  (a link, Back: `popstate`, `pagehide`, the Navigation API's `navigate`) stops it the same way, and each step checks
  that the page is still `/demos` with the frame visible. Skipped under 768 px (no frame, D20), with reduced motion,
  Save-Data, or a hidden tab; on other pages it does not poll (it waits again on a route change to `/demos`, 30 s at
  most per visit). It never blocks: the disc takes no pointer. Checked in headed and headless Chrome at 1440x900: the
  disc rises on the icon at ~1.2 s after live, Composable Text opens, "Use Max" becomes "Using Max", the app closes,
  the disc fades (about 5 s); a wheel mid-demo stops it and the app is back on the launcher; Back mid-demo returns to the page before
  `/demos`, with the disc gone; a site link at any moment of it leaves the app on its launcher. The demo's open and
  close never add a history entry (the app replaces them when its parent asks, isolation.md §6), so a full demo
  leaves the history as it found it and Forward never reopens the demo.
- **(b) the launcher pages once by itself**: rejected; a page that moves without the reader reads as a glitch, and a
  synthetic drag through the app's pager is fragile.
- **(c) a touch-circle cursor and icon lift on hover**: not possible from the site: the cursor and hover over an
  out-of-process frame belong to the framed document, and doing it there changes the app for every web reader.

How it drives the app without coupling: `web/sim-hint.js` (a head script) only posts messages; the app (when framed,
`modules/web/index.js`, web only, guarded by `window.parent !== window` and `event.source === parent`) answers
`{ demos: 'rect', target }` with that testId's box and performs `{ demos: 'press', target }` as a tap, and tells the
parent `{ demos: 'input' }` on real input. Nothing else is read or answered; the bridge's guards (parent window, allowed
origins) are in isolation.md §6.

## D20. /demos on a phone: the app full screen, not framed in the page (owner, 2026-11-23)

The owner: "handle the mobile view perfectly … an iframe inside a scrolling page fights the page scroll and looks
cramped". Under 768 px the page shows the hero as live, then an "Open the demos" pill button (light, 52 px, a grid
glyph) and, under it, the launcher's still in its iPhone as a tappable preview; both go to `/demos/app/`, the app full
screen (its own manifest is `standalone`; the head adds the Apple web-app tags; safe areas from its viewport's
`viewport-fit=cover`). The way back is the browser's (a plain link, so Back returns to `/demos`). The links are
prerendered on press (the speculation rules' `moderate` rule for `/demos/app/*`, only these links exist under 768 px),
so the app's downloads start before the tap ends. No frame loads under 768 px at all (the page's frame is
`display:none`, so never near, never `ready`). **Tablets (768-1023 px) keep the framed phone** (D10): there the phone
fits beside nothing and the stage has room; it looked right at 768x1024 and 1023x768, and the page's scroll is the
margins'. Checked with touch at 390x844, 360x780 and 430x932: no frame in the page; the hero, then the button
(centred, 52 px, at y ≈ 333 px, inside the first viewport) and the still under it; a tap opens `/demos/app/` full
screen (the launcher, edge to edge); a tap on an icon opens the demo, close returns to the launcher, Back returns to
`/demos` with the hero as it was.

## D21. A demo post is /demos, whose phone opens that demo by itself (owner, 2026-11-24; amends D5)

**Amended by D25**: the post is its article, not the /demos hero; the deep link (`goto`) stays, from 1024 px.

The owner: "with the link demos/<slug> I'd like the same screen to open, and the phone to page automatically to the
launcher page that has it and open the animation". So the 109 posts whose demo the app has are no longer 308s into
`/demos/app/demo/<slug>`; each is a page of its own.

- **A real page, not a redirect.** The site's route `demoPost "/demos/:demo" render=build pages=demoPostSlugs()` renders
  the same `DemosPage` as `/demos`, prerendered per post (`dist/demos/<slug>/index.html`), so the URL stays
  `/demos/<slug>`. Its head is the live post's (title `<post title> | Reactiive`, keywords, `og:type` article,
  `article:published_time` and tags, the NewsArticle JSON-LD) with two deliberate differences: the description is the
  post's first paragraph of prose (live showed the site's generic one), and the share image is the `/demos` card (live's
  `/demos/og-image/<slug>` answers 404). The canonical is the post itself (it is indexed under that URL, and the title
  differs from `/demos`). The posts join the sitemap (monthly, 0.4, their dates). `tools/parity/head-diff.ts` compares
  each post against live after rewriting live's head to those two values only; the sitemap accepts the 109 extra URLs
  by name. The list: `tools/demos-web/legacy-posts.ts` `DEMO_POSTS` (the 126 posts less `NOT_IN_APP`, aliases applied);
  `tools/compose.ts` fails if a post's demo is not in the app's `demos.contract` or a `NOT_IN_APP` one is. The 17
  without a demo stay a 307 to `/demos`. `/demos/app/demo/<slug>` (the app's own route) is unchanged.
  The client router: `/demos/:demo` would match `/demos/app`, but the site links only `/demos/app/` (a path with a
  trailing slash matches no route, so it still leaves the runtime) and compose refuses any other site route or built
  page under `/demos/`.
- **From 768 px (the framed phone).** `web/sim-goto.js` waits for the visible frame to be live (the app has drawn and
  faded in over the still) plus 300 ms, then posts `{ demos: 'goto', slug, still }`; the deep link costs the frame's
  first paint nothing. The bridge (`tools/demos-web/bridge.js`, the site's code in the artifact's HTML) does the rest
  inside the app: it waits for the launcher's pager to be driven, finds the icon's page from the launcher's real
  layout (the icon's box against the pager's, so a reorder or a new page size needs nothing), pages there one swipe at
  a time through the pager's own input path (trackpad-style wheel deltas that grow, then decay the way the pager reads
  as fingers lifting, so it releases at once with a flick's speed and settles on its own paging spring, as a reader's
  swipe does), waits for the pager to rest, and presses the icon (the app's own open flight). The last page (3 pages
  over) takes about 1 s of paging. Reduced motion: the pages jump (the pager's arrow keys, which jump under reduced
  motion) and the app opens without its flight (its own rule).
- **History: the open replaces.** The goto's open is a parent's press, so it replaces the frame's entry (D19's rule):
  the URL stays `/demos/<slug>` and the reader's Back leaves the page for wherever they came from, as for any link.
  A pushed entry was rejected: an entry the reader did not make is a Back trap, Chrome skips entries added without a
  user activation on Back anyway, and the open demo is what the URL names.
- **In-site navigation, the kept frame alive (D17).** To `/demos/<slug>`: the goto runs in the live frame, no reload
  (a demo already open closes first; the same demo is left open). To `/demos` (a link or Back from the post): the demo
  the goto opened closes (`{ demos: 'goto', slug: '' }`), so `/demos` always shows the launcher it promises. Elsewhere:
  a sequence under way stops, and the demo stays open for a return to its post (the frame is hidden there).
- **Robustness.** An icon not on the launcher (the four demos the web launcher hides as unstable: grid-visualizer,
  ios-home-bouncy, shared-transitions, time-machine) leaves the launcher as it is (`missing`). Any pointer, wheel or
  key on the page, or real input in the app, stops the rest. The touch demo and the arrow (D19, `web/sim-hint.js`) are
  for a reader who has not found the phone: a deep link marks both seen for the session. `web/sim-hint.js`'s frame host
  counts a post as `/demos` (`current`), so the frame's history rules hold there too.
- **Phones (under 768 px).** The same hero; the button reads "Open the demo" and, like the still under it, opens
  `/demos/app/demo/<slug>`: one tap to the demo full screen (the app's close then shows its launcher; Back returns to
  the post). An automatic open was rejected: leaving the page the reader landed on without a gesture is hostile to
  them and to Back (the post would redirect again), and paging a full-screen launcher before the demo only delays
  what they came for. A launcher deep link (`/demos/app/` that pages, then opens) was rejected for the same delay.
- **Checked** by `tools/parity/sim-goto.ts` (three posts on the first, a middle and the last launcher page, cold, with
  frame timing against the same paging and open by hand; Back; in-site with the kept frame; input; reduced motion;
  a phone; a missing icon) and `tools/parity/links.ts` (every internal URL of the composed site, the 126 legacy posts
  and the other redirects), with `sim-history.ts` and `head-diff.ts` re-run. Frame timing, headed Chrome at 120 Hz
  (rAF in the app's own process, medians of 3 cold runs, the hand's paging by the app's arrow keys and its open by a
  click at the same moment after live): paging dropped **0** frames on every deep link (posts on launcher pages 1, 2
  and 4); the open dropped 40 / 14 / 27 against 49 / 9 / 23 by hand: the cost of a cold demo's first mount (10-50
  frames either way, run to run), not of the deep link. Head-diff: 150 routes ok against live (109 posts with the two
  rewrites above); links: 360 internal URLs 200, 261 legacy URLs as specified.

## D22. An arrow to the phone; Sponsor in the pill; TestFlight, quietly (owner, 2026-11-24)

**The arrow** ("as soon as one lands on /demos, a pretty animated arrow toward the sim, as if to invite interacting
with it"; no words, D17). `web/sim-hint.js`, before the touch demo (D19), on **every arrival** at `/demos` (a load, a
reload, in-site navigation back to it; owner, later the same day: "the arrow must appear in every session", which
replaced a once-per-session gate), from 768 px, on `/demos` only (a demo post, `/demos/<slug>`, never shows it).
The touch demo after it stays once per session. Each arrival is its own visit: a callback of an earlier one (a quick
back-and-forth) does nothing, leaving `/demos` cancels an arrow under way (200 ms fade), and listeners are added once
per visit and removed with it. Skipped when the reader is already at the phone: the app reported input in the last
3 s, or the pointer was last seen within 40 px of the phone. The measuring tools turn it off for their session
(`sessionStorage` `reactiive.demos.arrow` = `off`); `tools/parity/sim-arrow.ts` tests it with the arrow on (a load, a
reload, /demos → Articles → the Demos link, Back and Forward, leaving mid-arrow, a rapid back-and-forth, listeners
after 20 round trips, a demo post, a phone). A return by the header's link can be a traverse whose `navigate` and
`popstate` fire after the new visit has armed: those stop it only when their destination (or the address after the
popstate) is not `/demos`:

- **When.** Once the visible frame is live and the hero's entrance (live's motion: title, subtitle, pill, device) has
  ended (its finite animations' `finished`, at most 3 s): about 2.4 s after a load. The header and the entrance are
  untouched.
- **What.** One hand-drawn swoop (an SVG cubic that dips under the line, then rises into the phone; 1.75 px, a white
  gradient 18 % at the tail to 85 % at the head; two 11 px head strokes at ±29°) from the pill's end to 20 px off the
  phone's bezel at 44 % of the screen's height (from 1024 px; under the subtitle's end, never across it; a gap under
  160 px starts under the pill's end and rises gently), or from the pill's end down to the phone's top (768-1023 px).
  The line draws on (stroke-dashoffset, 950 ms, `cubic-bezier(.6,0,.2,1)`: it lands slowly at the phone), the head
  follows (200 ms strong ease-out), it nudges 5 px toward the phone twice (2 x 1.2 s ease-in-out, transform only),
  then eases 8 px into it while fading (450 ms); ~4 s. Then the touch demo starts (350 ms later): the arrow says
  where, the demo says how. Sequenced, not merged: two cues at once compete for the eye.
- **Dismissed** at once (a 200 ms fade, held where it is) by any pointer, wheel or key, the app's own input, leaving
  `/demos`, a resize, or the pointer within 40 px of the phone (the frame is another process: the page sees no move on
  the screen itself, so the bezel's surroundings count); any of these also skips the touch demo (the reader has found
  the phone). Reduced motion: the same arrow, still, faded in (400 ms), held, faded out; no touch demo (D19).
  Save-Data: the arrow (it costs no bytes), no touch demo.
- **Never in the way.** An absolutely placed `svg` (`pointer-events: none`, `aria-hidden`), no layout: CLS 0, no long
  task while it plays, clicks into the sim unchanged (the frame stays the hit target). Only the line's draw paints
  (a ~400 px path for 950 ms); the rest is compositor work.
- **Phones (under 768 px): nothing.** The hero's next element is already the primary "Open the demos" button, the
  page's one action; an arrow toward it would be noise.
- Variants recorded (headless Chrome, 1440x900, 1024x768, 820x1180, frames every 50 ms): (a) **the swoop, chosen**;
  (b) the swoop with a hand-drawn curl before the phone: charming, but a notebook doodle next to Apple-grade type, and
  at 1024 px it crossed the subtitle; (c) a light running the line (a bright 30 % dash over a faint full line): its
  hard dash ends read as a glitch.

**Sponsor and TestFlight** (owner: a GitHub Sponsor button and a small TestFlight button, without too many buttons).
Variants mocked at 1440, 1024 and 390: (a) Sponsor in the pill, TestFlight a ghost pill under it: two stacked pills,
and on a phone a second TestFlight next to "Open the demos"; (b) **chosen**: Sponsor as the pill's third segment, and
TestFlight a quiet grey link under the pill; (c) Sponsor and TestFlight as two more pills in the pill's row: wrapped
under the phone at 1024 px.

- **The pill** stays one visual pill with two hit areas: the repository and its stars, then Octicon heart-fill in
  GitHub's sponsor pink (`#db61a2`) and "Sponsor" (`https://github.com/sponsors/enzomanuelmangano`, its own
  aria-label). Each lights its own part on hover (+3 % white over the pill's 6 %, about live's 9 %, 200 ms).
- **TestFlight**: "Try it on iPhone" (13 px, 50 % white, 80 % on hover), a phone glyph and a drawn north-east arrow (a
  typed U+2197 is outside the preloaded ASCII face and fetched the full Inter: a 1e-5 CLS). One element at every
  width: on a phone it sits right above "Open the demos" and installs directly. From 1024 px with a mouse, hover or
  focus shows the TestFlight QR code under it (112 px on a dark card; 200 ms strong ease-out in from 96 % at its
  corner, 150 ms out): a desktop reader cannot install TestFlight there, a phone can scan it. The URL is one function,
  `pages/demos-app.contract` `testFlightUrl()`, used by both pages.
- The arrow starts from the pill's last segment, so it never crosses Sponsor; the link sits under the pill's start.
  The desktop hero still fits without scroll (1440x900, and D17's short-window matrix).

### D22 follow-ups (owner, 2026-11-24)

- **The title is not pressable.** "Demos" was live's spiral toggle (a press turned the spiral). Now no handler, no
  pointer cursor, no hover dim, no focus stop; still an `h1` with live's look and `motion-title-in`. The spiral turns on
  its own only (the app's `spiralTaps` and `spiralTap` are gone).
- **The s of "Demos" was cut.** The title's gradient is `background-clip: text`, painted only inside the box, and the
  -0.04em tracking ends the box before the s's ink: measured at rest, the gradient's ink stopped exactly at the box
  while the glyph's own ink went 1 px (1024, 1440) to 2 px (1180) further: a hard vertical edge, at widths where the
  fraction rounds badly (hence "often"). Not the font load (the face is preloaded, `font-display: block`) and not the
  entrance (it leaves no clip). Fixed with `padding-right: 0.1em; margin-right: -0.1em`: the ink is whole, and nothing
  moves (pixel diff at rest against before). /demos's subtitle is the only other gradient text on the site.
- **The pill's stars and the heart.** Live's FloatingStars (the port is line for line) bursts 28 stars on hover and
  then fountains ~50 a second at up to 8.5 px, full white; the owner: "the stars are extreme... when I highlight the
  heart I want the heart to animate, not the stars". So: only the repository part lifts stars, and a lighter hover (6
  to start, ~14 a second, 2.5-5 px, at most 85 %, a narrow fan); idle as live. From 1024 px the stars dissolve over 38
  px (they were cut at 26 px). Sponsor's heart beats once per hover or keyboard focus (scale 1, 1.18, 0.96, 1.08, 1 in
  600 ms, transform only) and its pink warms (#db61a2 to #f27bbd, 200 ms); reduced motion, the colour only.

## D23. /demos's subtitle names what it is built with now (owner, 2026-11-24)

The /demos hero subtitle read live's "120+ React Native animations / with Skia, Reanimated and Gesture Handler"; the
demos on this site run on Exact, Rust and WebGPU. Owner's copy, exactly: "100+ animations" (first line) and "built with
Exact, Rust and WebGPU" (second line). Same two lines from 640 px, the same gradient across both and the same entrance
(`blur-in` 450 ms, `lift-10`). Under 640 px the paragraph (left-aligned, 320 px at most, 14 px) breaks at the same place:
wrapped as one text it left "WebGPU" alone on the second line at 390 px, so it is now the same two lines in one
gradient. Measured on the composed build: each line one line at 1440, 1180, 1024, 820 and 390; /demos at 1440x900 is
900 px tall (no vertical scroll), no sideways overflow anywhere. The /demos/<slug> posts render the same hero.

- **Head.** /demos's description, og:description and twitter:description (and the /demos/app/ shell's, `tools/demos-web/head.ts`)
  are now "100+ animations built with Exact, Rust and WebGPU, running live in the browser." (`DEMOS_DESCRIPTION`,
  `tools/seo/site.ts`; the runtime `head` in `app.contract` says the same). The demo posts keep their own first
  paragraph (D21). Articles, the course and other pages are unchanged.
- **Parity.** A deliberate difference from live: `tools/parity/head-diff.ts` rewrites live's three /demos description
  tags to `DEMOS_DESCRIPTION` before the diff (as it does for the posts, D21), so any other difference still fails.
- **/demos-app and the share card (same day; owner: the TestFlight app will be the Exact one).** /demos-app's text reads
  "Get access to 100+ animations built with Exact, Rust and WebGPU on your phone. ..." and its description (og, twitter
  and the card's alt, which is the description) "Get 100+ animations built with Exact, Rust and WebGPU on your iPhone
  through the TestFlight beta." (`DEMOS_APP_DESCRIPTION`). The /demos card's alt (/demos and the /demos/app/ shell) is
  "Demos: 100+ animations built with Exact, Rust and WebGPU", not live's "Exclusive weekly React Native animations
  source code.". The TestFlight link, its QR and "Try it on iPhone" (aria-label "Try the Demos app on iPhone with
  TestFlight") are unchanged. head-diff rewrites live's description tags and og:image:alt on both pages to ours.

- **The other demos copy (same day).** The home page's Demos row reads "100+ animations in Exact, Rust and WebGPU." ("built
  with" made it 346 px, one line too long at 390 px; this is 297 px, one line like live's at 390 and 1440), and the
  support page "All 100+ animations, built with Exact, Rust and WebGPU, are now free and open source! ...".

## D24. The framed app always lays out as an iPhone Air; pages preload only their own content (2026-11-24)

**The tablet launcher in the phone.** From 768 px (and 1024 px+ too) the frame showed the app's full-screen *tablet*
launcher (5 columns, no status bar) cut by the page's phone outline, and an opened demo's close button (x = 16 px in the
frame) fell in the clipped strip. Cause: the app frames itself (`framed`, app.contract) only for
`web and host.pointer == "fine" and host.width >= 600`; its pointer is `(pointer: coarse)` (Exact's
`navigation/environment.js`), so a touch tablet (an iPad without a trackpad, 768-1032 px) or a browser emulating one got
the unframed layout filling the 600 px window. Width was never the trigger (the frame is 600 px at every page width).
Reproduced in Chrome with `--blink-settings=primaryPointerType=2,primaryHoverType=1` at 800x900 and 1024x900.

- **The fix: the site's frame always frames** (`tools/demos-web/bridge.js`): in the sandboxed frame only,
  `matchMedia('(pointer: coarse)')` and `('(pointer: none)')` answer no, so the app draws its iPhone Air for every
  reader; the host's input mode (`data-exact-input`) is set from the real query first, so a finger stays a finger;
  `(pointer: fine)` (the site keyboard's gate), every other query and the app's CSS are the browser's. The Demos app's
  sources are untouched. With a coarse pointer at 768/800/900/1023 x900, 1024x900, 1180x820, 1440x900, 800x600,
  1023x640, 1024x640 and 800x500: framed every time, an opened demo's close button inside the display.
- **Tried and dropped: a fixed 600 x 984 window scaled by a CSS transform.** It made the app's layout independent of
  the page's size, but it blurred the app on every desktop (Laplacian sharpness at DPR 2 59.6 to 38.5, at DPR 3 47.1 to
  21.7, independent review): the app's own `scale` rasterizes at the final size, a transform on the frame does not.
  The frame keeps its real size; the pointer was the only cause.
- **Short windows (768-1023 px).** The frame was at least 600 px tall, so under about 690 px of height the phone was
  taller than the window under the 87 px sticky header, and its top (a demo's close button) stayed under the header
  however the page was scrolled. Now `--fh = clamp(320px, 100vh - 87px, 1080px)` (`web/head.css`, the contract's
  height, the still's size): the phone always fits under the header (at 800x600 the frame is 513 px, its close button
  at y 148 with the frame scrolled to the header).

**Preloads.** Exact's entry prepares every chunk its page's head does not preload (`host/web-js/build.mjs`,
`__EXACT_DEFERRED_CHUNKS__`: a low-priority `modulepreload` each, appended to `document.head` as it starts), so every
page fetched all 22 articles' bodies, 3 docs' and the cards module (26 scripts) whether it links to them or not; Safari
warns of each. `tools/preloads.ts` (in `bun run build`) writes `web/preloads.js` first into every page's head with this
build's content chunk names: the entry's `head.append` of those links is held unless the chunk is the page's own
(`/articles/<slug>`, `/docs/<slug>`, the cards on `/articles` and `/series/<s>`). Once the page has loaded and is idle
(`requestIdleCallback`, a timeout in Safari) the chunks of the pages it links to are fetched at low priority, so a tap or
a click with no hover before it finds its chunk as before (holding them until intent alone made a tap 210 ms against
45 ms, review); a link about to be followed (pointer over, focus, touch or press) fetches its chunk at once if not yet.
Exact's own pieces are left as Exact prepares them. The build fails if the entry stops appending its modulepreloads that
way or a content module has no chunk of its own. Numbers: docs/perf.md "2026-11-24, preloads".

## D25. The articles come back; "Read article" in the phone (owner, 2026-11-26; supersedes D13, amends D5 and D21)

The owner: "I was wrong to say they were no longer needed and I do not want to lose the Google ranking ... a right click
on a demo in the sim, Read article, takes me to the demo's code, the whole article under it and the animation I can
interact with."

**Content.** All 126 `/demos/<slug>` and the four skipped `/articles` pages are static prerendered pages with live's
content; `/series/thoughts` and `/series/engineering` come back with them. The MDX under `.content/` stays the source
(`tools/gen-content.ts`, at build): the demo posts' `Demo` (live's R2 video, QR code to `app.reactiive.io`, libraries,
source), `ReanimatePromo`, `GitHubRepoButtons` and `SendFeedback` are `components/demo-post.contract`. The code shown
is live's React Native code. `tools/parity/post-content.ts` checks every heading, paragraph, list item, code block,
link, picture and video of live's `<main>` is in ours, without a script: 130 of 130.

**Head.** Live's to the letter: the site's description, `/demos/og-image/<slug>`, the NewsArticle JSON-LD. D21's two
differences are gone and head-diff rewrites nothing for them. Live's og image answers 404; ours answers with the
`/demos` card (a rewrite, `tools/compose.ts`). The sitemap lists all 126 (live lists none: its `/demos` grid linked
them, ours has no grid).

**Where it differs from live.**
- The links to `src/animations/<name>` ("View source", the GitHub cards) answer 404 on GitHub; ours point at
  `.legacy/src/animations/` (renamed folders mapped; `inner-shared-transition` has none: the parent folder). Moving
  `.legacy/` again must move these (`gen-content.ts` `legacySource`).
- New: "Exact source on GitHub" (`demos/<app>/`) beside "View source"; "Try the live demo" under 1024 px.
- "Ask for support" and "Send feedback" are mail links (live's modals led to the same address or needed the API).
- The video does not open full screen on a click.
- `/profile` and `/manage-subscription` signed out are a 200 page that sends to `/demos` in the page (live: 200 and a
  client-side redirect), no longer a 307.

**Layout.** The article is the article page's 768 px column. From 1024 px, a post whose demo the app has shows
`/demos`'s kept frame (D17) fixed beside the column (`--ph` = the window less 136 px, 320-780 px): the same live app,
no reload between `/demos` and posts, and the goto of D21 opens the demo in it. Under 1024 px (phones and tablets) no
frame: "Try the live demo" under the title opens `/demos/app/demo/<app>`. The 17 posts without a demo are the article
alone. `/demos` is unchanged.

**Speed.** The post activates on interaction (D16); `web/reveal.js` starts the runtime, which frames the app, only on
a post with a phone from 1024 px, after the page's load and when idle. The phone behind the frame is a vector
(`components/phone-bezel.contract`), not `/demos`'s still, which became the page's largest paint; the video's box is
its own shape, so it does not either. The posts' content chunks (`demo-<slug>`) are held back to their own pages (D24).

**Read article.** Only the framed copy has it (isolation.md §6): the app's list of readable demos and the bridge are
inlined by `tools/compose.ts`; the icons' menu gets the item by an exact-match patch of `modules/index.js`
(`tools/demos-web/patches.ts`); a search result (right click, long press) and an open demo (right click only: a long
press there belongs to the demo) get a menu drawn by the bridge with the same look. The app posts
`{ demos: 'read', slug }` to the page's origin; `web/sim-goto.js` hears only a visible Demos frame and clicks a link, so
the router navigates in place (one entry, the article's top, Back returns). A demo the reader opened is left open.
Checked by `tools/parity/sim-read.ts`. All 109 demos of the app have a post today; one without would show no item.

## D26. No new subscriptions: sponsor on GitHub; a subscriber can only see the plan and cancel it (owner, 2026-11-26)

Supersedes the subscription parts of D15 and of the owner's 2026-11-23 "status and cancel only".

- **Without a plan** (no `plan` in `/api/user/info`): `/profile` shows "Support Demos" with "Sponsor on GitHub"
  (github.com/sponsors/enzomanuelmangano, /demos's Sponsor heart) where the SubscriptionBox's no-plan face was; the
  avatar menu's "Support Demos" is "Sponsor on GitHub", the same external link; `/manage-subscription` redirects to
  `/profile`. The sponsor box waits while the user's info is being asked, so a subscriber never sees it. (Phones have no
  avatar menu: the box on `/profile` is their way to it.)
- **With a plan, any status**: the SubscriptionBox (a plan neither active nor cancelled keeps its name and says its
  payment failed, it is paused, on trial or no longer active, with no date), "Manage Support", and `/manage-subscription` as "Your
  subscription": the plan's card, "Cancel Plan" for every status that can still bill (`active`, `past_due`, `unpaid`,
  `on_trial`, `paused`/`pause`; not `cancelled` or `expired`: anyone subscribed can unsubscribe), the warning saying so.
  The confirmation promises access until a date only for `active` and `on_trial`. The reference's cancel route filters
  no status; it also ignores Lemon Squeezy's error answer (the SDK does not throw), so it says success even when the
  cancel was refused, and the page then shows the unchanged status. Removed there: the "All 100+ animations" paragraph, "Review Billing Details" (checkout.reactiive.io), the
  refund sentence of the cancelled banner (now a GitHub Sponsors link) and Plan Benefits (it advertised access that
  is bought).
- The only purchase endpoint any code calls stays `cancel-subscription`. Signed out: unchanged.
- `tools/local-env/account-parity.ts`: these screens differ from live on purpose and are checked by their text.

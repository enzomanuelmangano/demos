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

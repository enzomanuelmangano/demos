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

## D8. The header's scrolled look: an intersection marker, not a scroll handler

The bar takes the page colour and a hairline past 10 px of scroll. A scroll-driven CSS animation was emitted but
ran with a 0 s duration under Exact's timeline handling, and `scroll=` on `scroll document` did not fire for the
document's scroll; a 10 px marker at the top of the page with `intersect=` flips `scrolled` once per crossing (no
work per scroll event), and the bar's own 300 ms transition times it, as the reference's.

## D9. Responsive layout without a runtime

Built pages must fit 390 and 1440 before any script runs, so a breakpoint is a CSS `clamp()` against `100vw`
(`components/responsive.contract`: `sm`, `md`, `lg`), the technique of Exact's docs site. A part that exists only
on one side (the desktop and mobile header bars) is clipped to zero height on the other.

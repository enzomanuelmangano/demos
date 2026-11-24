# Isolation: the Demos app pays nothing for the site, neither pays for `.legacy/`

Measured 2026-11-23 on branch `site` (first site commit `ea66df8d`, on `origin/main` `240aa4cf`). Every number can be
re-run with the commands shown; the tools are in `tools/isolation/`.

## 1. The Demos app's build captures the same files, and builds the same app

`tools/isolation/capture.ts` re-implements Exact's source capture (`js/bake/src/lib.rs` `sources()`, the same at the
demos' seed `c193f394` and the site's `2180d806`).

| tree | captured files | bytes |
|---|---|---|
| `git archive 240aa4cf` (before the site) | 481 | 21,466,992 (20.47 MiB) |
| `git archive ea66df8d` (with `.site/`) | 481 | 21,466,992 |
| the worktree with `.site/` built (its `dist/`, `node_modules/`, `.out/`, `.vercel/` present) | 481 | 21,466,992 |

The `--list` outputs of the first two are byte-identical (`cmp`); no captured path starts with `.site` or `.legacy`.
(The plan's 480 / 20.06 MiB was measured on another branch; 240aa4cf has `gpu/` at 2.00 MiB.)

The real build, not a re-implementation: the Demos web build (`bun exact.mjs web-build --out dist --render js`, base
`/`) made at the worktree root with `.site/` present, against the same build of a `git archive 240aa4cf` (no `.site`):
785 files each; **783 identical**. The 2 that differ (`navigation.js`, `grant-admission.js`) differ only in the bundler's
`//#region <path>` comments, which spell the Exact checkout relative to the build directory (`/tmp/…` vs the worktree),
and `.exact-build.json` records those two hashes. `app.js`, `app.plan`, the wasm and every asset are identical.
Re-run: `bun tools/isolation/digest.ts <dist> --skip .gen --list` on both and diff.

The demos artifact's cache key (`bun tools/demos-web/build.ts --key-only`) is `5fcec3d0…` at both `240aa4cf` and
`ea66df8d`: a site-only commit reuses the cached `/demos/` build.

## 2. Installs and lockfiles are separate

| step | result |
|---|---|
| root `bun install --frozen-lockfile` (worktree with `.site/node_modules` present) | root `bun.lock` md5 `ffc3b799…` unchanged; `.site/bun.lock` and `.site/node_modules` unchanged; root `node_modules` = `@exact demos-gpu-images pressto` only |
| `.site` `bun install --frozen-lockfile` in a `git archive` with no root `node_modules` | succeeds (5 packages, its own `bun.lock`); no root `node_modules` created; root `bun.lock` unchanged |
| root `package.json` workspaces | `packages/*` only (unchanged); `.site/package.json` is not a member |
| tsconfig | root `tsconfig.json` includes `tools/**` only; `.site/tsconfig.json` includes `.site/tools/**` only |

## 3. No watcher crosses

Both dev loops at once (`bun exact.mjs web --port 5351` at the root, `--port 5352` in `.site`), counting `edit →` lines:

| edit | root loop | site loop |
|---|---|---|
| append a line to `.site/app.contract`, then revert | 0 rebuilds | rebuilt each time |
| append a line to `home/web-phone.contract`, then revert | rebuilt | 0 rebuilds |

## 4. CI triggers are disjoint

`bun tools/isolation/ci-paths.ts` evaluates every workflow's `paths` by GitHub's rules (ordered, last match wins):

| change | pull_request triggers | push triggers |
|---|---|---|
| site only (`.site/**`) | site.yml, site-compose.yml | site.yml |
| site's demos-web tooling (`.site/tools/demos-web/**`) | site.yml, site-compose.yml | site.yml, site-demos-web.yml |
| demos app only (`app.contract`, `demos/**`, `gpu/**`, `app.forma`, `.cargo/**`) | exact-lint.yml | exact-lint.yml, site-demos-web.yml |
| demos web module only (`modules/web/index.js`) | exact-lint.yml | exact-lint.yml, site-demos-web.yml |
| root Exact app file only (`exact.mjs`) | exact-lint.yml | exact-lint.yml, site-demos-web.yml |
| legacy only (`.legacy/**`) | lint.yml | lint.yml |
| legacy demo registry (`tools/gen-demos.ts`'s RN inputs: `registry.ts`, `inspirations.ts`, `icon-colors.generated.ts`, `inspiration-copy.ts`, `assets/app-icons/**`) | lint.yml, exact-lint.yml | lint.yml, exact-lint.yml |
| parity tooling only (`.parity/**`) | exact-lint.yml | exact-lint.yml |
| docs only (`README.md`) | exact-lint.yml | exact-lint.yml |

`exact-lint.yml` gained one line (`'!.site/**'`); `lint.yml` is unchanged. A demos PR runs exact-lint.yml alone: no
site build, no compose, no site check (the Demos app pays nothing for the site). `site-compose.yml` composes the deploy
tree on a site PR (`.site/**` only), with the cached `/demos/` artifact for HEAD's demos inputs (built on a miss).
`site-demos-web.yml` (the artifact) builds on a push to main that changes the artifact's inputs (the paths
`tools/demos-web/build.ts` keys it by) or its own tool, which keeps main's cache warm for the site PRs; then it dry-runs
the compose-time patches (`tools/demos-web/patches.ts --dry-run`) on a copy of the new artifact, so a demos or Exact
change that makes one stale turns that post-merge run red without ever gating the demos PR. It is read-only, has no
secrets and deploys nothing. The deploy workflow stays manual; it runs on site *and* demos inputs by design (the
deployed `/demos/` embeds the demos build). None of the site's workflows runs on a pure `.legacy/` change. exact-lint.yml runs on a push to main as well as on a PR (its generated-files check must hold on
main), and on the `.legacy/` files `tools/gen-demos.ts` reads, since a change there can make `demos.contract` stale.

## 5. `.legacy/` is read by neither build

- The demos capture lists contain no `.legacy/` path (dot directories are skipped), proof 1.
- The `/demos/` artifact is built from `git archive <rev> -- . ':(exclude).site' ':(exclude).legacy' ':(exclude).parity'
  ':(exclude).github' ':(exclude,glob)**/*.md'`: those paths are not on disk in the build tree at all
  (`tools/demos-web/build.ts` asserts it).
- The site is its own app root (`.site/`): its capture cannot reach outside it, and `.site/tsconfig.json` includes only
  `.site/tools/**`.

## The `/demos/` build on a GitHub runner (review item 7)

`.github/workflows/site-demos-web.yml`, run 45159918134 on `ubuntu-latest`, cold caches: `expo/exact` checked out at the
demos' seed `c193f394`, `bun .exact-sdk/scripts/exact.mjs setup --platform web` (Rust stable + nightly, wasm32,
wasm-bindgen 0.2.130, Binaryen; Hermes is not needed for the web and is skipped), then `bun .site/tools/demos-web/build.ts`:
**success**, 6 min 11 s for the job (build step 230 s), same key `5fcec3d0…`, 787 files, 72,420,414 bytes
(local macOS build: 787 files, 72,431,653 bytes). The trees are not byte-identical across machines (the bundler's path
comments and a natively built wasm), so the artifact is keyed by its inputs, never compared by hash across builders.
The artifact is cached by key (`actions/cache`), so later runs on the same demos inputs skip the build.

## Re-verified after the rebase onto the Exact upgrade (2026-11-23, `origin/main` `a00ed9ca`, Exact 98ed61fb)

`site` rebased onto `a00ed9ca` (PR #116). Proof 1: the Demos capture of `git archive origin/main` and of `git archive
HEAD` (with `.site/`, the /demos page and the motion stylesheet) are both **481 files / 21,465,912 bytes**, `--list`
outputs byte-identical. The demos artifact key is `d2f01f0a…` at both revs (a site-only change reuses it); the
artifact, rebuilt at the new seed and base `/demos/app/` (D10), is 787 files, 60.3 MiB, in 79 s.
`tools/parity/demos-mount.ts` on the composed output: launcher, legacy deep link → `/demos/app/demo/chessboard`,
reload, Back, Forward all draw at 1440 and 390; `gpu_bg.wasm` and the shader bundle 200; 0 failed requests, 0
exceptions. CI triggers (proof 4): unchanged.

## 6. The one runtime contact: the framed app's message bridge (D19, 2026-11-24)

The site never imports or reads the Demos app; at run time the only contact is `postMessage` between `/demos` and the
sandboxed frame of `/demos/app/`, both ends small and guarded:

- **The app's end is the site's code, not the app's** (`.site/tools/demos-web/bridge.js`). `tools/compose.ts` writes it
  inline into the head of the artifact's `index.html` and `shell.html` (its copy under `/demos/app/`, never the Demos
  app's sources or its own build), a classic script that runs before the app's modules. Installed only when framed
  (`window.parent !== window`); at the top level, which is every phone (D20) and every direct visit, none of it acts:
  no listener, no style, nothing posted, no history wrapper. It accepts a message only from its parent window
  (`e.source === window.parent`) and only from the origin that serves the app itself (the site and the app are one
  deployment: production's parent is `https://reactiive.io`, a preview's is that preview, a local server's is that
  server; no other origin, no wildcard); only these verbs, by testId (`[a-z0-9-]{1,80}`): `rect` (answers that element's
  box) and `press` (a tap there); and, for a demo post's deep link (D21), `goto` (page the launcher to a slug's icon
  through the pager's own input, then press it; `slug: ''` stops, and closes the demo it opened). Answers go to that origin only, never `*`. Once the parent has spoken, real input is
  reported (`input`) so the parent stops its demo. Nothing else is read, written or answered.
- **The frame's history is the page's (joint).** Framed, the module mirrors the router's entries (each state carries
  its index) and keeps the two in step: a route a parent's `press` opens replaces the entry, and its close replaces
  back to it (never a `go(-1)`), so the reader's Back never steps through the parent's demo and a full demo leaves no
  forward entry; while the page says it is elsewhere (`{ demos: 'page', current, visible }`, posted by `web/sim-hint.js`'s frame host
  at every route change, the frame's visibility (IntersectionObserver) and the tab's), a router's `go(-n)` is made a
  replace to the target entry plus the `popstate` the router awaits, never a traversal of the page's history; on
  `/demos` the router's moves are the browser's. A `press close` while the page is elsewhere or the frame off screen
  goes home at once, and a hidden document's close lands at once (no flight: a compose-time patch of the artifact's
  `modules/index.js`, `tools/demos-web/patches.ts`, exact-match and loud, as the presence-glue fix). Checked by
  `tools/parity/sim-history.ts` (a link at five moments of the demo, Back mid-demo, a full demo then Back / Forward,
  then a reader's own open and close moving the history by one; a reader's open, a site link, Back, then close; a
  tablet's off-screen frame closed by Back).
- **In a sandboxed frame** (an opaque origin, only `/demos` frames it so) the app's desktop frame also drops its stage,
  rim, glass and shadow (a style sheet from the same bridge): the page draws the phone around the display (D18), with
  no seam. Outside a frame, unchanged.
- **The framed phone's iOS keyboard** (`.site/tools/demos-web/keyboard.js`, 2026-11-24): inlined by `tools/compose.ts`
  after the bridge, in the same composed HTML only. Acts only framed with a fine pointer (a desktop) and only for a field
  inside the drawn phone (`web-device`); a phone's full-screen `/demos/app/` keeps the OS keyboard and none of it runs.
  It stands in a `navigator.virtualKeyboard` (the rect the web host reads for `env.keyboardHeight`), draws the keys in an
  overlay over the display (built on the first focus), types with `execCommand` (real `beforeinput` / `input`) and
  lifts `data-toolbarplacement="keyboard"` bars with the keys. Reads nothing outside its frame, posts nothing. Checked
  by `tools/parity/sim-keyboard.ts`.
- **A mouse drags the framed phone's scroll views** (`.site/tools/demos-web/mouse-scroll.js`, 2026-11-24): inlined after
  the keyboard, framed only. The app's scroll views on the web are the browser's `overflow: auto` boxes, which a mouse
  never drags; this pans them as the iOS Simulator's finger does (1:1, the rubber band, UIScrollView's 0.998/ms
  deceleration, paging on mandatory snapping, no tap or selection from a drag; the wheel stays the browser's). It reads
  and writes only the frame's own scrollers and posts nothing. A compose-time patch (`tools/demos-web/patches.ts`) lets
  the app's own pans (the pages, the pull to search, a card's close) hear the lift it dispatches when a drag leaves the
  phone's screen (the frame's pointer is not captured across it). Checked by `tools/parity/mouse-scroll.ts`.
- **The site's end** (`web/sim-hint.js`, a head script): only on `/demos`, from 768 px, once per session; posts to the
  frame's window (target `*`: a sandboxed frame's origin is opaque, so no other target can name it) and reads only the
  frame's answers (`e.source === frame.contentWindow`).

Cost to the Demos app: none. Its sources and its own web build carry no bridge code; only the composed copy under
`/demos/app/` does.

## 7. Re-measured after the final review (2026-11-24, `site` vs `origin/main` `a00ed9ca`)

The review found the Demos app's capture at 482 files (+16.6 KB) against main: the bridge (+6.9 KB) in
`modules/web/index.js`, and `tools/air-frame-paths.ts` (a tool for the frame's outlines) captured as a source. Now the
bridge is `.site/tools/demos-web/bridge.js` (above), the hidden-tab close fix a compose-time patch, the tool
`.site/tools/demos-web/air-frame-paths.ts`. `tools/isolation/capture.ts --list` on `git archive origin/main` and on
`git archive HEAD`:

| tree | files | bytes |
|---|---|---|
| `origin/main` | 481 | 21,465,912 |
| `site` HEAD | 481 | 21,475,737 |

The lists differ in exactly two entries, both by the owner's request for the web desktop frame (the concentric bezel
and the glass buttons, #124): `home/web-chrome.contract` (3,600 → 4,556 bytes) and `home/web-phone.contract`
(16,174 → 25,043 bytes). They are Demos-app web sources: the app's own web build shows the same frame, and the
artifact key differs from main's (`d2f01f0a…` → `878ba5c4…`) because of them alone. Nothing else outside `.site/`
changes but the four workflow files (`git diff --stat origin/main...HEAD -- . ':(exclude).site' ':(exclude).github'`:
the two contracts only).


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
| site only (`.site/**`) | site.yml | site.yml |
| demos app only (`app.contract`, `demos/**`, `gpu/**`, `app.forma`, `.cargo/**`) | exact-lint.yml | none |
| legacy only (`.legacy/**`) | lint.yml | lint.yml |
| parity tooling only (`.parity/**`) | exact-lint.yml | none |

`exact-lint.yml` gained one line (`'!.site/**'`); `lint.yml` is unchanged. `site-demos-web.yml` (the `/demos/` artifact)
runs on its own tool's changes; the future deploy workflow runs on site *and* demos inputs by design (the deployed
`/demos/` embeds the demos build).

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

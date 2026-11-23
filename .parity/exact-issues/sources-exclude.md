# App source capture: let an app keep a sibling project in its tree (`sources.exclude`)

Status: draft, not filed. Written while moving the Demos repo to "the Exact app at the repo root, the
original React Native app beside it" (2026-11-23, exact2 c193f394; 8b98f403 behaves the same).

## What happens

The app's source capture (`js/bake/src/lib.rs`, `sources()` → `walk`) takes every `.ts`, `.js`,
`.mjs`, `.cjs`, `.json`, `.contract`, `.ttf` and `.otf` under the app directory. It skips only:

- entries named `.git`, `node_modules`, `target`, `dist` (any depth);
- dot directories (any depth);
- at the root, `dist-windows` and `dist.<beside>`; `*.test.contract`; the root `app.contract.d.ts`;
- `modules/**/*.xcframework`;
- the `host.{ios,macos}.resources` trees (by inode) and `typescript.sources` mounts.

Nothing else: no `.gitignore`, no `.exactignore`, no manifest key, and a nested `package.json`,
`app.json` or `Cargo.toml` is not a boundary. The web dev loop's watcher (`host/web-js/dev.mjs`,
`skipped`) ignores the same set.

So a repository that keeps another project in a visible folder under the app root (here: an Expo
app in `legacy/`, with its own `package.json`, lockfile and `node_modules`) pays for it in the
Exact build:

1. **The build breaks** once that project is installed. `bun exact.mjs contract build app.contract`
   (and the web dev loop: "JS target: demos does not build") fail with
   `package declarations: two copies of metro-config (legacy/node_modules/@react-native/metro-config/node_modules/metro-config, legacy/node_modules/metro-config); install one`.
   The same tree builds when `legacy/node_modules` is absent.
2. **It breaks again** after `expo prebuild`: `legacy/ios/Pods` holds thousands of symlinks
   (`Headers/Public/**`, `*.xcframework`), and any non-document link is
   `source links are not captured`.
3. **The 64 MiB capture limit**: the sibling's tracked TS/JSON/fonts were 24 MiB here, on top of the
   app's own 20-30 MiB.
4. **Rebuilds**: every save in the sibling project is an edit to the dev loop.

The capture also adds every `.d.ts` it finds to the type check (`include: ['**/*.d.ts']`), so a
sibling's declarations (`legacy/shims/**/index.d.ts`) join the app's program.

## Workaround used

The sibling lives in a dot folder (`.legacy/`), and the dev-only parity tooling, which also writes
feedback data, screen captures and web-dist snapshots (141 MB on the owner's machine) while the dev loop
runs, in another (`.parity/`): every rule above already skips dot folders. It works, but it hides a
project people are meant to find and run.

## Ask

One of:

- an `app.json` key, e.g. `"sources": { "exclude": ["legacy", ".parity"] }`, applied by the
  capture walk, the web build's capture and the dev watcher alike; or
- a boundary rule: a directory with its own `package.json` that is not one of the app's workspaces
  (`workspaces` of the app's `package.json`) is another project and is not captured or watched
  (as `node_modules` is not); or
- honour `.gitignore` plus an explicit list (ignored files are not sources).

Either keeps a monorepo's visible sibling (a legacy app, a docs site, a backend with its own
install) out of the build, with no rename.

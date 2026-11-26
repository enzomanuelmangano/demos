<!-- exact:begin (exact new writes this block; bun exact.mjs update rewrites it) -->
# reactiive-site: an Exact app

Run `bun exact.mjs --help` first to create `.exact/checkout`; set `EXACT=<checkout>` if needed.

`app.contract` is the view, `app.ts` the data module, `app.test.contract` the tests, `app.json`
the manifest: set `app.name` and `app.id` before building. The app uses Exact at
`.exact/checkout` by path (`EXACT` overrides it).

Start from the nearest pattern: `bun exact.mjs
pattern` lists them and `pattern <name>` writes one, tested. .exact/checkout/docs/start-here-site.md (a site) or
.exact/checkout/docs/start-here.md is the only required reading. `bun exact.mjs contract vocab <name>` answers a
name (none: the card); `bun exact.mjs docs <heading words>` a guide's
section. Run `bun exact.mjs verify` when the features work, and `verify ios|android` at the end for a
phone app. When an iPhone app is ready to try, run `bun exact.mjs share` and send its link;
repeat for each change the person should see. `bun exact.mjs help` lists the verbs, including
app.json's `"commands"`.
`bun exact.mjs update` refreshes files. Native verbs (`ios`, `mac`, `linux`, `android`, `windows`)
name their platform in app.json on first use and build in a generated workspace;
`update --without <platform>` stops shipping it.
`bun .exact/checkout/scripts/exact.mjs setup --check` names what a native build lacks (`--platform ios --device` for a phone's: `share`, `ios --device`).

Generated, so don't edit: `exact.mjs` and this block.

## Feedback (required)

When a doc was wrong or missing, a workaround was needed, something took several tries or a
command confused you, record it: `bun exact.mjs feedback note "<what happened>"`. It attaches
exact2's commit and the last exit code, never output or code. `bun exact.mjs feedback status` says
whether notes are sent and whether to keep a diary; under `never`, skip all of this.
<!-- exact:end -->

# The reactiive.io site: rules for this directory

This is the reactiive.io website, an Exact app in a dot directory of the Demos repo. Read `docs/architecture.md`
(its amendments first) and `docs/progress.md` before changing anything.

- **Isolation is the contract.** The Demos app (repo root) pays nothing for this directory and neither pays for
  `.legacy/`: no shared install, workspace, lockfile, tsconfig, lint, watcher or CI trigger. Never import from
  outside `.site/`, never add `.site` to the root `package.json` workspaces, never let a root tool walk into here.
  Proofs and how to re-run them: `docs/isolation.md`.
- **Parity is the bar.** Every page equals the live reactiive.io (1440 and 390 wide), except `/demos`, which is the
  Demos app's own web build mounted at `/demos/` (`tools/demos-web/`, `tools/compose.ts`). Shoot with
  `tools/parity/shoot.ts`, diff with `tools/parity/compare.ts`; record what cannot match in `docs/parity.md`.
- **Captured vs not.** Exact captures `.ts .js .mjs .cjs .json .contract .ttf .otf` anywhere under this app and all of
  `assets/`. Source content that is not app code (MDX, `meta.json`, `index.json`, reference copies) lives in
  `.content/`; outputs live in `.out/` and `.vercel/` (dot directories are never captured).
- **Links to the Demos app are relative** (`/demos/`, `/demos/demo/<slug>`): a same-origin path the site declares no
  route for is the browser's, so it leaves this app's runtime. Never hard-code `https://reactiive.io/demos`.
- **Env-dependent features are stubbed** (`docs/stubs.md`); no secret is read by any build here.
- **Never deploy or publish** from an agent session: no `vercel deploy`, no `exact share`.

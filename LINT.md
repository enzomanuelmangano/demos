# Linting the Exact app

Quality rules that are enforced, not just remembered: a Contract linter (the polish and performance rules this project
learned), a Rust format and clippy gate, a typecheck of the Bun tooling, and a check that generated files are fresh.
One entry point, `tools/lint.sh`, and one CI job.

```
tools/lint.sh all          # everything below; a summary at the end
tools/lint.sh contract     # Contract linter + its tests (+ `contract build --errors-only` when the Exact checkout is here)
tools/lint.sh rust         # rustfmt on changed files (+ clippy against the baseline when the Exact checkout is here)
tools/lint.sh ts           # tsc -p tsconfig.json
tools/lint.sh generated    # regenerate demos.contract & co and fail if they change
tools/lint.sh fix          # the Contract linter's autofixes
bun run lint | lint:contract | lint:rust | lint:fix     # the same, as package scripts
```

## What runs, and where

| check | command | CI (`.github/workflows/exact-lint.yml`, PRs touching the Exact app, i.e. anything outside `legacy/`) | needs the Exact checkout |
|---|---|---|---|
| Contract linter vs baseline, rule tests | `lint.sh contract` | yes | no |
| Contract compiler | `bun exact.mjs contract build app.contract --errors-only` (inside `lint.sh contract`) | no | yes |
| rustfmt on changed `.rs` files | `lint.sh rust` | yes, informational until the `cargo fmt` commit | no |
| clippy counts vs `tools/rust-lint-baseline.txt` | `lint.sh rust` | no | yes (cargo resolves the workspace through the checkout) |
| TypeScript of the Bun tooling | `lint.sh ts` | yes | no |
| generated files are up to date | `lint.sh generated` | yes, informational (see below) | no |

`lint.sh` skips what the checkout gates when it is missing and says so; set `EXACT=<path>` when it is not where `Cargo.toml`
says. The workflow in CI is the "no checkout" column.

## The Contract linter

`tools/lint-contract.ts` runs the rule engine in `tools/contract-lint/` (a tiny parser for the indentation syntax, one file
per rule, the docs in `tools/contract-lint/docs/rules/`, the full manual in `tools/contract-lint/README.md`). It is modelled
on `eslint-plugin-refined`: ports of its rules to Contract, and the project's own rules, each with an id, a severity, a
rationale and an autofix where it is trivial. `.contractlintrc.json` selects the `recommended` config (every rule at its
own severity: polish warns, bugs error); `base` is the four core style rules, `strict` makes everything an error.

```
bun tools/lint-contract.ts                         # all of app.contract, demos/**, home/**
bun tools/lint-contract.ts demos/toast --rule box-sizing-border-box
bun tools/lint-contract.ts --fix                   # autofixes: corner-shape, -exact-hairline, box-sizing, -exact-hit-slop, pointer-events
bun tools/lint-contract.ts --format json|github|compact
bun tools/lint-contract.ts --list-rules
```

Output is ESLint's (`line:col  severity  message  rule-id`, grouped by file) with a summary; exit 1 on an error (or on a new
warning when CI passes `--max-warnings 0`).

### The baseline

The tree has findings nobody fixes today. `tools/contract-lint/baseline.json` lists them as accepted debt (file + rule + a
hash of the offending node, with a count), so the linter is on in CI now: **a finding that is in the baseline is debt and
does not fail; any other finding is new and fails.** The hash is of the node's text, not its line, so moving code is fine;
changing the flagged node counts as a new finding (fix it, or accept it again). When debt is paid the linter says how many
baseline entries are stale.

```
bun tools/lint-contract.ts --baseline tools/contract-lint/baseline.json --update-baseline   # re-accept the current state
```

Do that in its own commit, after reading the diff of `baseline.json`: it should only ever shrink, except when a new rule lands.

### Suppressing

`// contract-lint-disable-next-line <rule> -- <why>`, `// contract-lint-disable-line <rule>` and
`// contract-lint-disable-file <rule>`. Always say why; a port that keeps RN's numbers (a plain radius, a 0.5 border, an RN
spring) should name the RN constant in a comment, and the spring rule accepts that as the reason.

### Rules

Ports of `eslint-plugin-refined` first, then the project's. "Prevents" is the project bug or the trap the rule encodes.

| rule | sev | what | prevents |
|---|---|---|---|
| [`corner-shape-continuous`](tools/contract-lint/docs/rules/corner-shape-continuous.md) | warn | A rounded node takes `corner-shape="-exact-continuous"` | Ports that kept RN's `borderCurve` off by accident; the "Corners" trap in `port-demo` (squircle is a different shape: never use it). |
| [`hairline-border`](tools/contract-lint/docs/rules/hairline-border.md) | warn | A thin border is `-exact-hairline` | Separators that were 1.5 px on one phone and 0.5 px on another. |
| [`shadow-single-property`](tools/contract-lint/docs/rules/shadow-single-property.md) | warn | One `box-shadow`, no split shadow attributes | Shadows copied from RN style objects property by property. Today the demos already use `box-shadow` everywhere (31 uses, 0 split): the rule keeps it so. |
| [`min-touch-target`](tools/contract-lint/docs/rules/min-touch-target.md) | warn | A pressable under 44 pt needs padding or `-exact-hit-slop` | Tiny close and info buttons that a thumb misses. |
| [`spring-consistency`](tools/contract-lint/docs/rules/spring-consistency.md) | warn | A spring is a named preset, or names the RN constants it copies | Eleven slightly different "gentle" springs across the app, each a motion nobody chose. |
| [`prefer-pressto`](tools/contract-lint/docs/rules/prefer-pressto.md) | warn | Press feedback is pressto's, not a hand-written `:active` | The launcher icons dimming with a hand-written style while every demo uses pressto (home/springboard.contract IconPress). |
| [`concentric-bottom-ui`](tools/contract-lint/docs/rules/concentric-bottom-ui.md) | warn | A floating bottom box is concentric with the display corner | The ten `fix(exact)` commits that made a bar, a capsule or a toast concentric one demo at a time (floating-bottom-bar, clerk-toast, dot-sheet, alert-drawer, add-to-cart, scroll-progress, chessboard, fractal-glass, audio-player, stacked-bottom-sheet). |
| [`box-sizing-border-box`](tools/contract-lint/docs/rules/box-sizing-border-box.md) | error | A fixed size plus padding or border needs `box-sizing="border-box"` | The sudoku start card, 422 pt wide on a 402 pt screen (`fix(exact): sudoku: the start card is border-box, so it fits the screen instead of spilling past both edges`). |
| [`no-per-frame-commit`](tools/contract-lint/docs/rules/no-per-frame-commit.md) | warn | A `pointermove` / `scroll` handler that writes state commits per event | `scroll-progress with no commit per scroll frame`, `dot-sheet opens without a commit mid-animation`, `family-number-input rewritten for 120 Hz: transforms only`. |
| [`unused-state`](tools/contract-lint/docs/rules/unused-state.md) | warn | A `state` or `derive` that nothing reads | Leftovers after a port is rewritten (`app.contract` noSubpage). |
| [`unused-prop`](tools/contract-lint/docs/rules/unused-prop.md) | warn | A prop the component never reads | Callers passing arguments that no longer do anything. |
| [`testid-on-interactive`](tools/contract-lint/docs/rules/testid-on-interactive.md) | warn | Interactive nodes have a `testId` or an `aria-label` | Untestable controls and unlabelled VoiceOver buttons (the launcher's menu buttons). |
| [`no-magic-slug-lists`](tools/contract-lint/docs/rules/no-magic-slug-lists.md) | warn | No hand-written list of demo slugs | app.contract's 47-slug list drifting from the registry. |
| [`exit-animation-literal`](tools/contract-lint/docs/rules/exit-animation-literal.md) | error | `-exact-exit-animation` is one literal declaration | The `port-demo` trap: "-exact-exit-animation must be one literal declaration". |
| [`native-overlay-pointer-events`](tools/contract-lint/docs/rules/native-overlay-pointer-events.md) | warn | Native glass and blur panes take no touches | `fix(exact): glass-pane and variable-blur are never touch targets` (liquid-glass-playground's pan, clerk-toast's taps). |
| [`pill-radius`](tools/contract-lint/docs/rules/pill-radius.md) | warn | A resizing pill authors its radius as height / 2 | `fix(exact): pills keep their corner while a layout transition resizes them` (online-offline, composable-text, alert-drawer, steps). |
| [`rotate-axis-origin`](tools/contract-lint/docs/rules/rotate-axis-origin.md) | error | An x/y rotation needs a non-centre `transform-origin` | `fix(exact): verification-code digits flip about x on iOS`, `everybody-can-cook letters flip in 3D on iOS`. |
| [`transition-delay`](tools/contract-lint/docs/rules/transition-delay.md) | warn | No `transition` delays | Animations that start immediately on the phone but wait on the web. |
| [`exact-easing`](tools/contract-lint/docs/rules/exact-easing.md) | warn | Reanimated's inOut(quad) is a `linear()`, not a bezier | The `port-demo` trap (sudoku's sdkEase). |
| [`keyframes-stop-cap`](tools/contract-lint/docs/rules/keyframes-stop-cap.md) | warn | A `keyframes` block has at most ~33 stops | Sampled easings that silently lose their tail. |
| [`stacked-haptic`](tools/contract-lint/docs/rules/stacked-haptic.md) | warn | A pressto press does not add its own haptic | `fix(exact): haptics over-firing, 27 demos`, `toast haptics: no grab light on pointerdown`, `clerk-toast haptics: no soft landing stacked on the press's selection`. |

### Adding a rule

See "Adding a rule" in `tools/contract-lint/README.md`: `rules/<id>.ts`, register it in `rules/index.ts`, a docs page, cases in
`tests/run.ts`, run it over the tree and read every finding (a rule that cries wolf is worse than none), then regenerate the
baseline if you accept what is left and add the rule to the table above. When a `fix(exact)` commit finds a bug a rule could
have caught, write the rule.

### Motion presets

`demos/motion.contract` holds six named springs (`springSlow`, `springGentle`, `springBouncy`, `springFirm`, `springSnappy`,
`springQuick`) derived from the 40 springs the demos use today; `spring-consistency` reads that file. No demo uses them yet:
adopting them is a follow-up, and ports keep RN's numbers.

## Rust

`rustfmt.toml` (160 columns, `use_small_heuristics = "Max"`: the settings with the smallest diff against the existing style,
measured; the numbers are at the top of the file) and the `[workspace.lints]` tables in `Cargo.toml` (members opt in with
`[lints] workspace = true`; the generated `web/` and `apple/` do not). `tools/rust-lint.sh` is the gate:

- `rust-lint.sh fmt [BASE]`: `rustfmt --check` on the `.rs` files changed since BASE (default `origin/main`, else `main`), plus
  working-tree changes. The tree has never been formatted as a whole (a whole-tree `cargo fmt` rewrites about 31k lines in
  114 files), so only the files a branch touches are held to it.
- `rust-lint.sh clippy`: `cargo clippy --workspace --all-targets` with the table plus a set of debt lints, counted per lint and
  compared with `tools/rust-lint-baseline.txt` (198 findings, 32 lints today). It fails only when a lint's count goes **above**
  its baseline (or a lint is new); lower counts are reported as improvements. Update the baseline with
  `rust-lint.sh clippy --update-baseline` when you pay debt down.
- `rust-lint.sh fmt-all`: informational list of everything that is not formatted yet.

## TypeScript

`tsconfig.json` covers `tools` but `tools/parity` (the linter included, strict) and passes. `app.ts` is left out: it imports
`app.contract.d.ts`, which `contract build` writes and git ignores, so it cannot be checked on a bare checkout.
`tools/parity/tsconfig.json` covers `tools/parity`, which does not pass today (39 errors here, about 60 on a bare checkout without the repo's node_modules) and is reported, not gating:
Bun's API is declared `any` in `tools/types/bun-min.d.ts` because `bun-types` is not installed (callbacks of `Bun.build` /
`Bun.serve` are implicit any), the feedback JSON is untyped, and `notion-qrcode/parity.ts` imports `computeShapeData`, which the
RN demo no longer exports (a real stale import). Installing `bun-types` and typing the JSON clears most of it.

## Generated files

`lint.sh generated` runs, on scratch copies, `tools/gen-demos.ts`, `tools/gen-index.ts`, `tools/gen-architecture.ts` and
`tools/parity/screen-atlas/gen-atlas-data.ts`, and fails when `demos.contract`, `demos/index.contract`,
`modules/apple/Architecture.generated.swift` or `home/atlas-data.contract` would change. The generators write in place, so the
originals are copied aside and always put back; the regenerated copies are left in `$TMPDIR/lint-generated` to diff or copy over.
**It fails today** (so it is informational in CI): the committed `demos/index.contract` names `ExpandableMiniPlayer` and
`TelegramThemeSwitch` where `gen-index.ts` writes `MpArt` and `TtsPhoto` (it takes the first component of a file), and
`Architecture.generated.swift` differs in order and two entries. Fix the generator or regenerate, then drop `continue-on-error` in
the workflow.

## Follow-ups

- Rust: one dedicated commit that runs `cargo fmt` over `gpu/` and `packages/`, then `rust-lint.sh fmt` can check the whole tree;
  fix the four correctness lints that are at `warn` only because they fire today (`almost_swapped`, `approx_constant`, `eq_op`).
- Contract: pay down the baseline (start with `box-sizing-border-box`, which is an error and likely a parity bug in each hit),
  then flip `corner-shape-continuous`, `hairline-border` and `min-touch-target` to errors in `.contractlintrc.json`.
- Adopt the motion presets in new UI (the launcher, the shake sheet).
- Type `tools/parity` and make `tools/parity/tsconfig.json` gate.

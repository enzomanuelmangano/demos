# contract-lint

Quality rules for Exact Contract files, in the spirit of
[`eslint-plugin-refined`](https://www.npmjs.com/package/eslint-plugin-refined) (ESLint rules for refined
React Native styles): small precise rules, a `base` / `recommended` / `strict` config ladder, an
autofix when it is trivial, and a rationale for each. Polish and performance rules are the point; they
encode what this project learned. No dependency beyond Bun / Node's standard library, so the folder
can be lifted into its own package.

```
bun tools/lint-contract.ts                       # lint app.contract, demos/**, home/**
bun tools/lint-contract.ts demos/toast           # one folder or file
bun tools/lint-contract.ts --baseline tools/contract-lint/baseline.json   # only NEW findings fail
bun tools/lint-contract.ts --fix --rule corner-shape-continuous           # apply a rule's autofix
bun tools/lint-contract.ts --format json | github | compact | stylish
bun tools/lint-contract.ts --list-rules
bun tools/contract-lint/tests/run.ts             # the rules' own tests
```

Exit code: `1` on a new error (or more new warnings than `--max-warnings`), `2` on a usage error.

## What was taken from eslint-plugin-refined

eslint-plugin-refined 0.0.5 (read from its published tarball, nothing installed or run) has six rules in
three configs (`base`: the four style rules; `recommended`: all six as warnings; `strict`: all six as
errors). Each is a small AST check with one message and, where it is safe, an autofix. The ports:

| refined rule (default option) | here | what changed and why |
|---|---|---|
| `border-radius-with-curve` | `corner-shape-continuous` | `borderCurve: 'continuous'` is `corner-shape="-exact-continuous"`. Same exemption for circles. Also reports the wrong curve (`squircle`). |
| `prefer-hairline-width` (threshold 0.3) | `hairline-border` | `StyleSheet.hairlineWidth` is `-exact-hairline`. Threshold 0.5: the repo writes 0.5 for a hairline, nothing is under 0.3. |
| `prefer-box-shadow` | `shadow-single-property` | There is no split-shadow Contract attribute in use (31 `box-shadow`, 0 split): the rule keeps it so, and adds `drop-shadow()` filters. |
| `require-hitslop-small-touchables` (minSize 40) | `min-touch-target` | 44 pt (HIG). The fix is `-exact-hit-slop`, which Exact has, like `hitSlop`. |
| `spring-config-consistency` (all of mass/damping/stiffness or none) | `spring-consistency` | Contract's spring always has all three, so the same goal (comparable physics) becomes: a named preset within tolerance, in `demos/motion.contract`, or the RN constants named in a comment. |
| `avoid-touchable-opacity` (and `prefer-pressable`) | `prefer-pressto` | The project's press component is pressto, whose `PressableScale` also plays the selection haptic. |

The project's own rules (`concentric-bottom-ui`, `box-sizing-border-box`, ...) follow the same shape: one
precise check, a message that says what to write instead, and the bug it is there for.

## How it works

1. `parser.ts`: a tokenizer/parser for the indentation-based syntax. Comments (`//` outside a string)
   are blanked in a copy of the source with the same offsets; physical lines are joined into logical
   lines (an open bracket continues, a following indented `name=value` line continues the node's
   attributes); the tree comes from indentation. Strings and template strings (`` `a${b}` ``) are
   words, never split. Every attribute, node and finding carries offsets into the original source, so a
   fix is a text edit.
2. `engine.ts`: runs each enabled rule over each file, applies inline suppressions, and gives a finding a
   stable hash: the rule id plus the offending node's normalised text.
3. `baseline.ts`: accepted findings by `file + rule + hash` (a count each), see below.
4. `config.ts` / `.contractlintrc.json`: which rules, at what severity, with which options.

## Configs

| config | what |
|---|---|
| `base` | the four core style rules refined has: `corner-shape-continuous`, `hairline-border`, `shadow-single-property`, `min-touch-target` |
| `recommended` | every rule at its own severity: polish and performance rules warn, the rules that catch a bug (`box-sizing-border-box`, `exit-animation-literal`, `rotate-axis-origin`) are errors |
| `strict` | every rule an error |

`exact/demos/.contractlintrc.json` selects `recommended`:

```json
{
  "extends": "recommended",
  "include": ["app.contract", "demos/**/*.contract", "home/**/*.contract"],
  "exclude": ["**/*.test.contract"],
  "rules": { "spring-consistency": ["warn", { "presetsFile": "demos/motion.contract" }] },
  "overrides": [{ "files": ["demos/legacy/**"], "rules": { "box-sizing-border-box": "off" } }]
}
```

A rule is `"off" | "warn" | "error"` or `[severity, options]`. Files whose first line says `GENERATED` (or
`Written by tools/gen-...`) are skipped. `*.test.contract` files are not linted.

## Suppressing

```
// contract-lint-disable-next-line corner-shape-continuous, hairline-border -- RN has no borderCurve here
// contract-lint-disable-line rule-id     (on the line itself, or trailing)
// contract-lint-disable-file rule-id     (anywhere in the file)
```

`*` stands for every rule. Always give the reason after `--`.

## The baseline

A new linter over an old tree reports hundreds of findings nobody can fix today. The baseline records
them as debt, so the linter can be on in CI now: a finding that is in the baseline is listed as debt and
does not fail; any other finding is new and does.

```
bun tools/lint-contract.ts --baseline tools/contract-lint/baseline.json --update-baseline   # write it
bun tools/lint-contract.ts --baseline tools/contract-lint/baseline.json --max-warnings 0    # CI: new errors AND new warnings fail
```

An entry is `file + rule + hash` with a count, where the hash is of the offending node's text (not its
line number), so moving code does not break it, and two identical nodes in a file are two entries' worth.
Editing the flagged node itself changes its hash: the finding then counts as new, which is the point
(fix it, or accept it again with `--update-baseline`). When findings are fixed the linter says how many
baseline entries are stale; `--update-baseline` drops them. `--show-debt` lists the accepted findings.

## Rules

Ports of eslint-plugin-refined's rules first, then the project's own. Each has a page under
[`docs/rules/`](docs/rules) with the rationale, a bad and a good example, its options and the bug it
prevents.

| rule | severity | origin | what |
|---|---|---|---|
| [`corner-shape-continuous`](docs/rules/corner-shape-continuous.md) | warn | port of refined `border-radius-with-curve` | A rounded node takes `corner-shape="-exact-continuous"` |
| [`hairline-border`](docs/rules/hairline-border.md) | warn | port of refined `prefer-hairline-width` | A thin border is `-exact-hairline` |
| [`shadow-single-property`](docs/rules/shadow-single-property.md) | warn | port of refined `prefer-box-shadow` | One `box-shadow`, no split shadow attributes |
| [`min-touch-target`](docs/rules/min-touch-target.md) | warn | port of refined `require-hitslop-small-touchables` | A pressable under 44 pt needs padding or `-exact-hit-slop` |
| [`spring-consistency`](docs/rules/spring-consistency.md) | warn | adapted from refined `spring-config-consistency` | A spring is a named preset, or names the RN constants it copies |
| [`prefer-pressto`](docs/rules/prefer-pressto.md) | warn | port of refined `avoid-touchable-opacity` / `prefer-pressable` | Press feedback is pressto's, not a hand-written `:active` |
| [`concentric-bottom-ui`](docs/rules/concentric-bottom-ui.md) | warn | project | A floating bottom box is concentric with the display corner |
| [`box-sizing-border-box`](docs/rules/box-sizing-border-box.md) | error | project | A fixed size plus padding or border needs `box-sizing="border-box"` |
| [`no-per-frame-commit`](docs/rules/no-per-frame-commit.md) | warn | project | A `pointermove` / `scroll` handler that writes state commits per event |
| [`unused-state`](docs/rules/unused-state.md) | warn | project | A `state` or `derive` that nothing reads |
| [`unused-prop`](docs/rules/unused-prop.md) | warn | project | A prop the component never reads |
| [`testid-on-interactive`](docs/rules/testid-on-interactive.md) | warn | project | Interactive nodes have a `testId` or an `aria-label` |
| [`no-magic-slug-lists`](docs/rules/no-magic-slug-lists.md) | warn | project | No hand-written list of demo slugs |
| [`exit-animation-literal`](docs/rules/exit-animation-literal.md) | error | project | `-exact-exit-animation` is one literal declaration |
| [`native-overlay-pointer-events`](docs/rules/native-overlay-pointer-events.md) | warn | project | Native glass and blur panes take no touches |
| [`pill-radius`](docs/rules/pill-radius.md) | warn | project | A resizing pill authors its radius as height / 2 |
| [`rotate-axis-origin`](docs/rules/rotate-axis-origin.md) | error | project | An x/y rotation needs a non-centre `transform-origin` |
| [`transition-delay`](docs/rules/transition-delay.md) | warn | project | No `transition` delays |
| [`exact-easing`](docs/rules/exact-easing.md) | warn | project | Reanimated's inOut(quad) is a `linear()`, not a bezier |
| [`keyframes-stop-cap`](docs/rules/keyframes-stop-cap.md) | warn | project | A `keyframes` block has at most ~33 stops |
| [`stacked-haptic`](docs/rules/stacked-haptic.md) | warn | project | A pressto press does not add its own haptic |

## Adding a rule

1. `rules/<id>.ts`: `export default { meta: { id, description, defaultSeverity, fixable, origin, defaults }, check(ctx) { ... } }`.
   `ctx.file` is the parsed file (`nodes`, `components`, `attr()`, offsets), `ctx.options` the merged
   options, `ctx.project` reads other project files (the spring rule reads `demos/motion.contract`), and
   `ctx.report({ at, message, fix? })` reports at an attribute, a node or an offset. A fix is a list of
   `{ start, end, text }` edits in source offsets. `rules/util.ts` has the helpers.
2. Add it to `rules/index.ts`.
3. `docs/rules/<id>.md` (the test run fails when a rule has no page).
4. Cases in `tests/run.ts`: a snippet that must report, one that must not, and the fixed text.
5. Run it over the tree (`--rule <id>`), read every finding: if it is not mostly real, tighten the rule.
   Then `--update-baseline` if you accept what is left, and add the rule to `LINT.md`.

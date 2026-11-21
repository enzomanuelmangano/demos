# no-magic-slug-lists

No hand-written list of demo slugs

- Severity in `recommended`: **warn**
- Autofix: no
- Origin: project

## Why

A list of three or more strings that are demo slugs (the folders under `demos/`) goes stale the next time a demo is added, renamed or removed. Read `allDemos()` (demos.contract), or generate the list (home/atlas-data.contract is generated from tools/parity-queue.txt, and is skipped as a generated file).

## Bad

```
fn mine(): string[] = ["toast", "snake", "sudoku"]
```

## Good

```
allDemos().filter(...)
```

## Options

`min` (default `3`).

## Prevents

app.contract's 47-slug list drifting from the registry.

## When to disable

Disable on the list. Inline: `// contract-lint-disable-next-line no-magic-slug-lists -- reason`, or `// contract-lint-disable-file no-magic-slug-lists`.

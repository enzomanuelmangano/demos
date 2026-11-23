# no-per-frame-commit

A `pointermove` / `scroll` handler that writes state commits per event

- Severity in `recommended`: **warn**
- Autofix: no
- Origin: project

## Why

Every state write is a commit of the whole app. A handler that fires with the finger (`pointermove`, `mousemove`, `touchmove`, `scroll`, `wheel`, `drag`, `dragover`) and writes a state unconditionally commits every frame. Motion belongs to the host (a scroll or drag timeline, `transformDragFor`, springs) or to a Rust surface. One exception the repo uses on purpose: a handler that writes exactly one state which is read only by `translate` / `scale` / `opacity` / `rotate` (stacked-list). Writes under an `if` (a threshold) are not counted.

## Bad

```
action moved(y: number)
  offset = y   // and offset is shown in a text
...
column scroll=moved
```

## Good

```
a scroll-timeline animation, or one state read only by translate=...
```

## Options

none

## Prevents

`scroll-progress with no commit per scroll frame`, `dot-sheet opens without a commit mid-animation`, `family-number-input rewritten for 120 Hz: transforms only`.

## When to disable

A handler that must feed a number into the view's layout (not compositor-driven): disable with the reason. Inline: `// contract-lint-disable-next-line no-per-frame-commit -- reason`, or `// contract-lint-disable-file no-per-frame-commit`.

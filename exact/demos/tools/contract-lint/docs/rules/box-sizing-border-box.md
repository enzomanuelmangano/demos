# box-sizing-border-box

A fixed size plus padding or border needs `box-sizing="border-box"`

- Severity in `recommended`: **error**
- Autofix: yes: appends `box-sizing="border-box"`
- Origin: project

## Why

Contract sizes a box as CSS does: `width` is the content width and the padding and border come on top. React Native (Yoga) is border-box, so every RN number ported with `width=` and `padding` or `border-width` grows. The rule reports a node with a fixed `width` (a number or an expression, not a percentage or `auto`) and horizontal padding or border, or a fixed `height` with vertical ones, and no `box-sizing`. Vertical padding does not widen a box and zero padding or border do not count.

## Bad

```
column width=300 padding=12
```

## Good

```
column width=300 padding=12 box-sizing="border-box"
```

## Options

none

## Prevents

The sudoku start card, 422 pt wide on a 402 pt screen (`fix(exact): sudoku: the start card is border-box, so it fits the screen instead of spilling past both edges`).

## When to disable

Intentional content-box math: set `box-sizing="content-box"` explicitly (a dynamic or explicit value passes) or disable with the reason. Inline: `// contract-lint-disable-next-line box-sizing-border-box -- reason`, or `// contract-lint-disable-file box-sizing-border-box`.

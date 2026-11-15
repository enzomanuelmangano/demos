# shadow-single-property

One `box-shadow`, no split shadow attributes

- Severity in `recommended`: **warn**
- Autofix: no
- Origin: port of refined `prefer-box-shadow`

## Why

React Native's `shadowColor` / `shadowOffset` / `shadowOpacity` / `shadowRadius` / `elevation` are five properties for one thing and differ per platform. Contract has the CSS one: `box-shadow="0px 4px 8px rgba(0, 0, 0, 0.2)"`, which follows the box and its radius. A `filter="drop-shadow(...)"` on a box is also reported: it renders the node into an offscreen pass every frame, where `box-shadow` does not.

## Bad

```
view shadow-color="#000000" shadow-opacity=0.2
```

## Good

```
view box-shadow="0px 4px 8px rgba(0, 0, 0, 0.2)"
```

## Options

none

## Prevents

Shadows copied from RN style objects property by property. Today the demos already use `box-shadow` everywhere (31 uses, 0 split): the rule keeps it so.

## When to disable

A `drop-shadow` that must follow the alpha of an image (not a box) is a real use: disable it on that line. Inline: `// contract-lint-disable-next-line shadow-single-property -- reason`, or `// contract-lint-disable-file shadow-single-property`.

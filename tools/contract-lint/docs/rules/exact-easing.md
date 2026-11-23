# exact-easing

Reanimated's inOut(quad) is a `linear()`, not a bezier

- Severity in `recommended`: **warn**
- Autofix: no
- Origin: project

## Why

`cubic-bezier(0.455, 0.03, 0.515, 0.955)` is only close to Reanimated's `Easing.inOut(Easing.quad)`: 1.9 % off. `bun tools/easing.ts inOutQuad` prints a `linear()` within 0.0005, verified on iOS.

## Bad

```
cubic-bezier(0.455, 0.03, 0.515, 0.955)
```

## Good

```
the linear() that `bun tools/easing.ts inOutQuad` prints
```

## Options

none

## Prevents

The `port-demo` trap (sudoku's sdkEase).

## When to disable

None. Inline: `// contract-lint-disable-next-line exact-easing -- reason`, or `// contract-lint-disable-file exact-easing`.

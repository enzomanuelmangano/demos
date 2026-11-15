# min-touch-target

A pressable under 44 pt needs padding or `-exact-hit-slop`

- Severity in `recommended`: **warn**
- Autofix: yes for a bare `button` (adds `-exact-hit-slop`)
- Origin: port of refined `require-hitslop-small-touchables`

## Why

Apple's Human Interface Guidelines ask for a 44 x 44 pt hit target (refined's default is 40). A pressable is a `button`, a pressto call (`PressableScale`, ...; its one child element gives the size) or an element with `press=`. Its size is its literal `width` / `height` plus its own padding (when it is content-box). Unknown sizes (flex, a percentage, an expression) are never guessed. `-exact-hit-slop` grows where a pointer reaches a node without painting or moving anything, like React Native's `hitSlop`: `-exact-hit-slop="12px"` on a 20 pt icon button. `pointer-events="none"` and `aria-hidden` nodes are skipped.

## Bad

```
button press=close width=20 height=20
```

## Good

```
button press=close width=20 height=20 -exact-hit-slop="12px"
```

## Options

`minSize` (default `44`).

## Prevents

Tiny close and info buttons that a thumb misses.

## When to disable

A control that sits in a row of its own height with the neighbours as slop: disable it with the reason. Inline: `// contract-lint-disable-next-line min-touch-target -- reason`, or `// contract-lint-disable-file min-touch-target`.

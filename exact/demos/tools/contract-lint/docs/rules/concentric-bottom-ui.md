# concentric-bottom-ui

A floating bottom box is concentric with the display corner

- Severity in `recommended`: **warn**
- Autofix: no
- Origin: project

## Why

Bottom UI (sheets, trays, bars, buttons) must share a centre with the display's corner arc (radius 62): a box inset `i` from the display's side and bottom with radius `r` is concentric when `i + r = 62`; a short box is a capsule (`r = height / 2`) and its inset follows: `62 - height / 2`. `env.contract` has the helpers `floatingInset(want, height)`, `concentricRadius(inset, height)` and `concentricInset(height)`. The rule checks an `position="absolute"` box with a literal `bottom` under 62 and a literal `border-radius`; one that uses a helper, or that already adds up (within 1.5 pt, or a capsule), passes.

## Bad

```
view position="absolute" bottom=50 height=70 border-radius=20
```

## Good

```
view position="absolute" bottom=floatingInset(10, 70) height=70 border-radius=concentricRadius(floatingInset(10, 70), 70)
```

## Options

`display` (62), `tolerance` (1.5).

## Prevents

The ten `fix(exact)` commits that made a bar, a capsule or a toast concentric one demo at a time (floating-bottom-bar, clerk-toast, dot-sheet, alert-drawer, add-to-cart, scroll-progress, chessboard, fractal-glass, audio-player, stacked-bottom-sheet).

## When to disable

RN parity ports whose RN layout is not concentric say so in a comment and disable the rule. Inline: `// contract-lint-disable-next-line concentric-bottom-ui -- reason`, or `// contract-lint-disable-file concentric-bottom-ui`.

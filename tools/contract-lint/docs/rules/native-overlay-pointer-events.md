# native-overlay-pointer-events

Native glass and blur panes take no touches

- Severity in `recommended`: **warn**
- Autofix: yes: appends `pointer-events="none"`
- Origin: project

## Why

`glass-pane` and `variable-blur` are decorative native views. They now refuse touches natively (hitTest returns nil), and `pointer-events="none"` keeps the Contract-level hit test, the web and the macOS targets the same. A `glass-pane` with `interactive="true"` is meant to be touched and passes.

## Bad

```
glass-pane glass-style="regular" position="absolute" inset=0
```

## Good

```
glass-pane glass-style="regular" position="absolute" inset=0 pointer-events="none"
```

## Options

`tags` (default `["glass-pane", "variable-blur"]`).

## Prevents

`fix(exact): glass-pane and variable-blur are never touch targets` (liquid-glass-playground's pan, clerk-toast's taps).

## When to disable

A glass pane that is the touch target: `interactive="true"`. Inline: `// contract-lint-disable-next-line native-overlay-pointer-events -- reason`, or `// contract-lint-disable-file native-overlay-pointer-events`.

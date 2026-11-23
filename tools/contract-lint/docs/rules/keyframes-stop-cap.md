# keyframes-stop-cap

A `keyframes` block has at most ~33 stops

- Severity in `recommended`: **warn**
- Autofix: no
- Origin: project

## Why

The host caps a keyframes animation at roughly 21-33 stops: more are dropped or cut. Sample the curve more coarsely (check it stays within half a pixel of the real curve) or draw the motion in Rust.

## Bad

```
keyframes k with 40 stops
```

## Good

```
at most 33
```

## Options

`max` (default `33`).

## Prevents

Sampled easings that silently lose their tail.

## When to disable

None. Inline: `// contract-lint-disable-next-line keyframes-stop-cap -- reason`, or `// contract-lint-disable-file keyframes-stop-cap`.

# hairline-border

A thin border is `-exact-hairline`

- Severity in `recommended`: **warn**
- Autofix: yes: replaces the width with `"-exact-hairline"`
- Origin: port of refined `prefer-hairline-width`

## Why

A hand-picked sub-point width (`0.5`, `0.33`) is one device pixel on one screen scale and two on another. `-exact-hairline` is exactly one device pixel everywhere, which is what `StyleSheet.hairlineWidth` is in React Native. Checked on `border-width`, the per-side `border-*-width` and the first token of the `border` shorthands. The threshold is `0.5`: the repo writes `0.5` for a hairline today and `1` and above are design widths (refined's default 0.3 would catch nothing here). `0.66667` (RN's literal 2/3) is deliberate and passes.

## Bad

```
view border-bottom-width=0.5 border-bottom-style="solid"
```

## Good

```
view border-bottom-width="-exact-hairline" border-bottom-style="solid"
```

## Options

`threshold` (default `0.5`): widths above 0 and up to this are hairlines.

## Prevents

Separators that were 1.5 px on one phone and 0.5 px on another.

## When to disable

A port whose RN code has a literal `borderWidth: 0.5` keeps it. Inline: `// contract-lint-disable-next-line hairline-border -- reason`, or `// contract-lint-disable-file hairline-border`.

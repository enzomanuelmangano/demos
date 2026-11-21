# testid-on-interactive

Interactive nodes have a `testId` or an `aria-label`

- Severity in `recommended`: **warn**
- Autofix: no
- Origin: project

## Why

The e2e driver targets controls by `testId` (never by coordinates) and VoiceOver reads `aria-label`; a control with neither can be neither tested nor announced. Interactive: `button`, `input`, any node with `press=`, and the pressto pressables (which carry the label on the box they wrap). `pointer-events="none"` and `aria-hidden` nodes are skipped.

## Bad

```
button press=open
```

## Good

```
button press=open testId="open"
```

## Options

none

## Prevents

Untestable controls and unlabelled VoiceOver buttons (the launcher's menu buttons).

## When to disable

A node whose text is its label and which no test needs: disable with the reason. Inline: `// contract-lint-disable-next-line testid-on-interactive -- reason`, or `// contract-lint-disable-file testid-on-interactive`.

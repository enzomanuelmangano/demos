# transition-delay

No `transition` delays

- Severity in `recommended`: **warn**
- Autofix: no
- Origin: project

## Why

The iOS host ignores a `transition`'s delay (measured in popup-handler and verification-code). An `animation` delay holds. A delayed motion is keyframes with a delay, or the `timer` surface. The rule reports `transition-delay` and a transition entry with a second time (outside `linear()` / `cubic-bezier()` / `${...}`).

## Bad

```
view transition="opacity 300ms ease 200ms"
```

## Good

```
view animation="fadeIn 300ms ease 200ms both"
```

## Options

none

## Prevents

Animations that start immediately on the phone but wait on the web.

## When to disable

None. Inline: `// contract-lint-disable-next-line transition-delay -- reason`, or `// contract-lint-disable-file transition-delay`.

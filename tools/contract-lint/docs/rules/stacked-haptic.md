# stacked-haptic

A pressto press does not add its own haptic

- Severity in `recommended`: **warn**
- Autofix: no
- Origin: project

## Why

Pressto plays the global selection haptic (`pressablesOnPress()`) before a press action runs. An action bound to a pressto `press=` that calls `haptic(...)` stacks a second tap on the first. Haptics for other events (a dismiss, a landing, a detent) belong to those events, not to the press.

## Bad

```
PressableScale(press=dismiss) and action dismiss: haptic("impact-light")
```

## Good

```
let pressto play its haptic; haptic only the dismiss event
```

## Options

none

## Prevents

`fix(exact): haptics over-firing, 27 demos`, `toast haptics: no grab light on pointerdown`, `clerk-toast haptics: no soft landing stacked on the press's selection`.

## When to disable

A press whose haptic is the point (RN calls Haptics there as well as pressto): disable it and say so. Inline: `// contract-lint-disable-next-line stacked-haptic -- reason`, or `// contract-lint-disable-file stacked-haptic`.

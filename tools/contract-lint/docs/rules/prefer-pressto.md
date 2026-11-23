# prefer-pressto

Press feedback is pressto's, not a hand-written `:active`

- Severity in `recommended`: **warn**
- Autofix: no
- Origin: port of refined `avoid-touchable-opacity` / `prefer-pressable`

## Why

pressto is the app's global press system: the scale, the timing and the selection haptic (`pressablesOnPress()`) come together. A bare `button` that dims in a `:active` style, or an element with a `-exact-press-*` attribute, has its own look and none of the haptic, so the same tap feels different on two screens. The refined rules ask for `Pressable` over `TouchableOpacity` for the same reason.

## Bad

```
style Press
  :active
    opacity = 0.85
...
button press=open class=Press
```

## Good

```
PressableScale(press=open)
  column testId="open"
```

## Options

none

## Prevents

The launcher icons dimming with a hand-written style while every demo uses pressto (home/springboard.contract IconPress).

## When to disable

A long-press target whose lift is the system's (the SpringBoard icon) is a legitimate bare button: disable it with the reason. Inline: `// contract-lint-disable-next-line prefer-pressto -- reason`, or `// contract-lint-disable-file prefer-pressto`.
